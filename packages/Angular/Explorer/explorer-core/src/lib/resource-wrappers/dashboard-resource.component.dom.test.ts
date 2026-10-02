import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { Provider, Type } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import { CompositeKey } from '@memberjunction/core';
import type { EngineDataChangeEvent } from '@memberjunction/core';
import { DashboardEngine, ResourceData } from '@memberjunction/core-entities';
import type { DashboardUserPermissions, MJDashboardCategoryEntity, MJDashboardEntity, MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { DashboardFavoritesService, HomeAppPinService, HomeDashboardTabsService, NavigationService, RecentAccessService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AddPanelDialogComponent, ConfirmDialogComponent, EditPartDialogComponent } from '@memberjunction/ng-dashboard-viewer';
import type {
  DashboardConfigChangedEvent,
  DashboardNavRequestEvent,
  DashboardPanel,
  PanelConfig,
  PanelInteractionEvent,
} from '@memberjunction/ng-dashboard-viewer';
import type { ShareDialogResult } from '@memberjunction/ng-dashboards/core-dashboards.module';
import { RenderComponentFixture, CreateFakeProvider, Click, Query, QueryAll, Text, TypeInto } from '@memberjunction/ng-test-utils';
import { DashboardResource } from './dashboard-resource.component';
import { DashboardAddToMenuComponent } from './dashboard-add-to-menu.component';

/**
 * DOM coverage for part editing in the dashboard tab (<mj-dashboard-resource>). The tab hosts the
 * real Add Part, Edit Part and confirm dialogs from @memberjunction/ng-dashboard-viewer. The viewer
 * itself (Golden Layout) is a double: it holds its parts in a Golden Layout tree, emits the same
 * PanelInteraction events the real viewer emits, and applies AddPanel / UpdatePanelConfig /
 * ConfirmRemovePanel to its parts. The share dialog (from @memberjunction/ng-dashboards) is a stub.
 * The saved-layout tests give the viewer double the real viewer's saved-layout behavior (see
 * showSavedLayout).
 */

/** Stands in for <mj-dashboard-share-dialog>, which lives in @memberjunction/ng-dashboards. */
@Component({ standalone: true, selector: 'mj-dashboard-share-dialog', template: '' })
class ShareDialogStub {
  @Input() Visible = false;
  @Input() Dashboard: MJDashboardEntity | null = null;
  @Output() Result = new EventEmitter<ShareDialogResult>();
}

const USER_ID = 'user-1';

/** The part of BaseEntity's LatestResult the tab reads after a failed save. */
interface SaveResultDouble {
  Success: boolean;
  CompleteMessage: string;
}

/** The screenshot (Thumbnail) the dashboard double was saved with. */
const SAVED_SCREENSHOT = 'data:image/jpeg;base64,c2F2ZWQ=';

/** A new screenshot of the dashboard's layout. */
const NEW_SCREENSHOT = 'data:image/jpeg;base64,bmV3';

/**
 * A dashboard entity double. Its saved values are the name, description, layout (UIConfigDetails,
 * with the Revenue part) and screenshot (Thumbnail) it starts with, and Revert() puts them all back,
 * like BaseEntity.Revert() puts back every field. LatestResult is set by a test that fails a save.
 */
function createDashboard() {
  const saved = { Name: 'Revenue Board', Description: '', UIConfigDetails: savedConfig([revenuePanel()]), Thumbnail: SAVED_SCREENSHOT as string | null };
  const dashboard = {
    ID: 'dash-1',
    PrimaryKey: CompositeKey.FromID('dash-1'),
    Type: 'Config',
    CategoryID: null,
    Name: saved.Name,
    Description: saved.Description,
    UIConfigDetails: saved.UIConfigDetails,
    Thumbnail: saved.Thumbnail,
    LatestResult: null as SaveResultDouble | null,
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

const QUERY_TYPE = {
  ID: 'pt-query',
  Name: 'Query',
  Icon: 'fa-solid fa-database',
  Description: 'Results of a stored query',
  ConfigDialogClass: null,
} as unknown as MJDashboardPartTypeEntity;
const VIEW_TYPE = {
  ID: 'pt-view',
  Name: 'View',
  Icon: 'fa-solid fa-table',
  Description: 'Records of an entity view',
  ConfigDialogClass: null,
} as unknown as MJDashboardPartTypeEntity;

function revenuePanel(): DashboardPanel {
  return { id: 'panel-1', title: 'Revenue', icon: 'fa-solid fa-table', partTypeId: 'pt-view', config: { type: 'View', entityName: 'MJ: Applications' } };
}

/** The event the viewer emits when a part's Configure button is clicked. */
function configureRequest(panelId: string): PanelInteractionEvent {
  return { panelId, interactionType: 'custom', payload: { action: 'configure-part-requested' } };
}

/** The event the viewer emits when a part's Remove button is clicked. */
function removeRequest(panelId: string, panelTitle: string): PanelInteractionEvent {
  return { panelId, interactionType: 'custom', payload: { action: 'remove-part-requested', panelTitle } };
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
 * A viewer double with the members the tab uses. Its parts live in `panels`; the part-editing
 * methods change them the way the real viewer changes its layout.
 */
function createViewer(initialPanels: DashboardPanel[]) {
  const panels = [...initialPanels];
  const partTypes = [QUERY_TYPE, VIEW_TYPE];
  const viewer = {
    dashboard: null as MJDashboardEntity | null,
    IsEditing: false,
    showToolbar: true,
    ShowBreadcrumb: true,
    ShowOpenInTabButton: false,
    showEditButton: true,
    Categories: [] as MJDashboardCategoryEntity[],
    navigationRequested: new EventEmitter<DashboardNavRequestEvent>(),
    openInTab: new EventEmitter<{ dashboardId: string; dashboardName: string }>(),
    dashboardSaved: new EventEmitter<MJDashboardEntity>(),
    error: new EventEmitter<{ message: string; error?: Error }>(),
    configChanged: new EventEmitter<DashboardConfigChangedEvent>(),
    PanelInteraction: new EventEmitter<PanelInteractionEvent>(),
    waitForLayoutReady: async (): Promise<void> => undefined,
    getConfig: () => ({ layout: layoutOf(panels) }),
    GetPartTypes: (): MJDashboardPartTypeEntity[] => partTypes,
    GetPanel: (panelId: string): DashboardPanel | null => panels.find((p) => p.id === panelId) ?? null,
    GetPartTypeForPanel: (panelId: string): MJDashboardPartTypeEntity | null => {
      const panel = panels.find((p) => p.id === panelId);
      return partTypes.find((t) => t.ID === panel?.partTypeId) ?? null;
    },
    AddPanel: vi.fn(async (partTypeId: string, config: PanelConfig, title: string, icon?: string): Promise<void> => {
      panels.push({ id: `panel-${panels.length + 1}`, partTypeId, config, title, icon });
    }),
    UpdatePanelConfig: vi.fn((panelId: string, config: PanelConfig, title?: string, icon?: string): void => {
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
    save: vi.fn(async (): Promise<boolean> => true),
    HasNewerSavedLayout: vi.fn((_dashboard?: MJDashboardEntity | null): boolean => false),
    ReloadFromSaved: vi.fn(async (_dashboard?: MJDashboardEntity | null): Promise<void> => undefined),
    UseSavedCopy: vi.fn((_dashboard: MJDashboardEntity): boolean => false),
    /** The viewer's empty-state "Add Your First Part" action: it asks its host for the Add Part dialog. */
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

/** The context the tab last reported to the agent. */
function lastAgentContext(navigation: { SetAgentContext: ReturnType<typeof vi.fn> }): Record<string, unknown> | undefined {
  return navigation.SetAgentContext.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;
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
    GetAccessibleDashboards: () => dashboards,
    GetDashboardPermissions: vi.fn((dashboardId: string) => permissionsFor(dashboardId, canEdit)),
    DataChange$: new Subject<EngineDataChangeEvent>(),
  };
}

/**
 * A NavigationService double with the members the tab uses. `DashboardEditModeRequested$` stands for
 * OpenDashboard asking a tab that was already open to enter edit mode.
 */
function createNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    OpenDashboard: vi.fn(),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    TakeDashboardEditModeRequest: vi.fn((_tabId: string, _dashboardId: string, _applicationId: string): boolean => false),
    DashboardEditModeRequested$: new Subject<string>(),
  };
}

/** Takes a screenshot of an element, as HomeAppPinService.CaptureThumbnail does. */
type CaptureScreenshot = (element: HTMLElement, timeoutMs?: number) => Promise<string | undefined>;

/**
 * The testing module the tab renders in: the real part dialogs, and doubles for the services it
 * injects. `capture` stands for HomeAppPinService.CaptureThumbnail; by default it takes no screenshot.
 */
function tabModule(
  navigation: object,
  capture: CaptureScreenshot = async () => undefined,
): { imports: Array<Type<unknown>>; declarations: Array<Type<unknown>>; providers: Provider[] } {
  return {
    imports: [FormsModule, ShareDialogStub],
    declarations: [DashboardResource, DashboardAddToMenuComponent, AddPanelDialogComponent, EditPartDialogComponent, ConfirmDialogComponent],
    providers: [
      { provide: NavigationService, useValue: navigation },
      { provide: RecentAccessService, useValue: { LogAccess: vi.fn(async () => undefined) } },
      { provide: DashboardFavoritesService, useValue: { IsFavorite: () => false, Toggle: vi.fn(async () => true) } },
      { provide: HomeDashboardTabsService, useValue: { HasTab: () => false } },
      { provide: HomeAppPinService, useValue: { IsPinned: () => false, LoadPins: vi.fn(async () => undefined), CaptureThumbnail: capture } },
    ],
  };
}

/**
 * Renders the tab and opens the Config dashboard in it through the tab's real Config load path.
 * `canEdit` is the user's edit permission on the dashboard. `capture` stands for
 * HomeAppPinService.CaptureThumbnail.
 */
async function renderTab(options: { canEdit?: boolean; panels?: DashboardPanel[]; capture?: CaptureScreenshot } = {}) {
  const canEdit = options.canEdit ?? true;
  const dashboard = createDashboard();
  const engine = createEngine([dashboard], canEdit);
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  const notify = vi.fn();
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);

  const navigation = createNavigation();
  const { viewer, panels } = createViewer(options.panels ?? [revenuePanel()]);
  const viewerRef = { instance: viewer, hostView: { rootNodes: [document.createElement('div')] }, destroy: vi.fn() };

  const fixture = RenderComponentFixture(DashboardResource, {
    ...tabModule(navigation, options.capture),
    inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }) },
    setup: (tab) => {
      // The tab creates the viewer in its own view container. Hand it the viewer double instead.
      (tab as unknown as { viewContainer: { createComponent: () => typeof viewerRef } }).viewContainer = { createComponent: () => viewerRef };
    },
  });
  await (fixture.componentInstance as unknown as { loadConfigBasedDashboard(d: MJDashboardEntity): Promise<void> }).loadConfigBasedDashboard(
    dashboard as unknown as MJDashboardEntity,
  );
  fixture.detectChanges();
  return { fixture, viewer, panels, navigation, notify, dashboard };
}

/** Clicks the tab's Edit button and renders the edit toolbar. */
function enterEditMode(fixture: ComponentFixture<DashboardResource>): void {
  Click(fixture, 'button[title="Edit Dashboard"]');
  fixture.detectChanges();
}

/**
 * Lets the dialogs' deferred work (their setTimeout(0) config-panel loads) run, renders, and waits
 * for ngModel, which writes a changed value into its input in a microtask after rendering.
 */
async function settle(fixture: ComponentFixture<DashboardResource>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function editPartDialog(fixture: ComponentFixture<DashboardResource>): EditPartDialogComponent {
  return fixture.debugElement.query(By.directive(EditPartDialogComponent)).injector.get(EditPartDialogComponent);
}

function emitFromViewer(viewer: ViewerDouble, fixture: ComponentFixture<DashboardResource>, event: PanelInteractionEvent): void {
  viewer.PanelInteraction.emit(event);
  fixture.detectChanges();
}

describe('DashboardResource part editing (DOM)', () => {
  it('opens the Add Part dialog from the edit toolbar and adds the chosen part to the viewer', async () => {
    const { fixture, viewer, navigation } = await renderTab();
    enterEditMode(fixture);

    Click(fixture, '.btn-add-part');
    fixture.detectChanges();

    expect(Query(fixture, 'mj-add-panel-dialog .add-part-dialog-overlay')).not.toBeNull();
    expect(QueryAll(fixture, 'mj-add-panel-dialog .part-type-card .card-title').map((e) => e.textContent?.trim())).toEqual(['Query', 'View']);

    Click(fixture, 'mj-add-panel-dialog .part-type-card:nth-child(2)');
    await settle(fixture);
    Click(fixture, 'mj-add-panel-dialog .dialog-footer .btn-primary');
    await settle(fixture);

    // A part type without a config panel adds with its name as the title and { type: <name> } as the config.
    expect(viewer.AddPanel).toHaveBeenCalledExactlyOnceWith('pt-view', { type: 'View' }, 'View', 'fa-solid fa-table');
    expect(Query(fixture, 'mj-add-panel-dialog .add-part-dialog-overlay')).toBeNull();
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardPanelCount: 2 });
  });

  it('opens the Add Part dialog when the viewer asks for it from its empty state', async () => {
    const { fixture, viewer } = await renderTab({ panels: [] });
    enterEditMode(fixture);

    viewer.OnAddPanelClick();
    fixture.detectChanges();

    expect(Query(fixture, 'mj-add-panel-dialog .add-part-dialog-overlay')).not.toBeNull();
  });

  it('tells the user when the viewer cannot add the part', async () => {
    const { fixture, viewer, notify } = await renderTab();
    viewer.AddPanel.mockRejectedValueOnce(new Error('layout not ready'));
    enterEditMode(fixture);

    Click(fixture, '.btn-add-part');
    fixture.detectChanges();
    Click(fixture, 'mj-add-panel-dialog .part-type-card:nth-child(1)');
    await settle(fixture);
    Click(fixture, 'mj-add-panel-dialog .dialog-footer .btn-primary');
    await settle(fixture);

    expect(notify).toHaveBeenCalledExactlyOnceWith('Could not add the part', 'error', 3000);
    expect(Query(fixture, 'mj-add-panel-dialog .add-part-dialog-overlay')).toBeNull();
  });

  it("opens the part's settings when the viewer asks to configure it, and applies the saved settings", async () => {
    const { fixture, viewer, navigation } = await renderTab();
    enterEditMode(fixture);

    emitFromViewer(viewer, fixture, configureRequest('panel-1'));

    expect(Query(fixture, 'mj-edit-part-dialog .edit-part-dialog')).not.toBeNull();
    expect(Text(fixture, 'mj-edit-part-dialog .dialog-header h3')).toBe('Configure View');
    const dialog = editPartDialog(fixture);
    expect(dialog.Panel?.id).toBe('panel-1');
    expect(dialog.Config).toEqual({ type: 'View', entityName: 'MJ: Applications' });

    await settle(fixture);
    // The dialog's config panel reports the edited settings; the user then clicks Save Changes.
    dialog.OnConfigChanged({ config: { type: 'View', entityName: 'MJ: Users' }, title: 'Users', icon: 'fa-solid fa-users', isValid: true, errors: [] });
    Click(fixture, 'mj-edit-part-dialog .dialog-footer .btn-primary');
    await settle(fixture);

    expect(viewer.UpdatePanelConfig).toHaveBeenCalledExactlyOnceWith('panel-1', { type: 'View', entityName: 'MJ: Users' }, 'Users', 'fa-solid fa-users');
    expect(Query(fixture, 'mj-edit-part-dialog .edit-part-dialog')).toBeNull();
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardPanels: [{ Title: 'Users', PartTypeName: 'View', Icon: 'fa-solid fa-users' }] });
  });

  it('does not open settings for a part the viewer cannot find', async () => {
    const { fixture, viewer } = await renderTab();
    enterEditMode(fixture);

    emitFromViewer(viewer, fixture, configureRequest('panel-missing'));

    expect(Query(fixture, 'mj-edit-part-dialog .edit-part-dialog')).toBeNull();
  });

  it('asks before removing a part and removes it when the user confirms', async () => {
    const { fixture, viewer, navigation } = await renderTab();
    enterEditMode(fixture);

    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue'));

    expect(Query(fixture, 'mj-confirm-dialog .confirm-dialog')).not.toBeNull();
    expect(Text(fixture, 'mj-confirm-dialog .confirm-title')).toBe('Remove Part');
    expect(Text(fixture, 'mj-confirm-dialog .confirm-message')).toBe("Are you sure you want to remove 'Revenue' from this dashboard?");
    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();

    Click(fixture, 'mj-confirm-dialog .dialog-footer .btn-danger');
    await settle(fixture);

    expect(viewer.ConfirmRemovePanel).toHaveBeenCalledExactlyOnceWith('panel-1');
    expect(Query(fixture, 'mj-confirm-dialog .confirm-dialog')).toBeNull();
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardPanelCount: 0 });
  });

  it('keeps the part when the user cancels the removal', async () => {
    const { fixture, viewer } = await renderTab();
    enterEditMode(fixture);

    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue'));
    Click(fixture, 'mj-confirm-dialog .dialog-footer .btn-secondary');
    await settle(fixture);

    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
    expect(Query(fixture, 'mj-confirm-dialog .confirm-dialog')).toBeNull();
  });

  it('ignores part requests outside edit mode, also after the user starts editing', async () => {
    const { fixture, viewer } = await renderTab();

    viewer.OnAddPanelClick();
    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue'));

    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();
    expect(Query(fixture, '.edit-part-dialog')).toBeNull();
    expect(Query(fixture, '.confirm-dialog')).toBeNull();

    enterEditMode(fixture);

    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();
    expect(Query(fixture, '.edit-part-dialog')).toBeNull();
    expect(Query(fixture, '.confirm-dialog')).toBeNull();
  });

  it('ignores the Add Part command outside edit mode, also after the user starts editing', async () => {
    const { fixture } = await renderTab();

    fixture.componentInstance.OpenAddPartDialog();
    fixture.detectChanges();

    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();

    enterEditMode(fixture);

    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();
  });

  it('closes an open part dialog when the user saves, and does not show it again in the next edit', async () => {
    const { fixture, viewer } = await renderTab();
    enterEditMode(fixture);
    Click(fixture, '.btn-add-part');
    fixture.detectChanges();

    // The overlay does not hold keyboard focus, so Save behind it stays reachable.
    Click(fixture, '.header-right .btn-primary');
    await settle(fixture);

    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(Query(fixture, '.btn-add-part')).toBeNull();
    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();

    enterEditMode(fixture);

    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();
  });

  it('closes an open part dialog when the user cancels editing, and does not show it again in the next edit', async () => {
    const { fixture, viewer } = await renderTab();
    enterEditMode(fixture);
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue'));

    Click(fixture, '.header-right .btn-cancel');
    fixture.detectChanges();

    expect(Query(fixture, '.confirm-dialog')).toBeNull();

    enterEditMode(fixture);

    expect(Query(fixture, '.confirm-dialog')).toBeNull();
    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
  });

  it.each(['Save', 'Cancel'])('shows the part type list again after a type was picked and the user left edit mode with %s', async (exit) => {
    const { fixture } = await renderTab();
    enterEditMode(fixture);
    Click(fixture, '.btn-add-part');
    fixture.detectChanges();
    Click(fixture, 'mj-add-panel-dialog .part-type-card:nth-child(2)');
    await settle(fixture);
    expect(Query(fixture, 'mj-add-panel-dialog .part-type-card')).toBeNull();

    // The overlay does not hold keyboard focus, so Save and Cancel behind it stay reachable.
    Click(fixture, exit === 'Save' ? '.header-right .btn-primary' : '.header-right .btn-cancel');
    await settle(fixture);
    enterEditMode(fixture);
    Click(fixture, '.btn-add-part');
    fixture.detectChanges();

    expect(QueryAll(fixture, 'mj-add-panel-dialog .part-type-card .card-title').map((e) => e.textContent?.trim())).toEqual(['Query', 'View']);
  });

  it('gives a user who cannot edit the dashboard no way into edit mode or part editing', async () => {
    const { fixture, viewer } = await renderTab({ canEdit: false });

    expect(Query(fixture, 'button[title="Edit Dashboard"]')).toBeNull();

    fixture.componentInstance.ToggleEditMode();
    fixture.detectChanges();
    viewer.OnAddPanelClick();
    emitFromViewer(viewer, fixture, configureRequest('panel-1'));

    expect(Query(fixture, '.btn-add-part')).toBeNull();
    expect(viewer.IsEditing).toBe(false);
    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();
    expect(Query(fixture, '.edit-part-dialog')).toBeNull();
  });
});

