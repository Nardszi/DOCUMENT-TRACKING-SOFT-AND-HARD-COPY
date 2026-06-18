-- Migration 002: Add soft delete / archive support and optimistic locking

-- Add is_archived to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_documents_is_archived ON documents(is_archived);

-- Add version column for optimistic locking
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add is_archived to users (soft delete support)
-- (is_active already exists, used for soft-deactivation)
