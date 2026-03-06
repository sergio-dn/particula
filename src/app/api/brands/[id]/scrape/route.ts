import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Ejecutar scraping en background
  after(async () => {
    await scrapeBrand(brand.id)
  })

  return NextResponse.json({ scrapeJobId: scrapeJob.id })
}
