# Chat Management API Reference

## Overview

The Chat Management system enables users to:
- Create and manage chats
- Store complete message history
- Track token usage and source citations
- Share chats with teams, users, or entire organizations
- Organize chats with tags and archival
- Link chats to specific folders

All chat endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

---

## 💡 Why Store Folder & File IDs?

**The Problem:** Users want focused chats without repeatedly selecting which folders/files to search.

**The Solution:** Each chat can store its "query scope":
- **`folderIds`** - Watch folders or smart folders to include
- **`fileIds`** - Specific individual files to include

**How It Works:**

1. **User creates chat** and selects scope:
   ```
   "Marketing Q4" → Searches: Marketing folder + Budget file
   ```

2. **Every message automatically uses that scope:**
   - User: "What was our social media spend?"
   - System searches: Marketing folder + Budget file ✓
   - No need to re-select each time!

3. **Scope can be updated mid-chat:**
   - User adds "Finance" folder
   - Future messages now search: Marketing + Finance + Budget

4. **UI benefits:**
   - Shows active scope: "📁 Marketing 📄 Budget.xlsx"
   - Users know what's being searched
   - Can adjust scope anytime

5. **Optional, not enforced:**
   - Empty `[]` = search all accessible content
   - User can override per-message if needed
   - Just a convenience, not a restriction

**Real vs. Intended Sources:**
- `folderIds/fileIds` = what user *wants* to search (stored in chat)
- `cited_sources` = what AI *actually* used (stored per message)

Both are useful for different purposes!

---

## 🗂️ Data Models

### Conversation Object
```javascript
{
  chatId: "chat_1730532342_abc123",
  orgId: "org_123",
  userId: "user_456",
  title: "Q4 Planning Discussion",
  description: "Discussion about Q4 revenue targets",
  
  // Query Scope - what to search when user asks questions
  folderIds: ["folder_finance", "folder_strategy"],  // Watch/smart folders
  fileIds: ["doc_q3_report", "doc_budget_2024"],    // Specific files
  
  messageCount: 12,
  totalTokens: 4500,
  lastMessageAt: "2024-11-05T10:30:00Z",
  createdAt: "2024-11-05T09:00:00Z",
  archived: false,
  isOwner: true,
  permission: "owner", // or "read", "write"
  tags: ["planning", "finance"],
  metadata: {}
}
```

**Query Scope Explanation:**
- `folderIds` - Watch folders or smart folders to include in queries
- `fileIds` - Specific individual files to include in queries
- Both are optional; empty means "search all accessible content"
- When resuming a chat, the UI can pre-populate these selections
- User can still override per-message if needed

### Message Object
```javascript
{
  messageId: "msg_1730532400_xyz789",
  chatId: "chat_1730532342_abc123",
  role: "assistant", // "user" | "assistant" | "system"
  content: "Based on the documents...",
  
  // Who created this message (for collaborative chats)
  createdBy: "user_456",
  createdByName: "Alice Smith",
  createdByEmail: "alice@company.com",
  
  tokens: 150,
  citedSources: [
    {
      vectorId: "vec_123",
      filePath: "/docs/Q3_report.pdf",
      pageNumber: 5
    }
  ],
  contextUsed: [
    {
      vectorId: "vec_123",
      score: 0.89,
      text: "Q3 revenue was..."
    }
  ],
  model: "gpt-4",
  temperature: 0.7,
  createdAt: "2024-11-05T09:05:00Z",
  metadata: {}
}
```

**Note on `createdBy`:** 
- Automatically set to the authenticated user who adds the message
- Essential for collaborative chats to show who asked each question
- Includes user name and email for easy identification in the UI

---

## 📡 API Endpoints

### 1. Create Conversation

**POST** `/api/orgs/:orgId/chats`

