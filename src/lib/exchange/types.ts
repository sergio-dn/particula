/**
 * Interfaz para proveedores de tasas de cambio.
 * Hoy: entrada manual via UI.
 * Mañana: API externa (OpenExchangeRates, ECB, etc.)
 *
 * Cualquier proveedor escribe a la misma tabla ExchangeRate via Prisma.
 */
export interface RateProvider {
  /** Nombre del proveedor (ej: "openexchangerates", "ecb") */
  readonly name: string

  /**
   * Obtiene tasas para las monedas dadas y las persiste en la tabla ExchangeRate.
   * @param currencies - Códigos ISO 4217 (ej: ["EUR", "CLP", "MXN"])
   * @param date - Fecha para la que obtener tasas. Si no se provee, usa hoy.
   */
  fetchRates(currencies: string[], date?: Date): Promise<void>
}
