import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// DELETE /api/exchange-rates/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const existing = await prisma.exchangeRate.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Tasa no encontrada" }, { status: 404 })
  }

  await prisma.exchangeRate.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
