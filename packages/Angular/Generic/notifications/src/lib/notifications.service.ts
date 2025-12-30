import { ElementRef, Injectable } from '@angular/core';
import { LogError, Metadata } from '@memberjunction/core';
import { UserInfoEngine, UserNotificationEntity } from '@memberjunction/core-entities';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { NotificationService, NotificationSettings } from "@progress/kendo-angular-notification";
import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * This injectable service is also available as a singleton MJNotificationService.Instance globally within an Angular application/library process space. It is responsible for displaying notifications to the user and also is able to manage the User Notifications entity
 * in the database.
 */
@Injectable({
  providedIn: 'root'
})
export class MJNotificationService {
  private static _instance: MJNotificationService;
  private static _loaded: boolean = false;

  private static isLoading$ = new BehaviorSubject<boolean>(false);
  private tabChange = new Subject();
  tabChange$ = this.tabChange.asObservable();

  // Observable for notification changes
  private static _notifications$ = new BehaviorSubject<UserNotificationEntity[]>([]);
  private static _unreadCount$ = new BehaviorSubject<number>(0);

  constructor(private notificationService: NotificationService) {
    if (MJNotificationService._instance) {
      // return existing instance which will short circuit the creation of a new instance
      return MJNotificationService._instance;
    }
    // first time this has been called, so return ourselves since we're in the constructor
    MJNotificationService._instance = this;

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
          if (MJNotificationService._loaded === false) 
            MJNotificationService.RefreshUserNotifications();

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

            if (statusObj.type?.trim().toLowerCase() === 'usernotifications') {
              if (statusObj.details && statusObj.details.action?.trim().toLowerCase() === 'create') { 
                // we have changes to user notifications, so refresh them
                this.CreateSimpleNotification('New Notification Available', "success", 2000)
                MJNotificationService.RefreshUserNotifications();
              }
            }
            else {
              // otherwise just post it as a simple notification, except Skip messages, we will let Skip handle those
              const type = statusObj.type?.trim().toLowerCase();
              if (type !== 'askskip' && type !== 'entityobjectstatusmessage' && typeof statusObj.message === 'string') { 
                this.CreateSimpleNotification(statusObj.message, "success", 2500);
              }
            }
          });
          break;
      }      
    });
  }

  public PushStatusUpdates(): Observable<string> {
    const gp: GraphQLDataProvider = <GraphQLDataProvider>Metadata.Provider;
    return gp.PushStatusUpdates();
  }

  public static get Instance(): MJNotificationService {
    return MJNotificationService._instance;
  }
 
  private static _userNotifications: UserNotificationEntity[] = [];
  public static get UserNotifications(): UserNotificationEntity[] {
    return MJNotificationService._userNotifications;
  }
  public static get UnreadUserNotifications(): UserNotificationEntity[] {
    return MJNotificationService._userNotifications.filter(n => n.Unread);
  }
  public static get UnreadUserNotificationCount(): number {
    return MJNotificationService.UnreadUserNotifications.length;
  }

  /**
   * Observable that emits the full list of user notifications whenever they change
   */
  public static get Notifications$(): Observable<UserNotificationEntity[]> {
    return MJNotificationService._notifications$.asObservable();
  }

  /**
   * Observable that emits the unread notification count whenever it changes
   */
  public static get UnreadCount$(): Observable<number> {
    return MJNotificationService._unreadCount$.asObservable();
  }

  /**
   * Instance method to access Notifications$ observable
   */
  public get notifications$(): Observable<UserNotificationEntity[]> {
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
  public async CreateNotification(title: string, message: string, resourceTypeId: string | null, resourceRecordId: string | null, resourceConfiguration: any | null, displayToUser: boolean = true): Promise<UserNotificationEntity> {
    const md = new Metadata();
    const notification = <UserNotificationEntity>await md.GetEntityObject('User Notifications');
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
   * Refresh the User Notifications from the database. This is called automatically when the service is first loaded after login occurs.
   * Uses UserInfoEngine for centralized data access with local caching.
   */
  public static async RefreshUserNotifications() {
    try {
      // Use UserInfoEngine for centralized, cached access
      const engine = UserInfoEngine.Instance;
      MJNotificationService._userNotifications = engine.UserNotifications;
      // Emit to observables
      MJNotificationService._notifications$.next(engine.UserNotifications);
      MJNotificationService._unreadCount$.next(MJNotificationService.UnreadUserNotificationCount);
      MJNotificationService._loaded = true;
    }
    catch (e) {
      LogError(e);
    }
  }

  /**
   * Update notification observables from existing in-memory data without doing a database query.
   * This is efficient for cases where notifications have been modified locally (e.g., marking as read)
   * and we just need to notify subscribers of the change.
   */
  public static UpdateNotificationObservables() {
    MJNotificationService._notifications$.next(MJNotificationService._userNotifications);
    MJNotificationService._unreadCount$.next(MJNotificationService.UnreadUserNotificationCount);
  }

  /**
   * Creates a message that is not saved to the User Notifications table, but is displayed to the user.
   * @param message - text to display
   * @param style - display styling
   * @param hideAfter - option to auto hide after the specified delay in milliseconds
   */
  public CreateSimpleNotification(message: string, style: "none" | "success" | "error" | "warning" | "info" = "success", hideAfter?: number) {
    const props: NotificationSettings = {
      content: message,
      cssClass: "button-notification",
      animation: { type: "slide", duration: 400 },
      position: { horizontal: "center", vertical: "top" },
      type: { style: style, icon: true }
    }
    if (hideAfter)
      props.hideAfter = hideAfter;
    else
      props.closable = true;

    this.notificationService.show(props);
  }
}