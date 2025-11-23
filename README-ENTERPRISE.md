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
- **spaces** - Collaborative workspaces for organizing documents
- **space_members** - User-space relationships with roles
- **space_files** - Document-space associations (many-to-many)
- **space_activity** - Activity log for spaces
- **documents** - Document metadata tracking

## 🔐 Authorization Model

### Query-Time Authorization with Spaces

Access control is managed server-side via space membership:

```javascript
// When user queries with spaces
1. Verify user has access to specified spaces (space_members table)
2. Get all doc_ids from space_files table for those spaces
3. Build Pinecone filter:
{
  "$and": [
    { "org_id": "<orgId>" },
    { "status": "active" },
    { "doc_id": { "$in": ["doc_1", "doc_2", ...] } }  // From spaces
  ]
}
```

### Spaces Collaboration Flow

1. **User signs up**
   - Creates user account with email/password or Google OAuth
   - Automatically creates personal organization (`{name}'s Organization`)
   - **Automatically creates default "Personal" space** for immediate file uploads
   - User is owner of both organization and personal space

2. **User creates additional spaces** (optional)
   - Creates space record with owner role
   - Personal or team space type
   - Automatic space_members entry for owner

3. **Add members to space**
   - Owner invites users with roles (owner/contributor/viewer)
   - Creates space_members records
   - Activity logged in space_activity

4. **Upload documents to space**
   - Documents uploaded directly to space (including default "Personal" space)
   - Creates document record and space_files association
   - Only contributors and owners can upload

5. **Query AI in space context**
   - User specifies which space(s) to query
   - Server validates space access
   - Filters to only documents in those spaces

### Role-Based Permissions

- **Owner**: Full control - manage members, files, settings, delete space
- **Contributor**: Add files, remove own files, query AI
- **Viewer**: View files, query AI (read-only)

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

### Organization Invitations

**Purpose:** Invite new users to join your organization via email with secure token-based links.

#### Create Invitation (Admin Only)
```http
POST /api/organizations/:orgId/invitations

{
  "email": "newuser@example.com",
  "role": "member",  // or "admin"
  "message": "Welcome to our team!"  // Optional
}

Response 201:
{
  "success": true,
  "invitation": {
    "invitationId": 123,
    "orgId": "org_abc123",
    "email": "newuser@example.com",
    "role": "member",
    "token": "a1b2c3d4e5f6...",
    "invitationLink": "https://app.panlo.com/accept-invitation/a1b2c3d4...",
    "expiresAt": "2025-11-17T12:00:00Z",
    "status": "pending"
  }
}
```

**What happens:**
- Secure 64-character token generated
- Email sent to invitee with invitation link
- Invitation expires after 7 days
- Activity logged for audit

**Errors:**
- `403` - Not admin/owner
- `409` - User already member or pending invitation exists
- `429` - Rate limit exceeded

#### Get Invitation Details (Public)
```http
GET /api/invitations/:token

Response 200:
{
  "success": true,
  "invitation": {
    "organizationId": "org_abc123",
    "organizationName": "Acme Corp",
    "inviterName": "John Doe",
    "email": "invitee@example.com",
    "role": "member",
    "message": "Welcome!",
    "expiresAt": "2025-11-17T12:00:00Z",
    "status": "pending"
  }
}
```

**No authentication required** - Used to display invitation details before user logs in.

#### Accept Invitation
```http
POST /api/invitations/:token/accept

Response 200:
{
  "success": true,
  "organizationId": "org_abc123",
  "organizationName": "Acme Corp",
  "role": "member",
  "message": "Successfully joined Acme Corp"
}
```

**Requirements:**
- User must be authenticated (JWT token required)
- User's email must match invitation email
- Invitation must be pending and not expired

**What happens:**
- User added to `org_members` table with specified role
- Invitation status updated to 'accepted'
- Activity logged for audit

#### Decline Invitation
```http
POST /api/invitations/:token/decline

Response 200:
{
  "success": true,
  "message": "Invitation declined"
}
```

**Authentication optional** - Can decline without logging in.

#### List Organization Invitations (Admin Only)
```http
GET /api/organizations/:orgId/invitations?status=pending&limit=50

Response 200:
{
  "success": true,
  "invitations": [
    {
      "invitationId": 123,
      "email": "user@example.com",
      "role": "member",
      "status": "pending",
      "inviterName": "John Doe",
      "createdAt": "2025-11-10T12:00:00Z",
      "expiresAt": "2025-11-17T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0
  }
}
```

