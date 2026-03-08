"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ExportButtonProps {
  type: "top-sellers" | "events" | "catalog"
  params?: Record<string, string | undefined>
  label?: string
}

export function ExportButton({ type, params, label = "Exportar CSV" }: ExportButtonProps) {
  function handleExport() {
    const sp = new URLSearchParams()
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value) sp.set(key, value)
      }
    }
    window.open(`/api/export/${type}?${sp.toString()}`, "_blank")
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleExport}>
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
