import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { CompositeKey } from '@memberjunction/core';
import type { EngineDataChangeEvent, IMetadataProvider } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
import type { DashboardUserPermissions, MJDashboardCategoryEntity, MJDashboardEntity, MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { DashboardFavoritesService, HomeAppPinService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  MJButtonDirective,
  MJConfirmService,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJEmptyStateComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import type { MJConfirmOptions } from '@memberjunction/ng-ui-components';
import { DashboardPartDialogComponent, RemovePartConfirmOptions } from '@memberjunction/ng-dashboard-viewer';
import type {
  DashboardConfigChangedEvent,
  DashboardNavRequestEvent,
  DashboardPanel,
  PanelConfig,
  PanelInteractionEvent,
  PanelPosition,
} from '@memberjunction/ng-dashboard-viewer';
import { RenderComponentFixture, CreateFakeProvider, Attr, Capture, Click, HasClass, Query, QueryAll, Text, TypeInto, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { DashboardEditorComponent } from './dashboard-editor.component';
import type { DashboardEditorLoadError } from './dashboard-editor.types';
import { DashboardViewerFactory } from './dashboard-viewer-factory';

/**
 * DOM coverage for <mj-dashboard-editor>, the dashboard header and edit flow made for the dashboard tab and
 * Home's dashboard view. The editor hosts the real part dialog from @memberjunction/ng-dashboard-viewer.
 * The viewer (Golden Layout) is a double that the DashboardViewerFactory double hands the editor: it holds
 * its parts in a Golden Layout tree, emits the same PanelInteraction events the real viewer emits, and
 * applies AddPanel / UpdatePanelConfig / ConfirmRemovePanel to its parts. The saved-layout tests give it
 * the real viewer's saved-layout behavior (see showSavedLayout). DashboardEngine, the favorites, the
 * screenshot (HomeAppPinService.CaptureThumbnail), the shared confirm and the notifications are doubles.
 */

const USER_ID = 'user-1';

/** The part of BaseEntity's LatestResult the editor reads after a failed save. */
interface SaveResultDouble {
  Success: boolean;
  CompleteMessage: string;
}

/** The screenshot (Thumbnail) the dashboard double was saved with. */
const SAVED_SCREENSHOT = 'data:image/jpeg;base64,c2F2ZWQ=';

/** A new screenshot of the dashboard's layout. */
const NEW_SCREENSHOT = 'data:image/jpeg;base64,bmV3';

const EDIT = '.dashboard-editor-edit';
const ADD_PART = '.dashboard-editor-add-part';
const SAVE = '.dashboard-editor-save';
const CANCEL = '.dashboard-editor-cancel';
const PART_DIALOG = 'mj-dashboard-part-dialog';
/** The first part type tile of the part dialog. */
const FIRST_PART_TYPE = 'mj-dashboard-part-dialog .part-dialog__type:nth-child(1)';
/** The second part type tile of the part dialog. */
const SECOND_PART_TYPE = 'mj-dashboard-part-dialog .part-dialog__type:nth-child(2)';
/** The part dialog's confirm button: Add part, or Apply. */
const SUBMIT_PART = 'mj-dashboard-part-dialog .mj-dialog-actions button:first-child';

/**
 * A dashboard entity double, by default Revenue Board (dash-1). Its saved values are the name,
 * description, layout (UIConfigDetails, with the Revenue part) and screenshot (Thumbnail) it starts
 * with, and Revert() puts them all back, like BaseEntity.Revert() puts back every field. LatestResult
 * is set by a test that fails a save. IsSaving stands for a save of this object that runs elsewhere,
 * such as Home's rename.
 */
function createDashboard(id = 'dash-1', name = 'Revenue Board') {
  const saved = { Name: name, Description: '', UIConfigDetails: savedConfig([revenuePanel()]), Thumbnail: SAVED_SCREENSHOT as string | null };
  const dashboard = {
    ID: id,
    PrimaryKey: CompositeKey.FromID(id),
    Type: 'Config',
    CategoryID: null,
    Name: saved.Name,
    Description: saved.Description,
    UIConfigDetails: saved.UIConfigDetails,
    Thumbnail: saved.Thumbnail,
    LatestResult: null as SaveResultDouble | null,
    IsSaving: false,
    Revert: vi.fn((): boolean => {
      dashboard.Name = saved.Name;
      dashboard.Description = saved.Description;
      dashboard.UIConfigDetails = saved.UIConfigDetails;
      dashboard.Thumbnail = saved.Thumbnail;
      return true;
    }),
  };
  return dashboard;
}

type DashboardDouble = ReturnType<typeof createDashboard>;

/** Part type doubles. SortOrder puts View first, as in the metadata. */
const QUERY_TYPE = {
  ID: 'pt-query',
  Name: 'Query',
  Icon: 'fa-solid fa-database',
  Description: 'Results of a stored query',
  ConfigDialogClass: null,
  SortOrder: 2,
} as unknown as MJDashboardPartTypeEntity;
const VIEW_TYPE = {
  ID: 'pt-view',
  Name: 'View',
  Icon: 'fa-solid fa-table',
  Description: 'Records of an entity view',
  ConfigDialogClass: null,
  SortOrder: 1,
} as unknown as MJDashboardPartTypeEntity;

function revenuePanel(): DashboardPanel {
  return { id: 'panel-1', title: 'Revenue', icon: 'fa-solid fa-table', partTypeId: 'pt-view', config: { type: 'View', entityName: 'MJ: Applications' } };
}

/** The event the viewer emits when a part's Edit part button is clicked. */
function configureRequest(panelId: string): PanelInteractionEvent {
  return { panelId, interactionType: 'custom', payload: { action: 'configure-part-requested' } };
}

/** The event the viewer emits when a part's Remove button is clicked. */
function removeRequest(panelId: string, panelTitle: string, partTypeName: string): PanelInteractionEvent {
  return { panelId, interactionType: 'custom', payload: { action: 'remove-part-requested', panelTitle, partTypeName } };
}

/** The event the viewer's empty state emits when its Add part action is clicked. */
function addPartRequest(): PanelInteractionEvent {
  return { panelId: '', interactionType: 'custom', payload: { action: 'add-panel-requested' } };
}

/** A Golden Layout tree holding the parts, in the shape ExtractPanelsFromLayout reads. */
function layoutOf(panels: DashboardPanel[]) {
  return { root: { type: 'row', content: [{ type: 'stack', content: panels.map((panel) => ({ type: 'component', componentState: panel })) }] } };
}

/** A dashboard's saved configuration (UIConfigDetails) whose layout holds the parts. */
function savedConfig(panels: DashboardPanel[]): string {
  return JSON.stringify({ layout: layoutOf(panels), settings: {} });
}

/** Copies of the parts in a saved configuration. */
function savedPanels(details: string): DashboardPanel[] {
  const config = JSON.parse(details) as { layout: ReturnType<typeof layoutOf> };
  return config.layout.root.content[0].content.map((item) => ({ ...item.componentState }));
}

/** The IDs of the parts in a saved configuration. */
function savedPanelIds(details: string): string[] {
  return savedPanels(details).map((panel) => panel.id);
}

/**
 * A viewer double with the members the editor uses. Its parts live in `panels`; the part-editing
 * methods change them the way the real viewer changes its layout. Like the real viewer, a save emits
 * DashboardSaved with the dashboard.
 */
function createViewer(initialPanels: DashboardPanel[]) {
  const panels = [...initialPanels];
  const partTypes = [QUERY_TYPE, VIEW_TYPE];
  const viewer = {
    Provider: null as IMetadataProvider | null,
    Dashboard: null as MJDashboardEntity | null,
    IsEditing: false,
    CanEdit: false,
    ShowToolbar: true,
    ShowBreadcrumb: true,
    ShowOpenInTabButton: false,
    ShowEditButton: true,
    Categories: [] as MJDashboardCategoryEntity[],
    NavigationRequested: new EventEmitter<DashboardNavRequestEvent>(),
    DashboardSaved: new EventEmitter<MJDashboardEntity>(),
    error: new EventEmitter<{ message: string; error?: Error }>(),
    configChanged: new EventEmitter<DashboardConfigChangedEvent>(),
    PanelInteraction: new EventEmitter<PanelInteractionEvent>(),
    WaitForLayoutReady: async (): Promise<void> => undefined,
    HasUnsavedChanges: false,
    getConfig: () => ({ layout: layoutOf(panels) }),
    GetPartTypes: (): MJDashboardPartTypeEntity[] => partTypes,
    GetPanel: (panelId: string): DashboardPanel | null => panels.find((p) => p.id === panelId) ?? null,
    GetPartTypeForPanel: (panelId: string): MJDashboardPartTypeEntity | null => {
      const panel = panels.find((p) => p.id === panelId);
      return partTypes.find((t) => t.ID === panel?.partTypeId) ?? null;
    },
    AddPanel: vi.fn(async (partTypeId: string, config: PanelConfig, title: string, icon?: string, _position?: PanelPosition): Promise<string | null> => {
      const id = `panel-${panels.length + 1}`;
      panels.push({ id, partTypeId, config, title, icon });
      return id;
    }),
    UpdatePanelConfig: vi.fn(async (panelId: string, config: PanelConfig, title?: string, icon?: string): Promise<void> => {
      const panel = panels.find((p) => p.id === panelId);
      if (!panel) return;
      panel.config = config;
      if (title) panel.title = title;
      if (icon) panel.icon = icon;
    }),
    ConfirmRemovePanel: vi.fn((panelId: string): void => {
      const index = panels.findIndex((p) => p.id === panelId);
      if (index >= 0) panels.splice(index, 1);
    }),
    save: vi.fn(async (): Promise<boolean> => {
      if (viewer.Dashboard) viewer.DashboardSaved.emit(viewer.Dashboard);
      return true;
    }),
    HasNewerSavedLayout: vi.fn((_dashboard?: MJDashboardEntity | null): boolean => false),
    ReloadFromSaved: vi.fn(async (_dashboard?: MJDashboardEntity | null): Promise<void> => undefined),
    UseSavedCopy: vi.fn((_dashboard: MJDashboardEntity): boolean => false),
    /** The viewer's empty-state Add part action: it asks its host for the part dialog. */
    OnAddPanelClick: (): void => {
      viewer.PanelInteraction.emit({ panelId: '', interactionType: 'custom', payload: { action: 'add-panel-requested', partTypes } });
    },
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

/**
 * A DashboardEngine double holding the dashboards. `DataChange$` stands for the engine's change
 * events; a test emits on it what BaseEngine emits after a save.
 */
function createEngine(dashboards: object[], canEdit: boolean) {
  return {
    Config: vi.fn(async () => undefined),
    Dashboards: dashboards,
    DashboardCategories: [] as MJDashboardCategoryEntity[],
    DashboardPartTypes: [QUERY_TYPE, VIEW_TYPE],
    GetDashboardPermissions: vi.fn((dashboardId: string) => permissionsFor(dashboardId, canEdit)),
    DataChange$: new Subject<EngineDataChangeEvent>(),
  };
}

/** Takes a screenshot of an element, as HomeAppPinService.CaptureThumbnail does. */
type CaptureScreenshot = (element: HTMLElement, timeoutMs?: number) => Promise<string | undefined>;

/** A screenshot that stays pending until the test calls finish(), which completes every pending one. */
function pendingCapture() {
  const pending: Array<(value: string | undefined) => void> = [];
  const capture = vi.fn<CaptureScreenshot>(() => new Promise<string | undefined>((resolve) => pending.push(resolve)));
  return { capture, finish: (value: string | undefined = NEW_SCREENSHOT) => pending.splice(0).forEach((resolve) => resolve(value)) };
}

/** A promise that the test settles with `resolve` or `reject`. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** The question the editor asks before a Save replaces a save made elsewhere. */
const OVERWRITE_QUESTION: MJConfirmOptions = {
  title: 'Replace changes saved elsewhere?',
  message: 'This dashboard was saved in another place after you started editing. Saving now replaces those changes.',
  type: 'warning',
  confirmText: 'Save anyway',
  cancelText: 'Keep editing',
};

/** A component ref for a viewer double, in the shape DashboardViewerFactory.Create returns. */
function viewerRefFor(viewer: ViewerDouble) {
  return { instance: viewer, location: { nativeElement: document.createElement('div') }, destroy: vi.fn() };
}

/**
 * The testing module the editor renders in: the real part dialog, doubles for the services the editor
 * injects, and a queue of viewer doubles that the DashboardViewerFactory double hands out in order.
 * `capture` stands for HomeAppPinService.CaptureThumbnail; by default it takes no screenshot. The
 * confirm double answers Confirm with false (Keep editing) unless a test answers it, so a Save that
 * asks when nothing was saved elsewhere saves nothing.
 */
function editorModule(viewers: ViewerDouble[], capture: CaptureScreenshot = async () => undefined) {
  const confirm = {
    Confirm: vi.fn(async (_options: MJConfirmOptions | string): Promise<boolean> => false),
    ConfirmDelete: vi.fn(async (_options: Omit<MJConfirmOptions, 'type'>): Promise<boolean> => true),
  };
  const favorites = {
    IsFavorite: vi.fn((_dashboardId: string): boolean => false),
    Toggle: vi.fn(async (_dashboardId: string): Promise<boolean> => true),
    Changed$: new Subject<void>(),
  };
  const create = vi.fn(() => {
    const viewer = viewers.shift();
    if (!viewer) throw new Error('The test queued no viewer double for this load.');
    return viewerRefFor(viewer);
  });
  return {
    confirm,
    favorites,
    create,
    module: {
      imports: [CommonModule, FormsModule, MJButtonDirective, MJStatBadgeComponent, MJDialogComponent, MJDialogActionsComponent, MJEmptyStateComponent, StubLoadingComponent],
      declarations: [DashboardEditorComponent, DashboardPartDialogComponent],
      providers: [
        { provide: DashboardViewerFactory, useValue: { Create: create } },
        { provide: DashboardFavoritesService, useValue: favorites },
        { provide: HomeAppPinService, useValue: { CaptureThumbnail: capture } },
        { provide: MJConfirmService, useValue: confirm },
      ],
    },
  };
}

/**
 * Renders the editor for Revenue Board (dash-1) and waits until it shows the dashboard. `canEdit` is the
 * user's edit permission, `description` the dashboard's saved description, `dashboards` what
 * DashboardEngine holds (by default Revenue Board) and `inputs` more inputs for the editor.
 */
async function renderEditor(
  options: { canEdit?: boolean; panels?: DashboardPanel[]; capture?: CaptureScreenshot; dashboards?: object[]; description?: string; inputs?: Record<string, unknown> } = {},
) {
  const dashboard = createDashboard();
  if (options.description !== undefined) dashboard.Description = options.description;
  const engine = createEngine(options.dashboards ?? [dashboard], options.canEdit ?? true);
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  const notify = vi.fn();
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
  const { viewer, panels } = createViewer(options.panels ?? [revenuePanel()]);
  const { module, confirm, favorites, create } = editorModule([viewer], options.capture);
  const fixture = RenderComponentFixture(DashboardEditorComponent, {
    ...module,
    inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID, ...options.inputs },
  });
  const loaded = Capture(fixture.componentInstance.Loaded);
  await settle(fixture);
  return { fixture, editor: fixture.componentInstance, viewer, panels, engine, dashboard, notify, confirm, favorites, create, loaded };
}

/**
 * Renders the editor for Revenue Board (dash-1), with Quota (dash-2) also in DashboardEngine, for tests
 * that show Quota next. Each dashboard has its own viewer double: `first` for Revenue Board, `second`
 * for Quota. `capture` takes the Save screenshot, `firstLayoutReady` is when Revenue Board's layout is
 * ready (at once by default) and `inputs` are more inputs for the editor. The editor's Loaded and
 * StartInEditModeChange are captured from the start.
 */
async function renderWithQuota(options: { capture?: CaptureScreenshot; firstLayoutReady?: Promise<void>; inputs?: Record<string, unknown> } = {}) {
  const revenue = createDashboard();
  const quota = createDashboard('dash-2', 'Quota');
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([revenue, quota], true) as unknown as DashboardEngine);
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);
  const first = createViewer([revenuePanel()]).viewer;
  const second = createViewer([]).viewer;
  const firstLayoutReady = options.firstLayoutReady;
  if (firstLayoutReady) first.WaitForLayoutReady = () => firstLayoutReady;
  const { module, confirm, create } = editorModule([first, second], options.capture);
  const fixture = RenderComponentFixture(DashboardEditorComponent, {
    ...module,
    inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: revenue.ID, ...options.inputs },
  });
  const editor = fixture.componentInstance;
  const loaded = Capture(editor.Loaded);
  const resets = Capture(editor.StartInEditModeChange);
  await settle(fixture);
  return { fixture, editor, revenue, quota, first, second, confirm, create, loaded, resets };
}

/**
 * Lets the editor's and the part dialog's deferred work run (the load, the dialog's open, the change
 * events' auditTime), renders, and waits for ngModel, which writes a changed value into its input in a
 * microtask after rendering.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

/** Lets deferred work run, for a fixture that is destroyed and no longer renders. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The value the name field shows. */
function nameField(fixture: ComponentFixture<DashboardEditorComponent>): string {
  return (Query(fixture, '.dashboard-editor-name') as HTMLInputElement).value;
}

/** Clicks Edit and waits until the name field shows the dashboard's name (ngModel writes it asynchronously). */
async function startEditing(fixture: ComponentFixture<DashboardEditorComponent>): Promise<void> {
  Click(fixture, EDIT);
  await settle(fixture);
}

function emitFromViewer(viewer: ViewerDouble, fixture: ComponentFixture<DashboardEditorComponent>, event: PanelInteractionEvent): void {
  viewer.PanelInteraction.emit(event);
  fixture.detectChanges();
}

/** The open part dialog. */
function partDialog(fixture: ComponentFixture<DashboardEditorComponent>): DashboardPartDialogComponent {
  return fixture.debugElement.query(By.directive(DashboardPartDialogComponent)).componentInstance as DashboardPartDialogComponent;
}

/** The labels of the part dialog's type tiles that match `selector`, in order. */
function tileLabels(fixture: ComponentFixture<DashboardEditorComponent>, selector = '.part-dialog__type'): Array<string | undefined> {
  return QueryAll(fixture, `${PART_DIALOG} ${selector} .part-dialog__type-label`).map((e) => e.textContent?.trim());
}

/** Keeps the expected console.error lines of LogError out of the test output, and records them. */
function silenceErrors() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('DashboardEditorComponent header (DOM)', () => {
  it('shows the title, the description and the view actions, and no Editing badge, in view mode', async () => {
    const { fixture } = await renderEditor();
    expect(Text(fixture, '.dashboard-editor-title')).toBe('Revenue Board');
    expect(Text(fixture, '.dashboard-editor-desc.is-placeholder')).toBe('Add a description');
    expect(Query(fixture, '.dashboard-editor-badge')).toBeNull();
    expect(Query(fixture, '.dashboard-editor-name')).toBeNull();
    expect(Query(fixture, '.dashboard-editor-favorite')).not.toBeNull();
    expect(Text(fixture, EDIT)).toBe('Edit');
    expect(Query(fixture, '.dashboard-editor-open-in')).toBeNull();
    expect(Query(fixture, '.dashboard-editor-shared')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).classList.contains('dashboard-editor--fill')).toBe(true);
  });

  it('enters edit mode from Edit: Editing badge, name field, Add part · Save · Cancel, viewer editing', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    const editing = Capture(editor.EditingChange);
    await startEditing(fixture);
    expect(Text(fixture, 'mj-stat-badge.dashboard-editor-badge')).toBe('Editing');
    expect(nameField(fixture)).toBe('Revenue Board');
    expect(QueryAll(fixture, '.dashboard-editor-actions > button').map((b) => b.textContent?.trim())).toEqual(['Add part', 'Save', 'Cancel']);
    expect(Query(fixture, '.dashboard-editor-actions > .dashboard-editor-divider')).not.toBeNull();
    expect(viewer.IsEditing).toBe(true);
    expect(editing).toEqual([true]);
  });

  it('orders the edit actions Add part, divider, Save (primary, check icon), Cancel (flat)', async () => {
    const { fixture } = await renderEditor();
    await startEditing(fixture);
    const order = QueryAll(fixture, '.dashboard-editor-actions > *').map((e) => (e.classList.contains('dashboard-editor-divider') ? '|' : e.textContent?.trim()));
    expect(order).toEqual(['Add part', '|', 'Save', 'Cancel']);
    expect(HasClass(fixture, SAVE, 'mj-btn--primary')).toBe(true);
    expect(Query(fixture, `${SAVE} i.fa-solid.fa-check`)).not.toBeNull();
    expect(HasClass(fixture, CANCEL, 'mj-btn--flat')).toBe(true);
  });

  it('gives a user who cannot edit no Edit button and no placeholder description', async () => {
    const { fixture, editor } = await renderEditor({ canEdit: false });
    expect(Query(fixture, EDIT)).toBeNull();
    expect(Query(fixture, '.dashboard-editor-desc.is-placeholder')).toBeNull();
    expect(editor.EnterEditMode()).toBe(false);
  });

  it.each([
    { user: 'a user who can edit', canEdit: true, placeholder: 'Add a description' },
    { user: 'a user who cannot edit', canEdit: false, placeholder: '' },
  ])('shows the view-mode description placeholder only to an editor: $user', async ({ canEdit, placeholder }) => {
    const { fixture } = await renderEditor({ canEdit });
    expect(Text(fixture, '.dashboard-editor-desc.is-placeholder')).toBe(placeholder);
  });

  it.each([true, false])('shows a saved description in view mode, without the placeholder, when canEdit is %s', async (canEdit) => {
    const { fixture } = await renderEditor({ canEdit, description: 'Weekly numbers' });
    expect(QueryAll(fixture, '.dashboard-editor-desc').map((e) => e.textContent?.trim())).toEqual(['Weekly numbers']);
    expect(Query(fixture, '.dashboard-editor-desc.is-placeholder')).toBeNull();
  });

  it('marks the star as a favorite with the warning colour class, and names it by what a click does', async () => {
    const { fixture, favorites } = await renderEditor();
    expect(Attr(fixture, '.dashboard-editor-favorite', 'aria-label')).toBe('Add to favorites');
    favorites.IsFavorite.mockReturnValue(true);
    favorites.Changed$.next(); // the favorites service reports every change, also one made on another page
    expect(Query(fixture, '.dashboard-editor-favorite.is-favorite i.fa-solid.fa-star')).not.toBeNull();
    expect(Attr(fixture, '.dashboard-editor-favorite', 'aria-label')).toBe('Remove from favorites');
    expect(Attr(fixture, '.dashboard-editor-favorite', 'title')).toBe('Remove from favorites');
    // The label tells the state, so the star is no toggle button: no aria-pressed in either state.
    expect(Attr(fixture, '.dashboard-editor-favorite', 'aria-pressed')).toBeNull();
  });

  it('marks a dashboard shared with the user next to its title', async () => {
    const { fixture, engine, editor } = await renderEditor({ canEdit: false });
    expect(Query(fixture, '.dashboard-editor-title .dashboard-editor-shared')).not.toBeNull();
    engine.GetDashboardPermissions.mockImplementation((dashboardId: string) => permissionsFor(dashboardId, true));
    editor.RefreshPermissions();
    expect(Query(fixture, '.dashboard-editor-shared')).toBeNull();
  });

  it('shows Open in Dashboards only when the host asks, in view mode, and emits OpenInDashboardsRequested with the dashboard', async () => {
    const { fixture, editor } = await renderEditor({ inputs: { ShowOpenInDashboards: true } });
    const requests = Capture(editor.OpenInDashboardsRequested);
    Click(fixture, '.dashboard-editor-open-in');
    expect(requests).toEqual([editor.Dashboard]);
    expect(requests[0]?.ID).toBe('dash-1');
    await startEditing(fixture);
    expect(Query(fixture, '.dashboard-editor-open-in')).toBeNull();
  });

  it('leaves out the star when ShowFavorite is false, and lays the body out as a card when BodyStyle is card', async () => {
    const { fixture } = await renderEditor({ inputs: { ShowFavorite: false, BodyStyle: 'card' } });
    expect(Query(fixture, '.dashboard-editor-favorite')).toBeNull();
    expect(Query(fixture, '.dashboard-editor-main.is-card')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).classList.contains('dashboard-editor--fill')).toBe(false);
  });

  it('reads the permissions again on RefreshPermissions: the Edit button and the viewer follow', async () => {
    const { fixture, editor, viewer, engine } = await renderEditor({ canEdit: false });
    expect(viewer.CanEdit).toBe(false);
    engine.GetDashboardPermissions.mockImplementation((dashboardId: string) => permissionsFor(dashboardId, true));
    editor.RefreshPermissions();
    expect(editor.CanEdit).toBe(true);
    expect(viewer.CanEdit).toBe(true);
    expect(Query(fixture, EDIT)).not.toBeNull();
  });
});

