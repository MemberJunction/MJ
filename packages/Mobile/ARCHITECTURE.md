# MemberJunction Mobile App Architecture Proposal

## Executive Summary

This document proposes an architecture for native iOS and Android mobile applications that maximize reuse of MemberJunction's existing TypeScript codebase while delivering mobile-native experiences for features that truly benefit from mobile context.

**Key Recommendations:**
1. **React Native** for maximum TypeScript/JavaScript code reuse (80%+ of business logic)
2. **Mobile-first AI assistant** as the primary interaction paradigm
3. **Offline-first architecture** with intelligent sync
4. **Voice-enabled interfaces** leveraging existing TTS/STT capabilities
5. **Progressive feature rollout** starting with high-value mobile scenarios

---

## Part 1: Feature Analysis - What Makes Sense on Mobile

### Tier 1: Perfect Mobile Fit (High Priority)

#### 1. **AI-Powered Assistant (Skip Mobile)**
The conversational AI interface is ideal for mobile:
- Voice input using existing OpenAI Whisper integration
- Voice output using ElevenLabs TTS
- Quick questions while away from desk
- Natural language queries for data lookup
- Agent-assisted task completion

**Mobile Advantages:**
- Hands-free operation (voice)
- Contextual awareness (location, time, calendar)
- Push notifications for agent task completion
- Quick access without opening laptop

#### 2. **Notifications & Approvals**
Mobile is the natural home for:
- Real-time push notifications
- Quick approval workflows
- Status updates on running processes
- Agent execution alerts
- Record change notifications

**Existing Infrastructure:**
- WebSocket subscriptions already implemented
- Notification entity system exists
- User preferences for notification routing

#### 3. **Quick Data Lookup**
Mobile-optimized read scenarios:
- Customer/contact lookup before meetings
- Quick searches while on the go
- Barcode/QR scanning for inventory
- Reference data access
- Recent items and favorites

#### 4. **Conversation & Chat**
Existing conversation system translates well:
- Message threads with artifact sharing
- Multi-turn AI conversations
- Collaboration with team members
- Voice messages (natural for mobile)

#### 5. **Field Data Capture**
Mobile-native input capabilities:
- Photo capture with OCR/AI analysis
- Voice notes transcribed via Whisper
- GPS/location tagging
- Signature capture
- Quick form entry for common tasks

---

### Tier 2: Good Mobile Fit (Medium Priority)

#### 6. **Dashboards (Simplified)**
Mobile-appropriate dashboard views:
- KPI cards and key metrics
- Trend indicators (up/down arrows)
- Alerts and exceptions
- Swipeable dashboard cards

**Not for Mobile:**
- Complex D3.js charts (defer to web)
- ERD diagrams
- Multi-pane layouts

#### 7. **Task Management**
Mobile task workflows:
- Todo lists from agent runs
- Quick task completion
- Reminders and due dates
- Task assignment notifications

#### 8. **Record Quick Actions**
Focused entity interactions:
- Edit frequently-used fields
- Status changes
- Adding notes/comments
- File attachments (photos, documents)

---

### Tier 3: Web-First (Low/No Mobile Priority)

These should remain web-only or link to web:

| Feature | Reason |
|---------|--------|
| Complex form editing | Too many fields, complex layouts |
| Data grids with many columns | Screen real estate |
| ERD diagrams | Visual complexity |
| Report building | Complex UI interactions |
| Admin/configuration | Infrequent, needs precision |
| Code editing | Keyboard-intensive |
| Bulk operations | Better with mouse/keyboard |

**Strategy:** Deep link to web app for these features.

---

## Part 2: Technical Architecture

### Recommended Technology: React Native + TypeScript

