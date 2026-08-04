import { Component, ChangeDetectorRef, OnDestroy, OnInit, AfterViewInit, inject } from '@angular/core';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { MJUserNotificationEntity, MJUserNotificationTypeEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { CompositeKey, TransactionGroupBase } from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Radio button filter options for notification read status
 */
type ReadFilterOption = 'All' | 'Unread' | 'Read';

/** How a notification's Message should be rendered. */
type MessageKind = 'html' | 'markdown' | 'text';

/**
 * Render-ready view model for one notification. Built once per data/filter change
 * (never inside template bindings): the Message is classified (full HTML document /
 * HTML fragment / Markdown / plain text), reduced to a sanitary body + plain-text
 * preview, and the time-relative label is SNAPSHOT here — computing relative time in
 * the template throws NG0100 at minute boundaries.
 */
interface NotificationVM {
  N: MJUserNotificationEntity;
  Kind: MessageKind;
  /** Rich body: extracted+stripped HTML fragment (html) or the raw message (markdown). Empty for plain text. */
  Body: string;
  /** Plain-text excerpt for the collapsed card. */
  Preview: string;
  /** True when there is more to see than the collapsed preview. */
  Expandable: boolean;
  /** Snapshot "2h ago" label (refreshed on a timer, never computed in the template). */
  Relative: string;
  Clickable: boolean;
}

/** One day-bucket of notifications ("Today", "Yesterday", ...). */
interface NotificationGroup {
  Key: string;
  Label: string;
  Items: NotificationVM[];
}

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
 * Configuration for agent-request-type resource navigation
 */
interface AgentRequestResourceConfig {
  type: 'agent-request';
  requestId: string;
}

/**
 * Result of parsing a notification URL
 */
interface NotificationUrlInfo {
  urlParts: string[];
  queryString: string;
}

/** Collapsed-preview cap (characters of plain text). */
const PREVIEW_MAX_CHARS = 240;

/** How often the snapshot relative-time labels refresh. */
const RELATIVE_REFRESH_MS = 60_000;

@Component({
  standalone: false,
  selector: 'app-user-notifications',
  templateUrl: './user-notifications.component.html',
  styleUrls: ['./user-notifications.component.css']
})
export class UserNotificationsComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  public radioSelected: ReadFilterOption = 'All';
  public currentFilter: string = '';
  public notificationTypes: MJUserNotificationTypeEntity[] = [];
  public selectedTypeFilter: string | null = null;
  public loadingTypes: boolean = true;

  /** IDs of cards currently expanded to their full rendered content. */
  public Expanded = new Set<string>();

  private groups: NotificationGroup[] = [];
  private groupsKey = '';
  private vmCache = new Map<string, NotificationVM>();
  private relativeTimer: ReturnType<typeof setInterval> | null = null;

  constructor (
    public sharedService: SharedService,
    private navigationService: NavigationService,
    private appManager: ApplicationManager
  ) {
    super();
  }

  async ngOnInit() {
    this.loadNotificationTypes();
    // Refresh the snapshot relative-time labels between change-detection passes.
    this.relativeTimer = setInterval(() => {
      for (const vm of this.vmCache.values()) {
        vm.Relative = this.relativeTime(vm.N.__mj_CreatedAt);
      }
      this.groupsKey = ''; // day buckets can shift at midnight
      this.cdr.markForCheck();
    }, RELATIVE_REFRESH_MS);
  }

  ngAfterViewInit(): void {
    this.sharedService.InvokeManualResize(); // make sure the notifications component is sized correctly
  }

  ngOnDestroy(): void {
    if (this.relativeTimer != null) {
      clearInterval(this.relativeTimer);
    }
  }

  private loadNotificationTypes() {
    // Get notification types from UserInfoEngine cache, sorted client-side
    // UserInfoEngine is auto-configured via @RegisterForStartup()
    this.notificationTypes = [...UserInfoEngine.Instance.NotificationTypes].sort((a, b) => {
      const priorityA = a.Priority ?? 999;
      const priorityB = b.Priority ?? 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.Name.localeCompare(b.Name);
    });
    this.loadingTypes = false;
  }

  // ========================================================================
  // Data shaping (filter → view models → day groups)
  // ========================================================================

  public get NotificationsToShow(): MJUserNotificationEntity[] {
    let temp: MJUserNotificationEntity[] = [];
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
      temp = temp.filter(n => UUIDsEqual(n.NotificationTypeID, this.selectedTypeFilter));
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

  /**
   * The filtered notifications as render-ready day groups. Memoized on a composite
   * key of the inputs so the getter stays cheap across change-detection passes and
   * the (time-sensitive) VM snapshots never rebuild mid-pass.
   */
  public get Groups(): NotificationGroup[] {
    const list = this.NotificationsToShow;
    const unread = list.filter(n => n.Unread).length;
    const key = `${list.length}|${unread}|${this.radioSelected}|${this.selectedTypeFilter}|${this.currentFilter}|${list[0]?.ID ?? ''}|${list[list.length - 1]?.ID ?? ''}`;
    if (key !== this.groupsKey) {
      this.groups = this.buildGroups(list);
      this.groupsKey = key;
    }
    return this.groups;
  }

  private buildGroups(list: MJUserNotificationEntity[]): NotificationGroup[] {
    const groups: NotificationGroup[] = [];
    let current: NotificationGroup | null = null;
    for (const n of list) {
      const label = this.dayLabel(n.__mj_CreatedAt);
      if (!current || current.Label !== label) {
        current = { Key: `${label}-${n.ID}`, Label: label, Items: [] };
        groups.push(current);
      }
      current.Items.push(this.vmFor(n));
    }
    return groups;
  }

  private vmFor(n: MJUserNotificationEntity): NotificationVM {
    const cached = this.vmCache.get(n.ID);
    if (cached) {
      cached.N = n;
      cached.Clickable = this.isNotificationClickable(n);
      return cached;
    }
    const { kind, body, preview, expandable } = this.classifyMessage(n.Message ?? '');
    const vm: NotificationVM = {
      N: n,
      Kind: kind,
      Body: body,
      Preview: preview,
      Expandable: expandable,
      Relative: this.relativeTime(n.__mj_CreatedAt),
      Clickable: this.isNotificationClickable(n),
    };
    this.vmCache.set(n.ID, vm);
    return vm;
  }

  /**
   * Classifies a notification Message for rendering:
   *  - Full HTML documents (e.g. templated email bodies) and HTML fragments →
   *    parsed with DOMParser, chrome elements (style/script/link/meta/title) removed,
   *    and the body markup kept for a SANITIZED [innerHTML] binding (Angular's
   *    default sanitizer strips scripts/event handlers on bind).
   *  - Markdown-looking text → rendered through mj-markdown when expanded.
   *  - Everything else → plain text.
   */
  private classifyMessage(message: string): { kind: MessageKind; body: string; preview: string; expandable: boolean } {
    const trimmed = (message ?? '').trim();
    const looksHtml = /^<!doctype\s|^<html[\s>]/i.test(trimmed) || /<\/?[a-z][^>]*>/i.test(trimmed);
    if (looksHtml) {
      const doc = new DOMParser().parseFromString(trimmed, 'text/html');
      for (const el of Array.from(doc.querySelectorAll('style, script, link, meta, title'))) {
        el.remove();
      }
      const body = doc.body?.innerHTML?.trim() ?? '';
      const text = this.collapseWhitespace(doc.body?.textContent ?? '');
      return { kind: 'html', body, preview: this.excerpt(text), expandable: true };
    }
    const looksMarkdown = /(^|\n)#{1,6}\s|\*\*[^*]+\*\*|(^|\n)\s*[-*]\s+|\[[^\]]+\]\([^)]+\)|```/m.test(trimmed);
    const text = this.collapseWhitespace(trimmed);
    if (looksMarkdown) {
      return { kind: 'markdown', body: trimmed, preview: this.excerpt(this.stripMarkdown(text)), expandable: true };
    }
    return { kind: 'text', body: '', preview: text, expandable: text.length > PREVIEW_MAX_CHARS };
  }

  private collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private excerpt(text: string): string {
    return text.length > PREVIEW_MAX_CHARS ? `${text.substring(0, PREVIEW_MAX_CHARS - 1)}…` : text;
  }

  /** Light de-noising of markdown syntax for the plain-text preview. */
  private stripMarkdown(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#*_`>]+/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Compact "just now / 5m ago / 3h ago / 2d ago" label. NEVER call from templates (NG0100) — snapshot only. */
  private relativeTime(value: Date | string | null | undefined): string {
    if (!value) {
      return '';
    }
    const ms = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}d ago` : '';
  }

  private dayLabel(value: Date | string | null | undefined): string {
    if (!value) {
      return 'Earlier';
    }
    const d = new Date(value);
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    return 'Earlier';
  }

  // ========================================================================
  // Expand / collapse
  // ========================================================================

  public IsExpanded(vm: NotificationVM): boolean {
    return this.Expanded.has(vm.N.ID);
  }

  public ToggleExpanded(vm: NotificationVM, event: Event): void {
    event.stopPropagation();
    if (this.Expanded.has(vm.N.ID)) {
      this.Expanded.delete(vm.N.ID);
    } else {
      this.Expanded.add(vm.N.ID);
      // Reading the full content is reading — mark it as such.
      if (vm.N.Unread) {
        void this.markAsRead(vm.N, true, null);
      }
    }
    this.cdr.markForCheck();
  }

  // ========================================================================
  // Clickability + navigation (unchanged behavior)
  // ========================================================================

  public isNotificationClickable(notification: MJUserNotificationEntity): boolean {
    // Check for special types navigated via NavigationService (not a URL)
    if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
      const config = SafeJSONParse<AgentRequestResourceConfig>(notification.ResourceConfiguration);
      if (config && config.type?.trim().toLowerCase() === 'agent-request' && config.requestId) {
        return true;
      }
      const typeName = SafeJSONParse<{ type?: string }>(notification.ResourceConfiguration)?.type?.trim().toLowerCase();
      if (typeName === 'meet-room') {
        return true;
      }
    }

    const info = this.notificationUrl(notification);
    return (info !== null && info.urlParts && info.urlParts.length > 0);
  }

  public notificationUrl(notification: MJUserNotificationEntity): NotificationUrlInfo {
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

  public get AllNotifications(): MJUserNotificationEntity[] {
    return SharedService.UserNotifications;
  }

  public get UnreadNotifications(): MJUserNotificationEntity[] {
    return this.AllNotifications.filter(n => n.Unread);
  }

  public get ReadNotifications(): MJUserNotificationEntity[] {
    return this.AllNotifications.filter(n => !n.Unread);
  }

  selectReadOption(option: ReadFilterOption): void {
    this.radioSelected = option;
  }

  onFilterChanged(value: string): void {
    this.currentFilter = value;
  }

  async markAsRead(notification: MJUserNotificationEntity, bRead: boolean, transGroup: TransactionGroupBase | null): Promise<boolean> {
    if (notification) {
      const notificationId = notification.ID;
      notification.Unread = !bRead;
      let notificationEntity: MJUserNotificationEntity;
      if (notification instanceof MJUserNotificationEntity) {
        // the passed in param truly is a MJUserNotificationEntity or subclass, so just use it, saves a DB round trip
        notificationEntity = notification;
      }
      else {
        // the passed in param is just a plain object, so we need to load the entity
        const md = this.ProviderToUse;
        notificationEntity = await md.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications');
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
        // Save the notification (not part of transaction group)
        await notificationEntity.Save();
        // Update the observables so badge count refreshes immediately
        MJNotificationService.UpdateNotificationObservables();
        return true;
      }
    }
    else {
      return false;
    }
  }

  public async markAllAsRead() {
    await this.markAll(true);
  }

  public async markAllAsUnread() {
    await this.markAll(false);
  }

  public async markAll(bRead: boolean) {
    // Use transaction group for batching - all saves are queued and sent in one round-trip
    const md = this.ProviderToUse;
    const transGroup = await md.CreateTransactionGroup();

    // Queue all saves - no need to await individual saves since transaction group queues them
    for (const notification of this.AllNotifications) {
      if (notification.Unread && bRead || !notification.Unread && !bRead) {
        // Don't await - Save() with transaction group queues the operation immediately
        this.markAsRead(notification, bRead, transGroup);
      }
    }

    // Submit transaction group - this is where the actual network call happens
    if (!await transGroup.Submit())
      this.sharedService.CreateSimpleNotification('Unable to mark all notifications as read', 'error', 5000);
    else
      SharedService.RefreshUserNotifications();
  }

  notificationClicked(notification: MJUserNotificationEntity): void {
    if (this.isNotificationClickable(notification)) {
      // also mark this as read when we click it
      this.markAsRead(notification, true, null);

      // Check for special navigation types that use NavigationService (not router)
      if (this.navigateToAgentRequest(notification)) {
        return;
      }
      if (this.navigateToConversation(notification)) {
        return;
      }
      if (this.navigateToMeetRoom(notification)) {
        return;
      }

      this.navigateToResource(notification);
    }
  }

  /**
   * Opens the Meet app's Live Room in JOIN mode for a `meet-room` invite notification (the
   * `{ type:'meet-room', room }` ResourceConfiguration), mirroring {@link navigateToConversation}.
   * Returns `false` (not handled) when the config isn't a meet-room invite or the Meet app is absent.
   */
  private navigateToMeetRoom(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }
    const config = SafeJSONParse<{ type?: string; room?: string }>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'meet-room') {
      return false;
    }
    const meetApp = this.appManager.GetAppByName('Meet');
    if (!meetApp) {
      return false;
    }
    const navConfig: Record<string, string> = {};
    if (config.room) {
      navConfig['room'] = config.room;
    }
    this.navigationService.OpenNavItemByName('Live Room', navConfig, meetApp.ID);
    return true;
  }

  /**
   * Navigate to a resource-based notification using NavigationService methods.
   * Routes to the correct resource based on the notification's ResourceType.
   */
  private navigateToResource(notification: MJUserNotificationEntity): void {
    if (!notification.ResourceRecordID || !notification.ResourceTypeID) return;

    const rt = this.sharedService.ResourceTypeByID(notification.ResourceTypeID);
    if (!rt) return;

    const recordId = notification.ResourceRecordID.toString();
    const rtName = rt.Name.trim().toLowerCase();

    switch (rtName) {
      case 'records': {
        const config = SafeJSONParse<RecordResourceConfig>(notification.ResourceConfiguration || '');
        if (config?.Entity) {
          const key = new CompositeKey();
          key.SimpleLoadFromURLSegment(recordId);
          this.navigationService.OpenEntityRecord(config.Entity, key);
        }
        break;
      }
      case 'user views':
      case 'mj: user views':
        this.navigationService.OpenView(recordId, 'View');
        break;
      case 'dashboards':
        this.navigationService.OpenDashboard(recordId, 'Dashboard');
        break;
      case 'reports':
        this.navigationService.OpenReport(recordId, 'Report');
        break;
      default:
        console.warn(`[UserNotifications] Unhandled resource type for navigation: ${rt.Name}`);
        break;
    }
  }

  /**
   * Handle navigation to an agent request via NavigationService.
   * Returns true if the notification was an agent-request type and navigation was attempted.
   */
  private navigateToAgentRequest(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }

    const config = SafeJSONParse<AgentRequestResourceConfig>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'agent-request' || !config.requestId) {
      return false;
    }

    // Try the AI app first (has dedicated Agent Requests nav item)
    const aiApp = this.appManager.GetAppByName('AI');
    if (aiApp) {
      this.navigationService.OpenNavItemByName(
        'Agent Requests',
        { requestId: config.requestId },
        aiApp.ID
      );
      return true;
    }

    // Fallback: navigate to Chat app's Conversations with the request context
    const chatApp = this.appManager.GetAppByName('Chat');
    if (chatApp) {
      this.navigationService.OpenNavItemByName(
        'Conversations',
        { requestId: config.requestId },
        chatApp.ID
      );
      return true;
    }

    return false;
  }

  /**
   * Handle navigation to a conversation via NavigationService.
   * Returns true if the notification was a conversation type and navigation was attempted.
   */
  private navigateToConversation(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }

    const config = SafeJSONParse<ConversationResourceConfig>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'conversation') {
      return false;
    }

    const chatApp = this.appManager.GetAppByName('Chat');
    if (!chatApp) {
      return false;
    }

    const navConfig: Record<string, string> = {};
    if (config.conversationId) navConfig['conversationId'] = config.conversationId;
    if (config.messageId) navConfig['messageId'] = config.messageId;
    if (config.artifactId) navConfig['artifactId'] = config.artifactId;
    if (config.versionNumber) navConfig['versionNumber'] = config.versionNumber;
    if (config.taskId) navConfig['taskId'] = config.taskId;

    this.navigationService.OpenNavItemByName(
      'Conversations',
      navConfig,
      chatApp.ID
    );
    return true;
  }

  public getNotificationType(typeId: string | null): MJUserNotificationTypeEntity | null {
    if (!typeId) return null;
    return this.notificationTypes.find(t => UUIDsEqual(t.ID, typeId)) || null;
  }

  public getTypeIcon(notification: MJUserNotificationEntity): string {
    const type = this.getNotificationType(notification.NotificationTypeID);
    return type?.Icon || 'fa-bell';
  }

  public getTypeColor(notification: MJUserNotificationEntity): string {
    const type = this.getNotificationType(notification.NotificationTypeID);
    return type?.Color || 'var(--mj-text-muted)';
  }

  public getTypeName(notification: MJUserNotificationEntity): string {
    const type = this.getNotificationType(notification.NotificationTypeID);
    return type ? type.Name : 'Notification';
  }

  public onTypeFilterChange(typeId: string | null): void {
    this.selectedTypeFilter = typeId;
  }
}
