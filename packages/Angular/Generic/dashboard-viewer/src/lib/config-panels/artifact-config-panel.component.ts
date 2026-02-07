import { Component, ChangeDetectorRef, ViewChild, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ArtifactVersionEntity } from '@memberjunction/core-entities';
import { BaseConfigPanel } from './base-config-panel';
import { PanelConfig } from '../models/dashboard-types';
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
  standalone: false,
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
    public showHeader = false; // Default false for clean dashboard embedding
    public showTabs = true;
    public showVersionSelector = true;
    public showMetadata = false;

    // Version selection
    public versions: ArtifactVersionEntity[] = [];
    public isLoadingVersions = false;
    private previousArtifactName = ''; // Track for smart title updates

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

        // Artifacts from MJ: Artifacts entity using M2M junction config.
        // The relationship is: Artifact -> ArtifactVersion -> CollectionArtifact -> Collection
        // We use JunctionConfig to properly parent artifacts under their collections.
        this.ArtifactLeafConfig = {
            EntityName: 'MJ: Artifacts',
            DisplayField: 'Name',
            IDField: 'ID',
            ParentField: '', // Using JunctionConfig instead of direct parent field
            DefaultIcon: 'fa-solid fa-cube',
            DescriptionField: 'Description',
            OrderBy: 'Name ASC',
            ExtraFilter: userId ? `UserID = '${userId}'` : '',
            // M2M junction configuration: Artifact -> ArtifactVersion -> CollectionArtifact -> Collection
            JunctionConfig: {
                EntityName: 'MJ: Collection Artifacts',
                LeafForeignKey: 'ArtifactVersionID', // Junction references ArtifactVersion, not Artifact directly
                BranchForeignKey: 'CollectionID',
                // Indirect mapping since junction references ArtifactVersion, not Artifact
                IndirectLeafMapping: {
                    IntermediateEntity: 'MJ: Artifact Versions',
                    IntermediateIDField: 'ID', // CollectionArtifact.ArtifactVersionID -> ArtifactVersion.ID
                    LeafIDField: 'ArtifactID' // ArtifactVersion.ArtifactID -> Artifact.ID
                }
            }
        };
    }

    /**
     * Get the artifactId as a CompositeKey for the tree dropdown
     */
    public get ArtifactIdAsKey(): CompositeKey | null {
        return this.artifactId ? CompositeKey.FromID(this.artifactId) : null;
    }

    public async initFromConfig(config: PanelConfig | null): Promise<void> {
        if (config && config.type === 'Artifact') {
            this.artifactId = (config['artifactId'] as string) || '';
            this.versionNumber = (config['versionNumber'] as number) ?? null;
            this.showHeader = (config['showHeader'] as boolean) ?? false;
            this.showTabs = (config['showTabs'] as boolean) ?? true;
            this.showVersionSelector = (config['showVersionSelector'] as boolean) ?? true;
            this.showMetadata = (config['showMetadata'] as boolean) ?? false;
        } else {
            // Defaults for new Artifact panel
            this.artifactId = '';
            this.versionNumber = null;
            this.showHeader = false;
            this.showTabs = true;
            this.showVersionSelector = true;
            this.showMetadata = false;
        }

        this.title = this.panel?.title || '';
        this.artifactName = '';
        this.previousArtifactName = '';
        this.artifactError = '';
        this.versions = [];
        this.cdr.detectChanges();

        // If editing an existing artifact config, load its versions
        if (this.artifactId) {
            await this.loadVersionsForArtifact(this.artifactId);
        }
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'Artifact',
            artifactId: this.artifactId.trim(),
            versionNumber: this.versionNumber ?? undefined,
            showHeader: this.showHeader,
            showTabs: this.showTabs,
            showVersionSelector: this.showVersionSelector,
            showMetadata: this.showMetadata
        };
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
    public async onArtifactSelection(node: TreeNode | TreeNode[] | null): Promise<void> {
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.artifactError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual artifacts, not collections)
            if (node.Type === 'leaf') {
                const oldArtifactName = this.artifactName;
                this.artifactId = node.ID;
                this.artifactName = node.Label;

                // Smart title update: if title matches old name, update to new name
                if (!this.title || this.title === oldArtifactName || this.title === this.previousArtifactName) {
                    this.title = node.Label;
                }
                this.previousArtifactName = node.Label;

                // Load versions for the selected artifact
                await this.loadVersionsForArtifact(node.ID);
            }
        }

        this.emitConfigChanged();
        this.cdr.detectChanges();
    }

    /**
     * Load all versions for a given artifact
     */
    private async loadVersionsForArtifact(artifactId: string): Promise<void> {
        this.isLoadingVersions = true;
        this.versions = [];
        this.cdr.detectChanges();

        try {
            const rv = new RunView();
            const result = await rv.RunView<ArtifactVersionEntity>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID = '${artifactId}'`,
                OrderBy: 'VersionNumber DESC',
                ResultType: 'entity_object'
            });

            if (result.Success && result.Results) {
                this.versions = result.Results;
                // Default to latest version (first in descending order) if no version selected
                if (this.versions.length > 0 && this.versionNumber == null) {
                    this.versionNumber = this.versions[0].VersionNumber;
                }
            }
        } catch (error) {
            console.error('Failed to load artifact versions:', error);
        } finally {
            this.isLoadingVersions = false;
            this.cdr.detectChanges();
        }
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
