-- ============================================
-- Migration: Remove Folders, Add Spaces
-- Date: 2025-11-11
-- Description: Clean migration from folders to spaces system
-- ============================================

USE panlo_enterprise;

-- ============================================
-- STEP 1: Drop foreign key constraints on folders
-- ============================================

-- Drop foreign key constraint from documents table if it exists
SET @constraint_exists = (
  SELECT COUNT(*) 
  FROM information_schema.table_constraints 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'documents' 
    AND constraint_name LIKE '%folder%'
);

-- Get the actual constraint name
SET @constraint_name = (
  SELECT constraint_name
  FROM information_schema.table_constraints 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'documents' 
    AND constraint_name LIKE '%folder%'
  LIMIT 1
);

-- Drop the constraint if it exists
SET @sql = IF(@constraint_name IS NOT NULL,
  CONCAT('ALTER TABLE documents DROP FOREIGN KEY ', @constraint_name),
  'SELECT "No folder foreign key constraint found"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Also check for documents_ibfk_1 specifically
SET @fk_exists = (
  SELECT COUNT(*) 
  FROM information_schema.table_constraints 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'documents' 
    AND constraint_name = 'documents_ibfk_1'
);

SET @sql = IF(@fk_exists > 0,
  'ALTER TABLE documents DROP FOREIGN KEY documents_ibfk_1',
  'SELECT "Constraint documents_ibfk_1 does not exist"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;

-- ============================================
-- STEP 2: Drop legacy folder tables and views
-- ============================================

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS folder_access;
DROP VIEW IF EXISTS document_access;

-- Drop folder-related tables (they're empty)
DROP TABLE IF EXISTS folder_acl;
DROP TABLE IF EXISTS folders;

COMMIT;

-- ============================================
-- STEP 3: Ensure Spaces tables exist
-- ============================================

-- Spaces table
CREATE TABLE IF NOT EXISTS spaces (
  space_id VARCHAR(255) PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  space_type ENUM('personal', 'team') NOT NULL DEFAULT 'team',
  visibility ENUM('private', 'shared') NOT NULL DEFAULT 'private',
  owner_user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  settings JSON,
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_org (org_id),
  INDEX idx_owner (owner_user_id),
  INDEX idx_space_type (space_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Space members table
CREATE TABLE IF NOT EXISTS space_members (
  space_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  role ENUM('owner', 'contributor', 'viewer') NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(255),
  PRIMARY KEY (space_id, user_id),
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_role (role),
  INDEX idx_joined_at (joined_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Space files table (many-to-many)
CREATE TABLE IF NOT EXISTS space_files (
  space_id VARCHAR(255) NOT NULL,
  doc_id VARCHAR(255) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(255),
  notes TEXT,
  tags JSON,
  PRIMARY KEY (space_id, doc_id),
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_doc (doc_id),
  INDEX idx_added_by (added_by),
  INDEX idx_added_at (added_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Space activity log
CREATE TABLE IF NOT EXISTS space_activity (
  activity_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  space_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  activity_type ENUM(
    'space_created',
    'space_updated',
    'space_deleted',
    'member_added',
    'member_removed',
    'member_role_changed',
    'file_added',
    'file_removed',
    'query_executed'
  ) NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_space (space_id),
  INDEX idx_user (user_id),
  INDEX idx_activity_type (activity_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

-- ============================================
-- STEP 4: Update Users table
-- ============================================

-- Add current_space_id column if it doesn't exist
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'users' 
    AND column_name = 'current_space_id'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE users ADD COLUMN current_space_id VARCHAR(255) AFTER current_org_id',
  'SELECT "Column current_space_id already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on current_space_id if it doesn't exist
SET @index_exists = (
  SELECT COUNT(*) 
  FROM information_schema.statistics 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'users' 
    AND index_name = 'idx_current_space'
);

SET @sql = IF(@index_exists = 0,
  'ALTER TABLE users ADD INDEX idx_current_space (current_space_id)',
  'SELECT "Index idx_current_space already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraint if it doesn't exist
SET @fk_exists = (
  SELECT COUNT(*) 
  FROM information_schema.table_constraints 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'users' 
    AND constraint_name = 'fk_user_current_space'
);

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_user_current_space FOREIGN KEY (current_space_id) REFERENCES spaces(space_id) ON DELETE SET NULL',
  'SELECT "Foreign key fk_user_current_space already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;

-- ============================================
-- STEP 5: Remove folder_id from documents if it exists
-- ============================================

SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'documents' 
    AND column_name = 'folder_id'
);

SET @sql = IF(@column_exists > 0,
  'ALTER TABLE documents DROP COLUMN folder_id',
  'SELECT "Column folder_id does not exist in documents table"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;

-- ============================================
-- STEP 6: Update chats table to use space_ids
-- ============================================

-- Check if chats table has folder_ids column
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'chats' 
    AND column_name = 'folder_ids'
);

-- If folder_ids exists, rename to space_ids
SET @sql = IF(@column_exists > 0,
  'ALTER TABLE chats CHANGE COLUMN folder_ids space_ids JSON',
  'SELECT "Column folder_ids does not exist in chats table"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure space_ids column exists
SET @column_exists = (
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_schema = 'panlo_enterprise' 
    AND table_name = 'chats' 
    AND column_name = 'space_ids'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE chats ADD COLUMN space_ids JSON AFTER description',
  'SELECT "Column space_ids already exists in chats table"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

COMMIT;

-- ============================================
-- STEP 7: Recreate views with space-based access
-- ============================================

-- Drop old folder_access view if it exists
DROP VIEW IF EXISTS folder_access;

-- Create space_access view
CREATE OR REPLACE VIEW space_access AS
SELECT 
  s.space_id,
  s.org_id,
  s.name AS space_name,
  s.description,
  s.space_type,
  s.visibility,
  s.owner_user_id,
  sm.user_id,
  sm.role,
  sm.joined_at,
  sm.added_by,
  u.name AS user_name,
  u.email AS user_email,
  (SELECT COUNT(*) FROM space_files WHERE space_id = s.space_id) AS file_count
FROM spaces s
LEFT JOIN space_members sm ON s.space_id = sm.space_id
LEFT JOIN users u ON sm.user_id = u.user_id;

COMMIT;

-- ============================================
-- STEP 8: Create personal spaces for existing users
-- ============================================

-- This will create personal spaces for any users that don't have one yet
INSERT INTO spaces (space_id, org_id, name, description, space_type, visibility, owner_user_id, created_at)
SELECT 
  CONCAT('space_personal_', u.user_id) AS space_id,
  u.current_org_id AS org_id,
  CONCAT(u.name, '''s Personal Space') AS name,
  'Personal workspace for private documents' AS description,
  'personal' AS space_type,
  'private' AS visibility,
  u.user_id AS owner_user_id,
  NOW() AS created_at
FROM users u
WHERE u.current_org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM spaces s 
    WHERE s.owner_user_id = u.user_id 
      AND s.space_type = 'personal'
      AND s.org_id = u.current_org_id
  );

-- Add users as owners of their personal spaces
INSERT INTO space_members (space_id, user_id, role, joined_at, added_by)
SELECT 
  s.space_id,
  s.owner_user_id,
  'owner',
  NOW(),
  s.owner_user_id
FROM spaces s
WHERE s.space_type = 'personal'
  AND NOT EXISTS (
    SELECT 1 FROM space_members sm 
    WHERE sm.space_id = s.space_id 
      AND sm.user_id = s.owner_user_id
  );

-- Set users' current_space_id to their personal space if not set
UPDATE users u
INNER JOIN spaces s ON s.owner_user_id = u.user_id 
  AND s.space_type = 'personal' 
  AND s.org_id = u.current_org_id
SET u.current_space_id = s.space_id
WHERE u.current_space_id IS NULL;

COMMIT;

-- ============================================
-- STEP 9: Log activity for created personal spaces
-- ============================================

INSERT INTO space_activity (space_id, user_id, activity_type, details, created_at)
SELECT 
  s.space_id,
  s.owner_user_id,
  'space_created',
  JSON_OBJECT(
    'space_name', s.name,
    'space_type', s.space_type,
    'created_by_migration', true
  ),
  s.created_at
FROM spaces s
WHERE s.space_type = 'personal'
  AND NOT EXISTS (
    SELECT 1 FROM space_activity sa 
    WHERE sa.space_id = s.space_id 
      AND sa.activity_type = 'space_created'
  );

COMMIT;

-- ============================================
-- Migration Complete
-- ============================================

SELECT '✅ Migration Complete!' AS status;
SELECT 'Folders removed, Spaces system ready' AS message;
SELECT COUNT(*) AS total_spaces FROM spaces;
SELECT COUNT(*) AS personal_spaces FROM spaces WHERE space_type = 'personal';
SELECT COUNT(*) AS team_spaces FROM spaces WHERE space_type = 'team';
SELECT COUNT(*) AS total_space_members FROM space_members;
SELECT COUNT(*) AS total_space_files FROM space_files;

