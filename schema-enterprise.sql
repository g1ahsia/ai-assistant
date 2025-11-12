-- ============================================
-- Enterprise Multi-Tenant Database Schema
-- Panlo AI Assistant - Organization & Team Model
-- ============================================

-- Create database
CREATE DATABASE IF NOT EXISTS panlo_enterprise CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE panlo_enterprise;

-- Organizations table
-- One per company or personal account
CREATE TABLE orgs (
  org_id VARCHAR(255) PRIMARY KEY,           -- e.g., "org_acme123"
  name VARCHAR(255) NOT NULL,                -- "Acme Corp"
  namespace VARCHAR(255) NOT NULL UNIQUE,    -- "org_acme123" (Pinecone namespace)
  plan VARCHAR(50) DEFAULT 'free',           -- "free", "pro", "enterprise"
  owner_id VARCHAR(255) NOT NULL,            -- Primary owner user_id
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  settings JSON,                             -- Org-level settings
  INDEX idx_owner (owner_id),
  INDEX idx_namespace (namespace)
);

-- Users table
-- Global user identity (OAuth-based)
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,          -- Internal user ID
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  google_sub VARCHAR(255) UNIQUE,            -- Google OAuth subject
  avatar_url TEXT,
  current_org_id VARCHAR(255),               -- Last active org
  current_space_id VARCHAR(255),             -- Last active space (for Spaces feature)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  preferences JSON,                          -- User preferences
  FOREIGN KEY (current_org_id) REFERENCES orgs(org_id) ON DELETE SET NULL,
  INDEX idx_email (email),
  INDEX idx_google_sub (google_sub),
  INDEX idx_current_space (current_space_id)
);

-- Organization members
-- Links users to organizations with roles
CREATE TABLE org_members (
  org_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',         -- "owner", "admin", "member"
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  invited_by VARCHAR(255),
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_org (org_id)
);

-- Teams table
-- Logical groups within an organization
CREATE TABLE teams (
  team_id VARCHAR(255) PRIMARY KEY,          -- e.g., "team_engineering"
  org_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,                -- "Engineering Team"
  description TEXT,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  settings JSON,
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_org (org_id),
  INDEX idx_created_by (created_by)
);

-- Team members
-- Links users to teams with roles
CREATE TABLE team_members (
  team_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',         -- "lead", "member"
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  added_by VARCHAR(255),
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_team (team_id)
);

-- ============================================
-- SPACES SYSTEM
-- Collaborative workspaces for organizing documents
-- ============================================

-- Spaces table
-- Personal and team spaces for organizing files
CREATE TABLE spaces (
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
);

-- Space members
-- Links users to spaces with roles
CREATE TABLE space_members (
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
);

-- Space files
-- Many-to-many relationship between spaces and documents
CREATE TABLE space_files (
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
);

-- Space activity log
-- Tracks all space-related activities
CREATE TABLE space_activity (
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
);

-- Update users table to include space foreign key (if not already done above)
-- Note: current_space_id already added to users table definition above
ALTER TABLE users
ADD CONSTRAINT fk_user_current_space 
  FOREIGN KEY (current_space_id) REFERENCES spaces(space_id) ON DELETE SET NULL;

-- ============================================
-- DOCUMENTS
-- ============================================

-- Documents table
-- Tracks document metadata organized via spaces
CREATE TABLE documents (
  doc_id VARCHAR(255) PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  filepath TEXT NOT NULL,                    -- Full filesystem path
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  content_hash VARCHAR(64),                  -- SHA-256 for deduplication
  chunks INT DEFAULT 0,                      -- Number of vector chunks
  summary TEXT,                              -- AI-generated summary
  status VARCHAR(50) DEFAULT 'active',       -- "active", "deleted", "stale"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_org (org_id),
  INDEX idx_owner (owner_user_id),
  INDEX idx_hash (content_hash),
  INDEX idx_status (status),
  INDEX idx_filepath (filepath(255)),        -- Index on filepath for lookups
  FULLTEXT idx_summary (summary)             -- Full-text search on summary
);