/** The value the name field shows. */
function nameField(fixture: ComponentFixture<DashboardResource>): string {
  return (Query(fixture, '.dashboard-name-input') as HTMLInputElement).value;
}

/** Enters edit mode and waits until the name field shows the dashboard's name (ngModel writes it asynchronously). */
async function startEditing(fixture: ComponentFixture<DashboardResource>): Promise<void> {
  enterEditMode(fixture);
  await settle(fixture);
}

describe('DashboardResource save and name (DOM)', () => {
  type ViewerForFailure = ReturnType<typeof createViewer>['viewer'];
  type DashboardForFailure = ReturnType<typeof createDashboard>;

  it.each([
    {
      failure: 'the dashboard reports a failed result',
      fail: (viewer: ViewerForFailure, dashboard: DashboardForFailure) =>
        viewer.save.mockImplementationOnce(async () => {
          dashboard.LatestResult = { Success: false, CompleteMessage: 'Name cannot be longer than 510 characters' };
          return false;
        }),
      message: 'Could not save the dashboard: Name cannot be longer than 510 characters',
    },
    {
      failure: 'the save returns false without a failed result',
      fail: (viewer: ViewerForFailure) => viewer.save.mockResolvedValueOnce(false),
      message: 'Could not save the dashboard',
    },
    {
      failure: 'the save throws',
      fail: (viewer: ViewerForFailure) => viewer.save.mockRejectedValueOnce(new Error('network down')),
      message: 'Could not save the dashboard: network down',
    },
  ])('stays in edit mode with the changes and tells the user why when $failure', async ({ fail, message }) => {
    const { fixture, viewer, notify, dashboard } = await renderTab();
    const displayNameChanged = vi.fn();
    fixture.componentInstance.DisplayNameChangedEvent = displayNameChanged;
    fail(viewer, dashboard);
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-name-input', 'Renamed Board');
    await settle(fixture);

    Click(fixture, '.header-right .btn-primary');
    await settle(fixture);

    expect(notify).toHaveBeenCalledExactlyOnceWith(message, 'error', 5000);
    expect(Query(fixture, '.btn-add-part')).not.toBeNull();
    expect(nameField(fixture)).toBe('Renamed Board');
    // Other pages read this cached dashboard, so it goes back to the saved name.
    expect(dashboard.Name).toBe('Revenue Board');
    expect(displayNameChanged).not.toHaveBeenCalled();

    // The next Save saves the changes the user kept.
    Click(fixture, '.header-right .btn-primary');
    await settle(fixture);

    expect(Query(fixture, '.btn-add-part')).toBeNull();
    expect(dashboard.Name).toBe('Renamed Board');
  });

  it('puts the previous name back when the user empties the name and leaves the field', async () => {
    const { fixture } = await renderTab();
    await startEditing(fixture);

    TypeInto(fixture, '.dashboard-name-input', '   ');
    // The browser renders after each event, so the page sees the emptied name before the blur.
    await settle(fixture);
    Query(fixture, '.dashboard-name-input')?.dispatchEvent(new Event('blur'));
    await settle(fixture);

    expect(nameField(fixture)).toBe('Revenue Board');
  });

  it('saves the previous name when the name is empty at Save', async () => {
    const { fixture, viewer, dashboard } = await renderTab();
    await startEditing(fixture);

    TypeInto(fixture, '.dashboard-name-input', '   ');
    Click(fixture, '.header-right .btn-primary');
    await settle(fixture);

    expect(viewer.save).toHaveBeenCalledTimes(1);
    expect(dashboard.Name).toBe('Revenue Board');
  });
});

