# Organization Invitation System - API Documentation

## 📧 Email Invitation Feature

Send formal invitation emails to join your organization.

---

## 🔧 Setup

### 1. Configure Email Service in `.env`

```bash
# Gmail Configuration (for invitations) - Using SSL port 465
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_FROM=Panlo <noreply@panlo.ai>

# Application URL (for invitation links)
APP_URL=http://localhost:3000
```

**Configuration Notes:**
- Uses Gmail SMTP with SSL on port 465 (more reliable than TLS/587)
- 30-second timeout for better reliability
- Supports PLAIN, LOGIN, and CRAM-MD5 authentication

### 2. For Gmail Users

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the generated password
   - Use it as `EMAIL_PASSWORD` in `.env`

### 3. For Other Email Providers

**Note:** The email service is optimized for Gmail with SSL port 465. 

If you need to use other providers, you'll need to modify `emailService.js`:

**Outlook/Office 365:**
```javascript
{
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  // ... rest of config
}
```

**SendGrid:**
```javascript
{
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: 'your-sendgrid-api-key'
  }
}
```

---

## 📡 API Endpoints

### 1. Send Invitation

**`POST /api/orgs/:orgId/invitations`**

Send an email invitation to join the organization.

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "newmember@company.com",
  "role": "member"
}
```

**Parameters:**
- `email` (string, required): Email address of the person to invite
- `role` (string, optional): Role in organization. Options: `member`, `admin`, `owner`. Default: `member`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "invitation": {
    "email": "newmember@company.com",
    "orgId": "org_123",
    "role": "member",
    "invitedBy": "John Doe"
  }
}
```

**Error Responses:**
- `400` - Invalid email format or user already a member
- `401` - Not authenticated
- `403` - Not an admin/owner of the organization
- `404` - Organization not found
- `500` - Email sending failed

**Example:**
```bash
curl -X POST http://localhost:3000/api/orgs/org_123/invitations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah@company.com",
    "role": "member"
  }'
```

---

### 2. Accept Invitation

**`POST /api/accept-invitation`**

Accept an organization invitation (no authentication required).

**For Existing Users:**
```json
{
  "token": "invitation_token_from_email"
}
```

**For New Users:**
```json
{
  "token": "invitation_token_from_email",
  "name": "Sarah Johnson",
  "password": "securePassword123"
}
```

**Parameters:**
- `token` (string, required): JWT token from invitation email link
- `name` (string, required for new users): Full name
- `password` (string, required for new users): Password (min 8 characters)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Successfully joined organization",
  "token": "new_auth_jwt_token",
  "user": {
    "userId": "user_456",
    "email": "sarah@company.com",
    "name": "Sarah Johnson"
  }
}
```

**Error Responses:**
- `400` - Invalid/expired token, missing required fields
- `404` - User or organization not found
- `500` - Server error

**Example (Existing User):**
```bash
curl -X POST http://localhost:3000/api/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Example (New User):**
```bash
curl -X POST http://localhost:3000/api/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "name": "Sarah Johnson",
    "password": "securePassword123"
  }'
```

---

## 📨 Email Template

The invitation email includes:

✅ **Professional Design**
- Panlo branding with logo
- Responsive HTML layout
- Mobile-friendly

✅ **Clear Call-to-Action**
- "Accept Invitation" button
- Direct link to join

✅ **Information Included**
- Inviter's name
- Organization name
- Role being invited to
- Benefits of joining

✅ **Security**
- 7-day expiration on invite tokens
- Secure JWT-based authentication
- One-time use tokens

---

## 🔄 Invitation Flow

### For Existing Users:

```
1. Admin sends invitation via API
   ↓
2. Email sent to user@example.com
   ↓
3. User clicks "Accept Invitation" button
   ↓
4. Redirects to /accept-invitation?token=...
   ↓
5. POST /api/accept-invitation with token
   ↓
6. User added to organization
   ↓
7. Returns JWT token → User logged in
```

### For New Users:

```
1. Admin sends invitation via API
   ↓
2. Email sent to newuser@example.com
   ↓
3. User clicks "Accept Invitation" button
   ↓
4. Shows signup form (name + password)
   ↓
5. POST /api/accept-invitation with token, name, password
   ↓
6. Account created + added to organization
   ↓
7. Welcome email sent
   ↓
8. Returns JWT token → User logged in
```

---

## 🎯 Frontend Integration Example

### Send Invitation (Admin Panel)

```javascript
async function inviteMember(orgId, email, role = 'member') {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`/api/orgs/${orgId}/invitations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, role })
  });

  const data = await response.json();
  
  if (data.success) {
    alert(`Invitation sent to ${email}!`);
  } else {
    alert(`Error: ${data.error}`);
  }
}

// Usage
inviteMember('org_123', 'sarah@company.com', 'member');
```

### Accept Invitation (Landing Page)

```javascript
// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const inviteToken = urlParams.get('token');

// For existing users (just accept)
async function acceptInvite() {
  const response = await fetch('/api/accept-invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: inviteToken })
  });

  const data = await response.json();
  
  if (data.success) {
    // Save token and redirect to app
    localStorage.setItem('token', data.token);
    window.location.href = '/';
  }
}

// For new users (create account)
async function acceptInviteWithSignup(name, password) {
  const response = await fetch('/api/accept-invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: inviteToken,
      name,
      password
    })
  });

  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('token', data.token);
    window.location.href = '/';
  }
}
```

---

## 🧪 Testing

### 1. Send Test Invitation:

```bash
# Login first
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"password123"}' \
  | jq -r '.token')

# Send invitation
curl -X POST http://localhost:3000/api/orgs/org_123/invitations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "role": "member"
  }'
```

### 2. Check Your Email

You should receive a professional invitation email with:
- Inviter name and organization
- "Accept Invitation" button
- Invitation link

### 3. Extract Token from Email Link

The link looks like:
```
http://localhost:3000/accept-invitation?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Accept Invitation

```bash
# For new user
curl -X POST http://localhost:3000/api/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_TOKEN_HERE",
    "name": "Test User",
    "password": "testpass123"
  }'
```

---

## 📋 Features

✅ **Email Invitations**
- Send formal invitation emails
- Professional HTML template
- Mobile-responsive design

✅ **Secure Tokens**
- JWT-based invitation tokens
- 7-day expiration
- One-time use

✅ **Flexible Invitations**
- Works for existing users
- Creates accounts for new users
- Role-based invitations

✅ **Email Templates**
- Welcome email for new users
- Invitation email with branding
- Clear call-to-action

✅ **Error Handling**
- Duplicate member detection
- Invalid token handling
- Email delivery verification

---

## 🔒 Security Considerations

1. **Token Expiration**: Invitations expire after 7 days
2. **JWT Verification**: All tokens cryptographically signed
3. **Role Validation**: Only admins/owners can invite
4. **Email Verification**: Ensures invite sent to correct address
5. **One-Time Use**: Tokens can't be reused

---

## 🐛 Troubleshooting

### Email Not Sending

**Check:**
1. Email credentials in `.env` are correct
2. App passwords generated (for Gmail)
3. SMTP ports are correct (587 for TLS, 465 for SSL)
4. Firewall allows outbound SMTP connections

**Test Email Configuration:**
```bash
# Check server logs when sending invitation
# You should see: ✅ Email service ready
# Then: ✅ Invitation email sent: <messageId>
```

### Invitation Link Not Working

**Check:**
1. `APP_URL` in `.env` matches your frontend URL
2. Token hasn't expired (7 days)
3. Token is complete (not truncated in email)

### User Already Exists Error

This means the user is already a member. They should:
1. Log in normally
2. Switch to the organization they were invited to

---

## 📊 Database Tables Used

- `users` - User accounts
- `orgs` - Organizations
- `org_members` - Organization membership
- Invitation tokens stored in JWT (not persisted in DB)

---

Ready to send invitations! 🎉

