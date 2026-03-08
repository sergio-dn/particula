interface WebhookPayload {
  event: "alert.triggered"
  timestamp: string
  brand: { id: string; name: string }
  alerts: Array<{
    type: string
    message: string
    triggeredAt: string
    data: unknown
  }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const RETRY_DELAYS = [1000, 5000, 25000]

export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<{ success: boolean; statusCode?: number; error?: string; attempts: number }> {
  let lastError: string | undefined
  let lastStatusCode: number | undefined

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Particula-Webhook/1.0",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      })

      lastStatusCode = res.status

      if (res.ok) {
        return { success: true, statusCode: res.status, attempts: attempt + 1 }
      }

      // Don't retry on 4xx client errors
      if (res.status >= 400 && res.status < 500) {
        return {
          success: false,
          statusCode: res.status,
          error: `Client error: ${res.status}`,
          attempts: attempt + 1,
        }
      }

      lastError = `HTTP ${res.status}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }

    // Wait before retry
    if (attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt])
    }
  }

  return {
    success: false,
    statusCode: lastStatusCode,
    error: lastError ?? "Unknown error after retries",
    attempts: RETRY_DELAYS.length + 1,
  }
}
