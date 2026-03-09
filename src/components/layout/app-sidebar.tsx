"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  Flame,
  LayoutDashboard,
  LogOut,
  Rocket,
  Settings,
  Sparkles,
  Tag,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react"
import { signOut } from "next-auth/react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const navItems = [
  {
    label: "General",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/brands", label: "Marcas", icon: Building2 },
    ],
  },
  {
    label: "Análisis",
    items: [
      { href: "/dashboard/top-sellers", label: "Top Sellers", icon: Flame },
      { href: "/dashboard/sales", label: "Ventas & Benchmark", icon: BarChart3 },
      { href: "/dashboard/launches", label: "Lanzamientos", icon: Rocket },
      { href: "/dashboard/trends", label: "Tendencias", icon: TrendingUp },
      { href: "/dashboard/winners", label: "Winners", icon: Trophy },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { href: "/dashboard/pricing", label: "Precios", icon: Tag },
      { href: "/dashboard/assortment", label: "Assortment", icon: Sparkles },
      { href: "/dashboard/events", label: "Eventos & Promos", icon: Zap },
    ],
  },
]

export function AppSidebar({ role }: { role?: string }) {
  const pathname = usePathname()

  return (
    <Sidebar className="border-r border-border">
      <SidebarHeader className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0"
          >
            {/* Center dot */}
            <circle cx="16" cy="16" r="3" fill="url(#particula-grad)" />
            {/* Orbital 1 — horizontal */}
            <ellipse cx="16" cy="16" rx="13" ry="5" stroke="url(#particula-grad)" strokeWidth="1.5" opacity="0.8" />
            {/* Orbital 2 — tilted 60deg */}
            <ellipse cx="16" cy="16" rx="13" ry="5" stroke="url(#particula-grad)" strokeWidth="1.5" opacity="0.6" transform="rotate(60 16 16)" />
            {/* Orbital 3 — tilted -60deg */}
            <ellipse cx="16" cy="16" rx="13" ry="5" stroke="url(#particula-grad)" strokeWidth="1.5" opacity="0.6" transform="rotate(-60 16 16)" />
            <defs>
              <linearGradient id="particula-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-semibold text-base tracking-tight">Particula</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {navItems.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href} className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu>
          {(role === "ADMIN" || role === "EDITOR") && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard/settings"}>
                  <Link href="/dashboard/settings" className="flex items-center gap-2.5">
                    <Settings className="h-4 w-4" />
                    <span>Configuración</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {role === "ADMIN" && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/dashboard/settings/users"}>
                      <Link href="/dashboard/settings/users" className="flex items-center gap-2.5">
                        <Users className="h-4 w-4" />
                        <span>Usuarios</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/dashboard/settings/health"}>
                      <Link href="/dashboard/settings/health" className="flex items-center gap-2.5">
                        <Activity className="h-4 w-4" />
                        <span>Salud</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard/docs"}>
                  <Link href="/dashboard/docs" className="flex items-center gap-2.5">
                    <BookOpen className="h-4 w-4" />
                    <span>API Docs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2.5 text-muted-foreground hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
