# Database Migrations

This directory contains database migration scripts for the Panlo Enterprise system.

## Migrations

### 001_add_conversations.sql
**Date:** 2024-11-05  
**Description:** Adds conversation management system with messages, sharing, and tags

**Tables Created:**
- `conversations` - Chat sessions
- `messages` - Individual messages
- `conversation_shares` - Sharing configuration
- `conversation_tags` - Tag organization
- `conversation_access` (view) - Unified access view

## Running Migrations

### Initial Setup
If you're setting up the database from scratch, use the main schema file:

```bash
mysql -u root -p < schema-enterprise.sql
```

### Applying Individual Migrations
If you already have the database set up and need to add conversations:

```bash
mysql -u root -p panlo < migrations/001_add_conversations.sql
```

Replace `panlo` with your actual database name.

### Verifying Migration

After running the migration, verify the tables were created:

```bash
mysql -u root -p -e "SHOW TABLES LIKE 'conv%'" panlo
```

You should see:
- `conversation_shares`
- `conversation_tags`
- `conversations`

Check the messages table:
```bash
mysql -u root -p -e "SHOW TABLES LIKE 'messages'" panlo
```

### Rollback (if needed)

To remove conversation tables:

```bash
mysql -u root -p panlo <<EOF
DROP VIEW IF EXISTS conversation_access;
DROP TABLE IF EXISTS conversation_tags;
DROP TABLE IF EXISTS conversation_shares;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
EOF
```

## Migration Order

Migrations should be applied in numerical order:
1. `001_add_conversations.sql`
2. (Future migrations...)

## Notes

- All migrations use `IF NOT EXISTS` to avoid errors if already applied
- Foreign keys ensure referential integrity
- Cascade deletes remove dependent records automatically
- Indexes optimize common query patterns

