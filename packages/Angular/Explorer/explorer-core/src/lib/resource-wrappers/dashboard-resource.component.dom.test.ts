import { describe, it, expect, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, InjectionToken, Input, Output, ViewChild, inject } from '@angular/core';
import type { Provider, Type } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AngularSplitModule, SplitAreaComponent, SplitComponent } from 'angular-split';
import { CompositeKey } from '@memberjunction/core';
import type { ApplicationInfo, EntityInfo, IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { DefaultAgentResolver } from '@memberjunction/conversations-runtime';
import { ArtifactMetadataEngine, DashboardEngine, MJEnvironmentEntityExtended, QueryEngine, ResourceData, UserInfoEngine, UserViewEngine } from '@memberjunction/core-entities';
import type {
  DashboardUserPermissions,
  MJConversationEntity,
  MJDashboardEntity,
  MJDashboardPartTypeEntity,
  MJQueryEntityExtended,
  MJUserViewEntityExtended,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { NavigationRequest } from '@memberjunction/ng-artifacts';
import type { PendingAttachment } from '@memberjunction/ng-composer';
import { HomeAppPinService, NavigationService, RecentAccessService, SafeDetectChanges } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ArtifactPermissionService, RealtimeSessionService } from '@memberjunction/ng-conversations';
import { ConfirmDialogComponent } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardNavRequestEvent, DashboardPanel, PanelConfig, PanelPosition } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardEditorLoadError, DashboardSaveOverrides, ShareDialogResult } from '@memberjunction/ng-dashboards/core-dashboards.module';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Attr, Click, HasClass, Query, QueryAll, Text } from '@memberjunction/ng-test-utils';
import { DashboardResource } from './dashboard-resource.component';
import { DashboardAddToMenuComponent } from './dashboard-add-to-menu.component';
import type { DashboardTabAgentTool } from './dashboard-tab-agent';
import type { DashboardStudioHost } from './dashboard-studio-tools';

/**
 * DOM coverage for the dashboard tab (<mj-dashboard-resource>). The tab shows a Config dashboard in
 * <mj-dashboard-editor> from @memberjunction/ng-dashboards, which is a stub here (EditorStub): it reads the
 * dashboard from DashboardEngine, shows it in a viewer double and emits the editor's events. The tests
 * cover the load and its edit-mode request, the tab title, the buttons the tab puts in the editor's header,
 * the agent's context and tools (which read and edit through the editor), the confirm dialog of the
 * Request* tools, the source search, and the AI pane in the real angular-split split. The share dialog,
 * the chat area and the loading indicator are stubs; the voice session, the artifact permission service
 * and the view and query engines are doubles.
 */

/** Stands in for <mj-dashboard-share-dialog>, which lives in @memberjunction/ng-dashboards. */
@Component({ standalone: true, selector: 'mj-dashboard-share-dialog', template: '' })
class ShareDialogStub {
  @Input() Visible = false;
  @Input() Dashboard: MJDashboardEntity | null = null;
  @Output() Result = new EventEmitter<ShareDialogResult>();
}

/** What the chat area's ConversationCreated output gives. */
interface ConversationCreatedEvent {
  conversation: MJConversationEntity;
  pendingMessage?: string;
  pendingAttachments?: PendingAttachment[];
}

/** Stands in for <mj-conversation-chat-area> from @memberjunction/ng-conversations, with the inputs and outputs the AI pane binds. */
@Component({ standalone: true, selector: 'mj-conversation-chat-area', template: '' })
class ChatAreaStub {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() EnvironmentId = '';
  @Input() CurrentUser: UserInfo | null = null;
  @Input() Conversation: MJConversationEntity | null = null;
  @Input() ConversationId: string | null = null;
  @Input() IsNewConversation = false;
  @Input() PendingMessage: string | null = null;
  @Input() PendingAttachments: PendingAttachment[] | null = null;
  @Input() SuppressNewConversationEmptyState = false;
  @Input() AllowMentions = true;
  @Input() OverlayMode = false;
  @Input() ShowExportButton = true;
  @Input() ShowShareButton = true;
  @Input() ShowArtifactIndicator = true;
  @Input() ShowAgentPicker = true;
  @Input() ShowAgentModePicker = true;
  @Input() DefaultAgentId: string | null = null;
  @Input() AllowedAgentIDs: readonly string[] | null = null;
  @Input() ApplicationScope: 'Global' | 'Application' | 'Both' = 'Global';
  @Input() ApplicationId: string | null = null;
  @Input() AppContext: Record<string, unknown> | null = null;
  @Input() EmptyStateGreeting = 'How can I help you?';
  @Output() ConversationCreated = new EventEmitter<ConversationCreatedEvent>();
  @Output() RealtimeConversationReady = new EventEmitter<{ conversationId: string; select: boolean }>();
  @Output() PendingMessageConsumed = new EventEmitter<void>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
}

/** Stands in for <mj-loading> from @memberjunction/ng-shared-generic. */
@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() Text = '';
  @Input() Size: 'small' | 'medium' | 'large' | 'auto' = 'auto';
}

const USER_ID = 'user-1';

/** Why the editor refuses a save while a Save runs. */
const SAVE_IN_PROGRESS = 'A save is in progress. Try again when it finishes.';

/** The part of BaseEntity's LatestResult that the editor stub reads after a failed save. */
interface SaveResultDouble {
  Success: boolean;
  CompleteMessage: string;
}

const QUERY_TYPE = { ID: 'pt-query', Name: 'Query', Icon: 'fa-solid fa-database' } as unknown as MJDashboardPartTypeEntity;
const VIEW_TYPE = { ID: 'pt-view', Name: 'View', Icon: 'fa-solid fa-table' } as unknown as MJDashboardPartTypeEntity;

function revenuePanel(): DashboardPanel {
  return { id: 'panel-1', title: 'Revenue', icon: 'fa-solid fa-table', partTypeId: 'pt-view', config: { type: 'View', entityName: 'MJ: Applications' } };
}

/** A part the tests add. */
function quotaPanel(id: string): DashboardPanel {
  return { id, title: 'Quota', icon: 'fa-solid fa-database', partTypeId: 'pt-query', config: { type: 'Query' } };
}

/** A Golden Layout tree holding the parts, in the shape ExtractPanelsFromLayout reads. */
function layoutOf(panels: DashboardPanel[]) {
  return { root: { type: 'row', content: [{ type: 'stack', content: panels.map((panel) => ({ type: 'component', componentState: panel })) }] } };
}

/** A dashboard's saved configuration (UIConfigDetails) whose layout holds the parts. */
function savedConfig(panels: DashboardPanel[]): string {
  return JSON.stringify({ layout: layoutOf(panels), settings: {} });
}

/** A dashboard entity double for Revenue Board, with the Revenue part in its saved layout. A test that fails a save sets LatestResult. */
function createDashboard() {
  return {
    ID: 'dash-1',
    PrimaryKey: CompositeKey.FromID('dash-1'),
    Type: 'Config',
    CategoryID: null,
    Name: 'Revenue Board',
    Description: '',
    UIConfigDetails: savedConfig([revenuePanel()]),
    LatestResult: null as SaveResultDouble | null,
  };
}

/** A dashboard entity double for Quota, which has no parts. */
function createQuotaDashboard() {
  return { ...createDashboard(), ID: 'dash-2', PrimaryKey: CompositeKey.FromID('dash-2'), Name: 'Quota', UIConfigDetails: savedConfig([]) };
}

/**
 * A viewer double with the members the tab and the editor stub use. Its parts live in `panels`; AddPanel
 * adds one the way the real viewer adds a part to its layout.
 */
function createViewer(initialPanels: DashboardPanel[]) {
  const panels = [...initialPanels];
  const partTypes = [QUERY_TYPE, VIEW_TYPE];
  const viewer = {
    Dashboard: null as MJDashboardEntity | null,
    IsEditing: false,
    HasUnsavedChanges: false,
    WaitForLayoutReady: async (): Promise<void> => undefined,
    getConfig: () => ({ layout: layoutOf(panels) }),
    GetPartTypes: (): MJDashboardPartTypeEntity[] => partTypes,
    GetPanel: (panelId: string): DashboardPanel | null => panels.find((p) => p.id === panelId) ?? null,
    /** The panel's address in the double's one stack, in the viewer's form. */
    GetPanelPath: (panelId: string): string | null => {
      const index = panels.findIndex((p) => p.id === panelId);
      return index >= 0 ? `row/0 › tab ${index}` : null;
    },
    AddPanel: vi.fn(async (partTypeId: string, config: PanelConfig, title: string, icon?: string, _position?: PanelPosition): Promise<string | null> => {
      const id = `panel-${panels.length + 1}`;
      panels.push({ id, partTypeId, config, title, icon });
      return id;
    }),
    save: vi.fn(async (): Promise<boolean> => true),
  };
  return { viewer, panels };
}

type ViewerDouble = ReturnType<typeof createViewer>['viewer'];

function permissionsFor(dashboardId: string, canEdit: boolean): DashboardUserPermissions {
  return {
    DashboardID: dashboardId,
    CanRead: true,
    CanEdit: canEdit,
    CanDelete: canEdit,
    CanShare: canEdit,
    IsOwner: canEdit,
    PermissionSource: canEdit ? 'owner' : 'direct',
  };
}

/** The permissions before a dashboard loads, as the editor has them: nothing is allowed. */
const NO_PERMISSIONS: DashboardUserPermissions = {
  DashboardID: '',
  CanRead: false,
  CanEdit: false,
  CanDelete: false,
  CanShare: false,
  IsOwner: false,
  PermissionSource: 'none',
};

/** What the editor stub needs from a test: the viewer double for each dashboard it shows. */
interface EditorStubSetup {
  CreateViewer(): ViewerDouble;
}

