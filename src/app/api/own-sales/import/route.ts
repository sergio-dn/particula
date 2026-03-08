import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod/v4"

const RowSchema = z.object({
  sku: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.number().int().min(0),
  revenue: z.number().min(0),
})

const ImportSchema = z.object({
  brandId: z.string().min(1),
  rows: z.array(RowSchema).min(1).max(5000),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ImportSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      )
    }

    const { brandId, rows } = parsed.data

    // Verify brand exists
    const brand = await prisma.brand.findUnique({ where: { id: brandId } })
    if (!brand) {
      return NextResponse.json({ error: "Marca no encontrada" }, { status: 404 })
    }

    // Upsert in batches of 100
    let imported = 0
    const errors: string[] = []
    const batchSize = 100

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      try {
        await prisma.$transaction(
          batch.map((row) =>
            prisma.ownSalesData.upsert({
              where: {
                brandId_sku_date: {
                  brandId,
                  sku: row.sku,
                  date: new Date(row.date),
                },
              },
              create: {
                brandId,
                sku: row.sku,
                date: new Date(row.date),
                units: row.units,
                revenue: row.revenue,
                source: "csv",
              },
              update: {
                units: row.units,
                revenue: row.revenue,
              },
            }),
          ),
        )
        imported += batch.length
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`Error en filas ${i + 1}-${i + batch.length}: ${msg}`)
      }
    }

    return NextResponse.json({ imported, errors, total: rows.length })
  } catch {
    return NextResponse.json({ error: "Error procesando importación" }, { status: 500 })
  }
}
