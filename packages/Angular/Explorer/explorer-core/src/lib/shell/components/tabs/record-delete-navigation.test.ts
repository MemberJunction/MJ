import { describe, expect, it, vi } from 'vitest';

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
  TabService: class {},
  FlattenLayoutToSingleStack: vi.fn(),
}));
vi.mock('@memberjunction/global', () => ({ MJGlobal: { Instance: { ClassFactory: {} } } }));
// The record-deletion decisions are the REAL helpers (record-delete.ts and the
// origin reader it pairs with) — those are what this suite exercises. Only the
// Angular-bound members of ng-shared are stubbed.
vi.mock('@memberjunction/ng-shared', async () => {
  const recordDelete = await vi.importActual<typeof import('../../../../../../shared/src/lib/record-delete')>(
    '../../../../../../shared/src/lib/record-delete'
  );
  const recordOpenStyle = await vi.importActual<typeof import('../../../../../../shared/src/lib/record-open-style')>(
    '../../../../../../shared/src/lib/record-open-style'
  );
  return {
    ...recordDelete,
    IsRecordsTabConfiguration: recordOpenStyle.IsRecordsTabConfiguration,
    GetRecordSourceContext: recordOpenStyle.GetRecordSourceContext,
    BaseResourceComponent: class {},
    HomeAppPinService: class {},
    NavigationService: class {},
    ExplorerBreakpointService: class {},
    IsRecordTabsStyle: vi.fn(() => true),
    IsRecordsRegionTab: vi.fn(() => true),
    IsRecordDockedToWorkspace: vi.fn(() => false),
    RECORD_DOCKED_TO_WORKSPACE_KEY: 'recordDockedToWorkspace',
    SafeDetectChanges: vi.fn(),
    ResolveRecordTypeIcon: vi.fn(() => ''),
  };
});
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

/**
 * What the workspace does when a record it shows is deleted in this session
 * (TabContainerComponent.HandleRecordDeleted): close every tab showing it, take
 * the user back to where the active one came from (or Home when it has no
 * origin), keep browser Back off it, and splice it out of other tabs' origins.
 *
 * Same Object.create harness as records-tab-promote-on-edit.test.ts.
 */
const WIDGET = { EntityName: 'MJ: Widgets', RecordId: 'ID|w1', Remote: false };

interface TestTab {
  id: string;
  applicationId: string;
  title: string;
  resourceRecordId: string;
  isPinned: boolean;
  configuration: Record<string, unknown>;
}

function recordTab(id: string, recordId: string, extra: Record<string, unknown> = {}, entity = 'MJ: Widgets'): TestTab {
  return {
    id,
    applicationId: 'app-1',
    title: id,
    resourceRecordId: recordId,
    isPinned: false,
    configuration: { resourceType: 'Records', Entity: entity, recordId, ...extra },
  };
}

function viewTab(id: string): TestTab {
  return { id, applicationId: 'app-1', title: 'Data', resourceRecordId: '', isPinned: true, configuration: { resourceType: 'User Views' } };
}

/** Origin of a record opened from the Data Explorer page in app-1 */
const VIEW_ORIGIN = { sourceAppId: 'app-1', sourceAppName: 'Data', sourceNavLabel: 'Data', sourceTabId: 'view' };

function createHarness(opts: { tabs: TestTab[]; activeTabId: string; homeApp?: boolean }) {
  const order: string[] = [];
  const workspaceManager = {
    GetConfiguration: () => ({ tabs: opts.tabs, activeTabId: opts.activeTabId }),
    UpdateTabConfiguration: vi.fn(),
    CloseTab: vi.fn((id: string) => order.push(`close:${id}`)),
    OpenTab: vi.fn(() => order.push('open-default')),
  };
  const navigationService = {
    ReturnToRecordSource: vi.fn(async () => { order.push('return'); }),
    OpenHomeDashboard: vi.fn(async () => { order.push('home'); return opts.homeApp ?? true; }),
  };
  const tabService = { MarkRecordUrlForReplacement: vi.fn() };
  const cacheManager = { destroyComponentByTabId: vi.fn(), destroyComponent: vi.fn() };
  const app = { CreateDefaultTab: vi.fn(async () => ({ Title: 'Home' })), GetColor: () => '#000' };
  const appManager = { GetAppById: vi.fn(() => app) };

  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  internals['workspaceManager'] = workspaceManager;
  internals['navigationService'] = navigationService;
  internals['tabService'] = tabService;
  internals['cacheManager'] = cacheManager;
  internals['appManager'] = appManager;
  internals['componentRefs'] = new Map();
  internals['singleResourceCacheIdentity'] = null;
  return { component, order, workspaceManager, navigationService, tabService, cacheManager, app };
}

