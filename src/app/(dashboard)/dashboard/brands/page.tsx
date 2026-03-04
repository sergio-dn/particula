import { prisma } from "@/lib/prisma"
import { BrandsClient } from "./brands-client"

async function getBrands() {
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
}

export default async function BrandsPage() {
  const brands = await getBrands()
  return <BrandsClient brands={brands} />
}
