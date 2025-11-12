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
 * With Spaces system, access control is managed via space membership
 * 
 * @param {Object} db - Database connection
 * @param {string} userId - User ID making the query
 * @param {string} orgId - Organization ID
 * @param {Object} additionalFilters - Additional filters (doc_id, mime, etc.)
 * @returns {Object} Pinecone metadata filter
 */
export async function buildAuthFilter(db, userId, orgId, additionalFilters = {}) {
  // With Spaces, access control is managed server-side via space_members table
  // This filter is primarily for org-level scoping and additional filters
  
  // Build the complete filter
  const filter = {
    $and: [
      // Only this organization's documents
      { org_id: orgId },
      
      // Only active documents
      { status: 'active' },
    ]
  };
  
  // Add additional filters (doc_id for space filtering, mime, etc.)
  if (additionalFilters && Object.keys(additionalFilters).length > 0) {
    // Merge additional filters into the $and array
    Object.entries(additionalFilters).forEach(([key, value]) => {
      filter.$and.push({ [key]: value });
    });
  }
  
  return filter;
}

/**
 * Check if a user has access to a specific space
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} spaceId - Space ID
 * @returns {Promise<Object>} { hasAccess: boolean, role?: string }
 */
export async function checkSpaceAccess(db, userId, spaceId) {
  // Check if user is a member of the space
  const [members] = await db.query(
    'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
    [spaceId, userId]
  );
  
  if (members.length === 0) {
    return { hasAccess: false };
  }
  
  return { 
    hasAccess: true, 
    role: members[0].role 
  };
}

/**
 * Get list of accessible space IDs for a user
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {Promise<Array>} Array of accessible spaces
 */
export async function getAccessibleSpaces(db, userId, orgId) {
  // Query for spaces the user can access
  const [spaces] = await db.query(`
    SELECT 
      s.space_id, 
      s.name, 
      s.description,
      s.space_type,
      s.visibility,
      s.owner_user_id,
      sm.role,
      sm.joined_at,
      (SELECT COUNT(*) FROM space_files WHERE space_id = s.space_id) as file_count
    FROM spaces s
    INNER JOIN space_members sm ON s.space_id = sm.space_id
    WHERE s.org_id = ? AND sm.user_id = ?
    ORDER BY s.updated_at DESC
  `, [orgId, userId]);
  
  return spaces;
}

/**
 * Check if user can manage a space (add/remove members, delete space)
 * Only owners can manage spaces
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} spaceId - Space ID
 * @returns {Promise<Object>} { allowed: boolean, reason?: string }
 */
export async function canManageSpace(db, userId, spaceId) {
  const [spaces] = await db.query(
    'SELECT owner_user_id, org_id FROM spaces WHERE space_id = ?',
    [spaceId]
  );
  
  if (spaces.length === 0) {
    return { allowed: false, reason: 'Space not found' };
  }
  
  const space = spaces[0];
  
  // Check if user is the owner
  if (space.owner_user_id === userId) {
    return { allowed: true };
  }
  
  // Check if user is org admin/owner
  const permissions = await getUserOrgPermissions(db, userId, space.org_id);
  const isOrgAdmin = permissions.orgRole === 'admin' || permissions.orgRole === 'owner';
  
  if (isOrgAdmin) {
    return { allowed: true };
  }
  
  return { allowed: false, reason: 'Only space owner or org admin can manage this space' };
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
 * Returns user's accessible spaces and teams
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} orgId - Organization ID
 * @returns {Object} { spaceIds: [...], teamIds: [...] }
 */
export async function buildServerAllowlist(db, userId, orgId) {
  const permissions = await getUserOrgPermissions(db, userId, orgId);
  const accessibleSpaces = await getAccessibleSpaces(db, userId, orgId);
  
  return {
    userId,
    orgId,
    teamIds: permissions.teamIds,
    spaceIds: accessibleSpaces.map(s => s.space_id),
    timestamp: Date.now(),
  };
}

export default {
  getUserOrgPermissions,
  buildAuthFilter,
  checkSpaceAccess,
  getAccessibleSpaces,
  canManageSpace,
  buildServerAllowlist,
};

