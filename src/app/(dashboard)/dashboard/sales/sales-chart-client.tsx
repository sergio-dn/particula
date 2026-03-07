"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { formatPrice, formatPriceCompact } from "@/lib/utils"

// Paleta de colores para las líneas de cada marca
const BRAND_COLORS = [
  "#10b981", // emerald (mi marca)
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#ef4444", // red
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
]

interface SalesDataPoint {
  brandId: string
  date: string
  unitsSold: number
  revenue: number
}

interface Brand {
  id: string
  name: string
  isMyBrand: boolean
  category: string
  currency: string
}

interface Props {
  brands: Brand[]
  salesData: SalesDataPoint[]
  selectedBrandIds: string[]
  days: number
}

type Metric = "revenue" | "unitsSold"

export function SalesChartClient({ brands, salesData, selectedBrandIds, days }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [metric, setMetric] = useState<Metric>("revenue")
  const [activeBrandIds, setActiveBrandIds] = useState<string[]>(selectedBrandIds)

  // Construir dataset para Recharts: array de { date, [brandName]: value }
  const allDates = [...new Set(salesData.map((d) => d.date))].sort()

  const chartData = allDates.map((date) => {
    const row: Record<string, string | number> = { date }
    for (const brandId of activeBrandIds) {
      const brand = brands.find((b) => b.id === brandId)
      if (!brand) continue
      const point = salesData.find((d) => d.brandId === brandId && d.date === date)
      row[brand.name] = point ? (metric === "revenue" ? point.revenue : point.unitsSold) : 0
    }
    return row
  })

  const brandLines = activeBrandIds
    .map((id, i) => ({ brand: brands.find((b) => b.id === id), color: BRAND_COLORS[i % BRAND_COLORS.length] }))
    .filter((x) => x.brand)

  function toggleBrand(brandId: string) {
    setActiveBrandIds((prev) =>
      prev.includes(brandId) ? prev.filter((id) => id !== brandId) : [...prev, brandId]
    )
  }

  function setDays(d: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("days", d)
    router.push(`/dashboard/sales?${params.toString()}`)
  }

  // Totales por marca para la tabla resumen
  const brandTotals = activeBrandIds.map((id) => {
    const brand = brands.find((b) => b.id === id)
    if (!brand) return null
    const points = salesData.filter((d) => d.brandId === id)
    return {
      brand,
      totalRevenue: points.reduce((sum, p) => sum + p.revenue, 0),
      totalUnits: points.reduce((sum, p) => sum + p.unitsSold, 0),
    }
  }).filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        {/* Period selector */}
        <div className="flex gap-2">
          {(["7", "14", "30", "60", "90"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                String(days) === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Metric selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setMetric("revenue")}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              metric === "revenue" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            Revenue
          </button>
          <button
            onClick={() => setMetric("unitsSold")}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              metric === "unitsSold" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            Unidades
          </button>
        </div>
      </div>

      {/* Brand toggles */}
      <div className="flex flex-wrap gap-2">
        {brands.map((brand, i) => {
          const isActive = activeBrandIds.includes(brand.id)
          const color = BRAND_COLORS[i % BRAND_COLORS.length]
          return (
            <button
              key={brand.id}
              onClick={() => toggleBrand(brand.id)}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all ${
                isActive ? "border-transparent shadow-sm" : "opacity-40 hover:opacity-70"
              }`}
              style={isActive ? { backgroundColor: `${color}20`, borderColor: color, color } : {}}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {brand.name}
              {brand.isMyBrand && (
                <Badge className="text-[10px] h-3.5 px-1 ml-0.5">Mía</Badge>
              )}
            </button>
          )
        })}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {metric === "revenue" ? "Revenue estimado" : "Unidades vendidas"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sin datos. Agrega marcas y espera el primer ciclo de scraping.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) =>
                    format(new Date(d), "d MMM", { locale: es })
                  }
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    if (metric !== "revenue") return v.toLocaleString()
                    const curr = brands[0]?.currency ?? "USD"
                    return formatPriceCompact(v, curr)
                  }}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const brand = brands.find((b) => b.name === name)
                    const curr = brand?.currency ?? "USD"
                    return [
                      metric === "revenue"
                        ? formatPrice(Number(value), curr)
                        : Number(value).toLocaleString(),
                      name,
                    ]
                  }}
                  labelFormatter={(label) =>
                    format(new Date(label), "d 'de' MMMM yyyy", { locale: es })
                  }
                />
                <Legend />
                {brandLines.map(({ brand, color }) => (
                  <Line
                    key={brand!.id}
                    type="monotone"
                    dataKey={brand!.name}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Summary table */}
      {brandTotals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen del período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {brandTotals
                .sort((a, b) => (b?.totalRevenue ?? 0) - (a?.totalRevenue ?? 0))
                .map((item, i) => (
                  <div key={item!.brand.id} className="flex items-center gap-4 py-3">
                    <span
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }}
                    />
                    <span className="text-sm font-medium flex-1">{item!.brand.name}</span>
                    {item!.brand.isMyBrand && (
                      <Badge variant="outline" className="text-xs">Mi marca</Badge>
                    )}
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatPrice(item!.totalRevenue, item!.brand.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item!.totalUnits.toLocaleString()} uds
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
