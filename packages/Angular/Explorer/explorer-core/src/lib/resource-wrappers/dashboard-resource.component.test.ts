import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { ChangeDetectorRef, ViewContainerRef } from '@angular/core';
import type { ResolvedLayoutConfig } from 'golden-layout';
import { LogError } from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import { SQLParser } from '@memberjunction/sql-parser';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import type { RecentAccessService } from '@memberjunction/ng-shared';
import type { DashboardUserPermissions, MJArtifactEntity, MJArtifactVersionEntity, MJDashboardEntity, ResourceData } from '@memberjunction/core-entities';
import type { DashboardNavRequestEvent, PanelConfig } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardSaveOverrides } from '@memberjunction/ng-dashboards/core-dashboards.module';
import type { DashboardStudioHost } from './dashboard-studio-tools';
import type { SourceKind } from './dashboard-source-search';

class MockEventEmitter<T = unknown> {
  private handlers: Array<(value: T) => void> = [];

  emit(value: T): void {
    for (const handler of this.handlers) {
      handler(value);
    }
  }

  subscribe(handler: (value: T) => void): { unsubscribe: () => void } {
    this.handlers.push(handler);
    return {
      unsubscribe: () => {
        this.handlers = this.handlers.filter(h => h !== handler);
      },
    };
  }
}

/**
 * Doubles the mocked modules hand out. `inject(token)` returns the double stored on the mocked
 * token class, so every injected service is its own object with its own methods.
 */
const doubles = vi.hoisted(() => ({
  recentAccess: { LogAccess: vi.fn(async () => undefined) },
  homePins: {
    IsPinned: vi.fn(() => false),
    LoadPins: vi.fn(async () => undefined),
    AddPin: vi.fn(() => true),
    FindPin: vi.fn(() => undefined),
    UpdatePin: vi.fn(),
    CaptureThumbnail: vi.fn(async () => undefined),
  },
  notify: vi.fn(),
  realtime: { IsActive: false, SendVideoFrame: vi.fn() },
  artifactPermissions: { GetReadableArtifactsFilter: vi.fn(async () => "(UserID='user-1')") },
  userViews: {
    Config: vi.fn(async () => undefined),
    IsPermissionConstrained: false,
    GetViewsForCurrentUser: vi.fn(() => []),
    GetSharedViews: vi.fn(() => []),
  },
  queries: { Config: vi.fn(async () => undefined), IsPermissionConstrained: false, Queries: [] },
  artifactTypes: { Config: vi.fn(async () => undefined) },
  userInfo: { GetSetting: vi.fn((_key: string): string | undefined => undefined), SetSettingDebounced: vi.fn() },
  resolveAgent: vi.fn(async () => ({ ID: 'agent-dashboards', Name: 'Dashboards Expert' })),
  componentMeta: new Map<Function, { template?: string }>(),
}));

vi.mock('@angular/core', () => ({
  Component: (meta: { template?: string }) => (target: Function) => {
    doubles.componentMeta.set(target, meta);
    return target;
  },
  Injectable: () => (target: Function) => target,
  HostListener: () => () => undefined,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  EventEmitter: MockEventEmitter,
  ElementRef: class {},
  ViewContainerRef: class {},
  ChangeDetectorRef: class {},
  inject: vi.fn((token: { double?: unknown } | undefined) => token?.double ?? {}),
}));

// The real dashboard pin builder, loaded on its own: the package index loads Angular code, and this file mocks @angular/core.
vi.mock('@memberjunction/ng-shared', async () => ({
  ...(await vi.importActual<typeof import('@memberjunction/ng-shared/dist/lib/dashboard-pin.js')>('@memberjunction/ng-shared/dist/lib/dashboard-pin.js')),
  BaseResourceComponent: class {
    Data: any = {};
    ProviderToUse = { CurrentUser: { ID: 'user-1' } };
    destroy$ = new Subject<void>();
    navigationService = {
      OpenDashboard: vi.fn(),
      OpenEntityRecord: vi.fn(),
      SetAgentContext: vi.fn(),
      SetAgentClientTools: vi.fn(),
      TakeDashboardEditModeRequest: vi.fn(() => false),
      DashboardEditModeRequested$: new Subject<string>(),
    };
    NotifyLoadStarted = vi.fn();
    NotifyLoadComplete = vi.fn();
    NotifyDisplayNameChanged = vi.fn();
    /** Like the real base class, it rewrites Data.ResourceRecordID to the URL-segment form. */
    ResourceRecordSaved = vi.fn((entity: { PrimaryKey: { ToURLSegment(): string } }) => {
      this.Data.ResourceRecordID = entity.PrimaryKey.ToURLSegment();
    });
    getTabId = vi.fn(() => 'host-tab-1');
  },
  NavigationService: class {},
  BaseDashboard: class {},
  DashboardConfig: class {},
  RecentAccessService: class { static double = doubles.recentAccess; },
  HomeAppPinService: class { static double = doubles.homePins; },
  SafeDetectChanges: (cdr: { markForCheck?: () => void; detectChanges?: () => void } | null) => {
    cdr?.markForCheck?.();
    cdr?.detectChanges?.();
  },
}));

vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: { Instance: { CreateSimpleNotification: doubles.notify } },
}));

vi.mock('@memberjunction/ng-conversations', () => ({
  RealtimeSessionService: class { static double = doubles.realtime; },
  ArtifactPermissionService: class { static double = doubles.artifactPermissions; },
}));

/**
 * The resolver of the AI pane's agent. The real package needs exports, such as BaseSingleton, that this
 * file's mocks of @memberjunction/global and @memberjunction/core do not give.
 */
vi.mock('@memberjunction/conversations-runtime', () => ({
  DefaultAgentResolver: class {
    static FALLBACK_AGENT_NAME = 'Sage';
    Resolve = doubles.resolveAgent;
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJDashboardEntity: class {},
  MJDashboardUserStateEntity: class {},
  DashboardEngine: {
    Instance: {
      Config: vi.fn(async () => undefined),
      Dashboards: [
        { ID: 'dash-code', Name: 'Code Dashboard', Type: 'Code' },
        { ID: 'dash-config', Name: 'Config Dashboard', Type: 'Config' },
        {
          ID: 'dash-saved',
          Name: 'Saved Dashboard',
          Type: 'Config',
          UIConfigDetails: JSON.stringify({ layout: { panels: [{ title: 'Tickets', partTypeId: 'pt-query', config: { type: 'Query' } }] } }),
        },
      ],
      DashboardCategories: [],
      DashboardPartTypes: [{ ID: 'pt-query', Name: 'Query', Icon: 'fa-solid fa-database' }],
      DataChange$: new Subject(),
      GetAccessibleDashboards: vi.fn(function (this: { Dashboards: unknown[] }) {
        return this.Dashboards;
      }),
      GetDashboardPermissions: vi.fn(() => ({
        DashboardID: 'dash-1',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner',
      })),
    },
  },
  UserViewEngine: { Instance: doubles.userViews },
  QueryEngine: { Instance: doubles.queries },
  ArtifactMetadataEngine: { Instance: doubles.artifactTypes },
  UserInfoEngine: { Instance: doubles.userInfo },
  MJEnvironmentEntityExtended: { DefaultEnvironmentID: 'env-default' },
}));

/** The real SQL string and UUID helpers, so the tests see the filters the tab builds. */
vi.mock('@memberjunction/global', async importOriginal => {
  const { EscapeSQLString, NormalizeUUID } = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    EscapeSQLString,
    NormalizeUUID,
    RegisterClass: () => (target: Function) => target,
    MJGlobal: {
      Instance: {
        ClassFactory: {
          GetRegistrationAsync: vi.fn(async () => ({ SubClass: class {} })),
        },
      },
    },
    SafeJSONParse: vi.fn((text: string) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }),
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => a === b,
  };
});

vi.mock('@memberjunction/core', () => ({
  Metadata: {},
  CompositeKey: class {
    static FromID(id: string) {
      return { KeyValuePairs: [{ FieldName: 'ID', Value: id }] };
    }
  },
  /** Like the real RunView, FromMetadataProvider runs views through the provider: here, its RunView and RunViews doubles. */
  RunView: class {
    static FromMetadataProvider(provider: object): object {
      return provider;
    }
  },
  LogError: vi.fn(),
}));

/**
 * The layout the viewer double hands to ExtractPanelsFromLayout carries its panels directly. The studio
 * tools read PANEL_PLACEMENTS when the tab builds them.
 */
vi.mock('@memberjunction/ng-dashboard-viewer', () => ({
  ExtractPanelsFromLayout: (layout: { panels?: unknown[] } | null) => layout?.panels ?? [],
  PANEL_PLACEMENTS: ['left', 'right', 'above', 'below', 'tab'],
}));

