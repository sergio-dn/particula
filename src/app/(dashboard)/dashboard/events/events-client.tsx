"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BellOff } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

// ── Types ────────────────────────────────────────

interface EventItem {
  id: string
  type: string
  brandId: string
  brandName: string
  message: string
  data: Record<string, unknown> | null
  triggeredAt: string
  isRead: boolean
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Props {
  brands: { id: string; name: string }[]
  initialEvents: EventItem[]
  initialPagination: Pagination
}

// ── Constants ────────────────────────────────────

const ALERT_TYPE_LABELS: Record<string, string> = {
  NEW_PRODUCTS: "Nuevos productos",
  PRICE_CHANGE: "Cambio de precio",
  PRICE_DROP: "Descuento detectado",
  RESTOCK: "Restock",
  HIGH_VELOCITY: "Alta velocidad",
  VARIANT_ADDED: "Nueva variante",
  DISCOUNT_START: "Inicio descuento",
  DISCOUNT_END: "Fin descuento",
  OUT_OF_STOCK: "Sin stock",
  PRODUCT_REMOVED: "Producto eliminado",
}

const ALERT_SEVERITY: Record<string, { classes: string; label: string }> = {
  OUT_OF_STOCK: { classes: "bg-red-50 text-red-700 border-red-200", label: "Critico" },
  PRODUCT_REMOVED: { classes: "bg-red-50 text-red-700 border-red-200", label: "Critico" },
  PRICE_DROP: { classes: "bg-amber-50 text-amber-700 border-amber-200", label: "Alerta" },
  PRICE_CHANGE: { classes: "bg-amber-50 text-amber-700 border-amber-200", label: "Alerta" },
  HIGH_VELOCITY: { classes: "bg-amber-50 text-amber-700 border-amber-200", label: "Alerta" },
  NEW_PRODUCTS: { classes: "bg-blue-50 text-blue-700 border-blue-200", label: "Info" },
  VARIANT_ADDED: { classes: "bg-blue-50 text-blue-700 border-blue-200", label: "Info" },
  RESTOCK: { classes: "bg-green-50 text-green-700 border-green-200", label: "Positivo" },
  DISCOUNT_END: { classes: "bg-green-50 text-green-700 border-green-200", label: "Positivo" },
  DISCOUNT_START: { classes: "bg-purple-50 text-purple-700 border-purple-200", label: "Promo" },
}

const ALERT_TYPES = Object.keys(ALERT_TYPE_LABELS)
const PERIOD_OPTIONS = ["7", "14", "30", "60", "90"] as const

// ── Component ────────────────────────────────────

export function EventsClient({ brands, initialEvents, initialPagination }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<EventItem[]>(initialEvents)
  const [pagination, setPagination] = useState<Pagination>(initialPagination)
  const [loading, setLoading] = useState(false)

  // Read current filter state from URL
  const currentBrand = searchParams.get("brandId") ?? "all"
  const currentType = searchParams.get("type") ?? "all"
  const currentDays = searchParams.get("days") ?? "30"
  const currentRead = searchParams.get("isRead") ?? "all"
  const currentPage = parseInt(searchParams.get("page") ?? "1", 10)

  // ── URL param helpers ──

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === "all" || value === "") {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      // Reset to page 1 when changing filters
      if (key !== "page") params.delete("page")
      router.push(`/dashboard/events?${params.toString()}`)
    },
    [router, searchParams],
  )

  // ── Fetch events from API ──

  useEffect(() => {
    // Skip fetch on initial render (we have SSR data)
    const paramsKey = searchParams.toString()
    const isInitialRender = paramsKey === "" || paramsKey === new URLSearchParams().toString()

    // Build API params
    const days = parseInt(searchParams.get("days") ?? "30", 10)
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const apiParams = new URLSearchParams({ from, limit: "20" })

    const brandId = searchParams.get("brandId")
    const type = searchParams.get("type")
    const isRead = searchParams.get("isRead")
    const page = searchParams.get("page")

    if (brandId) apiParams.set("brandId", brandId)
    if (type) apiParams.set("type", type)
    if (isRead) apiParams.set("isRead", isRead)
    if (page) apiParams.set("page", page)

    let cancelled = false
    setLoading(true)

    fetch(`/api/events?${apiParams.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setEvents(data.items ?? [])
          setPagination(data.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([])
          setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [searchParams])

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Brand filter */}
        <Select value={currentBrand} onValueChange={(v) => updateParam("brandId", v)}>
          <SelectTrigger className="w-48 h-8 text-xs">
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

        {/* Type filter */}
        <Select value={currentType} onValueChange={(v) => updateParam("type", v)}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {ALERT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      ALERT_SEVERITY[t]?.classes.split(" ")[1] ?? "bg-gray-400"
                    }`}
                  />
                  {ALERT_TYPE_LABELS[t]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Period pills */}
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => updateParam("days", d === "30" ? "all" : d)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                currentDays === d || (d === "30" && currentDays === "all")
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Read status pills */}
        <div className="flex gap-1 ml-auto">
          {[
            { value: "all", label: "Todos" },
            { value: "false", label: "No leidos" },
            { value: "true", label: "Leidos" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateParam("isRead", opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                currentRead === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Event count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination.total} evento{pagination.total !== 1 ? "s" : ""}
          {pagination.totalPages > 1 && ` · Pagina ${pagination.page} de ${pagination.totalPages}`}
        </p>
      </div>

      {/* Event list */}
      <Card>
        <CardContent className="p-0">
          {loading && events.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">
              Cargando eventos...
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <BellOff className="h-10 w-10 opacity-40" />
              <p className="text-sm">Sin eventos para los filtros seleccionados</p>
            </div>
          ) : (
            <div className={`divide-y ${loading ? "opacity-50" : ""}`}>
              {events.map((event) => {
                const severity = ALERT_SEVERITY[event.type]
                return (
                  <div
                    key={event.id}
                    className={`flex items-start gap-3 px-4 py-3 ${
                      event.isRead ? "opacity-60" : ""
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="mt-2 flex-shrink-0 w-2">
                      {!event.isRead && (
                        <span className="block h-2 w-2 rounded-full bg-blue-500" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[11px] border rounded-full px-2 py-0.5 font-medium ${
                            severity?.classes ?? "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {ALERT_TYPE_LABELS[event.type] ?? event.type}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {event.brandName}
                        </span>
                      </div>
                      <p className="text-sm">{event.message}</p>
                    </div>

                    {/* Timestamp */}
                    <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                      {formatDistanceToNow(new Date(event.triggeredAt), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => updateParam("page", String(pagination.page - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => updateParam("page", String(pagination.page + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
