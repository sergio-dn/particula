/**
 * Shopify Cart Probe — detecta inventario real usando la técnica de cart scraping.
 *
 * Técnica:
 *   1. POST /cart/add.js con quantity=999999
 *   2. GET /cart.js — si Shopify limita la cantidad, ese es el stock real
 *   3. POST /cart/clear.js — limpiar carrito
 *
 * Si la tienda no trackea inventario, acepta 999999 sin limitarlo.
 * Si tiene Cloudflare u otra protección, retorna "blocked".
 *
 * Anti-bot mitigations (#30):
 *   - Retry con exponential backoff (hasta 3 intentos)
 *   - Rotación de User-Agent strings realistas
 *   - Detección de Cloudflare challenges (HTML en vez de JSON)
 *   - Persistent blocks → resetea inventoryTracking para reintentar en próximo ciclo
 */

import { scraperLogger } from "@/lib/logger"

const log = scraperLogger.child({ module: "cart-probe" })

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProbeStatus =
  | "exact"        // stock real obtenido (qty < 999999)
  | "no_tracking"  // tienda aceptó 999999, no trackea inventario
  | "blocked"      // Cloudflare / WAF bloqueó la request
  | "timeout"      // request timeout
  | "error"        // error HTTP u otro

export interface ProbeResult {
  variantId: number
  status: ProbeStatus
  quantity: number | null // stock real si status === "exact", null en otros casos
  httpStatus?: number
}

export interface BatchProbeResult {
  domain: string
  results: ProbeResult[]
  probed: number
  skipped: number
  tracksInventory: boolean | null // null = inconcluso (ej. blocked)
}

export interface VariantForProbe {
  externalId: string // Shopify numeric variant ID como string
  isAvailable: boolean
  price: number
}

/** Respuesta de /cart/add.js — Shopify devuelve la qty realmente añadida */
interface CartAddResponse {
  id: number
  quantity: number
  variant_id: number
  title: string
}

/** Subset de la respuesta de /cart.js que nos interesa */
interface CartJsResponse {
  items: Array<{
    variant_id: number
    quantity: number
    title: string
  }>
  item_count: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROBE_QTY = 999_999
const REQUEST_DELAY_MS = 500
const REQUEST_TIMEOUT_MS = 10_000
const MAX_VARIANTS_PER_BRAND = 30
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1_000 // 1s, 2s, 4s exponential

const USER_AGENTS = [
  // Chrome 124 – macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Chrome 124 – Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Safari 17.4 – macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  // Firefox 125 – Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Chrome 124 – Linux
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Edge 123 – Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
  // Chrome 125 – macOS (newer)
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  // Safari 17.5 – macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let uaIndex = 0

function getNextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length]
  uaIndex++
  return ua
}

/**
 * Extrae cookies de Set-Cookie headers y las formatea para el header Cookie.
 * Crítico: sin cookies de sesión, Shopify no asocia el carrito entre requests.
 */
function extractCookies(res: Response): string {
  const setCookies = res.headers.getSetCookie?.() ?? []
  return setCookies
    .map((c) => c.split(";")[0]) // solo "name=value", sin Path/Expires/etc
    .join("; ")
}

/**
 * Detecta si una respuesta es un bloqueo de Cloudflare u otro WAF.
 * Ahora también detecta challenge pages (HTML en vez de JSON).
 */
function isCloudflareBlocked(res: Response): boolean {
  // Status codes típicos de WAF
  if (res.status === 403 || res.status === 503) {
    const server = (res.headers.get("server") ?? "").toLowerCase()
    if (server.includes("cloudflare")) return true
    // Muchos stores devuelven 403 sin header cloudflare pero siguen siendo WAF
    return true
  }
  return false
}

/**
 * Detecta si la respuesta es un challenge HTML en vez de JSON.
 * Cloudflare a veces devuelve 200 con HTML challenge page.
 */
async function isHtmlChallenge(res: Response): Promise<boolean> {
  const contentType = res.headers.get("content-type") ?? ""
  if (contentType.includes("text/html")) {
    // Leer un fragmento del body para confirmar
    try {
      const text = await res.clone().text()
      const lower = text.toLowerCase()
      return (
        lower.includes("cloudflare") ||
        lower.includes("challenge-platform") ||
        lower.includes("cf-browser-verification") ||
        lower.includes("just a moment") ||
        lower.includes("ray id")
      )
    } catch {
      return true // Si no podemos leer, asumir que es challenge
    }
  }
  return false
}

