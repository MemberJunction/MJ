import { Component, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigDialog } from './base-config-dialog';
import { PanelConfig, ViewPanelConfig, createDefaultViewPanelConfig } from '../models/dashboard-types';

/**
 * Configuration dialog for View parts.
 * Allows selecting an entity or saved view, and display options.
 */
@RegisterClass(BaseConfigDialog, 'ViewPanelConfigDialog')
@Component({
    selector: 'mj-view-config-dialog',
    templateUrl: './view-config-dialog.component.html',
    styleUrls: ['./config-dialog.component.css']
})
export class ViewConfigDialogComponent extends BaseConfigDialog implements OnChanges {
    // Form fields
    public title = '';
    public entityName = '';
    public viewId = '';
    public extraFilter = '';
    public displayMode: 'grid' | 'cards' | 'timeline' = 'grid';
    public allowModeSwitch = true;
    public enableSelection = true;
    public selectionMode: 'none' | 'single' | 'multiple' = 'single';

    // Validation
    public entityError = '';

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['config'] || changes['panel']) {
            this.initFromConfig(this.config);
        }
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'View') {
            const viewConfig = config as ViewPanelConfig;
            this.entityName = viewConfig.entityName || '';
            this.viewId = viewConfig.viewId || '';
            this.extraFilter = viewConfig.extraFilter || '';
            this.displayMode = viewConfig.displayMode || 'grid';
            this.allowModeSwitch = viewConfig.allowModeSwitch ?? true;
            this.enableSelection = viewConfig.enableSelection ?? true;
            this.selectionMode = viewConfig.selectionMode || 'single';
        } else {
            const defaults = createDefaultViewPanelConfig();
            this.entityName = '';
            this.viewId = '';
            this.extraFilter = '';
            this.displayMode = defaults.displayMode;
            this.allowModeSwitch = defaults.allowModeSwitch;
            this.enableSelection = defaults.enableSelection;
            this.selectionMode = defaults.selectionMode;
        }

        this.title = this.panel?.title || this.getDefaultTitle();
        this.entityError = '';
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'View',
            entityName: this.entityName.trim() || undefined,
            viewId: this.viewId.trim() || undefined,
            extraFilter: this.extraFilter.trim() || undefined,
            displayMode: this.displayMode,
            allowModeSwitch: this.allowModeSwitch,
            enableSelection: this.enableSelection,
            selectionMode: this.selectionMode
        } as ViewPanelConfig;
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.entityError = '';

        // At least entity name or view ID should be provided
        if (!this.entityName.trim() && !this.viewId.trim()) {
            this.entityError = 'Please enter an entity name or select a saved view';
            errors.push(this.entityError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.entityName) {
            return this.entityName;
        }
        return 'View';
    }

    protected override getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    public getDisplayModeDescription(): string {
        switch (this.displayMode) {
            case 'cards':
                return 'Display records as cards in a responsive grid layout';
            case 'timeline':
                return 'Display records chronologically along a timeline';
            default:
                return 'Display records in a traditional table/grid format';
        }
    }
}
