-- Migration: Remove indexed_at column from documents table
-- Date: 2025-11-09
-- Description: Drop indexed_at column as it's redundant with created_at

USE panlo_enterprise;

-- Show columns before
SELECT 'BEFORE:' as stage;
SHOW COLUMNS FROM documents;

-- Drop indexed_at column
ALTER TABLE documents DROP COLUMN indexed_at;

-- Show columns after
SELECT 'AFTER:' as stage;
SHOW COLUMNS FROM documents;

-- Verify the change
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'panlo_enterprise' 
  AND TABLE_NAME = 'documents'
ORDER BY ORDINAL_POSITION;

