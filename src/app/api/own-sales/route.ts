/**
 * @swagger
 * /api/own-sales:
 *   get:
 *     summary: Obtener ventas propias
 *     tags: [OwnSales]
 *     responses:
 *       200:
 *         description: Datos de ventas propias
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"

export async function GET(req: NextRequest) {
  const { error } = await requireRole("VIEWER")
  if (error) return error

  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get("brandId")
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const where: Record<string, unknown> = {}
  if (brandId) where.brandId = brandId
  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const data = await prisma.ownSalesData.groupBy({
    by: ["brandId", "date"],
    where,
    _sum: { units: true, revenue: true },
    orderBy: { date: "asc" },
  })

  const items = data.map((d) => ({
    brandId: d.brandId,
    date: d.date.toISOString().slice(0, 10),
    unitsSold: d._sum.units ?? 0,
    revenue: Number(d._sum.revenue ?? 0),
  }))

  return NextResponse.json({ items })
}
