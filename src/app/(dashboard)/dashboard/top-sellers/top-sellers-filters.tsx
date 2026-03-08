"use client"

import { useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SUPPORTED_CURRENCIES } from "@/lib/exchange/currencies"
import { useDisplayCurrency } from "@/hooks/use-display-currency"

interface Props {
  brands: { id: string; name: string }[]
  productTypes: string[]
  search?: string
}

export function TopSellersFilters({ brands, productTypes, search }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`/dashboard/top-sellers?${params.toString()}`)
  }

  function updateCurrency(code: string) {
    setDisplayCurrency(code)
    const params = new URLSearchParams(searchParams.toString())
    params.set("displayCurrency", code)
    router.push(`/dashboard/top-sellers?${params.toString()}`)
  }

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (value) {
          params.set("search", value)
        } else {
          params.delete("search")
        }
        router.push(`/dashboard/top-sellers?${params.toString()}`)
      }, 300)
    },
    [router, searchParams],
  )

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por producto o SKU..."
          defaultValue={search ?? ""}
          onChange={handleSearchChange}
          className="pl-9"
        />
      </div>

      {/* Filters row */}
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
            defaultValue={searchParams.get("productType") ?? "all"}
            onValueChange={(v) => updateParam("productType", v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {productTypes.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          defaultValue={searchParams.get("days") ?? "30"}
          onValueChange={(v) => updateParam("days", v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 días</SelectItem>
            <SelectItem value="14">14 días</SelectItem>
            <SelectItem value="30">30 días</SelectItem>
            <SelectItem value="60">60 días</SelectItem>
            <SelectItem value="90">90 días</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={displayCurrency}
          onValueChange={updateCurrency}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} {c.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
