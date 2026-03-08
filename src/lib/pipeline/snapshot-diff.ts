/**
 * Motor de diffing de snapshots.
 *
 * Compara el snapshot más reciente con el anterior para cada variante
 * de una marca y genera una lista tipada de cambios categorizados.
 *
 * Uso independiente:
 *   const diff = await diffSnapshots(brandId)
 *   console.log(diff.summary)
 *
 * También puede invocarse desde el pipeline principal tras el scrape.
 */

import { prisma } from "@/lib/prisma"

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type DiffChangeType =
  | "INVENTORY_DECREASE"
  | "INVENTORY_INCREASE"
  | "PRICE_CHANGE"
  | "PRICE_DROP"
  | "DISCOUNT_START"
  | "DISCOUNT_END"
  | "OUT_OF_STOCK"
  | "BACK_IN_STOCK"
  | "NEW_VARIANT"
  | "PRODUCT_REMOVED"

export interface DiffChange {
  type: DiffChangeType
  variantId: string
  productId: string
  productTitle: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export interface DiffSummary {
  totalChanges: number
  inventoryDecreases: number
  inventoryIncreases: number
  priceChanges: number
  stockouts: number
  restocks: number
  newVariants: number
  removedProducts: number
}

export interface SnapshotDiffResult {
  brandId: string
  timestamp: Date
  changes: DiffChange[]
  summary: DiffSummary
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function buildSummary(changes: DiffChange[]): DiffSummary {
  const summary: DiffSummary = {
    totalChanges: changes.length,
    inventoryDecreases: 0,
    inventoryIncreases: 0,
    priceChanges: 0,
    stockouts: 0,
    restocks: 0,
    newVariants: 0,
    removedProducts: 0,
  }

  for (const c of changes) {
    switch (c.type) {
      case "INVENTORY_DECREASE":
        summary.inventoryDecreases++
        break
      case "INVENTORY_INCREASE":
        summary.inventoryIncreases++
        break
      case "PRICE_CHANGE":
      case "PRICE_DROP":
        summary.priceChanges++
        break
      case "OUT_OF_STOCK":
        summary.stockouts++
        break
      case "BACK_IN_STOCK":
        summary.restocks++
        break
      case "NEW_VARIANT":
        summary.newVariants++
        break
      case "PRODUCT_REMOVED":
        summary.removedProducts++
        break
      case "DISCOUNT_START":
      case "DISCOUNT_END":
        summary.priceChanges++
        break
    }
  }

  return summary
}

// ──────────────────────────────────────────────
// Main diff function
// ──────────────────────────────────────────────

/**
 * Compara el snapshot actual con el anterior para todas las variantes
 * de una marca y devuelve los cambios detectados.
 */
export async function diffSnapshots(
  brandId: string,
): Promise<SnapshotDiffResult> {
  const now = new Date()
  const changes: DiffChange[] = []

  // 1. Obtener todos los productos de la marca con sus variantes
  const products = await prisma.product.findMany({
    where: { brandId },
    include: {
      variants: {
        include: {
          inventorySnapshots: {
            orderBy: { snapshotAt: "desc" },
            take: 2,
          },
          priceHistory: {
            orderBy: { recordedAt: "desc" },
            take: 2,
          },
        },
      },
    },
  })

  for (const product of products) {
    // ── Detect removed products ──
    // A product is considered removed if it was previously active but
    // is no longer active (isActive=false).
    if (!product.isActive) {
      // Only report if the product was recently deactivated (has variants)
      if (product.variants.length > 0) {
        changes.push({
          type: "PRODUCT_REMOVED",
          variantId: product.variants[0].id,
          productId: product.id,
          productTitle: product.title,
          before: { isActive: true, lastSeenAt: product.lastSeenAt },
          after: { isActive: false },
        })
      }
      continue
    }

    for (const variant of product.variants) {
      const snapshots = variant.inventorySnapshots
      const priceRecords = variant.priceHistory

      // ── New variant detection ──
      // If there's only one snapshot, this variant is new (first time seen).
      if (snapshots.length < 2) {
        if (snapshots.length === 1) {
          changes.push({
            type: "NEW_VARIANT",
            variantId: variant.id,
            productId: product.id,
            productTitle: product.title,
            before: {},
            after: {
              quantity: snapshots[0].quantity,
              isAvailable: snapshots[0].isAvailable,
              price: toNumber(variant.price),
            },
          })
        }
        continue
      }

      const [current, previous] = snapshots // desc order: [newest, older]

      // ── Inventory changes ──
      const qtyBefore = previous.quantity
      const qtyAfter = current.quantity

      if (qtyAfter < qtyBefore) {
        changes.push({
          type: "INVENTORY_DECREASE",
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          before: { quantity: qtyBefore },
          after: { quantity: qtyAfter, delta: qtyAfter - qtyBefore },
        })
      } else if (qtyAfter > qtyBefore) {
        changes.push({
          type: "INVENTORY_INCREASE",
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          before: { quantity: qtyBefore },
          after: { quantity: qtyAfter, delta: qtyAfter - qtyBefore },
        })
      }

      // ── Availability / stockout changes ──
      const availBefore = previous.isAvailable
      const availAfter = current.isAvailable

      if (availBefore && !availAfter) {
        changes.push({
          type: "OUT_OF_STOCK",
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          before: { isAvailable: true, quantity: qtyBefore },
          after: { isAvailable: false, quantity: qtyAfter },
        })
      } else if (!availBefore && availAfter) {
        changes.push({
          type: "BACK_IN_STOCK",
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          before: { isAvailable: false, quantity: qtyBefore },
          after: { isAvailable: true, quantity: qtyAfter },
        })
      }

      // ── Price changes ──
      if (priceRecords.length >= 2) {
        const [currentPrice, previousPrice] = priceRecords

        const priceBefore = toNumber(previousPrice.price)
        const priceAfter = toNumber(currentPrice.price)
        const compareAtBefore = toNumber(previousPrice.compareAtPrice)
        const compareAtAfter = toNumber(currentPrice.compareAtPrice)

        if (priceBefore !== null && priceAfter !== null && priceBefore !== priceAfter) {
          changes.push({
            type: priceAfter < priceBefore ? "PRICE_DROP" : "PRICE_CHANGE",
            variantId: variant.id,
            productId: product.id,
            productTitle: product.title,
            before: { price: priceBefore, compareAtPrice: compareAtBefore },
            after: { price: priceAfter, compareAtPrice: compareAtAfter },
          })
        }

        // ── Discount start/end ──
        // Discount starts when compareAtPrice appears (was null, now set and > price)
        // Discount ends when compareAtPrice disappears (was set, now null)
        if (compareAtBefore === null && compareAtAfter !== null && priceAfter !== null && compareAtAfter > priceAfter) {
          changes.push({
            type: "DISCOUNT_START",
            variantId: variant.id,
            productId: product.id,
            productTitle: product.title,
            before: { price: priceBefore, compareAtPrice: null },
            after: { price: priceAfter, compareAtPrice: compareAtAfter },
          })
        } else if (compareAtBefore !== null && compareAtAfter === null) {
          changes.push({
            type: "DISCOUNT_END",
            variantId: variant.id,
            productId: product.id,
            productTitle: product.title,
            before: { price: priceBefore, compareAtPrice: compareAtBefore },
            after: { price: priceAfter, compareAtPrice: null },
          })
        }
      }
    }
  }

  return {
    brandId,
    timestamp: now,
    changes,
    summary: buildSummary(changes),
  }
}