/** Hands the editor stub its setup. Each test module provides its own. */
const EDITOR_STUB_SETUP = new InjectionToken<EditorStubSetup>('EditorStubSetup');

/**
 * Stands in for <mj-dashboard-editor> from @memberjunction/ng-dashboards, with the inputs, outputs and members
 * the tab uses. Like the editor, it reads the dashboard its DashboardId names from DashboardEngine, shows it in a
 * viewer double, and emits Loaded once the viewer's layout is ready, or LoadFailed when the layout fails. Its
 * header shows the [headerTools] slot in both modes and the [viewActions] slot in view mode.
 */
@Component({
  standalone: true,
  selector: 'mj-dashboard-editor',
  template: `
    @if (Dashboard) {
      <header class="stub-editor-header">
        <div class="stub-header-tools"><ng-content select="[headerTools]"></ng-content></div>
        @if (!IsEditing) {
          <div class="stub-view-actions"><ng-content select="[viewActions]"></ng-content></div>
        }
      </header>
    }
    <div #body class="dashboard-editor-body"></div>
  `,
})
class EditorStub {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly setup = inject(EDITOR_STUB_SETUP);
  private shownId: string | null = null;

  @Input() Provider: IMetadataProvider | null = null;
  @Input() set DashboardId(id: string | null) {
    if (UUIDsEqual(id, this.shownId)) return;
    this.shownId = id;
    this.drop();
    if (id) queueMicrotask(() => void this.show(id));
  }
  @Output() Loaded = new EventEmitter<MJDashboardEntity>();
  @Output() LoadFailed = new EventEmitter<DashboardEditorLoadError>();
  @Output() EditingChange = new EventEmitter<boolean>();
  @Output() NameChanged = new EventEmitter<string>();
  @Output() ConfigChanged = new EventEmitter<void>();
  @Output() ReloadedFromSaved = new EventEmitter<void>();
  @Output() FavoriteChange = new EventEmitter<boolean>();
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
  @ViewChild('body', { static: true }) private body!: ElementRef<HTMLDivElement>;

  public Dashboard: MJDashboardEntity | null = null;
  public Viewer: ViewerDouble | null = null;
  public IsEditing = false;
  public IsSaving = false;
  public IsFavorite = false;
  public EditingName = '';
  public EditingDescription = '';
  public Permissions: DashboardUserPermissions = NO_PERMISSIONS;

  public get BodyElement(): HTMLElement {
    return this.body.nativeElement;
  }
  public get CanEdit(): boolean {
    return this.Permissions.CanEdit;
  }
  public get PartTypes(): MJDashboardPartTypeEntity[] {
    return this.Viewer?.GetPartTypes() ?? [];
  }

  public EnterEditMode(): boolean {
    if (this.IsEditing) return true;
    if (!this.Dashboard || !this.CanEdit) return false;
    this.setEditing(true);
    return true;
  }

  public ToggleEditMode(): void {
    if (this.IsEditing) this.CancelEdit();
    else this.EnterEditMode();
  }

  public CancelEdit(): void {
    if (this.IsEditing && !this.IsSaving) this.setEditing(false);
  }

  public async SaveDashboard(): Promise<void> {
    await this.Save();
  }

  /** Saves like the editor: the overrides first, one Save at a time, a renamed dashboard reports NameChanged, and a save leaves edit mode. */
  public async Save(overrides: DashboardSaveOverrides = {}): Promise<string | null> {
    const dashboard = this.Dashboard;
    const viewer = this.Viewer;
    if (!dashboard || !viewer) return 'No dashboard is open.';
    if (this.IsSaving) return SAVE_IN_PROGRESS;
    const savedName = dashboard.Name;
    if (overrides.Name !== undefined) dashboard.Name = overrides.Name;
    if (overrides.Description !== undefined) dashboard.Description = overrides.Description;
    this.IsSaving = true;
    try {
      if (!(await viewer.save())) {
        const reason = dashboard.LatestResult?.CompleteMessage;
        return reason ? `Could not save the dashboard: ${reason}` : 'Could not save the dashboard';
      }
      if (dashboard.Name !== savedName) this.NameChanged.emit(dashboard.Name);
      if (this.IsEditing) this.setEditing(false);
      return null;
    } finally {
      this.IsSaving = false;
    }
  }

  public OpenAddPartDialog(): void {
    // The editor opens its part dialog; the stub has none.
  }

  public RefreshPermissions(): void {
    this.Permissions = this.Dashboard ? DashboardEngine.Instance.GetDashboardPermissions(this.Dashboard.ID, USER_ID) : NO_PERMISSIONS;
  }

  private setEditing(editing: boolean): void {
    this.IsEditing = editing;
    if (this.Viewer) this.Viewer.IsEditing = editing;
    SafeDetectChanges(this.cdr);
    this.EditingChange.emit(editing);
  }

  /** Forgets the dashboard shown before. An edit in progress ends, and EditingChange says so. */
  private drop(): void {
    const wasEditing = this.IsEditing;
    this.Dashboard = null;
    this.Viewer = null;
    this.IsEditing = false;
    this.Permissions = NO_PERMISSIONS;
    if (wasEditing) this.EditingChange.emit(false);
  }

  private async show(id: string): Promise<void> {
    const dashboard = DashboardEngine.Instance.Dashboards.find((d) => UUIDsEqual(d.ID, id)) ?? null;
    if (!dashboard) {
      this.LoadFailed.emit({ DashboardId: id, Message: `Dashboard with ID ${id} not found.` });
      return;
    }
    const viewer = this.setup.CreateViewer();
    this.Dashboard = dashboard;
    this.Viewer = viewer;
    viewer.Dashboard = dashboard;
    this.RefreshPermissions();
    SafeDetectChanges(this.cdr);
    try {
      await viewer.WaitForLayoutReady();
    } catch (error) {
      if (UUIDsEqual(this.shownId, id)) this.LoadFailed.emit({ DashboardId: id, Message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (UUIDsEqual(this.shownId, id)) this.Loaded.emit(dashboard);
  }
}

/** The editor stub in the tab, or null while the tab shows none. */
function editorOf(fixture: ComponentFixture<DashboardResource>): EditorStub | null {
  return fixture.debugElement.query(By.directive(EditorStub))?.injector.get(EditorStub) ?? null;
}

/** The editor stub in the tab. Fails the test when the tab shows none. */
function editor(fixture: ComponentFixture<DashboardResource>): EditorStub {
  const stub = editorOf(fixture);
  if (!stub) throw new Error('The tab shows no editor.');
  return stub;
}

/** The context the tab last reported to the agent. */
function lastAgentContext(navigation: { SetAgentContext: ReturnType<typeof vi.fn> }): Record<string, unknown> | undefined {
  return navigation.SetAgentContext.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

/** A DashboardEngine double holding the dashboards. */
function createEngine(dashboards: object[], canEdit: boolean) {
  return {
    Config: vi.fn(async () => undefined),
    Dashboards: dashboards,
    DashboardCategories: [],
    DashboardPartTypes: [QUERY_TYPE, VIEW_TYPE],
    GetAccessibleDashboards: () => dashboards,
    GetDashboardPermissions: vi.fn((dashboardId: string) => permissionsFor(dashboardId, canEdit)),
  };
}

/**
 * A NavigationService double with the members the tab uses. `DashboardEditModeRequested$` stands for
 * OpenDashboard asking a tab that was already open to enter edit mode. `AppContextSnapshot$` holds the
 * snapshot the shell publishes, by default none.
 */
function createNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    OpenDashboard: vi.fn(),
    OpenEntityRecord: vi.fn((_entityName: string, _recordPkey: CompositeKey): string => 'record-tab'),
    OpenNavItemByName: vi.fn(
      async (_navItemName: string, _configuration?: Record<string, unknown>, _appId?: string, _options?: { queryParams?: Record<string, string | null> }): Promise<string | null> =>
        'nav-tab',
    ),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    TakeDashboardEditModeRequest: vi.fn((_tabId: string, _dashboardId: string, _applicationId: string): boolean => false),
    DashboardEditModeRequested$: new Subject<string>(),
    AppContextSnapshot$: new BehaviorSubject<AppContextSnapshot | null>(null),
  };
}

/** An ArtifactPermissionService double: the user can read the artifacts they own. */
function createArtifactPermissions() {
  return { GetReadableArtifactsFilter: vi.fn(async (userId: string): Promise<string> => `(UserID='${userId}')`) };
}

/** A RealtimeSessionService double. A test sets IsActive while a voice session runs. */
function createRealtimeSession() {
  return { IsActive: false, SendVideoFrame: vi.fn() };
}

/**
 * The testing module the tab renders in: the editor stub, the real Add to menu, confirm dialog, mjButton and
 * angular-split split, stubs for the share dialog, the chat area and the loading indicator, and doubles for the
 * services the tab injects. By default no voice session runs.
 */
function tabModule(
  navigation: object,
  setup: EditorStubSetup,
  artifactPermissions: ReturnType<typeof createArtifactPermissions>,
  realtimeSession: ReturnType<typeof createRealtimeSession>,
): { imports: Array<Type<unknown>>; declarations: Array<Type<unknown>>; providers: Provider[] } {
  return {
    imports: [AngularSplitModule, MJButtonDirective, EditorStub, ShareDialogStub, ChatAreaStub, LoadingStub],
    declarations: [DashboardResource, DashboardAddToMenuComponent, ConfirmDialogComponent],
    providers: [
      { provide: EDITOR_STUB_SETUP, useValue: setup },
      { provide: NavigationService, useValue: navigation },
      { provide: RecentAccessService, useValue: { LogAccess: vi.fn(async () => undefined) } },
      { provide: HomeAppPinService, useValue: { IsPinned: () => false, LoadPins: vi.fn(async () => undefined) } },
      { provide: RealtimeSessionService, useValue: realtimeSession },
      { provide: ArtifactPermissionService, useValue: artifactPermissions },
    ],
  };
}

/** The user view fields the agent's source search reads. */
type ViewDouble = Pick<MJUserViewEntityExtended, 'ID' | 'Name' | 'Description' | 'Entity' | 'EntityID' | 'UserCanView'>;

/** The query fields the agent's source search reads. */
type QueryDouble = Pick<MJQueryEntityExtended, 'ID' | 'Name' | 'Description' | 'Category' | 'UserCanRun'>;

/** Loads an engine, as BaseEngine subclasses' Config does. */
type EngineConfig = (forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) => Promise<void>;

/**
 * Doubles for the engines the agent's source search reads, so no test loads them. Both are loaded and
 * hold the user's own views, the shared views and the queries given, by default none.
 */
function stubSourceEngines(data: { ownViews?: ViewDouble[]; sharedViews?: ViewDouble[]; queries?: QueryDouble[] } = {}) {
  const views = {
    Config: vi.fn<EngineConfig>(async () => undefined),
    IsPermissionConstrained: false,
    GetViewsForCurrentUser: () => data.ownViews ?? [],
    GetSharedViews: () => data.sharedViews ?? [],
  };
  const queries = { Config: vi.fn<EngineConfig>(async () => undefined), IsPermissionConstrained: false, Queries: data.queries ?? [] };
  const artifactTypes = { Config: vi.fn<EngineConfig>(async () => undefined) };
  vi.spyOn(UserViewEngine, 'Instance', 'get').mockReturnValue(views as unknown as UserViewEngine);
  vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue(queries as unknown as QueryEngine);
  vi.spyOn(ArtifactMetadataEngine, 'Instance', 'get').mockReturnValue(artifactTypes as unknown as ArtifactMetadataEngine);
  return { views, queries, artifactTypes };
}

const TAB_ID = 'tab-1';
/** The application of the tab. */
const APP_ID = 'app-dashboards';

/** The tab's resource data as the tab container builds it for a dashboard tab. */
function dashboardTabData(dashboardId: string): ResourceData {
  return new ResourceData({
    ResourceRecordID: dashboardId,
    Configuration: { tabId: TAB_ID, applicationId: APP_ID, resourceType: 'Dashboards', dashboardId, recordId: dashboardId },
  });
}

/** One dashboard the editor stub showed: its viewer double and the viewer's parts. */
interface EditorLoad {
  viewer: ViewerDouble;
  panels: DashboardPanel[];
}

/** How the viewer doubles of the next loads get their layout ready. A test can change it between loads. */
interface LayoutControl {
  /** True: each new layout waits until the test calls `releaseLayout`. */
  Hold: boolean;
  /** When set, each new layout fails with this error. */
  Failure: Error | null;
}

/**
 * Renders the tab and gives it the resource data of Revenue Board (dash-1) through the real Data setter, as
 * the tab container does; the tab shows the dashboard in the editor stub. The engine holds Revenue Board and
 * Quota (dash-2). `canEdit` is the user's edit permission. `editRequest` stands for a tab opened with
 * `openInEditMode` for Revenue Board: like NavigationService, the double's TakeDashboardEditModeRequest returns
 * true for the first call for that tab, dashboard and application only. `holdLayout` keeps the first layout
 * from getting ready until the test calls `releaseLayout`; until then the load has not finished. `panels` are
 * the parts of each viewer double, `sources` what the source search engines hold, and `provider` the tab's
 * metadata provider (by default a fake one whose views return no rows). `onLoadComplete` stands for the tab
 * container's LoadCompleteEvent.
 */
async function renderTab(
  options: {
    canEdit?: boolean;
    editRequest?: boolean;
    holdLayout?: boolean;
    panels?: DashboardPanel[];
    sources?: Parameters<typeof stubSourceEngines>[0];
    provider?: IMetadataProvider;
    onLoadComplete?: () => void;
  } = {},
) {
  const dashboard = createDashboard();
  const engine = createEngine([dashboard, createQuotaDashboard()], options.canEdit ?? true);
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  const notify = vi.fn();
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
  const sourceEngines = stubSourceEngines(options.sources);

  let editRequested = options.editRequest === true;
  const navigation = createNavigation();
  navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string, applicationId: string): boolean => {
    if (tabId !== TAB_ID || dashboardId !== 'dash-1' || applicationId !== APP_ID || !editRequested) return false;
    editRequested = false;
    return true;
  });

