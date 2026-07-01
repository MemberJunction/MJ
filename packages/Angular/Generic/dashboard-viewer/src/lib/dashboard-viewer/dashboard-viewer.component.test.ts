import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';

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
  Directive: () => (target: Function) => target,
  Input: () => () => undefined,
  Output: () => () => undefined,
  ViewChild: () => () => undefined,
  EventEmitter: MockEventEmitter,
  ViewEncapsulation: { None: 0 },
  ElementRef: class {},
  ChangeDetectorRef: class {},
  ApplicationRef: class {},
  Injector: class {},
  EnvironmentInjector: class {},
  createComponent: vi.fn(),
}));

vi.mock('@memberjunction/ng-base-types', () => ({
  BaseAngularComponent: class {
    ProviderToUse = {
      CurrentUser: { ID: 'user-1' },
      GetEntityObject: vi.fn(),
    };
  },
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: {},
  RunView: class {},
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: { Instance: { ClassFactory: { CreateInstanceAsync: vi.fn() } } },
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => a === b,
  EscapeHTML: (value: string) => value,
}));

vi.mock('@memberjunction/core-entities', () => ({
  DashboardEngine: {
    Instance: {
      Config: vi.fn().mockResolvedValue(undefined),
      DashboardPartTypes: [],
    },
  },
}));

const initializeMock = vi.fn();
const updateSizeMock = vi.fn();
const destroyMock = vi.fn();

vi.mock('../services/golden-layout-wrapper.service', () => ({
  GoldenLayoutWrapperService: class {
    onLayoutChanged = new Subject();
    onPanelClosed = new Subject();
    onPanelSelected = new Subject();
    initialize = initializeMock;
    updateSize = updateSizeMock;
    destroy = destroyMock;
    getLayoutConfig = vi.fn().mockReturnValue(null);
    addPanel = vi.fn();
    removePanel = vi.fn();
  },
}));

type Rect = { width: number; height: number };

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function createContainer(rect: Rect): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
  } as unknown as HTMLElement;
}

