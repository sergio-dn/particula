/**
 * @swagger
 * /api/export/{type}:
 *   get:
 *     summary: Exportar datos como CSV
 *     tags: [Export]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [top-sellers, events, catalog]
 *     responses:
 *       200:
 *         description: Archivo CSV
 */
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(",")]
  for (const row of rows) {
    lines.push(row.map(escape).join(","))
  }
  return "\uFEFF" + lines.join("\n")
}

async function exportTopSellers(sp: URLSearchParams): Promise<{ csv: string; filename: string }> {
  const days = parseInt(sp.get("days") ?? "30", 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const brandId = sp.get("brandId")

  const estimates = await prisma.salesEstimate.groupBy({
    by: ["variantId"],
    where: {
      date: { gte: since },
      ...(brandId ? { brandId } : {}),
    },
    _sum: { unitsSold: true, revenueEstimate: true },
    orderBy: { _sum: { revenueEstimate: "desc" } },
    take: 200,
  })

  if (estimates.length === 0) {
    return { csv: toCsv(["Sin datos"], []), filename: `top-sellers-${new Date().toISOString().slice(0, 10)}.csv` }
  }

  const variantIds = estimates.map((e) => e.variantId)
  const variants = await prisma.variant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        select: {
          title: true,
          productType: true,
          brand: { select: { name: true } },
        },
      },
    },
  })
  const variantMap = new Map(variants.map((v) => [v.id, v]))

  const headers = ["Rank", "Producto", "Marca", "SKU", "Variante", "Tipo", "Unidades", "Revenue"]
  const rows = estimates.map((e, i) => {
    const v = variantMap.get(e.variantId)
    return [
      String(i + 1),
      v?.product.title ?? "",
      v?.product.brand.name ?? "",
      v?.sku ?? "",
      v?.title ?? "",
      v?.product.productType ?? "",
      String(e._sum.unitsSold ?? 0),
      String(Number(e._sum.revenueEstimate ?? 0).toFixed(2)),
    ]
  })

  return { csv: toCsv(headers, rows), filename: `top-sellers-${new Date().toISOString().slice(0, 10)}.csv` }
}

async function exportEvents(sp: URLSearchParams): Promise<{ csv: string; filename: string }> {
  const days = parseInt(sp.get("days") ?? "30", 10)
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const brandId = sp.get("brandId")
  const type = sp.get("type")

  const alertFilter: Record<string, unknown> = {}
  if (brandId) alertFilter.brandId = brandId
  if (type) alertFilter.type = type

  const where: Record<string, unknown> = {
    alert: alertFilter,
    triggeredAt: { gte: from },
  }

  const items = await prisma.alertEvent.findMany({
    where,
    include: {
      alert: {
        select: {
          type: true,
          brand: { select: { name: true } },
        },
      },
    },
    orderBy: { triggeredAt: "desc" },
    take: 500,
  })

  const headers = ["Fecha", "Tipo", "Marca", "Mensaje", "Leido"]
  const rows = items.map((e) => [
    new Date(e.triggeredAt).toISOString().slice(0, 19).replace("T", " "),
    e.alert.type,
    e.alert.brand.name,
    e.message,
    e.isRead ? "Si" : "No",
  ])

  return { csv: toCsv(headers, rows), filename: `eventos-${new Date().toISOString().slice(0, 10)}.csv` }
}

async function exportCatalog(sp: URLSearchParams): Promise<{ csv: string; filename: string }> {
  const brandId = sp.get("brandId")

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(brandId ? { brandId } : {}),
    },
    include: {
      brand: { select: { name: true } },
      variants: {
        select: {
          title: true,
          sku: true,
          price: true,
          compareAtPrice: true,
          isAvailable: true,
        },
      },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 2000,
  })

  const headers = ["Marca", "Producto", "Handle", "Tipo", "SKU", "Variante", "Precio", "Precio comparado", "Disponible", "Primera vez"]
  const rows: string[][] = []
  for (const p of products) {
    for (const v of p.variants) {
      rows.push([
        p.brand.name,
        p.title,
        p.handle,
        p.productType ?? "",
        v.sku ?? "",
        v.title,
        String(Number(v.price)),
        v.compareAtPrice ? String(Number(v.compareAtPrice)) : "",
        v.isAvailable ? "Si" : "No",
        p.firstSeenAt.toISOString().slice(0, 10),
      ])
    }
  }

  return { csv: toCsv(headers, rows), filename: `catalogo-${new Date().toISOString().slice(0, 10)}.csv` }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { error } = await requireRole("VIEWER")
  if (error) return error

  const { type } = await params
  const sp = new URL(req.url).searchParams

  let result: { csv: string; filename: string }

  switch (type) {
    case "top-sellers":
      result = await exportTopSellers(sp)
      break
    case "events":
      result = await exportEvents(sp)
      break
    case "catalog":
      result = await exportCatalog(sp)
      break
    default:
      return new Response(JSON.stringify({ error: "Invalid export type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
  }

  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  })
}