describe('DashboardResource screenshot on Save (DOM)', () => {
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
  async function editAndSave(fixture: ComponentFixture<DashboardResource>): Promise<void> {
    await startEditing(fixture);
    Click(fixture, '.header-right .btn-primary');
    await settle(fixture);
  }

  it('puts a screenshot of the dashboard on the dashboard before its one Save', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, viewer, dashboard } = await renderTab({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls.at(0)?.[0]).toBe(Query(fixture, '.dashboard-resource-container'));
    expect(atSave).toEqual([NEW_SCREENSHOT]);
    expect(dashboard.Thumbnail).toBe(NEW_SCREENSHOT);
  });

  it('waits at most about 1.5 seconds for the screenshot, not the 4-second pin default', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture } = await renderTab({ capture });

    await editAndSave(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    const timeoutMs = capture.mock.calls.at(0)?.[1];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(2000);
  });

  it('keeps the saved screenshot when no screenshot can be taken', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => undefined);
    const { fixture, viewer, dashboard } = await renderTab({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(atSave).toEqual([SAVED_SCREENSHOT]);
  });

  it('saves without a new screenshot when taking one fails', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => {
      throw new Error('canvas tainted');
    });
    const { fixture, viewer, dashboard, notify } = await renderTab({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(atSave).toEqual([SAVED_SCREENSHOT]);
    expect(notify).not.toHaveBeenCalled();
    expect(Query(fixture, '.btn-add-part')).toBeNull();
  });

  it('clears the screenshot of a dashboard with no panels, without taking one, so its cards show the icon', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, viewer, dashboard } = await renderTab({ capture, panels: [] });
    const atSave = recordThumbnailAtSave(viewer, dashboard);

    await editAndSave(fixture);

    expect(capture).not.toHaveBeenCalled();
    expect(atSave).toEqual([null]);
    expect(dashboard.Thumbnail).toBeNull();
  });

  it('puts the saved screenshot back when the Save fails', async () => {
    const capture = vi.fn<CaptureScreenshot>(async () => NEW_SCREENSHOT);
    const { fixture, viewer, dashboard } = await renderTab({ capture });
    const atSave = recordThumbnailAtSave(viewer, dashboard, false);

    await editAndSave(fixture);

    expect(atSave).toEqual([NEW_SCREENSHOT]);
    // Other pages read this cached dashboard, so it goes back to its saved screenshot.
    expect(dashboard.Revert).toHaveBeenCalledTimes(1);
    expect(dashboard.Thumbnail).toBe(SAVED_SCREENSHOT);
  });
});

