/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Actualizar usuario (rol, nombre, email, contraseña)
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
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [ADMIN, EDITOR, VIEWER]
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       400:
 *         description: Datos inválidos o email duplicado
 *       403:
 *         description: Solo ADMIN
 */
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email("Email inválido").optional(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").optional(),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Debes enviar al menos un campo para actualizar",
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const { id } = await params
  const body = await req.json()

  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { name, email, password, role } = parsed.data

  // Construir data dinámicamente — solo los campos que vengan
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (email !== undefined) data.email = email
  if (role !== undefined) data.role = role
  if (password !== undefined) data.password = await bcrypt.hash(password, 10)

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true },
    })
    return NextResponse.json(user)
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 400 },
      )
    }
    throw err
  }
}
