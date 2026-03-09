"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PackageX } from "lucide-react"
import { formatPrice } from "@/lib/utils"

type OosItem = {
  variantId: string
  variantTitle: string
  sku: string | null
  price: string
  productTitle: string
  imageUrl: string | null
  productType: string | null
  brandId: string
  brandName: string
  currency: string | null
  oosDate: string
  daysSinceOOS: number
}

interface OosTimelineProps {
  items: OosItem[]
  brands: { id: string; name: string }[]
}

function daysBadgeColor(days: number): string {
  if (days >= 30) return "bg-red-50 text-red-700 border-red-200"
  if (days >= 14) return "bg-orange-50 text-orange-700 border-orange-200"
  if (days >= 7) return "bg-yellow-50 text-yellow-700 border-yellow-200"
  return "bg-gray-50 text-gray-700 border-gray-200"
}

export function OosTimeline({ items, brands }: OosTimelineProps) {
  const [selectedBrand, setSelectedBrand] = useState("all")

  const filtered = useMemo(() => {
    if (selectedBrand === "all") return items
    return items.filter((i) => i.brandId === selectedBrand)
  }, [items, selectedBrand])

  return (
    <div className="space-y-4">
      {/* Tabs para volver a eventos */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          <Link
            href="/dashboard/events"
            className="text-xs px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
          >
            Eventos
          </Link>
          <Link
            href="/dashboard/events?tab=oos"
            className="text-xs px-3 py-1.5 rounded-full border bg-primary text-primary-foreground border-primary transition-colors"
          >
            Sin stock
          </Link>
        </div>

        <Select value={selectedBrand} onValueChange={setSelectedBrand}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todas las marcas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="ml-auto">
          {filtered.length} variante{filtered.length !== 1 ? "s" : ""} sin stock
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Productos sin stock</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <PackageX className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="font-medium">Sin productos agotados</p>
              <p className="text-sm text-muted-foreground">
                No hay variantes sin stock actualmente.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((item) => (
                <div key={item.variantId} className="flex items-center gap-3 py-3">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.productTitle}
                      className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.productTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.brandName} · {item.variantTitle}
                      {item.sku && <span className="ml-1 text-muted-foreground/60">({item.sku})</span>}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0 space-y-1">
                    <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${daysBadgeColor(item.daysSinceOOS)}`}>
                      {item.daysSinceOOS} día{item.daysSinceOOS !== 1 ? "s" : ""} sin stock
                    </span>
                    <p className="text-xs text-muted-foreground">
                      desde {new Date(item.oosDate).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold">
                      {formatPrice(item.price, item.currency ?? undefined)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
