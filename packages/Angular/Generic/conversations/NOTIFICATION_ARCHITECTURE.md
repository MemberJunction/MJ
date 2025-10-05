# Notification System - Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Notification System                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Component Layer                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────┐         ┌──────────────────────┐        │
│  │ Conversation List  │         │   Chat Component     │        │
│  │                    │         │                      │        │
│  │ • Badge Display    │         │ • Message Tracking   │        │
│  │ • Click Handler    │         │ • Clear on Open      │        │
│  └────────────────────┘         └──────────────────────┘        │
│            │                              │                      │
│            ▼                              ▼                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │   NotificationBadgeComponent                    │            │
│  │                                                  │            │
│  │   • Count Badge  • Dot Badge                    │            │
│  │   • Pulse Badge  • NEW Badge                    │            │
│  │   • Animations   • Priority Colors              │            │
│  └─────────────────────────────────────────────────┘            │
│            │                                                     │
│            ▼                                                     │
│  ┌─────────────────────────────────────────────────┐            │
│  │   ActivityIndicatorComponent                    │            │
│  │                                                  │            │
│  │   • Agent Process • Processing • Typing         │            │
│  │   • Animated Dots • Custom Text                 │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────┐           │
│  │   NotificationService                             │           │
│  │                                                   │           │
│  │   Core Operations:                                │           │
│  │   • trackNewMessage(id, timestamp, priority)     │           │
│  │   • trackNewMessages(id, count, timestamp, pri)  │           │
│  │   • trackNewArtifact(id)                         │           │
│  │   • trackAgentProcess(id, active)                │           │
│  │   • markConversationAsRead(id)                   │           │
│  │   • clearAllNotifications(id)                    │           │
│  │                                                   │           │
│  │   Observable Streams:                             │           │
│  │   • notifications$                                │           │
│  │   • totalUnreadCount$                             │           │
│  │   • changeEvents$                                 │           │
│  │   • preferences$                                  │           │
│  │                                                   │           │
│  │   Configuration:                                  │           │
│  │   • updatePreferences(prefs)                     │           │
│  │   • muteConversation(id)                         │           │
│  │   • unmuteConversation(id)                       │           │
│  │                                                   │           │
│  │   Desktop/Audio:                                  │           │
│  │   • showDesktopNotification(title, body, id)    │           │
│  │   • playNotificationSound()                      │           │
│  │   • requestDesktopPermission()                   │           │
│  └──────────────────────────────────────────────────┘           │
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────┐           │
│  │   Internal State Management                       │           │
│  │                                                   │           │
│  │   • BehaviorSubject<notifications>               │           │
│  │   • BehaviorSubject<preferences>                 │           │
│  │   • Subject<changeEvents>                        │           │
│  └──────────────────────────────────────────────────┘           │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Persistence Layer                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────┐           │
│  │   LocalStorage                                    │           │
│  │                                                   │           │
│  │   Keys:                                           │           │
│  │   • mj_conversation_notifications (main state)   │           │
│  │   • mj_notification_change (sync events)         │           │
│  │                                                   │           │
│  │   Data Structure:                                 │           │
│  │   {                                               │           │
│  │     conversations: {                              │           │
│  │       [conversationId]: {                         │           │
│  │         unreadMessageCount: number,               │           │
│  │         lastReadMessageTimestamp: Date,           │           │
│  │         hasNewArtifacts: boolean,                 │           │
│  │         ...                                       │           │
│  │       }                                           │           │
│  │     },                                            │           │
│  │     preferences: { ... },                         │           │
│  │     lastUpdated: Date                             │           │
│  │   }                                               │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Cross-Tab Sync Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────┐           │
│  │   StorageEvent Listener                           │           │
│  │                                                   │           │
│  │   Tab 1          Tab 2          Tab 3            │           │
│  │     │              │              │               │           │
│  │     ▼              ▼              ▼               │           │
│  │   [State]  ◄────►  [State]  ◄────►  [State]      │           │
│  │                                                   │           │
│  │   When Tab 1 updates notification state:         │           │
│  │   1. Updates local BehaviorSubject                │           │
│  │   2. Saves to localStorage                        │           │
│  │   3. Broadcasts change event                      │           │
│  │   4. Tab 2 & 3 receive storage event             │           │
│  │   5. Tab 2 & 3 reload from localStorage          │           │
│  │   6. Tab 2 & 3 emit new values to subscribers    │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### New Message Received Flow

```
┌─────────────┐
│  Message    │
│  Arrives    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  Is Active Conversation?    │
└──────┬──────────────┬───────┘
       │ No           │ Yes
       │              │
       ▼              ▼
┌──────────────┐  ┌────────────┐
│  Track       │  │  Do Nothing│
│  Notification│  │            │
└──────┬───────┘  └────────────┘
       │
       ▼
┌──────────────────────────────┐
│  NotificationService         │
│  • Update internal state     │
│  • Emit to observables       │
│  • Save to localStorage      │
│  • Broadcast to other tabs   │
│  • Play sound (if enabled)   │
│  • Show desktop (if enabled) │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  UI Updates Automatically    │
│  • Badge appears on list     │
│  • Count increments          │
│  • Animation plays           │
└──────────────────────────────┘
```

### User Opens Conversation Flow

