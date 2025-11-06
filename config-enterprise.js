// ============================================
// Enterprise Multi-Tenant Configuration
// Panlo AI Assistant - Organization & Team Model
// ============================================

import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Pinecone Configuration
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT || 'us-east-1',
    
    // Index naming pattern: panlo-{env}-{region}
    indexName: process.env.PINECONE_INDEX_NAME || 'panlo-prod-apne1',
    
    // Namespace patterns
    namespaces: {
      // Organization namespace: Use orgId directly (already has org_ prefix)
      org: (orgId) => orgId,
      
      // Personal/legacy namespace: user_<userId> (for free/personal tier)
      user: (userId) => `user_${userId}`,
      
      // Shared space namespace: space_<spaceId> (optional, for cross-org)
      space: (spaceId) => `space_${spaceId}`,
    },
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
    embeddingModel: 'multilingual-e5-large',
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'panlo_enterprise',
    connectionLimit: 10,
  },

  // Vector Configuration
  vector: {
    dimension: 1024, // multilingual-e5-large dimension
    metric: 'cosine',
    
    // Query defaults
    topK: 30,
    threshold: 0.70,
    
    // Chunk settings
    maxChunkSize: 1000,
    chunkOverlap: 200,
  },

  // Authorization
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: '7d',
    
    // Role hierarchy
    roles: {
      org: {
        owner: 100,
        admin: 50,
        member: 10,
      },
      team: {
        lead: 50,
        member: 10,
      },
    },
  },

  // Plan limits
  plans: {
    free: {
      maxVectors: 10000,
      maxTeams: 0,
      maxMembers: 1,
      maxFolders: 3,
      features: ['basic_search', 'personal_folders'],
    },
    pro: {
      maxVectors: 100000,
      maxTeams: 5,
      maxMembers: 10,
      maxFolders: 50,
      features: ['basic_search', 'team_sharing', 'advanced_filters', 'priority_support'],
    },
    enterprise: {
      maxVectors: -1, // unlimited
      maxTeams: -1,
      maxMembers: -1,
      maxFolders: -1,
      features: ['basic_search', 'team_sharing', 'advanced_filters', 'priority_support', 'sso', 'audit_logs', 'custom_integrations'],
    },
  },

  // Metadata schema for Pinecone vectors
  metadataSchema: {
    // Required fields
    org_id: 'string',            // Organization ID
    owner_user_id: 'string',     // User who owns/uploaded the document
    
    // Access control
    team_ids: 'array',           // List of team IDs with access
    visibility: 'string',        // "private" | "team" | "org"
    
    // Document identification
    folder_id: 'string',         // Watch folder ID
    doc_id: 'string',            // Document ID
    chunk_no: 'number',          // Chunk number within document
    
    // Content metadata
    mime: 'string',              // MIME type
    title: 'string',             // Document title
    path: 'string',              // File path
    text: 'string',              // Actual text content
    
    // Timestamps
    created_at: 'number',        // Unix timestamp
    updated_at: 'number',        // Unix timestamp
    
    // Deduplication & versioning
    hash: 'string',              // Content hash (SHA-256)
    status: 'string',            // "active" | "deleted" | "stale"
    
    // Optional fields
    lang: 'string',              // Language code
    source: 'string',            // "panlo-desktop" | "gdrive" | "onedrive" | "icloud"
    shared_policy_version: 'number', // For incremental ACL updates
    
    // Legacy support
    filename: 'string',          // Original filename
    filepath: 'string',          // Full file path
    fileType: 'string',          // File extension
    folderName: 'string',        // Folder name (legacy)
  },

  // API Configuration
  api: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  },

  // Sharing & ACL
  sharing: {
    // Update strategy for metadata propagation
    updateStrategy: 'background', // "immediate" | "background" | "hybrid"
    
    // Background job settings
    backgroundUpdate: {
      batchSize: 100,
      delayMs: 1000,
    },
    
    // Cache TTL for server-side allowlists (immediate enforcement)
    allowlistTTL: 300, // 5 minutes
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    auditEnabled: process.env.AUDIT_ENABLED === 'true',
  },
};

export default config;

// Helper functions for namespace generation
export const getOrgNamespace = (orgId) => config.pinecone.namespaces.org(orgId);
export const getUserNamespace = (userId) => config.pinecone.namespaces.user(userId);
export const getSpaceNamespace = (spaceId) => config.pinecone.namespaces.space(spaceId);

// Helper to validate org plan limits
export const checkPlanLimit = (plan, resource, currentCount) => {
  const planConfig = config.plans[plan];
  if (!planConfig) return false;
  
  const limit = planConfig[resource];
  if (limit === -1) return true; // unlimited
  
  return currentCount < limit;
};

// Helper to check if a feature is available in a plan
export const hasFeature = (plan, feature) => {
  const planConfig = config.plans[plan];
  if (!planConfig) return false;
  
  return planConfig.features.includes(feature);
};