beforeEach(() => {
  doubles.notify.mockClear();
});

// ---------------------------------------------------------------------------
// Doubles for the tab: the editor, its viewer, the pins and the navigation
// ---------------------------------------------------------------------------

/** A fresh copy of the Config dashboard the tab tests open. */
function configDashboard(): MJDashboardEntity {
  return { ID: 'dash-config', Name: 'Config Dashboard', Type: 'Config' } as MJDashboardEntity;
}

type TestResource = InstanceType<typeof import('./dashboard-resource.component').DashboardResource>;

function pinsFake(added = true) {
  return {
    IsPinned: vi.fn((_type: string, _config: Record<string, unknown>) => false),
    LoadPins: vi.fn(async () => undefined),
    AddPin: vi.fn((_pin: Record<string, unknown>) => added),
    FindPin: vi.fn((_type: string, _config: Record<string, unknown>) => ({ Id: 'pin-1' })),
    UpdatePin: vi.fn(),
    CaptureThumbnail: vi.fn(async (_element: unknown) => 'data:image/jpeg;base64,thumb' as string | undefined),
  };
}

/** A viewer double: the editor's viewer, read and edited by the tab's agent tools. Its layout carries its panels. */
interface ViewerDouble {
  IsEditing?: boolean;
  HasUnsavedChanges: boolean;
  getConfig: () => { layout: { panels: unknown[] } } | null;
  GetPartTypes: () => Array<{ ID: string; Name: string; Icon: string }>;
  WaitForLayoutReady: ReturnType<typeof vi.fn>;
  layout: { panels: unknown[] };
}

function viewerDouble(panels: unknown[]): ViewerDouble {
  const layout = { panels };
  return {
    HasUnsavedChanges: false,
    getConfig: () => ({ layout }),
    GetPartTypes: () => [{ ID: 'pt-view', Name: 'View', Icon: 'fa-solid fa-table' }],
    WaitForLayoutReady: vi.fn(async () => undefined),
    layout,
  };
}

/** The permissions of a user who owns the dashboard. */
function ownerPermissions(): DashboardUserPermissions {
  return { DashboardID: 'dash-config', CanRead: true, CanEdit: true, CanDelete: true, CanShare: true, IsOwner: true, PermissionSource: 'owner' };
}

/**
 * An editor double: the members of <mj-dashboard-editor> that the tab reads and calls. It shows `dashboard` in
 * `viewer`. EnterEditMode, CancelEdit and Save change IsEditing as the editor does.
 */
function editorDouble(viewer: ViewerDouble | null, dashboard: MJDashboardEntity | null = configDashboard()) {
  const editor = {
    Dashboard: dashboard,
    Viewer: viewer,
    /** Stands for the element that holds the dashboard. */
    BodyElement: { className: 'dashboard-editor-body' },
    IsEditing: false,
    IsSaving: false,
    IsFavorite: false,
    Permissions: ownerPermissions(),
    EditingName: '',
    EditingDescription: '',
    get CanEdit(): boolean {
      return editor.Permissions.CanEdit;
    },
    get PartTypes(): Array<{ ID: string; Name: string; Icon: string }> {
      return editor.Viewer?.GetPartTypes() ?? [];
    },
    EnterEditMode: vi.fn((): boolean => {
      editor.IsEditing = editor.CanEdit;
      return editor.IsEditing;
    }),
    ToggleEditMode: vi.fn(),
    CancelEdit: vi.fn((): void => {
      editor.IsEditing = false;
    }),
    SaveDashboard: vi.fn(async (): Promise<void> => undefined),
    Save: vi.fn(async (_overrides?: DashboardSaveOverrides): Promise<string | null> => {
      editor.IsEditing = false;
      return null;
    }),
    OpenAddPartDialog: vi.fn(),
    RefreshPermissions: vi.fn(),
  };
  return editor;
}

type EditorDouble = ReturnType<typeof editorDouble>;

/** A NavigationService double with the members the tab uses for a Config dashboard. */
function navigationDouble() {
  return {
    OpenDashboard: vi.fn(),
    OpenQuery: vi.fn(),
    OpenEntityRecord: vi.fn(),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    TakeDashboardEditModeRequest: vi.fn((_tabId: string, _dashboardId: string, _applicationId: string) => false),
    DashboardEditModeRequested$: new Subject<string>(),
  };
}

/** A dashboard tab whose editor shows the Config dashboard, and doubles for everything it calls. */
async function configTab(options: { pins?: ReturnType<typeof pinsFake>; viewer?: ViewerDouble; editor?: EditorDouble | null } = {}) {
  const { DashboardResource } = await import('./dashboard-resource.component');
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  const resource = new DashboardResource({} as ViewContainerRef, cdr as unknown as ChangeDetectorRef);
  const internals = resource as unknown as Record<string, unknown>;
  const viewer = options.viewer ?? viewerDouble([]);
  const editor = options.editor === undefined ? editorDouble(viewer) : options.editor;
  const pins = options.pins ?? pinsFake();
  const navigation = navigationDouble();
  internals['homePins'] = pins;
  internals['navigationService'] = navigation;
  internals['containerElement'] = { nativeElement: { innerHTML: '', appendChild: vi.fn() } };
  internals['editor'] = editor ?? undefined;
  return { resource, internals, viewer, editor, pins, navigation, cdr };
}

/** The tab's load of its Config dashboard: it shows the dashboard in the editor, and the editor reports Loaded. */
function loadConfig(resource: TestResource): void {
  const dashboard = resource.ConfigDashboard ?? configDashboard();
  (resource as unknown as { showConfigDashboard(d: MJDashboardEntity): void }).showConfigDashboard(dashboard);
  resource.OnEditorLoaded(dashboard);
}

function lastContext(navigation: { SetAgentContext: ReturnType<typeof vi.fn> }): Record<string, unknown> | undefined {
  return navigation.SetAgentContext.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

type RegisteredTool = { Name: string; Handler: (params: Record<string, unknown>) => Promise<unknown> };

function registeredTools(navigation: { SetAgentClientTools: ReturnType<typeof vi.fn> }): RegisteredTool[] {
  return (navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? []) as RegisteredTool[];
}

describe('DashboardResource config dashboard loading', () => {
  it("shows a Config dashboard in the editor, and notifies load complete on the editor's Loaded and LoadFailed", async () => {
    const { resource, internals, navigation } = await configTab({ editor: null });
    const container = (internals['containerElement'] as { nativeElement: { innerHTML: string } }).nativeElement;
    container.innerHTML = 'old';
    const notifyLoadComplete = vi.spyOn(resource as unknown as { NotifyLoadComplete(): void }, 'NotifyLoadComplete');
    internals['Data'] = { ResourceRecordID: 'dash-config', Configuration: {} };

    await (resource as unknown as { loadDashboard(): Promise<void> }).loadDashboard();

    expect(resource.ConfigDashboardId).toBe('dash-config');
    expect(container.innerHTML).toBe('');
    expect(notifyLoadComplete).not.toHaveBeenCalled();
    expect(navigation.TakeDashboardEditModeRequest).not.toHaveBeenCalled();

    resource.OnEditorLoaded(configDashboard());

    expect(notifyLoadComplete).toHaveBeenCalledTimes(1);
    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith('host-tab-1', 'dash-config', '');
    expect(resource.errorMessage).toBeNull();

    resource.OnEditorLoadFailed({ DashboardId: 'dash-config', Message: 'The layout could not be built' });

    expect(notifyLoadComplete).toHaveBeenCalledTimes(2);
    expect(resource.errorMessage).toBe('The dashboard "Config Dashboard" could not be loaded. There may be an issue with the dashboard configuration.');
    expect(resource.ErrorDetails).toBe('The layout could not be built');
  });
});

/**
 * A code dashboard resolved through ClassFactory gets no ResourceData of its own, so its only
 * possible tab identity is the one this host hands it. Without it the child has NO tab id — which
 * used to mean every query-param write it made landed in whichever tab the user was looking at,
 * silently destroying that tab's deep link from a background tab.
 */
describe('DashboardResource tab scoping of child dashboards', () => {
  it('gives the ClassFactory-resolved dashboard this tab id, before awaiting user state', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');

    const dashboardInstance = {
      Error: new MockEventEmitter<Error>(),
      OpenEntityRecord: new MockEventEmitter(),
      UserStateChanged: new MockEventEmitter(),
      LoadCompleteEvent: null as (() => void) | null,
      ParentTabId: null as string | null,
      Config: null as unknown,
      Refresh: vi.fn(),
    };

    const viewContainer = {
      createComponent: vi.fn(() => ({
        instance: dashboardInstance,
        hostView: { rootNodes: [{ style: {} }] },
      })),
    };

    const resource = new DashboardResource(
      viewContainer as any,
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as any,
    ) as any;

    resource.containerElement = {
      nativeElement: { innerHTML: 'old', appendChild: vi.fn() },
    };
    resource.navigationService = { OpenEntityRecord: vi.fn() };

    // Hold the user-state load open: Angular can run the child's ngOnInit (which binds its
    // query-param subscription) inside this window, so the tab id must already be set.
    let releaseUserState!: () => void;
    resource.loadDashboardUserState = vi.fn(
      () => new Promise(resolve => {
        releaseUserState = () => resolve({ UserState: null });
      }),
    );

    const loadPromise = resource.loadCodeBasedDashboard({
      ID: 'dash-1',
      Name: 'Studio Dashboard',
      DriverClass: 'StudioDashboard',
    });

    await Promise.resolve();

    expect(dashboardInstance.ParentTabId).toBe('host-tab-1');

    releaseUserState();
    await loadPromise;

    expect(dashboardInstance.ParentTabId).toBe('host-tab-1');
  });
});

