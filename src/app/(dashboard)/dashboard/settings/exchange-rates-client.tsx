"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, ArrowRightLeft } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUPPORTED_CURRENCIES } from "@/lib/exchange/currencies"
import { useDisplayCurrency } from "@/hooks/use-display-currency"

type ExchangeRate = {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: string
  effectiveDate: string
  source: string
  createdAt: string
}

interface Props {
  rates: ExchangeRate[]
}

export function ExchangeRatesClient({ rates }: Props) {
  const router = useRouter()
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExchangeRate | null>(null)

  // Form state
  const [fromCurrency, setFromCurrency] = useState("")
  const [toCurrency, setToCurrency] = useState("USD")
  const [rate, setRate] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split("T")[0],
  )

  async function handleCreate() {
    if (!fromCurrency || !rate || !effectiveDate) return

    setLoading(true)
    try {
      const res = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
          rate: parseFloat(rate),
          effectiveDate,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error?.formErrors?.[0] ?? "Error al crear tasa")
        return
      }

      setDialogOpen(false)
      setFromCurrency("")
      setRate("")
      toast.success("Tasa agregada")
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(rateToDelete: ExchangeRate) {
    try {
      const res = await fetch(`/api/exchange-rates/${rateToDelete.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Error al eliminar la tasa")
        return
      }
      toast.success("Tasa eliminada")
      router.refresh()
    } catch {
      toast.error("Error de conexión al eliminar")
    }
  }

  // Agrupar tasas por par de moneda para mostrar la más reciente primero
  const latestByPair = new Map<string, ExchangeRate>()
  for (const r of rates) {
    const key = `${r.fromCurrency}→${r.toCurrency}`
    if (!latestByPair.has(key)) {
      latestByPair.set(key, r) // ya vienen ordenados por fecha desc
    }
  }

  return (
    <div className="space-y-6">
      {/* Moneda de visualización */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Moneda de visualización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground flex-1">
              Moneda base para comparar revenues entre marcas en dashboards
            </p>
            <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tipos de cambio */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Tipos de Cambio</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Log histórico de tasas — se usa la más reciente por par de monedas
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Agregar tasa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar tipo de cambio</DialogTitle>
                <DialogDescription>
                  Ingresa la tasa de conversión entre dos monedas para una fecha específica.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      De
                    </label>
                    <Select value={fromCurrency} onValueChange={setFromCurrency}>
                      <SelectTrigger>
                        <SelectValue placeholder="Moneda origen" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.filter((c) => c.code !== toCurrency).map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-5" />

                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      A
                    </label>
                    <Select value={toCurrency} onValueChange={setToCurrency}>
                      <SelectTrigger>
                        <SelectValue placeholder="Moneda destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_CURRENCIES.filter((c) => c.code !== fromCurrency).map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Tasa (1 {fromCurrency || "XXX"} = ? {toCurrency || "USD"})
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="ej: 0.00106"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Fecha efectiva
                  </label>
                  <Input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={loading || !fromCurrency || !rate}>
                  {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          {/* Resumen de tasas vigentes */}
          {latestByPair.size > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Array.from(latestByPair.values()).map((r) => (
                <Badge key={r.id} variant="outline" className="text-xs">
                  1 {r.fromCurrency} = {Number(r.rate).toFixed(
                    Number(r.rate) < 0.01 ? 6 : Number(r.rate) < 1 ? 4 : 2,
                  )}{" "}
                  {r.toCurrency}
                </Badge>
              ))}
            </div>
          )}

          {/* Tabla completa */}
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay tasas de cambio registradas. Agrega una para empezar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">De</th>
                    <th className="pb-2 pr-4 font-medium">A</th>
                    <th className="pb-2 pr-4 font-medium text-right">Tasa</th>
                    <th className="pb-2 pr-4 font-medium">Fecha efectiva</th>
                    <th className="pb-2 pr-4 font-medium">Fuente</th>
                    <th className="pb-2 pr-4 font-medium">Creado</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rates.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/50">
                      <td className="py-2 pr-4 font-mono">{r.fromCurrency}</td>
                      <td className="py-2 pr-4 font-mono">{r.toCurrency}</td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {Number(r.rate).toFixed(
                          Number(r.rate) < 0.01 ? 6 : Number(r.rate) < 1 ? 4 : 2,
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {new Date(r.effectiveDate).toLocaleDateString("es-CL")}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-[10px]">
                          {r.source}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">
                        {new Date(r.createdAt).toLocaleDateString("es-CL")}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tasa de cambio</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Se eliminará la tasa {deleteTarget.fromCurrency} → {deleteTarget.toCurrency} del {new Date(deleteTarget.effectiveDate).toLocaleDateString("es-CL")}. Esta acción no se puede deshacer.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  handleDelete(deleteTarget)
                  setDeleteTarget(null)
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
