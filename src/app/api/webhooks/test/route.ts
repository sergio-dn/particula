import { NextRequest, NextResponse } from "next/server"
import { sendWebhook } from "@/lib/notifications/webhook"

export async function POST(req: NextRequest) {
  const { url } = await req.json()

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL requerida" }, { status: 400 })
  }

  const result = await sendWebhook(url, {
    event: "alert.triggered",
    timestamp: new Date().toISOString(),
    brand: { id: "test", name: "Test Brand" },
    alerts: [
      {
        type: "PRICE_DROP",
        message: "Este es un evento de prueba desde Particula",
        triggeredAt: new Date().toISOString(),
        data: { test: true },
      },
    ],
  })

  return NextResponse.json(result)
}
