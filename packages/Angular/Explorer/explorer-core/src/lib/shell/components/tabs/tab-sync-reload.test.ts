/**
 * Logic spec for the main layout's reload decision in `syncTabsWithConfiguration`.
 *
 * The sync runs on EVERY workspace configuration emission. A tab's content reloads only when
 * the tab now describes different content than its live component shows. Two differences
 * between the component's `Data` and the tab do not change the content: `ResourceData.ResourceType`
 * is the ResourceType row name ('User Views') while a tab may carry an alias ('MJ: User Views'),
 * and ResourceRecordSaved rewrites the component's `ResourceRecordID` to the URL-segment form
 * ('ID|<uuid>') while the tab keeps the bare id. Reading either as "content changed" reattaches
 * the same cached component on every emission, and the reattach itself emits again. The
 * dashboard tab does not call ResourceRecordSaved, so it never rewrites its id.
 *
 * Node preset (not `.dom.test.ts`): the component is reached via Object.create, as in
 * records-tab-reload.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Component:
    () =>
    <T>(target: T) =>
      target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  HostListener: () => () => undefined,
  EventEmitter: class {
    emit() {}
  },
  ElementRef: class {},
  ApplicationRef: class {},
  EnvironmentInjector: class {},
  ChangeDetectorRef: class {},
  ComponentRef: class {},
  ViewEncapsulation: { None: 0 },
  runInInjectionContext: vi.fn(),
  createComponent: vi.fn(),
  inject: vi.fn(() => ({})),
}));
vi.mock('@memberjunction/ng-base-application', () => ({
  GoldenLayoutManager: class {},
  WorkspaceStateManager: class {},
  ApplicationManager: class {},
  FlattenLayoutToSingleStack: vi.fn(),
}));
vi.mock('@memberjunction/global', () => ({ MJGlobal: { Instance: { ClassFactory: {} } } }));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {},
  HomeAppPinService: class {},
  NavigationService: class {},
  ExplorerBreakpointService: class {},
  IsRecordTabsStyle: vi.fn(() => false),
  IsRecordsTabConfiguration: vi.fn(() => false),
  IsRecordsRegionTab: vi.fn(() => false),
  IsRecordDockedToWorkspace: vi.fn(() => false),
  RECORD_DOCKED_TO_WORKSPACE_KEY: 'recordDockedToWorkspace',
  GetRecordSourceContext: vi.fn(() => null),
  SafeDetectChanges: vi.fn(),
  ResolveRecordTypeIcon: vi.fn(() => ''),
}));
vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJResourceTypeEntity: class {},
  ResourcePermissionEngine: { Instance: {} },
}));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: class {} }));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('../record-open/record-origin-crumb.component', () => ({ RecordOriginCrumbComponent: class {} }));
vi.mock('../record-open/record-switcher.service', () => ({ RecordSwitcherService: class {} }));
vi.mock('../record-open/record-switcher-sheet.component', () => ({}));
vi.mock('./component-cache-manager', () => ({ ComponentCacheManager: class {} }));

import { TabContainerComponent } from './tab-container.component';

interface TestTab {
  id: string;
  applicationId: string;
  title: string;
  resourceRecordId: string;
  isPinned: boolean;
  configuration: Record<string, unknown>;
}

/** The live component's Data, as the resource component holds it. */
interface LiveData {
  ResourceType: string;
  ResourceRecordID: string;
  Configuration: Record<string, unknown>;
}

function tab(resourceType: string, recordId: string, extra: Record<string, unknown> = {}): TestTab {
  return {
    id: 'tab-1',
    applicationId: 'app-home',
    title: 'Tab',
    resourceRecordId: recordId,
    isPinned: true,
    configuration: { resourceType, recordId, ...extra },
  };
}

/** `tabConfiguration` is the tab configuration the component was loaded with; its Data keeps a copy. */
function liveData(resourceType: string, recordId: string, driverClass: string, tabConfiguration: Record<string, unknown> = {}): LiveData {
  return {
    ResourceType: resourceType,
    ResourceRecordID: recordId,
    Configuration: { ...tabConfiguration, applicationId: 'app-home', resourceTypeDriverClass: driverClass, tabId: 'tab-1' },
  };
}

