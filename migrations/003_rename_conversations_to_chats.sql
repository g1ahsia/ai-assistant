-- Migration: Rename conversations to chats
-- This renames all conversation-related tables and columns to use "chat" terminology

-- Drop the view first (it depends on the tables)
DROP VIEW IF EXISTS conversation_access;

-- Rename tables
RENAME TABLE conversations TO chats;
RENAME TABLE conversation_shares TO chat_shares;
RENAME TABLE conversation_tags TO chat_tags;
RENAME TABLE conversation_participants TO chat_participants;

-- Rename columns in chats table
ALTER TABLE chats CHANGE COLUMN conversation_id chat_id VARCHAR(255);

-- Rename columns in messages table
ALTER TABLE messages CHANGE COLUMN conversation_id chat_id VARCHAR(255);

-- Rename columns in chat_shares table
ALTER TABLE chat_shares CHANGE COLUMN conversation_id chat_id VARCHAR(255);

-- Rename columns in chat_tags table
ALTER TABLE chat_tags CHANGE COLUMN conversation_id chat_id VARCHAR(255);

-- Rename columns in chat_participants table
ALTER TABLE chat_participants CHANGE COLUMN conversation_id chat_id VARCHAR(255);

-- Recreate the view with new naming
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

-- Verify the migration
SELECT 'Migration completed successfully' AS status;
SHOW TABLES LIKE '%chat%';

