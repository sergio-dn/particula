/**
 * @swagger
 * /api/scrape-jobs:
 *   get:
 *     summary: Listar últimos scrape jobs con errores
 *     tags: [Debug]
 *     responses:
 *       200:
 *         description: Últimos scrape jobs
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-guard"

export async function GET() {
  const { error } = await requireRole("ADMIN")
  if (error) return error

  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      brand: { select: { name: true, domain: true } },
    },
  })

  return NextResponse.json(jobs)
}
