import { Input, Output, EventEmitter, ChangeDetectorRef, Directive } from '@angular/core';
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import { PanelConfig, DashboardPanel } from '../models/dashboard-types';

/**
 * Result emitted when configuration changes or is validated
 */
export interface ConfigPanelResult {
    /** The current panel configuration */
    config: PanelConfig;
    /** Current title */
    title: string;
    /** Current icon */
    icon?: string;
    /** Whether the configuration is valid */
    isValid: boolean;
    /** Validation errors (if any) */
    errors: string[];
}

/**
 * Base class for config panels.
 * Config panels contain ONLY the form content - no dialog chrome (header, footer, buttons).
 * They communicate with their container via the configChanged output.
 *
 * This allows the same panel to be used:
 * 1. Embedded in the add-panel-dialog (step 2)
 * 2. Wrapped in a dialog for editing existing panels
 *
 * Subclasses are registered with @RegisterClass and instantiated via ClassFactory.
 */
@Directive()
export abstract class BaseConfigPanel {
    /** The part type being configured */
    @Input() partType: DashboardPartTypeEntity | null = null;

    /** The existing panel (for editing) or null (for creating) */
    @Input() panel: DashboardPanel | null = null;

    /** The initial configuration to populate form fields */
    @Input()
    set config(value: PanelConfig | null) {
        if (value !== this._config) {
            this._config = value;
            this.initFromConfig(value);
        }
    }
    get config(): PanelConfig | null {
        return this._config;
    }
    private _config: PanelConfig | null = null;

    /**
     * Emitted when configuration changes.
     * Container should listen to this to update save button state, etc.
     */
    @Output() configChanged = new EventEmitter<ConfigPanelResult>();

    constructor(protected cdr: ChangeDetectorRef) {}

    /**
     * Initialize form fields from a configuration.
     * Called when config input changes.
     */
    public abstract initFromConfig(config: PanelConfig | null): void;

    /**
     * Build the configuration object from current form values.
     */
    public abstract buildConfig(): PanelConfig;

    /**
     * Validate the current form values.
     * @returns Validation result with valid flag and error messages
     */
    public validate(): { valid: boolean; errors: string[] } {
        return { valid: true, errors: [] };
    }

    /**
     * Get the current title for the panel.
     */
    public abstract getTitle(): string;

    /**
     * Get the default title for this part type.
     */
    public abstract getDefaultTitle(): string;

    /**
     * Get the current icon for the panel.
     */
    public getIcon(): string {
        return this.panel?.icon || this.getDefaultIcon();
    }

    /**
     * Get the default icon for this part type.
     */
    public getDefaultIcon(): string {
        return this.partType?.Icon || 'fa-solid fa-puzzle-piece';
    }

    /**
     * Get the current configuration result.
     * Called by container to get the final config when saving.
     */
    public getResult(): ConfigPanelResult {
        const validation = this.validate();
        return {
            config: this.buildConfig(),
            title: this.getTitle(),
            icon: this.getIcon(),
            isValid: validation.valid,
            errors: validation.errors
        };
    }

    /**
     * Emit configuration changed event.
     * Call this whenever form values change.
     */
    protected emitConfigChanged(): void {
        this.configChanged.emit(this.getResult());
    }
}