/** A host that replaces the view-mode title with its own template, as Home's dashboard view does. */
@Component({
  standalone: false,
  template: `<mj-dashboard-editor [Provider]="Provider" DashboardId="dash-1" [TitleTemplate]="title"></mj-dashboard-editor>
             <ng-template #title let-dashboard let-named="Dashboard"><span class="host-title">{{ dashboard.Name }} / {{ named.ID }}</span></ng-template>`,
})
class TitleHost {
  public Provider = CreateFakeProvider({ currentUser: { ID: USER_ID } });
}

describe('DashboardEditorComponent title template (DOM)', () => {
  it("shows the host's title template instead of the title in view mode, with the dashboard as its context", async () => {
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([createDashboard()], true) as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const { module } = editorModule([viewer]);
    const fixture = RenderComponentFixture(TitleHost, { ...module, declarations: [...module.declarations, TitleHost] });
    await settle(fixture);

    expect(Text(fixture, '.dashboard-editor-namewrap .host-title')).toBe('Revenue Board / dash-1');
    expect(Query(fixture, '.dashboard-editor-title')).toBeNull();

    Click(fixture, EDIT);
    await settle(fixture);

    expect(Query(fixture, '.host-title')).toBeNull();
    expect(Query(fixture, '.dashboard-editor-name')).not.toBeNull();
  });
});

