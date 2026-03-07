export interface Currency {
  code: string
  name: string
  symbol: string
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "CLP", name: "Chilean Peso", symbol: "$" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
  { code: "ARS", name: "Argentine Peso", symbol: "$" },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
]

export function getCurrencyName(code: string): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.name ?? code
}
