# Conversation Management API Reference

## Overview

The Conversation Management system enables users to:
- Create and manage chat conversations
- Store complete message history
- Track token usage and source citations
- Share conversations with teams, users, or entire organizations
- Organize conversations with tags and archival
- Link conversations to specific folders

All conversation endpoints require JWT authentication via the `Authorization: Bearer <token>` header.

---

## 🗂️ Data Models

### Conversation Object
```javascript
{
  conversationId: "conv_1730532342_abc123",
  orgId: "org_123",
  userId: "user_456",
  title: "Q4 Planning Discussion",
  description: "Discussion about Q4 revenue targets",
  folderIds: ["folder_789"],
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

### Message Object
```javascript
{
  messageId: "msg_1730532400_xyz789",
  conversationId: "conv_1730532342_abc123",
  role: "assistant", // "user" | "assistant" | "system"
  content: "Based on the documents...",
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

---

## 📡 API Endpoints

### 1. Create Conversation

**POST** `/api/orgs/:orgId/conversations`

Create a new conversation within an organization.

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
  "folderIds": ["folder_456"],
  "metadata": {}
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "conversation": {
    "conversationId": "conv_1730532342_abc123",
    "orgId": "org_123",
    "userId": "user_456",
    "title": "Q4 Planning",
    "description": "Discussion about Q4 strategy",
    "folderIds": ["folder_456"],
    "messageCount": 0,
    "createdAt": "2024-11-05T09:00:00Z"
  }
}
```

---

### 2. List Conversations

**GET** `/api/orgs/:orgId/conversations`

List all conversations accessible to the authenticated user (owned or shared).

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
GET /api/orgs/org_123/conversations?archived=false&limit=20&offset=0
```

**Response (200 OK):**
```json
{
  "success": true,
  "conversations": [
    {
      "conversationId": "conv_1730532342_abc123",
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

**GET** `/api/conversations/:conversationId`

Get detailed information about a specific conversation.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "conversation": {
    "conversationId": "conv_1730532342_abc123",
    "orgId": "org_123",
    "userId": "user_456",
    "title": "Q4 Planning",
    "description": "Discussion about Q4 strategy",
    "folderIds": ["folder_456"],
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

**PUT** `/api/conversations/:conversationId`

Update conversation details. Only the owner can update a conversation.

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
  "folderIds": ["folder_456", "folder_789"],
  "tags": ["planning", "finance", "q4"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation updated successfully"
}
```

**Errors:**
- `403 Forbidden`: Only owner can update conversation
- `404 Not Found`: Conversation not found

---

### 5. Delete Conversation

**DELETE** `/api/conversations/:conversationId`

Delete a conversation and all its messages. Only the owner can delete.

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
- `403 Forbidden`: Only owner can delete conversation
- `404 Not Found`: Conversation not found

---

### 6. Add Message to Conversation

**POST** `/api/conversations/:conversationId/messages`

Add a new message to a conversation.

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
    "conversationId": "conv_1730532342_abc123",
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

**GET** `/api/conversations/:conversationId/messages`

Retrieve all messages in a conversation.

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `limit` (optional): Number of messages (default: 100, max: 500)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```
GET /api/conversations/conv_123/messages?limit=50&offset=0
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

**POST** `/api/conversations/:conversationId/share`

Share a conversation with a user, team, or entire organization.

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
- `403 Forbidden`: Only owner can share conversation
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

**DELETE** `/api/conversations/:conversationId/share`

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
- `403 Forbidden`: Only owner can unshare conversation
- `404 Not Found`: Conversation not found

---

## 🔄 Complete Workflow Example

### 1. Create a new conversation
```bash
curl -X POST http://localhost:3000/api/orgs/org_123/conversations \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product Launch Planning",
    "folderIds": ["folder_marketing", "folder_product"]
  }'

# Returns: { success: true, conversation: { conversationId: "conv_abc123", ... } }
```

### 2. Add user message
```bash
curl -X POST http://localhost:3000/api/conversations/conv_abc123/messages \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "role": "user",
    "content": "What are our Q3 marketing metrics?"
  }'
```

### 3. Add AI assistant response
```bash
curl -X POST http://localhost:3000/api/conversations/conv_abc123/messages \
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
curl -X POST http://localhost:3000/api/conversations/conv_abc123/share \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "shareWith": "team_marketing",
    "shareType": "team",
    "permission": "read"
  }'
```

### 5. Retrieve conversation history
```bash
curl -X GET "http://localhost:3000/api/conversations/conv_abc123/messages?limit=100" \
  -H "Authorization: Bearer eyJ..."
```

### 6. Update conversation metadata
```bash
curl -X PUT http://localhost:3000/api/conversations/conv_abc123 \
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
- User automatically becomes owner when creating a conversation
- Conversations can be shared with:
  - Specific users (`shareType: "user"`)
  - Teams (`shareType: "team"`)
  - Entire organization (`shareType: "org"`)
- Only owner can:
  - Update conversation metadata
  - Delete conversation
  - Share/unshare conversation
- Shared users can view based on their permission level

### ACL Enforcement
- All endpoints verify user access via JWT
- Queries include LEFT JOINs to `conversation_shares` and `team_members`
- Access granted if:
  - User is owner (`user_id` matches)
  - User is in a team that conversation is shared with
  - Conversation is shared with entire org

---

## 📊 Use Cases

### 1. Personal Knowledge Base
- Create conversation per topic
- Link to relevant folders
- Build searchable Q&A history

### 2. Team Collaboration
- Share important conversations with team
- Collaborative research and analysis
- Reference shared conversations in discussions

### 3. Audit & Compliance
- Complete message history
- Source citation tracking
- Token usage monitoring

### 4. Knowledge Management
- Tag conversations by topic/project
- Archive completed projects
- Search and retrieve past insights

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
- Archive old conversations regularly
- Use consistent tagging scheme
- Link conversations to relevant folders

### 5. Performance
- Use pagination for large conversation lists
- Archive conversations not actively used
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
{ "error": "Only owner can update conversation" }
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
// Create conversation
async function createConversation(orgId, title, folderIds) {
  const response = await fetch(`/api/orgs/${orgId}/conversations`, {
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
async function addMessage(conversationId, role, content, metadata = {}) {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role, content, ...metadata })
  });
  return await response.json();
}

// Get conversation history
async function getMessages(conversationId, limit = 100) {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages?limit=${limit}`,
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
CREATE TABLE conversations (
    conversation_id VARCHAR(255) PRIMARY KEY,
    org_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    folder_ids JSON DEFAULT '[]',
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
    conversation_id VARCHAR(255) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    tokens INT DEFAULT 0,
    cited_sources JSON DEFAULT '[]',
    context_used JSON DEFAULT '[]',
    model VARCHAR(100),
    temperature DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON DEFAULT '{}'
);

-- Conversation shares table
CREATE TABLE conversation_shares (
    conversation_id VARCHAR(255) NOT NULL,
    shared_with_type ENUM('user', 'team', 'org') NOT NULL,
    shared_with_id VARCHAR(255) NOT NULL,
    permission ENUM('read', 'write') DEFAULT 'read',
    shared_by VARCHAR(255) NOT NULL,
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversation tags table
CREATE TABLE conversation_tags (
    conversation_id VARCHAR(255) NOT NULL,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

For questions or issues, refer to the main [Enterprise Documentation](README-ENTERPRISE.md).

