/**
 * Mock de Prisma para tests unitarios.
 * Se usa con jest.mock("@/lib/prisma") para evitar conexiones a DB reales.
 */

export const prisma = {
  exchangeRate: {
    findFirst: jest.fn(),
  },
  brandAlert: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  alertEvent: {
    create: jest.fn(),
  },
  product: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  variant: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  inventorySnapshot: {
    count: jest.fn(),
  },
  salesEstimate: {
    aggregate: jest.fn(),
    upsert: jest.fn(),
    groupBy: jest.fn(),
  },
  winnerScore: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
}
