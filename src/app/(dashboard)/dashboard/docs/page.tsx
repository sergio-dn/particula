"use client"

import dynamic from "next/dynamic"
import "swagger-ui-react/swagger-ui.css"

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false })

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Docs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documentación interactiva de la API de Particula
        </p>
      </div>
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SwaggerUI url="/api/docs" />
      </div>
    </div>
  )
}
