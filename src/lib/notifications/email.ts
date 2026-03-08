import { Resend } from "resend"
import { buildAlertDigestHtml, buildAlertDigestText } from "./templates/alert-digest"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

interface AlertDigestParams {
  recipients: string[]
  brandName: string
  events: Array<{ type: string; message: string; triggeredAt: Date | string }>
}

export async function sendAlertDigest(
  params: AlertDigestParams,
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not configured, skipping email")
    return { success: false, error: "RESEND_API_KEY not configured" }
  }

  if (params.recipients.length === 0) {
    return { success: false, error: "No recipients" }
  }

  try {
    const { error } = await resend.emails.send({
      from: "Particula <alerts@particula.app>",
      to: params.recipients,
      subject: `[Particula] ${params.events.length} alerta${params.events.length !== 1 ? "s" : ""} para ${params.brandName}`,
      html: buildAlertDigestHtml(params.brandName, params.events),
      text: buildAlertDigestText(params.brandName, params.events),
    })

    if (error) {
      console.error("[email] Resend error:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[email] Send failed:", msg)
    return { success: false, error: msg }
  }
}
