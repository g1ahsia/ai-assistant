-- Migration: Add indexed_at column to documents table
-- Date: 2025-11-09
-- Description: Ensure indexed_at column exists with proper default

USE panlo_enterprise;

-- Try to add indexed_at column (will fail silently if exists)
-- Check first if column exists
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'panlo_enterprise' 
  AND TABLE_NAME = 'documents' 
  AND COLUMN_NAME = 'indexed_at'
);

-- Add column only if it doesn't exist
SET @sql = IF(@column_exists = 0,
  'ALTER TABLE documents ADD COLUMN indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status',
  'SELECT "Column indexed_at already exists" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update NULL indexed_at values to created_at for existing documents
UPDATE documents 
SET indexed_at = COALESCE(indexed_at, created_at)
WHERE indexed_at IS NULL;

-- Verify the column exists
SHOW COLUMNS FROM documents LIKE 'indexed_at';

-- Show sample data
SELECT doc_id, filename, status, indexed_at, created_at 
FROM documents 
LIMIT 5;
