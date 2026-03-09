/**
 * Shopify scraper — usa el endpoint público /products.json
 * que todos los stores Shopify exponen por defecto.
 *
 * https://brand-domain.com/products.json?limit=250&page=N
 */

import type {
  StoreAdapter,
  NormalizedProduct,
  NormalizedVariant,
  NormalizedPrice,
  ProductURL,
} from "./adapter"
import { scraperLogger } from "@/lib/logger"

export interface ShopifyVariant {
  id: number
  title: string
  sku: string | null
  option1: string | null
  option2: string | null
  option3: string | null
  price: string
  compare_at_price: string | null
  available: boolean
  inventory_quantity: number
  weight: number
  weight_unit: string
}

export interface ShopifyProduct {
  id: number
  title: string
  handle: string
  product_type: string
  vendor: string
  tags: string | string[]
  body_html: string
  published_at: string
  images: Array<{ src: string }>
  variants: ShopifyVariant[]
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[]
}

const PAGE_SIZE = 250
const REQUEST_DELAY_MS = 500
const MAX_RETRIES = 3

// User-Agent rotation para evitar bloqueos (#30)
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

let uaIndex = 0
function getNextUA(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length]
  uaIndex++
  return ua
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Verifica si un dominio tiene un store Shopify activo
 * intentando acceder a /products.json
 */
export async function detectShopifyStore(domain: string): Promise<boolean> {
  const url = `https://${domain}/products.json?limit=1`
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": getNextUA() },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data?.products)
  } catch {
    return false
  }
}

/**
 * Obtiene todos los productos de un store Shopify
 * paginando hasta agotar los resultados.
 */
export async function fetchAllShopifyProducts(
  domain: string,
  onProgress?: (count: number) => void
): Promise<ShopifyProduct[]> {
  const log = scraperLogger.child({ domain })
  const all: ShopifyProduct[] = []
  let page = 1

  while (true) {
    const url = `https://${domain}/products.json?limit=${PAGE_SIZE}&page=${page}`
    let lastError: Error | null = null
    let success = false

    // Retry con exponential backoff (#30)
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": getNextUA() },
          signal: AbortSignal.timeout(30_000),
        })

        if (res.status === 429) {
          // Rate limited — backoff exponencial
          const backoffMs = 2_000 * Math.pow(2, attempt) // 2s, 4s, 8s
          log.warn({ page, attempt: attempt + 1, backoffMs }, "rate limited, backing off")
          await sleep(backoffMs)
          continue
        }

        // Detectar Cloudflare challenge (HTML en vez de JSON)
        const contentType = res.headers.get("content-type") ?? ""
        if ((res.status === 403 || res.status === 503) || (res.ok && contentType.includes("text/html"))) {
          const backoffMs = 3_000 * Math.pow(2, attempt)
          log.warn({ page, status: res.status, attempt: attempt + 1 }, "possible WAF block, backing off")
          await sleep(backoffMs)
          continue
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${url}`)
        }

        const data: ShopifyProductsResponse = await res.json()
        const products = data.products ?? []

        all.push(...products)
        onProgress?.(all.length)
        success = true

        if (products.length < PAGE_SIZE) return all // Last page
        break // Go to next page
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < MAX_RETRIES - 1) {
          const backoffMs = 1_000 * Math.pow(2, attempt)
          log.warn({ page, attempt: attempt + 1, error: lastError.message }, "fetch failed, retrying")
          await sleep(backoffMs)
        }
      }
    }

    if (!success) {
      throw lastError ?? new Error(`Failed to fetch page ${page} after ${MAX_RETRIES} attempts`)
    }

    page++
    await sleep(REQUEST_DELAY_MS)
  }
}

// ─── Mapping helpers ────────────────────────────────────────────

function normalizeVariant(v: ShopifyVariant): NormalizedVariant {
  const price: NormalizedPrice = {
    price: v.price,
    compareAtPrice: v.compare_at_price ?? null,
    currency: null, // Shopify /products.json does not include currency
  }

  return {
    externalId: String(v.id),
    title: v.title,
    sku: v.sku ?? null,
    option1: v.option1 ?? null,
    option2: v.option2 ?? null,
    option3: v.option3 ?? null,
    price,
    isAvailable: v.available,
    inventoryQuantity: v.inventory_quantity ?? null,
    weight: v.weight ?? null,
    weightUnit: v.weight_unit ?? null,
  }
}

function normalizeProduct(p: ShopifyProduct): NormalizedProduct {
  const tags: string[] = Array.isArray(p.tags)
    ? p.tags
    : (p.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

  const imageUrls = (p.images ?? []).map((img) => img.src)

  return {
    externalId: String(p.id),
    title: p.title,
    handle: p.handle,
    productType: p.product_type || null,
    vendor: p.vendor || null,
    tags,
    bodyHtml: p.body_html || null,
    publishedAt: p.published_at ? new Date(p.published_at) : null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    variants: (p.variants ?? []).map(normalizeVariant),
    confidence: 0.95, // high confidence — native API
  }
}

// ─── StoreAdapter implementation ────────────────────────────────

export class ShopifyAdapter implements StoreAdapter {
  readonly platform = "SHOPIFY" as const

  /**
   * Discover product URLs from a Shopify store by fetching the
   * products.json endpoint. Returns a ProductURL per product.
   */
  async discoverProducts(domain: string): Promise<ProductURL[]> {
    const products = await fetchAllShopifyProducts(domain)
    return products.map((p) => ({
      url: `https://${domain}/products/${p.handle}`,
      externalId: String(p.id),
      handle: p.handle,
    }))
  }

  /**
   * Fetch a single product by its URL (must be a Shopify product URL
   * of the form https://domain/products/handle).
   */
  async fetchProduct(url: string): Promise<unknown> {
    const jsonUrl = url.replace(/\/$/, "") + ".json"
    const res = await fetch(jsonUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Particula/1.0)" },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${jsonUrl}`)
    }

    const data = await res.json()
    return data.product ?? data
  }

  /**
   * Parse a raw Shopify product payload into a NormalizedProduct.
   */
  parseProduct(payload: unknown): NormalizedProduct {
    return normalizeProduct(payload as ShopifyProduct)
  }

  /**
   * Parse variants from a raw Shopify product payload.
   */
  parseVariants(payload: unknown): NormalizedVariant[] {
    const product = payload as ShopifyProduct
    return (product.variants ?? []).map(normalizeVariant)
  }

  /**
   * Fetch and normalize every product from a Shopify store.
   * Wraps the existing `fetchAllShopifyProducts` helper.
   */
  async fetchAllProducts(
    domain: string,
    onProgress?: (count: number) => void,
  ): Promise<NormalizedProduct[]> {
    const raw = await fetchAllShopifyProducts(domain, onProgress)
    return raw.map(normalizeProduct)
  }
}
