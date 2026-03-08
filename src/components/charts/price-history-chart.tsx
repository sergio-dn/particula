"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface PricePoint {
  date: string // ISO date
  price: number
  compareAtPrice: number | null
  variantTitle: string
}

interface Props {
  data: PricePoint[]
  currency?: string
}

export function PriceHistoryChart({ data }: Props) {
  const hasCompareAt = data.some((d) => d.compareAtPrice !== null)

  const chartData = data
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((d) => ({
      date: d.date,
      label: format(new Date(d.date), "d MMM", { locale: es }),
      price: d.price,
      compareAtPrice: d.compareAtPrice,
      variantTitle: d.variantTitle,
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tendencia de precios</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin datos suficientes para mostrar la tendencia.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null
                  const item = payload[0]?.payload as (typeof chartData)[number]
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm text-sm">
                      <p className="font-medium">
                        {format(new Date(item.date), "d MMM yyyy", {
                          locale: es,
                        })}
                      </p>
                      {item.variantTitle && (
                        <p className="text-muted-foreground">
                          {item.variantTitle}
                        </p>
                      )}
                      <p>
                        Precio:{" "}
                        <span className="font-medium">${item.price}</span>
                      </p>
                      {item.compareAtPrice !== null && (
                        <p>
                          Precio comparado:{" "}
                          <span className="font-medium">
                            ${item.compareAtPrice}
                          </span>
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Precio"
              />
              {hasCompareAt && (
                <Line
                  type="monotone"
                  dataKey="compareAtPrice"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 2 }}
                  name="Precio comparado"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
