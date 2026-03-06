# System Architecture

## 1. Principios

- modular por dominio funcional
- adapters por plataforma
- snapshots append-only
- inferencias derivadas, nunca mezcladas con raw data
- cada output debe poder rastrearse al input observado

## 2. Componentes

### A. API Server
Responsabilidades:
- auth simple para MVP
- CRUD de competidores
- consultas de productos, eventos, sales y winners
- estado de jobs

### B. Scheduler
Responsabilidades:
- programar crawls periódicos
- evitar duplicados
- manejar prioridades

### C. Crawl Workers
Responsabilidades:
- detectar plataforma
- correr adapter correspondiente
- extraer datos
- persistir snapshots

### D. Processing Workers
Responsabilidades:
- normalización
- change detection
- event generation
- sales estimation
- winner scoring

### E. Database
Responsabilidades:
- guardar entidades core
- guardar raw payloads relevantes
- guardar snapshots y outputs derivados

### F. Frontend
Responsabilidades:
- dashboard
- tablas
- vista de producto
- vista de competidor

## 3. Arquitectura lógica

```text
Frontend
   |
API Server
   |
   +--- PostgreSQL
   +--- Redis
   |
Scheduler ----> Crawl Queue ----> Crawl Workers
                                  |
                                  +--> Adapter Layer
                                  +--> Extractors
                                  +--> Raw Storage
                                  |
                                  +--> Snapshot Tables

Snapshot/Event Queue ----> Processing Workers
                             |
                             +--> Event Engine
                             +--> Sales Estimator
                             +--> Winner Scorer
```

## 4. Stack sugerido

### Backend
- Python 3.12
- FastAPI
- SQLAlchemy
- Pydantic

### Crawling
- Playwright
- httpx
- BeautifulSoup / lxml

### Queue
- Redis
- RQ o Celery

### DB
- PostgreSQL

### Frontend
- Next.js
- React
- TypeScript
- Tailwind

## 5. Estructura de repositorio sugerida

```text
/apps
  /api
  /web
/services
  /crawler
  /processor
/packages
  /shared-types
  /db
  /platform-detector
  /adapters
  /event-engine
  /winner-engine
/infrastructure
  docker-compose.yml
```

## 6. Decisiones críticas

### Decisión 1
No mezclar scraping con scoring en el mismo proceso.

### Decisión 2
Guardar snapshots como fuente de verdad histórica.

### Decisión 3
Separar:
- observed facts
- inferred facts
- confidence scores

### Decisión 4
Fallback generic adapter siempre disponible, pero con menor confianza.
