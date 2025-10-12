#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the environment from command line arguments
const targetEnv = process.argv[2];

if (!targetEnv || !['development', 'production'].includes(targetEnv)) {
  console.log('❌ Usage: node switch-env.js [development|production]');
  console.log('');
  console.log('Examples:');
  console.log('  node switch-env.js development  # Switch to development (allen-dev index)');
  console.log('  node switch-env.js production   # Switch to production (panlo-global index)');
  process.exit(1);
}

// Set the environment variable
process.env.NODE_ENV = targetEnv;

// Import the config to validate
import config from './config.js';

console.log(`✅ Switched to ${targetEnv} environment`);
console.log(`📊 Current config:`);
console.log(`   Environment: ${config.env}`);
console.log(`   Pinecone Index: ${config.pinecone.indexName}`);
console.log(`   Model: ${config.model}`);
console.log(`   Port: ${config.port}`);
console.log(`   SSL Enabled: ${config.ssl.enabled}`);
console.log(`   CORS Origins: ${config.cors.allowedOrigins.join(', ')}`);

// Create a .env file for the current environment
const envContent = `NODE_ENV=${targetEnv}
# Environment-specific variables
# Add any additional environment variables here
`;

fs.writeFileSync('.env', envContent);
console.log(`📝 Created .env file with NODE_ENV=${targetEnv}`);

console.log('');
console.log('🚀 To start the server:');
console.log(`   npm start`);
console.log('');
console.log('💡 The server will automatically use the correct configuration based on NODE_ENV'); 