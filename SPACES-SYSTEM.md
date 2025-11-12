# 🌌 Panlo Spaces System

## Overview

**Spaces** are collaborative workspaces that provide a flexible way to organize documents and work with teams. Each space is a contextual environment where users can gather files, collaborate with team members, and query AI within that specific context.

---

## 🎯 Core Concepts

### What is a Space?

A **Space** is a collaborative workspace that:
- Contains a curated collection of files/documents
- Has members with different permission levels
- Provides AI query context scoped to space files
- Can be personal or team-based
- Exists within an organization

### Space Types

1. **Personal Space**
   - Created automatically for each user on signup
   - Only the owner has access by default
   - Name: "{User Name}'s Personal Space"
   - Can share with others by adding members

2. **Team Space**
   - Created explicitly by users
   - Multiple members with different roles
   - Collaborative workspace for teams/projects

---

## 👥 Space Membership & Roles

### Role Hierarchy

```
Owner > Contributor > Viewer
```

### Role Permissions Matrix

| Permission              | Owner | Contributor | Viewer |
|------------------------|-------|-------------|--------|
| View space files       | ✓     | ✓           | ✓      |
| Add files to space     | ✓     | ✓           | ✗      |
| Remove own files       | ✓     | ✓           | ✗      |
| Remove any files       | ✓     | ✗           | ✗      |
| Add members            | ✓     | ✗           | ✗      |
| Remove members         | ✓     | ✗           | ✗      |
| Change member roles    | ✓     | ✗           | ✗      |
| Update space settings  | ✓     | ✗           | ✗      |
| Delete space           | ✓     | ✗           | ✗      |
| Query AI in space      | ✓     | ✓           | ✓      |

### Role Descriptions

**Owner**
- Full control over the space
- Can manage members, files, and settings
- Can delete the space
- Cannot be removed from space
- One owner per space (transferable)

**Contributor**
- Can add files to the space
- Can remove their own files
- Can query AI with space context
- Cannot manage members or settings

**Viewer**
- Read-only access to space files
- Can query AI with space context
- Cannot modify space content or membership

---

## 📁 Files in Spaces

### File-Space Relationship

- **Upload to Space**: Documents are uploaded directly to a space
- **Space Context**: Documents are created within a space context  
- **Many-to-Many**: A document can be added to multiple spaces after upload
- **Space Association**: Documents must belong to at least one space
- **Access Control**: Space membership determines document access

### Document Upload Flow

1. **Upload Document**: `POST /api/spaces/:spaceId/upload`
   - User uploads document directly to a space
   - Document is indexed with `space_ids: [spaceId]` in Pinecone metadata
   - Entry created in documents and space_files tables
   - Only Contributors and Owners can upload

2. **Add to Additional Spaces**: `POST /api/spaces/:spaceId/files`
   - Existing document can be added to other spaces
   - Updates Pinecone metadata: adds spaceId to `space_ids` array
   - Creates reference in space_files table
   - Same document accessible in multiple spaces

3. **Access Control via space_ids**:
   - Each vector stores `space_ids: ["space_1", "space_2", ...]` in Pinecone
   - Queries filter by: `{ space_ids: "space_finance" }`
   - Fast, scalable regardless of space size
   - No SQL join needed for queries

### File Management

**Uploading New Documents:**
- Contributors and Owners can upload files
- Upload directly to a space: `POST /api/spaces/:spaceId/upload`
- Document automatically added to the space
- Indexed and available immediately

**Adding Existing Documents:**
- Add documents that already exist to additional spaces
- Use: `POST /api/spaces/:spaceId/files` with `docIds` array
- Creates many-to-many relationship
- Same document accessible in multiple space contexts

**Removing Files from Space:**
- Contributors can remove files they added
- Owners can remove any file from the space
- Updates Pinecone metadata: removes spaceId from `space_ids` array
- Removing from space doesn't delete the document
- Document remains in other spaces and in the database
- Use: `DELETE /api/spaces/:spaceId/files/:docId`

**File Metadata in Space:**
- Track who added the file to space
- When it was added to space
- Optional notes specific to the space
- Tags within space context
- Maintained in `space_files` table

---

## 🔍 AI Queries in Space Context

### Query Scoping