**Why React Native:**
1. **Maximum Code Reuse** - All MJ TypeScript packages work directly
2. **Single Codebase** - iOS + Android from one codebase
3. **Native Performance** - Bridges to native APIs for voice, camera, etc.
4. **Type Safety** - Full TypeScript support maintained
5. **Hot Reload** - Fast development iteration
6. **Proven at Scale** - Used by Meta, Microsoft, Shopify

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    React Native UI Layer                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Screens  │ │Components│ │Navigation│ │  Hooks   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                    State Management Layer                        │
│  ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐  │
│  │   Zustand/Redux  │ │  React Query   │ │  Offline Queue   │  │
│  │   (App State)    │ │ (Server State) │ │  (Sync Engine)   │  │
│  └──────────────────┘ └────────────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                 MemberJunction Core (REUSED)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  @memberjunction/global        - Utilities               │  │
│  │  @memberjunction/core          - Entity framework        │  │
│  │  @memberjunction/core-entities - Generated classes       │  │
│  │  @memberjunction/ai            - LLM abstractions        │  │
│  │  @memberjunction/credentials   - Auth management         │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    Data Provider Layer                           │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │  GraphQL Provider   │    │  Mobile Data Provider       │    │
│  │  (from MJ packages) │    │  (SQLite + Sync Engine)     │    │
│  └─────────────────────┘    └─────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                    Native Modules Layer                          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐   │
│  │ Voice  │ │ Camera │ │  Push  │ │Biometric│ │  Keychain  │   │
│  │ Input  │ │  QR/BC │ │ Notif  │ │  Auth   │ │  Storage   │   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        Network Layer                             │
│  ┌────────────────────┐    ┌────────────────────────────────┐  │
│  │   GraphQL Client   │    │   WebSocket (Subscriptions)    │  │
│  │   (Apollo/URQL)    │    │   (Real-time updates)          │  │
│  └────────────────────┘    └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                         MJAPI Server
```

### Package Reuse Strategy

#### Direct Reuse (No Changes Required)

| Package | Use Case |
|---------|----------|
| `@memberjunction/global` | Utilities, class factory, caching, validation |
| `@memberjunction/core` | Entity framework, metadata, RunView |
| `@memberjunction/core-entities` | All generated entity classes |
| `@memberjunction/ai` | LLM provider abstraction |
| `@memberjunction/credentials` | Secure credential storage |
| `@memberjunction/graphql-dataprovider` | API communication |
| `@memberjunction/templates-base-types` | Template processing |

#### Light Adaptation Required

| Package | Adaptation Needed |
|---------|-------------------|
| `@memberjunction/ai-prompts` | Works as-is, wrap for mobile UX |
| `@memberjunction/ai-agents` | Works as-is, add mobile progress UI |
| `@memberjunction/encryption` | Swap key source for mobile keychain |

#### New Mobile-Specific Packages

| Package | Purpose |
|---------|---------|
| `@memberjunction/mobile-data-provider` | SQLite caching + offline sync |
| `@memberjunction/mobile-voice` | Voice recording + Whisper transcription |
| `@memberjunction/mobile-push` | Push notification handling |
| `@memberjunction/mobile-auth` | Biometric + secure token storage |

---

## Part 3: Offline-First Architecture

### Sync Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    Sync Engine Architecture                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │   Online    │────▶│  Sync Queue │────▶│   Offline   │  │
│   │   Cache     │◀────│   Engine    │◀────│   Storage   │  │
│   └─────────────┘     └─────────────┘     └─────────────┘  │
│         │                    │                   │          │
│         ▼                    ▼                   ▼          │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │   GraphQL   │     │  Conflict   │     │   SQLite    │  │
│   │   Server    │     │  Resolver   │     │   Database  │  │
│   └─────────────┘     └─────────────┘     └─────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Sync Policies by Entity Type

| Entity Type | Sync Strategy | Offline Behavior |
|-------------|---------------|------------------|
| Reference Data | Sync on login, background refresh | Full offline |
| User's Records | Sync on access, push changes | Full offline |
| Large Datasets | Page on demand, don't cache | Online only |
| Conversations | Sync recent, lazy load history | Partial offline |
| Artifacts | Download on request, cache | Selective offline |

### Conflict Resolution

```typescript
interface SyncConflict<T extends BaseEntity> {
  localRecord: T;
  serverRecord: T;
  conflictFields: string[];
  localTimestamp: Date;
  serverTimestamp: Date;
}

