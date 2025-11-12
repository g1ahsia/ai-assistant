-- ============================================
-- SPACES SYSTEM SCHEMA
-- Replaces the Folders concept with Spaces
-- ============================================

-- ============================================
-- SPACES TABLE
-- Core table for managing spaces (personal and team)
-- ============================================

CREATE TABLE IF NOT EXISTS spaces (
  space_id VARCHAR(50) PRIMARY KEY,
  org_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Space type and visibility
  space_type ENUM('personal', 'team') NOT NULL DEFAULT 'team',
  visibility ENUM('private', 'shared') NOT NULL DEFAULT 'private',
  
  -- Owner and metadata
  owner_user_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Settings
  settings JSON DEFAULT '{}',
  
  -- Indexes
  INDEX idx_org_id (org_id),
  INDEX idx_owner (owner_user_id),
  INDEX idx_space_type (space_type),
  INDEX idx_created_at (created_at),
  
  -- Foreign keys
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SPACE MEMBERS TABLE
-- Manages space membership and roles
-- ============================================

CREATE TABLE IF NOT EXISTS space_members (
  space_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  
  -- Role in space
  role ENUM('owner', 'contributor', 'viewer') NOT NULL DEFAULT 'viewer',
  
  -- Membership metadata
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(50),
  
  PRIMARY KEY (space_id, user_id),
  
  -- Indexes
  INDEX idx_user_id (user_id),
  INDEX idx_role (role),
  INDEX idx_joined_at (joined_at),
  
  -- Foreign keys
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SPACE FILES TABLE
-- Associates files/documents with spaces
-- ============================================

CREATE TABLE IF NOT EXISTS space_files (
  space_id VARCHAR(50) NOT NULL,
  doc_id VARCHAR(50) NOT NULL,
  
  -- File addition metadata
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(50) NOT NULL,
  
  -- Optional file metadata within space context
  notes TEXT,
  tags JSON DEFAULT '[]',
  
  PRIMARY KEY (space_id, doc_id),
  
  -- Indexes
  INDEX idx_doc_id (doc_id),
  INDEX idx_added_by (added_by),
  INDEX idx_added_at (added_at),
  
  -- Foreign keys
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SPACE ACTIVITY LOG
-- Tracks all space-related activities
-- ============================================

CREATE TABLE IF NOT EXISTS space_activity (
  activity_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  space_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  
  -- Activity details
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
  
  -- Activity metadata
  details JSON DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_space_id (space_id),
  INDEX idx_user_id (user_id),
  INDEX idx_activity_type (activity_type),
  INDEX idx_created_at (created_at),
  
  -- Foreign keys
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USER TABLE EXTENSION
-- Add current_space_id to track user's active space
-- ============================================

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS current_space_id VARCHAR(50) DEFAULT NULL,
ADD INDEX idx_current_space (current_space_id),
ADD CONSTRAINT fk_user_current_space 
  FOREIGN KEY (current_space_id) REFERENCES spaces(space_id) ON DELETE SET NULL;

-- ============================================
-- DOCUMENTS TABLE EXTENSION
-- Link documents to their original folder (if uploaded via folder)
-- But primary access is now through spaces
-- ============================================

-- Note: documents table already has folder_id, which can remain for backward compatibility
-- Space files table provides the many-to-many relationship between documents and spaces

-- ============================================
-- MIGRATION NOTES
-- ============================================

-- MIGRATION PATH FROM FOLDERS TO SPACES:
-- 
-- 1. Create personal space for each user
-- 2. Convert folders to spaces:
--    - Private folders → Personal spaces
--    - Shared folders → Team spaces
-- 3. Create space membership based on folder access:
--    - Folder owner → Space owner
--    - Folder team members → Space contributors
-- 4. Link documents to spaces:
--    - Documents in folders → Files in spaces
-- 5. Update user current_space_id from current folder context
--
-- Note: This migration is NOT YET EXECUTED
-- When ready, create a separate migration script: migration-folders-to-spaces.sql

-- ============================================
-- SAMPLE QUERIES
-- ============================================

-- Get all spaces user has access to
/*
SELECT s.*, sm.role, 
       COUNT(DISTINCT sf.doc_id) as file_count,
       COUNT(DISTINCT sm2.user_id) as member_count
FROM spaces s
JOIN space_members sm ON s.space_id = sm.space_id
LEFT JOIN space_files sf ON s.space_id = sf.space_id
LEFT JOIN space_members sm2 ON s.space_id = sm2.space_id
WHERE sm.user_id = ?
GROUP BY s.space_id, sm.role
ORDER BY s.updated_at DESC;
*/

-- Get all files in a space
/*
SELECT d.*, sf.added_at, sf.added_by, u.name as added_by_name
FROM space_files sf
JOIN documents d ON sf.doc_id = d.doc_id
LEFT JOIN users u ON sf.added_by = u.user_id
WHERE sf.space_id = ? AND d.status = 'active'
ORDER BY sf.added_at DESC;
*/

-- Get all members of a space
/*
SELECT u.user_id, u.name, u.email, u.avatar_url, 
       sm.role, sm.joined_at, 
       adder.name as added_by_name
FROM space_members sm
JOIN users u ON sm.user_id = u.user_id
LEFT JOIN users adder ON sm.added_by = adder.user_id
WHERE sm.space_id = ?
ORDER BY sm.joined_at ASC;
*/

-- Check if user can contribute to space
/*
SELECT role FROM space_members 
WHERE space_id = ? AND user_id = ? 
AND role IN ('owner', 'contributor');
*/

-- ============================================
-- ROLE PERMISSIONS MATRIX
-- ============================================

/*
+------------------+---------+-------------+--------+
| Permission       | Owner   | Contributor | Viewer |
+------------------+---------+-------------+--------+
| View files       | ✓       | ✓           | ✓      |
| Add files        | ✓       | ✓           | ✗      |
| Remove own files | ✓       | ✓           | ✗      |
| Remove any files | ✓       | ✗           | ✗      |
| Add members      | ✓       | ✗           | ✗      |
| Remove members   | ✓       | ✗           | ✗      |
| Change roles     | ✓       | ✗           | ✗      |
| Update space     | ✓       | ✗           | ✗      |
| Delete space     | ✓       | ✗           | ✗      |
| Query AI         | ✓       | ✓           | ✓      |
+------------------+---------+-------------+--------+
*/

