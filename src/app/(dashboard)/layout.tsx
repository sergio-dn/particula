import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Toaster } from "sonner"

export const dynamic = "force-dynamic"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 lg:hidden">
          <SidebarTrigger />
          <span className="font-semibold text-sm">Particula</span>
        </div>
        <div className="p-6">{children}</div>
      </main>
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  )
}
