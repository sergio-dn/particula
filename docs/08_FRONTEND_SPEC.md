# Frontend Specification

## 1. Objetivo

Construir una UI mínima pero útil para explorar competidores, productos, eventos y winners.

## 2. Vistas obligatorias

### A. Competitor list
Debe mostrar:
- nombre
- dominio
- plataforma detectada
- último crawl
- estado

### B. Competitor detail
Debe mostrar:
- metadata del competidor
- KPIs básicos
- tabla de productos
- tabla de eventos recientes
- módulo de winners

### C. Product detail
Debe mostrar:
- información del producto
- variantes
- precio actual
- historial de precio
- historial de inventario/disponibilidad
- sales estimate
- winner score
- eventos asociados

## 3. KPIs básicos en competitor detail

- active_products
- recent_launches
- active_discounts
- recent_restocks
- top_winners_count

## 4. Reglas UX

- tablas con filtros
- sorting
- estados vacíos claros
- confidence visible
- reason codes visibles
- fechas en formato legible

## 5. Stack sugerido

- Next.js App Router
- TypeScript
- Tailwind
- shadcn/ui
- charts simples

## 6. Criterios de aceptación

- un usuario puede navegar de competidor a producto
- puede ver winners
- puede ver eventos
- puede entender nivel de confianza
