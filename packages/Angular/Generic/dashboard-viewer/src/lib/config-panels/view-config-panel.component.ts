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
  standalone: false,
    selector: 'mj-dashboard-view-config-panel',
    templateUrl: './view-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class ViewConfigPanelComponent extends BaseConfigPanel {
    // ViewChild reference
    @ViewChild('viewDropdown') ViewDropdown!: TreeDropdownComponent;

    /** @deprecated Use {@link ViewDropdown}. */
    get viewDropdown(): TreeDropdownComponent {
      return this.ViewDropdown;
    }
    /** @deprecated Use {@link ViewDropdown}. */
    set viewDropdown(value: TreeDropdownComponent) {
      this.ViewDropdown = value;
    }

    // Form fields
    public title = '';
    public entityName = '';
    public ViewId = '';

    /** @deprecated Use {@link ViewId}. */
    public get viewId() {
      return this.ViewId;
    }
    /** @deprecated Use {@link ViewId}. */
    public set viewId(value) {
      this.ViewId = value;
    }
    public ViewName = '';

    /** @deprecated Use {@link ViewName}. */
    public get viewName() {
      return this.ViewName;
    }
    /** @deprecated Use {@link ViewName}. */
    public set viewName(value) {
      this.ViewName = value;
    }
    public ExtraFilter = '';

    /** @deprecated Use {@link ExtraFilter}. */
    public get extraFilter() {
      return this.ExtraFilter;
    }
    /** @deprecated Use {@link ExtraFilter}. */
    public set extraFilter(value) {
      this.ExtraFilter = value;
    }
    public DisplayMode: 'grid' | 'cards' | 'timeline' | 'map' = 'grid';

    /** @deprecated Use {@link DisplayMode}. */
    public get displayMode(): 'grid' | 'cards' | 'timeline' | 'map' {
      return this.DisplayMode;
    }
    /** @deprecated Use {@link DisplayMode}. */
    public set displayMode(value: 'grid' | 'cards' | 'timeline' | 'map') {
      this.DisplayMode = value;
    }
    public MapRenderMode: 'point' | 'choropleth' | 'heatmap' = 'point';

    /** @deprecated Use {@link MapRenderMode}. */
    public get mapRenderMode(): 'point' | 'choropleth' | 'heatmap' {
      return this.MapRenderMode;
    }
    /** @deprecated Use {@link MapRenderMode}. */
    public set mapRenderMode(value: 'point' | 'choropleth' | 'heatmap') {
      this.MapRenderMode = value;
    }
    public AllowModeSwitch = true;

    /** @deprecated Use {@link AllowModeSwitch}. */
    public get allowModeSwitch() {
      return this.AllowModeSwitch;
    }
    /** @deprecated Use {@link AllowModeSwitch}. */
    public set allowModeSwitch(value) {
      this.AllowModeSwitch = value;
    }
    public EnableSelection = true;

    /** @deprecated Use {@link EnableSelection}. */
    public get enableSelection() {
      return this.EnableSelection;
    }
    /** @deprecated Use {@link EnableSelection}. */
    public set enableSelection(value) {
      this.EnableSelection = value;
    }
    public selectionMode: 'none' | 'single' | 'multiple' = 'single';

    // Track previous selection name for smart title updates
    private previousViewName = '';

    // Collapsible section states
    public ShowDisplayOptions = false;

    /** @deprecated Use {@link ShowDisplayOptions}. */
    public get showDisplayOptions() {
      return this.ShowDisplayOptions;
    }
    /** @deprecated Use {@link ShowDisplayOptions}. */
    public set showDisplayOptions(value) {
      this.ShowDisplayOptions = value;
    }
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
    public ViewError = '';

    /** @deprecated Use {@link ViewError}. */
    public get viewError() {
      return this.ViewError;
    }
    /** @deprecated Use {@link ViewError}. */
    public set viewError(value) {
      this.ViewError = value;
    }

    // Tree configuration for User View Categories (branches) and User Views (leaves)
    public ViewCategoryConfig: TreeBranchConfig = {
        EntityName: 'MJ: User View Categories',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    public ViewLeafConfig: TreeLeafConfig = {
        EntityName: 'MJ: User Views',
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
        return this.ViewId ? CompositeKey.FromID(this.ViewId) : null; // first-pk-ok: viewId is an MJ: User Views record (ViewLeafConfig) — core entity keyed by ID
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'View') {
            this.entityName = (config['entityName'] as string) || '';
            this.ViewId = (config['viewId'] as string) || '';
            this.ExtraFilter = (config['extraFilter'] as string) || '';
            this.DisplayMode = (config['displayMode'] as 'grid' | 'cards' | 'timeline' | 'map') || 'grid';
            this.MapRenderMode = (config['mapRenderMode'] as 'point' | 'choropleth' | 'heatmap') || 'point';
            this.AllowModeSwitch = (config['allowModeSwitch'] as boolean) ?? true;
            this.EnableSelection = (config['enableSelection'] as boolean) ?? true;
            this.selectionMode = (config['selectionMode'] as 'none' | 'single' | 'multiple') || 'single';
        } else {
            // Defaults for new View panel
            this.entityName = '';
            this.ViewId = '';
            this.ExtraFilter = '';
            this.DisplayMode = 'grid';
            this.AllowModeSwitch = true;
            this.EnableSelection = true;
            this.selectionMode = 'single';
        }

        this.title = this.panel?.title || '';
        this.ViewName = '';
        this.previousViewName = '';
        this.ViewError = '';
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'View',
            entityName: this.entityName.trim() || undefined,
            viewId: this.ViewId.trim() || undefined,
            extraFilter: this.ExtraFilter.trim() || undefined,
            displayMode: this.DisplayMode,
            mapRenderMode: this.DisplayMode === 'map' ? this.MapRenderMode : undefined,
            allowModeSwitch: this.AllowModeSwitch,
            enableSelection: this.EnableSelection,
            selectionMode: this.selectionMode
        };
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.ViewError = '';

        // At least entity name or view ID should be provided
        if (!this.entityName.trim() && !this.ViewId.trim()) {
            this.ViewError = 'Please select a saved view or enter an entity name';
            errors.push(this.ViewError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.ViewName) {
            return this.ViewName;
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
    public OnTitleChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnTitleChange}. */
    public onTitleChange(): void {
      return this.OnTitleChange();
    }

    /**
     * Handle view selection from tree dropdown
     */
    public OnViewSelection(node: TreeNode | TreeNode[] | null): void {
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.ViewError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual views, not categories)
            if (node.Type === 'leaf') {
                const oldViewName = this.ViewName;
                this.ViewId = node.ID;
                this.ViewName = node.Label;

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

    /** @deprecated Use {@link OnViewSelection}. */
    public onViewSelection(node: TreeNode | TreeNode[] | null): void {
      return this.OnViewSelection(node);
    }

    public OnEntityChange(): void {
        this.ViewError = '';
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnEntityChange}. */
    public onEntityChange(): void {
      return this.OnEntityChange();
    }

    public OnDisplayModeChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnDisplayModeChange}. */
    public onDisplayModeChange(): void {
      return this.OnDisplayModeChange();
    }

    public OnOptionChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnOptionChange}. */
    public onOptionChange(): void {
      return this.OnOptionChange();
    }

    public OnSelectionModeChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnSelectionModeChange}. */
    public onSelectionModeChange(): void {
      return this.OnSelectionModeChange();
    }

    public onFilterChange(): void {
        this.emitConfigChanged();
    }


    public GetDisplayModeDescription(): string {
        switch (this.DisplayMode) {
            case 'cards':
                return 'Display records as cards in a responsive grid layout';
            case 'timeline':
                return 'Display records chronologically along a timeline';
            case 'map':
                return 'Display geo-coded records on an interactive map';
            default:
                return 'Display records in a traditional table/grid format';
        }
    }

    /** @deprecated Use {@link GetDisplayModeDescription}. */
    public getDisplayModeDescription(): string {
      return this.GetDisplayModeDescription();
    }
}