describe('DashboardResource code-based dashboard error surfacing', () => {
  /**
   * BaseDashboard guarantees the loading screen is released when initDashboard()/loadData() throws
   * — it logs, emits its `Error` output, then fires NotifyLoadComplete() in a finally. The host must
   * LISTEN to that output, otherwise the spinner clears to a silent blank page and the user is told
   * nothing. This asserts the host renders its error card, and that the subscription is wired
   * BEFORE the first await in the load path (so an Error emitted during the dashboard's own
   * ngOnInit — which Angular can run while the host awaits user state — is not missed).
   */
  it('surfaces a dashboard Error emitted while the host is still awaiting user state', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');

    const dashboardInstance = {
      Error: new MockEventEmitter<Error>(),
      OpenEntityRecord: new MockEventEmitter(),
      UserStateChanged: new MockEventEmitter(),
      LoadCompleteEvent: null as (() => void) | null,
      Config: null as unknown,
      Refresh: vi.fn(),
    };

    const viewContainer = {
      createComponent: vi.fn(() => ({
        instance: dashboardInstance,
        hostView: { rootNodes: [{ style: {} }] },
      })),
    };

    const markForCheck = vi.fn();
    const resource = new DashboardResource(
      viewContainer as any,
      { detectChanges: vi.fn(), markForCheck } as any,
    ) as any;

    resource.containerElement = {
      nativeElement: { innerHTML: 'old', appendChild: vi.fn() },
    };
    resource.navigationService = { OpenEntityRecord: vi.fn() };

    // Hold the user-state load open so we can emit Error from inside that window.
    let releaseUserState!: () => void;
    resource.loadDashboardUserState = vi.fn(
      () => new Promise(resolve => {
        releaseUserState = () => resolve({ UserState: null });
      }),
    );

    const loadPromise = resource.loadCodeBasedDashboard({
      ID: 'dash-1',
      Name: 'Broken Dashboard',
      DriverClass: 'BrokenDashboard',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(resource.errorMessage).toBeNull();

    // The dashboard's guarded load failed while the host was still awaiting user state.
    dashboardInstance.Error.emit(new Error('loadData blew up'));

    expect(resource.errorMessage).toContain('Broken Dashboard');
    expect(resource.errorDetails).toContain('loadData blew up');
    expect(markForCheck).toHaveBeenCalled();

    releaseUserState();
    await loadPromise;
  });

  /**
   * Once the initial load has SETTLED (the dashboard signalled LoadCompleteEvent), a later Error —
   * e.g. a refresh button inside the dashboard whose Refresh() fails — must NOT replace the
   * already-rendered dashboard with a sticky error card. The host scopes the error card to the
   * initial load; this pins that so a future dashboard with a post-mount refresh can't regress it.
   * (Fails without the initialLoadSettled scoping in loadCodeBasedDashboard/loadDataExplorer.)
   */
  it('does NOT blank an already-rendered dashboard when a post-mount Refresh() emits Error', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');

    const dashboardInstance = {
      Error: new MockEventEmitter<Error>(),
      OpenEntityRecord: new MockEventEmitter(),
      UserStateChanged: new MockEventEmitter(),
      LoadCompleteEvent: null as (() => void) | null,
      Config: null as unknown,
      Refresh: vi.fn(),
    };

    const viewContainer = {
      createComponent: vi.fn(() => ({
        instance: dashboardInstance,
        hostView: { rootNodes: [{ style: {} }] },
      })),
    };

    const markForCheck = vi.fn();
    const resource = new DashboardResource(
      viewContainer as any,
      { detectChanges: vi.fn(), markForCheck } as any,
    ) as any;

    resource.containerElement = {
      nativeElement: { innerHTML: 'old', appendChild: vi.fn() },
    };
    resource.navigationService = { OpenEntityRecord: vi.fn() };
    resource.loadDashboardUserState = vi.fn(async () => ({ UserState: null }));

    // Drive the initial load to completion, then let the dashboard signal it is ready.
    await resource.loadCodeBasedDashboard({
      ID: 'dash-1',
      Name: 'Rendered Dashboard',
      DriverClass: 'RenderedDashboard',
    });
    expect(dashboardInstance.LoadCompleteEvent).toBeTypeOf('function');

    // Wrapping the completion hook must not swallow it — the shell still gets its release signal.
    const notifyLoadComplete = vi.spyOn(resource, 'NotifyLoadComplete');
    dashboardInstance.LoadCompleteEvent!(); // initial load has now SETTLED
    expect(notifyLoadComplete).toHaveBeenCalledTimes(1);
    expect(resource.errorMessage).toBeNull();

    markForCheck.mockClear();

    // A post-mount Refresh() inside the dashboard fails and emits Error.
    dashboardInstance.Error.emit(new Error('refresh blew up'));

    // The rendered dashboard is preserved — no error card, no repaint into one.
    expect(resource.errorMessage).toBeNull();
    expect(resource.errorDetails).toBeNull();
    expect(markForCheck).not.toHaveBeenCalled();
  });
});

/** Recents find dashboards by the `MJ: Dashboards` entity and the `dashboard` resource type. */
describe('DashboardResource recent access logging', () => {
  it.each([
    { type: 'Code', dashboardId: 'dash-code' },
    { type: 'Config', dashboardId: 'dash-config' },
  ])('logs opening a $type dashboard as MJ: Dashboards access', async ({ dashboardId }) => {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const resource = new DashboardResource({} as ViewContainerRef, {} as ChangeDetectorRef);
    const internals = resource as unknown as Record<string, unknown>;
    const logAccess = vi.fn<RecentAccessService['LogAccess']>(async () => undefined);
    internals['recentAccess'] = { LogAccess: logAccess };
    internals['loadCodeBasedDashboard'] = vi.fn(async () => undefined);
    internals['showConfigDashboard'] = vi.fn();
    internals['Data'] = { ResourceRecordID: dashboardId, Configuration: {} };

    await (resource as unknown as { loadDashboard(): Promise<void> }).loadDashboard();

    expect(logAccess).toHaveBeenCalledExactlyOnceWith('MJ: Dashboards', dashboardId, 'dashboard');
  });

  it('injects its own double for each service', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const internals = new DashboardResource({} as ViewContainerRef, {} as ChangeDetectorRef) as unknown as Record<string, unknown>;

    expect(internals['recentAccess']).toBe(doubles.recentAccess);
    expect(internals['homePins']).toBe(doubles.homePins);
    expect(internals['realtimeSession']).toBe(doubles.realtime);
    expect(internals['artifactPermissions']).toBe(doubles.artifactPermissions);
  });
});

// ---------------------------------------------------------------------------
// Pin, Add to menu, Share, agent awareness and tab title
// ---------------------------------------------------------------------------

