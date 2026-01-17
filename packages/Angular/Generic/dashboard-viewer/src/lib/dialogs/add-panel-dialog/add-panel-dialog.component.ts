import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    ViewChild
} from '@angular/core';
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import {
    PanelConfig,
    createDefaultCustomPanelConfig
} from '../../models/dashboard-types';
import { BaseConfigPanel, ConfigPanelResult } from '../../config-panels/base-config-panel';
import { WebURLConfigPanelComponent } from '../../config-panels/weburl-config-panel.component';
import { ViewConfigPanelComponent } from '../../config-panels/view-config-panel.component';
import { QueryConfigPanelComponent } from '../../config-panels/query-config-panel.component';
import { ArtifactConfigPanelComponent } from '../../config-panels/artifact-config-panel.component';

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
 * Two-step flow: first select the part type, then configure using embedded config panels.
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
    // ViewChild references to config panels
    // ========================================

    @ViewChild(WebURLConfigPanelComponent) webUrlPanel?: WebURLConfigPanelComponent;
    @ViewChild(ViewConfigPanelComponent) viewPanel?: ViewConfigPanelComponent;
    @ViewChild(QueryConfigPanelComponent) queryPanel?: QueryConfigPanelComponent;
    @ViewChild(ArtifactConfigPanelComponent) artifactPanel?: ArtifactConfigPanelComponent;

    // ========================================
    // State
    // ========================================

    public step: DialogStep = 'select-type';
    public selectedPartType: DashboardPartTypeEntity | null = null;

    /** Current config panel result (updated via configChanged event) */
    public currentResult: ConfigPanelResult | null = null;

    /** Whether the Add Part button should be enabled */
    public canAddPart = false;

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
        this.currentResult = null;
        this.canAddPart = false;
        this.cdr.detectChanges();
    }

    /**
     * Select a part type and go to configuration step
     */
    public onPartTypeSelect(partType: DashboardPartTypeEntity): void {
        this.selectedPartType = partType;
        this.currentResult = null;
        this.canAddPart = false;
        this.step = 'configure';
        this.cdr.detectChanges();
    }

    /**
     * Go back to type selection
     */
    public goBack(): void {
        this.step = 'select-type';
        this.currentResult = null;
        this.canAddPart = false;
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

        // Get the active config panel
        const panel = this.getActiveConfigPanel();
        if (!panel) {
            // Handle custom/unknown types without a panel
            this.panelAdded.emit({
                partType: this.selectedPartType,
                config: createDefaultCustomPanelConfig(),
                title: this.selectedPartType.Name,
                icon: this.selectedPartType.Icon || 'fa-solid fa-puzzle-piece'
            });
            this.reset();
            return;
        }

        // Get the final result from the panel
        const result = panel.getResult();

        if (!result.isValid) {
            // Validation failed - don't emit
            this.currentResult = result;
            this.canAddPart = false;
            this.cdr.detectChanges();
            return;
        }

        this.panelAdded.emit({
            partType: this.selectedPartType,
            config: result.config,
            title: result.title,
            icon: result.icon || this.selectedPartType.Icon || 'fa-solid fa-puzzle-piece'
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
     * Check if the selected part type is a known type with a config panel
     */
    public isKnownPartType(): boolean {
        if (!this.selectedPartType) return false;
        const name = this.selectedPartType.Name;
        return ['WebURL', 'View', 'Query', 'Artifact'].includes(name);
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Get the currently active config panel based on selected part type
     */
    private getActiveConfigPanel(): BaseConfigPanel | null {
        if (!this.selectedPartType) return null;

        switch (this.selectedPartType.Name) {
            case 'WebURL':
                return this.webUrlPanel || null;
            case 'View':
                return this.viewPanel || null;
            case 'Query':
                return this.queryPanel || null;
            case 'Artifact':
                return this.artifactPanel || null;
            default:
                return null;
        }
    }
}
