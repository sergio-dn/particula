/**
 * Tests para utils.ts — formatPrice y formatPriceCompact.
 */

import { formatPrice, formatPriceCompact } from "@/lib/utils"

describe("formatPrice", () => {
  it("formatea USD correctamente", () => {
    const result = formatPrice(49.99, "USD")
    // Debe contener el número y símbolo de dólar
    expect(result).toMatch(/49\.99/)
  })

  it("formatea CLP sin decimales", () => {
    const result = formatPrice(9990, "CLP")
    // CLP no tiene decimales
    expect(result).not.toMatch(/\.00/)
    expect(result).toMatch(/9/)
  })

  it("formatea EUR con 2 decimales", () => {
    const result = formatPrice(169, "EUR")
    expect(result).toMatch(/169/)
  })

  it("retorna '—' para null", () => {
    expect(formatPrice(null, "USD")).toBe("—")
  })

  it("retorna '—' para undefined", () => {
    expect(formatPrice(undefined, "USD")).toBe("—")
  })

  it("retorna '—' para NaN", () => {
    expect(formatPrice("not-a-number", "USD")).toBe("—")
  })

  it("usa USD como moneda default", () => {
    const result = formatPrice(49.99)
    expect(result).toMatch(/49\.99/)
  })

  it("maneja monedas en minúsculas", () => {
    const result = formatPrice(100, "usd")
    expect(result).toMatch(/100/)
  })

  it("formatea valor 0 correctamente (no como dash)", () => {
    const result = formatPrice(0, "USD")
    expect(result).not.toBe("—")
    expect(result).toMatch(/0/)
  })
})

describe("formatPriceCompact", () => {
  it("retorna '—' para null", () => {
    expect(formatPriceCompact(null)).toBe("—")
  })

  it("retorna '—' para undefined", () => {
    expect(formatPriceCompact(undefined)).toBe("—")
  })

  it("retorna '—' para NaN", () => {
    expect(formatPriceCompact("abc")).toBe("—")
  })

  it("formatea números grandes en notación compacta", () => {
    const result = formatPriceCompact(1_500_000, "USD")
    // Debe contener M o algo compacto
    expect(result).toMatch(/1\.5|2/)
  })

  it("formatea valores pequeños sin notación compacta", () => {
    const result = formatPriceCompact(50, "USD")
    expect(result).toMatch(/50/)
  })

  it("usa USD como moneda default", () => {
    const result = formatPriceCompact(1000)
    expect(result).toMatch(/1/)
  })

  it("formatea valor 0 correctamente", () => {
    const result = formatPriceCompact(0, "USD")
    expect(result).not.toBe("—")
  })
})