describe('DashboardEditorComponent favorite (DOM)', () => {
  it('stars the dashboard from the star, confirms the new state and reports it through FavoriteChange', async () => {
    const { fixture, editor, favorites, notify } = await renderEditor();
    const changes = Capture(editor.FavoriteChange);
    favorites.Toggle.mockImplementationOnce(async () => {
      favorites.IsFavorite.mockReturnValue(true);
      return true;
    });

    Click(fixture, '.dashboard-editor-favorite');
    await settle(fixture);

    expect(favorites.Toggle).toHaveBeenCalledExactlyOnceWith('dash-1');
    expect(notify).toHaveBeenCalledExactlyOnceWith('Added "Revenue Board" to favorites', 'success', 2000);
    expect(changes).toEqual([true]);
    expect(Query(fixture, '.dashboard-editor-favorite.is-favorite')).not.toBeNull();
  });

  it('unstars a favorite and confirms the new state', async () => {
    const { editor, favorites, notify } = await renderEditor();
    favorites.IsFavorite.mockReturnValue(true);
    favorites.Toggle.mockImplementationOnce(async () => {
      favorites.IsFavorite.mockReturnValue(false);
      return false;
    });
    const changes = Capture(editor.FavoriteChange);

    await editor.ToggleFavorite();

    expect(notify).toHaveBeenCalledExactlyOnceWith('Removed "Revenue Board" from favorites', 'success', 2000);
    expect(changes).toEqual([false]);
  });

  it('tells the user when the favorite cannot be changed, and logs why', async () => {
    const errors = silenceErrors();
    const { editor, favorites, notify } = await renderEditor();
    favorites.Toggle.mockRejectedValueOnce(new Error('offline'));
    const changes = Capture(editor.FavoriteChange);

    await editor.ToggleFavorite();

    expect(notify).toHaveBeenCalledExactlyOnceWith('Could not change the favorite', 'error', 3000);
    expect(errors).toHaveBeenCalledExactlyOnceWith('Dashboard editor: could not change the favorite: offline');
    expect(changes).toEqual([false]);
  });

  it('reads the star as not a favorite when the favorites cannot be read', async () => {
    const { fixture, editor, favorites } = await renderEditor();
    favorites.IsFavorite.mockReturnValue(true);
    favorites.Changed$.next();
    expect(Query(fixture, '.dashboard-editor-favorite.is-favorite')).not.toBeNull();

    favorites.IsFavorite.mockImplementation(() => {
      throw new Error('PermissionConstrainedError');
    });
    favorites.Changed$.next();

    expect(editor.IsFavorite).toBe(false);
    expect(Query(fixture, '.dashboard-editor-favorite.is-favorite')).toBeNull();
  });
});

describe('DashboardEditorComponent save (DOM)', () => {
  it('takes one screenshot of the body, saves once, and leaves edit mode', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, editor, viewer, dashboard } = await renderEditor({ capture });
    const editing = Capture(editor.EditingChange);
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);
    expect(capture).toHaveBeenCalledExactlyOnceWith(Query(fixture, '.dashboard-editor-body'), 1500);
    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(dashboard.Thumbnail).toBe(NEW_SCREENSHOT);
    expect(editing).toEqual([true, false]);
    expect(Query(fixture, '.dashboard-editor-badge')).toBeNull();
  });

  it('saves the typed name and description and reports the new name once', async () => {
    const { fixture, editor, dashboard } = await renderEditor();
    const names = Capture(editor.NameChanged);
    const saved = Capture(editor.Saved);
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Pipeline Review');
    TypeInto(fixture, 'input.dashboard-editor-desc', 'Weekly numbers');
    await settle(fixture);
    Click(fixture, SAVE);
    await settle(fixture);
    expect(dashboard.Name).toBe('Pipeline Review');
    expect(dashboard.Description).toBe('Weekly numbers');
    expect(saved).toHaveLength(1);
    expect(names).toEqual(['Pipeline Review']);
    expect(Text(fixture, '.dashboard-editor-desc')).toBe('Weekly numbers');
  });

  it('Save(overrides) outside edit mode saves the given name and keeps the description', async () => {
    const { editor, dashboard } = await renderEditor();
    expect(await editor.Save({ Name: 'Agent Name' })).toBeNull();
    expect(dashboard.Name).toBe('Agent Name');
    expect(dashboard.Description).toBe('');
  });

  it('reports no NameChanged for a save that keeps the name, nor for a saved dashboard without a name', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    const names = Capture(editor.NameChanged);
    const saved = Capture(editor.Saved);
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);
    viewer.DashboardSaved.emit({ ...createDashboard(), Name: '' } as unknown as MJDashboardEntity);

    expect(saved).toHaveLength(2);
    expect(names).toEqual([]);
  });

  it('reports unsaved changes only while editing: a typed name, a typed description or a layout change', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    expect(editor.HasUnsavedChanges).toBe(false);
    await startEditing(fixture);
    expect(editor.HasUnsavedChanges).toBe(false);

    TypeInto(fixture, '.dashboard-editor-name', 'Renamed');
    expect(editor.HasUnsavedChanges).toBe(true);
    TypeInto(fixture, '.dashboard-editor-name', 'Revenue Board');
    TypeInto(fixture, 'input.dashboard-editor-desc', 'Weekly');
    expect(editor.HasUnsavedChanges).toBe(true);
    TypeInto(fixture, 'input.dashboard-editor-desc', '');
    expect(editor.HasUnsavedChanges).toBe(false);
    viewer.HasUnsavedChanges = true;
    expect(editor.HasUnsavedChanges).toBe(true);

    Click(fixture, CANCEL);
    await settle(fixture);
    expect(editor.HasUnsavedChanges).toBe(false);
  });
});

describe('DashboardEditorComponent cancel (DOM)', () => {
  it('drops the unsaved part and the typed name, reloading before the viewer leaves edit mode', async () => {
    const { home } = await renderTwoEditors();
    const editing = Capture(home.editor.EditingChange);
    await startEditing(home.fixture);
    await home.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    TypeInto(home.fixture, '.dashboard-editor-name', 'Renamed');
    Click(home.fixture, CANCEL);
    await settle(home.fixture);
    expect(home.calls).toEqual(['editing:true', 'reload', 'editing:false']);
    expect(home.panels.map((p) => p.id)).toEqual(['panel-1']);
    expect(Text(home.fixture, '.dashboard-editor-title')).toBe('Revenue Board');
    expect(editing).toEqual([true, false]);
  });
});

describe('DashboardEditorComponent parts (DOM)', () => {
  it('opens the Add part dialog from the header and reports the added part through ConfigChanged', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    const changes = Capture(editor.ConfigChanged);
    await startEditing(fixture);
    Click(fixture, ADD_PART);
    await settle(fixture);
    Click(fixture, FIRST_PART_TYPE);
    await settle(fixture);
    Click(fixture, SUBMIT_PART);
    await settle(fixture);
    expect(viewer.AddPanel).toHaveBeenCalledExactlyOnceWith('pt-view', { type: 'View' }, 'View', 'fa-solid fa-table');
    expect(changes.length).toBeGreaterThan(0);
  });

  it('asks with the shared confirm before removing a part, and removes nothing when the answer comes after the edit ended', async () => {
    const { fixture, viewer, confirm } = await renderEditor();
    await startEditing(fixture);
    let answer!: (value: boolean) => void;
    confirm.ConfirmDelete.mockImplementationOnce(() => new Promise<boolean>((resolve) => (answer = resolve)));
    viewer.PanelInteraction.emit(removeRequest('panel-1', 'Revenue', 'View'));
    expect(confirm.ConfirmDelete).toHaveBeenCalledExactlyOnceWith(RemovePartConfirmOptions('Revenue', 'View'));
    Click(fixture, CANCEL);
    await settle(fixture);
    answer(true);
    await settle(fixture);
    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
  });

  it("enters edit mode and opens the part dialog when an empty dashboard's Add part is clicked in view mode", async () => {
    const { fixture, editor, viewer } = await renderEditor({ panels: [] });
    const editing = Capture(editor.EditingChange);

    viewer.PanelInteraction.emit(addPartRequest());
    await settle(fixture);

    expect(editor.IsEditing).toBe(true);
    expect(editing).toEqual([true]);
    expect(viewer.IsEditing).toBe(true);
    expect(Query(fixture, PART_DIALOG)).not.toBeNull();
    expect(partDialog(fixture).Mode).toBe('add');
  });

  it('opens the part dialog in edit mode with the panel when the viewer asks to edit a part', async () => {
    const { fixture, viewer } = await renderEditor();
    await startEditing(fixture);

    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    await settle(fixture);

    const dialog = partDialog(fixture);
    expect(dialog.Mode).toBe('edit');
    expect(dialog.Panel?.id).toBe('panel-1');
    expect(dialog.PartTypes).toEqual([QUERY_TYPE, VIEW_TYPE]);
    expect(Text(fixture, `${PART_DIALOG} .mj-dialog-title`)).toBe('Edit part');
    expect((Query(fixture, '#part-dialog-title') as HTMLInputElement).value).toBe('Revenue');
  });

  it('gives the part dialog the Provider of the editor', async () => {
    const { fixture, editor } = await renderEditor();
    await startEditing(fixture);
    Click(fixture, ADD_PART);
    await settle(fixture);

    expect(partDialog(fixture).Provider).toBe(editor.Provider);
  });
});

