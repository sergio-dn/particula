# Ecommerce Intelligence Platform - Agent Build Pack

Este paquete está pensado para dárselo a un agente de desarrollo para construir un MVP serio de una plataforma de inteligencia comercial para ecommerce, multiplataforma, con detección de productos ganadores.

## Objetivo del paquete

Dar suficiente contexto y especificación para que un agente pueda:

- diseñar la arquitectura
- implementar el backend
- implementar el crawler
- modelar la base de datos
- exponer APIs
- construir un dashboard básico
- correr el sistema localmente
- testearlo

## Orden recomendado de lectura para el agente

1. `01_PRODUCT_BRIEF.md`
2. `02_PRD.md`
3. `03_SYSTEM_ARCHITECTURE.md`
4. `04_DATA_MODEL_AND_SQL.md`
5. `05_CRAWLER_SPEC.md`
6. `06_SALES_AND_WINNER_LOGIC.md`
7. `07_API_SPEC.md`
8. `08_FRONTEND_SPEC.md`
9. `09_DELIVERY_PLAN.md`
10. `10_AGENT_EXECUTION_PROMPT.md`

## Resultado esperado

El agente debe construir un MVP que permita:

- registrar competidores
- detectar plataforma ecommerce
- extraer catálogo, variantes, precio y disponibilidad
- guardar snapshots históricos
- detectar eventos comerciales
- estimar ventas cuando sea posible
- calcular score de producto ganador
- exponer API y dashboard

## Restricciones

- solo datos públicos
- sin PII
- sin checkout scraping
- tolerancia a datos incompletos
- toda inferencia debe incluir confidence score
