import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, fromEvent } from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';
import {
  ConversationNotification,
  NotificationItem,
  NotificationPreferences,
  NotificationState,
  NotificationType,
  NotificationPriority,
  NotificationChangeEvent,
  BadgeConfig,
  DEFAULT_NOTIFICATION_PREFERENCES
} from '../models/notification.model';

/**
 * Service for managing notifications across conversations
 * Provides real-time notification tracking, persistence, and cross-tab synchronization
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly STORAGE_KEY = 'mj_conversation_notifications';
  private readonly STORAGE_EVENT_KEY = 'mj_notification_change';

  // Internal state
  private _notifications$ = new BehaviorSubject<Record<string, ConversationNotification>>({});
  private _preferences$ = new BehaviorSubject<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  private _notificationItems$ = new BehaviorSubject<NotificationItem[]>([]);
  private _changeEvents$ = new Subject<NotificationChangeEvent>();

  // Public observables
  public readonly notifications$ = this._notifications$.asObservable();
  public readonly preferences$ = this._preferences$.asObservable();
  public readonly notificationItems$ = this._notificationItems$.asObservable();
  public readonly changeEvents$ = this._changeEvents$.asObservable();

  // Derived observables
  public readonly totalUnreadCount$: Observable<number> = this.notifications$.pipe(
    map(notifications => {
      return Object.values(notifications).reduce(
        (sum, notif) => sum + notif.unreadMessageCount,
        0
      );
    }),
    shareReplay(1)
  );

  public readonly hasAnyNotifications$: Observable<boolean> = this.totalUnreadCount$.pipe(
    map(count => count > 0),
    shareReplay(1)
  );

  constructor(private ngZone: NgZone) {
    this.loadFromStorage();
    this.setupStorageListener();
  }

  /**
   * Gets notification state for a specific conversation
   */
  getConversationNotification(conversationId: string): ConversationNotification | null {
    return this._notifications$.value[conversationId] || null;
  }

  /**
   * Gets notification observable for a specific conversation
   */
  getConversationNotification$(conversationId: string): Observable<ConversationNotification | null> {
    return this.notifications$.pipe(
      map(notifications => notifications[conversationId] || null),
      shareReplay(1)
    );
  }

  /**
   * Gets badge configuration for a conversation
   */
  getBadgeConfig(conversationId: string): BadgeConfig {
    const notification = this.getConversationNotification(conversationId);

    if (!notification) {
      return { show: false };
    }

    const prefs = this._preferences$.value;
    if (!prefs.showBadges || prefs.mutedConversations.includes(conversationId)) {
      return { show: false };
    }

    // Check if muted temporarily
    if (prefs.muteUntil && new Date() < prefs.muteUntil) {
      return { show: false };
    }

    const totalNotifications =
      notification.unreadMessageCount +
      notification.newArtifactCount +
      notification.activeAgentProcessCount;

    if (totalNotifications === 0) {
      return { show: false };
    }

    // Determine badge type based on notification content
    let type: BadgeConfig['type'] = 'count';
    let animate = false;

    if (notification.activeAgentProcessCount > 0) {
      type = 'pulse';
      animate = true;
    } else if (notification.newArtifactCount > 0) {
      type = 'new';
      animate = true;
    }

    return {
      show: true,
      count: totalNotifications,
      type,
      priority: notification.highestPriority,
      animate
    };
  }

  /**
   * Gets badge configuration observable for a conversation
   */
  getBadgeConfig$(conversationId: string): Observable<BadgeConfig> {
    return this.notifications$.pipe(
      map(() => this.getBadgeConfig(conversationId)),
      shareReplay(1)
    );
  }

  /**
   * Tracks a new message in a conversation
   */
  trackNewMessage(conversationId: string, messageTimestamp: Date, priority: NotificationPriority = 'normal'): void {
    const notifications = { ...this._notifications$.value };
    const existing = notifications[conversationId];

    if (existing) {
      notifications[conversationId] = {
        ...existing,
        unreadMessageCount: existing.unreadMessageCount + 1,
        lastMessageTimestamp: messageTimestamp,
        lastNotificationTimestamp: new Date(),
        highestPriority: this.getHigherPriority(existing.highestPriority, priority)
      };
    } else {
      notifications[conversationId] = this.createNewNotification(conversationId, {
        unreadMessageCount: 1,
        lastMessageTimestamp: messageTimestamp,
        highestPriority: priority
      });
    }

    this.updateNotifications(notifications);
    this.emitChangeEvent(conversationId, 'message', 'added');
    this.playNotificationSound();
  }

  /**
   * Tracks multiple new messages at once (batch operation)
   */
  trackNewMessages(conversationId: string, count: number, latestTimestamp: Date, priority: NotificationPriority = 'normal'): void {
    const notifications = { ...this._notifications$.value };
    const existing = notifications[conversationId];

    if (existing) {
      notifications[conversationId] = {
        ...existing,
        unreadMessageCount: existing.unreadMessageCount + count,
        lastMessageTimestamp: latestTimestamp,
        lastNotificationTimestamp: new Date(),
        highestPriority: this.getHigherPriority(existing.highestPriority, priority)
      };
    } else {
      notifications[conversationId] = this.createNewNotification(conversationId, {
        unreadMessageCount: count,
        lastMessageTimestamp: latestTimestamp,
        highestPriority: priority
      });
    }

    this.updateNotifications(notifications);
    this.emitChangeEvent(conversationId, 'message', 'added');
    this.playNotificationSound();
  }

  /**
   * Tracks a new artifact notification
   */
  trackNewArtifact(conversationId: string): void {
    const notifications = { ...this._notifications$.value };
    const existing = notifications[conversationId];

    if (existing) {
      notifications[conversationId] = {
        ...existing,
        hasNewArtifacts: true,
        newArtifactCount: existing.newArtifactCount + 1,
        lastNotificationTimestamp: new Date()
      };
    } else {
      notifications[conversationId] = this.createNewNotification(conversationId, {
        hasNewArtifacts: true,
        newArtifactCount: 1
      });
    }

    this.updateNotifications(notifications);
    this.emitChangeEvent(conversationId, 'artifact', 'added');
  }

  /**
   * Tracks an active agent process
   */
  trackAgentProcess(conversationId: string, isActive: boolean): void {
    const notifications = { ...this._notifications$.value };
    const existing = notifications[conversationId];

    if (existing) {
      const countChange = isActive ? 1 : -1;
      notifications[conversationId] = {
        ...existing,
        hasActiveAgentProcesses: isActive ? true : (existing.activeAgentProcessCount - 1) > 0,
        activeAgentProcessCount: Math.max(0, existing.activeAgentProcessCount + countChange),
        lastNotificationTimestamp: new Date()
      };
    } else if (isActive) {
      notifications[conversationId] = this.createNewNotification(conversationId, {
        hasActiveAgentProcesses: true,
        activeAgentProcessCount: 1
      });
    }

    this.updateNotifications(notifications);
    this.emitChangeEvent(conversationId, 'agent_process', isActive ? 'added' : 'cleared');
  }

  /**
   * Marks a conversation as read (clears unread message count)
   */
  markConversationAsRead(conversationId: string): void {
    const notifications = { ...this._notifications$.value };
    const existing = notifications[conversationId];

    if (existing && existing.unreadMessageCount > 0) {
      notifications[conversationId] = {
        ...existing,
        unreadMessageCount: 0,
        lastReadMessageTimestamp: new Date()
      };

      this.updateNotifications(notifications);
      this.emitChangeEvent(conversationId, 'message', 'read');
    }
  }

  /**
   * Clears artifact notifications for a conversation
   */
  clearArtifactNotifications(conversationId: string): void {
    const notifications = { ...this._notifications$.value };
    const existing = notifications[conversationId];

    if (existing && (existing.hasNewArtifacts || existing.newArtifactCount > 0)) {
      notifications[conversationId] = {
        ...existing,
        hasNewArtifacts: false,
        newArtifactCount: 0
      };

      this.updateNotifications(notifications);
      this.emitChangeEvent(conversationId, 'artifact', 'cleared');
    }
  }

  /**
   * Clears all notifications for a conversation
   */
  clearAllNotifications(conversationId: string): void {
    const notifications = { ...this._notifications$.value };

    if (notifications[conversationId]) {
      delete notifications[conversationId];
      this.updateNotifications(notifications);
      this.emitChangeEvent(conversationId, 'message', 'cleared');
    }
  }

  /**
   * Clears all notifications across all conversations
   */
  clearAllNotificationsGlobal(): void {
    this.updateNotifications({});
  }

  /**
   * Updates notification preferences
   */
  updatePreferences(preferences: Partial<NotificationPreferences>): void {
    const current = this._preferences$.value;
    const updated = { ...current, ...preferences };
    this._preferences$.next(updated);
    this.saveToStorage();
  }

  /**
   * Mutes a conversation
   */
  muteConversation(conversationId: string): void {
    const prefs = this._preferences$.value;
    if (!prefs.mutedConversations.includes(conversationId)) {
      this.updatePreferences({
        mutedConversations: [...prefs.mutedConversations, conversationId]
      });
    }
  }

  /**
   * Unmutes a conversation
   */
  unmuteConversation(conversationId: string): void {
    const prefs = this._preferences$.value;
    this.updatePreferences({
      mutedConversations: prefs.mutedConversations.filter(id => id !== conversationId)
    });
  }

  /**
   * Checks if a conversation is muted
   */
  isConversationMuted(conversationId: string): boolean {
    return this._preferences$.value.mutedConversations.includes(conversationId);
  }

  /**
   * Requests desktop notification permission
   */
  async requestDesktopPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Desktop notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  /**
   * Shows a desktop notification
   */
  showDesktopNotification(title: string, body: string, conversationId: string): void {
    if (!this._preferences$.value.enableDesktopNotifications) {
      return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/assets/icons/notification-icon.png',
        badge: '/assets/icons/badge-icon.png',
        tag: conversationId,
        requireInteraction: false
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  // Private helper methods

  private createNewNotification(
    conversationId: string,
    overrides?: Partial<ConversationNotification>
  ): ConversationNotification {
    return {
      conversationId,
      unreadMessageCount: 0,
      lastReadMessageTimestamp: null,
      lastMessageTimestamp: null,
      hasNewArtifacts: false,
      hasActiveAgentProcesses: false,
      newArtifactCount: 0,
      activeAgentProcessCount: 0,
      lastNotificationTimestamp: new Date(),
      highestPriority: 'normal',
      ...overrides
    };
  }

  private updateNotifications(notifications: Record<string, ConversationNotification>): void {
    this._notifications$.next(notifications);
    this.saveToStorage();
    this.broadcastChange();
  }

  private emitChangeEvent(conversationId: string, type: NotificationType, action: 'added' | 'read' | 'cleared'): void {
    this._changeEvents$.next({
      conversationId,
      type,
      action,
      timestamp: new Date()
    });
  }

  private getHigherPriority(current: NotificationPriority, newPriority: NotificationPriority): NotificationPriority {
    const priorityOrder: NotificationPriority[] = ['low', 'normal', 'high', 'urgent'];
    const currentIndex = priorityOrder.indexOf(current);
    const newIndex = priorityOrder.indexOf(newPriority);
    return newIndex > currentIndex ? newPriority : current;
  }

  private playNotificationSound(): void {
    if (!this._preferences$.value.enableSound) {
      return;
    }

    // Create and play a subtle notification sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const state: NotificationState = JSON.parse(stored);

        // Restore notifications
        this._notifications$.next(state.conversations || {});

        // Restore preferences
        this._preferences$.next({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...state.preferences
        });
      }
    } catch (error) {
      console.error('Error loading notification state from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const state: NotificationState = {
        conversations: this._notifications$.value,
        preferences: this._preferences$.value,
        lastUpdated: new Date()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving notification state to storage:', error);
    }
  }

  private broadcastChange(): void {
    try {
      // Broadcast to other tabs via storage event
      const event = {
        timestamp: Date.now(),
        data: this._notifications$.value
      };
      localStorage.setItem(this.STORAGE_EVENT_KEY, JSON.stringify(event));
    } catch (error) {
      console.error('Error broadcasting notification change:', error);
    }
  }

  private setupStorageListener(): void {
    // Listen for changes from other tabs
    this.ngZone.runOutsideAngular(() => {
      fromEvent<StorageEvent>(window, 'storage')
        .pipe(
          filter(event => event.key === this.STORAGE_KEY || event.key === this.STORAGE_EVENT_KEY)
        )
        .subscribe(event => {
          this.ngZone.run(() => {
            this.loadFromStorage();
          });
        });
    });
  }
}
