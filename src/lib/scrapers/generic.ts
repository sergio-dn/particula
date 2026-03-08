/**
 * Generic adapter — funciona con cualquier sitio ecommerce usando
 * datos estructurados JSON-LD (schema.org/Product) y parsing HTML como fallback.
 *
 * Usa Playwright para renderizar páginas con JavaScript y Cheerio para parsear
 * el HTML resultante.
 *
 * Estrategia de extracción:
 *  1. Buscar JSON-LD @type: Product en la página
 *  2. Parsear schema.org/Product structured data
 *  3. Fallback: extraer precio/disponibilidad del HTML con heurísticas
 *  4. Detectar variantes con heurísticas simples
 *
 * Implementa StoreAdapter para el tipo GENERIC.
 */

import { chromium, type Browser } from "playwright"
import * as cheerio from "cheerio"
import type {
  StoreAdapter,
  NormalizedProduct,
  NormalizedVariant,
  ProductURL,
} from "@/lib/scrapers/adapter"
import { discoverProductsViaSitemap } from "@/lib/scrapers/discovery/sitemap"

// ─── Constants ──────────────────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
const NAVIGATION_TIMEOUT_MS = 30_000
const JS_SETTLE_MS = 1_500
const MAX_PRODUCTS = 500
const MAX_CRAWL_LINKS = 200
const DELAY_BETWEEN_REQUESTS_MS = 1_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── JSON-LD types ──────────────────────────────────────────────

interface JsonLdProduct {
  "@type"?: string | string[]
  "@id"?: string
  name?: string
  url?: string
  description?: string
  image?: string | string[] | { url?: string }[]
  brand?: string | { name?: string }
  category?: string
  sku?: string
  productID?: string
  gtin?: string
  datePublished?: string
  offers?:
    | JsonLdOffer
    | JsonLdOffer[]
    | { "@type"?: string; offers?: JsonLdOffer[] }
  hasVariant?: JsonLdProduct[]
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

// ─── Raw payload type ───────────────────────────────────────────

interface GenericProductPayload {
  url: string
  html: string
  jsonLd: JsonLdProduct | null
  htmlData: HtmlExtractedData | null
}

interface HtmlExtractedData {
  title: string | null
  price: string | null
  compareAtPrice: string | null
  currency: string | null
  isAvailable: boolean
  description: string | null
  images: string[]
  variantLabels: string[]
}

// ─── JSON-LD extraction with Cheerio ────────────────────────────

function extractJsonLd(html: string): JsonLdProduct | null {
  const $ = cheerio.load(html)
  const products: JsonLdProduct[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text())
      collectProducts(data, products)
    } catch {
      // Invalid JSON — skip
    }
  })

  return products[0] ?? null
}

function collectProducts(data: unknown, results: JsonLdProduct[]): void {
  if (!data || typeof data !== "object") return

  if (Array.isArray(data)) {
    for (const item of data) {
      collectProducts(item, results)
    }
    return
  }

  const obj = data as Record<string, unknown>
  const type = obj["@type"]
  const isProduct =
    type === "Product" || (Array.isArray(type) && type.includes("Product"))

  if (isProduct) {
    results.push(obj as unknown as JsonLdProduct)
    return
  }

  // Traverse @graph arrays (common in schema.org)
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"] as unknown[]) {
      collectProducts(item, results)
    }
  }

  // Traverse mainEntity
  if (obj["mainEntity"]) {
    collectProducts(obj["mainEntity"], results)
  }
}

// ─── HTML fallback extraction with Cheerio ──────────────────────

