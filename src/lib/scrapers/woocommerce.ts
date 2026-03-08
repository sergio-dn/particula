/**
 * WooCommerce adapter — extrae productos via la API REST pública
 * o parseando la estructura HTML de WooCommerce como fallback.
 *
 * Implementa StoreAdapter para el tipo WOOCOMMERCE.
 */

import * as cheerio from "cheerio"
import type {
  StoreAdapter,
  NormalizedProduct,
  NormalizedVariant,
  ProductURL,
} from "@/lib/scrapers/adapter"
import { discoverProductsViaSitemap } from "@/lib/scrapers/discovery/sitemap"
import { resilientFetch, getRandomUserAgent } from "@/lib/scrapers/http-client"

const TIMEOUT_MS = 30_000
const PER_PAGE = 100
const DELAY_BETWEEN_REQUESTS_MS = 500

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── WooCommerce API types ───────────────────────────────────────

interface WcApiProduct {
  id: number
  name: string
  slug: string
  type: string
  status: string
  description: string
  short_description: string
  sku: string
  price: string
  regular_price: string
  sale_price: string
  categories: Array<{ id: number; name: string; slug: string }>
  tags: Array<{ id: number; name: string; slug: string }>
  images: Array<{ id: number; src: string; alt: string }>
  stock_quantity: number | null
  stock_status: string
  variations: number[]
  date_created: string
  attributes: Array<{
    name: string
    options: string[]
  }>
}

interface WcApiVariation {
  id: number
  sku: string
  price: string
  regular_price: string
  sale_price: string
  stock_quantity: number | null
  stock_status: string
  attributes: Array<{ name: string; option: string }>
  image?: { src: string }
  weight?: string
}

// ─── HTML payload type ───────────────────────────────────────────

interface WcHtmlPayload {
  url: string
  html: string
  source: "api" | "html"
  apiProduct?: WcApiProduct
  apiVariations?: WcApiVariation[]
}

// ─── HTML parsing helpers ────────────────────────────────────────

function extractMetaContent(html: string, property: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i"
  )
  return regex.exec(html)?.[1] ?? null
}

function extractTitle(html: string): string {
  const ogTitle = extractMetaContent(html, "og:title")
  if (ogTitle) return ogTitle
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  return match?.[1]?.trim() ?? "Unknown Product"
}