enum ConflictResolution {
  ServerWins = 'server_wins',      // Default for most entities
  LocalWins = 'local_wins',        // For draft content
  Merge = 'merge',                 // Field-level merge
  UserDecides = 'user_decides'     // Present UI for complex conflicts
}
```

---

## Part 4: Voice-First AI Interface

### Voice Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Voice Interaction Flow                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User Speaks ──▶ Native Voice ──▶ Audio Stream             │
│                   Recording         (WAV/M4A)               │
│                      │                  │                   │
│                      ▼                  ▼                   │
│               ┌─────────────────────────────┐               │
│               │   OpenAI Whisper API        │               │
│               │   (Speech-to-Text)          │               │
│               └─────────────────────────────┘               │
│                           │                                 │
│                           ▼                                 │
│               ┌─────────────────────────────┐               │
│               │   AI Agent / Skip           │               │
│               │   (Process Intent)          │               │
│               └─────────────────────────────┘               │
│                           │                                 │
│                           ▼                                 │
│               ┌─────────────────────────────┐               │
│               │   ElevenLabs / OpenAI TTS   │               │
│               │   (Text-to-Speech)          │               │
│               └─────────────────────────────┘               │
│                           │                                 │
│                           ▼                                 │
│  User Hears ◀── Native Audio ◀── Audio Stream              │
│                   Playback         (MP3/AAC)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Voice Commands Examples

| Voice Command | AI Action |
|---------------|-----------|
| "Find John Smith's contact info" | RunView on Contacts, speak result |
| "What's my sales pipeline total?" | Execute dashboard query, speak KPI |
| "Create a note for Acme Corp" | Create entity record with dictation |
| "What meetings do I have today?" | Query calendar integration |
| "Approve the pending request from Sarah" | Execute approval workflow |
| "Remind me to follow up on this tomorrow" | Create task/reminder |

### Wake Word Integration (Optional)

For hands-free operation:
- "Hey Skip" wake word
- Continuous listening mode
- Privacy: Process wake word on-device

---

## Part 5: Feature Specifications

### 5.1 AI Assistant (Primary Feature)

```
┌─────────────────────────────────────────┐
│         AI Assistant Screen             │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │      Conversation Thread          │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 👤 Find contacts at Acme   │  │  │
│  │  └─────────────────────────────┘  │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 🤖 I found 3 contacts...   │  │  │
│  │  │    • John Smith (CEO)      │  │  │
│  │  │    • Jane Doe (CTO)        │  │  │
│  │  │    • Bob Wilson (Sales)    │  │  │
│  │  │                            │  │  │
│  │  │    [View All] [Call John]  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 🎙️ Listening...            │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  [🎤]  Type a message...    [📎]  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Features:**
- Voice-first with keyboard fallback
- Inline action buttons for common operations
- Artifact preview (documents, code, charts)
- Agent status indicators (thinking, executing action, waiting)
- Conversation history with search
- Share/export capabilities

### 5.2 Notifications Hub

