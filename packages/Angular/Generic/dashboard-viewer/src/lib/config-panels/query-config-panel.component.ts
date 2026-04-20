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
 * Configuration panel for Query parts.
 * Uses tree dropdown for category-based query selection.
 */
@RegisterClass(BaseConfigPanel, 'QueryPanelConfigDialog')
@Component({
  standalone: false,
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

    // Track previous selection name for smart title updates
    private previousQueryName = '';

    // Collapsible section state
    public showAdvancedOptions = false;

    // Validation
    public queryError = '';

    // Tree configuration for Query Categories (branches) and Queries (leaves)
    public QueryCategoryConfig: TreeBranchConfig = {
        EntityName: 'MJ: Query Categories',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    public QueryLeafConfig: TreeLeafConfig = {
        EntityName: 'MJ: Queries',
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

    /**
     * Get the queryId as a CompositeKey for the tree dropdown
     */
    public get QueryIdAsKey(): CompositeKey | null {
        return this.queryId ? CompositeKey.FromID(this.queryId) : null;
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'Query') {
            this.queryId = (config['queryId'] as string) || '';
            this.queryName = (config['queryName'] as string) || '';
            this.showParameterControls = (config['showParameterControls'] as boolean) ?? true;
            this.parameterLayout = (config['parameterLayout'] as 'header' | 'sidebar' | 'dialog') || 'header';
            this.autoRefreshSeconds = (config['autoRefreshSeconds'] as number) || 0;
            this.showExecutionMetadata = (config['showExecutionMetadata'] as boolean) ?? true;
        } else {
            // Defaults for new Query panel
            this.queryId = '';
            this.queryName = '';
            this.showParameterControls = true;
            this.parameterLayout = 'header';
            this.autoRefreshSeconds = 0;
            this.showExecutionMetadata = true;
        }

        this.title = this.panel?.title || '';
        this.previousQueryName = '';
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
        };
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
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.queryError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual queries, not categories)
            if (node.Type === 'leaf') {
                const oldQueryName = this.queryName;
                this.queryId = node.ID;
                this.queryName = node.Label;

                // Smart title update: if title matches old name, update to new name
                if (!this.title || this.title === oldQueryName || this.title === this.previousQueryName) {
                    this.title = node.Label;
                }
                this.previousQueryName = node.Label;
            }
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
