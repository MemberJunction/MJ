import { Component, ChangeDetectorRef, ViewChild, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata } from '@memberjunction/core';
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
export class ArtifactConfigPanelComponent extends BaseConfigPanel implements OnInit {
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

    // Tree configuration - initialized in ngOnInit with current user filter
    public CollectionConfig!: TreeBranchConfig;
    public ArtifactLeafConfig!: TreeLeafConfig;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnInit(): void {
        // Get current user ID for filtering
        const md = new Metadata();
        const userId = md.CurrentUser?.ID;

        // Tree configuration for Collections (branches) and Artifacts (leaves)
        // Collections have hierarchical ParentID structure.
        // Filter to show only collections owned by the current user.
        this.CollectionConfig = {
            EntityName: 'MJ: Collections',
            DisplayField: 'Name',
            IDField: 'ID',
            ParentIDField: 'ParentID',
            DefaultIcon: 'fa-solid fa-folder',
            IconField: 'Icon',
            ColorField: 'Color',
            DescriptionField: 'Description',
            OrderBy: 'Name ASC',
            ExtraFilter: userId ? `OwnerID = '${userId}'` : ''
        };

        // Artifacts from MJ: Artifacts entity (not MJ: Conversation Artifacts which is deprecated)
        // Filter to show only artifacts created by the current user.
        // These are shown flat at root level since the junction table relationship
        // (Artifact -> ArtifactVersion -> CollectionArtifact -> Collection) doesn't map
        // directly to a parent field that the tree component can use.
        this.ArtifactLeafConfig = {
            EntityName: 'MJ: Artifacts',
            DisplayField: 'Name',
            IDField: 'ID',
            ParentField: '', // No direct parent - artifacts shown at root level
            DefaultIcon: 'fa-solid fa-cube',
            DescriptionField: 'Description',
            OrderBy: 'Name ASC',
            ExtraFilter: userId ? `UserID = '${userId}'` : ''
        };
    }

    /**
     * Get the artifactId as a CompositeKey for the tree dropdown
     */
    public get ArtifactIdAsKey(): CompositeKey | null {
        return this.artifactId ? CompositeKey.FromID(this.artifactId) : null;
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