describe('DashboardEditorComponent part editing (DOM)', () => {
  it('opens the Add part dialog from the header and adds the chosen part to the viewer', async () => {
    const { fixture, viewer } = await renderEditor();
    await startEditing(fixture);

    Click(fixture, ADD_PART);
    await settle(fixture);

    expect(Query(fixture, `${PART_DIALOG} .part-dialog`)).not.toBeNull();
    expect(tileLabels(fixture)).toEqual(['View', 'Query']);

    Click(fixture, FIRST_PART_TYPE);
    await settle(fixture);
    Click(fixture, SUBMIT_PART);
    await settle(fixture);

    // A part type without a settings panel adds with its name as the title and { type: <name> } as the config.
    expect(viewer.AddPanel).toHaveBeenCalledExactlyOnceWith('pt-view', { type: 'View' }, 'View', 'fa-solid fa-table');
    expect(Query(fixture, PART_DIALOG)).toBeNull();
  });

  it('opens the Add part dialog when the viewer asks for it from its empty state', async () => {
    const { fixture, viewer } = await renderEditor({ panels: [] });
    await startEditing(fixture);

    viewer.OnAddPanelClick();
    await settle(fixture);

    expect(Query(fixture, `${PART_DIALOG} .part-dialog`)).not.toBeNull();
  });

  it('tells the user when the viewer cannot add the part', async () => {
    const errors = silenceErrors();
    const { fixture, viewer, notify } = await renderEditor();
    viewer.AddPanel.mockRejectedValueOnce(new Error('layout not ready'));
    await startEditing(fixture);

    Click(fixture, ADD_PART);
    await settle(fixture);
    Click(fixture, SUBMIT_PART);
    await settle(fixture);

    expect(notify).toHaveBeenCalledExactlyOnceWith('Could not add the part', 'error', 3000);
    expect(errors).toHaveBeenCalledExactlyOnceWith('Dashboard editor: Could not add the part: layout not ready');
    expect(Query(fixture, PART_DIALOG)).toBeNull();
  });

  it('applies what the user changed in Edit part to the part the viewer asked to edit', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    const changes = Capture(editor.ConfigChanged);
    await startEditing(fixture);

    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    await settle(fixture);
    TypeInto(fixture, '#part-dialog-title', 'Users');
    await settle(fixture);
    Click(fixture, SUBMIT_PART);
    await settle(fixture);

    // A part type without a settings panel keeps the part's config and icon; the title is the typed one.
    expect(viewer.UpdatePanelConfig).toHaveBeenCalledExactlyOnceWith('panel-1', { type: 'View', entityName: 'MJ: Applications' }, 'Users', 'fa-solid fa-table');
    expect(Query(fixture, PART_DIALOG)).toBeNull();
    expect(changes.length).toBeGreaterThan(0);
  });

  it('does not open Edit part for a part the viewer cannot find', async () => {
    const { fixture, viewer } = await renderEditor();
    await startEditing(fixture);

    emitFromViewer(viewer, fixture, configureRequest('panel-missing'));
    await settle(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();
  });

  it('asks before removing a part and removes it when the user confirms', async () => {
    const { fixture, editor, viewer, confirm } = await renderEditor();
    const changes = Capture(editor.ConfigChanged);
    await startEditing(fixture);

    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));
    await settle(fixture);

    expect(confirm.ConfirmDelete).toHaveBeenCalledExactlyOnceWith(RemovePartConfirmOptions('Revenue', 'View'));
    expect(viewer.ConfirmRemovePanel).toHaveBeenCalledExactlyOnceWith('panel-1');
    expect(changes.length).toBeGreaterThan(0);
  });

  it('keeps the part when the user cancels the removal', async () => {
    const { fixture, viewer, confirm } = await renderEditor();
    confirm.ConfirmDelete.mockResolvedValueOnce(false);
    await startEditing(fixture);

    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));
    await settle(fixture);

    expect(confirm.ConfirmDelete).toHaveBeenCalledTimes(1);
    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
  });

  it('removes nothing when the user answers after editing ended and started again', async () => {
    const { fixture, viewer, confirm } = await renderEditor();
    await startEditing(fixture);
    let answer!: (value: boolean) => void;
    confirm.ConfirmDelete.mockImplementationOnce(() => new Promise<boolean>((resolve) => (answer = resolve)));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));

    Click(fixture, CANCEL);
    await settle(fixture);
    await startEditing(fixture);
    answer(true);
    await settle(fixture);

    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
  });

  it('removes nothing when the part is gone by the time the user answers', async () => {
    const { fixture, viewer, panels, confirm } = await renderEditor();
    await startEditing(fixture);
    let answer!: (value: boolean) => void;
    confirm.ConfirmDelete.mockImplementationOnce(() => new Promise<boolean>((resolve) => (answer = resolve)));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));

    panels.splice(0, panels.length);
    answer(true);
    await settle(fixture);

    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
  });

  it('ignores Edit part and Remove requests outside edit mode, also after the user starts editing', async () => {
    const { fixture, editor, viewer, confirm } = await renderEditor();

    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));
    await settle(fixture);

    expect(editor.IsEditing).toBe(false);
    expect(Query(fixture, PART_DIALOG)).toBeNull();
    expect(confirm.ConfirmDelete).not.toHaveBeenCalled();

    await startEditing(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();
    expect(confirm.ConfirmDelete).not.toHaveBeenCalled();
  });

  it('ignores the Add part command outside edit mode, also after the user starts editing', async () => {
    const { fixture } = await renderEditor();

    fixture.componentInstance.OpenAddPartDialog();
    await settle(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();

    await startEditing(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();
  });

  it('closes an open part dialog when a Save runs, and does not show it again in the next edit', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    await startEditing(fixture);
    Click(fixture, ADD_PART);
    await settle(fixture);

    // An agent's confirmed save runs while the dialog is open.
    expect(await editor.Save()).toBeNull();
    await settle(fixture);

    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(Query(fixture, ADD_PART)).toBeNull();
    expect(Query(fixture, PART_DIALOG)).toBeNull();

    await startEditing(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();
  });

  it('closes an open part dialog when editing is cancelled, and does not show it again in the next edit', async () => {
    const { fixture, editor, viewer } = await renderEditor();
    await startEditing(fixture);
    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    await settle(fixture);
    expect(Query(fixture, PART_DIALOG)).not.toBeNull();

    editor.CancelEdit();
    await settle(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();

    await startEditing(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();
    expect(viewer.UpdatePanelConfig).not.toHaveBeenCalled();
  });

  it.each(['Save', 'Cancel'])('offers the part types from the first again after a type was picked and editing ended with %s', async (exit) => {
    const { fixture, editor } = await renderEditor();
    await startEditing(fixture);
    Click(fixture, ADD_PART);
    await settle(fixture);
    Click(fixture, SECOND_PART_TYPE);
    await settle(fixture);
    expect(tileLabels(fixture, '.part-dialog__type--selected')).toEqual(['Query']);

    // Save and Cancel also run while the dialog is open, from the agent or the host.
    if (exit === 'Save') {
      await editor.Save();
    } else {
      editor.CancelEdit();
    }
    await settle(fixture);
    await startEditing(fixture);
    Click(fixture, ADD_PART);
    await settle(fixture);

    expect(tileLabels(fixture)).toEqual(['View', 'Query']);
    expect(tileLabels(fixture, '.part-dialog__type--selected')).toEqual(['View']);
  });

  it('gives a user who cannot edit the dashboard no way into edit mode or part editing', async () => {
    const { fixture, editor, viewer } = await renderEditor({ canEdit: false });

    expect(Query(fixture, EDIT)).toBeNull();

    editor.ToggleEditMode();
    viewer.OnAddPanelClick();
    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    await settle(fixture);

    expect(Query(fixture, ADD_PART)).toBeNull();
    expect(editor.IsEditing).toBe(false);
    expect(viewer.IsEditing).toBe(false);
    expect(viewer.CanEdit).toBe(false);
    expect(Query(fixture, PART_DIALOG)).toBeNull();
  });
});

describe('DashboardEditorComponent save and name (DOM)', () => {
  it.each([
    {
      failure: 'the dashboard reports a failed result',
      fail: (viewer: ViewerDouble, dashboard: DashboardDouble) =>
        viewer.save.mockImplementationOnce(async () => {
          dashboard.LatestResult = { Success: false, CompleteMessage: 'Name cannot be longer than 510 characters' };
          return false;
        }),
      message: 'Could not save the dashboard: Name cannot be longer than 510 characters',
      logged: 'Dashboard editor: could not save the dashboard: Name cannot be longer than 510 characters',
    },
    {
      failure: 'the save returns false without a failed result',
      fail: (viewer: ViewerDouble) => viewer.save.mockResolvedValueOnce(false),
      message: 'Could not save the dashboard',
      logged: 'Dashboard editor: could not save the dashboard: no reason given',
    },
    {
      failure: 'the save throws',
      fail: (viewer: ViewerDouble) => viewer.save.mockRejectedValueOnce(new Error('network down')),
      message: 'Could not save the dashboard: network down',
      logged: 'Dashboard editor: could not save the dashboard: network down',
    },
  ])('stays in edit mode with the changes and tells the user why when $failure', async ({ fail, message, logged }) => {
    const errors = silenceErrors();
    const { fixture, editor, viewer, notify, dashboard } = await renderEditor();
    const names = Capture(editor.NameChanged);
    fail(viewer, dashboard);
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Board');
    await settle(fixture);

    Click(fixture, SAVE);
    await settle(fixture);

    expect(notify).toHaveBeenCalledExactlyOnceWith(message, 'error', 5000);
    expect(errors).toHaveBeenCalledExactlyOnceWith(logged);
    expect(Query(fixture, ADD_PART)).not.toBeNull();
    expect(nameField(fixture)).toBe('Renamed Board');
    // Other pages read this cached dashboard, so it goes back to the saved name.
    expect(dashboard.Name).toBe('Revenue Board');
    expect(names).toEqual([]);

    // The next Save saves the changes the user kept.
    Click(fixture, SAVE);
    await settle(fixture);

    expect(Query(fixture, ADD_PART)).toBeNull();
    expect(dashboard.Name).toBe('Renamed Board');
    expect(names).toEqual(['Renamed Board']);
  });

  it('puts the previous name back when the user empties the name and leaves the field', async () => {
    const { fixture } = await renderEditor();
    await startEditing(fixture);

    TypeInto(fixture, '.dashboard-editor-name', '   ');
    // The browser renders after each event, so the page sees the emptied name before the blur.
    await settle(fixture);
    Query(fixture, '.dashboard-editor-name')?.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(nameField(fixture)).toBe('Revenue Board');
  });

  it('saves the previous name when the name is empty at Save', async () => {
    const { fixture, viewer, dashboard } = await renderEditor();
    await startEditing(fixture);

    TypeInto(fixture, '.dashboard-editor-name', '   ');
    Click(fixture, SAVE);
    await settle(fixture);

    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(dashboard.Name).toBe('Revenue Board');
  });
});

describe('DashboardEditorComponent screenshot on Save (DOM)', () => {
  /** Records the dashboard's Thumbnail each time the viewer saves the dashboard, and returns `result`. */
  function recordThumbnailAtSave(viewer: ViewerDouble, dashboard: DashboardDouble, result = true): Array<string | null> {
    const atSave: Array<string | null> = [];
    viewer.save.mockImplementation(async () => {
      atSave.push(dashboard.Thumbnail);
      return result;
    });
    return atSave;
  }

  /** Enters edit mode, clicks Save and waits for the save to finish. */
  async function editAndSave(fixture: ComponentFixture<DashboardEditorComponent>): Promise<void> {
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);
  }

  it('puts a screenshot of the dashboard on the dashboard before its one Save', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, viewer, dashboard } = await renderEditor({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls.at(0)?.[0]).toBe(Query(fixture, '.dashboard-editor-body'));
    expect(atSave).toEqual([NEW_SCREENSHOT]);
    expect(dashboard.Thumbnail).toBe(NEW_SCREENSHOT);
  });

  it('waits at most about 1.5 seconds for the screenshot, not the 4-second pin default', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture } = await renderEditor({ capture });

    await editAndSave(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    const timeoutMs = capture.mock.calls.at(0)?.[1];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(2000);
  });

  it('keeps the saved screenshot when no screenshot can be taken', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => undefined);
    const { fixture, viewer, dashboard } = await renderEditor({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(atSave).toEqual([SAVED_SCREENSHOT]);
  });

  it('saves without a new screenshot when taking one fails', async () => {
    const errors = silenceErrors();
    const capture = vi.fn<CaptureScreenshot>(async () => {
      throw new Error('canvas tainted');
    });
    const { fixture, viewer, dashboard, notify } = await renderEditor({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(atSave).toEqual([SAVED_SCREENSHOT]);
    expect(notify).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledExactlyOnceWith('Dashboard editor: could not take a screenshot of the dashboard: canvas tainted');
    expect(Query(fixture, ADD_PART)).toBeNull();
  });

  it('clears the screenshot of a dashboard with no panels, without taking one, so its cards show the icon', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, viewer, dashboard } = await renderEditor({ capture, panels: [] });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(capture).not.toHaveBeenCalled();
    expect(atSave).toEqual([null]);
    expect(dashboard.Thumbnail).toBeNull();
  });

  it('puts the saved screenshot back when the Save fails', async () => {
    silenceErrors();
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, viewer, dashboard } = await renderEditor({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard, false);

    await editAndSave(fixture);

    expect(atSave).toEqual([NEW_SCREENSHOT]);
    // Other pages read this cached dashboard, so it goes back to its saved screenshot.
    expect(dashboard.Revert).toHaveBeenCalledTimes(1);
    expect(dashboard.Thumbnail).toBe(SAVED_SCREENSHOT);
  });
});

