import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Mapa de moneda → locale para Intl.NumberFormat.
 * Se puede extender según se necesite.
 */
const CURRENCY_LOCALE: Record<string, string> = {
  CLP: "es-CL",
  USD: "en-US",
  EUR: "es-ES",
  MXN: "es-MX",
  ARS: "es-AR",
  COP: "es-CO",
  PEN: "es-PE",
  BRL: "pt-BR",
  GBP: "en-GB",
}

/**
 * Formatea un precio con símbolo de moneda y separador de miles.
 *
 * Ejemplos:
 *   formatPrice(9990, "CLP")  → "CLP 9.990"       (sin decimales)
 *   formatPrice(169, "EUR")   → "€169,00"
 *   formatPrice(49.99, "USD") → "US$49.99"
 *   formatPrice(49.99)        → "US$49.99"          (default USD)
 */
export function formatPrice(
  value: unknown,
  currency?: string | null,
): string {
  if (value == null) return "—"
  const num = Number(value)
  if (isNaN(num)) return "—"

  const code = (currency ?? "USD").toUpperCase()
  const locale = CURRENCY_LOCALE[code] ?? "en-US"

  // Monedas sin centavos (ej. CLP, COP, KRW, JPY)
  const noCents = ["CLP", "COP", "KRW", "JPY", "VND", "ISK"]
  const decimals = noCents.includes(code) ? 0 : 2

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Versión compacta para gráficos — ej: "$49.9k", "CLP 9.9M"
 */
export function formatPriceCompact(
  value: unknown,
  currency = "USD",
): string {
  if (value == null) return "—"
  const num = Number(value)
  if (isNaN(num)) return "—"

  const code = currency.toUpperCase()
  const locale = CURRENCY_LOCALE[code] ?? "en-US"

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num)
}
