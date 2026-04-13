-- Migration 001: Initial schema for NONECO Document Tracking System

-- Departments (seeded, not user-managed)
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL
);

-- Document categories
CREATE TABLE document_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Users
CREATE TYPE user_role AS ENUM ('staff', 'department_head', 'admin');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'staff',
    department_id UUID NOT NULL REFERENCES departments(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents
CREATE TYPE doc_status AS ENUM ('pending', 'in_progress', 'forwarded', 'returned', 'completed');
CREATE TYPE doc_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_number VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    category_id UUID NOT NULL REFERENCES document_categories(id),
    originating_department_id UUID NOT NULL REFERENCES departments(id),
    current_department_id UUID NOT NULL REFERENCES departments(id),
    description TEXT,
    status doc_status NOT NULL DEFAULT 'pending',
    priority doc_priority NOT NULL DEFAULT 'normal',
    deadline DATE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_current_dept ON documents(current_department_id);
CREATE INDEX idx_documents_tracking_number ON documents(tracking_number);
CREATE INDEX idx_documents_deadline ON documents(deadline) WHERE deadline IS NOT NULL;

-- Tracking log (immutable)
CREATE TABLE tracking_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    user_id UUID NOT NULL REFERENCES users(id),
    department_id UUID NOT NULL REFERENCES departments(id),
    event_type VARCHAR(50) NOT NULL,
    remarks TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_log_document ON tracking_log(document_id, created_at);

-- Routings
CREATE TABLE routings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    from_department_id UUID NOT NULL REFERENCES departments(id),
    to_department_id UUID NOT NULL REFERENCES departments(id),
    routing_note TEXT NOT NULL,
    routing_type VARCHAR(20) NOT NULL DEFAULT 'forward',
    routed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CC routing
CREATE TABLE routing_cc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routing_id UUID NOT NULL REFERENCES routings(id),
    department_id UUID NOT NULL REFERENCES departments(id)
);

-- Attachments
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    document_id UUID REFERENCES documents(id),
    event_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at);

-- System settings (key-value)
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES ('email_notifications_enabled', 'true');

-- -----------------------------------------------------------------------
-- Seed: Seven NONECO departments
-- -----------------------------------------------------------------------
INSERT INTO departments (code, name) VALUES
    ('OGM',   'Office of the General Manager'),
    ('ISD',   'Institutional Services Department'),
    ('TSD',   'Technical Services Department'),
    ('AOD',   'Area Operation Department'),
    ('CITET', 'Corporate Planning, Information Technology and Energy Trading Department'),
    ('FSD',   'Financial Services Department'),
    ('IAD',   'Internal Audit Department');

-- -----------------------------------------------------------------------
-- Seed: Default document categories (Requirement 13.1)
-- -----------------------------------------------------------------------
INSERT INTO document_categories (name) VALUES
    ('Memo'),
    ('Letter'),
    ('Resolution'),
    ('Purchase Order'),
    ('Contract'),
    ('Report'),
    ('Others');

-- -----------------------------------------------------------------------
-- Daily sequence helper for tracking numbers (NONECO-YYYYMMDD-XXXXX)
-- Uses a table-based counter to avoid per-day sequence creation overhead.
-- -----------------------------------------------------------------------
CREATE TABLE tracking_number_sequences (
    date_key CHAR(8) PRIMARY KEY,  -- YYYYMMDD
    last_seq INTEGER NOT NULL DEFAULT 0
);