Create a new chat within an organization.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Q4 Planning",
  "description": "Discussion about Q4 strategy",
  "folderIds": ["folder_finance", "folder_strategy"],
  "fileIds": ["doc_q3_report"],
  "metadata": {}
}
```

**Field Details:**
- `title` (optional): Conversation title (default: "New Conversation")
- `description` (optional): Description of chat purpose
- `folderIds` (optional): Array of watch/smart folder IDs to query (default: `[]`)
- `fileIds` (optional): Array of specific file IDs to query (default: `[]`)
- `metadata` (optional): Additional metadata (default: `{}`)

**Response (201 Created):**
```json
{
  "success": true,
  "chat": {
    "chatId": "chat_1730532342_abc123",
    "orgId": "org_123",
    "userId": "user_456",
    "title": "Q4 Planning",
    "description": "Discussion about Q4 strategy",
    "folderIds": ["folder_finance", "folder_strategy"],
    "fileIds": ["doc_q3_report"],
    "messageCount": 0,
    "createdAt": "2024-11-05T09:00:00Z"
  }
}
```

---

### 2. List Conversations

**GET** `/api/orgs/:orgId/chats`

List all chats accessible to the authenticated user (owned or shared).

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `archived` (optional): `"true"` or `"false"` (default: `"false"`)
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```
GET /api/orgs/org_123/chats?archived=false&limit=20&offset=0
```

**Response (200 OK):**
```json
{
  "success": true,
  "chats": [
    {
      "chatId": "chat_1730532342_abc123",
      "title": "Q4 Planning",
      "description": "Discussion about Q4 strategy",
      "messageCount": 12,
      "totalTokens": 4500,
      "lastMessageAt": "2024-11-05T10:30:00Z",
      "createdAt": "2024-11-05T09:00:00Z",
      "archived": false,
      "isOwner": true
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### 3. Get Conversation Details

**GET** `/api/chats/:chatId`

Get detailed information about a specific chat.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "chat": {
    "chatId": "chat_1730532342_abc123",
    "orgId": "org_123",
    "userId": "user_456",
    "title": "Q4 Planning",
    "description": "Discussion about Q4 strategy",
    "folderIds": ["folder_finance", "folder_strategy"],
    "fileIds": ["doc_q3_report"],
    "messageCount": 12,
    "totalTokens": 4500,
    "lastMessageAt": "2024-11-05T10:30:00Z",
    "createdAt": "2024-11-05T09:00:00Z",
    "archived": false,
    "isOwner": true,
    "permission": "owner",
    "tags": ["planning", "finance"],
    "metadata": {}
  }
}
```

**Errors:**
- `404 Not Found`: Conversation not found or access denied

---

### 4. Update Conversation

**PUT** `/api/chats/:chatId`

Update chat details. Only the owner can update a chat.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body (all fields optional):**
```json
{
  "title": "Q4 Planning (Updated)",
  "description": "Updated discussion",
  "archived": false,
  "folderIds": ["folder_finance", "folder_strategy", "folder_leadership"],
  "fileIds": ["doc_q3_report", "doc_budget_2024", "doc_forecast"],
  "tags": ["planning", "finance", "q4"]
}
```

**Note:** You can update `folderIds` and `fileIds` to change the query scope for future messages in this chat.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation updated successfully"
}
```

**Errors:**
- `403 Forbidden`: Only owner can update chat
- `404 Not Found`: Conversation not found

---

### 5. Delete Conversation

**DELETE** `/api/chats/:chatId`

Delete a chat and all its messages. Only the owner can delete.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation deleted successfully"
}
```

**Errors:**
- `403 Forbidden`: Only owner can delete chat
- `404 Not Found`: Conversation not found

---

### 6. Add Message to Conversation

**POST** `/api/chats/:chatId/messages`

Add a new message to a chat.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "role": "user",
  "content": "What were our Q3 results?",
  "tokens": 8,
  "citedSources": [],
  "contextUsed": [],
  "model": "gpt-4",
  "temperature": 0.7,
  "metadata": {}
}
```

**Field Details:**
- `role` (required): `"user"`, `"assistant"`, or `"system"`
- `content` (required): Message text
- `tokens` (optional): Token count for this message
- `citedSources` (optional): Array of source references
- `contextUsed` (optional): Array of vector matches used
- `model` (optional): AI model used (e.g., "gpt-4")
- `temperature` (optional): Temperature setting
- `metadata` (optional): Additional metadata

**Response (201 Created):**
```json
{
  "success": true,
  "message": {
    "messageId": "msg_1730532400_xyz789",
    "chatId": "chat_1730532342_abc123",
    "role": "user",
    "content": "What were our Q3 results?",
    "tokens": 8,
    "citedSources": [],
    "createdAt": "2024-11-05T09:05:00Z"
  }
}
```

**Errors:**
- `400 Bad Request`: Missing required fields or invalid role
- `404 Not Found`: Conversation not found or access denied

---

### 7. Get Conversation Messages

**GET** `/api/chats/:chatId/messages`

Retrieve all messages in a chat.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `limit` (optional): Number of messages (default: 100, max: 500)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```
GET /api/chats/chat_123/messages?limit=50&offset=0
```

**Response (200 OK):**
```json
{
  "success": true,
  "messages": [
    {
      "messageId": "msg_1730532400_xyz789",
      "role": "user",
      "content": "What were our Q3 results?",
      "tokens": 8,
      "citedSources": [],
      "contextUsed": [],
      "model": null,
      "temperature": null,
      "createdAt": "2024-11-05T09:05:00Z",
      "metadata": {}
    },
    {
      "messageId": "msg_1730532450_abc456",
      "role": "assistant",
      "content": "Based on the Q3 report...",
      "tokens": 150,
      "citedSources": [
        {
          "vectorId": "vec_789",
          "filePath": "/docs/Q3.pdf"
        }
      ],
      "contextUsed": [
        {
          "vectorId": "vec_789",
          "score": 0.92,
          "text": "Q3 revenue was $5.2M..."
        }
      ],
      "model": "gpt-4",
      "temperature": 0.7,
      "createdAt": "2024-11-05T09:05:30Z",
      "metadata": {}
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

**Errors:**
- `404 Not Found`: Conversation not found or access denied

---

### 8. Share Conversation

**POST** `/api/chats/:chatId/share`

Share a chat with a user, team, or entire organization.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "shareWith": "team_789",
  "shareType": "team",
  "permission": "read"
}
```

**Field Details:**
- `shareWith` (required): ID of user, team, or org
- `shareType` (required): `"user"`, `"team"`, or `"org"`
- `permission` (optional): `"read"` or `"write"` (default: `"read"`)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation shared successfully"
}
```

**Errors:**
- `400 Bad Request`: Invalid shareType
- `403 Forbidden`: Only owner can share chat
- `404 Not Found`: Conversation not found

**Examples:**

Share with a team:
```json
{
  "shareWith": "team_789",
  "shareType": "team",
  "permission": "read"
}
```

Share with a specific user:
```json
{
  "shareWith": "user_123",
  "shareType": "user",
  "permission": "write"
}
```

Share with entire organization:
```json
{
  "shareWith": "org_456",
  "shareType": "org",
  "permission": "read"
}
```

---

### 9. Unshare Conversation

**DELETE** `/api/chats/:chatId/share`

Remove sharing access from a user, team, or organization.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "shareWith": "team_789",
  "shareType": "team"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation unshared successfully"
}
```