interface Harness {
  component: TabContainerComponent;
  internals: Record<string, unknown>;
  setTab(next: TestTab): void;
  cleanupTabComponent: ReturnType<typeof vi.fn>;
  markNotLoaded: ReturnType<typeof vi.fn>;
  loadTabContent: ReturnType<typeof vi.fn>;
}

/**
 * A tab container whose main layout holds `initial`, with `live` as the Data of the cached
 * component the tab's content load reattaches.
 */
function createHarness(initial: TestTab, live: LiveData): Harness {
  let current = initial;
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  // A reattach reads IsEditing to decide whether to pin an editing records tab.
  const instance = { Data: live, LoadComplete: false, RebindTabId: vi.fn(), IsEditing: () => false };
  const cleanupTabComponent = vi.fn();
  const markNotLoaded = vi.fn();

  // Object.create skips field initializers, so the collections a constructed component owns are set here.
  internals['componentRefs'] = new Map();
  internals['tabsCurrentlyLoading'] = new Set<string>();
  internals['layoutInitialized'] = true;
  internals['layoutManager'] = {
    IsInitialized: true,
    GetAllTabIds: () => [current.id],
    RemoveTab: vi.fn(),
    MarkTabNotLoaded: markNotLoaded,
    GetContainer: vi.fn(() => ({ element: { innerHTML: '', appendChild: vi.fn() } })),
    UpdateTabStyle: vi.fn(),
    FocusTab: vi.fn(),
  };
  internals['workspaceManager'] = {
    GetTab: (id: string) => (id === current.id ? current : undefined),
    GetConfiguration: () => ({ activeTabId: current.id, tabs: [current] }),
    UpdateTabResourceRecordId: vi.fn((id: string, recordId: string) => {
      if (id === current.id) {
        current = { ...current, resourceRecordId: recordId, configuration: { ...current.configuration, recordId } };
      }
    }),
  };
  internals['appManager'] = { GetAppById: () => undefined };
  internals['cacheManager'] = {
    getCachedComponent: vi.fn(() => ({ componentRef: { instance }, wrapperElement: {} })),
    markAsAttached: vi.fn(),
    rekeyComponent: vi.fn(() => true),
  };
  internals['getResourceDataFromTab'] = vi.fn(async (t: TestTab) => ({
    ResourceRecordID: (t.configuration['recordId'] as string) || t.resourceRecordId,
    Configuration: { ...t.configuration, applicationId: t.applicationId, resourceTypeDriverClass: live.Configuration['resourceTypeDriverClass'], tabId: t.id },
  }));
  internals['ensureRecordOriginCrumb'] = vi.fn();
  internals['emitFirstLoadCompleteOnce'] = vi.fn();
  internals['updateTabDisplayName'] = vi.fn();
  internals['upgradeNavTabIcon'] = vi.fn(async () => undefined);
  internals['updateOriginCrumb'] = vi.fn();
  internals['refreshTabTitleAfterSave'] = vi.fn(async () => undefined);
  internals['UseSingleResourceMode'] = false;
  internals['currentSingleResourceSignature'] = null;
  internals['singleResourceCacheIdentity'] = null;

  return {
    component,
    internals,
    setTab: (next: TestTab) => {
      current = next;
    },
    cleanupTabComponent,
    markNotLoaded,
    loadTabContent: vi.fn(),
  };
}

type Internals = {
  loadTabContent(tabId: string, container: unknown): Promise<void>;
  syncTabsWithConfiguration(tabs: TestTab[]): void;
  handleResourceRecordSaved(driverClass: string, appId: string, tabId: string, instance: unknown, entity: unknown): void;
};

/** Loads the tab's content through the real load path (a cache reattach). */
async function load(h: Harness): Promise<void> {
  const container = { element: { innerHTML: '', appendChild: vi.fn() } };
  await (h.component as unknown as Internals).loadTabContent('tab-1', container);
  // Every later reload goes to the spies, so only the sync's decision is observed.
  h.internals['cleanupTabComponent'] = h.cleanupTabComponent;
  h.internals['loadTabContent'] = h.loadTabContent;
}

function sync(h: Harness, t: TestTab): void {
  (h.component as unknown as Internals).syncTabsWithConfiguration([t]);
}

