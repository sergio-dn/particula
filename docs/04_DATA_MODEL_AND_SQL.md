# Data Model and SQL Guidance

## 1. Entidades principales

- companies
- crawl_jobs
- products
- variants
- product_snapshots
- price_snapshots
- inventory_snapshots
- availability_snapshots
- events
- sales_estimates
- winner_scores

## 2. SQL inicial sugerido

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  platform_type TEXT,
  platform_confidence NUMERIC(5,4),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE crawl_jobs (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE products (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  external_product_id TEXT,
  canonical_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  product_type TEXT,
  category_path TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_external_product_id ON products(external_product_id);

CREATE TABLE variants (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  external_variant_id TEXT,
  sku TEXT,
  variant_title TEXT,
  color TEXT,
  size TEXT,
  material TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_variants_product_id ON variants(product_id);
CREATE INDEX idx_variants_external_variant_id ON variants(external_variant_id);

CREATE TABLE price_snapshots (
  id UUID PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES variants(id),
  observed_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL,
  price NUMERIC(12,2),
  compare_at_price NUMERIC(12,2),
  source_confidence NUMERIC(5,4),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_price_snapshots_variant_observed ON price_snapshots(variant_id, observed_at DESC);

CREATE TABLE inventory_snapshots (
  id UUID PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES variants(id),
  observed_at TIMESTAMPTZ NOT NULL,
  inventory_quantity INTEGER,
  availability TEXT,
  inventory_confidence NUMERIC(5,4),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_inventory_snapshots_variant_observed ON inventory_snapshots(variant_id, observed_at DESC);

CREATE TABLE product_snapshots (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  observed_at TIMESTAMPTZ NOT NULL,
  title TEXT,
  description TEXT,
  product_type TEXT,
  category_path TEXT,
  brand TEXT,
  image_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES variants(id),
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL,
  confidence_score NUMERIC(5,4),
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_events_company_event_at ON events(company_id, event_at DESC);
CREATE INDEX idx_events_product_event_at ON events(product_id, event_at DESC);

CREATE TABLE sales_estimates (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES variants(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  estimated_units NUMERIC(12,2),
  estimated_revenue NUMERIC(14,2),
  confidence_score NUMERIC(5,4) NOT NULL,
  methodology TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_sales_estimates_company_period ON sales_estimates(company_id, period_end DESC);

CREATE TABLE winner_scores (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES variants(id),
  score_date DATE NOT NULL,
  winner_score NUMERIC(8,4) NOT NULL,
  confidence_score NUMERIC(5,4) NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  component_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, product_id, variant_id, score_date)
);

CREATE INDEX idx_winner_scores_company_score_date ON winner_scores(company_id, score_date DESC);
```

## 3. Reglas de modelado

- snapshots son append-only
- products/variants representan entidad viva actual
- first_seen_at y last_seen_at permiten lifecycle
- raw_payload guarda evidencia mínima útil para debug
- scores e inferencias siempre en tablas separadas

## 4. Índices adicionales sugeridos

- `companies(domain)`
- `products(company_id, is_active)`
- `variants(product_id, is_active)`
- `events(company_id, event_type, event_at desc)`

## 5. Posible particionado futuro

Si el volumen crece:
- particionar `price_snapshots`
- particionar `inventory_snapshots`
- particionar `events`
por mes o por rango temporal
