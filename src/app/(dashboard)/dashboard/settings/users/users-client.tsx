"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Shield, ShieldCheck, Eye, Plus, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface User {
  id: string
  name: string | null
  email: string | null
  role: string
  createdAt: Date
}

const ROLE_CONFIG = {
  ADMIN: { label: "Admin", icon: ShieldCheck, color: "text-red-600 bg-red-50 border-red-200" },
  EDITOR: { label: "Editor", icon: Shield, color: "text-blue-600 bg-blue-50 border-blue-200" },
  VIEWER: { label: "Viewer", icon: Eye, color: "text-gray-600 bg-gray-50 border-gray-200" },
} as const

export function UsersClient({
  users: initialUsers,
  currentUserId,
}: {
  users: User[]
  currentUserId: string
}) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [updating, setUpdating] = useState<string | null>(null)

  // Dialog de crear usuario
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("VIEWER")

  // Dialog de editar usuario
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPassword, setEditPassword] = useState("")

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdating(userId)
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
        )
        toast.success("Rol actualizado")
      } else {
        toast.error("Error al cambiar rol")
      }
    } finally {
      setUpdating(null)
    }
  }

  async function handleCreate() {
    if (!newEmail || !newPassword) return
    setCreateLoading(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName || undefined,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      })

      if (res.ok) {
        toast.success("Usuario creado")
        setCreateOpen(false)
        setNewName("")
        setNewEmail("")
        setNewPassword("")
        setNewRole("VIEWER")
        router.refresh()
      } else {
        const data = await res.json()
        const msg = typeof data.error === "string"
          ? data.error
          : "Error al crear usuario"
        toast.error(msg)
      }
    } catch {
      toast.error("Error de conexión")
    } finally {
      setCreateLoading(false)
    }
  }

  function openEdit(user: User) {
    setEditTarget(user)
    setEditName(user.name ?? "")
    setEditEmail(user.email ?? "")
    setEditPassword("")
  }

  async function handleEdit() {
    if (!editTarget) return
    setEditLoading(true)
    try {
      const body: Record<string, string> = {}
      if (editName !== (editTarget.name ?? "")) body.name = editName
      if (editEmail !== (editTarget.email ?? "")) body.email = editEmail
      if (editPassword) body.password = editPassword

      if (Object.keys(body).length === 0) {
        toast.info("Sin cambios")
        setEditTarget(null)
        setEditLoading(false)
        return
      }

      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast.success("Usuario actualizado")
        setEditTarget(null)
        router.refresh()
      } else {
        const data = await res.json()
        const msg = typeof data.error === "string"
          ? data.error
          : "Error al actualizar"
        toast.error(msg)
      }
    } catch {
      toast.error("Error de conexión")
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {users.length} usuario{users.length !== 1 ? "s" : ""}
          </CardTitle>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Crear usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear usuario</DialogTitle>
                <DialogDescription>
                  El usuario podrá acceder con email y contraseña.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email *</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Contraseña *</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Rol</label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                      <SelectItem value="EDITOR">Editor</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createLoading || !newEmail || !newPassword}
                >
                  {createLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          <div className="divide-y">
            {users.map((user) => {
              const config = ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.VIEWER
              const Icon = config.icon
              const isCurrentUser = user.id === currentUserId

              return (
                <div key={user.id} className="flex items-center gap-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase">
                    {(user.name ?? user.email ?? "?")[0]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.name ?? "Sin nombre"}
                      {isCurrentUser && (
                        <span className="text-xs text-muted-foreground ml-1">(tú)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>

                  {!isCurrentUser && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(user)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {isCurrentUser ? (
                    <Badge variant="outline" className={`text-xs ${config.color}`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  ) : (
                    <Select
                      value={user.role}
                      onValueChange={(val) => handleRoleChange(user.id, val)}
                      disabled={updating === user.id}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                    {new Date(user.createdAt).toLocaleDateString("es-MX", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de editar usuario */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Modifica el perfil de {editTarget?.name ?? editTarget?.email ?? "este usuario"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nombre</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Nueva contraseña <span className="text-muted-foreground">(dejar vacío para no cambiar)</span>
              </label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