async function clearCart(baseUrl: string, ua: string, cookies: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/cart/clear.js`, {
      method: "POST",
      headers: {
        "User-Agent": ua,
        "Content-Type": "application/json",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    log.debug({ domain: baseUrl }, "failed to clear cart")
  }
}

// ─── Core: Probe single variant ──────────────────────────────────────────────

/**
 * Obtiene el stock real de un variant usando cart scraping.
 *
 * Ciclo de 3 requests con el mismo User-Agent:
 *   1. POST /cart/add.js — agregar al carrito con qty=999999
 *   2. GET /cart.js — leer la cantidad que Shopify aceptó
 *   3. POST /cart/clear.js — limpiar carrito
 */
async function probeVariantOnce(
  domain: string,
  variantId: number,
  ua: string,
): Promise<ProbeResult> {
  const baseHeaders = {
    "User-Agent": ua,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
  const base = `https://${domain}`

  let cookies = ""

  try {
    // Step 1: Add to cart con qty máxima
    const addRes = await fetch(`${base}/cart/add.js`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ id: variantId, quantity: PROBE_QTY }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    // Extraer cookies de sesión para mantener el carrito entre requests
    cookies = extractCookies(addRes)

    if (addRes.status === 422) {
      return { variantId, status: "error", quantity: null, httpStatus: 422 }
    }
    if (addRes.status === 429) {
      return { variantId, status: "blocked", quantity: null, httpStatus: 429 }
    }
    if (isCloudflareBlocked(addRes)) {
      return { variantId, status: "blocked", quantity: null, httpStatus: addRes.status }
    }

    // Detectar challenge HTML (Cloudflare 200 con HTML)
    if (await isHtmlChallenge(addRes)) {
      return { variantId, status: "blocked", quantity: null, httpStatus: addRes.status }
    }

    if (!addRes.ok) {
      return { variantId, status: "error", quantity: null, httpStatus: addRes.status }
    }

    // Estrategia primaria: leer quantity del response de /cart/add.js
    let addedQty: number | null = null
    try {
      const addBody: CartAddResponse = await addRes.json()
      addedQty = addBody.quantity
    } catch {
      /* parse error — fallback to /cart.js */
    }

    // Si obtuvimos qty del add response, ya tenemos la respuesta
    if (addedQty !== null) {
      await sleep(REQUEST_DELAY_MS)
      await clearCart(base, ua, cookies)

      if (addedQty >= PROBE_QTY) {
        return { variantId, status: "no_tracking", quantity: null }
      }
      return { variantId, status: "exact", quantity: addedQty }
    }

    // Fallback: leer /cart.js con cookies de sesión
    await sleep(REQUEST_DELAY_MS)

    const cartRes = await fetch(`${base}/cart.js`, {
      headers: {
        "User-Agent": ua,
        Accept: "application/json",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!cartRes.ok) {
      await clearCart(base, ua, cookies)
      return { variantId, status: "error", quantity: null, httpStatus: cartRes.status }
    }

    const cart: CartJsResponse = await cartRes.json()
    const item = cart.items.find((i) => i.variant_id === variantId)

    await sleep(REQUEST_DELAY_MS)
    await clearCart(base, ua, cookies)

    if (!item) {
      return { variantId, status: "error", quantity: null }
    }

    if (item.quantity >= PROBE_QTY) {
      return { variantId, status: "no_tracking", quantity: null }
    }

    return { variantId, status: "exact", quantity: item.quantity }
  } catch (err) {
    // Intentar limpiar carrito incluso en error
    try {
      await clearCart(`https://${domain}`, ua, cookies)
    } catch {
      /* ignore */
    }

    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { variantId, status: "timeout", quantity: null }
    }
    return { variantId, status: "error", quantity: null }
  }
}

/**
 * Probe con retry y exponential backoff.
 * Reintenta solo en "blocked" y "timeout" — no en "error", "exact", "no_tracking".
 */
export async function probeVariantInventory(
  domain: string,
  variantId: number,
): Promise<ProbeResult> {
  let lastResult: ProbeResult | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Usar un UA diferente en cada intento
    const ua = getNextUserAgent()
    const result = await probeVariantOnce(domain, variantId, ua)

    // Si obtuvimos resultado definitivo, retornar inmediatamente
    if (result.status === "exact" || result.status === "no_tracking" || result.status === "error") {
      return result
    }

    lastResult = result

    // Solo reintentar en "blocked" o "timeout"
    if (attempt < MAX_RETRIES - 1) {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt) // 1s, 2s, 4s
      log.debug(
        { domain, variantId, attempt: attempt + 1, status: result.status, backoffMs },
        "retrying probe after backoff",
      )
      await sleep(backoffMs)
    }
  }

  // Agotamos los retries
  log.warn(
    { domain, variantId, attempts: MAX_RETRIES, lastStatus: lastResult?.status },
    "probe exhausted retries",
  )
  return lastResult ?? { variantId, status: "error", quantity: null }
}

