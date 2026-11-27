import { CompositeKey, IMetadataProvider, Metadata, TransactionGroupBase } from '@memberjunction/core';
import {
  MJUserNotificationEntity,
  MJUserNotificationTypeEntity,
  MJUserRoutineEntity,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { ApplicationManager, NavItem } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';

/** Configuration for record-type resource navigation. */
export interface RecordResourceConfig {
  Entity?: string;
}

/** Configuration for conversation-type resource navigation. */
export interface ConversationResourceConfig {
  type: 'conversation';
  conversationId?: string;
  messageId?: string;
  artifactId?: string;
  versionNumber?: string;
  taskId?: string;
}

/** Configuration for agent-request-type resource navigation. */
export interface AgentRequestResourceConfig {
  type: 'agent-request';
  requestId: string;
}

/** Configuration written by the User Routine dispatcher for a routine run. */
export interface UserRoutineResourceConfig {
  type: 'UserRoutine';
  routineId: string;
  runId?: string;
  conversationId?: string;
}

/** Result of parsing a notification URL. */
export interface NotificationUrlInfo {
  urlParts: string[];
  queryString: string;
}

/** Resolved display properties for a notification's type. */
export interface NotificationTypeDisplay {
  Icon: string;
  Color: string;
  Name: string;
}

/** Dependencies required to navigate to a notification target. */
export interface NotificationNavigationDeps {
  SharedService: SharedService;
  NavigationService: NavigationService;
  AppManager: ApplicationManager;
  Provider?: IMetadataProvider;
}

/** Compact "just now / 5m ago / 3h ago / 2d ago" label. Snapshot only — never call from templates (NG0100). */
export function FormatRelativeNotificationTime(value: Date | string | null | undefined): string {
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

/** Returns notification types from UserInfoEngine cache sorted by priority then name. */
export function GetSortedNotificationTypes(): MJUserNotificationTypeEntity[] {
  return [...UserInfoEngine.Instance.NotificationTypes].sort((a, b) => {
    const priorityA = a.Priority ?? 999;
    const priorityB = b.Priority ?? 999;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.Name.localeCompare(b.Name);
  });
}

/** Looks up the icon, color, and label for a notification's NotificationTypeID. */
export function GetNotificationTypeDisplay(
  typeId: string | null | undefined,
  types: readonly MJUserNotificationTypeEntity[]
): NotificationTypeDisplay {
  const type = typeId ? types.find(t => UUIDsEqual(t.ID, typeId)) ?? null : null;
  return {
    Icon: type?.Icon || 'fa-bell',
    Color: type?.Color || 'var(--mj-text-muted)',
    Name: type ? type.Name : 'Notification',
  };
}

/** Parses a UserRoutine notification ResourceConfiguration, or returns null when it is not one. */
export function ParseUserRoutineNotificationConfig(
  notification: MJUserNotificationEntity
): UserRoutineResourceConfig | null {
  if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
    return null;
  }
  const config = SafeJSONParse<UserRoutineResourceConfig>(notification.ResourceConfiguration);
  if (!config || config.type?.trim().toLowerCase() !== 'userroutine' || !config.routineId) {
    return null;
  }
  return config;
}

/** Parses a notification into its legacy route segments and query string when applicable. */
export function BuildNotificationUrl(
  notification: MJUserNotificationEntity,
  sharedService: SharedService | null | undefined
): NotificationUrlInfo {
  const url: string[] = [];
  let queryString = '';
  if (
    notification.ResourceRecordID &&
    notification.ResourceRecordID.length > 0 &&
    notification.ResourceTypeID &&
    notification.ResourceTypeID.length > 0
  ) {
    const rt = sharedService?.ResourceTypeByID(notification.ResourceTypeID);
    const routeSegment = rt ? sharedService?.mapResourceTypeNameToRouteSegment(rt.Name) : null;

    if (rt && routeSegment && routeSegment.trim().length > 0) {
      url.push('resource');
      url.push(routeSegment);
      url.push(notification.ResourceRecordID.toString());
      if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
        if (rt.Name.trim().toLowerCase() === 'records') {
          const config = SafeJSONParse<RecordResourceConfig>(notification.ResourceConfiguration);
          if (config && config.Entity) {
            queryString = `Entity=${config.Entity}`;
          }
        } else {
          queryString = notification.ResourceConfiguration;
        }
      }
    }
  } else if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
    const config = SafeJSONParse<ConversationResourceConfig>(notification.ResourceConfiguration);
    if (config && config.type?.trim().toLowerCase() === 'conversation') {
      url.push('chat');
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

/**
 * Returns true when clicking a notification can navigate to a destination in Explorer.
 * Covers every handler in {@link NavigateToNotificationTarget}, including agent-request,
 * meet-room, handoff-offer, meeting / meeting-invitation, UserRoutine, conversation,
 * and resource-based notifications.
 */
export function IsNotificationClickable(
  notification: MJUserNotificationEntity,
  sharedService: SharedService | null | undefined
): boolean {
  if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
    const config = SafeJSONParse<{ type?: string; requestId?: string }>(notification.ResourceConfiguration);
    const typeName = config?.type?.trim().toLowerCase();
    if (typeName === 'agent-request' && config?.requestId) {
      return true;
    }
    if (
      typeName === 'meet-room' ||
      typeName === 'handoff-offer' ||
      typeName === 'meeting' ||
      typeName === 'meeting-invitation'
    ) {
      return true;
    }
    if (ParseUserRoutineNotificationConfig(notification)) {
      return true;
    }
  }

  if (notification.NotificationType?.trim() === 'Meeting Invitation') {
    return true;
  }

  const info = BuildNotificationUrl(notification, sharedService);
  return info.urlParts.length > 0;
}

/** Persists a single notification's read/unread status (optionally queued in a TransactionGroup). */
export async function MarkNotificationAsRead(
  notification: MJUserNotificationEntity,
  bRead: boolean,
  transGroup: TransactionGroupBase | null,
  provider?: IMetadataProvider
): Promise<boolean> {
  if (!notification) {
    return false;
  }
  const notificationId = notification.ID;
  const previousUnread = notification.Unread;
  notification.Unread = !bRead;
  let notificationEntity: MJUserNotificationEntity;
  if (notification instanceof MJUserNotificationEntity) {
    notificationEntity = notification;
  } else {
    const md = provider ?? Metadata.Provider;
    notificationEntity = await md.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications');
    await notificationEntity.Load(notificationId);
    notificationEntity.Unread = !bRead;
  }

  if (transGroup) {
    notificationEntity.TransactionGroup = transGroup;
    await notificationEntity.Save();
    return true;
  }

  // Always detach any stale TransactionGroup left over from an earlier MarkAll batch so
  // this single-record Save() executes immediately rather than enqueuing into a completed group.
  notificationEntity.TransactionGroup = null;
  MJNotificationService.UpdateNotificationObservables();

  try {
    const saved = await notificationEntity.Save();
    if (!saved) {
      notification.Unread = previousUnread;
      if (notificationEntity !== notification) {
        notificationEntity.Unread = previousUnread;
      }
      MJNotificationService.UpdateNotificationObservables();
      return false;
    }
    MJNotificationService.UpdateNotificationObservables();
    return true;
  } catch (error) {
    notification.Unread = previousUnread;
    if (notificationEntity !== notification) {
      notificationEntity.Unread = previousUnread;
    }
    MJNotificationService.UpdateNotificationObservables();
    console.error('[UserNotifications] Failed to update notification read status:', error);
    return false;
  }
}

/**
 * Navigates to the destination described by a notification's ResourceType / ResourceConfiguration.
 * Does NOT mark the notification as read — callers handle read-state updates before or alongside navigation.
 */
export function NavigateToNotificationTarget(
  notification: MJUserNotificationEntity,
  deps: NotificationNavigationDeps
): boolean {
  if (navigateToAgentRequest(notification, deps)) return true;
  if (navigateToConversation(notification, deps)) return true;
  if (navigateToMeetRoom(notification, deps)) return true;
  if (navigateToUserRoutine(notification, deps)) return true;
  if (navigateToHandoffConsole(notification, deps)) return true;
  if (navigateToMeeting(notification, deps)) return true;
  return navigateToResource(notification, deps);
}

function navigateToMeetRoom(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
    return false;
  }
  const config = SafeJSONParse<{ type?: string; room?: string }>(notification.ResourceConfiguration);
  if (!config || config.type?.trim().toLowerCase() !== 'meet-room') {
    return false;
  }
  const meetApp = deps.AppManager.GetAppByName('Meet');
  if (!meetApp) {
    return false;
  }
  const navConfig: Record<string, string> = {};
  if (config.room) {
    navConfig['room'] = config.room;
  }
  deps.NavigationService.OpenNavItemByName('Live Room', navConfig, meetApp.ID);
  return true;
}

