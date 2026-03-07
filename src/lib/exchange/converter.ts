import { prisma } from "@/lib/prisma"

/**
 * Obtiene la tasa de cambio más reciente para un par de monedas
 * en o antes de la fecha dada.
 *
 * Estrategia de lookup:
 *   1. Directo: fromCurrency → toCurrency
 *   2. Inverso: toCurrency → fromCurrency (1/rate)
 *   3. Triangulación via USD: from → USD → to
 */
export async function getRate(
  fromCurrency: string,
  toCurrency: string,
  date?: Date,
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1

  const asOf = date ?? new Date()

  // 1) Directo
  const direct = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency,
      toCurrency,
      effectiveDate: { lte: asOf },
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  })

  if (direct) return Number(direct.rate)

  // 2) Inverso
  const inverse = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrency: toCurrency,
      toCurrency: fromCurrency,
      effectiveDate: { lte: asOf },
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  })

  if (inverse) return 1 / Number(inverse.rate)

  // 3) Triangulación via USD
  if (fromCurrency !== "USD" && toCurrency !== "USD") {
    const fromToUsd = await getRate(fromCurrency, "USD", date)
    const usdToTarget = await getRate("USD", toCurrency, date)
    if (fromToUsd !== null && usdToTarget !== null) {
      return fromToUsd * usdToTarget
    }
  }

  return null
}

/**
 * Convierte un monto entre monedas.
 */
export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date?: Date,
): Promise<{ converted: number; rate: number } | null> {
  const rate = await getRate(fromCurrency, toCurrency, date)
  if (rate === null) return null
  return { converted: amount * rate, rate }
}

/**
 * Batch-convert: convierte un array de { amount, currency } a targetCurrency.
 * Cachea tasas por moneda para evitar queries repetidas.
 */
export async function batchConvert(
  items: Array<{ amount: number; currency: string }>,
  targetCurrency: string,
  date?: Date,
): Promise<Array<{ converted: number; rate: number; hasRate: boolean }>> {
  const rateCache = new Map<string, number | null>()

  const results = []
  for (const item of items) {
    const key = item.currency
    if (!rateCache.has(key)) {
      rateCache.set(key, await getRate(key, targetCurrency, date))
    }
    const rate = rateCache.get(key)!
    results.push({
      converted: rate !== null ? item.amount * rate : item.amount,
      rate: rate ?? 1,
      hasRate: rate !== null || item.currency === targetCurrency,
    })
  }
  return results
}
