import { prisma } from "@/lib/prisma"
import { SalesChartClient } from "./sales-chart-client"
import { OwnSalesImport } from "./own-sales-import"
import { batchConvert } from "@/lib/exchange"

interface SearchParams {
  brands?: string
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

async function getOwnSalesBrands() {
  return prisma.brand.findMany({
    where: { isMyBrand: true, isActive: true },
    select: { id: true, name: true },
  })
}

async function getOwnSalesData(brandIds: string[], days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const results = await prisma.ownSalesData.groupBy({
    by: ["brandId", "date"],
    where: {
      brandId: brandIds.length > 0 ? { in: brandIds } : undefined,
      date: { gte: since },
    },
    _sum: { units: true, revenue: true },
    orderBy: { date: "asc" },
  })

  return results.map((r) => ({
    brandId: r.brandId,
    date: r.date.toISOString().split("T")[0],
    unitsSold: r._sum.units ?? 0,
    revenue: Number(r._sum.revenue ?? 0),
  }))
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const days = parseInt(sp.days ?? "30", 10)
  const displayCurrency = sp.displayCurrency ?? "USD"

  const [allBrands, ownSalesBrands] = await Promise.all([
    getBrands(),
    getOwnSalesBrands(),
  ])

  // Support both "brands" (new) and "brandIds" (legacy) param names
  const brandsParam = sp.brands ?? sp.brandIds
  const selectedBrandIds = brandsParam
    ? brandsParam.split(",").filter(Boolean)
    : allBrands.slice(0, 5).map((b) => b.id)

  // Fetch estimated sales and own sales data in parallel
  const [salesData, ownSalesData] = await Promise.all([
    getSalesCurves(selectedBrandIds, days),
    getOwnSalesData(selectedBrandIds, days),
  ])

  // Merge own sales data into salesData (own sales override estimates for matching brand+date)
  const ownSalesMap = new Map(
    ownSalesData.map((d) => [`${d.brandId}_${d.date}`, d]),
  )

  const mergedSalesData = salesData.map((d) => {
    const key = `${d.brandId}_${d.date}`
    const ownData = ownSalesMap.get(key)
    if (ownData) {
      ownSalesMap.delete(key)
      return { ...d, unitsSold: ownData.unitsSold, revenue: ownData.revenue }
    }
    return d
  })

  // Add any own sales entries that don't have a matching estimate
  for (const ownEntry of ownSalesMap.values()) {
    mergedSalesData.push(ownEntry)
  }

  // Sort by date
  mergedSalesData.sort((a, b) => a.date.localeCompare(b.date))

  // Convertir revenues a displayCurrency
  const brandCurrencyMap = new Map(allBrands.map((b) => [b.id, b.currency ?? "USD"]))

  const conversionInputs = mergedSalesData.map((d) => ({
    amount: d.revenue,
    currency: brandCurrencyMap.get(d.brandId) ?? "USD",
  }))

  const converted = await batchConvert(conversionInputs, displayCurrency)

  const convertedSalesData = mergedSalesData.map((d, i) => ({
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

      <OwnSalesImport brands={ownSalesBrands} />
    </div>
  )
}
