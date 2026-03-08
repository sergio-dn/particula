import { prisma } from "@/lib/prisma"
import { WinnersClient } from "./winners-client"

interface SearchParams {
  brandId?: string
  category?: string
  page?: string
}

export default async function WinnersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? "1", 10))

  const [brands, productTypesRaw, latestEntry] = await Promise.all([
    prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      distinct: ["productType"],
      select: { productType: true },
      where: { productType: { not: null } },
    }),
    prisma.winnerScore.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ])

  const productTypes = productTypesRaw
    .map((p) => p.productType)
    .filter(Boolean) as string[]

  if (!latestEntry) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Winners</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ranking de productos ganadores por score compuesto
          </p>
        </div>
        <WinnersClient
          brands={brands}
          productTypes={productTypes}
          initialWinners={[]}
          initialPagination={{ page: 1, total: 0, totalPages: 0 }}
        />
      </div>
    )
  }

  const latestDate = latestEntry.date

  const where = {
    date: latestDate,
    ...(sp.brandId ? { brandId: sp.brandId } : {}),
    ...(sp.category ? { product: { productType: sp.category } } : {}),
  }

  const [scores, total] = await Promise.all([
    prisma.winnerScore.findMany({
      where,
      orderBy: { compositeScore: "desc" },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            productType: true,
            brand: { select: { name: true } },
          },
        },
      },
      take: 20,
      skip: (page - 1) * 20,
    }),
    prisma.winnerScore.count({ where }),
  ])

  const winners = scores.map((s) => ({
    id: s.id,
    productId: s.productId,
    title: s.product.title,
    imageUrl: s.product.imageUrl,
    brandName: s.product.brand.name,
    productType: s.product.productType,
    compositeScore: s.compositeScore,
    confidenceTier: s.confidenceTier,
    salesVelocity: s.salesVelocity,
    restockFrequency: s.restockFrequency,
    stockoutSignal: s.stockoutSignal,
    longevity: s.longevity,
    priceStability: s.priceStability,
    catalogProminence: s.catalogProminence,
    reasonCodes: s.reasonCodes,
  }))

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Winners</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ranking de productos ganadores por score compuesto
        </p>
      </div>
      <WinnersClient
        brands={brands}
        productTypes={productTypes}
        initialWinners={winners}
        initialPagination={{ page, total, totalPages }}
      />
    </div>
  )
}