-- Audit log (optional - for compliance and debugging)
CREATE TABLE audit_log (
  log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id VARCHAR(255),
  user_id VARCHAR(255),
  action VARCHAR(100) NOT NULL,              -- "space_create", "team_add_member", etc.
  resource_type VARCHAR(50),                 -- "space", "team", "document"
  resource_id VARCHAR(255),
  details JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_org (org_id),
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_created (created_at)
);

-- ============================================
-- Helper Views (optional)
-- ============================================

-- View: User's effective team memberships
CREATE VIEW user_team_memberships AS
SELECT 
  u.user_id,
  u.email,
  om.org_id,
  t.team_id,
  t.name AS team_name,
  tm.role AS team_role
FROM users u
JOIN org_members om ON u.user_id = om.user_id
JOIN teams t ON om.org_id = t.org_id
LEFT JOIN team_members tm ON t.team_id = tm.team_id AND u.user_id = tm.user_id;

-- View: Space access summary
CREATE VIEW space_access AS
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

-- ============================================
-- Chats Tables
-- ============================================

-- Chats: Individual chat sessions
CREATE TABLE IF NOT EXISTS chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(255) UNIQUE NOT NULL,
    org_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    space_ids JSON,    -- Spaces to query
    file_ids JSON,     -- Specific files to query (optional)
    message_count INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    metadata JSON,
    INDEX idx_conv_org_user (org_id, user_id),
    INDEX idx_conv_user_updated (user_id, updated_at DESC),
    INDEX idx_conv_archived (archived, updated_at DESC),
    FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages: Individual messages within chats
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    chat_id VARCHAR(255) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    created_by VARCHAR(255),  -- User who created this message (for collaborative conversations)
    tokens INT DEFAULT 0,
    cited_sources JSON,  -- Array of source references
    context_used JSON,   -- Vector matches used
    model VARCHAR(100),
    temperature DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON,
    INDEX idx_msg_chat (chat_id, created_at),
    INDEX idx_msg_created (created_at),
    INDEX idx_msg_user (created_by, created_at),
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Sharing: Share chats with teams or specific users
CREATE TABLE IF NOT EXISTS chat_shares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    shared_with_type ENUM('user', 'team', 'org') NOT NULL,
    shared_with_id VARCHAR(255) NOT NULL,  -- user_id, team_id, or org_id
    permission ENUM('read', 'write') DEFAULT 'read',
    shared_by VARCHAR(255) NOT NULL,
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_share_chat (chat_id),
    INDEX idx_share_target (shared_with_type, shared_with_id),
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Tags: Organize chats with tags
CREATE TABLE IF NOT EXISTS chat_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tag_chat (chat_id),
    INDEX idx_tag_name (tag),
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Participants: Track active users in collaborative chats
CREATE TABLE IF NOT EXISTS chat_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    first_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    message_count INT DEFAULT 0,
    UNIQUE KEY unique_participant (chat_id, user_id),
    INDEX idx_participant_chat (chat_id),
    INDEX idx_participant_user (user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View: Chat access with sharing info
CREATE VIEW chat_access AS
SELECT 
  c.chat_id,
  c.org_id,
  c.user_id AS owner_id,
  c.title,
  c.message_count,
  c.last_message_at,
  c.archived,
  cs.shared_with_type,
  cs.shared_with_id,
  cs.permission,
  cs.shared_by,
  cs.shared_at
FROM chats c
LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id;

-- ============================================
-- SPACES SYSTEM NOTES
-- ============================================

/*
SPACES SYSTEM OVERVIEW:
- Spaces are the primary organizational unit for documents
- Each user gets a personal space automatically on signup
- Users can create team spaces and add members with roles (owner/contributor/viewer)
- Files can belong to multiple spaces (many-to-many relationship)
- AI queries are scoped to space context

ROLE PERMISSIONS:
- Owner: Full control (manage members, files, settings, delete space)
- Contributor: Add files, remove own files, query AI
- Viewer: View files, query AI (read-only)

IMPLEMENTATION:
1. Personal space created automatically on user signup
2. Users can create team spaces and invite members
3. Documents uploaded directly to spaces
4. Space membership controls access to documents
5. AI queries filtered by space context

For complete documentation, see: SPACES-SYSTEM.md
*/

