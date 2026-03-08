/**
 * Shopify adapter — usa el endpoint público /products.json
 * que todos los stores Shopify exponen por defecto.
 *
 * Implementa la interfaz StoreAdapter para integración con el pipeline.
 */

import type {
  StoreAdapter,
  NormalizedProduct,
  NormalizedVariant,
  ProductURL,
} from "@/lib/scrapers/adapter"
import { resilientFetch, getRandomUserAgent } from "@/lib/scrapers/http-client"

// ─── Shopify raw types ───────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────

const PAGE_SIZE = 250
const REQUEST_DELAY_MS = 500

// ─── Legacy detection function (kept for backward compatibility) ─

/**
 * Verifica si un dominio tiene un store Shopify activo
 * intentando acceder a /products.json
 */
export async function detectShopifyStore(domain: string): Promise<boolean> {
  const url = `https://${domain}/products.json?limit=1`
  try {
    const res = await resilientFetch(url, {
      timeoutMs: 10_000,
      maxRetries: 1,
    })
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data?.products)
  } catch {
    return false
  }
}

// ─── Legacy fetch function (kept for backward compatibility) ─────

/**
 * Obtiene todos los productos de un store Shopify
 * paginando hasta agotar los resultados.
 */
export async function fetchAllShopifyProducts(
  domain: string,
  onProgress?: (count: number) => void
): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = []
  let page = 1

  while (true) {
    const url = `https://${domain}/products.json?limit=${PAGE_SIZE}&page=${page}`
    const res = await resilientFetch(url, {
      timeoutMs: 30_000,
      maxRetries: 3,
      rateLimitPerDomain: REQUEST_DELAY_MS,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }

    const data: ShopifyProductsResponse = await res.json()
    const products = data.products ?? []

    all.push(...products)
    onProgress?.(all.length)

    if (products.length < PAGE_SIZE) break
    page++
  }

  return all
}

// ─── ShopifyAdapter (implements StoreAdapter) ────────────────────

function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) {
    return tags.map((t) => t.trim()).filter(Boolean)
  }
  if (typeof tags === "string") {
    return tags.split(",").map((t) => t.trim()).filter(Boolean)
  }
  return []
}

function normalizeShopifyVariant(sv: ShopifyVariant): NormalizedVariant {
  return {
    externalId: String(sv.id),
    title: sv.title,
    sku: sv.sku || null,
    option1: sv.option1 || null,
    option2: sv.option2 || null,
    option3: sv.option3 || null,
    price: {
      price: sv.price,
      compareAtPrice: sv.compare_at_price || null,
      currency: null, // Shopify /products.json doesn't include currency
    },
    isAvailable: sv.available,
    inventoryQuantity: sv.inventory_quantity ?? null,
    weight: sv.weight || null,
    weightUnit: sv.weight_unit || null,
  }
}

function normalizeShopifyProduct(sp: ShopifyProduct): NormalizedProduct {
  return {
    externalId: String(sp.id),
    title: sp.title,
    handle: sp.handle,
    productType: sp.product_type || null,
    vendor: sp.vendor || null,
    tags: parseTags(sp.tags),
    bodyHtml: sp.body_html || null,
    publishedAt: sp.published_at ? new Date(sp.published_at) : null,
    imageUrl: sp.images?.[0]?.src ?? null,
    imageUrls: sp.images?.map((i) => i.src) ?? [],
    variants: sp.variants.map(normalizeShopifyVariant),
    confidence: 1.0,
  }
}

export class ShopifyAdapter implements StoreAdapter {
  readonly platform = "SHOPIFY" as const

  async discoverProducts(domain: string): Promise<ProductURL[]> {
    // Shopify's /products.json returns all products, so discovery
    // returns handles that can be used to access individual products
    const products = await fetchAllShopifyProducts(domain)
    return products.map((p) => ({
      url: `https://${domain}/products/${p.handle}`,
      externalId: String(p.id),
      handle: p.handle,
    }))
  }

  async fetchProduct(url: string): Promise<ShopifyProduct> {
    // Extract handle from URL and fetch single product
    const handle = url.split("/products/").pop()?.split("?")[0]
    if (!handle) throw new Error(`Invalid product URL: ${url}`)

    const domain = new URL(url).hostname
    const res = await resilientFetch(
      `https://${domain}/products/${handle}.json`,
      { timeoutMs: 30_000, maxRetries: 2 }
    )

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching product ${handle}`)
    }

    const data = await res.json()
    return data.product as ShopifyProduct
  }

  parseProduct(payload: unknown): NormalizedProduct {
    return normalizeShopifyProduct(payload as ShopifyProduct)
  }

  parseVariants(payload: unknown): NormalizedVariant[] {
    const sp = payload as ShopifyProduct
    return sp.variants.map(normalizeShopifyVariant)
  }

  async fetchAllProducts(
    domain: string,
    onProgress?: (count: number) => void
  ): Promise<NormalizedProduct[]> {
    const rawProducts = await fetchAllShopifyProducts(domain, onProgress)
    return rawProducts.map(normalizeShopifyProduct)
  }
}
