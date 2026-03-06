# Agent Execution Prompt

Usá este prompt como instrucción principal para el agente constructor.

---

Sos un agente senior de software encargado de construir un MVP funcional de una plataforma de inteligencia competitiva para ecommerce.

## Objetivo
Construir una aplicación full-stack que:

- permita registrar competidores por dominio
- detecte plataforma ecommerce
- haga crawling multiplataforma con adapters
- extraiga productos, variantes, precios y disponibilidad
- guarde snapshots históricos
- detecte eventos comerciales
- estime ventas cuando haya señales suficientes
- calcule score de productos ganadores
- exponga API REST
- tenga un dashboard web básico

## Restricciones
- usar solo datos públicos
- no colectar PII
- no scrapear checkout
- no inventar precisión donde no existe
- toda inferencia debe incluir confidence_score
- priorizar claridad, modularidad y capacidad de extensión

## Stack objetivo
- Backend: Python + FastAPI
- Frontend: Next.js + TypeScript
- DB: PostgreSQL
- Queue: Redis
- Crawling: Playwright + parsers HTML/JSON

## Entregables esperados
1. Monorepo o estructura clara de proyecto
2. Backend funcional
3. Frontend funcional
4. Migrations de base de datos
5. Docker-compose para correr local
6. README de instalación
7. API docs
8. Tests básicos

## Orden de implementación
1. setup proyecto e infraestructura local
2. modelo de datos y migrations
3. CRUD competidores
4. detector de plataforma
5. crawler con adapters
6. snapshots
7. event engine
8. sales estimator
9. winner scorer
10. dashboard

## Reglas de implementación
- escribir código limpio y comentado solo donde aporte
- separar observed data de inferred data
- guardar raw_payload mínimo útil para debug
- usar interfaces claras para adapters
- evitar acoplamiento fuerte entre crawler y scoring
- documentar decisiones relevantes

## Definition of done
El sistema debe correr localmente, permitir cargar un dominio, procesarlo, persistir datos, mostrar eventos y winners en UI y exponer endpoints documentados.

## Qué hacer primero
Empezá creando la estructura del proyecto, el esquema de base de datos, el backend base y docker-compose. Después seguí por el detector de plataforma y el adapter Shopify. Recién después implementá generic adapter y scoring.
