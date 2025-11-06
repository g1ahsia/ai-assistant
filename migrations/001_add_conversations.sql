-- ============================================
-- Migration: Add Conversation Management
-- Date: 2024-11-05
-- Description: Adds conversations, messages, sharing, and tags tables
-- ============================================

-- Conversations: Individual chat sessions
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(255) UNIQUE NOT NULL,
    org_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    folder_ids JSON DEFAULT '[]',  -- Folders used in this conversation
    message_count INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    metadata JSON DEFAULT '{}',
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
    tokens INT DEFAULT 0,
    cited_sources JSON DEFAULT '[]',  -- Array of source references
    context_used JSON DEFAULT '[]',   -- Vector matches used
    model VARCHAR(100),
    temperature DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON DEFAULT '{}',
    INDEX idx_msg_conv (conversation_id, created_at),
    INDEX idx_msg_created (created_at),
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
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

-- View: Conversation access with sharing info
CREATE OR REPLACE VIEW conversation_access AS
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

-- ============================================
-- Migration Complete
-- ============================================

