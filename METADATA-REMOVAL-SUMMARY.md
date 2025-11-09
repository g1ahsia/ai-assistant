# Metadata JSON Removal - Migration to Dedicated Columns

## Summary
Removed the `metadata` JSON column from the `documents` table and replaced it with dedicated columns for better performance, queryability, and schema clarity.

---

## Changes Made

### 1. **Updated Database Schema**

**File**: `schema-enterprise.sql`

**Removed:**
- ❌ `metadata JSON` - Flexible but slow to query

**Added:**
- ✅ `chunks INT DEFAULT 0` - Number of vector chunks
- ✅ `summary TEXT` - AI-generated summary  
- ✅ `smart_folder_ids JSON` - Array of smart folder IDs
- ✅ `FULLTEXT idx_summary` - Full-text search index on summary

**Before:**
```sql
CREATE TABLE documents (
  ...
  metadata JSON,  -- Everything in one blob
  ...
);
```

**After:**
```sql
CREATE TABLE documents (
  ...
  chunks INT DEFAULT 0,
  summary TEXT,
  smart_folder_ids JSON,
  status VARCHAR(50) DEFAULT 'active',
  ...
  FULLTEXT idx_summary (summary)
);
```

---

### 2. **Updated Insert Query**

**File**: `express-enterprise.js` lines 1270-1290

**Before:**
```javascript
const documentMetadata = {
  summary: metadata.summary || '',
  smartFolderNames: metadata.smartFolderNames || [],
  chunks: vectors.length,
};

INSERT INTO documents (..., metadata) 
VALUES (..., JSON.stringify(documentMetadata))
```

**After:**
```javascript
INSERT INTO documents 
  (..., chunks, summary, smart_folder_ids, ...) 
VALUES 
  (..., vectors.length, metadata.summary, JSON.stringify(smartFolderNames), ...)
```

---

### 3. **Updated GET Document Endpoint**

**File**: `express-enterprise.js` lines 1411-1471

**Before:**
- Query included `metadata` column
- Parse JSON to extract fields
- Spread `...parsedMetadata` into response

**After:**
- Query includes `chunks, summary, smart_folder_ids` columns
- Parse only `smart_folder_ids` JSON array
- Return fields directly from columns

**Response format:**
```json
{
  "success": true,
  "document": {
    "docId": "doc_xxx",
    "filepath": "/path/to/file.pdf",
    "filename": "file.pdf",
    "fileSize": 42728,
    "contentHash": "f5af1820...",
    "chunks": 7,
    "summary": "AI-generated summary...",
    "smartFolderIds": ["folder1", "folder2"],
    "status": "active",
    "indexedAt": "2025-11-09T10:00:00Z",
    "createdAt": "2025-11-09T10:00:00Z",
    "updatedAt": "2025-11-09T10:00:00Z"
  }
}
```

---

### 4. **Migration Script**

**File**: `migration-remove-metadata-json.sql`

**Steps:**
1. Add new columns: `chunks`, `summary`, `smart_folder_ids`
2. Migrate data from `metadata` JSON to new columns
3. Drop `metadata` column
4. Add full-text index on `summary`
5. Verify migration

**To run:**
```bash
mysql -u root -p < migration-remove-metadata-json.sql
```

---

## Benefits

### Performance
- ✅ **Faster queries**: No need to parse JSON
- ✅ **Direct indexing**: Full-text search on summary
- ✅ **Better filtering**: Can filter by chunks, status directly

### Schema Clarity
- ✅ **Explicit fields**: Clear what data is stored
- ✅ **Type safety**: INT for chunks, TEXT for summary
- ✅ **Better documentation**: Column names are self-explanatory

### Queryability
```sql
-- Before (slow)
SELECT * FROM documents 
WHERE JSON_EXTRACT(metadata, '$.summary') LIKE '%keyword%';

-- After (fast)
SELECT * FROM documents 
WHERE MATCH(summary) AGAINST('keyword' IN NATURAL LANGUAGE MODE);
```

---

## Final Documents Table Structure

| Column | Type | Purpose | Source |
|--------|------|---------|--------|
| `doc_id` | VARCHAR(255) | Primary key | Server-generated |
| `folder_id` | VARCHAR(255) | Parent folder | Client |
| `org_id` | VARCHAR(255) | Organization | Client |
| `owner_user_id` | VARCHAR(255) | Document owner | JWT token |
| `filepath` | TEXT | Full file path | Client |
| `filename` | VARCHAR(255) | File name | Client |
| `mime_type` | VARCHAR(100) | MIME type | Client |
| `file_size` | BIGINT | File size (bytes) | Client |
| `content_hash` | VARCHAR(64) | SHA-256 hash | Client |
| `chunks` | INT | Vector chunk count | Server (calculated) |
| `summary` | TEXT | AI summary | OpenAI API |
| `smart_folder_ids` | JSON | Smart folders | Client |
| `status` | VARCHAR(50) | Document status | Server |
| `indexed_at` | TIMESTAMP | Index timestamp | Server |
| `created_at` | TIMESTAMP | Creation time | Auto |
| `updated_at` | TIMESTAMP | Update time | Auto |

**Total**: 16 columns, all with clear purpose, no redundancy

---

## Migration Checklist

### For New Deployments
- [ ] Use updated `schema-enterprise.sql`
- [ ] Deploy server with updated code

### For Existing Deployments
- [ ] Backup database
- [ ] Run `migration-remove-metadata-json.sql`
- [ ] Verify data migration
- [ ] Deploy updated server code
- [ ] Test document upload/retrieval
- [ ] Verify summary search works

---

## Breaking Changes

⚠️ **API Response Changes**:
- `document.smartFolderNames` → `document.smartFolderIds`
- All fields are now top-level (no more nested in metadata)

⚠️ **Database Schema**:
- `metadata` column removed
- New columns added: `chunks`, `summary`, `smart_folder_ids`

---

## Files Modified

1. ✅ `schema-enterprise.sql` - Updated table definition
2. ✅ `express-enterprise.js` - Updated INSERT and SELECT queries
3. ✅ `migration-remove-metadata-json.sql` - Migration script (new)
4. ✅ `METADATA-REMOVAL-SUMMARY.md` - This document (new)
