/**
 * Descubrimiento de productos vía Sitemap
 *
 * Módulo de descubrimiento de URLs de productos usando sitemap.xml.
 * Útil como fallback universal cuando no hay API disponible.
 *
 * Soporta:
 * - sitemap.xml estándar (<urlset>)
 * - Sitemap index (<sitemapindex>) con referencias a otros sitemaps
 * - Sitemaps comprimidos con gzip (.xml.gz)
 * - Filtrado heurístico de URLs de productos
 */

import type { ProductURL } from "@/lib/scrapers/adapter"
import { resilientFetch, getRandomUserAgent } from "@/lib/scrapers/http-client"

// ─── Constants ──────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 15_000
const MAX_SITEMAPS_TO_FOLLOW = 50
const MAX_URLS = 50_000

/** URL path segments that strongly suggest a product page */
const PRODUCT_PATH_PATTERNS = [
  "/products/",
  "/product/",
  "/shop/",
  "/p/",
  "/catalog/",
  "/item/",
  "/producto/",
  "/productos/",
  "/dp/",          // Amazon-style
  "/gp/product/",  // Amazon-style
]

/** Sitemap filenames to try when robots.txt doesn't help */
const SITEMAP_CANDIDATES = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap_products_1.xml",
  "/sitemap_products.xml",
  "/sitemap1.xml",
]

// ─── XML parsing helpers ────────────────────────────────────────

/**
 * Extract all text contents from a specific XML tag using regex.
 * Works well for the simple, flat structure of sitemaps.
 */
function extractTagValues(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>\\s*(.*?)\\s*</${tagName}>`, "gs")
  const values: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    const value = match[1].trim()
    if (value) {
      values.push(value)
    }
  }
  return values
}

/**
 * Determine if an XML string is a sitemap index (contains <sitemapindex>).
 */
function isSitemapIndex(xml: string): boolean {
  return xml.includes("<sitemapindex")
}

// ─── URL classification ─────────────────────────────────────────

/**
 * Check whether a URL looks like a product page using path heuristics.
 */
function looksLikeProductUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    const path = parsed.pathname.toLowerCase()

    // Match any known product path pattern
    return PRODUCT_PATH_PATTERNS.some((pattern) => path.includes(pattern))
  } catch {
    return false
  }
}

/**
 * Try to extract a product handle (slug) from a URL.
 * For example: https://store.com/products/blue-shirt → "blue-shirt"
 */
function extractHandle(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl)
    const path = parsed.pathname

    // Try common patterns: /products/<handle>, /product/<handle>, /p/<handle>, etc.
    const handlePatterns = [
      /\/products\/([^/?#]+)/i,
      /\/product\/([^/?#]+)/i,
      /\/shop\/([^/?#]+)/i,
      /\/p\/([^/?#]+)/i,
      /\/item\/([^/?#]+)/i,
      /\/producto\/([^/?#]+)/i,
      /\/productos\/([^/?#]+)/i,
      /\/catalog\/[^/]+\/([^/?#]+)/i,
    ]

    for (const pattern of handlePatterns) {
      const match = path.match(pattern)
      if (match?.[1]) {
        return match[1]
      }
    }
  } catch {
    // invalid URL
  }
  return undefined
}

// ─── HTTP helpers ───────────────────────────────────────────────

/**
 * Fetch a URL with timeout. Returns the response body as text.
 * Handles gzipped content automatically (fetch decompresses by default).
 */
async function fetchText(url: string): Promise<string> {
  const response = await resilientFetch(url, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    headers: {
      "User-Agent": getRandomUserAgent(),
      Accept: "application/xml, text/xml, */*",
      "Accept-Encoding": "gzip, deflate",
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }

  return await response.text()
}

/**
 * Try to find sitemap URLs from robots.txt.
 */
async function getSitemapUrlsFromRobots(domain: string): Promise<string[]> {
  try {
    const robotsUrl = `https://${domain}/robots.txt`
    const text = await fetchText(robotsUrl)

    const sitemapUrls: string[] = []
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.toLowerCase().startsWith("sitemap:")) {
        const url = trimmed.slice("sitemap:".length).trim()
        if (url) {
          sitemapUrls.push(url)
        }
      }
    }
    return sitemapUrls
  } catch {
    return []
  }
}

// ─── Core sitemap processing ────────────────────────────────────

/**
 * Fetch and parse a single sitemap, returning all <loc> URLs.
 * If the sitemap is an index, recursively fetches child sitemaps.
 */
async function processSitemap(
  url: string,
  visited: Set<string>,
  depth: number = 0
): Promise<string[]> {
  // Guard against infinite loops and excessive crawling
  if (visited.has(url) || visited.size >= MAX_SITEMAPS_TO_FOLLOW || depth > 5) {
    return []
  }
  visited.add(url)

  let xml: string
  try {
    xml = await fetchText(url)
  } catch {
    return []
  }

  if (isSitemapIndex(xml)) {
    // It's an index — extract child sitemap URLs and process them
    const childUrls = extractTagValues(xml, "loc")

    // Prioritise product-specific sitemaps
    const sorted = childUrls.sort((a, b) => {
      const aIsProduct = /product/i.test(a) ? 0 : 1
      const bIsProduct = /product/i.test(b) ? 0 : 1
      return aIsProduct - bIsProduct
    })

    const allUrls: string[] = []
    for (const childUrl of sorted) {
      if (allUrls.length >= MAX_URLS) break
      const urls = await processSitemap(childUrl, visited, depth + 1)
      allUrls.push(...urls)
    }
    return allUrls
  }

  // Regular sitemap — extract all <loc> values
  return extractTagValues(xml, "loc")
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Discover product URLs from a domain by parsing its sitemap(s).
 *
 * Strategy:
 * 1. Check robots.txt for declared sitemaps
 * 2. Fall back to well-known sitemap paths
 * 3. Parse sitemap index files recursively
 * 4. Filter URLs that look like product pages
 *
 * @param domain - The domain to crawl (e.g. "example.com")
 * @returns Array of discovered product URLs
 */
export async function discoverProductsViaSitemap(
  domain: string
): Promise<ProductURL[]> {
  const visited = new Set<string>()
  let allPageUrls: string[] = []

  // Step 1: Try robots.txt for sitemap declarations
  const robotsSitemaps = await getSitemapUrlsFromRobots(domain)

  if (robotsSitemaps.length > 0) {
    for (const sitemapUrl of robotsSitemaps) {
      if (allPageUrls.length >= MAX_URLS) break
      const urls = await processSitemap(sitemapUrl, visited)
      allPageUrls.push(...urls)
    }
  }

  // Step 2: If nothing found, try common sitemap paths
  if (allPageUrls.length === 0) {
    for (const path of SITEMAP_CANDIDATES) {
      if (allPageUrls.length >= MAX_URLS) break
      const url = `https://${domain}${path}`
      const urls = await processSitemap(url, visited)
      allPageUrls.push(...urls)

      // If we found URLs from the first working sitemap, no need to try others
      // (unless it was an index that already expanded)
      if (urls.length > 0) break
    }
  }

  // Step 3: Deduplicate
  allPageUrls = [...new Set(allPageUrls)]

  // Step 4: Filter for product-like URLs and map to ProductURL
  const productUrls: ProductURL[] = allPageUrls
    .filter(looksLikeProductUrl)
    .slice(0, MAX_URLS)
    .map((url) => {
      const handle = extractHandle(url)
      return {
        url,
        ...(handle ? { handle } : {}),
      }
    })

  return productUrls
}
