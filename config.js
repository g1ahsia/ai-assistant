// Configuration for AI Assistant backend
// Switch between environments by setting NODE_ENV environment variable

const environments = {
  development: {
    pinecone: {
      indexName: 'allen-dev',
      apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
    },
    model: 'multilingual-e5-large',
    port: 3000,
    cors: {
      allowedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
    },
    ssl: {
      enabled: false
    }
  },
  production: {
    pinecone: {
      indexName: 'panlo-global',
      apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
    },
    model: 'multilingual-e5-large',
    port: 3000,
    cors: {
      allowedOrigins: ['https://g1ahsia.github.io', 'https://www.pannamitta.com', 'https://api.pannamitta.com']
    },
    ssl: {
      enabled: true,
      keyPath: '/etc/ssl/privkey1.pem',
      certPath: '/etc/ssl/fullchain1.pem'
    }
  }
};

// Get current environment (default to development if not set)
const currentEnv = process.env.NODE_ENV || 'development';
const config = environments[currentEnv];

// Validate that the environment exists
if (!config) {
  throw new Error(`Invalid environment: ${currentEnv}. Valid environments are: ${Object.keys(environments).join(', ')}`);
}

// Export the configuration
export default {
  // Current environment
  env: currentEnv,
  
  // Pinecone configuration
  pinecone: config.pinecone,
  
  // Model configuration
  model: config.model,
  
  // Server configuration
  port: config.port,
  
  // CORS configuration
  cors: config.cors,
  
  // SSL configuration
  ssl: config.ssl,
  
  // Helper function to check if we're in production
  isProduction: () => currentEnv === 'production',
  
  // Helper function to check if we're in development
  isDevelopment: () => currentEnv === 'development',
  
  // Helper function to get environment-specific value
  get: (key, defaultValue = null) => {
    const keys = key.split('.');
    let value = config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }
}; 