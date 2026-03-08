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
import { TopSellersFilters } from "./top-sellers-filters"
import { formatPrice } from "@/lib/utils"
import { batchConvert } from "@/lib/exchange"
import Link from "next/link"

interface SearchParams {
  brandId?: string
  productType?: string
  days?: string
  displayCurrency?: string
}

async function getTopSellers(params: SearchParams) {
  const days = parseInt(params.days ?? "30", 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const estimates = await prisma.salesEstimate.groupBy({
    by: ["variantId"],
    where: {
      date: { gte: since },
      ...(params.brandId ? { brandId: params.brandId } : {}),
    },
    _sum: { unitsSold: true, revenueEstimate: true },
    orderBy: { _sum: { revenueEstimate: "desc" } },
    take: 50,
  })

  if (estimates.length === 0) return []

  const variantIds = estimates.map((e) => e.variantId)

  const variants = await prisma.variant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        select: {
          title: true,
          imageUrl: true,
          productType: true,
          handle: true,
          brand: { select: { name: true, domain: true, id: true, currency: true } },
        },
      },
    },
  })

  const variantMap = new Map(variants.map((v) => [v.id, v]))

  return estimates
    .map((e) => {
      const variant = variantMap.get(e.variantId)
      if (!variant) return null
      return {
        variantId: e.variantId,
        unitsSold: e._sum.unitsSold ?? 0,
        revenue: Number(e._sum.revenueEstimate ?? 0),
        variant,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

async function getBrands() {
  return prisma.brand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

async function getProductTypes() {
  const result = await prisma.product.groupBy({
    by: ["productType"],
    where: { productType: { not: null }, isActive: true },
    orderBy: { _count: { productType: "desc" } },
    take: 20,
  })
  return result.map((r) => r.productType).filter(Boolean) as string[]
}

async function getWinnerScores(brandId?: string) {
  // Find the most recent scoreDate
  const latest = await prisma.winnerScore.findFirst({
    where: brandId ? { brandId } : {},
    orderBy: { scoreDate: "desc" },
    select: { scoreDate: true },
  })

  if (!latest) return { scores: [], scoreDate: null }

  const scores = await prisma.winnerScore.findMany({
    where: {
      scoreDate: latest.scoreDate,
      ...(brandId ? { brandId } : {}),
    },
    orderBy: { winnerScore: "desc" },
    take: 20,
    include: {
      product: {
        select: { id: true, title: true, imageUrl: true },
      },
      brand: {
        select: { id: true, name: true },
      },
    },
  })

  return { scores, scoreDate: latest.scoreDate }
}

function scoreColor(score: number): string {
  if (score > 70) return "bg-green-500"
  if (score >= 40) return "bg-yellow-500"
  return "bg-red-500"
}

function scoreBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score > 70) return "default"
  if (score >= 40) return "secondary"
  return "destructive"
}

function reasonCodeColor(code: string): string {
  const colors: Record<string, string> = {
    high_revenue: "bg-green-100 text-green-800",
    trending_up: "bg-blue-100 text-blue-800",
    high_margin: "bg-emerald-100 text-emerald-800",
    new_launch: "bg-purple-100 text-purple-800",
    high_velocity: "bg-cyan-100 text-cyan-800",
    low_stock: "bg-orange-100 text-orange-800",
    declining: "bg-red-100 text-red-800",
    seasonal: "bg-amber-100 text-amber-800",
  }
  return colors[code] ?? "bg-gray-100 text-gray-800"
}

function formatReasonCode(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default async function TopSellersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const displayCurrency = sp.displayCurrency ?? "USD"

  const [topSellers, brands, productTypes, winnerData] = await Promise.all([
    getTopSellers(sp),
    getBrands(),
    getProductTypes(),
    getWinnerScores(sp.brandId),
  ])

  // Convertir revenues a la moneda de visualización
  const conversionInputs = topSellers.map((item) => ({
    amount: item.revenue,
    currency: item.variant.product.brand.currency ?? "USD",
  }))

  const converted = await batchConvert(conversionInputs, displayCurrency)

  const enrichedItems = topSellers
    .map((item, i) => ({
      ...item,
      convertedRevenue: converted[i].converted,
      hasRate: converted[i].hasRate,
    }))
    .sort((a, b) => b.convertedRevenue - a.convertedRevenue)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Top Sellers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          SKUs con mayor volumen de ventas estimado
        </p>
      </div>

      <TopSellersFilters brands={brands} productTypes={productTypes} />

      {enrichedItems.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              Sin datos de ventas aún. Agrega marcas y espera el primer ciclo de scraping.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">
              {enrichedItems.length} SKUs · {sp.days ?? "30"} días
              {displayCurrency !== "USD" && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  en {displayCurrency}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="divide-y">
              {enrichedItems.map((item, i) => (
                <div key={item.variantId} className="flex items-center gap-4 py-3">
                  {/* Rank */}
                  <span className="text-sm font-mono text-muted-foreground w-6 text-right">
                    {i + 1}
                  </span>

                  {/* Image */}
                  {item.variant.product.imageUrl ? (
                    <img
                      src={item.variant.product.imageUrl}
                      alt={item.variant.product.title}
                      className="h-12 w-12 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted flex-shrink-0" />
                  )}

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.variant.product.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {item.variant.product.brand.name}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{item.variant.title}</span>
                      {item.variant.product.productType && (
                        <Badge variant="secondary" className="text-xs h-4">
                          {item.variant.product.productType}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Metrics — converted */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold">
                      {formatPrice(item.convertedRevenue, displayCurrency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.unitsSold.toLocaleString()} uds
                    </p>
                  </div>

                  {/* Price — original currency */}
                  <div className="text-right flex-shrink-0 hidden md:block">
                    <p className="text-sm text-muted-foreground">
                      {formatPrice(item.variant.price, item.variant.product.brand.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Winner Scores Section */}
      <div>
        <h2 className="text-xl font-bold tracking-tight">Productos Ganadores</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Productos con mayor puntuación de éxito según análisis multifactorial
        </p>
      </div>

      {winnerData.scores.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              Sin datos de puntuación aún. Los scores se calculan después del análisis de ventas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">
              Top {winnerData.scores.length} ganadores
              {winnerData.scoreDate && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {new Date(winnerData.scoreDate).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="w-48">Winner Score</TableHead>
                    <TableHead className="w-28">Confianza</TableHead>
                    <TableHead>Razones</TableHead>
                    <TableHead className="hidden lg:table-cell">Componentes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {winnerData.scores.map((ws, i) => {
                    const reasonCodes = (Array.isArray(ws.reasonCodes) ? ws.reasonCodes : []) as string[]
                    const componentScores = (
                      ws.componentScores && typeof ws.componentScores === "object"
                        ? ws.componentScores
                        : {}
                    ) as Record<string, number>

                    return (
                      <TableRow key={ws.id}>
                        {/* Rank */}
                        <TableCell className="font-mono text-muted-foreground">
                          {i + 1}
                        </TableCell>

                        {/* Product title with link */}
                        <TableCell>
                          <Link
                            href={`/dashboard/products/${ws.product.id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {ws.product.title}
                          </Link>
                        </TableCell>

                        {/* Brand */}
                        <TableCell className="text-sm text-muted-foreground">
                          {ws.brand.name}
                        </TableCell>

                        {/* Winner Score with colored bar */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-10">
                              {Math.round(ws.winnerScore)}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${scoreColor(ws.winnerScore)}`}
                                style={{ width: `${Math.min(ws.winnerScore, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">/100</span>
                          </div>
                        </TableCell>

                        {/* Confidence */}
                        <TableCell>
                          <Badge variant={scoreBadgeVariant(ws.confidenceScore * 100)}>
                            {Math.round(ws.confidenceScore * 100)}%
                          </Badge>
                        </TableCell>

                        {/* Reason Codes */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {reasonCodes.map((code) => (
                              <span
                                key={code}
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${reasonCodeColor(code)}`}
                              >
                                {formatReasonCode(code)}
                              </span>
                            ))}
                          </div>
                        </TableCell>

                        {/* Component Scores */}
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(componentScores).map(([key, value]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                title={`${formatReasonCode(key)}: ${Math.round(value)}/100`}
                              >
                                {formatReasonCode(key)}
                                <span className={`font-bold ${value > 70 ? "text-green-600" : value >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                  {Math.round(value)}
                                </span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
