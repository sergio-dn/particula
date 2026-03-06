# Product Requirements Document (PRD)

Version: 3.0  
Fecha: 2026-03-06  
Owner: Sergio Domínguez

## 1. Objetivo del producto

Construir una plataforma de inteligencia competitiva para ecommerce que recopile información pública de tiendas online y produzca:

- inteligencia comercial accionable
- detección de productos ganadores
- histórico de cambios
- APIs y dashboard para exploración

## 2. Alcance del MVP

### Incluido
- alta de competidores por dominio
- detección de plataforma
- crawling multiplataforma con adapters
- extractor genérico de fallback
- catálogo y variantes
- snapshots diarios de precio/disponibilidad/inventario si existe
- detección de eventos
- ventas estimadas cuando sea posible
- ranking de winners por competidor
- dashboard básico
- export CSV
- API REST

### Excluido
- login a tiendas
- scraping de checkout
- PII
- marketplaces
- ads intelligence
- emails / SMS
- forecasting ML avanzado
- billing multi-tenant complejo

## 3. Requerimientos funcionales

### 3.1 Gestión de competidores
El usuario debe poder:
- crear competidor
- editar competidor
- activar/desactivar monitoreo
- ver estado de crawling
- consultar historial de jobs

### 3.2 Detección de plataforma
El sistema debe detectar:
- Shopify
- WooCommerce
- Magento
- BigCommerce
- Custom / Generic

Debe retornar:
- platform_type
- confidence_score
- razones detectadas

### 3.3 Crawling
El sistema debe:
- descubrir URLs relevantes
- parsear productos y variantes
- extraer precio y compare_at_price
- extraer disponibilidad
- extraer inventario si se expone
- guardar snapshots históricos
- soportar sitios renderizados con JS

### 3.4 Event detection
Debe detectar:
- PRODUCT_LAUNCH
- VARIANT_ADDED
- PRICE_CHANGE
- DISCOUNT_START
- DISCOUNT_END
- RESTOCK
- OUT_OF_STOCK
- PRODUCT_REMOVED

### 3.5 Sales estimation
Debe estimar:
- units_sold
- revenue_estimated
- confidence_score

La estimación debe basarse primero en inventory delta.  
Si no hay inventario visible, no debe inventar ventas exactas; debe usar señales proxy y bajar confianza.

### 3.6 Winner detection
Debe generar:
- winner_score
- winner_reason_codes
- top winners por competidor
- top winners por categoría interna del competidor

## 4. Requerimientos no funcionales

- arquitectura modular
- tolerancia a fallos por dominio
- rate limiting por dominio
- reintentos
- logs estructurados
- idempotencia de snapshots
- trazabilidad de inferencias
- test coverage mínima razonable
- docker-compose para entorno local

## 5. Criterios de aceptación del MVP

### Competidores
- dado un dominio válido, el sistema lo registra y agenda crawling

### Catálogo
- el sistema persiste productos y variantes con deduplicación básica

### Históricos
- el sistema guarda snapshots append-only

### Eventos
- cambios entre snapshots generan eventos correctos

### Winners
- cada competidor puede mostrar una lista ordenada de productos ganadores

### API
- endpoints documentados y funcionales

### Frontend
- dashboard mínimo usable
