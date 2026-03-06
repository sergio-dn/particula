# Delivery Plan

## 1. Enfoque

No intentar construir “Particl completo”.  
Construir un MVP sólido y extensible.

## 2. Fases

### Fase 1 - Foundation
- repo setup
- docker-compose
- postgres + redis
- FastAPI skeleton
- Next.js skeleton
- migrations
- health endpoints

### Fase 2 - Competitors and platform detection
- CRUD de competidores
- detector de plataforma
- scheduler simple
- jobs

### Fase 3 - Crawling
- adapter Shopify
- adapter WooCommerce
- generic adapter
- persistencia de products/variants/snapshots

### Fase 4 - Event engine
- diff snapshots
- generar eventos
- exponer API de eventos

### Fase 5 - Sales and winners
- sales estimator
- winner scorer
- reason codes
- confidence scores

### Fase 6 - Frontend
- lista competidores
- vista competidor
- vista producto
- winners

## 3. Definición de terminado

- sistema corre local con docker-compose
- seed data o demo domains
- README de instalación
- tests mínimos
- endpoints documentados
- dashboard funcional

## 4. Riesgos críticos

- inventario no visible
- antibot
- deduplicación pobre
- sobreprometer accuracy de ventas

## 5. Qué priorizar si hay presión de tiempo

1. Shopify + Generic
2. snapshots buenos
3. event detection
4. winner score
5. frontend usable
