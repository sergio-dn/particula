// Mock de prisma necesario porque sales.ts importa prisma al cargar el módulo
jest.mock("@/lib/prisma", () => require("../__mocks__/prisma"))

import {
  getConfidenceTier,
  getConfidenceLabel,
  CONFIDENCE_TIERS,
} from "@/lib/estimators/sales"

describe("getConfidenceTier", () => {
  it("retorna 'A' para score >= 0.8", () => {
    expect(getConfidenceTier(0.8)).toBe("A")
    expect(getConfidenceTier(0.9)).toBe("A")
    expect(getConfidenceTier(1.0)).toBe("A")
  })

  it("retorna 'B' para score >= 0.5 y < 0.8", () => {
    expect(getConfidenceTier(0.5)).toBe("B")
    expect(getConfidenceTier(0.6)).toBe("B")
    expect(getConfidenceTier(0.79)).toBe("B")
  })

  it("retorna 'C' para score < 0.5", () => {
    expect(getConfidenceTier(0.49)).toBe("C")
    expect(getConfidenceTier(0.3)).toBe("C")
    expect(getConfidenceTier(0)).toBe("C")
  })

  it("boundary exacto en 0.8 es 'A'", () => {
    expect(getConfidenceTier(0.8)).toBe("A")
  })

  it("boundary exacto en 0.5 es 'B'", () => {
    expect(getConfidenceTier(0.5)).toBe("B")
  })
})

describe("getConfidenceLabel", () => {
  it("retorna label del tier A para score alto", () => {
    expect(getConfidenceLabel(0.9)).toBe(CONFIDENCE_TIERS.A.label)
    expect(getConfidenceLabel(0.9)).toBe("Inventario exacto")
  })

  it("retorna label del tier B para score medio", () => {
    expect(getConfidenceLabel(0.6)).toBe(CONFIDENCE_TIERS.B.label)
    expect(getConfidenceLabel(0.6)).toBe("Proxy de disponibilidad")
  })

  it("retorna label del tier C para score bajo", () => {
    expect(getConfidenceLabel(0.3)).toBe(CONFIDENCE_TIERS.C.label)
    expect(getConfidenceLabel(0.3)).toBe("Señal de catálogo")
  })

  it("los labels coinciden con las constantes definidas", () => {
    expect(getConfidenceLabel(1.0)).toBe(CONFIDENCE_TIERS.A.label)
    expect(getConfidenceLabel(0.79)).toBe(CONFIDENCE_TIERS.B.label)
    expect(getConfidenceLabel(0.0)).toBe(CONFIDENCE_TIERS.C.label)
  })
})

describe("CONFIDENCE_TIERS", () => {
  it("tiene los 3 tiers con scores correctos", () => {
    expect(CONFIDENCE_TIERS.A.score).toBe(0.9)
    expect(CONFIDENCE_TIERS.B.score).toBe(0.6)
    expect(CONFIDENCE_TIERS.C.score).toBe(0.3)
  })

  it("tiene los methods correctos", () => {
    expect(CONFIDENCE_TIERS.A.method).toBe("cart_probe")
    expect(CONFIDENCE_TIERS.B.method).toBe("available_delta")
    expect(CONFIDENCE_TIERS.C.method).toBe("catalog_signal")
  })
})
