# Notification System Integration Example

This guide shows how to integrate the notification system into your conversation application.

## Step 1: Import Required Modules

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  ConversationStateService,
  NotificationService,
  ConversationEntity,
  ConversationDetailEntity
} from '@memberjunction/ng-conversations';
import { UserInfo, RunView } from '@memberjunction/core';
```

## Step 2: Set Up the Chat Component

```typescript
@Component({
  selector: 'app-conversation-workspace',
  template: `
    <div class="workspace-container">
      <!-- Sidebar with conversation list -->
      <aside class="sidebar">
        <div class="header">
          <h3>Conversations</h3>
          @if ((totalUnreadCount$ | async) ?? 0; as unreadCount) {
            <span class="total-unread-badge">{{ unreadCount }}</span>
          }
        </div>

        <div class="conversation-list">
          @for (conversation of (conversations$ | async); track conversation.ID) {
            <div
              class="conversation-item"
              [class.active]="conversation.ID === (activeConversationId$ | async)"
              (click)="selectConversation(conversation.ID)">

              <div class="icon-wrapper">
                <i class="fas fa-comments"></i>
                <mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>
              </div>

              <div class="info">
                <div class="name">{{ conversation.Name }}</div>
                <div class="preview">{{ getLastMessagePreview(conversation) }}</div>
              </div>

              <!-- Activity indicator for ongoing agent processes -->
              @if (hasActiveAgentProcess(conversation.ID)) {
                <mj-activity-indicator
                  [config]="{
                    show: true,
                    type: 'agent',
                    text: 'Processing...'
                  }">
                </mj-activity-indicator>
              }
            </div>
          }
        </div>
      </aside>

      <!-- Main chat area -->
      <main class="chat-area">
        @if (activeConversationId$ | async; as activeId) {
          <mj-conversation-chat-area
            [conversationId]="activeId"
            [currentUser]="currentUser"
            (messageReceived)="onMessageReceived($event)"
            (artifactCreated)="onArtifactCreated($event)"
            (agentProcessStarted)="onAgentProcessStarted($event)"
            (agentProcessCompleted)="onAgentProcessCompleted($event)">
          </mj-conversation-chat-area>
        } @else {
          <div class="empty-state">
            <i class="fas fa-comments fa-3x"></i>
            <p>Select a conversation to get started</p>
          </div>
        }
      </main>
    </div>
  `
})
export class ConversationWorkspaceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Observables
  public conversations$!: Observable<ConversationEntity[]>;
  public activeConversationId$!: Observable<string | null>;
  public totalUnreadCount$!: Observable<number>;

  // Current user
  @Input() currentUser!: UserInfo;
  @Input() environmentId!: string;

  // Track active agent processes per conversation
  private activeProcesses = new Map<string, Set<string>>();

  constructor(
    private conversationState: ConversationStateService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    // Set up observables
    this.conversations$ = this.conversationState.filteredConversations$;
    this.activeConversationId$ = this.conversationState.activeConversationId$;
    this.totalUnreadCount$ = this.notificationService.totalUnreadCount$;

    // Load conversations
    this.conversationState.loadConversations(this.environmentId, this.currentUser);

    // Load existing messages and set up notification tracking
    this.setupNotificationTracking();

    // Request desktop notification permission
    this.requestNotificationPermission();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Sets up initial notification state by loading message history
   */
  private async setupNotificationTracking() {
    // Load all conversations
    const conversations = await this.loadAllConversations();

    // For each conversation that's not active, check for unread messages
    const activeId = this.conversationState.getActiveConversationId();

    for (const conversation of conversations) {
      if (conversation.ID === activeId) {
        // Active conversation - mark as read
        this.notificationService.markConversationAsRead(conversation.ID);
        continue;
      }

      // Load messages to determine unread count
      await this.trackUnreadMessages(conversation.ID);
    }
  }

  /**
   * Loads messages and tracks unread count for a conversation
   */
  private async trackUnreadMessages(conversationId: string) {
    const rv = new RunView();

    // Load messages for this conversation
    const result = await rv.RunView<ConversationDetailEntity>({
      EntityName: 'Conversation Details',
      ExtraFilter: `ConversationID='${conversationId}'`,
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: 50,
      ResultType: 'entity_object'
    }, this.currentUser);

    if (!result.Success || !result.Results) {
      return;
    }

    const messages = result.Results;
    if (messages.length === 0) {
      return;
    }

    // Get the last read timestamp from storage/user settings
    // For this example, we'll consider messages from the last hour as potentially unread
    const lastReadTimestamp = this.getLastReadTimestamp(conversationId);
    const unreadMessages = messages.filter(
      m => m.__mj_CreatedAt && m.__mj_CreatedAt > lastReadTimestamp
    );

    if (unreadMessages.length > 0) {
      const latestMessage = messages[0];
      this.notificationService.trackNewMessages(
        conversationId,
        unreadMessages.length,
        latestMessage.__mj_CreatedAt!,
        'normal'
      );
    }
  }

  /**
   * Gets the last read timestamp for a conversation
   * In a real app, this would come from user settings or database
   */
  private getLastReadTimestamp(conversationId: string): Date {
    const notification = this.notificationService.getConversationNotification(conversationId);
    if (notification?.lastReadMessageTimestamp) {
      return notification.lastReadMessageTimestamp;
    }

    // Default to 1 hour ago
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    return oneHourAgo;
  }

  /**
   * Loads all conversations
   */
  private async loadAllConversations(): Promise<ConversationEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<ConversationEntity>({
      EntityName: 'Conversations',
      ExtraFilter: `EnvironmentID='${this.environmentId}' AND (IsArchived IS NULL OR IsArchived=0)`,
      OrderBy: '__mj_UpdatedAt DESC',
      ResultType: 'entity_object'
    }, this.currentUser);

    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Request desktop notification permission
   */
  private async requestNotificationPermission() {
    if (this.notificationService.preferences$.value.enableDesktopNotifications) {
      await this.notificationService.requestDesktopPermission();
    }
  }

  /**
   * Selects a conversation and clears its notifications
   */
  selectConversation(conversationId: string) {
    this.conversationState.setActiveConversation(conversationId);
    this.notificationService.markConversationAsRead(conversationId);
    this.notificationService.clearArtifactNotifications(conversationId);
  }

  /**
   * Handles incoming message event
   */
  onMessageReceived(event: { conversationId: string; message: ConversationDetailEntity }) {
    const activeId = this.conversationState.getActiveConversationId();

    // Only track notification if message is for a different conversation
    if (event.conversationId !== activeId) {
      this.notificationService.trackNewMessage(
        event.conversationId,
        event.message.__mj_CreatedAt || new Date(),
        'normal'
      );

      // Show desktop notification
      const conversation = this.getConversationById(event.conversationId);
      if (conversation) {
        this.notificationService.showDesktopNotification(
          `New message in ${conversation.Name}`,
          this.getMessagePreview(event.message),
          event.conversationId
        );
      }
    }
  }

  /**
   * Handles artifact creation event
   */
  onArtifactCreated(event: { conversationId: string; artifactId: string }) {
    const activeId = this.conversationState.getActiveConversationId();

    // Track artifact notification even for active conversation
    // User might be focused on chat and miss the artifact panel
    this.notificationService.trackNewArtifact(event.conversationId);

    if (event.conversationId !== activeId) {
      const conversation = this.getConversationById(event.conversationId);
      if (conversation) {
        this.notificationService.showDesktopNotification(
          `New artifact in ${conversation.Name}`,
          'A new artifact has been created',
          event.conversationId
        );
      }
    }
  }

  /**
   * Handles agent process started event
   */
  onAgentProcessStarted(event: { conversationId: string; processId: string }) {
    // Track the process
    if (!this.activeProcesses.has(event.conversationId)) {
      this.activeProcesses.set(event.conversationId, new Set());
    }
    this.activeProcesses.get(event.conversationId)!.add(event.processId);

    // Update notification
    this.notificationService.trackAgentProcess(event.conversationId, true);
  }

  /**
   * Handles agent process completed event
   */
  onAgentProcessCompleted(event: { conversationId: string; processId: string }) {
    // Remove the process
    const processes = this.activeProcesses.get(event.conversationId);
    if (processes) {
      processes.delete(event.processId);
    }

    // Update notification
    this.notificationService.trackAgentProcess(event.conversationId, false);
  }

  /**
   * Checks if a conversation has active agent processes
   */
  hasActiveAgentProcess(conversationId: string): boolean {
    const processes = this.activeProcesses.get(conversationId);
    return processes ? processes.size > 0 : false;
  }

  /**
   * Gets a conversation by ID
   */
  private getConversationById(conversationId: string): ConversationEntity | undefined {
    const conversations = this.conversationState['_conversations$'].value;
    return conversations.find(c => c.ID === conversationId);
  }

  /**
   * Gets a preview of the last message
   */
  private getLastMessagePreview(conversation: ConversationEntity): string {
    // This would typically load from the database
    // For now, return a placeholder
    return conversation.Description || 'No recent messages';
  }

  /**
   * Gets a preview of a message
   */
  private getMessagePreview(message: ConversationDetailEntity): string {
    if (message.Message) {
      return message.Message.substring(0, 100) + (message.Message.length > 100 ? '...' : '');
    }
    return 'New message';
  }
}
```

## Step 3: Add Styles

```scss
.workspace-container {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 320px;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;

  .header {
    padding: 16px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;

    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .total-unread-badge {
      background: #dc2626;
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
    }
  }

  .conversation-list {
    flex: 1;
    overflow-y: auto;
  }
}

