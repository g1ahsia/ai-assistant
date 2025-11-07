#!/bin/bash

# Script to add conversation tables to MySQL database
# Usage: ./apply-conversations.sh [database_name]

DB_NAME=${1:-panlo}

echo "============================================"
echo "Adding Conversation Tables to MySQL"
echo "============================================"
echo ""
echo "Database: $DB_NAME"
echo ""

# Check if migration file exists
if [ ! -f "migrations/001_add_conversations.sql" ]; then
    echo "❌ Error: Migration file not found!"
    echo "   Expected: migrations/001_add_conversations.sql"
    exit 1
fi

echo "Running migration..."
echo ""

# Run the migration
mysql -u root -p "$DB_NAME" < migrations/001_add_conversations.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Verifying tables were created..."
    echo ""
    
    # Verify tables
    mysql -u root -p "$DB_NAME" -e "
    SELECT 
        TABLE_NAME, 
        TABLE_ROWS,
        CREATE_TIME
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = '$DB_NAME' 
      AND TABLE_NAME IN ('conversations', 'messages', 'conversation_shares', 'conversation_tags', 'conversation_participants')
    ORDER BY TABLE_NAME;
    "
    
    echo ""
    echo "✅ All conversation tables are ready!"
    echo ""
    echo "Next steps:"
    echo "1. Restart your server: npm run start:enterprise"
    echo "2. Test the API: see CONVERSATIONS-API.md"
    
else
    echo ""
    echo "❌ Migration failed!"
    echo ""
    echo "Common issues:"
    echo "1. Wrong database name (you used: $DB_NAME)"
    echo "2. MySQL not running"
    echo "3. Wrong password"
    echo "4. Parent tables don't exist (run schema-enterprise.sql first)"
    echo ""
    echo "To check your databases:"
    echo "  mysql -u root -p -e 'SHOW DATABASES;'"
    echo ""
    echo "To run full schema first:"
    echo "  mysql -u root -p $DB_NAME < schema-enterprise.sql"
    exit 1
fi

