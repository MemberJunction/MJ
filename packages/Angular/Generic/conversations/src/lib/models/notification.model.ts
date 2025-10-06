/**
 * Notification types supported by the system
 */
export type NotificationType = 'message' | 'artifact' | 'agent_process' | 'task';

/**
 * Notification priority levels
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Represents a notification for a conversation
 */
export interface ConversationNotification {
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

/**
 * Represents a single notification item
 */
export interface NotificationItem {
  id: string;
  conversationId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  metadata?: Record<string, any>;
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  enableSound: boolean;
  enableDesktopNotifications: boolean;
  enableInAppNotifications: boolean;
  showBadges: boolean;
  muteUntil?: Date;
  mutedConversations: string[];
}

/**
 * Notification state for persistence
 */
export interface NotificationState {
  conversations: Record<string, ConversationNotification>;
  preferences: NotificationPreferences;
  lastUpdated: Date;
}

/**
 * Badge display configuration
 */
export interface BadgeConfig {
  show: boolean;
  count?: number;
  type?: 'count' | 'dot' | 'pulse' | 'new';
  priority?: NotificationPriority;
  animate?: boolean;
}

/**
 * Activity indicator configuration
 */
export interface ActivityIndicatorConfig {
  show: boolean;
  type: 'agent' | 'processing' | 'typing';
  text?: string;
  color?: string;
}

/**
 * Event emitted when notification state changes
 */
export interface NotificationChangeEvent {
  conversationId: string;
  type: NotificationType;
  action: 'added' | 'read' | 'cleared';
  timestamp: Date;
}

/**
 * Default notification preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enableSound: false,
  enableDesktopNotifications: false,
  enableInAppNotifications: true,
  showBadges: true,
  mutedConversations: []
};
