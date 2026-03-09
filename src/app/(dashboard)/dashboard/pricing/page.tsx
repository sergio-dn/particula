import { prisma } from "@/lib/prisma"
import { PricingClient } from "./pricing-client"

async function getPriceChanges() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  return prisma.priceHistory.findMany({
    where: { recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    take: 200,
    include: {
      variant: {
        include: {
          product: {
            select: {
              title: true,
              imageUrl: true,
              productType: true,
              brand: { select: { id: true, name: true, currency: true } },
            },
          },
        },
      },
    },
  })
}

async function getDiscountedProducts() {
  return prisma.variant.findMany({
    where: {
      compareAtPrice: { not: null },
      isAvailable: true,
    },
    orderBy: { price: "asc" },
    take: 200,
    include: {
      product: {
        select: {
          title: true,
          imageUrl: true,
          productType: true,
          brand: { select: { id: true, name: true, currency: true } },
        },
      },
    },
  })
}

async function getBrands() {
  return prisma.brand.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
}

export default async function PricingPage() {
  const [priceChanges, discountedProducts, brands] = await Promise.all([
    getPriceChanges(),
    getDiscountedProducts(),
    getBrands(),
  ])

  return (
    <PricingClient
      priceChanges={JSON.parse(JSON.stringify(priceChanges))}
      discountedProducts={JSON.parse(JSON.stringify(discountedProducts))}
      brands={brands}
    />
  )
}