function extractFromHtml(html: string, pageUrl: string): HtmlExtractedData {
  const $ = cheerio.load(html)

  // ── Title ──
  const title =
    $('h1[itemprop="name"]').first().text().trim() ||
    $("h1.product-title, h1.product_title, h1.product-name").first().text().trim() ||
    $('[data-testid="product-title"]').first().text().trim() ||
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    null

  // ── Price ──
  const priceSelectors = [
    '[itemprop="price"]',
    '[data-price]',
    ".price .amount",
    ".product-price",
    ".current-price",
    ".sale-price",
    ".price--sale",
    ".price-current",
    '[class*="price"]:not([class*="compare"]):not([class*="original"]):not([class*="was"])',
  ]

  let price: string | null = null
  for (const sel of priceSelectors) {
    const el = $(sel).first()
    if (el.length) {
      price = el.attr("content") || el.attr("data-price") || el.text().trim()
      if (price) break
    }
  }

  // ── Compare-at price ──
  const compareSelectors = [
    '[itemprop="highPrice"]',
    ".price--compare",
    ".compare-at-price",
    ".original-price",
    ".was-price",
    '[class*="price"][class*="original"]',
    '[class*="price"][class*="was"]',
    "del .amount",
    "s .amount",
  ]

  let compareAtPrice: string | null = null
  for (const sel of compareSelectors) {
    const el = $(sel).first()
    if (el.length) {
      compareAtPrice = el.attr("content") || el.text().trim()
      if (compareAtPrice) break
    }
  }

  // ── Currency ──
  const currency =
    $('[itemprop="priceCurrency"]').attr("content") ||
    $('meta[property="product:price:currency"]').attr("content") ||
    guessCurrencyFromText(price) ||
    null

  // ── Availability ──
  const availabilityAttr =
    $('[itemprop="availability"]').attr("content") ||
    $('[itemprop="availability"]').attr("href") ||
    ""
  const hasAddToCart =
    $(
      '[data-action="add-to-cart"], button[name="add"], .add-to-cart, #add-to-cart, [class*="add-to-cart"], [class*="addToCart"]'
    ).length > 0
  const outOfStockText = /out\s*of\s*stock|sold\s*out|unavailable|agotado|no\s*disponible/i.test(
    $("body").text()
  )
  const isAvailable =
    availabilityAttr.toLowerCase().includes("instock") ||
    (!availabilityAttr && hasAddToCart && !outOfStockText)

  // ── Description ──
  const description =
    $('[itemprop="description"]').first().html()?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    null

  // ── Images ──
  const images: string[] = []
  const ogImage = $('meta[property="og:image"]').attr("content")
  if (ogImage) images.push(resolveUrl(ogImage, pageUrl))

  $('[itemprop="image"]').each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("content") || $(el).attr("href")
    if (src) images.push(resolveUrl(src, pageUrl))
  })

  $(".product-image img, .product-gallery img, [data-gallery] img, .product-photos img").each(
    (_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src")
      if (src) images.push(resolveUrl(src, pageUrl))
    }
  )

  // ── Variant labels (simple heuristic) ──
  const variantLabels: string[] = []
  $(
    'select[name*="option"], select[name*="variant"], select[data-option], [data-variant-option]'
  ).each((_, el) => {
    $(el)
      .find("option")
      .each((__, opt) => {
        const label = $(opt).text().trim()
        if (label && !label.toLowerCase().includes("select") && !label.startsWith("--")) {
          variantLabels.push(label)
        }
      })
  })

  // Also check swatch buttons
  $(
    '[class*="swatch"] button, [class*="swatch"] a, [class*="variant"] button, [data-option-value]'
  ).each((_, el) => {
    const label =
      $(el).attr("data-option-value") ||
      $(el).attr("title") ||
      $(el).text().trim()
    if (label) variantLabels.push(label)
  })

  return {
    title,
    price: cleanPrice(price),
    compareAtPrice: cleanPrice(compareAtPrice),
    currency: currency ? currency.replace(/[^A-Z]/g, "").slice(0, 3) || null : null,
    isAvailable,
    description,
    images: [...new Set(images)],
    variantLabels: [...new Set(variantLabels)],
  }
}

function resolveUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href
  } catch {
    return src
  }
}

function cleanPrice(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d.,]/g, "").trim()
  return cleaned || null
}

function guessCurrencyFromText(text: string | null): string | null {
  if (!text) return null
  if (text.includes("$")) return "USD"
  if (text.includes("€")) return "EUR"
  if (text.includes("£")) return "GBP"
  if (text.includes("¥")) return "JPY"
  return null
}

// ─── URL helpers ────────────────────────────────────────────────

function extractHandle(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const segments = pathname.split("/").filter(Boolean)
    return segments[segments.length - 1] ?? pathname.replace(/\//g, "-")
  } catch {
    return url.replace(/[^a-z0-9]/gi, "-").toLowerCase()
  }
}