.conversation-item {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 150ms ease;

  &:hover {
    background: #f9fafb;
  }

  &.active {
    background: #dbeafe;
    border-left: 3px solid #0076b6;
  }

  .icon-wrapper {
    position: relative;
    flex-shrink: 0;

    i {
      font-size: 24px;
      color: #0076b6;
    }

    mj-notification-badge {
      position: absolute;
      top: -6px;
      right: -6px;
    }
  }

  .info {
    flex: 1;
    min-width: 0;

    .name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .preview {
      font-size: 12px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #9ca3af;

    i {
      margin-bottom: 16px;
    }

    p {
      margin: 0;
      font-size: 16px;
    }
  }
}
```

## Step 4: Enable/Disable Notification Features

```typescript
// In a settings component or service
export class NotificationSettingsComponent {
  constructor(private notificationService: NotificationService) {}

  async enableDesktopNotifications() {
    const granted = await this.notificationService.requestDesktopPermission();
    if (granted) {
      this.notificationService.updatePreferences({
        enableDesktopNotifications: true
      });
    }
  }

  toggleSoundNotifications() {
    const current = this.notificationService.preferences$.value;
    this.notificationService.updatePreferences({
      enableSound: !current.enableSound
    });
  }

  muteConversation(conversationId: string) {
    this.notificationService.muteConversation(conversationId);
  }

  unmuteConversation(conversationId: string) {
    this.notificationService.unmuteConversation(conversationId);
  }
}
```

## Step 5: Testing the Integration

```typescript
describe('Notification System Integration', () => {
  let component: ConversationWorkspaceComponent;
  let notificationService: NotificationService;
  let conversationState: ConversationStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ConversationWorkspaceComponent],
      providers: [NotificationService, ConversationStateService]
    });

    component = TestBed.createComponent(ConversationWorkspaceComponent).componentInstance;
    notificationService = TestBed.inject(NotificationService);
    conversationState = TestBed.inject(ConversationStateService);
  });

  it('should track notification when message received in inactive conversation', () => {
    const conversationId = 'conv-123';
    const otherConversationId = 'conv-456';

    conversationState.setActiveConversation(conversationId);

    const message = {
      conversationId: otherConversationId,
      message: { __mj_CreatedAt: new Date() } as ConversationDetailEntity
    };

    component.onMessageReceived(message);

    const notification = notificationService.getConversationNotification(otherConversationId);
    expect(notification?.unreadMessageCount).toBe(1);
  });

  it('should not track notification when message received in active conversation', () => {
    const conversationId = 'conv-123';

    conversationState.setActiveConversation(conversationId);

    const message = {
      conversationId,
      message: { __mj_CreatedAt: new Date() } as ConversationDetailEntity
    };

    component.onMessageReceived(message);

    const notification = notificationService.getConversationNotification(conversationId);
    expect(notification?.unreadMessageCount).toBe(0);
  });

  it('should clear notifications when conversation selected', () => {
    const conversationId = 'conv-123';

    // Add some notifications
    notificationService.trackNewMessage(conversationId, new Date());

    let notification = notificationService.getConversationNotification(conversationId);
    expect(notification?.unreadMessageCount).toBe(1);

    // Select the conversation
    component.selectConversation(conversationId);

    notification = notificationService.getConversationNotification(conversationId);
    expect(notification?.unreadMessageCount).toBe(0);
  });
});
```

## Tips and Best Practices

1. **Always track the active conversation**: Don't create notifications for messages in the currently active conversation
2. **Clear notifications promptly**: When a user opens a conversation, immediately mark it as read
3. **Use appropriate priorities**: Save 'urgent' for critical notifications
4. **Batch operations**: When loading historical messages, use `trackNewMessages()` instead of calling `trackNewMessage()` in a loop
5. **Respect user preferences**: Check notification preferences before playing sounds or showing desktop notifications
6. **Clean up**: Always unsubscribe from observables in `ngOnDestroy()`
7. **Test across tabs**: Open multiple tabs to verify cross-tab synchronization works correctly
