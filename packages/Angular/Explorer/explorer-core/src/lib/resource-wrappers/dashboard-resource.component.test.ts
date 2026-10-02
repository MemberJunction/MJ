import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { ChangeDetectorRef, ViewContainerRef } from '@angular/core';
import { LogError } from '@memberjunction/core';
import type { RecentAccessService } from '@memberjunction/ng-shared';
import type { MJDashboardEntity, ResourceData } from '@memberjunction/core-entities';

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
  favorites: { IsFavorite: vi.fn(() => false), Toggle: vi.fn(async () => true) },
  homeTabs: { HasTab: vi.fn(() => false), Add: vi.fn(async () => undefined), Remove: vi.fn(async () => undefined) },
  homePins: {
    IsPinned: vi.fn(() => false),
    LoadPins: vi.fn(async () => undefined),
    AddPin: vi.fn(() => true),
    FindPin: vi.fn(() => undefined),
    UpdatePin: vi.fn(),
    CaptureThumbnail: vi.fn(async () => undefined),
  },
  notify: vi.fn(),
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

vi.mock('@memberjunction/ng-shared', () => ({
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
  DashboardFavoritesService: class { static double = doubles.favorites; },
  HomeDashboardTabsService: class { static double = doubles.homeTabs; },
  HomeAppPinService: class { static double = doubles.homePins; },
  SafeDetectChanges: (cdr: { markForCheck?: () => void; detectChanges?: () => void } | null) => {
    cdr?.markForCheck?.();
    cdr?.detectChanges?.();
  },
}));

vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: { Instance: { CreateSimpleNotification: doubles.notify } },
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJDashboardEntity: class {},
  MJDashboardUserStateEntity: class {},
  MJDashboardCategoryEntity: class {},
  MJDashboardPartTypeEntity: class {},
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
}));

vi.mock('@memberjunction/global', () => ({
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
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: {},
  CompositeKey: class {
    static FromID(id: string) {
      return { KeyValuePairs: [{ FieldName: 'ID', Value: id }] };
    }
  },
  RunView: class {},
  LogError: vi.fn(),
}));

/** The layout the viewer double hands to ExtractPanelsFromLayout carries its panels directly. */
vi.mock('@memberjunction/ng-dashboard-viewer', () => ({
  DashboardViewerComponent: class {},
  ExtractPanelsFromLayout: (layout: { panels?: unknown[] } | null) => layout?.panels ?? [],
}));

beforeEach(() => {
  doubles.notify.mockClear();
});

