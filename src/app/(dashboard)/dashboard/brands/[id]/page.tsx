import { notFound } from "next/navigation"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  ArrowLeft,
  ExternalLink,
  Package,
  Activity,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
} from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatPrice } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const categoryLabels: Record<string, string> = {
  COMPETITOR: "Competidor",
  ASPIRATIONAL: "Aspiracional",
  INTERNATIONAL: "Internacional",
  ADJACENT: "Adyacente",
  MY_BRAND: "Mi marca",
}

const categoryColors: Record<string, string> = {
  COMPETITOR: "bg-red-50 text-red-700 border-red-200",
  ASPIRATIONAL: "bg-blue-50 text-blue-700 border-blue-200",
  INTERNATIONAL: "bg-purple-50 text-purple-700 border-purple-200",
  ADJACENT: "bg-yellow-50 text-yellow-700 border-yellow-200",
  MY_BRAND: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

const platformColors: Record<string, string> = {
  SHOPIFY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  WOOCOMMERCE: "bg-purple-50 text-purple-700 border-purple-200",
  MAGENTO: "bg-orange-50 text-orange-700 border-orange-200",
  BIGCOMMERCE: "bg-blue-50 text-blue-700 border-blue-200",
  GENERIC: "bg-gray-50 text-gray-700 border-gray-200",
}

function ScrapeStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    COMPLETED: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Completado",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    RUNNING: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Ejecutando",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    PENDING: {
      icon: <Clock className="h-3 w-3" />,
      label: "Pendiente",
      className: "bg-yellow-50 text-yellow-700 border-yellow-200",
    },
    FAILED: {
      icon: <XCircle className="h-3 w-3" />,
      label: "Fallido",
      className: "bg-red-50 text-red-700 border-red-200",
    },
  }
  const c = config[status] ?? {
    icon: <Circle className="h-3 w-3" />,
    label: status,
    className: "bg-gray-50 text-gray-700 border-gray-200",
  }
  return (
    <Badge variant="outline" className={`gap-1 ${c.className}`}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

function WinnerScoreBadge({ score }: { score: number }) {
  let className = "bg-red-50 text-red-700 border-red-200"
  if (score > 70) className = "bg-emerald-50 text-emerald-700 border-emerald-200"
  else if (score > 40) className = "bg-yellow-50 text-yellow-700 border-yellow-200"
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Trophy className="h-3 w-3" />
      {score.toFixed(0)}
    </Badge>
  )
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "---"
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
}

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      products: {
        where: { isActive: true },
        orderBy: { lastSeenAt: "desc" },
        take: 50,
        include: {
          variants: {
            select: { id: true, price: true, isAvailable: true, title: true },
          },
          winnerScores: { orderBy: { date: "desc" }, take: 1 },
        },
      },
      scrapeJobs: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { products: true } },
    },
  })

  if (!brand) notFound()

  // Computed stats
  const totalVariants = brand.products.reduce(
    (sum, p) => sum + p.variants.length,
    0,
  )

  const productsWithScore = brand.products.filter(
    (p) => p.winnerScores.length > 0,
  )
  const avgWinnerScore =
    productsWithScore.length > 0
      ? productsWithScore.reduce(
          (sum, p) => sum + p.winnerScores[0].compositeScore,
          0,
        ) / productsWithScore.length
      : null

  const lastJob = brand.scrapeJobs[0] ?? null

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/dashboard/brands"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Marcas
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-14 w-14 rounded-lg object-cover border"
          />
        ) : (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold uppercase">
            {brand.name[0]}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{brand.name}</h1>
          <a
            href={`https://${brand.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {brand.domain}
            <ExternalLink className="h-3 w-3" />
          </a>

          {/* Badges */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {brand.platformType && (
              <Badge
                variant="outline"
                className={
                  platformColors[brand.platformType] ?? platformColors.GENERIC
                }
              >
                {brand.platformType}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={categoryColors[brand.category] ?? ""}
            >
              {categoryLabels[brand.category] ?? brand.category}
            </Badge>
            {brand.country && (
              <Badge variant="outline">{brand.country}</Badge>
            )}
            {brand.isMyBrand && (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                Mi marca
              </Badge>
            )}
          </div>

          {brand.platformConfidence != null && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Confianza: {(brand.platformConfidence * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Productos totales
            </CardTitle>
            <Package className="h-4 w-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {brand._count.products.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Variantes activas
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalVariants.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Winner score prom.
            </CardTitle>
            <Trophy className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgWinnerScore != null ? avgWinnerScore.toFixed(1) : "\u2014"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ultimo scrape
            </CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">
                {lastJob?.completedAt
                  ? formatRelativeTime(lastJob.completedAt)
                  : "\u2014"}
              </span>
              {lastJob && <ScrapeStatusBadge status={lastJob.status} />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tags & notes */}
      {(brand.tags.length > 0 || brand.notes) && (
        <div className="space-y-4">
          {brand.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {brand.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {brand.notes && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {brand.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Scrape Jobs */}
      {brand.scrapeJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Historial de scraping</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Variantes</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brand.scrapeJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <ScrapeStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {job.type}
                    </TableCell>
                    <TableCell>{job.productsFound}</TableCell>
                    <TableCell>{job.variantsFound}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.startedAt
                        ? new Date(job.startedAt).toLocaleString("es-MX", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.completedAt
                        ? new Date(job.completedAt).toLocaleString("es-MX", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {job.error ? (
                        <span
                          className="text-xs text-destructive truncate block"
                          title={job.error}
                        >
                          {job.error.length > 60
                            ? `${job.error.slice(0, 60)}...`
                            : job.error}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          ---
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Products */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Productos ({brand._count.products.toLocaleString()})
          </h2>
        </div>

        {brand.products.length === 0 ? (
          <Card className="py-12">
            <CardContent className="text-center">
              <Package className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="mt-3 text-sm text-muted-foreground">
                Sin productos activos. Ejecuta un scrape para obtener datos.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {brand.products.map((product) => {
              const prices = product.variants
                .map((v) => Number(v.price))
                .filter((p) => !isNaN(p))
              const minPrice = prices.length > 0 ? Math.min(...prices) : null
              const maxPrice = prices.length > 0 ? Math.max(...prices) : null
              const availableCount = product.variants.filter(
                (v) => v.isAvailable,
              ).length
              const winnerScore = product.winnerScores[0]?.compositeScore ?? null

              return (
                <Card
                  key={product.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="pt-4 pb-4 px-4">
                    <div className="flex items-start gap-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="h-16 w-16 rounded-md object-cover border flex-shrink-0"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight line-clamp-2">
                          {product.title}
                        </p>

                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {product.productType && (
                            <Badge variant="secondary" className="text-xs">
                              {product.productType}
                            </Badge>
                          )}
                          {winnerScore != null && (
                            <WinnerScoreBadge score={winnerScore} />
                          )}
                        </div>

                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {product.variants.length}{" "}
                            {product.variants.length === 1
                              ? "variante"
                              : "variantes"}
                          </span>
                          <span>
                            {availableCount}/{product.variants.length} disp.
                          </span>
                        </div>

                        {minPrice != null && (
                          <p className="mt-1 text-sm font-medium">
                            {minPrice === maxPrice
                              ? formatPrice(minPrice, brand.currency)
                              : `${formatPrice(minPrice, brand.currency)} - ${formatPrice(maxPrice, brand.currency)}`}
                          </p>
                        )}
                      </div>

                      <a
                        href={`https://${brand.domain}/products/${product.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        title="Ver en tienda"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
