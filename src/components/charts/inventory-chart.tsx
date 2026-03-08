"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface InventoryPoint {
  date: string // ISO date
  quantity: number
  isAvailable: boolean
}

interface Props {
  data: InventoryPoint[]
}

export function InventoryChart({ data }: Props) {
  const chartData = data
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((d) => ({
      date: d.date,
      label: format(new Date(d.date), "d MMM", { locale: es }),
      available: d.isAvailable ? d.quantity : 0,
      unavailable: !d.isAvailable ? d.quantity : 0,
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historial de inventario</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin datos suficientes para mostrar el historial.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null
                  const item = payload[0]?.payload as (typeof chartData)[number]
                  const qty = item.available + item.unavailable
                  const isAvailable = item.available > 0
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm text-sm">
                      <p className="font-medium">
                        {format(new Date(item.date), "d MMM yyyy", {
                          locale: es,
                        })}
                      </p>
                      <p>
                        Cantidad: <span className="font-medium">{qty}</span>
                      </p>
                      <p>
                        Estado:{" "}
                        <span
                          className={
                            isAvailable ? "text-green-600" : "text-red-600"
                          }
                        >
                          {isAvailable ? "Disponible" : "No disponible"}
                        </span>
                      </p>
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="available"
                stackId="inventory"
                fill="#10b981"
                name="Disponible"
              />
              <Bar
                dataKey="unavailable"
                stackId="inventory"
                fill="#ef4444"
                name="No disponible"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
