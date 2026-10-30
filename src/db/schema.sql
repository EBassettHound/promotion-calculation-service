CREATE TABLE IF NOT EXISTS calculation_requests (
  id UUID PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL,
  cart_subtotal_cents BIGINT NOT NULL CHECK (cart_subtotal_cents >= 0),
  total_discount_cents BIGINT NOT NULL CHECK (total_discount_cents >= 0),
  final_total_cents BIGINT NOT NULL CHECK (final_total_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotion_evaluations (
  id BIGSERIAL PRIMARY KEY,
  calculation_id UUID NOT NULL REFERENCES calculation_requests(id) ON DELETE CASCADE,
  promotion_id VARCHAR(100) NOT NULL,
  promotion_name VARCHAR(200) NOT NULL,
  outcome VARCHAR(10) NOT NULL CHECK (outcome IN ('APPLIED', 'REJECTED')),
  discount_amount_cents BIGINT NOT NULL CHECK (discount_amount_cents >= 0),
  reason TEXT NOT NULL,
  priority INTEGER NOT NULL,
  target_sku VARCHAR(100),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotion_evaluations_calculation
  ON promotion_evaluations(calculation_id);

CREATE INDEX IF NOT EXISTS idx_calculation_requests_customer_created
  ON calculation_requests(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_events (
  id BIGSERIAL PRIMARY KEY,
  correlation_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_events_correlation
  ON application_events(correlation_id);
