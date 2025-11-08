# Migration: Rename Conversations to Chats

## Overview

This migration renames all "conversation" terminology to "chat" throughout the database schema for consistency and clarity.

## What Changes?

### Tables Renamed:
- `conversations` → `chats`
- `conversation_shares` → `chat_shares`
- `conversation_tags` → `chat_tags`
- `conversation_participants` → `chat_participants`

### Columns Renamed:
- All `conversation_id` columns → `chat_id`

### Views Recreated:
- `conversation_access` → `chat_access`

## How to Run

### Prerequisites
- Existing database with conversation tables created
- MySQL access with ALTER TABLE privileges
- Backup your database before running!

### Run Migration

```bash
# Connect to MySQL
mysql -u root -p panlo_enterprise < migrations/003_rename_conversations_to_chats.sql
```

### Verify Success

After running, check that:
1. New tables exist: `chats`, `chat_shares`, `chat_tags`, `chat_participants`
2. Old tables don't exist: `conversations`, etc.
3. View exists: `chat_access`
4. Foreign key relationships are intact

```sql
-- Check tables
SHOW TABLES LIKE '%chat%';

-- Check columns
DESC chats;
DESC messages;

-- Check view
SELECT * FROM chat_access LIMIT 1;
```

## Rollback

⚠️ **There is no automatic rollback!** 

If you need to rollback, you would need to reverse the operations manually:

```sql
-- Drop the chat view
DROP VIEW IF EXISTS chat_access;

-- Rename tables back
RENAME TABLE chats TO conversations;
RENAME TABLE chat_shares TO conversation_shares;
RENAME TABLE chat_tags TO conversation_tags;
RENAME TABLE chat_participants TO conversation_participants;

-- Rename columns back in each table
ALTER TABLE conversations CHANGE COLUMN chat_id conversation_id VARCHAR(255);
ALTER TABLE messages CHANGE COLUMN chat_id conversation_id VARCHAR(255);
-- ... etc for other tables

-- Recreate old view
CREATE VIEW conversation_access AS ...
```

## Impact

### Application Code
After running this migration, you MUST deploy the updated application code that uses:
- `/api/chats/*` endpoints (not `/api/conversations/*`)
- `chatId` variables (not `conversationId`)
- Updated table/column names in queries

### API Endpoints Changed:
- `POST /api/orgs/:orgId/conversations` → `POST /api/orgs/:orgId/chats`
- `GET /api/orgs/:orgId/conversations` → `GET /api/orgs/:orgId/chats`
- `GET /api/conversations/:conversationId` → `GET /api/chats/:chatId`
- `PUT /api/conversations/:conversationId` → `PUT /api/chats/:chatId`
- `DELETE /api/conversations/:conversationId` → `DELETE /api/chats/:chatId`
- `POST /api/conversations/:conversationId/messages` → `POST /api/chats/:chatId/messages`
- `GET /api/conversations/:conversationId/messages` → `GET /api/chats/:chatId/messages`
- `POST /api/conversations/:conversationId/share` → `POST /api/chats/:chatId/share`
- `DELETE /api/conversations/:conversationId/share` → `DELETE /api/chats/:chatId/share`

### Client Updates Required:
- Update API endpoint URLs
- Update response parsing (look for `chat`, not `conversation` in JSON)
- Update UI labels ("Chats" instead of "Conversations")

## Testing After Migration

1. **Server starts successfully**
   ```bash
   npm run start:enterprise
   # Should start without errors
   ```

2. **Create a new chat**
   ```bash
   curl -X POST http://localhost:3000/api/orgs/:orgId/chats \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title": "Test Chat"}'
   ```

3. **List chats**
   ```bash
   curl http://localhost:3000/api/orgs/:orgId/chats \
     -H "Authorization: Bearer $TOKEN"
   ```

4. **Verify old data is accessible**
   - Check that existing chat history still loads
   - Verify messages are intact
   - Confirm sharing still works

## Questions?

See the main documentation:
- `CHATS-API.md` - Full API reference
- `ENTERPRISE-SUMMARY.md` - Architecture overview
- `README-ENTERPRISE.md` - Setup guide

