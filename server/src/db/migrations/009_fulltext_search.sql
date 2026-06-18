-- Migration 009: Full-text search for documents

ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING GIN(search_vector);

CREATE OR REPLACE FUNCTION documents_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.tracking_number, '') || ' ' || COALESCE(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_search ON documents;
CREATE TRIGGER trg_documents_search
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_search_update();

UPDATE documents SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(tracking_number, '') || ' ' || COALESCE(description, ''));
