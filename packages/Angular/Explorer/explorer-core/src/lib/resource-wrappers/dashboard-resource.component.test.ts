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
  MJGlobal: {},
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
