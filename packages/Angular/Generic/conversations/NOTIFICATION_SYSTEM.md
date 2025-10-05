# Notification System

A comprehensive notification system for the MemberJunction conversation framework with unread badges, activity indicators, and real-time synchronization.

## Features

- **Unread Message Tracking**: Automatic tracking of unread messages per conversation
- **Badge System**: Visual badges with different styles (count, dot, pulse, new)
- **Activity Indicators**: Animated indicators for agent processes, typing, etc.
- **Real-time Updates**: Observable streams for reactive UI updates
- **Cross-tab Sync**: Notification state synchronized across browser tabs via localStorage
- **Customizable Preferences**: User preferences for sounds, desktop notifications, muting
- **Priority Levels**: Support for low, normal, high, and urgent notification priorities
- **Animations**: Smooth animations for badge appearance and state changes

## Components

### NotificationBadgeComponent

Displays notification badges with various styles and animations.

```typescript
import { NotificationBadgeComponent } from '@memberjunction/ng-conversations';

// In template
<mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>

// Or with manual config
<mj-notification-badge [badgeConfig]="myBadgeConfig"></mj-notification-badge>
```

**Badge Types:**
- `count`: Shows numeric count (e.g., "5", "99+")
- `dot`: Small dot indicator
- `pulse`: Animated pulsing ring (for active processes)
- `new`: "NEW" label badge

**Priority Styles:**
- `normal`: Blue badge (default)
- `high`: Orange badge
- `urgent`: Red badge with shake animation

### ActivityIndicatorComponent

Displays animated activity indicators for ongoing processes.

```typescript
import { ActivityIndicatorComponent } from '@memberjunction/ng-conversations';

// In template
<mj-activity-indicator [config]="activityConfig"></mj-activity-indicator>
```

**Activity Types:**
- `agent`: Agent process indicator (blue background)
- `processing`: Processing indicator (yellow background)
- `typing`: Typing indicator (gray background)

## Service

### NotificationService

Main service for managing notifications.

```typescript
import { NotificationService } from '@memberjunction/ng-conversations';

constructor(private notificationService: NotificationService) {}

// Track a new message
this.notificationService.trackNewMessage(conversationId, new Date(), 'normal');

// Track multiple messages at once
this.notificationService.trackNewMessages(conversationId, 5, new Date(), 'high');

// Track a new artifact
this.notificationService.trackNewArtifact(conversationId);

// Track agent process
this.notificationService.trackAgentProcess(conversationId, true); // Start
this.notificationService.trackAgentProcess(conversationId, false); // End

// Mark conversation as read (clears unread count)
this.notificationService.markConversationAsRead(conversationId);

// Clear artifact notifications
this.notificationService.clearArtifactNotifications(conversationId);

// Clear all notifications for a conversation
this.notificationService.clearAllNotifications(conversationId);

// Get notification state
const notification = this.notificationService.getConversationNotification(conversationId);

// Get badge configuration
const badgeConfig = this.notificationService.getBadgeConfig(conversationId);

// Subscribe to notification changes
this.notificationService.notifications$.subscribe(notifications => {
  console.log('Notifications updated:', notifications);
});

// Get total unread count across all conversations
this.notificationService.totalUnreadCount$.subscribe(count => {
  console.log('Total unread:', count);
});

// Listen for notification events
this.notificationService.changeEvents$.subscribe(event => {
  console.log('Notification event:', event);
});
```

### Notification Preferences

```typescript
// Update preferences
this.notificationService.updatePreferences({
  enableSound: true,
  enableDesktopNotifications: true,
  showBadges: true
});

// Mute a conversation
this.notificationService.muteConversation(conversationId);

// Unmute a conversation
this.notificationService.unmuteConversation(conversationId);

// Check if conversation is muted
const isMuted = this.notificationService.isConversationMuted(conversationId);

// Request desktop notification permission
const granted = await this.notificationService.requestDesktopPermission();

// Show a desktop notification
this.notificationService.showDesktopNotification(
  'New Message',
  'You have a new message in your conversation',
  conversationId
);
```

## Data Models

### ConversationNotification

Represents the notification state for a conversation.