describe('DashboardEditorComponent one save at a time (DOM)', () => {
  /** Whether Save, Cancel and Add part are disabled, in that order. */
  function disabledButtons(fixture: ComponentFixture<DashboardEditorComponent>): boolean[] {
    return [SAVE, CANCEL, ADD_PART].map((selector) => (Query(fixture, selector) as HTMLButtonElement).disabled);
  }

  /** Renders the editor in edit mode and clicks Save; the screenshot stays pending. */
  async function startSaving() {
    const { capture, finish } = pendingCapture();
    const rendered = await renderEditor({ capture });
    await startEditing(rendered.fixture);
    Click(rendered.fixture, SAVE);
    await settle(rendered.fixture);
    return { ...rendered, capture, finish };
  }

  it('makes no second Save() when Save is clicked again while the screenshot is taken', async () => {
    const { fixture, viewer, capture, finish } = await startSaving();

    Click(fixture, SAVE);
    void fixture.componentInstance.SaveDashboard();
    await settle(fixture);
    finish();
    await settle(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(viewer.save).toHaveBeenCalledTimes(1);
  });

  it('ignores Cancel while the save runs; the save then completes with one Save()', async () => {
    const { fixture, viewer, finish } = await startSaving();

    Click(fixture, CANCEL);
    fixture.componentInstance.CancelEdit();
    await settle(fixture);

    expect(Query(fixture, ADD_PART)).not.toBeNull();
    expect(viewer.ReloadFromSaved).not.toHaveBeenCalled();

    finish();
    await settle(fixture);

    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(Query(fixture, ADD_PART)).toBeNull();
  });

  it('disables Save, Cancel and Add part and shows Saving... while the save runs, and enables them for the next edit', async () => {
    const { fixture, finish } = await startSaving();

    expect(disabledButtons(fixture)).toEqual([true, true, true]);
    expect(Text(fixture, SAVE)).toBe('Saving...');
    expect(Query(fixture, `${SAVE} i.fa-spinner.fa-spin`)).not.toBeNull();

    finish();
    await settle(fixture);
    await startEditing(fixture);

    expect(disabledButtons(fixture)).toEqual([false, false, false]);
    expect(Text(fixture, SAVE)).toBe('Save');
  });

  it('enables Save, Cancel and Add part again after a failed save', async () => {
    silenceErrors();
    const { capture, finish } = pendingCapture();
    const { fixture, viewer } = await renderEditor({ capture });
    viewer.save.mockResolvedValueOnce(false);
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    expect(disabledButtons(fixture)).toEqual([true, true, true]);

    finish();
    await settle(fixture);

    expect(Query(fixture, ADD_PART)).not.toBeNull();
    expect(disabledButtons(fixture)).toEqual([false, false, false]);
    expect(Text(fixture, SAVE)).toBe('Save');
  });

  it("ignores Add part and the viewer's part requests while the save runs", async () => {
    const { fixture, viewer, confirm } = await startSaving();

    fixture.componentInstance.OpenAddPartDialog();
    viewer.OnAddPanelClick();
    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));
    await settle(fixture);

    expect(Query(fixture, PART_DIALOG)).toBeNull();
    expect(confirm.ConfirmDelete).not.toHaveBeenCalled();
  });

  it('does not apply a part change that the user confirmed after the save started', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, viewer, confirm } = await renderEditor({ capture });
    await startEditing(fixture);
    let answer!: (value: boolean) => void;
    confirm.ConfirmDelete.mockImplementationOnce(() => new Promise<boolean>((resolve) => (answer = resolve)));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue', 'View'));
    // An agent's confirmed save starts while the Remove part confirm is open.
    void fixture.componentInstance.Save();
    await settle(fixture);

    answer(true);
    await settle(fixture);
    finish();
    await settle(fixture);

    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
    expect(viewer.save).toHaveBeenCalledTimes(1);
  });

  it('writes the name and description after the screenshot, so a name typed while it is taken is saved', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, viewer, dashboard } = await renderEditor({ capture });
    const namesAtSave: string[] = [];
    viewer.save.mockImplementation(async () => {
      namesAtSave.push(dashboard.Name);
      return true;
    });
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Board');
    await settle(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    // Nothing is written to the dashboard while the screenshot is taken.
    expect(dashboard.Name).toBe('Revenue Board');

    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Again');
    await settle(fixture);
    finish();
    await settle(fixture);

    expect(namesAtSave).toEqual(['Renamed Again']);
  });

  it('refuses edit mode while a Save outside edit mode runs, and saves the name that Save was given', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, editor, dashboard } = await renderEditor({ capture });
    const editing = Capture(editor.EditingChange);
    // An agent's confirmed save, outside edit mode, waits for its screenshot.
    const result = editor.Save({ Name: 'Agent Name' });
    await settle(fixture);

    expect((Query(fixture, EDIT) as HTMLButtonElement).disabled).toBe(true);
    Click(fixture, EDIT);
    expect(editor.EnterEditMode()).toBe(false);
    await settle(fixture);
    expect(editor.IsEditing).toBe(false);

    finish();
    expect(await result).toBeNull();
    await settle(fixture);

    expect(dashboard.Name).toBe('Agent Name');
    expect(editor.IsEditing).toBe(false);
    expect(editing).toEqual([]);
    expect((Query(fixture, EDIT) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('DashboardEditorComponent and a save of the same dashboard object elsewhere (DOM)', () => {
  /** The notice the editor shows when another save of Revenue Board's object runs. */
  const SAVING_ELSEWHERE = '"Revenue Board" is being saved elsewhere. Save again in a moment.';

  it('refuses a Save while another save of the dashboard object runs, says so, keeps the edit and its changes, and saves them once that save ends', async () => {
    const { fixture, editor, viewer, dashboard, notify } = await renderEditor();
    const editing = Capture(editor.EditingChange);
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Board');
    await settle(fixture);
    // Home renames this dashboard object at the moment: a second Save would join that save and write nothing
    dashboard.IsSaving = true;

    Click(fixture, SAVE);
    await settle(fixture);

    expect(notify).toHaveBeenCalledExactlyOnceWith(SAVING_ELSEWHERE, 'info', 3000);
    expect(viewer.save).not.toHaveBeenCalled();
    expect(dashboard.Name).toBe('Revenue Board');
    expect(editor.IsEditing).toBe(true);
    expect(editing).toEqual([true]);
    expect(nameField(fixture)).toBe('Renamed Board');
    expect((Query(fixture, SAVE) as HTMLButtonElement).disabled).toBe(false);
    // An agent's confirmed Save hears why
    expect(await editor.Save()).toBe(SAVING_ELSEWHERE);

    dashboard.IsSaving = false;
    Click(fixture, SAVE);
    await settle(fixture);

    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(dashboard.Name).toBe('Renamed Board');
    expect(editor.IsEditing).toBe(false);
  });

  it('stops a Save without writing the dashboard when a save of the dashboard object starts while the screenshot is taken', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, editor, viewer, dashboard, notify } = await renderEditor({ capture });
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Board');
    await settle(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    // Home's rename starts saving this object while the screenshot is taken
    dashboard.IsSaving = true;
    finish();
    await settle(fixture);

    expect(viewer.save).not.toHaveBeenCalled();
    expect(dashboard.Name).toBe('Revenue Board');
    expect(dashboard.Thumbnail).toBe(SAVED_SCREENSHOT);
    expect(notify).toHaveBeenCalledExactlyOnceWith(SAVING_ELSEWHERE, 'info', 3000);
    expect(editor.IsEditing).toBe(true);
    expect(editor.IsSaving).toBe(false);
    expect(nameField(fixture)).toBe('Renamed Board');
  });
});

describe('DashboardEditorComponent save when the editor shows another dashboard (DOM)', () => {
  it('saves nothing and leaves Quota alone when the host shows Quota during the screenshot', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, editor, revenue, first, second } = await renderWithQuota({ capture });
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Board');
    await settle(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    fixture.componentRef.setInput('DashboardId', 'dash-2');
    await settle(fixture);
    // Revenue Board's Save still waits for its screenshot; Quota is not saving, and the user edits it.
    expect(editor.IsSaving).toBe(false);
    expect((Query(fixture, EDIT) as HTMLButtonElement).disabled).toBe(false);
    await startEditing(fixture);
    const editing = Capture(editor.EditingChange);

    finish();
    await settle(fixture);

    expect(first.save).not.toHaveBeenCalled();
    expect(revenue.Name).toBe('Revenue Board');
    expect(revenue.Thumbnail).toBe(SAVED_SCREENSHOT);
    expect(editor.IsEditing).toBe(true);
    expect(second.IsEditing).toBe(true);
    expect(editing).toEqual([]);
    expect(nameField(fixture)).toBe('Quota');
    expect((Query(fixture, SAVE) as HTMLButtonElement).disabled).toBe(false);
  });

  it('saves nothing, and says why, when the host shows Quota while the overwrite question is open', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, editor, revenue, quota, first, confirm } = await renderWithQuota({ capture });
    await startEditing(fixture);
    // Revenue Board was saved elsewhere after this edit began.
    first.HasNewerSavedLayout.mockReturnValue(true);
    const answer = deferred<boolean>();
    confirm.Confirm.mockImplementationOnce(() => answer.promise);
    const result = editor.Save();
    await settle(fixture);
    expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(OVERWRITE_QUESTION);

    fixture.componentRef.setInput('DashboardId', 'dash-2');
    await settle(fixture);
    const editing = Capture(editor.EditingChange);
    answer.resolve(true);

    expect(await result).toBe('The editor shows another dashboard now. The dashboard was not saved.');
    await settle(fixture);
    expect(capture).not.toHaveBeenCalled();
    expect(first.save).not.toHaveBeenCalled();
    expect(revenue.Name).toBe('Revenue Board');
    expect(editor.Dashboard).toBe(quota);
    expect(editor.IsSaving).toBe(false);
    expect(editing).toEqual([]);
  });

  it("keeps Quota's own Save running when the Save that Revenue Board started stops", async () => {
    const revenueScreenshot = deferred<string | undefined>();
    const capture = vi.fn<CaptureScreenshot>(() => revenueScreenshot.promise);
    const { fixture, editor, first, second } = await renderWithQuota({ capture });
    const quotaSaving = deferred<boolean>();
    second.save.mockImplementationOnce(() => quotaSaving.promise);
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);
    fixture.componentRef.setInput('DashboardId', 'dash-2');
    await settle(fixture);
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);
    expect(second.save).toHaveBeenCalledTimes(1);

    // Revenue Board's Save gets its screenshot and stops; Quota's Save still waits for the viewer.
    revenueScreenshot.resolve(NEW_SCREENSHOT);
    await settle(fixture);

    expect(editor.IsSaving).toBe(true);
    expect((Query(fixture, SAVE) as HTMLButtonElement).disabled).toBe(true);

    quotaSaving.resolve(true);
    await settle(fixture);

    expect(first.save).not.toHaveBeenCalled();
    expect(editor.IsSaving).toBe(false);
    expect(editor.IsEditing).toBe(false);
  });

  it('leaves Quota alone when the host shows Quota while the dashboard saves, and returns null for the save that was made', async () => {
    const { fixture, editor, revenue, first, second } = await renderWithQuota();
    const saving = deferred<boolean>();
    first.save.mockImplementationOnce(() => saving.promise);
    const saved = Capture(editor.Saved);
    const names = Capture(editor.NameChanged);
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Renamed Board');
    await settle(fixture);
    const result = editor.Save();
    await settle(fixture);
    expect(first.save).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('DashboardId', 'dash-2');
    await settle(fixture);
    await startEditing(fixture);
    const editing = Capture(editor.EditingChange);
    // The viewer saved Revenue Board.
    first.DashboardSaved.emit(revenue as unknown as MJDashboardEntity);
    saving.resolve(true);

    expect(await result).toBeNull();
    await settle(fixture);
    expect(revenue.Name).toBe('Renamed Board');
    expect(editor.IsEditing).toBe(true);
    expect(second.IsEditing).toBe(true);
    expect(editor.IsSaving).toBe(false);
    expect(editing).toEqual([]);
    // The host shows Quota: it hears nothing of Revenue Board's save.
    expect(saved).toEqual([]);
    expect(names).toEqual([]);
  });
});

