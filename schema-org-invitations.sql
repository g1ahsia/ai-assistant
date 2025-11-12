-- ============================================
-- Organization Invitation System
-- Database Schema for Panlo Enterprise
-- ============================================
-- 
-- Purpose: Enable organization admins/owners to invite users to join their organization
-- Features:
--   - Secure token-based invitations
--   - Role assignment (admin, member)
--   - Expiration management (7 days default)
--   - Status tracking (pending, accepted, declined, expired, revoked)
--   - Email verification
--   - Audit trail
--
-- Version: 1.0
-- Author: Panlo Team
-- Date: 2025-11-10
-- ============================================

USE panlo_enterprise;

-- ============================================
-- Main Invitations Table
-- ============================================

/**
 * org_invitations
 * 
 * Stores all organization invitation records.
 * 
 * Key Features:
 * - Unique secure tokens for each invitation
 * - Automatic expiration after 7 days
 * - Prevents duplicate pending invitations to same email
 * - Tracks invitation lifecycle (pending → accepted/declined/expired)
 * 
 * Security:
 * - Token should be generated using crypto.randomBytes(32) or equivalent
 * - Token must be at least 32 characters for security
 * - Invitations expire automatically after 7 days
 * 
 * Usage Flow:
 * 1. Admin creates invitation → status='pending'
 * 2. Email sent to invitee with invitation link
 * 3. Invitee clicks link and accepts/declines
 * 4. Status updated to 'accepted' or 'declined'
 * 5. If accepted, user added to org_members table
 */
CREATE TABLE IF NOT EXISTS org_invitations (
    -- Primary key
    invitation_id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Organization reference
    org_id VARCHAR(255) NOT NULL,
    FOREIGN KEY (org_id) REFERENCES orgs(org_id) ON DELETE CASCADE,
    
    -- Inviter (who sent the invitation)
    inviter_id VARCHAR(255) NOT NULL,
    FOREIGN KEY (inviter_id) REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Invitee information
    invitee_email VARCHAR(255) NOT NULL,
    -- Note: invitee might not have an account yet, so no foreign key
    
    -- Role to be assigned upon acceptance
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    -- Valid values: 'admin', 'member'
    -- Note: 'owner' role cannot be assigned via invitation
    
    -- Secure invitation token
    invitation_token VARCHAR(255) NOT NULL UNIQUE,
    -- Must be generated using cryptographically secure random generator
    -- Minimum 32 characters recommended
    
    -- Invitation status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- Valid values:
    --   'pending': Invitation sent, awaiting response
    --   'accepted': User accepted and joined organization
    --   'declined': User explicitly declined the invitation
    --   'expired': Invitation expired (past expires_at timestamp)
    --   'revoked': Admin cancelled the invitation
    
    -- Optional personal message from inviter
    message TEXT,
    -- Max 1000 characters recommended
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 7 DAY),
    -- Default: 7 days from creation
    -- Can be customized per invitation
    
    accepted_at TIMESTAMP NULL,
    -- Set when status changes to 'accepted'
    
    declined_at TIMESTAMP NULL,
    -- Set when status changes to 'declined'
    
    revoked_at TIMESTAMP NULL,
    -- Set when status changes to 'revoked'
    
    revoked_by VARCHAR(255) NULL,
    FOREIGN KEY (revoked_by) REFERENCES users(user_id) ON DELETE SET NULL,
    -- Admin who revoked the invitation
    
    -- Metadata
    metadata JSON,
    -- Additional information:
    --   - IP address of inviter
    --   - User agent
    --   - Custom fields
    
    -- Constraints
    -- Prevent duplicate pending invitations to same email for same org
    CONSTRAINT unique_pending_invitation 
        UNIQUE (org_id, invitee_email, status),
    
    -- Validate role values
    CONSTRAINT check_role 
        CHECK (role IN ('admin', 'member')),
    
    -- Validate status values
    CONSTRAINT check_status 
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
    
    -- Ensure email format is valid
    CONSTRAINT check_email_format 
        CHECK (invitee_email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}$')
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Indexes for Performance
-- ============================================

-- Fast token lookups (most common query)
CREATE INDEX idx_invitation_token ON org_invitations(invitation_token);

-- Find all invitations for a user by email
CREATE INDEX idx_invitation_email ON org_invitations(invitee_email);

-- Find all pending invitations (for cleanup jobs)
CREATE INDEX idx_invitation_status ON org_invitations(status);

-- Find invitations for an organization
CREATE INDEX idx_invitation_org ON org_invitations(org_id);

-- Find invitations created by a user
CREATE INDEX idx_invitation_inviter ON org_invitations(inviter_id);

-- Find expired invitations (for cleanup job)
CREATE INDEX idx_invitation_expires ON org_invitations(expires_at, status);

-- Composite index for org + status queries
CREATE INDEX idx_org_status ON org_invitations(org_id, status);

