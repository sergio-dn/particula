/**
 * @swagger
 * /api/winners:
 *   get:
 *     summary: Obtener winner scores
 *     tags: [Winners]
 *     parameters:
 *       - in: query
 *         name: brandId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Winner scores
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"

/**
 * GET /api/winners
 *
 * Query params:
 * - brandId (required)
 * - date (optional, ISO date — defaults to today)
 * - category (optional, product type filter)
 * - limit (optional, default 20, max 100)
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole("VIEWER")
  if (error) return error

  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get("brandId")

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 })
  }

  const dateParam = searchParams.get("date")
  const category = searchParams.get("category")
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))

  // Find the most recent score date for this brand if no date specified
  let scoreDate: Date
  if (dateParam) {
    scoreDate = new Date(dateParam)
  } else {
    const latest = await prisma.winnerScore.findFirst({
      where: { brandId },
      orderBy: { date: "desc" },
      select: { date: true },
    })
    if (!latest) {
      return NextResponse.json({ items: [], date: null })
    }
    scoreDate = latest.date
  }

  // Build where clause
  const where: Record<string, unknown> = { brandId, date: scoreDate }
  if (category) {
    where.product = { productType: category }
  }

  const winners = await prisma.winnerScore.findMany({
    where,
    include: {
      product: {
        select: {
          id: true,
          title: true,
          handle: true,
          productType: true,
          imageUrl: true,
          isActive: true,
          firstSeenAt: true,
          variants: {
            select: {
              id: true,
              title: true,
              price: true,
              isAvailable: true,
            },
          },
        },
      },
    },
    orderBy: { compositeScore: "desc" },
    take: limit,
  })

  return NextResponse.json({
    items: winners.map((w) => ({
      productId: w.productId,
      title: w.product.title,
      handle: w.product.handle,
      productType: w.product.productType,
      imageUrl: w.product.imageUrl,
      isActive: w.product.isActive,
      firstSeenAt: w.product.firstSeenAt,
      compositeScore: w.compositeScore,
      confidenceTier: w.confidenceTier,
      reasonCodes: w.reasonCodes,
      salesVelocity: w.salesVelocity,
      restockFrequency: w.restockFrequency,
      stockoutSignal: w.stockoutSignal,
      longevity: w.longevity,
      priceStability: w.priceStability,
      catalogProminence: w.catalogProminence,
      variants: w.product.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: Number(v.price),
        isAvailable: v.isAvailable,
      })),
    })),
    date: scoreDate,
  })
}
