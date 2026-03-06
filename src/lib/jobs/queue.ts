/**
 * Tipos compartidos para jobs de scraping y estimación.
 *
 * Nota: La implementación original usaba BullMQ + Redis.
 * Ahora el pipeline se ejecuta directamente via src/lib/pipeline/scrape-brand.ts
 */

export interface ScrapeJobData {
  brandId: string
  domain: string
  type: "SHOPIFY_FULL" | "SHOPIFY_INCREMENTAL" | "PLAYWRIGHT"
}

export interface EstimateJobData {
  brandId: string
  date: string
}
