import { ElementRef, Injectable } from '@angular/core';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { UserNotificationEntity } from '@memberjunction/core-entities';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { NotificationService, NotificationSettings } from "@progress/kendo-angular-notification";
import { BehaviorSubject, Subject } from 'rxjs';

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
        case MJEventType.LoggedIn: 
            MJNotificationService.RefreshUserNotifications();
            break;
      }      
    });
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
   */
  public static async RefreshUserNotifications() {
    try {
      const rv = new RunView();
      const md = new Metadata();
      const result = await rv.RunView({
          EntityName: 'User Notifications',
          ExtraFilter: `UserID='${md.CurrentUser.ID}'`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object' /* we want the entity objects, this has a little bit of overhead cost, but since we'll want to be able to modify the unread state it is helpful to have these ready to go */
      })
      if (result && result.Success) {
        MJNotificationService._userNotifications = result.Results;
      }
    }
    catch (e) {
      LogError(e);
    }
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