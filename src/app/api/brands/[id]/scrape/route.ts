/**
 * @swagger
 * /api/brands/{id}/scrape:
 *   post:
 *     summary: Trigger scraping manual de una marca
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Scrape job creado
 */
import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"
import { requireRole } from "@/lib/auth-guard"

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

  // Ejecutar scraping en background con retry
  after(async () => {
    try {
      const result = await scrapeBrand(brand.id)
      // Reintentar una vez si falló
      if (result.status === "FAILED" && result.error?.includes("fetch")) {
        console.log(`[scrape] retrying ${brand.domain} after fetch failure`)
        await new Promise((r) => setTimeout(r, 5000))
        await scrapeBrand(brand.id)
      }
    } catch (err) {
      console.error(`[scrape] unhandled error for ${brand.domain}:`, err)
    }
  })

  return NextResponse.json({ scrapeJobId: scrapeJob.id })
}
