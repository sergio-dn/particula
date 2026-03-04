import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tag } from "lucide-react"

async function getPriceChanges() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Variantes con cambios de precio recientes
  const recentChanges = await prisma.priceHistory.findMany({
    where: { recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    take: 100,
    include: {
      variant: {
        include: {
          product: {
            select: {
              title: true,
              imageUrl: true,
              productType: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  return recentChanges
}

async function getDiscountedProducts() {
  // Productos con compareAtPrice > price (tienen descuento activo)
  return prisma.variant.findMany({
    where: {
      compareAtPrice: { not: null },
      isAvailable: true,
    },
    orderBy: { price: "asc" },
    take: 50,
    include: {
      product: {
        select: {
          title: true,
          imageUrl: true,
          brand: { select: { name: true } },
        },
      },
    },
  })
}

export default async function PricingPage() {
  const [priceChanges, discountedProducts] = await Promise.all([
    getPriceChanges(),
    getDiscountedProducts(),
  ])

  const activeDiscounts = discountedProducts.filter(
    (v) => v.compareAtPrice && Number(v.compareAtPrice) > Number(v.price)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Precios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cambios de precio y descuentos activos en la competencia
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Price changes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cambios de precio (7 días)</CardTitle>
          </CardHeader>
          <CardContent>
            {priceChanges.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Tag className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Sin cambios de precio detectados.</p>
              </div>
            ) : (
              <div className="divide-y">
                {priceChanges.slice(0, 20).map((change) => (
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
                      <p className="text-sm font-semibold">${Number(change.price).toFixed(2)}</p>
                      {change.compareAtPrice && (
                        <p className="text-xs text-muted-foreground line-through">
                          ${Number(change.compareAtPrice).toFixed(2)}
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
              {activeDiscounts.length > 0 && (
                <Badge>{activeDiscounts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeDiscounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin descuentos activos detectados.
              </p>
            ) : (
              <div className="divide-y">
                {activeDiscounts.slice(0, 20).map((variant) => {
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
                            ${Number(variant.price).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground line-through">
                            ${Number(variant.compareAtPrice).toFixed(2)}
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