describe('DashboardResource one save at a time (DOM)', () => {
  const SAVE = '.header-right .btn-primary';
  const CANCEL = '.header-right .btn-cancel';
  const ADD_PART = '.btn-add-part';

  /** A screenshot that stays pending until the test calls finish(), which completes every pending one. */
  function pendingCapture() {
    const pending: Array<(value: string | undefined) => void> = [];
    const capture = vi.fn<CaptureScreenshot>(() => new Promise<string | undefined>((resolve) => pending.push(resolve)));
    return { capture, finish: (value: string | undefined = NEW_SCREENSHOT) => pending.splice(0).forEach((resolve) => resolve(value)) };
  }

  /** Whether Save, Cancel and Add Part are disabled, in that order. */
  function disabledButtons(fixture: ComponentFixture<DashboardResource>): boolean[] {
    return [SAVE, CANCEL, ADD_PART].map((selector) => (Query(fixture, selector) as HTMLButtonElement).disabled);
  }

  /** Renders the tab in edit mode and clicks Save; the screenshot stays pending. */
  async function startSaving() {
    const { capture, finish } = pendingCapture();
    const tab = await renderTab({ capture });
    await startEditing(tab.fixture);
    Click(tab.fixture, SAVE);
    await settle(tab.fixture);
    return { ...tab, capture, finish };
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

  it('disables Save, Cancel and Add Part and shows Saving... while the save runs, and enables them for the next edit', async () => {
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

  it('enables Save, Cancel and Add Part again after a failed save', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, viewer } = await renderTab({ capture });
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

  it("ignores Add Part and the viewer's part requests while the save runs", async () => {
    const { fixture, viewer } = await startSaving();

    fixture.componentInstance.OpenAddPartDialog();
    viewer.OnAddPanelClick();
    emitFromViewer(viewer, fixture, configureRequest('panel-1'));
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue'));
    await settle(fixture);

    expect(Query(fixture, '.add-part-dialog-overlay')).toBeNull();
    expect(Query(fixture, 'mj-edit-part-dialog .edit-part-dialog')).toBeNull();
    expect(Query(fixture, 'mj-confirm-dialog .confirm-dialog')).toBeNull();
  });

  it('does not apply a part change from a dialog that was open when the save started', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, viewer } = await renderTab({ capture });
    await startEditing(fixture);
    emitFromViewer(viewer, fixture, removeRequest('panel-1', 'Revenue'));
    // The overlay does not hold keyboard focus, so Save behind it stays reachable.
    Click(fixture, SAVE);
    await settle(fixture);

    Click(fixture, 'mj-confirm-dialog .dialog-footer .btn-danger');
    await settle(fixture);
    finish();
    await settle(fixture);

    expect(viewer.ConfirmRemovePanel).not.toHaveBeenCalled();
    expect(viewer.save).toHaveBeenCalledTimes(1);
  });

  it('writes the name and description after the screenshot, so a name typed while it is taken is saved', async () => {
    const { capture, finish } = pendingCapture();
    const { fixture, viewer, dashboard } = await renderTab({ capture });
    const namesAtSave: string[] = [];
    viewer.save.mockImplementation(async () => {
      namesAtSave.push(dashboard.Name);
      return true;
    });
    await startEditing(fixture);
    TypeInto(fixture, '.dashboard-name-input', 'Renamed Board');
    await settle(fixture);
    Click(fixture, SAVE);
    await settle(fixture);

    // Nothing is written to the dashboard while the screenshot is taken.
    expect(dashboard.Name).toBe('Revenue Board');

    TypeInto(fixture, '.dashboard-name-input', 'Renamed Again');
    await settle(fixture);
    finish();
    await settle(fixture);

    expect(namesAtSave).toEqual(['Renamed Again']);
  });
});

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

/**
 * Renders the tab and gives it its resource data through the real Data setter, which loads the
 * dashboard, as the tab container does. `editRequest` stands for a tab opened with
 * `openInEditMode` for Revenue Board: like NavigationService, the double's
 * TakeDashboardEditModeRequest returns true for the first call for that tab, dashboard and
 * application only. `holdLayout` keeps the viewer's layout from getting ready
 * until the test calls `releaseLayout`; until then the load has not finished and the tab is not
 * rendered again. The engine holds Revenue Board (dash-1) and Quota (dash-2).
 */
async function renderOpenedTab(options: { canEdit?: boolean; editRequest?: boolean; holdLayout?: boolean } = {}) {
  const canEdit = options.canEdit ?? true;
  const revenue = createDashboard();
  const quota = {
    ID: 'dash-2',
    PrimaryKey: CompositeKey.FromID('dash-2'),
    Type: 'Config',
    CategoryID: null,
    Name: 'Quota',
    Description: '',
    UIConfigDetails: savedConfig([]),
  };
  const engine = createEngine([revenue, quota], canEdit);
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);

  let editRequested = options.editRequest === true;
  const navigation = createNavigation();
  navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string, applicationId: string): boolean => {
    if (tabId !== TAB_ID || dashboardId !== 'dash-1' || applicationId !== APP_ID || !editRequested) return false;
    editRequested = false;
    return true;
  });
  const viewers: ViewerDouble[] = [];
  let releaseLayout = (): void => undefined;

  const fixture = RenderComponentFixture(DashboardResource, {
    ...tabModule(navigation),
    inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }) },
    setup: (tab) => {
      // The tab creates each viewer in its own view container. Hand it a new viewer double each time.
      (tab as unknown as { viewContainer: { createComponent: () => unknown } }).viewContainer = {
        createComponent: () => {
          const { viewer } = createViewer([revenuePanel()]);
          if (options.holdLayout) {
            viewer.waitForLayoutReady = () => new Promise<void>((resolve) => (releaseLayout = resolve));
          }
          viewers.push(viewer);
          return { instance: viewer, hostView: { rootNodes: [document.createElement('div')] }, destroy: vi.fn() };
        },
      };
      tab.Data = dashboardTabData('dash-1');
    },
  });
  if (options.holdLayout) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  } else {
    await settle(fixture);
  }
  return { fixture, navigation, viewers, releaseLayout: () => releaseLayout() };
}

