import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"

const createRateSchema = z
  .object({
    fromCurrency: z.string().length(3).toUpperCase(),
    toCurrency: z.string().length(3).toUpperCase().default("USD"),
    rate: z.number().positive(),
    effectiveDate: z.string().date(), // "YYYY-MM-DD"
    source: z.string().default("manual"),
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: "fromCurrency y toCurrency deben ser diferentes",
  })

// GET /api/exchange-rates?from=EUR&to=USD&limit=50
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)

  const rates = await prisma.exchangeRate.findMany({
    where: {
      ...(from ? { fromCurrency: from.toUpperCase() } : {}),
      ...(to ? { toCurrency: to.toUpperCase() } : {}),
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  })

  return NextResponse.json(rates)
}

// POST /api/exchange-rates
export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createRateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { fromCurrency, toCurrency, rate, effectiveDate, source } = parsed.data

  const entry = await prisma.exchangeRate.create({
    data: {
      fromCurrency,
      toCurrency,
      rate,
      effectiveDate: new Date(effectiveDate),
      source,
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
