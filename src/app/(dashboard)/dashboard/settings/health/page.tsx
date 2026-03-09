import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, Activity } from "lucide-react"

async function getHealthData() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [totalJobs, completedJobs, failedJobs, avgDuration, recentErrors, domainStats] =
    await Promise.all([
      prisma.scrapeJob.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.scrapeJob.count({
        where: { status: "COMPLETED", createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.scrapeJob.count({
        where: { status: "FAILED", createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.scrapeJob.findMany({
        where: {
          status: "COMPLETED",
          startedAt: { not: null },
          completedAt: { not: null },
          createdAt: { gte: sevenDaysAgo },
        },
        select: { startedAt: true, completedAt: true },
      }),
      prisma.scrapeJob.findMany({
        where: { status: "FAILED", createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          error: true,
          createdAt: true,
          brand: { select: { name: true, domain: true } },
        },
      }),
      prisma.scrapeJob.groupBy({
        by: ["brandId"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true, status: true },
      }),
    ])

  // Calculate average duration
  const durations = avgDuration
    .filter((j) => j.startedAt && j.completedAt)
    .map((j) => j.completedAt!.getTime() - j.startedAt!.getTime())
  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0

  // Get per-domain success rates
  const brandIds = domainStats.map((d) => d.brandId)
  const brands = await prisma.brand.findMany({
    where: { id: { in: brandIds } },
    select: { id: true, name: true, domain: true },
  })
  const brandMap = new Map(brands.map((b) => [b.id, b]))

  const completedByBrand = await prisma.scrapeJob.groupBy({
    by: ["brandId"],
    where: { status: "COMPLETED", createdAt: { gte: sevenDaysAgo } },
    _count: { _all: true },
  })
  const completedMap = new Map(completedByBrand.map((c) => [c.brandId, c._count._all]))

  const domainHealth = domainStats.map((d) => {
    const brand = brandMap.get(d.brandId)
    const completed = completedMap.get(d.brandId) ?? 0
    const total = d._count._all
    return {
      brandId: d.brandId,
      name: brand?.name ?? "Unknown",
      domain: brand?.domain ?? "",
      total,
      completed,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    }
  }).sort((a, b) => a.successRate - b.successRate)

  const successRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 100

  return { totalJobs, completedJobs, failedJobs, avgDurationMs, successRate, recentErrors, domainHealth }
}

export default async function HealthPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const health = await getHealthData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Salud del Sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Métricas de scraping de los últimos 7 días
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.successRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completados</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.completedJobs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fallidos</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.failedJobs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Duración promedio</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health.avgDurationMs > 0
                ? `${(health.avgDurationMs / 1000).toFixed(1)}s`
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Per-domain health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Success Rate por Dominio</CardTitle>
          </CardHeader>
          <CardContent>
            {health.domainHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin datos aún</p>
            ) : (
              <div className="space-y-3">
                {health.domainHealth.map((d) => (
                  <div key={d.brandId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.domain}</p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant="outline"
                        className={
                          d.successRate >= 90
                            ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                            : d.successRate >= 70
                              ? "text-yellow-700 bg-yellow-50 border-yellow-200"
                              : "text-red-700 bg-red-50 border-red-200"
                        }
                      >
                        {d.successRate}%
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {d.completed}/{d.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent errors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos Errores</CardTitle>
          </CardHeader>
          <CardContent>
            {health.recentErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin errores en los últimos 7 días 🎉
              </p>
            ) : (
              <div className="space-y-3">
                {health.recentErrors.map((e) => (
                  <div key={e.id} className="border-l-2 border-red-300 pl-3">
                    <p className="text-sm font-medium">{e.brand.name}</p>
                    <p className="text-xs text-red-600 line-clamp-2">{e.error}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(e.createdAt).toLocaleString("es-MX", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
