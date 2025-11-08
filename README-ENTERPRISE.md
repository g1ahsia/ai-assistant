# Panlo AI Assistant - Enterprise Edition

A multi-tenant, team-based document management and AI chat system built on Pinecone and OpenAI.

## 🏗️ Architecture Overview

### Core Principles

1. **Organization-based namespaces** - One Pinecone namespace per organization (`org_<orgId>`)
2. **Team-based access control** - All ACL enforced via metadata filters
3. **Single-namespace queries** - Fast, efficient queries without cross-namespace fan-out
4. **Metadata-driven permissions** - No vector duplication for shared content

### Namespace Strategy

```
org_<orgId>        # Enterprise/team organizations
user_<userId>      # Personal/free tier (legacy support)
space_<spaceId>    # Cross-org collaboration (optional)
```

## 📊 Data Model

### Vector Metadata Schema

```javascript
{
  id: "<docId>:<chunkNo>",
  values: [...],  // embedding vector
  metadata: {
    // Organization & ownership
    org_id: "org_123",
    owner_user_id: "user_456",
    
    // Access control
    team_ids: ["team_1", "team_3"],  // Teams with access
    visibility: "private|team|org",
    
    // Document identification
    folder_id: "folder_789",
    doc_id: "doc_abc",
    chunk_no: 0,
    
    // Content metadata
    mime: "application/pdf",
    title: "Q3 Report",
    path: "/documents/Q3/report.pdf",
    text: "actual content...",
    
    // Timestamps
    created_at: 1730532342,
    updated_at: 1730532342,
    
    // Deduplication & versioning
    hash: "sha256...",
    status: "active|deleted|stale",
    
    // Optional
    lang: "en",
    source: "panlo-desktop",
    shared_policy_version: 1
  }
}
```

### Database Schema

See `schema-enterprise.sql` for complete schema. Key tables:

- **orgs** - Organizations/companies
- **users** - User accounts
- **org_members** - User-org relationships
- **teams** - Logical groups within orgs
- **team_members** - User-team relationships
- **folders** - Watched folders with ACL
- **folder_acl** - Explicit folder-team permissions
- **documents** - Document metadata tracking

## 🔐 Authorization Model

### Query-Time Authorization

When a user queries, the system builds a metadata filter:

```javascript
{
  "$and": [
    { "status": "active" },
    {
      "$or": [
        { "owner_user_id": "<userId>" },           // User's own docs
        { "team_ids": { "$in": ["t1", "t5"] } },   // Team-shared docs
        { "visibility": "org" }                     // Org-wide docs
      ]
    }
  ]
}
```

### Sharing Flow

1. **User shares folder with teams**
   - Updates `folders.team_ids` in DB
   - Creates `folder_acl` records
   - Increments `policy_version`

2. **Background metadata propagation**
   - Asynchronously updates vector metadata
   - Sets `team_ids` on all vectors in folder
   - Updates `shared_policy_version`

3. **Immediate enforcement**
   - Server-side allowlist ensures instant access
   - Query filters validate at request time

### Team-Only Sharing Rule

- Users can only share folders with teams they're members of
- Validated in `authService.canShareFolder()`
- UI restricts team selection to user's teams

## 🚀 Quick Start

### 1. Setup Database

```bash
# Create MySQL database
mysql -u root -p

CREATE DATABASE panlo_enterprise;
USE panlo_enterprise;
SOURCE schema-enterprise.sql;
```

### 2. Configure Environment

```bash
cp .env.example .env.enterprise
```

Edit `.env.enterprise`:

```env
# Pinecone
PINECONE_API_KEY=your_key_here
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=panlo-prod-apne1

# OpenAI
OPENAI_API_KEY=your_key_here

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=panlo_user
DB_PASSWORD=secure_password
DB_NAME=panlo_enterprise

# Auth
JWT_SECRET=your_jwt_secret_here

# Server
PORT=3000
HOST=localhost
CORS_ORIGINS=http://localhost:3000,https://app.panlo.ai
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Server

```bash
node express-enterprise.js
```

## 📡 API Reference

### Authentication

All endpoints (except `/health`) require JWT authentication:

```
Authorization: Bearer <jwt_token>
```

### Organizations

#### Create Organization
```http
POST /api/orgs
Content-Type: application/json

