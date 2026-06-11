import { Injectable } from '@angular/core';
import { IMetadataProvider, LogError, Metadata, StartupManager } from '@memberjunction/core';
import { UserInfoEngine, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal, GetGlobalObjectStore } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

/**
 * This injectable service is also available as a singleton MJNotificationService.Instance globally within an Angular application/library process space. It is responsible for displaying notifications to the user and also is able to manage the User Notifications entity
 * in the database.
 */
/**
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable({
  providedIn: 'root'
})
export class MJNotificationService {
  private static readonly _globalStoreKey = '___SINGLETON__MJNotificationService';
  private static _loaded: boolean = false;

  private _provider: IMetadataProvider | null = null;
  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  private static isLoading$ = new BehaviorSubject<boolean>(false);
  private tabChange = new Subject();
  tabChange$ = this.tabChange.asObservable();

  /**
   * Observable stream of the current user's notifications, derived from
   * UserInfoEngine.UserNotifications$. Emits immediately on subscribe (shareReplay
   * buffers the latest value) and re-emits whenever the engine's notifications
   * cache is mutated — by save, delete, remote-invalidate, or refresh. Each
   * emission re-runs the engine's per-user filter+sort.
   */
  public static readonly Notifications$: Observable<MJUserNotificationEntity[]> =
    UserInfoEngine.Instance.UserNotifications$.pipe(
      map(() => UserInfoEngine.Instance.UserNotifications),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  /**
   * Observable stream of the current user's unread notification count, derived
   * from Notifications$. Same emission lifecycle as Notifications$.
   */
  public static readonly UnreadCount$: Observable<number> =
    MJNotificationService.Notifications$.pipe(
      map((arr) => arr.filter((n) => n.Unread).length),
      shareReplay({ bufferSize: 1, refCount: false })
    );

  /**
   * Optional callback that consuming apps can set to suppress toast notifications
   * for specific events (e.g., when the user is actively viewing the conversation
   * that triggered the notification). Return true to suppress the toast.
   * The notification DB record is still created and the badge count still updates.
   */
  public ShouldSuppressToast?: (statusObj: Record<string, unknown>) => boolean;

  constructor() {
    const g = GetGlobalObjectStore()!;
    if (g[MJNotificationService._globalStoreKey]) {
      return g[MJNotificationService._globalStoreKey] as MJNotificationService;
    }
    g[MJNotificationService._globalStoreKey] = this;

    MJGlobal.Instance.GetEventListener(true).subscribe( (event) => {
      switch (event.event) {
        case MJEventType.DisplaySimpleNotificationRequest: 
          // received the message to display a notification to the user, so do that...
          const messageData: DisplaySimpleNotificationRequestData = <DisplaySimpleNotificationRequestData>event.args;
          this.CreateSimpleNotification(messageData.message,messageData.style, messageData.DisplayDuration);
          break;
        case MJEventType.ComponentEvent:
          if (event.eventCode === "UserNotificationsUpdated") {
            // refresh the user notifications
            MJNotificationService.RefreshUserNotifications();
          }
          break;
        case MJEventType.LoggedIn:
          if (MJNotificationService._loaded === false) {
            // Wait for StartupManager to complete before refreshing notifications.
            // UserInfoEngine (which backs RefreshUserNotifications) is @RegisterForStartup
            // and its _metadataConfigs are only populated during Config() which runs
            // as part of StartupManager.Startup(). Calling RefreshItem() before that
            // completes would silently find no config and return nothing.
            StartupManager.Instance.Startup().then(() => {
              MJNotificationService.RefreshUserNotifications();
            });
          }

          // Notifications$ / UnreadCount$ are derived from UserInfoEngine.UserNotifications$
          // at static-init time, so they auto-update whenever the engine's cache mutates.
          // No per-login subscription wiring is needed.

          // got the login, now subscribe to push status updates here so we can then raise them as events in MJ Global locally
          this.PushStatusUpdates().subscribe( (message: string) => {
            // Handle undefined/null messages gracefully
            if (!message) {
              return;
            }

            const statusObj = JSON.parse(message);

            // pass along as an event so anyone else who wants to know about the push status update can do stuff
            MJGlobal.Instance.RaiseEvent({
              event: MJEventType.ComponentEvent,
              eventCode: "PushStatusUpdates",
              args: statusObj,
              component: this
            })

            const type = statusObj.type?.trim().toLowerCase();
            if (type === 'notification' || type === 'usernotifications') {
              // Server sends type:'notification', legacy used 'usernotifications' — support both
              const action = statusObj.action?.trim().toLowerCase()
                          || statusObj.details?.action?.trim().toLowerCase();
              if (action === 'create') {
                // Check if the consuming app wants to suppress this toast
                // (e.g., user is actively viewing the conversation that triggered it)
                const suppress = this.ShouldSuppressToast?.(statusObj) ?? false;
                if (!suppress) {
                  this.CreateSimpleNotification(statusObj.title || 'New Notification Available', "success", 3000);
                }
                // Always refresh the notification list (badge count, unread state)
                MJNotificationService.RefreshUserNotifications();
              }
            }
            else {
              // otherwise just post it as a simple notification, except Skip messages, we will let Skip handle those.
              // 'realtimedelegationprogress' carries a per-step message that the voice session consumes + narrates
              // itself — it must NOT raise a toast (otherwise a live voice call spams a toast per progress step).
              if (type !== 'askskip' && type !== 'entityobjectstatusmessage' && type !== 'realtimedelegationprogress' && typeof statusObj.message === 'string') {
                this.CreateSimpleNotification(statusObj.message, "success", 2500);
              }
            }
          });
          break;
      }      
    });
  }

  public PushStatusUpdates(): Observable<string> {
    const gp: GraphQLDataProvider = <GraphQLDataProvider><unknown>this.Provider;
    return gp.PushStatusUpdates();
  }

  public static get Instance(): MJNotificationService {
    return GetGlobalObjectStore()![MJNotificationService._globalStoreKey] as MJNotificationService;
  }
 
  /**
   * The current user's notifications, delegated to UserInfoEngine which owns the
   * cache. Applies the per-user filter and newest-first sort on each access.
   */
  public static get UserNotifications(): MJUserNotificationEntity[] {
    return UserInfoEngine.Instance.UserNotifications;
  }

  /**
   * The current user's unread notifications, delegated to UserInfoEngine.
   */
  public static get UnreadUserNotifications(): MJUserNotificationEntity[] {
    return UserInfoEngine.Instance.UnreadNotifications;
  }

  /**
   * The current user's unread notification count, delegated to UserInfoEngine.
   */
  public static get UnreadUserNotificationCount(): number {
    return UserInfoEngine.Instance.UnreadNotificationCount;
  }

  /**
   * Instance method to access Notifications$ observable
   */
  public get notifications$(): Observable<MJUserNotificationEntity[]> {
    return MJNotificationService.Notifications$;
  }

  /**
   * Instance method to access UnreadCount$ observable
   */
  public get unreadCount$(): Observable<number> {
    return MJNotificationService.UnreadCount$;
  }


  /**
   * Creates a user notification in the database and refreshes the UI. Returns the notification object.
   * @param title 
   * @param message 
   * @param resourceTypeId 
   * @param resourceRecordId 
   * @param resourceConfiguration Any object, it is converted to a string by JSON.stringify and stored in the database
   * @returns 
   */
  public async CreateNotification(title: string, message: string, resourceTypeId: string | null, resourceRecordId: string | null, resourceConfiguration: any | null, displayToUser: boolean = true): Promise<MJUserNotificationEntity> {
    const md = this.Provider;
    const notification = <MJUserNotificationEntity>await md.GetEntityObject('MJ: User Notifications');
    notification.Title = title;
    notification.Message = message;
    if (resourceTypeId)
      notification.ResourceTypeID = resourceTypeId;
    if (resourceRecordId)
      notification.ResourceRecordID = resourceRecordId;
    if (resourceConfiguration)
      notification.ResourceConfiguration = JSON.stringify(resourceConfiguration);
  
    notification.UserID = md.CurrentUser.ID;
    notification.Unread = true;
    const result = await notification.Save();
    if (result) {
        MJNotificationService.RefreshUserNotifications();
    }

    if (displayToUser)
        this.CreateSimpleNotification(notification.Message, "success", 2500);

    return notification;
  }

  /**
   * Refresh user notifications from the server. Delegates to UserInfoEngine.RefreshItem,
   * whose successful reload mutates the engine's notifications cache and triggers an
   * emission on Notifications$/UnreadCount$ via the BaseEngine observable plumbing —
   * subscribers are updated automatically with no manual re-emit required here.
   *
   * Uses RefreshItem() rather than relying solely on the global CACHE_INVALIDATION
   * listener: when this method is called in response to a PushStatusUpdates message,
   * the cache-invalidation event may not have arrived yet (separate WebSocket message,
   * potential race). RefreshItem() eliminates that race by doing a targeted RunView
   * for just notifications.
   */
  public static async RefreshUserNotifications() {
    try {
      await UserInfoEngine.Instance.RefreshItem('_UserNotifications');
      MJNotificationService._loaded = true;
    }
    catch (e) {
      LogError(e);
    }
  }

  /**
   * @deprecated Kept as a no-op for backward compatibility. Observable emissions are now
   * driven by UserInfoEngine.UserNotifications$, which auto-emits on save/delete/
   * remote-invalidate/refresh. External callers no longer need to manually push updates.
   */
  public static UpdateNotificationObservables() {
    // No-op — see JSDoc above.
  }

  /**
   * Creates a message that is not saved to the User Notifications table, but is displayed to the user.
   * Uses a lightweight DOM-based toast notification.
   * @param message - text to display
   * @param style - display styling
   * @param hideAfter - option to auto hide after the specified delay in milliseconds
   */
  public CreateSimpleNotification(message: string, style: "none" | "success" | "error" | "warning" | "info" = "success", hideAfter?: number) {
    this.showToast(message, style, hideAfter);
  }

  /**
   * Ensures the toast container element exists in the DOM.
   */
  private ensureToastContainer(): HTMLElement {
    let container = document.getElementById('mj-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mj-toast-container';
      container.style.cssText = `
        position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
        z-index: 100000; display: flex; flex-direction: column; align-items: center; gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Shows a lightweight toast notification using DOM elements.
   */
  private showToast(message: string, style: string, hideAfter?: number): void {
    const container = this.ensureToastContainer();

    const toast = document.createElement('div');
    toast.style.cssText = `
      pointer-events: auto; padding: 12px 20px; border-radius: 6px; font-size: 14px;
      font-family: inherit; max-width: 500px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex; align-items: center; gap: 8px; animation: mj-toast-slide-in 0.3s ease-out;
      color: var(--mj-text-inverse);
    `;

    const bgColors: Record<string, string> = {
      success: 'var(--mj-status-success)',
      error:   'var(--mj-status-error)',
      warning: 'var(--mj-status-warning)',
      info:    'var(--mj-status-info)',
      none:    'var(--mj-text-secondary)'
    };
    toast.style.backgroundColor = bgColors[style] || bgColors['none'];

    const iconMap: Record<string, string> = {
      success: '\u2713',
      error:   '\u2717',
      warning: '\u26A0',
      info:    '\u2139',
      none:    ''
    };
    const icon = iconMap[style] || '';

    const removeToast = () => {
      toast.style.animation = 'mj-toast-slide-out 0.3s ease-in forwards';
      toast.addEventListener('animationend', () => toast.remove());
    };

    toast.innerHTML = `
      ${icon ? `<span style="font-size:16px;font-weight:bold;">${icon}</span>` : ''}
      <span style="flex:1;">${this.escapeHtml(message)}</span>
      ${!hideAfter ? `<button style="background:none;border:none;color:var(--mj-text-inverse);cursor:pointer;font-size:18px;padding:0 0 0 8px;line-height:1;" aria-label="Close">&times;</button>` : ''}
    `;

    if (!hideAfter) {
      const closeBtn = toast.querySelector('button');
      closeBtn?.addEventListener('click', removeToast);
    }

    container.appendChild(toast);

    // Inject keyframes if not already present
    if (!document.getElementById('mj-toast-keyframes')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'mj-toast-keyframes';
      styleEl.textContent = `
        @keyframes mj-toast-slide-in { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes mj-toast-slide-out { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-20px); } }
      `;
      document.head.appendChild(styleEl);
    }

    if (hideAfter) {
      setTimeout(removeToast, hideAfter);
    }
  }

  /**
   * Escapes HTML entities to prevent XSS in toast messages.
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}