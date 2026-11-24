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
 * The cache double honors isAttached like the real ComponentCacheManager (an attached entry is a
 * miss; caching again overwrites), so a reload that skips cleanup shows up as a second component.
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

import { createComponent } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { TabContainerComponent } from './tab-container.component';

/** An element: class list and parent, enough for the pane and wrapper checks. */
interface FakeEl {
  tag: string;
  parentElement: FakePane | null;
  classList: { contains(c: string): boolean };
}
function el(tag: string, ...classes: string[]): FakeEl {
  return { tag, parentElement: null, classList: { contains: c => classes.includes(c) } };
}

/** A pane element: tracks what was appended and whether it is still in the document. */
interface FakePane {
  innerHTML: string;
  isConnected: boolean;
  children: FakeEl[];
  readonly childElementCount: number;
  appendChild(child: FakeEl): void;
  contains(child: FakeEl): boolean;
}
function pane(isConnected = true): FakePane {
  const p = {
    isConnected,
    children: [] as FakeEl[],
    get childElementCount() { return p.children.length; },
    appendChild(child: FakeEl) {
      child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1);
      child.parentElement = p as unknown as FakePane;
      p.children.push(child);
    },
    contains(child: FakeEl) { return p.children.includes(child); },
  } as unknown as FakePane;
  // Clearing innerHTML empties the pane, as in the DOM.
  let html = '';
  Object.defineProperty(p, 'innerHTML', {
    get: () => html,
    set: (v: string) => {
      html = v;
      if (v === '') {
        p.children.forEach(c => { c.parentElement = null; });
        p.children = [];
      }
    },
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

/** One cache entry, keyed by nothing (the harness has one resource). Mirrors ComponentCacheManager. */
interface FakeCache {
  entry: { componentRef: unknown; wrapperElement: FakeEl; isAttached: boolean; attachedToTabId: string | null } | null;
  getCachedComponent: ReturnType<typeof vi.fn>;
  markAsAttached: ReturnType<typeof vi.fn>;
  cacheComponent: ReturnType<typeof vi.fn>;
  findAndDetachByTabId: ReturnType<typeof vi.fn>;
}
function fakeCache(): FakeCache {
  const cache: FakeCache = {
    entry: null,
    getCachedComponent: vi.fn(() => (cache.entry && !cache.entry.isAttached ? cache.entry : null)),
    markAsAttached: vi.fn((_d, _r, _a, tabId: string) => {
      if (cache.entry) { cache.entry.isAttached = true; cache.entry.attachedToTabId = tabId; }
    }),
    cacheComponent: vi.fn((componentRef: unknown, wrapperElement: FakeEl, _data: unknown, tabId: string) => {
      cache.entry = { componentRef, wrapperElement, isAttached: true, attachedToTabId: tabId };
    }),
    findAndDetachByTabId: vi.fn((tabId: string) => {
      if (cache.entry?.attachedToTabId !== tabId) return null;
      cache.entry.isAttached = false;
      cache.entry.attachedToTabId = null;
      return cache.entry;
    }),
  };
  return cache;
}

interface Harness {
  component: TabContainerComponent;
  internals: Record<string, unknown>;
  live: { element: FakePane };
  wrapper: FakeEl;
  cache: FakeCache;
  appRef: { attachView: ReturnType<typeof vi.fn>; detachView: ReturnType<typeof vi.fn> };
  markLoaded: ReturnType<typeof vi.fn>;
  markNotLoaded: ReturnType<typeof vi.fn>;
  getResourceData: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
}

/** A records-region tab. By default its content is a detached cached component (the reattach path). */
function createHarness(opts: { cached?: boolean } = {}): Harness {
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  const live = { element: pane() };
  const wrapper = el('cached-wrapper', 'tab-content-wrapper');
  const cache = fakeCache();
  if (opts.cached !== false) {
    cache.entry = {
      componentRef: { instance: { RebindTabId: vi.fn(), LoadComplete: false } },
      wrapperElement: wrapper,
      isAttached: false,
      attachedToTabId: null,
    };
  }
  const markLoaded = vi.fn();
  const markNotLoaded = vi.fn();
  const getContainer = vi.fn(() => live);
  const getResourceData = vi.fn(async () => ({
    ResourceRecordID: 'o1',
    ResourceType: 'Records',
    Configuration: { Entity: 'Orders', resourceTypeDriverClass: 'EntityRecordResource' },
  }));
  const appRef = { attachView: vi.fn(), detachView: vi.fn() };

  // Object.create skips field initializers, so the collections a constructed component owns are set here.
  internals['componentRefs'] = new Map();
  internals['originCrumbRefs'] = new Map();
  internals['tabsCurrentlyLoading'] = new Set<string>();
  internals['queuedTabLoads'] = new Map<string, unknown>();
  internals['tabLoadGenerations'] = new Map<string, number>();
  internals['mountedTabContent'] = new Map<string, unknown>();
  internals['isDestroyed'] = false;
  internals['pendingRecordShows'] = new Set<string>();
  internals['ShowRecordsRegion'] = true;
  internals['recordsCreatingTabs'] = false;
  internals['recordsRebuilding'] = false;
  internals['recordsLayoutManager'] = {
    GetContainer: getContainer,
    MarkTabLoaded: markLoaded,
    MarkTabNotLoaded: markNotLoaded,
  };
  internals['layoutManager'] = { GetContainer: vi.fn(() => undefined) };
  const openTabs = new Set([TAB.id]);
  internals['workspaceManager'] = {
    GetTab: (id: string) => (openTabs.has(id) ? TAB : undefined),
    GetActiveTabId: () => TAB.id,
    CloseTab: (id: string) => openTabs.delete(id),
  };
  internals['appRef'] = appRef;
  internals['environmentInjector'] = {};
  internals['isRecordTab'] = () => true;
  internals['getResourceDataFromTab'] = getResourceData;
  internals['ensureRecordOriginCrumb'] = vi.fn();
  internals['resolveCacheDiscriminator'] = () => undefined;
  internals['cacheManager'] = cache;
  internals['getHiddenTabIds'] = () => new Set<string>();
  internals['promoteIfReattachedEditing'] = vi.fn();
  internals['wireContainerVisibilityEvents'] = vi.fn();
  internals['wireEditModePromotion'] = vi.fn();
  internals['isTabCurrentlyVisible'] = () => true;
  internals['ActivateTabView'] = vi.fn();
  internals['DeactivateTabView'] = vi.fn();
  internals['emitFirstLoadCompleteOnce'] = vi.fn();
  return { component, internals, live, wrapper, cache, appRef, markLoaded, markNotLoaded, getResourceData, getContainer };
}

/** Route the uncached path: a registration lookup gated on `gate`, and fake components/elements. */
function useUncachedPath(gate: Promise<void> = Promise.resolve()) {
  (MJGlobal.Instance.ClassFactory as unknown as Record<string, unknown>)['GetRegistrationAsync'] =
    vi.fn(async () => { await gate; return { SubClass: class {} }; });
  vi.mocked(createComponent).mockImplementation(() => ({
    instance: {},
    hostView: { rootNodes: [el('component-host')] },
  }) as never);
  (globalThis as Record<string, unknown>)['document'] = {
    createElement: () => {
      const wrapperEl = el('div', 'tab-content-wrapper') as FakeEl & { style: object; className: string };
      wrapperEl.style = {};
      (wrapperEl as unknown as { appendChild(): void }).appendChild = () => undefined;
      return wrapperEl;
    },
  };
}

/** A promise resolved by the returned function. */
function gated(): { gate: Promise<void>; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  return { gate, release };
}

type Private = {
  loadTabContent(tabId: string, container: unknown): Promise<void>;
  reloadBlankActiveRecordTab(tabId: string): void;
  cleanupTabComponent(tabId: string): void;
  destroyOriginCrumbsIn(host: unknown): void;
};
const priv = (h: Harness) => h.component as unknown as Private;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Hold the resource-data lookup of the NEXT load until `release` is called. */
async function holdNextResourceData(h: Harness): Promise<() => void> {
  const { gate, release } = gated();
  const data = await (h.getResourceData as unknown as () => Promise<unknown>)();
  h.getResourceData.mockClear();
  h.getResourceData.mockImplementationOnce(async () => { await gate; return data; });
  return release;
}

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

  it('mounts nothing when the container left the document and GL has no live one', async () => {
    const h = createHarness();
    h.getContainer.mockReturnValue(undefined as never);
    const dead = { element: pane(false) };
    await priv(h).loadTabContent(TAB.id, dead);
    expect(dead.element.children).toHaveLength(0);
    expect(h.cache.markAsAttached).not.toHaveBeenCalled();
  });

  it('runs a load queued while one is in flight when the in-flight one did not reach the live pane', async () => {
    const h = createHarness();
    const release = await holdNextResourceData(h);
    const first = priv(h).loadTabContent(TAB.id, { element: pane(false) });
    h.getContainer.mockReturnValueOnce(undefined as never);   // GL has no live pane when the first load resumes
    await priv(h).loadTabContent(TAB.id, h.live);              // used to be dropped here
    release();
    await first;
    await flush();

    expect(h.getResourceData).toHaveBeenCalledTimes(2);       // the in-flight load + the queued one
    expect(h.live.element.children).toContain(h.wrapper);
    expect(h.markLoaded).toHaveBeenCalledWith(TAB.id);
  });

  it('skips a queued load when the in-flight one already mounted into the live pane', async () => {
    const h = createHarness();
    const release = await holdNextResourceData(h);
    const first = priv(h).loadTabContent(TAB.id, { element: pane(false) });
    await priv(h).loadTabContent(TAB.id, h.live);
    release();
    await first;
    await flush();

    expect(h.getResourceData).toHaveBeenCalledTimes(1);
    expect(h.live.element.children).toEqual([h.wrapper]);
    expect(h.cache.markAsAttached).toHaveBeenCalledTimes(1);
    expect(h.markLoaded).toHaveBeenCalledWith(TAB.id);
  });

  it('builds one component when a queued load follows an uncached in-flight load', async () => {
    const h = createHarness({ cached: false });
    const { gate, release } = gated();
    useUncachedPath(gate);
    const first = priv(h).loadTabContent(TAB.id, h.live);
    h.getContainer.mockReturnValueOnce(undefined as never);
    const discarded = { element: pane(true) };
    await priv(h).loadTabContent(TAB.id, discarded);           // queued
    release();
    await first;
    await flush();

    expect(createComponent).toHaveBeenCalledTimes(1);
    expect(h.appRef.attachView).toHaveBeenCalledTimes(1);
    expect(h.cache.cacheComponent).toHaveBeenCalledTimes(1);
  });

  it('moves to the live pane, crumb included, when GL swapped it during the registration lookup', async () => {
    const h = createHarness({ cached: false });
    const { gate, release } = gated();
    useUncachedPath(gate);
    const handed = { element: pane(true) };
    h.getContainer.mockReturnValue(h.live);
    const load = priv(h).loadTabContent(TAB.id, handed);
    await flush();
    handed.element.isConnected = false;                        // GL re-renders the pane mid-lookup
    release();
    await load;

    expect(h.live.element.childElementCount).toBe(1);
    expect(handed.element.children).toHaveLength(0);
    expect(h.internals['ensureRecordOriginCrumb']).toHaveBeenLastCalledWith(TAB, h.live.element);
  });

  it('stands down when the tab is cleaned up mid-load, and drops the load queued behind it', async () => {
    const h = createHarness();
    const release = await holdNextResourceData(h);
    const first = priv(h).loadTabContent(TAB.id, h.live);
    await priv(h).loadTabContent(TAB.id, h.live);              // queued
    priv(h).cleanupTabComponent(TAB.id);                       // close / region move
    release();
    await first;
    await flush();

    expect(h.live.element.children).toHaveLength(0);
    expect(h.getResourceData).toHaveBeenCalledTimes(1);
    expect(h.cache.markAsAttached).not.toHaveBeenCalled();
  });

  it('stands down when the component is destroyed mid-load', async () => {
    const h = createHarness();
    Object.assign(h.internals, {
      subscriptions: [],
      recordsLayoutInitialized: false,
      cleanupSingleResourceComponent: vi.fn(),
    });
    (h.cache as unknown as Record<string, unknown>)['clearCache'] = vi.fn();
    const release = await holdNextResourceData(h);
    const first = priv(h).loadTabContent(TAB.id, h.live);
    await priv(h).loadTabContent(TAB.id, h.live);              // queued
    h.component.ngOnDestroy();
    release();
    await first;
    await flush();

    expect(h.live.element.children).toHaveLength(0);
    expect(h.getResourceData).toHaveBeenCalledTimes(1);
  });

  it('shows an error in the pane when the tab\'s resource data cannot be built', async () => {
    const h = createHarness();
    const renderError = vi.fn();
    h.internals['renderTabErrorCard'] = renderError;
    h.getResourceData.mockResolvedValueOnce(null);
    await priv(h).loadTabContent(TAB.id, h.live);
    expect(renderError).toHaveBeenCalledWith(h.live.element, expect.objectContaining({ Title: 'This tab could not be opened.' }));
  });

  it('destroys the crumbs inside a pane an error card is about to wipe', () => {
    const h = createHarness();
    const host = pane();
    const crumbEl = el('mj-record-origin-crumb');
    host.appendChild(crumbEl);
    const inside = { destroy: vi.fn(), hostView: { rootNodes: [crumbEl] } };
    const elsewhere = { destroy: vi.fn(), hostView: { rootNodes: [el('mj-record-origin-crumb')] } };
    const crumbs = h.internals['originCrumbRefs'] as Map<string, unknown>;
    crumbs.set(TAB.id, inside);
    crumbs.set('tab-2', elsewhere);
    priv(h).destroyOriginCrumbsIn(host);
    expect(inside.destroy).toHaveBeenCalled();
    expect(elsewhere.destroy).not.toHaveBeenCalled();
    expect([...crumbs.keys()]).toEqual(['tab-2']);
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

    it('treats a pane holding only the origin crumb as empty', async () => {
      const h = createHarness();
      h.live.element.appendChild(el('mj-record-origin-crumb'));
      priv(h).reloadBlankActiveRecordTab(TAB.id);
      await flush();
      expect(h.live.element.children).toContain(h.wrapper);
    });

    it('reattaches a component an earlier load left attached to a discarded element, without building another', async () => {
      const h = createHarness();
      await priv(h).loadTabContent(TAB.id, { element: pane(true) });   // attached, but to an element GL then dropped
      priv(h).reloadBlankActiveRecordTab(TAB.id);
      await flush();
      expect(h.cache.findAndDetachByTabId).toHaveBeenCalledWith(TAB.id);
      expect(h.live.element.children).toContain(h.wrapper);
      expect(h.cache.cacheComponent).not.toHaveBeenCalled();
    });

    it('leaves a pane with content alone', () => {
      const h = createHarness();
      h.live.element.appendChild(el('wrapper', 'tab-content-wrapper'));
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