{
  "name": "Acme Corp",
  "plan": "enterprise"
}
```

#### Get Organization
```http
GET /api/orgs/:orgId
```

#### Get Members
```http
GET /api/orgs/:orgId/members
```

#### Add Member
```http
POST /api/orgs/:orgId/members

{
  "userId": "user_123",
  "role": "member"
}
```

### Teams

#### Create Team
```http
POST /api/orgs/:orgId/teams

{
  "name": "Engineering",
  "description": "Engineering team"
}
```

#### Get Teams
```http
GET /api/orgs/:orgId/teams
```

#### Add Team Member
```http
POST /api/teams/:teamId/members

{
  "userId": "user_456",
  "role": "member"
}
```

### Folders

#### Get User's Folders
```http
GET /api/orgs/:orgId/folders
```

#### Create Folder
```http
POST /api/orgs/:orgId/folders

{
  "name": "Q3 Reports",
  "path": "/documents/Q3",
  "visibility": "private"
}
```

#### Share Folder
```http
POST /api/folders/:folderId/share

{
  "teamIds": ["team_1", "team_2"],
  "permission": "read"
}
```

#### Unshare Folder
```http
POST /api/folders/:folderId/unshare

{
  "teamIds": ["team_1"]
}
```

#### Get Sharing Status
```http
GET /api/folders/:folderId/sharing
```

### Chat & Queries

#### Chat with AI
```http
POST /api/orgs/:orgId/chat

