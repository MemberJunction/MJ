import { Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { UserNotificationEntity } from '@memberjunction/core-entities';
import { Metadata, TransactionGroupBase } from '@memberjunction/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-user-notifications',
  templateUrl: './user-notifications.component.html',
  styleUrls: ['./user-notifications.component.css']
})
export class UserNotificationsComponent implements AfterViewInit {
  @ViewChild('allRadio') allRadio!: ElementRef;
  @ViewChild('unreadRadio') unreadRadio!: ElementRef;
  @ViewChild('readRadio') readRadio!: ElementRef;  

  public radioSelected: string = 'all';
  public currentFilter: string = '';

  constructor (public sharedService: SharedService, private router: Router) {}

  ngAfterViewInit(): void {
    this.sharedService.InvokeManualResize(); // make sure the notifications component is sized correctly
  }

  public get NotificationsToShow(): UserNotificationEntity[] {
    let temp: UserNotificationEntity[] = [];
    if (this.radioSelected.trim().toLowerCase() === 'all') {
      temp = this.AllNotifications;
    }
    else if (this.radioSelected.trim().toLowerCase() === 'unread') {
      temp = this.AllNotifications.filter(n => n.Unread);
    }
    else {
      temp = this.AllNotifications.filter(n => !n.Unread);
    }

    // Apply filter if it is not empty
    if (this.currentFilter.trim().length > 0) {
      // check for inclusion of filter value in title or message
      temp = temp.filter(n => n.Title?.toLowerCase().includes(this.currentFilter.trim().toLowerCase()) || 
                              n.Message?.toLowerCase().includes(this.currentFilter.trim().toLowerCase())
                        );
    }

    return temp;
  }

  public isNotificationClickable(notification: UserNotificationEntity): boolean {
    const info = this.notificationUrl(notification);
    return (info !== null && info.urlParts && info.urlParts.length > 0);
  }

