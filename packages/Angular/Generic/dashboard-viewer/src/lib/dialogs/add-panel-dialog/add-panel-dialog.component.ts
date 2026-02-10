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
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import { PanelConfig } from '../../models/dashboard-types';
import { BaseConfigPanel, ConfigPanelResult } from '../../config-panels/base-config-panel';

/**
 * Result when a panel is added
 */
export interface AddPanelResult {
    PartType: DashboardPartTypeEntity;
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
    @Input() partTypes: DashboardPartTypeEntity[] = [];

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
    @Output() panelAdded = new EventEmitter<AddPanelResult>();

    /** Emitted when the dialog is cancelled */
    @Output() cancelled = new EventEmitter<void>();

    // ========================================
    // ViewChild for dynamic component loading
    // ========================================

    @ViewChild('configPanelContainer', { read: ViewContainerRef, static: false })
    configPanelContainer!: ViewContainerRef;

    // ========================================
    // State
    // ========================================

    public step: DialogStep = 'select-type';
    public selectedPartType: DashboardPartTypeEntity | null = null;

    /** Current config panel result (updated via configChanged event) */
    public currentResult: ConfigPanelResult | null = null;

    /** Whether the Add Part button should be enabled */
    public canAddPart = false;

    /** Reference to dynamically created config panel */
    private configPanelRef: ComponentRef<BaseConfigPanel> | null = null;

    /** Whether the view has been initialized */
    private viewInitialized = false;

    /** Error loading the config panel */
    public loadError: string | null = null;

    /** Whether config panel is loading */
    public isLoadingPanel = false;

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
    public reset(): void {
        this.step = 'select-type';
        this.selectedPartType = null;
        this.currentResult = null;
        this.canAddPart = false;
        this.loadError = null;
        this.isLoadingPanel = false;
        this.destroyConfigPanel();
        this.cdr.detectChanges();
    }

    /**
     * Select a part type and go to configuration step
     */
    public onPartTypeSelect(partType: DashboardPartTypeEntity): void {
        this.selectedPartType = partType;
        this.currentResult = null;
        this.canAddPart = false;
        this.loadError = null;
        this.step = 'configure';
        this.cdr.detectChanges();

        // Load the config panel after view updates
        setTimeout(() => this.loadConfigPanel(), 0);
    }

    /**
     * Go back to type selection
     */
    public goBack(): void {
        this.step = 'select-type';
        this.currentResult = null;
        this.canAddPart = false;
        this.loadError = null;
        this.destroyConfigPanel();
        this.cdr.detectChanges();
    }

    /**
     * Handle config changes from embedded config panel
     */
    public onConfigChanged(result: ConfigPanelResult): void {
        this.currentResult = result;
        this.canAddPart = result.isValid;
        this.cdr.detectChanges();
    }

    /**
     * Add the configured part
     */
    public addPart(): void {
        if (!this.selectedPartType) return;

        // Get result from the dynamic panel
        if (this.configPanelRef) {
            const panel = this.configPanelRef.instance;
            const result = panel.getResult();

            if (!result.isValid) {
                this.currentResult = result;
                this.canAddPart = false;
                this.cdr.detectChanges();
                return;
            }

            this.panelAdded.emit({
                PartType: this.selectedPartType,
                Config: result.config,
                Title: result.title,
                Icon: result.icon || this.selectedPartType.Icon || 'fa-solid fa-puzzle-piece'
            });

            this.reset();
            return;
        }

        // Handle types without a config panel - use a generic config with just the type
        this.panelAdded.emit({
            PartType: this.selectedPartType,
            Config: { type: this.selectedPartType.Name },
            Title: this.selectedPartType.Name,
            Icon: this.selectedPartType.Icon || 'fa-solid fa-puzzle-piece'
        });
        this.reset();
    }

    /**
     * Cancel the dialog
     */
    public onCancel(): void {
        this.reset();
        this.cancelled.emit();
    }

    /**
     * Get the configuration type name
     */
    public getConfigTypeName(): string {
        if (!this.selectedPartType) return '';
        const name = this.selectedPartType.Name;
        if (name === 'WebURL') return 'Web URL';
        return name;
    }

    /**
     * Check if the selected part type has a config panel class
     */
    public hasConfigPanel(): boolean {
        return !!this.selectedPartType?.ConfigDialogClass;
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Dynamically load the config panel component
     */
    private loadConfigPanel(): void {
        this.destroyConfigPanel();

        if (!this.selectedPartType?.ConfigDialogClass) {
            // No config panel for this type - that's okay, use defaults
            this.canAddPart = true;
            this.cdr.detectChanges();
            return;
        }

        if (!this.viewInitialized || !this.configPanelContainer) {
            this.loadError = 'View container not ready';
            this.cdr.detectChanges();
            return;
        }

        this.isLoadingPanel = true;
        this.cdr.detectChanges();

        try {
            // Use ClassFactory to create the config panel instance
            const panelInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseConfigPanel>(
                BaseConfigPanel,
                this.selectedPartType.ConfigDialogClass
            );

            if (!panelInstance) {
                this.loadError = `Could not create config panel: ${this.selectedPartType.ConfigDialogClass}`;
                this.isLoadingPanel = false;
                this.canAddPart = true; // Allow adding with default config
                this.cdr.detectChanges();
                return;
            }

            // Get the component class from the instance
            const componentClass = (panelInstance as object).constructor as typeof BaseConfigPanel;

            // Clear the container and create the component
            this.configPanelContainer.clear();
            this.configPanelRef = this.configPanelContainer.createComponent(componentClass as never);

            // Set inputs on the component
            const panel = this.configPanelRef.instance;
            panel.partType = this.selectedPartType;
            panel.panel = null; // New panel, not editing
            panel.config = null; // Start with defaults

            // Subscribe to config changes
            panel.configChanged.subscribe((result: ConfigPanelResult) => {
                this.onConfigChanged(result);
            });

            this.isLoadingPanel = false;
            this.cdr.detectChanges();

        } catch (error) {
            this.loadError = `Failed to load config panel: ${error instanceof Error ? error.message : String(error)}`;
            this.isLoadingPanel = false;
            this.canAddPart = true; // Allow adding with default config
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
