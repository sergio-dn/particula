import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/sales
 *
 * Query params:
 * - brandId (required)
 * - productId (optional)
 * - variantId (optional)
 * - from (optional, ISO date)
 * - to (optional, ISO date)
 * - page (optional, default 1)
 * - limit (optional, default 50, max 200)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get("brandId")

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 })
  }

  const productId = searchParams.get("productId")
  const variantId = searchParams.get("variantId")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)))
  const skip = (page - 1) * limit

  // Build where clause
  const where: Record<string, unknown> = { brandId }

  if (variantId) {
    where.variantId = variantId
  } else if (productId) {
    where.variant = { productId }
  }

  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const [items, total] = await Promise.all([
    prisma.salesEstimate.findMany({
      where,
      include: {
        variant: {
          select: {
            id: true,
            title: true,
            sku: true,
            price: true,
            product: {
              select: { id: true, title: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
      skip,
      take: limit,
    }),
    prisma.salesEstimate.count({ where }),
  ])

  // Aggregate totals for the filtered range
  const aggregates = await prisma.salesEstimate.aggregate({
    where,
    _sum: { unitsSold: true, revenueEstimate: true },
  })

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      variantTitle: item.variant.title,
      sku: item.variant.sku,
      productId: item.variant.product.id,
      productTitle: item.variant.product.title,
      date: item.date,
      unitsSold: item.unitsSold,
      revenueEstimate: Number(item.revenueEstimate),
      price: Number(item.variant.price),
      wasRestock: item.wasRestock,
      confidenceScore: item.confidenceScore,
      estimationMethod: item.estimationMethod,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    aggregates: {
      totalUnitsSold: aggregates._sum.unitsSold ?? 0,
      totalRevenue: Number(aggregates._sum.revenueEstimate ?? 0),
    },
  })
}
