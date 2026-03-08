import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TopSellersFilters } from "./top-sellers-filters"
import { formatPrice } from "@/lib/utils"
import { ExportButton } from "@/components/export-button"
import { batchConvert } from "@/lib/exchange"

interface SearchParams {
  brandId?: string
  productType?: string
  days?: string
  displayCurrency?: string
  search?: string
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

export default async function TopSellersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const displayCurrency = sp.displayCurrency ?? "USD"

  const [topSellers, brands, productTypes] = await Promise.all([
    getTopSellers(sp),
    getBrands(),
    getProductTypes(),
  ])

  // Convertir revenues a la moneda de visualización
  const conversionInputs = topSellers.map((item) => ({
    amount: item.revenue,
    currency: item.variant.product.brand.currency ?? "USD",
  }))

  const converted = await batchConvert(conversionInputs, displayCurrency)

  const search = sp.search ?? ""

  const enrichedItems = topSellers
    .map((item, i) => ({
      ...item,
      convertedRevenue: converted[i].converted,
      hasRate: converted[i].hasRate,
    }))
    .sort((a, b) => b.convertedRevenue - a.convertedRevenue)

  const filtered = search
    ? enrichedItems.filter(
        (s) =>
          s.variant.product.title.toLowerCase().includes(search.toLowerCase()) ||
          (s.variant.sku?.toLowerCase().includes(search.toLowerCase())),
      )
    : enrichedItems

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Top Sellers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            SKUs con mayor volumen de ventas estimado
          </p>
        </div>
        <ExportButton
          type="top-sellers"
          params={{
            brandId: sp.brandId,
            days: sp.days,
            productType: sp.productType,
          }}
        />
      </div>

      <TopSellersFilters brands={brands} productTypes={productTypes} search={search} />

      {filtered.length === 0 ? (
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
              {filtered.length} SKUs · {sp.days ?? "30"} días
              {displayCurrency !== "USD" && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  en {displayCurrency}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="divide-y">
              {filtered.map((item, i) => (
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
    </div>
  )
}