describe('DashboardResource pin and Add to menu', () => {
  it('reads the pin flag for the dashboard the editor shows', async () => {
    const pins = pinsFake();
    pins.IsPinned.mockReturnValue(true);
    const { resource } = await configTab({ pins });

    expect(resource.IsPinnedToHome).toBe(true);
    expect(pins.IsPinned).toHaveBeenCalledWith('Dashboards', { dashboardId: 'dash-config' });
  });

  it('reads the pin flag as false without a Config dashboard or when the pins cannot be read', async () => {
    const pins = pinsFake();
    pins.IsPinned.mockImplementation(() => {
      throw new Error('PermissionConstrainedError');
    });
    const { resource, editor } = await configTab({ pins });

    expect(resource.IsPinnedToHome).toBe(false);
    pins.IsPinned.mockReturnValue(true);
    editor!.Dashboard = null;
    expect(resource.IsPinnedToHome).toBe(false);
  });

  it("pins the dashboard card after loading the pins, then attaches a thumbnail of the editor's body", async () => {
    const pins = pinsFake(true);
    const { resource, editor } = await configTab({ pins });

    await resource.PinToHome();

    expect(pins.LoadPins.mock.invocationCallOrder[0]).toBeLessThan(pins.AddPin.mock.invocationCallOrder[0]);
    expect(pins.AddPin).toHaveBeenCalledWith({
      DisplayName: 'Config Dashboard',
      ResourceType: 'Dashboards',
      Icon: 'fa-solid fa-gauge-high',
      Configuration: { resourceType: 'Dashboards', dashboardId: 'dash-config', recordId: 'dash-config' },
    });
    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Pinned "Config Dashboard" to Home', 'success', 2000);
    await vi.waitFor(() => expect(pins.UpdatePin).toHaveBeenCalledWith('pin-1', { Thumbnail: 'data:image/jpeg;base64,thumb' }));
    expect(pins.CaptureThumbnail).toHaveBeenCalledWith(editor!.BodyElement);
    expect(pins.FindPin).toHaveBeenCalledWith('Dashboards', { dashboardId: 'dash-config' });
  });

  it('keeps the pin without a thumbnail when capture fails', async () => {
    const pins = pinsFake(true);
    pins.CaptureThumbnail.mockResolvedValue(undefined);
    const { resource } = await configTab({ pins });

    await resource.PinToHome();
    await vi.waitFor(() => expect(pins.CaptureThumbnail).toHaveBeenCalled());
    await Promise.resolve();

    expect(pins.UpdatePin).not.toHaveBeenCalled();
  });

  it('logs a failure to attach the thumbnail instead of rejecting, and keeps the pin', async () => {
    const pins = pinsFake(true);
    pins.UpdatePin.mockImplementation(() => {
      throw new Error('storage full');
    });
    const { resource } = await configTab({ pins });

    await resource.PinToHome();

    await vi.waitFor(() => expect(LogError).toHaveBeenCalledWith('Dashboard tab: could not add a thumbnail to the Home pin: storage full'));
    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Pinned "Config Dashboard" to Home', 'success', 2000);
  });

  it('says so when the dashboard is already pinned', async () => {
    const pins = pinsFake(false);
    const { resource } = await configTab({ pins });

    await resource.PinToHome();

    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('"Config Dashboard" is already pinned to Home', 'info', 2000);
    expect(pins.CaptureThumbnail).not.toHaveBeenCalled();
  });

  it("reports the placement the editor shows to the agent after the editor's FavoriteChange", async () => {
    const { resource, editor, navigation } = await configTab();
    loadConfig(resource);

    editor!.IsFavorite = true;
    resource.OnEditorFavoriteChange();

    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardId: 'dash-config', IsFavorite: true, IsPinnedToHome: false });
  });

  it('pins nothing without a Config dashboard', async () => {
    const { resource, pins } = await configTab({ editor: null });

    await resource.PinToHome();

    expect(pins.AddPin).not.toHaveBeenCalled();
    expect(doubles.notify).not.toHaveBeenCalled();
  });
});

describe("DashboardResource buttons in the editor's header", () => {
  /** The tab's template. */
  async function template(): Promise<string> {
    const { DashboardResource } = await import('./dashboard-resource.component');
    return doubles.componentMeta.get(DashboardResource)?.template ?? '';
  }

  /** The element of the tab's template that starts with `start`, up to `end`. */
  function slice(text: string, start: string, end: string): string {
    const from = text.indexOf(start);
    return from < 0 ? '' : text.slice(from, text.indexOf(end, from));
  }

  it('puts the Add to menu and Share in the view actions of the editor, with Share limited to users who can share', async () => {
    const editor = slice(await template(), '<mj-dashboard-editor', '</mj-dashboard-editor>');
    const viewActions = slice(editor, '<span viewActions', '</span>');
    const menu = slice(viewActions, '<mj-dashboard-add-to-menu', '</mj-dashboard-add-to-menu>');

    expect(menu).toMatch(/\[IsPinned\]="IsPinnedToHome"/);
    expect(menu).toMatch(/\[CanShare\]="CanShare"/);
    expect(menu).toMatch(/\(PinToHome\)="PinToHome\(\)"/);
    expect(menu).toMatch(/\(Share\)="OpenShareDialog\(\)"/);
    expect(menu).not.toMatch(/HomeTab/);
    expect(viewActions).toMatch(/@if \(CanShare\)/);
    expect(viewActions).toMatch(/class="dashboard-tab-share"[\s\S]*\(click\)="OpenShareDialog\(\)"/);
  });

  it('puts the AI toggle in the header tools of the editor', async () => {
    const editor = slice(await template(), '<mj-dashboard-editor', '</mj-dashboard-editor>');
    const toggle = slice(editor, '<button', '</button>');

    expect(toggle).toMatch(/headerTools/);
    expect(toggle).toMatch(/class="dashboard-tab-ai-toggle"/);
    expect(toggle).toMatch(/\(click\)="ToggleChat\(\)"/);
  });

  it('reads Share from the permissions the editor holds', async () => {
    const { resource, editor } = await configTab();

    expect(resource.CanShare).toBe(true);
    editor!.Permissions = { ...ownerPermissions(), CanShare: false };
    expect(resource.CanShare).toBe(false);
  });

  it('opens the share dialog when Share is picked', async () => {
    const { resource, cdr } = await configTab();

    resource.OpenShareDialog();

    expect(resource.ShowShareDialog).toBe(true);
    expect(cdr.detectChanges).toHaveBeenCalled();
  });

  it("refreshes the editor's permissions when the share dialog saves, and reports the dashboard again", async () => {
    const { resource, editor, navigation } = await configTab();
    loadConfig(resource);
    resource.OpenShareDialog();
    const reports = navigation.SetAgentContext.mock.calls.length;

    resource.OnShareDialogResult({ Action: 'cancel' });

    expect(resource.ShowShareDialog).toBe(false);
    expect(editor!.RefreshPermissions).not.toHaveBeenCalled();
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports);

    resource.OnShareDialogResult({ Action: 'save' });

    expect(editor!.RefreshPermissions).toHaveBeenCalledTimes(1);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports + 1);
  });
});

describe('DashboardResource dashboard links', () => {
  it('opens a dashboard that a panel links to without forcing a new tab, so it replaces the preview tab', async () => {
    const { resource, navigation } = await configTab();

    resource.OnEditorNavigationRequested({ request: { type: 'OpenDashboard', dashboardId: 'dash-code' } } as unknown as DashboardNavRequestEvent);

    expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith('dash-code', 'Code Dashboard');
  });
});