**Errors:**
- `403 Forbidden`: Only owner can unshare chat
- `404 Not Found`: Conversation not found

---

## 🔄 Complete Workflow Example

### 1. Create a new chat with query scope
```bash
curl -X POST http://localhost:3000/api/orgs/org_123/chats \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product Launch Planning",
    "description": "Plan launch based on marketing docs and budget",
    "folderIds": ["folder_marketing", "folder_product"],
    "fileIds": ["doc_budget_2024", "doc_launch_strategy"]
  }'

# Returns: { success: true, chat: { chatId: "chat_abc123", ... } }
# Now all queries in this chat will search these folders/files by default
```

### 2. Add user message
```bash
curl -X POST http://localhost:3000/api/chats/chat_abc123/messages \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "content": "What are our Q3 marketing metrics?"
  }'
```

### 3. Add AI assistant response
```bash
curl -X POST http://localhost:3000/api/chats/chat_abc123/messages \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "role": "assistant",
    "content": "Based on the Q3 marketing report...",
    "tokens": 180,
    "citedSources": [
      {"vectorId": "vec_456", "filePath": "/marketing/Q3_report.pdf"}
    ],
    "model": "gpt-4",
    "temperature": 0.7
  }'
```

### 4. Share with team
```bash
curl -X POST http://localhost:3000/api/chats/chat_abc123/share \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "shareWith": "team_marketing",
    "shareType": "team",
    "permission": "read"
  }'
```