When querying AI in a space context:
1. **Permission Check**: User must be a member of the space
2. **Vector Filtering**: Pinecone filters by `space_ids` metadata field
3. **Direct Filtering**: No SQL query needed - filters at vector level
4. **Context Window**: AI responses based only on space documents

**Technical Implementation:**
```javascript
// User queries "space_finance" with 1,000 files
// ✅ NEW: Simple, fast Pinecone filter
filter: {
  $and: [
    { org_id: "org_123" },
    { status: "active" },
    { space_ids: "space_finance" }  // Direct match in metadata!
  ]
}

// Query time: ~50ms regardless of space size
// No SQL query to get doc_ids!
```

### Query API Parameters

```json
{
  "query": "What are the key findings?",
  "spaceIds": ["space_finance"],  // Query specific space
  "additionalFilters": {
    "mime": "application/pdf"  // Optional: further filtering
  }
}
```

### Multi-Space Queries

Users can query across multiple spaces:
- Specify array of space IDs: `["space_finance", "space_strategy"]`
- Pinecone filter: `{ space_ids: { $in: [...] } }`
- Must have access to all specified spaces
- Results merged and ranked by relevance
- Still fast even with large spaces

---

## 🗄️ Database Schema

### Tables

**spaces**
```sql
- space_id (PK)
- org_id (FK)
- name
- description
- space_type (personal|team)
- visibility (private|shared)
- owner_user_id (FK)
- settings (JSON)
- created_at, updated_at
```

**space_members**
```sql
- space_id (PK, FK)
- user_id (PK, FK)
- role (owner|contributor|viewer)
- joined_at
- added_by (FK)
```

**space_files**
```sql
- space_id (PK, FK)
- doc_id (PK, FK)
- added_at
- added_by (FK)
- notes
- tags (JSON)
```

**space_activity**
```sql
- activity_id (PK)
- space_id (FK)
- user_id (FK)
- activity_type
- details (JSON)
- created_at
```

---

## 🔌 API Endpoints

### Space Management

#### Create Space
```
POST /api/orgs/:orgId/spaces
Body: { name, description, space_type }
Response: { space }
```

#### Get User's Spaces
```
GET /api/orgs/:orgId/spaces
Response: { spaces: [{ space_id, name, role, file_count, member_count }] }
```

#### Get Space Details
```
GET /api/spaces/:spaceId
Response: { space, members, file_count }
```

#### Update Space
```
PUT /api/spaces/:spaceId
Body: { name, description, visibility }
Auth: Owner only
```

#### Delete Space
```
DELETE /api/spaces/:spaceId
Auth: Owner only
```

#### Switch Active Space
```
PUT /api/users/me
Body: { currentSpaceId }
Response: { success, currentSpaceId, spaceName }
```

### Member Management

#### Add Member to Space
```
POST /api/spaces/:spaceId/members
Body: { userId, role }
Auth: Owner only
Response: { success }
```

#### Remove Member from Space
```
DELETE /api/spaces/:spaceId/members/:userId
Auth: Owner only
```

#### Update Member Role
```
PUT /api/spaces/:spaceId/members/:userId
Body: { role }
Auth: Owner only
```

#### Get Space Members
```
GET /api/spaces/:spaceId/members
Response: { members: [{ user_id, name, role, joined_at }] }
```

### File Management

#### Upload New Document to Space
```
POST /api/spaces/:spaceId/upload
Body: {
  filepath: string,
  filename: string,
  chunks: array,
  metadata: { mime, fileSize, hash, summary }
}
Auth: Owner or Contributor
Response: { success, docId, spaceId, vectorCount }
```

#### Add Existing Documents to Space
```
POST /api/spaces/:spaceId/files
Body: { docIds: ["doc_1", "doc_2"], notes: "optional", tags: [] }
Auth: Owner or Contributor
Response: { success, added_count }
```

#### Remove File from Space
```
DELETE /api/spaces/:spaceId/files/:docId
Auth: Owner or file adder
Response: { success }
Note: Doesn't delete document, only removes from space
```

#### Get Space Files
```
GET /api/spaces/:spaceId/files
Query: { limit, offset, sortBy, order }
Response: { files: [{ doc_id, filename, added_by, added_at, notes, tags }] }
```

