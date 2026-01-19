import { Component, ViewChild, ElementRef, AfterViewInit, OnInit } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { ConversationDetailEntity, ConversationEntity, UserNotificationEntity, UserNotificationTypeEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, TransactionGroupBase, TransactionVariable } from '@memberjunction/core';
import { Router } from '@angular/router';
import { SafeJSONParse } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Radio button filter options for notification read status
 */
type ReadFilterOption = 'All' | 'Unread' | 'Read';

/**
 * Configuration for record-type resource navigation
 */
interface RecordResourceConfig {
  Entity?: string;
}

/**
 * Configuration for conversation-type resource navigation
 */
interface ConversationResourceConfig {
  type: 'conversation';
  conversationId?: string;
  messageId?: string;
  artifactId?: string;
  versionNumber?: string;
  taskId?: string;
}

/**
 * Result of parsing a notification URL
 */
interface NotificationUrlInfo {
  urlParts: string[];
  queryString: string;
}

@Component({
  selector: 'app-user-notifications',
  templateUrl: './user-notifications.component.html',
  styleUrls: ['./user-notifications.component.css']
})
export class UserNotificationsComponent implements OnInit, AfterViewInit {
  @ViewChild('allRadio') allRadio!: ElementRef<HTMLInputElement>;
  @ViewChild('unreadRadio') unreadRadio!: ElementRef<HTMLInputElement>;
  @ViewChild('readRadio') readRadio!: ElementRef<HTMLInputElement>;

  public radioSelected: ReadFilterOption = 'All';
  public currentFilter: string = '';
  public notificationTypes: UserNotificationTypeEntity[] = [];
  public selectedTypeFilter: string | null = null;
  public loadingTypes: boolean = true;

  constructor (public sharedService: SharedService, private router: Router) {}

  async ngOnInit() {
    await this.loadNotificationTypes();
  }

  ngAfterViewInit(): void {
    this.sharedService.InvokeManualResize(); // make sure the notifications component is sized correctly
  }

  private async loadNotificationTypes() {
    try {
      this.loadingTypes = true;
      const rv = new RunView();
      const result = await rv.RunView<UserNotificationTypeEntity>({
        EntityName: 'MJ: User Notification Types',
        OrderBy: 'Priority ASC, Name ASC',
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.notificationTypes = result.Results;
      }
    } catch (error) {
      console.error('Failed to load notification types:', error);
    } finally {
      this.loadingTypes = false;
    }
  }

  public get NotificationsToShow(): UserNotificationEntity[] {
    let temp: UserNotificationEntity[] = [];
    switch (this.radioSelected) {
      case 'All':
        temp = this.AllNotifications;
        break;
      case 'Unread':
        temp = this.AllNotifications.filter(n => n.Unread);
        break;
      case 'Read':
        temp = this.AllNotifications.filter(n => !n.Unread);
        break;
    }

    // Apply type filter if selected
    if (this.selectedTypeFilter) {
      temp = temp.filter(n => n.NotificationTypeID === this.selectedTypeFilter);
    }

    // Apply text filter if it is not empty
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

  public notificationUrl(notification: UserNotificationEntity): NotificationUrlInfo {
    const url: string[] = [];
    let queryString = '';
    if (notification.ResourceRecordID && notification.ResourceRecordID.length > 0 &&
        notification.ResourceTypeID && notification.ResourceTypeID.length > 0) {
      // we have a resource here, like a Report, Dashboard, etc
      // we can generate a url to navigate to it
      const rt = this.sharedService.ResourceTypeByID(notification.ResourceTypeID);
      let routeSegment: string | null | undefined;
      if (rt)
        routeSegment = this.sharedService.mapResourceTypeNameToRouteSegment(rt.Name);

      if (rt && routeSegment && routeSegment.trim().length > 0) {
        url.push('resource');
        url.push(routeSegment);
        url.push(notification.ResourceRecordID.toString());
        if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
          if (rt.Name.trim().toLowerCase() === 'records') {
            // special handling for records
            const config = SafeJSONParse<RecordResourceConfig>(notification.ResourceConfiguration);
            if (config && config.Entity)
              queryString = `Entity=${config.Entity}`;
          }
          else
            queryString = notification.ResourceConfiguration;
        }
      }
    }
    else if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
      // we do NOT have a resource type or resource record id, but we do have a ResourceConfiguration
      // string, which means we might have information on how to navigate to what we want if we parse the config
      // HOME screen stuff is done this way

      const config = SafeJSONParse<ConversationResourceConfig>(notification.ResourceConfiguration);
      if (config && config.type?.trim().toLowerCase() === 'conversation') {
        url.push('chat');
        // Build query string with conversation and artifact navigation
        const queryParams: string[] = [];
        if (config.conversationId) queryParams.push(`conversationId=${config.conversationId}`);
        if (config.messageId) queryParams.push(`messageId=${config.messageId}`);
        if (config.artifactId) queryParams.push(`artifactId=${config.artifactId}`);
        if (config.versionNumber) queryParams.push(`versionNumber=${config.versionNumber}`);
        if (config.taskId) queryParams.push(`taskId=${config.taskId}`);
        queryString = queryParams.join('&');
      }
    }

    return { urlParts: url, queryString };
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

  selectReadOption(option: ReadFilterOption): void {
    this.radioSelected = option;
    // now update the radio button group in the UI
    switch (option) {
      case 'All':
        this.allRadio.nativeElement.checked = true;
        break;
      case 'Unread':
        this.unreadRadio.nativeElement.checked = true;
        break;
      case 'Read':
        this.readRadio.nativeElement.checked = true;
        break;
    }
  }

  onReadRadioChanged(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.radioSelected = event.target.value as ReadFilterOption;
    }
  }

