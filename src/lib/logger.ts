import pino from "pino"

const isDev = process.env.NODE_ENV === "development"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
})

/** Logger para el pipeline de scraping */
export const pipelineLogger = logger.child({ module: "pipeline" })

/** Logger para scrapers (Shopify, WooCommerce, etc.) */
export const scraperLogger = logger.child({ module: "scraper" })

/** Logger para cron jobs */
export const cronLogger = logger.child({ module: "cron" })

/** Logger para notificaciones (email, webhook) */
export const notificationLogger = logger.child({ module: "notifications" })
