/**
 * Adapter Contract — interfaz estandarizada que todos los adaptadores
 * de scraping deben implementar.
 *
 * Permite agregar nuevas plataformas de forma modular sin modificar
 * el pipeline principal.
 */

import type { PlatformType } from "@/lib/detectors/platform-detector"

// ─── Normalized types ────────────────────────────────────────────

export interface NormalizedPrice {
  price: string
  compareAtPrice: string | null
  currency: string | null
}

export interface NormalizedVariant {
  externalId: string
  title: string
  sku: string | null
  option1: string | null
  option2: string | null
  option3: string | null
  price: NormalizedPrice
  isAvailable: boolean
  inventoryQuantity: number | null
  weight: number | null
  weightUnit: string | null
}

export interface NormalizedProduct {
  externalId: string
  title: string
  handle: string
  productType: string | null
  vendor: string | null
  tags: string[]
  bodyHtml: string | null
  publishedAt: Date | null
  imageUrl: string | null
  imageUrls: string[]
  variants: NormalizedVariant[]
  /** Confidence score (0–1) indicating data quality. Platform-specific adapters score higher. */
  confidence: number
}

export interface ProductURL {
  url: string
  externalId?: string
  handle?: string
}

// ─── Adapter interface ───────────────────────────────────────────

export interface StoreAdapter {
  /** Platform identifier */
  readonly platform: PlatformType

  /**
   * Discover product URLs/identifiers from a domain.
   * For API-based adapters (Shopify), this may return all products directly.
   */
  discoverProducts(domain: string): Promise<ProductURL[]>

  /**
   * Fetch raw product data from a URL or identifier.
   * Returns the raw payload from the platform.
   */
  fetchProduct(url: string): Promise<unknown>

  /**
   * Parse a raw payload into a normalized product.
   */
  parseProduct(payload: unknown): NormalizedProduct

  /**
   * Parse variants from a raw payload.
   * Usually called internally by parseProduct, but exposed for flexibility.
   */
  parseVariants(payload: unknown): NormalizedVariant[]

  /**
   * Fetch and normalize all products from a domain.
   * Convenience method that combines discover + fetch + parse.
   * Adapters may override for optimized batch fetching.
   */
  fetchAllProducts(
    domain: string,
    onProgress?: (count: number) => void
  ): Promise<NormalizedProduct[]>
}

// ─── Factory function ────────────────────────────────────────────

/**
 * Returns the appropriate adapter for a given platform type.
 * Throws if no adapter is available for the platform.
 */
export async function getAdapter(platformType: PlatformType): Promise<StoreAdapter> {
  switch (platformType) {
    case "SHOPIFY": {
      const { ShopifyAdapter } = await import("@/lib/scrapers/shopify")
      return new ShopifyAdapter()
    }
    case "WOOCOMMERCE": {
      const { WooCommerceAdapter } = await import("@/lib/scrapers/woocommerce")
      return new WooCommerceAdapter()
    }
    case "GENERIC":
    case "MAGENTO":
    case "BIGCOMMERCE":
    default: {
      // Magento y BigCommerce usan el adapter genérico (JSON-LD / HTML)
      // hasta que se implementen adapters específicos
      const { GenericAdapter } = await import("@/lib/scrapers/generic")
      return new GenericAdapter()
    }
  }
}
