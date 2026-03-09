/**
 * Tests para http-client.ts — funciones puras: getRandomUserAgent, sleep, backoff.
 */

import { getRandomUserAgent, sleep, backoff } from "@/lib/scrapers/http-client"

describe("getRandomUserAgent", () => {
  it("retorna un string no vacío", () => {
    const ua = getRandomUserAgent()
    expect(typeof ua).toBe("string")
    expect(ua.length).toBeGreaterThan(0)
  })

  it("retorna un User-Agent que parece un navegador real", () => {
    const ua = getRandomUserAgent()
    expect(ua).toMatch(/Mozilla|Safari|Chrome|Firefox/)
  })

  it("puede retornar distintos valores (no siempre el mismo)", () => {
    const agents = new Set<string>()
    // Ejecutar 50 veces para tener buena probabilidad de ver variación
    for (let i = 0; i < 50; i++) {
      agents.add(getRandomUserAgent())
    }
    // Con 10 agentes posibles y 50 intentos, esperamos al menos 2 distintos
    expect(agents.size).toBeGreaterThanOrEqual(2)
  })
})

describe("sleep", () => {
  it("resuelve después del delay especificado", async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40) // margen de tolerancia
  })

  it("retorna una Promise", () => {
    const result = sleep(0)
    expect(result).toBeInstanceOf(Promise)
  })

  it("soporta jitter opcional", async () => {
    const start = Date.now()
    await sleep(10, 20) // 10ms base + 0-20ms jitter
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(5)
    expect(elapsed).toBeLessThan(100)
  })
})

describe("backoff", () => {
  it("espera exponencialmente según el intento", async () => {
    // Attempt 0: baseMs * 2^0 = 50ms + jitter(0-50ms) → ~50-100ms
    const start = Date.now()
    await backoff(0, 50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
    expect(elapsed).toBeLessThan(200)
  })

  it("attempt mayor produce delays más largos", async () => {
    // Medimos solo que attempt=1 tarda más que un umbral mínimo
    // baseMs * 2^1 = 100ms + jitter(0-50ms)
    const start = Date.now()
    await backoff(1, 50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(80)
  })

  it("retorna una Promise", () => {
    const result = backoff(0, 10)
    expect(result).toBeInstanceOf(Promise)
  })
})
