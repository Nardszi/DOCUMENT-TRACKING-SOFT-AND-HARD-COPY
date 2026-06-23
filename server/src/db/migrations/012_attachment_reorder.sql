-- Add upload_order column to attachments for drag-and-drop reordering
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS upload_order INTEGER NOT NULL DEFAULT 0;

-- Initialize order based on uploaded_at for existing attachments
UPDATE attachments SET upload_order = sub.row_num - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY uploaded_at ASC) AS row_num
  FROM attachments
) AS sub
WHERE attachments.id = sub.id AND attachments.upload_order = 0;

-- Index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_attachments_order ON attachments(document_id, upload_order);