describe('DashboardResource config dashboard loading', () => {
  it('waits for DashboardViewerComponent layout readiness before notifying load complete', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const detectChanges = vi.fn();
    const appendedNodes: unknown[] = [];
    let resolveReady!: () => void;

    const viewerInstance: {
      dashboard?: { ID: string; Name: string };
      navigationRequested: MockEventEmitter;
      openInTab: MockEventEmitter;
      dashboardSaved: MockEventEmitter;
      error: MockEventEmitter;
      configChanged: MockEventEmitter;
      PanelInteraction: MockEventEmitter;
      waitForLayoutReady: ReturnType<typeof vi.fn>;
      getConfig: ReturnType<typeof vi.fn>;
      GetPartTypes: ReturnType<typeof vi.fn>;
    } = {
      navigationRequested: new MockEventEmitter(),
      openInTab: new MockEventEmitter(),
      dashboardSaved: new MockEventEmitter(),
      error: new MockEventEmitter(),
      configChanged: new MockEventEmitter(),
      PanelInteraction: new MockEventEmitter(),
      waitForLayoutReady: vi.fn(() => new Promise<void>(resolve => {
        resolveReady = resolve;
      })),
      getConfig: vi.fn(() => ({ layout: null })),
      GetPartTypes: vi.fn(() => []),
    };

    const viewContainer = {
      createComponent: vi.fn(() => ({
        instance: viewerInstance,
        hostView: {
          rootNodes: [{ style: {} }],
        },
      })),
    };
    const resource = new DashboardResource(viewContainer as any, { detectChanges } as any) as any;
    const notifyLoadComplete = vi.spyOn(resource, 'NotifyLoadComplete');

    resource.containerElement = {
      nativeElement: {
        innerHTML: 'old',
        appendChild: vi.fn((node: unknown) => appendedNodes.push(node)),
      },
    };
    resource.navigationService = {
      OpenDashboard: vi.fn(),
      SetAgentContext: vi.fn(),
      SetAgentClientTools: vi.fn(),
      TakeDashboardEditModeRequest: vi.fn(() => false),
      DashboardEditModeRequested$: new Subject<string>(),
    };
    resource.ProviderToUse = { CurrentUser: { ID: 'user-1' } };

    const loadPromise = resource.loadConfigBasedDashboard({
      ID: 'dash-1',
      Name: 'Golden Dashboard',
    });

    await Promise.resolve();

    expect(viewerInstance.waitForLayoutReady).toHaveBeenCalledTimes(1);
    expect(viewerInstance.dashboard).toMatchObject({ ID: 'dash-1' });
    expect(notifyLoadComplete).not.toHaveBeenCalled();
    expect(detectChanges).not.toHaveBeenCalled();
    expect(appendedNodes).toHaveLength(1);

    resolveReady();
    await loadPromise;

    expect(notifyLoadComplete).toHaveBeenCalledTimes(1);
    expect(detectChanges).toHaveBeenCalledTimes(1);
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
    internals['loadConfigBasedDashboard'] = vi.fn(async () => undefined);
    internals['Data'] = { ResourceRecordID: dashboardId, Configuration: {} };

    await (resource as unknown as { loadDashboard(): Promise<void> }).loadDashboard();

    expect(logAccess).toHaveBeenCalledExactlyOnceWith('MJ: Dashboards', dashboardId, 'dashboard');
  });

  it('injects its own double for each service', async () => {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const internals = new DashboardResource({} as ViewContainerRef, {} as ChangeDetectorRef) as unknown as Record<string, unknown>;

    expect(internals['recentAccess']).toBe(doubles.recentAccess);
    expect(internals['favoritesService']).toBe(doubles.favorites);
    expect(internals['homeTabsService']).toBe(doubles.homeTabs);
    expect(internals['homePins']).toBe(doubles.homePins);
  });
});

// ---------------------------------------------------------------------------
// Star, Add to menu, agent awareness and tab title
// ---------------------------------------------------------------------------

/** A fresh copy of the Config dashboard the tab tests open. Saving writes Name and Description onto it. */
function configDashboard(): MJDashboardEntity {
  return { ID: 'dash-config', Name: 'Config Dashboard', Type: 'Config' } as MJDashboardEntity;
}

type TestResource = InstanceType<typeof import('./dashboard-resource.component').DashboardResource>;

/** A Home tabs service whose writes change what HasTab reports, unless `applyWrites` is false. */
function homeTabsFake(initial: string[] = [], applyWrites = true) {
  const tabs = new Set(initial);
  return {
    HasTab: vi.fn((id: string) => tabs.has(id)),
    Add: vi.fn(async (id: string) => {
      if (applyWrites) tabs.add(id);
    }),
    Remove: vi.fn(async (id: string) => {
      if (applyWrites) tabs.delete(id);
    }),
  };
}

function favoritesFake(isFavorite = false) {
  return { IsFavorite: vi.fn((_id: string) => isFavorite), Toggle: vi.fn(async (_id: string) => !isFavorite) };
}

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

interface ViewerDouble {
  dashboard?: MJDashboardEntity;
  IsEditing?: boolean;
  navigationRequested: MockEventEmitter;
  openInTab: MockEventEmitter;
  dashboardSaved: MockEventEmitter;
  error: MockEventEmitter;
  configChanged: MockEventEmitter;
  PanelInteraction: MockEventEmitter;
  waitForLayoutReady: () => Promise<void>;
  getConfig: () => { layout: { panels: unknown[] } };
  GetPartTypes: () => Array<{ ID: string; Name: string; Icon: string }>;
  save: ReturnType<typeof vi.fn>;
  HasNewerSavedLayout: ReturnType<typeof vi.fn>;
  ReloadFromSaved: ReturnType<typeof vi.fn>;
  UseSavedCopy: ReturnType<typeof vi.fn>;
  layout: { panels: unknown[] };
}

