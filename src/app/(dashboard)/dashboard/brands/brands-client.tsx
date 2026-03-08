"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, CheckCircle2, Circle, Globe, Loader2, Plus, RefreshCw, Trash2, XCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Brand = {
  id: string
  name: string
  domain: string
  country: string | null
  category: string
  isMyBrand: boolean
  isActive: boolean
  shopifyStore: boolean
  logoUrl: string | null
  notes: string | null
  createdAt: Date
  _count: { products: number }
  scrapeJobs: Array<{
    status: string
    completedAt: Date | null
    createdAt: Date
    error: string | null
  }>
}

const categoryLabels: Record<string, string> = {
  COMPETITOR: "Competidor",
  ASPIRATIONAL: "Aspiracional",
  INTERNATIONAL: "Internacional",
  ADJACENT: "Adyacente",
  MY_BRAND: "Mi marca",
}

const categoryColors: Record<string, string> = {
  COMPETITOR: "bg-red-50 text-red-700 border-red-200",
  ASPIRATIONAL: "bg-blue-50 text-blue-700 border-blue-200",
  INTERNATIONAL: "bg-purple-50 text-purple-700 border-purple-200",
  ADJACENT: "bg-yellow-50 text-yellow-700 border-yellow-200",
  MY_BRAND: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

function ScrapeStatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === "RUNNING" || status === "PENDING") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
  if (status === "FAILED") return <XCircle className="h-4 w-4 text-red-500" />
  return <Circle className="h-4 w-4 text-muted-foreground" />
}

export function BrandsClient({ brands: initialBrands }: { brands: Brand[] }) {
  const router = useRouter()
  const [brands, setBrands] = useState(initialBrands)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: "",
    domain: "",
    country: "",
    category: "COMPETITOR",
    isMyBrand: false,
  })

  async function handleAddBrand(e: React.FormEvent) {
    e.preventDefault()
    setIsAdding(true)
    setAddError(null)

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        setAddError(data.error ?? "Error al agregar la marca")
        return
      }

      setIsAddOpen(false)
      setForm({ name: "", domain: "", country: "", category: "COMPETITOR", isMyBrand: false })
      router.refresh()
    } catch {
      setAddError("Error de conexión")
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDeleteBrand(id: string) {
    if (!confirm("¿Eliminar esta marca? Se borrarán todos sus datos.")) return
    await fetch(`/api/brands/${id}`, { method: "DELETE" })
    router.refresh()
  }

  async function handleTriggerScrape(id: string) {
    await fetch(`/api/brands/${id}/scrape`, { method: "POST" })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marcas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {brands.length} {brands.length === 1 ? "marca trackeada" : "marcas trackeadas"}
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Agregar marca
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agregar marca</DialogTitle>
              <DialogDescription>
                El sistema detectará automáticamente si es un store Shopify y comenzará el scraping.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddBrand} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nombre de la marca</label>
                <Input
                  placeholder="Gymshark"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Dominio</label>
                <Input
                  placeholder="gymshark.com"
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Solo el dominio, sin https:// ni www.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">País</label>
                  <Input
                    placeholder="US"
                    maxLength={2}
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Categoría</label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {addError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {addError}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isAdding}>
                  {isAdding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Detectando...
                    </>
                  ) : (
                    "Agregar"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Brands grid */}
      {brands.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center space-y-4">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
            <div>
              <p className="font-medium">No hay marcas trackeadas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Agrega competidores, marcas aspiracionales o tu propia marca para comenzar.
              </p>
            </div>
            <Button onClick={() => setIsAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Agregar primera marca
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((brand) => {
            const lastJob = brand.scrapeJobs[0]
            return (
              <Card key={brand.id} className="relative group hover:shadow-md transition-shadow">
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-start gap-3">
                    {/* Logo / Initial */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold uppercase">
                      {brand.name[0]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/dashboard/brands/${brand.id}`} className="font-semibold text-sm leading-tight hover:underline">
                          {brand.name}
                        </Link>
                        {brand.isMyBrand && (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                            Mi marca
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <a
                          href={`https://${brand.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground truncate"
                        >
                          {brand.domain}
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs border rounded-full px-2 py-0.5 ${categoryColors[brand.category] ?? ""}`}
                    >
                      {categoryLabels[brand.category] ?? brand.category}
                    </span>

                    {brand.shopifyStore && (
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                        Shopify
                      </span>
                    )}

                    {brand.country && (
                      <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                        {brand.country}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {brand._count.products.toLocaleString()} productos
                    </span>

                    {lastJob && (
                      <div className="flex items-center gap-1.5">
                        <ScrapeStatusIcon status={lastJob.status} />
                        <span className="text-xs text-muted-foreground capitalize">
                          {lastJob.status === "COMPLETED" && lastJob.completedAt
                            ? new Date(lastJob.completedAt).toLocaleDateString("es-MX", {
                                month: "short",
                                day: "numeric",
                              })
                            : lastJob.status.toLowerCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handleTriggerScrape(brand.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1.5 ml-auto"
                      onClick={() => handleDeleteBrand(brand.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
