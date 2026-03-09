"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Building2, CheckCircle2, Circle, Globe, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
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
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Edit state
  const [editTarget, setEditTarget] = useState<Brand | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    country: "",
    category: "COMPETITOR",
    isMyBrand: false,
    notes: "",
  })

  function openEditDialog(brand: Brand) {
    setEditForm({
      name: brand.name,
      country: brand.country ?? "",
      category: brand.category,
      isMyBrand: brand.isMyBrand,
      notes: brand.notes ?? "",
    })
    setEditTarget(brand)
  }

  async function handleEditBrand(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setIsEditing(true)

    try {
      const res = await fetch(`/api/brands/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? "Error al actualizar la marca")
        return
      }

      setEditTarget(null)
      toast.success("Marca actualizada")
      router.refresh()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setIsEditing(false)
    }
  }

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
        const msg = data.error ?? "Error al agregar la marca"
        setAddError(msg)
        toast.error(msg)
        return
      }

      setIsAddOpen(false)
      setForm({ name: "", domain: "", country: "", category: "COMPETITOR", isMyBrand: false })
      toast.success("Marca añadida correctamente")
      router.refresh()
    } catch {
      setAddError("Error de conexión")
      toast.error("Error de conexión")
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDeleteBrand(brand: Brand) {
    try {
      const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Error al eliminar la marca")
        return
      }
      toast.success("Marca eliminada")
      router.refresh()
    } catch {
      toast.error("Error de conexión al eliminar")
    }
  }

  async function handleTriggerScrape(id: string) {
    try {
      const res = await fetch(`/api/brands/${id}/scrape`, { method: "POST" })
      if (!res.ok) {
        toast.error("Error al iniciar scraping")
        return
      }
      toast.info("Scraping iniciado...")
      router.refresh()
    } catch {
      toast.error("Error de conexión al iniciar scraping")
    }
  }

  const filteredBrands = searchQuery
    ? brands.filter(
        (b) =>
          b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          b.domain.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : brands

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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o dominio..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-1">
            {filteredBrands.length} de {brands.length} marcas
          </p>
        )}
      </div>

      {/* Brands grid */}
      {filteredBrands.length === 0 && !searchQuery ? (
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
      ) : filteredBrands.length === 0 && searchQuery ? (
        <Card className="py-16">
          <CardContent className="text-center space-y-2">
            <Search className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Sin resultados</p>
            <p className="text-sm text-muted-foreground">
              No se encontraron marcas para &ldquo;{searchQuery}&rdquo;
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredBrands.map((brand) => {
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
                        <p className="font-semibold text-sm leading-tight">{brand.name}</p>
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
                      className="h-7 text-xs gap-1.5"
                      onClick={() => openEditDialog(brand)}
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1.5 ml-auto"
                      onClick={() => setDeleteTarget(brand)}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar {deleteTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion es irreversible. Se borrarán todos los productos, variantes y datos de ventas asociados a esta marca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  handleDeleteBrand(deleteTarget)
                  setDeleteTarget(null)
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit brand dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {editTarget?.name}</DialogTitle>
            <DialogDescription>
              Actualiza los datos de la marca. El dominio no se puede cambiar.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditBrand} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nombre de la marca</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">País</label>
                <Input
                  placeholder="US"
                  maxLength={2}
                  value={editForm.country}
                  onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Categoría</label>
                <Select
                  value={editForm.category}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, category: v }))}
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notas</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-none"
                placeholder="Notas internas sobre esta marca..."
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-is-my-brand"
                checked={editForm.isMyBrand}
                onChange={(e) => setEditForm((f) => ({ ...f, isMyBrand: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="edit-is-my-brand" className="text-sm font-medium">
                Es mi marca
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isEditing}>
                {isEditing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Guardando...
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
