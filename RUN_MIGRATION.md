# Add Conversation Schemas to MySQL

## Quick Command

Run this command in your terminal:

```bash
mysql -u root -p panlo < migrations/001_add_conversations.sql
```

Replace `panlo` with your actual database name if different.

---

## Step-by-Step Instructions

### 1. Find Your Database Name

```bash
mysql -u root -p -e "SHOW DATABASES;"
```

Look for your Panlo database name (might be `panlo`, `panlo_enterprise`, etc.)

### 2. Run the Migration

```bash
cd /Users/kuangchihhsiao/Documents/GitHub/ai-assistant
mysql -u root -p <YOUR_DB_NAME> < migrations/001_add_conversations.sql
```

### 3. Verify Tables Were Created

```bash
mysql -u root -p -e "USE <YOUR_DB_NAME>; SHOW TABLES LIKE 'conv%';"
```

You should see:
- `conversation_participants`
- `conversation_shares`
- `conversation_tags`
- `conversations`

Also check for `messages` table:
```bash
mysql -u root -p -e "USE <YOUR_DB_NAME>; SHOW TABLES LIKE 'messages';"
```

---

## What Gets Added

The migration creates **5 new tables**:

1. ✅ `conversations` - Main conversation table
2. ✅ `messages` - Message history with creator tracking
3. ✅ `conversation_shares` - Sharing configuration
4. ✅ `conversation_tags` - Tag organization
5. ✅ `conversation_participants` - Participant tracking

Plus **1 view**:
- ✅ `conversation_access` - Unified access view

---

## If You Get Errors

### Error: "Table already exists"
This is OK! The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times.

### Error: "Unknown database"
Create the database first:
```bash
mysql -u root -p -e "CREATE DATABASE panlo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Then run the full schema:
```bash
mysql -u root -p panlo < schema-enterprise.sql
```

### Error: "Foreign key constraint fails"
The parent tables might not exist. Run the full schema first:
```bash
mysql -u root -p panlo < schema-enterprise.sql
```

---

## Rollback (if needed)

To remove the conversation tables:

```bash
mysql -u root -p panlo <<EOF
DROP VIEW IF EXISTS conversation_access;
DROP TABLE IF EXISTS conversation_tags;
DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS conversation_shares;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
EOF
```

---

## After Migration

Restart your server:
```bash
npm run start:enterprise
```

Test the conversation API:
```bash
# Create a conversation
curl -X POST http://localhost:3000/api/orgs/YOUR_ORG_ID/conversations \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Conversation"}'
```

