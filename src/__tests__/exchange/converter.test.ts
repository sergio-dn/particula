/**
 * Tests para converter.ts — conversión de monedas con rates de Prisma.
 */

jest.mock("@/lib/prisma", () => require("../__mocks__/prisma"))

import { prisma } from "@/lib/prisma"
import { getRate, convertAmount, batchConvert } from "@/lib/exchange/converter"

const mockFindFirst = prisma.exchangeRate.findFirst as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe("getRate", () => {
  it("retorna 1 cuando fromCurrency === toCurrency", async () => {
    const rate = await getRate("USD", "USD")
    expect(rate).toBe(1)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it("retorna rate directo cuando existe", async () => {
    mockFindFirst.mockResolvedValueOnce({ rate: 950 })

    const rate = await getRate("USD", "CLP")
    expect(rate).toBe(950)
  })

  it("retorna rate inverso (1/rate) cuando directo no existe", async () => {
    mockFindFirst
      .mockResolvedValueOnce(null) // directo no existe
      .mockResolvedValueOnce({ rate: 0.001 }) // inverso existe

    const rate = await getRate("CLP", "USD")
    expect(rate).toBeCloseTo(1000)
  })

  it("triangula via USD cuando directo e inverso no existen", async () => {
    // getRate("CLP", "EUR")
    mockFindFirst
      .mockResolvedValueOnce(null) // CLP→EUR directo
      .mockResolvedValueOnce(null) // EUR→CLP inverso
    // Triangulación: getRate("CLP", "USD")
    mockFindFirst
      .mockResolvedValueOnce({ rate: 0.001 }) // CLP→USD directo
    // getRate("USD", "EUR")
    mockFindFirst
      .mockResolvedValueOnce({ rate: 0.92 }) // USD→EUR directo

    const rate = await getRate("CLP", "EUR")
    expect(rate).toBeCloseTo(0.001 * 0.92)
  })

  it("retorna null cuando no hay rate en ninguna dirección ni triangulación", async () => {
    mockFindFirst.mockResolvedValue(null) // siempre null

    const rate = await getRate("XYZ", "ABC")
    expect(rate).toBeNull()
  })
})

describe("convertAmount", () => {
  it("multiplica amount por rate", async () => {
    mockFindFirst.mockResolvedValueOnce({ rate: 950 })

    const result = await convertAmount(100, "USD", "CLP")
    expect(result).not.toBeNull()
    expect(result!.converted).toBe(95000)
    expect(result!.rate).toBe(950)
  })

  it("retorna null cuando no hay rate", async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await convertAmount(100, "XYZ", "ABC")
    expect(result).toBeNull()
  })

  it("retorna amount * 1 para misma moneda", async () => {
    const result = await convertAmount(42.5, "EUR", "EUR")
    expect(result).not.toBeNull()
    expect(result!.converted).toBe(42.5)
    expect(result!.rate).toBe(1)
  })
})

describe("batchConvert", () => {
  it("convierte múltiples items con caché de rates", async () => {
    // Primera llamada para USD→CLP
    mockFindFirst.mockResolvedValueOnce({ rate: 950 })

    const items = [
      { amount: 10, currency: "USD" },
      { amount: 20, currency: "USD" },
      { amount: 30, currency: "CLP" }, // misma moneda
    ]

    const results = await batchConvert(items, "CLP")

    expect(results).toHaveLength(3)
    expect(results[0].converted).toBe(9500)
    expect(results[0].rate).toBe(950)
    expect(results[0].hasRate).toBe(true)

    // Segundo item usa caché (mismo rate)
    expect(results[1].converted).toBe(19000)
    expect(results[1].rate).toBe(950)

    // Tercer item: CLP→CLP = rate 1
    expect(results[2].hasRate).toBe(true)
  })

  it("marca hasRate false cuando no hay rate disponible", async () => {
    mockFindFirst.mockResolvedValue(null) // ningún rate

    const items = [{ amount: 100, currency: "XYZ" }]
    const results = await batchConvert(items, "CLP")

    expect(results[0].hasRate).toBe(false)
    expect(results[0].converted).toBe(100) // sin conversión, devuelve amount original
    expect(results[0].rate).toBe(1) // fallback rate = 1
  })
})
