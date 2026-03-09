import { prisma } from "@/lib/prisma"
import { BrandsClient } from "./brands-client"
import { unstable_cache } from "next/cache"

const getBrands = unstable_cache(
  async () => {
    return prisma.brand.findMany({
      orderBy: [{ isMyBrand: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { products: true } },
        scrapeJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, completedAt: true, createdAt: true, error: true },
        },
      },
    })
  },
  ["brands-list"],
  { revalidate: 60, tags: ["brands"] },
)

export default async function BrandsPage() {
  const brands = await getBrands()
  return <BrandsClient brands={brands} />
}
