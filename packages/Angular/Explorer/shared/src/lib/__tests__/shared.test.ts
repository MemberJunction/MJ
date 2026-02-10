/**
 * Tests for shared package utilities:
 * - SimpleTextFormatPipe
 * - URLPipe
 * - TitleService
 * - EventCodes / HtmlListType constants
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular dependencies
vi.mock('@angular/core', () => ({
  Pipe: () => (target: Function) => target,
  PipeTransform: class {},
  Injectable: () => (target: Function) => target,
  Directive: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ElementRef: class {},
  OnInit: class {},
  OnDestroy: class {},
  Injector: class {},
}));

vi.mock('@angular/platform-browser', () => ({
  Title: class {
    private title = '';
    setTitle(t: string) { this.title = t; }
    getTitle() { return this.title; }
  }
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  CompositeKey: class {},
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  StartupManager: { Instance: { Startup: vi.fn() } },
  LocalCacheManager: class {},
  BaseEntity: class {},
  RunView: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourcePermissionEngine: { Instance: { ResourceTypes: [] } },
  UserInfoEngine: { Instance: { GetSetting: vi.fn(), SetSetting: vi.fn() } },
  ResourceTypeEntity: class {},
  UserNotificationEntity: class {},
  ArtifactMetadataEngine: { Instance: { Config: vi.fn() } },
  DashboardEngine: { Instance: { Config: vi.fn() } },
  ViewColumnInfo: class {},
  DashboardEntityExtended: class {},
  ResourceData: class {
    ResourceRecordID = '';
  },
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: { Instance: { GetEventListener: vi.fn(() => ({ subscribe: vi.fn() })) } },
  MJEventType: { LoggedIn: 'LoggedIn', ComponentEvent: 'ComponentEvent' },
  ConvertMarkdownStringToHtmlList: vi.fn((type: string, text: string) => `<${type}>${text}</${type}>`),
  InvokeManualResize: vi.fn(),
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: { Instance: { Config: vi.fn() } },
}));

vi.mock('@memberjunction/entity-communications-base', () => ({
  EntityCommunicationsEngineBase: { Instance: { Config: vi.fn() } },
}));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
}));

vi.mock('@progress/kendo-angular-notification', () => ({
  NotificationService: class {},
}));

vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: class {
    static UserNotifications: never[] = [];
    static UnreadUserNotifications: never[] = [];
    static UnreadUserNotificationCount = 0;
    static RefreshUserNotifications = vi.fn();
    CreateNotification = vi.fn();
    CreateSimpleNotification = vi.fn();
  },
}));

vi.mock('@memberjunction/ng-base-types', () => ({
  BaseAngularComponent: class {},
}));

vi.mock('@memberjunction/ng-base-application', () => ({
  WorkspaceStateManager: class {},
  ApplicationManager: class {
    GetActiveApp = vi.fn();
    GetAppByName = vi.fn();
    GetAppById = vi.fn();
  },
  NavItem: class {},
  TabRequest: class {},
}));

vi.mock('rxjs', async () => {
  const actual = await vi.importActual<typeof import('rxjs')>('rxjs');
  return actual;
});

// ======================= SimpleTextFormatPipe =======================
describe('SimpleTextFormatPipe', () => {
  let pipe: { transform(value: string): string };

  beforeEach(async () => {
    const mod = await import('../simpleTextFormat');
    pipe = new mod.SimpleTextFormatPipe();
  });

  it('should replace newlines with <br> tags', () => {
    expect(pipe.transform('hello\nworld')).toBe('hello<br>world');
  });

  it('should replace tabs with non-breaking spaces', () => {
    expect(pipe.transform('col1\tcol2')).toBe('col1&nbsp;&nbsp;&nbsp;&nbsp;col2');
  });

  it('should handle mixed newlines and tabs', () => {
    expect(pipe.transform('line1\n\tindented')).toBe('line1<br>&nbsp;&nbsp;&nbsp;&nbsp;indented');
  });

  it('should return falsy values as-is', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform(null as unknown as string)).toBeNull();
    expect(pipe.transform(undefined as unknown as string)).toBeUndefined();
  });

  it('should return plain text unchanged', () => {
    expect(pipe.transform('no special chars')).toBe('no special chars');
  });
});

// ======================= URLPipe =======================
describe('URLPipe', () => {
  let pipe: { transform(value: string): string };

  beforeEach(async () => {
    const mod = await import('../urlPipe');
    pipe = new mod.URLPipe();
  });

  it('should prepend https:// when no protocol is present', () => {
    expect(pipe.transform('example.com')).toBe('https://example.com');
  });

  it('should not modify URLs that already have http', () => {
    expect(pipe.transform('http://example.com')).toBe('http://example.com');
  });

  it('should not modify URLs that already have https', () => {
    expect(pipe.transform('https://example.com')).toBe('https://example.com');
  });

  it('should return falsy values as-is', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform(null as unknown as string)).toBeNull();
  });
});

// ======================= TitleService =======================
describe('TitleService', () => {
  let service: InstanceType<typeof import('../title.service').TitleService>;

  beforeEach(async () => {
    const mod = await import('../title.service');
    const { Title } = await import('@angular/platform-browser');
    service = new mod.TitleService(new Title(document));
  });

  it('should have default base title of MemberJunction', () => {
    expect(service.getBaseTitle()).toBe('MemberJunction');
  });

  it('should build title with base only when no context is set', () => {
    expect(service.getFullTitle()).toBe('MemberJunction');
  });

  it('should build title with app name', () => {
    service.setAppName('Sales');
    expect(service.getFullTitle()).toBe('Sales - MemberJunction');
  });

  it('should build title with resource name', () => {
    service.setResourceName('Contacts');
    expect(service.getFullTitle()).toBe('Contacts - MemberJunction');
  });

  it('should build title with both app and resource (resource first)', () => {
    service.setAppName('Sales');
    service.setResourceName('Contacts');
    expect(service.getFullTitle()).toBe('Contacts - Sales - MemberJunction');
  });

  it('should update base title', () => {
    service.setBaseTitle('Skip');
    expect(service.getFullTitle()).toBe('Skip');
  });

  it('should set context in one call', () => {
    service.setContext('Marketing', 'Campaigns');
    expect(service.getFullTitle()).toBe('Campaigns - Marketing - MemberJunction');
  });

  it('should reset to just base title', () => {
    service.setContext('Marketing', 'Campaigns');
    service.reset();
    expect(service.getFullTitle()).toBe('MemberJunction');
    expect(service.getAppName()).toBeNull();
    expect(service.getResourceName()).toBeNull();
  });

  it('should clear app name with null', () => {
    service.setAppName('Sales');
    service.setAppName(null);
    expect(service.getFullTitle()).toBe('MemberJunction');
  });
});

// ======================= EventCodes & HtmlListType =======================
describe('EventCodes', () => {
  it('should export expected event codes', async () => {
    const { EventCodes } = await import('../shared.service');
    expect(EventCodes.ViewClicked).toBe('ViewClicked');
    expect(EventCodes.EntityRecordClicked).toBe('EntityRecordClicked');
    expect(EventCodes.AddDashboard).toBe('AddDashboard');
    expect(EventCodes.RunSearch).toBe('RunSearch');
    expect(EventCodes.CloseCurrentTab).toBe('CloseCurrentTab');
    expect(EventCodes.AvatarUpdated).toBe('AvatarUpdated');
  });
});

describe('HtmlListType', () => {
  it('should export Unordered and Ordered list types', async () => {
    const { HtmlListType } = await import('../shared.service');
    expect(HtmlListType.Unordered).toBe('Unordered');
    expect(HtmlListType.Ordered).toBe('Ordered');
  });
});

// ======================= SharedService resource type mapping =======================
describe('SharedService resource type mapping', () => {
  it('should map resource type names to route segments', async () => {
    const { SharedService } = await import('../shared.service');
    // Construct with mocked dependencies
    const notif = { show: vi.fn() };
    const mjNotif = { CreateNotification: vi.fn(), CreateSimpleNotification: vi.fn() };
    const injector = { get: vi.fn() };
    const svc = new SharedService(notif as never, mjNotif as never, injector as never);

    expect(svc.mapResourceTypeNameToRouteSegment('Records')).toBe('record');
    expect(svc.mapResourceTypeNameToRouteSegment('User Views')).toBe('view');
    expect(svc.mapResourceTypeNameToRouteSegment('Dashboards')).toBe('dashboard');
    expect(svc.mapResourceTypeNameToRouteSegment('Reports')).toBe('report');
    expect(svc.mapResourceTypeNameToRouteSegment('Search Results')).toBe('search');
    expect(svc.mapResourceTypeNameToRouteSegment('Queries')).toBe('query');
    expect(svc.mapResourceTypeNameToRouteSegment('Lists')).toBe('list');
    expect(svc.mapResourceTypeNameToRouteSegment('Unknown')).toBeNull();
  });

  it('should map route segments to resource type names', async () => {
    const { SharedService } = await import('../shared.service');
    const notif = { show: vi.fn() };
    const mjNotif = { CreateNotification: vi.fn(), CreateSimpleNotification: vi.fn() };
    const injector = { get: vi.fn() };
    const svc = new SharedService(notif as never, mjNotif as never, injector as never);

    expect(svc.mapResourceTypeRouteSegmentToName('record')).toBe('records');
    expect(svc.mapResourceTypeRouteSegmentToName('view')).toBe('user views');
    expect(svc.mapResourceTypeRouteSegmentToName('dashboard')).toBe('dashboards');
    expect(svc.mapResourceTypeRouteSegmentToName('nonexistent')).toBeNull();
  });

  it('should be case-insensitive for resource type mapping', async () => {
    const { SharedService } = await import('../shared.service');
    const notif = { show: vi.fn() };
    const mjNotif = { CreateNotification: vi.fn(), CreateSimpleNotification: vi.fn() };
    const injector = { get: vi.fn() };
    const svc = new SharedService(notif as never, mjNotif as never, injector as never);

    expect(svc.mapResourceTypeNameToRouteSegment('RECORDS')).toBe('record');
    expect(svc.mapResourceTypeNameToRouteSegment('  Records  ')).toBe('record');
  });
});
