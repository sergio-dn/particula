"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SUPPORTED_CURRENCIES } from "@/lib/exchange/currencies"
import { useDisplayCurrency } from "@/hooks/use-display-currency"

interface Props {
  brands: { id: string; name: string }[]
  productTypes: string[]
}

export function TopSellersFilters({ brands, productTypes }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency()

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

  return (
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
  )
}
