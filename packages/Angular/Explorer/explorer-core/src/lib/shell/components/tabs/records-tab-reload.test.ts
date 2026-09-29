/**
 * Logic spec for the records region's reload-on-replacement decision.
 *
 * Preview-tab consumption overwrites a record tab IN PLACE — same tab id, new
 * record — so the tab list alone never signals that the rendered pane went
 * stale. `reloadRecordsTabIfResourceChanged` compares the resource signature
 * bound to the LIVE component against the tab's new configuration, which is
 * the only thing that can tell the difference.
 *
 * Node preset (not `.dom.test.ts`) on purpose: this is a decision, not a
 * rendering concern, and the component is reached via Object.create so none of
 * Angular's construction machinery has to exist. Same approach as
 * dashboard-resource.component.test.ts.
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

interface Harness {
  component: TabContainerComponent;
  cleanupTabComponent: ReturnType<typeof vi.fn>;
  markNotLoaded: ReturnType<typeof vi.fn>;
  loadTabContent: ReturnType<typeof vi.fn>;
}

/** The record currently RENDERED in the pane. */
function boundResource(entity: string, recordId: string, applicationId = 'app-1') {
  return { ResourceRecordID: recordId, Configuration: { Entity: entity, applicationId } };
}
/** The tab as the configuration now describes it. */
function tabFor(entity: string, recordId: string, applicationId = 'app-1') {
  return {
    id: 'tab-1',
    applicationId,
    title: `${entity} - ${recordId}`,
    resourceRecordId: recordId,
    isPinned: false,
    configuration: { resourceType: 'Records', Entity: entity, recordId },
  };
}

function createHarness(opts?: {
  bound?: ReturnType<typeof boundResource> | null;
  activeTabId?: string;
  creating?: boolean;
  rebuilding?: boolean;
}): Harness {
  const cleanupTabComponent = vi.fn();
  const markNotLoaded = vi.fn();
  const loadTabContent = vi.fn(() => Promise.resolve());
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;

  const bound = opts?.bound === undefined ? boundResource('Widgets', 'r1') : opts.bound;
  internals['componentRefs'] = new Map(bound ? [['tab-1', { instance: { Data: bound } }]] : []);
  internals['recordsCreatingTabs'] = opts?.creating ?? false;
  internals['recordsRebuilding'] = opts?.rebuilding ?? false;
  internals['recordsLayoutManager'] = {
    MarkTabNotLoaded: markNotLoaded,
    MarkTabLoaded: vi.fn(),
    GetContainer: vi.fn(() => ({ element: {} })),
  };
  internals['workspaceManager'] = { GetActiveTabId: () => opts?.activeTabId ?? 'tab-1' };
  internals['cleanupTabComponent'] = cleanupTabComponent;
  internals['updateTabDisplayName'] = vi.fn();
  internals['loadTabContent'] = loadTabContent;

  return { component, cleanupTabComponent, markNotLoaded, loadTabContent };
}

const reload = (h: Harness, tab: ReturnType<typeof tabFor>): boolean =>
  (h.component as unknown as { reloadRecordsTabIfResourceChanged(t: unknown): boolean })
    .reloadRecordsTabIfResourceChanged(tab);

describe('records region — reload on in-place replacement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reloads the pane when the temp tab was overwritten with a different record', () => {
    const h = createHarness();
    expect(reload(h, tabFor('Widgets', 'r2'))).toBe(true);
    expect(h.cleanupTabComponent).toHaveBeenCalledWith('tab-1');
    expect(h.markNotLoaded).toHaveBeenCalledWith('tab-1');
    expect(h.loadTabContent).toHaveBeenCalledTimes(1);
  });

  it('reloads when the ENTITY changed even though the record id did not', () => {
    // Same key value in a different entity is a different record entirely.
    const h = createHarness();
    expect(reload(h, tabFor('Orders', 'r1'))).toBe(true);
    expect(h.cleanupTabComponent).toHaveBeenCalled();
  });

  it('reloads when the tab moved to a different application', () => {
    const h = createHarness();
    expect(reload(h, tabFor('Widgets', 'r1', 'app-2'))).toBe(true);
  });

  it('does NOTHING when the signature is unchanged', () => {
    // The guard against a reload loop: this method runs on EVERY configuration
    // emission, most of which are pin/title churn.
    const h = createHarness();
    expect(reload(h, tabFor('Widgets', 'r1'))).toBe(false);
    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    expect(h.loadTabContent).not.toHaveBeenCalled();
  });

  it('does nothing for a tab with no live component', () => {
    // Never loaded, or already detached — nothing rendered to go stale, and it
    // reloads from current config on its next show.
    const h = createHarness({ bound: null });
    expect(reload(h, tabFor('Widgets', 'r2'))).toBe(false);
    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
  });

  it('marks a non-active tab not-loaded but does not load it now', () => {
    const h = createHarness({ activeTabId: 'some-other-tab' });
    expect(reload(h, tabFor('Widgets', 'r2'))).toBe(true);
    expect(h.markNotLoaded).toHaveBeenCalledWith('tab-1');
    expect(h.loadTabContent).not.toHaveBeenCalled();
  });

  describe('region guards', () => {
    it('stands down during batch tab creation', () => {
      const h = createHarness({ creating: true });
      expect(reload(h, tabFor('Widgets', 'r2'))).toBe(false);
      expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    });

    it('stands down during a breakpoint rebuild', () => {
      // Destroy() fires TabClosed per pane and the layout is rebuilt in the
      // other chrome mode; that path loads its own content.
      const h = createHarness({ rebuilding: true });
      expect(reload(h, tabFor('Widgets', 'r2'))).toBe(false);
      expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    });
  });
});