/** True when the tab shows its edit toolbar. */
const showsEditToolbar = (fixture: ComponentFixture<DashboardResource>): boolean => Query(fixture, '.viewer-header.editing') !== null;

describe('DashboardResource edit mode on first load (DOM)', () => {
  it('opens in edit mode when the tab was opened with openInEditMode and the user can edit the dashboard', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab({ editRequest: true });

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(true);
    expect(Query(fixture, '.viewer-toolbar')).toBeNull();
    expect(Query(fixture, '.btn-add-part')).not.toBeNull();
    expect(nameField(fixture)).toBe('Revenue Board');
    expect(viewers[0].IsEditing).toBe(true);
    // One report to the agent for the load, already in edit mode.
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(1);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardId: 'dash-1', OpenedDashboardIsEditing: true });
  });

  it('opens for viewing when the tab was opened without openInEditMode', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(false);
    expect(Query(fixture, '.viewer-toolbar')).not.toBeNull();
    expect(viewers[0].IsEditing).toBe(false);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: false });
  });

  it('opens for viewing, and uses up the request, when the user cannot edit the dashboard', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab({ editRequest: true, canEdit: false });

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(navigation.TakeDashboardEditModeRequest.mock.results[0].value).toBe(true);
    expect(showsEditToolbar(fixture)).toBe(false);
    expect(Query(fixture, 'button[title="Edit Dashboard"]')).toBeNull();
    expect(viewers[0].IsEditing).toBe(false);
  });

  it('applies the request to the first load only: after Cancel, the next dashboard in the tab opens for viewing', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab({ editRequest: true });
    expect(showsEditToolbar(fixture)).toBe(true);

    Click(fixture, '.header-right .btn-cancel');
    fixture.detectChanges();
    expect(showsEditToolbar(fixture)).toBe(false);

    // The tab now shows another dashboard (the tab container sets new data for a different record).
    fixture.componentInstance.Data = dashboardTabData('dash-2');
    await settle(fixture);

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(2);
    expect(Text(fixture, '.dashboard-title')).toBe('Quota');
    expect(showsEditToolbar(fixture)).toBe(false);
    expect(viewers).toHaveLength(2);
    expect(viewers[1].IsEditing).toBe(false);
  });
});