  const loads: EditorLoad[] = [];
  const layout: LayoutControl = { Hold: options.holdLayout === true, Failure: null };
  let releaseLayout = (): void => undefined;
  const setup: EditorStubSetup = {
    CreateViewer: () => {
      const load = createViewer(options.panels ?? [revenuePanel()]);
      const failure = layout.Failure;
      if (failure) {
        load.viewer.WaitForLayoutReady = () => Promise.reject(failure);
      } else if (layout.Hold) {
        const ready = new Promise<void>((resolve) => (releaseLayout = resolve));
        load.viewer.WaitForLayoutReady = () => ready;
      }
      loads.push(load);
      return load.viewer;
    },
  };
  const artifactPermissions = createArtifactPermissions();
  const realtimeSession = createRealtimeSession();

  const fixture = RenderComponentFixture(DashboardResource, {
    ...tabModule(navigation, setup, artifactPermissions, realtimeSession),
    inputs: { Provider: options.provider ?? CreateFakeProvider({ currentUser: { ID: USER_ID } }) },
    setup: (tab) => {
      if (options.onLoadComplete) tab.LoadCompleteEvent = options.onLoadComplete;
      tab.Data = dashboardTabData('dash-1');
    },
  });
  if (options.holdLayout) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  } else {
    await settle(fixture);
  }
  return { fixture, navigation, loads, layout, notify, dashboard, engine, sourceEngines, artifactPermissions, realtimeSession, releaseLayout: () => releaseLayout() };
}

/** Lets the tab's and the editor stub's deferred work run (the load, the agent's requests), and renders. */
async function settle(fixture: ComponentFixture<DashboardResource>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

// ---------------------------------------------------------------------------
// The load, the tab title and the buttons the tab puts in the editor's header
// ---------------------------------------------------------------------------

/** The AI button the tab puts in the editor's header. */
const AI_TOGGLE = '.dashboard-tab-ai-toggle';

describe('DashboardResource and its editor (DOM)', () => {
  it('notifies load complete on Loaded and on LoadFailed', async () => {
    const loadComplete = vi.fn();
    const { fixture, layout, releaseLayout } = await renderTab({ holdLayout: true, onLoadComplete: loadComplete });

    // The editor shows the dashboard, but its layout is not ready: the load has not finished.
    expect(editor(fixture).Dashboard?.ID).toBe('dash-1');
    expect(loadComplete).not.toHaveBeenCalled();

    releaseLayout();
    await settle(fixture);

    expect(loadComplete).toHaveBeenCalledTimes(1);
    expect(Query(fixture, '.error-state')).toBeNull();

    // The tab opens Quota, whose layout fails: the editor reports LoadFailed, and the tab shows why.
    layout.Hold = false;
    layout.Failure = new Error('The layout could not be built');
    fixture.componentInstance.Data = dashboardTabData('dash-2');
    await settle(fixture);

    expect(loadComplete).toHaveBeenCalledTimes(2);
    expect(Text(fixture, '.error-message')).toBe('The dashboard "Quota" could not be loaded. There may be an issue with the dashboard configuration.');
    expect(Text(fixture, '.error-details pre')).toBe('The layout could not be built');
    expect(editorOf(fixture)).toBeNull();
  });

  it('takes the openInEditMode request on Loaded and enters edit mode through the editor', async () => {
    const { fixture, navigation, releaseLayout } = await renderTab({ editRequest: true, holdLayout: true });
    const enterEditMode = vi.spyOn(editor(fixture), 'EnterEditMode');

    // The editor has not finished loading: the request waits for it.
    expect(navigation.TakeDashboardEditModeRequest).not.toHaveBeenCalled();

    releaseLayout();
    await settle(fixture);

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(enterEditMode).toHaveBeenCalledTimes(1);
    expect(editor(fixture).IsEditing).toBe(true);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardId: 'dash-1', OpenedDashboardIsEditing: true });
  });

  it('renames the tab on NameChanged and never calls ResourceRecordSaved', async () => {
    const { fixture, navigation } = await renderTab();
    const tab = fixture.componentInstance;
    const displayNameChanged = vi.fn();
    tab.DisplayNameChangedEvent = displayNameChanged;
    const recordSaved = vi.spyOn(tab as unknown as { ResourceRecordSaved(entity: unknown): void }, 'ResourceRecordSaved');
    const shownDashboard = editor(fixture).Dashboard;

    editor(fixture).NameChanged.emit('Renamed Board');
    await settle(fixture);

    expect(displayNameChanged).toHaveBeenCalledExactlyOnceWith('Renamed Board');
    expect(recordSaved).not.toHaveBeenCalled();
    // ResourceRecordSaved would rewrite the record ID to the URL-segment form ('ID|dash-1'), and the tab would reload.
    expect(tab.Data.ResourceRecordID).toBe('dash-1');
    expect(editor(fixture).Dashboard).toBe(shownDashboard);
    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(1);
  });

  it('reports panels on ConfigChanged but not on ReloadedFromSaved', async () => {
    const { fixture, navigation, loads } = await renderTab();
    const { panels } = loads[0];
    const reports = navigation.SetAgentContext.mock.calls.length;

    // A layout move or resize: the panels are the same.
    editor(fixture).ConfigChanged.emit();
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports);

    panels.push(quotaPanel('panel-2'));
    editor(fixture).ConfigChanged.emit();

    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports + 1);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardPanelCount: 2 });

    // A save elsewhere: the editor rebuilds the saved layout, says so, and then the rebuilt layout reports its change.
    panels.push(quotaPanel('panel-3'));
    editor(fixture).ReloadedFromSaved.emit();
    editor(fixture).ConfigChanged.emit();

    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports + 1);
  });

  it('projects the AI toggle in both modes and Add to plus Share only in view mode', async () => {
    const { fixture } = await renderTab();

    expect(Query(fixture, `.stub-header-tools ${AI_TOGGLE}`)).not.toBeNull();
    expect(Query(fixture, '.stub-view-actions mj-dashboard-add-to-menu')).not.toBeNull();
    expect(Query(fixture, '.stub-view-actions .dashboard-tab-share')).not.toBeNull();

    editor(fixture).EnterEditMode();
    fixture.detectChanges();

    expect(Query(fixture, `.stub-header-tools ${AI_TOGGLE}`)).not.toBeNull();
    expect(Query(fixture, 'mj-dashboard-add-to-menu')).toBeNull();
    expect(Query(fixture, '.dashboard-tab-share')).toBeNull();

    editor(fixture).CancelEdit();
    fixture.detectChanges();

    expect(Query(fixture, '.stub-view-actions mj-dashboard-add-to-menu')).not.toBeNull();
    expect(Query(fixture, '.stub-view-actions .dashboard-tab-share')).not.toBeNull();
  });

  it('shows Share only to a user who can share, and tells the Add to menu', async () => {
    const { fixture } = await renderTab({ canEdit: false });

    expect(Query(fixture, '.stub-view-actions mj-dashboard-add-to-menu')).not.toBeNull();
    expect(Query(fixture, '.dashboard-tab-share')).toBeNull();
    expect(fixture.debugElement.query(By.directive(DashboardAddToMenuComponent)).injector.get(DashboardAddToMenuComponent).CanShare).toBe(false);
  });

  it('shows a Code dashboard and the Data Explorer only in its own container, which it hides while the editor shows a dashboard', async () => {
    const { fixture } = await renderTab();
    const container = fixture.componentInstance.ContainerElement.nativeElement;

    expect(container.classList.contains('is-hidden')).toBe(true);
    expect(container.closest('mj-dashboard-editor')).toBeNull();
    expect(container.children).toHaveLength(0);
  });
});

