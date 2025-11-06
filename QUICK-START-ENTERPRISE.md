# Quick Start - Enterprise Edition

## 🚀 Get Running in 15 Minutes

### Prerequisites
- Node.js 18+
- MySQL 8+
- Pinecone account (serverless index)
- OpenAI API key

### 1. Database Setup (5 min)

```bash
# Create database
mysql -u root -p

# In MySQL shell:
CREATE DATABASE panlo_enterprise;
CREATE USER 'panlo_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON panlo_enterprise.* TO 'panlo_user'@'localhost';
FLUSH PRIVILEGES;
USE panlo_enterprise;
SOURCE schema-enterprise.sql;
EXIT;
```

### 2. Environment Configuration (3 min)

```bash
# Copy template
cp ENTERPRISE-ENV-TEMPLATE.txt .env.enterprise

# Edit with your values:
# - PINECONE_API_KEY
# - OPENAI_API_KEY
# - DB_PASSWORD
# - JWT_SECRET (generate: openssl rand -base64 32)
```

### 3. Install & Start (2 min)

```bash
npm install
node express-enterprise.js
```

Server starts at `http://localhost:3000`

### 4. Test API (5 min)

#### Create Organization
```bash
TOKEN="your_jwt_token"

curl -X POST http://localhost:3000/api/orgs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Org", "plan": "enterprise"}'

# Response: {"success": true, "org": {"orgId": "org_...", ...}}
```

#### Create Team
```bash
ORG_ID="org_..."  # From previous response

curl -X POST http://localhost:3000/api/orgs/$ORG_ID/teams \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Engineering"}'

# Response: {"success": true, "team": {"teamId": "team_...", ...}}
```

#### Create Folder
```bash
curl -X POST http://localhost:3000/api/orgs/$ORG_ID/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Documents", "path": "/docs", "visibility": "private"}'

# Response: {"success": true, "folder": {"folderId": "folder_...", ...}}
```

#### Share Folder with Team
```bash
FOLDER_ID="folder_..."  # From previous response
TEAM_ID="team_..."      # From team creation

curl -X POST http://localhost:3000/api/folders/$FOLDER_ID/share \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"teamIds": ["'$TEAM_ID'"], "permission": "read"}'

# Response: {"success": true, "message": "Folder shared successfully"}
```

#### Query Documents
```bash
curl -X POST http://localhost:3000/api/orgs/$ORG_ID/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What documents do we have?",
    "answerMode": "precise"
  }'

# Response: {"success": true, "response": "...", "citedSources": [...]}
```

## 📁 File Structure

```
ai-assistant/
├── config-enterprise.js           # Configuration
├── authService.js                 # Authorization & ACL
├── chatbotClient-enterprise.js    # Vector queries & AI
├── folderService.js               # Folder sharing
├── express-enterprise.js          # API server
├── schema-enterprise.sql          # Database schema
├── README-ENTERPRISE.md           # Full documentation
├── MIGRATION-ENTERPRISE.md        # Migration guide
├── ENTERPRISE-SUMMARY.md          # Architecture summary
└── ENTERPRISE-ENV-TEMPLATE.txt    # Config template
```

## 🔑 Key Concepts

### Namespace
- One Pinecone namespace per organization: `org_<orgId>`
- All org's documents live in single namespace
- Fast, efficient queries

### Teams
- Logical groups within organization
- Users belong to multiple teams
- Folders shared with teams, not individual users

### Access Control
- **Owner** - User who uploaded/created document
- **Team** - Shared with specific teams (via `team_ids`)
- **Org** - Visible to all org members

### Metadata-Driven ACL
- Access enforced via Pinecone metadata filters
- `team_ids` array in vector metadata
- Single query returns only accessible documents

## 🎯 Common Workflows

### 1. Onboard New Organization
```javascript
POST /api/orgs
  → Create org
  → Creates org namespace in Pinecone
  → Owner automatically added as org member
```

### 2. Add Team Member
```javascript
POST /api/teams/:teamId/members
  → Add user to team
  → User immediately sees team-shared folders
  → Queries automatically include team content
```

### 3. Share Folder
```javascript
POST /api/folders/:folderId/share
  → Update folder.team_ids in DB
  → Create folder_acl records
  → Background: update vector metadata
  → Team members instantly see folder
```

### 4. Query with ACL
```javascript
POST /api/orgs/:orgId/chat
  → Get user's teams
  → Build metadata filter (owner OR teams OR org)
  → Query single namespace
  → Return filtered results
```

## 🐛 Troubleshooting

### "Authentication required"
- Missing or invalid JWT token
- Check `Authorization: Bearer <token>` header

### "Not a member of this organization"
- User not in `org_members` table
- Add user: `POST /api/orgs/:orgId/members`

### "User is not a member of teams: ..."
- Can only share with teams you're in
- Join team first: `POST /api/teams/:teamId/members`

### "Folder not found"
- Folder doesn't exist or user has no access
- Check `folders` table and `folder_acl`

### No documents returned
- No vectors indexed yet
- Upload document: `POST /api/orgs/:orgId/documents`

## 📚 Next Steps

1. **Read Full Docs** - `README-ENTERPRISE.md`
2. **Understand Architecture** - `ENTERPRISE-SUMMARY.md`
3. **Plan Migration** - `MIGRATION-ENTERPRISE.md` (if upgrading)
4. **Build Client App** - See API reference in README

## 🆘 Support

- **Architecture Questions** → ENTERPRISE-SUMMARY.md
- **API Reference** → README-ENTERPRISE.md
- **Migration Help** → MIGRATION-ENTERPRISE.md
- **Configuration** → ENTERPRISE-ENV-TEMPLATE.txt

## ✅ Checklist

Setup:
- [ ] MySQL database created
- [ ] Schema applied from `schema-enterprise.sql`
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Server running

Testing:
- [ ] Organization created
- [ ] Team created
- [ ] User added to team
- [ ] Folder created
- [ ] Folder shared with team
- [ ] Query working

Ready to Build:
- [ ] Client app connected to API
- [ ] Authentication flow implemented
- [ ] Folder selection UI built
- [ ] Chat interface integrated

---

**Time Investment:**
- Setup: 10-15 minutes
- Testing: 5-10 minutes
- Client Integration: 2-4 hours

**Get Started Now!** 🚀