/**
 * Gives a viewer double the real viewer's saved-layout behavior: it shows the parts of its
 * dashboard's saved configuration when it gets the dashboard and when it reloads, its save writes
 * its parts back, HasNewerSavedLayout compares a dashboard's saved configuration with the one it
 * last showed or saved, a reload reports the rebuilt layout through configChanged afterwards, like
 * Golden Layout does, and UseSavedCopy takes another copy of the dashboard with the same saved
 * layout without a rebuild. `calls` records reloads, taken copies and edit-mode changes in order.
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
    dashboard: {
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
 * Renders a dashboard tab that loads `dashboard` through the tab's real Config load path, with a
 * viewer double that shows the dashboard's saved layout. Only the first tab of a test passes
 * `module`; later tabs render in the same testing module.
 */
async function renderSavedLayoutTab(dashboard: DashboardDouble, module?: ReturnType<typeof tabModule>) {
  const { viewer, panels } = createViewer([]);
  const { calls } = showSavedLayout(viewer, panels);
  const viewerRef = { instance: viewer, hostView: { rootNodes: [document.createElement('div')] }, destroy: vi.fn() };
  const fixture = RenderComponentFixture(DashboardResource, {
    ...(module ?? {}),
    inputs: { Provider: CreateFakeProvider({ currentUser: { ID: USER_ID } }) },
    setup: (tab) => {
      (tab as unknown as { viewContainer: { createComponent: () => typeof viewerRef } }).viewContainer = { createComponent: () => viewerRef };
    },
  });
  await (fixture.componentInstance as unknown as { loadConfigBasedDashboard(d: MJDashboardEntity): Promise<void> }).loadConfigBasedDashboard(
    dashboard as unknown as MJDashboardEntity,
  );
  fixture.detectChanges();
  return { fixture, viewer, panels, calls };
}

