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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  preferences JSON,                          -- User preferences
  FOREIGN KEY (current_org_id) REFERENCES orgs(org_id) ON DELETE SET NULL,
  INDEX idx_email (email),
  INDEX idx_google_sub (google_sub)
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

-- Folders table
-- Watched folders with metadata and sharing
CREATE TABLE folders (
  folder_id VARCHAR(255) PRIMARY KEY,        -- e.g., "folder_abc123"
  org_id VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  path TEXT NOT NULL,                        -- Full filesystem path
  name VARCHAR(255) NOT NULL,                -- Folder display name
  visibility VARCHAR(50) DEFAULT 'private',  -- "private", "team", "org"
  team_ids JSON,                             -- Array of team_ids with access
  policy_version INT DEFAULT 1,              -- Increments on ACL changes
  status VARCHAR(50) DEFAULT 'active',       -- "active", "paused", "deleted"
  sync_status VARCHAR(50) DEFAULT 'idle',    -- "idle", "syncing", "error"
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  settings JSON,                             -- Folder-level settings
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_org (org_id),
  INDEX idx_owner (owner_user_id),
  INDEX idx_status (status)
);

-- Folder ACL (explicit access control)
-- Tracks which teams have access to which folders
CREATE TABLE folder_acl (
  folder_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  permission VARCHAR(50) DEFAULT 'read',     -- "read", "write"
  shared_by VARCHAR(255) NOT NULL,
  shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (folder_id, team_id),
  FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE,
  FOREIGN KEY (shared_by) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_folder (folder_id),
  INDEX idx_team (team_id)
);

-- Documents table (optional - for tracking document metadata)
CREATE TABLE documents (
  doc_id VARCHAR(255) PRIMARY KEY,
  folder_id VARCHAR(255) NOT NULL,
  org_id VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  filepath TEXT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  content_hash VARCHAR(64),                  -- SHA-256 for deduplication
  status VARCHAR(50) DEFAULT 'active',       -- "active", "deleted", "stale"
  indexed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  metadata JSON,                             -- Additional document metadata
  FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_folder (folder_id),
  INDEX idx_org (org_id),
  INDEX idx_owner (owner_user_id),
  INDEX idx_hash (content_hash),
  INDEX idx_status (status)
);

-- Audit log (optional - for compliance and debugging)
CREATE TABLE audit_log (
  log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  org_id VARCHAR(255),
  user_id VARCHAR(255),
  action VARCHAR(100) NOT NULL,              -- "folder_share", "team_add_member", etc.
  resource_type VARCHAR(50),                 -- "folder", "team", "document"
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

-- View: Folder access summary
CREATE VIEW folder_access AS
SELECT 
  f.folder_id,
  f.org_id,
  f.owner_user_id,
  f.name AS folder_name,
  f.visibility,
  fa.team_id,
  t.name AS team_name,
  fa.permission,
  fa.shared_by,
  fa.shared_at
FROM folders f
LEFT JOIN folder_acl fa ON f.folder_id = fa.folder_id
LEFT JOIN teams t ON fa.team_id = t.team_id;

-- ============================================
-- Conversations Tables
-- ============================================

-- Conversations: Individual chat sessions
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) UNIQUE NOT NULL,
    org_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    folder_ids JSON,  -- Watch/smart folders to query
    file_ids JSON,     -- Specific files to query
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

-- Messages: Individual messages within conversations
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    conversation_id VARCHAR(255) NOT NULL,
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
    INDEX idx_msg_conv (conversation_id, created_at),
    INDEX idx_msg_created (created_at),
    INDEX idx_msg_user (created_by, created_at),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversation Sharing: Share conversations with teams or specific users
CREATE TABLE IF NOT EXISTS conversation_shares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    shared_with_type ENUM('user', 'team', 'org') NOT NULL,
    shared_with_id VARCHAR(255) NOT NULL,  -- user_id, team_id, or org_id
    permission ENUM('read', 'write') DEFAULT 'read',
    shared_by VARCHAR(255) NOT NULL,
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_share_conv (conversation_id),
    INDEX idx_share_target (shared_with_type, shared_with_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversation Tags: Organize conversations with tags
CREATE TABLE IF NOT EXISTS conversation_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tag_conv (conversation_id),
    INDEX idx_tag_name (tag),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversation Participants: Track active users in collaborative conversations
CREATE TABLE IF NOT EXISTS conversation_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    first_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    message_count INT DEFAULT 0,
    UNIQUE KEY unique_participant (conversation_id, user_id),
    INDEX idx_participant_conv (conversation_id),
    INDEX idx_participant_user (user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View: Conversation access with sharing info
CREATE VIEW conversation_access AS
SELECT 
  c.conversation_id,
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
FROM conversations c
LEFT JOIN conversation_shares cs ON c.conversation_id = cs.conversation_id;

