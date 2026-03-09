/**
 * @swagger
 * /api/exchange-rates/{id}:
 *   delete:
 *     summary: Eliminar tasa de cambio
 *     tags: [ExchangeRates]
 *     responses:
 *       200:
 *         description: Tasa eliminada
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"

// DELETE /api/exchange-rates/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole("ADMIN")
  if (error) return error
  const { id } = await params

  const existing = await prisma.exchangeRate.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Tasa no encontrada" }, { status: 404 })
  }

  await prisma.exchangeRate.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