describe('DashboardResource agent awareness', () => {
  const revenuePanel = { id: 'panel-1', title: 'Revenue', partTypeId: 'pt-view', config: { type: 'View' } };

  it('reports a Config dashboard and registers its tools once the editor has loaded it', async () => {
    const { resource, editor, navigation } = await configTab({ viewer: viewerDouble([revenuePanel]) });

    (resource as unknown as { showConfigDashboard(d: MJDashboardEntity): void }).showConfigDashboard(configDashboard());
    // Golden Layout settling, and an edit-mode request taken on the load, before the tools are registered.
    resource.OnEditorConfigChanged();
    editor!.IsEditing = true;
    resource.OnEditorEditingChange();
    editor!.IsEditing = false;
    expect(navigation.SetAgentContext).not.toHaveBeenCalled();
    expect(navigation.SetAgentClientTools).not.toHaveBeenCalled();

    resource.OnEditorLoaded(configDashboard());

    expect(navigation.SetAgentClientTools).toHaveBeenCalledTimes(1);
    expect(registeredTools(navigation).map(t => t.Name)).toEqual([
      'GetDashboardPanels',
      'GetDashboardDetail',
      'GetDashboardState',
      'AddPanel',
      'RemovePanel',
      'MovePanel',
      'ResizePanel',
      'UpdatePanelSettings',
      'GetDashboardScreenshot',
      'RequestSaveDashboard',
      'RequestPinToHome',
      'SearchSources',
    ]);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(lastContext(navigation)).toEqual({
      OpenedDashboardId: 'dash-config',
      OpenedDashboardName: 'Config Dashboard',
      OpenedDashboardType: 'Config',
      OpenedDashboardIsEditing: false,
      OpenedDashboardCanEdit: true,
      OpenedDashboardPanelCount: 1,
      OpenedDashboardPanels: [{ Id: 'panel-1', Title: 'Revenue', PartTypeName: 'View', Icon: 'fa-solid fa-table' }],
      IsFavorite: false,
      IsPinnedToHome: false,
    });
  });

  it('answers the panel and detail tools from the open tab', async () => {
    const { resource, navigation } = await configTab({ viewer: viewerDouble([revenuePanel]) });
    loadConfig(resource);
    const [panelsTool, detailTool] = registeredTools(navigation);

    await expect(panelsTool.Handler({})).resolves.toEqual({
      Success: true,
      Data: {
        DashboardId: 'dash-config',
        DashboardName: 'Config Dashboard',
        PanelCount: 1,
        Panels: [{ Id: 'panel-1', Title: 'Revenue', PartTypeName: 'View', Icon: 'fa-solid fa-table' }],
      },
    });
    await expect(panelsTool.Handler({ dashboardId: 'Saved Dashboard' })).resolves.toMatchObject({
      Success: true,
      Data: { DashboardId: 'dash-saved', PanelCount: 1, Panels: [{ Title: 'Tickets', PartTypeName: 'Query', Icon: 'fa-solid fa-database' }] },
    });
    await expect(detailTool.Handler({})).resolves.toMatchObject({
      Success: true,
      Data: { DashboardId: 'dash-config', Access: { CanEdit: true, IsOwner: true } },
    });
  });

  it("reports again when the editor's panels change, not when the layout only moves", async () => {
    const viewer = viewerDouble([revenuePanel]);
    const { resource, navigation } = await configTab({ viewer });
    loadConfig(resource);
    navigation.SetAgentContext.mockClear();

    resource.OnEditorConfigChanged();
    expect(navigation.SetAgentContext).not.toHaveBeenCalled();

    viewer.layout.panels.push({ title: 'Churn', partTypeId: 'pt-view', config: { type: 'View' } });
    resource.OnEditorConfigChanged();
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardPanelCount: 2 });
  });

  it('reports edit mode as the editor enters and leaves it', async () => {
    const { resource, editor, navigation } = await configTab({ viewer: viewerDouble([revenuePanel]) });
    loadConfig(resource);

    editor!.IsEditing = true;
    resource.OnEditorEditingChange();
    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: true });

    editor!.IsEditing = false;
    resource.OnEditorEditingChange();
    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: false });
  });

  it('leaves agent context to a Code dashboard, which reports its own', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const child = {
      Error: new MockEventEmitter<Error>(),
      OpenEntityRecord: new MockEventEmitter(),
      UserStateChanged: new MockEventEmitter(),
      LoadCompleteEvent: null as (() => void) | null,
      ParentTabId: null as string | null,
      Config: null as unknown,
      Refresh: vi.fn(),
    };
    const viewContainer = { createComponent: vi.fn(() => ({ instance: child, hostView: { rootNodes: [{ style: {} }] } })) };
    const resource = new DashboardResource(viewContainer as unknown as ViewContainerRef, { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef);
    const internals = resource as unknown as Record<string, unknown>;
    const navigation = { OpenEntityRecord: vi.fn(), SetAgentContext: vi.fn(), SetAgentClientTools: vi.fn() };
    internals['navigationService'] = navigation;
    internals['containerElement'] = { nativeElement: { innerHTML: '', appendChild: vi.fn() } };
    internals['loadDashboardUserState'] = vi.fn(async () => ({ UserState: null }));

    await (resource as unknown as { loadCodeBasedDashboard(d: object): Promise<void> }).loadCodeBasedDashboard({
      ID: 'dash-code', Name: 'Code Dashboard', Type: 'Code', DriverClass: 'CodeDashboard',
    });
    child.LoadCompleteEvent?.();

    expect(navigation.SetAgentContext).not.toHaveBeenCalled();
    expect(navigation.SetAgentClientTools).not.toHaveBeenCalled();
  });
});

describe('DashboardResource tab title on a saved rename', () => {
  type SaveHooks = { NotifyDisplayNameChanged: ReturnType<typeof vi.fn>; ResourceRecordSaved: ReturnType<typeof vi.fn> };

  it("gives the tab the editor's saved name and keeps the tab on its dashboard id", async () => {
    const { resource, internals } = await configTab();
    loadConfig(resource);
    internals['Data'] = { ResourceRecordID: 'dash-config', Configuration: {} };
    const hooks = resource as unknown as SaveHooks;

    resource.OnEditorNameChanged('Renamed Board');

    expect(hooks.NotifyDisplayNameChanged).toHaveBeenCalledWith('Renamed Board');
    // ResourceRecordSaved rewrites this component's Data.ResourceRecordID to the URL-segment form
    // ('ID|dash-config'), while the tab configuration keeps the bare id.
    expect(hooks.ResourceRecordSaved).not.toHaveBeenCalled();
    expect(resource.Data.ResourceRecordID).toBe('dash-config');
  });

  it('keeps the tab title for an empty name', async () => {
    const { resource } = await configTab();
    const hooks = resource as unknown as SaveHooks;

    resource.OnEditorNameChanged('');

    expect(hooks.NotifyDisplayNameChanged).not.toHaveBeenCalled();
  });
});

describe('DashboardResource tab title', () => {
  async function titleFor(data: Partial<ResourceData>, getEntityRecordName = vi.fn(async () => 'Server Name')) {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const resource = new DashboardResource({} as ViewContainerRef, {} as ChangeDetectorRef);
    (resource as unknown as Record<string, unknown>)['ProviderToUse'] = { CurrentUser: { ID: 'user-1' }, GetEntityRecordName: getEntityRecordName };
    const title = await resource.GetResourceDisplayName(data as ResourceData);
    return { title, getEntityRecordName };
  }

  it('names the tab after the dashboard in the DashboardEngine cache', async () => {
    const { title, getEntityRecordName } = await titleFor({ ResourceRecordID: 'dash-config', Configuration: {} });

    expect(title).toBe('Config Dashboard');
    expect(getEntityRecordName).not.toHaveBeenCalled();
  });

  it('asks the server for the MJ: Dashboards record name when the cache does not have it', async () => {
    const { title, getEntityRecordName } = await titleFor({ ResourceRecordID: 'dash-new', Configuration: {} });

    expect(title).toBe('Server Name');
    expect(getEntityRecordName).toHaveBeenCalledWith('MJ: Dashboards', { KeyValuePairs: [{ FieldName: 'ID', Value: 'dash-new' }] });
  });

  it('keeps a Data Explorer tab on its app name without a lookup', async () => {
    const { title, getEntityRecordName } = await titleFor({
      ResourceRecordID: 'DataExplorer',
      Configuration: { dashboardType: 'DataExplorer', appName: 'CRM' },
    });

    expect(title).toBe('CRM');
    expect(getEntityRecordName).not.toHaveBeenCalled();
  });

  it('falls back to the given name, then to Dashboard, when the name cannot be read', async () => {
    const failing = vi.fn(async () => {
      throw new Error('not found');
    });

    expect((await titleFor({ ResourceRecordID: 'dash-new', Configuration: {}, Name: 'Saved title' }, failing)).title).toBe('Saved title');
    expect((await titleFor({ ResourceRecordID: 'dash-new', Configuration: {} }, failing)).title).toBe('Dashboard');
  });
});

