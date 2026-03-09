/**
 * @swagger
 * /api/brands/scrape-all:
 *   post:
 *     summary: Trigger scraping para todas las marcas activas
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Resultados del scraping
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"
import { requireRole } from "@/lib/auth-guard"

export const maxDuration = 300 // 5 minutos

export async function POST() {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const brands = await prisma.brand.findMany({
    where: { isActive: true, shopifyStore: true },
    select: { id: true, domain: true },
  })

  // Crear jobs para todas las marcas
  const jobs = await Promise.all(
    brands.map((b) =>
      prisma.scrapeJob.create({
        data: {
          brandId: b.id,
          type: "SHOPIFY_FULL",
          status: "PENDING",
        },
      })
    )
  )

  // Ejecutar scraping secuencial inline (esperamos resultados)
  const results: Array<{ domain: string; status: string; error?: string }> = []

  for (const brand of brands) {
    try {
      const result = await scrapeBrand(brand.id)
      results.push({ domain: brand.domain, status: result.status, error: result.error })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[scrape-all] error for ${brand.domain}:`, message)
      results.push({ domain: brand.domain, status: "FAILED", error: message })
    }
    // Pausa entre marcas para no saturar
    await new Promise((r) => setTimeout(r, 2000))
  }

  return NextResponse.json({
    message: `Scraping completado para ${brands.length} marcas`,
    jobIds: jobs.map((j) => j.id),
    results,
  })
}
