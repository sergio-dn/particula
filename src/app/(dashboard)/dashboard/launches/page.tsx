import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Rocket } from "lucide-react"
import Link from "next/link"
import { formatPrice } from "@/lib/utils"

interface SearchParams {
  brandId?: string
  country?: string
  days?: string
}

async function getLaunches(params: SearchParams) {
  const days = parseInt(params.days ?? "30", 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  return prisma.product.findMany({
    where: {
      isLaunch: true,
      launchDate: { gte: since },
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.country
        ? { brand: { country: params.country.toUpperCase() } }
        : {}),
    },
    orderBy: { launchDate: "desc" },
    take: 100,
    include: {
      brand: { select: { name: true, domain: true, country: true, category: true, currency: true } },
      variants: {
        take: 1,
        select: { price: true, compareAtPrice: true },
        orderBy: { price: "asc" },
      },
    },
  })
}

async function getBrands() {
  return prisma.brand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, country: true },
  })
}

export default async function LaunchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const [launches, brands] = await Promise.all([getLaunches(sp), getBrands()])

  const countries = [...new Set(brands.map((b) => b.country).filter(Boolean))] as string[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lanzamientos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nuevos productos detectados en las marcas trackeadas
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {(["7", "14", "30", "60", "90"] as const).map((d) => (
            <Link
              key={d}
              href={`/dashboard/launches?days=${d}${sp.brandId ? `&brandId=${sp.brandId}` : ""}${sp.country ? `&country=${sp.country}` : ""}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                (sp.days ?? "30") === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {d} días
            </Link>
          ))}
        </div>
      </div>

      {/* Country filter for international brands */}
      {countries.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/launches?days=${sp.days ?? "30"}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !sp.country ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            Todos los países
          </Link>
          {countries.map((c) => (
            <Link
              key={c}
              href={`/dashboard/launches?days=${sp.days ?? "30"}&country=${c}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                sp.country === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              🌐 {c}
            </Link>
          ))}
        </div>
      )}

      {launches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Rocket className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              No se detectaron lanzamientos en los últimos {sp.days ?? "30"} días.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {launches.map((product) => {
            const minPrice = product.variants[0]?.price
            const compareAt = product.variants[0]?.compareAtPrice

            return (
              <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <Link href={`/dashboard/products/${product.id}`}>
                  {product.imageUrl && (
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </Link>
                <CardContent className="pt-4 pb-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/dashboard/products/${product.id}`} className="text-sm font-semibold leading-tight line-clamp-2 hover:underline">
                        {product.title}
                      </Link>
                      {product.brand.country && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {product.brand.country}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{product.brand.name}</span>
                      {product.productType && (
                        <Badge variant="secondary" className="text-xs h-4">
                          {product.productType}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {minPrice && (
                          <span className="text-sm font-medium">
                            {formatPrice(minPrice, product.brand.currency)}
                          </span>
                        )}
                        {compareAt && Number(compareAt) > Number(minPrice) && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(compareAt, product.brand.currency)}
                          </span>
                        )}
                      </div>

                      {product.launchDate && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(product.launchDate).toLocaleDateString("es-MX", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
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
