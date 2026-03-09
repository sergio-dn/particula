import { prisma } from "@/lib/prisma"
import { ExchangeRatesClient } from "./exchange-rates-client"
import { NotificationsClient } from "./notifications-client"
import { AlertTriangle } from "lucide-react"

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

function ErrorBanner({ section }: { section: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>No se pudo cargar la sección de {section}. Verifica la conexión a la base de datos.</span>
    </div>
  )
}

export default async function SettingsPage() {
  let rates: Awaited<ReturnType<typeof getExchangeRates>> = []
  let alerts: Awaited<ReturnType<typeof getAlertConfigs>> = []
  let ratesError = false
  let alertsError = false

  try {
    rates = await getExchangeRates()
  } catch {
    ratesError = true
  }

  try {
    alerts = await getAlertConfigs()
  } catch {
    alertsError = true
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tipos de cambio, notificaciones y preferencias de visualización
        </p>
      </div>

      {ratesError ? (
        <ErrorBanner section="tipos de cambio" />
      ) : (
        <ExchangeRatesClient rates={JSON.parse(JSON.stringify(rates))} />
      )}

      {alertsError ? (
        <ErrorBanner section="notificaciones" />
      ) : (
        <NotificationsClient alerts={JSON.parse(JSON.stringify(alerts))} />
      )}
    </div>
  )
}
