import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  EventEmitter: MockEventEmitter,
  ElementRef: class {},
  ViewContainerRef: class {},
  ChangeDetectorRef: class {},
  inject: vi.fn(() => ({ OpenDashboard: vi.fn() })),
}));

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    Data: any = {};
    ProviderToUse = { CurrentUser: { ID: 'user-1' } };
    NotifyLoadComplete = vi.fn();
    ResourceRecordSaved = vi.fn();
    getTabId = vi.fn(() => 'host-tab-1');
  },
  NavigationService: class {},
  BaseDashboard: class {},
  DashboardConfig: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJDashboardEntity: class {},
  MJDashboardUserStateEntity: class {},
  MJDashboardCategoryEntity: class {},
  MJDashboardPartTypeEntity: class {},
  DashboardEngine: {
    Instance: {
      DashboardCategories: [],
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
  SafeJSONParse: vi.fn(),
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => a === b,
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: {},
  CompositeKey: class {},
  RunView: class {},
  LogError: vi.fn(),
}));

vi.mock('@memberjunction/ng-dashboard-viewer', () => ({
  DashboardViewerComponent: class {},
}));

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
      waitForLayoutReady: ReturnType<typeof vi.fn>;
    } = {
      navigationRequested: new MockEventEmitter(),
      openInTab: new MockEventEmitter(),
      dashboardSaved: new MockEventEmitter(),
      error: new MockEventEmitter(),
      waitForLayoutReady: vi.fn(() => new Promise<void>(resolve => {
        resolveReady = resolve;
      })),
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
    resource.navigationService = { OpenDashboard: vi.fn() };
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