describe('DashboardResource members the editor owns', () => {
  it('delegates the edit members of earlier versions to the editor', async () => {
    const { resource, editor } = await configTab();
    const tab = resource as unknown as {
      ToggleEditMode(): void;
      toggleEditMode(): void;
      CancelEdit(): void;
      cancelEdit(): void;
      SaveDashboard(): Promise<void>;
      saveDashboard(): Promise<void>;
      OpenAddPartDialog(): void;
      openAddPartDialog(): void;
      EditingName: string;
      editingDescription: string;
    };

    tab.ToggleEditMode();
    tab.toggleEditMode();
    tab.CancelEdit();
    tab.cancelEdit();
    await tab.SaveDashboard();
    await tab.saveDashboard();
    tab.OpenAddPartDialog();
    tab.openAddPartDialog();
    tab.EditingName = 'Pipeline';
    tab.editingDescription = 'Open deals';

    expect(editor!.ToggleEditMode).toHaveBeenCalledTimes(2);
    expect(editor!.CancelEdit).toHaveBeenCalledTimes(2);
    expect(editor!.SaveDashboard).toHaveBeenCalledTimes(2);
    expect(editor!.OpenAddPartDialog).toHaveBeenCalledTimes(2);
    expect(editor!.EditingName).toBe('Pipeline');
    expect(editor!.EditingDescription).toBe('Open deals');
  });

  it('reads the dashboard, edit mode, fields and permissions from the editor', async () => {
    const { resource, editor } = await configTab();
    editor!.IsEditing = true;
    editor!.EditingName = 'Pipeline';
    editor!.EditingDescription = 'Open deals';

    expect(resource.ConfigDashboard).toBe(editor!.Dashboard);
    expect(resource.configDashboard).toBe(editor!.Dashboard);
    expect(resource.IsEditMode).toBe(true);
    expect(resource.isEditMode).toBe(true);
    expect(resource.EditingName).toBe('Pipeline');
    expect(resource.editingName).toBe('Pipeline');
    expect(resource.EditingDescription).toBe('Open deals');
    expect(resource.DashboardPermissions).toBe(editor!.Permissions);
    expect(resource.dashboardPermissions).toBe(editor!.Permissions);
  });

  it('reads no dashboard and no permission, and does nothing, without an editor', async () => {
    const { resource } = await configTab({ editor: null });

    resource.ToggleEditMode();
    resource.CancelEdit();
    resource.OpenAddPartDialog();
    resource.EditingName = 'Pipeline';
    await expect(resource.SaveDashboard()).resolves.toBeUndefined();

    expect(resource.ConfigDashboard).toBeNull();
    expect(resource.IsEditMode).toBe(false);
    expect(resource.EditingName).toBe('');
    expect(resource.DashboardPermissions).toMatchObject({ CanRead: false, CanEdit: false, CanShare: false, IsOwner: false });
    expect(resource.CanShare).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requests from the agent and the engines its source search reads
// ---------------------------------------------------------------------------

describe('DashboardResource requests from the agent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A tab with the Config dashboard loaded and its tools registered, and its tools by name. */
  async function agentTab(options: Parameters<typeof configTab>[0] = {}) {
    const tab = await configTab(options);
    loadConfig(tab.resource);
    const tool = (name: string): RegisteredTool => {
      const found = registeredTools(tab.navigation).find(t => t.Name === name);
      if (!found) throw new Error(`no tool ${name}`);
      return found;
    };
    return { ...tab, tool };
  }

  /** Waits until the agent's request has opened the confirm dialog. */
  async function untilAsked(resource: TestResource): Promise<void> {
    await vi.waitFor(() => expect(resource.AgentConfirm).not.toBeNull());
  }

  const confirmed = { Success: true, Data: { requested: true, confirmed: true } };

  it('closes the dialog and fails the request when the user gives no answer within 25 seconds', async () => {
    const pins = pinsFake(true);
    const { resource, tool } = await agentTab({ pins });
    vi.useFakeTimers();

    const request = tool('RequestPinToHome').Handler({ dashboardId: 'dash-config' });
    await vi.advanceTimersByTimeAsync(0);
    expect(resource.AgentConfirm).toMatchObject({ Kind: 'pin', Title: 'Pin to Home?', ConfirmText: 'Pin' });
    await vi.advanceTimersByTimeAsync(24_999);
    expect(resource.AgentConfirm).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(resource.AgentConfirm).toBeNull();
    await expect(request).resolves.toEqual({ Success: false, ErrorMessage: 'No answer within 25 s; the dialog was closed. Ask the user and try again.' });
    // A click that comes after the dialog closed does nothing.
    resource.OnAgentConfirm(true);
    expect(pins.AddPin).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pins the dashboard when the user confirms, through the method the Add to menu uses', async () => {
    const pins = pinsFake(true);
    pins.AddPin.mockImplementation(() => {
      pins.IsPinned.mockReturnValue(true);
      return true;
    });
    const { resource, tool } = await agentTab({ pins });

    const request = tool('RequestPinToHome').Handler({ dashboardId: 'dash-config' });
    await untilAsked(resource);
    expect(resource.AgentConfirm).toEqual({
      Kind: 'pin',
      Title: 'Pin to Home?',
      Message: 'The assistant asks to pin "Config Dashboard" to your Home app.',
      ConfirmText: 'Pin',
    });
    resource.OnAgentConfirm(true);

    await expect(request).resolves.toEqual(confirmed);
    expect(pins.AddPin).toHaveBeenCalledTimes(1);
    expect(doubles.notify).toHaveBeenCalledWith('Pinned "Config Dashboard" to Home', 'success', 2000);
    expect(resource.AgentConfirm).toBeNull();
  });

  it('fails a confirmed pin request when the dashboard is not pinned afterwards', async () => {
    // AddPin reports success, but the pins never show the dashboard as pinned.
    const { resource, tool } = await agentTab({ pins: pinsFake(true) });

    const request = tool('RequestPinToHome').Handler({ dashboardId: 'dash-config' });
    await untilAsked(resource);
    resource.OnAgentConfirm(true);

    await expect(request).resolves.toEqual({ Success: false, ErrorMessage: 'Could not pin "Config Dashboard" to Home.' });
  });

  it("saves through the editor with the agent's name and description, and fails the request with the editor's reason", async () => {
    const { resource, editor, tool } = await agentTab();
    editor!.IsEditing = true;

    const saved = tool('RequestSaveDashboard').Handler({ dashboardId: 'dash-config', name: 'Agent name', description: 'Agent description' });
    await untilAsked(resource);
    resource.OnAgentConfirm(true);

    await expect(saved).resolves.toEqual(confirmed);
    expect(editor!.Save).toHaveBeenCalledExactlyOnceWith({ Name: 'Agent name', Description: 'Agent description' });

    editor!.IsEditing = true;
    editor!.Save.mockResolvedValueOnce('A save is in progress. Try again when it finishes.');
    const refused = tool('RequestSaveDashboard').Handler({ dashboardId: 'dash-config' });
    await untilAsked(resource);
    resource.OnAgentConfirm(true);

    await expect(refused).resolves.toEqual({ Success: false, ErrorMessage: 'A save is in progress. Try again when it finishes.' });
  });
});

describe('DashboardResource source search engines', () => {
  beforeEach(() => {
    doubles.userViews.Config.mockClear();
    doubles.queries.Config.mockClear();
  });

  /** Loads a dashboard through the tab's load path, with its Code loader and its editor step replaced. */
  async function loadDashboardRecord(dashboardId: string) {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const resource = new DashboardResource({} as ViewContainerRef, {} as ChangeDetectorRef);
    const internals = resource as unknown as Record<string, unknown>;
    const loadCode = vi.fn(async () => undefined);
    const showConfig = vi.fn();
    internals['loadCodeBasedDashboard'] = loadCode;
    internals['showConfigDashboard'] = showConfig;
    internals['Data'] = { ResourceRecordID: dashboardId, Configuration: {} };
    await (resource as unknown as { loadDashboard(): Promise<void> }).loadDashboard();
    return { loadCode, showConfig };
  }

  it("loads the view and query engines for the user before a Config dashboard, with the tab's provider", async () => {
    const { showConfig } = await loadDashboardRecord('dash-config');

    const provider = { CurrentUser: { ID: 'user-1' } };
    expect(doubles.userViews.Config).toHaveBeenCalledExactlyOnceWith(false, provider.CurrentUser, provider);
    expect(doubles.queries.Config).toHaveBeenCalledExactlyOnceWith(false, provider.CurrentUser, provider);
    expect(doubles.queries.Config.mock.invocationCallOrder[0]).toBeLessThan(showConfig.mock.invocationCallOrder[0]);
  });

  it('still opens the Config dashboard when an engine cannot load, and logs why', async () => {
    doubles.userViews.Config.mockRejectedValueOnce(new Error('offline'));

    const { showConfig } = await loadDashboardRecord('dash-config');

    expect(showConfig).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(LogError).toHaveBeenCalledWith("Dashboard tab: could not load the views and queries for the assistant's source search: offline"));
  });

  it('opens a Config dashboard without waiting for the engines to load', async () => {
    doubles.userViews.Config.mockImplementationOnce(() => new Promise<undefined>(() => undefined));

    const { showConfig } = await loadDashboardRecord('dash-config');

    expect(showConfig).toHaveBeenCalledTimes(1);
  });

  it('does not load them for a Code dashboard, which has no studio tools', async () => {
    const { loadCode } = await loadDashboardRecord('dash-code');

    expect(loadCode).toHaveBeenCalledTimes(1);
    expect(doubles.userViews.Config).not.toHaveBeenCalled();
    expect(doubles.queries.Config).not.toHaveBeenCalled();
  });
});

/** The host the tab gives its studio tools: the reads, edits and requests the tools make on the tab. */
function studioHostOf(resource: TestResource): DashboardStudioHost {
  return (resource as unknown as { studioHost(): DashboardStudioHost }).studioHost();
}

/** An artifact row as the tab's source search reads it. */
type ArtifactRowDouble = Pick<MJArtifactEntity, 'ID' | 'Name' | 'Description' | 'Type'>;

/** An artifact version row as the tab's latest-version lookup reads it. */
type VersionRowDouble = Pick<MJArtifactVersionEntity, 'ArtifactID' | 'VersionNumber'>;

/** A view result as the provider double gives it. */
interface ViewResultDouble<T> {
  Success: boolean;
  Results: T[];
}

/**
 * A metadata provider double for the agent's source search. RunView gives `artifacts` and RunViews gives
 * `versions` for each view it is asked for; both record the params they get. The tab's
 * RunView.FromMetadataProvider runs views through it (see the @memberjunction/core mock).
 */
function sourceProvider(artifacts: ArtifactRowDouble[] = [], versions: VersionRowDouble[] = []) {
  return {
    CurrentUser: { ID: 'user-1' },
    Entities: [],
    RunView: vi.fn<(params: RunViewParams, contextUser?: { ID: string }) => Promise<ViewResultDouble<ArtifactRowDouble>>>(
      async () => ({ Success: true, Results: artifacts }),
    ),
    RunViews: vi.fn<(params: RunViewParams[], contextUser?: { ID: string }) => Promise<Array<ViewResultDouble<VersionRowDouble>>>>(
      async paramsList => paramsList.map(() => ({ Success: true, Results: versions })),
    ),
  };
}

/**
 * Why the server would refuse `filter` as a client's ExtraFilter in `dialect`, or null when it accepts it.
 * The checks are those of ResolverBase.assertClientClauseUsesEntityBaseViews in MJServer: one statement,
 * which parses as a read-only SELECT when it is wrapped as the WHERE of `__mj_clause_screen`, and which
 * reads no other table.
 */
function clientFilterRefusal(filter: string, dialect: SQLParserDialect): string | null {
  if (SQLParser.HasStackedStatements(filter, dialect)) return `${dialect.ParserDialect}: more than one statement`;
  const wrapped = `SELECT 1 FROM __mj_clause_screen WHERE (${filter})`;
  const parser = new SQLParser(wrapped, dialect);
  if (!parser.IsValid || parser.HasWriteStatement || parser.StatementKind !== 'select') {
    return `${dialect.ParserDialect}: not a safe read-only filter fragment`;
  }
  const tables = SQLParser.ExtractTableRefs(wrapped, dialect).map(table => table.TableName.toLowerCase());
  return tables.every(table => table === '__mj_clause_screen') ? null : `${dialect.ParserDialect}: reads ${tables.join(', ')}`;
}

/** A dashboard tab whose metadata provider is `provider`, and the studio host it gives its tools. */
async function sourceSearchHost(provider: ReturnType<typeof sourceProvider>): Promise<DashboardStudioHost> {
  const { DashboardResource } = await import('./dashboard-resource.component');
  const resource = new DashboardResource({} as ViewContainerRef, {} as ChangeDetectorRef);
  (resource as unknown as Record<string, unknown>)['ProviderToUse'] = provider;
  return studioHostOf(resource);
}

describe('DashboardResource source search for the agent', () => {
  beforeEach(() => {
    doubles.userViews.Config.mockClear();
    doubles.queries.Config.mockClear();
  });

  /** The filter every artifact read starts with: artifacts the user can read, in the default environment, that are shown. */
  const ARTIFACT_SCOPE = "(UserID='user-1') AND EnvironmentID='env-default' AND (Visibility IS NULL OR Visibility='Always')";

  /** The filter clause that keeps the artifacts whose name or description, in lower case, matches the LIKE `pattern`. */
  const nameOrDescription = (pattern: string): string => ` AND (LOWER(Name) LIKE '%${pattern}%' OR LOWER(Description) LIKE '%${pattern}%')`;

  it('reads every version of the artifacts it finds, highest first and without the row cap, and pins each panel to the latest', async () => {
    const provider = sourceProvider(
      [
        { ID: 'art-1', Name: 'Revenue chart', Description: null, Type: 'Component' },
        { ID: 'art-2', Name: 'Revenue notes', Description: 'Monthly notes', Type: 'Markdown Document' },
      ],
      [
        { ArtifactID: 'ART-1', VersionNumber: 12 },
        { ArtifactID: 'art-1', VersionNumber: 3 },
      ],
    );
    const host = await sourceSearchHost(provider);

    const results = await host.SearchSources('revenue', ['artifact'], 10);

    expect(provider.RunViews).toHaveBeenCalledExactlyOnceWith(
      [
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: "ArtifactID IN ('art-1','art-2')",
          Fields: ['ArtifactID', 'VersionNumber'],
          OrderBy: 'VersionNumber DESC',
          IgnoreMaxRows: true,
          ResultType: 'simple',
        },
      ],
      provider.CurrentUser,
    );
    expect(results.map(result => result.suggestedConfig)).toEqual([
      { type: 'Artifact', artifactId: 'art-1', versionNumber: 12 },
      { type: 'Artifact', artifactId: 'art-2' },
    ]);
  });

  it('reads only the artifacts whose name or description contains the query in any case, the first 500 by name', async () => {
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources('  Revenue  ', ['artifact'], 10);

    expect(provider.RunView).toHaveBeenCalledExactlyOnceWith(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `${ARTIFACT_SCOPE}${nameOrDescription('revenue')}`,
        Fields: ['ID', 'Name', 'Description', 'Type'],
        OrderBy: 'Name',
        MaxRows: 500,
        ResultType: 'simple',
      },
      provider.CurrentUser,
    );
  });

  it('turns each quote, backslash, LIKE wildcard and non-ASCII letter of the query into the wildcard _, so the filter only narrows', async () => {
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources(String.raw`O'Brien 100%_[Draft] C:\Temp Ревеню`, ['artifact'], 10);

    expect(provider.RunView.mock.calls[0]?.[0].ExtraFilter).toBe(`${ARTIFACT_SCOPE}${nameOrDescription('o_brien 100___draft_ c:_temp ______')}`);
  });

  it('turns each parenthesis of the query into the wildcard _, so PostgreSQL rewrites no date function inside the pattern', async () => {
    // The PostgreSQL provider rewrites GETDATE(), GETUTCDATE(), SYSDATETIMEOFFSET() and DATEADD(...) in the whole
    // filter, string literals too; GETUTCDATE() would even put quotes into the literal.
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources('GETDATE() vs GetUtcDate( ) or DATEADD(day, 1, x)', ['artifact'], 10);

    expect(provider.RunView.mock.calls[0]?.[0].ExtraFilter).toBe(`${ARTIFACT_SCOPE}${nameOrDescription('getdate__ vs getutcdate_ _ or dateadd_day, 1, x_')}`);
  });

  it.each([
    // ICU collations lower-case İ to i and a combining dot, two characters, and other collations to one, so no count of _
    // fits every database. Lower case first would also give that pair in the pattern.
    { query: 'İstanbul', pattern: '%stanbul' },
    { query: 'Kİmya', pattern: 'k%mya' },
    // SQL Server counts a character outside the BMP as two characters and PostgreSQL as one, so no count of _ fits both.
    { query: 'Launch 🚀 plan', pattern: 'launch % plan' },
  ])('keeps the filter wide enough on every database for the query $query', async ({ query, pattern }) => {
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources(query, ['artifact'], 10);

    expect(provider.RunView.mock.calls[0]?.[0].ExtraFilter).toBe(`${ARTIFACT_SCOPE}${nameOrDescription(pattern)}`);
  });

  it.each([
    { name: 'a plain word', query: 'revenue' },
    { name: 'quotes, backslashes, wildcards and Cyrillic', query: String.raw`O'Brien 100%_[Draft] C:\Temp Ревеню` },
    { name: 'a Cyrillic word', query: 'Отчёт' },
    { name: 'SQL keywords and comment marks', query: 'delete -- ; drop /* x */ "y" `z`' },
    { name: 'a dotted capital I and an emoji', query: 'İstanbul 🚀' },
    { name: 'SQL date functions', query: "GETUTCDATE() DATEADD(day, 1, GETDATE()) 'x'" },
    { name: 'a blank query', query: '   ' },
  ])('sends an artifact filter for $name that the server accepts from a client, on SQL Server and PostgreSQL', async ({ query }) => {
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources(query, ['artifact'], 10);

    const filter = provider.RunView.mock.calls[0]?.[0].ExtraFilter;
    if (typeof filter !== 'string') throw new Error('The tab sent no ExtraFilter text.');
    expect([new SQLServerDialect(), new PostgreSQLDialect()].map(dialect => clientFilterRefusal(filter, dialect))).toEqual([null, null]);
  });

  it.each(['', '   '])('reads the artifacts without a name filter for the blank query %j', async query => {
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources(query, ['artifact'], 10);

    expect(provider.RunView.mock.calls[0]?.[0]).toMatchObject({ ExtraFilter: ARTIFACT_SCOPE, OrderBy: 'Name', MaxRows: 500 });
  });

  it.each([
    { kinds: ['artifact', 'entity'], views: 0, queries: 0 },
    { kinds: ['view'], views: 1, queries: 0 },
    { kinds: ['query'], views: 0, queries: 1 },
    { kinds: ['view', 'query'], views: 1, queries: 1 },
  ] satisfies Array<{ kinds: SourceKind[]; views: number; queries: number }>)('loads only the engines that a search of $kinds reads', async ({ kinds, views, queries }) => {
    const provider = sourceProvider();
    const host = await sourceSearchHost(provider);

    await host.SearchSources('revenue', kinds, 10);

    expect(doubles.userViews.Config).toHaveBeenCalledTimes(views);
    expect(doubles.queries.Config).toHaveBeenCalledTimes(queries);
  });
});