function viewerDouble(panels: unknown[]): ViewerDouble {
  const layout = { panels };
  return {
    navigationRequested: new MockEventEmitter(),
    openInTab: new MockEventEmitter(),
    dashboardSaved: new MockEventEmitter(),
    error: new MockEventEmitter(),
    configChanged: new MockEventEmitter(),
    PanelInteraction: new MockEventEmitter(),
    waitForLayoutReady: vi.fn(async () => undefined),
    getConfig: () => ({ layout }),
    GetPartTypes: () => [{ ID: 'pt-view', Name: 'View', Icon: 'fa-solid fa-table' }],
    save: vi.fn(async () => true),
    HasNewerSavedLayout: vi.fn(() => false),
    ReloadFromSaved: vi.fn(async () => undefined),
    UseSavedCopy: vi.fn(() => true),
    layout,
  };
}

/** A dashboard tab with the Config dashboard open, and doubles for everything it calls. */
async function configTab(options: {
  favorites?: ReturnType<typeof favoritesFake>;
  homeTabs?: ReturnType<typeof homeTabsFake>;
  pins?: ReturnType<typeof pinsFake>;
  viewer?: ViewerDouble;
} = {}) {
  const { DashboardResource } = await import('./dashboard-resource.component');
  const viewer = options.viewer ?? viewerDouble([]);
  const viewContainer = { createComponent: vi.fn(() => ({ instance: viewer, hostView: { rootNodes: [{ style: {} }] } })) };
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  const resource = new DashboardResource(viewContainer as unknown as ViewContainerRef, cdr as unknown as ChangeDetectorRef);
  const internals = resource as unknown as Record<string, unknown>;
  const favorites = options.favorites ?? favoritesFake();
  const homeTabs = options.homeTabs ?? homeTabsFake();
  const pins = options.pins ?? pinsFake();
  const navigation = {
    OpenDashboard: vi.fn(),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    TakeDashboardEditModeRequest: vi.fn(() => false),
    DashboardEditModeRequested$: new Subject<string>(),
  };
  internals['favoritesService'] = favorites;
  internals['homeTabsService'] = homeTabs;
  internals['homePins'] = pins;
  internals['navigationService'] = navigation;
  internals['containerElement'] = { nativeElement: { innerHTML: '', appendChild: vi.fn() } };
  resource.ConfigDashboard = configDashboard();
  return { resource, internals, viewer, favorites, homeTabs, pins, navigation, cdr };
}

/** Loads the tab's open dashboard again through the tab's real Config load path. */
async function loadConfig(resource: TestResource): Promise<void> {
  const dashboard = resource.ConfigDashboard ?? configDashboard();
  await (resource as unknown as { loadConfigBasedDashboard(d: MJDashboardEntity): Promise<void> }).loadConfigBasedDashboard(dashboard);
}

