"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface WinnerItem {
  id: string
  productId: string
  title: string
  imageUrl: string | null
  brandName: string
  productType: string | null
  compositeScore: number
  confidenceTier: string
  salesVelocity: number
  restockFrequency: number
  stockoutSignal: number
  longevity: number
  priceStability: number
  catalogProminence: number
  reasonCodes: string[]
}

interface Props {
  brands: { id: string; name: string }[]
  productTypes: string[]
  initialWinners: WinnerItem[]
  initialPagination: { page: number; total: number; totalPages: number }
}

const COMPONENTS = [
  { key: "salesVelocity" as const, label: "Vel. ventas", color: "bg-blue-500" },
  { key: "restockFrequency" as const, label: "Restock", color: "bg-green-500" },
  { key: "stockoutSignal" as const, label: "Stockout", color: "bg-red-500" },
  { key: "longevity" as const, label: "Longevidad", color: "bg-purple-500" },
  { key: "priceStability" as const, label: "Precio", color: "bg-amber-500" },
  { key: "catalogProminence" as const, label: "Catalogo", color: "bg-indigo-500" },
]

export function WinnersClient({
  brands,
  productTypes,
  initialWinners,
  initialPagination,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { page, total, totalPages } = initialPagination
  const offset = (page - 1) * 20

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    router.push(`/dashboard/winners?${params.toString()}`)
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (p <= 1) {
      params.delete("page")
    } else {
      params.set("page", String(p))
    }
    router.push(`/dashboard/winners?${params.toString()}`)
  }

  function scoreColor(score: number) {
    if (score > 70) return "bg-green-100 text-green-800"
    if (score > 40) return "bg-yellow-100 text-yellow-800"
    return "bg-red-100 text-red-800"
  }

  function tierVariant(tier: string) {
    if (tier === "A") return "bg-green-100 text-green-800"
    if (tier === "B") return "bg-yellow-100 text-yellow-800"
    return "bg-orange-100 text-orange-800"
  }

  if (initialWinners.length === 0) {
    return (
      <>
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select
            defaultValue={searchParams.get("brandId") ?? "all"}
            onValueChange={(v) => updateParam("brandId", v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todas las marcas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las marcas</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {productTypes.length > 0 && (
            <Select
              defaultValue={searchParams.get("category") ?? "all"}
              onValueChange={(v) => updateParam("category", v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {productTypes.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    {pt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Card>
          <CardContent className="py-16 text-center">
            <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Sin datos de winner scoring</p>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          defaultValue={searchParams.get("brandId") ?? "all"}
          onValueChange={(v) => updateParam("brandId", v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todas las marcas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {productTypes.length > 0 && (
          <Select
            defaultValue={searchParams.get("category") ?? "all"}
            onValueChange={(v) => updateParam("category", v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {productTypes.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Componentes</TableHead>
                <TableHead>Reason Codes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialWinners.map((w, i) => (
                <TableRow key={w.id}>
                  {/* Rank */}
                  <TableCell className="font-mono text-muted-foreground text-sm">
                    {i + 1 + offset}
                  </TableCell>

                  {/* Producto */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {w.imageUrl ? (
                        <img
                          src={w.imageUrl}
                          alt={w.title}
                          className="h-8 w-8 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex-shrink-0" />
                      )}
                      <Link
                        href={`/dashboard/products/${w.productId}`}
                        className="text-sm font-medium hover:underline truncate max-w-[200px]"
                      >
                        {w.title}
                      </Link>
                    </div>
                  </TableCell>

                  {/* Marca */}
                  <TableCell className="text-sm">{w.brandName}</TableCell>

                  {/* Tipo */}
                  <TableCell className="text-sm text-muted-foreground">
                    {w.productType ?? "\u2014"}
                  </TableCell>

                  {/* Score */}
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColor(w.compositeScore)}`}
                    >
                      {w.compositeScore.toFixed(1)}
                    </span>
                  </TableCell>

                  {/* Tier */}
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tierVariant(w.confidenceTier)}`}
                    >
                      {w.confidenceTier}
                    </span>
                  </TableCell>

                  {/* Componentes */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {COMPONENTS.map((comp) => {
                        const value = w[comp.key]
                        return (
                          <div
                            key={comp.key}
                            className="flex items-center gap-1"
                            title={`${comp.label}: ${value.toFixed(1)}`}
                          >
                            <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${comp.color} rounded-full`}
                                style={{ width: `${value}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </TableCell>

                  {/* Reason Codes */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {w.reasonCodes.map((code) => (
                        <span
                          key={code}
                          className="text-[10px] bg-muted rounded-full px-1.5 py-0.5"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {offset + 1}-{Math.min(offset + 20, total)} de {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
