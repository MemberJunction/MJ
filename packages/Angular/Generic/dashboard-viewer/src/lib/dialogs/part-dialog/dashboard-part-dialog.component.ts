import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    ViewChild,
    ViewContainerRef,
    ComponentRef,
    OnDestroy,
    inject
} from '@angular/core';
import { Subscription } from 'rxjs';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PanelConfig, DashboardPanel } from '../../models/dashboard-types';
import { BaseConfigPanel, ConfigPanelResult } from '../../config-panels/base-config-panel';

/** Whether the part dialog adds a new part or edits an existing one. */
export type DashboardPartDialogMode = 'add' | 'edit';

/** What the part dialog gives back on Add part or Apply. */
export interface DashboardPartDialogResult {
    PartType: MJDashboardPartTypeEntity;
    Config: PanelConfig;
    Title: string;
    Icon?: string;
}

/** The refresh intervals a query part offers, in seconds; the dashboard assistant accepts the same ones. */
export const QUERY_REFRESH_SECONDS = [30, 60, 300, 600] as const;

/** The refresh interval a query part gets when the user turns automatic refresh on. */
const DEFAULT_QUERY_REFRESH_SECONDS = 60;

/** The icon of a part whose part type has none. */
const DEFAULT_PART_ICON = 'fa-solid fa-puzzle-piece';

/** The label and description on a part type tile. */
interface PartTypeTileCopy {
    Label: string;
    Description: string;
}

/** Short tile copy for the built-in part types, by part type Name. Other types show their metadata Name and Description. */
const PART_TYPE_TILE_COPY: Readonly<Record<string, PartTypeTileCopy | undefined>> = {
    View: { Label: 'View', Description: 'A saved view, or all records of an entity' },
    Query: { Label: 'Query', Description: 'A saved query, with its parameters' },
    Artifact: { Label: 'Artifact', Description: 'A report, chart or component from Chat' },
    WebURL: { Label: 'Web page', Description: 'An embedded page' },
};

/**
 * The dialog that adds a part to a dashboard or edits one, on `mj-dialog`.
 *
 * It shows the part type tiles, the part type's settings panel as the Source section, the title
 * and, for a query, the parameter-controls and auto refresh options. The settings panel is the
 * `BaseConfigPanel` that ClassFactory registers under the part type's `ConfigDialogClass`; the
 * dialog passes it `Provider` and hides the panel's own copies of the fields it shows itself.
 * In edit mode the part's type cannot change, so the other tiles are disabled.
 *
 * The host opens and closes it, for example with `@if` around `[Visible]="true"`.
 */
