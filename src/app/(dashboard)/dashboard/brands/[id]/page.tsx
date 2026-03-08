import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { notFound } from "next/navigation"

const ALERT_TYPE_COLORS: Record<string, string> = {
  NEW_PRODUCTS: "bg-blue-100 text-blue-800",
  PRICE_CHANGE: "bg-yellow-100 text-yellow-800",
  PRICE_DROP: "bg-green-100 text-green-800",
  RESTOCK: "bg-emerald-100 text-emerald-800",
  HIGH_VELOCITY: "bg-purple-100 text-purple-800",
  VARIANT_ADDED: "bg-indigo-100 text-indigo-800",
  DISCOUNT_START: "bg-orange-100 text-orange-800",
  DISCOUNT_END: "bg-gray-100 text-gray-800",
  OUT_OF_STOCK: "bg-red-100 text-red-800",
  PRODUCT_REMOVED: "bg-rose-100 text-rose-800",
}

const SCRAPE_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { label: "Pendiente", variant: "outline" },
  RUNNING: { label: "Ejecutando", variant: "secondary" },
  COMPLETED: { label: "Completado", variant: "default" },
  FAILED: { label: "Fallido", variant: "destructive" },
}

function formatDate(date: Date | null | undefined) {
  if (!date) return "—"
  return date.toLocaleDateString("es-MX", { month: "short", day: "numeric" })
}

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—"
  return date.toLocaleDateString("es-MX", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ScrapeButton({ brandId }: { brandId: string }) {
  return (
    <form action={`/api/brands/${brandId}/scrape`} method="POST">
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
      >
        Iniciar scrape
      </button>
    </form>
  )
}

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      scrapeJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, completedAt: true, createdAt: true },
      },
    },
  })

  if (!brand) notFound()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const latestScoreDate = await prisma.winnerScore.findFirst({
    where: { brandId: id },
    orderBy: { scoreDate: "desc" },
    select: { scoreDate: true },
  })

  const [
    activeProducts,
    recentLaunches,
    activeDiscounts,
    recentRestocks,
    topWinnersCount,
    products,
    recentEvents,
    topWinners,
  ] = await Promise.all([
    // KPI: active products
    prisma.product.count({
      where: { brandId: id, isActive: true },
    }),
    // KPI: recent launches
    prisma.product.count({
      where: { brandId: id, isLaunch: true, launchDate: { gte: sevenDaysAgo } },
    }),
    // KPI: active discounts (variants with compareAtPrice)
    prisma.variant.count({
      where: {
        compareAtPrice: { not: null },
        product: { brandId: id },
      },
    }),
    // KPI: recent restocks
    prisma.salesEstimate.count({
      where: { brandId: id, wasRestock: true, date: { gte: sevenDaysAgo } },
    }),
    // KPI: top winners count
    latestScoreDate
      ? prisma.winnerScore.count({
          where: {
            brandId: id,
            winnerScore: { gt: 70 },
            scoreDate: latestScoreDate.scoreDate,
          },
        })
      : 0,
    // Products table
    prisma.product.findMany({
      where: { brandId: id },
      orderBy: { lastSeenAt: "desc" },
      include: {
        variants: {
          select: { price: true },
        },
      },
    }),
    // Recent events
    prisma.alertEvent.findMany({
      where: {
        alert: { brandId: id },
      },
      orderBy: { triggeredAt: "desc" },
      take: 20,
      include: {
        alert: { select: { type: true } },
      },
    }),
    // Top winners
    latestScoreDate
      ? prisma.winnerScore.findMany({
          where: { brandId: id, scoreDate: latestScoreDate.scoreDate },
          orderBy: { winnerScore: "desc" },
          take: 10,
          include: {
            product: { select: { id: true, title: true } },
          },
        })
      : [],
  ])

  const lastScrape = brand.scrapeJobs[0] ?? null
  const scrapeStatusInfo = lastScrape
    ? SCRAPE_STATUS_LABELS[lastScrape.status] ?? { label: lastScrape.status, variant: "outline" as const }
    : null

  return (
    <div className="space-y-6">
      {/* ── Brand Header ── */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{brand.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`https://${brand.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                {brand.domain}
              </a>
              {brand.platformType && (
                <Badge variant="secondary">{brand.platformType}</Badge>
              )}
              <Badge variant="outline">{brand.category}</Badge>
              {brand.country && (
                <span className="text-sm text-muted-foreground">
                  {brand.country}
                </span>
              )}
            </div>
            {lastScrape && scrapeStatusInfo && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Ultimo scrape:</span>
                <Badge variant={scrapeStatusInfo.variant}>
                  {scrapeStatusInfo.label}
                </Badge>
                <span>{formatDateTime(lastScrape.completedAt ?? lastScrape.createdAt)}</span>
              </div>
            )}
          </div>
          <ScrapeButton brandId={brand.id} />
        </CardContent>
      </Card>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Productos activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeProducts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lanzamientos recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentLaunches}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Descuentos activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeDiscounts}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Restocks recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentRestocks}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top ganadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{topWinnersCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs: Productos / Eventos / Ganadores ── */}
      <Tabs defaultValue="productos">
        <TabsList>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="ganadores">Ganadores</TabsTrigger>
        </TabsList>

        {/* ── Products Table ── */}
        <TabsContent value="productos">
          <Card>
            <CardHeader>
              <CardTitle>Productos</CardTitle>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No se encontraron productos para esta marca.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Imagen</TableHead>
                      <TableHead>Titulo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Variantes</TableHead>
                      <TableHead>Rango de precio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Primera vez</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => {
                      const prices = product.variants.map((v) => Number(v.price))
                      const minPrice = prices.length > 0 ? Math.min(...prices) : null
                      const maxPrice = prices.length > 0 ? Math.max(...prices) : null
                      const priceRange =
                        minPrice !== null && maxPrice !== null
                          ? minPrice === maxPrice
                            ? `$${minPrice.toFixed(2)}`
                            : `$${minPrice.toFixed(2)} – $${maxPrice.toFixed(2)}`
                          : "—"

                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.title}
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/dashboard/products/${product.id}`}
                              className="font-medium hover:underline"
                            >
                              {product.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {product.productType ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.variants.length}
                          </TableCell>
                          <TableCell className="text-sm">{priceRange}</TableCell>
                          <TableCell>
                            <Badge
                              variant={product.isActive ? "default" : "secondary"}
                            >
                              {product.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(product.firstSeenAt)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Recent Events ── */}
        <TabsContent value="eventos">
          <Card>
            <CardHeader>
              <CardTitle>Eventos recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {recentEvents.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay eventos recientes para esta marca.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentEvents.map((event) => {
                    const colorClass =
                      ALERT_TYPE_COLORS[event.alert.type] ??
                      "bg-gray-100 text-gray-800"
                    return (
                      <div
                        key={event.id}
                        className="flex items-start justify-between gap-4 rounded-md border p-3"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
                            >
                              {event.alert.type.replaceAll("_", " ")}
                            </span>
                            {!event.isRead && (
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-sm">{event.message}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(event.triggeredAt)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Top Winners ── */}
        <TabsContent value="ganadores">
          <Card>
            <CardHeader>
              <CardTitle>Top ganadores</CardTitle>
            </CardHeader>
            <CardContent>
              {topWinners.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay datos de ganadores para esta marca.
                </p>
              ) : (
                <div className="space-y-4">
                  {topWinners.map((winner) => {
                    const reasonCodes = Array.isArray(winner.reasonCodes)
                      ? (winner.reasonCodes as string[])
                      : []
                    return (
                      <div
                        key={winner.id}
                        className="flex flex-col gap-2 rounded-md border p-4"
                      >
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/dashboard/products/${winner.product.id}`}
                            className="font-medium hover:underline"
                          >
                            {winner.product.title}
                          </Link>
                          <span className="text-sm font-semibold">
                            {winner.winnerScore.toFixed(0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary transition-all"
                              style={{
                                width: `${Math.min(winner.winnerScore, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Confianza: {(winner.confidenceScore * 100).toFixed(0)}%
                          </span>
                        </div>
                        {reasonCodes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {reasonCodes.map((code) => (
                              <Badge key={code} variant="outline" className="text-xs">
                                {code}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
