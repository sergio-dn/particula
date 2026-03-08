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

const ALERT_SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  OUT_OF_STOCK: { bg: "#fef2f2", text: "#b91c1c" },
  PRODUCT_REMOVED: { bg: "#fef2f2", text: "#b91c1c" },
  PRICE_DROP: { bg: "#fffbeb", text: "#b45309" },
  PRICE_CHANGE: { bg: "#fffbeb", text: "#b45309" },
  HIGH_VELOCITY: { bg: "#fffbeb", text: "#b45309" },
  NEW_PRODUCTS: { bg: "#eff6ff", text: "#1d4ed8" },
  VARIANT_ADDED: { bg: "#eff6ff", text: "#1d4ed8" },
  RESTOCK: { bg: "#f0fdf4", text: "#15803d" },
  DISCOUNT_END: { bg: "#f0fdf4", text: "#15803d" },
  DISCOUNT_START: { bg: "#faf5ff", text: "#7e22ce" },
}

interface DigestEvent {
  type: string
  message: string
  triggeredAt: Date | string
}

export function buildAlertDigestHtml(
  brandName: string,
  events: DigestEvent[],
): string {
  const eventRows = events
    .map((evt) => {
      const colors = ALERT_SEVERITY_COLORS[evt.type] ?? { bg: "#f3f4f6", text: "#374151" }
      const label = ALERT_TYPE_LABELS[evt.type] ?? evt.type
      const time = new Date(evt.triggeredAt).toLocaleString("es-MX", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: ${colors.bg}; color: ${colors.text};">
              ${label}
            </span>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151;">
            ${evt.message}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; white-space: nowrap;">
            ${time}
          </td>
        </tr>`
    })
    .join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
    <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background: #111827; padding: 24px 32px;">
        <h1 style="margin: 0; font-size: 18px; color: white;">Particula</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #9ca3af;">Alerta de inteligencia competitiva</p>
      </div>
      <div style="padding: 24px 32px;">
        <h2 style="margin: 0 0 4px; font-size: 16px; color: #111827;">Nuevas alertas para ${brandName}</h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">${events.length} evento${events.length !== 1 ? "s" : ""} detectado${events.length !== 1 ? "s" : ""}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #f3f4f6;">
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Tipo</th>
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Detalle</th>
              <th style="padding: 8px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Hora</th>
            </tr>
          </thead>
          <tbody>
            ${eventRows}
          </tbody>
        </table>
      </div>
      <div style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #f3f4f6;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
          Puedes desactivar estas notificaciones desde Configuración en tu dashboard de Particula.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export function buildAlertDigestText(
  brandName: string,
  events: DigestEvent[],
): string {
  const lines = [`Nuevas alertas para ${brandName}`, `${events.length} eventos detectados`, ""]
  for (const evt of events) {
    const label = ALERT_TYPE_LABELS[evt.type] ?? evt.type
    lines.push(`[${label}] ${evt.message}`)
  }
  return lines.join("\n")
}
