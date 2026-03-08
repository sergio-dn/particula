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

const fmtDate = (d: Date) =>
  d.toLocaleDateString("es-MX", { month: "short", day: "numeric" })

const fmtDateFull = (d: Date) =>
  d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const fmtCurrency = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "USD" })

const fmtPct = (n: number) => `${Math.round(n * 100)}%`

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

const componentScoreLabels: Record<string, string> = {
  salesVelocity: "Velocidad de ventas",
  restockFrequency: "Frecuencia de restock",
  stockoutSignal: "Senal de agotamiento",
  longevity: "Longevidad",
  priceStability: "Estabilidad de precio",
  catalogProminence: "Prominencia en catalogo",
}

const confidenceTierColors: Record<string, string> = {
  A: "bg-green-50 text-green-700 border-green-200",
  B: "bg-yellow-50 text-yellow-700 border-yellow-200",
  C: "bg-red-50 text-red-700 border-red-200",
}

async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true } },
      variants: {
        orderBy: { title: "asc" },
      },
      winnerScores: {
        orderBy: { date: "desc" },
        take: 1,
        select: {
          id: true,
          compositeScore: true,
          date: true,
          confidenceTier: true,
          salesVelocity: true,
          restockFrequency: true,
          stockoutSignal: true,
          longevity: true,
          priceStability: true,
          catalogProminence: true,
          reasonCodes: true,
          createdAt: true,
        },
      },
    },
  })
}

async function getPriceHistory(variantIds: string[]) {
  if (variantIds.length === 0) return []
  return prisma.priceHistory.findMany({
    where: { variantId: { in: variantIds } },
    orderBy: { recordedAt: "desc" },
    take: 20,
    include: {
      variant: { select: { title: true } },
    },
  })
}

async function getInventorySnapshots(variantIds: string[]) {
  if (variantIds.length === 0) return []
  return prisma.inventorySnapshot.findMany({
    where: { variantId: { in: variantIds } },
    orderBy: { snapshotAt: "desc" },
    take: 20,
    include: {
      variant: { select: { title: true } },
    },
  })
}

async function getSalesEstimates(variantIds: string[]) {
  if (variantIds.length === 0) return []
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return prisma.salesEstimate.findMany({
    where: {
      variantId: { in: variantIds },
      date: { gte: since },
    },
    orderBy: [{ date: "desc" }, { variantId: "asc" }],
    select: {
      id: true,
      date: true,
      unitsSold: true,
      revenueEstimate: true,
      wasRestock: true,
      estimationMethod: true,
      confidenceScore: true,
      variant: { select: { title: true } },
    },
  })
}