### 5. Retrieve chat history
```bash
curl -X GET "http://localhost:3000/api/chats/chat_abc123/messages?limit=100" \
  -H "Authorization: Bearer eyJ..."
```

### 6. Update chat metadata
```bash
curl -X PUT http://localhost:3000/api/chats/chat_abc123 \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["marketing", "q3", "metrics"],
    "archived": false
  }'
```

---

## 🔐 Access Control

### Permission Levels
1. **Owner**: Full control (CRUD, share, unshare)
2. **Write**: Can add messages
3. **Read**: View only

### Access Rules
- User automatically becomes owner when creating a chat
- Conversations can be shared with:
  - Specific users (`shareType: "user"`)
  - Teams (`shareType: "team"`)
  - Entire organization (`shareType: "org"`)
- Only owner can:
  - Update chat metadata
  - Delete chat
  - Share/unshare chat
- Shared users can view based on their permission level

### ACL Enforcement
- All endpoints verify user access via JWT
- Queries include LEFT JOINs to `chat_shares` and `team_members`
- Access granted if:
  - User is owner (`user_id` matches)
  - User is in a team that chat is shared with
  - Conversation is shared with entire org

---

## 🤝 Collaborative Conversations

With the `write` permission and `createdBy` tracking, multiple users can collaborate in the same chat:

### How It Works

**Step 1: Alice creates & shares**
```bash
# Alice creates chat
POST /api/orgs/org_123/chats
{
  "title": "Q4 Marketing Analysis",
  "folderIds": ["folder_marketing"]
}

# Alice shares with Bob (write permission)
POST /api/chats/chat_abc/share
{
  "shareWith": "user_bob",
  "shareType": "user", 
  "permission": "write"
}
```

**Step 2: Both add messages**
```javascript
// Alice asks:
POST /api/chats/chat_abc/messages
{
  "role": "user",
  "content": "What was our Instagram ROI?"
}
// → created_by: "user_alice"

// AI responds:
POST /api/chats/chat_abc/messages
{
  "role": "assistant",
  "content": "Instagram ROI was 3.2x..."
}
// → created_by: "user_alice" (same user who asked)

// Bob asks:
POST /api/chats/chat_abc/messages  
{
  "role": "user",
  "content": "What about Facebook?"
}
// → created_by: "user_bob"

// AI responds:
POST /api/chats/chat_abc/messages
{
  "role": "assistant",  
  "content": "Facebook ROI was 2.1x..."
}
// → created_by: "user_bob" (same user who asked)
```

**Step 3: View thread**
```javascript
GET /api/chats/chat_abc/messages

Response:
{
  "messages": [
    {
      "role": "user",
      "content": "What was our Instagram ROI?",
      "createdBy": "user_alice",
      "createdByName": "Alice Smith",
      "createdAt": "2024-11-05T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Instagram ROI was 3.2x...",
      "createdBy": "user_alice",  // AI response to Alice's question
      "createdAt": "2024-11-05T10:00:05Z"
    },
    {
      "role": "user",
      "content": "What about Facebook?",
      "createdBy": "user_bob",
      "createdByName": "Bob Johnson",
      "createdAt": "2024-11-05T10:02:00Z"
    },
    {
      "role": "assistant",
      "content": "Facebook ROI was 2.1x...",
      "createdBy": "user_bob",  // AI response to Bob's question
      "createdAt": "2024-11-05T10:02:05Z"
    }
  ]
}
```

### UI Display Example
```
🗨️ Q4 Marketing Analysis
   📁 Marketing (query scope)

   Alice Smith • 10:00 AM
   What was our Instagram ROI?
   
   🤖 Assistant • 10:00 AM
   Instagram ROI was 3.2x...
   
   Bob Johnson • 10:02 AM
   What about Facebook?
   
   🤖 Assistant • 10:02 AM
   Facebook ROI was 2.1x...
```

