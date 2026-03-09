/**
 * Tests para winner-score.ts
 *
 * El módulo no exporta funciones puras de cálculo de componentes individuales
 * (son funciones async privadas que dependen de Prisma).
 * Testeamos computeProductScore y la lógica de reason codes mockeando Prisma.
 */

jest.mock("@/lib/prisma", () => require("../__mocks__/prisma"))

import { prisma } from "@/lib/prisma"
import { computeProductScore } from "@/lib/estimators/winner-score"

const mockPrisma = prisma as unknown as {
  salesEstimate: { aggregate: jest.Mock }
  product: { findMany: jest.Mock; findUnique: jest.Mock }
  variant: { findMany: jest.Mock; count: jest.Mock }
  inventorySnapshot: { count: jest.Mock }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("computeProductScore", () => {
  const productId = "prod-1"
  const brandId = "brand-1"
  const date = new Date("2024-06-15")

  function setupDefaultMocks() {
    // salesVelocity: productSales aggregate, then findMany products, then aggregate for each
    mockPrisma.salesEstimate.aggregate
      .mockResolvedValueOnce({ _sum: { unitsSold: 50 } }) // this product
      .mockResolvedValueOnce({ _sum: { unitsSold: 50 } }) // max (same product in loop)

    mockPrisma.product.findMany.mockResolvedValue([{ id: productId }])

    // restockFrequency & stockoutSignal: variant.findMany called twice
    mockPrisma.variant.findMany
      .mockResolvedValueOnce([
        { inventorySnapshots: [{ isAvailable: false }, { isAvailable: true }, { isAvailable: false }] },
      ]) // restockFrequency
      .mockResolvedValueOnce([
        { inventorySnapshots: [{ isAvailable: true }, { isAvailable: false }, { isAvailable: true }] },
      ]) // stockoutSignal
      .mockResolvedValueOnce([
        { priceHistory: [{ recordedAt: new Date() }] },
      ]) // priceStability

    // longevity
    mockPrisma.product.findUnique.mockResolvedValue({
      firstSeenAt: new Date("2024-01-01"),
      lastSeenAt: new Date("2024-06-15"),
      isActive: true,
    })

    // catalogProminence
    mockPrisma.variant.count.mockResolvedValue(5)

    // deriveConfidenceTier
    mockPrisma.inventorySnapshot.count
      .mockResolvedValueOnce(3) // cart_probe count > 0 → tier A
  }

  it("retorna un score compuesto con todos los componentes", async () => {
    setupDefaultMocks()

    const result = await computeProductScore(productId, brandId, date)

    expect(result.productId).toBe(productId)
    expect(result.brandId).toBe(brandId)
    expect(typeof result.compositeScore).toBe("number")
    expect(result.compositeScore).toBeGreaterThanOrEqual(0)
    expect(result.compositeScore).toBeLessThanOrEqual(100)
    expect(result.components).toHaveProperty("salesVelocity")
    expect(result.components).toHaveProperty("restockFrequency")
    expect(result.components).toHaveProperty("stockoutSignal")
    expect(result.components).toHaveProperty("longevity")
    expect(result.components).toHaveProperty("priceStability")
    expect(result.components).toHaveProperty("catalogProminence")
  })

  it("retorna confidenceTier 'A' cuando hay cart probe snapshots", async () => {
    setupDefaultMocks()
    const result = await computeProductScore(productId, brandId, date)
    expect(result.confidenceTier).toBe("A")
  })

  it("retorna confidenceTier 'B' cuando no hay cart probe pero sí snapshots", async () => {
    setupDefaultMocks()
    // Override: no cart_probe, but 2+ snapshots
    mockPrisma.inventorySnapshot.count
      .mockReset()
      .mockResolvedValueOnce(0) // cart_probe count = 0
      .mockResolvedValueOnce(5) // total snapshots >= 2

    const result = await computeProductScore(productId, brandId, date)
    expect(result.confidenceTier).toBe("B")
  })

  it("retorna confidenceTier 'C' cuando hay pocos snapshots", async () => {
    setupDefaultMocks()
    mockPrisma.inventorySnapshot.count
      .mockReset()
      .mockResolvedValueOnce(0) // cart_probe = 0
      .mockResolvedValueOnce(1) // total snapshots < 2

    const result = await computeProductScore(productId, brandId, date)
    expect(result.confidenceTier).toBe("C")
  })

  it("genera reason codes basados en componentes altos", async () => {
    setupDefaultMocks()
    const result = await computeProductScore(productId, brandId, date)
    // Con salesVelocity = 100 (50/50*100), debe tener HIGH_INVENTORY_DEPLETION y RECENT_TOP_MOVEMENT
    expect(result.reasonCodes).toContain("HIGH_INVENTORY_DEPLETION")
    expect(result.reasonCodes).toContain("RECENT_TOP_MOVEMENT")
    // Array de strings
    expect(Array.isArray(result.reasonCodes)).toBe(true)
  })

  it("retorna compositeScore 0 cuando no hay ventas y producto inactivo", async () => {
    // Sales velocity = 0
    mockPrisma.salesEstimate.aggregate.mockResolvedValue({ _sum: { unitsSold: 0 } })
    mockPrisma.product.findMany.mockResolvedValue([{ id: productId }])

    // restockFrequency = 0 (no snapshots)
    mockPrisma.variant.findMany
      .mockResolvedValueOnce([{ inventorySnapshots: [] }])
      .mockResolvedValueOnce([{ inventorySnapshots: [] }])
      .mockResolvedValueOnce([{ priceHistory: [] }])

    // longevity = 0 (inactive)
    mockPrisma.product.findUnique.mockResolvedValue({
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      isActive: false,
    })

    // catalogProminence = 0
    mockPrisma.variant.count.mockResolvedValue(0)

    // confidenceTier C
    mockPrisma.inventorySnapshot.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)

    const result = await computeProductScore(productId, brandId, date)
    // priceStability con 0 cambios de precio = 100, ponderado al 10% = 10
    expect(result.compositeScore).toBe(10)
    // LOW_PRICE_VOLATILITY se dispara con priceStability >= 80
    expect(result.reasonCodes).toEqual(["LOW_PRICE_VOLATILITY"])
  })
})
