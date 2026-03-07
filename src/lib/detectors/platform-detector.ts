/**
 * Platform Detector — analiza un dominio y retorna la plataforma ecommerce
 * con un score de confianza basado en señales detectadas.
 *
 * Plataformas soportadas: Shopify, WooCommerce, Magento, BigCommerce, Generic
 */

export type PlatformType =
  | "SHOPIFY"
  | "WOOCOMMERCE"
  | "MAGENTO"
  | "BIGCOMMERCE"
  | "GENERIC"

export interface DetectionSignal {
  type: "cdn" | "script" | "meta" | "css" | "endpoint" | "header" | "cookie"
  platform: PlatformType
  description: string
  weight: number
}

export interface PlatformDetectionResult {
  platform: PlatformType
  confidence: number
  signals: DetectionSignal[]
}

const USER_AGENT = "Mozilla/5.0 (compatible; Particula/1.0)"
const TIMEOUT_MS = 10_000

/**
 * Fetch the HTML content of a domain's homepage.
 * Returns { html, headers } or null on failure.
 */
async function fetchHomepage(
  domain: string
): Promise<{ html: string; headers: Headers } | null> {
  try {
    const res = await fetch(`https://${domain}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    })
    if (!res.ok) return null
    const html = await res.text()
    return { html, headers: res.headers }
  } catch {
    return null
  }
}

/**
 * Check if the Shopify /products.json endpoint responds.
 */
async function probeShopifyEndpoint(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}/products.json?limit=1`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data?.products)
  } catch {
    return false
  }
}

/**
 * Check if the WooCommerce REST API endpoint responds.
 */
