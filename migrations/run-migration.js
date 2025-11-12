#!/usr/bin/env node

/**
 * Migration Runner
 * Executes SQL migration files using the same database config as the app
 */

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Database configuration (same as express-enterprise.js)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'panlo_enterprise',
  multipleStatements: true, // Required for running multiple SQL statements
};

async function runMigration(migrationFile) {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}`);
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, migrationFile);
    console.log(`📖 Reading migration file: ${migrationFile}`);
    const sql = await fs.readFile(migrationPath, 'utf-8');
    
    // Execute migration
    console.log('🚀 Executing migration...\n');
    const [results] = await connection.query(sql);
    
    // Display results
    if (Array.isArray(results)) {
      // Multiple result sets
      results.forEach((result, index) => {
        if (result && typeof result === 'object') {
          if (Array.isArray(result)) {
            // Result set with rows
            result.forEach(row => {
              console.log(row);
            });
          } else if (result.affectedRows !== undefined) {
            // DML result
            console.log(`   Affected rows: ${result.affectedRows}`);
          }
        }
      });
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    
    if (error.sql) {
      console.error('\nSQL:', error.sql.substring(0, 200) + '...');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Get migration file from command line or use default
const migrationFile = process.argv[2] || '001_migrate_folders_to_spaces.sql';

console.log('╔════════════════════════════════════════════════╗');
console.log('║         DATABASE MIGRATION RUNNER              ║');
console.log('╚════════════════════════════════════════════════╝\n');

runMigration(migrationFile);