describe('DashboardEditorComponent loading (DOM)', () => {
  it('keeps its viewer when the host sets the same dashboard ID again, in another case', async () => {
    const { fixture, create } = await renderEditor();
    fixture.componentRef.setInput('DashboardId', 'DASH-1');
    await settle(fixture);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('starts in edit mode once when StartInEditMode is set, and resets it', async () => {
    const dashboard = createDashboard();
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([dashboard], true) as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const { module } = editorModule([viewer]);
    const fixture = RenderComponentFixture(DashboardEditorComponent, {
      ...module,
      inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID, StartInEditMode: true },
    });
    const resets = Capture(fixture.componentInstance.StartInEditModeChange);
    await settle(fixture);
    expect(fixture.componentInstance.IsEditing).toBe(true);
    expect(resets).toEqual([false]);
  });

  it('emits LoadFailed for a dashboard DashboardEngine does not hold, and for a Code dashboard', async () => {
    const errors = silenceErrors();
    const code = { ...createDashboard(), ID: 'dash-code', Type: 'Code', Name: 'Ops' };
    const { fixture, editor } = await renderEditor({ dashboards: [createDashboard(), code] });
    const failures = Capture(editor.LoadFailed);
    fixture.componentRef.setInput('DashboardId', 'dash-missing');
    await settle(fixture);
    fixture.componentRef.setInput('DashboardId', 'dash-code');
    await settle(fixture);
    expect(failures.map((f) => f.DashboardId)).toEqual(['dash-missing', 'dash-code']);
    expect(editor.Dashboard).toBeNull();
    expect(errors).toHaveBeenCalledTimes(2);
    expect(Query(fixture, '.dashboard-editor-header')).toBeNull();
  });

  it('shows the header while the layout builds, and emits Loaded once the layout is ready', async () => {
    const dashboard = createDashboard();
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([dashboard], true) as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    let layoutReady = (): void => undefined;
    viewer.WaitForLayoutReady = () => new Promise<void>((resolve) => (layoutReady = resolve));
    const { module } = editorModule([viewer]);
    const fixture = RenderComponentFixture(DashboardEditorComponent, {
      ...module,
      inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID },
    });
    const loaded = Capture(fixture.componentInstance.Loaded);
    await settle(fixture);

    expect(Text(fixture, '.dashboard-editor-title')).toBe('Revenue Board');
    expect(loaded).toEqual([]);

    layoutReady();
    await settle(fixture);

    expect(loaded).toEqual([dashboard]);
  });

  it('configures the viewer and wires its events before it gets the dashboard', async () => {
    const dashboard = createDashboard();
    const engine = createEngine([dashboard], true);
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const atDashboard: Array<Record<string, unknown>> = [];
    let shown: MJDashboardEntity | null = null;
    Object.defineProperty(viewer, 'Dashboard', {
      get: () => shown,
      set: (value: MJDashboardEntity | null) => {
        shown = value;
        atDashboard.push({
          Provider: viewer.Provider,
          ShowToolbar: viewer.ShowToolbar,
          ShowBreadcrumb: viewer.ShowBreadcrumb,
          ShowOpenInTabButton: viewer.ShowOpenInTabButton,
          ShowEditButton: viewer.ShowEditButton,
          Categories: viewer.Categories,
          CanEdit: viewer.CanEdit,
          Wired: [viewer.NavigationRequested, viewer.DashboardSaved, viewer.error, viewer.configChanged, viewer.PanelInteraction].every((e) => e.observed),
        });
      },
    });
    const provider = CreateFakeProvider({ currentUser: { ID: USER_ID } });
    const { module } = editorModule([viewer]);
    const fixture = RenderComponentFixture(DashboardEditorComponent, { ...module, inputs: { Provider: provider, DashboardId: dashboard.ID } });
    await settle(fixture);

    expect(atDashboard).toEqual([
      {
        Provider: provider,
        ShowToolbar: false,
        ShowBreadcrumb: false,
        ShowOpenInTabButton: false,
        ShowEditButton: false,
        Categories: engine.DashboardCategories,
        CanEdit: true,
        Wired: true,
      },
    ]);
    expect(viewer.Dashboard).toBe(dashboard);
    expect(fixture.componentInstance.Viewer).toBe(viewer);
  });

  it("passes the viewer's navigation requests to the host", async () => {
    const { editor, viewer } = await renderEditor();
    const requests = Capture(editor.NavigationRequested);
    const request: DashboardNavRequestEvent = { request: { type: 'OpenQuery', queryId: 'q-1', sourcePanelId: 'panel-1' }, panel: revenuePanel() };

    viewer.NavigationRequested.emit(request);

    expect(requests).toEqual([request]);
  });

  it('drops the edit in progress and shows the new dashboard when the host sets another DashboardId', async () => {
    const { fixture, editor, second, create, loaded } = await renderWithQuota();
    await startEditing(fixture);
    const editing = Capture(editor.EditingChange);

    fixture.componentRef.setInput('DashboardId', 'dash-2');
    await settle(fixture);

    expect(editing).toEqual([false]);
    expect(create.mock.results[0]?.value.destroy).toHaveBeenCalledTimes(1);
    expect(editor.Viewer).toBe(second);
    expect(editor.IsEditing).toBe(false);
    expect(loaded.map((d) => d.ID)).toEqual(['dash-1', 'dash-2']);
    expect(Text(fixture, '.dashboard-editor-title')).toBe('Quota');
  });

  it('clears the editor when the host sets DashboardId to null', async () => {
    const { fixture, editor, create } = await renderEditor();

    fixture.componentRef.setInput('DashboardId', null);
    await settle(fixture);

    expect(editor.Dashboard).toBeNull();
    expect(editor.Viewer).toBeNull();
    expect(create.mock.results[0]?.value.destroy).toHaveBeenCalledTimes(1);
    expect(Query(fixture, '.dashboard-editor-header')).toBeNull();
  });

  it('shows only the dashboard the host set last when it sets another DashboardId while a load is pending', async () => {
    const layout = deferred<void>();
    const { fixture, editor, quota, first, second, loaded, resets } = await renderWithQuota({ firstLayoutReady: layout.promise, inputs: { StartInEditMode: true } });
    // Revenue Board's header shows while its layout builds.
    expect(Text(fixture, '.dashboard-editor-title')).toBe('Revenue Board');

    fixture.componentRef.setInput('DashboardId', 'dash-2');
    await settle(fixture);
    layout.resolve();
    await settle(fixture);

    expect(loaded).toEqual([quota]);
    expect(resets).toEqual([false]);
    expect(editor.Viewer).toBe(second);
    expect(editor.IsEditing).toBe(true);
    expect(second.IsEditing).toBe(true);
    expect(first.IsEditing).toBe(false);
    expect(nameField(fixture)).toBe('Quota');
  });

  it('stops the load when the editor is destroyed while the layout builds: no edit mode and no Loaded', async () => {
    const dashboard = createDashboard();
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([dashboard], true) as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const layout = deferred<void>();
    viewer.WaitForLayoutReady = () => layout.promise;
    const { module } = editorModule([viewer]);
    const fixture = RenderComponentFixture(DashboardEditorComponent, {
      ...module,
      inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID, StartInEditMode: true },
    });
    const editor = fixture.componentInstance;
    const loaded = Capture(editor.Loaded);
    const resets = Capture(editor.StartInEditModeChange);
    const editing = Capture(editor.EditingChange);
    await settle(fixture);

    fixture.destroy();
    layout.resolve();
    await flush();

    expect(loaded).toEqual([]);
    expect(resets).toEqual([]);
    expect(editing).toEqual([]);
    expect(viewer.IsEditing).toBe(false);
  });

  it('creates no viewer when the editor is destroyed while DashboardEngine loads', async () => {
    const dashboard = createDashboard();
    const engine = createEngine([dashboard], true);
    const config = deferred<undefined>();
    engine.Config.mockImplementationOnce(() => config.promise);
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const { module, create } = editorModule([viewer]);
    const fixture = RenderComponentFixture(DashboardEditorComponent, {
      ...module,
      inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID },
    });
    const loaded = Capture(fixture.componentInstance.Loaded);
    const failures = Capture(fixture.componentInstance.LoadFailed);
    await settle(fixture);

    fixture.destroy();
    config.resolve(undefined);
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(loaded).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('shows no dashboard when its layout fails, drops an edit begun while it built, then emits LoadFailed', async () => {
    const errors = silenceErrors();
    const dashboard = createDashboard();
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([dashboard], true) as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const layout = deferred<void>();
    viewer.WaitForLayoutReady = () => layout.promise;
    const { module, create } = editorModule([viewer]);
    const fixture = RenderComponentFixture(DashboardEditorComponent, {
      ...module,
      inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID },
    });
    const editor = fixture.componentInstance;
    const editing = Capture(editor.EditingChange);
    const atFailure: Array<{ Failure: DashboardEditorLoadError; Dashboard: MJDashboardEntity | null; HasViewer: boolean }> = [];
    editor.LoadFailed.subscribe((failure) => atFailure.push({ Failure: failure, Dashboard: editor.Dashboard, HasViewer: editor.Viewer !== null }));
    await settle(fixture);
    // The header shows while the layout builds, and the user starts editing.
    await startEditing(fixture);

    layout.reject(new Error('Dashboard layout container stayed at zero size for 10000ms'));
    await settle(fixture);

    expect(atFailure).toEqual([
      { Failure: { DashboardId: 'dash-1', Message: 'Dashboard layout container stayed at zero size for 10000ms' }, Dashboard: null, HasViewer: false },
    ]);
    expect(editing).toEqual([true, false]);
    expect(create.mock.results[0]?.value.destroy).toHaveBeenCalledTimes(1);
    expect(Query(fixture, '.dashboard-editor-header')).toBeNull();
    expect(Query(fixture, EDIT)).toBeNull();
    expect(errors).toHaveBeenCalledExactlyOnceWith('Dashboard editor: could not load dashboard dash-1: Dashboard layout container stayed at zero size for 10000ms');
  });
});