function extractPriceFromHtml(html: string): string {
  // WooCommerce uses .woocommerce-Price-amount
  const match =
    /class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>.*?(\d+[.,]\d{2})/i.exec(
      html
    )
  if (match) return match[1].replace(",", ".")

  // Fallback: generic price pattern
  const fallback = /data-price=["'](\d+\.?\d*)["']/i.exec(html)
  return fallback?.[1] ?? "0"
}

function extractAvailabilityFromHtml(html: string): boolean {
  if (/class=["'][^"']*out-of-stock/i.test(html)) return false
  if (/class=["'][^"']*in-stock/i.test(html)) return true
  return !(/sold.out|agotado|out.of.stock/i.test(html))
}

function extractHandle(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean)
    return segments[segments.length - 1] ?? "unknown"
  } catch {
    return "unknown"
  }
}

// ─── WooCommerceAdapter ──────────────────────────────────────────

export class WooCommerceAdapter implements StoreAdapter {
  readonly platform = "WOOCOMMERCE" as const

  async discoverProducts(domain: string): Promise<ProductURL[]> {
    // Strategy 1: WC REST API
    const apiUrls = await this.discoverViaApi(domain)
    if (apiUrls.length > 0) return apiUrls

    // Strategy 2: Sitemap
    const sitemapUrls = await discoverProductsViaSitemap(domain)
    if (sitemapUrls.length > 0) return sitemapUrls

    // Strategy 3: /shop/ page pagination (HTML fallback)
    return this.discoverViaShopPage(domain)
  }

  async fetchProduct(url: string): Promise<WcHtmlPayload> {
    const res = await resilientFetch(url, {
      headers: { "User-Agent": getRandomUserAgent() },
      timeoutMs: TIMEOUT_MS,
      maxRetries: 2,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const html = await res.text()
    return { url, html, source: "html" }
  }

  parseProduct(payload: unknown): NormalizedProduct {
    const data = payload as WcHtmlPayload

    if (data.source === "api" && data.apiProduct) {
      return this.normalizeApiProduct(data.apiProduct, data.apiVariations)
    }

    return this.normalizeHtmlProduct(data.html, data.url)
  }

  parseVariants(payload: unknown): NormalizedVariant[] {
    const data = payload as WcHtmlPayload

    if (data.source === "api" && data.apiProduct) {
      if (data.apiVariations && data.apiVariations.length > 0) {
        return data.apiVariations.map((v) => this.normalizeApiVariation(v))
      }
      return [this.simpleProductToVariant(data.apiProduct)]
    }

    // HTML fallback: single variant
    const price = extractPriceFromHtml(data.html)
    const isAvailable = extractAvailabilityFromHtml(data.html)

    return [
      {
        externalId: "default",
        title: "Default",
        sku: null,
        option1: null,
        option2: null,
        option3: null,
        price: { price, compareAtPrice: null, currency: null },
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
    // Try API-based fetching first
    const apiProducts = await this.fetchAllViaApi(domain, onProgress)
    if (apiProducts.length > 0) return apiProducts

    // Fallback: sitemap discovery + individual fetch
    const urls = await this.discoverProducts(domain)
    const products: NormalizedProduct[] = []
    const limit = Math.min(urls.length, 500)

    for (let i = 0; i < limit; i++) {
      try {
        const payload = await this.fetchProduct(urls[i].url)
        products.push(this.parseProduct(payload))
        onProgress?.(products.length)
      } catch (err) {
        console.warn(
          `[wc-adapter] Failed: ${urls[i].url}: ${err instanceof Error ? err.message : err}`
        )
      }
      if (i < limit - 1) await sleep(DELAY_BETWEEN_REQUESTS_MS)
    }

    return products
  }

  // ─── API-based methods ─────────────────────────────────────────

  private async isApiAvailable(domain: string): Promise<boolean> {
    try {
      const res = await resilientFetch(
        `https://${domain}/wp-json/wc/v3/products?per_page=1`,
        {
          headers: { "User-Agent": getRandomUserAgent() },
          timeoutMs: 10_000,
          maxRetries: 1,
        }
      )
      return res.status === 200
    } catch {
      return false
    }
  }

  private async discoverViaApi(domain: string): Promise<ProductURL[]> {
    if (!(await this.isApiAvailable(domain))) return []

    const urls: ProductURL[] = []
    let page = 1

    while (true) {
      try {
        const res = await resilientFetch(
          `https://${domain}/wp-json/wc/v3/products?per_page=${PER_PAGE}&page=${page}`,
          {
            headers: { "User-Agent": getRandomUserAgent() },
            timeoutMs: TIMEOUT_MS,
          }
        )
        if (!res.ok) break

        const products: WcApiProduct[] = await res.json()
        if (products.length === 0) break

        for (const p of products) {
          urls.push({
            url: `https://${domain}/product/${p.slug}`,
            externalId: String(p.id),
            handle: p.slug,
          })
        }

        if (products.length < PER_PAGE) break
        page++
        await sleep(DELAY_BETWEEN_REQUESTS_MS)
      } catch {
        break
      }
    }

    return urls
  }

  private async discoverViaShopPage(domain: string): Promise<ProductURL[]> {
    const productUrls: ProductURL[] = []
    const seen = new Set<string>()
    let page = 1
    const maxPages = 50

    while (page <= maxPages) {
      const pageUrl =
        page === 1
          ? `https://${domain}/shop/`
          : `https://${domain}/shop/page/${page}/`

      try {
        const res = await resilientFetch(pageUrl, {
          headers: { "User-Agent": getRandomUserAgent() },
          timeoutMs: TIMEOUT_MS,
          maxRetries: 1,
        })
        if (!res.ok) break

        const html = await res.text()
        const $ = cheerio.load(html)

        const links: string[] = []

        // WooCommerce product links: loop product anchors and generic product links
        $(
          "ul.products li.product a.woocommerce-LoopProduct-link, " +
            "ul.products li.product a[href*='/product/'], " +
            ".products .product a[href*='/product/']"
        ).each((_, el) => {
          const href = $(el).attr("href")
          if (href && href.includes("/product/")) {
            links.push(href)
          }
        })

        // Broader fallback if theme uses non-standard markup
        if (links.length === 0) {
          $("a[href*='/product/']").each((_, el) => {
            const href = $(el).attr("href")
            if (href) links.push(href)
          })
        }

        if (links.length === 0) break

        for (const link of links) {
          const fullUrl = link.startsWith("http")
            ? link
            : `https://${domain}${link}`
          if (seen.has(fullUrl)) continue
          seen.add(fullUrl)

          const handle =
            fullUrl.split("/product/").pop()?.replace(/\/$/, "")?.split("?")[0] ?? undefined
          productUrls.push({ url: fullUrl, handle })
        }

        // Check for next page
        const hasNext =
          $("a.next.page-numbers").length > 0 ||
          $(`a[href*="/shop/page/${page + 1}"]`).length > 0
        if (!hasNext) break

        page++
        await sleep(DELAY_BETWEEN_REQUESTS_MS)
      } catch {
        break
      }
    }

    return productUrls
  }

  private async fetchAllViaApi(
    domain: string,
    onProgress?: (count: number) => void
  ): Promise<NormalizedProduct[]> {
    if (!(await this.isApiAvailable(domain))) return []

    const products: NormalizedProduct[] = []
    let page = 1

    while (true) {
      try {
        const res = await resilientFetch(
          `https://${domain}/wp-json/wc/v3/products?per_page=${PER_PAGE}&page=${page}`,
          {
            headers: { "User-Agent": getRandomUserAgent() },
            timeoutMs: TIMEOUT_MS,
          }
        )
        if (!res.ok) break

        const apiProducts: WcApiProduct[] = await res.json()
        if (apiProducts.length === 0) break

        for (const ap of apiProducts) {
          // Fetch variations if product has them
          let variations: WcApiVariation[] = []
          if (ap.variations && ap.variations.length > 0) {
            variations = await this.fetchVariations(domain, ap.id)
          }
          products.push(this.normalizeApiProduct(ap, variations))
        }

        onProgress?.(products.length)
        if (apiProducts.length < PER_PAGE) break
        page++
        await sleep(DELAY_BETWEEN_REQUESTS_MS)
      } catch {
        break
      }
    }

    return products
  }

  private async fetchVariations(
    domain: string,
    productId: number
  ): Promise<WcApiVariation[]> {
    try {
      const res = await resilientFetch(
        `https://${domain}/wp-json/wc/v3/products/${productId}/variations?per_page=100`,
        {
          headers: { "User-Agent": getRandomUserAgent() },
          timeoutMs: TIMEOUT_MS,
          maxRetries: 1,
        }
      )
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }

  // ─── Normalization helpers ─────────────────────────────────────

  private normalizeApiProduct(
    ap: WcApiProduct,
    variations?: WcApiVariation[]
  ): NormalizedProduct {
    const variants =
      variations && variations.length > 0
        ? variations.map((v) => this.normalizeApiVariation(v))
        : [this.simpleProductToVariant(ap)]

    return {
      externalId: String(ap.id),
      title: ap.name,
      handle: ap.slug,
      productType:
        ap.categories?.[0]?.name ?? null,
      vendor: null,
      tags: ap.tags?.map((t) => t.name) ?? [],
      bodyHtml: ap.description || ap.short_description || null,
      publishedAt: ap.date_created ? new Date(ap.date_created) : null,
      imageUrl: ap.images?.[0]?.src ?? null,
      imageUrls: ap.images?.map((i) => i.src) ?? [],
      variants,
    }
  }

  private normalizeApiVariation(v: WcApiVariation): NormalizedVariant {
    const attrs = v.attributes ?? []
    return {
      externalId: String(v.id),
      title: attrs.map((a) => a.option).join(" / ") || "Default",
      sku: v.sku || null,
      option1: attrs[0]?.option ?? null,
      option2: attrs[1]?.option ?? null,
      option3: attrs[2]?.option ?? null,
      price: {
        price: v.price || v.regular_price || "0",
        compareAtPrice:
          v.sale_price && v.regular_price !== v.sale_price
            ? v.regular_price
            : null,
        currency: null,
      },
      isAvailable: v.stock_status === "instock",
      inventoryQuantity: v.stock_quantity,
      weight: v.weight ? parseFloat(v.weight) : null,
      weightUnit: v.weight ? "kg" : null,
    }
  }

  private simpleProductToVariant(ap: WcApiProduct): NormalizedVariant {
    return {
      externalId: String(ap.id),
      title: "Default",
      sku: ap.sku || null,
      option1: null,
      option2: null,
      option3: null,
      price: {
        price: ap.price || ap.regular_price || "0",
        compareAtPrice:
          ap.sale_price && ap.regular_price !== ap.sale_price
            ? ap.regular_price
            : null,
        currency: null,
      },
      isAvailable: ap.stock_status === "instock",
      inventoryQuantity: ap.stock_quantity,
      weight: null,
      weightUnit: null,
    }
  }

  private normalizeHtmlProduct(
    html: string,
    url: string
  ): NormalizedProduct {
    const handle = extractHandle(url)
    const title = extractTitle(html)
    const price = extractPriceFromHtml(html)
    const isAvailable = extractAvailabilityFromHtml(html)
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
          price: { price, compareAtPrice: null, currency: null },
          isAvailable,
          inventoryQuantity: null,
          weight: null,
          weightUnit: null,
        },
      ],
    }
  }
}
