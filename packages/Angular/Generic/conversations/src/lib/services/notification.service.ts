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
  public readonly Notifications$ = this._notifications$.asObservable();

  /** @deprecated Use {@link Notifications$}. */
  public get notifications$() {
    return this.Notifications$;
  }
  public readonly Preferences$ = this._preferences$.asObservable();

  /** @deprecated Use {@link Preferences$}. */
  public get preferences$() {
    return this.Preferences$;
  }
  public readonly NotificationItems$ = this._notificationItems$.asObservable();

  /** @deprecated Use {@link NotificationItems$}. */
  public get notificationItems$() {
    return this.NotificationItems$;
  }
  public readonly ChangeEvents$ = this._changeEvents$.asObservable();

  /** @deprecated Use {@link ChangeEvents$}. */
  public get changeEvents$() {
    return this.ChangeEvents$;
  }

  // Derived observables
  public readonly TotalUnreadCount$: Observable<number> = this.Notifications$.pipe(
    map(notifications => {
      return Object.values(notifications).reduce(
        (sum, notif) => sum + notif.unreadMessageCount,
        0
      );
    }),
    shareReplay(1)
  );

  /** @deprecated Use {@link TotalUnreadCount$}. */
  public get totalUnreadCount$(): Observable<number> {
    return this.TotalUnreadCount$;
  }

  public readonly HasAnyNotifications$: Observable<boolean> = this.TotalUnreadCount$.pipe(
    map(count => count > 0),
    shareReplay(1)
  );

  /** @deprecated Use {@link HasAnyNotifications$}. */
  public get hasAnyNotifications$(): Observable<boolean> {
    return this.HasAnyNotifications$;
  }

  constructor(private ngZone: NgZone) {
    this.loadFromStorage();
    this.setupStorageListener();
  }

  /**
   * Gets notification state for a specific conversation
   */
  GetConversationNotification(conversationId: string): ConversationNotification | null {
    return this._notifications$.value[conversationId] || null;
  }

  /** @deprecated Use {@link GetConversationNotification}. */
  getConversationNotification(conversationId: string): ConversationNotification | null {
    return this.GetConversationNotification(conversationId);
  }

  /**
   * Gets notification observable for a specific conversation
   */
  GetConversationNotification$(conversationId: string): Observable<ConversationNotification | null> {
    return this.Notifications$.pipe(
      map(notifications => notifications[conversationId] || null),
      shareReplay(1)
    );
  }

  /** @deprecated Use {@link GetConversationNotification$}. */
  getConversationNotification$(conversationId: string): Observable<ConversationNotification | null> {
    return this.GetConversationNotification$(conversationId);
  }

  /**
   * Gets badge configuration for a conversation
   */
  GetBadgeConfig(conversationId: string): BadgeConfig {
    const notification = this.GetConversationNotification(conversationId);

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

  /** @deprecated Use {@link GetBadgeConfig}. */
  getBadgeConfig(conversationId: string): BadgeConfig {
    return this.GetBadgeConfig(conversationId);
  }

  /**
   * Gets badge configuration observable for a conversation
   */
  GetBadgeConfig$(conversationId: string): Observable<BadgeConfig> {
    return this.Notifications$.pipe(
      map(() => this.GetBadgeConfig(conversationId)),
      shareReplay(1)
    );
  }

  /** @deprecated Use {@link GetBadgeConfig$}. */
  getBadgeConfig$(conversationId: string): Observable<BadgeConfig> {
    return this.GetBadgeConfig$(conversationId);
  }

  /**
   * Tracks a new message in a conversation
   */
  TrackNewMessage(conversationId: string, messageTimestamp: Date, priority: NotificationPriority = 'normal'): void {
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

  /** @deprecated Use {@link TrackNewMessage}. */
  trackNewMessage(conversationId: string, messageTimestamp: Date, priority: NotificationPriority = 'normal'): void {
    return this.TrackNewMessage(conversationId, messageTimestamp, priority);
  }

  /**
   * Tracks multiple new messages at once (batch operation)
   */
  TrackNewMessages(conversationId: string, count: number, latestTimestamp: Date, priority: NotificationPriority = 'normal'): void {
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

  /** @deprecated Use {@link TrackNewMessages}. */
  trackNewMessages(conversationId: string, count: number, latestTimestamp: Date, priority: NotificationPriority = 'normal'): void {
    return this.TrackNewMessages(conversationId, count, latestTimestamp, priority);
  }

  /**
   * Tracks a new artifact notification
   */
  TrackNewArtifact(conversationId: string): void {
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

  /** @deprecated Use {@link TrackNewArtifact}. */
  trackNewArtifact(conversationId: string): void {
    return this.TrackNewArtifact(conversationId);
  }

  /**
   * Tracks an active agent process
   */
  TrackAgentProcess(conversationId: string, isActive: boolean): void {
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

  /** @deprecated Use {@link TrackAgentProcess}. */
  trackAgentProcess(conversationId: string, isActive: boolean): void {
    return this.TrackAgentProcess(conversationId, isActive);
  }

  /**
   * Marks a conversation as read (clears unread message count)
   */
  MarkConversationAsRead(conversationId: string): void {
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

  /** @deprecated Use {@link MarkConversationAsRead}. */
  markConversationAsRead(conversationId: string): void {
    return this.MarkConversationAsRead(conversationId);
  }

  /**
   * Clears artifact notifications for a conversation
   */
  ClearArtifactNotifications(conversationId: string): void {
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

  /** @deprecated Use {@link ClearArtifactNotifications}. */
  clearArtifactNotifications(conversationId: string): void {
    return this.ClearArtifactNotifications(conversationId);
  }

  /**
   * Clears all notifications for a conversation
   */
  ClearAllNotifications(conversationId: string): void {
    const notifications = { ...this._notifications$.value };

    if (notifications[conversationId]) {
      delete notifications[conversationId];
      this.updateNotifications(notifications);
      this.emitChangeEvent(conversationId, 'message', 'cleared');
    }
  }

  /** @deprecated Use {@link ClearAllNotifications}. */
  clearAllNotifications(conversationId: string): void {
    return this.ClearAllNotifications(conversationId);
  }

  /**
   * Clears all notifications across all conversations
   */
  ClearAllNotificationsGlobal(): void {
    this.updateNotifications({});
  }

  /** @deprecated Use {@link ClearAllNotificationsGlobal}. */
  clearAllNotificationsGlobal(): void {
    return this.ClearAllNotificationsGlobal();
  }

  /**
   * Updates notification preferences
   */
  UpdatePreferences(preferences: Partial<NotificationPreferences>): void {
    const current = this._preferences$.value;
    const updated = { ...current, ...preferences };
    this._preferences$.next(updated);
    this.saveToStorage();
  }

  /** @deprecated Use {@link UpdatePreferences}. */
  updatePreferences(preferences: Partial<NotificationPreferences>): void {
    return this.UpdatePreferences(preferences);
  }

  /**
   * Mutes a conversation
   */
  MuteConversation(conversationId: string): void {
    const prefs = this._preferences$.value;
    if (!prefs.mutedConversations.includes(conversationId)) {
      this.UpdatePreferences({
        mutedConversations: [...prefs.mutedConversations, conversationId]
      });
    }
  }

  /** @deprecated Use {@link MuteConversation}. */
  muteConversation(conversationId: string): void {
    return this.MuteConversation(conversationId);
  }

  /**
   * Unmutes a conversation
   */
  UnmuteConversation(conversationId: string): void {
    const prefs = this._preferences$.value;
    this.UpdatePreferences({
      mutedConversations: prefs.mutedConversations.filter(id => id !== conversationId)
    });
  }

  /** @deprecated Use {@link UnmuteConversation}. */
  unmuteConversation(conversationId: string): void {
    return this.UnmuteConversation(conversationId);
  }

  /**
   * Checks if a conversation is muted
   */
  IsConversationMuted(conversationId: string): boolean {
    return this._preferences$.value.mutedConversations.includes(conversationId);
  }

  /** @deprecated Use {@link IsConversationMuted}. */
  isConversationMuted(conversationId: string): boolean {
    return this.IsConversationMuted(conversationId);
  }

  /**
   * Requests desktop notification permission
   */
  async RequestDesktopPermission(): Promise<boolean> {
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

  /** @deprecated Use {@link RequestDesktopPermission}. */
  async requestDesktopPermission(): Promise<boolean> {
    return this.RequestDesktopPermission();
  }

  /**
   * Shows a desktop notification
   */
  ShowDesktopNotification(title: string, body: string, conversationId: string): void {
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

  /** @deprecated Use {@link ShowDesktopNotification}. */
  showDesktopNotification(title: string, body: string, conversationId: string): void {
    return this.ShowDesktopNotification(title, body, conversationId);
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