```
┌─────────────┐
│  User       │
│  Clicks     │
│  Convo      │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────┐
│  ConversationStateService    │
│  • Set active conversation   │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  NotificationService         │
│  • markConversationAsRead()  │
│  • clearArtifactNotif()      │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Update State                │
│  • unreadCount = 0           │
│  • lastReadTimestamp = now   │
│  • Emit to observables       │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  UI Updates                  │
│  • Badge disappears          │
│  • Fade-out animation        │
└──────────────────────────────┘
```

### Badge Rendering Flow

```
┌─────────────────────────────┐
│  NotificationBadgeComponent │
└──────┬──────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Input: conversationId       │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Subscribe to:               │
│  getBadgeConfig$(id)         │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Compute BadgeConfig         │
│  • Check preferences         │
│  • Check muted status        │
│  • Count notifications       │
│  • Determine type & priority │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│  Render Based on Config      │
│                              │
│  Type:                       │
│  • count → <div>5</div>      │
│  • dot → <div class="dot">   │
│  • pulse → animated rings    │
│  • new → <div>NEW</div>      │
│                              │
│  Priority:                   │
│  • normal → blue             │
│  • high → orange             │
│  • urgent → red + shake      │
└──────────────────────────────┘
```

## State Management

### Notification State Structure

```typescript
{
  conversations: {
    "conv-123": {
      conversationId: "conv-123",
      unreadMessageCount: 5,
      lastReadMessageTimestamp: "2025-10-01T10:00:00Z",
      lastMessageTimestamp: "2025-10-01T10:30:00Z",
      hasNewArtifacts: true,
      hasActiveAgentProcesses: false,
      newArtifactCount: 2,
      activeAgentProcessCount: 0,
      lastNotificationTimestamp: "2025-10-01T10:30:00Z",
      highestPriority: "high"
    },
    "conv-456": { ... }
  },
  preferences: {
    enableSound: true,
    enableDesktopNotifications: false,
    enableInAppNotifications: true,
    showBadges: true,
    mutedConversations: ["conv-789"]
  },
  lastUpdated: "2025-10-01T10:30:05Z"
}
```

## Observable Streams

```
NotificationService Observables:
├── notifications$
│   └── Emits: Record<string, ConversationNotification>
│       Updates: On any notification change
│
├── preferences$
│   └── Emits: NotificationPreferences
│       Updates: When user changes settings
│
├── notificationItems$
│   └── Emits: NotificationItem[]
│       Updates: When items added/removed
│
├── changeEvents$
│   └── Emits: NotificationChangeEvent
│       Updates: On every change (for logging/analytics)
│
├── totalUnreadCount$
│   └── Emits: number
│       Derived: Sum of all unread counts
│
└── hasAnyNotifications$
    └── Emits: boolean
        Derived: totalUnreadCount > 0
```

## Performance Characteristics

```
Operation                     Time Complexity    Memory
─────────────────────────────────────────────────────────
Track new message            O(1)               ~100 bytes
Mark as read                 O(1)               -100 bytes
Get badge config             O(1)               0
Clear notifications          O(1)               -varies
Update preferences           O(1)               ~50 bytes
Save to localStorage         O(n)               varies
Load from localStorage       O(n)               varies
Cross-tab broadcast          O(1)               ~1KB
```

Where n = number of conversations with notifications (typically < 100)

## Security Model

```
┌─────────────────────────────────────────────────────────┐
│  Browser Security Boundaries                             │
└─────────────────────────────────────────────────────────┘

Domain: example.com
├── Tab 1: Can access localStorage
├── Tab 2: Can access localStorage
└── Tab 3: Can access localStorage

Domain: other.com
└── Cannot access example.com localStorage

localStorage:
├── Same-origin policy enforced
├── No sensitive data stored
└── Domain-restricted access

Desktop Notifications:
├── Requires user permission
├── HTTPS only (except localhost)
└── No sensitive content in body

Storage Events:
├── Only triggered for same origin
└── Cannot cross domains
```

## Scalability Considerations

```
Metric                  Current Design       Scale Limit
──────────────────────────────────────────────────────────
Conversations           O(n) storage         ~1000
Notifications/Conv      O(1) tracking        Unlimited
Observable Updates      O(subscribers)       ~100 subs
LocalStorage Size       ~1-2KB/conv          5-10MB total
Cross-tab Latency       ~50ms                N/A
Badge Render Time       ~16ms                60fps
```

## Extension Points

```
┌─────────────────────────────────────────────────────────┐
│  Future Extension Opportunities                          │
└─────────────────────────────────────────────────────────┘

1. Server-side Sync
   └── Persist notifications to database
       └── Sync across devices

2. Push Notifications
   └── Service Worker integration
       └── Background notifications

3. Rich Notifications
   └── Action buttons in notifications
       └── Inline reply capability

4. Notification History
   └── Keep log of all notifications
       └── Search and filter history

5. Custom Handlers
   └── Pluggable notification handlers
       └── Third-party integrations

6. Analytics
   └── Track notification engagement
       └── Optimize notification timing
```

## Integration Points

```
MemberJunction Conversation System
├── ConversationStateService
│   └── Active conversation tracking
│       └── Triggers: markAsRead on selection
│
├── MessageListComponent
│   └── Message rendering
│       └── Triggers: trackNewMessage on receive
│
├── ArtifactPanelComponent
│   └── Artifact display
│       └── Triggers: trackNewArtifact on create
│
├── AgentProcessPanel
│   └── Agent execution
│       └── Triggers: trackAgentProcess on start/end
│
└── ConversationListComponent
    └── Conversation display
        └── Displays: NotificationBadgeComponent
```

This architecture provides a solid foundation for notification management while remaining flexible and extensible for future enhancements.