/**
 * Gives a viewer double the real viewer's saved-layout behavior: it shows the parts of its
 * dashboard's saved configuration when it gets the dashboard and when it reloads, its save writes
 * its parts back and emits DashboardSaved, HasNewerSavedLayout compares a dashboard's saved
 * configuration with the one it last showed or saved, a reload reports the rebuilt layout through
 * configChanged afterwards, like Golden Layout does, and UseSavedCopy takes another copy of the
 * dashboard with the same saved layout without a rebuild. `calls` records reloads, taken copies and
 * edit-mode changes in order.
 */
function showSavedLayout(viewer: ViewerDouble, panels: DashboardPanel[]): { calls: string[] } {
  const calls: string[] = [];
  let shown: DashboardDouble | null = null;
  let loadedDetails: string | null = null;
  let editing = false;
  const load = (dashboard: DashboardDouble): void => {
    shown = dashboard;
    loadedDetails = dashboard.UIConfigDetails;
    panels.splice(0, panels.length, ...savedPanels(dashboard.UIConfigDetails));
  };
  const asDouble = (dashboard: MJDashboardEntity | null | undefined): DashboardDouble | null =>
    (dashboard as unknown as DashboardDouble | null | undefined) ?? shown;
  Object.defineProperties(viewer, {
    Dashboard: {
      get: () => shown,
      set: (dashboard: DashboardDouble) => {
        if (dashboard !== shown) load(dashboard);
      },
    },
    IsEditing: {
      get: () => editing,
      set: (value: boolean) => {
        editing = value;
        calls.push(`editing:${value}`);
      },
    },
  });
  viewer.save.mockImplementation(async (): Promise<boolean> => {
    if (!shown) return false;
    shown.UIConfigDetails = savedConfig(panels);
    loadedDetails = shown.UIConfigDetails;
    viewer.DashboardSaved.emit(shown as unknown as MJDashboardEntity);
    return true;
  });
  viewer.HasNewerSavedLayout.mockImplementation((dashboard?: MJDashboardEntity | null): boolean => {
    const saved = asDouble(dashboard);
    return !!saved && saved.UIConfigDetails !== loadedDetails;
  });
  viewer.UseSavedCopy.mockImplementation((dashboard: MJDashboardEntity): boolean => {
    const copy = asDouble(dashboard);
    if (!shown || !copy || copy.ID.toLowerCase() !== shown.ID.toLowerCase() || copy.UIConfigDetails !== loadedDetails) return false;
    shown = copy;
    calls.push('use-copy');
    return true;
  });
  viewer.ReloadFromSaved.mockImplementation(async (dashboard?: MJDashboardEntity | null): Promise<void> => {
    const saved = asDouble(dashboard);
    calls.push('reload');
    if (!saved) return;
    load(saved);
    await Promise.resolve();
    viewer.configChanged.emit({ config: viewer.getConfig() as unknown as DashboardConfigChangedEvent['config'], changeType: 'layout' });
  });
  return { calls };
}

/**
 * Home's dashboard view and a dashboard tab of Revenue Board: two editors that share the DashboardEngine
 * double and its cached entity, each with its own viewer that shows the saved layout (showSavedLayout).
 * They also share the confirm and favorites doubles.
 */
async function renderTwoEditors() {
  const dashboard = createDashboard();
  const engine = createEngine([dashboard], true);
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);
  const homeViewer = createViewer([]);
  const tabViewer = createViewer([]);
  const homeCalls = showSavedLayout(homeViewer.viewer, homeViewer.panels).calls;
  const tabCalls = showSavedLayout(tabViewer.viewer, tabViewer.panels).calls;
  const { module, confirm, favorites } = editorModule([homeViewer.viewer, tabViewer.viewer]);
  const inputs = { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }), DashboardId: dashboard.ID };
  const home = RenderComponentFixture(DashboardEditorComponent, { ...module, inputs });
  await settle(home);
  const tab = RenderComponentFixture(DashboardEditorComponent, { inputs }); // same testing module
  await settle(tab);
  return {
    dashboard,
    engine,
    confirm,
    favorites,
    home: { fixture: home, editor: home.componentInstance, viewer: homeViewer.viewer, panels: homeViewer.panels, calls: homeCalls },
    tab: { fixture: tab, editor: tab.componentInstance, viewer: tabViewer.viewer, panels: tabViewer.panels, calls: tabCalls },
  };
}

type RenderedEditor = Awaited<ReturnType<typeof renderTwoEditors>>['home'];

/** A DashboardEngine change event, as BaseEngine emits it after a save of a dashboard. */
function dashboardChange(dashboard: object, entityName = 'MJ: Dashboards'): EngineDataChangeEvent {
  return {
    config: { EntityName: entityName } as unknown as EngineDataChangeEvent['config'],
    changeType: 'update',
    data: [],
    affectedEntity: dashboard as unknown as EngineDataChangeEvent['affectedEntity'],
  };
}

/** A DashboardEngine event for a reload of all dashboards. */
function dashboardsReloaded(): EngineDataChangeEvent {
  return { config: { EntityName: 'MJ: Dashboards' } as unknown as EngineDataChangeEvent['config'], changeType: 'refresh', data: [] };
}

/** A part the tests add. */
function quotaPanel(id: string): DashboardPanel {
  return { id, title: 'Quota', icon: 'fa-solid fa-database', partTypeId: 'pt-query', config: { type: 'Query' } };
}

/** Enters edit mode in the editor, adds a part through its viewer, and saves. */
async function addPartAndSave(rendered: RenderedEditor): Promise<void> {
  await startEditing(rendered.fixture);
  await rendered.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
  Click(rendered.fixture, SAVE);
  await settle(rendered.fixture);
}

const partIds = (panels: DashboardPanel[]): string[] => panels.map((panel) => panel.id);

