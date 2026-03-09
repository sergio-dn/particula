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
 *   post:
 *     summary: Crear usuario
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
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
 *       201:
 *         description: Usuario creado
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

const createUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]).default("VIEWER"),
})

export async function GET() {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const body = await req.json()
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { name, email, password, role } = parsed.data
  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (err: unknown) {
    // Prisma unique constraint violation
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email" },
        { status: 400 },
      )
    }
    throw err
  }
}
