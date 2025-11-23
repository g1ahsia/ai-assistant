# Panlo Enterprise Client - UI/UX Workflow

## 🎯 Overview

Simplified user journey for Panlo Enterprise, matching the current app architecture with Slack-like onboarding.

---

## 📱 Application Structure (Chat-Centric 3-Panel Layout)

```
┌──┬──────────────────────┬────────────────────────────────────────────────────┐
│  │                      │  what are AT's roles?                    [×]  [+] │
│  │  [+ New Chat]        │  ──────────────────────────────────────────────────│
│🏢│  ────────────────    │                                                    │
│  │                      │  Panlo                                            │
│📁│  try                 │  Based on documents, here are AT's key roles:     │
│  │  translate to Chinese│                                                    │
│💬│  new what, what are  │  1. Course Conduct:                               │
│  │  what are AT's roles?│     • ATs are tasked with conducting courses...   │
│  │  What are AT's roles?│     • They should not give instructions...        │
│👤│  ok good             │                                                    │
│  │  mini that lah       │  2. Preparation and Responsibilities:             │
│  │  ok lah              │     • Ensure organizers are familiar...           │
│  │  this is ok          │                                                    │
│  │  god good lah        │  3. Student Management:                           │
│  │  are they any padding│     • Conduct checks and provide support...       │
│  │  now it's 0 pixel    │                                                    │
│  │  dy asdkfjasdf       │  4. Gender Conduct and Boundaries:                │
│  │  am i cool           │     • Maintain strict gender segregation...       │
│  │  Now it should be ok │                                                    │
│  │  try again           │  5. Personal Practice and Dhamma Service:         │
│  │  are you sure removed│     • They are encouraged to maintain...          │
│  │  padding             │                                                    │
│  │  ok lah              │  [More content...]                                │
│  │  let's try           │                                                    │
│  │                      │  Panlo can make mistakes. Please check sources... │
│  │                      │  [Add Context]                                    │
│  │                      │  ┌──────────────────────────────────────────────┐│
│  │                      │  │ Ask anything about your files...        [➤] ││
│  │                      │  └──────────────────────────────────────────────┘│
└──┴──────────────────────┴────────────────────────────────────────────────────┘
```

**Three-Panel Layout:**

**1. Left Menu (Icon Bar - 50px):**
- 🏢 Organization selector (top)
- 📁 Documents/Files view
- 💬 Chats view (active)
- 👤 User profile (bottom)

**2. Middle Panel (Chat List - 250px):**
- [+ New Chat] button at top
- List of all chat conversations
- Shows recent chats with preview
- Click chat → Opens in main window
- Scrollable list of conversation history

**3. Right Main Window (Flexible width):**
- **Tabbed interface**: Can open multiple chats or files
- Shows current chat conversation OR file content
- **Chat view**:
  - Chat title with [×] close and [+] new tab
  - Full conversation history
  - AI responses with cited sources
  - [Add Context] button to add files
  - Input field at bottom: "Ask anything about your files..."
- **File view** (when opened):
  - Document content
  - File actions (Summarize, Download, etc.)

---

## 🚀 Onboarding Flow (Slack-Style)

### Step 1: Login / Sign Up

#### **Screen 1: Welcome**
```
┌─────────────────────────────────────────────────┐
│                                                   │
│                    🗂️  Panlo                    │
│                                                   │
│        Your AI-Powered Knowledge Assistant       │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │  [🔍 Sign in with Google]             │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│              ─────── OR ───────                  │
│                                                   │
│    Email address                                 │
│    ┌───────────────────────────────────────┐   │
│    │ name@work-email.com                    │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    Password                                      │
│    ┌───────────────────────────────────────┐   │
│    │ ••••••••••••••                        │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │          Sign In with Email           │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    New to Panlo? [Create an account]            │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Calls:**
- `POST /api/auth/google` (Google OAuth)
- `POST /api/auth/login` (Email/Password)

**On Success → Step 2: Choose Organization**

#### **Screen 2: Sign Up (If New User)**
```
┌─────────────────────────────────────────────────┐
│                                                   │
│                 Create Account                   │
│                                                   │
│    First, enter your email address               │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │ name@work-email.com                    │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │          Continue                      │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │  [🔍 Sign up with Google]             │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    Already using Panlo? [Sign in]               │
│                                                   │
└─────────────────────────────────────────────────┘

──── After Continue ────

┌─────────────────────────────────────────────────┐
│                                                   │
│            Create Your Account                   │
│                                                   │
│    Full name                                     │
│    ┌───────────────────────────────────────┐   │
│    │ John Doe                               │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    Password                                      │
│    ┌───────────────────────────────────────┐   │
│    │ ••••••••••••••                        │   │
│    └───────────────────────────────────────┘   │
│    At least 8 characters                         │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │          Create Account               │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    By clicking Create Account, you agree to the  │
│    Terms of Service and Privacy Policy           │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Call:** `POST /api/auth/signup`

**Backend Auto-Creates:**
- User account
- Personal organization (`John's Organization`)

**On Success → Step 2: Choose Organization**

---

### Step 2: Choose or Create Organization

#### **Screen 3: Organization Selector (Slack-style)**
```
┌─────────────────────────────────────────────────┐
│                                                   │
│           Choose an Organization                 │
│                                                   │
│    john@company.com                              │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │  📊 John's Organization            ⭐ │   │
│    │  └─ Free Plan • 1 member              │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │  🏢 Acme Corp                          │   │
│    │  └─ Enterprise • 25 members           │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │  + Create a new organization          │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    [Sign Out]                                    │
│                                                   │
└─────────────────────────────────────────────────┘
```

**User Actions:**
1. Click existing organization → Load main app
2. OR Click "Create new organization" → Create org flow
3. OR Click "Sign Out" → Return to login

