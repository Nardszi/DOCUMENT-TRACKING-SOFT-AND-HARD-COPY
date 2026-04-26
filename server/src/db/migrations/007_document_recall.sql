-- Migration 007: Document recall support
-- Adds a recall_requests table so the originating department can pull back a forwarded document

CREATE TABLE document_recalls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    requested_by UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_recalls_document ON document_recalls(document_id);
CREATE INDEX idx_document_recalls_status ON document_recalls(status) WHERE status = 'pending';
