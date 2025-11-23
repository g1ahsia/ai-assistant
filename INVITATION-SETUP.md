# Email Invitation System - Quick Setup Guide

## ✅ What I've Implemented

### 1. **Email Service** (`emailService.js`)
- Professional HTML email templates
- Send invitation emails
- Send welcome emails
- Nodemailer integration

### 2. **API Endpoints** (Added to `express-enterprise.js`)
- `POST /api/orgs/:orgId/invitations` - Send email invitation
- `POST /api/accept-invitation` - Accept invitation & join org

### 3. **Documentation**
- `API-INVITATIONS.md` - Complete API documentation
- Email configuration guide
- Frontend integration examples

---

## 🚀 Quick Start

### Step 1: Add to Your `.env` File

Open your `.env` file and add these lines:

```bash
# Gmail Configuration (for invitations) - Using SSL port 465
GMAIL_USER=support@bhavana.life
GMAIL_APP_PASSWORD=your-gmail-app-password-here
EMAIL_FROM=Panlo <noreply@panlo.ai>

# Application URL (for invitation links)
APP_URL=http://localhost:3000
```

**Note:** The email service is configured to use Gmail's SSL port 465 for better reliability.

### Step 2: Get Gmail App Password

1. Go to https://myaccount.google.com/apppasswords
2. Generate an App Password for "Mail"
3. Copy the password
4. Replace `your-app-specific-password` in `.env`

### Step 3: Replace Your Gmail Address

Replace `support@bhavana.life` in `.env` with your actual Gmail address:

```bash
GMAIL_USER=your-email@gmail.com
```

### Step 4: Restart Server

```bash
npm run start:enterprise
```

You should see: `✅ Email service ready`

---

## 🧪 Test It

### 1. Send an Invitation

```bash
# Login first to get your token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# Copy the token from response, then:
curl -X POST http://localhost:3000/api/orgs/YOUR_ORG_ID/invitations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"friend@example.com","role":"member"}'
```

### 2. Check Email

The recipient will receive a professional invitation email with:
- Your name as the inviter
- Organization name
- "Accept Invitation" button
- Invitation link

### 3. Accept Invitation

When they click the link, they'll be redirected to:
```
http://localhost:3000/accept-invitation?token=...
```

They can then accept by calling:
```bash
curl -X POST http://localhost:3000/api/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{"token":"THE_TOKEN","name":"Their Name","password":"theirpassword"}'
```

---

## 📋 Features Included

✅ **Professional Email Template**
- Mobile-responsive HTML
- Panlo branding
- Clear call-to-action button

✅ **Smart Invitation Logic**
- Existing users: Just adds to org
- New users: Creates account + adds to org

✅ **Security**
- JWT tokens with 7-day expiration
- Role-based access (only admins can invite)
- One-time use tokens

✅ **Automatic Welcome Emails**
- New users receive welcome email
- Includes getting started guide

---

## 🎯 What's Next?

1. **Update `.env`** with your email credentials
2. **Restart server**
3. **Test invitation flow**
4. **Build frontend UI** for invitation modal

---

## 📚 Full Documentation

See `API-INVITATIONS.md` for:
- Complete API reference
- Frontend integration examples
- Email configuration for different providers
- Troubleshooting guide

---

## Files Created/Modified

✅ `emailService.js` - New file
✅ `express-enterprise.js` - Added 3 endpoints
✅ `ENTERPRISE-ENV-TEMPLATE.txt` - Updated with email config
✅ `API-INVITATIONS.md` - New documentation
✅ `INVITATION-SETUP.md` - This file

---

**Ready to send invitations!** 🎉

Just update your `.env` file and restart the server.

