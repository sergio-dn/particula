import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

async function getAssortmentData() {
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { products: { where: { isActive: true } } } },
      products: {
        where: { isActive: true, productType: { not: null } },
        select: { productType: true },
      },
    },
    orderBy: { name: "asc" },
  })

  return brands.map((b) => {
    const typeCounts: Record<string, number> = {}
    for (const p of b.products) {
      if (p.productType) {
        typeCounts[p.productType] = (typeCounts[p.productType] ?? 0) + 1
      }
    }
    return {
      id: b.id,
      name: b.name,
      isMyBrand: b.isMyBrand,
      totalProducts: b._count.products,
      typeCounts,
    }
  })
}

async function getAllProductTypes() {
  const result = await prisma.product.groupBy({
    by: ["productType"],
    where: { productType: { not: null }, isActive: true },
    _count: { productType: true },
    orderBy: { _count: { productType: "desc" } },
    take: 15,
  })
  return result.map((r) => r.productType).filter(Boolean) as string[]
}

export default async function AssortmentPage() {
  const [brands, productTypes] = await Promise.all([
    getAssortmentData(),
    getAllProductTypes(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assortment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo de productos por marca y categoría
        </p>
      </div>

      {brands.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            Sin datos. Agrega marcas y ejecuta el scraping.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Distribución por categoría ({brands.length} marcas)
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Marca</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Total</th>
                  {productTypes.map((pt) => (
                    <th key={pt} className="text-right py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                      {pt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.id} className={`border-b ${brand.isMyBrand ? "bg-emerald-50/50" : ""}`}>
                    <td className="py-2 pr-4 font-medium">
                      {brand.name}
                      {brand.isMyBrand && (
                        <span className="ml-2 text-xs text-emerald-600">(mi marca)</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-3 font-semibold">
                      {brand.totalProducts.toLocaleString()}
                    </td>
                    {productTypes.map((pt) => (
                      <td key={pt} className="text-right py-2 px-3 text-muted-foreground">
                        {brand.typeCounts[pt] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