function generateId(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  } catch {
    return url.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-")
  }
}

const PRODUCT_PATH_PATTERNS = [
  /\/product[s]?\//i,
  /\/p\//i,
  /\/item[s]?\//i,
  /\/shop\/.+\/.+/i,
  /\/catalog\/.+\/.+/i,
  /\/producto[s]?\//i,
  /\/-p-\d+/i,
  /\/dp\//i,
]

function looksLikeProductUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return PRODUCT_PATH_PATTERNS.some((pat) => pat.test(path))
  } catch {
    return false
  }
}

// ─── JSON-LD normalization ──────────────────────────────────────

function normalizeJsonLdOffers(offers: JsonLdProduct["offers"]): JsonLdOffer[] {
  if (!offers) return []
  if (Array.isArray(offers)) return offers
  if (typeof offers === "object" && "offers" in offers && Array.isArray(offers.offers))
    return offers.offers
  return [offers as JsonLdOffer]
}

function normalizeJsonLdImages(image: JsonLdProduct["image"], baseUrl: string): string[] {
  if (!image) return []
  if (typeof image === "string") return [resolveUrl(image, baseUrl)]
  if (Array.isArray(image)) {
    return image
      .map((img) =>
        typeof img === "string" ? resolveUrl(img, baseUrl) : img.url ? resolveUrl(img.url, baseUrl) : null
      )
      .filter((u): u is string => u !== null)
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

function brandName(brand: JsonLdProduct["brand"]): string | null {
  if (!brand) return null
  if (typeof brand === "string") return brand
  if (typeof brand === "object" && "name" in brand) return brand.name ?? null
  return null
}

function offerToVariant(
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

function buildVariantsFromSchema(
  jsonLd: JsonLdProduct,
  htmlData: HtmlExtractedData | null
): NormalizedVariant[] {
  // 1. Check hasVariant (schema.org ProductGroup pattern)
  if (jsonLd.hasVariant && jsonLd.hasVariant.length > 0) {
    return jsonLd.hasVariant.map((variant, i) => {
      const offers = normalizeJsonLdOffers(variant.offers)
      const offer = offers[0]
      return {
        externalId: variant.sku ?? variant.productID ?? variant["@id"] ?? `variant-${i}`,
        title: variant.name ?? `Variant ${i + 1}`,
        sku: variant.sku ?? null,
        option1: variant.name ?? null,
        option2: null,
        option3: null,
        price: offer
          ? {
              price: String(offer.price ?? "0"),
              compareAtPrice: null,
              currency: offer.priceCurrency ?? null,
            }
          : { price: "0", compareAtPrice: null, currency: null },
        isAvailable: offer ? availabilityFromSchema(offer.availability) : true,
        inventoryQuantity: null,
        weight: null,
        weightUnit: null,
      }
    })
  }

  // 2. Multiple offers → treat each as a variant
  const offers = normalizeJsonLdOffers(jsonLd.offers)
  if (offers.length > 1) {
    return offers.map((offer, i) => offerToVariant(offer, i, jsonLd))
  }

  // 3. Single offer but HTML detected variant labels → synthesize variants
  if (htmlData && htmlData.variantLabels.length > 1) {
    const offer = offers[0]
    return htmlData.variantLabels.map((label, i) => ({
      externalId: `variant-${i}`,
      title: label,
      sku: null,
      option1: label,
      option2: null,
      option3: null,
      price: offer
        ? {
            price: String(offer.price ?? "0"),
            compareAtPrice: null,
            currency: offer.priceCurrency ?? null,
          }
        : {
            price: htmlData.price ?? "0",
            compareAtPrice: htmlData.compareAtPrice ?? null,
            currency: htmlData.currency ?? null,
          },
      isAvailable: offer ? availabilityFromSchema(offer.availability) : htmlData.isAvailable,
      inventoryQuantity: null,
      weight: null,
      weightUnit: null,
    }))
  }

  // 4. Single variant from the single offer
  const offer = offers[0]
  return [
    {
      externalId: jsonLd.sku ?? jsonLd.productID ?? "default",
      title: jsonLd.name ?? "Default",
      sku: jsonLd.sku ?? null,
      option1: null,
      option2: null,
      option3: null,
      price: offer
        ? {
            price: String(offer.price ?? "0"),
            compareAtPrice: null,
            currency: offer.priceCurrency ?? null,
          }
        : { price: "0", compareAtPrice: null, currency: null },
      isAvailable: offer ? availabilityFromSchema(offer.availability) : true,
      inventoryQuantity: null,
      weight: null,
      weightUnit: null,
    },
  ]
}

// ─── Browser helpers ────────────────────────────────────────────

async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true })
  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

async function renderPage(url: string, browser: Browser): Promise<string> {
  const page = await browser.newPage({
    userAgent: USER_AGENT,
  })
  try {
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS)
    await page.goto(url, { waitUntil: "domcontentloaded" })
    // Allow JS to settle (SPA hydration, dynamic content)
    await sleep(JS_SETTLE_MS)
    return await page.content()
  } finally {
    await page.close()
  }
}

