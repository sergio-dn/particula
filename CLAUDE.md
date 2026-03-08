# CLAUDE.md — Particula

## Proyecto

Particula es una plataforma de inteligencia competitiva que monitorea tiendas ecommerce, scrapeando productos, precios, inventario y estimaciones de ventas. Stack: Next.js 15, Prisma (PostgreSQL), Playwright, Cheerio.

## Estructura clave

```
src/lib/scrapers/       # Adapters por plataforma (shopify, woocommerce, generic)
src/lib/scrapers/adapter.ts  # Contrato StoreAdapter + tipos normalizados + factory
src/lib/scrapers/http-client.ts  # resilientFetch con UA rotation, rate limiting, proxy
src/lib/scrapers/discovery/  # Sitemap discovery
src/lib/pipeline/       # Pipeline principal (scrape-brand, alerts, snapshot-diff)
src/lib/detectors/      # Detección de plataforma ecommerce
src/lib/estimators/     # Estimadores de ventas y winner scores
prisma/schema.prisma    # Schema de base de datos
```

## Convenciones de código

- TypeScript estricto, path aliases con `@/` -> `src/`
- Todos los adapters implementan `StoreAdapter` de `adapter.ts`
- Todos los adapters deben usar `resilientFetch` de `http-client.ts` (no `fetch` nativo)
- `NormalizedProduct` incluye campo `confidence` (0-1) obligatorio
- Los adapters retornan datos normalizados — el pipeline no conoce detalles de plataforma

## Workflow con issues de GitHub

**IMPORTANTE**: Al resolver issues de GitHub:

1. **Siempre cerrar los issues** al completar el trabajo. Incluir `Closes #N` en el commit message O cerrarlos manualmente con `gh issue close`.
2. **Verificar que se cerraron** después del push — el auto-close solo funciona cuando el commit llega a la rama default.
3. Si trabajas en una feature branch, los issues se cerrarán al mergear a main. Si necesitas cerrarlos antes, usa `gh issue close #N --comment "Resolved in branch X"`.

## Comandos útiles

```bash
npm run dev          # Dev server
npm run build        # Build de producción
npx tsc --noEmit     # Type check sin build
npm run db:generate  # Prisma codegen
npm run db:push      # Sync schema a DB
```

## Testing

- Siempre correr `npx tsc --noEmit` antes de commit para validar tipos
- El proyecto no tiene test runner configurado aún
