-- Migration 011: Approval workflows

CREATE TABLE IF NOT EXISTS approval_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_flow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    label VARCHAR(100) NOT NULL,
    approver_role VARCHAR(20),
    department_id UUID REFERENCES departments(id),
    approver_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(flow_id, step_order)
);

CREATE TABLE IF NOT EXISTS document_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    flow_step_id UUID REFERENCES approval_flow_steps(id) ON DELETE SET NULL,
    step_order INTEGER NOT NULL,
    label VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    assigned_to UUID REFERENCES users(id),
    assigned_department_id UUID REFERENCES departments(id),
    comment TEXT,
    decided_by UUID REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_approvals_document ON document_approvals(document_id, step_order);
CREATE INDEX IF NOT EXISTS idx_doc_approvals_assigned ON document_approvals(assigned_to, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_flow_steps_flow ON approval_flow_steps(flow_id, step_order);