**API Calls:**
- `GET /api/auth/me` (Get user's organizations)
- `POST /api/orgs` (If creating new org)

**On Organization Selected → Step 3: Main Application**

---

#### **Screen 4: Create New Organization**
```
┌─────────────────────────────────────────────────┐
│                                                   │
│          Create New Organization                 │
│                                                   │
│    What's the name of your company or team?     │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │ Acme Corporation                       │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    This will be shown to your team members       │
│                                                   │
│    ┌───────────────────────────────────────┐   │
│    │          Create Organization          │   │
│    └───────────────────────────────────────┘   │
│                                                   │
│    [← Back]                                      │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Call:** `POST /api/orgs`

**On Success → Step 3: Main Application**

---

### Step 3: Main Application

#### **Screen 5: Main Application Interface** (3-Panel Chat-Centric Layout)
```
┌──┬──────────────────────┬──────────────────────────────────────────────────────┐
│  │                      │  what are AT's roles?                    [×]  [+]   │
│  │  [+ New Chat]        │  ────────────────────────────────────────────────────│
│🏢│  ────────────────    │                                                      │
│  │                      │  Panlo                                              │
│📁│  try                 │  Based on the documents, here are the key roles...  │
│  │                      │                                                      │
│📊│  translate to Chinese│  1. Course Conduct:                                 │
│  │                      │     • ATs are tasked with conducting courses while  │
│💬│  new what, what are  │       preserving the traditional format...          │
│◄ │  what are AT's roles?│     • They should not give instructions during...   │
│  │  What are AT's roles?│                                                      │
│👤│  ok good             │  2. Preparation and Responsibilities:               │
│  │  mini that lah       │     • Ensure that organizers are familiar with...   │
│  │  ok lah              │     • Assess the appropriateness of the course...   │
│  │  this is ok          │                                                      │
│  │  god good lah        │  3. Student Management:                             │
│  │  are they any padding│     • Conduct checks and provide support to...      │
│  │  now it's 0 pixel    │     • Monitor discipline among students...          │
│  │  dy asdkfjasdf       │                                                      │
│  │  am i cool           │  4. Gender Conduct and Boundaries:                  │
│  │  Now it should be ok │     • Maintain strict gender segregation in...      │
│  │  try again           │     • ATs should regard students similarly...       │
│  │  are you sure removed│                                                      │
│  │  padding             │  5. Personal Practice and Dhamma Service:           │
│  │  ok lah              │     • They are encouraged to maintain personal...   │
│  │  let's try           │     • ATs must serve selflessly and work towards... │
│  │                      │                                                      │
│  │                      │  These roles reflect the commitment of assistant... │
│  │                      │                                                      │
│  │                      │  📎 Sources shown in citations                      │
│  │                      │  Panlo can make mistakes. Check sources...          │
│  │                      │                                                      │
│  │                      │  [Add Context]                                      │
│  │                      │  ┌────────────────────────────────────────────────┐│
│  │                      │  │ Ask anything about your files...          [➤] ││
│  │                      │  └────────────────────────────────────────────────┘│
└──┴──────────────────────┴──────────────────────────────────────────────────────┘
```

**Three-Panel Layout Details:**

**Panel 1 - Left Menu (Icon Bar - 50px wide):**
- 🏢 **Organization Icon** (top) - Click to switch orgs
- 📁 **Documents/Files Icon** - Switch to files view
- 📊 **Spaces Icon** - Access space selector
- 💬 **Chats Icon** (active/selected ◄) - Show chat list
- 👤 **Profile Icon** (bottom) - User profile & settings

**Panel 2 - Middle Chat List (250px wide):**
- **[+ New Chat] button** at top - Start new conversation
- **Chat list**: All saved conversations
  - Shows chat title/first message
  - Chronological order (newest first)
  - Click chat → Opens in main window
  - Currently active chat highlighted
- **Scrollable**: Can browse all chat history
- **No tabs here** - just a list

**Panel 3 - Right Main Window (Flexible width):**
- **Tab bar**: Multiple tabs for chats or files [×] [+]
  - Each tab shows chat title or filename
  - [×] to close tab
  - [+] to open new tab
- **Content area**: 
  - **Chat conversation** (shown in example):
    - Full message history
    - User messages and AI responses
    - Source citations inline
    - Scrollable conversation
  - **OR File content** (when file opened):
    - Document viewer
    - PDF/text/code rendering
    - File actions at bottom
- **Bottom section**:
  - [Add Context] button - Add files to conversation
  - Input field: "Ask anything about your files..."
  - [➤] Send button
- **Disclaimer**: "Panlo can make mistakes. Check sources..."

---

#### **Screen 5a: Files View** (Click 📁 icon in left bar)
```
┌──┬──────────────────────┬──────────────────────────────────────────────────────┐
│  │                      │  AT Manual - Course Guidelines.docx      [×]  [+]   │
│  │  [Marketing Q4 ▾]    │  ────────────────────────────────────────────────────│
│🏢│  Owner • 24 files    │  [Search in document...]                   [Ask AI] │
│  │  ────────────────    │  ────────────────────────────────────────────────────│
│📁│  [Search files...]   │                                                      │
│◄ │                      │  AT Manual : Course Guidelines                      │
│📊│  📄 AT Manual        │  For the use of assistant teachers of S.N. Goenka   │
│  │  📄 Q3-Report.pdf    │                                                      │
│💬│  📄 Budget-24.xlsx   │  The current format of the 10-day course has been in│
│  │  📄 Plan-Q4.docx     │  use for the last thirty years and gives excellent  │
│  │  📄 Strategy.pdf     │  results. Therefore no changes whatsoever should be │
│👤│  📄 Analysis.xlsx    │  made to it. Suggestions for changes may be freely  │
│  │  📄 Guidelines.pdf   │  made to Goenkaji but no assistant teacher should   │
│  │  📄 Notes.txt        │  make any changes on their own.                     │
│  │                      │                                                      │
│  │  24 files total      │  Assistant teachers give selfless service conducting│
│  │                      │  courses as a part of their practice to dissolve... │
│  │  [+ Upload]          │                                                      │
│  │  [+ Add File]        │  [More content...]                                  │
│  │                      │                                                      │
│  │                      │  [Page 1 of 8]                      [Next Page >]   │
│  │                      │                                                      │
│  │                      │  [Summarize] [Add to Context] [Download]            │
│  │                      │                                                      │
│  │                      │  ┌────────────────────────────────────────────────┐│
│  │                      │  │ Ask anything about this file...           [➤] ││
│  │                      │  └────────────────────────────────────────────────┘│
└──┴──────────────────────┴──────────────────────────────────────────────────────┘
```

**Files View Features:**
- **Toggle view**: Click 📁 icon → Shows files in current space
- **Space selector**: [Marketing Q4 ▾] - Click to switch spaces
- **File list**: All files in current space
  - Searchable
  - Click file → Opens in main window as tab
- **File content**: Opens in main window (right panel)
  - Document viewer with tabs
  - [Ask AI] button in header
  - Full content display
  - Navigation for multi-page docs
  - Actions: Summarize, Add to Context, Download
  - Input field to ask questions about file

**API Calls:**
- `GET /api/spaces/{spaceId}/files` - Get files in space
- `GET /api/orgs/{orgId}/documents/{docId}` - Get file content
- `POST /api/spaces/{spaceId}/upload` - Upload new file

---

#### **Screen 5b: Icon Bar Interactions**

**Organization Selector (🏢 icon):**
```
Click 🏢 icon → Dropdown appears:

┌─────────────────────────────┐
│  Your Organizations         │
├─────────────────────────────┤
│  ✓ Acme Corp               │
│    Enterprise • Owner       │
│                             │
│  Tech Startup Inc           │
│    Pro • Member             │
│                             │
│  John's Personal Org        │
│    Free • Owner             │
├─────────────────────────────┤
│  + Create Organization      │
└─────────────────────────────┘
```

**Space Selector (Click Space Title at Top):**
```
Click "[Marketing Q4 ▾]" at top → Space selector modal appears:

┌─────────────────────────────────────┐
│  Select Space                  [×] │
├─────────────────────────────────────┤
│                                     │
│  Your Spaces in Acme Corp           │
│                                     │
│  📊 My Personal Space               │
│     Owner • 12 files                │
│                                     │
│  📊 Marketing Q4              ✓    │
│     Owner • 24 files                │
│                                     │
│  📊 Engineering Team                │
│     Contributor • 156 files         │
│                                     │
│  📊 Finance Q3                      │
│     Viewer • 45 files               │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  [+ New Space]                      │
│                                     │
└─────────────────────────────────────┘

- Click any space to switch to it
- Click [+ New Space] to create team space
- Current space marked with ✓
```

**Space Icon (📊 in left bar):**
- Visual indicator of current space
- Changes based on space type (personal vs team)
- Not clickable - use space title at top for switching

**Profile Menu (👤 icon):**
```
Click 👤 icon → Profile menu appears:

┌─────────────────────────────┐
│  👤 John Doe                │
│  john@company.com           │
├─────────────────────────────┤
│  Profile & Account          │
│  Teams & Members            │
│  Manage Organization  👑   │  ← Admin/Owner only
├─────────────────────────────┤
│  Upload & Sync Settings     │
│  Notifications              │
├─────────────────────────────┤
│  Help & Feedback            │
│  Keyboard Shortcuts         │
├─────────────────────────────┤
│  Sign Out                   │
└─────────────────────────────┘
```

**Note:** "Manage Organization" option only appears for organization admins and owners.

**Icon States:**
- **Default**: Gray icon
- **Active/Selected**: Highlighted with arrow (◄) or colored
- **Hover**: Shows tooltip with name
- **Click**: Opens corresponding menu/panel

---

#### **Screen 6: Chat Panel Collapsed View**

**User can collapse the right chat panel for more reading space:**

```
┌──┬─────────────────────┬──────────────────────────────────────────────────────┐
│  │                     │  Q3-Report.pdf                            [×][+]  💬│
│  │  Files in Space     │                                                      │
│🏢│  ──────────────     │  Search...                           [Ask AI]       │
│  │                     │  ────────────────────────────────────────────────────│
│📊│  [Search files...]  │                                                      │
│◄ │                     │  Q3 2024 Financial Report                           │
│  │  📄 Q3-Report.pdf ◄ │  Acme Corporation                                   │
│💬│  📄 Budget-24.xlsx  │                                                      │
│  │  📄 Plan-Q4.docx    │  Executive Summary                                  │
│  │  📄 Strategy.pdf    │                                                      │
│  │  📄 Analysis.xlsx   │  Our Q3 2024 performance exceeded expectations with │
│👤│  📄 Notes.txt       │  total revenue of $2.4M, representing a 15%         │
│  │                     │  increase over Q2.                                   │
│  │  24 files total     │                                                      │
│  │                     │  Revenue Breakdown:                                 │
│  │  [+ Upload File]    │  • Product A: $1,200,000 (50%)                      │
│  │  [+ Add Existing]   │  • Product B: $800,000 (33%)                        │
│  │                     │  • Services: $400,000 (17%)                         │
│  │                     │                                                      │
│  │                     │  Key Highlights:                                    │
│  │                     │  - Sales growth driven by Product A launch          │
│  │                     │  - New client acquisitions: 12 enterprise clients   │
│  │                     │  - Customer retention rate: 94%                     │
│  │                     │  - Operating margin improved to 28%                 │
│  │                     │                                                      │
│  │                     │  Market Analysis:                                   │
│  │                     │  The Q3 results reflect strong market position...   │
│  │                     │                                                      │
│  │                     │  [Page 1 of 8]                      [Next Page >]   │
│  │                     │  [Summarize] [Add to Context] [Download]            │
└──┴─────────────────────┴──────────────────────────────────────────────────────┘
```

**Collapsed Chat Panel Features:**
- Click [×] on chat panel header → Collapses to edge
- 💬 icon appears in top-right corner of content area
- Click 💬 icon → Re-opens chat panel
- Provides more space for reading documents
- Chat history preserved when panel reopens
- "Ask AI" button still available in document header

---

#### **Screen 7: Create New Space (Simple Modal)**
```
┌─────────────────────────────────────────────────┐
│  Create New Space                      [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  Space name *                                    │
│  ┌───────────────────────────────────────────┐ │
│  │ Marketing Q4                               │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Description (optional)                          │
│  ┌───────────────────────────────────────────┐ │
│  │ Q4 marketing campaign materials            │ │
│  │                                            │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Space type                                      │
│  ● Team Space (collaborate with members)        │
│  ○ Personal Space (only you have access)        │
│                                                   │
│  [Cancel]                   [Create Space]      │
│                                                   │
└─────────────────────────────────────────────────┘

──── After Creation ────

┌─────────────────────────────────────────────────┐
│  Space Created Successfully!           [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  📊 Marketing Q4                                 │
│                                                   │
│  Your new space is ready to use!                │
│                                                   │
│  Next steps:                                     │
│  • Add members to collaborate                   │
│  • Upload files or add existing files           │
│  • Start chatting with AI                       │
│                                                   │
│  [Add Members]              [Add Files]         │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Call:** `POST /api/orgs/{orgId}/spaces`

**Behavior:**
- Personal space automatically created on signup
- User can create team spaces
- Space appears immediately in left panel
- User becomes the owner of the space
- Can add members and files after creation

---

#### **Screen 8: Space Context Menu & Add Members**

**Access Points for Space Menu:**

**1. In Files View - Right-click space title:**
```
┌──┬──────────────────────┬──────────────────────────────────┐
│  │  [Marketing Q4 ▾] ◄──┐│  Files                           │
│  │  Owner • 24 files    ││  ────────────────────────────────│
│  │  ────────────────    ││                                  │
│  │                      ││  ┌─────────────────────────────┐│
│  │  [Search files...]   ││  │ • View Space Details        ││
│  │                      ││  │ • Add Members               ││
│  │  📄 AT Manual        ││  │ • Space Settings            ││
│  │  📄 Q3-Report.pdf    ││  │ • Copy Space Link           ││
│  │                      ││  │ ───────────────────────────  ││
│  │                      ││  │ • Leave Space               ││
│  │                      ││  │ • Delete Space (owner)      ││
│  │                      ││  └─────────────────────────────┘│
└──┴──────────────────────┴──────────────────────────────────┘
```

**2. In Space Selector Modal - Three-dot menu:**
```
┌─────────────────────────────────────┐
│  Select Space                  [×] │
├─────────────────────────────────────┤
│                                     │
│  Your Spaces in Acme Corp           │
│                                     │
│  📊 My Personal Space               │
│     Owner • 12 files                │
│                                     │
│  📊 Marketing Q4              ✓    │
│     Owner • 24 files         [···]◄─┐
│                                     │ │
│  📊 Engineering Team                │ │
│     Contributor • 156 files  [···] │ │
│                                     │ │
│  ─────────────────────────────────  │ │
│  [+ New Space]                      │ │
└─────────────────────────────────────┘ │
                                         │
  ┌──────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│ • View Space Details        │
│ • Add Members               │
│ • Space Settings            │
│ ───────────────────────────  │
│ • Leave Space               │
│ • Delete Space (owner)      │
└─────────────────────────────┘
```

**3. In Chat View - Click space icon (📊) in left bar:**
```
Click 📊 icon → Context menu appears:

┌─────────────────────────────┐
│  Current Space              │
├─────────────────────────────┤
│  📊 Marketing Q4            │
│     Owner • 24 files        │
│                             │
│  [Switch Space]             │
│  [Add Members]              │
│  [Space Settings]           │
└─────────────────────────────┘
```

**Space Context Menu (Full Options):**

**For Space Owners:**
```
┌─────────────────────────────┐
│ • View Space Details        │  ← Shows files, members, activity
│ • Add Members               │  ← Invite users to space
│ • Space Settings            │  ← Rename, description, permissions
│ • Copy Space Link           │  ← Copy shareable link (if enabled)
│ ───────────────────────────  │
│ • Export Space Data         │  ← Download all files/metadata
│ • Archive Space             │  ← Hide from active list
│ ───────────────────────────  │
│ • Delete Space              │  ← Permanent deletion (with warning)
└─────────────────────────────┘
```

**For Space Contributors:**
```
┌─────────────────────────────┐
│ • View Space Details        │
│ • Space Settings            │  ← Read-only view
│ ───────────────────────────  │
│ • Leave Space               │
└─────────────────────────────┘
```

**For Space Viewers:**
```
┌─────────────────────────────┐
│ • View Space Details        │  ← Read-only
│ • Export My Notes           │  ← Personal notes only
│ ───────────────────────────  │
│ • Leave Space               │
└─────────────────────────────┘
```

**Keyboard Shortcuts:**
- Right-click space title → Context menu
- Click [···] button → Context menu
- `⌘⇧M` (Mac) / `Ctrl+Shift+M` (Win) → Add Members (when space active)
- `⌘I` (Mac) / `Ctrl+I` (Win) → View Space Details

**Click "Add Members" → Modal:**
```
┌─────────────────────────────────────────────────┐
│  Add Members to "Finance Q3"       [✕]         │
├─────────────────────────────────────────────────┤
│                                                   │
│  Search organization members                     │
│  ┌───────────────────────────────────────────┐ │
│  │ Type name or email...                  🔍 │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │  👤 John Smith                            │ │
│  │     john.smith@company.com                │ │
│  │     Role: [Contributor ▾]  [Add]         │ │
│  │                                            │ │
│  │  👤 Sarah Johnson                         │ │
│  │     sarah@company.com                     │ │
│  │     Role: [Viewer ▾]       [Add]         │ │
│  │                                            │ │
│  │  👤 Mike Chen                             │ │
│  │     mike.chen@company.com                 │ │
│  │     Role: [Owner ▾]        [Add]         │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Role permissions:                               │
│  • Owner: Full control (add/remove members)     │
│  • Contributor: Add files, own uploads          │
│  • Viewer: Read-only access                     │
│                                                   │
│  [Cancel]                             [Done]    │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Role Options:**
- **Owner**: Full control, can add/remove members, manage space
- **Contributor**: Can add files and remove own files
- **Viewer**: Read-only access to files and chats

**Behavior:**
- Search shows organization members not yet in space
- Select role for each member before adding
- Members receive notification when added
- Only owners can add/remove members
- Personal spaces have only one member (the owner)

**API Call:** `POST /api/spaces/{spaceId}/members`

---

#### **Screen 8a: Space Settings** (Click [···] → "Space Settings")

```
┌─────────────────────────────────────────────────┐
│  Space Settings - Marketing Q4         [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  📊 General                                      │
│                                                   │
│  Space Name *                                    │
│  ┌───────────────────────────────────────────┐ │
│  │ Marketing Q4                               │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Description                                     │
│  ┌───────────────────────────────────────────┐ │
│  │ Q4 marketing campaign materials and        │ │
│  │ planning documents                         │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Space Type: Team Space                         │
│  Created: Jan 15, 2024 by You                   │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  👥 Members (8)                    [View All]   │
│  • 2 Owners, 4 Contributors, 2 Viewers          │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  📁 Files (24)                     [View All]   │
│  • Total size: 156 MB                           │
│  • Last updated: 2 hours ago                    │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  🔒 Privacy & Sharing                           │
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Allow members to invite others          │ │
│  │ ☑ Allow link sharing (generate link)      │ │
│  │ ☐ Make discoverable in org                │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Space Link (if enabled)                        │
│  ┌───────────────────────────────────────────┐ │
│  │ https://panlo.app/s/mktg-q4-xyz123  [📋] │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  ⚙️ Advanced                                     │
│                                                   │
│  [Archive Space]     [Export Space Data]        │
│                                                   │
│  [Delete Space]  ⚠️ Permanent action            │
│                                                   │
│  [Cancel]                    [Save Changes]     │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Calls:**
- `GET /api/spaces/{spaceId}` - Get space details
- `PUT /api/spaces/{spaceId}` - Update space settings
- `POST /api/spaces/{spaceId}/link` - Generate shareable link
- `DELETE /api/spaces/{spaceId}` - Delete space

**Features:**
- Edit space name and description
- View member and file counts
- Configure privacy and sharing settings
- Generate shareable links (owners only)
- Archive or delete space (owners only)
- Real-time updates for member/file counts

**Permissions:**
- **Owners**: Full edit access, can delete
- **Contributors**: Read-only view, cannot change settings
- **Viewers**: Read-only view, basic info only

---

#### **Screen 9: Settings Modal** (Click ⚙️ icon)
```
┌─────────────────────────────────────────────────┐
│  Settings                              [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  👤 John Doe                                     │
│  john@company.com                                │
│  Acme Corp • Finance Q3 Space                   │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  • Profile & Account                            │
│  • Spaces & Members                             │
│  • Upload & Sync Settings                       │
│  • Notifications                                │
│  ──────────────────────────────────────────────  │
│  • Switch Organization...                       │
│  • Help & Feedback                              │
│  • About Panlo v1.0.0                          │
│  ──────────────────────────────────────────────  │
│  • Sign Out                                     │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Quick Settings:**
- Click items to go to detail screens
- "Spaces & Members" → Manage spaces and view members
- "Switch Organization" → Go back to org selector
- "Sign Out" → Return to login

---

#### **Screen 10: Notifications Settings** (Click "Notifications" from Settings)
```
┌─────────────────────────────────────────────────┐
│  Notifications Settings                [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  🔔 Notification Preferences                    │
│                                                   │
│  Desktop Notifications                           │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Enable desktop notifications           │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  Notify me when...                               │
│                                                   │
│  📊 Space Events                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Added to a space                        │ │
│  │ ☑ New files added to space                │ │
│  │ ☑ Member joins/leaves space               │ │
│  │ ☑ Space permissions change                │ │
│  │ ☐ Upload errors occur                     │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  👥 Team & Collaboration                         │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Someone shares files in space           │ │
│  │ ☑ Added to a new team                     │ │
│  │ ☑ Team member mentions you                │ │
│  │ ☐ Space activity digest (daily)           │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  💬 Chat & AI Assistant                          │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ AI response ready (when tab inactive)   │ │
│  │ ☐ Show typing indicator                   │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ⚠️ System Alerts                                │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Connection issues                       │ │
│  │ ☑ Storage space warnings                  │ │
│  │ ☑ Update available                        │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  Notification Display Duration                   │
│  ┌───────────────────────────────────────────┐ │
│  │  ● 3 seconds                              │ │
│  │  ○ 5 seconds                              │ │
│  │  ○ 10 seconds                             │ │
│  │  ○ Until dismissed                        │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ☐ Do Not Disturb Mode (Pause all notifications) │
│                                                   │
│  [Cancel]                    [Save Changes]     │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Call:** `PUT /api/users/preferences/notifications`

**Features:**
- Granular control over notification types
- Desktop notification toggle
- Do Not Disturb mode
- Customizable display duration
- Organized by category

---

#### **Screen 11: Watch Folders Settings** (Click "Watch Folders Settings" from Settings)
```
┌─────────────────────────────────────────────────┐
│  Watch Folders Settings                [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  📁 Default Folder Behavior                     │
│                                                   │
│  When adding new folders...                      │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Watch subfolders by default             │ │
│  │ ☑ Auto-sync changes automatically         │ │
│  │ ☑ Index hidden files (starting with .)    │ │
│  │ ☐ Include system files                    │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Default visibility:                             │
│  ● Private   ○ Shared   ○ Public                │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  🔄 Sync Settings                                │
│                                                   │
│  Sync interval                                   │
│  ┌───────────────────────────────────────────┐ │
│  │  Real-time    [▼]                         │ │
│  │  (Options: Real-time, 5min, 15min, 1hr)   │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Sync on startup                         │ │
│  │ ☑ Background sync when app is closed      │ │
│  │ ☐ Pause sync on battery power             │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  📄 File Type Filters                            │
│                                                   │
│  Index these file types:                         │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Documents (.pdf, .doc, .docx, .txt)     │ │
│  │ ☑ Spreadsheets (.xls, .xlsx, .csv)        │ │
│  │ ☑ Presentations (.ppt, .pptx)             │ │
│  │ ☑ Code files (.js, .py, .java, etc.)      │ │
│  │ ☑ Markdown (.md)                           │ │
│  │ ☐ Images (.jpg, .png, .gif)               │ │
│  │ ☐ Videos (.mp4, .mov, .avi)               │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Custom extensions (comma-separated):            │
│  ┌───────────────────────────────────────────┐ │
│  │ .log, .json, .yaml                         │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  💾 Storage & Performance                        │
│                                                   │
│  Max file size to index:                         │
│  ┌───────────────────────────────────────────┐ │
│  │  50 MB    [▼]                             │ │
│  │  (Options: 10MB, 50MB, 100MB, 500MB)      │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Local storage used: 2.3 GB / 10 GB              │
│  ████████████░░░░░░░░ 23%                       │
│                                                   │
│  [Clear Cache]          [Rebuild All Indexes]   │
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Compress vectors locally                │ │
│  │ ☐ Low-power mode (slower indexing)        │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  [Cancel]                    [Save Changes]     │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Call:** `PUT /api/users/preferences/folders`

**Features:**
- Default folder behavior settings
- Sync frequency control
- File type filtering
- Storage management
- Performance optimization options

---

#### **Screen 12: Profile & Account Settings** (Click "Profile & Account" from Settings)
```
┌─────────────────────────────────────────────────┐
│  Profile & Account                     [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  👤 Profile Information                          │
│                                                   │
│  Full Name                                       │
│  ┌───────────────────────────────────────────┐ │
│  │ John Doe                                   │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Email Address                                   │
│  ┌───────────────────────────────────────────┐ │
│  │ john@company.com                           │ │
│  └───────────────────────────────────────────┘ │
│  (Verified ✓)                                   │
│                                                   │
│  Profile Picture                                 │
│  ┌─────────┐                                    │
│  │   👤   │  [Change Photo]                    │
│  └─────────┘                                    │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  🔒 Security                                     │
│                                                   │
│  Password                                        │
│  ••••••••••••••  [Change Password]              │
│                                                   │
│  Two-Factor Authentication                       │
│  ┌───────────────────────────────────────────┐ │
│  │ ☐ Enable 2FA (Recommended)                │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Active Sessions                                 │
│  • Windows Desktop - Last active: Now            │
│  • macOS Desktop - Last active: 2 hours ago      │
│  [Manage Sessions]                               │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  🏢 Current Organization                         │
│                                                   │
│  Organization: Acme Corp                         │
│  Role: Member                                    │
│  Member since: Jan 15, 2024                      │
│                                                   │
│  [Switch Organization]                           │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  ⚡ Preferences                                  │
│                                                   │
│  Language                                        │
│  ┌───────────────────────────────────────────┐ │
│  │  English    [▼]                            │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Theme                                           │
│  ● Light   ○ Dark   ○ Auto (System)             │
│                                                   │
│  Startup                                         │
│  ┌───────────────────────────────────────────┐ │
│  │ ☑ Launch Panlo on system startup          │ │
│  │ ☑ Start minimized to tray                 │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  [Cancel]                    [Save Changes]     │
│                                                   │
└─────────────────────────────────────────────────┘
```

**API Calls:**
- `PUT /api/users/profile`
- `PUT /api/users/password`
- `POST /api/users/2fa/enable`
- `PUT /api/users/preferences`

**Features:**
- Profile editing
- Security settings (2FA, password, sessions)
- Theme toggle (Light/Dark/Auto)
- Language selection
- Startup preferences

---

#### **Screen 13: Teams & Members** (Click "Teams & Members" from Settings)
```
┌─────────────────────────────────────────────────┐
│  Teams & Members                       [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  Your Teams (3)            [+ Create Team]      │
│                                                   │
│  👥 Engineering (8 members)            [···]   │
│  └─ Role: Lead                                   │
│                                                   │
│  👥 Leadership (3 members)             [···]   │
│  └─ Role: Member                                 │
│                                                   │
│  👥 Finance (5 members)                [···]   │
│  └─ Role: Member                                 │
│                                                   │
│  ──────────────────────────────────────────────  │
│                                                   │
│  Organization Members                            │
│  [Invite Members to Organization]               │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Features:**
- Shows all teams user belongs to
- Displays role (Lead or Member) for each team
- [+ Create Team] button to create new teams
- [···] context menu for team actions
- [Invite Members] button for org-level invitations

**User Actions:**
1. **Create Team** → Click [+ Create Team] → Screen 14
2. **Manage/View Team** → Click [···] → Select "Manage Team" or "View Team" → Screen 15
3. **Leave Team** → Click [···] → Select "Leave Team" → Screen 16

**API Call:** `GET /api/orgs/{orgId}/teams`

---

#### **Screen 13a: Team Context Menu** (Click [···] next to team)

**For Team Leads:**
```
┌─────────────────────────────┐
│ • Manage Team               │
│ • Leave Team                │
│ ──────────────────────────  │
│ • Delete Team               │
└─────────────────────────────┘
```

**For Team Members:**
```
┌─────────────────────────────┐
│ • View Team                 │
│ • Leave Team                │
└─────────────────────────────┘
```

**Actions:**
- **Manage Team** (Lead only): Opens team detail view with members list + settings
- **View Team** (Member only): Opens team detail view (read-only)
- **Leave Team**: Confirmation modal to leave the team
- **Delete Team** (Lead only): Confirmation modal to delete entire team

---

#### **Screen 14: Create Team** (Click [+ Create Team])
```
┌─────────────────────────────────────────────────┐
│  Create New Team                       [✕]     │
├─────────────────────────────────────────────────┤
│                                                   │
│  Team Name                                       │
│  ┌───────────────────────────────────────────┐ │
│  │ Engineering                                │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  Add members (optional)                          │
│  ┌───────────────────────────────────────────┐ │
│  │  Search by name or email...                │ │
│  │  ───────────────────────────────────────  │ │
│  │  ☑ Sarah Johnson                          │ │
│  │  ☑ Mike Chen                              │ │
│  │  ☐ Lisa Wong                              │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  [Cancel]                        [Create Team]  │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Features:**
- Enter team name (required)
- Search and select members from organization (optional)
- Creator automatically becomes team lead

**Workflow:**
1. Click [+ Create Team] from Teams & Members screen
2. Enter team name
3. (Optional) Search and check members to add
4. Click [Create Team]
5. ✅ Success → Team created, you're the lead
6. Returns to Teams & Members screen with new team listed

**API Calls:**
- `POST /api/orgs/{orgId}/teams`
- `POST /api/teams/{teamId}/members`

---

#### **Screen 15: Team Detail View** (Click [···] → "Manage Team" or "View Team")
```
┌─────────────────────────────────────────────────────────┐
│  Engineering Team                            [✕]       │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  👥 8 members                         Your role: Lead    │
│                                                           │
│  ──────────────────────────────────────────────────────  │
│                                                           │
│  Team Members                        [+ Add Members]    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  👤 Sarah Johnson (You)              Lead  [···]│   │
│  │     sarah@company.com                            │   │
│  │                                                   │   │
│  │  👤 Mike Chen                       Member  [···]│   │
│  │     mike@company.com                             │   │
│  │                                                   │   │
│  │  👤 Lisa Wong                       Member  [···]│   │
│  │     lisa@company.com                             │   │
│  │                                                   │   │
│  │  👤 David Park                      Member  [···]│   │
│  │     david@company.com                            │   │
│  │                                                   │   │
│  │  ... 4 more members                 [Show All]  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  Shared Folders (3)                   [View All]        │
│  • Engineering Docs, Code, Architecture                  │
│                                                           │
│  ──────────────────────────────────────────────────────  │
│                                                           │
│  [Leave Team]                              [Close]      │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- View all team members with roles
- See shared folders accessible by this team
- **For Leads (Manage Team):**
  - [+ Add Members] button to add new members
  - [···] menu on each member → Remove member, Change role
  - Edit team name and settings
- **For Members (View Team):**
  - Read-only view of members and folders
- [Leave Team] button at bottom (all users)

**Member Context Menu (Lead only):**
```
┌─────────────────────────────┐
│ • Change to Lead            │
│ • Change to Member          │
│ • Remove from Team          │
└─────────────────────────────┘
```

**Workflow to Add Members:**
1. Click [+ Add Members]
2. Search box appears with org members
3. Check members to add
4. Click [Add]
5. ✅ Members added to team

**API Calls:**
- `GET /api/teams/{teamId}`
- `GET /api/teams/{teamId}/members`
- `POST /api/teams/{teamId}/members` (when adding)
- `DELETE /api/teams/{teamId}/members/{userId}` (when removing)

---

#### **Screen 16: Leave Team Confirmation** (Click [···] → "Leave Team")
```
┌─────────────────────────────────────────────────────────┐
│  Leave Engineering Team?                     [✕]       │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Are you sure you want to leave the                      │
│  "Engineering" team?                                     │
│                                                           │
│  You will lose access to:                                │
│  • 3 shared folders                                      │
│  • 127 documents                                         │
│  • Team chat channels                                    │
│                                                           │
│  ⚠️  You can rejoin if a team lead invites you again.   │
│                                                           │
│  [Cancel]                              [Leave Team]     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Shows team name
- Lists what user will lose access to
- Warning that they need re-invitation to rejoin
- Danger button styling on [Leave Team]

**Workflow:**
1. Click [···] next to team name
2. Select "Leave Team"
3. Confirmation modal appears
4. Review what you'll lose access to
5. Click [Leave Team] to confirm
6. ✅ Success → Team removed from your list
7. Toast notification: "You left Engineering team"

**API Call:** `DELETE /api/teams/{teamId}/members/{userId}` (self)

**Note:** If user is the last Lead, system prevents leaving or prompts to assign new lead first.

---

#### **Screen 17: Manage Organization** (Admin/Owner Only - Click 👤 → "Manage Organization")

```
┌─────────────────────────────────────────────────────────────────┐
│  Manage Organization - Acme Corp                       [✕]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🏢 Organization Details                                         │
│                                                                   │
│  Organization Name: Acme Corp                                    │
│  Plan: Enterprise • 25 members                                   │
│  Your Role: Owner                                                │
│  Created: Jan 15, 2024                                           │
│                                                                   │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  👥 Organization Members (25)                  [+ Invite Member] │
│                                                                   │
│  [Search members...]                          [Filter by role ▾] │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  👤 John Doe (You)                      Owner       [···] │ │
│  │     john@company.com                                       │ │
│  │     Member since: Jan 15, 2024                            │ │
│  │                                                            │ │
│  │  👤 Sarah Johnson                        Admin       [···] │ │
│  │     sarah@company.com                                      │ │
│  │     Member since: Jan 20, 2024                            │ │
│  │                                                            │ │
│  │  👤 Mike Chen                            Member      [···] │ │
│  │     mike@company.com                                       │ │
│  │     Member since: Feb 1, 2024                             │ │
│  │                                                            │ │
│  │  👤 Lisa Wong                            Member      [···] │ │
│  │     lisa@company.com                                       │ │
│  │     Member since: Feb 5, 2024                             │ │
│  │                                                            │ │
│  │  ... 21 more members                          [Show All]  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  📧 Pending Invitations (3)                  [View All]         │
│                                                                   │
│  • newuser@example.com (Member) - Expires in 5 days             │
│  • jane.smith@company.com (Admin) - Expires in 6 days           │
│  • bob@startup.com (Member) - Expires in 1 day ⚠️                │
│                                                                   │
│  [Manage Invitations]                                            │
│                                                                   │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  [Close]                                                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Access:** 
- Click 👤 Profile icon → "Manage Organization"
- Only visible to organization Owners and Admins

**Features:**

**1. Organization Overview:**
- Organization name and plan
- Total member count
- User's role
- Creation date

**2. Member Management:**
- **View all members** with their roles (Owner, Admin, Member)
- **Search members** by name or email
- **Filter by role** using dropdown
- **Member context menu** [···] for each member:
  ```
  ┌─────────────────────────────┐
  │ • Change Role               │  ← Owner/Admin only
  │   - Make Admin              │
  │   - Make Member             │
  │   - Make Owner              │
  │ • View Member Details       │
  │ ──────────────────────────  │
  │ • Remove from Organization  │  ← Owner/Admin only
  └─────────────────────────────┘
  ```

**3. Invite Members:**
- Click [+ Invite Member] button at top right
- Opens invitation modal (see Workflow 7)
- Admins and Owners can send invitations

**4. Pending Invitations:**
- Quick view showing 3 most recent pending invitations
- Shows email, role, and expiration time
- Warning icon (⚠️) for invitations expiring soon
- Click [View All] or [Manage Invitations] → Opens full invitations list (Screen 18)

**Permissions:**
- **Owner**: Full control - manage all members, invite, remove, change roles
- **Admin**: Can invite members, remove non-admin members, view all
- **Member**: Cannot access this screen

**API Calls:**
- `GET /api/orgs/{orgId}` - Get organization details
- `GET /api/orgs/{orgId}/members` - List all members
- `PUT /api/orgs/{orgId}/members/{userId}` - Update member role
- `DELETE /api/orgs/{orgId}/members/{userId}` - Remove member
- `GET /api/orgs/{orgId}/invitations?status=pending&limit=3` - Pending invitations preview

---

#### **Screen 18: View All Pending Invitations** (Click "Manage Invitations" from Screen 17)

```
┌─────────────────────────────────────────────────────────────────┐
│  Pending Invitations - Acme Corp                       [✕]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Active] [Pending] [Accepted] [Declined] [Expired] [Revoked]  │
│           ──────                                                 │
│                                                                   │
│  Pending Invitations (5)                       [+ Invite Member] │
│                                                                   │
│  [Search invitations...]                                         │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  📧 newuser@example.com                            [···]  │ │
│  │     Role: Member                                           │ │
│  │     Invited by: John Doe                                   │ │
│  │     Sent: 2 days ago • Expires in 5 days                  │ │
│  │                                                            │ │
│  │  📧 jane.smith@company.com                         [···]  │ │
│  │     Role: Admin                                            │ │
│  │     Invited by: You                                        │ │
│  │     Sent: 1 day ago • Expires in 6 days                   │ │
│  │                                                            │ │
│  │  📧 bob@startup.com                                [···]  │ │
│  │     Role: Member                                           │ │
│  │     Invited by: Sarah Lee                                  │ │
│  │     Sent: 6 days ago • Expires in 1 day                   │ │
│  │     ⚠️ Expires soon!                                       │ │
│  │                                                            │ │
│  │  📧 alice@company.com                              [···]  │ │
│  │     Role: Member                                           │ │
│  │     Invited by: John Doe                                   │ │
│  │     Sent: 3 days ago • Expires in 4 days                  │ │
│  │                                                            │ │
│  │  📧 david@tech.com                                 [···]  │ │
│  │     Role: Admin                                            │ │
│  │     Invited by: Sarah Johnson                              │ │
│  │     Sent: 5 hours ago • Expires in 6 days                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [Close]                                                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Tabs:**
- **Pending**: Invitations awaiting acceptance (default view)
- **Accepted**: Successfully joined members
- **Declined**: Invitations that were declined
- **Expired**: Invitations that expired (7 days)
- **Revoked**: Invitations cancelled by admin

**Invitation Context Menu [···]:**
```
┌─────────────────────────────┐
│ • Copy Invitation Link      │
│ • Resend Email              │
│ ──────────────────────────  │
│ • Revoke Invitation         │
└─────────────────────────────┘
```

**Actions:**
- **Copy Invitation Link**: Copy invitation URL to clipboard
- **Resend Email**: Send invitation email again (limited to 3 resends)
- **Revoke Invitation**: Cancel invitation (confirmation required)

**Features:**
- Search invitations by email
- Filter by status using tabs
- View detailed invitation history
- Warning indicators for expiring invitations
- Quick access to invite more members

**API Calls:**
- `GET /api/orgs/{orgId}/invitations` - List all invitations (with status filter)
- `POST /api/invitations/{invitationId}/resend` - Resend invitation email
- `DELETE /api/invitations/{invitationId}` - Revoke invitation

---

## 🔄 Key User Workflows

### Workflow 1: Complete Onboarding (First-Time User)
```
1. Open Panlo app
2. Sign in (Google or Email/Password)
3. Choose organization (or create new)
4. ✅ Personal space automatically created
5. Main app loads with Chat view (💬 icon active):
   - Left: Icon bar (🏢 org, 📁 files, 📊 space, 💬 chat, 👤 profile)
   - Middle: Chat list with [+ New Chat] button (empty initially)
   - Right: Welcome screen or empty state
     "Welcome to Panlo!
      Start a new chat or upload files to your space."
6. No previous chats yet - clean slate
7. User can:
   - Click [+ New Chat] to start chatting
   - Click 📁 icon to view/upload files
   - Click 📊 icon to view space (Personal Space only initially)
```

**Default State:**
- Chat view is default (💬 icon active)
- Personal space active by default
- No team spaces until user creates or joins one
- Empty chat list for new users

### Workflow 2: Start New Chat and Ask Questions
```
1. Click [+ New Chat] in middle panel
2. New chat tab opens in main window (right panel)
3. Input field ready: "Ask anything about your files..."
4. Type question (e.g., "What are AT's roles?")
5. Press [➤] or Enter to send
6. AI searches files in current space (Personal Space)
7. Response appears with:
   - Detailed answer
   - Source citations from documents
   - Document references with IDs
8. Chat auto-saved to chat list (middle panel)
9. Chat title generated from first message
10. Can continue asking follow-up questions
11. Each response cites sources from space
```

### Workflow 3: Switch Spaces or Create New Space
```
1. Click 📊 Spaces icon in left icon bar (OR)
   Click space selector in Files view: "[Marketing Q4 ▾]"
2. Space selector modal appears showing:
   
   ┌─────────────────────────────────────┐
   │  Select Space                  [×] │
   ├─────────────────────────────────────┤
   │                                     │
   │  Your Spaces in Acme Corp           │
   │                                     │
   │  📊 My Personal Space         ✓    │
   │     Owner • 12 files                │
   │                                     │
   │  📊 Marketing Q4                    │
   │     Owner • 24 files                │
   │                                     │
   │  📊 Engineering Team                │
   │     Contributor • 156 files         │
   │                                     │
   │  ─────────────────────────────────  │
   │                                     │
   │  [+ New Space]                      │
   │                                     │
   └─────────────────────────────────────┘

3. User can:
   - Click on any space to switch to it, OR
   - Click [+ New Space] to create a new team space

4. If [+ New Space] clicked → Create Space modal appears:
   
   ┌─────────────────────────────────────┐
   │  Create New Space             [×]  │
   ├─────────────────────────────────────┤
   │                                     │
   │  Space Name *                       │
   │  ┌─────────────────────────────┐   │
   │  │ Marketing Q4                 │   │
   │  └─────────────────────────────┘   │
   │                                     │
   │  Description (optional)             │
   │  ┌─────────────────────────────┐   │
   │  │ Q4 marketing campaign        │   │
   │  │ materials and planning       │   │
   │  └─────────────────────────────┘   │
   │                                     │
   │  This will be a Team Space          │
   │  (You can add members after)        │
   │                                     │
   │  [Cancel]         [Create Space]   │
   │                                     │
   └─────────────────────────────────────┘

5. Enter space name and optional description
6. Click [Create Space]
7. ✅ Team space created and becomes active
8. Space title updates to "Marketing Q4"
9. Files panel empty with [+ Upload File] button
10. Success notification: "Marketing Q4 space created!"
11. Optionally, add members via space menu or later
```

**Note:** 
- Personal space is auto-created on signup
- Only team spaces can be created manually
- New spaces start empty

---

### Workflow 3a: Add Files to Space
```
1. Ensure you're in the desired space (check 📊 icon is highlighted)
2. Click [+ Upload File] button at bottom of middle-left panel

   Option A: Upload New File
   ├─ Click [+ Upload File]
   ├─ File picker opens
   ├─ Select one or more files from computer
   ├─ Files upload with progress indicator
   └─ Files indexed and added to space

   Option B: Add Existing Files
   ├─ Click [+ Add Existing]
   ├─ Modal shows all files in organization
   ├─ Search bar at top
   ├─ Select files with checkboxes
   ├─ Click [Add to Space]
   └─ Files linked to this space

3. ✅ Files added to current space
4. Files appear in middle-left file list
5. Can click file to view in content area
6. Activity logged: "{Your Name} added 3 files"
7. Mini chat panel ready to answer questions about new files
```

**Permissions:**
- Owners and Contributors can add/upload files
- Viewers can only view files
- Contributors can remove only files they added
- Owners can remove any file from space

---

### Workflow 3b: Remove File from Space
```
1. View files in current space (middle-left panel)
2. Click file to open in content area
3. Scroll to bottom of document
4. Click [Remove from Space] button
5. Confirmation dialog appears:
   "Remove from space?"
   "This won't delete the file, just remove it from this space"
   [Cancel] [Remove from Space]
6. Click [Remove from Space] to confirm
7. ✅ File removed from file list
8. File still exists in organization database
9. File may still be available in other spaces
10. If it was the last space, file remains in org documents
```

**Permissions:**
- Contributors can remove only files they added
- Owners can remove any file from space
- Viewers cannot remove files

---

### Workflow 3c: Manage Space Settings and Sharing
```
1. In Files view, ensure you're in the desired space
2. Right-click on space title "[Marketing Q4 ▾]" at top
   OR
   Click 📊 icon in left bar → Click [···] next to space
3. Context menu appears with options
4. Click "Space Settings"
5. Space Settings modal opens showing:
   
   ┌─────────────────────────────────────────────┐
   │  Space Settings - Marketing Q4      [✕]    │
   ├─────────────────────────────────────────────┤
   │  📊 General                                 │
   │  • Edit name and description                │
   │  • View creation date and creator           │
   │                                             │
   │  👥 Members (8)               [View All]   │
   │  • Quick view of member breakdown           │
   │                                             │
   │  🔒 Privacy & Sharing                       │
   │  ☑ Allow members to invite others          │
   │  ☑ Allow link sharing                      │
   │  ☐ Make discoverable in org                │
   │                                             │
   │  Space Link: https://panlo.app/s/xyz  [📋] │
   │                                             │
   │  [Archive Space]  [Export Data]            │
   │  [Delete Space] ⚠️                         │
   └─────────────────────────────────────────────┘

6. Make desired changes:
   - Update space name or description
   - Enable/disable link sharing
   - Toggle member invitation permissions
   - Copy shareable link to invite external users
   
7. Click [Save Changes]
8. ✅ Settings updated immediately
9. Toast notification: "Space settings updated"

To Share Space via Link:
1. Open Space Settings
2. Enable "Allow link sharing" toggle
3. Copy the generated link
4. Share link via email/Slack/etc
5. Recipients with link can request access
6. Owner approves/denies access requests
```

**Sharing Options:**
- **Add Members Directly**: Context menu → "Add Members" → Select from org
- **Share via Link**: Space Settings → Enable link sharing → Copy link
- **Make Discoverable**: Space Settings → "Make discoverable in org" → All org members can find and request access

**API Calls:**
- `PUT /api/spaces/{spaceId}` - Update space settings
- `POST /api/spaces/{spaceId}/link` - Generate shareable link
- `GET /api/spaces/{spaceId}/access-requests` - View pending access requests

---

### Workflow 3d: Quick Space Switching
```
1. Currently in "Marketing Q4" space
2. Click on space title "Marketing Q4" at top of interface
3. Space selector modal appears (see Workflow 3 for full modal)
4. Click on different space (e.g., "Engineering Team")
5. ✅ Space switches instantly
6. Modal closes automatically
7. Interface updates:
   - Space title changes to "Engineering Team"
   - Middle-left panel → Shows files in Engineering space
   - Middle-right panel → Clears current document
   - Mini chat panel → Context switches to Engineering
   - Chat history cleared (fresh context)
8. AI queries now scoped to Engineering space files
9. All document tabs close (clean slate for new space)
10. File count updates in space title area
```

**Instant Context Switching:**
- File list refreshes immediately
- Chat context auto-scoped to new space
- No page refresh needed
- Separate chat history per space
- Can switch between spaces anytime
- Previous space state preserved (can switch back)

---

### Workflow 4: Create Team & Add Members
```
1. Click ⚙️ Settings → "Teams & Members"
2. Click [+ Create Team]
3. Enter team name (e.g., "Engineering")
4. (Optional) Search and check members to add
5. Click [Create Team]
6. ✅ Success → You're now the team lead
7. Team appears in Teams & Members list
8. Share folders with team using right-click menu on folders
```

### Workflow 5: Leave Team
```
1. Click ⚙️ Settings → "Teams & Members"
2. Find the team you want to leave
3. Click [···] next to team name
4. Select "Leave Team"
5. Review what access you'll lose
6. Click [Leave Team] to confirm
7. ✅ Success → Team removed from your list
8. Toast: "You left Engineering team"
```

### Workflow 6: Add Members to Team (Lead only)
```
1. Click ⚙️ Settings → "Teams & Members"
2. Click [···] next to your team
3. Select "Manage Team"
4. Click [+ Add Members]
5. Search for members by name or email
6. Check boxes next to members to add
7. Click [Add]
8. ✅ Success → Members added and notified
9. New members can now access team's shared folders
```

### Workflow 7: Invite New Member to Organization (Admin Only)
```
Option A: Via Avatar Menu (Recommended)
1. Click 👤 Profile icon → "Manage Organization"
2. Click [+ Invite Member] button

Option B: Via Settings
1. Click ⚙️ Settings → "Teams & Members"
2. Click [+ Invite Member]

3. Modal opens:
   ┌─────────────────────────────────────────┐
   │        Invite Member to Organization     │
   │                                          │
   │  Email address *                         │
   │  ┌──────────────────────────────────┐  │
   │  │ newuser@example.com               │  │
   │  └──────────────────────────────────┘  │
   │                                          │
   │  Role *                                  │
   │  ( ) Admin   (•) Member                 │
   │                                          │
   │  Personal message (optional)             │
   │  ┌──────────────────────────────────┐  │
   │  │ Welcome to our team! Looking     │  │
   │  │ forward to working with you.     │  │
   │  └──────────────────────────────────┘  │
   │                                          │
   │        [Cancel]    [Send Invitation]    │
   └─────────────────────────────────────────┘

4. Enter email address
5. Select role (Admin or Member)
6. (Optional) Add personal message
7. Click [Send Invitation]
8. ✅ Success toast: "Invitation sent to newuser@example.com"
9. Invitation appears in "Pending Invitations" section
10. Invitee receives email with invitation link
```

**API Call:** `POST /api/organizations/:orgId/invitations`

**What happens on backend:**
- Secure invitation token generated (64 chars)
- Invitation stored in database with 7-day expiration
- Email sent with branded invitation link
- Activity logged for audit

**Rate Limits:**
- 10 invitations per hour per organization
- 3 invitations per email per day

### Workflow 8: Accept Organization Invitation (Invitee)
```
1. Invitee receives email: "You're invited to join [Org Name] on Panlo"
2. Click [Accept Invitation] button in email
3. Opens Panlo app or web
   
   If NOT logged in:
   4a. Shows invitation details first:
       ┌─────────────────────────────────────────┐
       │  You're invited to join Acme Corp       │
       │                                          │
       │  👤 Invited by: John Doe                │
       │  🎭 Role: Member                        │
       │  💬 "Welcome to our team!"              │
       │                                          │
       │  ⏰ Expires in 6 days                   │
       │                                          │
       │        [Sign In to Accept]              │
       │        [Decline]                        │
       └─────────────────────────────────────────┘
   5a. Click [Sign In to Accept]
   6a. Login or create account
   7a. Automatically redirected back to accept invitation
   
   If ALREADY logged in:
   4b. Shows confirmation screen:
       ┌─────────────────────────────────────────┐
       │  Join Acme Corp?                        │
       │                                          │
       │  👤 Invited by: John Doe                │
       │  🎭 Role: Member                        │
       │  💬 "Welcome to our team!"              │
       │                                          │
       │  ✓ You'll get access to:                │
       │    • Shared team folders                │
       │    • Organization documents             │
       │    • Team chat history                  │
       │                                          │
       │  Accept as: newuser@example.com         │
       │                                          │
       │        [Decline]    [Accept & Join]     │
       └─────────────────────────────────────────┘
   5b. Click [Accept & Join]

8. ✅ Success! Redirected to organization dashboard
9. Toast: "Welcome to Acme Corp!"
10. Organization appears in org selector
11. Can now access shared folders and resources
```

**API Calls:**
- `GET /api/invitations/:token` - Get invitation details
- `POST /api/invitations/:token/accept` - Accept invitation

**Email Verification:**
- System validates logged-in user's email matches invitation email
- If mismatch: Shows error "This invitation was sent to a different email"

### Workflow 9: View Pending Invitations (Admin)
```
Option A: Via Avatar Menu (Recommended)
1. Click 👤 Profile icon → "Manage Organization"
2. Click [Manage Invitations] or [View All] in Pending Invitations section
3. Full invitations list appears (Screen 18)

Option B: Via Settings
1. Click ⚙️ Settings → "Teams & Members"
2. Click "Pending Invitations" tab

3. Shows list of pending invitations:
   ┌─────────────────────────────────────────────────────────┐
   │  Pending Invitations (5)                  [+ Invite]    │
   │                                                           │
   │  📧 newuser@example.com                           [···]  │
   │     Member • Invited 2 days ago • Expires in 5 days     │
   │     Invited by: John Doe                                │
   │                                                           │
   │  📧 jane.smith@company.com                        [···]  │
   │     Admin • Invited 1 day ago • Expires in 6 days       │
   │     Invited by: You                                      │
   │                                                           │
   │  📧 bob@startup.com                               [···]  │
   │     Member • Invited 6 days ago • Expires in 1 day      │
   │     Invited by: Sarah Lee                               │
   │     ⚠️ Expires soon!                                    │
   └─────────────────────────────────────────────────────────┘

4. Click [···] on any invitation for actions:
   • Resend Email (if implemented)
   • Copy Link
   • Revoke Invitation

5. Click "Revoke Invitation"
6. Confirmation dialog:
   "Are you sure you want to revoke this invitation?
    The invitation link will no longer work."
7. Click [Revoke]
8. ✅ Invitation removed from list
9. Toast: "Invitation to newuser@example.com revoked"
```

**API Calls:**
- `GET /api/organizations/:orgId/invitations?status=pending` - List invitations
- `DELETE /api/invitations/:invitationId` - Revoke invitation

**Tabs Available:**
- Pending (default)
- Accepted
- Declined
- Expired
- Revoked

### Workflow 10: Check My Invitations (Invitee)
```
1. User logs into Panlo
2. If user has pending invitations:
   ┌────────────────────────────────────────┐
   │  🔔 You have 2 pending invitations     │
   │                                         │
   │  View Invitations  [×]                 │
   └────────────────────────────────────────┘
   
3. Click [View Invitations]
4. Shows modal with all pending invitations:
   ┌─────────────────────────────────────────┐
   │  Your Invitations (2)                    │
   │                                          │
   │  🏢 Acme Corp                           │
   │     Member • Invited by John Doe        │
   │     "Welcome to our team!"              │
   │     Expires in 5 days                   │
   │     [Accept]  [Decline]                 │
   │                                          │
   │  🏢 Tech Startup Inc                    │
   │     Admin • Invited by Jane Smith       │
   │     "Join our engineering team!"        │
   │     Expires in 3 days                   │
   │     [Accept]  [Decline]                 │
   │                                          │
   │                              [Close]     │
   └─────────────────────────────────────────┘

5. Click [Accept] on desired invitation
6. See Workflow 8 (Accept Invitation) for full flow
```

**API Call:** `GET /api/users/me/invitations`

**Notification Badge:**
- Red badge on ⚙️ Settings icon if pending invitations
- Shows count (e.g., "2")
- Clears when all invitations processed

### Workflow 11: Browse and View File Content
```
1. Click "Files" tab in left panel
2. Middle panel shows list of all indexed files
3. (Optional) Use search or filters to find specific files
4. Click on a file in the middle panel
5. Right panel displays file content
6. Actions available:
   - [Download] to save file locally
   - [Share] to share with teams
   - [Ask AI about this file] to start contextual chat
7. Navigate pages with [Next Page >] / [< Previous Page]
8. Click another file to view different content
```

### Workflow 12: View and Continue Chat History
```
1. Click "Chats" tab in left panel
2. Middle panel shows list of all saved chats
3. (Optional) Search chats by title or content
4. Click on a chat in the middle panel
5. Right panel displays full chat history
6. Review previous messages and sources
7. (Optional) Click [Continue Chat] to add new messages
8. Type question in input at bottom
9. ✅ New message added to existing chat
10. Chat auto-saves with updated content
```

### Workflow 13: Save Current Chat for Later
```
1. Start new chat in main interface
2. Ask questions and get AI responses
3. Click [Save Chat] button (or [···] → Save)
4. Enter chat title in modal
5. (Optional) Add tags or description
6. Click [Save]
7. ✅ Chat saved and appears in Chats list
8. Can continue or view later from Chats tab
```

### Workflow 10: Switch Organization
```
1. Click 🏢 Organization icon in left icon bar (top)
2. Dropdown menu appears showing available organizations:

   ┌─────────────────────────────┐
   │  Your Organizations         │
   ├─────────────────────────────┤
   │  ✓ Acme Corp               │
   │    Enterprise • Owner       │
   │                             │
   │  Tech Startup Inc           │
   │    Pro • Member             │
   │                             │
   │  John's Personal Org        │
   │    Free • Owner             │
   ├─────────────────────────────┤
   │  + Create Organization      │
   └─────────────────────────────┘

3. Click on different organization (e.g., "Tech Startup Inc")
4. API call: PUT /api/users/me
   - Body: { "currentOrgId": "org_startup_123" }
   - Updates user's current_org_id
5. ✅ App switches to new organization
   - Spaces list updates (shows spaces in new org)
   - Personal space for this org loaded
   - Files panel clears/resets
   - Chat history scoped to new org
6. 🏢 icon updates to show current org
7. User continues working in new organization context
```

**API Requirements:**
- **Endpoint:** `PUT /api/users/me`
- **Purpose:** Update user's current organization
- **Request Body:**
  ```json
  {
    "currentOrgId": "org_startup_123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "currentOrgId": "org_startup_123",
    "organizationName": "Tech Startup Inc",
    "namespace": "techstartup",
    "plan": "pro",
    "role": "member"
  }
  ```

**Frontend State Management:**
- Organization switcher accessible via 🏢 icon
- Hover shows current org name
- Click shows dropdown with all orgs
- Selection triggers org switch and UI refresh
- All panels update with new org context

---

## 🎨 Design Principles (3-Panel Chat-Centric Layout)

### 1. **Icon-Driven Navigation**
- **Left icon bar** (50px) for primary navigation
- 5 core icons: Organization, Files, Spaces, Chats, Profile
- Hover shows tooltip with labels
- Click switches views (Files vs Chats)
- Minimal, unobtrusive design
- Always visible for quick access

### 2. **Three-Panel Workspace**
- **Panel 1** (Icon Bar, 50px): View switcher & navigation
- **Panel 2** (List, 250px): Chat list OR file list
- **Panel 3** (Main Window, Flexible): Tabbed content area
- Optimized for conversation with documents
- Clean, focused interface

### 3. **Chat-First Experience**
- **Chat view is default** on app load
- Conversation-centric design like ChatGPT/Claude
- [+ New Chat] always accessible at top
- Chat list in middle panel shows all conversations
- Input field always visible at bottom of main window
- Every chat auto-saved and accessible

### 4. **Dual View Modes**
- **Chats mode** (💬 icon): Browse conversations
  - Middle panel shows chat list
  - Click chat → Opens in main window
  - Multiple chats can be open in tabs
- **Files mode** (📁 icon): Browse documents
  - Middle panel shows file list
  - Click file → Opens in main window
  - Multiple files can be open in tabs
- Toggle between modes with left icon bar

### 5. **Space-Scoped Context**
- All chats and files scoped to current space
- Switch spaces via 📊 icon or space selector
- Personal space auto-created on signup
- Team spaces for collaboration
- AI responses use files from active space only

### 6. **Tabbed Main Window**
- Open multiple chats or files simultaneously
- [×] to close tabs
- [+] to open new tab
- Switch between content easily
- Clean, organized multitasking

### 7. **Inline Document Actions**
- [Add Context] button in chat to include files
- [Summarize] button in file view
- [Ask AI] button in file headers
- Actions appear contextually
- No separate panels needed

### 8. **Automatic Source Citations**
- Every AI response shows sources
- Document IDs and references inline
- "Panlo can make mistakes" disclaimer
- Transparency in AI answers
- Easy to verify information

---

## 🎯 Key Features Summary

| Feature | Location | Action |
|---------|----------|--------|
| **Start New Chat** | Middle panel: "[+ New Chat]" button | Begin new AI conversation |
| **Chat with AI** | Main window: input field at bottom | Type question & press [➤] |
| **View Chat History** | 💬 icon (left bar) → Middle panel | Browse all saved conversations |
| **View Files** | 📁 icon (left bar) → Middle panel | Browse documents in space |
| **Read Documents** | Click file → Opens in main window tab | Full document viewer |
| **Switch Organization** | 🏢 icon (top of left bar) | Change active organization |
| **Switch/Select Space** | 📊 icon (left bar) OR space selector | Opens modal to switch spaces |
| **Create Team Space** | 📊 icon → Modal → "[+ New Space]" | Create new team space |
| **Space Context Menu** | Right-click space OR click [···] | Access space settings & actions |
| **Space Settings** | Context menu → "Space Settings" | Edit space name, privacy, members |
| **Share Space** | Context menu → "Add Members" | Invite users to space |
| **Upload File** | Files view: "[+ Upload]" button | Upload new document to space |
| **Add Existing File** | Files view: "[+ Add File]" button | Add org file to space |
| **Add File to Chat** | Chat view: "[Add Context]" button | Include specific files in conversation |
| **Summarize Doc** | File view: "[Summarize]" button | AI summary of current file |
| **Ask About File** | File view: input at bottom | Ask questions about open document |
| **Multiple Tabs** | Main window: [×] [+] buttons | Open multiple chats/files |
| **Settings** | 👤 icon (bottom of left bar) | Profile, spaces, account |
| **Manage Organization** | 👤 icon → "Manage Organization" | View members, invite, manage roles (Admin only) |
| **Invite to Organization** | Manage Organization → "[+ Invite Member]" | Send invitation to new member (Admin only) |
| **View Invitations** | Manage Organization → "Manage Invitations" | View/manage pending invitations (Admin only) |

---

## 🔔 Notifications & Feedback

### Status Messages
- Toast notifications for quick feedback
  - ✅ "Space created successfully"
  - ✅ "3 files added to space"
  - ✅ "Member added to Marketing Q4"
  - ⚠️ "Indexing in progress..."
  - ❌ "Failed to add file - check permissions"

### Progress Indicators
- Modal with progress bar during indexing
- "Indexing files..." loading state
- Badge counts on Files/Chats tabs
- Space member counts update in real-time

### Notification Display Examples

#### **Toast Notification (Bottom Right)**
```
┌─────────────────────────────────────────┐
│  ✅ Space Created Successfully           │
│                                          │
│  "Marketing Q4" is ready to use.        │
│  Add files to start collaborating.      │
│                                  [✕]    │
└─────────────────────────────────────────┘
```

#### **Progress Toast (Persistent)**
```
┌─────────────────────────────────────────┐
│  ⏳ Adding Files to Space                │
│                                          │
│  Marketing Q4                            │
│  ████████░░░░░░░░ 12/25 files          │
│                            [View Details]│
└─────────────────────────────────────────┘
```

#### **Error Notification**
```
┌─────────────────────────────────────────┐
│  ⚠️ Connection Error                     │
│                                          │
│  Failed to sync folder "Engineering".   │
│                                          │
│  [Retry]  [Dismiss]                     │
└─────────────────────────────────────────┘
```

---

## 🎛️ Toggle Components & UI Patterns

### Toggle Switch Component

**Visual Design:**
```
Off State:  [ ○───── ]  Gray background, circle on left
On State:   [ ─────● ]  Blue/Green background, circle on right
```

**Usage Examples:**

#### **1. Simple Toggle (Boolean)**
```
┌────────────────────────────────────────┐
│ Enable desktop notifications    [ ●──]│
└────────────────────────────────────────┘
```

#### **2. Toggle with Description**
```
┌────────────────────────────────────────┐
│ Watch subfolders                 [ ●──]│
│ Automatically monitor all               │
│ subdirectories for changes              │
└────────────────────────────────────────┘
```

#### **3. Toggle List (Multiple Options)**
```
Notify me when...

📁 Folder Events
  [ ●──] Folder indexing completes
  [ ●──] New files detected in watch folder
  [ ●──] Folder shared with me
  [ ○──] Indexing errors occur
```

#### **4. Conditional Toggle (Dependent Setting)**
```
[ ●──] Background sync when app is closed
  ↳ [ ○──] Pause sync on battery power
      (Only available when background sync is enabled)
```

### Checkbox vs Toggle Guidelines

**Use Checkboxes (☑) for:**
- Multiple independent selections
- Lists where user can select many items
- Confirming actions ("I agree to Terms")
- File type filters
- Team selection in multi-select scenarios

**Use Toggle Switches for:**
- Binary on/off settings
- Feature enablement
- Real-time changes that take effect immediately
- System-level preferences
- Single option enable/disable

### Toggle States & Interactions

#### **States:**
1. **Off (Inactive)**
   ```
   [ ○───── ]  Default, feature disabled
   ```

2. **On (Active)**
   ```
   [ ─────● ]  Feature enabled
   ```

3. **Disabled (Grayed)**
   ```
   [ ○───── ]  Cannot interact (permission/condition not met)
   ```

4. **Loading (Animated)**
   ```
   [ ⟳───── ]  Processing change
   ```

#### **Interaction Flow:**
```
User clicks toggle → Loading state (⟳) → API call → 
  Success: New state (●/○) + Toast notification
  Error: Revert to previous state + Error toast
```

### Radio Buttons (Single Choice)

**Use for mutually exclusive options:**

```
Theme
  ● Light              (Selected)
  ○ Dark               (Unselected)
  ○ Auto (System)      (Unselected)
```

```
Default visibility
  ● Private   ○ Shared   ○ Public
```

**Guidelines:**
- Always have one option selected by default
- Use for 2-5 options (use dropdown for more)
- Provide clear labels
- Group related options visually

### Dropdown Menus (Select Lists)

**Use for:**
- Lists with 5+ options
- Options that don't need to be visible at once
- Space-constrained interfaces

```
Language
┌───────────────────────────────────────┐
│  English    [▼]                       │
└───────────────────────────────────────┘

When clicked:
┌───────────────────────────────────────┐
│  English    [▲]                       │
├───────────────────────────────────────┤
│  English                          ✓  │
│  Español                              │
│  Français                             │
│  Deutsch                              │
│  中文                                  │
│  日本語                                │
└───────────────────────────────────────┘
```

### Slider Controls

**Use for:**
- Numeric ranges
- Percentage values
- Time intervals

```
Notification Duration
┌───────────────────────────────────────┐
│  ├────●────────────┤  5 seconds      │
│  3s              10s                  │
└───────────────────────────────────────┘
```

### Button States

#### **Primary Action Button**
```
Enabled:   [ Add Folder ]  Blue background, white text
Hover:     [ Add Folder ]  Darker blue, slight scale
Loading:   [ ⟳ Adding... ] Disabled, spinner icon
Disabled:  [ Add Folder ]  Gray, no interaction
```

#### **Secondary Action Button**
```
Enabled:   [ Cancel ]      Gray/white background, gray text
Hover:     [ Cancel ]      Light gray background
```

#### **Danger Button**
```
Enabled:   [ Delete ]      Red background, white text
Confirm:   [ ⚠️ Confirm Delete? ]  Requires second click
```

### Loading & Progress States

#### **Spinner (Indeterminate)**
```
⟳  Loading...
```

#### **Progress Bar (Determinate)**
```
████████░░░░░░░░ 45%
```

#### **Skeleton Loading (Content Placeholder)**
```
┌────────────────────────────────────┐
│  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                 │
│  ▒▒▒▒▒▒▒▒ ▒▒▒▒▒▒▒▒▒▒              │
│                                    │
│  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                 │
│  ▒▒▒▒▒▒▒▒▒▒▒▒▒                    │
└────────────────────────────────────┘
```

### Badges & Indicators

**Notification Badges:**
```
Watch 3    (Numeric count)
Smart 0    (Zero state)
Watch •    (Has updates, no count)
```

**Status Indicators:**
```
● Online    (Green dot)
● Syncing   (Blue dot, animated)
● Error     (Red dot)
○ Offline   (Gray outline)
```

**Tags/Labels:**
```
[Private]   [Shared]   [Public]
[Admin]     [Member]   [Guest]
[Free]      [Pro]      [Enterprise]
```

### Context Menus

**Right-click interactions:**
```
┌─────────────────────────────┐
│ • Rename                    │  ← Primary actions
│ • Share with teams...       │
│ • Make public              │
│ • View details             │
│ ──────────────────────────  │  ← Divider
│ • Pause watching           │  ← Destructive/Secondary
│ • Remove from watch list   │
└─────────────────────────────┘
```

**Design Guidelines:**
- Group related actions
- Put destructive actions at bottom
- Use dividers to separate groups
- Max 7-8 items (use submenus if more)
- Include keyboard shortcuts when applicable

### Keyboard Shortcuts Display

```
Settings                        ⌘,
Search                          ⌘F
New Folder                      ⌘N
Toggle Sidebar                  ⌘B
```

---

## 🚀 Implementation Summary

### What We've Designed

**✅ Slack-Style Onboarding:**
1. Login first (Google OAuth or Email/Password)
2. Choose/create organization
3. Enter main app

**✅ Simplified Main UI:**
- Left panel with 3 sections:
  - 📁 Public (org-wide folders)
  - 📁 Your Folders (personal)
  - 📁 Teams (shared by team)
- Chat-centric main area
- Minimal top bar (Settings & Stats icons only)

**✅ Modal-Based Actions:**
- Add folder
- Share with teams
- Create team
- Settings & preferences

**✅ Enterprise Features:**
- Multi-org support
- Team-based sharing
- Role-based access control
- Background indexing
- Real-time collaboration
- **Organization Management** (Admin/Owner only)
  - Access via Avatar menu → "Manage Organization"
  - Member list with roles (Owner, Admin, Member)
  - Search and filter members
  - Change member roles
  - Remove members from organization
- **Organization Invitations**
  - Secure token-based email invitations
  - Admin can invite members with specific roles
  - Accessible via "Manage Organization" screen
  - View pending, accepted, declined, expired invitations
  - Resend or revoke invitations
  - Automatic expiration (7 days)
  - Rate limiting and abuse prevention
  - Complete audit trail

**✅ Settings & Preferences:**
- Detailed Notifications Settings screen
  - Granular control by category (Folders, Teams, Chat, System)
  - Do Not Disturb mode
  - Custom display duration
- Watch Folders Settings screen
  - Default behavior configuration
  - Sync interval controls
  - File type filters
  - Storage management
- Profile & Account Settings screen
  - Profile information editing
  - Security settings (2FA, password, sessions)
  - Theme toggle (Light/Dark/Auto)
  - Language selection
  - Startup preferences

**✅ UI Component Patterns:**
- Toggle switches (on/off states)
- Checkboxes (multi-select)
- Radio buttons (single choice)
- Dropdown menus (select lists)
- Notification toasts (success/error/warning/info)
- Progress indicators (bars, spinners, skeleton loading)
- Badges and status indicators
- Context menus (right-click actions)
- Button states (enabled/hover/loading/disabled)
- Design guidelines for when to use each component type

---

## 📋 Next Steps for Implementation

### Ready to Build?

**Option 1: Technical Architecture** 📐
- Set up Electron + React project
- Project structure & folder organization
- Build tools (Vite/Webpack)
- Database (IndexedDB/SQLite for local cache)

**Option 2: Component Library** ⚛️
- React component breakdown
- Reusable UI components
- State management strategy
- Styling approach (CSS Modules/Tailwind)

**Option 3: API Integration** 🔌
- Connect to `express-enterprise.js` backend
- Authentication flow (JWT handling)
- WebSocket for real-time updates
- File system watching

**Option 4: Build First Screen** 🎨
- Implement Login/Signup screen
- Google OAuth integration
- Form validation
- Working prototype

**Option 5: Complete Roadmap** 🗺️
- Phase 1: Core app shell
- Phase 2: Folder watching & indexing
- Phase 3: Chat interface
- Phase 4: Team collaboration
- Phase 5: Polish & deployment

---

### Current Architecture Match

✅ **Matches your existing Panlo app**
✅ **Compatible with `express-enterprise.js` backend**
✅ **Uses existing database schema**
✅ **Leverages authentication endpoints we built**

**Ready to proceed?** Choose your next step above!

---

## 📖 Quick Reference: Screens & Components

### All Application Screens

| Screen # | Screen Name | Purpose | API Endpoints |
|----------|-------------|---------|---------------|
| **1** | Welcome/Login | User authentication | `POST /api/auth/google`<br>`POST /api/auth/login` |
| **2** | Sign Up | New user registration | `POST /api/auth/signup` |
| **3** | Organization Selector | Choose/create organization | `GET /api/auth/me`<br>`POST /api/orgs` |
| **4** | Create New Organization | Organization setup | `POST /api/orgs` |
| **5** | Main Application Interface | Three-panel layout (default) | `POST /api/orgs/{orgId}/chat` |
| **5a** | Detail View - File Content | File viewing in detail panel | `GET /api/orgs/{orgId}/documents/{docId}`<br>`GET /api/orgs/{orgId}/documents/{docId}/content` |
| **5b** | Detail View - Chat History | Chat history in detail panel | `GET /api/chats/{chatId}`<br>`GET /api/chats/{chatId}/messages` |
| **6** | Chat Panel Collapsed View | Two-panel focus mode | - |
| **7** | Create New Space | Space creation modal | `POST /api/orgs/{orgId}/spaces` |
| **8** | Space Context Menu & Add Members | Right-click space actions | `POST /api/spaces/{spaceId}/members` |
| **8a** | Space Settings | Edit space configuration | `GET /api/spaces/{spaceId}`<br>`PUT /api/spaces/{spaceId}`<br>`POST /api/spaces/{spaceId}/link` |
| **9** | Settings Modal | Main settings navigation | - |
| **10** | Notifications Settings | Configure notifications | `PUT /api/users/preferences/notifications` |
| **11** | Watch Folders Settings | Configure folder behavior | `PUT /api/users/preferences/folders` |
| **12** | Profile & Account | User profile & preferences | `PUT /api/users/profile`<br>`PUT /api/users/password`<br>`POST /api/users/2fa/enable` |
| **13** | Teams & Members | View & manage teams | `GET /api/orgs/{orgId}/teams` |
| **13a** | Team Context Menu | Team actions menu | - |
| **14** | Create Team | Create new team | `POST /api/orgs/{orgId}/teams`<br>`POST /api/teams/{teamId}/members` |
| **15** | Team Detail View | View team members & details | `GET /api/teams/{teamId}`<br>`GET /api/teams/{teamId}/members` |
| **16** | Leave Team Confirmation | Confirm leaving team | `DELETE /api/teams/{teamId}/members/{userId}` |
| **17** | Manage Organization (Admin) | Organization member management | `GET /api/orgs/{orgId}`<br>`GET /api/orgs/{orgId}/members`<br>`PUT /api/orgs/{orgId}/members/{userId}`<br>`DELETE /api/orgs/{orgId}/members/{userId}` |
| **18** | View All Pending Invitations | View/manage all invitations | `GET /api/orgs/{orgId}/invitations`<br>`POST /api/invitations/{invitationId}/resend`<br>`DELETE /api/invitations/{invitationId}` |

### UI Components Summary

| Component | When to Use | Implementation Notes |
|-----------|-------------|---------------------|
| **Toggle Switch** | Binary on/off settings | Use for real-time changes, feature enablement |
| **Checkbox** | Multiple selections | Use for lists, file types, team selection |
| **Radio Button** | Single choice (2-5 options) | Always have one selected by default |
| **Dropdown Menu** | 5+ options | Use when space is constrained |
| **Toast Notification** | Quick feedback | Auto-dismiss after 3-10 seconds |
| **Progress Bar** | Determinate progress | Show percentage and file counts |
| **Spinner** | Indeterminate loading | Use for unknown duration tasks |
| **Badge** | Counts & indicators | Show on tabs, folders (Watch 3, Smart 0) |
| **Context Menu** | Secondary actions | Right-click, max 7-8 items |
| **Modal Dialog** | Focused actions | Settings, add folder, create team |

### Settings Navigation Map

```
⚙️ Settings
├─ 👤 Profile & Account
│  ├─ Profile Information (name, email, photo)
│  ├─ Security (password, 2FA, sessions)
│  ├─ Current Organization
│  └─ Preferences (language, theme, startup)
│
├─ 👥 Teams & Members
│  ├─ Your Teams (list with roles)
│  ├─ Create Team
│  └─ Invite Members
│
├─ 📁 Watch Folders Settings
│  ├─ Default Folder Behavior
│  ├─ Sync Settings
│  ├─ File Type Filters
│  └─ Storage & Performance
│
├─ 🔔 Notifications
│  ├─ Desktop Notifications Toggle
│  ├─ Folder Events
│  ├─ Team & Collaboration
│  ├─ Chats & AI Assistant
│  ├─ System Alerts
│  ├─ Display Duration
│  └─ Do Not Disturb Mode
│
├─ 🔄 Switch Organization
├─ ❓ Help & Feedback
├─ ℹ️ About Panlo
└─ 🚪 Sign Out
```

### Notification Types

| Type | Icon | Use Case | Auto-Dismiss |
|------|------|----------|--------------|
| **Success** | ✅ | Action completed successfully | Yes (3s) |
| **Error** | ❌ | Operation failed | No (manual) |
| **Warning** | ⚠️ | Important alert | No (manual) |
| **Info** | ℹ️ | General information | Yes (5s) |
| **Loading** | ⟳ | Operation in progress | No (until complete) |

### File Type Defaults

| Category | Extensions | Default Enabled |
|----------|-----------|-----------------|
| **Documents** | .pdf, .doc, .docx, .txt | ✅ Yes |
| **Spreadsheets** | .xls, .xlsx, .csv | ✅ Yes |
| **Presentations** | .ppt, .pptx | ✅ Yes |
| **Code** | .js, .py, .java, .ts, .tsx, .jsx | ✅ Yes |
| **Markdown** | .md | ✅ Yes |
| **Images** | .jpg, .png, .gif, .svg | ❌ No |
| **Videos** | .mp4, .mov, .avi | ❌ No |
| **Custom** | User-defined | Based on user input |

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| **Settings** | ⌘ , | Ctrl , |
| **Search** | ⌘ F | Ctrl F |
| **New Folder** | ⌘ N | Ctrl N |
| **Toggle Sidebar** | ⌘ B | Ctrl B |
| **Close Modal** | Esc | Esc |
| **Submit/Confirm** | Enter | Enter |
| **Cancel** | Esc | Esc |

---

## 🎉 Documentation Complete!

This comprehensive UX workflow document now includes:

✅ **20+ detailed screen mockups** with ASCII art UI representations  
✅ **10 key user workflows** with step-by-step instructions  
✅ **Unified three-panel layout** with consolidated detail view for files and chats  
✅ **File browsing system** with content preview and actions  
✅ **Chat history management** with save, view, and continue features  
✅ **Complete team management system** with create, view, leave workflows  
✅ **Organization management** (Admin/Owner only) with member list, roles, and invitations  
✅ **Complete notification system** with toast examples and settings  
✅ **Comprehensive toggle & UI patterns** with usage guidelines  
✅ **Full settings screens** (Notifications, Folders, Profile, Teams)  
✅ **Component usage guidelines** for all UI elements  
✅ **Design patterns** for toggles, dropdowns, buttons, and badges  
✅ **Quick reference tables** for screens, components, and shortcuts

**Total Document Size:** ~2,800+ lines of comprehensive UX documentation

**Key Innovation:** Consolidated detail view seamlessly switches between file content and chat history, providing a unified browsing and conversation experience.

**Next Steps:** Choose an implementation option from the "Next Steps for Implementation" section above to begin building!

