/**
 * Algoritmo de estimación de ventas por delta de inventario.
 *
 * Lógica:
 *   ventas_estimadas = inventario_anterior - inventario_actual
 *   Si el resultado es negativo → hubo restock (inventario creció)
 *   Si el resultado es positivo → se vendieron esas unidades
 *
 * Precisión típica: ~85% en revenue, >95% en inventario (igual que Particl).
 */

import { prisma } from "@/lib/prisma"

/**
 * Calcula y guarda las estimaciones de ventas para una marca,
 * comparando los dos snapshots más recientes de cada variante.
 *
 * Usar los 2 snapshots más recientes (en vez de ventana de día fijo)
 * hace que funcione correctamente cuando:
 * - Se hacen dos scrapes el mismo día (testing)
 * - El schedule de scraping varía (cada 6h, cada 12h, etc.)
 */
export async function computeDailySalesEstimates(brandId: string, date: Date): Promise<number> {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  // Obtener los 2 snapshots más recientes por variante
  const variants = await prisma.variant.findMany({
    where: { product: { brandId } },
    select: {
      id: true,
      price: true,
      product: { select: { brandId: true } },
      inventorySnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 2,
      },
    },
  })

  let estimatesCreated = 0

  for (const variant of variants) {
    const snapshots = variant.inventorySnapshots
    if (snapshots.length < 2) continue

    const curr = snapshots[0]  // más reciente
    const prev = snapshots[1]  // anterior

    const delta = prev.quantity - curr.quantity
    const wasRestock = delta < 0

    // Si no hubo cambio, saltar
    if (delta === 0) continue

    const unitsSold = Math.max(0, delta)
    const revenueEstimate = unitsSold * Number(variant.price)

    await prisma.salesEstimate.upsert({
      where: { variantId_date: { variantId: variant.id, date: dayStart } },
      create: {
        brandId,
        variantId: variant.id,
        date: dayStart,
        unitsSold,
        revenueEstimate,
        wasRestock,
      },
      update: {
        unitsSold,
        revenueEstimate,
        wasRestock,
      },
    })

    estimatesCreated++
  }

  return estimatesCreated
}

/**
 * Agrega estimaciones de ventas por marca en un rango de fechas.
 * Retorna un array de { date, unitsSold, revenue } para graficar curva de ventas.
 */
export async function getBrandSalesCurve(
  brandId: string,
  from: Date,
  to: Date,
) {
  const estimates = await prisma.salesEstimate.groupBy({
    by: ["date"],
    where: {
      brandId,
      date: { gte: from, lte: to },
    },
    _sum: {
      unitsSold: true,
      revenueEstimate: true,
    },
    orderBy: { date: "asc" },
  })

  return estimates.map((e) => ({
    date: e.date,
    unitsSold: e._sum.unitsSold ?? 0,
    revenue: Number(e._sum.revenueEstimate ?? 0),
  }))
}