```
┌─────────────────────────────────────────┐
│         Notifications                   │
├─────────────────────────────────────────┤
│  Today                                  │
│  ┌───────────────────────────────────┐  │
│  │ 🔔 Approval Required              │  │
│  │    Purchase order #1234 - $5,000  │  │
│  │    From: John Smith               │  │
│  │    [Approve] [Deny] [View]        │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ 🤖 Agent Complete                 │  │
│  │    Report generation finished     │  │
│  │    [View Report]                  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ 📝 Record Updated                 │  │
│  │    Acme Corp opportunity changed  │  │
│  │    Stage: Proposal → Negotiation  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Yesterday                              │
│  ┌───────────────────────────────────┐  │
│  │ ...                               │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 5.3 Quick Search

```
┌─────────────────────────────────────────┐
│  🔍 Search...                      [🎤] │
├─────────────────────────────────────────┤
│  Recent                                 │
│  ┌───────────────────────────────────┐  │
│  │ 👤 John Smith - Acme Corp        │  │
│  │ 📋 Q4 Sales Report               │  │
│  │ 🏢 Acme Corporation              │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Favorites                              │
│  ┌───────────────────────────────────┐  │
│  │ ⭐ My Open Opportunities         │  │
│  │ ⭐ Key Accounts Dashboard        │  │
│  │ ⭐ Daily Sales Report            │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Entity Types                           │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐       │
│  │👤│ │🏢│ │📋│ │💼│ │📊│       │
│  └───┘ └───┘ └───┘ └───┘ └───┘       │
└─────────────────────────────────────────┘
```

### 5.4 Record View (Mobile-Optimized)

```
┌─────────────────────────────────────────┐
│  ◀ Back        John Smith        ⋮      │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │              👤                   │  │
│  │         John Smith                │  │
│  │    CEO at Acme Corporation       │  │
│  │    📧 john@acme.com              │  │
│  │    📱 (555) 123-4567             │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Quick Actions                          │
│  [📞 Call] [✉️ Email] [💬 Message]      │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 📋 Related                        │  │
│  │    └─ 5 Opportunities ($125K)    │  │
│  │    └─ 12 Activities              │  │
│  │    └─ 3 Documents                │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 📝 Recent Activity               │  │
│  │    Today: Email sent             │  │
│  │    Yesterday: Call logged        │  │
│  │    Dec 20: Meeting completed     │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Edit in Web App]                      │
└─────────────────────────────────────────┘
```

### 5.5 KPI Dashboard

```
┌─────────────────────────────────────────┐
│  Dashboard              [Refresh] [⚙️]   │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐│
│  │  📈 Pipeline Value        ▲ 12%    ││
│  │     $2.5M                          ││
│  │     ████████████░░░░ 75% to goal   ││
│  └─────────────────────────────────────┘│
│  ┌────────────────┐ ┌──────────────────┐│
│  │ 🎯 Open Deals  │ │ ✅ Won This Mo.  ││
│  │     47         │ │     12           ││
│  │   ▲ 5 new     │ │   $450K          ││
│  └────────────────┘ └──────────────────┘│
│  ┌────────────────┐ ┌──────────────────┐│
│  │ 📅 Meetings    │ │ ⚠️ At Risk       ││
│  │   Today: 3     │ │     5 deals      ││
│  │   This Week: 8 │ │   Need attention ││
│  └────────────────┘ └──────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ 🔔 Alerts                          ││
│  │ • Large deal closing soon ($500K)  ││
│  │ • 3 overdue follow-ups             ││
│  │ • Quota at risk for this quarter   ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

---

## Part 6: Security Architecture

### Authentication Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Authentication Flow                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. App Launch                                               │
│     │                                                        │
│     ▼                                                        │
│  ┌─────────────────┐     ┌─────────────────┐                │
│  │ Check Keychain  │────▶│ Valid Token?    │                │
│  │ for JWT Token   │     │ Not Expired?    │                │
│  └─────────────────┘     └─────────────────┘                │
│                                │                             │
│              ┌─────────────────┴─────────────────┐          │
│              ▼                                   ▼          │
│        ┌─────────┐                         ┌─────────┐      │
│        │   Yes   │                         │   No    │      │
│        └─────────┘                         └─────────┘      │
│              │                                   │          │
│              ▼                                   ▼          │
│  ┌─────────────────┐              ┌─────────────────────┐  │
│  │ Optional:       │              │ Show Login Screen   │  │
│  │ Biometric Auth  │              │ (OAuth Provider)    │  │
│  │ (Face/Touch ID) │              │                     │  │
│  └─────────────────┘              └─────────────────────┘  │
│              │                                   │          │
│              ▼                                   ▼          │
│  ┌─────────────────┐              ┌─────────────────────┐  │
│  │ Resume Session  │              │ OAuth Flow:         │  │
│  │                 │              │ • Auth0             │  │
│  │                 │              │ • MSAL (Microsoft)  │  │
│  │                 │              │ • Google            │  │
│  └─────────────────┘              └─────────────────────┘  │
│                                              │              │
│                                              ▼              │
│                                   ┌─────────────────────┐  │
│                                   │ Store JWT + Refresh │  │
│                                   │ in Secure Keychain  │  │
│                                   └─────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Security Measures

