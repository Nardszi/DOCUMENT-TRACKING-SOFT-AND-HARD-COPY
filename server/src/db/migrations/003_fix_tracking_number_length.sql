-- Migration 003: Fix tracking_number column length
-- NONECO-YYYYMMDD-XXXXX = 21 characters, original was VARCHAR(20)
ALTER TABLE documents ALTER COLUMN tracking_number TYPE VARCHAR(25);
