/**
 * Generic adapter — funciona con cualquier sitio ecommerce usando
 * datos estructurados JSON-LD (schema.org/Product) y parsing HTML como fallback.
 *
 * Implementa StoreAdapter para el tipo GENERIC.
 */

import type {
  StoreAdapter,
  NormalizedProduct,
  NormalizedVariant,
  NormalizedPrice,
  ProductURL,
} from "@/lib/scrapers/adapter"
import { discoverProductsViaSitemap } from "@/lib/scrapers/discovery/sitemap"
import { resilientFetch, getRandomUserAgent } from "@/lib/scrapers/http-client"

const TIMEOUT_MS = 30_000
const MAX_PRODUCTS = 500
const DELAY_BETWEEN_REQUESTS_MS = 1_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── JSON-LD types ───────────────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string
  name?: string
  url?: string
  description?: string
  image?: string | string[] | { url?: string }[]
  brand?: string | { name?: string }
  category?: string
  sku?: string
  productID?: string
  offers?:
    | JsonLdOffer
    | JsonLdOffer[]
    | { "@type"?: string; offers?: JsonLdOffer[] }
}

interface JsonLdOffer {
  "@type"?: string
  price?: string | number
  priceCurrency?: string
  availability?: string
  sku?: string
  name?: string
  url?: string
}

// ─── Raw payload type ────────────────────────────────────────────

interface GenericProductPayload {
  url: string
  html: string
  jsonLd: JsonLdProduct | null
}

// ─── HTML parsing helpers ────────────────────────────────────────

function extractJsonLd(html: string): JsonLdProduct | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      // Could be a single object or an array
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item["@type"] === "Product") return item
        // Check @graph structure
        if (item["@graph"]) {
          const product = item["@graph"].find(
            (g: { "@type"?: string }) => g["@type"] === "Product"
          )
          if (product) return product
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  return null
}

function extractMetaContent(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i"
  )
  const match = regex.exec(html)
  return match?.[1] ?? null
}

function extractTitle(html: string): string {
  const ogTitle = extractMetaContent(html, "og:title")
  if (ogTitle) return ogTitle

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  return titleMatch?.[1]?.trim() ?? "Unknown Product"
}