describe('HandleRecordDeleted — the tab the user was looking at', () => {
  it('closes the tab, then returns to the view it was opened from', async () => {
    const h = createHarness({ tabs: [viewTab('view'), recordTab('rec', 'ID|w1', VIEW_ORIGIN)], activeTabId: 'rec' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.cacheManager.destroyComponentByTabId).toHaveBeenCalledWith('rec');
    expect(h.order).toEqual(['close:rec', 'return']);
    expect(h.navigationService.ReturnToRecordSource).toHaveBeenCalledWith(expect.objectContaining({ sourceTabId: 'view', sourceAppId: 'app-1' }));
    expect(h.navigationService.OpenHomeDashboard).not.toHaveBeenCalled();
  });

  it('returns to the parent record when it was opened from inside one', async () => {
    const parentOrigin = { sourceLabel: 'Acme', sourceRecordEntity: 'MJ: Companies', sourceRecordId: 'ID|c1', sourceAppId: 'app-1', sourceTabId: 'company' };
    const h = createHarness({ tabs: [recordTab('rec', 'ID|w1', parentOrigin)], activeTabId: 'rec' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.navigationService.ReturnToRecordSource).toHaveBeenCalledWith(expect.objectContaining({ sourceRecordEntity: 'MJ: Companies', sourceRecordId: 'ID|c1' }));
  });

  it('goes to the Home dashboard when the record was loaded straight from a URL (no origin)', async () => {
    const h = createHarness({ tabs: [recordTab('rec', 'ID|w1')], activeTabId: 'rec' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.order).toEqual(['close:rec', 'home']);
    expect(h.navigationService.ReturnToRecordSource).not.toHaveBeenCalled();
  });

  it('goes Home for a label-only origin, which has nowhere to return to', async () => {
    const h = createHarness({ tabs: [recordTab('rec', 'ID|w1', { sourceLabel: 'Conversation' })], activeTabId: 'rec' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.navigationService.OpenHomeDashboard).toHaveBeenCalled();
    expect(h.navigationService.ReturnToRecordSource).not.toHaveBeenCalled();
  });

  it('falls back to the tab\'s own app landing page when there is no Home app', async () => {
    const h = createHarness({ tabs: [recordTab('rec', 'ID|w1')], activeTabId: 'rec', homeApp: false });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.app.CreateDefaultTab).toHaveBeenCalled();
    expect(h.order).toEqual(['close:rec', 'home', 'open-default']);
  });

  it('marks the record\'s URL so browser Back cannot reopen it, using the id the tab\'s URL carries', async () => {
    const h = createHarness({ tabs: [recordTab('rec', 'w1', VIEW_ORIGIN)], activeTabId: 'rec' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.tabService.MarkRecordUrlForReplacement).toHaveBeenCalledWith('MJ: Widgets', 'w1');
  });
});

describe('HandleRecordDeleted — tabs the user was not looking at', () => {
  it('closes another tab showing the record without navigating or touching the URL', async () => {
    const h = createHarness({ tabs: [viewTab('view'), recordTab('rec', 'ID|w1', VIEW_ORIGIN)], activeTabId: 'view' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.order).toEqual(['close:rec']);
    expect(h.tabService.MarkRecordUrlForReplacement).not.toHaveBeenCalled();
  });

  it('closes every tab showing the record and navigates once, for the active one', async () => {
    const h = createHarness({
      tabs: [recordTab('rec-a', 'ID|w1', VIEW_ORIGIN), recordTab('rec-b', 'ID|W1')],
      activeTabId: 'rec-a',
    });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.order).toEqual(['close:rec-a', 'close:rec-b', 'return']);
  });

  it('does nothing when no tab shows the record', async () => {
    const h = createHarness({ tabs: [viewTab('view'), recordTab('rec', 'ID|w2', VIEW_ORIGIN)], activeTabId: 'view' });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.order).toEqual([]);
    expect(h.workspaceManager.UpdateTabConfiguration).not.toHaveBeenCalled();
  });
});

describe('HandleRecordDeleted — origins that lead back to the deleted record', () => {
  it('rewrites a child tab\'s origin to skip the deleted parent', async () => {
    const childOrigin = { sourceLabel: 'Widget', sourceRecordEntity: 'MJ: Widgets', sourceRecordId: 'ID|w1', sourceTabId: 'rec', sourceAppId: 'app-1', sourceParentOrigin: VIEW_ORIGIN };
    const h = createHarness({
      tabs: [viewTab('view'), recordTab('rec', 'ID|w1', VIEW_ORIGIN), recordTab('child', 'ID|p1', childOrigin, 'MJ: Parts')],
      activeTabId: 'rec',
    });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.workspaceManager.UpdateTabConfiguration).toHaveBeenCalledTimes(1);
    const [tabId, update] = h.workspaceManager.UpdateTabConfiguration.mock.calls[0] as [string, Record<string, unknown>];
    expect(tabId).toBe('child');
    expect(update).toMatchObject({ sourceTabId: 'view', sourceNavLabel: 'Data', sourceRecordEntity: undefined, sourceRecordId: undefined });
    expect(h.order).toEqual(['close:rec', 'return']);
  });

  it('leaves origins that never mention the record alone', async () => {
    const h = createHarness({
      tabs: [recordTab('rec', 'ID|w1', VIEW_ORIGIN), recordTab('other', 'ID|p1', VIEW_ORIGIN, 'MJ: Parts')],
      activeTabId: 'rec',
    });

    await h.component.HandleRecordDeleted(WIDGET);

    expect(h.workspaceManager.UpdateTabConfiguration).not.toHaveBeenCalled();
  });
});

describe('handleResourceCloseRequested (Discard on a new record) — unchanged by the refactor', () => {
  it('destroys the component, closes the tab, and opens the app default when it was the last tab', async () => {
    const h = createHarness({ tabs: [recordTab('rec', '')], activeTabId: 'rec' });
    const internals = h.component as unknown as { handleResourceCloseRequested(tabId: string, instance: unknown): Promise<void> };

    await internals.handleResourceCloseRequested('rec', {});

    expect(h.cacheManager.destroyComponentByTabId).toHaveBeenCalledWith('rec');
    expect(h.order).toEqual(['close:rec', 'open-default']);
  });

  it('just closes the tab when others remain', async () => {
    const h = createHarness({ tabs: [viewTab('view'), recordTab('rec', '')], activeTabId: 'rec' });
    const internals = h.component as unknown as { handleResourceCloseRequested(tabId: string, instance: unknown): Promise<void> };

    await internals.handleResourceCloseRequested('rec', {});

    expect(h.order).toEqual(['close:rec']);
  });
});
