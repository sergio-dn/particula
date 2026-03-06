/**
 * Cron endpoint para scraping automático de todas las marcas activas.
 *
 * Compatible con Vercel Cron Jobs.
 * Schedule configurado en vercel.json: cada 6 horas.
 *
 * Para testing local:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/scrape
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"

// Vercel Pro: hasta 300s. Hobby: hasta 60s.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Verificar autorización
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Buscar todas las marcas activas con Shopify habilitado
  const brands = await prisma.brand.findMany({
    where: { isActive: true, shopifyStore: true },
    select: { id: true, domain: true, name: true },
    orderBy: { name: "asc" },
  })

  if (brands.length === 0) {
    return NextResponse.json({ message: "No active brands to scrape", scraped: 0 })
  }

  const results = []

  for (const brand of brands) {
    try {
      // Crear ScrapeJob antes de ejecutar
      await prisma.scrapeJob.create({
        data: {
          brandId: brand.id,
          type: "SHOPIFY_FULL",
          status: "PENDING",
        },
      })

      const result = await scrapeBrand(brand.id)
      results.push({
        brand: brand.name,
        domain: brand.domain,
        ...result,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        brand: brand.name,
        domain: brand.domain,
        status: "FAILED" as const,
        error: message,
      })
    }
  }

  const succeeded = results.filter((r) => r.status === "COMPLETED").length
  const failed = results.filter((r) => r.status === "FAILED").length

  console.log(`[cron] Scrape complete: ${succeeded} succeeded, ${failed} failed out of ${brands.length} brands`)

  return NextResponse.json({
    scraped: brands.length,
    succeeded,
    failed,
    results,
    timestamp: new Date().toISOString(),
  })
}