/** A panel as the viewer doubles hold it. */
interface PanelDouble {
  id: string;
  title: string;
  partTypeId: string;
  config: PanelConfig;
}

/**
 * A viewer double whose edits change nothing, as the real viewer skips an edit without an error in some
 * states. GetPanel reads its panels. With `loaded` false it has no config, as before its layout loads.
 */
function inertViewerDouble(panels: PanelDouble[], loaded = true) {
  const viewer = viewerDouble(panels);
  return {
    ...viewer,
    getConfig: () => (loaded ? { layout: viewer.layout } : null),
    GetPanel: (panelId: string): PanelDouble | null => panels.find(panel => panel.id === panelId) ?? null,
    AddPanel: vi.fn<DashboardStudioHost['AddPanel']>(async () => null),
    RemovePanel: vi.fn<(panelId: string) => void>(),
    UpdatePanelConfig: vi.fn<(panelId: string, config: PanelConfig, title?: string, icon?: string) => void>(),
    ApplyLayout: vi.fn<DashboardStudioHost['ApplyLayout']>(async () => undefined),
  };
}

type InertViewerDouble = ReturnType<typeof inertViewerDouble>;

describe('DashboardResource agent edits', () => {
  const revenue: PanelDouble = { id: 'panel-1', title: 'Revenue', partTypeId: 'pt-view', config: { type: 'View' } };

  /** A tab whose editor shows the Config dashboard in `viewer`, and the studio host it gives its tools. */
  async function editTab(viewer: InertViewerDouble) {
    const { resource, editor } = await configTab({ viewer });
    loadConfig(resource);
    return { resource, editor, host: studioHostOf(resource) };
  }

  it.each([
    {
      edit: 'RemovePanel',
      loaded: true,
      run: (host: DashboardStudioHost) => host.RemovePanel('panel-1'),
      viewerCall: (viewer: InertViewerDouble) => viewer.RemovePanel.mock.calls,
      calls: [['panel-1']],
      reason: 'The dashboard did not remove the panel.',
      notice: 'The assistant could not remove the part',
    },
    {
      edit: 'UpdatePanelConfig',
      loaded: true,
      run: (host: DashboardStudioHost) => host.UpdatePanelConfig('panel-1', { type: 'View', entityName: 'MJ: Users' }, 'Users'),
      viewerCall: (viewer: InertViewerDouble) => viewer.UpdatePanelConfig.mock.calls,
      calls: [['panel-1', { type: 'View', entityName: 'MJ: Users' }, 'Users', undefined]],
      reason: 'The dashboard did not change the panel.',
      notice: 'The assistant could not change the part',
    },
    {
      edit: 'ApplyLayout',
      loaded: false,
      run: (host: DashboardStudioHost) => host.ApplyLayout({} as ResolvedLayoutConfig),
      viewerCall: (viewer: InertViewerDouble) => viewer.ApplyLayout.mock.calls,
      calls: [],
      reason: 'The dashboard has not loaded its layout yet.',
      notice: 'The assistant could not change the layout',
    },
  ])('rejects $edit when the viewer does not make the change, and tells the user', async ({ loaded, run, viewerCall, calls, reason, notice }) => {
    const viewer = inertViewerDouble([revenue], loaded);
    const { host } = await editTab(viewer);

    await expect(run(host)).rejects.toEqual(new Error(reason));

    expect(viewerCall(viewer)).toEqual(calls);
    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith(notice, 'error', 3000);
    expect(LogError).toHaveBeenCalledWith(`Dashboard tab: ${notice}: ${reason}`);
  });

  it('waits for the viewer to rebuild a changed panel before it checks the change', async () => {
    const panel: PanelDouble = { ...revenue };
    const viewer = inertViewerDouble([panel]);
    let rebuild = (): void => undefined;
    viewer.UpdatePanelConfig.mockImplementation((_panelId: string, config: PanelConfig) =>
      new Promise<void>(resolve => {
        rebuild = () => {
          panel.config = config;
          resolve();
        };
      }),
    );
    const { host } = await editTab(viewer);
    let settled = false;

    const updating = host.UpdatePanelConfig('panel-1', { type: 'View', entityName: 'MJ: Users' }, 'Users').then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(viewer.UpdatePanelConfig).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    rebuild();

    await updating;
    expect(settled).toBe(true);
    expect(doubles.notify).not.toHaveBeenCalled();
  });

  it("refuses an edit when the editor's Save starts while the edit waits for the layout, and leaves the viewer as it is", async () => {
    const viewer = inertViewerDouble([revenue]);
    const { editor, host } = await editTab(viewer);
    let layoutReady = (): void => undefined;
    viewer.WaitForLayoutReady.mockImplementationOnce(() => new Promise<undefined>(resolve => {
      layoutReady = () => resolve(undefined);
    }));

    const adding = host.AddPanel('pt-view', { type: 'View', entityName: 'MJ: Users' }, 'Users', undefined, undefined);
    editor!.IsSaving = true; // the user's Save starts while the edit waits
    layoutReady();

    await expect(adding).rejects.toEqual(new Error('A save is in progress. Try again when it finishes.'));
    expect(viewer.AddPanel).not.toHaveBeenCalled();
  });

  it('reads the edit state and enters edit mode through the editor', async () => {
    const viewer = inertViewerDouble([revenue]);
    const { editor, host } = await editTab(viewer);

    expect(host.IsEditing()).toBe(false);
    expect(host.CanEdit()).toBe(true);
    expect(host.IsSaving()).toBe(false);
    expect(host.GetPartTypes()).toEqual([{ ID: 'pt-view', Name: 'View', Icon: 'fa-solid fa-table' }]);
    expect(host.Dashboard()).toEqual({ ID: 'dash-config', Name: 'Config Dashboard', Description: null });

    expect(host.EnterEditMode()).toBe(true);

    expect(editor!.EnterEditMode).toHaveBeenCalledTimes(1);
    expect(host.IsEditing()).toBe(true);
  });

  it('rejects the edits and the screenshot, and reads nothing, without an editor', async () => {
    const { resource } = await configTab({ editor: null });
    const host = studioHostOf(resource);

    expect(host.Dashboard()).toBeNull();
    expect(host.GetConfig()).toBeNull();
    expect(host.EnterEditMode()).toBe(false);
    expect(host.PanelBounds()).toEqual([]);
    await expect(host.AddPanel('pt-view', { type: 'View' }, 'Users', undefined, undefined)).rejects.toEqual(new Error('No Config dashboard is open in this tab.'));
    await expect(host.CaptureScreenshot(800)).rejects.toEqual(new Error('No Config dashboard is open in this tab.'));
  });
});

