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
    @ViewChild('queryDropdown') QueryDropdown!: TreeDropdownComponent;

    /** @deprecated Use {@link QueryDropdown}. */
    get queryDropdown(): TreeDropdownComponent {
      return this.QueryDropdown;
    }
    /** @deprecated Use {@link QueryDropdown}. */
    set queryDropdown(value: TreeDropdownComponent) {
      this.QueryDropdown = value;
    }

    // Form fields
    public title = '';
    public QueryId = '';

    /** @deprecated Use {@link QueryId}. */
    public get queryId() {
      return this.QueryId;
    }
    /** @deprecated Use {@link QueryId}. */
    public set queryId(value) {
      this.QueryId = value;
    }
    public QueryName = '';

    /** @deprecated Use {@link QueryName}. */
    public get queryName() {
      return this.QueryName;
    }
    /** @deprecated Use {@link QueryName}. */
    public set queryName(value) {
      this.QueryName = value;
    }
    public ShowParameterControls = true;

    /** @deprecated Use {@link ShowParameterControls}. */
    public get showParameterControls() {
      return this.ShowParameterControls;
    }
    /** @deprecated Use {@link ShowParameterControls}. */
    public set showParameterControls(value) {
      this.ShowParameterControls = value;
    }
    public ParameterLayout: 'header' | 'sidebar' | 'dialog' = 'header';

    /** @deprecated Use {@link ParameterLayout}. */
    public get parameterLayout(): 'header' | 'sidebar' | 'dialog' {
      return this.ParameterLayout;
    }
    /** @deprecated Use {@link ParameterLayout}. */
    public set parameterLayout(value: 'header' | 'sidebar' | 'dialog') {
      this.ParameterLayout = value;
    }
    public AutoRefreshSeconds = 0;

    /** @deprecated Use {@link AutoRefreshSeconds}. */
    public get autoRefreshSeconds() {
      return this.AutoRefreshSeconds;
    }
    /** @deprecated Use {@link AutoRefreshSeconds}. */
    public set autoRefreshSeconds(value) {
      this.AutoRefreshSeconds = value;
    }
    public ShowExecutionMetadata = true;

    /** @deprecated Use {@link ShowExecutionMetadata}. */
    public get showExecutionMetadata() {
      return this.ShowExecutionMetadata;
    }
    /** @deprecated Use {@link ShowExecutionMetadata}. */
    public set showExecutionMetadata(value) {
      this.ShowExecutionMetadata = value;
    }

    // Track previous selection name for smart title updates
    private previousQueryName = '';

    // Collapsible section state
    public ShowAdvancedOptions = false;

    /** @deprecated Use {@link ShowAdvancedOptions}. */
    public get showAdvancedOptions() {
      return this.ShowAdvancedOptions;
    }
    /** @deprecated Use {@link ShowAdvancedOptions}. */
    public set showAdvancedOptions(value) {
      this.ShowAdvancedOptions = value;
    }

    // Validation
    public QueryError = '';

    /** @deprecated Use {@link QueryError}. */
    public get queryError() {
      return this.QueryError;
    }
    /** @deprecated Use {@link QueryError}. */
    public set queryError(value) {
      this.QueryError = value;
    }

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
        return this.QueryId ? CompositeKey.FromID(this.QueryId) : null; // first-pk-ok: queryId is an MJ: Queries record (QueryLeafConfig) — core entity keyed by ID
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'Query') {
            this.QueryId = (config['queryId'] as string) || '';
            this.QueryName = (config['queryName'] as string) || '';
            this.ShowParameterControls = (config['showParameterControls'] as boolean) ?? true;
            this.ParameterLayout = (config['parameterLayout'] as 'header' | 'sidebar' | 'dialog') || 'header';
            this.AutoRefreshSeconds = (config['autoRefreshSeconds'] as number) || 0;
            this.ShowExecutionMetadata = (config['showExecutionMetadata'] as boolean) ?? true;
        } else {
            // Defaults for new Query panel
            this.QueryId = '';
            this.QueryName = '';
            this.ShowParameterControls = true;
            this.ParameterLayout = 'header';
            this.AutoRefreshSeconds = 0;
            this.ShowExecutionMetadata = true;
        }

        this.title = this.panel?.title || '';
        this.previousQueryName = '';
        this.QueryError = '';
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'Query',
            queryId: this.QueryId.trim() || undefined,
            queryName: this.QueryName.trim() || undefined,
            showParameterControls: this.ShowParameterControls,
            parameterLayout: this.ParameterLayout,
            autoRefreshSeconds: this.AutoRefreshSeconds,
            showExecutionMetadata: this.ShowExecutionMetadata
        };
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.QueryError = '';

        if (!this.QueryId.trim() && !this.QueryName.trim()) {
            this.QueryError = 'Please select a query';
            errors.push(this.QueryError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.QueryName) {
            return this.QueryName;
        }
        return 'Query';
    }

    public getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    // Form event handlers
    public OnTitleChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnTitleChange}. */
    public onTitleChange(): void {
      return this.OnTitleChange();
    }

    /**
     * Handle query selection from tree dropdown
     */
    public OnQuerySelection(node: TreeNode | TreeNode[] | null): void {
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.QueryError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual queries, not categories)
            if (node.Type === 'leaf') {
                const oldQueryName = this.QueryName;
                this.QueryId = node.ID;
                this.QueryName = node.Label;

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

    /** @deprecated Use {@link OnQuerySelection}. */
    public onQuerySelection(node: TreeNode | TreeNode[] | null): void {
      return this.OnQuerySelection(node);
    }

    public OnParameterLayoutChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnParameterLayoutChange}. */
    public onParameterLayoutChange(): void {
      return this.OnParameterLayoutChange();
    }

    public OnAutoRefreshChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnAutoRefreshChange}. */
    public onAutoRefreshChange(): void {
      return this.OnAutoRefreshChange();
    }

    public OnOptionChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnOptionChange}. */
    public onOptionChange(): void {
      return this.OnOptionChange();
    }

    public GetParameterLayoutDescription(): string {
        switch (this.ParameterLayout) {
            case 'sidebar':
                return 'Parameters displayed in a collapsible sidebar';
            case 'dialog':
                return 'Parameters shown in a popup dialog when needed';
            default:
                return 'Parameters displayed in the header area above results';
        }
    }

    /** @deprecated Use {@link GetParameterLayoutDescription}. */
    public getParameterLayoutDescription(): string {
      return this.GetParameterLayoutDescription();
    }
}
