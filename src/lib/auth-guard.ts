import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

type Role = "ADMIN" | "EDITOR" | "VIEWER"

const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
}

/**
 * Verifica que el usuario autenticado tenga al menos el rol mínimo requerido.
 * Retorna la sesión si autorizado, o un NextResponse de error.
 */
export async function requireRole(minRole: Role) {
  const session = await auth()

  if (!session?.user) {
    return {
      session: null as null,
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    }
  }

  const userRole = (session.user.role ?? "VIEWER") as Role
  if ((ROLE_HIERARCHY[userRole] ?? 0) < ROLE_HIERARCHY[minRole]) {
    return {
      session: null as null,
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    }
  }

  return { session, error: null as null }
}

/**
 * Obtiene el rol del usuario actual. Retorna "VIEWER" si no hay sesión.
 */
export async function getSessionRole(): Promise<Role> {
  const session = await auth()
  return ((session?.user?.role as Role) ?? "VIEWER") as Role
}
