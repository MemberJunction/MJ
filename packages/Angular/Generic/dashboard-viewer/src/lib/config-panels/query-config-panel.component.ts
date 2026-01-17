import { Component, ChangeDetectorRef, ViewChild } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigPanel } from './base-config-panel';
import { PanelConfig, QueryPanelConfig, createDefaultQueryPanelConfig } from '../models/dashboard-types';
import {
    TreeBranchConfig,
    TreeLeafConfig,
    TreeNode,
    TreeDropdownComponent
} from '@memberjunction/ng-trees';

/**
 * Configuration panel for Query parts.
 * Uses tree dropdown for category-based query selection.
 */
@RegisterClass(BaseConfigPanel, 'QueryConfigPanel')
@Component({
    selector: 'mj-query-config-panel',
    templateUrl: './query-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class QueryConfigPanelComponent extends BaseConfigPanel {
    // ViewChild reference
    @ViewChild('queryDropdown') queryDropdown!: TreeDropdownComponent;

    // Form fields
    public title = '';
    public queryId = '';
    public queryName = '';
    public showParameterControls = true;
    public parameterLayout: 'header' | 'sidebar' | 'dialog' = 'header';
    public autoRefreshSeconds = 0;
    public showExecutionMetadata = true;

    // Collapsible section state
    public showAdvancedOptions = false;

    // Validation
    public queryError = '';

    // Tree configuration for Query Categories (branches) and Queries (leaves)
    public QueryCategoryConfig: TreeBranchConfig = {
        EntityName: 'Query Categories',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    public QueryLeafConfig: TreeLeafConfig = {
        EntityName: 'Queries',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentField: 'CategoryID',
        DefaultIcon: 'fa-solid fa-flask',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'Query') {
            const queryConfig = config as QueryPanelConfig;
            this.queryId = queryConfig.queryId || '';
            this.queryName = queryConfig.queryName || '';
            this.showParameterControls = queryConfig.showParameterControls ?? true;
            this.parameterLayout = queryConfig.parameterLayout || 'header';
            this.autoRefreshSeconds = queryConfig.autoRefreshSeconds || 0;
            this.showExecutionMetadata = queryConfig.showExecutionMetadata ?? true;
        } else {
            const defaults = createDefaultQueryPanelConfig();
            this.queryId = '';
            this.queryName = '';
            this.showParameterControls = defaults.showParameterControls;
            this.parameterLayout = defaults.parameterLayout;
            this.autoRefreshSeconds = defaults.autoRefreshSeconds;
            this.showExecutionMetadata = defaults.showExecutionMetadata;
        }

        this.title = this.panel?.title || '';
        this.queryError = '';
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'Query',
            queryId: this.queryId.trim() || undefined,
            queryName: this.queryName.trim() || undefined,
            showParameterControls: this.showParameterControls,
            parameterLayout: this.parameterLayout,
            autoRefreshSeconds: this.autoRefreshSeconds,
            showExecutionMetadata: this.showExecutionMetadata
        } as QueryPanelConfig;
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.queryError = '';

        if (!this.queryId.trim() && !this.queryName.trim()) {
            this.queryError = 'Please select a query';
            errors.push(this.queryError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.queryName) {
            return this.queryName;
        }
        return 'Query';
    }

    public getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    // Form event handlers
    public onTitleChange(): void {
        this.emitConfigChanged();
    }

    /**
     * Handle query selection from tree dropdown
     */
    public onQuerySelection(node: TreeNode | TreeNode[] | null): void {
        this.queryError = '';

        if (node && !Array.isArray(node)) {
            // Only accept leaf nodes (actual queries, not categories)
            if (node.Type === 'leaf') {
                this.queryId = node.ID;
                this.queryName = node.Label;

                // Auto-fill title if empty
                if (!this.title) {
                    this.title = node.Label;
                }
            }
        } else {
            this.queryId = '';
            this.queryName = '';
        }

        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    public onParameterLayoutChange(): void {
        this.emitConfigChanged();
    }

    public onAutoRefreshChange(): void {
        this.emitConfigChanged();
    }

    public onOptionChange(): void {
        this.emitConfigChanged();
    }

    public toggleAdvancedOptions(): void {
        this.showAdvancedOptions = !this.showAdvancedOptions;
    }

    public getParameterLayoutDescription(): string {
        switch (this.parameterLayout) {
            case 'sidebar':
                return 'Parameters displayed in a collapsible sidebar';
            case 'dialog':
                return 'Parameters shown in a popup dialog when needed';
            default:
                return 'Parameters displayed in the header area above results';
        }
    }
}
