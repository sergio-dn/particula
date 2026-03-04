import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

async function getTrendingCategories() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  return prisma.salesEstimate.groupBy({
    by: ["brandId"],
    where: { date: { gte: since } },
    _sum: { unitsSold: true, revenueEstimate: true },
    orderBy: { _sum: { revenueEstimate: "desc" } },
    take: 10,
  })
}

async function getTrendingProductTypes() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const products = await prisma.product.groupBy({
    by: ["productType"],
    where: {
      productType: { not: null },
      isActive: true,
      firstSeenAt: { gte: since },
    },
    _count: { productType: true },
    orderBy: { _count: { productType: "desc" } },
    take: 15,
  })

  return products.filter((p) => p.productType)
}

export default async function TrendsPage() {
  const [brandTrends, productTypeTrends] = await Promise.all([
    getTrendingCategories(),
    getTrendingProductTypes(),
  ])

  const brandIds = brandTrends.map((b) => b.brandId)
  const brandNames = await prisma.brand.findMany({
    where: { id: { in: brandIds } },
    select: { id: true, name: true },
  })
  const brandNameMap = new Map(brandNames.map((b) => [b.id, b.name]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tendencias</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Qué categorías y marcas están creciendo más (últimos 30 días)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marcas por revenue estimado</CardTitle>
          </CardHeader>
          <CardContent>
            {brandTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin datos aún.</p>
            ) : (
              <div className="divide-y">
                {brandTrends.map((b, i) => (
                  <div key={b.brandId} className="flex items-center gap-3 py-2.5">
                    <span className="text-sm text-muted-foreground w-5">{i + 1}</span>
                    <span className="text-sm font-medium flex-1">
                      {brandNameMap.get(b.brandId) ?? b.brandId}
                    </span>
                    <span className="text-sm font-semibold">
                      ${Number(b._sum.revenueEstimate ?? 0).toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categorías con más lanzamientos</CardTitle>
          </CardHeader>
          <CardContent>
            {productTypeTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin datos aún.</p>
            ) : (
              <div className="divide-y">
                {productTypeTrends.map((pt, i) => (
                  <div key={pt.productType} className="flex items-center gap-3 py-2.5">
                    <span className="text-sm text-muted-foreground w-5">{i + 1}</span>
                    <span className="text-sm font-medium flex-1">{pt.productType}</span>
                    <span className="text-sm font-semibold">
                      {pt._count.productType} nuevos
                    </span>
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
