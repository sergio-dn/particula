/**
 * Tests para currencies.ts — SUPPORTED_CURRENCIES y getCurrencyName.
 */

import { getCurrencyName, SUPPORTED_CURRENCIES } from "@/lib/exchange/currencies"

describe("SUPPORTED_CURRENCIES", () => {
  it("contiene al menos las monedas principales", () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code)
    expect(codes).toContain("USD")
    expect(codes).toContain("EUR")
    expect(codes).toContain("GBP")
    expect(codes).toContain("CLP")
    expect(codes).toContain("MXN")
    expect(codes).toContain("BRL")
  })

  it("cada moneda tiene code, name y symbol", () => {
    for (const currency of SUPPORTED_CURRENCIES) {
      expect(currency.code).toBeTruthy()
      expect(currency.name).toBeTruthy()
      expect(currency.symbol).toBeTruthy()
      expect(currency.code).toHaveLength(3)
    }
  })

  it("no tiene códigos duplicados", () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })
})

describe("getCurrencyName", () => {
  it("retorna el nombre para monedas conocidas", () => {
    expect(getCurrencyName("USD")).toBe("US Dollar")
    expect(getCurrencyName("EUR")).toBe("Euro")
    expect(getCurrencyName("CLP")).toBe("Chilean Peso")
    expect(getCurrencyName("JPY")).toBe("Japanese Yen")
  })

  it("retorna el código cuando la moneda no está soportada", () => {
    expect(getCurrencyName("XYZ")).toBe("XYZ")
    expect(getCurrencyName("UNKNOWN")).toBe("UNKNOWN")
  })

  it("es case-sensitive (solo mayúsculas matchean)", () => {
    expect(getCurrencyName("usd")).toBe("usd") // no matchea
    expect(getCurrencyName("USD")).toBe("US Dollar")
  })
})
