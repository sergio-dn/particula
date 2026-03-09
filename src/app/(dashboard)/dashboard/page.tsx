import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Flame, Package, Rocket } from "lucide-react"
import Link from "next/link"
import { unstable_cache } from "next/cache"

const getStats = unstable_cache(
  async () => {
    const [totalBrands, totalProducts, recentLaunches, activeScrapeJobs] = await Promise.all([
      prisma.brand.count({ where: { isActive: true } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({
        where: {
          isLaunch: true,
          launchDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.scrapeJob.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
    ])

    return { totalBrands, totalProducts, recentLaunches, activeScrapeJobs }
  },
  ["dashboard-stats"],
  { revalidate: 60, tags: ["dashboard-stats"] },
)

const getRecentBrands = unstable_cache(
  async () => {
    return prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, domain: true, logoUrl: true, shopifyStore: true, category: true },
    })
  },
  ["dashboard-recent-brands"],
  { revalidate: 60, tags: ["dashboard-stats", "brands"] },
)

const getRecentLaunches = unstable_cache(
  async () => {
    return prisma.product.findMany({
      where: { isLaunch: true },
      orderBy: { launchDate: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        imageUrl: true,
        launchDate: true,
        productType: true,
        brand: { select: { name: true } },
      },
    })
  },
  ["dashboard-recent-launches"],
  { revalidate: 60, tags: ["dashboard-stats"] },
)

export default async function DashboardPage() {
  const [stats, recentBrands, recentLaunches] = await Promise.all([
    getStats(),
    getRecentBrands(),
    getRecentLaunches(),
  ])

  const statCards = [
    {
      title: "Marcas trackeadas",
      value: stats.totalBrands,
      icon: Building2,
      href: "/dashboard/brands",
      color: "text-blue-600",
    },
    {
      title: "Productos activos",
      value: stats.totalProducts.toLocaleString(),
      icon: Package,
      href: "/dashboard/top-sellers",
      color: "text-violet-600",
    },
    {
      title: "Lanzamientos (7 días)",
      value: stats.recentLaunches,
      icon: Rocket,
      href: "/dashboard/launches",
      color: "text-emerald-600",
    },
    {
      title: "Jobs activos",
      value: stats.activeScrapeJobs,
      icon: Flame,
      href: "/dashboard/brands",
      color: "text-orange-600",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Inteligencia competitiva en tiempo real
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.title} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Brands */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Marcas recientes</CardTitle>
            <Link href="/dashboard/brands" className="text-xs text-primary hover:underline">
              Ver todas →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentBrands.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay marcas aún.{" "}
                <Link href="/dashboard/brands" className="text-primary underline">
                  Agrega una
                </Link>
              </p>
            ) : (
              recentBrands.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase">
                    {b.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.domain}</p>
                  </div>
                  {b.shopifyStore && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">
                      Shopify
                    </span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Launches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Últimos lanzamientos</CardTitle>
            <Link href="/dashboard/launches" className="text-xs text-primary hover:underline">
              Ver todos →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLaunches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin lanzamientos recientes. Comienza trackeando marcas.
              </p>
            ) : (
              recentLaunches.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="h-8 w-8 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-md bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.brand.name}
                      {p.productType ? ` · ${p.productType}` : ""}
                    </p>
                  </div>
                  {p.launchDate && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(p.launchDate).toLocaleDateString("es-MX", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