// ─── Link crawling fallback for discovery ───────────────────────

async function crawlHomepageForProductLinks(
  domain: string,
  browser: Browser
): Promise<string[]> {
  const productUrls = new Set<string>()
  const page = await browser.newPage({ userAgent: USER_AGENT })
  try {
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS)
    await page.goto(`https://${domain}`, { waitUntil: "domcontentloaded" })
    await sleep(JS_SETTLE_MS)

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => href.startsWith("http"))
    )

    for (const link of links) {
      try {
        const u = new URL(link)
        if (u.hostname === domain && looksLikeProductUrl(link)) {
          productUrls.add(link)
          if (productUrls.size >= MAX_CRAWL_LINKS) break
        }
      } catch {
        // Skip invalid URLs
      }
    }
  } finally {
    await page.close()
  }

  return Array.from(productUrls)
}

// ─── GenericAdapter ─────────────────────────────────────────────

export class GenericAdapter implements StoreAdapter {
  readonly platform = "GENERIC" as const

  async discoverProducts(domain: string): Promise<ProductURL[]> {
    // 1. Try sitemap-based discovery first (fast, no browser needed)
    const sitemapResults = await discoverProductsViaSitemap(domain)

    if (sitemapResults.length > 0) {
      return sitemapResults
    }

    // 2. Fallback: crawl homepage with Playwright for JS-rendered links
    const crawled = await withBrowser((browser) =>
      crawlHomepageForProductLinks(domain, browser)
    )

    return crawled.map((url) => ({
      url,
      handle: extractHandle(url),
    }))
  }

  async fetchProduct(url: string): Promise<GenericProductPayload> {
    // Use Playwright to render JS, then parse with Cheerio
    const html = await withBrowser((browser) => renderPage(url, browser))

    const jsonLd = extractJsonLd(html)
    const htmlData = extractFromHtml(html, url)

    return { url, html, jsonLd, htmlData }
  }

  parseProduct(payload: unknown): NormalizedProduct {
    const { url, html, jsonLd, htmlData } = payload as GenericProductPayload
    const handle = extractHandle(url)

    if (jsonLd) {
      return this.parseFromJsonLd(jsonLd, url, handle, htmlData)
    }

    if (htmlData) {
      return this.parseFromHtml(htmlData, url, handle)
    }

    // Absolute fallback
    return {
      externalId: generateId(url),
      title: handle,
      handle,
      productType: null,
      vendor: null,
      tags: [],
      bodyHtml: null,
      publishedAt: null,
      imageUrl: null,
      imageUrls: [],
      variants: [
        {
          externalId: "default",
          title: "Default",
          sku: null,
          option1: null,
          option2: null,
          option3: null,
          price: { price: "0", compareAtPrice: null, currency: null },
          isAvailable: false,
          inventoryQuantity: null,
          weight: null,
          weightUnit: null,
        },
      ],
      confidence: 0.1,
    }
  }

