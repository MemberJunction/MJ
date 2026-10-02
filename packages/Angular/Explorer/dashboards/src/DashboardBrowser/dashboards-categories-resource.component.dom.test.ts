import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, Subject } from 'rxjs';
import type { EngineDataChangeEvent, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DashboardEngine, ResourceData } from '@memberjunction/core-entities';
import type { MJDashboardCategoryEntity, MJDashboardCategoryLinkEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  MJButtonDirective,
  MJEmptyStateComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
} from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Click, Query, QueryAll, Text, TypeInto } from '@memberjunction/ng-test-utils';
import { DashboardsCategoriesResourceComponent } from './dashboards-categories-resource.component';

/**
 * DOM coverage for the Categories page of the Dashboards app (<mj-dashboards-categories-resource>).
 * The page chrome, the empty state, the button directive and ngModel are real; the dashboard
 * engine, navigation, the app list and notifications are doubles. Saving or deleting a category
 * changes the engine double's category list, as the real engine's cache does.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() Text = '';
  @Input() Size = '';
}

/** The slice of a registered agent client tool these specs call. */
interface ClientTool {
  Name: string;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** Tool names that start with a mutating verb. The page's SAFETY BOUNDARY allows none. */
const MUTATING_TOOL_NAME = /^(Create|Delete|Save|Share|Move|Rename|Remove|Update|Add|Toggle|Set)/;

const USER_ID = 'test-user-id';
const ANA_ID = 'U0000000-0000-4000-8000-0000000000a1';
const DASHBOARDS_APP = { ID: 'A0000000-0000-4000-8000-000000000001', Name: 'Dashboards' };
const SALES_ID = 'C3000000-0000-4000-8000-00000000000a';
const PIPELINE_ID = 'C3000000-0000-4000-8000-00000000000b';
const OPS_ID = 'C3000000-0000-4000-8000-00000000000c';
const ANA_CATEGORY_ID = 'C3000000-0000-4000-8000-00000000000d';
const NEW_CATEGORY_ID = 'C3000000-0000-4000-8000-0000000000ee';

type CategoryStub = MJDashboardCategoryEntity & { Delete: ReturnType<typeof vi.fn> };

/** The categories and dashboards one render starts from; the engine double reads them at call time. */
interface CategoryLibrary {
  categories: CategoryStub[];
  dashboards: MJDashboardEntity[];
}

function category(library: CategoryLibrary, ID: string, Name: string, ParentID: string | null, UserID = USER_ID, deleteSucceeds = true): CategoryStub {
  const stub = {
    ID,
    Name,
    ParentID,
    UserID,
    LatestResult: { CompleteMessage: 'The category is still in use' },
    Delete: vi.fn(async () => {
      if (deleteSucceeds) {
        library.categories = library.categories.filter(c => !UUIDsEqual(c.ID, ID));
      }
      return deleteSucceeds;
    }),
  };
  return stub as unknown as CategoryStub;
}

const dashboard = (ID: string, UserID: string, CategoryID: string | null): MJDashboardEntity =>
  ({ ID, Name: ID, UserID, CategoryID, Type: 'Config' }) as unknown as MJDashboardEntity;

const PARTNER_KPIS_ID = 'D3000000-0000-4000-8000-000000000003';
const DASHBOARDS = [
  dashboard('D3000000-0000-4000-8000-000000000001', USER_ID, SALES_ID),
  dashboard('D3000000-0000-4000-8000-000000000002', USER_ID, PIPELINE_ID),
  // Ana's dashboard, filed by the user under Sales.
  dashboard(PARTNER_KPIS_ID, ANA_ID, ANA_CATEGORY_ID),
];
const LINKS = [{ DashboardID: PARTNER_KPIS_ID, UserID: USER_ID, DashboardCategoryID: SALES_ID }] as unknown as MJDashboardCategoryLinkEntity[];

/** Sales (with Pipeline) and Ops belong to the user; Ana shared her empty category with the user. */
function standardLibrary(deleteSucceeds = true): CategoryLibrary {
  const library: CategoryLibrary = { categories: [], dashboards: [...DASHBOARDS] };
  library.categories = [
    category(library, SALES_ID, 'Sales', null),
    category(library, PIPELINE_ID, 'Pipeline', SALES_ID),
    category(library, OPS_ID, 'Ops', null, USER_ID, deleteSucceeds),
    category(library, ANA_CATEGORY_ID, 'Shared by Ana', null, ANA_ID),
  ];
  return library;
}

/**
 * Replaces DashboardEngine.Instance with an engine that reads the library at call time.
 * `EmitChange` emits what the engine emits after it changes its cache.
 */
function stubDashboardEngine(library: CategoryLibrary) {
  const changes = new Subject<EngineDataChangeEvent>();
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean) => undefined),
    GetAccessibleDashboards: vi.fn((_userId: string) => library.dashboards),
    GetAccessibleCategories: vi.fn((_userId: string) => library.categories),
    DashboardCategoryLinks: LINKS,
    DataChange$: changes.asObservable(),
    EmitChange: (EntityName: string) => {
      changes.next({ config: { EntityName, PropertyName: '_x' }, changeType: 'update', data: [] } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  return engine;
}

function fakeNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    UpdateTabQueryParams: vi.fn(),
    SwitchToApp: vi.fn(async (_appId: string, _navItemName?: string, _queryParams?: Record<string, string | null>) => undefined),
    SetAgentContext: vi.fn((_caller: DashboardsCategoriesResourceComponent, _context: Record<string, unknown>) => undefined),
    SetAgentClientTools: vi.fn((_caller: DashboardsCategoriesResourceComponent, _tools: ClientTool[]) => undefined),
  };
}