describe('DashboardResource AI pane', () => {
  beforeEach(() => {
    doubles.userInfo.GetSetting.mockClear();
    doubles.userInfo.SetSettingDebounced.mockClear();
    doubles.resolveAgent.mockClear();
  });

  it("opens with the default widths when the user's settings cannot be read", async () => {
    const { resource } = await configTab();
    doubles.userInfo.GetSetting.mockImplementationOnce(() => {
      throw new Error('PermissionConstrainedError');
    });
    resource.MainSizePct = 50;
    resource.CopilotSizePct = 50;

    resource.ToggleChat();

    expect(resource.ChatOpen).toBe(true);
    expect([resource.MainSizePct, resource.CopilotSizePct]).toEqual([68, 32]);
    await vi.waitFor(() => expect(resource.ChatAgentId).toBe('agent-dashboards'));
    expect(doubles.resolveAgent).toHaveBeenCalledTimes(1);
  });

  it.each([[['*', 40]], [[100]]] as const)('changes and saves nothing for the drag end sizes %j', async (sizes) => {
    const { resource } = await configTab();
    resource.ToggleChat();

    resource.OnCopilotSplitDragEnd(sizes);

    expect([resource.MainSizePct, resource.CopilotSizePct]).toEqual([68, 32]);
    expect(doubles.userInfo.SetSettingDebounced).not.toHaveBeenCalled();
  });

  it('logs a page the chat links to that the shell cannot open', async () => {
    const { resource, internals } = await configTab();
    const openNavItem = vi.fn(async () => {
      throw new Error('no such nav item');
    });
    internals['navigationService'] = { OpenNavItemByName: openNavItem };

    resource.OnChatNavigationRequest({ navItemName: 'Queries' });

    await vi.waitFor(() => expect(LogError).toHaveBeenCalledWith('Dashboard tab: could not open Queries: no such nav item'));
    expect(openNavItem).toHaveBeenCalledExactlyOnceWith('Queries', undefined, undefined, { queryParams: undefined });
  });
});