**Query Parameters:**
- `status` - Filter by status (pending, accepted, declined, expired, revoked)
- `limit` - Max results (default 50, max 200)
- `offset` - Pagination offset

#### Revoke Invitation (Admin Only)
```http
DELETE /api/invitations/:invitationId

Response 200:
{
  "success": true,
  "message": "Invitation revoked"
}
```

**What happens:**
- Invitation status updated to 'revoked'
- Invitation link becomes invalid
- Activity logged with revoker ID

#### Get My Invitations
```http
GET /api/users/me/invitations

Response 200:
{
  "success": true,
  "invitations": [
    {
      "invitationId": 125,
      "token": "xyz789...",
      "organizationId": "org_xyz789",
      "organizationName": "Tech Startup Inc",
      "inviterName": "Jane Smith",
      "role": "member",
      "message": "Join our team!",
      "expiresAt": "2025-11-17T09:00:00Z"
    }
  ]
}
```

**Returns:** All pending invitations for authenticated user's email.

**Rate Limits:**
- 10 invitations per organization per hour
- 3 invitations per email per day
- 100 maximum pending invitations per organization

**Configuration Required:**
```bash
# In .env file
EMAIL_USER=noreply@panlo.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM="Panlo" <noreply@panlo.com>
APP_URL=https://app.panlo.com
```

**See also:** `ORG_INVITATIONS_API_DOCS.md` for complete API reference.

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

### Spaces

#### Get User's Spaces
```http
GET /api/orgs/:orgId/spaces
```

#### Create Space
```http
POST /api/orgs/:orgId/spaces

{
  "name": "Q3 Reports",
  "description": "Q3 financial reports and analysis",
  "space_type": "team"
}
```

#### Add Space Member
```http
POST /api/spaces/:spaceId/members

{
  "userId": "user_456",
  "role": "contributor"
}
```

#### Upload Document to Space
```http
POST /api/spaces/:spaceId/upload

{
  "filepath": "/documents/Q3/report.pdf",
  "filename": "Q3_Report.pdf",
  "chunks": [...],
  "metadata": {
    "mime": "application/pdf",
    "fileSize": 1024000
  }
}
```

#### Get Space Files
```http
GET /api/spaces/:spaceId/files
```

### Chat & Queries

#### Chat with AI
```http
POST /api/orgs/:orgId/chat

{
  "query": "What are the Q3 revenue numbers?",
  "answerMode": "precise",
  "spaceIds": ["space_finance"],
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
  "spaceIds": ["space_finance"],
  "topK": 10,
  "threshold": 0.7
}
```

### Documents

#### Upload Document to Space
```http
POST /api/spaces/:spaceId/upload

{
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
   - Build metadata filters for org-level scoping
   - Validate space access and membership
   - Check space management permissions

2. **chatbotClient-enterprise.js** - Vector queries & AI chat
   - Space-aware queries with doc_id filtering
   - AI response generation
   - Vector CRUD operations

3. **express-enterprise.js** - REST API endpoints
   - Organization/team/user management
   - Space operations (create, manage members, files)
   - Chat/query endpoints with space context

### Configuration

**config-enterprise.js** contains:
- Pinecone connection settings
- Database configuration
- OpenAI settings
- Plan limits & features
- Metadata schema definitions

## 📈 Scalability

### Storage Strategy

- **Single copy per org** - Documents stored once, accessible via space membership
- **No duplication** - Documents can belong to multiple spaces without duplication
- **Efficient namespaces** - One namespace per org, not per user
- **Space-based access** - Access control managed server-side via space_members table

### Query Performance

- **Single-namespace queries** - No cross-namespace fan-out
- **Server-side filtering** - Filter by doc_id based on space membership
- **Pinecone serverless** - Auto-scaling, pay-per-use
- **Simplified metadata** - Cleaner vector metadata without ACL fields

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

### Expected Query Format

When querying from client apps with Spaces:

```javascript
// Spaces format
{
  "spaceIds": ["space_finance", "space_strategy"],  // Query specific spaces
  "additionalFilters": {                             // Optional
    "mime": "application/pdf",
    "created_at": { "$gte": 1730000000 }
  }
}

// Alternative: Query specific files
{
  "fileIds": ["doc_123", "doc_456"]
}
```

### Client App Flow

1. **Authenticate** - Get JWT token
2. **Select org** - User chooses active organization
3. **Load spaces** - Fetch user's accessible spaces
4. **Select space** - User chooses which space(s) to query
5. **Query** - Send chat/query requests with space context
6. **Results** - Display AI responses with source citations

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

