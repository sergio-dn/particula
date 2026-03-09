"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Shield, ShieldCheck, Eye } from "lucide-react"

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
  const [users, setUsers] = useState(initialUsers)
  const [updating, setUpdating] = useState<string | null>(null)

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
      }
    } finally {
      setUpdating(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {users.length} usuario{users.length !== 1 ? "s" : ""}
        </CardTitle>
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
  )
}
