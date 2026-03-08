import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/events
 *
 * Query params:
 * - brandId (optional, filter by brand)
 * - type (optional, alert type filter)
 * - from (optional, ISO date)
 * - to (optional, ISO date)
 * - isRead (optional, "true"/"false")
 * - page (optional, default 1)
 * - limit (optional, default 20, max 200)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get("brandId")
  const type = searchParams.get("type")
  const isRead = searchParams.get("isRead")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const skip = (page - 1) * limit

  // Build filter — brandId and type are optional
  const alertFilter: Record<string, unknown> = {}
  if (brandId) alertFilter.brandId = brandId
  if (type) alertFilter.type = type

  const where: Record<string, unknown> = {
    alert: alertFilter,
  }

  if (isRead !== null && isRead !== undefined && isRead !== "") {
    where.isRead = isRead === "true"
  }

  if (from || to) {
    where.triggeredAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const [items, total] = await Promise.all([
    prisma.alertEvent.findMany({
      where,
      include: {
        alert: {
          select: {
            type: true,
            brandId: true,
            brand: { select: { name: true } },
          },
        },
      },
      orderBy: { triggeredAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.alertEvent.count({ where }),
  ])

  return NextResponse.json({
    items: items.map((event) => ({
      id: event.id,
      type: event.alert.type,
      brandId: event.alert.brandId,
      brandName: event.alert.brand.name,
      message: event.message,
      data: event.data,
      triggeredAt: event.triggeredAt,
      isRead: event.isRead,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}
