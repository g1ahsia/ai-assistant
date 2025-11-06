# Authentication API Examples

## 📝 Setup

Add to your `.env` file:
```bash
GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
JWT_SECRET=JRP615uyM9J4QYN8nmCEKN4LSBXJ9hvij28ex7hdrhM=
```

## 🔐 Authentication Endpoints

### 1. Signup with Email/Password

**POST** `/api/auth/signup`

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "name": "John Doe"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "currentOrgId": "org_1234567890_xyz789"
  }
}
```

---

### 2. Login with Email/Password

**POST** `/api/auth/login`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null,
    "currentOrgId": "org_1234567890_xyz789"
  }
}
```

---

### 3. Google OAuth Login

**POST** `/api/auth/google`

```bash
curl -X POST http://localhost:3000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE..."
  }'
```

> **Note:** The `credential` is the Google ID token you get from Google Sign-In on the frontend.

**Frontend Example (HTML + JavaScript):**
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>

<div id="g_id_onload"
     data-client_id="YOUR_GOOGLE_CLIENT_ID"
     data-callback="handleCredentialResponse">
</div>
<div class="g_id_signin" data-type="standard"></div>

<script>
function handleCredentialResponse(response) {
  // Send credential to your backend
  fetch('http://localhost:3000/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: response.credential })
  })
  .then(res => res.json())
  .then(data => {
    console.log('Logged in:', data.user);
    localStorage.setItem('token', data.token);
  });
}
</script>
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "user_1234567890_abc123",
    "email": "user@gmail.com",
    "name": "John Doe",
    "avatarUrl": "https://lh3.googleusercontent.com/...",
    "currentOrgId": "org_1234567890_xyz789"
  }
}
```

---

### 4. Get Current User Info

**GET** `/api/auth/me`

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "user": {
    "userId": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null,
    "currentOrgId": "org_1234567890_xyz789",
    "createdAt": "2024-11-03T12:00:00.000Z",
    "organizations": [
      {
        "orgId": "org_1234567890_xyz789",
        "name": "John Doe's Organization",
        "namespace": "org_org_1234567890_xyz789",
        "plan": "free",
        "role": "owner"
      }
    ]
  }
}
```

---

## 🔑 Using JWT Token

After login/signup, include the JWT token in subsequent requests:

```bash
curl -X GET http://localhost:3000/api/orgs/org_123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**In JavaScript:**
```javascript
const token = localStorage.getItem('token');

fetch('http://localhost:3000/api/orgs/org_123', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## 📋 Features

### ✅ What's Implemented:

1. **Email/Password Authentication**
   - Signup with automatic org creation
   - Login with password verification
   - Passwords hashed with bcrypt (10 rounds)

2. **Google OAuth Authentication**
   - Google Sign-In integration
   - Automatic user creation on first login
   - Automatic personal org creation

3. **JWT Token Management**
   - 7-day expiry by default
   - Includes userId, email, and name in payload

4. **User Profile**
   - Get current user info
   - List user's organizations and roles

5. **Automatic Org Creation**
   - Every new user gets a personal organization
   - User is set as the owner
   - Free plan by default

### 🔒 Security Features:

- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Email validation
- ✅ Password strength validation (min 8 chars)
- ✅ Google OAuth verification
- ✅ Token expiry

---

## 🚀 Getting Started

1. **Get Google OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable "Google+ API"
   - Create OAuth 2.0 Client ID
   - Add authorized origins: `http://localhost:3000`
   - Copy the Client ID

2. **Update .env:**
   ```bash
   GOOGLE_CLIENT_ID=123456789-abc123xyz.apps.googleusercontent.com
   JWT_SECRET=JRP615uyM9J4QYN8nmCEKN4LSBXJ9hvij28ex7hdrhM=
   ```

3. **Start the server:**
   ```bash
   node express-enterprise.js
   ```

4. **Test signup:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
   ```

---

## 🐛 Error Handling

### Common Errors:

**400 Bad Request:**
```json
{ "error": "Email, password, and name are required" }
{ "error": "Invalid email format" }
{ "error": "Password must be at least 8 characters" }
```

**401 Unauthorized:**
```json
{ "error": "Invalid email or password" }
{ "error": "Invalid Google credential" }
{ "error": "Authentication required" }
```

**403 Forbidden:**
```json
{ "error": "Invalid or expired token" }
```

**409 Conflict:**
```json
{ "error": "User with this email already exists" }
```

**500 Internal Server Error:**
```json
{ "error": "Failed to create user" }
{ "error": "Login failed" }
```

