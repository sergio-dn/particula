/**
 * Resilient HTTP Client — drop-in replacement for fetch() with anti-bot features.
 *
 * Features:
 * - Rotating pool of realistic User-Agent strings (desktop + mobile)
 * - Exponential backoff with jitter on retries
 * - Per-domain rate limiting
 * - Handles common anti-bot responses (403, 429, Cloudflare challenge)
 * - Proxy support via PROXY_URL environment variable (architecture-ready)
 *
 * @module http-client
 */

// ─── User-Agent Pool ────────────────────────────────────────────

/** Desktop User-Agent strings (Chrome, Firefox, Safari on Windows/Mac) */
const DESKTOP_USER_AGENTS = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Chrome on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Firefox on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
  // Safari on Mac
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

/** Mobile User-Agent strings (Chrome/Safari on iPhone/Android) */
const MOBILE_USER_AGENTS = [
  // Chrome on Android
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  // Chrome on Android (Samsung)
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  // Safari on iPhone
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  // Chrome on iPhone
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  // Safari on iPad
  "Mozilla/5.0 (iPad; CPU OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]

const ALL_USER_AGENTS = [...DESKTOP_USER_AGENTS, ...MOBILE_USER_AGENTS]

// ─── Types ──────────────────────────────────────────────────────

export interface ResilientFetchOptions extends RequestInit {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number
  /** Minimum ms between requests to the same domain (default: 500) */
  rateLimitPerDomain?: number
}

// ─── Rate Limiting ──────────────────────────────────────────────

/** In-memory map tracking last request timestamp per domain */
const domainLastRequest = new Map<string, number>()

/**
 * Extract the hostname from a URL string.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * Enforce a minimum delay between requests to the same domain.
 * Waits if needed before allowing the request to proceed.
 */
async function enforceRateLimit(
  domain: string,
  minDelayMs: number
): Promise<void> {
  const now = Date.now()
  const lastRequest = domainLastRequest.get(domain)

  if (lastRequest !== undefined) {
    const elapsed = now - lastRequest
    if (elapsed < minDelayMs) {
      await sleep(minDelayMs - elapsed)
    }
  }

  domainLastRequest.set(domain, Date.now())
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Returns a random realistic browser User-Agent string
 * from a pool of 10 desktop and mobile agents.
 */
export function getRandomUserAgent(): string {
  return ALL_USER_AGENTS[Math.floor(Math.random() * ALL_USER_AGENTS.length)]
}

/**
 * Sleep for a given number of milliseconds, with optional jitter.
 * Jitter adds a random amount between 0 and `jitterMs` to the base delay.
 *
 * @param ms - Base delay in milliseconds
 * @param jitterMs - Maximum additional random delay (default: 0)
 */
export function sleep(ms: number, jitterMs: number = 0): Promise<void> {
  const jitter = jitterMs > 0 ? Math.random() * jitterMs : 0
  return new Promise((resolve) => setTimeout(resolve, ms + jitter))
}

/**
 * Exponential backoff with jitter.
 * Delay = baseMs * 2^attempt + random jitter (0 to baseMs).
 *
 * @param attempt - The current retry attempt (0-indexed)
 * @param baseMs - Base delay in ms (default: 1000)
 */
export async function backoff(
  attempt: number,
  baseMs: number = 1000
): Promise<void> {
  const exponentialDelay = baseMs * Math.pow(2, attempt)
  const jitter = Math.random() * baseMs
  await sleep(exponentialDelay + jitter)
}

// ─── Anti-bot Detection ─────────────────────────────────────────

/** HTTP status codes that indicate anti-bot blocking */
const ANTI_BOT_STATUS_CODES = new Set([403, 429, 503])

/**
 * Check if a response body looks like a Cloudflare challenge page.
 */
function isCloudflareChallenge(body: string): boolean {
  return (
    body.includes("cf-browser-verification") ||
    body.includes("cf_chl_opt") ||
    body.includes("Checking your browser") ||
    body.includes("challenges.cloudflare.com")
  )
}

/**
 * Determine if a response indicates an anti-bot block.
 */
function isAntiBot(status: number, body?: string): boolean {
  if (ANTI_BOT_STATUS_CODES.has(status)) return true
  if (body && isCloudflareChallenge(body)) return true
  return false
}

// ─── Proxy Support ──────────────────────────────────────────────

/**
 * Build fetch options with proxy support if PROXY_URL is configured.
 *
 * NOTE: Native Node.js fetch does not support proxies out of the box.
 * To enable proxy support, install `undici` and use its ProxyAgent:
 *
 *   import { ProxyAgent } from "undici"
 *   const dispatcher = new ProxyAgent(process.env.PROXY_URL)
 *   fetch(url, { dispatcher })
 *
 * The architecture below is ready for this integration. When undici is
 * added as a dependency, uncomment the proxy dispatcher lines.
 */
function getProxyOptions(): Record<string, unknown> {
  const proxyUrl = process.env.PROXY_URL
  if (!proxyUrl) return {}

  // TODO: Uncomment when undici is added as a dependency:
  // import { ProxyAgent } from "undici"
  // return { dispatcher: new ProxyAgent(proxyUrl) }

  console.warn(
    `[http-client] PROXY_URL is set (${proxyUrl}) but proxy support requires the 'undici' package. ` +
      `Install it with: npm install undici`
  )
  return {}
}

// ─── Resilient Fetch ────────────────────────────────────────────

/**
 * Drop-in replacement for fetch() with anti-bot resilience features.
 *
 * - Rotates User-Agent on each request
 * - Enforces per-domain rate limiting
 * - Retries with exponential backoff + jitter on failure or anti-bot responses
 * - Respects Retry-After headers on 429 responses
 * - Supports proxy via PROXY_URL environment variable
 * - Configurable timeout per request
 *
 * @param url - The URL to fetch
 * @param options - Resilient fetch options (extends standard RequestInit)
 * @returns The fetch Response
 * @throws Error after all retries are exhausted
 */
export async function resilientFetch(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    timeoutMs = 30000,
    rateLimitPerDomain = 500,
    headers: customHeaders,
    signal: _externalSignal,
    ...restOptions
  } = options

  const domain = extractDomain(url)
  const proxyOptions = getProxyOptions()

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Enforce rate limiting between requests to the same domain
    await enforceRateLimit(domain, rateLimitPerDomain)

    // Build headers with a rotated User-Agent
    const mergedHeaders: Record<string, string> = {
      "User-Agent": getRandomUserAgent(),
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      ...(customHeaders as Record<string, string>),
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        ...restOptions,
        ...proxyOptions,
        headers: mergedHeaders,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // If the response looks clean, return it immediately
      if (response.ok) {
        return response
      }

      // Check for anti-bot responses
      if (isAntiBot(response.status)) {
        // On 429 Too Many Requests, respect Retry-After header if present
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After")
          if (retryAfter) {
            const retryMs = parseInt(retryAfter, 10) * 1000
            if (!isNaN(retryMs) && retryMs > 0) {
              console.warn(
                `[http-client] 429 on ${domain}, Retry-After: ${retryAfter}s (attempt ${attempt + 1}/${maxRetries + 1})`
              )
              await sleep(retryMs, baseDelayMs)
              continue
            }
          }
        }

        // For 403/503, check if it's a Cloudflare challenge
        if (response.status === 403 || response.status === 503) {
          const body = await response.text().catch(() => "")
          if (isCloudflareChallenge(body)) {
            console.warn(
              `[http-client] Cloudflare challenge detected on ${domain} (attempt ${attempt + 1}/${maxRetries + 1})`
            )
          } else {
            console.warn(
              `[http-client] Anti-bot ${response.status} on ${domain} (attempt ${attempt + 1}/${maxRetries + 1})`
            )
          }
        }

        // If we have retries left, back off and try again
        if (attempt < maxRetries) {
          await backoff(attempt, baseDelayMs)
          continue
        }
      }

      // For non-anti-bot error responses (e.g. 404, 500), return as-is
      // The caller can decide what to do with them
      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry if request was intentionally aborted
      if (lastError.name === "AbortError") {
        console.warn(
          `[http-client] Timeout after ${timeoutMs}ms on ${domain} (attempt ${attempt + 1}/${maxRetries + 1})`
        )
      }

      if (attempt < maxRetries) {
        await backoff(attempt, baseDelayMs)
        continue
      }
    }
  }

  throw new Error(
    `[http-client] All ${maxRetries + 1} attempts failed for ${url}: ${lastError?.message ?? "Unknown error"}`
  )
}
