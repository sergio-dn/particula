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
 */

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

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
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

function isCloudflareBlocked(res: Response): boolean {
  if (res.status === 403 || res.status === 503) {
    const server = res.headers.get("server") ?? ""
    if (server.toLowerCase().includes("cloudflare")) return true
    // Algunos stores devuelven 403 sin header cloudflare pero siguen siendo WAF
    return true
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
    console.warn(`[cart-probe] Failed to clear cart for ${baseUrl}`)
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
export async function probeVariantInventory(
  domain: string,
  variantId: number,
): Promise<ProbeResult> {
  const ua = getNextUserAgent()
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
    if (!addRes.ok) {
      return { variantId, status: "error", quantity: null, httpStatus: addRes.status }
    }

    // Estrategia primaria: leer quantity del response de /cart/add.js
    // Shopify devuelve la cantidad realmente añadida (limitada al stock si trackea)
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
 * Early abort: si el primer resultado es "blocked", aborta el batch completo.
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

  for (const variant of prioritized) {
    const result = await probeVariantInventory(domain, Number(variant.externalId))
    results.push(result)

    // Early abort si estamos bloqueados
    if (result.status === "blocked") {
      console.warn(
        `[cart-probe] ${domain}: blocked after ${results.length} probe(s), aborting batch`,
      )
      break
    }

    await sleep(REQUEST_DELAY_MS)
  }

  // Derivar si la tienda trackea inventario
  const hasExact = results.some((r) => r.status === "exact")
  const hasNoTracking = results.some((r) => r.status === "no_tracking")
  const allBlocked = results.length > 0 && results.every((r) => r.status === "blocked")

  let tracksInventory: boolean | null = null
  if (hasExact) tracksInventory = true
  else if (hasNoTracking && !hasExact) tracksInventory = false
  else if (allBlocked) tracksInventory = null // inconcluso

  return {
    domain,
    results,
    probed: results.length,
    skipped,
    tracksInventory,
  }
}