/** A provider whose new MJ: Dashboard Categories object adds itself to the library when saved. */
function providerCreatingCategories(library: CategoryLibrary, saveSucceeds = true) {
  const created = category(library, NEW_CATEGORY_ID, '', null);
  const save = vi.fn(async () => {
    if (saveSucceeds) {
      library.categories = [...library.categories, created];
    }
    return saveSucceeds;
  });
  Object.assign(created, { Save: save, LatestResult: { CompleteMessage: 'A category named Finance already exists' } });
  const provider = { ...CreateFakeProvider(), GetEntityObject: vi.fn(async () => created) } as unknown as IMetadataProvider;
  return { created, save, provider };
}

function renderCategories(library: CategoryLibrary = standardLibrary(), provider: IMetadataProvider = CreateFakeProvider()) {
  const engine = stubDashboardEngine(library);
  const navigation = fakeNavigation();
  const notifications = { CreateSimpleNotification: vi.fn() };
  const loadComplete = vi.fn();
  const fixture = RenderComponentFixture(DashboardsCategoriesResourceComponent, {
    imports: [FormsModule, MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJEmptyStateComponent, MJButtonDirective, LoadingStub],
    declarations: [DashboardsCategoriesResourceComponent],
    providers: [
      { provide: NavigationService, useValue: navigation },
      { provide: ApplicationManager, useValue: { GetAllApps: () => [DASHBOARDS_APP] } },
      { provide: MJNotificationService, useValue: notifications },
    ],
    setup: instance => {
      instance.Provider = provider;
      instance.Data = new ResourceData({
        Configuration: { tabId: 'categories-tab', resourceType: 'Custom', driverClass: 'DashboardsCategoriesResource', navItemName: 'Categories' },
      });
      instance.LoadCompleteEvent = loadComplete;
    },
  });
  return { fixture, engine, navigation, notifications, loadComplete, library };
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

async function renderLoaded(library?: CategoryLibrary, provider?: IMetadataProvider) {
  const rendered = renderCategories(library, provider);
  await settle();
  rendered.fixture.detectChanges();
  return rendered;
}

type Fixture = ComponentFixture<DashboardsCategoriesResourceComponent>;

const texts = (fixture: Fixture, selector: string): string[] => QueryAll(fixture, selector).map(el => el.textContent?.trim() ?? '');

function rowButton(fixture: Fixture, categoryName: string, selector: string): HTMLButtonElement {
  const row = QueryAll(fixture, '.cat-row').find(el => el.querySelector('.cat-main b')?.textContent?.trim() === categoryName);
  const button = row?.querySelector(selector);
  if (!button) {
    throw new Error(`No ${selector} button in the ${categoryName} row`);
  }
  return button as HTMLButtonElement;
}

function tool(navigation: ReturnType<typeof fakeNavigation>, name: string): ClientTool {
  const found = (navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? []).find(t => t.Name === name);
  if (!found) {
    throw new Error(`Agent tool ${name} is not registered`);
  }
  return found;
}

const lastAgentContext = (navigation: ReturnType<typeof fakeNavigation>): Record<string, unknown> | undefined =>
  navigation.SetAgentContext.mock.calls.at(-1)?.[1];

describe('DashboardsCategoriesResourceComponent (DOM)', () => {
  it('renders the page chrome with the New category box and no count badge', async () => {
    const { fixture } = await renderLoaded();
    expect(Text(fixture, '.mj-page-header-title')).toBe('Categories');
    expect(Query(fixture, 'mj-page-body')).not.toBeNull();
    expect(Query(fixture, '.mj-page-header-actions input.cat-new-name')).not.toBeNull();
    expect(Text(fixture, '.mj-page-header-actions .cat-create')).toBe('New category');
    expect(Query(fixture, 'mj-stat-badge')).toBeNull();
  });

  it('shows the loading indicator, then calls NotifyLoadComplete once the categories load', async () => {
    const { fixture, engine, loadComplete } = renderCategories();
    expect(Query(fixture, 'mj-loading')).not.toBeNull();
    expect(loadComplete).not.toHaveBeenCalled();

    await settle();
    fixture.detectChanges();

    expect(engine.Config).toHaveBeenCalledWith(false);
    expect(loadComplete).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.LoadComplete).toBe(true);
    expect(Query(fixture, 'mj-loading')).toBeNull();
  });

  it('lists the category tree with dashboard and sub-category counts', async () => {
    const { fixture } = await renderLoaded();
    expect(texts(fixture, '.cat-main b')).toEqual(['Ops', 'Sales', 'Pipeline', 'Shared by Ana']);
    expect(texts(fixture, '.cat-main small')).toEqual(['0 dashboards', '2 dashboards · 1 sub-category', '1 dashboard', '0 dashboards']);
    const pipelineRow = QueryAll(fixture, '.cat-row')[2] as HTMLElement;
    expect(pipelineRow.style.paddingLeft).toBe('42px');
  });

  it('offers Delete only for an empty category the user owns', async () => {
    const { fixture } = await renderLoaded();
    expect(QueryAll(fixture, '.cat-delete').map(el => el.getAttribute('aria-label'))).toEqual(['Delete Ops']);
  });

  it('Open shows the category on the Browse page of the Dashboards app', async () => {
    const { fixture, navigation } = await renderLoaded();
    rowButton(fixture, 'Sales', '.cat-open').click();
    await settle();
    expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Browse', { lib: null, category: SALES_ID });
  });

  it('creates a top-level category from the New category box', async () => {
    const library = standardLibrary();
    const { created, save, provider } = providerCreatingCategories(library);
    const { fixture, engine, navigation, notifications } = await renderLoaded(library, provider);

    TypeInto(fixture, '.cat-new-name', '  Finance  ');
    fixture.detectChanges();
    Click(fixture, '.cat-create');
    await settle();
    fixture.detectChanges();

    expect(save).toHaveBeenCalledTimes(1);
    expect(created.Name).toBe('Finance');
    expect(created.UserID).toBe(USER_ID);
    expect(created.ParentID).toBeNull();
    expect(engine.Config).toHaveBeenLastCalledWith(true);
    expect(texts(fixture, '.cat-main b')).toContain('Finance');
    expect(fixture.componentInstance.NewName).toBe('');
    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Created "Finance"', 'success', 2000);
    expect(lastAgentContext(navigation)?.['CategoryCount']).toBe(5);
  });

  it('keeps New category disabled until a name is typed', async () => {
    const library = standardLibrary();
    const { save, provider } = providerCreatingCategories(library);
    const { fixture } = await renderLoaded(library, provider);

    expect((Query(fixture, '.cat-create') as HTMLButtonElement).disabled).toBe(true);
    TypeInto(fixture, '.cat-new-name', '   ');
    fixture.detectChanges();
    expect((Query(fixture, '.cat-create') as HTMLButtonElement).disabled).toBe(true);

    (Query(fixture, '.cat-new-name') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it('shows the save error and keeps the typed name when the category cannot be created', async () => {
    const library = standardLibrary();
    const { provider } = providerCreatingCategories(library, false);
    const { fixture, notifications } = await renderLoaded(library, provider);

    TypeInto(fixture, '.cat-new-name', 'Finance');
    fixture.detectChanges();
    Click(fixture, '.cat-create');
    await settle();

    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('A category named Finance already exists', 'error', 3000);
    expect(fixture.componentInstance.NewName).toBe('Finance');
  });

  it('deletes an empty category and rebuilds the tree from the cache, without reloading it', async () => {
    const { fixture, engine, library, navigation, notifications } = await renderLoaded();
    const ops = library.categories.find(c => c.Name === 'Ops');

    rowButton(fixture, 'Ops', '.cat-delete').click();
    await settle();
    fixture.detectChanges();

    expect(ops?.Delete).toHaveBeenCalledTimes(1);
    expect(engine.Config).toHaveBeenCalledTimes(1);
    expect(engine.Config).toHaveBeenCalledWith(false);
    expect(texts(fixture, '.cat-main b')).toEqual(['Sales', 'Pipeline', 'Shared by Ana']);
    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Deleted "Ops"', 'success', 2000);
    expect(lastAgentContext(navigation)?.['CategoryCount']).toBe(3);
  });

  it('rebuilds the tree when the cache changes, without reporting to the agent', async () => {
    const { fixture, engine, library, navigation } = await renderLoaded();
    const reported = navigation.SetAgentContext.mock.calls.length;

    // In Browse, the user creates Finance; the engine adds it to its cache and emits.
    library.categories = [...library.categories, category(library, NEW_CATEGORY_ID, 'Finance', null)];
    engine.EmitChange('MJ: Dashboard Categories');
    await settle();
    fixture.detectChanges();

    expect(texts(fixture, '.cat-main b')).toEqual(['Finance', 'Ops', 'Sales', 'Pipeline', 'Shared by Ana']);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
  });

  it('hides Delete once a dashboard is moved into the category elsewhere', async () => {
    const { fixture, engine, library } = await renderLoaded();
    expect(rowButton(fixture, 'Ops', '.cat-delete')).toBeTruthy();

    // In Browse, the user moves a dashboard into Ops; the engine updates its cache and emits.
    library.dashboards = [...library.dashboards, dashboard('D3000000-0000-4000-8000-000000000004', USER_ID, OPS_ID)];
    engine.EmitChange('MJ: Dashboards');
    await settle();
    fixture.detectChanges();

    expect(texts(fixture, '.cat-main small')[0]).toBe('1 dashboard');
    expect(QueryAll(fixture, '.cat-delete')).toEqual([]);
  });

  it('shows the delete error and keeps the category when the delete fails', async () => {
    const { fixture, notifications } = await renderLoaded(standardLibrary(false));

    rowButton(fixture, 'Ops', '.cat-delete').click();
    await settle();
    fixture.detectChanges();

    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('The category is still in use', 'error', 3000);
    expect(texts(fixture, '.cat-main b')).toContain('Ops');
  });

  it('reports the tree to the agent after loading', async () => {
    const { navigation } = await renderLoaded();
    expect(lastAgentContext(navigation)).toEqual({
      IsLoading: false,
      CategoryCount: 4,
      Categories: [
        { Name: 'Ops', Depth: 0, DashboardCount: 0, SubCategoryCount: 0 },
        { Name: 'Sales', Depth: 0, DashboardCount: 2, SubCategoryCount: 1 },
        { Name: 'Pipeline', Depth: 1, DashboardCount: 1, SubCategoryCount: 0 },
        { Name: 'Shared by Ana', Depth: 0, DashboardCount: 0, SubCategoryCount: 0 },
      ],
    });
  });

  it('registers only the read-only OpenCategoryInBrowse and RefreshCategories agent tools, once', async () => {
    const { navigation } = await renderLoaded();
    expect(navigation.SetAgentClientTools).toHaveBeenCalledTimes(1);
    const names = navigation.SetAgentClientTools.mock.calls[0][1].map(t => t.Name);
    expect(names).toEqual(['OpenCategoryInBrowse', 'RefreshCategories']);
    expect(names.filter(name => MUTATING_TOOL_NAME.test(name))).toEqual([]);
  });

  it('the OpenCategoryInBrowse agent tool opens a category by name and rejects unknown ones', async () => {
    const { navigation } = await renderLoaded();

    expect(await tool(navigation, 'OpenCategoryInBrowse').Handler({ category: 'pipeline' })).toEqual({ Success: true });
    expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Browse', { lib: null, category: PIPELINE_ID });

    const missing = (await tool(navigation, 'OpenCategoryInBrowse').Handler({ category: 'Finance' })) as { Success: boolean };
    expect(missing.Success).toBe(false);
  });

  it('the RefreshCategories agent tool reloads the tree from the server and reports a failed reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { engine, navigation } = await renderLoaded();
    expect(await tool(navigation, 'RefreshCategories').Handler({})).toEqual({ Success: true });
    expect(engine.Config).toHaveBeenLastCalledWith(true);

    engine.Config.mockRejectedValueOnce(new Error('network down'));
    expect(await tool(navigation, 'RefreshCategories').Handler({})).toEqual({ Success: false, ErrorMessage: 'The categories could not be reloaded.' });
  });

  it('shows an empty state when the user has no categories', async () => {
    const { fixture } = await renderLoaded({ categories: [], dashboards: [] });
    expect(Text(fixture, 'mj-empty-state .mj-empty-state__title')).toBe('No categories yet');
  });

  it('names its tab Categories', async () => {
    const { fixture } = await renderLoaded();
    expect(await fixture.componentInstance.GetResourceDisplayName(new ResourceData())).toBe('Categories');
  });
});
