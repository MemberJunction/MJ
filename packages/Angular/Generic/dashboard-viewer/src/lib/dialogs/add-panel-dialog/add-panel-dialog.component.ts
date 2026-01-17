import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef
} from '@angular/core';
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import {
    PanelConfig,
    createDefaultViewPanelConfig,
    createDefaultQueryPanelConfig,
    createDefaultArtifactPanelConfig,
    createDefaultWebURLPanelConfig,
    createDefaultCustomPanelConfig,
    WebURLPanelConfig,
    ViewPanelConfig,
    QueryPanelConfig,
    ArtifactPanelConfig
} from '../../models/dashboard-types';

/**
 * Result when a panel is added
 */
export interface AddPanelResult {
    partType: DashboardPartTypeEntity;
    config: PanelConfig;
    title: string;
    icon?: string;
}

/**
 * Dialog step type
 */
type DialogStep = 'select-type' | 'configure';

/**
 * Dialog for adding a new part to the dashboard.
 * Two-step flow: first select the part type, then configure it.
 */
@Component({
    selector: 'mj-add-panel-dialog',
    templateUrl: './add-panel-dialog.component.html',
    styleUrls: ['./add-panel-dialog.component.css']
})
export class AddPanelDialogComponent {
    // ========================================
    // Inputs
    // ========================================

    /** Available part types to choose from */
    @Input() partTypes: DashboardPartTypeEntity[] = [];

    /** Whether the dialog is visible */
    @Input() visible = false;

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when a part is configured and ready to add */
    @Output() panelAdded = new EventEmitter<AddPanelResult>();

    /** Emitted when the dialog is cancelled */
    @Output() cancelled = new EventEmitter<void>();

    // ========================================
    // State
    // ========================================

    public step: DialogStep = 'select-type';
    public selectedPartType: DashboardPartTypeEntity | null = null;
    public partTitle = '';
    public config: PanelConfig | null = null;

    // WebURL specific config fields
    public webUrlValue = '';
    public webUrlSandboxMode: 'standard' | 'strict' | 'permissive' = 'standard';

    // View specific config fields
    public viewEntityName = '';
    public viewDisplayMode: 'grid' | 'cards' | 'timeline' = 'grid';

    // Query specific config fields
    public queryName = '';

    // Artifact specific config fields
    public artifactId = '';

    // ========================================
    // Constructor
    // ========================================

    constructor(private readonly cdr: ChangeDetectorRef) {}

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Reset the dialog to initial state
     */
    public reset(): void {
        this.step = 'select-type';
        this.selectedPartType = null;
        this.partTitle = '';
        this.config = null;
        this.webUrlValue = '';
        this.webUrlSandboxMode = 'standard';
        this.viewEntityName = '';
        this.viewDisplayMode = 'grid';
        this.queryName = '';
        this.artifactId = '';
        this.cdr.detectChanges();
    }

    /**
     * Select a part type and go to configuration step
     */
    public onPartTypeSelect(partType: DashboardPartTypeEntity): void {
        this.selectedPartType = partType;
        this.partTitle = partType.Name;
        this.initializeConfigForType(partType);
        this.step = 'configure';
        this.cdr.detectChanges();
    }

    /**
     * Go back to type selection
     */
    public goBack(): void {
        this.step = 'select-type';
        this.cdr.detectChanges();
    }

    /**
     * Add the configured part
     */
    public addPart(): void {
        if (!this.selectedPartType) return;

        // Build the final config from form values
        const finalConfig = this.buildFinalConfig();

        this.panelAdded.emit({
            partType: this.selectedPartType,
            config: finalConfig,
            title: this.partTitle || this.selectedPartType.Name,
            icon: this.selectedPartType.Icon || 'fa-solid fa-puzzle-piece'
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

    // ========================================
    // Private Methods
    // ========================================

    private initializeConfigForType(partType: DashboardPartTypeEntity): void {
        const typeName = partType.Name;

        switch (typeName) {
            case 'View':
                this.config = createDefaultViewPanelConfig();
                break;
            case 'Query':
                this.config = createDefaultQueryPanelConfig();
                break;
            case 'Artifact':
                this.config = createDefaultArtifactPanelConfig();
                break;
            case 'WebURL':
                this.config = createDefaultWebURLPanelConfig();
                break;
            default:
                this.config = createDefaultCustomPanelConfig();
        }
    }

    private buildFinalConfig(): PanelConfig {
        if (!this.selectedPartType || !this.config) {
            return createDefaultCustomPanelConfig();
        }

        const typeName = this.selectedPartType.Name;

        switch (typeName) {
            case 'WebURL':
                return {
                    type: 'WebURL',
                    url: this.webUrlValue,
                    sandboxMode: this.webUrlSandboxMode,
                    allowFullscreen: true,
                    refreshOnResize: false
                } as WebURLPanelConfig;

            case 'View':
                return {
                    type: 'View',
                    entityName: this.viewEntityName,
                    displayMode: this.viewDisplayMode,
                    allowModeSwitch: true,
                    enableSelection: true,
                    selectionMode: 'single'
                } as ViewPanelConfig;

            case 'Query':
                return {
                    type: 'Query',
                    queryName: this.queryName,
                    showParameterControls: true,
                    parameterLayout: 'header',
                    autoRefreshSeconds: 0,
                    showExecutionMetadata: true
                } as QueryPanelConfig;

            case 'Artifact':
                return {
                    type: 'Artifact',
                    artifactId: this.artifactId,
                    showVersionSelector: true,
                    showMetadata: false
                } as ArtifactPanelConfig;

            default:
                return {
                    type: 'Custom',
                    driverClass: this.selectedPartType.DriverClass || ''
                };
        }
    }
}
