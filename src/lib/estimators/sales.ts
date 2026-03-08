/**
 * Estimador de ventas híbrido — dos estrategias según datos disponibles.
 *
 * Caso 1 — Cart probe (precisión alta):
 *   Ambos snapshots tienen probeMethod: "cart_probe"
 *   unitsSold = prev.quantity - curr.quantity
 *   Si delta ≤ 0 → restock o sin cambio, skip
 *
 * Caso 2 — Available delta (precisión baja, fallback):
 *   Snapshots con probeMethod: "available_only" o null (legacy)
 *   available: true → false = 1 unidad vendida (mínimo estimable)
 *   available: true → true = sin cambio detectable
 *   available: false → true = restock
 */

import { prisma } from "@/lib/prisma"

/**
 * Calcula y guarda las estimaciones de ventas para una marca,
 * comparando los dos snapshots más recientes de cada variante.
 *
 * Usa un sistema híbrido:
 *   - Cart probe data → delta de inventario exacto
 *   - Available only → delta binario (1 unidad cuando se agota)
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

    const curr = snapshots[0] // más reciente
    const prev = snapshots[1] // anterior

    let unitsSold = 0
    let wasRestock = false
    let estimationMethod: string

    const bothCartProbe =
      curr.probeMethod === "cart_probe" && prev.probeMethod === "cart_probe"

    if (bothCartProbe) {
      // ── Caso 1: Cart probe — delta de inventario exacto ──
      const delta = prev.quantity - curr.quantity
      wasRestock = delta < 0

      if (delta <= 0) continue // restock o sin cambio → skip

      unitsSold = delta
      estimationMethod = "cart_probe"
    } else {
      // ── Caso 2: Available delta — estimación binaria ──
      const wasAvailable = prev.isAvailable
      const isAvailable = curr.isAvailable

      if (wasAvailable && !isAvailable) {
        // Se agotó → estimar 1 unidad vendida (mínimo)
        unitsSold = 1
        estimationMethod = "available_delta"
      } else if (!wasAvailable && isAvailable) {
        // Restock — no es una venta
        wasRestock = true
        continue
      } else {
        // Sin cambio detectable (ambos true o ambos false)
        continue
      }
    }

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
        estimationMethod,
      },
      update: {
        unitsSold,
        revenueEstimate,
        wasRestock,
        estimationMethod,
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