describe('DashboardResource edit mode on first load (DOM)', () => {
  it('opens in edit mode when the tab was opened with openInEditMode and the user can edit the dashboard', async () => {
    const { fixture, navigation, loads } = await renderTab({ editRequest: true });

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(true);
    expect(loads[0].viewer.IsEditing).toBe(true);
    // One report to the agent for the load, already in edit mode.
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardId: 'dash-1', OpenedDashboardIsEditing: true });
  });

  it('opens for viewing when the tab was opened without openInEditMode', async () => {
    const { fixture, navigation, loads } = await renderTab();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(false);
    expect(loads[0].viewer.IsEditing).toBe(false);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: false });
  });

  it('opens for viewing, and uses up the request, when the user cannot edit the dashboard', async () => {
    const { fixture, navigation, loads } = await renderTab({ editRequest: true, canEdit: false });

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(navigation.TakeDashboardEditModeRequest.mock.results[0].value).toBe(true);
    expect(editor(fixture).IsEditing).toBe(false);
    expect(loads[0].viewer.IsEditing).toBe(false);
  });

  it('applies the request to the first load only: after Cancel, the next dashboard in the tab opens for viewing', async () => {
    const { fixture, navigation, loads } = await renderTab({ editRequest: true });
    expect(editor(fixture).IsEditing).toBe(true);

    editor(fixture).CancelEdit();
    fixture.detectChanges();
    expect(editor(fixture).IsEditing).toBe(false);

    // The tab now shows another dashboard (the tab container sets new data for a different record).
    fixture.componentInstance.Data = dashboardTabData('dash-2');
    await settle(fixture);

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(2);
    expect(editor(fixture).Dashboard?.Name).toBe('Quota');
    expect(editor(fixture).IsEditing).toBe(false);
    expect(loads).toHaveLength(2);
    expect(loads[1].viewer.IsEditing).toBe(false);
  });
});