function createDashboard(id: string, config = { layout: null, settings: {} }) {
  return {
    ID: id,
    Name: `Dashboard ${id}`,
    UIConfigDetails: JSON.stringify(config),
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function resolveReadyTimer(): Promise<void> {
  await vi.advanceTimersByTimeAsync(100);
  await flushMicrotasks();
}

describe('DashboardViewerComponent layout lifecycle', () => {
  let DashboardViewerComponent: typeof import('./dashboard-viewer.component').DashboardViewerComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockResizeObserver.instances = [];
    updateSizeMock.mockReset();
    updateSizeMock.mockReturnValue(undefined);
    initializeMock.mockReset();
    destroyMock.mockReset();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    ({ DashboardViewerComponent } = await import('./dashboard-viewer.component'));
  });

  it('resolves readiness immediately for an already-sized container', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const states: string[] = [];
    const deferred: string[] = [];
    let readyCount = 0;
    component.layoutContainer = { nativeElement: createContainer({ width: 800, height: 600 }) } as any;
    component.layoutLifecycle.subscribe(event => states.push(event.state));
    component.layoutDeferred.subscribe(event => deferred.push(event.reason));
    component.layoutReady.subscribe(() => readyCount++);

    component.dashboard = createDashboard('dash-1') as any;
    const ready = component.waitForLayoutReady();

    await flushMicrotasks();
    await resolveReadyTimer();
    await expect(ready).resolves.toBeUndefined();

    expect(states).toEqual(['pending-dashboard', 'pending-parts', 'initializing', 'ready']);
    expect(deferred).toEqual([]);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(updateSizeMock).toHaveBeenCalledTimes(1);
    expect(readyCount).toBe(1);
  });

  it('defers initialization until a zero-sized container receives layout dimensions', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rect = { width: 0, height: 0 };
    const states: string[] = [];
    const deferred: string[] = [];
    let resolved = false;
    component.layoutContainer = { nativeElement: createContainer(rect) } as any;
    component.layoutLifecycle.subscribe(event => states.push(event.state));
    component.layoutDeferred.subscribe(event => deferred.push(event.reason));

    component.dashboard = createDashboard('dash-1') as any;
    component.waitForLayoutReady().then(() => {
      resolved = true;
    });

    await flushMicrotasks();
    expect(states).toContain('waiting-for-size');
    expect(deferred).toEqual(['layout container has zero size']);
    expect(initializeMock).not.toHaveBeenCalled();
    expect(resolved).toBe(false);

    rect.width = 1024;
    rect.height = 768;
    MockResizeObserver.instances[0].trigger();
    await flushMicrotasks();
    await resolveReadyTimer();

    expect(resolved).toBe(true);
    expect(states).toEqual(['pending-dashboard', 'pending-parts', 'waiting-for-size', 'initializing', 'ready']);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(updateSizeMock).toHaveBeenCalledTimes(1);
  });

  it('rejects readiness when a zero-sized container never receives layout dimensions', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const states: Array<{ state: string; error?: Error }> = [];
    const errors: Array<{ message: string; error?: Error }> = [];
    component.layoutContainer = { nativeElement: createContainer({ width: 0, height: 0 }) } as any;
    component.layoutLifecycle.subscribe(event => states.push({ state: event.state, error: event.error }));
    component.error.subscribe(event => errors.push(event));

    component.dashboard = createDashboard('dash-1') as any;
    const ready = component.waitForLayoutReady();
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();

    await expect(ready).rejects.toThrow('stayed at zero size');
    expect(states.map(event => event.state)).toEqual(['pending-dashboard', 'pending-parts', 'waiting-for-size', 'error']);
    expect(states.at(-1)?.error?.message).toContain('stayed at zero size');
    expect(errors[0]?.message).toBe('Failed to initialize dashboard layout');
    expect(errors[0]?.error?.message).toContain('stayed at zero size');
    expect(initializeMock).not.toHaveBeenCalled();
    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not initialize a deferred layout after the component is destroyed', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rect = { width: 0, height: 0 };
    let resolved = false;
    component.layoutContainer = { nativeElement: createContainer(rect) } as any;

    component.dashboard = createDashboard('dash-1') as any;
    component.waitForLayoutReady().then(() => {
      resolved = true;
    });
    await flushMicrotasks();

    component.ngOnDestroy();
    await flushMicrotasks();

    rect.width = 800;
    rect.height = 600;
    MockResizeObserver.instances[0].trigger();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();

    expect(resolved).toBe(true);
    expect(initializeMock).not.toHaveBeenCalled();
    expect(updateSizeMock).not.toHaveBeenCalled();
    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale deferred layout cycle resolve the active dashboard readiness', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const rect = { width: 0, height: 0 };
    const states: Array<{ state: string; dashboardId?: string }> = [];
    component.layoutContainer = { nativeElement: createContainer(rect) } as any;
    component.layoutLifecycle.subscribe(event => states.push({ state: event.state, dashboardId: event.dashboardId }));

    component.dashboard = createDashboard('dash-1') as any;
    const staleReady = component.waitForLayoutReady();
    let staleResolved = false;
    staleReady.then(() => {
      staleResolved = true;
    });
    await flushMicrotasks();

    rect.width = 900;
    rect.height = 700;
    component.dashboard = createDashboard('dash-2') as any;
    const activeReady = component.waitForLayoutReady();
    await flushMicrotasks();
    await resolveReadyTimer();

    await expect(activeReady).resolves.toBeUndefined();
    expect(staleResolved).toBe(true);
    expect(states).toEqual([
      { state: 'pending-dashboard', dashboardId: 'dash-1' },
      { state: 'pending-parts', dashboardId: 'dash-1' },
      { state: 'waiting-for-size', dashboardId: 'dash-1' },
      { state: 'pending-dashboard', dashboardId: 'dash-2' },
      { state: 'pending-parts', dashboardId: 'dash-2' },
      { state: 'initializing', dashboardId: 'dash-2' },
      { state: 'ready', dashboardId: 'dash-2' },
    ]);
    expect(updateSizeMock).toHaveBeenCalledTimes(1);
  });

  it('rejects readiness and emits error lifecycle when first size update fails', async () => {
    const component = new DashboardViewerComponent(
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const failure = new Error('update failed');
    const states: Array<{ state: string; error?: Error }> = [];
    const errors: Array<{ message: string; error?: Error }> = [];
    component.layoutContainer = { nativeElement: createContainer({ width: 800, height: 600 }) } as any;
    component.layoutLifecycle.subscribe(event => states.push({ state: event.state, error: event.error }));
    component.error.subscribe(event => errors.push(event));
    updateSizeMock.mockImplementation(() => {
      throw failure;
    });

    component.dashboard = createDashboard('dash-1') as any;
    const ready = component.waitForLayoutReady();
    await flushMicrotasks();
    await resolveReadyTimer();

    await expect(ready).rejects.toThrow('update failed');
    expect(states.map(event => event.state)).toEqual(['pending-dashboard', 'pending-parts', 'initializing', 'error']);
    expect(states.at(-1)?.error).toBe(failure);
    expect(errors).toEqual([{ message: 'Failed to initialize dashboard layout', error: failure }]);
  });
});
