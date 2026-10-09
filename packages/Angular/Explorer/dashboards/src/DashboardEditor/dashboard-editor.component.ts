import {
    AfterViewInit, ChangeDetectorRef, Component, ComponentRef, ElementRef, EventEmitter, HostBinding,
    Input, OnDestroy, Output, TemplateRef, ViewChild, ViewContainerRef, inject
} from '@angular/core';
import { Subject, auditTime, filter, takeUntil } from 'rxjs';
import { LogError } from '@memberjunction/core';
import type { EngineDataChangeEvent } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
import type { DashboardUserPermissions, MJDashboardEntity, MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { DashboardFavoritesService, HomeAppPinService, SafeDetectChanges } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { ExtractPanelsFromLayout, RemovePartConfirmOptions } from '@memberjunction/ng-dashboard-viewer';
import type {
    DashboardNavRequestEvent, DashboardPanel, DashboardPartDialogMode, DashboardPartDialogResult, DashboardViewerComponent, PanelInteractionEvent
} from '@memberjunction/ng-dashboard-viewer';
import { DashboardViewerFactory } from './dashboard-viewer-factory';
import { DASHBOARD_SAVE_IN_PROGRESS } from './dashboard-editor.types';
import type { DashboardEditorBodyStyle, DashboardEditorLoadError, DashboardEditorTitleContext, DashboardSaveOverrides } from './dashboard-editor.types';

/** The entity of the dashboard records DashboardEngine caches. */
const DASHBOARDS_ENTITY_NAME = 'MJ: Dashboards';

/** How long Save waits for the dashboard screenshot. After that it saves without a new one. */
const SAVE_SCREENSHOT_TIMEOUT_MS = 1500;

/** Why a Save stopped: asked whether to replace a save made elsewhere, the user chose Keep editing. */
const KEPT_EDITING = 'The user kept editing: the dashboard was saved elsewhere.';

/** Why a Save stopped before the viewer saved: the editor shows another dashboard now. */
const DASHBOARD_CHANGED_BEFORE_SAVE = 'The editor shows another dashboard now. The dashboard was not saved.';

/** The part types offered while no viewer is open: one empty list, so change detection sees a stable value. */
const NO_PART_TYPES: MJDashboardPartTypeEntity[] = [];

/** Permissions before a dashboard loads: nothing is allowed, so no Edit button flashes. */
const NO_PERMISSIONS: DashboardUserPermissions = {
    DashboardID: '', CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, IsOwner: false, PermissionSource: 'none',
};

/** What bringing the shown dashboard in step with DashboardEngine did (see syncWithSavedDashboard). */
type SavedDashboardSync = 'reloaded' | 'took-copy' | 'unchanged';

/**
 * A Config dashboard with its header: view mode (title, description, favorite, host actions, Edit) and
 * edit mode (Editing badge, name and description fields, Add part, Save, Cancel), the part dialog and the
 * dashboard viewer. Made for the dashboard tab and Home's dashboard view, so both edit a dashboard the same
 * way; Save asks before it replaces a save made elsewhere during the edit. It never navigates: hosts
 * handle its events.
 *
 * Hosts project their own header buttons: `[headerTools]` shows in both modes, `[viewActions]` in view
 * mode after the star.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-editor',
    templateUrl: './dashboard-editor.component.html',
    styleUrls: ['./dashboard-editor.component.css'],
})
export class DashboardEditorComponent extends BaseAngularComponent implements AfterViewInit, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly favoritesService = inject(DashboardFavoritesService);
    private readonly pinService = inject(HomeAppPinService);
    private readonly confirmService = inject(MJConfirmService);
    private readonly viewerFactory = inject(DashboardViewerFactory);

    // ── Inputs ────────────────────────────────────────────────
    private _dashboardId: string | null = null;
    private viewInitialized = false;

    /**
     * The Config dashboard to show. The editor reads it from DashboardEngine. The same ID again (in any
     * case) changes nothing; another ID drops an edit in progress and shows that dashboard; null clears.
     */
    @Input()
    set DashboardId(value: string | null) {
        const id = value?.trim() || null;
        if (UUIDsEqual(id, this._dashboardId)) return;
        this._dashboardId = id;
        if (this.viewInitialized) void this.load();
    }
    get DashboardId(): string | null {
        return this._dashboardId;
    }

    /** Enter edit mode when the dashboard finishes loading. Read once per load, then reset (StartInEditModeChange). */
    @Input() StartInEditMode = false;
    /** Emits false when the editor has read StartInEditMode, for a two-way binding. */
    @Output() StartInEditModeChange = new EventEmitter<boolean>();

    /** Replaces the view-mode title, for example with Home's breadcrumb and dashboard switcher. */
    @Input() TitleTemplate: TemplateRef<DashboardEditorTitleContext> | null = null;
    /** Shows "Open in Dashboards" in view mode. */
    @Input() ShowOpenInDashboards = false;
    /** Shows the favorite star in view mode. */
    @Input() ShowFavorite = true;
    /** 'fill': the dashboard fills the editor. 'card': a padded card body. */
    @Input() BodyStyle: DashboardEditorBodyStyle = 'fill';

    // ── Outputs ───────────────────────────────────────────────
    /** The dashboard's layout is ready. Once for each DashboardId. */
    @Output() Loaded = new EventEmitter<MJDashboardEntity>();
    /**
     * The dashboard could not be shown: DashboardEngine does not hold it, it is a Code dashboard, or its
     * layout failed. The editor then shows no dashboard.
     */
    @Output() LoadFailed = new EventEmitter<DashboardEditorLoadError>();
    /** The editor entered (true) or left (false) edit mode. Not emitted when the editor is destroyed. */
    @Output() EditingChange = new EventEmitter<boolean>();
    /** The viewer saved the dashboard (before the editor leaves edit mode). */
    @Output() Saved = new EventEmitter<MJDashboardEntity>();
    /** The shown dashboard's saved name changed: this editor's Save, or a save elsewhere. Never empty. */
    @Output() NameChanged = new EventEmitter<string>();
    /** The viewer's configuration changed (parts, layout). */
    @Output() ConfigChanged = new EventEmitter<void>();
    /** The editor rebuilt the saved layout because the dashboard was saved elsewhere. */
    @Output() ReloadedFromSaved = new EventEmitter<void>();
    /** The user starred (true) or unstarred (false) the dashboard. */
    @Output() FavoriteChange = new EventEmitter<boolean>();
    /** A part asked to open something: a record, another dashboard, a query. */
    @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
    /** The user clicked "Open in Dashboards". */
    @Output() OpenInDashboardsRequested = new EventEmitter<MJDashboardEntity>();

    /** In 'fill' style the editor takes its host's full height. */
    @HostBinding('class.dashboard-editor--fill') get IsFill(): boolean { return this.BodyStyle === 'fill'; }

    // ── View ──────────────────────────────────────────────────
    @ViewChild('body', { static: true }) private bodyRef!: ElementRef<HTMLDivElement>;
    @ViewChild('viewerHost', { read: ViewContainerRef, static: true }) private viewerHost!: ViewContainerRef;

    // ── State ─────────────────────────────────────────────────
    /** True while the editor is in edit mode. */
    public IsEditing = false;
    /**
     * True while a Save of the shown dashboard runs (the question about a save made elsewhere, the
     * screenshot, then the save). Meanwhile Edit, Save, Cancel, Add part and part edits do nothing, and
     * the header shows it.
     */
    public IsSaving = false;
    /** The name field. */
    public EditingName = '';
    /** The description field. */
    public EditingDescription = '';
    /** The user's permissions for the shown dashboard. Nothing is allowed before a dashboard loads. */
    public Permissions: DashboardUserPermissions = NO_PERMISSIONS;
    /** Whether the part dialog is open to add a part or to edit one. Null while it is closed. */
    public PartDialogMode: DashboardPartDialogMode | null = null;
    /** The part the part dialog edits in edit mode. */
    public EditPartPanel: DashboardPanel | null = null;

    private _dashboard: MJDashboardEntity | null = null;
    private viewer: DashboardViewerComponent | null = null;
    private viewerRef: ComponentRef<DashboardViewerComponent> | null = null;
    /** Each load gets a number; a load whose number is no longer the latest stops at its next step. */
    private loadGeneration = 0;
    /** Each edit session gets a number; a dialog answer from an ended session does nothing. */
    private editSession = 0;
    /** The saved name and description when the current edit session began. */
    private editBaseline: { Name: string; Description: string } | null = null;
    /** The saved name last reported through NameChanged (or the name at load). */
    private reportedName: string | null = null;
    private readonly destroy$ = new Subject<void>();
    /** Ends the subscriptions to the current viewer's events. */
    private readonly viewerChanged$ = new Subject<void>();

    // ── Read-only state for hosts ─────────────────────────────
    /** The shown dashboard: the instance DashboardEngine holds. Null before a load. */
    public get Dashboard(): MJDashboardEntity | null { return this._dashboard; }
    /** The viewer, for hosts that drive it (the dashboard tab's agent tools). Null before a load. */
    public get Viewer(): DashboardViewerComponent | null { return this.viewer; }
    /** The element that holds the dashboard: the Save screenshot, the pin thumbnail and the agent's screenshot capture it. */
    public get BodyElement(): HTMLElement { return this.bodyRef.nativeElement; }
    /** True when the user can edit the shown dashboard. */
    public get CanEdit(): boolean { return this.Permissions.CanEdit; }
    /** The part types the part dialog offers: the viewer's part types. */
    public get PartTypes(): MJDashboardPartTypeEntity[] { return this.viewer?.GetPartTypes() ?? NO_PART_TYPES; }
    /** True when someone else owns the dashboard and shared it with the user. */
    public get IsSharedWithUser(): boolean { return !this.Permissions.IsOwner && this.Permissions.PermissionSource !== 'none'; }
    /** True when the shown dashboard is one of the user's favorites. False when the favorites cannot be read. */
    public get IsFavorite(): boolean {
        const id = this._dashboard?.ID;
        if (!id) return false;
        try {
            return this.favoritesService.IsFavorite(id);
        } catch {
            return false;
        }
    }
    /** True while editing with changes the viewer or the fields have not saved. */
    public get HasUnsavedChanges(): boolean {
        const dashboard = this._dashboard;
        if (!this.IsEditing || !dashboard) return false;
        return (this.viewer?.HasUnsavedChanges ?? false)
            || this.EditingName !== dashboard.Name
            || this.EditingDescription !== (dashboard.Description ?? '');
    }

    // ── Lifecycle ─────────────────────────────────────────────
    ngAfterViewInit(): void {
        this.viewInitialized = true;
        this.watchSavedDashboard();
        this.watchFavorites();
        if (this._dashboardId) void this.load();
    }

    /** Stops a load in progress at its next step, ends the subscriptions and destroys the viewer. */
    ngOnDestroy(): void {
        this.loadGeneration++;
        this.destroy$.next();
        this.destroy$.complete();
        this.dropViewer();
    }

    // ── Load ──────────────────────────────────────────────────
    /**
     * Shows the dashboard DashboardId names. Drops the dashboard shown before. When the dashboard cannot
     * be shown, the editor shows none (an edit begun while the layout built ends) and emits LoadFailed.
     */
    private async load(): Promise<void> {
        const generation = ++this.loadGeneration;
        this.teardownViewer();
        const id = this._dashboardId;
        if (!id) {
            SafeDetectChanges(this.cdr);
            return;
        }
        try {
            const dashboard = await this.findConfigDashboard(id);
            if (generation !== this.loadGeneration) return;
            await this.showDashboard(dashboard, generation);
        } catch (error) {
            if (generation !== this.loadGeneration) return;
            this.teardownViewer();
            SafeDetectChanges(this.cdr);
            LogError(`Dashboard editor: could not load dashboard ${id}: ${errorMessage(error)}`);
            this.LoadFailed.emit({ DashboardId: id, Message: errorMessage(error) });
        }
    }

    /** The Config dashboard with this ID in DashboardEngine. Rejects when the engine has none, or it is a Code dashboard. */
    private async findConfigDashboard(id: string): Promise<MJDashboardEntity> {
        const provider = this.ProviderToUse;
        await DashboardEngine.Instance.Config(false, provider.CurrentUser, provider);
        const dashboard = DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, id));
        if (!dashboard) throw new Error(`Dashboard with ID ${id} not found.`);
        if (dashboard.Type === 'Code') throw new Error(`"${dashboard.Name}" is a Code dashboard. The editor shows Config dashboards.`);
        return dashboard;
    }

    /**
     * Creates the viewer and shows the dashboard in it. The viewer is configured, and its events wired,
     * before it gets the dashboard, because the dashboard starts the layout. Once the layout is ready the
     * editor enters edit mode when StartInEditMode asks for it, then emits Loaded.
     */
    private async showDashboard(dashboard: MJDashboardEntity, generation: number): Promise<void> {
        const viewer = this.createViewer();
        this._dashboard = dashboard;
        this.reportedName = dashboard.Name;
        this.Permissions = this.readPermissions(dashboard);
        this.configureViewer(viewer);
        viewer.Dashboard = dashboard;                // starts the layout
        SafeDetectChanges(this.cdr);                 // the header shows while the layout builds
        await viewer.WaitForLayoutReady();
        if (generation !== this.loadGeneration) return;
        this.applyStartInEditMode();
        SafeDetectChanges(this.cdr);
        this.Loaded.emit(dashboard);
    }

    /** Creates the viewer in the body. Its host element fills the body: component CSS cannot reach a created host. */
    private createViewer(): DashboardViewerComponent {
        const ref = this.viewerFactory.Create(this.viewerHost);
        const element = ref.location.nativeElement as HTMLElement;
        element.style.width = '100%';
        element.style.height = '100%';
        this.viewerRef = ref;
        this.viewer = ref.instance;
        return ref.instance;
    }

    /** Sets the viewer up for the editor, which shows the header, and passes the viewer's events on. */
    private configureViewer(viewer: DashboardViewerComponent): void {
        viewer.Provider = this.Provider;
        viewer.ShowToolbar = false;
        viewer.ShowBreadcrumb = false;
        viewer.ShowOpenInTabButton = false;
        viewer.ShowEditButton = false;
        viewer.CanEdit = this.Permissions.CanEdit;
        viewer.Categories = DashboardEngine.Instance.DashboardCategories;
        viewer.NavigationRequested.pipe(takeUntil(this.viewerChanged$)).subscribe(event => this.NavigationRequested.emit(event));
        viewer.DashboardSaved.pipe(takeUntil(this.viewerChanged$)).subscribe(saved => this.onViewerSaved(saved));
        viewer.error.pipe(takeUntil(this.viewerChanged$)).subscribe(e => LogError(`Dashboard editor: ${e.message}${e.error ? `: ${e.error.message}` : ''}`));
        viewer.configChanged.pipe(takeUntil(this.viewerChanged$)).subscribe(() => this.ConfigChanged.emit());
        viewer.PanelInteraction.pipe(takeUntil(this.viewerChanged$)).subscribe(event => this.onPanelInteraction(event));
    }

    /** Destroys the viewer and forgets the dashboard. An edit in progress is dropped, and EditingChange says so. */
    private teardownViewer(): void {
        if (this.dropViewer()) this.EditingChange.emit(false);
    }

    /**
     * Destroys the viewer and forgets the dashboard and its edit. A Save of that dashboard still running
     * stops at its next step, and IsSaving is false for the next dashboard. Returns whether an edit was in
     * progress.
     */
    private dropViewer(): boolean {
        const wasEditing = this.IsEditing;
        this.viewerChanged$.next();
        this.closePartDialogs();
        this.IsEditing = false;
        this.IsSaving = false;
        this.editSession++;
        this.viewerRef?.destroy();
        this.viewerRef = null;
        this.viewer = null;
        this._dashboard = null;
        this.reportedName = null;
        this.Permissions = NO_PERMISSIONS;
        return wasEditing;
    }

    /** Enters edit mode once when the host asked for it with StartInEditMode, and resets the input. */
    private applyStartInEditMode(): void {
        if (!this.StartInEditMode) return;
        this.StartInEditMode = false;
        this.StartInEditModeChange.emit(false);
        this.EnterEditMode();
    }

    /** Reads the user's permissions for the dashboard again, for example after the host's Share dialog saved. */
    public RefreshPermissions(): void {
        this.Permissions = this.readPermissions(this._dashboard);
        if (this.viewer) this.viewer.CanEdit = this.Permissions.CanEdit;
        SafeDetectChanges(this.cdr);
    }

    /** The user's permissions for a dashboard. None without a dashboard. */
    private readPermissions(dashboard: MJDashboardEntity | null): DashboardUserPermissions {
        return dashboard
            ? DashboardEngine.Instance.GetDashboardPermissions(dashboard.ID, this.ProviderToUse.CurrentUser.ID)
            : NO_PERMISSIONS;
    }

    // ── Edit mode ─────────────────────────────────────────────
    /**
     * Enters edit mode when the user can edit. Returns true when the editor is editing afterwards, and
     * false, changing nothing, while a Save runs: that Save reads the name and description fields.
     */
    public EnterEditMode(): boolean {
        if (this.IsSaving) return false;
        if (this.IsEditing) return true;
        if (!this.startEditing()) return false;
        SafeDetectChanges(this.cdr);
        this.EditingChange.emit(true);
        return true;
    }

    /** Leaves edit mode without saving, or enters it. */
    public ToggleEditMode(): void {
        if (this.IsEditing) this.CancelEdit();
        else this.EnterEditMode();
    }

    /**
     * Puts the editor and its viewer in edit mode. Returns false, and changes nothing, without a dashboard
     * or when the user cannot edit it. Takes DashboardEngine's current copy first: when the dashboard was
     * saved elsewhere since the viewer loaded it, the viewer reloads the saved layout, so this edit's save
     * keeps it. Notes the saved name and description, so Save can tell a save made elsewhere during the
     * edit (see savedElsewhereSinceEditStart).
     */
    private startEditing(): boolean {
        if (!this._dashboard || !this.Permissions.CanEdit) return false;
        this.syncWithSavedDashboard();
        const dashboard = this._dashboard;                     // the sync can take a newer copy
        this.IsEditing = true;
        this.editSession++;
        this.EditingName = dashboard.Name;
        this.EditingDescription = dashboard.Description || '';
        this.editBaseline = { Name: dashboard.Name, Description: dashboard.Description ?? '' };
        if (this.viewer) this.viewer.IsEditing = true;
        return true;
    }

    /**
     * Leaves edit mode and drops the changes. The viewer reloads the saved layout before it leaves edit
     * mode: it drops its layout at once, so leaving edit mode applies to the layout it rebuilds. Does
     * nothing while a Save runs.
     */
    public CancelEdit(): void {
        if (this.IsSaving || !this.IsEditing) return;
        this.IsEditing = false;
        this.editSession++;
        this.closePartDialogs();
        this.reloadSavedDashboard();
        if (this.viewer) this.viewer.IsEditing = false;
        SafeDetectChanges(this.cdr);
        this.EditingChange.emit(false);
    }

    // ── Save ──────────────────────────────────────────────────
    /**
     * Saves the name, description and layout, then leaves edit mode. An empty name is never saved: the
     * previous name is kept. When the save fails, the editor stays in edit mode (see onSaveFailed). One
     * Save runs at a time (see IsSaving).
     */
    public async SaveDashboard(): Promise<void> {
        await this.saveAndLeaveEditMode();
    }

    /**
     * Saves like SaveDashboard. Returns null when saved, also when the editor shows another dashboard by
     * the time the viewer has saved; else why not. Outside edit mode it saves the dashboard's own name and
     * description. `overrides` replace the fields first. While a Save runs it refuses at once and leaves
     * the fields as they are.
     */
    public async Save(overrides: DashboardSaveOverrides = {}): Promise<string | null> {
        if (this.IsSaving) return DASHBOARD_SAVE_IN_PROGRESS;
        const dashboard = this._dashboard;
        if (dashboard && !this.IsEditing) {
            this.EditingName = dashboard.Name;
            this.EditingDescription = dashboard.Description || '';
        }
        if (overrides.Name !== undefined) this.EditingName = overrides.Name;
        if (overrides.Description !== undefined) this.EditingDescription = overrides.Description;
        return this.saveAndLeaveEditMode();
    }

    /**
     * The work of SaveDashboard and Save. Returns null when saved, else why not: no dashboard is open, a
     * Save runs, another save of the dashboard object runs (see stopWhileSavedElsewhere), the user kept
     * editing rather than replace a save made elsewhere, the editor showed another dashboard before the
     * viewer saved, or the save failed (the user has seen that reason). A Save belongs to the viewer it
     * started with: once the editor shows another dashboard, the Save changes nothing in the editor and
     * leaves IsSaving to that dashboard. A save the viewer already made still returns null. See
     * prepareSave for the steps before the viewer saves.
     */
    private async saveAndLeaveEditMode(): Promise<string | null> {
        const dashboard = this._dashboard;
        const viewer = this.viewer;
        if (!dashboard || !viewer) return 'No dashboard is open.';
        if (this.IsSaving) return DASHBOARD_SAVE_IN_PROGRESS;
        const savingElsewhere = this.stopWhileSavedElsewhere(dashboard);
        if (savingElsewhere) return savingElsewhere;
        this.IsSaving = true;
        SafeDetectChanges(this.cdr);
        try {
            const stopped = await this.prepareSave(dashboard, viewer);
            if (stopped) return stopped;
            if (!await viewer.save()) return this.onSaveFailed(dashboard);
            if (viewer === this.viewer) this.leaveEditModeAfterSave(viewer);
            return null;
        } catch (error) {
            return this.onSaveFailed(dashboard, error);
        } finally {
            if (viewer === this.viewer) {
                this.IsSaving = false;
                SafeDetectChanges(this.cdr);
            }
        }
    }

    /**
     * The steps of a Save before the viewer saves. It asks first when the dashboard was saved elsewhere
     * since this edit began. Then it takes the screenshot and writes it, the name and the description to
     * the dashboard; the fields are read after the screenshot, so a name typed meanwhile is saved. Returns
     * why the Save stops, or null to save. When the editor shows another dashboard after a step, or another
     * save of the dashboard object started meanwhile, it stops and writes nothing.
     */
    private async prepareSave(dashboard: MJDashboardEntity, viewer: DashboardViewerComponent): Promise<string | null> {
        const replace = !this.savedElsewhereSinceEditStart() || await this.confirmOverwrite();
        if (viewer !== this.viewer) return DASHBOARD_CHANGED_BEFORE_SAVE;
        if (!replace) return KEPT_EDITING;
        // The screenshot goes on the dashboard (Thumbnail), so this same Save stores the picture the
        // dashboard cards show. A failed Save reverts it with the other fields.
        const thumbnail = await this.takeDashboardThumbnail(viewer);
        if (viewer !== this.viewer) return DASHBOARD_CHANGED_BEFORE_SAVE;
        const savingElsewhere = this.stopWhileSavedElsewhere(dashboard);
        if (savingElsewhere) return savingElsewhere;
        if (thumbnail !== undefined) dashboard.Thumbnail = thumbnail;
        this.restoreEmptyName();
        dashboard.Name = this.EditingName;
        dashboard.Description = this.EditingDescription;
        return null;
    }

    /**
     * When another save of the dashboard object runs (Home's rename, for example), tells the user and returns why this
     * Save stops: BaseEntity's Save would join that save and write none of this Save's changes. The editor stays in edit
     * mode with the user's changes. Null when no other save runs.
     */
    private stopWhileSavedElsewhere(dashboard: MJDashboardEntity): string | null {
        if (!dashboard.IsSaving) return null;
        const message = `"${dashboard.Name}" is being saved elsewhere. Save again in a moment.`;
        MJNotificationService.Instance.CreateSimpleNotification(message, 'info', 3000);
        return message;
    }

    /** Leaves edit mode after a successful save. A Save outside edit mode (an agent's request) emits no EditingChange. */
    private leaveEditModeAfterSave(viewer: DashboardViewerComponent): void {
        const wasEditing = this.IsEditing;
        this.IsEditing = false;
        this.editSession++;
        this.closePartDialogs();
        viewer.IsEditing = false;
        SafeDetectChanges(this.cdr);
        if (wasEditing) this.EditingChange.emit(false);
    }

    /**
     * The dashboard's new Thumbnail: a small screenshot of the dashboard body, or null when the layout has
     * no panels, so the dashboard cards show the icon. Undefined when no screenshot is ready in time (too
     * many elements, no size, or the timeout): the current Thumbnail stays. Never throws.
     */
    private async takeDashboardThumbnail(viewer: DashboardViewerComponent): Promise<string | null | undefined> {
        try {
            if (ExtractPanelsFromLayout(viewer.getConfig()?.layout ?? null).length === 0) return null;
            return (await this.pinService.CaptureThumbnail(this.BodyElement, SAVE_SCREENSHOT_TIMEOUT_MS)) || undefined;
        } catch (error) {
            LogError(`Dashboard editor: could not take a screenshot of the dashboard: ${errorMessage(error)}`);
            return undefined;
        }
    }

    /** Keeps the previous name when the user leaves the name field empty or with only spaces. */
    public OnNameBlur(): void {
        this.restoreEmptyName();
    }

    /** Puts the saved name back into an empty or spaces-only name field. */
    private restoreEmptyName(): void {
        if (!this.EditingName.trim()) {
            this.EditingName = this._dashboard?.Name || 'Untitled Dashboard';
        }
    }

    /**
     * Handles a save that did not complete. The editor stays in edit mode with the user's changes, the
     * cached dashboard (which other pages read) goes back to its saved values, and the user sees why.
     * Returns the message the user sees.
     */
    private onSaveFailed(dashboard: MJDashboardEntity, error?: unknown): string {
        const reason = this.saveFailureReason(dashboard, error);
        dashboard.Revert();
        LogError(`Dashboard editor: could not save the dashboard: ${reason || 'no reason given'}`);
        const message = reason ? `Could not save the dashboard: ${reason}` : 'Could not save the dashboard';
        MJNotificationService.Instance.CreateSimpleNotification(message, 'error', 5000);
        SafeDetectChanges(this.cdr);
        return message;
    }

    /** Why a save failed: the thrown error, else the dashboard's failed save result. Empty when neither says. */
    private saveFailureReason(dashboard: MJDashboardEntity, error: unknown): string {
        if (error !== undefined) return errorMessage(error);
        const latest = dashboard.LatestResult;
        return latest && !latest.Success ? latest.CompleteMessage : '';
    }

    /** Passes a save of the viewer on to the host, with the new name when it changed. */
    private onViewerSaved(saved: MJDashboardEntity): void {
        this.Saved.emit(saved);
        this.reportNameIfChanged(saved.Name);
    }

    /** Emits NameChanged when the saved name differs from the one last reported. An empty name is never reported. */
    private reportNameIfChanged(name: string | null | undefined): void {
        if (!name || name === this.reportedName) return;
        this.reportedName = name;
        this.NameChanged.emit(name);
    }

    // ── Saved elsewhere ───────────────────────────────────────
    /**
     * Follows DashboardEngine's changes to the shown dashboard until the editor is destroyed. A burst of
     * changes is handled once, after the current task.
     */
    private watchSavedDashboard(): void {
        DashboardEngine.Instance.DataChange$.pipe(
            filter(event => this.isChangeToShownDashboard(event)),
            auditTime(0),
            takeUntil(this.destroy$)
        ).subscribe(() => this.onSavedDashboardChanged());
    }

    /** True for a change to the shown dashboard's record, or for a reload of all dashboards. */
    private isChangeToShownDashboard(event: EngineDataChangeEvent): boolean {
        const shown = this._dashboard;
        if (!shown || event.config.EntityName?.trim().toLowerCase() !== DASHBOARDS_ENTITY_NAME.toLowerCase()) {
            return false;
        }
        const affected = event.affectedEntity;
        return !affected || affected === shown || affected.PrimaryKey.Equals(shown.PrimaryKey);
    }

    /**
     * Brings an idle editor in step with the saved dashboard after a change to it, and reports a rename
     * saved elsewhere, also while editing: the host's title follows the saved name, and the name the user
     * typed stays in the field.
     */
    private onSavedDashboardChanged(): void {
        if (!this.IsEditing && this.syncWithSavedDashboard() === 'reloaded') {
            this.ReloadedFromSaved.emit();
        }
        this.reportNameIfChanged((this.savedDashboard() ?? this._dashboard)?.Name);
        SafeDetectChanges(this.cdr);
    }

    /**
     * Brings the shown dashboard in step with DashboardEngine's current copy of it. The viewer rebuilds
     * only when the saved layout differs from the one it shows. When only the copy is new (DashboardEngine
     * reloaded its dashboards), the editor and the viewer take it without a rebuild: a save writes every
     * field of the entity, so saving an old copy would write its old values.
     */
    private syncWithSavedDashboard(): SavedDashboardSync {
        const viewer = this.viewer;
        const saved = this.savedDashboard();
        if (!viewer || !saved) return 'unchanged';
        if (viewer.HasNewerSavedLayout(saved)) {
            this.reloadSavedDashboard();
            return 'reloaded';
        }
        if (saved !== this._dashboard && viewer.UseSavedCopy(saved)) {
            this._dashboard = saved;
            return 'took-copy';
        }
        return 'unchanged';
    }

    /** Shows the saved dashboard in the viewer: DashboardEngine's copy of it when the engine has one. */
    private reloadSavedDashboard(): void {
        const viewer = this.viewer;
        const saved = this.savedDashboard() ?? this._dashboard;
        if (!viewer || !saved) return;

        this._dashboard = saved;
        viewer.ReloadFromSaved(saved).catch((error: unknown) => {
            LogError(`Dashboard editor: could not reload the saved dashboard: ${errorMessage(error)}`);
        });
    }

    /** The shown dashboard as DashboardEngine holds it now. Null when the engine does not have it. */
    private savedDashboard(): MJDashboardEntity | null {
        const shown = this._dashboard;
        if (!shown) return null;
        try {
            return DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, shown.ID)) ?? null;
        } catch {
            return null; // the user cannot read the dashboards cache
        }
    }

    /**
     * True when the dashboard was saved elsewhere after the current edit session began: another layout,
     * name or description. False outside edit mode, where no edit session runs.
     */
    private savedElsewhereSinceEditStart(): boolean {
        const saved = this.savedDashboard() ?? this._dashboard;
        const baseline = this.editBaseline;
        if (!this.IsEditing || !saved || !baseline || !this.viewer) return false;
        return this.viewer.HasNewerSavedLayout(saved)
            || saved.Name !== baseline.Name
            || (saved.Description ?? '') !== baseline.Description;
    }

    /** Asks whether to replace a save made elsewhere. Resolves true for Save anyway, false for Keep editing. */
    private confirmOverwrite(): Promise<boolean> {
        return this.confirmService.Confirm({
            title: 'Replace changes saved elsewhere?',
            message: 'This dashboard was saved in another place after you started editing. Saving now replaces those changes.',
            type: 'warning',
            confirmText: 'Save anyway',
            cancelText: 'Keep editing',
        });
    }

    // ── Parts ─────────────────────────────────────────────────
    /** Routes the viewer's part requests. Outside edit mode, only Add part on an empty dashboard counts: it enters edit mode first. */
    private onPanelInteraction(event: PanelInteractionEvent): void {
        if (event.interactionType !== 'custom' || this.IsSaving) return;
        const action = event.payload?.['action'];
        if (!this.IsEditing && (action !== 'add-panel-requested' || !this.EnterEditMode())) return;
        switch (action) {
            case 'add-panel-requested':
                this.OpenAddPartDialog();
                break;
            case 'configure-part-requested':
                this.openEditPartDialog(event.panelId);
                break;
            case 'remove-part-requested':
                void this.confirmRemovePart(event.panelId);
                break;
        }
    }

    /** Opens the part dialog to add a part. Only while editing and not saving. */
    public OpenAddPartDialog(): void {
        if (!this.IsEditing || this.IsSaving) return;
        this.EditPartPanel = null;
        this.PartDialogMode = 'add';
        SafeDetectChanges(this.cdr);
    }

    /** Opens the part dialog to edit the part with this panel ID. */
    private openEditPartDialog(panelId: string): void {
        const panel = this.viewer?.GetPanel(panelId) ?? null;
        if (!panel) return;
        this.EditPartPanel = panel;
        this.PartDialogMode = 'edit';
        SafeDetectChanges(this.cdr);
    }

    /** Adds the part, or applies the edited part, from the part dialog. */
    public async OnPartDialogSaved(result: DashboardPartDialogResult): Promise<void> {
        const mode = this.PartDialogMode;
        const panel = this.EditPartPanel;
        this.closePartDialogs();
        if (mode === 'add') {
            await this.applyPartChange('Could not add the part', async v => { await v.AddPanel(result.PartType.ID, result.Config, result.Title, result.Icon); });
        } else if (mode === 'edit' && panel) {
            await this.applyPartChange('Could not update the part', v => v.UpdatePanelConfig(panel.id, result.Config, result.Title, result.Icon));
        }
    }

    /** Closes the part dialog. */
    public ClosePartDialog(): void {
        this.closePartDialogs();
        SafeDetectChanges(this.cdr);
    }

    /** Closes every part dialog. A part dialog belongs to one edit session. */
    private closePartDialogs(): void {
        this.PartDialogMode = null;
        this.EditPartPanel = null;
    }

    /**
     * Asks the user to confirm removing a part, then removes it. Changes nothing when the user cancels, or when the
     * edit session, the viewer or the part changed while the confirm was open.
     */
    private async confirmRemovePart(panelId: string): Promise<void> {
        const viewer = this.viewer;
        const panel = viewer?.GetPanel(panelId);
        if (!viewer || !panel) return;
        const session = this.editSession;
        const confirmed = await this.confirmService.ConfirmDelete(RemovePartConfirmOptions(panel.title, viewer.GetPartTypeForPanel(panelId)?.Name));
        if (!confirmed || !this.IsEditing || session !== this.editSession || viewer !== this.viewer || !viewer.GetPanel(panelId)) return;
        await this.applyPartChange('Could not remove the part', v => v.ConfirmRemovePanel(panelId));
    }

    /**
     * Applies one part change to the viewer, tells the user when it fails, and reports the change through
     * ConfigChanged. The change is saved with the dashboard's Save. Does nothing while a Save runs, for
     * example from a dialog that was open when the Save started.
     */
    private async applyPartChange(failureMessage: string, change: (viewer: DashboardViewerComponent) => void | Promise<void>): Promise<void> {
        const viewer = this.viewer;
        if (!viewer || this.IsSaving) return;
        try {
            await change(viewer);
        } catch (error) {
            LogError(`Dashboard editor: ${failureMessage}: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification(failureMessage, 'error', 3000);
        }
        this.ConfigChanged.emit();
    }

    // ── Favorite ──────────────────────────────────────────────
    /** Shows the star's new state when any favorite changes, also on another page, until the editor is destroyed. */
    private watchFavorites(): void {
        this.favoritesService.Changed$.pipe(takeUntil(this.destroy$)).subscribe(() => SafeDetectChanges(this.cdr));
    }

    /** Stars or unstars the shown dashboard, tells the user the new state, and emits it through FavoriteChange. */
    public async ToggleFavorite(): Promise<void> {
        const dashboard = this._dashboard;
        if (!dashboard) return;
        try {
            const isFavorite = await this.favoritesService.Toggle(dashboard.ID);
            const message = isFavorite ? `Added "${dashboard.Name}" to favorites` : `Removed "${dashboard.Name}" from favorites`;
            MJNotificationService.Instance.CreateSimpleNotification(message, 'success', 2000);
        } catch (error) {
            LogError(`Dashboard editor: could not change the favorite: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification('Could not change the favorite', 'error', 3000);
        }
        this.FavoriteChange.emit(this.IsFavorite);
        SafeDetectChanges(this.cdr);
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