  parseVariants(payload: unknown): NormalizedVariant[] {
    const { jsonLd, htmlData } = payload as GenericProductPayload

    if (jsonLd) {
      return buildVariantsFromSchema(jsonLd, htmlData)
    }

    if (htmlData) {
      // Check if HTML heuristics found variant labels
      if (htmlData.variantLabels.length > 1) {
        return htmlData.variantLabels.map((label, i) => ({
          externalId: `variant-${i}`,
          title: label,
          sku: null,
          option1: label,
          option2: null,
          option3: null,
          price: {
            price: htmlData.price ?? "0",
            compareAtPrice: htmlData.compareAtPrice ?? null,
            currency: htmlData.currency ?? null,
          },
          isAvailable: htmlData.isAvailable,
          inventoryQuantity: null,
          weight: null,
          weightUnit: null,
        }))
      }

      // Single default variant
      return [
        {
          externalId: "default",
          title: "Default",
          sku: null,
          option1: null,
          option2: null,
          option3: null,
          price: {
            price: htmlData.price ?? "0",
            compareAtPrice: htmlData.compareAtPrice ?? null,
            currency: htmlData.currency ?? null,
          },
          isAvailable: htmlData.isAvailable,
          inventoryQuantity: null,
          weight: null,
          weightUnit: null,
        },
      ]
    }

    return []
  }

  async fetchAllProducts(
    domain: string,
    onProgress?: (count: number) => void
  ): Promise<NormalizedProduct[]> {
    const urls = await this.discoverProducts(domain)
    const products: NormalizedProduct[] = []
    const limit = Math.min(urls.length, MAX_PRODUCTS)

    // Share a single browser instance for efficiency
    await withBrowser(async (browser) => {
      for (let i = 0; i < limit; i++) {
        try {
          const html = await renderPage(urls[i].url, browser)
          const jsonLd = extractJsonLd(html)
          const htmlData = extractFromHtml(html, urls[i].url)
          const payload: GenericProductPayload = {
            url: urls[i].url,
            html,
            jsonLd,
            htmlData,
          }

          products.push(this.parseProduct(payload))
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
    })

    return products
  }

  // ─── Private helpers ──────────────────────────────────────────

  private parseFromJsonLd(
    jsonLd: JsonLdProduct,
    url: string,
    handle: string,
    htmlData: HtmlExtractedData | null
  ): NormalizedProduct {
    const images = normalizeJsonLdImages(jsonLd.image, url)
    // Supplement with HTML-extracted images if JSON-LD has none
    const allImages = images.length > 0 ? images : (htmlData?.images ?? [])
    const variants = buildVariantsFromSchema(jsonLd, htmlData)

    return {
      externalId: jsonLd.productID ?? jsonLd.sku ?? generateId(url),
      title: jsonLd.name ?? htmlData?.title ?? handle,
      handle,
      productType: jsonLd.category ?? null,
      vendor: brandName(jsonLd.brand),
      tags: [],
      bodyHtml: jsonLd.description ?? htmlData?.description ?? null,
      publishedAt: jsonLd.datePublished ? new Date(jsonLd.datePublished) : null,
      imageUrl: allImages[0] ?? null,
      imageUrls: allImages,
      variants,
      confidence: 0.6,
    }
  }

  private parseFromHtml(
    data: HtmlExtractedData,
    url: string,
    handle: string
  ): NormalizedProduct {
    // Build variants from HTML heuristics
    let variants: NormalizedVariant[]

    if (data.variantLabels.length > 1) {
      variants = data.variantLabels.map((label, i) => ({
        externalId: `variant-${i}`,
        title: label,
        sku: null,
        option1: label,
        option2: null,
        option3: null,
        price: {
          price: data.price ?? "0",
          compareAtPrice: data.compareAtPrice ?? null,
          currency: data.currency ?? null,
        },
        isAvailable: data.isAvailable,
        inventoryQuantity: null,
        weight: null,
        weightUnit: null,
      }))
    } else {
      variants = [
        {
          externalId: "default",
          title: "Default",
          sku: null,
          option1: null,
          option2: null,
          option3: null,
          price: {
            price: data.price ?? "0",
            compareAtPrice: data.compareAtPrice ?? null,
            currency: data.currency ?? null,
          },
          isAvailable: data.isAvailable,
          inventoryQuantity: null,
          weight: null,
          weightUnit: null,
        },
      ]
    }

    return {
      externalId: generateId(url),
      title: data.title ?? handle,
      handle,
      productType: null,
      vendor: null,
      tags: [],
      bodyHtml: data.description ?? null,
      publishedAt: null,
      imageUrl: data.images[0] ?? null,
      imageUrls: data.images,
      variants,
      confidence: 0.4,
    }
  }
}
