/**
 * A record pane must never stay blank (golive #472 class of bug: "Reset Layout fixes it").
 *
 * Golden Layout can re-render a pane's element while its content load is awaiting, and a load
 * asked for during that await used to be dropped. The pane on screen then stayed empty, and
 * re-opening the same record only re-focused the tab, so nothing retried until Reset Layout
 * deleted the tab. These specs cover the three repairs:
 *   - a load attaches to the LIVE container, not the one it was handed before an await;
 *   - a load asked for while one is in flight is queued and run, not dropped;
 *   - re-activating a record tab whose pane is empty loads it again.
 * Plus: a tab whose resource data can't be built shows an error instead of nothing.
 *
 * Node preset, component reached via Object.create — same approach as records-tab-reload.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  HostListener: () => () => undefined,
  EventEmitter: class { emit() {} },
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
  IsRecordTabsStyle: vi.fn(() => true),
  IsRecordsTabConfiguration: vi.fn(() => true),
  IsRecordsRegionTab: vi.fn(() => true),
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

/** A pane element: tracks what was appended and whether it is still in the document. */
interface FakePane {
  innerHTML: string;
  isConnected: boolean;
  children: unknown[];
  readonly childElementCount: number;
  appendChild(child: unknown): void;
}
function pane(isConnected = true): FakePane {
  const p: FakePane = {
    innerHTML: '',
    isConnected,
    children: [],
    get childElementCount() { return p.children.length; },
    appendChild(child: unknown) { p.children.push(child); },
  };
  // Clearing innerHTML empties the pane, as in the DOM.
  let html = '';
  Object.defineProperty(p, 'innerHTML', {
    get: () => html,
    set: (v: string) => { html = v; if (v === '') p.children = []; },
  });
  return p;
}

const TAB = {
  id: 'tab-1',
  applicationId: 'app-1',
  title: 'Orders - o1',
  resourceRecordId: 'o1',
  isPinned: false,
  configuration: { resourceType: 'Records', Entity: 'Orders', recordId: 'o1' },
};

interface Harness {
  component: TabContainerComponent;
  internals: Record<string, unknown>;
  live: { element: FakePane };
  wrapper: object;
  markLoaded: ReturnType<typeof vi.fn>;
  markNotLoaded: ReturnType<typeof vi.fn>;
  getResourceData: ReturnType<typeof vi.fn>;
}

/** A records-region tab whose content is a cached component (the reattach path). */
function createHarness(): Harness {
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  const live = { element: pane() };
  const wrapper = { tag: 'cached-wrapper' };
  const markLoaded = vi.fn();
  const markNotLoaded = vi.fn();
  const getResourceData = vi.fn(async () => ({
    ResourceRecordID: 'o1',
    ResourceType: 'Records',
    Configuration: { Entity: 'Orders', resourceTypeDriverClass: 'EntityRecordResource' },
  }));

  // Object.create skips field initializers, so the collections a constructed component owns are set here.
  internals['componentRefs'] = new Map();
  internals['tabsCurrentlyLoading'] = new Set<string>();
  internals['queuedTabLoads'] = new Map<string, unknown>();
  internals['pendingRecordShows'] = new Set<string>();
  internals['ShowRecordsRegion'] = true;
  internals['recordsCreatingTabs'] = false;
  internals['recordsRebuilding'] = false;
  internals['recordsLayoutManager'] = {
    GetContainer: vi.fn(() => live),
    MarkTabLoaded: markLoaded,
    MarkTabNotLoaded: markNotLoaded,
  };
  internals['layoutManager'] = { GetContainer: vi.fn(() => undefined) };
  internals['workspaceManager'] = {
    GetTab: (id: string) => (id === TAB.id ? TAB : undefined),
    GetActiveTabId: () => TAB.id,
  };
  internals['isRecordTab'] = () => true;
  internals['getResourceDataFromTab'] = getResourceData;
  internals['ensureRecordOriginCrumb'] = vi.fn();
  internals['resolveCacheDiscriminator'] = () => undefined;
  internals['cacheManager'] = {
    getCachedComponent: vi.fn(() => ({
      componentRef: { instance: { RebindTabId: vi.fn(), LoadComplete: false } },
      wrapperElement: wrapper,
    })),
    markAsAttached: vi.fn(),
  };
  internals['promoteIfReattachedEditing'] = vi.fn();
  internals['wireContainerVisibilityEvents'] = vi.fn();
  internals['isTabCurrentlyVisible'] = () => true;
  internals['ActivateTabView'] = vi.fn();
  internals['DeactivateTabView'] = vi.fn();
  internals['emitFirstLoadCompleteOnce'] = vi.fn();
  return { component, internals, live, wrapper, markLoaded, markNotLoaded, getResourceData };
}

