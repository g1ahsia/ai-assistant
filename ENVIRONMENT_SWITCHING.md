# Environment Switching Guide

This guide explains how to switch between development and production environments for the AI Assistant backend.

## 🏗️ Configuration System

The backend uses a centralized configuration system located in `config.js` that automatically switches between environments based on the `NODE_ENV` environment variable.

## 🌍 Environments

### Development Environment
- **Pinecone Index:** `allen-dev`
- **Server:** HTTP on localhost:3000
- **CORS:** Local development origins
- **SSL:** Disabled

### Production Environment
- **Pinecone Index:** `panlo-global`
- **Server:** HTTPS on api.pannamitta.com:3000
- **CORS:** Production domains
- **SSL:** Enabled with certificates

## 🚀 Quick Start

### Method 1: Using npm scripts (Recommended)

```bash
# Switch to development environment
npm run switch:dev

# Switch to production environment
npm run switch:prod

# Start server in development mode
npm run dev

# Start server in production mode
npm run prod

# Start server (uses current NODE_ENV)
npm start
```

### Method 2: Using the switch script directly

```bash
# Switch to development
node switch-env.js development

# Switch to production
node switch-env.js production
```

### Method 3: Manual environment variable

```bash
# Set environment variable and start
NODE_ENV=development node express.js
NODE_ENV=production node express.js
```

## 📊 Configuration Details

### Development Configuration
```javascript
{
  pinecone: {
    indexName: 'allen-dev',
    apiKey: 'your-api-key'
  },
  model: 'multilingual-e5-large',
  port: 3000,
  cors: {
    allowedOrigins: ['http://localhost:3000', 'http://localhost:3001']
  },
  ssl: {
    enabled: false
  }
}
```

### Production Configuration
```javascript
{
  pinecone: {
    indexName: 'panlo-global',
    apiKey: 'your-api-key'
  },
  model: 'multilingual-e5-large',
  port: 3000,
  cors: {
    allowedOrigins: ['https://g1ahsia.github.io', 'https://www.pannamitta.com']
  },
  ssl: {
    enabled: true,
    keyPath: '/etc/ssl/privkey1.pem',
    certPath: '/etc/ssl/fullchain1.pem'
  }
}
```

## 🔧 Files Updated

The following files now use the centralized configuration:

- `express.js` - Server configuration and startup
- `chatbotClient.js` - Pinecone and model configuration
- `config.js` - Centralized configuration (NEW)
- `switch-env.js` - Environment switching script (NEW)

## 🎯 Usage Examples

### Development Workflow
```bash
# 1. Switch to development
npm run switch:dev

# 2. Start development server
npm run dev

# 3. Server will show:
# 🚀 Development server running on http://localhost:3000
# 📊 Environment: development
# 🗄️  Pinecone Index: allen-dev
```

### Production Deployment
```bash
# 1. Switch to production
npm run switch:prod

# 2. Start production server
npm run prod

# 3. Server will show:
# 🚀 Production server running securely on https://api.pannamitta.com:3000
# 📊 Environment: production
# 🗄️  Pinecone Index: panlo-global
```

## 🔍 Verification

To verify the current environment configuration:

```bash
# Check current environment
echo $NODE_ENV

# View configuration details
node -e "console.log(require('./config.js'))"
```

## 🚨 Important Notes

1. **SSL Certificates:** Production mode requires SSL certificates at the specified paths
2. **CORS Origins:** Make sure your frontend domains are included in the allowed origins
3. **Pinecone Index:** Ensure the specified index exists in your Pinecone account
4. **Environment Variables:** The system defaults to 'development' if NODE_ENV is not set

## 🛠️ Troubleshooting

### SSL Certificate Errors
If you get SSL errors in production mode, ensure:
- SSL certificates exist at the specified paths
- Certificates are valid and not expired
- File permissions allow the server to read the certificates

### CORS Errors
If you get CORS errors, check:
- Your frontend domain is in the allowed origins list
- You're using the correct environment (dev vs prod)

### Pinecone Errors
If you get Pinecone errors, verify:
- The specified index exists
- Your API key is valid
- You're using the correct environment for the index you want to access 