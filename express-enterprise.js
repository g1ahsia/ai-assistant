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
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import config from './config-enterprise.js';
import authService from './authService.js';
import chatbotClient from './chatbotClient-enterprise.js';
import { generateSummary } from './chatbotClient.js';

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();

// Middleware
app.use(cors({ origin: config.api.corsOrigins }));
app.use(express.json({ limit: '50mb' })); // Increased limit for document uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static('.', {
  extensions: ['html'],
  index: false // Don't auto-serve index.html
}));

// Serve public folder for invitation pages and assets
app.use('/public', express.static('public'));

// Database connection pool
const pool = mysql.createPool(config.database);

// ============================================
// Organization Invitation System Configuration
// ============================================

/**
 * Email transporter configuration
 * Configure based on your email service provider
 * Lazy initialization to avoid startup errors
 */
let emailTransporter = null;

function getEmailTransporter() {
  if (!emailTransporter) {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }
  return emailTransporter;
}

/**
 * Rate limiting configuration for invitations
 */
const INVITATION_RATE_LIMITS = {
  INVITATIONS_PER_ORG_PER_HOUR: 10,
  INVITATIONS_PER_EMAIL_PER_DAY: 3,
  MAX_PENDING_INVITATIONS_PER_ORG: 100
};

/**
 * Invitation configuration
 */
const INVITATION_CONFIG = {
  TOKEN_LENGTH: 32, // bytes (64 hex characters)
  EXPIRATION_DAYS: 7,
  ALLOWED_ROLES: ['admin', 'member'],
  MAX_MESSAGE_LENGTH: 1000
};

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
// Organization Invitation Helper Functions
// ============================================

/**
 * Generate secure invitation token
 */
function generateInvitationToken() {
  return crypto.randomBytes(INVITATION_CONFIG.TOKEN_LENGTH).toString('hex');
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Check if user has admin/owner role in organization
 */
async function isOrgAdmin(userId, orgId) {
  const [members] = await pool.query(
    'SELECT role FROM org_members WHERE user_id = ? AND org_id = ?',
    [userId, orgId]
  );
  
  if (members.length === 0) return false;
  return ['admin', 'owner'].includes(members[0].role);
}

/**
 * Check rate limits for invitations
 */
async function checkInvitationRateLimits(orgId, email) {
  // Check invitations per org per hour
  const [orgInvitations] = await pool.query(
    `SELECT COUNT(*) as count FROM org_invitations 
     WHERE org_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [orgId]
  );
  
  if (orgInvitations[0].count >= INVITATION_RATE_LIMITS.INVITATIONS_PER_ORG_PER_HOUR) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded: Maximum invitations per hour reached'
    };
  }
  
  // Check invitations per email per day
  const [emailInvitations] = await pool.query(
    `SELECT COUNT(*) as count FROM org_invitations 
     WHERE invitee_email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    [email]
  );
  
  if (emailInvitations[0].count >= INVITATION_RATE_LIMITS.INVITATIONS_PER_EMAIL_PER_DAY) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded: Maximum invitations to this email reached'
    };
  }
  
  // Check total pending invitations for org
  const [pendingInvitations] = await pool.query(
    `SELECT COUNT(*) as count FROM org_invitations 
     WHERE org_id = ? AND status = 'pending'`,
    [orgId]
  );
  
  if (pendingInvitations[0].count >= INVITATION_RATE_LIMITS.MAX_PENDING_INVITATIONS_PER_ORG) {
    return {
      allowed: false,
      reason: 'Too many pending invitations. Please revoke some before creating new ones.'
    };
  }
  
  return { allowed: true };
}

/**
 * Send invitation email to invitee
 */