  public notificationUrl(notification: UserNotificationEntity): {urlParts: string[], queryString: string} {
    let url: string[] = [];
    let queryString = '';
    if (notification.ResourceRecordID && notification.ResourceRecordID.length > 0 && 
        notification.ResourceTypeID && notification.ResourceTypeID.length > 0) {
      // we have a resource here, like a Report, Dashboard, etc
      // we can generate a url to navigate to it
      const rt = this.sharedService.ResourceTypeByID(notification.ResourceTypeID);
      let routeSegment;
      if (rt)
        routeSegment = this.sharedService.mapResourceTypeNameToRouteSegment(rt.Name);
      
      if (rt && routeSegment && routeSegment.trim().length > 0) {
        url.push('resource');
        url.push(routeSegment);
        url.push(notification.ResourceRecordID.toString());
        if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
          queryString = notification.ResourceConfiguration;
        }
      }
    }
    else if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
      // we do NOT have a resource type or resource record id, but we do have a ResourceConfiguration
      // string, which means we might have information on how to navigate to what we want if we parse the config
      // HOME screen stuff is done this way
      const config = JSON.parse(notification.ResourceConfiguration);
      if (config) {
        switch (config.type?.trim().toLowerCase()) {
          case 'askskip':
            url.push('askskip');
            if (config.conversationId)
              url.push(config.conversationId);
            break;
        }
      }
    }
    else {
      // we have nothing to click on
      // don't generate a url
    }

    return {urlParts: url, queryString: queryString};
  }

  public get AllNotifications(): UserNotificationEntity[] {
    return SharedService.UserNotifications;
  }

  public get UnreadNotifications(): UserNotificationEntity[] {
    return this.AllNotifications.filter(n => n.Unread);
  }

  public get ReadNotifications(): UserNotificationEntity[] {
    return this.AllNotifications.filter(n => !n.Unread);
  }

  selectReadOption(option: string): void {
    this.radioSelected = option;
    // now update the radio button group in the UI
    switch (option.trim().toLowerCase()) {
      case 'all':
        this.allRadio.nativeElement.checked = true;
        break;
      case 'unread':
        this.unreadRadio.nativeElement.checked = true;
        break;
      case 'read':
        this.readRadio.nativeElement.checked = true;
        break;
    }
  }

  onReadRadioChanged(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    this.radioSelected = value;
  }

  onFilterChanged(value: string): void {
    this.currentFilter = value;
  }

  getItemTitleClass(notification: UserNotificationEntity) {
    if (notification.Unread) {
      return 'notification-title notification-title-unread';
    }
    else {
      return 'notification-title';
    }
  }

  getItemWrapperClass(notification: UserNotificationEntity) {
    let classInfo = 'notification-wrap';

    if (this.isNotificationClickable(notification)) 
      classInfo += ' notification-wrap-clickable';

    if (notification.Unread) 
      classInfo += ' notification-wrap-unread';

    return classInfo;
  }

  async markAsRead(notification: UserNotificationEntity, bRead: boolean, transGroup: TransactionGroupBase | null): Promise<boolean> {
    if (notification) {
      const notificationId = notification.ID;
      notification.Unread = !bRead;
      let notificationEntity: UserNotificationEntity;
      if (notification instanceof UserNotificationEntity) {
        // the passed in param truly is a UserNotificationEntity or subclass, so just use it, saves a DB round trip
        notificationEntity = notification;
      }
      else {
        // the passed in param is just a plain object, so we need to load the entity
        const md = new Metadata();
        notificationEntity = await md.GetEntityObject<UserNotificationEntity>('User Notifications');
        await notificationEntity.Load(notificationId);  
        notificationEntity.Unread = !bRead;  
      }

      // part of a transaction group, if so, add it as that will defer the actual network traffic/save
      if (transGroup) {
        notificationEntity.TransactionGroup = transGroup;
        notificationEntity.Save() // no await when using a transaction group
        return true;
      }
      else {
        if (await notificationEntity.Save()) {
          //SharedService.RefreshUserNotifications(); don't need to save because angular binding already updtes the UI from the objects
          return true;
        }
        else  {
          this.sharedService.CreateSimpleNotification('Unable to mark notification as read', 'error', 5000);
          return false; // let caller do notifications
        }  
      }
    }
    else {
      return false;
    }
  }

  public async markAllAsRead() {
    this.markAll(true);
  }

  public async markAllAsUnread() {
    this.markAll(false);
  }

  public async markAll(bRead: boolean) {
    // do a transaction group, not so much for ATOMICITY but for performance in terms of latency to/from the server
    const md = new Metadata();
    const transGroup = await md.CreateTransactionGroup();

    for (const notification of this.AllNotifications) {
      if (notification.Unread && bRead || !notification.Unread && !bRead) {
        // don't await, we want to just keep going, the backgorund DB stuff happens when it happens but we can update the UI right away
        if (!await this.markAsRead(notification, bRead, transGroup)) {
          // failed
          this.sharedService.CreateSimpleNotification('Unable to mark all notifications as read', 'error', 5000);
          // bail out here
          return;
        }
      }
    }

    // if we get here, that means all the saves worked...
    if (!await transGroup.Submit())
      this.sharedService.CreateSimpleNotification('Unable to mark all notifications as read', 'error', 5000);
    else
      SharedService.RefreshUserNotifications();
  }
  
  notificationClicked(notification: UserNotificationEntity) {
    if (this.isNotificationClickable(notification)) {
      // also mark this as read when we click it
      this.markAsRead(notification, true, null);

      const info = this.notificationUrl(notification);
      if (info.queryString && info.queryString.trim().length > 0) {
        const fullUrl = `${info.urlParts.join('/')}${info.queryString ? '?' + info.queryString : ''}`;
        this.router.navigateByUrl(fullUrl);
      }
      else{
        this.router.navigate(info.urlParts);
      }
    }
  } 
}
