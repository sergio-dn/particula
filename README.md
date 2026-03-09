# Particula

**Plataforma de inteligencia competitiva para marcas D2C.**

## Que es

Particula recopila datos publicos de tiendas online (Shopify, WooCommerce y sitios genericos) para producir inteligencia comercial accionable. Detecta eventos comerciales, estima ventas por variante y califica productos ganadores mediante un sistema de scoring multifactor. Todo accesible desde un dashboard y una API REST documentada.

## Stack tecnologico

- **Framework**: Next.js 15 (App Router) + TypeScript
- **ORM / DB**: Prisma + PostgreSQL (Supabase)
- **UI**: Tailwind CSS + shadcn/ui + Recharts
- **Auth**: next-auth v5
- **Scraping**: API nativa Shopify + Cheerio + Playwright (sitios genericos)
- **Notificaciones**: Resend (email) + Webhooks
- **API docs**: Swagger (swagger-jsdoc + swagger-ui-react)
- **Validacion**: Zod
- **Logs**: Pino

## Funcionalidades

- **Scraping multiplataforma** — Shopify, WooCommerce y extractor generico con Playwright
- **Deteccion de plataforma** — Identificacion automatica con confidence scoring
- **Snapshots diarios** — Precio, disponibilidad e inventario append-only
- **Cart probe** — Inventario exacto via cart API de Shopify
- **11 tipos de evento comercial** — PRODUCT_LAUNCH, PRICE_CHANGE, DISCOUNT_START, RESTOCK, OUT_OF_STOCK, etc.
- **Estimacion de ventas** — 3 tiers de confianza (A: cart probe, B: available delta, C: catalogo)
- **Winner scoring** — 6 factores: velocidad de ventas, restocks, stockouts, longevidad, estabilidad de precio, prominencia
- **10 tipos de alerta** — Con notificaciones por email y webhook
- **Export CSV** — Descarga de datos para analisis externo
- **Control de acceso** — Roles Admin, Editor y Viewer
- **Multi-moneda** — Conversion automatica con tasas de cambio
- **API REST** — Documentada con Swagger en `/api/docs`

## Requisitos

- Node.js 20+
- PostgreSQL 16+
- npm

## Instalacion

```bash
git clone <repo-url>
cd particula
npm install
cp .env.example .env   # Editar con tus valores
npx prisma generate
npx prisma db push
npm run dev
```

La aplicacion estara disponible en `http://localhost:3000`.

## Docker

```bash
docker-compose up -d
```

## Variables de entorno

| Variable | Descripcion | Requerida |
|---|---|---|
| `DATABASE_URL` | URL de conexion a PostgreSQL (pooler) | Si |
| `DIRECT_URL` | URL directa a PostgreSQL (sin pooler, para migraciones) | Si |
| `NEXTAUTH_SECRET` | Secret para firmar tokens de sesion | Si |
| `NEXTAUTH_URL` | URL base de la aplicacion (ej. `http://localhost:3000`) | Si |
| `RESEND_API_KEY` | API key de Resend para envio de emails | No |
| `PROXY_URL` | URL del proxy para scraping (ej. `http://user:pass@proxy:port`) | No |

## Estructura del proyecto

```
particula/
├── prisma/
│   └── schema.prisma          # Fuente de verdad del schema
├── src/
│   ├── app/
│   │   ├── (dashboard)/       # Paginas del dashboard
│   │   ├── api/               # API routes
│   │   │   ├── brands/        # CRUD de competidores
│   │   │   ├── alerts/        # Gestion de alertas
│   │   │   ├── events/        # Consulta de eventos
│   │   │   ├── sales/         # Estimaciones de ventas
│   │   │   ├── winners/       # Ranking de ganadores
│   │   │   ├── export/        # Export CSV
│   │   │   ├── exchange-rates/# Tasas de cambio
│   │   │   ├── cron/          # Trigger de scraping programado
│   │   │   └── docs/          # Swagger UI
│   │   └── login/             # Pagina de login
│   ├── components/            # Componentes React reutilizables
│   └── lib/
│       ├── scrapers/          # Fetchers por plataforma + cart probe
│       ├── pipeline/          # Orquestador de scraping, diffing, alertas
│       ├── estimators/        # Ventas (3 tiers) + winner score (6 factores)
│       ├── detectors/         # Deteccion de plataforma
│       ├── exchange/          # Conversion de monedas
│       └── notifications/     # Email y webhook
└── package.json
```

## API

La documentacion interactiva de la API esta disponible en `/api/docs` (Swagger UI).

Endpoints principales: `/api/brands`, `/api/events`, `/api/sales`, `/api/winners`, `/api/alerts`, `/api/export`.

## Scripts

| Comando | Descripcion |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de produccion (incluye type check) |
| `npm start` | Servidor de produccion |
| `npm run lint` | Linter |
| `npm run scrape` | Ejecutar pipeline de scraping manualmente |
| `npm run db:generate` | Regenerar Prisma Client |
| `npm run db:push` | Sincronizar schema con la base de datos |
| `npm run db:studio` | Abrir Prisma Studio |

## Licencia

Privado. Todos los derechos reservados.
