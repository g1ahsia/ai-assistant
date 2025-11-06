// ============================================
// Authorization Service
// Builds metadata filters for Pinecone queries
// based on user's org and team membership
// ============================================

import config from './config-enterprise.js';

/**
 * Get user's effective permissions in an organization
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {Object} User permissions { orgRole, teamIds, teamRoles }
 */
export async function getUserOrgPermissions(db, userId, orgId) {
  // Get user's org role
  const [orgMembers] = await db.query(
    'SELECT role FROM org_members WHERE user_id = ? AND org_id = ?',
    [userId, orgId]
  );
  
  if (orgMembers.length === 0) {
    throw new Error(`User ${userId} is not a member of org ${orgId}`);
  }
  
  const orgRole = orgMembers[0].role;
  
  // Get user's team memberships within this org
  const [teams] = await db.query(`
    SELECT tm.team_id, tm.role, t.name
    FROM team_members tm
    JOIN teams t ON tm.team_id = t.team_id
    WHERE tm.user_id = ? AND t.org_id = ?
  `, [userId, orgId]);
  
  const teamIds = teams.map(t => t.team_id);
  const teamRoles = Object.fromEntries(teams.map(t => [t.team_id, t.role]));
  
  return {
    orgRole,
    teamIds,
    teamRoles,
    teamDetails: teams,
  };
}

/**
 * Build Pinecone metadata filter for a user's query
 * Enforces access control based on ownership, team membership, and visibility
 * 
 * @param {Object} db - Database connection
 * @param {string} userId - User ID making the query
 * @param {string} orgId - Organization ID
 * @param {Object} additionalFilters - Additional topic/folder filters (optional)
 * @returns {Object} Pinecone metadata filter
 */
export async function buildAuthFilter(db, userId, orgId, additionalFilters = {}) {
  const permissions = await getUserOrgPermissions(db, userId, orgId);
  
  // Base authorization filter:
  // (A) User's own documents: owner_user_id == userId
  // (B) Team-shared: team_ids contains any of user's team IDs
  // (C) Org-wide: visibility == "org"
  
  const authConditions = [
    // User's own content
    { owner_user_id: userId },
  ];
  
  // Team-shared content (if user is in any teams)
  if (permissions.teamIds.length > 0) {
    authConditions.push({
      team_ids: { $in: permissions.teamIds }
    });
  }
  
  // Org-wide visibility (optional, based on plan features)
  if (hasFeature(db, orgId, 'org_wide_visibility')) {
    authConditions.push({
      visibility: 'org'
    });
  }
  
  // Build the complete filter
  const filter = {
    $and: [
      // Only active documents
      { status: 'active' },
      
      // Authorization (OR of all allowed conditions)
      { $or: authConditions },
    ]
  };
  
  // Add additional filters (folder_id, mime, etc.)
  if (additionalFilters && Object.keys(additionalFilters).length > 0) {
    // Merge additional filters into the $and array
    Object.entries(additionalFilters).forEach(([key, value]) => {
      filter.$and.push({ [key]: value });
    });
  }
  
  return filter;
}

/**
 * Build filter for specific folders
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @param {Array} folderIds - Array of folder IDs to query
 * @returns {Object} Pinecone metadata filter
 */
export async function buildFolderFilter(db, userId, orgId, folderIds = []) {
  const baseFilter = await buildAuthFilter(db, userId, orgId);
  
  if (folderIds.length > 0) {
    // Add folder filter
    const folderCondition = folderIds.length === 1
      ? { folder_id: folderIds[0] }
      : { folder_id: { $in: folderIds } };
    
    baseFilter.$and.push(folderCondition);
  }
  
  return baseFilter;
}

/**
 * Check if a user has access to a specific folder
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} folderId - Folder ID
 * @returns {boolean} True if user has access
 */
