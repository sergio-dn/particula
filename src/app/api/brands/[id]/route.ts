import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { scrapeBrand } from "@/lib/pipeline/scrape-brand"

const updateBrandSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  country: z.string().optional(),
  category: z.enum(["COMPETITOR", "ASPIRATIONAL", "INTERNATIONAL", "ADJACENT", "MY_BRAND"]).optional(),
  isMyBrand: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// GET /api/brands/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
      scrapeJobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      alerts: true,
    },
  })

  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(brand)
}

// PATCH /api/brands/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const parsed = updateBrandSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const brand = await prisma.brand.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json(brand)
}

// DELETE /api/brands/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.brand.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

// POST /api/brands/[id]/scrape — trigger manual scrape
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