async function sendInvitationEmail(invitation, org, inviter) {
  const invitationLink = `${process.env.APP_URL || 'http://localhost:3000'}/accept-invitation/${invitation.invitation_token}`;
  
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 30px; text-align: center; border-radius: 8px; }
        .content { padding: 30px 0; }
        .button { 
          display: inline-block; 
          background-color: #007AFF; 
          color: white; 
          padding: 12px 30px; 
          text-decoration: none; 
          border-radius: 6px;
          font-weight: 600;
        }
        .footer { color: #8e8e93; font-size: 12px; padding-top: 20px; border-top: 1px solid #e0e0e0; }
        .message { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; font-style: italic; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>You're invited to join ${org.name} on Panlo</h2>
        </div>
        
        <div class="content">
          <p>Hi,</p>
          
          <p><strong>${inviter.name || inviter.email}</strong> has invited you to join <strong>${org.name}</strong> on Panlo as a <strong>${invitation.role}</strong>.</p>
          
          ${invitation.message ? `
            <div class="message">
              "${invitation.message}"
            </div>
          ` : ''}
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${invitationLink}" class="button">Accept Invitation</a>
          </p>
          
          <p style="color: #8e8e93; font-size: 14px;">
            Or copy and paste this link into your browser:<br>
            <a href="${invitationLink}">${invitationLink}</a>
          </p>
          
          <p style="color: #8e8e93; font-size: 14px;">
            This invitation will expire in ${INVITATION_CONFIG.EXPIRATION_DAYS} days.
          </p>
        </div>
        
        <div class="footer">
          <p>Panlo - Your AI Assistant<br>
          This email was sent to ${invitation.invitee_email}</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const emailText = `
You're invited to join ${org.name} on Panlo

${inviter.name || inviter.email} has invited you to join ${org.name} on Panlo as a ${invitation.role}.

${invitation.message ? `Message: "${invitation.message}"` : ''}

Accept invitation: ${invitationLink}

This invitation will expire in ${INVITATION_CONFIG.EXPIRATION_DAYS} days.

---
Panlo - Your AI Assistant
This email was sent to ${invitation.invitee_email}
  `;
  
  try {
    const transporter = getEmailTransporter();
    await transporter.sendMail({
      from: `"Panlo" <${process.env.EMAIL_FROM || 'noreply@panlo.com'}>`,
      to: invitation.invitee_email,
      subject: `You're invited to join ${org.name} on Panlo`,
      text: emailText,
      html: emailHtml
    });
    
    console.log(`✅ Invitation email sent to ${invitation.invitee_email}`);
  } catch (error) {
    console.error('❌ Error sending invitation email:', error);
    // Don't throw - invitation created successfully even if email fails
  }
}

/**
 * Log invitation activity
 */
async function logInvitationActivity(invitationId, activityType, userId, details, req) {
  try {
    await pool.query(
      `INSERT INTO org_invitation_activity 
       (invitation_id, activity_type, user_id, ip_address, user_agent, details) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        invitationId,
        activityType,
        userId || null,
        req ? (req.ip || req.connection.remoteAddress) : null,
        req ? req.get('user-agent') : null,
        JSON.stringify(details || {})
      ]
    );
  } catch (error) {
    console.error('Error logging invitation activity:', error);
  }
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

/**
 * PUT /api/users/me
 * Update current user's profile (e.g., switch organization)
 */
app.put('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    const { currentOrgId } = req.body;

    if (!currentOrgId) {
      return res.status(400).json({ error: 'currentOrgId is required' });
    }

    // Verify user is a member of the target organization
    const [membership] = await pool.query(
      'SELECT role FROM org_members WHERE org_id = ? AND user_id = ?',
      [currentOrgId, userId]
    );

    if (membership.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    // Update user's current organization
    await pool.query(
      'UPDATE users SET current_org_id = ? WHERE user_id = ?',
      [currentOrgId, userId]
    );

    // Get organization details
    const [orgs] = await pool.query(
      'SELECT org_id, name, namespace, plan FROM orgs WHERE org_id = ?',
      [currentOrgId]
    );

    if (orgs.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgs[0];

    res.json({
      success: true,
      currentOrgId: org.org_id,
      organizationName: org.name,
      namespace: org.namespace,
      plan: org.plan,
      role: membership[0].role,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
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
// Spaces Endpoints (TO BE IMPLEMENTED)
// ============================================

/*
 * SPACES SYSTEM API ENDPOINTS
 * 
 * Spaces are the primary organizational unit for documents.
 * Each space is a collaborative workspace with:
 * - Role-based access (owner/contributor/viewer)
 * - Many-to-many file relationships
 * - Member management
 * - Activity tracking
 * 
 * See SPACES-SYSTEM.md for complete documentation.
 */

/**
 * POST /api/orgs/:orgId/spaces
 * Create a new space (personal or team)
 * 
 * @auth Required - User must be org member
 * @body {
 *   name: string (required),
 *   description: string (optional),
 *   space_type: 'personal' | 'team' (default: 'team'),
 *   visibility: 'private' | 'shared' (default: 'private')
 * }
 * @returns {
 *   success: true,
 *   space: {
 *     spaceId, orgId, name, description,
 *     space_type, visibility, owner_user_id,
 *     created_at
 *   }
 * }
 * 
 * Implementation:
 * 1. Generate space_id
 * 2. Insert into spaces table
 * 3. Add creator as owner in space_members
 * 4. Log activity in space_activity
 * 5. Return space details
 */

/**
 * GET /api/orgs/:orgId/spaces
 * Get user's accessible spaces
 * 
 * @auth Required
 * @query {
 *   space_type: 'personal' | 'team' (optional filter),
 *   limit: number (default: 50),
 *   offset: number (default: 0)
 * }
 * @returns {
 *   success: true,
 *   spaces: [{
 *     spaceId, name, description,
 *     space_type, visibility,
 *     role, // user's role in this space
 *     file_count, member_count,
 *     created_at, updated_at
 *   }]
 * }
 * 
 * Implementation:
 * 1. Query spaces table with space_members join
 * 2. Filter by user_id in space_members
 * 3. Include aggregated counts
 * 4. Return sorted by updated_at DESC
 */

/**
 * GET /api/spaces/:spaceId
 * Get space details
 * 
 * @auth Required - User must be space member
 * @returns {
 *   success: true,
 *   space: {
 *     spaceId, orgId, name, description,
 *     space_type, visibility, owner_user_id,
 *     settings, created_at, updated_at,
 *     userRole, // current user's role
 *     file_count, member_count
 *   }
 * }
 */

/**
 * PUT /api/spaces/:spaceId
 * Update space details
 * 
 * @auth Required - Owner only
 * @body {
 *   name: string (optional),
 *   description: string (optional),
 *   visibility: 'private' | 'shared' (optional)
 * }
 * @returns { success: true }
 * 
 * Implementation:
 * 1. Verify user is owner
 * 2. Update spaces table
 * 3. Log activity
 */

/**
 * DELETE /api/spaces/:spaceId
 * Delete space
 * 
 * @auth Required - Owner only
 * @returns { success: true }
 * 
 * Implementation:
 * 1. Verify user is owner
 * 2. Cannot delete personal spaces
 * 3. CASCADE deletes: space_members, space_files, space_activity
 * 4. Log activity before deletion
 */

/**
 * POST /api/spaces/:spaceId/members
 * Add member to space
 * 
 * @auth Required - Owner only
 * @body {
 *   userId: string (required),
 *   role: 'owner' | 'contributor' | 'viewer' (required)
 * }
 * @returns { success: true }
 * 
 * Implementation:
 * 1. Verify requester is owner
 * 2. Verify target user is org member
 * 3. Insert into space_members
 * 4. Log activity
 * 5. Send notification to added user
 */

/**
 * DELETE /api/spaces/:spaceId/members/:userId
 * Remove member from space
 * 
 * @auth Required - Owner only
 * @returns { success: true }
 * 
 * Implementation:
 * 1. Verify requester is owner
 * 2. Cannot remove owner
 * 3. Delete from space_members
 * 4. Log activity
 */

/**
 * PUT /api/spaces/:spaceId/members/:userId
 * Update member role
 * 
 * @auth Required - Owner only
 * @body { role: 'owner' | 'contributor' | 'viewer' }
 * @returns { success: true }
 * 
 * Implementation:
 * 1. Verify requester is owner
 * 2. Update space_members.role
 * 3. Log activity
 */

/**
 * GET /api/spaces/:spaceId/members
 * Get space members
 * 
 * @auth Required - Space member
 * @returns {
 *   success: true,
 *   members: [{
 *     userId, name, email, avatar_url,
 *     role, joined_at, added_by
 *   }]
 * }
 */

/**
 * POST /api/spaces/:spaceId/files
 * Add existing documents to space
 * 
 * @auth Required - Owner or Contributor
 * @body {
 *   docIds: string[] (required: document IDs to add),
 *   notes: string (optional),
 *   tags: string[] (optional)
 * }
 * @returns {
 *   success: true,
 *   added_count: number
 * }
 * 
 * Implementation:
 * 1. Verify user role (owner/contributor)
 * 2. Verify all documents exist in org
 * 3. Insert into space_files (ignore duplicates)
 * 4. Log activity
 * 
 * Note: To upload NEW documents, use POST /api/spaces/:spaceId/upload
 */

/**
 * POST /api/spaces/:spaceId/upload
 * Upload and index a NEW document to a space
 * 
 * @auth Required - Owner or Contributor
 * @body {
 *   filepath: string (required),
 *   filename: string (required),
 *   chunks: array (required: text chunks),
 *   metadata: { mime, fileSize, hash, summary } (optional)
 * }
 * @returns {
 *   success: true,
 *   docId: string,
 *   spaceId: string,
 *   vectorCount: number
 * }
 * 
 * Implementation:
 * 1. Verify user role (owner/contributor)
 * 2. Generate embeddings for chunks
 * 3. Upsert vectors to Pinecone
 * 4. Insert document into documents table
 * 5. Add document to space via space_files
 * 6. Log activity
 */

/**
 * DELETE /api/spaces/:spaceId/files/:docId
 * Remove file from space
 * 
 * @auth Required
 *   - Owner: can remove any file
 *   - Contributor: can only remove files they added
 *   - Viewer: cannot remove files
 * @returns { success: true }
 * 
 * Implementation:
 * 1. Get user role in space
 * 2. If contributor, verify added_by = userId
 * 3. If owner, allow
 * 4. Delete from space_files
 * 5. Log activity
 * 6. Note: File still exists in documents table
 */

/**
 * GET /api/spaces/:spaceId/files
 * Get files in space
 * 
 * @auth Required - Space member
 * @query {
 *   limit: number (default: 100),
 *   offset: number (default: 0),
 *   sortBy: 'added_at' | 'filename' (default: 'added_at'),
 *   order: 'asc' | 'desc' (default: 'desc')
 * }
 * @returns {
 *   success: true,
 *   files: [{
 *     docId, filename, filepath, mime_type,
 *     file_size, chunks, summary,
 *     added_at, added_by, added_by_name,
 *     notes, tags
 *   }]
 * }
 */

/**
 * POST /api/spaces/:spaceId/query
 * Query AI with space context
 * 
 * @auth Required - Space member (all roles can query)
 * @body {
 *   query: string (required),
 *   chatHistory: array (optional),
 *   answerMode: 'precise' | 'comprehensive' (default: 'precise'),
 *   chatId: string (optional - to save message)
 * }
 * @returns {
 *   success: true,
 *   response: string, // AI response
 *   citedSources: string[], // vector IDs
 *   context: array, // matched vectors
 *   chat: { chatId, userMessageId, assistantMessageId } // if chatId provided
 * }
 * 
 * Implementation:
 * 1. Verify user is space member
 * 2. Get all doc_ids from space_files for this space
 * 3. Build Pinecone filter: { doc_id: { $in: docIds } }
 * 4. Call chatbotClient.generateResponse with filter
 * 5. If chatId, save messages
 * 6. Log query activity in space_activity
 */

/**
 * POST /api/orgs/:orgId/spaces/query
 * Query AI across multiple spaces
 * 
 * @auth Required
 * @body {
 *   query: string (required),
 *   spaceIds: string[] (required),
 *   chatHistory: array (optional),
 *   answerMode: string (optional)
 * }
 * @returns { same as single space query }
 * 
 * Implementation:
 * 1. Verify user is member of ALL specified spaces
 * 2. Get all doc_ids from space_files for all spaces
 * 3. Build combined Pinecone filter
 * 4. Generate AI response
 * 5. Log activity in all queried spaces
 */

/**
 * PUT /api/users/me
 * Update user profile (including current space)
 * 
 * @auth Required
 * @body {
 *   currentOrgId: string (optional),
 *   currentSpaceId: string (optional)
 * }
 * @returns {
 *   success: true,
 *   currentOrgId: string,
 *   organizationName: string,
 *   currentSpaceId: string,
 *   spaceName: string
 * }
 * 
 * Implementation:
 * 1. If currentSpaceId provided:
 *    - Verify user is space member
 *    - Update users.current_space_id
 * 2. If currentOrgId provided:
 *    - Verify user is org member
 *    - Update users.current_org_id
 * 3. Return updated info
 * 
 * Note: This endpoint already exists but needs to be updated
 * to support currentSpaceId parameter
 */

/**
 * GET /api/spaces/:spaceId/activity
 * Get space activity log
 * 
 * @auth Required - Space member
 * @query {
 *   limit: number (default: 50),
 *   offset: number (default: 0),
 *   activity_type: string (optional filter)
 * }
 * @returns {
 *   success: true,
 *   activities: [{
 *     activity_id, activity_type,
 *     user_id, user_name,
 *     details, created_at
 *   }]
 * }
 */

// ============================================
// Spaces Management Endpoints (IMPLEMENTATION)
// ============================================

/**
 * GET /api/orgs/:orgId/spaces
 * Get user's accessible spaces
 */
app.get('/api/orgs/:orgId/spaces', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { space_type, limit = 50, offset = 0 } = req.query;

  try {
    // Build query with optional space_type filter
    let query = `
      SELECT 
        s.space_id, s.org_id, s.name, s.description,
        s.space_type, s.visibility, s.owner_user_id,
        s.created_at, s.updated_at,
        sm.role,
        (SELECT COUNT(*) FROM space_files WHERE space_id = s.space_id) AS file_count,
        (SELECT COUNT(*) FROM space_members WHERE space_id = s.space_id) AS member_count
      FROM spaces s
      INNER JOIN space_members sm ON s.space_id = sm.space_id
      WHERE s.org_id = ? AND sm.user_id = ?
    `;

    const params = [orgId, userId];

    if (space_type && ['personal', 'team'].includes(space_type)) {
      query += ' AND s.space_type = ?';
      params.push(space_type);
    }

    query += ' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [spaces] = await pool.query(query, params);

    res.json({
      success: true,
      spaces: spaces.map(s => ({
        spaceId: s.space_id,
        orgId: s.org_id,
        name: s.name,
        description: s.description,
        spaceType: s.space_type,
        visibility: s.visibility,
        ownerUserId: s.owner_user_id,
        role: s.role,
        fileCount: s.file_count,
        memberCount: s.member_count,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching spaces:', error);
    res.status(500).json({ error: 'Failed to fetch spaces' });
  }
});

/**
 * POST /api/orgs/:orgId/spaces
 * Create a new space
 */
app.post('/api/orgs/:orgId/spaces', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { name, description, space_type = 'team', visibility = 'private' } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Space name is required' });
  }

  if (!['personal', 'team'].includes(space_type)) {
    return res.status(400).json({ error: 'Invalid space_type' });
  }

  if (!['private', 'shared'].includes(visibility)) {
    return res.status(400).json({ error: 'Invalid visibility' });
  }

  const spaceId = `space_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Create space
    await pool.query(
      `INSERT INTO spaces (space_id, org_id, name, description, space_type, visibility, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [spaceId, orgId, name, description || null, space_type, visibility, userId]
    );

    // Add creator as owner
    await pool.query(
      `INSERT INTO space_members (space_id, user_id, role, added_by)
       VALUES (?, ?, 'owner', ?)`,
      [spaceId, userId, userId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO space_activity (space_id, user_id, activity_type, details)
       VALUES (?, ?, 'space_created', ?)`,
      [spaceId, userId, JSON.stringify({ name, space_type })]
    );

    res.status(201).json({
      success: true,
      space: {
        spaceId,
        orgId,
        name,
        description,
        spaceType: space_type,
        visibility,
        ownerUserId: userId,
        role: 'owner',
        fileCount: 0,
        memberCount: 1,
      },
    });
  } catch (error) {
    console.error('Error creating space:', error);
    res.status(500).json({ error: 'Failed to create space' });
  }
});

/**
 * GET /api/spaces/:spaceId
 * Get space details
 */
app.get('/api/spaces/:spaceId', authenticateToken, async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.user;

  try {
    // Verify user is space member
    const [members] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this space' });
    }

    // Get space details
    const [spaces] = await pool.query(
      `SELECT 
        s.*,
        (SELECT COUNT(*) FROM space_files WHERE space_id = s.space_id) AS file_count,
        (SELECT COUNT(*) FROM space_members WHERE space_id = s.space_id) AS member_count
       FROM spaces s
       WHERE s.space_id = ?`,
      [spaceId]
    );

    if (spaces.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    const space = spaces[0];

    res.json({
      success: true,
      space: {
        spaceId: space.space_id,
        orgId: space.org_id,
        name: space.name,
        description: space.description,
        spaceType: space.space_type,
        visibility: space.visibility,
        ownerUserId: space.owner_user_id,
        userRole: members[0].role,
        fileCount: space.file_count,
        memberCount: space.member_count,
        createdAt: space.created_at,
        updatedAt: space.updated_at,
        settings: space.settings,
      },
    });
  } catch (error) {
    console.error('Error fetching space:', error);
    res.status(500).json({ error: 'Failed to fetch space' });
  }
});