-- ============================================
-- Invitation Activity Log (Optional - for audit trail)
-- ============================================

/**
 * org_invitation_activity
 * 
 * Detailed audit log of all invitation-related activities.
 * Useful for:
 * - Compliance and security audits
 * - Troubleshooting invitation issues
 * - Analytics on invitation acceptance rates
 * 
 * Events tracked:
 * - invitation_created: New invitation sent
 * - invitation_viewed: Invitee viewed invitation page
 * - invitation_accepted: Invitee accepted invitation
 * - invitation_declined: Invitee declined invitation
 * - invitation_revoked: Admin cancelled invitation
 * - invitation_expired: Invitation auto-expired
 * - invitation_resent: Invitation email resent
 */
CREATE TABLE IF NOT EXISTS org_invitation_activity (
    activity_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Reference to invitation
    invitation_id INT NOT NULL,
    FOREIGN KEY (invitation_id) REFERENCES org_invitations(invitation_id) ON DELETE CASCADE,
    
    -- Activity type
    activity_type VARCHAR(50) NOT NULL,
    -- Values: 'created', 'viewed', 'accepted', 'declined', 'revoked', 'expired', 'resent'
    
    -- Actor (who performed the action)
    user_id VARCHAR(255) NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    -- NULL if action was automated (e.g., auto-expiration)
    
    -- Request metadata
    ip_address VARCHAR(45),
    -- IPv4 or IPv6 address
    
    user_agent TEXT,
    -- Browser/client user agent
    
    -- Additional details
    details JSON,
    -- Activity-specific data:
    --   - Error messages
    --   - Reason for decline
    --   - Custom notes
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_activity_invitation (invitation_id, created_at),
    INDEX idx_activity_type (activity_type),
    INDEX idx_activity_created (created_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Views for Common Queries
-- ============================================

/**
 * View: pending_invitations
 * 
 * Quick access to all active (pending, not expired) invitations.
 * Includes inviter details and organization information.
 */
CREATE OR REPLACE VIEW pending_invitations AS
SELECT 
    i.invitation_id,
    i.org_id,
    o.name AS org_name,
    i.inviter_id,
    u.name AS inviter_name,
    u.email AS inviter_email,
    i.invitee_email,
    i.role,
    i.message,
    i.invitation_token,
    i.created_at,
    i.expires_at,
    TIMESTAMPDIFF(HOUR, NOW(), i.expires_at) AS hours_until_expiry,
    i.status
FROM org_invitations i
JOIN orgs o ON i.org_id = o.org_id
JOIN users u ON i.inviter_id = u.user_id
WHERE i.status = 'pending' 
  AND i.expires_at > NOW();

/**
 * View: user_pending_invitations
 * 
 * All pending invitations for a specific user (by email).
 * Useful for showing "You have pending invitations" notifications.
 */
CREATE OR REPLACE VIEW user_pending_invitations AS
SELECT 
    i.invitation_id,
    i.org_id,
    o.name AS org_name,
    o.plan AS org_plan,
    i.inviter_id,
    u.name AS inviter_name,
    u.email AS inviter_email,
    u.avatar_url AS inviter_avatar,
    i.invitee_email,
    i.role,
    i.message,
    i.invitation_token,
    i.created_at,
    i.expires_at,
    DATEDIFF(i.expires_at, NOW()) AS days_until_expiry
FROM org_invitations i
JOIN orgs o ON i.org_id = o.org_id
JOIN users u ON i.inviter_id = u.user_id
WHERE i.status = 'pending' 
  AND i.expires_at > NOW();

/**
 * View: org_invitation_stats
 * 
 * Aggregated statistics for each organization.
 * Useful for analytics and monitoring invitation usage.
 */
CREATE OR REPLACE VIEW org_invitation_stats AS
SELECT 
    org_id,
    COUNT(*) AS total_invitations,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
    SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) AS declined_count,
    SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired_count,
    SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked_count,
    ROUND(
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) * 100.0 / 
        NULLIF(SUM(CASE WHEN status IN ('accepted', 'declined', 'expired') THEN 1 ELSE 0 END), 0),
        2
    ) AS acceptance_rate_percent,
    MAX(created_at) AS last_invitation_sent
FROM org_invitations
GROUP BY org_id;

-- ============================================
-- Stored Procedures
-- ============================================

/**
 * Procedure: expire_old_invitations
 * 
 * Automatically mark expired invitations.
 * Should be run periodically (e.g., daily cron job).
 * 
 * Returns: Number of invitations expired
 */
DELIMITER //