async function getAlertEvents(brandId: string) {
  return prisma.alertEvent.findMany({
    where: {
      alert: { brandId },
    },
    orderBy: { triggeredAt: "desc" },
    take: 10,
    include: {
      alert: {
        include: {
          brand: { select: { name: true } },
        },
      },
    },
  })
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProduct(id)

  if (!product) notFound()

  const variantIds = product.variants.map((v) => v.id)

  const [priceHistory, inventorySnapshots, salesEstimates, alertEvents] =
    await Promise.all([
      getPriceHistory(variantIds),
      getInventorySnapshots(variantIds),
      getSalesEstimates(variantIds),
      getAlertEvents(product.brandId),
    ])

  const winnerScore = product.winnerScores[0] ?? null

  // Group sales estimates by date
  const salesByDate = new Map<string, typeof salesEstimates>()
  for (const se of salesEstimates) {
    const key = se.date.toISOString().slice(0, 10)
    if (!salesByDate.has(key)) salesByDate.set(key, [])
    salesByDate.get(key)!.push(se)
  }

  return (
    <div className="space-y-6">
      {/* Product Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-6">
            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt={product.title}
                className="h-32 w-32 rounded-lg object-cover border"
              />
            )}
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {product.title}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {product.productType && (
                    <Badge variant="secondary">{product.productType}</Badge>
                  )}
                  <Link
                    href={`/dashboard/brands/${product.brand.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {product.brand.name}
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={product.isActive ? "default" : "destructive"}>
                  {product.isActive ? "Activo" : "Inactivo"}
                </Badge>
                {product.isLaunch && (
                  <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                    Lanzamiento
                  </Badge>
                )}
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                {product.firstSeenAt && (
                  <span>
                    Primera vez: {fmtDateFull(product.firstSeenAt)}
                  </span>
                )}
                {product.lastSeenAt && (
                  <span>
                    Ultima vez: {fmtDateFull(product.lastSeenAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="variants">
        <TabsList>
          <TabsTrigger value="variants">Variantes</TabsTrigger>
          <TabsTrigger value="prices">Historial de precios</TabsTrigger>
          <TabsTrigger value="inventory">Inventario</TabsTrigger>
          <TabsTrigger value="sales">Ventas estimadas</TabsTrigger>
          <TabsTrigger value="winner">Winner Score</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
        </TabsList>

        {/* Variants Table */}
        <TabsContent value="variants">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Variantes ({product.variants.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {product.variants.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin variantes registradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titulo</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Opcion 1</TableHead>
                      <TableHead>Opcion 2</TableHead>
                      <TableHead>Opcion 3</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">
                        Precio comparado
                      </TableHead>
                      <TableHead>Disponibilidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((v) => {
                      const price = Number(v.price)
                      const compareAt = v.compareAtPrice
                        ? Number(v.compareAtPrice)
                        : null
                      const discount =
                        compareAt && compareAt > price
                          ? Math.round(((compareAt - price) / compareAt) * 100)
                          : null
                      return (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">
                            {v.title}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {v.sku || "-"}
                          </TableCell>
                          <TableCell>{v.option1 || "-"}</TableCell>
                          <TableCell>{v.option2 || "-"}</TableCell>
                          <TableCell>{v.option3 || "-"}</TableCell>
                          <TableCell className="text-right">
                            {fmtCurrency(price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {compareAt ? (
                              <span>
                                {fmtCurrency(compareAt)}
                                {discount && (
                                  <Badge
                                    variant="secondary"
                                    className="ml-1 bg-red-50 text-red-700 text-xs"
                                  >
                                    -{discount}%
                                  </Badge>
                                )}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                v.isAvailable
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              }
                            >
                              {v.isAvailable ? "Disponible" : "Agotado"}
                            </Badge>
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

        {/* Price History */}
        <TabsContent value="prices">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de precios (ultimos 20 registros)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {priceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin historial de precios.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variante</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">
                        Precio comparado
                      </TableHead>
                      <TableHead>Cambio</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceHistory.map((ph, i) => {
                      const price = Number(ph.price)
                      const prevRecord = priceHistory[i + 1]
                      const prevPrice = prevRecord
                        ? Number(prevRecord.price)
                        : null
                      const direction =
                        prevPrice !== null
                          ? price > prevPrice
                            ? "up"
                            : price < prevPrice
                              ? "down"
                              : "same"
                          : null
                      return (
                        <TableRow key={ph.id}>
                          <TableCell className="font-medium">
                            {ph.variant.title}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtCurrency(price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {ph.compareAtPrice
                              ? fmtCurrency(Number(ph.compareAtPrice))
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {direction === "up" && (
                              <span className="text-red-600 font-medium">
                                ↑ Subio
                              </span>
                            )}
                            {direction === "down" && (
                              <span className="text-green-600 font-medium">
                                ↓ Bajo
                              </span>
                            )}
                            {direction === "same" && (
                              <span className="text-muted-foreground">
                                = Igual
                              </span>
                            )}
                            {direction === null && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtDateFull(ph.recordedAt)}
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

        {/* Inventory / Availability History */}
        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de inventario (ultimos 20 registros)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inventorySnapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin registros de inventario.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variante</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Disponible</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventorySnapshots.map((snap) => (
                      <TableRow key={snap.id}>
                        <TableCell className="font-medium">
                          {snap.variant.title}
                        </TableCell>
                        <TableCell className="text-right">
                          {snap.quantity}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              snap.isAvailable
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            }
                          >
                            {snap.isAvailable ? "Si" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDateFull(snap.snapshotAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Estimates */}
        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ventas estimadas (ultimos 30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesEstimates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin estimaciones de ventas.
                </p>
              ) : (
                <div className="space-y-6">
                  {Array.from(salesByDate.entries()).map(([dateKey, items]) => {
                    const totalUnits = items.reduce(
                      (sum, s) => sum + s.unitsSold,
                      0
                    )
                    const totalRevenue = items.reduce(
                      (sum, s) => sum + Number(s.revenueEstimate),
                      0
                    )
                    return (
                      <div key={dateKey} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">
                            {fmtDateFull(new Date(dateKey))}
                          </h3>
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>
                              Total unidades:{" "}
                              <span className="font-medium text-foreground">
                                {totalUnits}
                              </span>
                            </span>
                            <span>
                              Total ingresos:{" "}
                              <span className="font-medium text-foreground">
                                {fmtCurrency(totalRevenue)}
                              </span>
                            </span>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Variante</TableHead>
                              <TableHead className="text-right">
                                Unidades
                              </TableHead>
                              <TableHead className="text-right">
                                Ingresos
                              </TableHead>
                              <TableHead>Metodo</TableHead>
                              <TableHead className="text-right">
                                Confianza
                              </TableHead>
                              <TableHead>Restock</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((se) => (
                              <TableRow key={se.id}>
                                <TableCell className="font-medium">
                                  {se.variant.title}
                                </TableCell>
                                <TableCell className="text-right">
                                  {se.unitsSold}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtCurrency(Number(se.revenueEstimate))}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                    {se.estimationMethod}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtPct(se.confidenceScore)}
                                </TableCell>
                                <TableCell>
                                  {se.wasRestock && (
                                    <Badge
                                      variant="secondary"
                                      className="bg-green-50 text-green-700 text-xs"
                                    >
                                      Restock
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Winner Score */}
        <TabsContent value="winner">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Winner Score</CardTitle>
            </CardHeader>
            <CardContent>
              {!winnerScore ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin winner score calculado.
                </p>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="text-5xl font-bold">
                        {Math.round(winnerScore.compositeScore)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        / 100
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Confianza
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          confidenceTierColors[winnerScore.confidenceTier] ??
                          "bg-gray-50 text-gray-700 border-gray-200"
                        }
                      >
                        Tier {winnerScore.confidenceTier}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Fecha</div>
                      <div className="text-sm">
                        {fmtDateFull(winnerScore.date)}
                      </div>
                    </div>
                  </div>

                  {/* Component Scores Breakdown */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">
                      Desglose de componentes
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          "salesVelocity",
                          "restockFrequency",
                          "stockoutSignal",
                          "longevity",
                          "priceStability",
                          "catalogProminence",
                        ] as const
                      ).map((key) => (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <span className="text-sm">
                            {componentScoreLabels[key] ?? key}
                          </span>
                          <span className="text-sm font-semibold">
                            {Math.round(winnerScore[key])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reason Codes */}
                  {winnerScore.reasonCodes &&
                    winnerScore.reasonCodes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">
                          Razones
                        </h4>
                        <div className="flex gap-2 flex-wrap">
                          {winnerScore.reasonCodes.map((code, idx) => (
                            <Badge
                              key={idx}
                              className="bg-indigo-50 text-indigo-700 border-indigo-200"
                            >
                              {code}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Related Events */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Eventos relacionados (ultimos 10)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alertEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Sin eventos relacionados.
                </p>
              ) : (
                <div className="divide-y">
                  {alertEvents.map((event) => (
                    <div key={event.id} className="py-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs border rounded-full px-2 py-0.5 ${
                            alertTypeColors[event.alert.type] ??
                            "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {alertTypeLabels[event.alert.type] ??
                            event.alert.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {event.alert.brand.name}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {fmtDateFull(event.triggeredAt)}
                        </span>
                      </div>
                      <p className="text-sm">{event.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