function navigateToHandoffConsole(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
    return false;
  }
  const config = SafeJSONParse<{ type?: string; offerId?: string }>(notification.ResourceConfiguration);
  if (!config || config.type?.trim().toLowerCase() !== 'handoff-offer') {
    return false;
  }
  const app = deps.AppManager.GetAppByName('Meet') ?? deps.AppManager.GetActiveApp();
  if (!app) {
    return false;
  }
  const consoleItem: NavItem = {
    Label: 'Conversation Console',
    Icon: 'fa-solid fa-headset',
    ResourceType: 'Custom',
    DriverClass: 'HumanHandoffConsoleResource',
    Configuration: config.offerId ? { offer: config.offerId } : {},
  };
  deps.NavigationService.OpenNavItem(app.ID, consoleItem, app.GetColor());
  return true;
}

function navigateToMeeting(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  let meetingId: string | undefined;
  let isMeetingConfig = false;
  if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
    const config = SafeJSONParse<{ type?: string; meetingId?: string }>(notification.ResourceConfiguration);
    const typeLower = config?.type?.trim().toLowerCase();
    if (typeLower === 'meeting' || typeLower === 'meeting-invitation') {
      isMeetingConfig = true;
      meetingId = config?.meetingId;
    }
  }
  const typeName = notification.NotificationType?.trim();
  if (!isMeetingConfig && typeName !== 'Meeting Invitation') {
    return false;
  }
  const app = deps.AppManager.GetAppByName('Meet') ?? deps.AppManager.GetActiveApp();
  if (!app) {
    return false;
  }
  const meetingItem: NavItem = {
    Label: 'Meetings',
    Icon: 'fa-solid fa-users',
    ResourceType: 'Custom',
    DriverClass: 'MeetingsResource',
    Configuration: meetingId ? { meeting: meetingId } : {},
  };
  deps.NavigationService.OpenNavItem(app.ID, meetingItem, app.GetColor());
  return true;
}

