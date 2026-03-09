/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Cambiar rol de usuario
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [ADMIN, EDITOR, VIEWER]
 *     responses:
 *       200:
 *         description: Rol actualizado
 *       403:
 *         description: Solo ADMIN
 */
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"
import { NextResponse } from "next/server"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const { id } = await params
  const body = await req.json()

  const validRoles = ["ADMIN", "EDITOR", "VIEWER"]
  if (!body.role || !validRoles.includes(body.role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role: body.role },
    select: { id: true, name: true, email: true, role: true },
  })

  return NextResponse.json(user)
}
