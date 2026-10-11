import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { PermissionConstrainedError } from '@memberjunction/core';
import type { ApplicationInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine, UserViewEngine } from '@memberjunction/core-entities';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import type { BaseApplication } from '@memberjunction/ng-base-application';
import type {
  DataLoadedEvent,
  EntityViewerConfig,
  FilteredCountChangedEvent,
  RecordSelectedEvent,
  ViewDeleteOperation,
  ViewRelatedRecordNavigation,
  ViewSaveOperation,
} from '@memberjunction/ng-entity-viewer';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationService } from '@memberjunction/ng-shared';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { MJAccordionModule, MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, UseFakeGlobalProvider, StubLoadingComponent, Click, HasClass, Query, QueryAll, Text } from '@memberjunction/ng-test-utils';
import { EnsureDashboardsApp } from '../shared/dashboards-app.helpers';
import type { OpenRecordEvent, SelectRecordEvent } from './components/navigation-panel/navigation-panel.component';
import { DataExplorerDashboardComponent } from './data-explorer-dashboard.component';
import { ExplorerStateService } from './services/explorer-state.service';
import { DEFAULT_EXPLORER_STATE } from './models/explorer-state.interface';
import type { AppEntityGroup, DataExplorerFilter, DataExplorerState, FavoriteItem, RecentItem } from './models/explorer-state.interface';

vi.mock('../shared/dashboards-app.helpers', () => ({ EnsureDashboardsApp: vi.fn(), DASHBOARDS_LIBRARY_NAV_ITEM: 'Library' }));

/**
 * DOM coverage for the "Dashboards moved" banner on the Data tab of Data Explorer
 * (<mj-data-explorer-dashboard>). The template, the button directive, the empty state and the
 * accordion are real. The explorer state, the user settings (UserInfoEngine), the saved views
 * (UserViewEngine), navigation, the app list, the Dashboards app install helper, notifications,
 * the left navigation panel and the record view are doubles. By default the global provider has
 * no entities, so the home view shows its empty state.
 */

/** Inert <mj-explorer-navigation-panel>: the left panel that shows while an entity is selected. */
@Component({ standalone: true, selector: 'mj-explorer-navigation-panel', template: '' })
class NavigationPanelStub {
  @Input() entities: EntityInfo[] = [];
  @Input() appEntityGroups: AppEntityGroup[] = [];
  @Input() selectedEntityName: string | null = null;
  @Input() favorites: FavoriteItem[] = [];
  @Input() recentItems: RecentItem[] = [];
  @Input() collapsed = false;
  @Input() allowedEntityNames: Set<string> | null = null;
  @Input() favoritesSectionExpanded = true;
  @Input() recentSectionExpanded = true;
  @Input() entitiesSectionExpanded = true;
  @Input() viewsSectionExpanded = true;
  @Output() entitySelected = new EventEmitter<EntityInfo>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() sectionToggled = new EventEmitter<'favorites' | 'recent' | 'entities' | 'views'>();
  @Output() openRecord = new EventEmitter<OpenRecordEvent>();
  @Output() selectRecord = new EventEmitter<SelectRecordEvent>();
  @Output() expandAndFocus = new EventEmitter<'favorites' | 'recent' | 'entities'>();
}

/** Inert <mj-view-workspace>: the record view of the selected entity. */
@Component({ standalone: true, selector: 'mj-view-workspace', template: '' })
class ViewWorkspaceStub {
  @Input() Entity: EntityInfo | null = null;
  @Input() AutoSaveView = false;
  @Input() SelectedView: MJUserViewEntityExtended | null = null;
  @Input() FilterText = '';
  @Input() SelectedRecordId: string | null = null;
  @Input() ViewerConfig: Partial<EntityViewerConfig> | null = null;
  @Output() SelectedViewChange = new EventEmitter<MJUserViewEntityExtended | null>();
  @Output() ViewSelected = new EventEmitter<MJUserViewEntityExtended | null>();
  @Output() OpenViewInTabRequested = new EventEmitter<string>();
  @Output() OpenRecordRequested = new EventEmitter<{ entity: EntityInfo; record: Record<string, unknown> }>();
  @Output() OpenRelatedRecordRequested = new EventEmitter<ViewRelatedRecordNavigation>();
  @Output() CreateNewRecordRequested = new EventEmitter<EntityInfo>();
  @Output() RecordSelected = new EventEmitter<RecordSelectedEvent>();
  @Output() AfterViewSave = new EventEmitter<ViewSaveOperation>();
  @Output() AfterViewDelete = new EventEmitter<ViewDeleteOperation>();
  @Output() FilterTextChanged = new EventEmitter<string>();
  @Output() DataLoaded = new EventEmitter<DataLoadedEvent>();
  @Output() FilteredCountChanged = new EventEmitter<FilteredCountChangedEvent>();
}

