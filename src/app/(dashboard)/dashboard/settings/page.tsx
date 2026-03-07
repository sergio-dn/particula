import { prisma } from "@/lib/prisma"
import { ExchangeRatesClient } from "./exchange-rates-client"

async function getExchangeRates() {
  return prisma.exchangeRate.findMany({
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  })
}

export default async function SettingsPage() {
  const rates = await getExchangeRates()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tipos de cambio y preferencias de visualización
        </p>
      </div>

      <ExchangeRatesClient rates={JSON.parse(JSON.stringify(rates))} />
    </div>
  )
}
