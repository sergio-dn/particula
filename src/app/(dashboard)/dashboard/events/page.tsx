import { prisma } from "@/lib/prisma"
import { EventsClient } from "./events-client"
import { OosTimeline } from "./oos-timeline"

interface SearchParams {
  brandId?: string
  type?: string
  isRead?: string
  days?: string
  page?: string
  tab?: string
}

async function getBrands() {
  return prisma.brand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

async function getInitialEvents(sp: SearchParams) {
  const days = parseInt(sp.days ?? "30", 10)
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const page = Math.max(1, parseInt(sp.page ?? "1", 10))
  const limit = 20

  const alertFilter: Record<string, unknown> = {}
  if (sp.brandId) alertFilter.brandId = sp.brandId
  if (sp.type) alertFilter.type = sp.type

  const where: Record<string, unknown> = {
    alert: alertFilter,
    triggeredAt: { gte: from },
  }

  if (sp.isRead === "true" || sp.isRead === "false") {
    where.isRead = sp.isRead === "true"
  }

  const [items, total] = await Promise.all([
    prisma.alertEvent.findMany({
      where,
      include: {
        alert: {
          select: {
            type: true,
            brandId: true,
            brand: { select: { name: true } },
          },
        },
      },
      orderBy: { triggeredAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.alertEvent.count({ where }),
  ])

  return {
    items: items.map((e) => ({
      id: e.id,
      type: e.alert.type as string,
      brandId: e.alert.brandId,
      brandName: e.alert.brand.name,
      message: e.message,
      data: e.data as Record<string, unknown> | null,
      triggeredAt: e.triggeredAt.toISOString(),
      isRead: e.isRead,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function getOosVariants(brandId?: string) {
  const variants = await prisma.variant.findMany({
    where: {
      isAvailable: false,
      product: {
        isActive: true,
        ...(brandId ? { brandId } : {}),
      },
    },
    include: {
      product: {
        select: {
          title: true,
          imageUrl: true,
          productType: true,
          brand: { select: { id: true, name: true, currency: true } },
        },
      },
      inventorySnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 50,
      },
    },
    take: 200,
  })

  const items = variants.map((v) => {
    const lastAvailable = v.inventorySnapshots.find((s) => s.isAvailable)
    const oosStart = lastAvailable
      ? lastAvailable.snapshotAt
      : v.inventorySnapshots.length > 0
        ? v.inventorySnapshots[v.inventorySnapshots.length - 1].snapshotAt
        : new Date()

    const daysSinceOOS = Math.max(
      0,
      Math.floor((Date.now() - new Date(oosStart).getTime()) / (1000 * 60 * 60 * 24))
    )

    return {
      variantId: v.id,
      variantTitle: v.title,
      sku: v.sku,
      price: String(v.price),
      productTitle: v.product.title,
      imageUrl: v.product.imageUrl,
      productType: v.product.productType,
      brandId: v.product.brand.id,
      brandName: v.product.brand.name,
      currency: v.product.brand.currency,
      oosDate: new Date(oosStart).toISOString(),
      daysSinceOOS,
    }
  })

  items.sort((a, b) => b.daysSinceOOS - a.daysSinceOOS)
  return items
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const tab = sp.tab ?? "events"
  const [brands, initialData, oosItems] = await Promise.all([
    getBrands(),
    getInitialEvents(sp),
    tab === "oos" ? getOosVariants(sp.brandId) : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Eventos & Alertas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alertas, cambios de precio, restocks y actividad reciente
        </p>
      </div>

      {tab === "oos" ? (
        <OosTimeline items={JSON.parse(JSON.stringify(oosItems))} brands={brands} />
      ) : (
        <EventsClient
          brands={brands}
          initialEvents={initialData.items}
          initialPagination={initialData.pagination}
        />
      )}
    </div>
  )
}
