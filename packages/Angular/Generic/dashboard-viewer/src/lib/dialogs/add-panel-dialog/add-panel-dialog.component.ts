import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    ViewChild,
    ViewContainerRef,
    ComponentRef,
    AfterViewInit,
    OnDestroy
} from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { PanelConfig } from '../../models/dashboard-types';
import { BaseConfigPanel, ConfigPanelResult } from '../../config-panels/base-config-panel';

/**
 * Result when a panel is added
 */
export interface AddPanelResult {
    PartType: MJDashboardPartTypeEntity;
    Config: PanelConfig;
    Title: string;
    Icon?: string;
}

/**
 * Dialog step type
 */
type DialogStep = 'select-type' | 'configure';

/**
 * Dialog for adding a new part to the dashboard.
 * Two-step flow: first select the part type, then configure using dynamically loaded config panels.
 *
 * Config panels are loaded via ClassFactory using DashboardPartType.ConfigDialogClass,
 * allowing new part types to be added without modifying this component.
 */
@Component({
  standalone: false,
    selector: 'mj-add-panel-dialog',
    templateUrl: './add-panel-dialog.component.html',
    styleUrls: ['./add-panel-dialog.component.css']
})
export class AddPanelDialogComponent implements AfterViewInit, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    /** Available part types to choose from */
    @Input() PartTypes: MJDashboardPartTypeEntity[] = [];

    /** @deprecated Use {@link PartTypes}. */
    @Input() set partTypes(value: MJDashboardPartTypeEntity[]) {
      this.PartTypes = value;
    }
    /** @deprecated Use {@link PartTypes}. */
    get partTypes(): MJDashboardPartTypeEntity[] {
      return this.PartTypes;
    }

    /** Whether the dialog is visible */
    @Input()
    set visible(value: boolean) {
        const previous = this._visible;
        this._visible = value;
        if (!value && previous) {
            // Dialog closing - cleanup
            this.destroyConfigPanel();
        }
    }
    get visible(): boolean {
        return this._visible;
    }
    private _visible = false;

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when a part is configured and ready to add */
    @Output() PanelAdded = new EventEmitter<AddPanelResult>();

    /**
     * @deprecated Use {@link PanelAdded}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (panelAdded) keeps working. Must stay AFTER PanelAdded: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() panelAdded = this.PanelAdded;

    /** Emitted when the dialog is cancelled */
    @Output() cancelled = new EventEmitter<void>();

    // ========================================
    // ViewChild for dynamic component loading
    // ========================================

    @ViewChild('configPanelContainer', { read: ViewContainerRef, static: false })
    ConfigPanelContainer!: ViewContainerRef;

    /** @deprecated Use {@link ConfigPanelContainer}. */
    get configPanelContainer(): ViewContainerRef {
      return this.ConfigPanelContainer;
    }
    /** @deprecated Use {@link ConfigPanelContainer}. */
    set configPanelContainer(value: ViewContainerRef) {
      this.ConfigPanelContainer = value;
    }

    // ========================================
    // State
    // ========================================

    public Step: DialogStep = 'select-type';

    /** @deprecated Use {@link Step}. */
    public get step(): DialogStep {
      return this.Step;
    }
    /** @deprecated Use {@link Step}. */
    public set step(value: DialogStep) {
      this.Step = value;
    }
    public SelectedPartType: MJDashboardPartTypeEntity | null = null;

    /** @deprecated Use {@link SelectedPartType}. */
    public get selectedPartType(): MJDashboardPartTypeEntity | null {
      return this.SelectedPartType;
    }
    /** @deprecated Use {@link SelectedPartType}. */
    public set selectedPartType(value: MJDashboardPartTypeEntity | null) {
      this.SelectedPartType = value;
    }

    /** Current config panel result (updated via configChanged event) */
    public CurrentResult: ConfigPanelResult | null = null;

    /** @deprecated Use {@link CurrentResult}. */
    public get currentResult(): ConfigPanelResult | null {
      return this.CurrentResult;
    }
    /** @deprecated Use {@link CurrentResult}. */
    public set currentResult(value: ConfigPanelResult | null) {
      this.CurrentResult = value;
    }

    /** Whether the Add Part button should be enabled */
    public CanAddPart = false;

    /** @deprecated Use {@link CanAddPart}. */
    public get canAddPart() {
      return this.CanAddPart;
    }
    /** @deprecated Use {@link CanAddPart}. */
    public set canAddPart(value) {
      this.CanAddPart = value;
    }

    /** Reference to dynamically created config panel */
    private configPanelRef: ComponentRef<BaseConfigPanel> | null = null;

    /** Whether the view has been initialized */
    private viewInitialized = false;

    /** Error loading the config panel */
    public loadError: string | null = null;

    /** Whether config panel is loading */
    public IsLoadingPanel = false;

    /** @deprecated Use {@link IsLoadingPanel}. */
    public get isLoadingPanel() {
      return this.IsLoadingPanel;
    }
    /** @deprecated Use {@link IsLoadingPanel}. */
    public set isLoadingPanel(value) {
      this.IsLoadingPanel = value;
    }

    // ========================================
    // Constructor
    // ========================================

    constructor(private readonly cdr: ChangeDetectorRef) {}

    // ========================================
    // Lifecycle
    // ========================================

    ngAfterViewInit(): void {
        this.viewInitialized = true;
    }

    ngOnDestroy(): void {
        this.destroyConfigPanel();
    }

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Reset the dialog to initial state
     */
    public Reset(): void {
        this.Step = 'select-type';
        this.SelectedPartType = null;
        this.CurrentResult = null;
        this.CanAddPart = false;
        this.loadError = null;
        this.IsLoadingPanel = false;
        this.destroyConfigPanel();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link Reset}. */
    public reset(): void {
      return this.Reset();
    }

    /**
     * Select a part type and go to configuration step
     */
    public OnPartTypeSelect(partType: MJDashboardPartTypeEntity): void {
        this.SelectedPartType = partType;
        this.CurrentResult = null;
        this.CanAddPart = false;
        this.loadError = null;
        this.Step = 'configure';
        this.cdr.detectChanges();

        // Load the config panel after view updates
        setTimeout(() => this.loadConfigPanel(), 0);
    }

    /** @deprecated Use {@link OnPartTypeSelect}. */
    public onPartTypeSelect(partType: MJDashboardPartTypeEntity): void {
      return this.OnPartTypeSelect(partType);
    }

    /**
     * Go back to type selection
     */
    public GoBack(): void {
        this.Step = 'select-type';
        this.CurrentResult = null;
        this.CanAddPart = false;
        this.loadError = null;
        this.destroyConfigPanel();
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link GoBack}. */
    public goBack(): void {
      return this.GoBack();
    }

    /**
     * Handle config changes from embedded config panel
     */
    public OnConfigChanged(result: ConfigPanelResult): void {
        this.CurrentResult = result;
        this.CanAddPart = result.isValid;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnConfigChanged}. */
    public onConfigChanged(result: ConfigPanelResult): void {
      return this.OnConfigChanged(result);
    }

    /**
     * Add the configured part
     */
    public AddPart(): void {
        if (!this.SelectedPartType) return;

        // Get result from the dynamic panel
        if (this.configPanelRef) {
            const panel = this.configPanelRef.instance;
            const result = panel.getResult();

            if (!result.isValid) {
                this.CurrentResult = result;
                this.CanAddPart = false;
                this.cdr.detectChanges();
                return;
            }

            this.PanelAdded.emit({
                PartType: this.SelectedPartType,
                Config: result.config,
                Title: result.title,
                Icon: result.icon || this.SelectedPartType.Icon || 'fa-solid fa-puzzle-piece'
            });

            this.Reset();
            return;
        }

        // Handle types without a config panel - use a generic config with just the type
        this.PanelAdded.emit({
            PartType: this.SelectedPartType,
            Config: { type: this.SelectedPartType.Name },
            Title: this.SelectedPartType.Name,
            Icon: this.SelectedPartType.Icon || 'fa-solid fa-puzzle-piece'
        });
        this.Reset();
    }

    /** @deprecated Use {@link AddPart}. */
    public addPart(): void {
      return this.AddPart();
    }

    /**
     * Cancel the dialog
     */
    public onCancel(): void {
        this.Reset();
        this.cancelled.emit();
    }

    /**
     * Get the configuration type name
     */
    public GetConfigTypeName(): string {
        if (!this.SelectedPartType) return '';
        const name = this.SelectedPartType.Name;
        if (name === 'WebURL') return 'Web URL';
        return name;
    }

    /** @deprecated Use {@link GetConfigTypeName}. */
    public getConfigTypeName(): string {
      return this.GetConfigTypeName();
    }

    /**
     * Check if the selected part type has a config panel class
     */
    public HasConfigPanel(): boolean {
        return !!this.SelectedPartType?.ConfigDialogClass;
    }

    /** @deprecated Use {@link HasConfigPanel}. */
    public hasConfigPanel(): boolean {
      return this.HasConfigPanel();
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Dynamically load the config panel component
     */
    private async loadConfigPanel(): Promise<void> {
        this.destroyConfigPanel();

        if (!this.SelectedPartType?.ConfigDialogClass) {
            // No config panel for this type - that's okay, use defaults
            this.CanAddPart = true;
            this.cdr.detectChanges();
            return;
        }

        if (!this.viewInitialized || !this.ConfigPanelContainer) {
            this.loadError = 'View container not ready';
            this.cdr.detectChanges();
            return;
        }

        this.IsLoadingPanel = true;
        this.cdr.detectChanges();

        try {
            // Use ClassFactory to create the config panel instance
            const panelInstance = await MJGlobal.Instance.ClassFactory.CreateInstanceAsync<BaseConfigPanel>(
                BaseConfigPanel,
                this.SelectedPartType.ConfigDialogClass
            );

            if (!panelInstance) {
                this.loadError = `Could not create config panel: ${this.SelectedPartType.ConfigDialogClass}`;
                this.IsLoadingPanel = false;
                this.CanAddPart = true; // Allow adding with default config
                this.cdr.detectChanges();
                return;
            }

            // Get the component class from the instance
            const componentClass = (panelInstance as object).constructor as typeof BaseConfigPanel;

            // Clear the container and create the component
            this.ConfigPanelContainer.clear();
            this.configPanelRef = this.ConfigPanelContainer.createComponent(componentClass as never);

            // Set inputs on the component
            const panel = this.configPanelRef.instance;
            panel.partType = this.SelectedPartType;
            panel.panel = null; // New panel, not editing
            panel.config = null; // Start with defaults

            // Subscribe to config changes
            panel.configChanged.subscribe((result: ConfigPanelResult) => {
                this.OnConfigChanged(result);
            });

            this.IsLoadingPanel = false;
            this.cdr.detectChanges();

        } catch (error) {
            this.loadError = `Failed to load config panel: ${error instanceof Error ? error.message : String(error)}`;
            this.IsLoadingPanel = false;
            this.CanAddPart = true; // Allow adding with default config
            this.cdr.detectChanges();
        }
    }

    /**
     * Destroy the dynamically created config panel
     */
    private destroyConfigPanel(): void {
        if (this.configPanelRef) {
            this.configPanelRef.destroy();
            this.configPanelRef = null;
        }
    }
}
