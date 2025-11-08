-- ============================================
-- Migration: Add Chat Management
-- Date: 2024-11-05 (Updated: 2024-11-08)
-- Description: Adds chats, messages, sharing, and tags tables
-- ============================================

-- Chats: Individual chat sessions
CREATE TABLE IF NOT EXISTS chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(255) UNIQUE NOT NULL,
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
    INDEX idx_chat_org_user (org_id, user_id),
    INDEX idx_chat_user_updated (user_id, updated_at DESC),
    INDEX idx_chat_archived (archived, updated_at DESC),
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
    created_by VARCHAR(255),  -- User who created this message (for collaborative chats)
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
CREATE OR REPLACE VIEW chat_access AS
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
-- Migration Complete
-- ============================================

