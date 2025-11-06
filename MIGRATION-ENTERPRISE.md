# Migration Guide: Personal → Enterprise

This guide helps you migrate from the personal/user-based model to the enterprise organization/team model.

## Overview

**Current Model (Personal):**
- Namespace: `user_<userId>` per user
- Sharing: Cross-namespace queries with fan-out
- ACL: Complex filter building across multiple namespaces

**New Model (Enterprise):**
- Namespace: `org_<orgId>` per organization
- Sharing: Metadata-based with `team_ids` array
- ACL: Single-namespace query with metadata filters

## Migration Strategy

### Option 1: Clean Start (Recommended)

**For new enterprise customers or willing to re-index:**

1. Create new organization
2. Set up teams
3. Re-index documents into `org_<orgId>` namespace
4. Configure folder sharing

**Pros:**
- Clean data model
- Optimal metadata structure
- No legacy baggage

**Cons:**
- Requires re-indexing documents
- Temporary unavailability during migration

### Option 2: Coexistence

**For gradual migration or mixed user base:**

1. Keep existing `user_<userId>` namespaces
2. Create `org_<orgId>` for enterprise users
3. Support both query patterns
4. Migrate users individually over time

**Pros:**
- No disruption to existing users
- Gradual migration path
- Flexibility

**Cons:**
- Dual code paths to maintain
- More complex routing logic

## Step-by-Step Migration

### Phase 1: Database Setup

```bash
# 1. Create enterprise database
mysql -u root -p

CREATE DATABASE panlo_enterprise;
USE panlo_enterprise;
SOURCE schema-enterprise.sql;

# 2. Create organization
INSERT INTO orgs (org_id, name, namespace, plan, owner_id)
VALUES ('org_acme', 'Acme Corp', 'org_acme', 'enterprise', 'user_123');

# 3. Add org members
INSERT INTO org_members (org_id, user_id, role)
VALUES 
  ('org_acme', 'user_123', 'owner'),
  ('org_acme', 'user_456', 'admin'),
  ('org_acme', 'user_789', 'member');

# 4. Create teams
INSERT INTO teams (team_id, org_id, name, created_by)
VALUES 
  ('team_eng', 'org_acme', 'Engineering', 'user_123'),
  ('team_sales', 'org_acme', 'Sales', 'user_123');

# 5. Add team members
INSERT INTO team_members (team_id, user_id, role)
VALUES 
  ('team_eng', 'user_456', 'lead'),
  ('team_eng', 'user_789', 'member'),
  ('team_sales', 'user_123', 'lead');
```

### Phase 2: Vector Migration

#### Method A: Full Copy (Recommended)

```javascript
import { Pinecone } from '@pinecone-database/pinecone';
import { getOrgNamespace, getUserNamespace } from './config-enterprise.js';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('panlo-prod-apne1');

async function migrateUserToOrg(userId, orgId, ownerId) {
  console.log(`Migrating ${userId} → ${orgId}`);
  
  const userNamespace = getUserNamespace(userId);
  const orgNamespace = getOrgNamespace(orgId);
  
  // 1. Query all vectors from user namespace
  const dummyVector = new Array(1024).fill(0);
  const batchSize = 100;
  let hasMore = true;
  let migratedCount = 0;
  
  while (hasMore) {
    const response = await index.namespace(userNamespace).query({
      vector: dummyVector,
      topK: batchSize,
      includeMetadata: true,
      includeValues: true,
    });
    
    if (response.matches.length === 0) {
      hasMore = false;
      break;
    }
    
    // 2. Transform metadata for enterprise model
    const vectors = response.matches.map(match => {
      const oldMeta = match.metadata;
      
      return {
        id: match.id,
        values: match.values,
        metadata: {
          // New enterprise fields
          org_id: orgId,
          owner_user_id: ownerId,
          team_ids: [], // Empty initially, set when sharing
          visibility: 'private',
          
          // Document identification
          folder_id: oldMeta.folderName || 'default_folder',
          doc_id: match.id.split(':')[0],
          chunk_no: parseInt(match.id.split(':')[1] || '0'),
          
          // Content metadata
          mime: oldMeta.fileType ? `application/${oldMeta.fileType}` : 'text/plain',
          title: oldMeta.filename || 'Untitled',
          path: oldMeta.filepath || '/',
          text: oldMeta.text || '',
          
          // Timestamps
          created_at: oldMeta.createdAt || Date.now(),
          updated_at: oldMeta.updatedAt || Date.now(),
          
          // Status
          status: 'active',
          
          // Legacy fields (for compatibility)
          filename: oldMeta.filename,
          filepath: oldMeta.filepath,
          fileType: oldMeta.fileType,
          folderName: oldMeta.folderName,
        },
      };
    });
    
    // 3. Upsert to org namespace
    await index.namespace(orgNamespace).upsert(vectors);
    
    migratedCount += vectors.length;
    console.log(`Migrated ${migratedCount} vectors...`);
    
    // Stop after one batch for simplicity
    // In production, implement proper pagination
    hasMore = false;
  }
  
  console.log(`✅ Migration complete: ${migratedCount} vectors`);
  
  // 4. Update user record
  await db.query(
    'UPDATE users SET current_org_id = ? WHERE user_id = ?',
    [orgId, userId]
  );
}

// Run migration
await migrateUserToOrg('user_123', 'org_acme', 'user_123');
```

#### Method B: Dual-Namespace Support

Keep both namespaces and query based on user context:

```javascript
async function queryUserDocuments(db, userId) {
  // Check if user has org
  const [users] = await db.query(
    'SELECT current_org_id FROM users WHERE user_id = ?',
    [userId]
  );
  
  const orgId = users[0]?.current_org_id;
  
  if (orgId) {
    // Enterprise mode: query org namespace
    return await chatbotClient.queryWithAuth(db, orgId, userId, query);
  } else {
    // Legacy mode: query user namespace
    return await legacyChatbotClient.queryPinecone(userId, query, ...);
  }
}
```

### Phase 3: Folder Mapping

Map existing folders to new folder records:

```sql
-- Create folders from existing watch folders
INSERT INTO folders (folder_id, org_id, owner_user_id, path, name, visibility, status)
SELECT 
  CONCAT('folder_', MD5(CONCAT(user_id, folder_path))) as folder_id,
  'org_acme' as org_id,
  user_id as owner_user_id,
  folder_path as path,
  SUBSTRING_INDEX(folder_path, '/', -1) as name,
  'private' as visibility,
  'active' as status
FROM legacy_watch_folders
WHERE user_id IN (SELECT user_id FROM org_members WHERE org_id = 'org_acme');
```

### Phase 4: Team-based Sharing Setup

Configure sharing for migrated folders:

```sql
-- Example: Share engineering folders with engineering team
UPDATE folders
SET team_ids = JSON_ARRAY('team_eng'),
    visibility = 'team',
    policy_version = 2
WHERE name LIKE '%engineering%'
  AND org_id = 'org_acme';

-- Create ACL records
INSERT INTO folder_acl (folder_id, team_id, permission, shared_by)
SELECT folder_id, 'team_eng', 'read', owner_user_id
FROM folders
WHERE name LIKE '%engineering%'
  AND org_id = 'org_acme';
```

### Phase 5: Vector Metadata Update

Propagate team_ids to vectors:

```javascript
import { updateFolderVectorMetadata } from './folderService.js';

// For each folder with team sharing
const [folders] = await db.query(
  'SELECT folder_id, team_ids, policy_version FROM folders WHERE org_id = ?',
  ['org_acme']
);

for (const folder of folders) {
  const teamIds = JSON.parse(folder.team_ids || '[]');
  if (teamIds.length > 0) {
    await updateFolderVectorMetadata(
      'org_acme',
      folder.folder_id,
      teamIds,
      folder.policy_version
    );
  }
}
```

## Validation

After migration, validate:

### 1. Vector Count
```javascript
const stats = await index.describeIndexStats();
console.log('Org namespace vectors:', stats.namespaces['org_acme'].vectorCount);
```

### 2. Query Access
```javascript
// User should only see their own + team-shared docs
const matches = await chatbotClient.queryWithAuth(
  db,
  'org_acme',
  'user_456',
  'test query'
);

console.log('Accessible documents:', matches.length);
```

### 3. Sharing Permissions
```sql
-- Check folder access
SELECT f.name, f.visibility, f.team_ids
FROM folders f
JOIN folder_acl fa ON f.folder_id = fa.folder_id
WHERE fa.team_id IN (
  SELECT team_id FROM team_members WHERE user_id = 'user_456'
);
```

## Rollback Plan

If migration issues occur:

1. **Keep original namespace** - User namespace remains untouched
2. **Switch back** - Update `current_org_id = NULL` in users table
3. **Delete org namespace** - `await index.namespace('org_acme').deleteAll()`
4. **Remove org data** - `DELETE FROM orgs WHERE org_id = 'org_acme'`

## Performance Considerations

### Before Migration
- Measure current query latency
- Document vector counts per user
- Note concurrent query load

### After Migration
- Monitor single-namespace query performance
- Check metadata filter efficiency
- Validate team_ids array performance

### Optimization Tips
1. **Index team_ids** - Ensure Pinecone metadata is properly indexed
2. **Batch updates** - Use background jobs for metadata propagation
3. **Cache allowlists** - Server-side caching for immediate enforcement

## Client App Updates

Update client code to send org-based requests:

```javascript
// Old (personal)
const response = await fetch(`/api/user/${userId}/chat`, {
  method: 'POST',
  body: JSON.stringify({
    query: 'test',
    filters: { watchFolderNames: ['test'] }
  })
});

// New (enterprise)
const response = await fetch(`/api/orgs/${orgId}/chat`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    query: 'test',
    folderIds: ['folder_123']
  })
});
```

## Timeline Estimate

| Phase | Duration | Effort |
|-------|----------|--------|
| Database setup | 1-2 hours | Low |
| Vector migration | 2-8 hours | Medium |
| Folder mapping | 1-2 hours | Low |
| Sharing setup | 2-4 hours | Medium |
| Metadata update | 4-12 hours | High |
| Validation & testing | 2-4 hours | Medium |
| **Total** | **12-32 hours** | **Medium-High** |

*Duration depends on data volume and team size*

## Support

For migration assistance:
- Review `README-ENTERPRISE.md` for architecture details
- Check `schema-enterprise.sql` for database structure
- Test with small dataset first
- Contact dev team for large-scale migrations

## Checklist

- [ ] Database created and schema applied
- [ ] Organizations created
- [ ] Users added to org_members
- [ ] Teams created
- [ ] Team members assigned
- [ ] Vectors migrated to org namespace
- [ ] Folders mapped to new schema
- [ ] Sharing configured (team_ids, ACLs)
- [ ] Vector metadata updated
- [ ] Access validation completed
- [ ] Client apps updated
- [ ] Performance validated
- [ ] Rollback plan documented
- [ ] Team trained on new model

---

**Note:** This is a one-way migration. Plan carefully and test thoroughly before migrating production data.

