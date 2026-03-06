# API Specification

Base path: `/api/v1`

## 1. Competitors

### POST /competitors
Crear competidor.

Request:
```json
{
  "name": "Brand X",
  "domain": "brandx.com"
}
```

Response:
```json
{
  "id": "uuid",
  "name": "Brand X",
  "domain": "brandx.com",
  "platform_type": null,
  "status": "created"
}
```

### GET /competitors
Listar competidores.

### GET /competitors/{id}
Detalle de competidor.

### PATCH /competitors/{id}
Editar competidor.

### DELETE /competitors/{id}
Desactivar competidor.

## 2. Crawl jobs

### POST /competitors/{id}/crawl
Disparar crawl manual.

### GET /competitors/{id}/jobs
Ver historial de jobs.

## 3. Products

### GET /products
Filtros:
- company_id
- q
- is_active
- category
- page
- limit

### GET /products/{id}
Detalle de producto.

## 4. Variants

### GET /variants/{id}
Detalle de variante.

## 5. Events

### GET /events
Filtros:
- company_id
- product_id
- event_type
- from
- to
- page
- limit

## 6. Sales estimates

### GET /sales
Filtros:
- company_id
- product_id
- variant_id
- from
- to

## 7. Winners

### GET /winners
Filtros:
- company_id
- date
- category
- limit

Response ejemplo:
```json
{
  "items": [
    {
      "product_id": "uuid",
      "title": "Product A",
      "winner_score": 82.4,
      "confidence_score": 0.71,
      "reason_codes": ["HIGH_INVENTORY_DEPLETION", "MULTIPLE_RESTOCKS"]
    }
  ]
}
```

## 8. Health

### GET /health
Estado básico de la API.

## 9. Reglas API

- devolver errores consistentes
- usar paginación
- validar dominios
- documentar con OpenAPI
