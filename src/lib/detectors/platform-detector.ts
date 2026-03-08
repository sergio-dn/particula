// ---------------------------------------------------------------------------
// platform-detector.ts — Multi-platform ecommerce detection module
// ---------------------------------------------------------------------------

export type PlatformType =
  | "SHOPIFY"
  | "WOOCOMMERCE"
  | "MAGENTO"
  | "BIGCOMMERCE"
  | "GENERIC";

export interface DetectionSignal {
  signal: string;
  weight: number;
  found: boolean;
}

export interface PlatformDetectionResult {
  platform: PlatformType;
  confidence: number;
  signals: DetectionSignal[];
  allResults: Array<{ platform: PlatformType; confidence: number }>;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SubDetectorResult {
  platform: PlatformType;
  confidence: number;
  signals: DetectionSignal[];
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeFetch(
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    return response;
  } catch (error) {
    console.log(
      `[detector] safeFetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Confidence helper
// ---------------------------------------------------------------------------

function computeConfidence(signals: DetectionSignal[]): number {
  return signals.reduce(
    (sum, s) => sum + s.weight * (s.found ? 1 : 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Sub-detectors
// ---------------------------------------------------------------------------

async function detectShopify(
  html: string,
  _headers: Headers,
  domain: string,
): Promise<SubDetectorResult> {
  const htmlLower = html.toLowerCase();

  // Signal 1 — cdn.shopify.com in HTML
  const hasCdn = htmlLower.includes("cdn.shopify.com");

  // Signal 2 — /products.json endpoint returns valid Shopify JSON
  let hasProductsJson = false;
  try {
    const resp = await safeFetch(
      `https://${domain}/products.json?limit=1`,
      10_000,
    );
    if (resp && resp.ok) {
      const body = await resp.text();
      try {
        const json = JSON.parse(body) as Record<string, unknown>;
        hasProductsJson = Array.isArray(json.products);
      } catch {
        // not valid JSON
      }
    }
  } catch {
    // ignore
  }

  // Signal 3 — Shopify.theme or Shopify.shop JS variables
  const hasShopifyJs =
    html.includes("Shopify.theme") || html.includes("Shopify.shop");

  // Signal 4 — shopify-payment-button or shopify-buy
  const hasPaymentButton =
    htmlLower.includes("shopify-payment-button") ||
    htmlLower.includes("shopify-buy");

  const signals: DetectionSignal[] = [
    { signal: "cdn.shopify.com in HTML", weight: 0.35, found: hasCdn },
    {
      signal: "/products.json returns valid Shopify JSON",
      weight: 0.3,
      found: hasProductsJson,
    },
    {
      signal: "Shopify.theme or Shopify.shop in HTML",
      weight: 0.2,
      found: hasShopifyJs,
    },
    {
      signal: "shopify-payment-button or shopify-buy in HTML",
      weight: 0.15,
      found: hasPaymentButton,
    },
  ];

  return {
    platform: "SHOPIFY",
    confidence: computeConfidence(signals),
    signals,
  };
}

function detectWooCommerce(
  html: string,
  _headers: Headers,
): SubDetectorResult {
  const htmlLower = html.toLowerCase();

  // Signal 1 — wp-content/plugins/woocommerce in HTML
  const hasWcPlugin = htmlLower.includes("wp-content/plugins/woocommerce");

  // Signal 2 — CSS class "woocommerce"
  const hasWcClass = htmlLower.includes('class="woocommerce') ||
    htmlLower.includes("class='woocommerce") ||
    htmlLower.includes("woocommerce-");

  // Signal 3 — Meta generator tag with WooCommerce
  const hasGenerator =
    htmlLower.includes('content="woocommerce') ||
    htmlLower.includes("content='woocommerce");

  // Signal 4 — wc-ajax or wc_ajax endpoints
  const hasWcAjax =
    htmlLower.includes("wc-ajax") || htmlLower.includes("wc_ajax");

  const signals: DetectionSignal[] = [
    {
      signal: "wp-content/plugins/woocommerce in HTML",
      weight: 0.35,
      found: hasWcPlugin,
    },
    {
      signal: "woocommerce CSS class in HTML",
      weight: 0.25,
      found: hasWcClass,
    },
    {
      signal: "WooCommerce meta generator tag",
      weight: 0.2,
      found: hasGenerator,
    },
    {
      signal: "wc-ajax or wc_ajax in HTML",
      weight: 0.2,
      found: hasWcAjax,
    },
  ];

  return {
    platform: "WOOCOMMERCE",
    confidence: computeConfidence(signals),
    signals,
  };
}

function detectMagento(html: string, headers: Headers): SubDetectorResult {
  const htmlLower = html.toLowerCase();

  // Signal 1 — Magento_Ui or mage/ in scripts
  const hasMageScripts =
    html.includes("Magento_Ui") || html.includes("mage/");

  // Signal 2 — set-cookie contains PHPSESSID AND a cookie starting with "mage"
  const setCookie = headers.get("set-cookie") ?? "";
  const setCookieLower = setCookie.toLowerCase();
  const hasMageCookies =
    setCookieLower.includes("phpsessid") &&
    /(?:^|,\s*)mage/i.test(setCookie);

  // Signal 3 — catalog/product/view or catalogsearch links
  const hasCatalogLinks =
    htmlLower.includes("catalog/product/view") ||
    htmlLower.includes("catalogsearch");

  // Signal 4 — x-magento response headers
  let hasXMagentoHeader = false;
  headers.forEach((_value, key) => {
    if (key.toLowerCase().startsWith("x-magento")) {
      hasXMagentoHeader = true;
    }
  });

  const signals: DetectionSignal[] = [
    {
      signal: "Magento_Ui or mage/ in HTML scripts",
      weight: 0.3,
      found: hasMageScripts,
    },
    {
      signal: "PHPSESSID + mage cookie in set-cookie header",
      weight: 0.25,
      found: hasMageCookies,
    },
    {
      signal: "catalog/product/view or catalogsearch in HTML",
      weight: 0.2,
      found: hasCatalogLinks,
    },
    {
      signal: "x-magento response header present",
      weight: 0.25,
      found: hasXMagentoHeader,
    },
  ];

  return {
    platform: "MAGENTO",
    confidence: computeConfidence(signals),
    signals,
  };
}

function detectBigCommerce(
  html: string,
  headers: Headers,
): SubDetectorResult {
  const htmlLower = html.toLowerCase();

  // Signal 1 — cdn.bcapp or bigcommerce.com/s- in HTML
  const hasBcCdn =
    htmlLower.includes("cdn.bcapp") ||
    htmlLower.includes("bigcommerce.com/s-");

  // Signal 2 — bigcommerce string in HTML (case insensitive)
  const hasBigCommerceString = htmlLower.includes("bigcommerce");

  // Signal 3 — data-stencil or stencil- attributes
  const hasStencil =
    htmlLower.includes("data-stencil") || htmlLower.includes("stencil-");

  // Signal 4 — X-BC- headers
  let hasXBcHeader = false;
  headers.forEach((_value, key) => {
    if (key.toLowerCase().startsWith("x-bc-")) {
      hasXBcHeader = true;
    }
  });

  const signals: DetectionSignal[] = [
    {
      signal: "cdn.bcapp or bigcommerce.com/s- in HTML",
      weight: 0.35,
      found: hasBcCdn,
    },
    {
      signal: "bigcommerce string in HTML",
      weight: 0.3,
      found: hasBigCommerceString,
    },
    {
      signal: "data-stencil or stencil- attributes in HTML",
      weight: 0.2,
      found: hasStencil,
    },
    {
      signal: "X-BC- response headers present",
      weight: 0.15,
      found: hasXBcHeader,
    },
  ];

  return {
    platform: "BIGCOMMERCE",
    confidence: computeConfidence(signals),
    signals,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function detectPlatform(
  domain: string,
): Promise<PlatformDetectionResult> {
  console.log(`[detector] Starting platform detection for ${domain}`);

  // 1. Fetch homepage
  const response = await safeFetch(`https://${domain}`, 15_000);

  if (!response) {
    console.log(`[detector] Failed to fetch homepage for ${domain}`);
    return {
      platform: "GENERIC",
      confidence: 0,
      signals: [],
      allResults: [{ platform: "GENERIC", confidence: 0 }],
    };
  }

  // 2. Extract HTML body and headers
  const html = await response.text();
  const headers = response.headers;

  console.log(
    `[detector] Fetched ${html.length} bytes of HTML from ${domain}`,
  );

  // 3. Run all sub-detectors concurrently
  const [shopifyResult, wooResult, magentoResult, bigCommerceResult] =
    await Promise.all([
      detectShopify(html, headers, domain),
      Promise.resolve(detectWooCommerce(html, headers)),
      Promise.resolve(detectMagento(html, headers)),
      Promise.resolve(detectBigCommerce(html, headers)),
    ]);

  const results: SubDetectorResult[] = [
    shopifyResult,
    wooResult,
    magentoResult,
    bigCommerceResult,
  ];

  // 4. Build allResults sorted by confidence descending
  const allResults = results
    .map((r) => ({ platform: r.platform, confidence: r.confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  // 5. Pick the winner
  const winner = results.reduce((best, current) =>
    current.confidence > best.confidence ? current : best,
  );

  console.log(
    `[detector] Detection results for ${domain}: ${allResults.map((r) => `${r.platform}=${r.confidence.toFixed(2)}`).join(", ")}`,
  );

  // 6. If highest confidence < 0.3, return GENERIC
  if (winner.confidence < 0.3) {
    console.log(
      `[detector] Low confidence (${winner.confidence.toFixed(2)}), defaulting to GENERIC`,
    );
    return {
      platform: "GENERIC",
      confidence: winner.confidence,
      signals: winner.signals,
      allResults,
    };
  }

  // 7. Return the winning result
  return {
    platform: winner.platform,
    confidence: winner.confidence,
    signals: winner.signals,
    allResults,
  };
}
