import { prisma } from "@/lib/prisma"
import { ExchangeRatesClient } from "./exchange-rates-client"
import { NotificationsClient } from "./notifications-client"

async function getExchangeRates() {
  return prisma.exchangeRate.findMany({
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  })
}

async function getAlertConfigs() {
  return prisma.brandAlert.findMany({
    include: { brand: { select: { name: true } } },
    orderBy: [{ brand: { name: "asc" } }, { type: "asc" }],
  })
}

export default async function SettingsPage() {
  const [rates, alerts] = await Promise.all([
    getExchangeRates(),
    getAlertConfigs(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tipos de cambio, notificaciones y preferencias de visualización
        </p>
      </div>

      <ExchangeRatesClient rates={JSON.parse(JSON.stringify(rates))} />

      <NotificationsClient alerts={JSON.parse(JSON.stringify(alerts))} />
    </div>
  )
}
