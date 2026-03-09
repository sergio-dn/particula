/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Listar usuarios
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Array de usuarios
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Solo ADMIN
 */
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"
import { NextResponse } from "next/server"

export async function GET() {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(users)
}