/**
 * GET /api/spaces/:spaceId/files
 * Get files in space
 */
app.get('/api/spaces/:spaceId/files', authenticateToken, async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.user;
  const { limit = 100, offset = 0, sortBy = 'added_at', order = 'desc' } = req.query;

  try {
    // Verify user is space member
    const [members] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this space' });
    }

    // Get files
    const validSortFields = ['added_at', 'filename', 'file_size', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'added_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const query = `
      SELECT 
        d.doc_id, d.filename, d.filepath, d.mime_type,
        d.file_size, d.chunks, d.summary, d.status,
        d.created_at, d.updated_at,
        sf.added_at, sf.added_by, sf.notes, sf.tags,
        u.name AS added_by_name
      FROM space_files sf
      INNER JOIN documents d ON sf.doc_id = d.doc_id
      LEFT JOIN users u ON sf.added_by = u.user_id
      WHERE sf.space_id = ?
      ORDER BY ${sortField === 'filename' ? 'd.filename' : sortField === 'file_size' ? 'd.file_size' : sortField === 'created_at' ? 'd.created_at' : 'sf.added_at'} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [files] = await pool.query(query, [spaceId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      files: files.map(f => ({
        docId: f.doc_id,
        filename: f.filename,
        filepath: f.filepath,
        mimeType: f.mime_type,
        fileSize: f.file_size,
        chunks: f.chunks,
        summary: f.summary,
        status: f.status,
        addedAt: f.added_at,
        addedBy: f.added_by,
        addedByName: f.added_by_name,
        notes: f.notes,
        tags: typeof f.tags === 'string' ? JSON.parse(f.tags || '[]') : f.tags,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching space files:', error);
    res.status(500).json({ error: 'Failed to fetch space files' });
  }
});

/**
 * GET /api/spaces/:spaceId/members
 * Get space members
 */
app.get('/api/spaces/:spaceId/members', authenticateToken, async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.user;

  try {
    // Verify user is space member
    const [userMembership] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (userMembership.length === 0) {
      return res.status(403).json({ error: 'Not a member of this space' });
    }

    // Get all members
    const [members] = await pool.query(
      `SELECT 
        sm.user_id, sm.role, sm.joined_at, sm.added_by,
        u.name, u.email, u.avatar_url,
        adder.name AS added_by_name
       FROM space_members sm
       INNER JOIN users u ON sm.user_id = u.user_id
       LEFT JOIN users adder ON sm.added_by = adder.user_id
       WHERE sm.space_id = ?
       ORDER BY sm.joined_at ASC`,
      [spaceId]
    );

    res.json({
      success: true,
      members: members.map(m => ({
        userId: m.user_id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatar_url,
        role: m.role,
        joinedAt: m.joined_at,
        addedBy: m.added_by,
        addedByName: m.added_by_name,
      })),
    });
  } catch (error) {
    console.error('Error fetching space members:', error);
    res.status(500).json({ error: 'Failed to fetch space members' });
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
    spaceIds = [],      // NEW: query specific spaces
    additionalFilters = {},
    chatId = null,  // Optional chat ID to save messages
  } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Validate and sanitize additionalFilters - remove any invalid Pinecone fields
  const sanitizedFilters = {};
  const validMetadataFields = ['doc_id', 'mime', 'title', 'status', 'owner_user_id', 'filepath', 'filename'];
  
  for (const [key, value] of Object.entries(additionalFilters)) {
    if (validMetadataFields.includes(key)) {
      sanitizedFilters[key] = value;
    } else {
      console.warn(`⚠️ Ignoring invalid metadata filter field: ${key}`);
    }
  }

  // If spaceIds provided, filter by space_ids in Pinecone metadata
  if (spaceIds && spaceIds.length > 0) {
    try {
      // Verify user has access to all specified spaces
      const placeholders = spaceIds.map(() => '?').join(',');
      const [spaces] = await pool.query(
        `SELECT DISTINCT sm.space_id
         FROM space_members sm
         WHERE sm.space_id IN (${placeholders}) AND sm.user_id = ?`,
        [...spaceIds, userId]
      );

      if (spaces.length !== spaceIds.length) {
        return res.status(403).json({ error: 'No access to one or more specified spaces' });
      }

      // Add space_ids filter for Pinecone
      if (spaceIds.length === 1) {
        sanitizedFilters.space_ids = spaceIds[0];
      } else {
        sanitizedFilters.space_ids = { $in: spaceIds };
      }
    } catch (error) {
      console.error('Error filtering by spaces:', error);
      return res.status(500).json({ error: 'Failed to filter by spaces' });
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
      { answerMode, additionalFilters: sanitizedFilters }
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
 * Query organization documents (no AI response, just vector search)
 * Deprecated: Use /api/orgs/:orgId/chat with spaceIds instead
 */
app.post('/api/orgs/:orgId/query', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { query, spaceIds = [], topK, threshold } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Build filter based on spaceIds if provided
    let additionalFilters = {};
    
    if (spaceIds && spaceIds.length > 0) {
      // Verify user has access to spaces
      const placeholders = spaceIds.map(() => '?').join(',');
      const [spaces] = await pool.query(
        `SELECT DISTINCT sm.space_id
         FROM space_members sm
         WHERE sm.space_id IN (${placeholders}) AND sm.user_id = ?`,
        [...spaceIds, userId]
      );

      if (spaces.length !== spaceIds.length) {
        return res.status(403).json({ error: 'No access to one or more specified spaces' });
      }

      // Add space_ids filter for Pinecone
      if (spaceIds.length === 1) {
        additionalFilters.space_ids = spaceIds[0];
      } else {
        additionalFilters.space_ids = { $in: spaceIds };
      }
    }

    const matches = await chatbotClient.queryWithAuth(
      pool,
      orgId,
      userId,
      query,
      { additionalFilters, topK, threshold }
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
 * POST /api/spaces/:spaceId/upload
 * Upload and index document to a space
 * Documents must be uploaded to a space (space membership controls access)
 */
app.post('/api/spaces/:spaceId/upload', authenticateToken, async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.user;
  const { filepath, filename, chunks, metadata = {} } = req.body;

  if (!filepath || !filename || !chunks || !Array.isArray(chunks)) {
    return res.status(400).json({ 
      error: 'filepath, filename, and chunks array are required' 
    });
  }

  const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Verify user has contributor or owner role in space
    const [members] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this space' });
    }

    const role = members[0].role;
    if (role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot upload files' });
    }

    // Get space details for org_id
    const [spaces] = await pool.query(
      'SELECT org_id FROM spaces WHERE space_id = ?',
      [spaceId]
    );

    if (spaces.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    const orgId = spaces[0].org_id;

    // Build vectors with org-level metadata
    // Access control managed via space_ids array
    const vectors = chunks.map((chunk, i) => ({
      id: `${docId}:${i}`,
      text: chunk.text,
      metadata: {
        // Core identification
        org_id: orgId,
        owner_user_id: userId,
        doc_id: docId,
        chunk_no: i,
        
        // Space associations (for access control)
        space_ids: [spaceId],  // Initially just this space
        
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
        
        // Optional metadata
        summary: metadata.summary || '',
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

    // Store document in DB
    await pool.query(
      `INSERT INTO documents 
       (doc_id, org_id, owner_user_id, filepath, filename, mime_type, file_size, content_hash, chunks, summary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, 
        orgId, 
        userId, 
        filepath, 
        filename, 
        metadata.mime || 'text/plain',
        metadata.fileSize || 0,
        metadata.hash || '',
        vectors.length,
        metadata.summary || null,
        'active'
      ]
    );

    // Add document to space
    await pool.query(
      `INSERT INTO space_files (space_id, doc_id, added_by)
       VALUES (?, ?, ?)`,
      [spaceId, docId, userId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO space_activity (space_id, user_id, activity_type, details)
       VALUES (?, ?, 'file_added', ?)`,
      [spaceId, userId, JSON.stringify({ doc_id: docId, filename })]
    );

    res.status(201).json({
      success: true,
      docId,
      spaceId,
      vectorCount: vectors.length,
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * Helper: Update space_ids in Pinecone for a document
 * Called when adding/removing files from spaces
 */
async function updateDocumentSpaceIds(orgId, docId, spaceId, action = 'add') {
  try {
    const pc = new (await import('@pinecone-database/pinecone')).Pinecone({ 
      apiKey: config.pinecone.apiKey 
    });
    const indexName = config.pinecone.indexName;
    const index = pc.index(indexName);
    const namespace = `org_${orgId}`;

    // Get document metadata to find chunk count
    const [docs] = await pool.query(
      'SELECT chunks FROM documents WHERE doc_id = ?',
      [docId]
    );

    if (docs.length === 0) {
      throw new Error(`Document ${docId} not found`);
    }

    const chunkCount = docs[0].chunks;
    const vectorIds = [];
    for (let i = 0; i < chunkCount; i++) {
      vectorIds.push(`${docId}:${i}`);
    }

    // Fetch current vectors to get their metadata
    const fetchResult = await index.namespace(namespace).fetch(vectorIds);
    
    // Update each vector's space_ids
    const updates = [];
    for (const [vectorId, vector] of Object.entries(fetchResult.records || {})) {
      if (!vector || !vector.metadata) continue;

      const currentSpaceIds = vector.metadata.space_ids || [];
      let newSpaceIds;

      if (action === 'add') {
        // Add space to array (avoid duplicates)
        newSpaceIds = [...new Set([...currentSpaceIds, spaceId])];
      } else if (action === 'remove') {
        // Remove space from array
        newSpaceIds = currentSpaceIds.filter(id => id !== spaceId);
      }

      updates.push({
        id: vectorId,
        metadata: { space_ids: newSpaceIds }
      });
    }

    // Batch update vectors (Pinecone supports up to 100 per batch)
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      // Update each vector in the batch
      for (const update of batch) {
        await index.namespace(namespace).update({
          id: update.id,
          metadata: update.metadata
        });
      }
    }

    console.log(`✅ Updated ${updates.length} vectors for doc ${docId}: ${action} space ${spaceId}`);
    return { success: true, updatedCount: updates.length };
  } catch (error) {
    console.error(`Error updating space_ids for ${docId}:`, error);
    throw error;
  }
}

/**
 * POST /api/spaces/:spaceId/files
 * Add existing documents to a space
 */
app.post('/api/spaces/:spaceId/files', authenticateToken, async (req, res) => {
  const { spaceId } = req.params;
  const { userId } = req.user;
  const { docIds, notes, tags = [] } = req.body;

  if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
    return res.status(400).json({ 
      error: 'docIds array is required' 
    });
  }

  try {
    // Verify user has contributor or owner role in space
    const [members] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this space' });
    }

    const role = members[0].role;
    if (role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot add files' });
    }

    // Get space details
    const [spaces] = await pool.query(
      'SELECT org_id FROM spaces WHERE space_id = ?',
      [spaceId]
    );

    if (spaces.length === 0) {
      return res.status(404).json({ error: 'Space not found' });
    }

    const orgId = spaces[0].org_id;

    // Verify all documents exist and belong to this org
    const placeholders = docIds.map(() => '?').join(',');
    const [docs] = await pool.query(
      `SELECT doc_id, filename FROM documents WHERE doc_id IN (${placeholders}) AND org_id = ?`,
      [...docIds, orgId]
    );

    if (docs.length !== docIds.length) {
      return res.status(404).json({ 
        error: 'One or more documents not found or not in this organization' 
      });
    }

    let addedCount = 0;
    const results = [];

    for (const doc of docs) {
      try {
        // Check if already in space
        const [existing] = await pool.query(
          'SELECT 1 FROM space_files WHERE space_id = ? AND doc_id = ?',
          [spaceId, doc.doc_id]
        );

        if (existing.length > 0) {
          results.push({ doc_id: doc.doc_id, status: 'already_exists' });
          continue;
        }

        // Add to space_files table
        await pool.query(
          `INSERT INTO space_files (space_id, doc_id, added_by, notes, tags)
           VALUES (?, ?, ?, ?, ?)`,
          [spaceId, doc.doc_id, userId, notes || null, JSON.stringify(tags)]
        );

        // Update Pinecone metadata to add this space to space_ids
        await updateDocumentSpaceIds(orgId, doc.doc_id, spaceId, 'add');

        // Log activity
        await pool.query(
          `INSERT INTO space_activity (space_id, user_id, activity_type, details)
           VALUES (?, ?, 'file_added', ?)`,
          [spaceId, userId, JSON.stringify({ doc_id: doc.doc_id, filename: doc.filename })]
        );

        addedCount++;
        results.push({ doc_id: doc.doc_id, status: 'added' });
      } catch (error) {
        console.error(`Error adding doc ${doc.doc_id} to space:`, error);
        results.push({ doc_id: doc.doc_id, status: 'error', error: error.message });
      }
    }

    res.json({
      success: true,
      addedCount,
      results
    });
  } catch (error) {
    console.error('Error adding files to space:', error);
    res.status(500).json({ error: 'Failed to add files to space' });
  }
});

/**
 * DELETE /api/spaces/:spaceId/files/:docId
 * Remove a file from a space
 */
app.delete('/api/spaces/:spaceId/files/:docId', authenticateToken, async (req, res) => {
  const { spaceId, docId } = req.params;
  const { userId } = req.user;

  try {
    // Verify user has permission
    const [members] = await pool.query(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?',
      [spaceId, userId]
    );

    if (members.length === 0) {
      return res.status(403).json({ error: 'Not a member of this space' });
    }

    const role = members[0].role;

    // Get file info
    const [spaceFiles] = await pool.query(
      'SELECT added_by FROM space_files WHERE space_id = ? AND doc_id = ?',
      [spaceId, docId]
    );

    if (spaceFiles.length === 0) {
      return res.status(404).json({ error: 'File not found in this space' });
    }

    // Check permissions: owner can remove any file, contributor can only remove own files
    if (role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot remove files' });
    }

    if (role === 'contributor' && spaceFiles[0].added_by !== userId) {
      return res.status(403).json({ error: 'Contributors can only remove files they added' });
    }

    // Get space org_id
    const [spaces] = await pool.query(
      'SELECT org_id FROM spaces WHERE space_id = ?',
      [spaceId]
    );

    const orgId = spaces[0].org_id;

    // Get document info for activity log and vector deletion
    const [docs] = await pool.query(
      'SELECT filename, chunks FROM documents WHERE doc_id = ?',
      [docId]
    );

    if (docs.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const filename = docs[0].filename;
    const chunkCount = docs[0].chunks;

    console.log(`🗑️ Deleting file: ${filename} (${docId}) with ${chunkCount} chunks`);

    // STEP 1: Remove from space_files table
    await pool.query(
      'DELETE FROM space_files WHERE space_id = ? AND doc_id = ?',
      [spaceId, docId]
    );
    console.log('✅ Step 1: Removed from space_files table');

    // STEP 2: Delete vectors from Pinecone
    const vectorIds = [];
    for (let i = 0; i < chunkCount; i++) {
      vectorIds.push(`${docId}:${i}`);
    }
    
    if (vectorIds.length > 0) {
      await chatbotClient.deleteVectors(orgId, vectorIds);
      console.log(`✅ Step 2: Deleted ${vectorIds.length} vectors from Pinecone`);
    }

    // STEP 3: Delete from documents table
    await pool.query(
      'DELETE FROM documents WHERE doc_id = ?',
      [docId]
    );
    console.log('✅ Step 3: Deleted from documents table');

    // Log activity (non-critical - don't fail request if this errors)
    try {
      await pool.query(
        `INSERT INTO space_activity (space_id, user_id, activity_type, details)
         VALUES (?, ?, 'file_removed', ?)`,
        [spaceId, userId, JSON.stringify({ 
          doc_id: docId, 
          filename: filename 
        })]
      );
      console.log('✅ Activity logged');
    } catch (activityError) {
      console.warn('⚠️ Could not log activity (non-critical):', activityError.message);
    }

    res.json({
      success: true,
      message: 'File deleted successfully',
      deletedVectors: vectorIds.length
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
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
    // Get user's accessible spaces
    const [accessibleSpaces] = await pool.query(
      `SELECT DISTINCT space_id 
       FROM space_members 
       WHERE user_id = ?`,
      [userId]
    );

    const spaceIds = accessibleSpaces.map(s => s.space_id);

    if (spaceIds.length === 0) {
      return res.json({
        success: true,
        totalDocuments: 0,
        accessibleDocuments: 0,
        documents: [],
      });
    }

    // Get documents from accessible spaces
    const placeholders = spaceIds.map(() => '?').join(',');
    const [documents] = await pool.query(
      `SELECT DISTINCT
        d.doc_id, d.filepath, d.filename, d.mime_type, d.file_size, d.content_hash, 
        d.chunks, d.summary, d.status, d.created_at, d.updated_at
       FROM documents d
       INNER JOIN space_files sf ON d.doc_id = sf.doc_id
       WHERE sf.space_id IN (${placeholders}) 
         AND d.org_id = ? 
         AND d.status = 'active'
       ORDER BY d.created_at DESC`,
      [...spaceIds, orgId]
    );

    console.log(`📋 Found ${documents.length} accessible documents for user`);

    const accessibleDocuments = documents.map(doc => ({
      docId: doc.doc_id,
      filepath: doc.filepath,
      filename: doc.filename,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      contentHash: doc.content_hash,
      chunks: doc.chunks,
      summary: doc.summary,
      status: doc.status,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    }));

    res.json({
      success: true,
      totalDocuments: documents.length,
      accessibleDocuments: documents.length,
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
        doc_id, org_id, owner_user_id, filepath, filename, 
        mime_type, file_size, content_hash, chunks, summary,
        status, created_at, updated_at
       FROM documents 
       WHERE doc_id = ? AND org_id = ?`,
      [docId, orgId]
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[0];

    // Check if user has access via any space
    const [spaceAccess] = await pool.query(
      `SELECT sf.space_id 
       FROM space_files sf
       INNER JOIN space_members sm ON sf.space_id = sm.space_id
       WHERE sf.doc_id = ? AND sm.user_id = ?
       LIMIT 1`,
      [docId, userId]
    );

    if (spaceAccess.length === 0) {
      return res.status(403).json({ error: 'No access to this document' });
    }

    res.json({
      success: true,
      document: {
        docId: document.doc_id,
        orgId: document.org_id,
        ownerUserId: document.owner_user_id,
        filepath: document.filepath,
        filename: document.filename,
        mimeType: document.mime_type,
        fileSize: document.file_size,
        contentHash: document.content_hash,
        chunks: document.chunks,
        summary: document.summary,
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

    // Check access via space membership (all vectors in same doc should have same space_ids)
    const firstVector = queryResult.matches[0];
    const spaceIds = firstVector.metadata?.space_ids || [];
    
    if (spaceIds.length === 0) {
      return res.status(403).json({ error: 'No access to this document - not in any space' });
    }

    // Check if user is member of any of the document's spaces
    const placeholders = spaceIds.map(() => '?').join(',');
    const [access] = await pool.query(
      `SELECT space_id FROM space_members 
       WHERE space_id IN (${placeholders}) AND user_id = ? 
       LIMIT 1`,
      [...spaceIds, userId]
    );

    if (access.length === 0) {
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

    // Check if user has access via space membership
    const spaceIds = metadata?.space_ids || [];
    
    if (spaceIds.length === 0) {
      return res.status(403).json({ error: 'No access to this vector - not in any space' });
    }

    // Check if user is member of any of the vector's spaces
    const placeholders = spaceIds.map(() => '?').join(',');
    const [access] = await pool.query(
      `SELECT space_id FROM space_members 
       WHERE space_id IN (${placeholders}) AND user_id = ? 
       LIMIT 1`,
      [...spaceIds, userId]
    );

    if (access.length === 0) {
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

    // Filter vectors to only include those the user has access to via space membership
    // First, get all user's accessible spaces
    const [userSpaces] = await pool.query(
      'SELECT space_id FROM space_members WHERE user_id = ?',
      [userId]
    );
    const accessibleSpaceIds = userSpaces.map(s => s.space_id);

    const accessibleMatches = [];
    for (const match of queryResult.matches || []) {
      const vectorSpaceIds = match.metadata?.space_ids || [];
      
      // Check if any of the vector's spaces are accessible to the user
      const hasAccess = vectorSpaceIds.some(spaceId => accessibleSpaceIds.includes(spaceId));
      
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
  const { title, description, spaceIds = [], fileIds = [], metadata = {} } = req.body;

  const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await pool.query(
      `INSERT INTO chats (chat_id, org_id, user_id, title, description, space_ids, file_ids, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chatId, 
        orgId, 
        userId, 
        title || 'New Chat', 
        description, 
        JSON.stringify(spaceIds || []), 
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
        spaceIds,
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
        spaceIds: safeJSONParse(chat.space_ids, []),
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
  const { title, description, archived, spaceIds, fileIds, tags } = req.body;

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

    // Both owner and write users can update spaceIds/fileIds (query scope)
    if (!isOwner && !hasWriteAccess && (spaceIds !== undefined || fileIds !== undefined)) {
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
    if (spaceIds !== undefined) {
      updates.push('space_ids = ?');
      values.push(JSON.stringify(spaceIds));
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
// Organization Invitation Endpoints
// ============================================

/**
 * POST /api/organizations/:orgId/invitations
 * Create a new organization invitation (Admin only)
 */
app.post('/api/organizations/:orgId/invitations', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { email, role, message } = req.body;
  const inviterId = req.user.userId;
  
  try {
    // 1. Validate permissions
    if (!await isOrgAdmin(inviterId, orgId)) {
      return res.status(403).json({
        success: false,
        error: 'Admin or owner role required to send invitations'
      });
    }
    
    // 2. Validate input
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email address is required'
      });
    }
    
    if (!role || !INVITATION_CONFIG.ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Role must be one of: ${INVITATION_CONFIG.ALLOWED_ROLES.join(', ')}`
      });
    }
    
    if (message && message.length > INVITATION_CONFIG.MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Message must be ${INVITATION_CONFIG.MAX_MESSAGE_LENGTH} characters or less`
      });
    }
    
    // 3. Check if user is already a member
    const [existingMembers] = await pool.query(
      `SELECT om.user_id, u.email 
       FROM org_members om 
       JOIN users u ON om.user_id = u.user_id 
       WHERE om.org_id = ? AND u.email = ?`,
      [orgId, email]
    );
    
    if (existingMembers.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User is already a member of this organization'
      });
    }
    
    // 4. Check for existing pending invitation
    const [pendingInvitations] = await pool.query(
      `SELECT invitation_id FROM org_invitations 
       WHERE org_id = ? AND invitee_email = ? AND status = 'pending' AND expires_at > NOW()`,
      [orgId, email]
    );
    
    if (pendingInvitations.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An active invitation already exists for this email'
      });
    }
    
    // 5. Check rate limits
    const rateLimitCheck = await checkInvitationRateLimits(orgId, email);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: rateLimitCheck.reason
      });
    }
    
    // 6. Generate secure token
    const invitationToken = generateInvitationToken();
    
    // 7. Create invitation
    const [result] = await pool.query(
      `INSERT INTO org_invitations 
       (org_id, inviter_id, invitee_email, role, invitation_token, message, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        inviterId,
        email.toLowerCase(),
        role,
        invitationToken,
        message || null,
        JSON.stringify({
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('user-agent')
        })
      ]
    );
    
    const invitationId = result.insertId;
    
    // 8. Get complete invitation details
    const [invitations] = await pool.query(
      `SELECT * FROM org_invitations WHERE invitation_id = ?`,
      [invitationId]
    );
    
    const invitation = invitations[0];
    
    // 9. Get org and inviter details for email
    const [orgs] = await pool.query('SELECT * FROM orgs WHERE org_id = ?', [orgId]);
    const [inviters] = await pool.query('SELECT * FROM users WHERE user_id = ?', [inviterId]);
    
    // 10. Send invitation email
    try {
      await sendInvitationEmail(invitation, orgs[0], inviters[0]);
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Don't fail the request if email fails
    }
    
    // 11. Log activity
    await logInvitationActivity(invitationId, 'created', inviterId, {
      email: email,
      role: role
    }, req);
    
    // 12. Return success response
    res.status(201).json({
      success: true,
      invitation: {
        invitationId: invitation.invitation_id,
        orgId: invitation.org_id,
        email: invitation.invitee_email,
        role: invitation.role,
        token: invitation.invitation_token,
        invitationLink: `${process.env.APP_URL || 'http://localhost:3000'}/accept-invitation/${invitation.invitation_token}`,
        expiresAt: invitation.expires_at,
        status: invitation.status,
        createdAt: invitation.created_at
      }
    });
    
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invitation'
    });
  }
});

/**
 * GET /api/invitations/:token
 * Get invitation details by token (public endpoint)
 */
app.get('/api/invitations/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    // Get invitation with org and inviter details
    const [invitations] = await pool.query(
      `SELECT 
        i.*,
        o.name as org_name,
        o.plan as org_plan,
        u.name as inviter_name,
        u.email as inviter_email,
        u.avatar_url as inviter_avatar
       FROM org_invitations i
       JOIN orgs o ON i.org_id = o.org_id
       JOIN users u ON i.inviter_id = u.user_id
       WHERE i.invitation_token = ?`,
      [token]
    );
    
    if (invitations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found'
      });
    }
    
    const invitation = invitations[0];
    
    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return res.status(410).json({
        success: false,
        error: `Invitation has been ${invitation.status}`,
        status: invitation.status
      });
    }
    
    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      // Auto-expire the invitation
      await pool.query(
        'UPDATE org_invitations SET status = ? WHERE invitation_id = ?',
        ['expired', invitation.invitation_id]
      );
      
      return res.status(410).json({
        success: false,
        error: 'Invitation has expired'
      });
    }
    
    // Log view activity
    await logInvitationActivity(invitation.invitation_id, 'viewed', null, {}, req);
    
    // Return invitation details
    res.json({
      success: true,
      invitation: {
        organizationId: invitation.org_id,
        organizationName: invitation.org_name,
        organizationPlan: invitation.org_plan,
        inviterName: invitation.inviter_name,
        inviterEmail: invitation.inviter_email,
        inviterAvatar: invitation.inviter_avatar,
        email: invitation.invitee_email,
        role: invitation.role,
        message: invitation.message,
        expiresAt: invitation.expires_at,
        status: invitation.status,
        createdAt: invitation.created_at
      }
    });
    
  } catch (error) {
    console.error('Error getting invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve invitation'
    });
  }
});

/**
 * POST /api/invitations/:token/accept
 * Accept an organization invitation
 */
app.post('/api/invitations/:token/accept', authenticateToken, async (req, res) => {
  const { token } = req.params;
  const userId = req.user.userId;
  const userEmail = req.user.email;
  
  try {
    // Get invitation
    const [invitations] = await pool.query(
      `SELECT i.*, o.name as org_name 
       FROM org_invitations i
       JOIN orgs o ON i.org_id = o.org_id
       WHERE i.invitation_token = ?`,
      [token]
    );
    
    if (invitations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found'
      });
    }
    
    const invitation = invitations[0];
    
    // Verify email matches
    if (invitation.invitee_email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'This invitation was sent to a different email address'
      });
    }
    
    // Check invitation status
    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Invitation has already been ${invitation.status}`
      });
    }
    
    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await pool.query(
        'UPDATE org_invitations SET status = ? WHERE invitation_id = ?',
        ['expired', invitation.invitation_id]
      );
      
      return res.status(410).json({
        success: false,
        error: 'Invitation has expired'
      });
    }
    
    // Begin transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Add user to organization
      await connection.query(
        `INSERT INTO org_members (org_id, user_id, role, invited_by) 
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [invitation.org_id, userId, invitation.role, invitation.inviter_id]
      );
      
      // Update invitation status
      await connection.query(
        `UPDATE org_invitations 
         SET status = 'accepted', accepted_at = NOW() 
         WHERE invitation_id = ?`,
        [invitation.invitation_id]
      );
      
      // Log to audit log
      await connection.query(
        `INSERT INTO audit_log (org_id, user_id, action, resource_type, resource_id, details) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          invitation.org_id,
          userId,
          'invitation_accepted',
          'invitation',
          invitation.invitation_id,
          JSON.stringify({
            inviter_id: invitation.inviter_id,
            role: invitation.role
          })
        ]
      );
      
      // Commit transaction
      await connection.commit();
      connection.release();
      
      // Log activity
      await logInvitationActivity(invitation.invitation_id, 'accepted', userId, {
        org_id: invitation.org_id,
        role: invitation.role
      }, req);
      
      // Return success
      res.json({
        success: true,
        organizationId: invitation.org_id,
        organizationName: invitation.org_name,
        role: invitation.role,
        message: `Successfully joined ${invitation.org_name}`
      });
      
    } catch (txError) {
      await connection.rollback();
      connection.release();
      throw txError;
    }
    
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept invitation'
    });
  }
});

/**
 * POST /api/invitations/:token/decline
 * Decline an organization invitation
 */
app.post('/api/invitations/:token/decline', async (req, res) => {
  const { token } = req.params;
  const userId = req.user?.userId; // Optional authentication
  
  try {
    // Get invitation
    const [invitations] = await pool.query(
      'SELECT * FROM org_invitations WHERE invitation_token = ?',
      [token]
    );
    
    if (invitations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found'
      });
    }
    
    const invitation = invitations[0];
    
    // Check invitation status
    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Invitation has already been ${invitation.status}`
      });
    }
    
    // Update invitation status
    await pool.query(
      'UPDATE org_invitations SET status = ?, declined_at = NOW() WHERE invitation_id = ?',
      ['declined', invitation.invitation_id]
    );
    
    // Log activity
    await logInvitationActivity(invitation.invitation_id, 'declined', userId, {}, req);
    
    res.json({
      success: true,
      message: 'Invitation declined'
    });
    
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to decline invitation'
    });
  }
});

/**
 * GET /api/organizations/:orgId/invitations
 * List all invitations for an organization (Admin only)
 */
app.get('/api/organizations/:orgId/invitations', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const inviterId = req.user.userId;
  const { status, limit = 50, offset = 0 } = req.query;
  
  try {
    // Validate permissions
    if (!await isOrgAdmin(inviterId, orgId)) {
      return res.status(403).json({
        success: false,
        error: 'Admin or owner role required'
      });
    }
    
    // Build query
    let query = `
      SELECT 
        i.*,
        u.name as inviter_name,
        u.email as inviter_email
      FROM org_invitations i
      JOIN users u ON i.inviter_id = u.user_id
      WHERE i.org_id = ?
    `;
    
    const params = [orgId];
    
    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    // Get invitations
    const [invitations] = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM org_invitations WHERE org_id = ?';
    const countParams = [orgId];
    
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    
    const [countResult] = await pool.query(countQuery, countParams);
    
    res.json({
      success: true,
      invitations: invitations.map(inv => ({
        invitationId: inv.invitation_id,
        email: inv.invitee_email,
        role: inv.role,
        status: inv.status,
        message: inv.message,
        inviterName: inv.inviter_name,
        inviterEmail: inv.inviter_email,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
        acceptedAt: inv.accepted_at,
        declinedAt: inv.declined_at,
        revokedAt: inv.revoked_at
      })),
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
    
  } catch (error) {
    console.error('Error listing invitations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list invitations'
    });
  }
});

/**
 * DELETE /api/invitations/:invitationId
 * Revoke (cancel) an invitation (Admin only)
 */
app.delete('/api/invitations/:invitationId', authenticateToken, async (req, res) => {
  const { invitationId } = req.params;
  const userId = req.user.userId;
  
  try {
    // Get invitation
    const [invitations] = await pool.query(
      'SELECT * FROM org_invitations WHERE invitation_id = ?',
      [invitationId]
    );
    
    if (invitations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found'
      });
    }
    
    const invitation = invitations[0];
    
    // Check permissions
    if (!await isOrgAdmin(userId, invitation.org_id)) {
      return res.status(403).json({
        success: false,
        error: 'Admin or owner role required'
      });
    }
    
    // Check if already processed
    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot revoke invitation with status: ${invitation.status}`
      });
    }
    
    // Revoke invitation
    await pool.query(
      'UPDATE org_invitations SET status = ?, revoked_at = NOW(), revoked_by = ? WHERE invitation_id = ?',
      ['revoked', userId, invitationId]
    );
    
    // Log activity
    await logInvitationActivity(invitationId, 'revoked', userId, {
      revoked_by: userId
    }, req);
    
    res.json({
      success: true,
      message: 'Invitation revoked'
    });
    
  } catch (error) {
    console.error('Error revoking invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke invitation'
    });
  }
});

