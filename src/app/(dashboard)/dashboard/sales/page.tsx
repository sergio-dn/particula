import { prisma } from "@/lib/prisma"
import { SalesChartClient } from "./sales-chart-client"
import { batchConvert } from "@/lib/exchange"

interface SearchParams {
  brandIds?: string
  days?: string
  displayCurrency?: string
}

async function getSalesCurves(brandIds: string[], days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Obtener estimaciones agrupadas por marca y fecha
  const results = await prisma.salesEstimate.groupBy({
    by: ["brandId", "date"],
    where: {
      brandId: brandIds.length > 0 ? { in: brandIds } : undefined,
      date: { gte: since },
    },
    _sum: { unitsSold: true, revenueEstimate: true },
    orderBy: { date: "asc" },
  })

  return results.map((r) => ({
    brandId: r.brandId,
    date: r.date.toISOString().split("T")[0],
    unitsSold: r._sum.unitsSold ?? 0,
    revenue: Number(r._sum.revenueEstimate ?? 0),
  }))
}

async function getBrands() {
  return prisma.brand.findMany({
    where: { isActive: true },
    orderBy: [{ isMyBrand: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isMyBrand: true, category: true, currency: true },
  })
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const days = parseInt(sp.days ?? "30", 10)
  const displayCurrency = sp.displayCurrency ?? "USD"

  const allBrands = await getBrands()

  const selectedBrandIds = sp.brandIds
    ? sp.brandIds.split(",").filter(Boolean)
    : allBrands.slice(0, 5).map((b) => b.id)

  const salesData = await getSalesCurves(selectedBrandIds, days)

  // Convertir revenues a displayCurrency
  const brandCurrencyMap = new Map(allBrands.map((b) => [b.id, b.currency ?? "USD"]))

  const conversionInputs = salesData.map((d) => ({
    amount: d.revenue,
    currency: brandCurrencyMap.get(d.brandId) ?? "USD",
  }))

  const converted = await batchConvert(conversionInputs, displayCurrency)

  const convertedSalesData = salesData.map((d, i) => ({
    ...d,
    revenue: converted[i].converted,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ventas & Benchmark</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Curvas de ventas estimadas y comparación entre marcas
        </p>
      </div>

      <SalesChartClient
        brands={allBrands}
        salesData={convertedSalesData}
        selectedBrandIds={selectedBrandIds}
        days={days}
        displayCurrency={displayCurrency}
      />
    </div>
  )
}