describe('TabContainerComponent.IsSameRecordId', () => {
  it('treats a single-field URL segment and its bare value as the same record', () => {
    expect(TabContainerComponent.IsSameRecordId('ID|dash-1', 'dash-1')).toBe(true);
    expect(TabContainerComponent.IsSameRecordId('dash-1', 'ID|dash-1')).toBe(true);
    expect(TabContainerComponent.IsSameRecordId(' ID|dash-1 ', 'dash-1')).toBe(true);
  });

  it('keeps different records different', () => {
    expect(TabContainerComponent.IsSameRecordId('ID|dash-1', 'dash-2')).toBe(false);
    expect(TabContainerComponent.IsSameRecordId('dash-1', '')).toBe(false);
    expect(TabContainerComponent.IsSameRecordId('dash-1', undefined)).toBe(false);
  });

  it('compares a key with more than one field as it is', () => {
    expect(TabContainerComponent.IsSameRecordId('OrderID|1||LineNo|3', 'OrderID|1||LineNo|3')).toBe(true);
    expect(TabContainerComponent.IsSameRecordId('OrderID|1||LineNo|3', '3')).toBe(false);
  });

  it('keeps two ids that both contain one | different when the text before it differs', () => {
    expect(TabContainerComponent.IsSameRecordId('search-foo|bar', 'search-baz|bar')).toBe(false);
    expect(TabContainerComponent.IsSameRecordId('ID|x', 'Name|x')).toBe(false);
  });
});

describe('main layout sync — reload only when the tab content changes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a view tab whose component reports the ResourceType row name, not the tab alias', async () => {
    const view = tab('MJ: User Views', 'view-1', { viewId: 'view-1' });
    const h = createHarness(view, liveData('User Views', 'view-1', 'ViewResource'));
    await load(h);

    sync(h, view);
    sync(h, { ...view, title: 'My Employees' });

    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    expect(h.markNotLoaded).not.toHaveBeenCalled();
    expect(h.loadTabContent).not.toHaveBeenCalled();
  });

  it('keeps a tab whose component rewrote its record id to the URL-segment form', async () => {
    const dashboard = tab('Dashboards', 'dash-1', { dashboardId: 'dash-1' });
    const live = liveData('Dashboards', 'dash-1', 'DashboardResource');
    const h = createHarness(dashboard, live);
    await load(h);
    // BaseResourceComponent.ResourceRecordSaved stores the URL-segment form.
    live.ResourceRecordID = 'ID|dash-1';

    sync(h, { ...dashboard, title: 'Revenue Board' });

    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    expect(h.loadTabContent).not.toHaveBeenCalled();
  });

  it('reloads the active tab when it now describes a different record', async () => {
    const dashboard = tab('Dashboards', 'dash-1', { dashboardId: 'dash-1' });
    const h = createHarness(dashboard, liveData('Dashboards', 'dash-1', 'DashboardResource'));
    await load(h);
    const replaced = tab('Dashboards', 'dash-2', { dashboardId: 'dash-2' });
    h.setTab(replaced);

    sync(h, replaced);

    expect(h.cleanupTabComponent).toHaveBeenCalledWith('tab-1');
    expect(h.markNotLoaded).toHaveBeenCalledWith('tab-1');
    expect(h.loadTabContent).toHaveBeenCalledTimes(1);
  });

  it('reloads when the tab moved to a different resource type', async () => {
    const view = tab('MJ: User Views', 'rec-1');
    const h = createHarness(view, liveData('User Views', 'rec-1', 'ViewResource'));
    await load(h);
    const query = tab('Queries', 'rec-1');
    h.setTab(query);

    sync(h, query);

    expect(h.cleanupTabComponent).toHaveBeenCalledWith('tab-1');
  });

  it('keeps a new record tab once its save gives it a record id', async () => {
    const newRecord = tab('Records', '', { Entity: 'Widgets', isNew: true });
    const live = liveData('Records', '', 'RecordResource', newRecord.configuration);
    const h = createHarness(newRecord, live);
    await load(h);
    live.ResourceRecordID = 'ID|w-1';
    const entity = { PrimaryKey: { ToURLSegment: () => 'ID|w-1' } };

    (h.component as unknown as Internals).handleResourceRecordSaved('RecordResource', 'app-home', 'tab-1', { Data: live }, entity);
    const saved = (h.internals['workspaceManager'] as { GetTab(id: string): TestTab }).GetTab('tab-1');
    sync(h, saved);

    expect(saved.resourceRecordId).toBe('ID|w-1');
    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
  });
});