// ─── Detection: Does the store track inventory? ──────────────────────────────

/**
 * Detecta si una tienda Shopify trackea inventario haciendo un probe
 * en un solo variant disponible.
 *
 * Útil para decidir si vale la pena hacer batch probes en esta tienda.
 */
export async function detectInventoryTracking(
  domain: string,
): Promise<{ tracksInventory: boolean; testedVariantId: number | null }> {
  try {
    // Fetch ligero: solo 10 productos para encontrar un variant available
    const res = await fetch(`https://${domain}/products.json?limit=10`, {
      headers: { "User-Agent": getNextUserAgent() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      return { tracksInventory: false, testedVariantId: null }
    }

    // Detectar challenge HTML en la respuesta de products.json
    if (await isHtmlChallenge(res)) {
      log.warn({ domain }, "products.json returned HTML challenge")
      return { tracksInventory: false, testedVariantId: null }
    }

    const data = await res.json()
    const products: Array<{ variants: Array<{ id: number; available: boolean }> }> =
      data?.products ?? []

    // Buscar primer variant available
    let targetVariantId: number | null = null
    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.available) {
          targetVariantId = variant.id
          break
        }
      }
      if (targetVariantId) break
    }

    if (!targetVariantId) {
      return { tracksInventory: false, testedVariantId: null }
    }

    await sleep(REQUEST_DELAY_MS)

    const result = await probeVariantInventory(domain, targetVariantId)

    if (result.status === "exact") {
      return { tracksInventory: true, testedVariantId: targetVariantId }
    }

    // "no_tracking", "blocked", "timeout", "error" → no podemos confirmar tracking
    return { tracksInventory: false, testedVariantId: targetVariantId }
  } catch {
    return { tracksInventory: false, testedVariantId: null }
  }
}

// ─── Batch probe ─────────────────────────────────────────────────────────────

/**
 * Ejecuta cart probes en batch para múltiples variantes de una tienda.
 *
 * Priorización:
 *   1. Solo variantes con isAvailable === true
 *   2. Ordenadas por price descendente (mayor valor primero)
 *   3. Máximo 30 variantes por batch
 *
 * Early abort: si los primeros N resultados son todos "blocked", aborta el batch.
 * Persistent block: si todos los probes son "blocked", marca tracksInventory = null
 * para que el pipeline resetee el flag y reintente en el próximo ciclo.
 */
export async function batchProbeInventory(
  domain: string,
  variants: VariantForProbe[],
): Promise<BatchProbeResult> {
  // Priorizar: available first, luego por precio descendente
  const prioritized = variants
    .filter((v) => v.isAvailable)
    .sort((a, b) => b.price - a.price)
    .slice(0, MAX_VARIANTS_PER_BRAND)

  const skipped = Math.max(0, variants.filter((v) => v.isAvailable).length - MAX_VARIANTS_PER_BRAND)
  const results: ProbeResult[] = []
  let consecutiveBlocks = 0
  const BLOCK_ABORT_THRESHOLD = 3 // Abortar después de 3 bloqueos consecutivos

  for (const variant of prioritized) {
    const result = await probeVariantInventory(domain, Number(variant.externalId))
    results.push(result)

    // Contar bloqueos consecutivos para early abort
    if (result.status === "blocked") {
      consecutiveBlocks++
      if (consecutiveBlocks >= BLOCK_ABORT_THRESHOLD) {
        log.warn(
          { domain, consecutiveBlocks, totalProbed: results.length },
          "aborting batch due to persistent blocks",
        )
        break
      }
    } else {
      consecutiveBlocks = 0 // Resetear si un probe pasa
    }

    await sleep(REQUEST_DELAY_MS)
  }

  // Derivar si la tienda trackea inventario
  const hasExact = results.some((r) => r.status === "exact")
  const hasNoTracking = results.some((r) => r.status === "no_tracking")
  const allBlocked = results.length > 0 && results.every((r) => r.status === "blocked" || r.status === "timeout")

  let tracksInventory: boolean | null = null
  if (hasExact) tracksInventory = true
  else if (hasNoTracking && !hasExact) tracksInventory = false
  else if (allBlocked) tracksInventory = null // inconcluso — pipeline debe resetear

  log.info(
    {
      domain,
      probed: results.length,
      skipped,
      exact: results.filter((r) => r.status === "exact").length,
      blocked: results.filter((r) => r.status === "blocked").length,
      timeout: results.filter((r) => r.status === "timeout").length,
      tracksInventory,
    },
    "batch probe complete",
  )

  return {
    domain,
    results,
    probed: results.length,
    skipped,
    tracksInventory,
  }
}
