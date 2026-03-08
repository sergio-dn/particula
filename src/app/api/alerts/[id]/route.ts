import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()

  const updateData: Record<string, unknown> = {}

  if (typeof body.emailEnabled === "boolean") updateData.emailEnabled = body.emailEnabled
  if (Array.isArray(body.emailRecipients)) {
    updateData.emailRecipients = body.emailRecipients.filter(
      (r: unknown) => typeof r === "string" && r.includes("@"),
    )
  }
  if (typeof body.webhookEnabled === "boolean") updateData.webhookEnabled = body.webhookEnabled
  if (typeof body.webhookUrl === "string" || body.webhookUrl === null) {
    updateData.webhookUrl = body.webhookUrl || null
  }
  if (typeof body.isActive === "boolean") updateData.isActive = body.isActive

  try {
    const alert = await prisma.brandAlert.update({
      where: { id },
      data: updateData,
      include: { brand: { select: { name: true } } },
    })

    return NextResponse.json(alert)
  } catch {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const alert = await prisma.brandAlert.findUnique({
    where: { id },
    include: { brand: { select: { name: true } } },
  })

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  return NextResponse.json(alert)
}
