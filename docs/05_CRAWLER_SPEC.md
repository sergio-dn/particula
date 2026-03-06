# Crawler Specification

## 1. Objetivo

Diseñar un crawler robusto que soporte múltiples plataformas ecommerce y un fallback genérico.

## 2. Flujo de crawling

1. recibir company_id
2. resolver dominio
3. detectar plataforma
4. seleccionar adapter
5. descubrir URLs
6. extraer productos y variantes
7. persistir snapshots
8. emitir job result
9. disparar procesamiento posterior

## 3. Platform detection

### Shopify
Señales:
- `cdn.shopify.com`
- `Shopify.theme`
- `/products/*.js`
- `shopify-payment-button`

### WooCommerce
Señales:
- `wp-content/plugins/woocommerce`
- `woocommerce`

### Magento
Señales:
- `Magento_Ui`
- `mage/`
- `catalog/product/view`

### BigCommerce
Señales:
- `cdn.bcapp`
- `bigcommerce`

### Generic
Fallback si no se logra clasificar con confianza mínima.

## 4. Adapter contract

Cada adapter debe implementar:

```python
class StoreAdapter:
    async def discover_product_urls(self, domain: str) -> list[str]: ...
    async def fetch_product(self, url: str) -> dict: ...
    async def parse_product(self, payload: dict | str) -> dict: ...
    async def parse_variants(self, payload: dict | str) -> list[dict]: ...
    async def extract_price(self, variant_payload: dict) -> dict: ...
    async def extract_inventory(self, variant_payload: dict) -> dict: ...
```

## 5. Discovery strategy

Orden recomendado:
1. sitemap.xml
2. collections/category pages
3. product structured data
4. internal links heuristic scan

## 6. Extracción mínima obligatoria

### Product
- title
- canonical_url
- description
- product_type
- brand
- category_path
- image_url

### Variant
- external_variant_id
- sku
- variant_title
- color
- size
- material

### Price
- price
- compare_at_price
- currency

### Inventory / availability
- inventory_quantity si visible
- availability textual
- indicador de stock visible/no visible

## 7. Generic adapter

Debe:
- usar JSON-LD si existe
- parsear `schema.org/Product`
- extraer precio/availability desde HTML si no hay JSON-LD
- detectar variantes con heurísticas simples

Debe asignar confidence bajo o medio según caso.

## 8. Anti-bot / resiliencia

El crawler debe incluir:
- user agents rotativos
- timeouts
- retries exponenciales
- rate limit por dominio
- backoff
- posibilidad de proxy rotation

## 9. Persistencia

El crawler no debe calcular scores.  
Solo debe:
- actualizar products/variants
- insertar snapshots
- registrar crawl_jobs
- guardar evidencia mínima

## 10. Errores esperables

- sitio inaccesible
- contenido JS no renderizado
- antibot
- HTML roto
- estructura inesperada
- producto sin variantes claras

El crawler debe fallar de forma explícita y observable.

## 11. Acceptance criteria

- puede registrar al menos 3 plataformas distintas
- descubre productos en dominios soportados
- guarda snapshots consistentes
- no duplica masivamente productos/variantes
