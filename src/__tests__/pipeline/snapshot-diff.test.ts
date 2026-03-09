/**
 * Tests para snapshot-diff.ts — funciones puras filterEvents y diffSummary.
 */

jest.mock("@/lib/prisma", () => require("../__mocks__/prisma"))

import {
  filterEvents,
  diffSummary,
  type SnapshotDiffResult,
  type DiffEvent,
} from "@/lib/pipeline/snapshot-diff"

const now = new Date("2024-06-15T12:00:00Z")

function makeEvent(type: DiffEvent["type"], overrides: Partial<DiffEvent> = {}): DiffEvent {
  return {
    type,
    productId: "prod-1",
    brandId: "brand-1",
    timestamp: now,
    data: {},
    ...overrides,
  }
}

function makeDiffResult(events: DiffEvent[]): SnapshotDiffResult {
  return {
    brandId: "brand-1",
    events,
    productsAnalyzed: 10,
    variantsAnalyzed: 25,
  }
}

describe("filterEvents", () => {
  it("filtra por un solo tipo de evento", () => {
    const result = makeDiffResult([
      makeEvent("NEW_PRODUCT"),
      makeEvent("PRICE_DROP"),
      makeEvent("NEW_PRODUCT"),
      makeEvent("RESTOCK"),
    ])

    const filtered = filterEvents(result, "NEW_PRODUCT")
    expect(filtered).toHaveLength(2)
    expect(filtered.every((e) => e.type === "NEW_PRODUCT")).toBe(true)
  })

  it("filtra por múltiples tipos", () => {
    const result = makeDiffResult([
      makeEvent("NEW_PRODUCT"),
      makeEvent("PRICE_DROP"),
      makeEvent("RESTOCK"),
      makeEvent("OUT_OF_STOCK"),
    ])

    const filtered = filterEvents(result, "PRICE_DROP", "RESTOCK")
    expect(filtered).toHaveLength(2)
    expect(filtered.map((e) => e.type)).toEqual(["PRICE_DROP", "RESTOCK"])
  })

  it("retorna array vacío cuando no hay coincidencias", () => {
    const result = makeDiffResult([
      makeEvent("NEW_PRODUCT"),
      makeEvent("RESTOCK"),
    ])

    const filtered = filterEvents(result, "PRICE_DROP")
    expect(filtered).toHaveLength(0)
  })

  it("retorna array vacío si no hay eventos", () => {
    const result = makeDiffResult([])

    const filtered = filterEvents(result, "NEW_PRODUCT")
    expect(filtered).toHaveLength(0)
  })

  it("preserva los datos del evento original", () => {
    const event = makeEvent("PRICE_DROP", {
      variantId: "var-1",
      data: { priceBefore: 100, priceAfter: 80 },
    })
    const result = makeDiffResult([event])

    const filtered = filterEvents(result, "PRICE_DROP")
    expect(filtered[0]).toBe(event) // misma referencia
    expect(filtered[0].data).toEqual({ priceBefore: 100, priceAfter: 80 })
  })
})

describe("diffSummary", () => {
  it("genera un resumen con conteos por tipo", () => {
    const result = makeDiffResult([
      makeEvent("NEW_PRODUCT"),
      makeEvent("NEW_PRODUCT"),
      makeEvent("PRICE_DROP"),
      makeEvent("RESTOCK"),
    ])

    const summary = diffSummary(result)

    expect(summary).toContain("brand-1")
    expect(summary).toContain("4 events")
    expect(summary).toContain("NEW_PRODUCT: 2")
    expect(summary).toContain("PRICE_DROP: 1")
    expect(summary).toContain("RESTOCK: 1")
    expect(summary).toContain("10 products")
    expect(summary).toContain("25 variants")
  })

  it("genera resumen para resultado sin eventos", () => {
    const result = makeDiffResult([])

    const summary = diffSummary(result)

    expect(summary).toContain("0 events")
    expect(summary).toContain("brand-1")
  })

  it("incluye el prefijo [diff]", () => {
    const result = makeDiffResult([makeEvent("RESTOCK")])
    const summary = diffSummary(result)
    expect(summary).toMatch(/^\[diff\]/)
  })
})