async function probeWooCommerceEndpoint(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}/wp-json/wc/v3/`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // WooCommerce API returns 401 (unauthorized) or 200 when present
    return res.status === 200 || res.status === 401
  } catch {
    return false
  }
}

// ─── Signal detection rules ─────────────────────────────────────

const SHOPIFY_SIGNALS: Array<{
  test: (html: string, headers: Headers) => boolean
  signal: Omit<DetectionSignal, "platform">
}> = [
  {
    test: (html) => html.includes("cdn.shopify.com"),
    signal: {
      type: "cdn",
      description: "cdn.shopify.com found in HTML",
      weight: 0.3,
    },
  },
  {
    test: (html) => html.includes("Shopify.theme"),
    signal: {
      type: "script",
      description: "Shopify.theme JS object reference found",
      weight: 0.25,
    },
  },
  {
    test: (html) => html.includes("shopify-payment-button"),
    signal: {
      type: "css",
      description: "shopify-payment-button class found",
      weight: 0.2,
    },
  },
  {
    test: (html) => /\/products\/[^"'\s]+\.js/.test(html),
    signal: {
      type: "script",
      description: "/products/*.js script pattern found",
      weight: 0.15,
    },
  },
  {
    test: (_html, headers) =>
      headers.get("x-shopify-stage") !== null ||
      headers.get("x-sorting-hat-shopid") !== null,
    signal: {
      type: "header",
      description: "Shopify-specific HTTP header detected",
      weight: 0.3,
    },
  },
  {
    test: (html) => html.includes("myshopify.com"),
    signal: {
      type: "cdn",
      description: "myshopify.com reference found",
      weight: 0.2,
    },
  },
]

const WOOCOMMERCE_SIGNALS: Array<{
  test: (html: string, headers: Headers) => boolean
  signal: Omit<DetectionSignal, "platform">
}> = [
  {
    test: (html) => html.includes("wp-content/plugins/woocommerce"),
    signal: {
      type: "script",
      description: "WooCommerce plugin path found in HTML",
      weight: 0.35,
    },
  },
  {
    test: (html) =>
      /class="[^"]*woocommerce[^"]*"/.test(html) ||
      /class="[^"]*wc-block[^"]*"/.test(html),
    signal: {
      type: "css",
      description: "WooCommerce CSS classes detected",
      weight: 0.25,
    },
  },
  {
    test: (html) =>
      html.includes('name="generator"') && html.includes("WooCommerce"),
    signal: {
      type: "meta",
      description: "WooCommerce meta generator tag found",
      weight: 0.3,
    },
  },
  {
    test: (html) => html.includes("wp-content") || html.includes("wp-includes"),
    signal: {
      type: "script",
      description: "WordPress file structure detected (wp-content/wp-includes)",
      weight: 0.1,
    },
  },
]

const MAGENTO_SIGNALS: Array<{
  test: (html: string, headers: Headers) => boolean
  signal: Omit<DetectionSignal, "platform">
}> = [
  {
    test: (html) => html.includes("Magento_Ui"),
    signal: {
      type: "script",
      description: "Magento_Ui module reference found",
      weight: 0.35,
    },
  },
  {
    test: (html) => html.includes("mage/") || html.includes("mage-init"),
    signal: {
      type: "script",
      description: "Magento mage/ scripts or mage-init found",
      weight: 0.3,
    },
  },
  {
    test: (html) => html.includes("catalog/product/view"),
    signal: {
      type: "endpoint",
      description: "Magento catalog/product/view URL pattern found",
      weight: 0.2,
    },
  },
  {
    test: (_html, headers) =>
      headers.get("x-magento-vary") !== null ||
      headers.get("x-magento-cache-debug") !== null,
    signal: {
      type: "header",
      description: "Magento-specific HTTP header detected",
      weight: 0.3,
    },
  },
]

const BIGCOMMERCE_SIGNALS: Array<{
  test: (html: string, headers: Headers) => boolean
  signal: Omit<DetectionSignal, "platform">
}> = [
  {
    test: (html) => html.includes("cdn.bcapp"),
    signal: {
      type: "cdn",
      description: "BigCommerce CDN (cdn.bcapp) found",
      weight: 0.35,
    },
  },
  {
    test: (html) => html.toLowerCase().includes("bigcommerce"),
    signal: {
      type: "meta",
      description: "BigCommerce string found in HTML",
      weight: 0.25,
    },
  },
  {
    test: (html) => html.includes("stencil-") || html.includes("/stencil/"),
    signal: {
      type: "script",
      description: "BigCommerce Stencil framework references found",
      weight: 0.25,
    },
  },
  {
    test: (_html, headers) =>
      (headers.get("x-bc-store-version") ?? "") !== "",
    signal: {
      type: "header",
      description: "BigCommerce store version header detected",
      weight: 0.3,
    },
  },
]

// ─── Core detection logic ────────────────────────────────────────

function evaluateSignals(
  html: string,
  headers: Headers,
  rules: Array<{
    test: (html: string, headers: Headers) => boolean
    signal: Omit<DetectionSignal, "platform">
  }>,
  platform: PlatformType
): DetectionSignal[] {
  const detected: DetectionSignal[] = []
  for (const rule of rules) {
    try {
      if (rule.test(html, headers)) {
        detected.push({ ...rule.signal, platform })
      }
    } catch {
      // Skip failing rules silently
    }
  }
  return detected
}

function calculateConfidence(signals: DetectionSignal[]): number {
  if (signals.length === 0) return 0
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
  // Cap at 1.0
  return Math.min(1, totalWeight)
}

/**
 * Detecta la plataforma ecommerce de un dominio.
 *
 * Analiza señales en el HTML, headers HTTP, y endpoints conocidos
 * para determinar la plataforma con un score de confianza.
 */
export async function detectPlatform(
  domain: string
): Promise<PlatformDetectionResult> {
  const page = await fetchHomepage(domain)

  if (!page) {
    return {
      platform: "GENERIC",
      confidence: 0,
      signals: [],
    }
  }

  const { html, headers } = page

  // Evaluate signals for each platform
  const shopifySignals = evaluateSignals(html, headers, SHOPIFY_SIGNALS, "SHOPIFY")
  const wooSignals = evaluateSignals(html, headers, WOOCOMMERCE_SIGNALS, "WOOCOMMERCE")
  const magentoSignals = evaluateSignals(html, headers, MAGENTO_SIGNALS, "MAGENTO")
  const bigcommerceSignals = evaluateSignals(html, headers, BIGCOMMERCE_SIGNALS, "BIGCOMMERCE")

  // Probe specific endpoints in parallel for the top candidates
  const [shopifyEndpoint, wooEndpoint] = await Promise.all([
    shopifySignals.length > 0 ? probeShopifyEndpoint(domain) : Promise.resolve(false),
    wooSignals.length > 0 ? probeWooCommerceEndpoint(domain) : Promise.resolve(false),
  ])

  if (shopifyEndpoint) {
    shopifySignals.push({
      type: "endpoint",
      platform: "SHOPIFY",
      description: "/products.json endpoint responded with valid data",
      weight: 0.35,
    })
  }

  if (wooEndpoint) {
    wooSignals.push({
      type: "endpoint",
      platform: "WOOCOMMERCE",
      description: "/wp-json/wc/v3/ endpoint responded",
      weight: 0.3,
    })
  }

  // Calculate confidence per platform
  const candidates: Array<{
    platform: PlatformType
    confidence: number
    signals: DetectionSignal[]
  }> = [
    {
      platform: "SHOPIFY",
      confidence: calculateConfidence(shopifySignals),
      signals: shopifySignals,
    },
    {
      platform: "WOOCOMMERCE",
      confidence: calculateConfidence(wooSignals),
      signals: wooSignals,
    },
    {
      platform: "MAGENTO",
      confidence: calculateConfidence(magentoSignals),
      signals: magentoSignals,
    },
    {
      platform: "BIGCOMMERCE",
      confidence: calculateConfidence(bigcommerceSignals),
      signals: bigcommerceSignals,
    },
  ]

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence)

  const best = candidates[0]

  // If the best candidate has meaningful confidence, return it
  if (best.confidence >= 0.3) {
    return {
      platform: best.platform,
      confidence: Math.round(best.confidence * 100) / 100,
      signals: best.signals,
    }
  }

  // Fallback to Generic — collect all signals for debugging
  const allSignals = [
    ...shopifySignals,
    ...wooSignals,
    ...magentoSignals,
    ...bigcommerceSignals,
  ]

  return {
    platform: "GENERIC",
    confidence: Math.round(Math.max(best.confidence, 0.1) * 100) / 100,
    signals: allSignals,
  }
}