### Benefits
✅ **Clear attribution** - See who asked each question  
✅ **Shared context** - Both users see full chat  
✅ **Collaborative research** - Multiple perspectives in one thread  
✅ **Audit trail** - Track who contributed what  

### When to Use Write vs Read

**Write Permission** (collaborative):
- Team brainstorming sessions
- Multiple analysts researching same topic
- Manager and team member co-investigating
- Both need to ask follow-up questions
- **Can update query scope** (folderIds/fileIds) mid-chat

**Read Permission** (reference):
- "FYI, here's what I learned"
- Historical reference / knowledge base
- Compliance audit records
- One-way information sharing

---

## 👥 Conversation-Level Collaboration

Beyond messages, the **chat object itself** supports collaboration:

### What Can Write Users Do?

**Owner (Alice)**:
- ✅ Update title, description
- ✅ Archive chat
- ✅ Update query scope (folderIds, fileIds)
- ✅ Add/edit tags
- ✅ Share/unshare chat
- ✅ Delete chat
- ✅ Add messages

**Write User (Bob)**:
- ✅ **Update query scope** (folderIds, fileIds)
- ✅ Add messages
- ❌ Cannot update title/description
- ❌ Cannot archive
- ❌ Cannot update tags
- ❌ Cannot share with others
- ❌ Cannot delete

**Read User (Carol)**:
- ✅ View chat and messages
- ❌ Cannot modify anything

### Participant Tracking

The system automatically tracks who's actively participating:

**Example Response** from `GET /api/chats/chat_123`:
```json
{
  "chat": {
    "chatId": "chat_123",
    "title": "Q4 Marketing Analysis",
    "userId": "user_alice",  // Owner
    "folderIds": ["folder_marketing", "folder_sales"],
    "participants": [
      {
        "userId": "user_alice",
        "name": "Alice Smith",
        "email": "alice@company.com",
        "messageCount": 8,
        "firstMessageAt": "2024-11-05T10:00:00Z",
        "lastMessageAt": "2024-11-05T10:45:00Z"
      },
      {
        "userId": "user_bob",
        "name": "Bob Johnson",
        "email": "bob@company.com",
        "messageCount": 5,
        "firstMessageAt": "2024-11-05T10:15:00Z",
        "lastMessageAt": "2024-11-05T10:50:00Z"
      }
    ]
  }
}
```

### Collaborative Scope Updates

**Scenario:** Bob realizes they need more data sources

```bash
# Bob (with write permission) updates query scope
PUT /api/chats/chat_123
{
  "folderIds": ["folder_marketing", "folder_sales", "folder_finance"],
  "fileIds": ["doc_budget", "doc_forecast"]
}

# ✅ Success! Now all future messages search these folders/files
```

**UI Display:**
```
🗨️ Q4 Marketing Analysis
   Owner: Alice Smith
   👥 Active: Alice (8 messages), Bob (5 messages)
   
   📁 Searching: Marketing, Sales, Finance
   📄 Files: budget.xlsx, forecast.pdf
   
   [Bob just added Finance folder]  ← Activity indicator
```

### Activity Log (Optional Enhancement)

You could track scope changes:
```json
{
  "activityLog": [
    {
      "action": "created",
      "userId": "user_alice",
      "timestamp": "2024-11-05T10:00:00Z"
    },
    {
      "action": "shared_with_write",
      "userId": "user_alice",
      "sharedWith": "user_bob",
      "timestamp": "2024-11-05T10:05:00Z"
    },
    {
      "action": "updated_scope",
      "userId": "user_bob",
      "changes": {
        "added_folders": ["folder_finance"],
        "added_files": ["doc_budget", "doc_forecast"]
      },
      "timestamp": "2024-11-05T10:30:00Z"
    }
  ]
}
```

---

## 📊 Use Cases

### 1. Scoped Conversations with Query Context
**Problem:** Users want to have focused chats about specific topics without manually selecting folders/files every time.

**Solution:** Set `folderIds` and `fileIds` when creating a chat:
```javascript
{
  title: "Q4 Financial Review",
  folderIds: ["folder_finance", "folder_reports"],
  fileIds: ["doc_q3_summary", "doc_budget_forecast"]
}
```

