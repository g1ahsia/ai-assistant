// ============================================
// Folder Sharing Service
// Handles team-based sharing and ACL updates
// ============================================

import { canShareFolder } from './authService.js';
import { updateVectorMetadata } from './chatbotClient-enterprise.js';
import { getOrgNamespace } from './config-enterprise.js';
import { Pinecone } from '@pinecone-database/pinecone';
import config from './config-enterprise.js';

const pc = new Pinecone({ apiKey: config.pinecone.apiKey });
const index = pc.index(config.pinecone.indexName);

/**
 * Share a folder with teams
 * @param {Object} db - Database connection
 * @param {string} userId - User initiating the share
 * @param {string} folderId - Folder ID to share
 * @param {Array} teamIds - Team IDs to share with
 * @param {string} permission - Permission level (default: 'read')
 * @returns {Object} { success, message, aclRecords }
 */
export async function shareFolder(db, userId, folderId, teamIds, permission = 'read') {
  console.log(`\n🤝 === SHARING FOLDER ===`);
  console.log('Folder:', folderId);
  console.log('Teams:', teamIds);
  console.log('User:', userId);

  // Validate permissions
  const canShare = await canShareFolder(db, userId, folderId, teamIds);
  if (!canShare.allowed) {
    throw new Error(`Cannot share folder: ${canShare.reason}`);
  }

  // Get folder details
  const [folders] = await db.query(
    'SELECT org_id, owner_user_id, team_ids, policy_version FROM folders WHERE folder_id = ?',
    [folderId]
  );

  if (folders.length === 0) {
    throw new Error('Folder not found');
  }

  const folder = folders[0];
  const orgId = folder.org_id;
  const currentTeamIds = folder.team_ids ? JSON.parse(folder.team_ids) : [];
  
  // Merge team IDs (union of current and new)
  const updatedTeamIds = [...new Set([...currentTeamIds, ...teamIds])];
  const newPolicyVersion = folder.policy_version + 1;

  // Begin transaction
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Update folder metadata
    await connection.query(
      `UPDATE folders 
       SET team_ids = ?, 
           policy_version = ?,
           visibility = CASE 
             WHEN visibility = 'private' THEN 'team'
             ELSE visibility
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE folder_id = ?`,
      [JSON.stringify(updatedTeamIds), newPolicyVersion, folderId]
    );

    // Insert/update ACL records
    const aclRecords = [];
    for (const teamId of teamIds) {
      await connection.query(
        `INSERT INTO folder_acl (folder_id, team_id, permission, shared_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           permission = VALUES(permission),
           shared_at = CURRENT_TIMESTAMP`,
        [folderId, teamId, permission, userId]
      );
      aclRecords.push({ folderId, teamId, permission });
    }

    await connection.commit();
    console.log('✅ Database updated');

    // Schedule background vector metadata update
    scheduleVectorMetadataUpdate(orgId, folderId, updatedTeamIds, newPolicyVersion);

    console.log('========================\n');

    return {
      success: true,
      message: 'Folder shared successfully',
      aclRecords,
      policyVersion: newPolicyVersion,
    };

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error sharing folder:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Unshare a folder from teams
 * @param {Object} db - Database connection
 * @param {string} userId - User initiating the unshare
 * @param {string} folderId - Folder ID
 * @param {Array} teamIds - Team IDs to remove access from
 * @returns {Object} { success, message }
 */
export async function unshareFolder(db, userId, folderId, teamIds) {
  console.log(`\n🔒 === UNSHARING FOLDER ===`);
  console.log('Folder:', folderId);
  console.log('Teams to remove:', teamIds);

  // Validate permissions
  const canShare = await canShareFolder(db, userId, folderId, []);
  if (!canShare.allowed) {
    throw new Error(`Cannot unshare folder: ${canShare.reason}`);
  }

  // Get folder details
  const [folders] = await db.query(
    'SELECT org_id, team_ids, policy_version FROM folders WHERE folder_id = ?',
    [folderId]
  );

  if (folders.length === 0) {
    throw new Error('Folder not found');
  }

  const folder = folders[0];
  const orgId = folder.org_id;
  const currentTeamIds = folder.team_ids ? JSON.parse(folder.team_ids) : [];
  
  // Remove specified team IDs
  const updatedTeamIds = currentTeamIds.filter(id => !teamIds.includes(id));
  const newPolicyVersion = folder.policy_version + 1;

  // Begin transaction
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Update folder metadata
    await connection.query(
      `UPDATE folders 
       SET team_ids = ?,
           policy_version = ?,
           visibility = CASE 
             WHEN ? = 0 THEN 'private'
             ELSE visibility
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE folder_id = ?`,
      [JSON.stringify(updatedTeamIds), newPolicyVersion, updatedTeamIds.length, folderId]
    );

    // Delete ACL records
    if (teamIds.length > 0) {
      await connection.query(
        'DELETE FROM folder_acl WHERE folder_id = ? AND team_id IN (?)',
        [folderId, teamIds]
      );
    }

    await connection.commit();
    console.log('✅ Database updated');

    // Schedule background vector metadata update
    scheduleVectorMetadataUpdate(orgId, folderId, updatedTeamIds, newPolicyVersion);

    console.log('==========================\n');

    return {
      success: true,
      message: 'Folder unshared successfully',
      policyVersion: newPolicyVersion,
    };

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error unsharing folder:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get folder sharing status
 * @param {Object} db - Database connection
 * @param {string} folderId - Folder ID
 * @returns {Object} Sharing details
 */
export async function getFolderSharing(db, folderId) {
  const [folders] = await db.query(
    `SELECT f.folder_id, f.name, f.visibility, f.team_ids, f.policy_version, f.owner_user_id,
            u.name as owner_name, u.email as owner_email
     FROM folders f
     LEFT JOIN users u ON f.owner_user_id = u.user_id
     WHERE f.folder_id = ?`,
    [folderId]
  );

  if (folders.length === 0) {
    throw new Error('Folder not found');
  }

  const folder = folders[0];

  // Get ACL details
  const [acls] = await db.query(
    `SELECT fa.team_id, t.name as team_name, fa.permission, fa.shared_by, fa.shared_at,
            u.name as shared_by_name
     FROM folder_acl fa
     JOIN teams t ON fa.team_id = t.team_id
     LEFT JOIN users u ON fa.shared_by = u.user_id
     WHERE fa.folder_id = ?`,
    [folderId]
  );

  return {
    folderId: folder.folder_id,
    name: folder.name,
    visibility: folder.visibility,
    owner: {
      userId: folder.owner_user_id,
      name: folder.owner_name,
      email: folder.owner_email,
    },
    teamIds: folder.team_ids ? JSON.parse(folder.team_ids) : [],
    policyVersion: folder.policy_version,
    acls: acls.map(acl => ({
      teamId: acl.team_id,
      teamName: acl.team_name,
      permission: acl.permission,
      sharedBy: {
        userId: acl.shared_by,
        name: acl.shared_by_name,
      },
      sharedAt: acl.shared_at,
    })),
  };
}

/**
 * Schedule background update of vector metadata
 * This is a placeholder - in production, you'd use a job queue like Bull/BullMQ
 * @param {string} orgId - Organization ID
 * @param {string} folderId - Folder ID
 * @param {Array} teamIds - Updated team IDs
 * @param {number} policyVersion - New policy version
 */
function scheduleVectorMetadataUpdate(orgId, folderId, teamIds, policyVersion) {
  console.log(`📋 Scheduling metadata update for folder ${folderId}`);
  
  // In production, enqueue this job
  // For now, run it async without blocking
  setImmediate(async () => {
    try {
      await updateFolderVectorMetadata(orgId, folderId, teamIds, policyVersion);
    } catch (error) {
      console.error('❌ Background metadata update failed:', error);
      // In production, retry logic would go here
    }
  });
}

/**
 * Update vector metadata for all vectors in a folder
 * @param {string} orgId - Organization ID
 * @param {string} folderId - Folder ID
 * @param {Array} teamIds - New team IDs
 * @param {number} policyVersion - New policy version
 */
async function updateFolderVectorMetadata(orgId, folderId, teamIds, policyVersion) {
  console.log(`\n🔄 === UPDATING VECTOR METADATA ===`);
  console.log('Org:', orgId);
  console.log('Folder:', folderId);
  console.log('Team IDs:', teamIds);
  console.log('Policy version:', policyVersion);

  const namespace = getOrgNamespace(orgId);
  const batchSize = config.sharing.backgroundUpdate.batchSize;
  const delayMs = config.sharing.backgroundUpdate.delayMs;

  try {
    // Query vectors for this folder
    // Note: Pinecone doesn't have a direct "list by metadata" API
    // So we use a dummy vector query with metadata filter
    const dummyVector = new Array(config.vector.dimension).fill(0);
    
    let hasMore = true;
    let processed = 0;
    
    while (hasMore) {
      const response = await index.namespace(namespace).query({
        vector: dummyVector,
        topK: batchSize,
        filter: { folder_id: folderId },
        includeMetadata: true,
      });

      if (response.matches.length === 0) {
        hasMore = false;
        break;
      }

      // Update each vector's metadata
      const updates = response.matches.map(match => ({
        id: match.id,
        metadata: {
          ...match.metadata,
          team_ids: teamIds,
          shared_policy_version: policyVersion,
          updated_at: Date.now(),
        },
      }));

      for (const update of updates) {
        await index.namespace(namespace).update({
          id: update.id,
          metadata: update.metadata,
        });
      }

      processed += updates.length;
      console.log(`✅ Updated ${processed} vectors`);

      // Rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // For simplicity, stop after one batch
      // In production, you'd implement pagination properly
      hasMore = false;
    }

    console.log(`✅ Metadata update complete: ${processed} vectors updated`);
    console.log('===================================\n');

  } catch (error) {
    console.error('❌ Error updating vector metadata:', error);
    throw error;
  }
}

/**
 * Get all folders accessible to a user with sharing details
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {Array} List of folders with sharing details
 */
export async function getUserFolders(db, userId, orgId) {
  const [folders] = await db.query(
    `SELECT DISTINCT 
       f.folder_id, f.name, f.path, f.visibility, f.owner_user_id, f.status,
       f.team_ids, f.last_synced_at,
       u.name as owner_name,
       CASE 
         WHEN f.owner_user_id = ? THEN 'owner'
         ELSE 'shared'
       END as access_type
     FROM folders f
     LEFT JOIN users u ON f.owner_user_id = u.user_id
     WHERE f.org_id = ? AND f.status = 'active'
     AND (
       f.owner_user_id = ?
       OR f.visibility = 'org'
       OR EXISTS (
         SELECT 1 FROM folder_acl fa
         JOIN team_members tm ON fa.team_id = tm.team_id
         WHERE fa.folder_id = f.folder_id AND tm.user_id = ?
       )
     )
     ORDER BY f.name`,
    [userId, orgId, userId, userId]
  );

  return folders.map(f => ({
    ...f,
    team_ids: f.team_ids ? JSON.parse(f.team_ids) : [],
  }));
}

export default {
  shareFolder,
  unshareFolder,
  getFolderSharing,
  getUserFolders,
};

