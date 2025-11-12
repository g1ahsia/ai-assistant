// ============================================
// Accept Invitation Page - Vanilla JavaScript
// ============================================

class AcceptInvitationPage {
    constructor() {
        this.card = document.getElementById('invitationCard');
        this.token = null;
        this.invitation = null;
        this.currentUser = null;
        this.jwtToken = null;
        this.processing = false;
        
        this.init();
    }
    
    init() {
        // Get token from URL path (/accept-invitation/:token)
        const pathParts = window.location.pathname.split('/');
        this.token = pathParts[pathParts.length - 1];
        
        if (!this.token || this.token === 'accept-invitation') {
            this.showError('Invalid invitation link');
            return;
        }
        
        // Get current user and token from localStorage/sessionStorage
        // (Adjust this based on your auth system)
        this.loadAuthData();
        
        // Load invitation
        this.loadInvitation();
    }
    
    /**
     * Load auth data from storage
     */
    loadAuthData() {
        try {
            const userStr = localStorage.getItem('currentUser');
            const token = localStorage.getItem('jwtToken');
            
            if (userStr && token) {
                this.currentUser = JSON.parse(userStr);
                this.jwtToken = token;
            }
        } catch (err) {
            console.error('Error loading auth data:', err);
        }
    }
    
    /**
     * Load invitation details from API
     */
    async loadInvitation() {
        this.showLoading();
        
        try {
            const headers = {};
            if (this.jwtToken) {
                headers['Authorization'] = `Bearer ${this.jwtToken}`;
            }
            
            const response = await fetch(`/api/invitations/${this.token}`, { headers });
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.invitation = data.invitation;
                
                // Check if invitation is still valid
                if (data.invitation.status !== 'pending') {
                    this.showInvalidInvitation(`This invitation has been ${data.invitation.status}.`);
                    return;
                }
                
                // Check if expired
                const expiresAt = new Date(data.invitation.expiresAt);
                if (expiresAt < new Date()) {
                    this.showInvalidInvitation('This invitation has expired.');
                    return;
                }
                
                // Render invitation
                this.renderInvitation();
            } else {
                this.showInvalidInvitation(data.error || 'Invalid invitation link');
            }
        } catch (err) {
            console.error('Error loading invitation:', err);
            this.showInvalidInvitation('Network error. Please check your connection.');
        }
    }
    
    /**
     * Render invitation card
     */
    renderInvitation() {
        const daysUntilExpiry = this.getDaysUntilExpiry();
        const isExpiringSoon = daysUntilExpiry === 'today' || daysUntilExpiry === '1 day';
        const emailMatches = this.checkEmailMatch();
        
        this.card.innerHTML = `
            <!-- Header -->
            <div class="invitation-header">
                <div class="org-icon">🏢</div>
                <h1>You're invited to join</h1>
                <h2>${this.escapeHtml(this.invitation.organizationName)}</h2>
            </div>
            
            <!-- Details -->
            <div class="invitation-details">
                <div class="detail-item">
                    <span class="detail-icon">👤</span>
                    <div class="detail-text">
                        <div class="detail-label">Invited by</div>
                        <div class="detail-value">${this.escapeHtml(this.invitation.inviterName || this.invitation.inviterEmail)}</div>
                    </div>
                </div>
                
                <div class="detail-item">
                    <span class="detail-icon">🎭</span>
                    <div class="detail-text">
                        <div class="detail-label">Role</div>
                        <div class="detail-value">
                            <span class="role-badge role-${this.invitation.role}">
                                ${this.invitation.role}
                            </span>
                        </div>
                    </div>
                </div>
                
                ${this.invitation.message ? `
                    <div class="detail-item message">
                        <span class="detail-icon">💬</span>
                        <div class="detail-text">
                            <div class="detail-label">Personal message</div>
                            <div class="detail-value message-text">
                                "${this.escapeHtml(this.invitation.message)}"
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${daysUntilExpiry ? `
                    <div class="detail-item">
                        <span class="detail-icon">⏰</span>
                        <div class="detail-text">
                            <div class="detail-label">Expires in</div>
                            <div class="detail-value ${isExpiringSoon ? 'expiry-warning' : ''}">
                                ${daysUntilExpiry}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <!-- Benefits -->
            <div class="invitation-benefits">
                <div class="benefits-title">✓ You'll get access to:</div>
                <ul class="benefits-list">
                    <li>Shared team folders</li>
                    <li>Organization documents</li>
                    <li>Team chat and collaboration</li>
                    <li>AI-powered search across all files</li>
                </ul>
            </div>
            
            ${this.currentUser ? `
                <!-- User info -->
                <div class="current-user-info">
                    <span class="user-label">Accept as:</span>
                    <span class="user-email">${this.escapeHtml(this.currentUser.email)}</span>
                </div>
            ` : ''}
            
            <!-- Error message -->
            <div id="errorBanner" class="error-banner" style="display: none;">
                <span class="error-icon">⚠️</span>
                <span id="errorMessage"></span>
            </div>
            
            ${this.currentUser && !emailMatches ? `
                <!-- Email mismatch warning -->
                <div class="warning-banner">
                    <span class="warning-icon">⚠️</span>
                    <div>
                        <strong>Email mismatch:</strong> This invitation was sent to <strong>${this.escapeHtml(this.invitation.email)}</strong>.
                        <br/>
                        You are logged in as <strong>${this.escapeHtml(this.currentUser.email)}</strong>.
                        <br/>
                        Please log in with the correct account.
                    </div>
                </div>
            ` : ''}
            
            <!-- Actions -->
            <div class="invitation-actions">
                <button
                    class="btn btn-secondary"
                    id="declineBtn"
                >
                    Decline
                </button>
                <button
                    class="btn btn-primary"
                    id="acceptBtn"
                >
                    ${this.currentUser ? 'Accept & Join' : 'Sign In to Accept'}
                </button>
            </div>
        `;
        
        // Attach event listeners
        document.getElementById('acceptBtn').addEventListener('click', () => this.handleAccept());
        document.getElementById('declineBtn').addEventListener('click', () => this.handleDecline());
    }
    
    /**
     * Check if logged-in user email matches invitation email
     */
    checkEmailMatch() {
        if (!this.currentUser || !this.invitation) return true;
        return this.currentUser.email.toLowerCase() === this.invitation.email.toLowerCase();
    }
    
    /**
     * Handle accept invitation
     */
    async handleAccept() {
        // If not logged in, redirect to login
        if (!this.currentUser || !this.jwtToken) {
            const returnUrl = `/accept-invitation/${this.token}`;
            window.location.href = `/login.html?redirect=${encodeURIComponent(returnUrl)}`;
            return;
        }
        
        // Check email match
        if (!this.checkEmailMatch()) {
            alert(`This invitation was sent to ${this.invitation.email}.\nYou are currently logged in as ${this.currentUser.email}.\n\nPlease log in with the correct account.`);
            return;
        }
        
        this.processing = true;
        this.setButtonsLoading('accepting');
        this.hideError();
        
        try {
            const response = await fetch(`/api/invitations/${this.token}/accept`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                // Success!
                console.log('✅ Invitation accepted:', data);
                this.showSuccess();
                
                // Redirect to organization after delay
                setTimeout(() => {
                    window.location.href = `/orgs.html?orgId=${this.invitation.organizationId}`;
                }, 1500);
            } else {
                this.showError(data.error || 'Failed to accept invitation');
                this.setButtonsLoading(null);
                this.processing = false;
            }
        } catch (err) {
            console.error('Error accepting invitation:', err);
            this.showError('Network error. Please try again.');
            this.setButtonsLoading(null);
            this.processing = false;
        }
    }
    
    /**
     * Handle decline invitation
     */
    async handleDecline() {
        if (!confirm('Are you sure you want to decline this invitation?\n\nYou will need a new invitation to join this organization.')) {
            return;
        }
        
        this.processing = true;
        this.setButtonsLoading('declining');
        this.hideError();
        
        try {
            const headers = {};
            if (this.jwtToken) {
                headers['Authorization'] = `Bearer ${this.jwtToken}`;
            }
            
            const response = await fetch(`/api/invitations/${this.token}/decline`, {
                method: 'POST',
                headers
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                // Success
                console.log('✅ Invitation declined');
                this.showDeclined();
                
                // Redirect after delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
            } else {
                this.showError(data.error || 'Failed to decline invitation');
                this.setButtonsLoading(null);
                this.processing = false;
            }
        } catch (err) {
            console.error('Error declining invitation:', err);
            this.showError('Network error. Please try again.');
            this.setButtonsLoading(null);
            this.processing = false;
        }
    }
    
    /**
     * Set buttons loading state
     */
    setButtonsLoading(action) {
        const acceptBtn = document.getElementById('acceptBtn');
        const declineBtn = document.getElementById('declineBtn');
        
        if (!acceptBtn || !declineBtn) return;
        
        if (action === 'accepting') {
            acceptBtn.disabled = true;
            declineBtn.disabled = true;
            acceptBtn.innerHTML = '<span class="spinner">⟳</span> Accepting...';
        } else if (action === 'declining') {
            acceptBtn.disabled = true;
            declineBtn.disabled = true;
            declineBtn.innerHTML = '<span class="spinner">⟳</span> Declining...';
        } else {
            acceptBtn.disabled = false;
            declineBtn.disabled = false;
            acceptBtn.textContent = this.currentUser ? 'Accept & Join' : 'Sign In to Accept';
            declineBtn.textContent = 'Decline';
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const errorBanner = document.getElementById('errorBanner');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorBanner && errorMessage) {
            errorMessage.textContent = message;
            errorBanner.style.display = 'flex';
        }
    }
    
    /**
     * Hide error message
     */
    hideError() {
        const errorBanner = document.getElementById('errorBanner');
        if (errorBanner) {
            errorBanner.style.display = 'none';
        }
    }
    
    /**
     * Show loading state
     */
    showLoading() {
        this.card.innerHTML = `
            <div class="loading-state">
                <span class="spinner large">⟳</span>
                <p>Loading invitation...</p>
            </div>
        `;
    }
    
    /**
     * Show invalid invitation error
     */
    showInvalidInvitation(message) {
        this.card.innerHTML = `
            <div class="error-state">
                <span class="error-icon">⚠️</span>
                <h2>Invalid Invitation</h2>
                <p>${this.escapeHtml(message)}</p>
                <button class="btn btn-primary" onclick="window.location.href='/'">
                    Go to Home
                </button>
            </div>
        `;
    }
    
    /**
     * Show success state
     */
    showSuccess() {
        this.card.innerHTML = `
            <div class="success-state">
                <span class="success-icon">✅</span>
                <h2>Welcome to ${this.escapeHtml(this.invitation.organizationName)}!</h2>
                <p>Redirecting you to your organization...</p>
            </div>
        `;
    }
    
    /**
     * Show declined state
     */
    showDeclined() {
        this.card.innerHTML = `
            <div class="declined-state">
                <span class="declined-icon">❌</span>
                <h2>Invitation Declined</h2>
                <p>You have declined the invitation to join ${this.escapeHtml(this.invitation.organizationName)}.</p>
            </div>
        `;
    }
    
    /**
     * Calculate days until expiry
     */
    getDaysUntilExpiry() {
        if (!this.invitation) return null;
        const now = new Date();
        const expiry = new Date(this.invitation.expiresAt);
        const diffMs = expiry - now;
        const diffDays = Math.ceil(diffMs / 86400000);
        
        if (diffDays < 0) return null;
        if (diffDays === 0) return 'today';
        if (diffDays === 1) return '1 day';
        return `${diffDays} days`;
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AcceptInvitationPage();
    });
} else {
    new AcceptInvitationPage();
}