function extractPrice(html: string): { price: string; currency: string | null } | null {
  // Try meta tags first
  const ogPrice = extractMetaContent(html, "product:price:amount")
  if (ogPrice) {
    const currency = extractMetaContent(html, "product:price:currency")
    return { price: ogPrice, currency }
  }

  // Try common price patterns in HTML
  const pricePatterns = [
    /class=["'][^"']*price[^"']*["'][^>]*>[\s]*[^<]*?(\$|€|£|¥)?[\s]*(\d+[.,]\d{2})/i,
    /data-price=["'](\d+\.?\d*)["']/i,
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
  ]

  for (const pattern of pricePatterns) {
    const match = pattern.exec(html)
    if (match) {
      const priceStr = match[2] ?? match[1]
      return { price: priceStr.replace(",", "."), currency: null }
    }
  }

  return null
}

function extractAvailability(html: string): boolean {
  // Check meta tag
  const availability = extractMetaContent(html, "product:availability")
  if (availability) {
    return (
      availability.toLowerCase().includes("instock") ||
      availability.toLowerCase().includes("in stock")
    )
  }

  // Check common patterns
  const outOfStockPatterns = [
    /out.of.stock/i,
    /sold.out/i,
    /agotado/i,
    /no.disponible/i,
    /unavailable/i,
  ]

  for (const pattern of outOfStockPatterns) {
    if (pattern.test(html)) return false
  }

  return true // Default to available
}

function extractHandle(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const segments = pathname.split("/").filter(Boolean)
    return segments[segments.length - 1] ?? pathname.replace(/\//g, "-")
  } catch {
    return url.replace(/[^a-z0-9]/gi, "-").toLowerCase()
  }
}

// ─── JSON-LD normalization ───────────────────────────────────────

function normalizeJsonLdOffers(
  offers: JsonLdProduct["offers"]
): JsonLdOffer[] {
  if (!offers) return []
  if (Array.isArray(offers)) return offers
  if ("offers" in offers && Array.isArray(offers.offers)) return offers.offers
  return [offers as JsonLdOffer]
}

function normalizeJsonLdImages(
  image: JsonLdProduct["image"]
): string[] {
  if (!image) return []
  if (typeof image === "string") return [image]
  if (Array.isArray(image)) {
    return image.map((img) => (typeof img === "string" ? img : img.url ?? "")).filter(Boolean)
  }
  return []
}

function availabilityFromSchema(availability?: string): boolean {
  if (!availability) return true
  const lower = availability.toLowerCase()
  return (
    lower.includes("instock") ||
    lower.includes("preorder") ||
    lower.includes("limitedavailability")
  )
}

// ─── GenericAdapter ──────────────────────────────────────────────

export class GenericAdapter implements StoreAdapter {
  readonly platform = "GENERIC" as const

  async discoverProducts(domain: string): Promise<ProductURL[]> {
    return discoverProductsViaSitemap(domain)
  }

  async fetchProduct(url: string): Promise<GenericProductPayload> {
    const res = await resilientFetch(url, {
      headers: { "User-Agent": getRandomUserAgent() },
      timeoutMs: TIMEOUT_MS,
      maxRetries: 2,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`)
    }

    const html = await res.text()
    const jsonLd = extractJsonLd(html)

    return { url, html, jsonLd }
  }

  parseProduct(payload: unknown): NormalizedProduct {
    const { url, html, jsonLd } = payload as GenericProductPayload
    const handle = extractHandle(url)

    if (jsonLd) {
      return this.parseFromJsonLd(jsonLd, url, handle, html)
    }

    return this.parseFromHtml(html, url, handle)
  }

  parseVariants(payload: unknown): NormalizedVariant[] {
    const { html, jsonLd } = payload as GenericProductPayload

    if (jsonLd) {
      const offers = normalizeJsonLdOffers(jsonLd.offers)
      return offers.map((offer, index) =>
        this.offerToVariant(offer, index, jsonLd)
      )
    }

    // HTML fallback: single variant
    const priceInfo = extractPrice(html)
    const isAvailable = extractAvailability(html)

    return [
      {
        externalId: "default",
        title: "Default",
        sku: null,
        option1: null,
        option2: null,
        option3: null,
        price: {
          price: priceInfo?.price ?? "0",
          compareAtPrice: null,
          currency: priceInfo?.currency ?? null,
        },
        isAvailable,
        inventoryQuantity: null,
        weight: null,
        weightUnit: null,
      },
    ]
  }

  async fetchAllProducts(
    domain: string,
    onProgress?: (count: number) => void
  ): Promise<NormalizedProduct[]> {
    const urls = await this.discoverProducts(domain)
    const products: NormalizedProduct[] = []
    const limit = Math.min(urls.length, MAX_PRODUCTS)

    for (let i = 0; i < limit; i++) {
      try {
        const payload = await this.fetchProduct(urls[i].url)
        const product = this.parseProduct(payload)
        products.push(product)
        onProgress?.(products.length)
      } catch (err) {
        console.warn(
          `[generic-adapter] Failed to fetch ${urls[i].url}: ${err instanceof Error ? err.message : err}`
        )
      }

      if (i < limit - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS)
      }
    }

    return products
  }

  // ─── Private helpers ─────────────────────────────────────────

  private parseFromJsonLd(
    jsonLd: JsonLdProduct,
    url: string,
    handle: string,
    html: string
  ): NormalizedProduct {
    const images = normalizeJsonLdImages(jsonLd.image)
    const brand =
      typeof jsonLd.brand === "string"
        ? jsonLd.brand
        : jsonLd.brand?.name ?? null
    const offers = normalizeJsonLdOffers(jsonLd.offers)

    return {
      externalId: jsonLd.productID ?? jsonLd.sku ?? handle,
      title: jsonLd.name ?? extractTitle(html),
      handle,
      productType: jsonLd.category ?? null,
      vendor: brand,
      tags: [],
      bodyHtml: jsonLd.description ?? null,
      publishedAt: null,
      imageUrl: images[0] ?? extractMetaContent(html, "og:image"),
      imageUrls: images,
      variants: offers.map((offer, index) =>
        this.offerToVariant(offer, index, jsonLd)
      ),
    }
  }

  private parseFromHtml(
    html: string,
    url: string,
    handle: string
  ): NormalizedProduct {
    const title = extractTitle(html)
    const priceInfo = extractPrice(html)
    const isAvailable = extractAvailability(html)
    const imageUrl = extractMetaContent(html, "og:image")

    return {
      externalId: handle,
      title,
      handle,
      productType: null,
      vendor: null,
      tags: [],
      bodyHtml: extractMetaContent(html, "og:description"),
      publishedAt: null,
      imageUrl,
      imageUrls: imageUrl ? [imageUrl] : [],
      variants: [
        {
          externalId: "default",
          title: "Default",
          sku: null,
          option1: null,
          option2: null,
          option3: null,
          price: {
            price: priceInfo?.price ?? "0",
            compareAtPrice: null,
            currency: priceInfo?.currency ?? null,
          },
          isAvailable,
          inventoryQuantity: null,
          weight: null,
          weightUnit: null,
        },
      ],
    }
  }

  private offerToVariant(
    offer: JsonLdOffer,
    index: number,
    jsonLd: JsonLdProduct
  ): NormalizedVariant {
    return {
      externalId: offer.sku ?? `variant-${index}`,
      title: offer.name ?? `Variant ${index + 1}`,
      sku: offer.sku ?? jsonLd.sku ?? null,
      option1: offer.name ?? null,
      option2: null,
      option3: null,
      price: {
        price: String(offer.price ?? "0"),
        compareAtPrice: null,
        currency: offer.priceCurrency ?? null,
      },
      isAvailable: availabilityFromSchema(offer.availability),
      inventoryQuantity: null,
      weight: null,
      weightUnit: null,
    }
  }
}