  onFilterChanged(value: string): void {
    this.currentFilter = value;
  }

  getItemTitleClass(notification: UserNotificationEntity): string {
    if (notification.Unread) {
      return 'notification-title notification-title-unread';
    }
    return 'notification-title';
  }

  getItemWrapperClass(notification: UserNotificationEntity): string {
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
        await notificationEntity.Save()
        return true;
      }
      else {
        if (await notificationEntity.Save()) {
          // Update the observables so badge count refreshes immediately
          MJNotificationService.UpdateNotificationObservables();
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
    await this.markAll(true);

    // test harness for creating Conversations and Conversation Details record in a single transaction using variables
    await this.TestTransactionGroupVariables();
  }

  public async TestTransactionGroupVariables() {
    const md = new Metadata();
    const transGroup = await md.CreateTransactionGroup();

    const conversation = await md.GetEntityObject<ConversationEntity>('Conversations');
    conversation.UserID = md.CurrentUser.ID;
    conversation.Description = 'Test Conversation';
    conversation.TransactionGroup = transGroup;
    if (!await conversation.Save()) {
      this.sharedService.CreateSimpleNotification('Unable to create conversation', 'error', 5000);
    }

    const tvDefine = new TransactionVariable('NewConvoID', conversation, 'ID', 'Define')
    transGroup.AddVariable(tvDefine);

    const conversationDetail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details');
    conversationDetail.Message = 'Test Message';
    conversationDetail.Role = 'User';
    conversationDetail.ConversationID = 'x'; // fake UUID must be non-null to pass validation, this will be replaced by the variable, since we're part of a TG, not a real save, so doesn't validate it as a true fkey
    conversationDetail.TransactionGroup = transGroup;
    if (!await conversationDetail.Save()) {
      this.sharedService.CreateSimpleNotification('Unable to create conversation detail', 'error', 500);
    }    
    const tvUse = new TransactionVariable('NewConvoID', conversationDetail, 'ConversationID', 'Use')
    transGroup.AddVariable(tvUse);

    if (await transGroup.Submit()) {
      this.sharedService.CreateSimpleNotification('Transaction Group with Variables worked', 'success', 5000);
    }
    else {
      this.sharedService.CreateSimpleNotification('Transaction Group with Variables failed', 'error', 5000);
    }
  }

  public async markAllAsUnread() {
    await this.markAll(false);
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
  
  notificationClicked(notification: UserNotificationEntity): void {
    if (this.isNotificationClickable(notification)) {
      // also mark this as read when we click it
      this.markAsRead(notification, true, null);

      const info = this.notificationUrl(notification);
      if (info.queryString && info.queryString.trim().length > 0) {
        const fullUrl = `${info.urlParts.join('/')}${info.queryString ? '?' + info.queryString : ''}`;
        this.router.navigateByUrl(fullUrl);
      }
      else {
        this.router.navigate(info.urlParts);
      }
    }
  }

  public getNotificationType(typeId: string | null): UserNotificationTypeEntity | null {
    if (!typeId) return null;
    return this.notificationTypes.find(t => t.ID === typeId) || null;
  }

  public getTypeIcon(notification: UserNotificationEntity): string {
    const type = this.getNotificationType(notification.NotificationTypeID);
    return type?.Icon || 'fa-bell';
  }

  public getTypeColor(notification: UserNotificationEntity): string {
    const type = this.getNotificationType(notification.NotificationTypeID);
    return type?.Color || '#999';
  }

  public getTypeName(notification: UserNotificationEntity): string {
    const type = this.getNotificationType(notification.NotificationTypeID);
    return type ? type.Name : 'Notification';
  }

  public onTypeFilterChange(typeId: string | null): void {
    this.selectedTypeFilter = typeId;
  }
}
