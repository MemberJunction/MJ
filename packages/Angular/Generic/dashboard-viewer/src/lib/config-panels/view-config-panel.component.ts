import { Component, ChangeDetectorRef, ViewChild } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { BaseConfigPanel } from './base-config-panel';
import { PanelConfig } from '../models/dashboard-types';
import {
    TreeBranchConfig,
    TreeLeafConfig,
    TreeNode,
    TreeDropdownComponent
} from '@memberjunction/ng-trees';

/**
 * Configuration panel for View parts.
 * Uses tree dropdown for category-based view selection.
 */
@RegisterClass(BaseConfigPanel, 'ViewPanelConfigDialog')
@Component({
    selector: 'mj-dashboard-view-config-panel',
    templateUrl: './view-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class ViewConfigPanelComponent extends BaseConfigPanel {
    // ViewChild reference
    @ViewChild('viewDropdown') viewDropdown!: TreeDropdownComponent;

    // Form fields
    public title = '';
    public entityName = '';
    public viewId = '';
    public viewName = '';
    public extraFilter = '';
    public displayMode: 'grid' | 'cards' | 'timeline' = 'grid';
    public allowModeSwitch = true;
    public enableSelection = true;
    public selectionMode: 'none' | 'single' | 'multiple' = 'single';

    // Track previous selection name for smart title updates
    private previousViewName = '';

    // Collapsible section states
    public showDisplayOptions = false;
    public showAdvancedOptions = false;

    // Validation
    public viewError = '';

    // Tree configuration for User View Categories (branches) and User Views (leaves)
    public ViewCategoryConfig: TreeBranchConfig = {
        EntityName: 'User View Categories',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    public ViewLeafConfig: TreeLeafConfig = {
        EntityName: 'User Views',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentField: 'CategoryID',
        DefaultIcon: 'fa-solid fa-table',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    /**
     * Get the viewId as a CompositeKey for the tree dropdown
     */
    public get ViewIdAsKey(): CompositeKey | null {
        return this.viewId ? CompositeKey.FromID(this.viewId) : null;
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'View') {
            this.entityName = (config['entityName'] as string) || '';
            this.viewId = (config['viewId'] as string) || '';
            this.extraFilter = (config['extraFilter'] as string) || '';
            this.displayMode = (config['displayMode'] as 'grid' | 'cards' | 'timeline') || 'grid';
            this.allowModeSwitch = (config['allowModeSwitch'] as boolean) ?? true;
            this.enableSelection = (config['enableSelection'] as boolean) ?? true;
            this.selectionMode = (config['selectionMode'] as 'none' | 'single' | 'multiple') || 'single';
        } else {
            // Defaults for new View panel
            this.entityName = '';
            this.viewId = '';
            this.extraFilter = '';
            this.displayMode = 'grid';
            this.allowModeSwitch = true;
            this.enableSelection = true;
            this.selectionMode = 'single';
        }

        this.title = this.panel?.title || '';
        this.viewName = '';
        this.previousViewName = '';
        this.viewError = '';
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
        };
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.viewError = '';

        // At least entity name or view ID should be provided
        if (!this.entityName.trim() && !this.viewId.trim()) {
            this.viewError = 'Please select a saved view or enter an entity name';
            errors.push(this.viewError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.viewName) {
            return this.viewName;
        }
        if (this.entityName) {
            return this.entityName;
        }
        return 'View';
    }

    public getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    // Form event handlers
    public onTitleChange(): void {
        this.emitConfigChanged();
    }

    /**
     * Handle view selection from tree dropdown
     */
    public onViewSelection(node: TreeNode | TreeNode[] | null): void {
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.viewError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual views, not categories)
            if (node.Type === 'leaf') {
                const oldViewName = this.viewName;
                this.viewId = node.ID;
                this.viewName = node.Label;

                // Extract entity name from the view data if available
                if (node.Data && node.Data['Entity']) {
                    this.entityName = String(node.Data['Entity']);
                }

                // Smart title update: if title matches old name, update to new name
                if (!this.title || this.title === oldViewName || this.title === this.previousViewName) {
                    this.title = node.Label;
                }
                this.previousViewName = node.Label;
            }
        }

        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    public onEntityChange(): void {
        this.viewError = '';
        this.emitConfigChanged();
    }

    public onDisplayModeChange(): void {
        this.emitConfigChanged();
    }

    public onOptionChange(): void {
        this.emitConfigChanged();
    }

    public onSelectionModeChange(): void {
        this.emitConfigChanged();
    }

    public onFilterChange(): void {
        this.emitConfigChanged();
    }

    public toggleDisplayOptions(): void {
        this.showDisplayOptions = !this.showDisplayOptions;
    }

    public toggleAdvancedOptions(): void {
        this.showAdvancedOptions = !this.showAdvancedOptions;
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
