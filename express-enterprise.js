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
import { generateSummary } from './chatbotClient.js';

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
 * Optionally saves messages to chat if chatId is provided
 */
app.post('/api/orgs/:orgId/chat', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const {
    query,
    chatHistory = [],
    answerMode = 'precise',
    folderIds = [],
    additionalFilters = {},
    chatId = null,  // New: optional chat ID
  } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Validate and sanitize additionalFilters - remove any invalid Pinecone fields
  const sanitizedFilters = {};
  const validMetadataFields = ['folder_id', 'doc_id', 'mime', 'title', 'visibility', 'status', 'team_ids', 'owner_user_id'];
  
  for (const [key, value] of Object.entries(additionalFilters)) {
    if (validMetadataFields.includes(key)) {
      sanitizedFilters[key] = value;
    } else {
      console.warn(`⚠️ Ignoring invalid metadata filter field: ${key}`);
    }
  }

  try {
    // Step 1: If chatId provided, verify access and save user message
    let userMessageId = null;
    if (chatId) {
      // Verify user has access to this chat
      const [chats] = await pool.query(
        `SELECT c.chat_id
         FROM chats c
         LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id
         LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
         WHERE c.chat_id = ?
           AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
         LIMIT 1`,
        [chatId, userId, userId]
      );

      if (chats.length === 0) {
        return res.status(403).json({ error: 'No access to this chat' });
      }

      // Save user message
      userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await pool.query(
        `INSERT INTO messages (message_id, chat_id, role, content, created_by, tokens)
         VALUES (?, ?, 'user', ?, ?, ?)`,
        [userMessageId, chatId, query, userId, 0]
      );

      // Update participant tracking
      await pool.query(
        `INSERT INTO chat_participants (chat_id, user_id, first_message_at, last_message_at, message_count)
         VALUES (?, ?, NOW(), NOW(), 1)
         ON DUPLICATE KEY UPDATE 
           last_message_at = NOW(),
           message_count = message_count + 1`,
        [chatId, userId]
      );
    }

    // Step 2: Generate AI response
    const result = await chatbotClient.generateResponse(
      pool,
      orgId,
      userId,
      query,
      chatHistory,
      { answerMode, folderIds, additionalFilters: sanitizedFilters }
    );

    // Step 3: If chatId provided, save assistant message
    let assistantMessageId = null;
    if (chatId) {
      assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Calculate rough token count (approximation)
      const tokenCount = Math.ceil(result.aiResponse.length / 4);
      
      // Map cited source IDs to just the vector IDs (client only needs IDs to resolve file paths)
      // Client doesn't use text, score, or doc_id - only needs the vector ID to look up file path
      const citedSourceIds = [];
      
      if (result.citedSources && result.citedSources.length > 0) {
        // Only store the vector IDs as strings, not full objects with text/score
        result.citedSources.forEach(sourceId => {
          if (sourceId && typeof sourceId === 'string') {
            citedSourceIds.push(sourceId);
          } else if (sourceId && typeof sourceId === 'object' && sourceId.id) {
            // Handle case where sourceId is an object with id property
            citedSourceIds.push(sourceId.id);
          } else {
            console.warn('⚠️ Skipping invalid sourceId (expected string):', typeof sourceId, sourceId);
          }
        });
      }
      
      // Store lightweight context summary (without full text content) for reference
      const contextSummary = [];
      if (result.context && result.context.length > 0) {
        result.context.forEach(c => {
          if (c.metadata) {
            contextSummary.push({
              id: c.id,
              filename: c.metadata.filename,
              doc_id: c.metadata.doc_id
            });
          }
        });
      }
      
      await pool.query(
        `INSERT INTO messages (message_id, chat_id, role, content, created_by, tokens, cited_sources, context_used, model)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`,
        [
          assistantMessageId, 
          chatId, 
          result.aiResponse, 
          userId,  // AI response attributed to the user who asked
          tokenCount,
          JSON.stringify(citedSourceIds), // Only store vector IDs, not full objects
          JSON.stringify(contextSummary),
          'gpt-4'  // Update with actual model if available
        ]
      );

      // Update chat stats
      await pool.query(
        `UPDATE chats 
         SET message_count = message_count + 2,
             total_tokens = total_tokens + ?,
             last_message_at = NOW()
         WHERE chat_id = ?`,
        [tokenCount, chatId]
      );
    }

    // Create lightweight context for response (avoid sending huge metadata objects)
    const contextForResponse = result.context.map(c => ({
      id: c.id,
      score: c.score,
      filename: c.metadata.filename || 'Unknown',
      doc_id: c.metadata.doc_id || '',
      text: c.metadata.text?.substring(0, 200) || '' // Only first 200 chars for preview
    }));

    res.json({
      success: true,
      response: result.aiResponse,
      citedSources: result.citedSources,
      context: contextForResponse,
      // Include chat info if messages were saved
      ...(chatId && {
        chat: {
          chatId,
          userMessageId,
          assistantMessageId,
          messagesSaved: true
        }
      })
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
        // Access control fields
        org_id: orgId,
        owner_user_id: userId,
        team_ids: teamIds,
        visibility: folder.visibility,
        folder_id: folderId,
        
        // Document identification
        doc_id: docId,
        chunk_no: i,
        
        // File metadata
        filename,
        filepath,
        fileType: metadata.fileType || 'txt',
        mime: metadata.mime || 'text/plain',
        title: filename,
        
        // Content and status
        text: chunk.text,
        status: 'active',
        
        // Timestamps
        created_at: Date.now(),
        updated_at: Date.now(),
        
        // Non-redundant metadata (important for search/reconstruction)
        summary: metadata.summary || '',
        smartFolderNames: metadata.smartFolderNames || [],
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

    // Store document in DB with all fields in dedicated columns
    await pool.query(
      `INSERT INTO documents 
       (doc_id, folder_id, org_id, owner_user_id, filepath, filename, mime_type, file_size, content_hash, chunks, summary, smart_folder_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, 
        folderId, 
        orgId, 
        userId, 
        filepath, 
        filename, 
        metadata.mime || 'text/plain',
        metadata.fileSize || 0,
        metadata.hash || '',
        vectors.length,
        metadata.summary || null,
        JSON.stringify(metadata.smartFolderNames || []),
        'active'
      ]
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

    // Extract unique doc_ids from vector IDs (format: doc_xxx:chunk_no)
    const docIds = [...new Set(ids.map(id => id.split(':')[0]))];
    
    // Update document status in database to 'deleted'
    if (docIds.length > 0) {
      const placeholders = docIds.map(() => '?').join(',');
      await pool.query(
        `UPDATE documents SET status = 'deleted', updated_at = NOW() WHERE doc_id IN (${placeholders})`,
        docIds
      );
      console.log(`📝 Updated ${docIds.length} documents status to 'deleted'`);
    }

    res.json({
      success: true,
      message: `Successfully deleted ${ids.length} vectors`,
      deletedCount: ids.length,
      documentsUpdated: docIds.length,
    });
  } catch (error) {
    console.error('Error deleting vectors:', error);
    res.status(500).json({ error: 'Failed to delete vectors' });
  }
});

/**
 * POST /api/orgs/:orgId/generate-summary
 * Generate summary for document text
 */
app.post('/api/orgs/:orgId/generate-summary', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { text, filename, language = 'en' } = req.body;

  if (!text || !filename) {
    return res.status(400).json({ 
      error: 'text and filename are required' 
    });
  }

  try {
    console.log(`📝 Generating summary for file: ${filename} in language: ${language}`);
    
    // Call generateSummary function from chatbotClient.js
    const result = await generateSummary(text, filename, language);

    res.json({
      success: true,
      summary: result.summary,
      filename: result.filename,
      language: result.language
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    
    // Handle specific error messages from generateSummary
    if (error.message.includes('OpenAI API quota exceeded')) {
      return res.status(429).json({ 
        error: 'OpenAI API quota exceeded. Please try again later.' 
      });
    }
    
    if (error.message.includes('OpenAI API configuration error')) {
      return res.status(500).json({ 
        error: 'OpenAI API configuration error. Please contact support.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate summary',
      message: error.message 
    });
  }
});

/**
 * GET /api/orgs/:orgId/documents
 * Get all documents for an organization (for file index reconstruction)
 */
app.get('/api/orgs/:orgId/documents', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;

  console.log('🔍 Fetching all documents for organization:', { orgId, userId });

  try {
    // Query all active documents for this organization
    const [documents] = await pool.query(
      `SELECT 
        doc_id, folder_id, filepath, filename, mime_type, file_size, content_hash, 
        chunks, summary, smart_folder_ids, status, created_at, updated_at
       FROM documents 
       WHERE org_id = ? AND status = 'active'
       ORDER BY created_at DESC`,
      [orgId]
    );

    console.log(`📋 Found ${documents.length} documents for organization`);

    // Filter documents based on folder access
    const accessibleDocuments = [];
    for (const doc of documents) {
      const hasAccess = await authService.checkFolderAccess(pool, userId, doc.folder_id);
      if (hasAccess) {
        // Parse smart_folder_ids JSON array
        let smartFolderIds = [];
        if (doc.smart_folder_ids) {
          try {
            smartFolderIds = typeof doc.smart_folder_ids === 'string' 
              ? JSON.parse(doc.smart_folder_ids) 
              : doc.smart_folder_ids;
          } catch (e) {
            console.warn('⚠️ Failed to parse smart_folder_ids:', e);
          }
        }

        accessibleDocuments.push({
          docId: doc.doc_id,
          folderId: doc.folder_id,
          filepath: doc.filepath,
          filename: doc.filename,
          mimeType: doc.mime_type,
          fileSize: doc.file_size,
          contentHash: doc.content_hash,
          chunks: doc.chunks,
          summary: doc.summary,
          smartFolderIds: smartFolderIds,
          status: doc.status,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        });
      }
    }

    res.json({
      success: true,
      totalDocuments: documents.length,
      accessibleDocuments: accessibleDocuments.length,
      documents: accessibleDocuments,
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * GET /api/orgs/:orgId/documents/:docId
 * Get document metadata from database
 */
app.get('/api/orgs/:orgId/documents/:docId', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId, docId } = req.params;
  const { userId } = req.user;

  console.log('🔍 Fetching document metadata:', { orgId, docId, userId });

  try {
    // Query document from database
    const [documents] = await pool.query(
      `SELECT 
        doc_id, folder_id, org_id, owner_user_id, filepath, filename, 
        mime_type, file_size, content_hash, chunks, summary, smart_folder_ids,
        status, created_at, updated_at
       FROM documents 
       WHERE doc_id = ? AND org_id = ?`,
      [docId, orgId]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[0];

    // Check folder access
    const hasAccess = await authService.checkFolderAccess(pool, userId, document.folder_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this document' });
    }

    // Parse smart_folder_ids JSON array
    let smartFolderIds = [];
    if (document.smart_folder_ids) {
      try {
        smartFolderIds = typeof document.smart_folder_ids === 'string' 
          ? JSON.parse(document.smart_folder_ids) 
          : document.smart_folder_ids;
      } catch (e) {
        console.warn('⚠️ Failed to parse smart_folder_ids:', e);
      }
    }

    res.json({
      success: true,
      document: {
        docId: document.doc_id,
        folderId: document.folder_id,
        orgId: document.org_id,
        ownerUserId: document.owner_user_id,
        filepath: document.filepath,
        filename: document.filename,
        mimeType: document.mime_type,
        fileSize: document.file_size,
        contentHash: document.content_hash,
        chunks: document.chunks,
        summary: document.summary,
        smartFolderIds: smartFolderIds,
        status: document.status,
        createdAt: document.created_at,
        updatedAt: document.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching document metadata:', error);
    res.status(500).json({ error: 'Failed to fetch document metadata' });
  }
});

/**
 * GET /api/orgs/:orgId/documents/:docId/vectors
 * Fetch all vectors for a document
 */
app.get('/api/orgs/:orgId/documents/:docId/vectors', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId, docId } = req.params;
  const { userId } = req.user;

  console.log('🔍 Fetching all vectors for document:', { orgId, docId, userId });

  try {
    // Fetch vectors from Pinecone
    const namespace = config.pinecone.namespaces.org(orgId);
    const pc = new (await import('@pinecone-database/pinecone')).Pinecone({ 
      apiKey: config.pinecone.apiKey 
    });
    const index = pc.index(config.pinecone.indexName);
    
    // Query for all vectors with this doc_id
    const queryResult = await index.namespace(namespace).query({
      vector: Array(1024).fill(0), // Dummy vector with correct dimension
      topK: 10000, // High number to get all chunks
      filter: { doc_id: docId },
      includeMetadata: true,
      includeValues: false,
    });
    
    if (!queryResult.matches || queryResult.matches.length === 0) {
      console.warn('⚠️ No vectors found for document:', docId);
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`📋 Found ${queryResult.matches.length} vectors for document`);

    // Check access for the first vector (all vectors in same doc should have same access)
    const firstVector = queryResult.matches[0];
    const hasAccess = await authService.checkVectorAccess(pool, userId, firstVector.metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this document' });
    }

    // Sort by chunk_no and return all vectors
    const vectors = queryResult.matches
      .map(match => ({
        vectorId: match.id,
        chunkNo: match.metadata?.chunk_no || 0,
        text: match.metadata?.text || '',
        title: match.metadata?.title || match.metadata?.filename || 'Untitled',
        filename: match.metadata?.filename,
        filepath: match.metadata?.filepath,
      }))
      .sort((a, b) => a.chunkNo - b.chunkNo);

    res.json({
      success: true,
      docId,
      totalChunks: vectors.length,
      vectors,
    });
  } catch (error) {
    console.error('Error fetching document vectors:', error);
    res.status(500).json({ error: 'Failed to fetch document content' });
  }
});

/**
 * GET /api/orgs/:orgId/vectors/:vectorId
 * Fetch specific vector content by ID
 */
app.get('/api/orgs/:orgId/vectors/:vectorId', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId, vectorId } = req.params;
  const { userId } = req.user;

  console.log('🔍 Fetching vector:', { orgId, vectorId, userId });

  try {
    // Fetch vector from Pinecone
    const namespace = config.pinecone.namespaces.org(orgId);
    console.log('📦 Using namespace:', namespace);
    
    const pc = new (await import('@pinecone-database/pinecone')).Pinecone({ 
      apiKey: config.pinecone.apiKey 
    });
    const index = pc.index(config.pinecone.indexName);
    console.log('📊 Using index:', config.pinecone.indexName);
    
    const fetchResult = await index.namespace(namespace).fetch([vectorId]);
    console.log('📡 Fetch result:', { 
      hasRecords: !!fetchResult.records, 
      recordCount: Object.keys(fetchResult.records || {}).length,
      hasVectorId: !!(fetchResult.records && fetchResult.records[vectorId])
    });
    
    if (!fetchResult.records || !fetchResult.records[vectorId]) {
      console.warn('⚠️ Vector not found in Pinecone:', vectorId);
      
      // Try to find vectors with similar docId to help debug
      const docId = vectorId.split(':')[0]; // Extract doc_xxx part
      console.log('🔍 Searching for similar vectors with docId:', docId);
      
      try {
        const queryResult = await index.namespace(namespace).query({
          vector: Array(1024).fill(0), // Dummy vector with correct dimension
          topK: 5,
          filter: { doc_id: docId },
          includeMetadata: true,
          includeValues: false,
        });
        
        if (queryResult.matches && queryResult.matches.length > 0) {
          console.log('📋 Found vectors for this document:');
          queryResult.matches.forEach(match => {
            console.log(`  - ID: ${match.id}, chunk_no: ${match.metadata?.chunk_no}`);
          });
        } else {
          console.log('❌ No vectors found for docId:', docId);
        }
      } catch (err) {
        console.error('Error querying for similar vectors:', err.message);
      }
      
      return res.status(404).json({ error: 'Vector not found' });
    }

    const vector = fetchResult.records[vectorId];
    const metadata = vector.metadata;

    // Check if user has access to this vector
    const hasAccess = await authService.checkVectorAccess(pool, userId, metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this vector' });
    }

    // Query to get total chunks for this document
    let totalChunks = 1;
    try {
      const queryResult = await index.namespace(namespace).query({
        vector: vector.values || Array(1024).fill(0), // Use actual vector or dummy (1024 dimension)
        topK: 10000, // High number to get all chunks
        filter: { doc_id: metadata.doc_id },
        includeMetadata: false,
        includeValues: false,
      });
      totalChunks = queryResult.matches?.length || 1;
    } catch (err) {
      console.error('Error counting chunks:', err);
      // Fall back to parsing from vector ID (format: doc_xxx:chunk_no)
      // We can't easily get total, so just show the current chunk
    }

    res.json({
      success: true,
      vectorId,
      content: {
        text: metadata.text || '',
        title: metadata.title || metadata.filename || 'Untitled',
        filename: metadata.filename,
        filepath: metadata.filepath,
        chunkNo: metadata.chunk_no || 0,
        totalChunks: totalChunks,
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
 * POST /api/orgs/:orgId/vectors/query-all
 * Query all vectors for an organization (used for file index reconstruction)
 */
app.post('/api/orgs/:orgId/vectors/query-all', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { query, topK = 10000, filter } = req.body;

  console.log('🔍 Querying all vectors for organization:', { 
    orgId, 
    userId, 
    topK,
    filter 
  });

  try {
    // Query vectors from Pinecone for this org's namespace
    const namespace = config.pinecone.namespaces.org(orgId);
    console.log('📦 Using namespace:', namespace);
    
    const pc = new (await import('@pinecone-database/pinecone')).Pinecone({ 
      apiKey: config.pinecone.apiKey 
    });
    const index = pc.index(config.pinecone.indexName);
    console.log('📊 Using index:', config.pinecone.indexName);
    
    // Use a dummy vector for querying all vectors
    // The vector dimension should match your Pinecone index (1024 for text-embedding-ada-002)
    const dummyVector = Array(1024).fill(0);
    
    const queryResult = await index.namespace(namespace).query({
      vector: dummyVector,
      topK: topK,
      filter: filter || { filepath: { "$exists": true } },
      includeMetadata: true,
      includeValues: false,
    });
    
    console.log(`✅ Retrieved ${queryResult.matches?.length || 0} vectors from Pinecone for org ${orgId}`);

    // Filter vectors to only include those the user has access to
    const accessibleMatches = [];
    for (const match of queryResult.matches || []) {
      const hasAccess = await authService.checkVectorAccess(pool, userId, match.metadata);
      if (hasAccess) {
        accessibleMatches.push(match);
      }
    }

    console.log(`🔐 User has access to ${accessibleMatches.length} out of ${queryResult.matches?.length || 0} vectors`);

    res.json({
      success: true,
      matches: accessibleMatches,
      totalCount: accessibleMatches.length,
    });
  } catch (error) {
    console.error('❌ Error querying all vectors:', error);
    res.status(500).json({ error: 'Failed to query vectors' });
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
// Chat Management
// ============================================

/**
 * POST /api/orgs/:orgId/chats
 * Create a new chat
 */
app.post('/api/orgs/:orgId/chats', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { title, description, folderIds = [], fileIds = [], metadata = {} } = req.body;

  const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await pool.query(
      `INSERT INTO chats (chat_id, org_id, user_id, title, description, folder_ids, file_ids, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chatId, 
        orgId, 
        userId, 
        title || 'New Chat', 
        description, 
        JSON.stringify(folderIds || []), 
        JSON.stringify(fileIds || []), 
        JSON.stringify(metadata || {})
      ]
    );

    res.status(201).json({
      success: true,
      chat: {
        chatId,
        orgId,
        userId,
        title: title || 'New Chat',
        description,
        folderIds,
        fileIds,
        messageCount: 0,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

/**
 * GET /api/orgs/:orgId/chats
 * List user's chats
 */
app.get('/api/orgs/:orgId/chats', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { archived = 'false', limit = 50, offset = 0 } = req.query;

  try {
    // Get chats owned by user or shared with user
    const [chats] = await pool.query(
      `SELECT DISTINCT c.*
       FROM chats c
       LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id
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
      chats: chats.map(c => ({
        chatId: c.chat_id,
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
        hasMore: chats.length === parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error listing chats:', error);
    res.status(500).json({ error: 'Failed to list chats' });
  }
});

/**
 * GET /api/chats/:chatId
 * Get chat details
 */
app.get('/api/chats/:chatId', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.user;

  try {
    // Check if user has access to this chat
    const [chats] = await pool.query(
      `SELECT c.*, 
              (c.user_id = ?) AS is_owner,
              cs.permission AS shared_permission
       FROM chats c
       LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.chat_id = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       LIMIT 1`,
      [userId, chatId, userId, userId]
    );

    if (chats.length === 0) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    const chat = chats[0];

    // Get tags
    const [tags] = await pool.query(
      'SELECT tag FROM chat_tags WHERE chat_id = ?',
      [chatId]
    );

    // Get participants (for collaborative chats)
    const [participants] = await pool.query(
      `SELECT cp.user_id, u.name, u.email, cp.message_count, cp.first_message_at, cp.last_message_at
       FROM chat_participants cp
       JOIN users u ON cp.user_id = u.user_id
       WHERE cp.chat_id = ?
       ORDER BY cp.first_message_at ASC`,
      [chatId]
    );

    // Helper function to safely parse JSON
    const safeJSONParse = (value, defaultValue = null) => {
      if (!value || value === '' || value === 'null') return defaultValue;
      // If it's already an object/array, return it directly (MySQL auto-parses JSON columns)
      if (typeof value === 'object') return value;
      // Otherwise try to parse the string
      try {
        return JSON.parse(value);
      } catch (e) {
        console.error('Failed to parse JSON from database - type:', typeof value);
        return defaultValue;
      }
    };

    res.json({
      success: true,
      chat: {
        chatId: chat.chat_id,
        orgId: chat.org_id,
        userId: chat.user_id,
        title: chat.title,
        description: chat.description,
        folderIds: safeJSONParse(chat.folder_ids, []),
        fileIds: safeJSONParse(chat.file_ids, []),
        messageCount: chat.message_count,
        totalTokens: chat.total_tokens,
        lastMessageAt: chat.last_message_at,
        createdAt: chat.created_at,
        archived: chat.archived,
        isOwner: chat.is_owner === 1,
        permission: chat.shared_permission || 'owner',
        tags: tags.map(t => t.tag),
        participants: participants.map(p => ({
          userId: p.user_id,
          name: p.name,
          email: p.email,
          messageCount: p.message_count,
          firstMessageAt: p.first_message_at,
          lastMessageAt: p.last_message_at
        })),
        metadata: safeJSONParse(chat.metadata, {}),
      },
    });
  } catch (error) {
    console.error('Error getting chat:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

/**
 * PUT /api/chats/:chatId
 * Update chat details
 */
app.put('/api/chats/:chatId', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.user;
  const { title, description, archived, folderIds, fileIds, tags } = req.body;

  try {
    // Check user's permission level (owner or write access)
    const [access] = await pool.query(
      `SELECT c.user_id,
              cs.permission,
              tm.user_id as team_member
       FROM chats c
       LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id AND tm.user_id = ?
       WHERE c.chat_id = ?
         AND (c.user_id = ? OR cs.shared_with_id = ? OR tm.user_id = ?)
       LIMIT 1`,
      [userId, chatId, userId, userId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const isOwner = access[0].user_id === userId;
    const hasWriteAccess = access[0].permission === 'write' || access[0].team_member;

    // Only owner can update title, description, archived, tags
    if (!isOwner && (title !== undefined || description !== undefined || archived !== undefined || tags !== undefined)) {
      return res.status(403).json({ error: 'Only owner can update chat metadata (title, description, archive, tags)' });
    }

    // Both owner and write users can update folderIds/fileIds (query scope)
    if (!isOwner && !hasWriteAccess && (folderIds !== undefined || fileIds !== undefined)) {
      return res.status(403).json({ error: 'Need write permission to update query scope' });
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
    if (fileIds !== undefined) {
      updates.push('file_ids = ?');
      values.push(JSON.stringify(fileIds));
    }

    if (updates.length > 0) {
      values.push(chatId);
      await pool.query(
        `UPDATE chats SET ${updates.join(', ')} WHERE chat_id = ?`,
        values
      );
    }

    // Update tags if provided
    if (tags !== undefined && Array.isArray(tags)) {
      await pool.query('DELETE FROM chat_tags WHERE chat_id = ?', [chatId]);
      
      if (tags.length > 0) {
        const tagValues = tags.map(tag => [chatId, tag]);
        await pool.query(
          'INSERT INTO chat_tags (chat_id, tag) VALUES ?',
          [tagValues]
        );
      }
    }

    res.json({ success: true, message: 'Chat updated successfully' });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

/**
 * DELETE /api/chats/:chatId
 * Delete chat
 */
app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.user;

  try {
    // Verify ownership
    const [chats] = await pool.query(
      'SELECT user_id FROM chats WHERE chat_id = ?',
      [chatId]
    );

    if (chats.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chats[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can delete chat' });
    }

    // Delete chat (cascade will delete messages, shares, tags)
    await pool.query('DELETE FROM chats WHERE chat_id = ?', [chatId]);

    res.json({ success: true, message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

/**
 * POST /api/chats/:chatId/messages
 * Add message to chat
 */
app.post('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
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
    // Verify access to chat
    const [chats] = await pool.query(
      `SELECT c.user_id, c.message_count, c.total_tokens
       FROM chats c
       LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.chat_id = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       LIMIT 1`,
      [chatId, userId, userId]
    );

    if (chats.length === 0) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Insert message with created_by
    await pool.query(
      `INSERT INTO messages (message_id, chat_id, role, content, created_by, tokens, cited_sources, context_used, model, temperature, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId, 
        chatId, 
        role, 
        content, 
        userId, 
        tokens, 
        JSON.stringify(citedSources || []), 
        JSON.stringify(contextUsed || []), 
        model, 
        temperature, 
        JSON.stringify(metadata || {})
      ]
    );

    // Update chat stats
    await pool.query(
      `UPDATE chats 
       SET message_count = message_count + 1,
           total_tokens = total_tokens + ?,
           last_message_at = NOW()
       WHERE chat_id = ?`,
      [tokens, chatId]
    );

    // Track participant (for collaborative chats)
    await pool.query(
      `INSERT INTO chat_participants (chat_id, user_id, first_message_at, last_message_at, message_count)
       VALUES (?, ?, NOW(), NOW(), 1)
       ON DUPLICATE KEY UPDATE 
         last_message_at = NOW(),
         message_count = message_count + 1`,
      [chatId, userId]
    );

    res.status(201).json({
      success: true,
      message: {
        messageId,
        chatId,
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
 * GET /api/chats/:chatId/messages
 * Get chat messages
 */
app.get('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.user;
  const { limit = 100, offset = 0 } = req.query;

  try {
    // Verify access to chat
    const [chats] = await pool.query(
      `SELECT 1 FROM chats c
       LEFT JOIN chat_shares cs ON c.chat_id = cs.chat_id
       LEFT JOIN team_members tm ON cs.shared_with_type = 'team' AND cs.shared_with_id = tm.team_id
       WHERE c.chat_id = ?
         AND (c.user_id = ? OR tm.user_id = ? OR cs.shared_with_type = 'org')
       LIMIT 1`,
      [chatId, userId, userId]
    );

    if (chats.length === 0) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Get messages with user info for collaborative chats
    const [messages] = await pool.query(
      `SELECT m.*, u.name as created_by_name, u.email as created_by_email
       FROM messages m
       LEFT JOIN users u ON m.created_by = u.user_id
       WHERE m.chat_id = ?
       ORDER BY m.created_at ASC
       LIMIT ? OFFSET ?`,
      [chatId, parseInt(limit), parseInt(offset)]
    );

    // Helper function to safely parse JSON
    const safeJSONParse = (value, defaultValue = null) => {
      if (!value || value === '' || value === 'null') return defaultValue;
      // If it's already an object/array, return it directly (MySQL auto-parses JSON columns)
      if (typeof value === 'object') return value;
      // Otherwise try to parse the string
      try {
        return JSON.parse(value);
      } catch (e) {
        console.error('Failed to parse JSON from database - type:', typeof value);
        return defaultValue;
      }
    };

    res.json({
      success: true,
      messages: messages.map(m => {
        // Ensure citedSources is always an array
        let citedSources = safeJSONParse(m.cited_sources, []);
        if (typeof citedSources === 'number') {
          // If database has a count instead of array, use empty array
          console.warn('⚠️ Database has cited_sources as number (count), expected array:', citedSources);
          citedSources = [];
        } else if (!Array.isArray(citedSources)) {
          // If it's not an array, convert to array or use empty array
          console.warn('⚠️ Database has cited_sources in unexpected format:', typeof citedSources, citedSources);
          citedSources = [];
        }
        
        return {
          messageId: m.message_id,
          role: m.role,
          content: m.content,
          createdBy: m.created_by,
          createdByName: m.created_by_name,
          createdByEmail: m.created_by_email,
          tokens: m.tokens,
          citedSources: citedSources,
          contextUsed: safeJSONParse(m.context_used, []),
          model: m.model,
          temperature: m.temperature,
          createdAt: m.created_at,
          metadata: safeJSONParse(m.metadata, {}),
        };
      }),
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
 * POST /api/chats/:chatId/share
 * Share chat with team or user
 */
app.post('/api/chats/:chatId/share', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
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
    const [chats] = await pool.query(
      'SELECT user_id, org_id FROM chats WHERE chat_id = ?',
      [chatId]
    );

    if (chats.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chats[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can share chat' });
    }

    // Insert or update share
    await pool.query(
      `INSERT INTO chat_shares (chat_id, shared_with_type, shared_with_id, permission, shared_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE permission = ?, shared_at = NOW()`,
      [chatId, shareType, shareWith, permission, userId, permission]
    );

    res.json({ success: true, message: 'Chat shared successfully' });
  } catch (error) {
    console.error('Error sharing chat:', error);
    res.status(500).json({ error: 'Failed to share chat' });
  }
});

/**
 * DELETE /api/chats/:chatId/share
 * Unshare chat
 */
app.delete('/api/chats/:chatId/share', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.user;
  const { shareWith, shareType } = req.body;

  try {
    // Verify ownership
    const [chats] = await pool.query(
      'SELECT user_id FROM chats WHERE chat_id = ?',
      [chatId]
    );

    if (chats.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (chats[0].user_id !== userId) {
      return res.status(403).json({ error: 'Only owner can unshare chat' });
    }

    // Delete share
    await pool.query(
      'DELETE FROM chat_shares WHERE chat_id = ? AND shared_with_type = ? AND shared_with_id = ?',
      [chatId, shareType, shareWith]
    );

    res.json({ success: true, message: 'Chat unshared successfully' });
  } catch (error) {
    console.error('Error unsharing chat:', error);
    res.status(500).json({ error: 'Failed to unshare chat' });
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