export async function checkFolderAccess(db, userId, folderId) {
  // Get folder details
  const [folders] = await db.query(
    'SELECT org_id, owner_user_id, visibility, team_ids FROM folders WHERE folder_id = ? AND status = ?',
    [folderId, 'active']
  );
  
  if (folders.length === 0) {
    return false;
  }
  
  const folder = folders[0];
  
  // Check if user owns the folder
  if (folder.owner_user_id === userId) {
    return true;
  }
  
  // Check if user is in the org
  const permissions = await getUserOrgPermissions(db, userId, folder.org_id);
  
  // Check org-wide visibility
  if (folder.visibility === 'org') {
    return true;
  }
  
  // Check team access
  if (folder.visibility === 'team' && folder.team_ids) {
    const folderTeamIds = JSON.parse(folder.team_ids);
    const hasTeamAccess = folderTeamIds.some(teamId => 
      permissions.teamIds.includes(teamId)
    );
    if (hasTeamAccess) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get list of accessible folder IDs for a user
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {Array} Array of accessible folder IDs
 */
export async function getAccessibleFolders(db, userId, orgId) {
  const permissions = await getUserOrgPermissions(db, userId, orgId);
  
  // Query for folders the user can access
  let query = `
    SELECT DISTINCT f.folder_id, f.name, f.path, f.visibility, f.owner_user_id
    FROM folders f
    WHERE f.org_id = ? AND f.status = 'active'
    AND (
      f.owner_user_id = ?
      OR f.visibility = 'org'
  `;
  
  const params = [orgId, userId];
  
  // Add team-based access
  if (permissions.teamIds.length > 0) {
    query += ` OR EXISTS (
      SELECT 1 FROM folder_acl fa
      WHERE fa.folder_id = f.folder_id
      AND fa.team_id IN (?)
    )`;
    params.push(permissions.teamIds);
  }
  
  query += ')';
  
  const [folders] = await db.query(query, params);
  
  return folders;
}

/**
 * Check if user can share a folder with teams
 * Rules: User must be owner or admin, and can only share with teams they're in
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} folderId - Folder ID
 * @param {Array} teamIds - Team IDs to share with
 * @returns {Object} { allowed: boolean, reason: string }
 */
export async function canShareFolder(db, userId, folderId, teamIds) {
  // Get folder details
  const [folders] = await db.query(
    'SELECT org_id, owner_user_id FROM folders WHERE folder_id = ?',
    [folderId]
  );
  
  if (folders.length === 0) {
    return { allowed: false, reason: 'Folder not found' };
  }
  
  const folder = folders[0];
  
  // Get user permissions
  const permissions = await getUserOrgPermissions(db, userId, folder.org_id);
  
  // Check if user is owner or admin
  const isOwner = folder.owner_user_id === userId;
  const isAdmin = permissions.orgRole === 'admin' || permissions.orgRole === 'owner';
  
  if (!isOwner && !isAdmin) {
    return { allowed: false, reason: 'Only folder owner or org admin can share' };
  }
  
  // Validate that user is member of all teams they're trying to share with
  const invalidTeams = teamIds.filter(teamId => !permissions.teamIds.includes(teamId));
  
  if (invalidTeams.length > 0) {
    return { 
      allowed: false, 
      reason: `User is not a member of teams: ${invalidTeams.join(', ')}` 
    };
  }
  
  // Validate that all teams belong to the same org
  const [teams] = await db.query(
    'SELECT team_id FROM teams WHERE team_id IN (?) AND org_id = ?',
    [teamIds, folder.org_id]
  );
  
  if (teams.length !== teamIds.length) {
    return { allowed: false, reason: 'Some teams do not belong to this organization' };
  }
  
  return { allowed: true };
}

/**
 * Helper to check if org has a specific feature
 * @param {Object} db - Database connection
 * @param {string} orgId - Organization ID
 * @param {string} feature - Feature name
 * @returns {boolean} True if feature is available
 */
async function hasFeature(db, orgId, feature) {
  const [orgs] = await db.query('SELECT plan FROM orgs WHERE org_id = ?', [orgId]);
  
  if (orgs.length === 0) return false;
  
  const plan = orgs[0].plan;
  const planConfig = config.plans[plan];
  
  return planConfig?.features.includes(feature) || false;
}

/**
 * Build server-side allowlist for immediate enforcement
 * Used while background metadata updates are propagating
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {Object} { folderIds: [...], teamIds: [...] }
 */
export async function buildServerAllowlist(db, userId, orgId) {
  const permissions = await getUserOrgPermissions(db, userId, orgId);
  const accessibleFolders = await getAccessibleFolders(db, userId, orgId);
  
  return {
    userId,
    orgId,
    teamIds: permissions.teamIds,
    folderIds: accessibleFolders.map(f => f.folder_id),
    timestamp: Date.now(),
  };
}

/**
 * Check if user has access to a specific vector based on its metadata
 * @param {Object} db - Database connection pool
 * @param {string} userId - User ID
 * @param {Object} metadata - Vector metadata from Pinecone
 * @returns {Promise<boolean>} - True if user has access
 */
async function checkVectorAccess(db, userId, metadata) {
  try {
    // Vector is accessible if:
    // 1. User is the owner
    if (metadata.owner_user_id === userId) {
      return true;
    }
    
    // 2. User is in one of the team_ids
    if (metadata.team_ids && Array.isArray(metadata.team_ids) && metadata.team_ids.length > 0) {
      // Get user's teams
      const [userTeams] = await db.query(
        'SELECT team_id FROM team_members WHERE user_id = ?',
        [userId]
      );
      
      const userTeamIds = userTeams.map(t => t.team_id);
      const hasTeamAccess = metadata.team_ids.some(teamId => userTeamIds.includes(teamId));
      
      if (hasTeamAccess) {
        return true;
      }
    }
    
    // 3. Vector is public (org-wide visibility)
    if (metadata.visibility === 'public') {
      // Verify user is member of the org
      const [membership] = await db.query(
        'SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?',
        [metadata.org_id, userId]
      );
      
      return membership.length > 0;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking vector access:', error);
    return false;
  }
}

export default {
  getUserOrgPermissions,
  buildAuthFilter,
  buildFolderFilter,
  checkFolderAccess,
  getAccessibleFolders,
  canShareFolder,
  buildServerAllowlist,
  checkVectorAccess,
};

