// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Queue } = require("bullmq")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IORedis = require("ioredis")

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379"

let redisConnection: InstanceType<typeof IORedis> | null = null

export function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    })
  }
  return redisConnection
}

export const QUEUES = {
  SCRAPE: "scrape",
  ESTIMATE: "estimate",
  ALERTS: "alerts",
} as const

export interface ScrapeJobData {
  brandId: string
  domain: string
  type: "SHOPIFY_FULL" | "SHOPIFY_INCREMENTAL" | "PLAYWRIGHT"
}

export interface EstimateJobData {
  brandId: string
  date: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scrapeQueue: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let estimateQueue: any = null

export function getScrapeQueue() {
  if (!scrapeQueue) {
    scrapeQueue = new Queue(QUEUES.SCRAPE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    })
  }
  return scrapeQueue
}

export function getEstimateQueue() {
  if (!estimateQueue) {
    estimateQueue = new Queue(QUEUES.ESTIMATE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 10_000 },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    })
  }
  return estimateQueue
}

export async function enqueueScrapeJob(data: ScrapeJobData): Promise<string> {
  const queue = getScrapeQueue()
  const job = await queue.add(`scrape-${data.brandId}`, data, {
    jobId: `scrape-${data.brandId}-${Date.now()}`,
  })
  return job.id ?? ""
}

export async function enqueueEstimateJob(brandId: string): Promise<string> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const queue = getEstimateQueue()
  const job = await queue.add(
    `estimate-${brandId}`,
    { brandId, date: yesterday.toISOString() },
    { jobId: `estimate-${brandId}-${yesterday.toISOString().split("T")[0]}` }
  )
  return job.id ?? ""
}