### AI Query in Space Context

#### Query AI in Space
```
POST /api/spaces/:spaceId/query
Body: { 
  query,
  chatHistory,
  answerMode,
  chatId (optional)
}
Response: { response, citedSources, context }
```

#### Query Multiple Spaces
```
POST /api/orgs/:orgId/spaces/query
Body: { 
  query,
  spaceIds: ["space_1", "space_2"],
  chatHistory
}
Response: { response, citedSources, context }
```

---

## 🎨 UI/UX Design

### Left Panel - Spaces Navigation

```
┌─────────────────────┐
│ 🏢 Organization ▼   │
├─────────────────────┤
│ 🌌 Spaces          │
│                     │
│ 📍 Current Space    │
│ ┌─────────────────┐ │
│ │ My Personal     │ │
│ │ Space      ▼   │ │
│ └─────────────────┘ │
│                     │
│ 📁 Files (12)       │
│ ├─ report.pdf       │
│ ├─ data.xlsx        │
│ └─ notes.txt        │
│                     │
│ 👥 Members (3)      │
│                     │
│ ➕ Add Files        │
│                     │
├─────────────────────┤
│ 💬 Chats            │
│ 📊 Stats            │
└─────────────────────┘
```

### Space Switcher Dropdown

When clicking on current space name:

```
┌─────────────────────────┐
│ My Spaces               │
├─────────────────────────┤
│ ✓ My Personal Space     │
│   (12 files)            │
├─────────────────────────┤
│ 📊 Q4 Marketing        │
│   Owner · 24 files      │
├─────────────────────────┤
│ 🔬 Research Team       │
│   Contributor · 45 files│
├─────────────────────────┤
│ 📚 Documentation       │
│   Viewer · 8 files      │
├─────────────────────────┤
│ ➕ Create New Space    │
└─────────────────────────┘
```

### Space Context Bar

```
┌──────────────────────────────────────────┐
│ 🌌 Marketing Q4 │ 👥 5 members │ 📁 23 files │
│ Owner                                    │
└──────────────────────────────────────────┘
```

---

## 🔄 User Workflows

### Workflow: Create Personal Space (Auto)
```
1. User signs up / logs in
2. System checks if personal space exists
3. If not, creates: "{User Name}'s Personal Space"
   - space_type: 'personal'
   - owner: current user
4. Sets as user's current_space_id
5. User can immediately start adding files
```

### Workflow: Create Team Space
```
1. Click "➕ Create New Space" in space switcher
2. Modal appears:
   - Name: [text input]
   - Description: [textarea]
   - Type: Team Space (selected)
3. Click [Create]
4. Space created with user as owner
5. Automatically switches to new space
6. Prompt to add members (optional)
```

### Workflow: Add Files to Space
```
1. In space view, click "➕ Add Files"
2. Modal shows two tabs:
   Tab 1: Select Files
   - Shows all accessible files in org
   - Multi-select checkboxes
   - Search and filter by name, type, date
   
3. Click [Add to Space]
4. Files appear in space files list
5. Activity logged
```

### Workflow: Add Members to Space
```
1. Click "👥 Members" in space view
2. Click "➕ Add Member"
3. Modal appears:
   - Search for user by name/email
   - Select role: Contributor / Viewer
   - Optional welcome message
4. Click [Add]
5. Member added and notified
6. Member sees space in their space list
```

### Workflow: Remove Own File
```
1. In space files list, hover over file
2. If user added it, shows [×] remove button
3. Click [×] → Confirmation dialog
4. Click [Remove from Space]
5. File removed from space
6. File still exists in org documents
```

### Workflow: Query AI in Space
```
1. Ensure space is selected
2. Type query in chat panel
3. AI automatically scopes search to space files
4. Response generated from space context
5. Cited sources all from current space
6. Can optionally save as chat
```

### Workflow: Switch Space
```
1. Click on current space name in left panel
2. Dropdown shows all accessible spaces
3. Select different space
4. UI updates:
   - Files list shows new space files
   - Members shows new space members
   - Chat context reset
5. User continues in new space
```

---

## 🔐 Security & Access Control

### Space Access Rules

