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
    AfterViewInit
} from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import { PanelConfig, DashboardPanel } from '../../models/dashboard-types';
import { BaseConfigPanel, ConfigPanelResult } from '../../config-panels/base-config-panel';

/**
 * Result from the edit part dialog
 */
export interface EditPartDialogResult {
    /** The updated panel configuration */
    Config: PanelConfig;
    /** Updated title */
    Title: string;
    /** Updated icon (optional) */
    Icon?: string;
}

/**
 * Generic dialog for editing dashboard part configuration.
 *
 * This dialog dynamically loads the appropriate config panel based on the
 * DashboardPartType.ConfigDialogClass field, using MJGlobal.ClassFactory.
 *
 * This allows new part types to be added without modifying this dialog -
 * just create a config panel, register it, and set the ConfigDialogClass.
 */
@Component({
  standalone: false,
    selector: 'mj-edit-part-dialog',
    templateUrl: './edit-part-dialog.component.html',
    styleUrls: ['./edit-part-dialog.component.css']
})
export class EditPartDialogComponent implements OnDestroy, AfterViewInit {
    /**
     * Whether the dialog is visible
     */
    @Input()
    set Visible(value: boolean) {
        const previous = this._visible;
        this._visible = value;
        if (value && !previous) {
            this.onDialogOpened();
            // Delay loadConfigPanel to next tick to ensure all inputs are set
            // Angular doesn't guarantee input order, so PartType might not be set yet
            if (this.viewInitialized) {
                setTimeout(() => this.loadConfigPanel(), 0);
            }
        } else if (!value && previous) {
            this.onDialogClosed();
        }
    }
    get Visible(): boolean {
        return this._visible;
    }
    private _visible = false;

    /**
     * The part type being configured
     */
    @Input() PartType: DashboardPartTypeEntity | null = null;

    /**
     * The panel being edited
     */
    @Input() Panel: DashboardPanel | null = null;

    /**
     * The current configuration
     */
    @Input() Config: PanelConfig | null = null;

    /**
     * Emitted when configuration is saved
     */
    @Output() Saved = new EventEmitter<EditPartDialogResult>();

    /**
     * Emitted when dialog is cancelled
     */
    @Output() Cancelled = new EventEmitter<void>();

    /**
     * Container for dynamically loaded config panel
     */
    @ViewChild('configPanelContainer', { read: ViewContainerRef, static: false })
    configPanelContainer!: ViewContainerRef;

    /**
     * Reference to the dynamically created config panel component
     */
    private configPanelRef: ComponentRef<BaseConfigPanel> | null = null;

    /**
     * Track validity from the embedded panel
     */
    public IsValid = false;

    /**
     * Store the latest result from the panel
     */
    private latestResult: ConfigPanelResult | null = null;

    /**
     * Error message if panel failed to load
     */
    public LoadError: string | null = null;

    /**
     * Whether the panel is loading
     */
    public IsLoading = false;

    private viewInitialized = false;

    constructor(private cdr: ChangeDetectorRef) {}

    ngAfterViewInit(): void {
        this.viewInitialized = true;
        if (this.Visible) {
            this.loadConfigPanel();
        }
    }

    ngOnDestroy(): void {
        this.destroyConfigPanel();
    }

    /**
     * Called when dialog opens
     */
    private onDialogOpened(): void {
        this.IsValid = false;
        this.latestResult = null;
        this.LoadError = null;

        if (this.viewInitialized) {
            this.loadConfigPanel();
        }
    }

    /**
     * Called when dialog closes
     */
    private onDialogClosed(): void {
        this.destroyConfigPanel();
    }

    /**
     * Dynamically load the config panel component
     */
    private loadConfigPanel(): void {
        this.destroyConfigPanel();
        this.LoadError = null; // Clear any previous error

        console.log('[EditPartDialog] loadConfigPanel() called');
        console.log('[EditPartDialog] PartType:', this.PartType?.Name);
        console.log('[EditPartDialog] ConfigDialogClass:', this.PartType?.ConfigDialogClass);

        if (!this.PartType?.ConfigDialogClass) {
            // No config class specified - this is okay for simple part types
            // Just enable the save button with default config
            console.log('[EditPartDialog] No ConfigDialogClass specified, using default');
            this.IsValid = true;
            this.cdr.detectChanges();
            return;
        }

        if (!this.configPanelContainer) {
            // Container not ready yet - will be called again from ngAfterViewInit
            console.log('[EditPartDialog] Container not ready yet');
            return;
        }

        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            // Use ClassFactory to create the config panel instance
            console.log('[EditPartDialog] Attempting to create instance via ClassFactory:', this.PartType.ConfigDialogClass);
            const panelInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseConfigPanel>(
                BaseConfigPanel,
                this.PartType.ConfigDialogClass
            );

            console.log('[EditPartDialog] ClassFactory returned:', panelInstance);

            if (!panelInstance) {
                this.LoadError = `Could not create config panel: ${this.PartType.ConfigDialogClass}`;
                console.error('[EditPartDialog]', this.LoadError);
                this.IsLoading = false;
                this.IsValid = true; // Allow saving with default config
                this.cdr.detectChanges();
                return;
            }

            // Get the component class from the instance
            // We need to find the Angular component class that was registered
            const componentClass = (panelInstance as object).constructor as typeof BaseConfigPanel;
            console.log('[EditPartDialog] Component class:', componentClass.name);

            // Clear the container and create the component
            this.configPanelContainer.clear();
            this.configPanelRef = this.configPanelContainer.createComponent(componentClass as never);
            console.log('[EditPartDialog] Component created successfully');

            // Set inputs on the component
            const panel = this.configPanelRef.instance;
            panel.partType = this.PartType;
            panel.panel = this.Panel;
            panel.config = this.Config;

            // Subscribe to config changes
            panel.configChanged.subscribe((result: ConfigPanelResult) => {
                this.onConfigChanged(result);
            });

            this.IsLoading = false;
            this.LoadError = null; // Ensure error is cleared on success
            this.cdr.detectChanges();

        } catch (error) {
            this.LoadError = `Failed to load config panel: ${error instanceof Error ? error.message : String(error)}`;
            console.error('[EditPartDialog]', this.LoadError, error);
            this.IsLoading = false;
            this.IsValid = true; // Allow saving with default config
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

    /**
     * Handle configuration changes from the embedded panel
     */
    public onConfigChanged(result: ConfigPanelResult): void {
        this.latestResult = result;
        this.IsValid = result.isValid;
        this.cdr.detectChanges();
    }

    /**
     * Get the dialog title based on part type
     */
    public getDialogTitle(): string {
        const partName = this.PartType?.Name || 'Part';
        return this.Panel ? `Configure ${partName}` : `Add ${partName}`;
    }

    /**
     * Get the part type icon
     */
    public getIcon(): string {
        return this.PartType?.Icon || 'fa-solid fa-puzzle-piece';
    }

    /**
     * Save the configuration
     */
    public save(): void {
        if (!this.IsValid || !this.latestResult) {
            return;
        }

        this.Saved.emit({
            Config: this.latestResult.config,
            Title: this.latestResult.title,
            Icon: this.latestResult.icon
        });
    }

    /**
     * Cancel and close the dialog
     */
    public cancel(): void {
        this.Cancelled.emit();
    }

    /**
     * Get save button text
     */
    public getSaveButtonText(): string {
        return this.Panel ? 'Save Changes' : 'Add Part';
    }
}