| Layer | Measure |
|-------|---------|
| Storage | iOS Keychain / Android Keystore for tokens |
| Biometric | Face ID / Touch ID for session resume |
| Network | Certificate pinning for MJAPI |
| Data at Rest | SQLite encryption (SQLCipher) |
| Sensitive Fields | Re-auth required for PII access |
| Session | Auto-logout on inactivity |
| Device | Jailbreak/root detection |

### Permissions Model

```typescript
interface MobilePermissions {
  // Device Permissions
  camera: boolean;         // For document scanning, photos
  microphone: boolean;     // For voice input
  location: boolean;       // For location-tagged records
  notifications: boolean;  // For push notifications
  biometrics: boolean;     // For secure authentication

  // MJ Permissions (from server)
  entityPermissions: Map<string, EntityPermission>;
  userRoles: string[];
  applicationAccess: string[];
}
```

---

## Part 7: Push Notification System

### Notification Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Push Notification Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  MJAPI Server                                               │
│       │                                                     │
│       │ WebSocket Event / Trigger                           │
│       ▼                                                     │
│  ┌─────────────────┐                                       │
│  │ Notification    │                                       │
│  │ Engine          │                                       │
│  │ (New Package)   │                                       │
│  └─────────────────┘                                       │
│       │                                                     │
│       │ Route based on user preferences                     │
│       ▼                                                     │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │ APNs (iOS)      │     │ FCM (Android)   │               │
│  └─────────────────┘     └─────────────────┘               │
│       │                         │                          │
│       ▼                         ▼                          │
│  ┌─────────────────────────────────────────┐               │
│  │         Mobile Device                   │               │
│  │  ┌─────────────────────────────────┐   │               │
│  │  │ Push Notification Handler       │   │               │
│  │  │ • Deep link to relevant screen  │   │               │
│  │  │ • Inline actions (approve/deny) │   │               │
│  │  │ • Badge count management        │   │               │
│  │  └─────────────────────────────────┘   │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Notification Types

| Type | Trigger | Actions |
|------|---------|---------|
| Approval Required | Workflow reaches approval step | Approve, Deny, View |
| Agent Complete | AI agent finishes execution | View Result, Dismiss |
| Record Changed | Entity update (subscribed) | View Record |
| Mention | User mentioned in conversation | Reply, View |
| Reminder | Scheduled reminder fires | Complete, Snooze |
| Alert | KPI threshold breached | View Dashboard |

---

## Part 8: Development Roadmap

### Phase 1: Foundation (8-10 weeks)

**Sprint 1-2: Project Setup**
- React Native project initialization
- TypeScript configuration
- MJ package integration verification
- CI/CD pipeline (App Store Connect, Play Console)
- Basic navigation structure

**Sprint 3-4: Authentication**
- OAuth integration (Auth0/MSAL)
- Biometric authentication
- Secure token storage
- Session management
- Deep linking setup

**Sprint 5: Core Data Layer**
- GraphQL client integration
- MJ entity framework verification
- Basic offline storage (SQLite)
- API error handling

### Phase 2: AI Assistant MVP (6-8 weeks)

**Sprint 6-7: Chat Interface**
- Conversation UI components
- Message threading
- Keyboard input
- Basic AI agent integration

**Sprint 8-9: Voice Integration**
- Voice recording component
- Whisper API integration
- TTS playback
- Voice command handling

**Sprint 10: Agent Features**
- Agent status indicators
- Action buttons in chat
- Artifact preview
- History and search

### Phase 3: Core Features (8-10 weeks)

**Sprint 11-12: Notifications**
- Push notification setup (APNs/FCM)
- Notification center UI
- Deep linking handlers
- Badge management

**Sprint 13-14: Search & Browse**
- Global search implementation
- Entity type browsing
- Recent items
- Favorites

**Sprint 15-16: Record Views**
- Mobile-optimized record display
- Quick actions
- Related records
- Activity timeline

### Phase 4: Dashboard & Polish (6-8 weeks)

**Sprint 17-18: Dashboards**
- KPI cards
- Metric displays
- Refresh and caching
- Alert integration

**Sprint 19-20: Offline & Sync**
- Sync engine implementation
- Conflict resolution
- Offline indicators
- Background sync

