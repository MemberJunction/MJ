# Notification System - Quick Reference

## Import

```typescript
import {
  NotificationService,
  NotificationBadgeComponent,
  ActivityIndicatorComponent,
  BadgeConfig,
  ActivityIndicatorConfig,
  NotificationPreferences
} from '@memberjunction/ng-conversations';
```

## Common Tasks

### Track New Message
```typescript
notificationService.trackNewMessage(conversationId, new Date(), 'normal');
```

### Track Multiple Messages
```typescript
notificationService.trackNewMessages(conversationId, 5, new Date(), 'high');
```

### Track New Artifact
```typescript
notificationService.trackNewArtifact(conversationId);
```

### Track Agent Process
```typescript
// Start
notificationService.trackAgentProcess(conversationId, true);

// Complete
notificationService.trackAgentProcess(conversationId, false);
```

### Mark as Read
```typescript
notificationService.markConversationAsRead(conversationId);
```

### Clear Notifications
```typescript
// Clear specific type
notificationService.clearArtifactNotifications(conversationId);

// Clear all for conversation
notificationService.clearAllNotifications(conversationId);

// Clear all globally
notificationService.clearAllNotificationsGlobal();
```

### Mute/Unmute
```typescript
// Mute
notificationService.muteConversation(conversationId);

// Unmute
notificationService.unmuteConversation(conversationId);

// Check if muted
const isMuted = notificationService.isConversationMuted(conversationId);
```

## Template Usage

### Basic Badge
```html
<mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>
```

### Manual Badge Config
```html
<mj-notification-badge [badgeConfig]="{
  show: true,
  count: 5,
  type: 'count',
  priority: 'high',
  animate: true
}"></mj-notification-badge>
```

### Activity Indicator
```html
<mj-activity-indicator [config]="{
  show: true,
  type: 'agent',
  text: 'Processing...'
}"></mj-activity-indicator>
```

## Observable Streams

### Get Total Unread Count
```typescript
notificationService.totalUnreadCount$.subscribe(count => {
  console.log('Total unread:', count);
});
```

### Get Conversation Notification
```typescript
notificationService.getConversationNotification$(conversationId)
  .subscribe(notification => {
    console.log('Notification state:', notification);
  });
```

### Get Badge Config
```typescript
notificationService.getBadgeConfig$(conversationId)
  .subscribe(config => {
    console.log('Badge config:', config);
  });
```

### Listen for Changes
```typescript
notificationService.changeEvents$.subscribe(event => {
  console.log('Notification event:', event);
  // event: { conversationId, type, action, timestamp }
});
```

## Preferences

### Update Preferences
```typescript
notificationService.updatePreferences({
  enableSound: true,
  enableDesktopNotifications: true,
  showBadges: true
});
```

### Desktop Notifications
```typescript
// Request permission
const granted = await notificationService.requestDesktopPermission();

// Show notification
notificationService.showDesktopNotification(
  'New Message',
  'You have a new message',
  conversationId
);
```

## Priority Levels

- `'low'` - Low priority (blue badge)
- `'normal'` - Normal priority (blue badge) - default
- `'high'` - High priority (orange badge)
- `'urgent'` - Urgent priority (red badge with shake animation)

## Badge Types

- `'count'` - Shows numeric count (e.g., "5", "99+")
- `'dot'` - Small dot indicator
- `'pulse'` - Animated pulsing ring (for active processes)
- `'new'` - "NEW" label badge

## Activity Types

- `'agent'` - Agent process (blue background)
- `'processing'` - Processing (yellow background)
- `'typing'` - Typing indicator (gray background)

## Storage

Notifications are automatically persisted to `localStorage` under key:
- `mj_conversation_notifications` - Main notification state

## Cross-tab Sync

Changes are automatically synchronized across browser tabs using:
- `mj_notification_change` - Change event broadcast key

## Best Practices Checklist

- ✅ Clear notifications when conversation is opened
- ✅ Don't track notifications for active conversation
- ✅ Use appropriate priority levels
- ✅ Request desktop permission before enabling
- ✅ Unsubscribe from observables in ngOnDestroy
- ✅ Batch track multiple messages at once
- ✅ Check preferences before playing sounds
- ✅ Mute conversations for user control

## Troubleshooting

### Badges not showing
- Check if `showBadges` preference is enabled
- Verify conversation is not muted
- Check if `muteUntil` has expired

### Desktop notifications not working
- Verify HTTPS (required except localhost)
- Check permission status
- Ensure `enableDesktopNotifications` is true

### Sounds not playing
- Check `enableSound` preference
- Verify browser audio policy compliance
- Check browser console for errors

### Cross-tab not syncing
- Verify localStorage is available
- Check browser's storage quota
- Ensure same domain/origin

## Performance Tips

1. Use `trackNewMessages()` for batches instead of loop
2. Subscribe to observables only when needed
3. Use `shareReplay(1)` for derived streams
4. Clear old notifications periodically
5. Limit notification history size

## Code Examples by Scenario

### New message arrives
```typescript
onMessageReceived(message: ConversationDetailEntity) {
  const activeId = this.conversationState.getActiveConversationId();
  if (message.ConversationID !== activeId) {
    this.notificationService.trackNewMessage(
      message.ConversationID,
      message.__mj_CreatedAt,
      'normal'
    );
  }
}
```

### User opens conversation
```typescript
selectConversation(id: string) {
  this.conversationState.setActiveConversation(id);
  this.notificationService.markConversationAsRead(id);
  this.notificationService.clearArtifactNotifications(id);
}
```

### Agent starts processing
```typescript
onAgentStart(conversationId: string) {
  this.notificationService.trackAgentProcess(conversationId, true);
}
```

### Load unread messages on startup
```typescript
async loadUnreadMessages() {
  const messages = await this.loadMessagesFromDB();
  const lastRead = this.getLastReadTimestamp();
  const unread = messages.filter(m => m.timestamp > lastRead);

  if (unread.length > 0) {
    this.notificationService.trackNewMessages(
      conversationId,
      unread.length,
      unread[0].timestamp,
      'normal'
    );
  }
}
```
