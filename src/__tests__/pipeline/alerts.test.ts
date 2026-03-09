/**
 * Tests para alerts.ts — evaluateAlerts con Prisma mockeado.
 */

jest.mock("@/lib/prisma", () => require("../__mocks__/prisma"))

import { prisma } from "@/lib/prisma"
import { evaluateAlerts, type ScrapeResults } from "@/lib/pipeline/alerts"

const mockFindMany = prisma.brandAlert.findMany as jest.Mock
const mockCreate = prisma.alertEvent.create as jest.Mock

function baseScrapeResults(overrides: Partial<ScrapeResults> = {}): ScrapeResults {
  return {
    brandId: "brand-1",
    newProductIds: [],
    priceChanges: [],
    restockedVariantIds: [],
    totalUnitsSold: 0,
    newVariants: [],
    discountStarts: [],
    discountEnds: [],
    outOfStockVariantIds: [],
    removedProductIds: [],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreate.mockImplementation(() =>
    Promise.resolve({ id: `evt-${Math.random().toString(36).slice(2)}` }),
  )
})

describe("evaluateAlerts", () => {
  it("retorna array vacío cuando no hay alertas activas", async () => {
    mockFindMany.mockResolvedValue([])

    const ids = await evaluateAlerts(baseScrapeResults())
    expect(ids).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("dispara NEW_PRODUCTS cuando hay productos nuevos", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-1", type: "NEW_PRODUCTS", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({ newProductIds: ["p1", "p2"] }),
    )

    expect(ids).toHaveLength(1)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const createData = mockCreate.mock.calls[0][0].data
    expect(createData.alertId).toBe("alert-1")
    expect(createData.message).toContain("2")
  })

  it("no dispara NEW_PRODUCTS cuando no hay productos nuevos", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-1", type: "NEW_PRODUCTS", isActive: true }])

    const ids = await evaluateAlerts(baseScrapeResults({ newProductIds: [] }))
    expect(ids).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("dispara PRICE_DROP solo para cambios donde newPrice < oldPrice", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-pd", type: "PRICE_DROP", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({
        priceChanges: [
          { variantId: "v1", oldPrice: 100, newPrice: 80 }, // drop
          { variantId: "v2", oldPrice: 50, newPrice: 60 },  // increase (ignorar)
        ],
      }),
    )

    expect(ids).toHaveLength(1)
    const createData = mockCreate.mock.calls[0][0].data
    expect(createData.message).toContain("1")
    expect(createData.data.changes).toHaveLength(1)
    expect(createData.data.changes[0].variantId).toBe("v1")
  })

  it("dispara PRICE_CHANGE para cualquier cambio de precio", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-pc", type: "PRICE_CHANGE", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({
        priceChanges: [
          { variantId: "v1", oldPrice: 100, newPrice: 80 },
          { variantId: "v2", oldPrice: 50, newPrice: 60 },
        ],
      }),
    )

    expect(ids).toHaveLength(1)
    const createData = mockCreate.mock.calls[0][0].data
    expect(createData.message).toContain("2")
  })

  it("dispara RESTOCK cuando hay variantes reabastecidas", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-r", type: "RESTOCK", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({ restockedVariantIds: ["v1", "v2", "v3"] }),
    )

    expect(ids).toHaveLength(1)
    const createData = mockCreate.mock.calls[0][0].data
    expect(createData.message).toContain("3")
  })

  it("dispara HIGH_VELOCITY cuando unitsSold supera threshold", async () => {
    mockFindMany.mockResolvedValue([
      { id: "alert-hv", type: "HIGH_VELOCITY", isActive: true, threshold: 50 },
    ])

    const ids = await evaluateAlerts(baseScrapeResults({ totalUnitsSold: 51 }))

    expect(ids).toHaveLength(1)
    const createData = mockCreate.mock.calls[0][0].data
    expect(createData.data.threshold).toBe(50)
  })

  it("no dispara HIGH_VELOCITY cuando unitsSold es igual al threshold", async () => {
    mockFindMany.mockResolvedValue([
      { id: "alert-hv", type: "HIGH_VELOCITY", isActive: true, threshold: 100 },
    ])

    const ids = await evaluateAlerts(baseScrapeResults({ totalUnitsSold: 100 }))
    expect(ids).toEqual([])
  })

  it("usa threshold default de 100 cuando no hay threshold configurado", async () => {
    mockFindMany.mockResolvedValue([
      { id: "alert-hv", type: "HIGH_VELOCITY", isActive: true, threshold: null },
    ])

    // 100 no supera el threshold default de 100
    const ids1 = await evaluateAlerts(baseScrapeResults({ totalUnitsSold: 100 }))
    expect(ids1).toEqual([])

    // 101 sí supera
    const ids2 = await evaluateAlerts(baseScrapeResults({ totalUnitsSold: 101 }))
    expect(ids2).toHaveLength(1)
  })

  it("dispara VARIANT_ADDED cuando hay nuevas variantes", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-va", type: "VARIANT_ADDED", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({
        newVariants: [{ variantId: "v1", productTitle: "Shirt", variantTitle: "S" }],
      }),
    )

    expect(ids).toHaveLength(1)
  })

  it("dispara DISCOUNT_START cuando hay descuentos nuevos", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-ds", type: "DISCOUNT_START", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({
        discountStarts: [
          { variantId: "v1", compareAtPrice: 100, currentPrice: 80, discountPercent: 20 },
        ],
      }),
    )

    expect(ids).toHaveLength(1)
  })

  it("dispara DISCOUNT_END cuando terminan descuentos", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-de", type: "DISCOUNT_END", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({
        discountEnds: [{ variantId: "v1", previousCompareAtPrice: 100, currentPrice: 100 }],
      }),
    )

    expect(ids).toHaveLength(1)
  })

  it("dispara OUT_OF_STOCK cuando hay variantes agotadas", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-oos", type: "OUT_OF_STOCK", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({ outOfStockVariantIds: ["v1"] }),
    )

    expect(ids).toHaveLength(1)
  })

  it("dispara PRODUCT_REMOVED cuando hay productos removidos", async () => {
    mockFindMany.mockResolvedValue([{ id: "alert-pr", type: "PRODUCT_REMOVED", isActive: true }])

    const ids = await evaluateAlerts(
      baseScrapeResults({ removedProductIds: ["p1", "p2"] }),
    )

    expect(ids).toHaveLength(1)
    const createData = mockCreate.mock.calls[0][0].data
    expect(createData.message).toContain("2")
  })

  it("dispara múltiples alertas cuando corresponde", async () => {
    mockFindMany.mockResolvedValue([
      { id: "alert-1", type: "NEW_PRODUCTS", isActive: true },
      { id: "alert-2", type: "RESTOCK", isActive: true },
      { id: "alert-3", type: "PRICE_DROP", isActive: true },
    ])

    const ids = await evaluateAlerts(
      baseScrapeResults({
        newProductIds: ["p1"],
        restockedVariantIds: ["v1"],
        priceChanges: [{ variantId: "v2", oldPrice: 100, newPrice: 50 }],
      }),
    )

    expect(ids).toHaveLength(3)
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })
})
