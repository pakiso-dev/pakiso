-- Enforces the manifesto's "tamper-evident, append-only" guarantee at the
-- database layer for PostgreSQL: once a causal_events row is written, it can
-- never be mutated or removed. Applied idempotently by `causal init` for the
-- postgresql dialect only (SQLite/MySQL don't have an equivalent trigger
-- mechanism available through this same portable schema).

CREATE OR REPLACE FUNCTION causal_prevent_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'causal_events is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS causal_events_prevent_mutation ON causal_events;

CREATE TRIGGER causal_events_prevent_mutation
  BEFORE UPDATE OR DELETE ON causal_events
  FOR EACH ROW EXECUTE FUNCTION causal_prevent_event_mutation();
