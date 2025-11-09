-- Migration: Remove metadata JSON column and add dedicated columns
-- Date: 2025-11-09
-- Description: Replace metadata JSON with dedicated columns for better performance and queryability
-- Also removes redundant indexed_at column (same as created_at)

USE panlo_enterprise;

-- Step 1: Add new columns
ALTER TABLE documents 
  ADD COLUMN chunks INT DEFAULT 0 AFTER content_hash,
  ADD COLUMN summary TEXT AFTER chunks,
  ADD COLUMN smart_folder_ids JSON AFTER summary;

-- Step 2: Migrate data from metadata JSON to new columns (if metadata exists)
UPDATE documents 
SET 
  chunks = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.chunks')), 0),
  summary = JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.summary')),
  smart_folder_ids = JSON_EXTRACT(metadata, '$.smartFolderNames')
WHERE metadata IS NOT NULL;

-- Step 3: Drop redundant columns
ALTER TABLE documents 
  DROP COLUMN metadata,
  DROP COLUMN indexed_at;

-- Step 4: Add full-text index on summary for search
ALTER TABLE documents ADD FULLTEXT INDEX idx_summary (summary);

-- Verify the migration
SELECT 
  COUNT(*) as total_documents,
  COUNT(summary) as documents_with_summary,
  COUNT(smart_folder_ids) as documents_with_smart_folders,
  SUM(chunks) as total_chunks
FROM documents;

SHOW COLUMNS FROM documents;