/**
 * Two tabs of Revenue Board, like its Home tab and its Dashboards app tab. They share the
 * DashboardEngine double and its cached dashboard entity; each tab has its own viewer.
 */
async function renderTwoTabs() {
  const dashboard = createDashboard();
  const engine = createEngine([dashboard], true);
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: vi.fn() } as unknown as MJNotificationService);
  const navigation = createNavigation();
  const home = await renderSavedLayoutTab(dashboard, tabModule(navigation));
  const dashboards = await renderSavedLayoutTab(dashboard);
  return { dashboard, engine, navigation, home, dashboards };
}

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

/** Enters edit mode in the tab, adds a part through its viewer, and saves. */
async function addPartAndSave(tab: Awaited<ReturnType<typeof renderSavedLayoutTab>>): Promise<void> {
  enterEditMode(tab.fixture);
  await tab.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
  Click(tab.fixture, '.header-right .btn-primary');
  await settle(tab.fixture);
}

const partIds = (panels: DashboardPanel[]): string[] => panels.map((panel) => panel.id);

describe('DashboardResource and the saved layout (DOM)', () => {
  it("keeps the other tab's saved part when a tab that loaded earlier enters edit mode and saves", async () => {
    const { dashboard, home, dashboards } = await renderTwoTabs();

    await addPartAndSave(dashboards);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
    // No change event has reached the Home tab: it still shows the layout it loaded.
    expect(partIds(home.panels)).toEqual(['panel-1']);

    enterEditMode(home.fixture);

    // The Home tab reloads the saved layout before its viewer enters edit mode.
    expect(home.calls).toEqual(['reload', 'editing:true']);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);

    Click(home.fixture, '.header-right .btn-primary');
    await settle(home.fixture);

    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
  });

  it('edits the copy DashboardEngine now holds, without a rebuild, when the engine has another copy with the same layout', async () => {
    const { dashboard, engine, home } = await renderTwoTabs();
    // The engine reloaded its dashboards: it holds a new copy, renamed elsewhere.
    const copy = createDashboard();
    copy.Name = 'Revenue Board 2026';
    engine.Dashboards.splice(0, 1, copy);

    enterEditMode(home.fixture);
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(home.calls).toEqual(['use-copy', 'editing:true']);
    expect(home.viewer.dashboard).toBe(copy);
    expect(nameField(home.fixture)).toBe('Revenue Board 2026');

    await home.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    Click(home.fixture, '.header-right .btn-primary');
    await settle(home.fixture);

    expect(savedPanelIds(copy.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
  });

  it('rebuilds from the copy DashboardEngine now holds when that copy has another layout, before editing it', async () => {
    const { engine, home } = await renderTwoTabs();
    const copy = createDashboard();
    copy.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.Dashboards.splice(0, 1, copy);

    enterEditMode(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(copy);
    expect(home.calls).toEqual(['reload', 'editing:true']);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
  });

  it('enters edit mode without a reload when the saved layout has not changed', async () => {
    const { home } = await renderTwoTabs();

    enterEditMode(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(home.calls).toEqual(['editing:true']);
  });

  it('reloads a tab that is not editing when the dashboard is saved in another tab, and reports nothing to the agent', async () => {
    const { dashboard, engine, navigation, home, dashboards } = await renderTwoTabs();
    await addPartAndSave(dashboards);
    const reports = navigation.SetAgentContext.mock.calls.length;

    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(dashboard);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
    expect(home.calls).toEqual(['reload']);
    // The tab that saved already shows the saved layout.
    expect(dashboards.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    // Neither the change nor the rebuilt layout reports to the agent.
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports);
  });

  it('does not reload a tab that is editing: its user keeps the changes', async () => {
    const { dashboard, engine, home, dashboards } = await renderTwoTabs();
    enterEditMode(home.fixture);
    await home.viewer.AddPanel('pt-view', { type: 'View' }, 'View');

    await addPartAndSave(dashboards);
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
    expect(home.panels[1].partTypeId).toBe('pt-view');
  });

  it('reloads once, after the task, for a burst of changes, and shows the last saved layout', async () => {
    const { dashboard, engine, home } = await renderTwoTabs();

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
    const { dashboard, engine, navigation, home } = await renderTwoTabs();
    const reports = navigation.SetAgentContext.mock.calls.length;
    // A full reload of the dashboards (Share, New, a refresh): new copies with the same saved values.
    const copy = createDashboard();
    copy.Name = 'Revenue Board 2026';
    engine.Dashboards.splice(0, 1, copy);

    engine.DataChange$.next(dashboardsReloaded());
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(home.calls).toEqual(['use-copy']);
    expect(Text(home.fixture, '.dashboard-title')).toBe('Revenue Board 2026');
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reports);

    // A later save writes the copy the engine holds, not the old one.
    await addPartAndSave(home);

    expect(savedPanelIds(copy.UIConfigDetails)).toEqual(['panel-1', 'panel-2']);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
  });

  it('rebuilds when DashboardEngine reloads its dashboards and the saved layout changed', async () => {
    const { engine, home } = await renderTwoTabs();
    const copy = createDashboard();
    copy.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.Dashboards.splice(0, 1, copy);

    engine.DataChange$.next(dashboardsReloaded());
    await settle(home.fixture);

    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(copy);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
  });

  it("keeps the layout of a tab that saved a copy DashboardEngine no longer held, and takes the engine's new copy", async () => {
    const { dashboard, engine, dashboards, home } = await renderTwoTabs();
    enterEditMode(dashboards.fixture);
    // While the tab edits, the engine reloads its dashboards: both tabs now hold a copy it no longer has.
    engine.Dashboards.splice(0, 1, createDashboard());
    engine.DataChange$.next(dashboardsReloaded());
    await settle(dashboards.fixture);
    await dashboards.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    Click(dashboards.fixture, '.header-right .btn-primary');
    await settle(dashboards.fixture);
    // BaseEngine puts a copy of the saved entity in the array and reports the update.
    const saved = createDashboard();
    saved.UIConfigDetails = dashboard.UIConfigDetails;
    engine.Dashboards.splice(0, 1, saved);
    engine.DataChange$.next(dashboardChange(dashboard));
    await settle(dashboards.fixture);

    expect(dashboards.viewer.ReloadFromSaved).not.toHaveBeenCalled();
    expect(dashboards.viewer.dashboard).toBe(saved);
    // The other tab shows the new layout.
    expect(home.viewer.ReloadFromSaved).toHaveBeenCalledExactlyOnceWith(saved);
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);
  });

  it('ignores changes to other dashboards and to other dashboard entities', async () => {
    const { dashboard, engine, home } = await renderTwoTabs();
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

  it('stops following changes when the tab is closed', async () => {
    const { dashboard, engine, home } = await renderTwoTabs();
    home.fixture.destroy();

    dashboard.UIConfigDetails = savedConfig([revenuePanel(), quotaPanel('panel-2')]);
    engine.DataChange$.next(dashboardChange(dashboard));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(home.viewer.ReloadFromSaved).not.toHaveBeenCalled();
  });

  it('discards an unsaved part on Cancel and shows the saved layout again', async () => {
    const { dashboard, navigation, home } = await renderTwoTabs();
    enterEditMode(home.fixture);
    await home.viewer.AddPanel('pt-query', { type: 'Query' }, 'Quota', 'fa-solid fa-database');
    expect(partIds(home.panels)).toEqual(['panel-1', 'panel-2']);

    Click(home.fixture, '.header-right .btn-cancel');
    await settle(home.fixture);

    // The viewer reloads before it leaves edit mode, so it rebuilds the saved layout.
    expect(home.calls).toEqual(['editing:true', 'reload', 'editing:false']);
    expect(partIds(home.panels)).toEqual(['panel-1']);
    expect(savedPanelIds(dashboard.UIConfigDetails)).toEqual(['panel-1']);
    expect(showsEditToolbar(home.fixture)).toBe(false);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: false, OpenedDashboardPanelCount: 1 });
  });
});

describe('DashboardResource edit-mode requests for a tab that is already open (DOM)', () => {
  it('enters edit mode when OpenDashboard asks this open tab to', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-1');

    navigation.DashboardEditModeRequested$.next('tab-other');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(1);
    expect(showsEditToolbar(fixture)).toBe(false);

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith(TAB_ID, 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(true);
    expect(viewers[0].IsEditing).toBe(true);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: true });
  });

  it('leaves the request for the load when the tab has not finished loading', async () => {
    const { fixture, navigation, releaseLayout } = await renderOpenedTab({ editRequest: true, holdLayout: true });

    navigation.DashboardEditModeRequested$.next(TAB_ID);

    expect(navigation.TakeDashboardEditModeRequest).not.toHaveBeenCalled();

    releaseLayout();
    await settle(fixture);

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledExactlyOnceWith(TAB_ID, 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(true);
  });

  it('keeps the changes of a tab that is already editing when asked again', async () => {
    const { fixture, navigation } = await renderOpenedTab({ editRequest: true });
    TypeInto(fixture, '.dashboard-name-input', 'Renamed Board');
    await settle(fixture);
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-1');

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    await settle(fixture);

    expect(showsEditToolbar(fixture)).toBe(true);
    expect(nameField(fixture)).toBe('Renamed Board');
  });

  it('takes no request once the tab is closed', async () => {
    const { fixture, navigation } = await renderOpenedTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === TAB_ID && dashboardId === 'dash-1');

    fixture.destroy();
    navigation.DashboardEditModeRequested$.next(TAB_ID);

    // The only call is the first load's.
    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves a request to the dashboard its tab shows now (a temporary tab replaced in place)', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab();
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
    expect(showsEditToolbar(fixture)).toBe(false);
    expect(viewers[0].IsEditing).toBe(false);
  });

  it("leaves a request to its tab's application: this cached component of the dashboard, from another application, does not take it", async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab();
    // OpenTab replaced the tab in place with another application's tab of Revenue Board, which is
    // asked to enter edit mode. This component still has the tab ID.
    navigation.TakeDashboardEditModeRequest.mockImplementation(
      (tabId: string, dashboardId: string, applicationId: string) => tabId === TAB_ID && dashboardId === 'dash-1' && applicationId === 'app-home',
    );

    navigation.DashboardEditModeRequested$.next(TAB_ID);
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith(TAB_ID, 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(false);
    expect(viewers[0].IsEditing).toBe(false);
  });

  it('enters edit mode when the tab container reattaches the cached tab to a tab opened with openInEditMode', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab();
    navigation.TakeDashboardEditModeRequest.mockImplementation((tabId: string, dashboardId: string) => tabId === 'tab-2' && dashboardId === 'dash-1');

    fixture.componentInstance.RebindTabId('tab-2');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith('tab-2', 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(true);
    expect(viewers[0].IsEditing).toBe(true);
    expect(lastAgentContext(navigation)).toMatchObject({ OpenedDashboardIsEditing: true });
  });

  it('keeps a reattached tab for viewing when its new tab has no edit-mode request', async () => {
    const { fixture, navigation, viewers } = await renderOpenedTab();

    fixture.componentInstance.RebindTabId('tab-2');
    fixture.detectChanges();

    expect(navigation.TakeDashboardEditModeRequest).toHaveBeenLastCalledWith('tab-2', 'dash-1', APP_ID);
    expect(showsEditToolbar(fixture)).toBe(false);
    expect(viewers[0].IsEditing).toBe(false);
  });
});
