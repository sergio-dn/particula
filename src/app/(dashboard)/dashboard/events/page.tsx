import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

async function getAlertEvents() {
  return prisma.alertEvent.findMany({
    orderBy: { triggeredAt: "desc" },
    take: 50,
    include: {
      alert: {
        include: {
          brand: { select: { name: true } },
        },
      },
    },
  })
}

async function getRestocks() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  return prisma.salesEstimate.findMany({
    where: { wasRestock: true, date: { gte: since } },
    orderBy: { date: "desc" },
    take: 20,
    include: {
      brand: { select: { name: true } },
      variant: {
        include: {
          product: { select: { title: true, imageUrl: true } },
        },
      },
    },
  })
}

const alertTypeLabels: Record<string, string> = {
  NEW_PRODUCTS: "Nuevos productos",
  PRICE_CHANGE: "Cambio de precio",
  PRICE_DROP: "Descuento detectado",
  RESTOCK: "Restock",
  HIGH_VELOCITY: "Alta velocidad",
}

const alertTypeColors: Record<string, string> = {
  NEW_PRODUCTS: "bg-blue-50 text-blue-700 border-blue-200",
  PRICE_CHANGE: "bg-yellow-50 text-yellow-700 border-yellow-200",
  PRICE_DROP: "bg-red-50 text-red-700 border-red-200",
  RESTOCK: "bg-green-50 text-green-700 border-green-200",
  HIGH_VELOCITY: "bg-purple-50 text-purple-700 border-purple-200",
}

export default async function EventsPage() {
  const [events, restocks] = await Promise.all([getAlertEvents(), getRestocks()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Eventos & Promos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alertas, restocks y actividad reciente de las marcas
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin alertas. Configura alertas en el panel de marcas.
              </p>
            ) : (
              <div className="divide-y">
                {events.map((event) => (
                  <div key={event.id} className="py-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs border rounded-full px-2 py-0.5 ${
                          alertTypeColors[event.alert.type] ?? ""
                        }`}
                      >
                        {alertTypeLabels[event.alert.type] ?? event.alert.type}
                      </span>
                      <span className="text-xs font-medium">{event.alert.brand.name}</span>
                    </div>
                    <p className="text-sm">{event.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.triggeredAt).toLocaleDateString("es-MX", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restocks (7 días)</CardTitle>
          </CardHeader>
          <CardContent>
            {restocks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin restocks detectados esta semana.
              </p>
            ) : (
              <div className="divide-y">
                {restocks.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2.5">
                    {r.variant.product.imageUrl ? (
                      <img
                        src={r.variant.product.imageUrl}
                        alt={r.variant.product.title}
                        className="h-9 w-9 rounded-md object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-md bg-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.variant.product.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.brand.name} · {r.variant.title}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      Restock
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
