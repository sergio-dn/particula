/**
 * @swagger
 * /api/brands/{id}/scrape:
 *   post:
 *     summary: Trigger scraping manual de una marca
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Resultado del scraping
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"
import { requireRole } from "@/lib/auth-guard"

export const maxDuration = 300 // 5 minutos — necesario para stores grandes

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole("EDITOR")
  if (error) return error
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const scrapeJob = await prisma.scrapeJob.create({
    data: {
      brandId: brand.id,
      type: brand.shopifyStore ? "SHOPIFY_FULL" : "PLAYWRIGHT",
      status: "PENDING",
    },
  })

  // Ejecutar scraping inline (esperamos el resultado)
  try {
    const result = await scrapeBrand(brand.id)

    // Reintentar una vez si falló por error de fetch
    if (result.status === "FAILED" && result.error?.includes("fetch")) {
      console.log(`[scrape] retrying ${brand.domain} after fetch failure`)
      await new Promise((r) => setTimeout(r, 5000))
      const retry = await scrapeBrand(brand.id)
      return NextResponse.json({ scrapeJobId: scrapeJob.id, ...retry })
    }

    return NextResponse.json({ scrapeJobId: scrapeJob.id, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[scrape] unhandled error for ${brand.domain}:`, message)

    // Marcar como FAILED si no lo hizo scrapeBrand internamente
    await prisma.scrapeJob.updateMany({
      where: { id: scrapeJob.id, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "FAILED", completedAt: new Date(), error: message },
    })

    return NextResponse.json(
      { scrapeJobId: scrapeJob.id, status: "FAILED", error: message },
      { status: 500 }
    )
  }
}
