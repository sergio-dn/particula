import { prisma } from "@/lib/prisma"
import { sendAlertDigest } from "./email"
import { sendWebhook } from "./webhook"

/**
 * Dispatches notifications (email + webhook) for newly created AlertEvents.
 * Called after evaluateAlerts() in the scraping pipeline.
 */
export async function dispatchNotifications(
  brandId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return

  // Fetch the new events with their alert config
  const events = await prisma.alertEvent.findMany({
    where: { id: { in: eventIds } },
    include: {
      alert: {
        select: {
          type: true,
          brandId: true,
          emailEnabled: true,
          emailRecipients: true,
          webhookEnabled: true,
          webhookUrl: true,
          brand: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (events.length === 0) return

  const brandName = events[0].alert.brand.name

  // ── Email notifications ──
  // Collect all unique recipients from alerts that have email enabled
  const emailRecipients = new Set<string>()
  const emailEvents: typeof events = []

  for (const evt of events) {
    if (evt.alert.emailEnabled && evt.alert.emailRecipients.length > 0) {
      evt.alert.emailRecipients.forEach((r) => emailRecipients.add(r))
      emailEvents.push(evt)
    }
  }

  if (emailRecipients.size > 0 && emailEvents.length > 0) {
    const result = await sendAlertDigest({
      recipients: Array.from(emailRecipients),
      brandName,
      events: emailEvents.map((e) => ({
        type: e.alert.type,
        message: e.message,
        triggeredAt: e.triggeredAt,
      })),
    })

    // Log results
    for (const evt of emailEvents) {
      await prisma.notificationLog.create({
        data: {
          alertEventId: evt.id,
          channel: "email",
          status: result.success ? "sent" : "failed",
          lastError: result.error ?? null,
        },
      }).catch(() => {}) // don't fail pipeline on log error
    }

    console.log(
      `[notifications] Email ${result.success ? "sent" : "failed"} for ${brandName}: ${emailEvents.length} events → ${emailRecipients.size} recipients`,
    )
  }

  // ── Webhook notifications ──
  // Group events by webhook URL
  const webhookGroups = new Map<string, typeof events>()

  for (const evt of events) {
    if (evt.alert.webhookEnabled && evt.alert.webhookUrl) {
      const url = evt.alert.webhookUrl
      const group = webhookGroups.get(url) ?? []
      group.push(evt)
      webhookGroups.set(url, group)
    }
  }

  for (const [url, groupEvents] of webhookGroups) {
    const result = await sendWebhook(url, {
      event: "alert.triggered",
      timestamp: new Date().toISOString(),
      brand: { id: brandId, name: brandName },
      alerts: groupEvents.map((e) => ({
        type: e.alert.type,
        message: e.message,
        triggeredAt: e.triggeredAt.toISOString(),
        data: e.data,
      })),
    })

    // Log results
    for (const evt of groupEvents) {
      await prisma.notificationLog.create({
        data: {
          alertEventId: evt.id,
          channel: "webhook",
          status: result.success ? "sent" : "failed",
          attempts: result.attempts,
          lastError: result.error ?? null,
          payload: { url, statusCode: result.statusCode },
        },
      }).catch(() => {})
    }

    console.log(
      `[notifications] Webhook ${result.success ? "sent" : "failed"} to ${url}: ${groupEvents.length} events, ${result.attempts} attempts`,
    )
  }
}
