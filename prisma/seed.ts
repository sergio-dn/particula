import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string })
const prisma = new PrismaClient({ adapter })

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@particula.com"
  const password = process.env.SEED_PASSWORD ?? "admin1234"
  const name = process.env.SEED_NAME ?? "Admin"

  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      password: hashedPassword,
      role: "ADMIN",
    },
  })

  console.log(`✓ Usuario listo: ${user.email} (id: ${user.id})`)
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)

  // Tasas de cambio iniciales (→ USD)
  const initialRates = [
    { fromCurrency: "CLP", toCurrency: "USD", rate: 0.00106 },
    { fromCurrency: "EUR", toCurrency: "USD", rate: 1.08 },
    { fromCurrency: "GBP", toCurrency: "USD", rate: 1.27 },
    { fromCurrency: "MXN", toCurrency: "USD", rate: 0.058 },
    { fromCurrency: "COP", toCurrency: "USD", rate: 0.00024 },
    { fromCurrency: "BRL", toCurrency: "USD", rate: 0.17 },
    { fromCurrency: "ARS", toCurrency: "USD", rate: 0.00088 },
    { fromCurrency: "PEN", toCurrency: "USD", rate: 0.27 },
    { fromCurrency: "CAD", toCurrency: "USD", rate: 0.74 },
  ]

  const effectiveDate = new Date("2025-01-01")

  for (const r of initialRates) {
    const exists = await prisma.exchangeRate.findFirst({
      where: { fromCurrency: r.fromCurrency, toCurrency: r.toCurrency },
    })
    if (!exists) {
      await prisma.exchangeRate.create({
        data: { ...r, effectiveDate, source: "seed" },
      })
    }
  }

  console.log(`✓ Tasas de cambio: ${initialRates.length} monedas base`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
