"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tag } from "lucide-react"
import { formatPrice } from "@/lib/utils"

type BrandRef = { id: string; name: string; currency: string | null }

type PriceChange = {
  id: string
  price: string
  compareAtPrice: string | null
  recordedAt: string
  variant: {
    title: string
    product: {
      title: string
      imageUrl: string | null
      productType: string | null
      brand: BrandRef
    }
  }
}

type DiscountedVariant = {
  id: string
  title: string
  price: string
  compareAtPrice: string | null
  product: {
    title: string
    imageUrl: string | null
    productType: string | null
    brand: BrandRef
  }
}

interface PricingClientProps {
  priceChanges: PriceChange[]
  discountedProducts: DiscountedVariant[]
  brands: { id: string; name: string }[]
}

export function PricingClient({ priceChanges, discountedProducts, brands }: PricingClientProps) {
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedType, setSelectedType] = useState("all")

  // Extraer tipos de producto únicos
  const productTypes = useMemo(() => {
    const types = new Set<string>()
    priceChanges.forEach((c) => {
      if (c.variant.product.productType) types.add(c.variant.product.productType)
    })
    discountedProducts.forEach((v) => {
      if (v.product.productType) types.add(v.product.productType)
    })
    return Array.from(types).sort()
  }, [priceChanges, discountedProducts])

  // Filtrar datos
  const filteredChanges = useMemo(() => {
    return priceChanges.filter((c) => {
      if (selectedBrand !== "all" && c.variant.product.brand.id !== selectedBrand) return false
      if (selectedType !== "all" && c.variant.product.productType !== selectedType) return false
      return true
    })
  }, [priceChanges, selectedBrand, selectedType])

  const filteredDiscounts = useMemo(() => {
    return discountedProducts
      .filter((v) => v.compareAtPrice && Number(v.compareAtPrice) > Number(v.price))
      .filter((v) => {
        if (selectedBrand !== "all" && v.product.brand.id !== selectedBrand) return false
        if (selectedType !== "all" && v.product.productType !== selectedType) return false
        return true
      })
  }, [discountedProducts, selectedBrand, selectedType])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Precios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cambios de precio y descuentos activos en la competencia
          </p>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
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

          {productTypes.length > 1 && (
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {productTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Price changes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Cambios de precio (7 días)
              {filteredChanges.length > 0 && (
                <Badge variant="secondary">{filteredChanges.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredChanges.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Tag className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Sin cambios de precio detectados.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredChanges.slice(0, 30).map((change) => (
                  <div key={change.id} className="flex items-center gap-3 py-2.5">
                    {change.variant.product.imageUrl ? (
                      <img
                        src={change.variant.product.imageUrl}
                        alt={change.variant.product.title}
                        className="h-9 w-9 rounded-md object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-md bg-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {change.variant.product.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {change.variant.product.brand.name} · {change.variant.title}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold">{formatPrice(change.price, change.variant.product.brand.currency ?? undefined)}</p>
                      {change.compareAtPrice && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatPrice(change.compareAtPrice, change.variant.product.brand.currency ?? undefined)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active discounts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Descuentos activos
              {filteredDiscounts.length > 0 && (
                <Badge>{filteredDiscounts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredDiscounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin descuentos activos detectados.
              </p>
            ) : (
              <div className="divide-y">
                {filteredDiscounts.slice(0, 30).map((variant) => {
                  const discount = Math.round(
                    (1 - Number(variant.price) / Number(variant.compareAtPrice)) * 100
                  )
                  return (
                    <div key={variant.id} className="flex items-center gap-3 py-2.5">
                      {variant.product.imageUrl ? (
                        <img
                          src={variant.product.imageUrl}
                          alt={variant.product.title}
                          className="h-9 w-9 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {variant.product.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {variant.product.brand.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="destructive" className="text-xs">
                          -{discount}%
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-semibold">
                            {formatPrice(variant.price, variant.product.brand.currency ?? undefined)}
                          </p>
                          <p className="text-xs text-muted-foreground line-through">
                            {formatPrice(variant.compareAtPrice, variant.product.brand.currency ?? undefined)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