function navigateToResource(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  if (!notification.ResourceRecordID || !notification.ResourceTypeID) {
    return false;
  }
  const rt = deps.SharedService?.ResourceTypeByID(notification.ResourceTypeID);
  if (!rt) {
    return false;
  }
  const recordId = notification.ResourceRecordID.toString();
  const rtName = rt.Name.trim().toLowerCase();

  switch (rtName) {
    case 'records': {
      const config = SafeJSONParse<RecordResourceConfig>(notification.ResourceConfiguration || '');
      if (config?.Entity) {
        const key = new CompositeKey();
        key.SimpleLoadFromURLSegment(recordId);
        deps.NavigationService.OpenEntityRecord(config.Entity, key);
        return true;
      }
      return false;
    }
    case 'user views':
    case 'mj: user views':
      deps.NavigationService.OpenView(recordId, 'View');
      return true;
    case 'dashboards':
      deps.NavigationService.OpenDashboard(recordId, 'Dashboard');
      return true;
    default:
      console.warn(`[UserNotifications] Unhandled resource type for navigation: ${rt.Name}`);
      return false;
  }
}

function navigateToAgentRequest(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
    return false;
  }
  const config = SafeJSONParse<AgentRequestResourceConfig>(notification.ResourceConfiguration);
  if (!config || config.type?.trim().toLowerCase() !== 'agent-request' || !config.requestId) {
    return false;
  }
  const aiApp = deps.AppManager.GetAppByName('AI');
  if (aiApp) {
    deps.NavigationService.OpenNavItemByName('Agent Requests', { requestId: config.requestId }, aiApp.ID);
    return true;
  }
  const chatApp = deps.AppManager.GetAppByName('Chat');
  if (chatApp) {
    deps.NavigationService.OpenNavItemByName('Conversations', { requestId: config.requestId }, chatApp.ID);
    return true;
  }
  return false;
}

function navigateToConversation(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
    return false;
  }
  const config = SafeJSONParse<ConversationResourceConfig>(notification.ResourceConfiguration);
  if (!config || config.type?.trim().toLowerCase() !== 'conversation') {
    return false;
  }
  const chatApp = deps.AppManager.GetAppByName('Chat');
  if (!chatApp) {
    return false;
  }
  const navConfig: Record<string, string> = {};
  if (config.conversationId) navConfig['conversationId'] = config.conversationId;
  if (config.messageId) navConfig['messageId'] = config.messageId;
  if (config.artifactId) navConfig['artifactId'] = config.artifactId;
  if (config.versionNumber) navConfig['versionNumber'] = config.versionNumber;
  if (config.taskId) navConfig['taskId'] = config.taskId;

  deps.NavigationService.OpenNavItemByName('Conversations', navConfig, chatApp.ID, {
    queryParams: { ...navConfig },
  });
  return true;
}

function navigateToUserRoutine(notification: MJUserNotificationEntity, deps: NotificationNavigationDeps): boolean {
  const config = ParseUserRoutineNotificationConfig(notification);
  if (!config) {
    return false;
  }
  void openUserRoutineOutput(config, deps);
  return true;
}

async function openUserRoutineOutput(
  config: UserRoutineResourceConfig,
  deps: NotificationNavigationDeps
): Promise<void> {
  const conversationId = config.conversationId ?? (await loadRoutineConversationId(config.routineId, deps.Provider ?? Metadata.Provider));
  const chatApp = conversationId ? deps.AppManager.GetAppByName('Chat') : null;
  if (conversationId && chatApp) {
    await deps.NavigationService.OpenNavItemByName('Conversations', { conversationId }, chatApp.ID, {
      queryParams: { conversationId },
    });
    return;
  }
  const routinesApp = deps.AppManager.GetAppByName('Routines');
  if (routinesApp) {
    await deps.NavigationService.OpenNavItemByName('My Routines', { routine: config.routineId }, routinesApp.ID);
    return;
  }
  MJNotificationService.Instance.CreateSimpleNotification(
    'The Routines app is not installed, so this routine cannot be opened',
    'error',
    4000
  );
}

async function loadRoutineConversationId(
  routineId: string,
  provider: IMetadataProvider
): Promise<string | null> {
  const routine = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', provider.CurrentUser);
  if (!(await routine.Load(routineId))) {
    return null;
  }
  return routine.ConversationID ?? null;
}
