/**
 * @swagger
 * /api/oos:
 *   get:
 *     summary: Productos actualmente sin stock con días OOS
 *     tags: [OOS]
 *     parameters:
 *       - in: query
 *         name: brandId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de variantes sin stock
 */
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { error } = await requireRole("VIEWER")
  if (error) return error

  const brandId = req.nextUrl.searchParams.get("brandId")

  // Obtener variantes actualmente sin stock
  const variants = await prisma.variant.findMany({
    where: {
      isAvailable: false,
      product: {
        isActive: true,
        ...(brandId ? { brandId } : {}),
      },
    },
    include: {
      product: {
        select: {
          title: true,
          imageUrl: true,
          productType: true,
          brand: { select: { id: true, name: true, currency: true } },
        },
      },
      inventorySnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 50,
      },
    },
    take: 200,
  })

  // Calcular días sin stock para cada variante
  const items = variants.map((v) => {
    // Buscar el último snapshot donde estaba disponible
    const lastAvailable = v.inventorySnapshots.find((s) => s.isAvailable)
    const oosStart = lastAvailable
      ? new Date(lastAvailable.snapshotAt)
      : v.inventorySnapshots.length > 0
        ? new Date(v.inventorySnapshots[v.inventorySnapshots.length - 1].snapshotAt)
        : new Date()

    const daysSinceOOS = Math.max(
      0,
      Math.floor((Date.now() - oosStart.getTime()) / (1000 * 60 * 60 * 24))
    )

    return {
      variantId: v.id,
      variantTitle: v.title,
      sku: v.sku,
      price: v.price,
      productTitle: v.product.title,
      imageUrl: v.product.imageUrl,
      productType: v.product.productType,
      brandId: v.product.brand.id,
      brandName: v.product.brand.name,
      currency: v.product.brand.currency,
      oosDate: oosStart.toISOString(),
      daysSinceOOS,
    }
  })

  // Ordenar por días sin stock (mayor primero)
  items.sort((a, b) => b.daysSinceOOS - a.daysSinceOOS)

  return NextResponse.json(items)
}