@Component({
    standalone: false,
    selector: 'mj-dashboard-part-dialog',
    templateUrl: './dashboard-part-dialog.component.html',
    styleUrls: ['./dashboard-part-dialog.component.css']
})
export class DashboardPartDialogComponent extends BaseAngularComponent implements OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);

    /**
     * Whether the dialog shows. Opening reads Mode, Panel and PartTypes after the current input
     * pass, because inputs arrive in no fixed order. Closing removes the settings panel.
     */
    @Input()
    set Visible(value: boolean) {
        const wasVisible = this._visible;
        this._visible = value;
        if (value && !wasVisible) {
            const openId = ++this.openCount;
            Promise.resolve().then(() => this.open(openId));
        } else if (!value && wasVisible) {
            this.close();
        }
    }
    get Visible(): boolean {
        return this._visible;
    }
    private _visible = false;

    /** Whether the dialog adds a new part or edits {@link Panel}. */
    @Input() Mode: DashboardPartDialogMode = 'add';

    /** The part types to offer. The tiles show the active ones, and the edited part's type, by SortOrder. */
    @Input() PartTypes: MJDashboardPartTypeEntity[] = [];

    /** The part to edit in edit mode. Its part type is the one in {@link PartTypes} with its `partTypeId`. */
    @Input() Panel: DashboardPanel | null = null;

    /** Emitted on Add part or Apply with the part type, config, title and icon of the part. */
    @Output() Saved = new EventEmitter<DashboardPartDialogResult>();

    /** Emitted on Cancel, and when the user closes the dialog with Escape, the backdrop or the close button. */
    @Output() Cancelled = new EventEmitter<void>();

    /** Where the settings panel of the chosen part type renders. */
    @ViewChild('configPanelContainer', { read: ViewContainerRef })
    private configPanelContainer?: ViewContainerRef;

    /** The chosen part type. */
    public SelectedPartType: MJDashboardPartTypeEntity | null = null;

    /** The part's title: empty for a new part, the part's title in edit mode. An empty title means the source name. */
    public Title = '';

    /** The name of the chosen source, from the settings panel. A part type without one shows its tile label. */
    public SourceName = '';

    /** Query option: show the query's parameter controls on the part. */
    public ShowParameterControls = true;

    /** Query option: refresh the part on a timer. */
    public AutoRefreshEnabled = false;

    /** Query option: the refresh interval, in seconds. */
    public AutoRefreshSeconds = DEFAULT_QUERY_REFRESH_SECONDS;

    /** True while the settings panel of the chosen part type loads. */
    public IsLoadingPanel = false;

    /** Why the settings panel could not load, when it could not. */
    public LoadError: string | null = null;

    /** The settings panel's validation errors from the last Add part or Apply. */
    public Errors: string[] = [];

    private configPanelRef: ComponentRef<BaseConfigPanel> | null = null;
    private configChangedSubscription: Subscription | null = null;
    /** The last result the settings panel reported. */
    private latestResult: ConfigPanelResult | null = null;
    private refreshChoices: readonly number[] = QUERY_REFRESH_SECONDS;
    /** Counts opens, so an open that a close or a newer open overtook does nothing. */
    private openCount = 0;
    /** Counts settings panel loads, so a load for a part type the user has left is dropped. */
    private loadCount = 0;
    private destroyed = false;

    /** The dialog title. */
    get DialogTitle(): string {
        return this.Mode === 'edit' ? 'Edit part' : 'Add a part';
    }

    /** The label of the confirm button. */
    get SubmitLabel(): string {
        return this.Mode === 'edit' ? 'Apply' : 'Add part';
    }

    /** The icon of the confirm button. */
    get SubmitIcon(): string {
        return this.Mode === 'edit' ? 'fa-solid fa-check' : 'fa-solid fa-plus';
    }

    /** The placeholder of the title field: the title the part gets when the field is empty. */
    get TitlePlaceholder(): string {
        return `Default: ${this.SourceName}`;
    }

    /** Whether the chosen part type is Query, which has the query options. */
    get IsQuery(): boolean {
        return this.SelectedPartType?.Name === 'Query';
    }

    /** Whether the chosen part type has a settings panel, which fills the Source section. */
    get HasSettingsPanel(): boolean {
        return this.configDialogClassOf(this.SelectedPartType) != null;
    }

    /** The part type tiles: the active part types, and the edited part's type, by SortOrder. */
    get TypeTiles(): MJDashboardPartTypeEntity[] {
        const editedTypeId = this.Mode === 'edit' ? this.Panel?.partTypeId ?? null : null;
        return this.PartTypes
            .filter(pt => pt.IsActive !== false || (editedTypeId != null && UUIDsEqual(pt.ID, editedTypeId)))
            .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
    }

    /** The refresh intervals to offer: {@link QUERY_REFRESH_SECONDS}, plus the edited part's interval when it is another one. */
    get RefreshChoices(): readonly number[] {
        return this.refreshChoices;
    }

    /**
     * Whether Add part or Apply is enabled. Apply is enabled as soon as the part type is shown.
     * Add part waits until the settings panel reports a valid source.
     */
    get CanSubmit(): boolean {
        if (!this.SelectedPartType || this.IsLoadingPanel) return false;
        return this.Mode === 'edit' || this.configPanelRef == null || this.latestResult?.isValid === true;
    }

    /** Whether a tile's part type is the chosen one. */
    public IsSelected(partType: MJDashboardPartTypeEntity): boolean {
        return this.SelectedPartType != null && UUIDsEqual(partType.ID, this.SelectedPartType.ID);
    }

    /** The label on a part type tile. */
    public TileLabel(partType: MJDashboardPartTypeEntity): string {
        return PART_TYPE_TILE_COPY[partType.Name]?.Label ?? partType.Name;
    }

    /** The description on a part type tile. */
    public TileDescription(partType: MJDashboardPartTypeEntity): string {
        return PART_TYPE_TILE_COPY[partType.Name]?.Description ?? partType.Description ?? '';
    }

    /** Chooses a part type in add mode and loads its settings panel. */
    public SelectPartType(partType: MJDashboardPartTypeEntity): void {
        if (this.Mode === 'edit' || this.IsSelected(partType)) return;
        this.selectType(partType);
    }

    /** Takes a change from the settings panel: its latest result and the name of its source. */
    public OnConfigChanged(result: ConfigPanelResult): void {
        this.latestResult = result;
        const panel = this.configPanelRef?.instance;
        if (panel) {
            this.setSourceName(panel.getDefaultTitle());
        }
        this.Errors = [];
        this.cdr.markForCheck();
    }

    /**
     * Emits {@link Saved}, or shows the settings panel's errors when its source is not valid.
     * The config is the settings panel's config. Without a panel it names only the part type
     * (add mode) or is the part's current config (edit mode). A query part also gets the query options.
     */
    public Submit(): void {
        const partType = this.SelectedPartType;
        if (!partType || !this.CanSubmit) return;

        const panel = this.configPanelRef?.instance ?? null;
        let config: PanelConfig;
        let icon: string | undefined;
        if (panel) {
            const result = panel.getResult();
            if (!result.isValid) {
                this.latestResult = result;
                this.Errors = result.errors;
                this.cdr.markForCheck();
                return;
            }
            this.setSourceName(panel.getDefaultTitle());
            config = { ...result.config };
            icon = result.icon;
        } else if (this.Mode === 'edit' && this.Panel) {
            config = { ...this.Panel.config };
            icon = this.Panel.icon;
        } else {
            config = { type: partType.Name };
        }

        if (this.IsQuery) {
            config['showParameterControls'] = this.ShowParameterControls;
            config['autoRefreshSeconds'] = this.AutoRefreshEnabled ? this.AutoRefreshSeconds : 0;
        }

        this.Saved.emit({
            PartType: partType,
            Config: config,
            Title: this.Title.trim() || this.SourceName,
            Icon: icon || partType.Icon || DEFAULT_PART_ICON
        });
    }

    /** Emits {@link Cancelled}. */
    public Cancel(): void {
        this.Cancelled.emit();
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.loadCount++;
        this.destroyConfigPanel();
    }

    /** Starts from the inputs: a new part with the first tile chosen, or the edited part. */
    private open(openId: number): void {
        if (this.destroyed || !this._visible || openId !== this.openCount) return;
        const editing = this.Mode === 'edit';
        this.Title = editing ? this.Panel?.title ?? '' : '';
        this.readQueryOptions(editing ? this.Panel?.config ?? null : null);
        this.selectType(editing ? this.findEditedPartType() : this.TypeTiles[0] ?? null);
    }

    /** Removes the settings panel and drops a load that is still running. */
    private close(): void {
        this.loadCount++;
        this.destroyConfigPanel();
        this.SelectedPartType = null;
        this.IsLoadingPanel = false;
        this.LoadError = null;
        this.Errors = [];
        this.latestResult = null;
    }

    /** The part type of the edited part, from {@link PartTypes}. */
    private findEditedPartType(): MJDashboardPartTypeEntity | null {
        const partTypeId = this.Panel?.partTypeId;
        if (!partTypeId) return null;
        return this.PartTypes.find(pt => UUIDsEqual(pt.ID, partTypeId)) ?? null;
    }

    /** Reads the query options from a part's config. A new part (no config) gets the defaults. */
    private readQueryOptions(config: PanelConfig | null): void {
        const showParameterControls = config?.['showParameterControls'];
        const seconds = config?.['autoRefreshSeconds'];
        const refreshSeconds = typeof seconds === 'number' && seconds > 0 ? seconds : 0;
        this.ShowParameterControls = typeof showParameterControls === 'boolean' ? showParameterControls : true;
        this.AutoRefreshEnabled = refreshSeconds > 0;
        this.AutoRefreshSeconds = refreshSeconds > 0 ? refreshSeconds : DEFAULT_QUERY_REFRESH_SECONDS;
        this.refreshChoices = refreshSeconds > 0 && !QUERY_REFRESH_SECONDS.some(choice => choice === refreshSeconds)
            ? [...QUERY_REFRESH_SECONDS, refreshSeconds].sort((a, b) => a - b)
            : QUERY_REFRESH_SECONDS;
    }

    /** Makes a part type the chosen one and starts to load its settings panel. */
    private selectType(partType: MJDashboardPartTypeEntity | null): void {
        const loadId = ++this.loadCount;
        this.destroyConfigPanel();
        this.SelectedPartType = partType;
        this.SourceName = partType ? this.TileLabel(partType) : '';
        this.latestResult = null;
        this.Errors = [];
        this.LoadError = null;
        const className = this.configDialogClassOf(partType);
        this.IsLoadingPanel = className != null;
        // Renders the Source section now, so its container exists when the panel class arrives.
        this.cdr.detectChanges();
        if (partType && className) {
            void this.loadConfigPanel(partType, className, loadId);
        }
    }

    /**
     * Creates the part type's settings panel in the Source section. A load that a newer load or a
     * close overtook is dropped. When the panel cannot be created, the dialog says why and still
     * submits: with a config that names only the part type (add mode) or the part's current config (edit mode).
     */
    private async loadConfigPanel(partType: MJDashboardPartTypeEntity, className: string, loadId: number): Promise<void> {
        try {
            const registration = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(BaseConfigPanel, className);
            if (loadId !== this.loadCount) return;
            const container = this.configPanelContainer;
            if (!registration || !container) {
                this.failPanelLoad(registration ? `The settings panel "${className}" could not be shown.` : `The settings panel "${className}" is not registered.`);
                return;
            }

            container.clear();
            const ref = container.createComponent<BaseConfigPanel>(registration.SubClass);
            this.configPanelRef = ref;
            const panel = ref.instance;
            panel.Provider = this.Provider;
            panel.ShowCommonFields = false;
            panel.partType = partType;
            if (this.Mode === 'edit' && this.Panel) {
                panel.panel = this.Panel;
                panel.config = this.Panel.config;
            }
            this.configChangedSubscription = panel.configChanged.subscribe(result => this.OnConfigChanged(result));
            this.SourceName = panel.getDefaultTitle();
            this.IsLoadingPanel = false;
            this.cdr.detectChanges();
        } catch (error) {
            if (loadId !== this.loadCount) return;
            this.failPanelLoad(`The settings panel "${className}" could not load (${error instanceof Error ? error.message : String(error)}).`);
        }
    }

    /** Shows why the settings panel could not load, and what Add part or Apply does without it. */
    private failPanelLoad(reason: string): void {
        this.destroyConfigPanel();
        this.IsLoadingPanel = false;
        const fallback = this.Mode === 'edit' ? 'Apply keeps the part\'s current settings.' : 'The part is added with default settings.';
        this.LoadError = `${reason} ${fallback}`;
        this.cdr.detectChanges();
    }

    /**
     * Takes a new source name. A title that is the old source name follows the new one, as the
     * settings panels' own title fields do; a title the user changed stays.
     */
    private setSourceName(sourceName: string): void {
        const title = this.Title.trim();
        if (title !== '' && title === this.SourceName) {
            this.Title = sourceName;
        }
        this.SourceName = sourceName;
    }

    /** The registered class name of a part type's settings panel, if it has one. */
    private configDialogClassOf(partType: MJDashboardPartTypeEntity | null): string | null {
        return partType?.ConfigDialogClass?.trim() || null;
    }

    private destroyConfigPanel(): void {
        this.configChangedSubscription?.unsubscribe();
        this.configChangedSubscription = null;
        this.configPanelRef?.destroy();
        this.configPanelRef = null;
    }
}