{
  "query": "What are the Q3 revenue numbers?",
  "answerMode": "precise",
  "folderIds": ["folder_123"],
  "chatHistory": [
    {
      "user": "What about Q2?",
      "ai": "Q2 revenue was...",
      "citedSources": ["doc_abc:0"]
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "response": "Q3 revenue was $5.2M, up 15% from Q2...",
  "citedSources": ["doc_xyz:3", "doc_xyz:5"],
  "context": [
    {
      "id": "doc_xyz:3",
      "score": 0.89,
      "metadata": { ... }
    }
  ]
}
```

#### Query Documents
```http
POST /api/orgs/:orgId/query

{
  "query": "revenue report",
  "folderIds": ["folder_123"],
  "topK": 10,
  "threshold": 0.7
}
```

### Documents

#### Upload Document
```http
POST /api/orgs/:orgId/documents

{
  "folderId": "folder_123",
  "filepath": "/docs/report.pdf",
  "filename": "Q3_Report.pdf",
  "chunks": [
    { "text": "Q3 financial summary..." },
    { "text": "Revenue increased by 15%..." }
  ],
  "metadata": {
    "mime": "application/pdf",
    "fileType": "pdf"
  }
}
```

#### Get Vector Content
Fetch a specific vector/chunk content by vector ID. Returns the text content along with document metadata and chunk information.

```http
GET /api/orgs/:orgId/vectors/:vectorId

Response:
{
  "success": true,
  "vectorId": "doc_1762514637292_yqk40akg9:0",
  "content": {
    "text": "Assistant Teachers give selfless service...",
    "title": "AT Manual - Course Guidelines.docx",
    "filename": "AT Manual - Course Guidelines.docx",
    "filepath": "/Users/.../AT Manual - Course Guidelines.docx",
    "chunkNo": 0,
    "totalChunks": 7,
    "mimeType": "application/docx",
    "docId": "doc_1762514637292_yqk40akg9",
    "folderId": "folder_xxx",
    "createdAt": 1762514637292
  }
}
```

**Use Case**: Display vector content in a modal when user clicks inline source citations like `(Source: doc_xxx:0)`.

#### Get All Document Vectors
Fetch all vectors/chunks for a complete document. Useful for displaying the entire document content.

```http
GET /api/orgs/:orgId/documents/:docId/vectors

Response:
{
  "success": true,
  "docId": "doc_1762514637292_yqk40akg9",
  "totalChunks": 7,
  "vectors": [
    {
      "vectorId": "doc_1762514637292_yqk40akg9:0",
      "chunkNo": 0,
      "text": "AT Manual : Course Guidelines...",
      "title": "AT Manual - Course Guidelines.docx",
      "filename": "AT Manual - Course Guidelines.docx",
      "filepath": "/Users/.../AT Manual - Course Guidelines.docx"
    },
    {
      "vectorId": "doc_1762514637292_yqk40akg9:1",
      "chunkNo": 1,
      "text": "minutes silently and then begin...",
      "title": "AT Manual - Course Guidelines.docx",
      "filename": "AT Manual - Course Guidelines.docx",
      "filepath": "/Users/.../AT Manual - Course Guidelines.docx"
    }
    // ... more chunks sorted by chunkNo
  ]
}
```

**Use Case**: View complete document content or navigate between chunks in the UI.

## 🔧 Service Architecture

### Core Services

1. **authService.js** - Authorization & permission checking
   - Build metadata filters based on user/team membership
   - Validate folder access
   - Check sharing permissions

2. **chatbotClient-enterprise.js** - Vector queries & AI chat
   - Single-namespace queries with ACL filters
   - AI response generation
   - Vector CRUD operations

3. **folderService.js** - Folder sharing management
   - Share/unshare folders with teams
   - Background metadata propagation
   - ACL management

4. **express-enterprise.js** - REST API endpoints
   - Organization/team/user management
   - Folder operations
   - Chat/query endpoints

### Configuration

**config-enterprise.js** contains:
- Pinecone connection settings
- Database configuration
- OpenAI settings
- Plan limits & features
- Metadata schema definitions

## 📈 Scalability

### Storage Strategy

- **Single copy per org** - Documents stored once, shared via `team_ids`
- **No duplication** - One folder shared with 10 teams = single set of vectors
- **Efficient namespaces** - One namespace per org, not per user

### Query Performance

- **Single-namespace queries** - No cross-namespace fan-out
- **Metadata filtering** - Fast filtering on `team_ids` array
- **Pinecone serverless** - Auto-scaling, pay-per-use

### Cost Optimization

- **Deduplication** - Use `hash` field to avoid re-indexing unchanged content
- **Soft deletes** - Mark `status="deleted"` before removing vectors
- **Selective indexing** - Only index active, accessible documents

## 🛡️ Security

### Access Control

- **App-layer enforcement** - All ACL checked before queries
- **Team membership validation** - Users can only share with their teams
- **Immediate revocation** - Server-side allowlists for instant access removal

### Data Isolation

- **Namespace isolation** - Orgs can't access other orgs' namespaces
- **Metadata filters** - Double-check access at query time
- **Audit logs** - Track all sharing/access changes (optional table included)

## 🔄 Migration Notes

### From Personal to Enterprise

The architecture supports both models:

1. **Personal users** - Continue using `user_<userId>` namespaces
2. **Enterprise users** - Create org, use `org_<orgId>` namespaces
3. **No migration required** - Both can coexist

To migrate a user to enterprise:
1. Create organization
2. Copy vectors from `user_<userId>` to `org_<orgId>`
3. Update metadata with `org_id`, `owner_user_id`, etc.

## 📝 Client Integration

### Expected Filter Format

When querying from client apps:

```javascript
// Legacy format (still supported for backward compatibility)
{
  "watchFolderNames": ["test", "AWS"],
  "smartFolderNames": ["MySmartFolder"],
  "filePaths": ["/path/to/file.pdf"]
}

// Enterprise format (recommended)
{
  "folderIds": ["folder_123", "folder_456"],
  "additionalFilters": {
    "mime": "application/pdf",
    "created_at": { "$gte": 1730000000 }
  }
}
```

### Client App Flow

1. **Authenticate** - Get JWT token
2. **Select org** - User chooses active organization
3. **Load folders** - Fetch user's accessible folders
4. **Query** - Send chat/query requests with folder filters
5. **Results** - Display AI responses with source citations

## 🧪 Testing

```bash
# Run tests
npm test

# Test specific service
npm test -- authService.test.js
```

## 📚 Additional Resources

- **ENVIRONMENT_SWITCHING.md** - Environment configuration guide
- **PROMPT_IMPROVEMENTS.md** - AI prompt optimization notes
- **schema-enterprise.sql** - Complete database schema

## 🤝 Contributing

This is a clean enterprise implementation. Key principles:

1. **No user duplication** - Store once, share via metadata
2. **Fast queries** - Single namespace, metadata filtering
3. **Immediate enforcement** - ACL checked at request time
4. **Background consistency** - Metadata updates propagate async

## 📄 License

Proprietary - Panlo AI Assistant Enterprise Edition

---

**Questions?** Contact the development team or see the source code documentation.