describe('DashboardEditorComponent and the saved layout (DOM)', () => {
  it("keeps the other editor's saved part when an editor that loaded earlier enters edit mode and saves", async () => {
    const { dashboard, home, tab } = await renderTwoEditors();

    await addPartAndSave(tab);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
    // No change event has reached Home's view: it still shows the layout it loaded.
    expect(partIds(home.panels)).toEqual(['panel-1']);

    await startEditing(home.fixture);

    // Home's view reloads the saved layout before its viewer enters edit mode.
    expect(home.calls).toEqual(['reload', 'editing:true']);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);

    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
  });

  it('edits the copy DashboardEngine now holds, without a rebuild, when the engine has another copy with the same layout', async () => {
    const { dashboard, engine, home } = await renderTwoEditors();
    // The engine reloaded its dashboards: it holds a new copy, renamed elsewhere.
    const copy = createDashboard();
    copy.Name = 'Revenue Board 2026';
    engine.Dashboards.splice(0, 1, copy);

    await startEditing(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(home.calls).toEqual(['use-copy', 'editing:true']);
    expect(home.viewer.Dashboard).toBe(copy);
    expect(home.editor.Dashboard).toBe(copy);
    expect(nameField(home.fixture)).toBe('Revenue Board 2026');

    await home.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(savedPanelIds(copy.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
  });

  it('rebuilds from the copy DashboardEngine now holds when that copy has another layout, before editing it', async () => {
    const { engine, home } = await renderTwoEditors();
    const copy = createDashboard();
    copy.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.Dashboards.splice(0, 1, copy);

    await startEditing(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(copy);
    expect(home.calls).toEqual(['reload', 'editing:true']);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
  });

  it('enters edit mode without a reload when the saved layout has not changed', async () => {
    const { home } = await renderTwoEditors();

    await startEditing(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(home.calls).toEqual(['editing:true']);
  });

  it('reloads an editor that is not editing when the dashboard is saved in the other editor, and says so before the rebuilt layout reports', async () => {
    const { dashboard, engine, home, tab } = await renderTwoEditors();
    await addPartAndSave(tab);
    const events: string[] = [];
    home.editor.ReloadedFromSaved.subscribe(() => events.push('reloaded'));
    home.editor.ConfigChanged.subscribe(() => events.push('config'));

    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(dashboard);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
    expect(home.calls).toEqual(['reload']);
    // The host takes the reloaded parts as already reported before the rebuilt layout's change arrives.
    expect(events).toEqual(['reloaded', 'config']);
    // The editor that saved already shows the saved layout.
    expect(tab.viewer.ReloadFromSaved).not.toHaveBeenCalled();
  });

  it('does not reload an editor that is editing: its user keeps the changes', async () => {
    const { dashboard, engine, home, tab } = await renderTwoEditors();
    await startEditing(home.fixture);
    await home.viewer.AddPanel('pt-view', { type: 'View' }, 'View');

    await addPartAndSave(tab);
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
    expect(home.panels[1].partTypeId).toBe('pt-view');
  });

  it('reloads once, after the task, for a burst of changes, and shows the last saved layout', async () => {
    const { dashboard, engine, home } = await renderTwoEditors();

    dashboard.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.DataChange$.next(dashboardChange(dashboard));
    dashboard.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2'), quotaPanel('panel-3')]);
    engine.DataChange$.next(dashboardChange(dashboard));
    engine.DataChange$.next(dashboardsReloaded());

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledTimes(1);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2', 'panel-3']);
  });

  it('takes the new copy without a rebuild when DashboardEngine reloads its dashboards and the layout did not change', async () => {
    const { dashboard, engine, home } = await renderTwoEditors();
    const reloads = Capture(home.editor.ReloadedFromSaved);
    // A full reload of the dashboards (Share, New, a refresh): new copies with the same saved values.
    const copy = createDashboard();
    copy.Name = 'Revenue Board 2026';
    engine.Dashboards.splice(0, 1, copy);

    engine.DataChange$.next(dashboardsReloaded());
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(home.calls).toEqual(['use-copy']);
    expect(Text(home.fixture, '.dashboard-editor-title')).toBe('Revenue Board 2026');
    expect(reloads).toEqual([]);

    // A later save writes the copy the engine holds, not the old one.
    await addPartAndSave(home);

    expect(savedPanelIds(copy.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
  });

  it('rebuilds when DashboardEngine reloads its dashboards and the saved layout changed', async () => {
    const { engine, home } = await renderTwoEditors();
    const copy = createDashboard();
    copy.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.Dashboards.splice(0, 1, copy);

    engine.DataChange$.next(dashboardsReloaded());
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(copy);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
  });

  it("keeps the layout of an editor that saved a copy DashboardEngine no longer held, and takes the engine's new copy", async () => {
    const { dashboard, engine, tab, home } = await renderTwoEditors();
    await startEditing(tab.fixture);
    // While the tab edits, the engine reloads its dashboards: both editors now hold a copy it no longer has.
    engine.Dashboards.splice(0, 1, createDashboard());
    engine.DataChange$.next(dashboardsReloaded());
    await settle(tab.fixture);
    await tab.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    Click(tab.fixture, SAVE);
    await settle(tab.fixture);
    // BaseEngine puts a copy of the saved entity in the array and reports the update.
    const saved = createDashboard();
    saved.UIConfigDetails = dashboard.UIConfigDetails;
    engine.Dashboards.splice(0, 1, saved);
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(tab.fixture);

    expect(tab.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(tab.viewer.Dashboard).toBe(saved);
    // The other editor shows the new layout.
    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(saved);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
  });

  it('ignores changes to other dashboards and to other dashboard entities', async () => {
    const { dashboard, engine, home } = await renderTwoEditors();
    dashboard.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);

    engine.DataChange$.next(dashboardChange({ ID: 'dash-2', PrimaryKey: CompositeKey.FromID('dash-2') }));
    engine.DataChange$.next(dashboardChange(dashboard, 'MJ: Dashboard Categories'));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();

    // Another copy of the same dashboard, as saved from another page, counts.
    engine.DataChange$.next(dashboardChange({ ID: 'DASH-1', PrimaryKey: CompositeKey.FromID('DASH-1') }));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledTimes(1);
  });

  it('stops following changes when the editor is destroyed', async () => {
    const { dashboard, engine, favorites, home, tab } = await renderTwoEditors();
    home.fixture.destroy();

    dashboard.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.DataChange$.next(dashboardChange(dashboard));
    await flush();

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();

    // Once both editors are destroyed, nothing follows DashboardEngine's changes or the favorites.
    tab.fixture.destroy();
    expect(engine.DataChange$.observed).toBe(false);
    expect(favorites.Changed$.observed).toBe(false);
  });

  it('discards an unsaved part on Cancel and shows the saved layout again', async () => {
    const { dashboard, home } = await renderTwoEditors();
    const editing = Capture(home.editor.EditingChange);
    await startEditing(home.fixture);
    await home.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);

    Click(home.fixture, CANCEL);
    await settle(home.fixture);

    // The viewer reloads before it leaves edit mode, so it rebuilds the saved layout.
    expect(home.calls).toEqual(['editing:true', 'reload', 'editing:false']);
    expect(partIds(home.panels)).toEqual(['panel-1']);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
    expect(Query(home.fixture, '.dashboard-editor-header.is-editing')).toBeNull();
    expect(editing).toEqual([true, false]);
  });
});

describe('DashboardEditorComponent with a Home view and a tab on one dashboard (DOM)', () => {
  it('reloads the idle Home view when the tab saves, and leaves the editing Home view alone', async () => {
    const { dashboard, engine, home, tab } = await renderTwoEditors();
    await startEditing(tab.fixture);
    await tab.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    Click(tab.fixture, SAVE);
    await settle(tab.fixture);
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(home.fixture);
    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(dashboard);
    expect(home.panels.map((p) => p.id)).toEqual(['panel-1', 'panel-2']);

    // Home's view now edits; the tab saves again.
    await startEditing(home.fixture);
    await home.viewer.AddPanel('pt-view', { type: 'View' }, 'View', 'fa-solid fa-table');
    await addPartAndSave(tab);
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledTimes(1);
    expect(home.panels.map((p) => p.partTypeId)).toEqual(['pt-view', 'pt-query', 'pt-view']);
  });

  it("reloads the saved layout before a stale Home view enters edit mode, so its save keeps the tab's part", async () => {
    const { dashboard, home, tab } = await renderTwoEditors();
    await startEditing(tab.fixture);
    await tab.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    Click(tab.fixture, SAVE);
    await settle(tab.fixture);
    await startEditing(home.fixture); // no change event reached Home
    expect(home.calls).toEqual(['reload', 'editing:true']);
    Click(home.fixture, SAVE);
    await settle(home.fixture);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
  });

  it('reports a rename saved elsewhere through NameChanged, also when both editors hold the same entity', async () => {
    const { dashboard, engine, tab } = await renderTwoEditors();
    const names = Capture(tab.editor.NameChanged);
    dashboard.Name = 'Board (renamed from a Home pin)'; // Home saves the cached entity
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(tab.fixture);
    expect(names).toEqual(['Board (renamed from a Home pin)']);
    expect(Text(tab.fixture, '.dashboard-editor-title')).toBe('Board (renamed from a Home pin)');
  });

  it('reports a rename saved elsewhere while editing, and keeps the name the user typed', async () => {
    const { dashboard, engine, tab } = await renderTwoEditors();
    const names = Capture(tab.editor.NameChanged);
    await startEditing(tab.fixture);
    TypeInto(tab.fixture, '.dashboard-editor-name', 'My Board');
    await settle(tab.fixture);

    dashboard.Name = 'Board (renamed from a Home pin)';
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(tab.fixture);

    expect(names).toEqual(['Board (renamed from a Home pin)']);
    expect(nameField(tab.fixture)).toBe('My Board');
    expect(tab.viewer.ReloadFromSaved).not.toHaveBeenCalled();
  });
});

describe('DashboardEditorComponent and a save made elsewhere while editing (DOM)', () => {
  it("asks before saving over the other editor's save, and keeps editing on Keep editing", async () => {
    const { dashboard, confirm, home, tab } = await renderTwoEditors();
    const editing = Capture(home.editor.EditingChange);
    await startEditing(home.fixture);
    await addPartAndSave(tab);
    confirm.Confirm.mockResolvedValueOnce(false);

    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(OVERWRITE_QUESTION);
    expect(home.editor.IsEditing).toBe(true);
    expect(home.viewer.save).not.toHaveBeenCalled();
    expect(editing).toEqual([true]);
    expect((Query(home.fixture, SAVE) as HTMLButtonElement).disabled).toBe(false);
    // The tab's save stays.
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
  });

  it("saves over the other editor's save on Save anyway", async () => {
    const { dashboard, confirm, home, tab } = await renderTwoEditors();
    await startEditing(home.fixture);
    await addPartAndSave(tab);
    confirm.Confirm.mockResolvedValueOnce(true);

    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(OVERWRITE_QUESTION);
    expect(home.viewer.save).toHaveBeenCalledTimes(1);
    expect(home.editor.IsEditing).toBe(false);
    // Home's layout replaces the tab's.
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
  });

  it('does not ask when nothing was saved elsewhere', async () => {
    const { confirm, home } = await renderTwoEditors();
    await startEditing(home.fixture);

    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(confirm.Confirm).not.toHaveBeenCalled();
    expect(home.viewer.save).toHaveBeenCalledTimes(1);
    expect(home.editor.IsEditing).toBe(false);
  });

  it.each([
    { change: 'name', field: '.dashboard-editor-name', value: 'Pipeline Review' },
    { change: 'description', field: 'input.dashboard-editor-desc', value: 'Weekly numbers' },
  ])('asks when the other editor saved another $change after this edit began', async ({ field, value }) => {
    const { confirm, home, tab } = await renderTwoEditors();
    await startEditing(home.fixture);
    await startEditing(tab.fixture);
    TypeInto(tab.fixture, field, value);
    await settle(tab.fixture);
    Click(tab.fixture, SAVE);
    await settle(tab.fixture);
    expect(tab.viewer.save).toHaveBeenCalledTimes(1);

    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(OVERWRITE_QUESTION);
    expect(home.viewer.save).not.toHaveBeenCalled();
  });

  it('asks when DashboardEngine now holds a copy saved elsewhere with another name', async () => {
    const { confirm, engine, home } = await renderTwoEditors();
    await startEditing(home.fixture);
    // Another page saved its own copy of the dashboard; DashboardEngine holds that copy now.
    const copy = createDashboard();
    copy.Name = 'Revenue Board 2026';
    engine.Dashboards.splice(0, 1, copy);

    Click(home.fixture, SAVE);
    await settle(home.fixture);

    expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(OVERWRITE_QUESTION);
    expect(home.viewer.save).not.toHaveBeenCalled();
  });

  it("asks the same question before an agent's Save while editing, and says why it did not save", async () => {
    const { confirm, home, tab } = await renderTwoEditors();
    await startEditing(home.fixture);
    await addPartAndSave(tab);
    confirm.Confirm.mockResolvedValueOnce(false);

    const result = await home.editor.Save({ Name: 'Agent Name' });

    expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(OVERWRITE_QUESTION);
    expect(result).toBe('The user kept editing: the dashboard was saved elsewhere.');
    expect(home.editor.IsEditing).toBe(true);
    expect(home.viewer.save).not.toHaveBeenCalled();
  });

  it('does not ask after a save of its own: neither on a Save outside edit mode nor in the next edit', async () => {
    const { fixture, editor, viewer, confirm, dashboard } = await renderEditor();
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-editor-name', 'Pipeline Review');
    await settle(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    expect(await editor.Save({ Name: 'Agent Name' })).toBeNull();
    await startEditing(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    expect(confirm.Confirm).not.toHaveBeenCalled();
    expect(viewer.save).toHaveBeenCalledTimes(3);
    expect(dashboard.Name).toBe('Agent Name');
  });
});

/** A host that projects content into the editor's two slots, as the dashboard tab does. */
@Component({
  standalone: false,
  template: `<mj-dashboard-editor [Provider]="Provider" DashboardId="dash-1">
               <button headerTools type="button" class="host-tool">AI</button>
               <span viewActions class="host-view-action">Add to</span>
             </mj-dashboard-editor>`,
})
class EditorHost {
  public Provider = CreateFakeProvider({ currentUser: { ID: USER_ID } });
}

describe('DashboardEditorComponent slots (DOM)', () => {
  it('shows the host tools in both modes and the host view actions only in view mode', async () => {
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(createEngine([createDashboard()], true) as unknown as DashboardEngine);
    const { viewer } = createViewer([revenuePanel()]);
    const { module } = editorModule([viewer]);
    const fixture = RenderComponentFixture(EditorHost, { ...module, declarations: [...module.declarations, EditorHost] });
    await settle(fixture);

    expect(Query(fixture, '.dashboard-editor-actions .host-tool')).not.toBeNull();
    expect(Query(fixture, '.dashboard-editor-actions .host-view-action')).not.toBeNull();

    Click(fixture, EDIT);
    await settle(fixture);

    expect(Query(fixture, '.dashboard-editor-actions .host-tool')).not.toBeNull();
    expect(Query(fixture, '.dashboard-editor-actions .host-view-action')).toBeNull();
  });
});
