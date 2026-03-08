"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Mail, Webhook, Send, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"

interface BrandAlertConfig {
  id: string
  type: string
  isActive: boolean
  emailEnabled: boolean
  emailRecipients: string[]
  webhookEnabled: boolean
  webhookUrl: string | null
  brand: { name: string }
}

interface Props {
  alerts: BrandAlertConfig[]
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  NEW_PRODUCTS: "Nuevos productos",
  PRICE_CHANGE: "Cambio de precio",
  PRICE_DROP: "Descuento detectado",
  RESTOCK: "Restock",
  HIGH_VELOCITY: "Alta velocidad",
  VARIANT_ADDED: "Nueva variante",
  DISCOUNT_START: "Inicio descuento",
  DISCOUNT_END: "Fin descuento",
  OUT_OF_STOCK: "Sin stock",
  PRODUCT_REMOVED: "Producto eliminado",
}

export function NotificationsClient({ alerts: initialAlerts }: Props) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [globalEmail, setGlobalEmail] = useState("")
  const [globalWebhookUrl, setGlobalWebhookUrl] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [testingWebhook, setTestingWebhook] = useState(false)

  // Group alerts by brand
  const brandGroups = new Map<string, typeof alerts>()
  for (const alert of alerts) {
    const key = alert.brand.name
    const group = brandGroups.get(key) ?? []
    group.push(alert)
    brandGroups.set(key, group)
  }

  async function toggleEmail(alertId: string, enabled: boolean) {
    setSaving(alertId)
    try {
      const recipients = globalEmail
        ? globalEmail.split(",").map((e) => e.trim()).filter(Boolean)
        : []

      const res = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: enabled,
          ...(recipients.length > 0 ? { emailRecipients: recipients } : {}),
        }),
      })

      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? { ...a, emailEnabled: enabled, ...(recipients.length > 0 ? { emailRecipients: recipients } : {}) }
              : a,
          ),
        )
        toast.success(enabled ? "Email activado" : "Email desactivado")
      }
    } catch {
      toast.error("Error al actualizar")
    }
    setSaving(null)
  }

  async function toggleWebhook(alertId: string, enabled: boolean) {
    setSaving(alertId)
    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookEnabled: enabled,
          ...(globalWebhookUrl ? { webhookUrl: globalWebhookUrl } : {}),
        }),
      })

      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? { ...a, webhookEnabled: enabled, ...(globalWebhookUrl ? { webhookUrl: globalWebhookUrl } : {}) }
              : a,
          ),
        )
        toast.success(enabled ? "Webhook activado" : "Webhook desactivado")
      }
    } catch {
      toast.error("Error al actualizar")
    }
    setSaving(null)
  }

  async function testWebhook() {
    if (!globalWebhookUrl) {
      toast.error("Ingresa una URL de webhook primero")
      return
    }
    setTestingWebhook(true)
    try {
      const res = await fetch("/api/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: globalWebhookUrl }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Webhook de prueba enviado correctamente")
      } else {
        toast.error(`Error: ${data.error || "Fallo al enviar"}`)
      }
    } catch {
      toast.error("Error de conexión")
    }
    setTestingWebhook(false)
  }

  async function enableAllEmail() {
    const recipients = globalEmail.split(",").map((e) => e.trim()).filter(Boolean)
    if (recipients.length === 0) {
      toast.error("Ingresa al menos un email")
      return
    }
    setSaving("all-email")
    for (const alert of alerts) {
      await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailEnabled: true, emailRecipients: recipients }),
      }).catch(() => {})
    }
    setAlerts((prev) => prev.map((a) => ({ ...a, emailEnabled: true, emailRecipients: recipients })))
    toast.success("Email activado para todas las alertas")
    setSaving(null)
  }

  async function enableAllWebhook() {
    if (!globalWebhookUrl) {
      toast.error("Ingresa una URL de webhook")
      return
    }
    setSaving("all-webhook")
    for (const alert of alerts) {
      await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookEnabled: true, webhookUrl: globalWebhookUrl }),
      }).catch(() => {})
    }
    setAlerts((prev) => prev.map((a) => ({ ...a, webhookEnabled: true, webhookUrl: globalWebhookUrl })))
    toast.success("Webhook activado para todas las alertas")
    setSaving(null)
  }

  return (
    <div className="space-y-6">
      {/* Email Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Notificaciones por email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                Emails destinatarios (separados por coma)
              </label>
              <Input
                value={globalEmail}
                onChange={(e) => setGlobalEmail(e.target.value)}
                placeholder="tu@email.com, otro@email.com"
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={enableAllEmail}
              disabled={saving === "all-email"}
              className="h-8 text-xs"
            >
              {saving === "all-email" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Activar todas"}
            </Button>
          </div>

          <div className="space-y-2">
            {Array.from(brandGroups.entries()).map(([brandName, brandAlerts]) => (
              <div key={brandName} className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{brandName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {brandAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => toggleEmail(alert.id, !alert.emailEnabled)}
                      disabled={saving === alert.id}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                        alert.emailEnabled
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {saving === alert.id ? "..." : (alert.emailEnabled ? "✓ " : "") + (ALERT_TYPE_LABELS[alert.type] ?? alert.type)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                Webhook URL
              </label>
              <Input
                value={globalWebhookUrl}
                onChange={(e) => setGlobalWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/... o https://hook.us1.make.com/..."
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={testWebhook}
              disabled={testingWebhook}
              className="h-8 text-xs gap-1"
            >
              {testingWebhook ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Test
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={enableAllWebhook}
              disabled={saving === "all-webhook"}
              className="h-8 text-xs"
            >
              {saving === "all-webhook" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Activar todas"}
            </Button>
          </div>

          <div className="space-y-2">
            {Array.from(brandGroups.entries()).map(([brandName, brandAlerts]) => (
              <div key={brandName} className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">{brandName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {brandAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => toggleWebhook(alert.id, !alert.webhookEnabled)}
                      disabled={saving === alert.id}
                      className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                        alert.webhookEnabled
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {saving === alert.id ? "..." : (alert.webhookEnabled ? "✓ " : "") + (ALERT_TYPE_LABELS[alert.type] ?? alert.type)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
