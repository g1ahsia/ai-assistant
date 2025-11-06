// ============================================
// Enterprise API Server
// RESTful API for org/team management and vector operations
// ============================================

import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import config from './config-enterprise.js';
import authService from './authService.js';
import chatbotClient from './chatbotClient-enterprise.js';
import folderService from './folderService.js';

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();

// Middleware
app.use(cors({ origin: config.api.corsOrigins }));
app.use(express.json({ limit: '50mb' })); // Increased limit for document uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database connection pool
const pool = mysql.createPool(config.database);

// ============================================
// Authentication Middleware
// ============================================

/**
 * Verify JWT token and attach user info to request
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded; // { userId, email, ... }
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Verify user is member of specified org
 */
async function verifyOrgMembership(req, res, next) {
  const { orgId } = req.params;
  const { userId } = req.user;

  try {
    const [members] = await pool.query(
      'SELECT role FROM org_members WHERE user_id = ? AND org_id = ?',
      [userId, orgId]
    );

    if (members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    req.orgRole = members[0].role;
    next();
  } catch (error) {
    console.error('Error verifying org membership:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Verify user has admin or owner role in org
 */
function requireOrgAdmin(req, res, next) {
  if (req.orgRole !== 'admin' && req.orgRole !== 'owner') {
    return res.status(403).json({ error: 'Admin or owner role required' });
  }
  next();
}

// ============================================
// Authentication Endpoints
// ============================================

/**
 * Helper: Generate JWT token for user
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.user_id,
      email: user.email,
      name: user.name,
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiry }
  );
}

/**
 * POST /api/auth/google
 * Google OAuth login
 */
app.post('/api/auth/google', async (req, res) => {
  const { credential, userInfo } = req.body;

  if (!credential && !userInfo) {
    return res.status(400).json({ error: 'Google credential or userInfo is required' });
  }

  let googleSub, email, name, picture;

  try {
    if (credential) {
      try {
        // Try to verify as ID token first
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        
        const payload = ticket.getPayload();
        googleSub = payload.sub;
        email = payload.email;
        name = payload.name;
        picture = payload.picture;
        console.log('✅ Verified Google ID token');
      } catch (idTokenError) {
        console.log('⚠️ ID token verification failed, trying tokeninfo endpoint...');
        
        // If ID token verification fails, try using tokeninfo endpoint with access token
        const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${credential}`);
        
        if (!tokenInfoResponse.ok) {
          throw new Error('Failed to verify access token');
        }
        
        const tokenInfo = await tokenInfoResponse.json();
        
        // Verify the token belongs to our client
        if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
          throw new Error('Token audience mismatch');
        }
        
        // Get user info using access token
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${credential}` }
        });
        
        const googleUserInfo = await userInfoResponse.json();
        googleSub = googleUserInfo.id;
        email = googleUserInfo.email;
        name = googleUserInfo.name;
        picture = googleUserInfo.picture;
        console.log('✅ Verified Google access token and fetched user info');
      }
    } else if (userInfo) {
      // Fallback: use provided userInfo (less secure, only for development)
      console.warn('⚠️ Using fallback userInfo authentication (not recommended for production)');
      googleSub = userInfo.id;
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
    }

    // Check if user exists
    let [users] = await pool.query(
      'SELECT * FROM users WHERE google_sub = ? OR email = ?',
      [googleSub, email]
    );

    let user;
    
    if (users.length === 0) {
      // Create new user
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await pool.query(
        `INSERT INTO users (user_id, email, name, google_sub, avatar_url, preferences)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, email, name, googleSub, picture, JSON.stringify({})]
      );

      // Create personal organization for new user
      const orgId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const namespace = orgId; // Use orgId directly as namespace (already has org_ prefix)
      
      await pool.query(
        `INSERT INTO orgs (org_id, name, namespace, plan, owner_id, settings)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, `${name}'s Organization`, namespace, 'free', userId, JSON.stringify({})]
      );

      // Add user as owner of their org
      await pool.query(
        `INSERT INTO org_members (org_id, user_id, role)
         VALUES (?, ?, ?)`,
        [orgId, userId, 'owner']
      );

      // Update user's current_org_id
      await pool.query(
        'UPDATE users SET current_org_id = ? WHERE user_id = ?',
        [orgId, userId]
      );

      user = {
        user_id: userId,
        email,
        name,
        google_sub: googleSub,
        avatar_url: picture,
        current_org_id: orgId,
      };
    } else {
      user = users[0];
      
      // Update google_sub if not set
      if (!user.google_sub) {
        await pool.query(
          'UPDATE users SET google_sub = ?, avatar_url = ? WHERE user_id = ?',
          [googleSub, picture, user.user_id]
        );
        user.google_sub = googleSub;
        user.avatar_url = picture;
      }
    }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        currentOrgId: user.current_org_id,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

/**
 * POST /api/auth/signup
 * User registration with email/password
 */
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate password strength (min 8 chars)
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Check if user already exists
    const [existingUsers] = await pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await pool.query(
      `INSERT INTO users (user_id, email, name, preferences)
       VALUES (?, ?, ?, ?)`,
      [userId, email, name, JSON.stringify({ password: hashedPassword })]
    );

    // Create personal organization
    const orgId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const namespace = orgId; // Use orgId directly as namespace (already has org_ prefix)
    
    await pool.query(
      `INSERT INTO orgs (org_id, name, namespace, plan, owner_id, settings)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, `${name}'s Organization`, namespace, 'free', userId, JSON.stringify({})]
    );

    // Add user as owner of their org
    await pool.query(
      `INSERT INTO org_members (org_id, user_id, role)
       VALUES (?, ?, ?)`,
      [orgId, userId, 'owner']
    );

    // Update user's current_org_id
    await pool.query(
      'UPDATE users SET current_org_id = ? WHERE user_id = ?',
      [orgId, userId]
    );

    const user = {
      user_id: userId,
      email,
      name,
      current_org_id: orgId,
    };

    // Generate JWT token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        name: user.name,
        currentOrgId: user.current_org_id,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * POST /api/auth/login
 * Login with email/password
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user
    const [users] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Check if user has password (might be Google-only user)
    const preferences = typeof user.preferences === 'string' 
      ? JSON.parse(user.preferences) 
      : user.preferences;
    
    if (!preferences || !preferences.password) {
      return res.status(401).json({ 
        error: 'No password set. Please use Google login or reset your password.' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, preferences.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        currentOrgId: user.current_org_id,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    // Get user details
    const [users] = await pool.query(
      'SELECT user_id, email, name, avatar_url, current_org_id, created_at FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Get user's organizations
    const [orgs] = await pool.query(`
      SELECT o.org_id, o.name, o.namespace, o.plan, om.role
      FROM orgs o
      JOIN org_members om ON o.org_id = om.org_id
      WHERE om.user_id = ?
      ORDER BY om.joined_at DESC
    `, [userId]);

    res.json({
      success: true,
      user: {
        userId: user.user_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        currentOrgId: user.current_org_id,
        createdAt: user.created_at,
        organizations: orgs.map(org => ({
          orgId: org.org_id,
          name: org.name,
          namespace: org.namespace,
          plan: org.plan,
          role: org.role,
        })),
      },
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============================================
// Organization Endpoints
// ============================================

/**
 * POST /api/orgs
 * Create a new organization
 */
app.post('/api/orgs', authenticateToken, async (req, res) => {
  const { name, plan = 'free' } = req.body;
  const { userId } = req.user;

  if (!name) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  // Enforce unique organization names (case-insensitive)
  try {
    const [existing] = await pool.query(
      'SELECT org_id FROM orgs WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Organization name already exists' });
    }
  } catch (err) {
    console.error('Error checking org name uniqueness:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  const orgId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const namespace = orgId; // Use orgId directly as namespace (already has org_ prefix)

  try {
    await pool.query(
      'INSERT INTO orgs (org_id, name, namespace, plan, owner_id) VALUES (?, ?, ?, ?, ?)',
      [orgId, name, namespace, plan, userId]
    );

    // Add creator as owner in org_members
    await pool.query(
      'INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)',
      [orgId, userId, 'owner']
    );

    res.status(201).json({
      success: true,
      org: { orgId, name, namespace, plan, ownerId: userId },
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * GET /api/orgs/:orgId
 * Get organization details
 */
app.get('/api/orgs/:orgId', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;

  try {
    const [orgs] = await pool.query(
      `SELECT o.org_id, o.name, o.namespace, o.plan, o.owner_id, o.created_at, o.settings,
              u.name as owner_name, u.email as owner_email
       FROM orgs o
       LEFT JOIN users u ON o.owner_id = u.user_id
       WHERE o.org_id = ?`,
      [orgId]
    );

    if (orgs.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgs[0];

    // Get member count
    const [memberCount] = await pool.query(
      'SELECT COUNT(*) as count FROM org_members WHERE org_id = ?',
      [orgId]
    );

    // Get team count
    const [teamCount] = await pool.query(
      'SELECT COUNT(*) as count FROM teams WHERE org_id = ?',
      [orgId]
    );

    res.json({
      ...org,
      memberCount: memberCount[0].count,
      teamCount: teamCount[0].count,
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

/**
 * GET /api/orgs/:orgId/members
 * Get organization members
 */
app.get('/api/orgs/:orgId/members', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;

  try {
    const [members] = await pool.query(
      `SELECT om.user_id, om.role, om.joined_at,
              u.name, u.email, u.avatar_url,
              inviter.name as invited_by_name
       FROM org_members om
       JOIN users u ON om.user_id = u.user_id
       LEFT JOIN users inviter ON om.invited_by = inviter.user_id
       WHERE om.org_id = ?
       ORDER BY om.joined_at DESC`,
      [orgId]
    );

    res.json({ members });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

/**
 * POST /api/orgs/:orgId/members
 * Add a member to organization
 */
app.post('/api/orgs/:orgId/members', authenticateToken, verifyOrgMembership, requireOrgAdmin, async (req, res) => {
  const { orgId } = req.params;
  const { userId: targetUserId, role = 'member' } = req.body;
  const { userId: inviterId } = req.user;

  if (!targetUserId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Check if user exists
    const [users] = await pool.query('SELECT user_id FROM users WHERE user_id = ?', [targetUserId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add member
    await pool.query(
      'INSERT INTO org_members (org_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
      [orgId, targetUserId, role, inviterId]
    );

    res.status(201).json({
      success: true,
      message: 'Member added successfully',
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'User is already a member' });
    }
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ============================================
// Team Endpoints
// ============================================

/**
 * POST /api/orgs/:orgId/teams
 * Create a new team
 */
app.post('/api/orgs/:orgId/teams', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { name, description } = req.body;
  const { userId } = req.user;

  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Create team
    await pool.query(
      'INSERT INTO teams (team_id, org_id, name, description, created_by) VALUES (?, ?, ?, ?, ?)',
      [teamId, orgId, name, description, userId]
    );

    // Add creator as team member
    await pool.query(
      'INSERT INTO team_members (team_id, user_id, role, added_by) VALUES (?, ?, ?, ?)',
      [teamId, userId, 'lead', userId]
    );

    res.status(201).json({
      success: true,
      team: { teamId, orgId, name, description, createdBy: userId },
    });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

/**
 * GET /api/orgs/:orgId/teams
 * Get all teams in organization
 */
app.get('/api/orgs/:orgId/teams', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;

  try {
    const [teams] = await pool.query(
      `SELECT t.team_id, t.name, t.description, t.created_at,
              creator.name as created_by_name,
              tm.role as user_role,
              (SELECT COUNT(*) FROM team_members WHERE team_id = t.team_id) as member_count
       FROM teams t
       LEFT JOIN users creator ON t.created_by = creator.user_id
       LEFT JOIN team_members tm ON t.team_id = tm.team_id AND tm.user_id = ?
       WHERE t.org_id = ?
       ORDER BY t.name`,
      [userId, orgId]
    );

    res.json({ teams });
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

/**
 * GET /api/teams/:teamId/members
 * Get team members
 */
app.get('/api/teams/:teamId/members', authenticateToken, async (req, res) => {
  const { teamId } = req.params;

  try {
    const [members] = await pool.query(
      `SELECT tm.user_id, tm.role, tm.joined_at,
              u.name, u.email, u.avatar_url
       FROM team_members tm
       JOIN users u ON tm.user_id = u.user_id
       WHERE tm.team_id = ?
       ORDER BY tm.joined_at`,
      [teamId]
    );

    res.json({ members });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

/**
 * POST /api/teams/:teamId/members
 * Add member to team
 */
app.post('/api/teams/:teamId/members', authenticateToken, async (req, res) => {
  const { teamId } = req.params;
  const { userId: targetUserId, role = 'member' } = req.body;
  const { userId: adderId } = req.user;

  if (!targetUserId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    // Verify adder is team lead or org admin
    const [teams] = await pool.query(
      `SELECT t.org_id,
              tm.role as adder_role,
              om.role as adder_org_role
       FROM teams t
       LEFT JOIN team_members tm ON t.team_id = tm.team_id AND tm.user_id = ?
       LEFT JOIN org_members om ON t.org_id = om.org_id AND om.user_id = ?
       WHERE t.team_id = ?`,
      [adderId, adderId, teamId]
    );

    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teams[0];
    const isTeamLead = team.adder_role === 'lead';
    const isOrgAdmin = team.adder_org_role === 'admin' || team.adder_org_role === 'owner';

    if (!isTeamLead && !isOrgAdmin) {
      return res.status(403).json({ error: 'Only team leads or org admins can add members' });
    }

    // Verify target user is org member
    const [orgMembers] = await pool.query(
      'SELECT user_id FROM org_members WHERE user_id = ? AND org_id = ?',
      [targetUserId, team.org_id]
    );

    if (orgMembers.length === 0) {
      return res.status(400).json({ error: 'User must be an org member first' });
    }

    // Add to team
    await pool.query(
      'INSERT INTO team_members (team_id, user_id, role, added_by) VALUES (?, ?, ?, ?)',
      [teamId, targetUserId, role, adderId]
    );

    res.status(201).json({
      success: true,
      message: 'Member added to team',
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'User is already a team member' });
    }
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// ============================================
// Folder Endpoints
// ============================================

/**
 * GET /api/orgs/:orgId/folders
 * Get user's accessible folders
 */
app.get('/api/orgs/:orgId/folders', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;

  try {
    const folders = await folderService.getUserFolders(pool, userId, orgId);
    res.json({ folders });
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

/**
 * POST /api/orgs/:orgId/folders
 * Create a new watched folder
 */
app.post('/api/orgs/:orgId/folders', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { name, path, visibility = 'private' } = req.body;
  const { userId } = req.user;

  if (!name || !path) {
    return res.status(400).json({ error: 'Folder name and path are required' });
  }

  const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await pool.query(
      `INSERT INTO folders (folder_id, org_id, owner_user_id, path, name, visibility)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [folderId, orgId, userId, path, name, visibility]
    );

    res.status(201).json({
      success: true,
      folder: { folderId, orgId, ownerId: userId, path, name, visibility },
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * DELETE /api/orgs/:orgId/folders/:folderId
 * Delete a watched folder
 */
app.delete('/api/orgs/:orgId/folders/:folderId', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId, folderId } = req.params;
  const { userId } = req.user;

  try {
    // Verify folder exists and user has permission (owner or org admin)
    const [folders] = await pool.query(
      `SELECT f.folder_id, f.owner_user_id, f.org_id,
              om.role as user_org_role
       FROM folders f
       LEFT JOIN org_members om ON f.org_id = om.org_id AND om.user_id = ?
       WHERE f.folder_id = ? AND f.org_id = ?`,
      [userId, folderId, orgId]
    );

    if (folders.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const folder = folders[0];
    const isOwner = folder.owner_user_id === userId;
    const isOrgAdmin = folder.user_org_role === 'admin' || folder.user_org_role === 'owner';

    if (!isOwner && !isOrgAdmin) {
      return res.status(403).json({ error: 'Only folder owner or org admin can delete folders' });
    }

    // Delete folder
    await pool.query('DELETE FROM folders WHERE folder_id = ?', [folderId]);

    res.json({
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

/**
 * POST /api/folders/:folderId/share
 * Share folder with teams
 */
app.post('/api/folders/:folderId/share', authenticateToken, async (req, res) => {
  const { folderId } = req.params;
  const { teamIds, permission = 'read' } = req.body;
  const { userId } = req.user;

  if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
    return res.status(400).json({ error: 'Team IDs array is required' });
  }

  try {
    const result = await folderService.shareFolder(pool, userId, folderId, teamIds, permission);
    res.json(result);
  } catch (error) {
    console.error('Error sharing folder:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/folders/:folderId/unshare
 * Unshare folder from teams
 */
app.post('/api/folders/:folderId/unshare', authenticateToken, async (req, res) => {
  const { folderId } = req.params;
  const { teamIds } = req.body;
  const { userId } = req.user;

  if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
    return res.status(400).json({ error: 'Team IDs array is required' });
  }

  try {
    const result = await folderService.unshareFolder(pool, userId, folderId, teamIds);
    res.json(result);
  } catch (error) {
    console.error('Error unsharing folder:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/folders/:folderId/sharing
 * Get folder sharing status
 */
app.get('/api/folders/:folderId/sharing', authenticateToken, async (req, res) => {
  const { folderId } = req.params;

  try {
    const sharing = await folderService.getFolderSharing(pool, folderId);
    res.json(sharing);
  } catch (error) {
    console.error('Error fetching folder sharing:', error);
    res.status(500).json({ error: 'Failed to fetch folder sharing' });
  }
});

// ============================================
// Chat / Query Endpoints
// ============================================

/**
 * POST /api/orgs/:orgId/chat
 * Query organization documents and generate AI response
 */
app.post('/api/orgs/:orgId/chat', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const {
    query,
    conversationHistory = [],
    answerMode = 'precise',
    folderIds = [],
    additionalFilters = {},
  } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const result = await chatbotClient.generateResponse(
      pool,
      orgId,
      userId,
      query,
      conversationHistory,
      { answerMode, folderIds, additionalFilters }
    );

    res.json({
      success: true,
      response: result.aiResponse,
      citedSources: result.citedSources,
      context: result.context,
    });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

/**
 * POST /api/orgs/:orgId/query
 * Query organization documents (no AI response)
 */
app.post('/api/orgs/:orgId/query', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { query, folderIds = [], topK, threshold } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const matches = await chatbotClient.queryWithAuth(
      pool,
      orgId,
      userId,
      query,
      { folderIds, topK, threshold }
    );

    res.json({
      success: true,
      matches: matches.map(m => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata,
      })),
    });
  } catch (error) {
    console.error('Error querying documents:', error);
    res.status(500).json({ error: 'Failed to query documents' });
  }
});

// ============================================
// Document / Vector Endpoints
// ============================================

/**
 * POST /api/orgs/:orgId/documents
 * Upload and index document
 */
app.post('/api/orgs/:orgId/documents', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { folderId, filepath, filename, chunks, metadata = {} } = req.body;

  if (!folderId || !filepath || !filename || !chunks || !Array.isArray(chunks)) {
    return res.status(400).json({ 
      error: 'folderId, filepath, filename, and chunks array are required' 
    });
  }

  const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Verify folder access
    const hasAccess = await authService.checkFolderAccess(pool, userId, folderId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this folder' });
    }

    // Get folder details
    const [folders] = await pool.query(
      'SELECT team_ids, visibility FROM folders WHERE folder_id = ?',
      [folderId]
    );

    if (folders.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const folder = folders[0];
    const teamIds = folder.team_ids ? JSON.parse(folder.team_ids) : [];

    // Build vectors
    const vectors = chunks.map((chunk, i) => ({
      id: `${docId}:${i}`,
      text: chunk.text,
      metadata: {
        org_id: orgId,
        owner_user_id: userId,
        team_ids: teamIds,
        visibility: folder.visibility,
        folder_id: folderId,
        doc_id: docId,
        chunk_no: i,
        mime: metadata.mime || 'text/plain',
        title: filename,
        path: filepath,
        text: chunk.text,
        created_at: Date.now(),
        updated_at: Date.now(),
        status: 'active',
        filename,
        filepath,
        fileType: metadata.fileType || 'txt',
      },
    }));

    // Generate embeddings and upsert
    const pc = new (await import('@pinecone-database/pinecone')).Pinecone({ 
      apiKey: config.pinecone.apiKey 
    });
    
    const embeddings = await pc.inference.embed(
      config.openai.embeddingModel,
      vectors.map(v => v.text),
      { inputType: 'passage', truncate: 'END' }
    );

    const vectorsToUpsert = vectors.map((v, i) => ({
      id: v.id,
      values: embeddings.data[i].values,
      metadata: v.metadata,
    }));

    await chatbotClient.upsertVectors(orgId, vectorsToUpsert);

    // Store document metadata in DB
    await pool.query(
      `INSERT INTO documents (doc_id, folder_id, org_id, owner_user_id, filepath, filename, mime_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [docId, folderId, orgId, userId, filepath, filename, metadata.mime || 'text/plain', 'active']
    );

    res.status(201).json({
      success: true,
      docId,
      vectorCount: vectors.length,
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * POST /api/orgs/:orgId/delete-vectors
 * Delete vectors from organization's Pinecone namespace
 */
app.post('/api/orgs/:orgId/delete-vectors', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { vectorIds, uuids } = req.body;

  // Support both 'vectorIds' and 'uuids' for backward compatibility
  const ids = vectorIds || uuids;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Vector IDs array is required' });
  }

  try {
    // Optional: Verify user has permission to delete vectors
    // For now, any org member can delete vectors
    // In the future, you could add ACL checks here

    await chatbotClient.deleteVectors(orgId, ids);

    res.json({
      success: true,
      message: `Successfully deleted ${ids.length} vectors`,
      deletedCount: ids.length,
    });
  } catch (error) {
    console.error('Error deleting vectors:', error);
    res.status(500).json({ error: 'Failed to delete vectors' });
  }
});

/**
 * GET /api/orgs/:orgId/vectors/:vectorId
 * Fetch specific vector content by ID
 */
app.get('/api/orgs/:orgId/vectors/:vectorId', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId, vectorId } = req.params;
  const { userId } = req.user;

  try {
    // Fetch vector from Pinecone
    const namespace = config.pinecone.namespaces.org(orgId);
    const pc = new (await import('@pinecone-database/pinecone')).Pinecone({ 
      apiKey: config.pinecone.apiKey 
    });
    const index = pc.index(config.pinecone.indexName);
    
    const fetchResult = await index.namespace(namespace).fetch([vectorId]);
    
    if (!fetchResult.records || !fetchResult.records[vectorId]) {
      return res.status(404).json({ error: 'Vector not found' });
    }

    const vector = fetchResult.records[vectorId];
    const metadata = vector.metadata;

    // Check if user has access to this vector
    const hasAccess = await authService.checkVectorAccess(pool, userId, metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this vector' });
    }

    res.json({
      success: true,
      vectorId,
      content: {
        text: metadata.text || '',
        title: metadata.title || metadata.filename || 'Untitled',
        filename: metadata.filename,
        filepath: metadata.filepath || metadata.path,
        chunkNo: metadata.chunk_no || 0,
        mimeType: metadata.mime || 'text/plain',
        docId: metadata.doc_id,
        folderId: metadata.folder_id,
        createdAt: metadata.created_at,
      },
    });
  } catch (error) {
    console.error('Error fetching vector:', error);
    res.status(500).json({ error: 'Failed to fetch vector content' });
  }
});

/**
 * POST /delete-vectors (Legacy endpoint for backward compatibility)
 * Redirects to new org-based endpoint
 */
app.post('/delete-vectors', authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { googleId, uuids, vectorIds } = req.body;

  // Support both 'vectorIds' and 'uuids' for backward compatibility
  const ids = vectorIds || uuids;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Vector IDs array is required' });
  }

  try {
    // Get user's current organization
    const [users] = await pool.query(
      'SELECT current_org_id FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0 || !users[0].current_org_id) {
      return res.status(404).json({ error: 'User has no active organization' });
    }

    const orgId = users[0].current_org_id;

    // Verify user is member of this org
    const [membership] = await pool.query(
      'SELECT role FROM org_members WHERE org_id = ? AND user_id = ?',
      [orgId, userId]
    );

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    await chatbotClient.deleteVectors(orgId, ids);

    res.json({
      success: true,
      message: `Successfully deleted ${ids.length} vectors`,
      deletedCount: ids.length,
      uuids: ids, // For backward compatibility
    });
  } catch (error) {
    console.error('Error deleting vectors (legacy endpoint):', error);
    res.status(500).json({ error: 'Failed to delete vectors' });
  }
});

// ============================================
// Conversation Management
// ============================================

/**
 * POST /api/orgs/:orgId/conversations
 * Create a new conversation
 */
app.post('/api/orgs/:orgId/conversations', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { title, description, folderIds = [], metadata = {} } = req.body;

  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await pool.query(
      `INSERT INTO conversations (conversation_id, org_id, user_id, title, description, folder_ids, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [conversationId, orgId, userId, title || 'New Conversation', description, JSON.stringify(folderIds), JSON.stringify(metadata)]
    );

    res.status(201).json({
      success: true,
      conversation: {
        conversationId,
        orgId,
        userId,
        title: title || 'New Conversation',
        description,
        folderIds,
        messageCount: 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/orgs/:orgId/conversations
 * List user's conversations
 */
app.get('/api/orgs/:orgId/conversations', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { archived = 'false', limit = 50, offset = 0 } = req.query;

  try {
    // Get conversations owned by user or shared with user
    const [conversations] = await pool.query(
      `SELECT DISTINCT c.*
       FROM conversations c
       LEFT JOIN conversation_shares cs ON c.conversation_id = cs.conversation_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.org_id = ?
         AND c.archived = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       ORDER BY c.last_message_at DESC
       LIMIT ? OFFSET ?`,
      [orgId, archived === 'true', userId, userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      conversations: conversations.map(c => ({
        conversationId: c.conversation_id,
        title: c.title,
        description: c.description,
        messageCount: c.message_count,
        totalTokens: c.total_tokens,
        lastMessageAt: c.last_message_at,
        createdAt: c.created_at,
        archived: c.archived,
        isOwner: c.user_id === userId,
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: conversations.length === parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Get conversation details
 */
app.get('/api/conversations/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;

  try {
    // Check if user has access to this conversation
    const [conversations] = await pool.query(
      `SELECT c.*, 
              (c.user_id = ?) AS is_owner,
              cs.permission AS shared_permission
       FROM conversations c
       LEFT JOIN conversation_shares cs ON c.conversation_id = cs.conversation_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.conversation_id = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       LIMIT 1`,
      [userId, conversationId, userId, userId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    const conversation = conversations[0];

    // Get tags
    const [tags] = await pool.query(
      'SELECT tag FROM conversation_tags WHERE conversation_id = ?',
      [conversationId]
    );

    res.json({
      success: true,
      conversation: {
        conversationId: conversation.conversation_id,
        orgId: conversation.org_id,
        userId: conversation.user_id,
        title: conversation.title,
        description: conversation.description,
        folderIds: JSON.parse(conversation.folder_ids || '[]'),
        messageCount: conversation.message_count,
        totalTokens: conversation.total_tokens,
        lastMessageAt: conversation.last_message_at,
        createdAt: conversation.created_at,
        archived: conversation.archived,
        isOwner: conversation.is_owner === 1,
        permission: conversation.shared_permission || 'owner',
        tags: tags.map(t => t.tag),
        metadata: JSON.parse(conversation.metadata || '{}'),
      },
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * PUT /api/conversations/:conversationId
 * Update conversation details
 */
app.put('/api/conversations/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;
  const { title, description, archived, folderIds, tags } = req.body;

  try {
    // Verify ownership
    const [conversations] = await pool.query(
      'SELECT user_id FROM conversations WHERE conversation_id = ?',
      [conversationId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversations[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can update conversation' });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (archived !== undefined) {
      updates.push('archived = ?');
      values.push(archived);
    }
    if (folderIds !== undefined) {
      updates.push('folder_ids = ?');
      values.push(JSON.stringify(folderIds));
    }

    if (updates.length > 0) {
      values.push(conversationId);
      await pool.query(
        `UPDATE conversations SET ${updates.join(', ')} WHERE conversation_id = ?`,
        values
      );
    }

    // Update tags if provided
    if (tags !== undefined && Array.isArray(tags)) {
      await pool.query('DELETE FROM conversation_tags WHERE conversation_id = ?', [conversationId]);
      
      if (tags.length > 0) {
        const tagValues = tags.map(tag => [conversationId, tag]);
        await pool.query(
          'INSERT INTO conversation_tags (conversation_id, tag) VALUES ?',
          [tagValues]
        );
      }
    }

    res.json({ success: true, message: 'Conversation updated successfully' });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/**
 * DELETE /api/conversations/:conversationId
 * Delete conversation
 */
app.delete('/api/conversations/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;

  try {
    // Verify ownership
    const [conversations] = await pool.query(
      'SELECT user_id FROM conversations WHERE conversation_id = ?',
      [conversationId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversations[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can delete conversation' });
    }

    // Delete conversation (cascade will delete messages, shares, tags)
    await pool.query('DELETE FROM conversations WHERE conversation_id = ?', [conversationId]);

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * POST /api/conversations/:conversationId/messages
 * Add message to conversation
 */
app.post('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;
  const { role, content, tokens = 0, citedSources = [], contextUsed = [], model, temperature, metadata = {} } = req.body;

  if (!role || !content) {
    return res.status(400).json({ error: 'Role and content are required' });
  }

  if (!['user', 'assistant', 'system'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Verify access to conversation
    const [conversations] = await pool.query(
      `SELECT c.user_id, c.message_count, c.total_tokens
       FROM conversations c
       LEFT JOIN conversation_shares cs ON c.conversation_id = cs.conversation_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.conversation_id = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       LIMIT 1`,
      [conversationId, userId, userId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Insert message
    await pool.query(
      `INSERT INTO messages (message_id, conversation_id, role, content, tokens, cited_sources, context_used, model, temperature, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [messageId, conversationId, role, content, tokens, JSON.stringify(citedSources), JSON.stringify(contextUsed), model, temperature, JSON.stringify(metadata)]
    );

    // Update conversation stats
    await pool.query(
      `UPDATE conversations 
       SET message_count = message_count + 1,
           total_tokens = total_tokens + ?,
           last_message_at = NOW()
       WHERE conversation_id = ?`,
      [tokens, conversationId]
    );

    res.status(201).json({
      success: true,
      message: {
        messageId,
        conversationId,
        role,
        content,
        tokens,
        citedSources,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

/**
 * GET /api/conversations/:conversationId/messages
 * Get conversation messages
 */
app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;
  const { limit = 100, offset = 0 } = req.query;

  try {
    // Verify access to conversation
    const [conversations] = await pool.query(
      `SELECT 1 FROM conversations c
       LEFT JOIN conversation_shares cs ON c.conversation_id = cs.conversation_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.conversation_id = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       LIMIT 1`,
      [conversationId, userId, userId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found or access denied' });
    }

    // Get messages
    const [messages] = await pool.query(
      `SELECT * FROM messages 
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`,
      [conversationId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      messages: messages.map(m => ({
        messageId: m.message_id,
        role: m.role,
        content: m.content,
        tokens: m.tokens,
        citedSources: JSON.parse(m.cited_sources || '[]'),
        contextUsed: JSON.parse(m.context_used || '[]'),
        model: m.model,
        temperature: m.temperature,
        createdAt: m.created_at,
        metadata: JSON.parse(m.metadata || '{}'),
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: messages.length === parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/conversations/:conversationId/share
 * Share conversation with team or user
 */
app.post('/api/conversations/:conversationId/share', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;
  const { shareWith, shareType, permission = 'read' } = req.body;

  if (!shareWith || !shareType) {
    return res.status(400).json({ error: 'shareWith and shareType are required' });
  }

  if (!['user', 'team', 'org'].includes(shareType)) {
    return res.status(400).json({ error: 'Invalid shareType' });
  }

  try {
    // Verify ownership
    const [conversations] = await pool.query(
      'SELECT user_id, org_id FROM conversations WHERE conversation_id = ?',
      [conversationId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversations[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can share conversation' });
    }

    // Insert or update share
    await pool.query(
      `INSERT INTO conversation_shares (conversation_id, shared_with_type, shared_with_id, permission, shared_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE permission = ?, shared_at = NOW()`,
      [conversationId, shareType, shareWith, permission, userId, permission]
    );

    res.json({ success: true, message: 'Conversation shared successfully' });
  } catch (error) {
    console.error('Error sharing conversation:', error);
    res.status(500).json({ error: 'Failed to share conversation' });
  }
});

/**
 * DELETE /api/conversations/:conversationId/share
 * Unshare conversation
 */
app.delete('/api/conversations/:conversationId/share', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { userId } = req.user;
  const { shareWith, shareType } = req.body;

  try {
    // Verify ownership
    const [conversations] = await pool.query(
      'SELECT user_id FROM conversations WHERE conversation_id = ?',
      [conversationId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversations[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can unshare conversation' });
    }

    // Delete share
    await pool.query(
      'DELETE FROM conversation_shares WHERE conversation_id = ? AND shared_with_type = ? AND shared_with_id = ?',
      [conversationId, shareType, shareWith]
    );

    res.json({ success: true, message: 'Conversation unshared successfully' });
  } catch (error) {
    console.error('Error unsharing conversation:', error);
    res.status(500).json({ error: 'Failed to unshare conversation' });
  }
});

// ============================================
// Health & Status
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Start Server
// ============================================

const PORT = config.api.port;
const HOST = config.api.host;

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Enterprise API Server running at http://${HOST}:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${config.database.database}`);
  console.log(`📌 Pinecone Index: ${config.pinecone.indexName}\n`);
});

export default app;