CREATE PROCEDURE expire_old_invitations()
BEGIN
    DECLARE expired_count INT DEFAULT 0;
    
    -- Update expired invitations
    UPDATE org_invitations
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < NOW();
    
    -- Get count of expired invitations
    SET expired_count = ROW_COUNT();
    
    -- Log to activity table
    INSERT INTO org_invitation_activity (invitation_id, activity_type, details, created_at)
    SELECT 
        invitation_id,
        'expired',
        JSON_OBJECT('expired_by', 'system', 'reason', 'automatic_expiration'),
        NOW()
    FROM org_invitations
    WHERE status = 'expired'
      AND NOT EXISTS (
          SELECT 1 FROM org_invitation_activity 
          WHERE org_invitation_activity.invitation_id = org_invitations.invitation_id 
          AND activity_type = 'expired'
      );
    
    SELECT expired_count AS invitations_expired;
END //

DELIMITER ;

/**
 * Procedure: cleanup_old_invitations
 * 
 * Remove invitation records older than specified days.
 * Recommended: Keep for 90 days for audit purposes.
 * 
 * Parameters:
 *   - days_to_keep: Number of days to retain (default 90)
 * 
 * Returns: Number of records deleted
 */
DELIMITER //

CREATE PROCEDURE cleanup_old_invitations(IN days_to_keep INT)
BEGIN
    DECLARE deleted_count INT DEFAULT 0;
    
    -- Delete old invitations (activity log will cascade delete)
    DELETE FROM org_invitations
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY)
      AND status IN ('accepted', 'declined', 'expired', 'revoked');
    
    SET deleted_count = ROW_COUNT();
    
    SELECT deleted_count AS records_deleted;
END //

DELIMITER ;

-- ============================================
-- Triggers
-- ============================================

/**
 * Trigger: after_invitation_accepted
 * 
 * Automatically add user to org_members table when invitation is accepted.
 * Also logs the activity.
 */
DELIMITER //

CREATE TRIGGER after_invitation_accepted
AFTER UPDATE ON org_invitations
FOR EACH ROW
BEGIN
    -- Check if status changed to 'accepted'
    IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
        -- Find user by email
        SET @user_id = (SELECT user_id FROM users WHERE email = NEW.invitee_email LIMIT 1);
        
        IF @user_id IS NOT NULL THEN
            -- Add user to organization (if not already a member)
            INSERT IGNORE INTO org_members (org_id, user_id, role, invited_by)
            VALUES (NEW.org_id, @user_id, NEW.role, NEW.inviter_id);
            
            -- Log to audit table
            INSERT INTO audit_log (org_id, user_id, action, resource_type, resource_id, details)
            VALUES (
                NEW.org_id,
                @user_id,
                'invitation_accepted',
                'invitation',
                NEW.invitation_id,
                JSON_OBJECT(
                    'inviter_id', NEW.inviter_id,
                    'role', NEW.role,
                    'invitation_token', NEW.invitation_token
                )
            );
        END IF;
    END IF;
END //

DELIMITER ;

-- ============================================
-- Sample Data (for testing only - remove in production)
-- ============================================

-- Example: Create a test invitation
-- INSERT INTO org_invitations (org_id, inviter_id, invitee_email, role, invitation_token, message)
-- VALUES (
--     'org_test123',
--     'user_admin001',
--     'newuser@example.com',
--     'member',
--     'secure_random_token_32_chars_min',
--     'Welcome to our team! We are excited to have you join us.'
-- );

-- ============================================
-- Database Migration Notes
-- ============================================

/**
 * To add this schema to existing database:
 * 
 * 1. Run this entire SQL file against your panlo_enterprise database
 * 2. Verify tables created:
 *    SHOW TABLES LIKE 'org_invitation%';
 * 
 * 3. Verify indexes:
 *    SHOW INDEX FROM org_invitations;
 * 
 * 4. Test views:
 *    SELECT * FROM pending_invitations LIMIT 5;
 * 
 * 5. Set up cron job to run expire_old_invitations daily:
 *    0 2 * * * mysql -u user -p database -e "CALL expire_old_invitations();"
 * 
 * 6. Set up cleanup job to run monthly:
 *    0 3 1 * * mysql -u user -p database -e "CALL cleanup_old_invitations(90);"
 */

-- ============================================
-- Security Recommendations
-- ============================================

/**
 * 1. Token Generation:
 *    - Use crypto.randomBytes(32).toString('hex') in Node.js
 *    - Minimum 32 characters (64 hex characters recommended)
 *    - Never reuse tokens
 * 
 * 2. Rate Limiting:
 *    - Limit invitations per org per hour (e.g., 10)
 *    - Limit invitations per email per day (e.g., 3)
 *    - Implement in application layer
 * 
 * 3. Email Validation:
 *    - Validate email format before insertion
 *    - Consider email verification for new users
 *    - Block disposable email domains if needed
 * 
 * 4. Permission Checks:
 *    - Only admins/owners can send invitations
 *    - Only admins/owners can revoke invitations
 *    - Implement in application layer
 * 
 * 5. HTTPS Required:
 *    - All invitation links must use HTTPS
 *    - Never send tokens over insecure connections
 */

-- End of schema

