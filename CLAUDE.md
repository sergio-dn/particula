# Particula — Project Intelligence

## Qué es
Plataforma de inteligencia competitiva para marcas D2C. Scraping de tiendas Shopify, estimación de ventas, detección de eventos comerciales, y scoring de productos ganadores.

## Stack
- Next.js 15 (App Router) + TypeScript
- Prisma ORM + PostgreSQL (Supabase)
- Tailwind CSS + shadcn/ui
- No Redis/BullMQ — pipeline directo sin colas

## Estructura clave
```
src/lib/scrapers/       → Shopify fetcher + cart probe inventory
src/lib/pipeline/       → scrape-brand.ts (orquestador), snapshot-diff.ts, alerts.ts
src/lib/estimators/     → sales.ts (3 tiers), winner-score.ts (6 factores)
src/lib/exchange/       → Conversión de monedas
prisma/schema.prisma    → Fuente de verdad del schema
prisma/migrations/      → SQL manual (no usamos prisma migrate)
```

## Convenciones
- Comentarios en español
- Import alias: `@/lib/...`, `@/components/...`
- Prisma: upserts con compound unique keys (`@@unique([brandId, externalId])`)
- Tests manuales con scripts en `scripts/` (gitignored)
- Migraciones: SQL manual aplicado vía `pg` client directo a Supabase (pooler URL)

## Pipeline de scraping (flujo completo)
1. ScrapeJob → RUNNING
2. Fetch productos Shopify (`/products.json`)
3. Upsert Products + Variants
4. Crear InventorySnapshots (available_only → cart_probe si trackea)
5. Detectar cambios de precio → PriceHistory
6. Calcular estimaciones de ventas (3 tiers de confianza)
7. Ejecutar diffing de snapshots → 11 tipos de evento
8. Evaluar alertas (10 tipos)
9. Calcular winner scores (6 factores)
10. ScrapeJob → COMPLETED

## Lecciones aprendidas (errores comunes)

### fetch() no mantiene cookies entre requests
`fetch()` en Node.js no comparte cookies entre llamadas. Para técnicas que requieren sesión (como cart scraping de Shopify), hay que extraer `Set-Cookie` headers manualmente y pasarlos como header `Cookie` en requests subsiguientes. Mejor estrategia: leer datos directamente del response de la primera request (`/cart/add.js`) en vez de depender de `/cart.js` que necesita sesión.

### Worktrees de agentes paralelos escriben en ubicaciones aisladas
Cuando se lanzan agentes con `isolation: "worktree"`, cada uno trabaja en su propia copia del repo. Los archivos creados NO aparecen automáticamente en el repo principal — hay que copiarlos manualmente o hacer merge. Si un agente modifica el mismo archivo que otro, hay que consolidar a mano.

### Migraciones: no usar prisma migrate con Supabase pooler
Prisma migrate no funciona bien con PgBouncer en modo transaction. Usar SQL manual via `pg` Client con la URL del pooler y `NODE_TLS_REJECT_UNAUTHORIZED=0`. Ejecutar ALTER TYPE ADD VALUE en statements separados (no dentro de transacciones).

### Split de SQL por `;` rompe CREATE TABLE
Al aplicar migraciones programáticamente, un split naïve por `;` rompe statements multi-línea como CREATE TABLE (que tiene `;` al final de la definición). Ejecutar cada statement DDL por separado o usar el SQL completo sin split.

### La mayoría de tiendas Shopify no trackean inventario
Al probar cart probing, la mayoría de stores tienen "Continue selling when out of stock" activado — aceptan qty=999999 sin limitarla. El fallback `available_delta` (Tier B) será el método de estimación más común.

## Comandos útiles
```bash
npm run build          # Build completo Next.js (incluye type check)
npx prisma generate    # Regenerar Prisma client después de cambios al schema
npx prisma studio      # UI para explorar la DB
```
