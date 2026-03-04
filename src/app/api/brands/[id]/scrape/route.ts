import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { enqueueScrapeJob } from "@/lib/jobs/queue"

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

  if (brand.shopifyStore) {
    await enqueueScrapeJob({
      brandId: brand.id,
      domain: brand.domain,
      type: "SHOPIFY_FULL",
    })
  }

  return NextResponse.json({ scrapeJobId: scrapeJob.id })
}