1. **Organization Boundary**
   - Spaces belong to an organization
   - Only org members can access org spaces
   - Cross-org spaces not allowed

2. **Membership Required**
   - Must be space member to access
   - Role determines permission level
   - No access = space invisible to user

3. **File Access**
   - Space membership grants access to space files
   - File permissions still apply (org-level)
   - Cannot add files user doesn't have access to

4. **Owner Transfer**
   - Only current owner can transfer ownership
   - New owner must be existing member
   - Old owner becomes contributor

### Access Checks

**Before any space operation:**
```javascript
1. Verify user is org member
2. Verify space belongs to org
3. Verify user is space member
4. Check user's role permits operation
5. If file operation, verify file access
```

---

## 📊 Analytics & Activity

### Space Metrics

- Total spaces in org
- Average files per space
- Average members per space
- Most active spaces
- Recently updated spaces

### Per-Space Analytics

- File count
- Member count
- Query count (last 30 days)
- Most queried files
- Active contributors
- Recent activity timeline

### Activity Feed

Track and display:
- Files added/removed
- Members added/removed
- Role changes
- Space updates
- Queries executed (optional)

---

## 🔄 Implementation Status

### Completed

**✅ Schema**
1. Created spaces tables (spaces, space_members, space_files, space_activity)
2. Added current_space_id to users table
3. Removed legacy folder tables

**✅ Database Updates**
1. Documents table updated (removed folder_id)
2. Chats table updated (folder_ids → space_ids)
3. Access control simplified (space_members table)

**✅ API Updates**
1. Space endpoints documented
2. Document upload changed to space-based
3. Query endpoints updated for space context
4. Folder endpoints removed

**✅ Service Updates**
1. authService updated with space functions
2. chatbotClient updated for space-aware queries
3. folderService removed
4. Config updated (maxFolders → maxSpaces)

### Pending

**⏳ Implementation**
1. Implement space CRUD endpoints
2. Implement space member management
3. Implement space file management
4. Create personal spaces on signup

**⏳ UI Updates**
1. Replace "Folders" with "Spaces" in left panel
2. Add space switcher component
3. Update file management UI
4. Update member management UI

---

## 🚀 Implementation Checklist

### Database
- [x] Create schema-spaces.sql
- [ ] Test schema in dev environment
- [ ] Create migration script
- [ ] Execute migration in staging
- [ ] Validate data integrity

### Backend API
- [ ] Implement space CRUD endpoints
- [ ] Implement member management endpoints
- [ ] Implement file management endpoints
- [ ] Update query endpoints for space context
- [ ] Add space access middleware
- [ ] Update user signup to create personal space

### Frontend UI
- [ ] Create Space component
- [ ] Create SpaceSwitcher component
- [ ] Update left panel navigation
- [ ] Create AddFilesToSpace modal
- [ ] Create SpaceMembers component
- [ ] Update query interface
- [ ] Add space context indicator

### Documentation
- [x] Create SPACES-SYSTEM.md
- [ ] Update API documentation
- [ ] Update user guide
- [ ] Create migration guide

### Testing
- [ ] Unit tests for space operations
- [ ] Integration tests for space access
- [ ] UI tests for space workflows
- [ ] Load testing for multi-space queries

---

## 💡 Future Enhancements

### Space Templates
- Pre-configured spaces for common use cases
- Template library (e.g., "Project Space", "Research Space")
- Quick setup with recommended structure

### Space Insights
- AI-powered space summaries
- Automatic tagging of files
- Suggested files to add
- Related spaces discovery

### Cross-Space Features
- Space collections/groups
- Space hierarchies (parent-child)
- Space linking and references
- Global search across all spaces

### Collaboration Features
- Space comments and discussions
- @mentions in space context
- Space notifications
- Activity digest emails

### Advanced Permissions
- Fine-grained file permissions
- Time-limited access
- Conditional access rules
- Approval workflows

---

## 📝 Notes

- **Schema Complete**: Database schema fully migrated to Spaces
- **Backend Updated**: All backend services updated for space-based access
- **API Documented**: All space endpoints documented, implementation pending
- **Performance**: Space-based queries use doc_id filtering (efficient)
- **UI/UX**: Frontend implementation needed to complete migration
- **Naming**: "Space" terminology finalized

