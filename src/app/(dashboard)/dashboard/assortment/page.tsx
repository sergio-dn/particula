import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"

interface SearchParams {
  view?: string
}

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

export default async function AssortmentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const view = sp.view === "percent" ? "percent" : "absolute"

  const [brands, productTypes] = await Promise.all([
    getAssortmentData(),
    getAllProductTypes(),
  ])

  // Build matrix values for heatmap
  const matrix: Record<string, Record<string, number>> = {}
  for (const brand of brands) {
    matrix[brand.id] = {}
    for (const pt of productTypes) {
      matrix[brand.id][pt] = brand.typeCounts[pt] ?? 0
    }
  }

  const maxCount = Math.max(
    ...Object.values(matrix).flatMap((row) => Object.values(row)),
    0
  )

  // Column totals
  const columnTotals: Record<string, number> = {}
  for (const pt of productTypes) {
    columnTotals[pt] = brands.reduce((sum, b) => sum + (b.typeCounts[pt] ?? 0), 0)
  }
  const grandTotal = brands.reduce((sum, b) => sum + b.totalProducts, 0)

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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base">
              Distribución por categoría ({brands.length} marcas)
            </CardTitle>
            <div className="flex gap-1">
              <Link
                href="/dashboard/assortment?view=absolute"
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  view === "absolute"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted"
                }`}
              >
                Absoluto
              </Link>
              <Link
                href="/dashboard/assortment?view=percent"
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  view === "percent"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted"
                }`}
              >
                Porcentaje
              </Link>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-background">
                    Marca
                  </TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {productTypes.map((pt) => (
                    <TableHead key={pt} className="text-right">
                      {pt}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((brand) => {
                  const rowTotal = brand.totalProducts

                  return (
                    <TableRow
                      key={brand.id}
                      className={brand.isMyBrand ? "bg-emerald-50/50" : ""}
                    >
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        {brand.name}
                        {brand.isMyBrand && (
                          <span className="ml-2 text-xs text-emerald-600">(mi marca)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {brand.totalProducts.toLocaleString()}
                      </TableCell>
                      {productTypes.map((pt) => {
                        const count = brand.typeCounts[pt] ?? 0
                        const intensity = maxCount > 0 ? count / maxCount : 0
                        const bgColor =
                          count > 0
                            ? `rgba(99, 102, 241, ${0.08 + intensity * 0.25})`
                            : undefined

                        let displayValue: string
                        if (view === "percent") {
                          displayValue =
                            count > 0 && rowTotal > 0
                              ? `${Math.round((count / rowTotal) * 100)}%`
                              : "-"
                        } else {
                          displayValue = count > 0 ? count.toLocaleString() : "-"
                        }

                        return (
                          <TableCell
                            key={pt}
                            className="text-right text-muted-foreground"
                            style={{ backgroundColor: bgColor }}
                          >
                            {displayValue}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky left-0 z-10 bg-muted/50 font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {grandTotal.toLocaleString()}
                  </TableCell>
                  {productTypes.map((pt) => (
                    <TableCell key={pt} className="text-right font-semibold">
                      {columnTotals[pt] > 0 ? columnTotals[pt].toLocaleString() : "-"}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