const BANNER_SETTING = 'DataExplorer.DashboardsMovedBanner';
const BANNER_BETWEEN_HEADER_AND_BODY = '.content-area > .content-header + .dx-moved-banner + .content-body';
const TAB_ID = 'data-tab';
const DASHBOARDS_APP = { ID: 'A0000000-0000-4000-8000-000000000001', Name: 'Dashboards' } as unknown as BaseApplication;

/** An entity the user can read. */
const ACCOUNTS = {
  ID: 'E0000000-0000-4000-8000-0000000000ac',
  Name: 'Accounts',
  DisplayNameOrName: 'Accounts',
  Description: '',
  Icon: '',
  SchemaName: 'crm',
  IncludeInAPI: true,
  Fields: [],
  RelatedEntities: [],
  SupportsGeoCoding: false,
  GetUserPermisions: () => ({ CanRead: true }),
} as unknown as EntityInfo;

interface UserSettingsOptions {
  /** Settings the user saved earlier, by key. */
  saved?: Record<string, string>;
  /** The user cannot read their settings (the engine throws after it loads). */
  unreadable?: boolean;
}

interface ExplorerOptions {
  settings?: UserSettingsOptions;
  /** Entities of the global provider. */
  entities?: EntityInfo[];
  /** Explorer state at load, over the default state. A selectedEntityName restores that entity, as on a return visit. */
  state?: Partial<DataExplorerState>;
  /** The explorer's entity filter input. */
  entityFilter?: DataExplorerFilter;
  /** Holds the entity load until the test calls FinishLoad() on the explorer state. */
  holdLoad?: boolean;
}

/** Replaces UserInfoEngine.Instance with a settings cache that, like the real engine, is empty until Config() loads it. */
function stubUserSettings({ saved = {}, unreadable = false }: UserSettingsOptions = {}) {
  const settings = new Map(Object.entries(saved));
  let loaded = false;
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean) => {
      loaded = true;
    }),
    GetSetting: vi.fn((key: string): string | undefined => {
      if (!loaded) {
        return undefined;
      }
      if (unreadable) {
        throw new PermissionConstrainedError('UserInfoEngine', ['MJ: User Settings']);
      }
      return settings.get(key);
    }),
    SetSetting: vi.fn(async (key: string, value: string): Promise<boolean> => {
      settings.set(key, value);
      return true;
    }),
  };
  vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(engine as unknown as UserInfoEngine);
  return engine;
}

/** Replaces UserViewEngine.Instance with an engine that has no saved views. */
function stubSavedViews(): void {
  const engine = {
    GetAccessibleViewsForEntity: (_entityId: string): MJUserViewEntityExtended[] => [],
    GetViewById: (_viewId: string): MJUserViewEntityExtended | undefined => undefined,
  };
  vi.spyOn(UserViewEngine, 'Instance', 'get').mockReturnValue(engine as unknown as UserViewEngine);
}

/**
 * An ExplorerStateService double with no recents or favorites. Toggling the Quick Access panel
 * emits a new state, like the real service. With holdLoad, setContext() waits for FinishLoad(),
 * so the explorer stays on its loading view until then.
 */
function fakeExplorerState(overrides: Partial<DataExplorerState>, holdLoad: boolean) {
  const state$ = new BehaviorSubject<DataExplorerState>({ ...DEFAULT_EXPLORER_STATE, ...overrides });
  let finishLoad = (): void => undefined;
  const load = holdLoad ? new Promise<void>((resolve) => (finishLoad = () => resolve())) : Promise.resolve();
  return {
    Provider: null as IMetadataProvider | null,
    get CurrentState(): DataExplorerState {
      return state$.value;
    },
    State: state$.asObservable(),
    Breadcrumbs: of([]),
    RecentRecords: of([]),
    FavoriteRecords: of([]),
    setContext: vi.fn((_filter: DataExplorerFilter | null) => load),
    toggleQuickAccessPanel: () => state$.next({ ...state$.value, quickAccessPanelOpen: !state$.value.quickAccessPanelOpen }),
    FinishLoad: () => finishLoad(),
  };
}

function fakeNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: (_tabId: string) => of({}),
    UpdateTabQueryParams: vi.fn(),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    SwitchToApp: vi.fn(async (_appId: string, _navItemName?: string) => undefined),
  };
}

/** Replaces MJNotificationService.Instance with a double that records the toasts. */
function stubNotifications() {
  const notifications = { CreateSimpleNotification: vi.fn() };
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(notifications as unknown as MJNotificationService);
  return notifications;
}

/** Lets the async load and any follow-up work finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Fixture = ComponentFixture<DataExplorerDashboardComponent>;

const bannerButtons = (fixture: Fixture): HTMLButtonElement[] => QueryAll(fixture, '.dx-moved-banner button') as HTMLButtonElement[];

function clickBannerButton(fixture: Fixture, label: string): void {
  const button = bannerButtons(fixture).find((b) => b.textContent?.trim() === label);
  if (!button) {
    throw new Error(`No banner button is labeled "${label}"`);
  }
  button.click();
}

describe('DataExplorerDashboardComponent: Dashboards moved banner (DOM)', () => {
  const installProvider = UseFakeGlobalProvider();

  beforeEach(() => {
    vi.mocked(EnsureDashboardsApp).mockReset();
  });

  /** Renders the Data tab of Data Explorer and waits for its load to finish. */
  async function renderExplorer({ settings: settingsOptions = {}, entities = [], state = {}, entityFilter, holdLoad = false }: ExplorerOptions = {}) {
    // The component reads the entity and application catalogs of the global provider.
    Object.assign(installProvider({ entities }), { Applications: [] as ApplicationInfo[] });
    const settings = stubUserSettings(settingsOptions);
    stubSavedViews();
    const notifications = stubNotifications();
    const navigation = fakeNavigation();
    const explorerState = fakeExplorerState(state, holdLoad);
    const appManager = { Name: 'app manager double' } as unknown as ApplicationManager;
    const fixture = RenderComponentFixture(DataExplorerDashboardComponent, {
      imports: [
        CommonModule,
        FormsModule,
        MJAccordionModule,
        MJEmptyStateComponent,
        MJButtonDirective,
        StubLoadingComponent,
        NavigationPanelStub,
        ViewWorkspaceStub,
      ],
      declarations: [DataExplorerDashboardComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ExplorerStateService, useValue: explorerState },
        { provide: RecentAccessService, useValue: {} },
        { provide: NavigationService, useValue: navigation },
        { provide: ApplicationManager, useValue: appManager },
      ],
      inputs: { ParentTabId: TAB_ID, entityFilter: entityFilter ?? null },
    });
    await settle();
    fixture.detectChanges();
    return { fixture, settings, notifications, navigation, appManager, explorerState };
  }

  it('shows the banner between the header and the body when the user has not dismissed it', async () => {
    const { fixture } = await renderExplorer();

    expect(Query(fixture, '.home-main-area')).not.toBeNull();
    expect(Query(fixture, BANNER_BETWEEN_HEADER_AND_BODY)).not.toBeNull();
    expect(Query(fixture, '.dx-moved-banner')?.getAttribute('role')).toBe('status');
    expect(Text(fixture, '.dx-moved-banner span')).toBe('Dashboards moved. They now live in the Dashboards app.');
    expect(bannerButtons(fixture).map((b) => b.textContent?.trim())).toEqual(['Open Dashboards', 'Got it']);
  });

  it('shows the banner while an entity is selected, such as the entity restored from the last visit', async () => {
    const { fixture } = await renderExplorer({ entities: [ACCOUNTS], state: { selectedEntityName: 'Accounts' } });

    expect(Text(fixture, '.entity-title')).toBe('Accounts');
    expect(Query(fixture, 'mj-view-workspace')).not.toBeNull();
    expect(Query(fixture, '.home-main-area')).toBeNull();
    expect(Query(fixture, BANNER_BETWEEN_HEADER_AND_BODY)).not.toBeNull();
    expect(bannerButtons(fixture).map((b) => b.textContent?.trim())).toEqual(['Open Dashboards', 'Got it']);
  });

  it('makes room for the Quick Access panel only while the panel shows on the home view', async () => {
    // The panel was open on the last visit, so it opens again once the entities load.
    const { fixture, explorerState } = await renderExplorer({ state: { quickAccessPanelOpen: true }, holdLoad: true });

    expect(Query(fixture, 'mj-loading')).not.toBeNull();
    expect(Query(fixture, '.quick-access-panel')).toBeNull();
    expect(Query(fixture, '.dx-moved-banner')).not.toBeNull();
    expect(HasClass(fixture, '.dx-moved-banner', 'panel-open')).toBe(false);

    explorerState.FinishLoad();
    await settle();
    fixture.detectChanges();

    expect(Query(fixture, '.quick-access-panel.open')).not.toBeNull();
    expect(HasClass(fixture, '.dx-moved-banner', 'panel-open')).toBe(true);

    Click(fixture, 'button[title="Recents & Favorites"]');
    fixture.detectChanges();

    expect(Query(fixture, '.quick-access-panel.open')).toBeNull();
    expect(Query(fixture, '.dx-moved-banner')).not.toBeNull();
    expect(HasClass(fixture, '.dx-moved-banner', 'panel-open')).toBe(false);
  });

  it('does not make room in the entity view, where the Quick Access panel does not show', async () => {
    const { fixture } = await renderExplorer({ entities: [ACCOUNTS], state: { selectedEntityName: 'Accounts', quickAccessPanelOpen: true } });

    expect(Query(fixture, 'mj-view-workspace')).not.toBeNull();
    expect(Query(fixture, '.quick-access-panel')).toBeNull();
    expect(Query(fixture, '.dx-moved-banner')).not.toBeNull();
    expect(HasClass(fixture, '.dx-moved-banner', 'panel-open')).toBe(false);
  });

  it('never shows in an explorer that has an entity filter (an application-scoped explorer)', async () => {
    const { fixture } = await renderExplorer({ entityFilter: { applicationId: 'A0000000-0000-4000-8000-0000000000c1', applicationName: 'CRM' } });

    expect(Text(fixture, '.entity-title')).toBe('CRM');
    expect(Query(fixture, '.search-hero')).not.toBeNull();
    expect(Query(fixture, '.dx-moved-banner')).toBeNull();
  });

  it('stays hidden for a user who dismissed it, reading the setting after the user settings load', async () => {
    const { fixture, settings } = await renderExplorer({ settings: { saved: { [BANNER_SETTING]: 'dismissed' } } });

    expect(Query(fixture, '.search-hero')).not.toBeNull();
    expect(Query(fixture, '.dx-moved-banner')).toBeNull();
    expect(settings.GetSetting).toHaveBeenCalledWith(BANNER_SETTING);
  });

  it('stays hidden, and the home view still loads, when the user settings cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture } = await renderExplorer({ settings: { unreadable: true } });

    expect(Query(fixture, '.search-hero')).not.toBeNull();
    expect(Query(fixture, '.dx-moved-banner')).toBeNull();
  });

  it('Got it hides the banner and saves the dismissal', async () => {
    const { fixture, settings } = await renderExplorer();

    clickBannerButton(fixture, 'Got it');
    fixture.detectChanges();

    expect(Query(fixture, '.dx-moved-banner')).toBeNull();
    expect(settings.SetSetting).toHaveBeenCalledWith(BANNER_SETTING, 'dismissed');
  });

  it('Open Dashboards installs the Dashboards app if needed, then opens its Library page', async () => {
    let finishInstall: (app: BaseApplication | undefined) => void = () => undefined;
    vi.mocked(EnsureDashboardsApp).mockReturnValue(new Promise((resolve) => (finishInstall = resolve)));
    const { fixture, navigation, notifications, appManager } = await renderExplorer();

    clickBannerButton(fixture, 'Open Dashboards');
    await settle();

    expect(EnsureDashboardsApp).toHaveBeenCalledWith(appManager);
    expect(navigation.SwitchToApp).not.toHaveBeenCalled();

    finishInstall(DASHBOARDS_APP);
    await settle();

    expect(navigation.SwitchToApp).toHaveBeenCalledTimes(1);
    expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Library');
    expect(notifications.CreateSimpleNotification).not.toHaveBeenCalled();
  });

  it('Open Dashboards warns the user to try again or ask for access when the app cannot be opened', async () => {
    vi.mocked(EnsureDashboardsApp).mockResolvedValue(undefined);
    const { fixture, navigation, notifications } = await renderExplorer();

    clickBannerButton(fixture, 'Open Dashboards');
    await settle();

    expect(navigation.SwitchToApp).not.toHaveBeenCalled();
    expect(notifications.CreateSimpleNotification).toHaveBeenCalledTimes(1);
    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith(
      'Could not open the Dashboards app. Try again, or ask your administrator for access.',
      'warning',
      4000,
    );
  });
});