/**
 * GET /api/users/me/invitations
 * Get all pending invitations for the current user
 */
app.get('/api/users/me/invitations', authenticateToken, async (req, res) => {
  const userEmail = req.user.email;
  
  try {
    const [invitations] = await pool.query(
      `SELECT 
        i.*,
        o.name as org_name,
        o.plan as org_plan,
        u.name as inviter_name,
        u.email as inviter_email,
        u.avatar_url as inviter_avatar
       FROM org_invitations i
       JOIN orgs o ON i.org_id = o.org_id
       JOIN users u ON i.inviter_id = u.user_id
       WHERE i.invitee_email = ? 
       AND i.status = 'pending'
       AND i.expires_at > NOW()
       ORDER BY i.created_at DESC`,
      [userEmail]
    );
    
    res.json({
      success: true,
      invitations: invitations.map(inv => ({
        invitationId: inv.invitation_id,
        token: inv.invitation_token,
        organizationId: inv.org_id,
        organizationName: inv.org_name,
        organizationPlan: inv.org_plan,
        inviterName: inv.inviter_name,
        inviterEmail: inv.inviter_email,
        inviterAvatar: inv.inviter_avatar,
        role: inv.role,
        status: inv.status,
        message: inv.message,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at
      }))
    });
    
  } catch (error) {
    console.error('Error getting user invitations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve invitations'
    });
  }
});

// ============================================
// Static Pages
// ============================================

/**
 * GET /accept-invitation/:token
 * Serve the invitation acceptance page
 */
app.get('/accept-invitation/:token', (req, res) => {
  res.sendFile('accept-invitation.html', { root: './public' });
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