describe('DashboardResource edit-mode requests for a tab that is already open (DOM)', () => {
  it('enters edit mode when OpenDashboard asks this open tab to', async () => {
    const { fixture, navigation, loads } = await renderTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-1');

    navigation.DashboardEditModeRequested$.next('tab-other');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(1);
    expect(editor(fixture).IsEditing).toBe(false);

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith(TAB_ID, 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(true);
    expect(loads[0].viewer.IsEditing).toBe(true);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: true });
  });

  it('leaves the request for the load when the tab has not finished loading', async () => {
    const { fixture, navigation, releaseLayout } = await renderTab({ editRequest: true, holdLayout: true });

    navigation.DashboardEditModeRequested$.next(TAB_ID);

    expect(navigation.TakeDashboardEditModeRequest).not.toHaveBeenCalled();

    releaseLayout();
    await settle(fixture);

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(true);
  });

  it('keeps the changes of a tab that is already editing when asked again', async () => {
    const { fixture, navigation } = await renderTab({ editRequest: true });
    const enterEditMode = vi.spyOn(editor(fixture), 'EnterEditMode');
    editor(fixture).EditingName = 'Renamed Board';
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-1');

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    await settle(fixture);

    expect(enterEditMode).not.toHaveBeenCalled();
    expect(editor(fixture).IsEditing).toBe(true);
    expect(editor(fixture).EditingName).toBe('Renamed Board');
  });

  it('takes no request while the tab opens another dashboard: the load of that dashboard takes its own', async () => {
    const { fixture, navigation } = await renderTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string) => tabId === TAB_ID);

    // The editor still shows Revenue Board until the tab has found Quota.
    fixture.componentInstance.Data = dashboardTabData('dash-2');
    navigation.DashboardEditModeRequested$.next(TAB_ID);
    await settle(fixture);

    expect(navigation.TakeDashboardEditModeRequest.mock.calls).toEqual([
      [TAB_ID, 'dash-1', APP_ID],
      [TAB_ID, 'dash-2', APP_ID],
    ]);
    expect(editor(fixture).Dashboard?.Name).toBe('Quota');
    expect(editor(fixture).IsEditing).toBe(true);
  });

  it('takes no request once the tab is closed', async () => {
    const { fixture, navigation } = await renderTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-1');

    fixture.destroy();
    navigation.DashboardEditModeRequested$.next(TAB_ID);

    // The only call is the first load's.
    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves a request to the dashboard its tab shows now (a temporary tab replaced in place)', async () => {
    const { fixture, navigation, loads } = await renderTab();
    // The tab now shows Quota, which is asked to enter edit mode; this cached component shows Revenue Board.
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-2');

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    fixture.componentInstance.RebindTabId('tab-2');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest.mock.calls.slice(1)).toEqual([
      [TAB_ID, 'dash-1', APP_ID],
      ['tab-2', 'dash-1', APP_ID],
    ]);
    expect(navigation.TakeDashboardEditModeRequest.mock.results.slice(1).map((r) => r.value)).toEqual([false, false]);
    expect(editor(fixture).IsEditing).toBe(false);
    expect(loads[0].viewer.IsEditing).toBe(false);
  });

  it("leaves a request to its tab's application: this cached component of the dashboard, from another application, does not take it", async () => {
    const { fixture, navigation, loads } = await renderTab();
    // OpenTab replaced the tab in place with another application's tab of Revenue Board, which is
    // asked to enter edit mode. This component still has the tab ID.
    navigation.TakeDashboardEditModeRequest.mockImplementation(
      (tabId: string, dashboardId: string, applicationId: string) => tabId === TAB_ID && dashboardId === 'dash-1' && applicationId === 'app-home',
    );

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith(TAB_ID, 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(false);
    expect(loads[0].viewer.IsEditing).toBe(false);
  });

  it('enters edit mode when the tab container reattaches the cached tab to a tab opened with openInEditMode', async () => {
    const { fixture, navigation, loads } = await renderTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === 'tab-2' && dashboardId === 'dash-1');

    fixture.componentInstance.RebindTabId('tab-2');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith('tab-2', 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(true);
    expect(loads[0].viewer.IsEditing).toBe(true);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: true });
  });

  it('keeps a reattached tab for viewing when its new tab has no edit-mode request', async () => {
    const { fixture, navigation, loads } = await renderTab();

    fixture.componentInstance.RebindTabId('tab-2');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith('tab-2', 'dash-1', APP_ID);
    expect(editor(fixture).IsEditing).toBe(false);
    expect(loads[0].viewer.IsEditing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The agent's tools: registration, edits, requests to the user and source search
// ---------------------------------------------------------------------------

/** The confirm dialog the agent's Request* tools open. */
const AGENT_CONFIRM = 'mj-confirm-dialog.agent-confirm';

/** The tools the tab registered last. */
function registeredTools(navigation: ReturnType<typeof createNavigation>): DashboardTabAgentTool[] {
  return navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? [];
}

/** The tool with this name that the tab registered last. */
function agentTool(navigation: ReturnType<typeof createNavigation>, name: string): DashboardTabAgentTool {
  const tool = registeredTools(navigation).find((t) => t.Name === name);
  if (!tool) throw new Error(`The tab registered no tool named ${name}`);
  return tool;
}

/** A box on screen, as getBoundingClientRect gives it (jsdom has no layout of its own). */
function screenBox(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

/**
 * Puts a panel's content element in the editor's body, as Golden Layout does, at a box on screen.
 * A hidden one (a stack's inactive tab) has no offsetParent.
 */
function placePanelContent(body: HTMLElement, panelId: string, box: DOMRect, shown: boolean): void {
  const content = document.createElement('div');
  content.className = 'dashboard-panel-content';
  content.dataset['panelId'] = panelId;
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(box);
  Object.defineProperty(content, 'offsetParent', { configurable: true, get: () => (shown ? body : null) });
  body.appendChild(content);
}

/** An entity the provider's metadata lists, which the user can or cannot read. */
function entityInfo(id: string, name: string, canRead: boolean): Partial<EntityInfo> {
  const permissions = { CanRead: canRead } as ReturnType<EntityInfo['GetUserPermisions']>;
  return { ID: id, Name: name, DisplayName: name, Description: `${name} records`, GetUserPermisions: () => permissions };
}

describe('DashboardResource agent tools (DOM)', () => {
  it('registers the studio tools after the two read-only tools, once, when the dashboard loads', async () => {
    const { navigation } = await renderTab();

    expect(navigation.SetAgentClientTools).toHaveBeenCalledTimes(1);
    expect(registeredTools(navigation).map((t) => t.Name)).toEqual([
      'GetDashboardPanels',
      'GetDashboardDetail',
      'GetDashboardState',
      'AddPanel',
      'RemovePanel',
      'MovePanel',
      'ResizePanel',
      'UpdatePanelSettings',
      'GetDashboardScreenshot',
      'RequestSaveDashboard',
      'RequestPinToHome',
      'SearchSources',
    ]);
  });

  it('loads the view and query engines with a Config dashboard, before it registers the tools', async () => {
    const { navigation, sourceEngines } = await renderTab();

    expect(sourceEngines.views.Config).toHaveBeenCalledExactlyOnceWith(false, expect.objectContaining({ ID: USER_ID }), expect.anything());
    expect(sourceEngines.queries.Config).toHaveBeenCalledExactlyOnceWith(false, expect.objectContaining({ ID: USER_ID }), expect.anything());
    expect(sourceEngines.views.Config.mock.invocationCallOrder[0]).toBeLessThan(navigation.SetAgentClientTools.mock.invocationCallOrder[0]);
  });

  it("adds a panel for the agent through the editor's viewer, entering edit mode first, and reports the new panel", async () => {
    const { fixture, loads, navigation } = await renderTab();
    const { viewer } = loads[0];

    const result = await agentTool(navigation, 'AddPanel').Handler({
      dashboardId: 'dash-1',
      partType: 'View',
      config: { entityName: 'MJ: Users' },
      title: 'Users',
      position: { relativeTo: 'panel-1', placement: 'right' },
    });
    fixture.detectChanges();

    expect(result).toEqual({ Success: true, Data: { panelId: 'panel-2', path: 'row/0 › tab 1' } });
    expect(viewer.AddPanel).toHaveBeenCalledExactlyOnceWith('pt-view', { type: 'View', entityName: 'MJ: Users' }, 'Users', undefined, {
      relativeTo: 'panel-1',
      placement: 'right',
    });
    expect(editor(fixture).IsEditing).toBe(true);
    expect(lastAgentContext(navigation)).toMatchObject({
      OpenedDashboardIsEditing: true,
      OpenedDashboardPanelCount: 2,
      OpenedDashboardPanels: [{ Id: 'panel-1', Title: 'Revenue' }, { Id: 'panel-2', Title: 'Users' }],
    });
  });

  it("measures each shown panel from the editor's body, which the screenshot captures, adding its scroll offset, and leaves hidden panels out", async () => {
    const { fixture } = await renderTab({ panels: [revenuePanel(), quotaPanel('panel-2'), quotaPanel('panel-3')] });
    const body = Query(fixture, 'mj-dashboard-editor .dashboard-editor-body') as HTMLElement;
    expect(body).toBe(editor(fixture).BodyElement);
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(screenBox(100, 50, 900, 600));
    Object.defineProperty(body, 'scrollTop', { configurable: true, value: 20 });
    placePanelContent(body, 'panel-1', screenBox(110, 70, 400.4, 299.6), true);
    placePanelContent(body, 'panel-2', screenBox(510, 70, 300, 300), true);
    placePanelContent(body, 'panel-3', screenBox(510, 70, 300, 300), false);

    // The host the studio tools read; the screenshot tool scales these boxes to the image.
    const host = (fixture.componentInstance as unknown as { studioHost(): DashboardStudioHost }).studioHost();

    expect(host.PanelBounds()).toEqual([
      { panelId: 'panel-1', x: 10, y: 40, width: 400, height: 300 },
      { panelId: 'panel-2', x: 410, y: 40, width: 300, height: 300 },
    ]);
  });

  it("gives the agent the viewer's reason when an edit fails, and tells the user", async () => {
    const { loads, navigation, notify } = await renderTab();
    loads[0].viewer.AddPanel.mockRejectedValueOnce(new Error('The layout did not rebuild'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await agentTool(navigation, 'AddPanel').Handler({ dashboardId: 'dash-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'Users' });

    expect(result).toEqual({ Success: false, ErrorMessage: 'The layout did not rebuild. Call GetDashboardState to see the dashboard as it is now.' });
    expect(notify).toHaveBeenCalledExactlyOnceWith('The assistant could not add the part', 'error', 3000);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('Dashboard tab: The assistant could not add the part: The layout did not rebuild');
  });
});

describe('DashboardResource requests from the agent (DOM)', () => {
  it("Confirm('save') opens the dialog and resolves true once the user confirms and the editor saved", async () => {
    const { fixture, loads, navigation, dashboard } = await renderTab();
    const tab = fixture.componentInstance;
    const displayNameChanged = vi.fn();
    tab.DisplayNameChangedEvent = displayNameChanged;
    editor(fixture).EnterEditMode();
    const save = vi.spyOn(editor(fixture), 'Save');

    const request = agentTool(navigation, 'RequestSaveDashboard').Handler({ dashboardId: 'dash-1', name: 'Revenue 2027' });
    await settle(fixture);

    expect(Text(fixture, `${AGENT_CONFIRM} .confirm-title`)).toBe('Save dashboard?');
    expect(Text(fixture, `${AGENT_CONFIRM} .confirm-message`)).toBe('The assistant asks to save "Revenue Board". Its new name will be "Revenue 2027".');
    expect(Text(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-primary`)).toBe('Save');
    expect(save).not.toHaveBeenCalled();

    Click(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-primary`);
    await settle(fixture);

    // RequestSaveDashboard reports Confirm's true as a confirmed request.
    await expect(request).resolves.toEqual({ Success: true, Data: { requested: true, confirmed: true } });
    expect(save).toHaveBeenCalledExactlyOnceWith({ Name: 'Revenue 2027', Description: undefined });
    expect(loads[0].viewer.save).toHaveBeenCalledTimes(1);
    expect(dashboard.Name).toBe('Revenue 2027');
    // The editor reports the saved name; the tab takes it and stays on its dashboard.
    expect(displayNameChanged).toHaveBeenCalledExactlyOnceWith('Revenue 2027');
    expect(tab.Data.ResourceRecordID).toBe('dash-1');
    expect(Query(fixture, AGENT_CONFIRM)).toBeNull();
    expect(editor(fixture).IsEditing).toBe(false);
  });

  it("Confirm('save') resolves false and saves nothing when the user answers Not now", async () => {
    const { fixture, loads, navigation } = await renderTab();
    editor(fixture).EnterEditMode();
    const save = vi.spyOn(editor(fixture), 'Save');

    const request = agentTool(navigation, 'RequestSaveDashboard').Handler({ dashboardId: 'dash-1' });
    await settle(fixture);
    expect(Text(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-secondary`)).toBe('Not now');

    Click(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-secondary`);
    await settle(fixture);

    // RequestSaveDashboard reports Confirm's false as a decline.
    await expect(request).resolves.toEqual({ Success: false, ErrorMessage: 'The user declined. Do not retry unless they ask again.' });
    expect(save).not.toHaveBeenCalled();
    expect(loads[0].viewer.save).not.toHaveBeenCalled();
    expect(Query(fixture, AGENT_CONFIRM)).toBeNull();
    expect(editor(fixture).IsEditing).toBe(true);
  });

  it('Confirm rejects while another confirmation is open, and the open one still takes its answer', async () => {
    const { fixture, navigation } = await renderTab();
    const pin = agentTool(navigation, 'RequestPinToHome').Handler({ dashboardId: 'dash-1' });
    await settle(fixture);

    // A second request reports Confirm's rejection with its message, not as a decline.
    const second = await agentTool(navigation, 'RequestPinToHome').Handler({ dashboardId: 'dash-1' });
    fixture.detectChanges();

    expect(second).toEqual({ Success: false, ErrorMessage: 'Another confirmation is already open. Wait for the user to answer it, then try again.' });
    expect(QueryAll(fixture, `${AGENT_CONFIRM} .confirm-dialog`)).toHaveLength(1);
    expect(Text(fixture, `${AGENT_CONFIRM} .confirm-title`)).toBe('Pin to Home?');
    expect(Text(fixture, `${AGENT_CONFIRM} .confirm-message`)).toBe('The assistant asks to pin "Revenue Board" to your Home app.');

    Click(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-secondary`);
    await settle(fixture);

    await expect(pin).resolves.toEqual({ Success: false, ErrorMessage: 'The user declined. Do not retry unless they ask again.' });
    expect(Query(fixture, AGENT_CONFIRM)).toBeNull();
  });

  it("Confirm rejects with the editor's reason when the confirmed save fails, and the tab stays in edit mode", async () => {
    const { fixture, loads, navigation, dashboard } = await renderTab();
    loads[0].viewer.save.mockImplementationOnce(async () => {
      dashboard.LatestResult = { Success: false, CompleteMessage: 'Name cannot be longer than 510 characters' };
      return false;
    });
    editor(fixture).EnterEditMode();
    const request = agentTool(navigation, 'RequestSaveDashboard').Handler({ dashboardId: 'dash-1' });
    await settle(fixture);

    Click(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-primary`);
    await settle(fixture);

    await expect(request).resolves.toEqual({ Success: false, ErrorMessage: 'Could not save the dashboard: Name cannot be longer than 510 characters' });
    expect(Query(fixture, AGENT_CONFIRM)).toBeNull();
    expect(editor(fixture).IsEditing).toBe(true);
  });

  it("Confirm rejects when the user's Save started while the dialog was open, with the reason the editor gives", async () => {
    const { fixture, loads, navigation } = await renderTab();
    editor(fixture).EnterEditMode();
    const request = agentTool(navigation, 'RequestSaveDashboard').Handler({ dashboardId: 'dash-1', name: 'Agent name' });
    await settle(fixture);
    editor(fixture).IsSaving = true;

    Click(fixture, `${AGENT_CONFIRM} .dialog-footer .btn-primary`);
    await settle(fixture);

    await expect(request).resolves.toEqual({ Success: false, ErrorMessage: SAVE_IN_PROGRESS });
    expect(loads[0].viewer.save).not.toHaveBeenCalled();
    expect(editor(fixture).Dashboard?.Name).toBe('Revenue Board');
  });

  it('ends an open request when the tab closes', async () => {
    const { fixture, navigation } = await renderTab();
    const pin = agentTool(navigation, 'RequestPinToHome').Handler({ dashboardId: 'dash-1' });
    await settle(fixture);

    fixture.destroy();

    await expect(pin).resolves.toEqual({ Success: false, ErrorMessage: 'The dashboard tab was closed before the user answered.' });
  });

  it('ends an open request when the tab opens another dashboard, so a late answer cannot act on it', async () => {
    const { fixture, navigation } = await renderTab();
    const pin = agentTool(navigation, 'RequestPinToHome').Handler({ dashboardId: 'dash-1' });
    await settle(fixture);
    expect(Query(fixture, AGENT_CONFIRM)).not.toBeNull();

    fixture.componentInstance.Data = dashboardTabData('dash-2');
    await settle(fixture);

    await expect(pin).resolves.toEqual({ Success: false, ErrorMessage: 'The tab opened another dashboard before the user answered.' });
    expect(Query(fixture, AGENT_CONFIRM)).toBeNull();
    expect(editor(fixture).Dashboard?.Name).toBe('Quota');
  });
});

describe('DashboardResource source search for the agent (DOM)', () => {
  it("finds the artifacts the user can read and pins each one's panel to its latest version", async () => {
    const views: RunViewParams[] = [];
    const provider = CreateFakeProvider<object>({
      currentUser: { ID: USER_ID },
      runViewResults: (params) => {
        views.push(params);
        if (params.EntityName === 'MJ: Artifacts') {
          return [
            { ID: 'art-1', Name: 'Revenue chart', Description: 'Monthly revenue', Type: 'Component' },
            { ID: 'art-2', Name: 'Revenue notes', Description: null, Type: 'Markdown Document' },
          ];
        }
        // Versions of art-1 only, its ID in another case once
        return [
          { ArtifactID: 'ART-1', VersionNumber: 1 },
          { ArtifactID: 'art-1', VersionNumber: 3 },
          { ArtifactID: 'art-1', VersionNumber: 2 },
        ];
      },
    });
    const { navigation, artifactPermissions } = await renderTab({ provider });

    const result = await agentTool(navigation, 'SearchSources').Handler({ query: 'revenue', kinds: ['artifact'] });

    expect(result).toEqual({
      Success: true,
      Data: {
        count: 2,
        results: [
          {
            kind: 'artifact',
            id: 'art-1',
            name: 'Revenue chart',
            description: 'Monthly revenue',
            type: 'Component',
            fitsDashboard: true,
            suggestedConfig: { type: 'Artifact', artifactId: 'art-1', versionNumber: 3 },
          },
          {
            kind: 'artifact',
            id: 'art-2',
            name: 'Revenue notes',
            description: null,
            type: 'Markdown Document',
            fitsDashboard: true,
            suggestedConfig: { type: 'Artifact', artifactId: 'art-2' },
          },
        ],
      },
    });
    expect(artifactPermissions.GetReadableArtifactsFilter).toHaveBeenCalledExactlyOnceWith(USER_ID, expect.objectContaining({ ID: USER_ID }));
    expect(views).toEqual([
      expect.objectContaining({
        EntityName: 'MJ: Artifacts',
        ExtraFilter:
          `(UserID='${USER_ID}') AND EnvironmentID='${MJEnvironmentEntityExtended.DefaultEnvironmentID}' AND (Visibility IS NULL OR Visibility='Always')` +
          ` AND (LOWER(Name) LIKE '%revenue%' OR LOWER(Description) LIKE '%revenue%')`,
        Fields: ['ID', 'Name', 'Description', 'Type'],
        MaxRows: 500,
        ResultType: 'simple',
      }),
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: "ArtifactID IN ('art-1','art-2')",
        Fields: ['ArtifactID', 'VersionNumber'],
        OrderBy: 'VersionNumber DESC',
        IgnoreMaxRows: true,
        ResultType: 'simple',
      },
    ]);
  });

  it('reads the versions of more than 200 artifacts with at most 200 IDs in each filter', async () => {
    const artifacts = Array.from({ length: 201 }, (_, i) => ({ ID: `art-${i}`, Name: `Artifact ${i}`, Description: null, Type: 'Report' }));
    const versionFilters: string[] = [];
    const provider = CreateFakeProvider<object>({
      currentUser: { ID: USER_ID },
      runViewResults: (params) => {
        if (params.EntityName === 'MJ: Artifacts') return artifacts;
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        versionFilters.push(filter);
        return filter.includes("'art-200'") ? [{ ArtifactID: 'art-200', VersionNumber: 4 }] : [];
      },
    });
    const { navigation } = await renderTab({ provider });

    const result = await agentTool(navigation, 'SearchSources').Handler({ query: 'Artifact 200', kinds: ['artifact'] });

    expect(versionFilters.map((filter) => filter.match(/'[^']+'/g)?.length)).toEqual([200, 1]);
    expect(versionFilters[1]).toBe("ArtifactID IN ('art-200')");
    expect(result.Data?.['results']).toEqual([expect.objectContaining({ id: 'art-200', suggestedConfig: { type: 'Artifact', artifactId: 'art-200', versionNumber: 4 } })]);
  });

  it('leaves the version out, so the panel shows the latest version, when the versions cannot be read', async () => {
    const provider = CreateFakeProvider<object>({
      currentUser: { ID: USER_ID },
      runViewResults: (params) => {
        if (params.EntityName === 'MJ: Artifacts') return [{ ID: 'art-1', Name: 'Revenue chart', Description: null, Type: 'Component' }];
        throw new Error('The server timed out');
      },
    });
    const { navigation } = await renderTab({ provider });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await agentTool(navigation, 'SearchSources').Handler({ query: 'revenue', kinds: ['artifact'] });

    expect(result).toMatchObject({ Success: true, Data: { count: 1 } });
    expect(result.Data?.['results']).toEqual([expect.objectContaining({ id: 'art-1', suggestedConfig: { type: 'Artifact', artifactId: 'art-1' } })]);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('Dashboard tab: could not read the artifact versions: The server timed out');
  });

  it('offers only the views, queries and entities the user may use', async () => {
    const usersView = (id: string, name: string, canView: boolean): ViewDouble => ({ ID: id, Name: name, Description: null, Entity: 'MJ: Users', EntityID: 'e-1', UserCanView: canView });
    const runs = vi.fn((user: UserInfo) => ({ canRun: user.ID === USER_ID, deniedEntities: [] }));
    const provider = CreateFakeProvider({ currentUser: { ID: USER_ID }, entities: [entityInfo('e-1', 'Revenue Lines', true), entityInfo('e-2', 'Revenue Audit', false)] });
    const { navigation, sourceEngines } = await renderTab({
      provider,
      sources: {
        ownViews: [usersView('v-1', 'Revenue mine', true)],
        sharedViews: [usersView('v-2', 'Revenue shared', true), usersView('v-3', 'Revenue private', false)],
        queries: [
          { ID: 'q-1', Name: 'Revenue by month', Description: null, Category: 'Sales', UserCanRun: runs },
          { ID: 'q-2', Name: 'Revenue by rep', Description: null, Category: 'Sales', UserCanRun: () => ({ canRun: false, deniedEntities: ['MJ: Employees'] }) },
        ],
      },
    });

    const result = await agentTool(navigation, 'SearchSources').Handler({ query: 'revenue', kinds: ['view', 'query', 'entity'] });

    const found = (result.Data?.['results'] as Array<{ kind: string; id: string }>).map((r) => `${r.kind}:${r.id}`);
    expect(found).toEqual(['view:v-1', 'view:v-2', 'query:q-1', 'entity:e-1']);
    expect(runs).toHaveBeenCalledWith(expect.objectContaining({ ID: USER_ID }));
    expect(sourceEngines.views.Config).toHaveBeenCalledWith(false, expect.objectContaining({ ID: USER_ID }), provider);
  });
});

// ---------------------------------------------------------------------------
// The AI pane
// ---------------------------------------------------------------------------

/** The Dashboards application: its default agent answers in the AI pane, and the pane's conversations belong to it. */
const DASHBOARDS_APP_ID = '4B439111-B492-4936-9E33-A428CB5725B4';

/** The AI pane. */
const COPILOT = '[data-testid="dashboard-copilot"]';

/** The dialog that asks before the AI pane closes during a voice session. */
const CLOSE_CHAT_CONFIRM = 'mj-confirm-dialog.close-chat-confirm';

/** An agent as the default-agent resolver gives it. */
type ResolvedAgent = Awaited<ReturnType<DefaultAgentResolver['Resolve']>>;

/** An agent with the ID and name the tab reads. */
function resolvedAgent(id: string, name: string): ResolvedAgent {
  return { ID: id, Name: name } as unknown as ResolvedAgent;
}

/** Makes the default-agent resolver give `agent`, or fail with it when it is an Error. */
function stubAgentResolver(agent: ResolvedAgent | Error = resolvedAgent('agent-dashboards', 'Dashboards Expert')) {
  return vi.spyOn(DefaultAgentResolver.prototype, 'Resolve').mockImplementation(async () => {
    if (agent instanceof Error) throw agent;
    return agent;
  });
}

/**
 * A UserInfoEngine double for the user's settings. It starts with `saved` as the AI pane setting, and
 * like UserInfoEngine, GetSetting gives a value SetSettingDebounced wrote before it is saved.
 */
function stubUserSettings(saved?: string) {
  let value = saved;
  const settings = {
    GetSetting: vi.fn((_key: string): string | undefined => value),
    SetSettingDebounced: vi.fn((_key: string, newValue: string): void => {
      value = newValue;
    }),
  };
  vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(settings as unknown as UserInfoEngine);
  return settings;
}

/** The chat area in the AI pane, or null when the pane shows none. */
function chatArea(fixture: ComponentFixture<DashboardResource>): ChatAreaStub | null {
  return fixture.debugElement.query(By.directive(ChatAreaStub))?.injector.get(ChatAreaStub) ?? null;
}

/** The split around the editor and the AI pane. */
function split(fixture: ComponentFixture<DashboardResource>): SplitComponent {
  return fixture.debugElement.query(By.directive(SplitComponent)).injector.get(SplitComponent);
}

/** The split's areas: the editor's, then the AI pane's while it is open. */
function areas(fixture: ComponentFixture<DashboardResource>) {
  return fixture.debugElement.queryAll(By.directive(SplitAreaComponent));
}

/** The widths of the split's areas, in percent: the editor's, then the AI pane's while it is open. */
function areaSizes(fixture: ComponentFixture<DashboardResource>): Array<ReturnType<SplitAreaComponent['size']>> {
  return areas(fixture).map((area) => area.injector.get(SplitAreaComponent).size());
}

/** A snapshot of the app the user is in, as the Explorer shell publishes it. */
function appContextSnapshot(dashboardName: string): AppContextSnapshot {
  return {
    App: { Name: 'Dashboards', Description: 'Build and view dashboards' },
    ActiveNavItem: { Name: dashboardName, ResourceType: 'Dashboards' },
    OtherNavItems: [],
    User: { Name: 'Test User', Roles: ['UI'] },
    AdditionalContext: { OpenedDashboardName: dashboardName },
  };
}

/** Opens the AI pane from the AI button in the editor's header and waits for its agent. */
async function openPane(fixture: ComponentFixture<DashboardResource>): Promise<void> {
  Click(fixture, AI_TOGGLE);
  await settle(fixture);
}

describe('DashboardResource AI pane (DOM)', () => {
  it('opens and closes the AI pane beside the whole editor from the AI button, in view mode and in edit mode', async () => {
    stubAgentResolver();
    stubUserSettings();
    const { fixture } = await renderTab();
    const editorElement = Query(fixture, 'mj-dashboard-editor');

    expect(Query(fixture, COPILOT)).toBeNull();
    expect(Attr(fixture, AI_TOGGLE, 'aria-expanded')).toBe('false');
    expect(HasClass(fixture, AI_TOGGLE, 'is-active')).toBe(false);
    expect(areaSizes(fixture)).toEqual([100]);

    await openPane(fixture);

    expect(fixture.componentInstance.ChatOpen).toBe(true);
    expect(Query(fixture, COPILOT)).not.toBeNull();
    expect(Attr(fixture, AI_TOGGLE, 'aria-expanded')).toBe('true');
    expect(HasClass(fixture, AI_TOGGLE, 'is-active')).toBe(true);
    expect(areaSizes(fixture)).toEqual([68, 32]);
    // The editor, header included, keeps its element in the split's first area; the pane takes the second.
    const [editorArea, paneArea] = areas(fixture).map((area) => area.nativeElement as HTMLElement);
    expect(editorArea.querySelector('mj-dashboard-editor')).toBe(editorElement);
    expect(editorArea.querySelector(`.stub-editor-header ${AI_TOGGLE}`)).not.toBeNull();
    expect(paneArea.querySelector(COPILOT)).not.toBeNull();

    editor(fixture).EnterEditMode();
    fixture.detectChanges();
    expect(Attr(fixture, AI_TOGGLE, 'aria-expanded')).toBe('true');
    Click(fixture, AI_TOGGLE);
    fixture.detectChanges();

    expect(fixture.componentInstance.ChatOpen).toBe(false);
    expect(Query(fixture, COPILOT)).toBeNull();
    expect(Attr(fixture, AI_TOGGLE, 'aria-expanded')).toBe('false');
    expect(areaSizes(fixture)).toEqual([100]);
    expect(Query(fixture, 'mj-dashboard-editor')).toBe(editorElement);
  });

  it("shows the chat with the Dashboards app's default agent once the resolver gives it, also in a tab of another app", async () => {
    let giveAgent = (_agent: ResolvedAgent): void => undefined;
    const resolve = vi.spyOn(DefaultAgentResolver.prototype, 'Resolve').mockImplementation(() => new Promise<ResolvedAgent>((done) => (giveAgent = done)));
    stubUserSettings();
    const { fixture, navigation } = await renderTab();
    const provider = fixture.componentInstance.ProviderToUse;
    const snapshot = appContextSnapshot('Revenue Board');
    navigation.AppContextSnapshot$.next(snapshot);

    await openPane(fixture);

    // The pane waits for the agent; the tab belongs to APP_ID, and the agent is still the Dashboards app's.
    expect(Query(fixture, `${COPILOT} mj-loading`)).not.toBeNull();
    expect(chatArea(fixture)).toBeNull();
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ applicationId: DASHBOARDS_APP_ID, contextUser: provider.CurrentUser, provider });

    giveAgent(resolvedAgent('agent-dashboards', 'Dashboards Expert'));
    await settle(fixture);

    const chat = chatArea(fixture);
    expect(chat).not.toBeNull();
    expect(Query(fixture, `${COPILOT} mj-loading`)).toBeNull();
    expect(Text(fixture, `${COPILOT} .dashboard-copilot-title`)).toBe('Dashboards Expert');
    expect(chat?.Provider).toBe(provider);
    expect(chat?.CurrentUser).toBe(provider.CurrentUser);
    expect(chat).toMatchObject({
      EnvironmentId: MJEnvironmentEntityExtended.DefaultEnvironmentID,
      Conversation: null,
      ConversationId: null,
      IsNewConversation: true,
      PendingMessage: null,
      SuppressNewConversationEmptyState: true,
      AllowMentions: false,
      OverlayMode: false,
      ShowExportButton: false,
      ShowShareButton: false,
      ShowArtifactIndicator: false,
      ShowAgentPicker: false,
      ShowAgentModePicker: false,
      DefaultAgentId: 'agent-dashboards',
      AllowedAgentIDs: ['agent-dashboards'],
      ApplicationScope: 'Application',
      ApplicationId: DASHBOARDS_APP_ID,
      EmptyStateGreeting: 'What should this dashboard show?',
    });
    expect(chat?.AppContext).toEqual(snapshot);
  });

  it('says that the Dashboards app has no assistant, and shows no chat, when the resolver falls back to Sage', async () => {
    stubAgentResolver(resolvedAgent('agent-sage', 'Sage'));
    stubUserSettings();
    const { fixture } = await renderTab();

    await openPane(fixture);

    expect(fixture.componentInstance.ChatAgentError).toBe(
      'No dashboard assistant is configured for the Dashboards app. Ask an administrator to set its default agent.',
    );
    expect(Text(fixture, `${COPILOT} .dashboard-copilot-empty`)).toBe(fixture.componentInstance.ChatAgentError);
    expect(fixture.componentInstance.ChatAgentId).toBeNull();
    expect(chatArea(fixture)).toBeNull();
  });

  it('shows why the agent could not be resolved, and tries again the next time the pane opens', async () => {
    const resolve = stubAgentResolver(new Error('The agents could not be loaded'));
    stubUserSettings();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture } = await renderTab();

    await openPane(fixture);

    expect(Text(fixture, `${COPILOT} .dashboard-copilot-empty`)).toBe('The dashboard assistant could not be loaded: The agents could not be loaded');
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('Dashboard tab: could not resolve the dashboard assistant: The agents could not be loaded');
    expect(chatArea(fixture)).toBeNull();

    resolve.mockResolvedValue(resolvedAgent('agent-dashboards', 'Dashboards Expert'));
    Click(fixture, AI_TOGGLE);
    await openPane(fixture);

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(Query(fixture, `${COPILOT} .dashboard-copilot-empty`)).toBeNull();
    expect(chatArea(fixture)?.DefaultAgentId).toBe('agent-dashboards');
  });

  it('opens with the widths the user saved, and keeps and saves the widths the user drags the split to', async () => {
    stubAgentResolver();
    const settings = stubUserSettings(JSON.stringify({ MainSizePct: 60, CopilotSizePct: 40 }));
    const { fixture } = await renderTab();

    await openPane(fixture);

    expect(settings.GetSetting).toHaveBeenCalledWith('mj.dashboards.studio.layout');
    expect(areaSizes(fixture)).toEqual([60, 40]);

    split(fixture).dragEnd.emit({ gutterNum: 1, sizes: [55.4, 44.6] });
    await settle(fixture);

    expect(settings.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith('mj.dashboards.studio.layout', JSON.stringify({ MainSizePct: 55, CopilotSizePct: 45 }));
    expect(areaSizes(fixture)).toEqual([55, 45]);

    // The next open reads the widths the user dragged to.
    Click(fixture, AI_TOGGLE);
    await openPane(fixture);

    expect(areaSizes(fixture)).toEqual([55, 45]);
  });

  it('gives the pane its largest width and back; a drag gives it the dragged width instead', async () => {
    stubAgentResolver();
    const settings = stubUserSettings();
    const { fixture } = await renderTab();
    await openPane(fixture);
    const expand = `${COPILOT} .copilot-expand`;

    Click(fixture, expand);
    fixture.detectChanges();
    expect(areaSizes(fixture)).toEqual([40, 60]);
    expect(Attr(fixture, expand, 'aria-label')).toBe('Collapse panel');

    Click(fixture, expand);
    fixture.detectChanges();
    expect(areaSizes(fixture)).toEqual([68, 32]);
    expect(Attr(fixture, expand, 'aria-label')).toBe('Expand panel');

    Click(fixture, expand);
    fixture.detectChanges();
    split(fixture).dragEnd.emit({ gutterNum: 1, sizes: [45, 55] });
    await settle(fixture);

    expect(fixture.componentInstance.CopilotExpanded).toBe(false);
    expect(areaSizes(fixture)).toEqual([45, 55]);
    expect(settings.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith('mj.dashboards.studio.layout', JSON.stringify({ MainSizePct: 45, CopilotSizePct: 55 }));
  });

  it('asks before it closes the pane during a voice session, and closes it only when the user confirms', async () => {
    stubAgentResolver();
    stubUserSettings();
    const { fixture, realtimeSession } = await renderTab();
    await openPane(fixture);
    realtimeSession.IsActive = true;

    Click(fixture, `${COPILOT} .copilot-close`);
    fixture.detectChanges();

    expect(Text(fixture, `${CLOSE_CHAT_CONFIRM} .confirm-title`)).toBe('End the voice session?');
    expect(Text(fixture, `${CLOSE_CHAT_CONFIRM} .confirm-message`)).toBe('Closing the AI assistant ends the voice session.');
    expect(Query(fixture, COPILOT)).not.toBeNull();

    Click(fixture, `${CLOSE_CHAT_CONFIRM} .dialog-footer .btn-secondary`);
    fixture.detectChanges();

    expect(Query(fixture, CLOSE_CHAT_CONFIRM)).toBeNull();
    expect(Query(fixture, COPILOT)).not.toBeNull();

    // The AI button asks too.
    Click(fixture, AI_TOGGLE);
    fixture.detectChanges();
    expect(Text(fixture, `${CLOSE_CHAT_CONFIRM} .dialog-footer .btn-primary`)).toBe('Close');
    Click(fixture, `${CLOSE_CHAT_CONFIRM} .dialog-footer .btn-primary`);
    fixture.detectChanges();

    expect(Query(fixture, CLOSE_CHAT_CONFIRM)).toBeNull();
    expect(Query(fixture, COPILOT)).toBeNull();
    expect(fixture.componentInstance.ChatOpen).toBe(false);
  });

  it('closes the pane without asking when no voice session runs', async () => {
    stubAgentResolver();
    stubUserSettings();
    const { fixture } = await renderTab();
    await openPane(fixture);

    Click(fixture, `${COPILOT} .copilot-close`);
    fixture.detectChanges();

    expect(Query(fixture, CLOSE_CHAT_CONFIRM)).toBeNull();
    expect(Query(fixture, COPILOT)).toBeNull();
  });

  it('sends the first message in the conversation the chat area created, and shows that conversation again after the pane reopens', async () => {
    stubAgentResolver();
    stubUserSettings();
    const { fixture } = await renderTab();
    await openPane(fixture);
    const conversation = { ID: 'conv-1', Name: 'New Conversation' } as unknown as MJConversationEntity;
    const attachments: PendingAttachment[] = [];

    chatArea(fixture)?.ConversationCreated.emit({ conversation, pendingMessage: 'Add a revenue chart', pendingAttachments: attachments });
    fixture.detectChanges();

    expect(chatArea(fixture)?.Conversation).toBe(conversation);
    expect(chatArea(fixture)).toMatchObject({ ConversationId: 'conv-1', IsNewConversation: false, PendingMessage: 'Add a revenue chart' });
    expect(chatArea(fixture)?.PendingAttachments).toBe(attachments);

    chatArea(fixture)?.PendingMessageConsumed.emit();
    fixture.detectChanges();

    expect(chatArea(fixture)).toMatchObject({ PendingMessage: null, PendingAttachments: null });

    Click(fixture, AI_TOGGLE);
    await openPane(fixture);

    expect(chatArea(fixture)?.Conversation).toBe(conversation);
    expect(chatArea(fixture)).toMatchObject({ ConversationId: 'conv-1', IsNewConversation: false, PendingMessage: null });
  });

  it('adopts the conversation a voice call created when the call ends, not when it starts', async () => {
    stubAgentResolver();
    stubUserSettings();
    const conversation = { ID: 'conv-voice', Name: 'Voice call' } as unknown as MJConversationEntity;
    const provider = CreateFakeProvider<MJConversationEntity>({
      currentUser: { ID: USER_ID },
      runViewResults: params => (params.EntityName === 'MJ: Conversations' && params.ExtraFilter === "ID='conv-voice'" ? [conversation] : []),
    });
    const { fixture } = await renderTab({ provider });
    await openPane(fixture);

    chatArea(fixture)?.RealtimeConversationReady.emit({ conversationId: 'conv-voice', select: false });
    await settle(fixture);

    expect(chatArea(fixture)).toMatchObject({ Conversation: null, ConversationId: null, IsNewConversation: true });

    chatArea(fixture)?.RealtimeConversationReady.emit({ conversationId: 'conv-voice', select: true });
    await settle(fixture);

    expect(chatArea(fixture)?.Conversation).toBe(conversation);
    expect(chatArea(fixture)).toMatchObject({ ConversationId: 'conv-voice', IsNewConversation: false });
  });

  it('keeps the conversation a message created when a voice call reports its own afterwards', async () => {
    stubAgentResolver();
    stubUserSettings();
    const { fixture } = await renderTab();
    await openPane(fixture);
    const conversation = { ID: 'conv-1', Name: 'New Conversation' } as unknown as MJConversationEntity;
    chatArea(fixture)?.ConversationCreated.emit({ conversation, pendingMessage: 'Add a chart', pendingAttachments: [] });
    fixture.detectChanges();

    chatArea(fixture)?.RealtimeConversationReady.emit({ conversationId: 'conv-voice', select: true });
    await settle(fixture);

    expect(chatArea(fixture)?.Conversation).toBe(conversation);
    expect(chatArea(fixture)).toMatchObject({ ConversationId: 'conv-1', IsNewConversation: false });
  });

  it('opens the records and the app pages that the chat links to', async () => {
    stubAgentResolver();
    stubUserSettings();
    const applications = [{ ID: 'app-data-explorer', Name: 'Data Explorer' }] as ApplicationInfo[];
    const provider = Object.assign(CreateFakeProvider({ currentUser: { ID: USER_ID } }), { Applications: applications });
    const { fixture, navigation } = await renderTab({ provider });
    await openPane(fixture);
    const chat = chatArea(fixture);
    const userKey = CompositeKey.FromID('user-7');

    chat?.OpenEntityRecord.emit({ entityName: 'MJ: Users', compositeKey: userKey });
    chat?.navigationRequest.emit({ appName: ' data explorer ', navItemName: 'Queries', queryParams: { queryId: 'q-1' } });
    chat?.navigationRequest.emit({ appName: 'No Such App', navItemName: 'Collections' });
    chat?.navigationRequest.emit({ navItemName: 'Conversations' });

    expect(navigation.OpenEntityRecord).toHaveBeenCalledExactlyOnceWith('MJ: Users', userKey);
    expect(navigation.OpenNavItemByName.mock.calls).toEqual([
      ['Queries', undefined, 'app-data-explorer', { queryParams: { queryId: 'q-1' } }],
      ['Collections', undefined, undefined, { queryParams: undefined }],
      ['Conversations', undefined, undefined, { queryParams: undefined }],
    ]);
  });

  it("gives the chat the shell's latest app context, and stops following it when the tab closes", async () => {
    stubAgentResolver();
    stubUserSettings();
    const { fixture, navigation } = await renderTab();
    const closedPaneSnapshot = appContextSnapshot('Revenue Board');
    navigation.AppContextSnapshot$.next(closedPaneSnapshot);
    await openPane(fixture);

    expect(chatArea(fixture)?.AppContext).toEqual(closedPaneSnapshot);

    const later = appContextSnapshot('Quota');
    navigation.AppContextSnapshot$.next(later);

    expect(chatArea(fixture)?.AppContext).toEqual(later);

    fixture.destroy();

    expect(navigation.AppContextSnapshot$.observed).toBe(false);
  });

  it("uses the tab's environment for the chat and for the agent's artifact search", async () => {
    stubAgentResolver();
    stubUserSettings();
    const views: RunViewParams[] = [];
    const provider = CreateFakeProvider<object>({
      currentUser: { ID: USER_ID },
      runViewResults: (params) => {
        views.push(params);
        return [];
      },
    });
    const { fixture, navigation } = await renderTab({ provider });
    const tabData = dashboardTabData('dash-1');
    fixture.componentInstance.Data = new ResourceData({ ResourceRecordID: 'dash-1', Configuration: { ...tabData.Configuration, environmentId: 'env-7' } });

    await openPane(fixture);
    await agentTool(navigation, 'SearchSources').Handler({ query: 'revenue', kinds: ['artifact'] });

    expect(chatArea(fixture)?.EnvironmentId).toBe('env-7');
    expect(views[0]?.ExtraFilter).toContain("EnvironmentID='env-7'");
  });
});
