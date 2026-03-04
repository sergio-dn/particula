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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