**Benefits:**
- UI can auto-scope queries to these folders/files
- User doesn't repeat selections for each message
- Conversation "remembers" its context
- Can be updated mid-chat if scope changes

**Example UX Flow:**
1. User creates chat: "Q4 Financial Review"
2. Selects Finance folder + Q3 report file
3. Every message automatically searches those sources
4. UI shows active scope: "📁 Finance, 📄 Q3 Report"
5. User can add/remove folders during chat

### 2. Personal Knowledge Base
- Create chat per topic
- Link to relevant folders/files
- Build searchable Q&A history
- Each chat has its own context

### 3. Team Collaboration
- Share important chats with team
- Include the folder/file scope
- Team members can see what was searched
- Reference shared chats in discussions

### 4. Audit & Compliance
- Complete message history
- Source citation tracking (actual vectors used)
- Token usage monitoring
- Query scope tracking (intended folders/files)

### 5. Knowledge Management
- Tag chats by topic/project
- Archive completed projects
- Search and retrieve past insights
- Filter chats by folder scope

---

## 🎯 Best Practices

### 1. Conversation Naming
- Use descriptive titles (e.g., "Q3 Marketing Analysis" vs "Chat 1")
- Add descriptions for context
- Use tags for categorization

### 2. Message Management
- Always include `tokens` for accurate tracking
- Add `citedSources` for assistant responses
- Use `contextUsed` to track vector matches

### 3. Sharing Strategy
- Share with teams rather than individual users when possible
- Use `read` permission by default
- Grant `write` only when collaboration is needed

### 4. Organization
- Archive old chats regularly
- Use consistent tagging scheme
- Link chats to relevant folders

### 5. Performance
- Use pagination for large chat lists
- Archive chats not actively used
- Limit message history requests to necessary range

---

## 🐛 Error Handling

### Common Errors

**401 Unauthorized**
```json
{ "error": "Invalid or expired token" }
```
→ Token expired or invalid, user needs to re-authenticate

**403 Forbidden**
```json
{ "error": "Only owner can update chat" }
```
→ User doesn't have permission for this action

**404 Not Found**
```json
{ "error": "Conversation not found or access denied" }
```
→ Conversation doesn't exist or user doesn't have access

**400 Bad Request**
```json
{ "error": "Role and content are required" }
```
→ Missing required fields in request

---

## 🚀 Integration Tips

### Frontend Integration
```javascript
// Create chat
async function createConversation(orgId, title, folderIds) {
  const response = await fetch(`/api/orgs/${orgId}/chats`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, folderIds })
  });
  return await response.json();
}

// Add message
async function addMessage(chatId, role, content, metadata = {}) {
  const response = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role, content, ...metadata })
  });
  return await response.json();
}

// Get chat history
async function getMessages(chatId, limit = 100) {
  const response = await fetch(
    `/api/chats/${chatId}/messages?limit=${limit}`,
    {
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    }
  );
  return await response.json();
}
```

---

## 📝 Database Schema Reference

```sql
-- Conversations table
CREATE TABLE chats (
    chat_id VARCHAR(255) PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    folder_ids JSON DEFAULT '[]',  -- Watch/smart folders to query
    file_ids JSON DEFAULT '[]',     -- Specific files to query
    message_count INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    metadata JSON DEFAULT '{}'
);

-- Messages table
CREATE TABLE messages (
    message_id VARCHAR(255) PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    created_by VARCHAR(255),  -- User who created this message (for collaboration)
    tokens INT DEFAULT 0,
    cited_sources JSON DEFAULT '[]',
    context_used JSON DEFAULT '[]',
    model VARCHAR(100),
    temperature DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON DEFAULT '{}'
);

-- Conversation shares table
CREATE TABLE chat_shares (
    chat_id VARCHAR(255) NOT NULL,
    shared_with_type ENUM('user', 'team', 'org') NOT NULL,
    shared_with_id VARCHAR(255) NOT NULL,
    permission ENUM('read', 'write') DEFAULT 'read',
    shared_by VARCHAR(255) NOT NULL,
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversation tags table
CREATE TABLE chat_tags (
    chat_id VARCHAR(255) NOT NULL,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

For questions or issues, refer to the main [Enterprise Documentation](README-ENTERPRISE.md).

