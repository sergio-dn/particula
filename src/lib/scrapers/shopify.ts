/**
 * Shopify scraper — usa el endpoint público /products.json
 * que todos los stores Shopify exponen por defecto.
 *
 * https://brand-domain.com/products.json?limit=250&page=N
 */

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
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Particula/1.0)" },
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
  const all: ShopifyProduct[] = []
  let page = 1

  while (true) {
    const url = `https://${domain}/products.json?limit=${PAGE_SIZE}&page=${page}`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Particula/1.0)" },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — esperar más tiempo
        await sleep(5_000)
        continue
      }
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }

    const data: ShopifyProductsResponse = await res.json()
    const products = data.products ?? []

    all.push(...products)
    onProgress?.(all.length)

    if (products.length < PAGE_SIZE) break
    page++
    await sleep(REQUEST_DELAY_MS)
  }

  return all
}
