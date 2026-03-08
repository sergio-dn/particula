import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Rocket } from "lucide-react"
import Link from "next/link"
import { formatPrice } from "@/lib/utils"

interface SearchParams {
  brandId?: string
  country?: string
  days?: string
  productType?: string
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
      ...(params.productType ? { productType: params.productType } : {}),
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

function buildUrl(params: {
  days?: string
  country?: string
  brandId?: string
  productType?: string
}) {
  const parts: string[] = []
  if (params.days) parts.push(`days=${params.days}`)
  if (params.country) parts.push(`country=${params.country}`)
  if (params.brandId) parts.push(`brandId=${params.brandId}`)
  if (params.productType) parts.push(`productType=${encodeURIComponent(params.productType)}`)
  return `/dashboard/launches${parts.length > 0 ? `?${parts.join("&")}` : ""}`
}

export default async function LaunchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const [launches, brands] = await Promise.all([getLaunches(sp), getBrands()])

  const countries = [...new Set(brands.map((b) => b.country).filter(Boolean))] as string[]

  // Get brands that have at least 1 launch in the current result set (before brand filter)
  const days = parseInt(sp.days ?? "30", 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const launchBrands = await prisma.product.findMany({
    where: {
      isLaunch: true,
      launchDate: { gte: since },
      ...(sp.country ? { brand: { country: sp.country.toUpperCase() } } : {}),
    },
    select: { brandId: true },
    distinct: ["brandId"],
  })
  const launchBrandIds = new Set(launchBrands.map((l) => l.brandId))
  const filteredBrands = brands.filter((b) => launchBrandIds.has(b.id))

  // Get distinct product types from current launches (before productType filter)
  const launchProductTypes = await prisma.product.findMany({
    where: {
      isLaunch: true,
      launchDate: { gte: since },
      productType: { not: null },
      ...(sp.brandId ? { brandId: sp.brandId } : {}),
      ...(sp.country ? { brand: { country: sp.country.toUpperCase() } } : {}),
    },
    select: { productType: true },
    distinct: ["productType"],
  })
  const productTypes = launchProductTypes
    .map((p) => p.productType)
    .filter(Boolean) as string[]
  productTypes.sort()

  const baseDays = sp.days ?? "30"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lanzamientos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nuevos productos detectados en las marcas trackeadas
          </p>
        </div>

        {/* Period filters */}
        <div className="flex flex-wrap gap-2">
          {(["7", "14", "30", "60", "90"] as const).map((d) => (
            <Link
              key={d}
              href={buildUrl({
                days: d,
                country: sp.country,
                brandId: sp.brandId,
                productType: sp.productType,
              })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                baseDays === d
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
            href={buildUrl({ days: baseDays, brandId: sp.brandId, productType: sp.productType })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !sp.country ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            Todos los países
          </Link>
          {countries.map((c) => (
            <Link
              key={c}
              href={buildUrl({ days: baseDays, country: c, brandId: sp.brandId, productType: sp.productType })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                sp.country === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {/* Brand filter pills */}
      {filteredBrands.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ days: baseDays, country: sp.country, productType: sp.productType })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !sp.brandId ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            Todas las marcas
          </Link>
          {filteredBrands.map((b) => (
            <Link
              key={b.id}
              href={buildUrl({ days: baseDays, country: sp.country, brandId: b.id, productType: sp.productType })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                sp.brandId === b.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {b.name}
            </Link>
          ))}
        </div>
      )}

      {/* Product type filter pills */}
      {productTypes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildUrl({ days: baseDays, country: sp.country, brandId: sp.brandId })}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !sp.productType ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            Todas las categorías
          </Link>
          {productTypes.map((pt) => (
            <Link
              key={pt}
              href={buildUrl({ days: baseDays, country: sp.country, brandId: sp.brandId, productType: pt })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                sp.productType === pt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              {pt}
            </Link>
          ))}
        </div>
      )}

      {launches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Rocket className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              No se detectaron lanzamientos en los últimos {baseDays} días.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {launches.map((product) => {
            const minPrice = product.variants[0]?.price
            const compareAt = product.variants[0]?.compareAtPrice
            const productUrl = product.brand.domain && product.handle
              ? `https://${product.brand.domain}/products/${product.handle}`
              : null

            return (
              <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow relative">
                {product.imageUrl && (
                  <div className="aspect-[4/3] overflow-hidden bg-muted">
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {productUrl && (
                  <a
                    href={productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm hover:bg-background transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                )}
                <CardContent className="pt-4 pb-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight line-clamp-2">
                        {product.title}
                      </p>
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