```typescript
interface ConversationNotification {
  conversationId: string;
  unreadMessageCount: number;
  lastReadMessageTimestamp: Date | null;
  lastMessageTimestamp: Date | null;
  hasNewArtifacts: boolean;
  hasActiveAgentProcesses: boolean;
  newArtifactCount: number;
  activeAgentProcessCount: number;
  lastNotificationTimestamp: Date;
  highestPriority: NotificationPriority;
}
```

### BadgeConfig

Configuration for displaying a badge.

```typescript
interface BadgeConfig {
  show: boolean;
  count?: number;
  type?: 'count' | 'dot' | 'pulse' | 'new';
  priority?: NotificationPriority;
  animate?: boolean;
}
```

### ActivityIndicatorConfig

Configuration for displaying an activity indicator.

```typescript
interface ActivityIndicatorConfig {
  show: boolean;
  type: 'agent' | 'processing' | 'typing';
  text?: string;
  color?: string;
}
```

### NotificationPreferences

User preferences for notifications.

```typescript
interface NotificationPreferences {
  enableSound: boolean;
  enableDesktopNotifications: boolean;
  enableInAppNotifications: boolean;
  showBadges: boolean;
  muteUntil?: Date;
  mutedConversations: string[];
}
```

## Integration Example

### In a Chat Component

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from '@memberjunction/ng-conversations';
import { ConversationStateService } from '@memberjunction/ng-conversations';

@Component({
  selector: 'app-chat',
  template: `
    <div class="chat-container">
      <div class="conversation-list">
        @for (conversation of conversations$ | async; track conversation.ID) {
          <div class="conversation-item" (click)="openConversation(conversation.ID)">
            <div class="icon-wrapper">
              <i class="fas fa-comments"></i>
              <mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>
            </div>
            <div class="info">
              <span>{{ conversation.Name }}</span>
            </div>
          </div>
        }
      </div>

      <div class="chat-area">
        <!-- Your chat messages here -->
      </div>
    </div>
  `
})
export class ChatComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private conversationState: ConversationStateService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    // Listen for new messages and track notifications
    this.messageService.newMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        const isActiveConversation =
          this.conversationState.getActiveConversationId() === message.conversationId;

        if (!isActiveConversation) {
          // Only track notification if it's not the active conversation
          this.notificationService.trackNewMessage(
            message.conversationId,
            message.timestamp,
            message.priority
          );
        }
      });
  }

  openConversation(conversationId: string) {
    // Set active conversation
    this.conversationState.setActiveConversation(conversationId);

    // Clear unread notifications
    this.notificationService.markConversationAsRead(conversationId);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

## Persistence

Notification state is automatically persisted to localStorage and will be restored when the application reloads. The storage key is `mj_conversation_notifications`.

## Cross-tab Synchronization

When notification state changes in one tab, the change is automatically broadcast to all other open tabs using localStorage events. This ensures a consistent notification state across your application.

## Animation Details

### Badge Pop Animation
Badges animate in with a smooth pop effect when they first appear or when their count changes.

### Pulse Animation
For active agent processes, badges display an animated pulsing ring that expands outward.

### Shake Animation
Urgent priority badges shake briefly to draw attention when they first appear.

### Activity Dots
Activity indicators show three dots that pulse in sequence, creating a smooth loading effect.

## Browser Support

- Modern browsers with localStorage support
- Desktop notifications require user permission and HTTPS (except localhost)
- Audio notifications use Web Audio API

## Best Practices

1. **Clear notifications promptly**: Always call `markConversationAsRead()` when a conversation is opened
2. **Track notifications selectively**: Don't track notifications for messages in the currently active conversation
3. **Use appropriate priorities**: Reserve 'urgent' for critical notifications
4. **Respect user preferences**: Check preferences before playing sounds or showing desktop notifications
5. **Clean up subscriptions**: Always unsubscribe from observables in `ngOnDestroy()`

## Future Enhancements

Potential future improvements:
- Notification grouping and summarization
- Rich desktop notifications with action buttons
- Notification history/log
- Push notifications for mobile
- Customizable badge styles per user
- Notification filtering and rules
