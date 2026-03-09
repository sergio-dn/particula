/**
 * Tests para platform-detector.ts
 * Mockeamos global fetch para simular respuestas HTML de distintas plataformas.
 */

import { detectPlatform } from "@/lib/detectors/platform-detector"

// Guardar referencia original
const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  global.fetch = originalFetch
})

function mockFetchWithHtml(html: string, headers: Record<string, string> = {}) {
  const mockHeaders = new Headers(headers)
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(html),
    headers: mockHeaders,
  } as unknown as Response)
}

function mockFetchError() {
  global.fetch = jest.fn().mockRejectedValue(new Error("Network error"))
}

describe("detectPlatform", () => {
  it("detecta Shopify cuando HTML tiene cdn.shopify.com y Shopify.theme", async () => {
    const shopifyHtml = `
      <html>
        <head><script src="https://cdn.shopify.com/s/files/1/theme.js"></script></head>
        <body>
          <script>Shopify.theme = { name: "Dawn" };</script>
          <div class="shopify-payment-button"></div>
        </body>
      </html>
    `
    mockFetchWithHtml(shopifyHtml)

    const result = await detectPlatform("example-store.myshopify.com")

    expect(result.platform).toBe("SHOPIFY")
    expect(result.confidence).toBeGreaterThan(0.3)
    expect(result.signals.length).toBeGreaterThan(0)
    // Verificar que cdn.shopify.com fue detectado
    const cdnSignal = result.signals.find((s) => s.signal.includes("cdn.shopify.com"))
    expect(cdnSignal?.found).toBe(true)
  })

  it("detecta WooCommerce cuando HTML tiene wp-content/plugins/woocommerce", async () => {
    const wooHtml = `
      <html>
        <head>
          <link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/style.css">
          <meta name="generator" content="WooCommerce 8.0">
        </head>
        <body class="woocommerce-page">
          <script>var wc_ajax = "/wc-ajax/";</script>
        </body>
      </html>
    `
    mockFetchWithHtml(wooHtml)

    const result = await detectPlatform("woo-store.com")

    expect(result.platform).toBe("WOOCOMMERCE")
    expect(result.confidence).toBeGreaterThan(0.3)
    const wcSignal = result.signals.find((s) => s.signal.includes("wp-content/plugins/woocommerce"))
    expect(wcSignal?.found).toBe(true)
  })

  it("retorna GENERIC cuando HTML no tiene señales de plataforma", async () => {
    const genericHtml = `
      <html>
        <head><title>My Store</title></head>
        <body><h1>Welcome to my store</h1></body>
      </html>
    `
    mockFetchWithHtml(genericHtml)

    const result = await detectPlatform("generic-store.com")

    expect(result.platform).toBe("GENERIC")
    expect(result.confidence).toBeLessThan(0.3)
  })

  it("retorna GENERIC con confidence 0 cuando fetch falla", async () => {
    mockFetchError()

    const result = await detectPlatform("unreachable-store.com")

    expect(result.platform).toBe("GENERIC")
    expect(result.confidence).toBe(0)
    expect(result.signals).toHaveLength(0)
  })

  it("incluye allResults con todas las plataformas evaluadas", async () => {
    const shopifyHtml = `
      <html><head><script src="https://cdn.shopify.com/s/files/1/theme.js"></script></head>
      <body><script>Shopify.theme = {};</script></body></html>
    `
    mockFetchWithHtml(shopifyHtml)

    const result = await detectPlatform("shopify-store.com")

    expect(result.allResults.length).toBeGreaterThanOrEqual(4)
    const platforms = result.allResults.map((r) => r.platform)
    expect(platforms).toContain("SHOPIFY")
    expect(platforms).toContain("WOOCOMMERCE")
    expect(platforms).toContain("MAGENTO")
    expect(platforms).toContain("BIGCOMMERCE")
  })

  it("allResults están ordenados por confidence descendente", async () => {
    const shopifyHtml = `
      <html><body>
        <script src="https://cdn.shopify.com/s/files/1/theme.js"></script>
        <script>Shopify.theme = {};</script>
      </body></html>
    `
    mockFetchWithHtml(shopifyHtml)

    const result = await detectPlatform("shopify-store.com")

    for (let i = 1; i < result.allResults.length; i++) {
      expect(result.allResults[i - 1].confidence).toBeGreaterThanOrEqual(
        result.allResults[i].confidence,
      )
    }
  })
})