type Private = {
  loadTabContent(tabId: string, container: unknown): Promise<void>;
  reloadBlankActiveRecordTab(tabId: string): void;
};
const priv = (h: Harness) => h.component as unknown as Private;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('record pane never stays blank', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches to the live pane when GL replaced the container during the load', async () => {
    const h = createHarness();
    const stale = { element: pane(false) };
    await priv(h).loadTabContent(TAB.id, stale);
    expect(h.live.element.children).toContain(h.wrapper);
    expect(stale.element.children).not.toContain(h.wrapper);
  });

  it('keeps the container it was handed while that container is still in the document', async () => {
    const h = createHarness();
    const handed = { element: pane(true) };
    await priv(h).loadTabContent(TAB.id, handed);
    expect(handed.element.children).toContain(h.wrapper);
    expect(h.live.element.children).toHaveLength(0);
  });

  it('queues a load asked for while one is in flight, then runs it into the live pane', async () => {
    const h = createHarness();
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const data = await (h.getResourceData as unknown as () => Promise<unknown>)();
    h.getResourceData.mockImplementationOnce(async () => { await gate; return data; });

    const first = priv(h).loadTabContent(TAB.id, { element: pane(false) });
    await priv(h).loadTabContent(TAB.id, { element: pane(true) });   // used to be dropped here
    release();
    await first;
    await flush();

    expect(h.getResourceData).toHaveBeenCalledTimes(3);   // 1 above + the in-flight load + the queued one
    expect(h.live.element.children).toContain(h.wrapper);
    expect(h.markLoaded).toHaveBeenCalledWith(TAB.id);
  });

  it('shows an error in the pane when the tab\'s resource data cannot be built', async () => {
    const h = createHarness();
    const renderError = vi.fn();
    h.internals['renderTabErrorCard'] = renderError;
    h.getResourceData.mockResolvedValueOnce(null);
    await priv(h).loadTabContent(TAB.id, h.live);
    expect(renderError).toHaveBeenCalledWith(h.live.element, expect.objectContaining({ Title: 'This tab could not be opened.' }));
  });

  describe('re-activating a record tab', () => {
    it('loads it again when its pane is empty', async () => {
      const h = createHarness();
      priv(h).reloadBlankActiveRecordTab(TAB.id);
      await flush();
      expect(h.markNotLoaded).toHaveBeenCalledWith(TAB.id);
      expect(h.live.element.children).toContain(h.wrapper);
      expect(h.markLoaded).toHaveBeenCalledWith(TAB.id);
    });

    it('leaves a pane with content alone', () => {
      const h = createHarness();
      h.live.element.appendChild({});
      priv(h).reloadBlankActiveRecordTab(TAB.id);
      expect(h.getResourceData).not.toHaveBeenCalled();
    });

    it('leaves a pane that is loading, or whose show is parked, alone', () => {
      const h = createHarness();
      (h.internals['tabsCurrentlyLoading'] as Set<string>).add(TAB.id);
      priv(h).reloadBlankActiveRecordTab(TAB.id);
      (h.internals['tabsCurrentlyLoading'] as Set<string>).clear();
      (h.internals['pendingRecordShows'] as Set<string>).add(TAB.id);
      priv(h).reloadBlankActiveRecordTab(TAB.id);
      expect(h.getResourceData).not.toHaveBeenCalled();
    });

    it('stands down while the region is hidden, being built or being rebuilt', () => {
      for (const [flag, value] of [['ShowRecordsRegion', false], ['recordsCreatingTabs', true], ['recordsRebuilding', true]] as const) {
        const h = createHarness();
        h.internals[flag] = value;
        priv(h).reloadBlankActiveRecordTab(TAB.id);
        expect(h.getResourceData).not.toHaveBeenCalled();
      }
    });
  });
});
