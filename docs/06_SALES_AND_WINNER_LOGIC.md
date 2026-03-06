# Sales Estimation and Winner Logic

## 1. Principio general

No confundir:
- ventas observadas
- ventas estimadas
- proxies de performance

El sistema debe ser honesto sobre el nivel de certeza.

## 2. Methodology ladder

### Nivel A - Inventory observable
Cuando una variante expone inventario cuantitativo:
- usar inventory delta
- corregir restocks detectados
- calcular estimated_units

### Nivel B - Availability only
Cuando no hay cantidad pero sí disponibilidad:
- usar eventos de out_of_stock / restock
- usar persistencia
- usar frecuencia de reposición
- NO afirmar unidades exactas con alta confianza

### Nivel C - No inventory visibility
Usar solo señales débiles:
- prominencia de catálogo
- estabilidad del producto
- price stability
- presence across time

## 3. Sales estimate algorithm

### Caso inventory delta
```text
if prev_qty is not null and curr_qty is not null:
    if curr_qty < prev_qty:
        gross_units_sold = prev_qty - curr_qty
    else:
        gross_units_sold = 0
```

### Restock correction
Si entre snapshots hubo:
- subida de inventario
- reaparición de disponibilidad
entonces generar evento `RESTOCK` y no tratar ese aumento como venta negativa.

### Revenue
```text
estimated_revenue = estimated_units * effective_price
```

`effective_price` debe ser el precio observado más cercano al período.

## 4. Confidence score para sales

Base:
- 0.9 si inventario cuantitativo consistente
- 0.6 si solo hay availability transitions
- 0.3 o menos si son proxies

Ajustes:
- bajar si faltan snapshots
- bajar si el dominio es inestable
- bajar si el adapter es generic
- bajar si hay inconsistencias de inventario

## 5. Winner score

El `winner_score` debe ser un score compuesto, no binario.

### Componentes sugeridos
- sales_velocity_score
- restock_frequency_score
- stockout_signal_score
- longevity_score
- price_stability_score
- catalog_prominence_score

### Fórmula inicial sugerida
```text
winner_score =
  0.35 * sales_velocity_score +
  0.20 * restock_frequency_score +
  0.15 * stockout_signal_score +
  0.10 * longevity_score +
  0.10 * price_stability_score +
  0.10 * catalog_prominence_score
```

## 6. Reason codes

Todo winner debe incluir razón legible.  
Ejemplos:
- `HIGH_INVENTORY_DEPLETION`
- `MULTIPLE_RESTOCKS`
- `PERSISTENT_IN_STOCK`
- `LOW_PRICE_VOLATILITY`
- `RECENT_TOP_MOVEMENT`

## 7. Guardrails

- no presentar exactitud falsa
- mostrar confidence
- separar “top winners” de “estimated top sellers”
- si no hay suficientes datos, retornar `INSUFFICIENT_DATA`
