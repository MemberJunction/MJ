import { Component, ChangeDetectorRef, ViewChild } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigPanel } from './base-config-panel';
import { PanelConfig, ArtifactPanelConfig, createDefaultArtifactPanelConfig } from '../models/dashboard-types';
import {
    TreeBranchConfig,
    TreeLeafConfig,
    TreeNode,
    TreeDropdownComponent
} from '@memberjunction/ng-trees';

/**
 * Configuration panel for Artifact parts.
 * Uses tree dropdown for collection-based artifact selection.
 */
@RegisterClass(BaseConfigPanel, 'ArtifactPanelConfigDialog')
@Component({
    selector: 'mj-artifact-config-panel',
    templateUrl: './artifact-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class ArtifactConfigPanelComponent extends BaseConfigPanel {
    // ViewChild reference
    @ViewChild('artifactDropdown') artifactDropdown!: TreeDropdownComponent;

    // Form fields
    public title = '';
    public artifactId = '';
    public artifactName = '';
    public versionNumber: number | null = null;
    public showVersionSelector = true;
    public showMetadata = false;

    // Collapsible section state
    public showOptions = false;

    // Validation
    public artifactError = '';

    // Tree configuration for Collections (branches) and Conversation Artifacts (leaves)
    // Note: Collections have hierarchical ParentID and artifacts are linked via CollectionArtifact junction
    // For simplicity, we're displaying artifacts directly without collection hierarchy
    // In a real implementation, you might want to load artifacts grouped by their collections
    public CollectionConfig: TreeBranchConfig = {
        EntityName: 'MJ: Collections',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        IconField: 'Icon',
        ColorField: 'Color',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    // Note: Conversation Artifacts don't have a direct parent field to Collections
    // They're linked via CollectionArtifact junction table
    // For the tree dropdown, we'll just show all artifacts without collection grouping
    // A more sophisticated implementation would handle the junction table relationship
    public ArtifactLeafConfig: TreeLeafConfig = {
        EntityName: 'MJ: Conversation Artifacts',
        DisplayField: 'Name',
        IDField: 'ID',
        ParentField: '', // No direct parent - artifacts are at root level
        DefaultIcon: 'fa-solid fa-cube',
        DescriptionField: 'Description',
        OrderBy: 'Name ASC'
    };

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'Artifact') {
            const artifactConfig = config as ArtifactPanelConfig;
            this.artifactId = artifactConfig.artifactId || '';
            this.versionNumber = artifactConfig.versionNumber ?? null;
            this.showVersionSelector = artifactConfig.showVersionSelector ?? true;
            this.showMetadata = artifactConfig.showMetadata ?? false;
        } else {
            const defaults = createDefaultArtifactPanelConfig();
            this.artifactId = defaults.artifactId;
            this.versionNumber = null;
            this.showVersionSelector = defaults.showVersionSelector;
            this.showMetadata = defaults.showMetadata;
        }

        this.title = this.panel?.title || '';
        this.artifactName = '';
        this.artifactError = '';
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'Artifact',
            artifactId: this.artifactId.trim(),
            versionNumber: this.versionNumber ?? undefined,
            showVersionSelector: this.showVersionSelector,
            showMetadata: this.showMetadata
        } as ArtifactPanelConfig;
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.artifactError = '';

        if (!this.artifactId.trim()) {
            this.artifactError = 'Please select an artifact';
            errors.push(this.artifactError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.artifactName) {
            return this.artifactName;
        }
        return 'Artifact';
    }

    public getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    // Form event handlers
    public onTitleChange(): void {
        this.emitConfigChanged();
    }

    /**
     * Handle artifact selection from tree dropdown
     */
    public onArtifactSelection(node: TreeNode | TreeNode[] | null): void {
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.artifactError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual artifacts, not collections)
            if (node.Type === 'leaf') {
                this.artifactId = node.ID;
                this.artifactName = node.Label;

                // Auto-fill title if empty
                if (!this.title) {
                    this.title = node.Label;
                }
            }
        }

        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    public onVersionChange(): void {
        this.emitConfigChanged();
    }

    public onOptionChange(): void {
        this.emitConfigChanged();
    }

    public toggleOptions(): void {
        this.showOptions = !this.showOptions;
    }
}
