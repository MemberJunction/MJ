import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import { PanelConfig, DashboardPanel } from '../models/dashboard-types';

/**
 * Result from a config dialog
 */
export interface ConfigDialogResult {
    /** The updated panel configuration */
    config: PanelConfig;
    /** Updated title (optional) */
    title?: string;
    /** Updated icon (optional) */
    icon?: string;
}

/**
 * Base class for part config dialogs.
 * Subclasses are registered with @RegisterClass and instantiated via ClassFactory.
 *
 * Each part type (View, Query, Artifact, WebURL) has its own config dialog
 * that extends this base class and provides a custom UI for that type.
 */
@Component({ template: '' })
export abstract class BaseConfigDialog {
    /** Whether the dialog is visible */
    @Input() visible = false;

    /** The part type being configured */
    @Input() partType: DashboardPartTypeEntity | null = null;

    /** The existing panel (for editing) or null (for creating) */
    @Input() panel: DashboardPanel | null = null;

    /** The current configuration */
    @Input() config: PanelConfig | null = null;

    /** Emitted when configuration is saved */
    @Output() saved = new EventEmitter<ConfigDialogResult>();

    /** Emitted when dialog is cancelled */
    @Output() cancelled = new EventEmitter<void>();

    constructor(protected cdr: ChangeDetectorRef) {}

    /**
     * Initialize the dialog with a configuration.
     * Override to populate form fields from config.
     */
    public abstract initFromConfig(config: PanelConfig | null): void;

    /**
     * Build the configuration from form fields.
     * Override to create the config object from form values.
     */
    public abstract buildConfig(): PanelConfig;

    /**
     * Validate the current form values.
     * Override to add custom validation.
     */
    public validate(): { valid: boolean; errors: string[] } {
        return { valid: true, errors: [] };
    }

    /**
     * Get the default title for this part type.
     */
    public abstract getDefaultTitle(): string;

    /**
     * Get the default icon for this part type.
     */
    public getDefaultIcon(): string {
        return this.partType?.Icon || 'fa-solid fa-puzzle-piece';
    }

    /**
     * Save the configuration and close the dialog.
     */
    public save(): void {
        const validation = this.validate();
        if (!validation.valid) {
            // Show validation errors - subclass can override for custom handling
            console.warn('Validation errors:', validation.errors);
            return;
        }

        const result: ConfigDialogResult = {
            config: this.buildConfig(),
            title: this.getTitle(),
            icon: this.getIcon()
        };

        this.saved.emit(result);
    }

    /**
     * Cancel and close the dialog.
     */
    public cancel(): void {
        this.cancelled.emit();
    }

    /**
     * Get the current title. Override if title is editable.
     */
    protected getTitle(): string {
        return this.panel?.title || this.getDefaultTitle();
    }

    /**
     * Get the current icon. Override if icon is editable.
     */
    protected getIcon(): string {
        return this.panel?.icon || this.getDefaultIcon();
    }
}