function lastContext(navigation: { SetAgentContext: ReturnType<typeof vi.fn> }): Record<string, unknown> | undefined {
  return navigation.SetAgentContext.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

type RegisteredTool = { Name: string; Handler: (params: Record<string, unknown>) => Promise<unknown> };

function registeredTools(navigation: { SetAgentClientTools: ReturnType<typeof vi.fn> }): RegisteredTool[] {
  return (navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? []) as RegisteredTool[];
}

describe('DashboardResource star and Add to menu', () => {
  it('reads each placement flag for the open dashboard', async () => {
    const favorites = favoritesFake(true);
    const homeTabs = homeTabsFake(['dash-config']);
    const pins = pinsFake();
    pins.IsPinned.mockReturnValue(true);
    const { resource } = await configTab({ favorites, homeTabs, pins });

    expect(resource.IsFavorite).toBe(true);
    expect(resource.IsHomeTab).toBe(true);
    expect(resource.IsPinnedToHome).toBe(true);
    expect(favorites.IsFavorite).toHaveBeenCalledWith('dash-config');
    expect(homeTabs.HasTab).toHaveBeenCalledWith('dash-config');
    expect(pins.IsPinned).toHaveBeenCalledWith('Dashboards', { dashboardId: 'dash-config' });
  });

  it('reads every placement flag as false without an open Config dashboard or when a read fails', async () => {
    const favorites = favoritesFake(true);
    favorites.IsFavorite.mockImplementation(() => {
      throw new Error('PermissionConstrainedError');
    });
    const { resource } = await configTab({ favorites, homeTabs: homeTabsFake(['dash-config']) });

    expect(resource.IsFavorite).toBe(false);
    resource.ConfigDashboard = null;
    expect(resource.IsHomeTab).toBe(false);
    expect(resource.IsPinnedToHome).toBe(false);
  });

  it('stars the dashboard and confirms the new state', async () => {
    const { resource, favorites, cdr } = await configTab({ favorites: favoritesFake(false) });

    await resource.ToggleFavorite();

    expect(favorites.Toggle).toHaveBeenCalledWith('dash-config');
    expect(doubles.notify).toHaveBeenCalledWith('Added "Config Dashboard" to favorites', 'success', 2000);
    expect(cdr.detectChanges).toHaveBeenCalled();
  });

  it('unstars the dashboard and confirms the new state', async () => {
    const { resource } = await configTab({ favorites: favoritesFake(true) });

    await resource.ToggleFavorite();

    expect(doubles.notify).toHaveBeenCalledWith('Removed "Config Dashboard" from favorites', 'success', 2000);
  });

  it('tells the user when the favorite cannot be changed', async () => {
    const favorites = favoritesFake(false);
    favorites.Toggle.mockRejectedValue(new Error('offline'));
    const { resource } = await configTab({ favorites });

    await resource.ToggleFavorite();

    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Could not change the favorite', 'error', 3000);
  });

  it('adds the Home tab and confirms it from the service state', async () => {
    const homeTabs = homeTabsFake([]);
    const { resource } = await configTab({ homeTabs });

    await resource.ToggleHomeTab();

    expect(homeTabs.Add).toHaveBeenCalledWith('dash-config');
    expect(homeTabs.Remove).not.toHaveBeenCalled();
    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('"Config Dashboard" is now a tab on Home', 'success', 2000);
  });

  it('removes the Home tab and confirms it from the service state', async () => {
    const homeTabs = homeTabsFake(['dash-config']);
    const { resource } = await configTab({ homeTabs });

    await resource.ToggleHomeTab();

    expect(homeTabs.Remove).toHaveBeenCalledWith('dash-config');
    expect(homeTabs.Add).not.toHaveBeenCalled();
    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Removed "Config Dashboard" from your Home tabs', 'success', 2000);
  });

  it('warns when the Home tab change did not take effect', async () => {
    const { resource } = await configTab({ homeTabs: homeTabsFake([], false) });

    await resource.ToggleHomeTab();

    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Could not add "Config Dashboard" as a Home tab', 'warning', 3000);
  });

  it('warns when a Home tab removal did not take effect', async () => {
    const { resource } = await configTab({ homeTabs: homeTabsFake(['dash-config'], false) });

    await resource.ToggleHomeTab();

    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Could not remove "Config Dashboard" from your Home tabs', 'warning', 3000);
  });

  it('tells the user when the Home tab write fails', async () => {
    const homeTabs = homeTabsFake([]);
    homeTabs.Add.mockRejectedValue(new Error('Could not save the Home tab'));
    const { resource } = await configTab({ homeTabs });

    await resource.ToggleHomeTab();

    expect(doubles.notify).toHaveBeenCalledExactlyOnceWith('Could not add the Home tab', 'error', 3000);
  });

  it('ignores a Home tab click while a change is running', async () => {
    const homeTabs = homeTabsFake([]);
    const pendingWrites: Array<() => void> = [];
    homeTabs.Add.mockImplementation(() => new Promise<void>(resolve => pendingWrites.push(resolve)));
    const { resource } = await configTab({ homeTabs });

    const first = resource.ToggleHomeTab();
    const second = resource.ToggleHomeTab(); // clicked again before the first write finished
    pendingWrites.forEach(finish => finish());
    await Promise.all([first, second]);

    expect(homeTabs.Add).toHaveBeenCalledTimes(1);
    expect(homeTabs.Remove).not.toHaveBeenCalled();
  });

  it('pins the dashboard card after loading the pins, then attaches a thumbnail', async () => {
    const pins = pinsFake(true);
    const { resource, internals } = await configTab({ pins });
    const container = (internals['containerElement'] as { nativeElement: unknown }).nativeElement;

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
    expect(pins.CaptureThumbnail).toHaveBeenCalledWith(container);
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

  it('reports the new placement to the agent after a change', async () => {
    const favorites = favoritesFake(false);
    const { resource, navigation } = await configTab({ favorites });
    favorites.Toggle.mockImplementation(async () => {
      favorites.IsFavorite.mockReturnValue(true);
      return true;
    });

    await resource.ToggleFavorite();

    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardId: 'dash-config', IsFavorite: true });
  });

  it('does nothing without an open Config dashboard', async () => {
    const { resource, favorites, homeTabs, pins } = await configTab();
    resource.ConfigDashboard = null;

    await resource.ToggleFavorite();
    await resource.ToggleHomeTab();
    await resource.PinToHome();

    expect(favorites.Toggle).not.toHaveBeenCalled();
    expect(homeTabs.Add).not.toHaveBeenCalled();
    expect(pins.AddPin).not.toHaveBeenCalled();
    expect(doubles.notify).not.toHaveBeenCalled();
  });
});

describe('DashboardResource toolbar wiring', () => {
  /** The view-mode toolbar block of the tab's template. */
  async function viewToolbar(): Promise<string> {
    const { DashboardResource } = await import('./dashboard-resource.component');
    const template = doubles.componentMeta.get(DashboardResource)?.template ?? '';
    return template.slice(template.indexOf('<!-- View Mode Toolbar -->'), template.indexOf('<!-- Edit Mode Toolbar -->'));
  }

  it('puts the star in the view-mode toolbar', async () => {
    const toolbar = await viewToolbar();

    expect(toolbar).toMatch(/\(click\)="ToggleFavorite\(\)"/);
    expect(toolbar).toMatch(/\[class\.active\]="IsFavorite"/);
    expect(toolbar).toMatch(/\[attr\.aria-pressed\]="IsFavorite \? 'true' : 'false'"/);
  });

  it('wires the Add to menu to the tab, with Share limited to users who can share', async () => {
    const toolbar = await viewToolbar();
    const menu = toolbar.slice(toolbar.indexOf('<mj-dashboard-add-to-menu'), toolbar.indexOf('</mj-dashboard-add-to-menu>'));

    expect(menu).toMatch(/\[IsHomeTab\]="IsHomeTab"/);
    expect(menu).toMatch(/\[IsPinned\]="IsPinnedToHome"/);
    expect(menu).toMatch(/\[CanShare\]="DashboardPermissions\.CanShare"/);
    expect(menu).toMatch(/\(ToggleHomeTab\)="ToggleHomeTab\(\)"/);
    expect(menu).toMatch(/\(PinToHome\)="PinToHome\(\)"/);
    expect(menu).toMatch(/\(Share\)="OpenShareDialog\(\)"/);
  });

  it('opens the share dialog when Share is picked', async () => {
    const { resource, cdr } = await configTab();

    resource.OpenShareDialog();

    expect(resource.ShowShareDialog).toBe(true);
    expect(cdr.detectChanges).toHaveBeenCalled();
  });
});

describe('DashboardResource dashboard links', () => {
  it('opens a dashboard that a panel links to without forcing a new tab, so it replaces the preview tab', async () => {
    const { resource, navigation } = await configTab();

    (resource as unknown as { handleNavigationRequest(e: object): void }).handleNavigationRequest({
      request: { type: 'OpenDashboard', dashboardId: 'dash-code' },
    });

    expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith('dash-code', 'Code Dashboard');
  });

  it("opens the viewer's Open in Tab request without forcing a new tab", async () => {
    const viewer = viewerDouble([]);
    const { resource, navigation } = await configTab({ viewer });
    await loadConfig(resource);

    viewer.openInTab.emit({ dashboardId: 'dash-saved', dashboardName: 'Saved Dashboard' });

    expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith('dash-saved', 'Saved Dashboard');
  });
});

describe('DashboardResource agent awareness', () => {
  const revenuePanel = { title: 'Revenue', partTypeId: 'pt-view', config: { type: 'View' } };

  it('reports a Config dashboard and registers its read-only tools once the layout is ready', async () => {
    let resolveReady!: () => void;
    const viewer = viewerDouble([revenuePanel]);
    viewer.waitForLayoutReady = vi.fn(() => new Promise<void>(resolve => {
      resolveReady = resolve;
    }));
    const { resource, navigation } = await configTab({ viewer });

    const loading = loadConfig(resource);
    await Promise.resolve();
    viewer.configChanged.emit({ changeType: 'layout' }); // Golden Layout settling during the load
    expect(navigation.SetAgentContext).not.toHaveBeenCalled();
    expect(navigation.SetAgentClientTools).not.toHaveBeenCalled();

    resolveReady();
    await loading;

    expect(registeredTools(navigation).map(t => t.Name)).toEqual(['GetDashboardPanels', 'GetDashboardDetail']);
    expect(lastContext(navigation)).toEqual({
      OpenedDashboardId: 'dash-config',
      OpenedDashboardName: 'Config Dashboard',
      OpenedDashboardType: 'Config',
      OpenedDashboardIsEditing: false,
      OpenedDashboardCanEdit: true,
      OpenedDashboardPanelCount: 1,
      OpenedDashboardPanels: [{ Title: 'Revenue', PartTypeName: 'View', Icon: 'fa-solid fa-table' }],
      IsFavorite: false,
      IsHomeTab: false,
      IsPinnedToHome: false,
    });
  });

  it('answers the panel and detail tools from the open tab', async () => {
    const { resource, navigation } = await configTab({ viewer: viewerDouble([revenuePanel]) });
    await loadConfig(resource);
    const [panelsTool, detailTool] = registeredTools(navigation);

    await expect(panelsTool.Handler({})).resolves.toEqual({
      Success: true,
      Data: {
        DashboardId: 'dash-config',
        DashboardName: 'Config Dashboard',
        PanelCount: 1,
        Panels: [{ Title: 'Revenue', PartTypeName: 'View', Icon: 'fa-solid fa-table' }],
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

  it('reports again when the panels change, not when the layout only moves', async () => {
    const viewer = viewerDouble([revenuePanel]);
    const { resource, navigation } = await configTab({ viewer });
    await loadConfig(resource);
    navigation.SetAgentContext.mockClear();

    viewer.configChanged.emit({ changeType: 'layout' });
    expect(navigation.SetAgentContext).not.toHaveBeenCalled();

    viewer.layout.panels.push({ title: 'Churn', partTypeId: 'pt-view', config: { type: 'View' } });
    viewer.configChanged.emit({ changeType: 'layout' });
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardPanelCount: 2 });
  });

  it('reports edit mode as the user enters and leaves it', async () => {
    const { resource, navigation } = await configTab({ viewer: viewerDouble([revenuePanel]) });
    await loadConfig(resource);

    resource.ToggleEditMode();
    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: true });

    resource.CancelEdit();
    expect(lastContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: false });
  });

  it('reports the saved dashboard after a save', async () => {
    const viewer = viewerDouble([revenuePanel]);
    const { resource, navigation } = await configTab({ viewer });
    await loadConfig(resource);
    resource.ToggleEditMode();
    navigation.SetAgentContext.mockClear();

    await resource.SaveDashboard();

    expect(viewer.save).toHaveBeenCalled();
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

describe('DashboardResource save', () => {
  type SaveHooks = { NotifyDisplayNameChanged: ReturnType<typeof vi.fn>; ResourceRecordSaved: ReturnType<typeof vi.fn> };

  function savedDashboard(name: string) {
    return { ID: 'dash-config', Name: name, PrimaryKey: { ToURLSegment: () => 'ID|dash-config' } };
  }

  it('gives the tab the saved name and keeps the tab on its dashboard id', async () => {
    const viewer = viewerDouble([]);
    const { resource, internals } = await configTab({ viewer });
    await loadConfig(resource);
    internals['Data'] = { ResourceRecordID: 'dash-config', Configuration: {} };
    const hooks = resource as unknown as SaveHooks;

    viewer.dashboardSaved.emit(savedDashboard('Renamed Board'));

    expect(hooks.NotifyDisplayNameChanged).toHaveBeenCalledWith('Renamed Board');
    // ResourceRecordSaved rewrites this component's Data.ResourceRecordID to the URL-segment form
    // ('ID|dash-config'), while the tab configuration keeps the bare id.
    expect(hooks.ResourceRecordSaved).not.toHaveBeenCalled();
    expect(resource.Data.ResourceRecordID).toBe('dash-config');
  });

  it('keeps the tab title when the saved dashboard has no name', async () => {
    const viewer = viewerDouble([]);
    const { resource } = await configTab({ viewer });
    await loadConfig(resource);
    const hooks = resource as unknown as SaveHooks;

    viewer.dashboardSaved.emit(savedDashboard(''));

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
