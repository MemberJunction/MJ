# Quick Start Guide

## Run the Prototype

```bash
cd plans/mj-explorer-new-ux/explorer-prototype
npm start
```

Open browser to [http://localhost:4200](http://localhost:4200)

## What You'll See

### 1. Smart Header
- **Logo** (blue "MJ" box) - replaceable with user's logo
- **App Name** - Currently shows "Conversations"
- **Navigation** - Changes based on active app:
  - Conversations: Chat | Collections (3) | Tasks (12)
  - Settings: Breadcrumb trail
- **Actions** - Search, Notifications, User menu

### 2. Single Tab by Default
- Starts with one tab: "Chat"
- Clean interface, no visual clutter

### 3. Try the Conversations App

**Click "Chat"**: Shows chat messages
- Click **"Open Thread in New Tab"** button
- Second tab appears! 📑
- Tab bar shows: `Chat` | `Chat Thread: Project Discussion`
- Click between tabs to switch
- Close tabs with X button

**Click "Collections"**: Shows collection cards
**Click "Tasks"**: Shows task list with badges

### 4. Try the Settings App

**Click user avatar (top right) → Settings**
- Header changes to **breadcrumb** mode
- Shows: `Settings › User Preferences › Profile`
- Left sidebar with: Profile, Notifications, Appearance
- Click through each - watch breadcrumb update!

### 5. Tab Persistence

**Refresh the page** - Your tabs are still there! 🎉
- Uses localStorage for persistence
- In production, this will use MJ workspace entities

## Key Interactions to Test

1. **Header Navigation Updates**
   - Switch between Conversations and Settings
   - Watch header change from list → breadcrumb

2. **Multi-Tab Workflow**
   - Open multiple tabs from different apps
   - See how they organize
   - Close some, keep others

3. **Badge Indicators**
   - Collections shows "(3)"
   - Tasks shows "(12)"
   - These are mock - real app would show actual counts

4. **Breadcrumb Navigation**
   - In Settings, click breadcrumb segments
   - Jump back to parent sections
   - Current page is not clickable (no route)

## Architecture Highlights

### IApp Interface
Each app implements this contract:
```typescript
GetNavigationType(): 'list' | 'breadcrumb'
GetNavItems(): NavItem[]        // List mode
GetBreadcrumbs(): Breadcrumb[]  // Breadcrumb mode
RequestNewTab(...)              // Opens new tab
```

### Shell Service
Coordinates everything:
- Registers apps
- Manages tabs
- Handles navigation
- Persists to localStorage

### No Left Panel!
All navigation in the header - maximizes content space.

## What's NOT in This Prototype

- Golden Layout drag-drop, split panes (installed but not wired up yet)
- Real database/entity system (using localStorage mock)
- App-to-app resource requests
- Custom search handlers
- Mobile responsive (needs work)

These will be added in next iterations!

## File Structure

```
src/app/
├── core/                  # Shared interfaces & services
│   ├── models/app.interface.ts
│   └── services/
│       ├── shell.service.ts
│       └── storage.service.ts
├── shell/                 # Chrome components
│   ├── header/
│   └── tab-container/
└── apps/                  # Individual apps
    ├── conversations/
    └── settings/
```

## Next Steps for You

1. Play with it! Click around, open tabs, navigate
2. Check the code - it's clean and well-documented
3. Imagine your own apps fitting into this pattern
4. Think about what navigation style each would use

## Questions?

See `PROTOTYPE-README.md` for detailed architecture documentation.