**Sprint 21-22: Polish**
- Performance optimization
- Accessibility
- App Store submission
- Beta testing

### Total Timeline: ~28-36 weeks (7-9 months)

---

## Part 9: Team Requirements

### Recommended Team Structure

| Role | Count | Responsibilities |
|------|-------|------------------|
| Mobile Tech Lead | 1 | Architecture, code review, MJ integration |
| React Native Developer | 2-3 | Feature development, both platforms |
| Backend Developer | 1 | MJAPI extensions for mobile (push, etc.) |
| UI/UX Designer | 1 | Mobile-specific design, prototypes |
| QA Engineer | 1 | Mobile testing, device coverage |

### Skills Required

**Must Have:**
- React Native experience
- TypeScript proficiency
- GraphQL client experience
- iOS & Android development basics

**Nice to Have:**
- MemberJunction familiarity
- Voice interface experience
- Offline-first architecture experience
- App Store submission experience

---

## Part 10: Package Structure

### New Packages to Create

```
packages/
├── Mobile/
│   ├── mobile-core/                    # Mobile-specific utilities
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   ├── MobileDataProvider.ts
│   │   │   │   └── OfflineSyncEngine.ts
│   │   │   ├── storage/
│   │   │   │   ├── SecureStorage.ts
│   │   │   │   └── SQLiteCache.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mobile-voice/                   # Voice input/output
│   │   ├── src/
│   │   │   ├── VoiceRecorder.ts
│   │   │   ├── WhisperClient.ts
│   │   │   ├── TTSPlayer.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mobile-push/                    # Push notifications
│   │   ├── src/
│   │   │   ├── PushNotificationHandler.ts
│   │   │   ├── DeepLinkRouter.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── mobile-auth/                    # Mobile authentication
│       ├── src/
│       │   ├── BiometricAuth.ts
│       │   ├── OAuthManager.ts
│       │   ├── TokenStorage.ts
│       │   └── index.ts
│       └── package.json
│
├── MJServer/
│   └── src/
│       └── mobile/                     # Server-side mobile support
│           ├── pushNotifications.ts    # APNs/FCM integration
│           └── mobileConfig.ts         # Mobile-specific settings
│
└── apps/
    └── mobile/                         # React Native app
        ├── src/
        │   ├── screens/
        │   ├── components/
        │   ├── navigation/
        │   ├── hooks/
        │   └── services/
        ├── ios/
        ├── android/
        └── package.json
```

---

## Part 11: Success Metrics

### Key Performance Indicators

| Metric | Target | Measurement |
|--------|--------|-------------|
| App Launch Time | < 2 seconds | Cold start to usable |
| Voice Response Time | < 3 seconds | Speak to first response |
| Offline Capability | 80% features | Core features work offline |
| Crash Rate | < 0.1% | Crash-free sessions |
| Push Delivery | > 95% | Successful delivery rate |
| User Adoption | 60% of web users | Within 6 months |
| Session Duration | > 3 min avg | Time spent in app |
| Daily Active Users | 40% of mobile users | DAU/MAU ratio |

### User Experience Goals

1. **Voice-first**: Users can complete common tasks without typing
2. **Instant Access**: Critical info available in < 3 taps
3. **Notification-driven**: Proactive alerts for important events
4. **Seamless Handoff**: Easy transition to web for complex tasks
5. **Offline Resilient**: Core features work without connectivity

---

## Conclusion

This architecture maximizes MemberJunction's existing investment by:

1. **Reusing 80%+ of business logic** through TypeScript package sharing
2. **Leveraging existing AI infrastructure** for voice-first mobile experience
3. **Building on proven patterns** (GraphQL, entity framework, auth providers)
4. **Focusing on mobile-appropriate features** rather than replicating web

The AI assistant with voice capabilities represents the strongest differentiator, turning the mobile app into a productivity multiplier rather than just a scaled-down version of the web experience.

### Next Steps

1. Review and approve this architecture proposal
2. Validate technical assumptions with proof-of-concept
3. Finalize team staffing
4. Begin Phase 1 implementation
