-- Enforces the manifesto's "tamper-evident, append-only" guarantee at the
-- database layer for PostgreSQL: once a pakiso_events row is written, it can
-- never be mutated or removed. Applied idempotently by `pakiso init` for the
-- postgresql dialect only (SQLite/MySQL don't have an equivalent trigger
-- mechanism available through this same portable schema).

CREATE OR REPLACE FUNCTION pakiso_prevent_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pakiso_events is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pakiso_events_prevent_mutation ON pakiso_events;

CREATE TRIGGER pakiso_events_prevent_mutation
  BEFORE UPDATE OR DELETE ON pakiso_events
  FOR EACH ROW EXECUTE FUNCTION pakiso_prevent_event_mutation();
