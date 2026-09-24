import { Component, ChangeDetectorRef, ViewChild, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
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
    @ViewChild('artifactDropdown') ArtifactDropdown!: TreeDropdownComponent;

    /** @deprecated Use {@link ArtifactDropdown}. */
    get artifactDropdown(): TreeDropdownComponent {
      return this.ArtifactDropdown;
    }
    /** @deprecated Use {@link ArtifactDropdown}. */
    set artifactDropdown(value: TreeDropdownComponent) {
      this.ArtifactDropdown = value;
    }

    // Form fields
    public title = '';
    public artifactId = '';
    public ArtifactName = '';

    /** @deprecated Use {@link ArtifactName}. */
    public get artifactName() {
      return this.ArtifactName;
    }
    /** @deprecated Use {@link ArtifactName}. */
    public set artifactName(value) {
      this.ArtifactName = value;
    }
    public VersionNumber: number | null = null;

    /** @deprecated Use {@link VersionNumber}. */
    public get versionNumber(): number | null {
      return this.VersionNumber;
    }
    /** @deprecated Use {@link VersionNumber}. */
    public set versionNumber(value: number | null) {
      this.VersionNumber = value;
    }
    public ShowHeader = false;

    /** @deprecated Use {@link ShowHeader}. */
    public get showHeader() {
      return this.ShowHeader;
    }
    /** @deprecated Use {@link ShowHeader}. */
    public set showHeader(value) {
      this.ShowHeader = value;
    } // Default false for clean dashboard embedding
    public ShowTabs = true;

    /** @deprecated Use {@link ShowTabs}. */
    public get showTabs() {
      return this.ShowTabs;
    }
    /** @deprecated Use {@link ShowTabs}. */
    public set showTabs(value) {
      this.ShowTabs = value;
    }
    public ShowVersionSelector = true;

    /** @deprecated Use {@link ShowVersionSelector}. */
    public get showVersionSelector() {
      return this.ShowVersionSelector;
    }
    /** @deprecated Use {@link ShowVersionSelector}. */
    public set showVersionSelector(value) {
      this.ShowVersionSelector = value;
    }
    public ShowMetadata = false;

    /** @deprecated Use {@link ShowMetadata}. */
    public get showMetadata() {
      return this.ShowMetadata;
    }
    /** @deprecated Use {@link ShowMetadata}. */
    public set showMetadata(value) {
      this.ShowMetadata = value;
    }

    // Version selection
    public Versions: MJArtifactVersionEntity[] = [];

    /** @deprecated Use {@link Versions}. */
    public get versions(): MJArtifactVersionEntity[] {
      return this.Versions;
    }
    /** @deprecated Use {@link Versions}. */
    public set versions(value: MJArtifactVersionEntity[]) {
      this.Versions = value;
    }
    public IsLoadingVersions = false;

    /** @deprecated Use {@link IsLoadingVersions}. */
    public get isLoadingVersions() {
      return this.IsLoadingVersions;
    }
    /** @deprecated Use {@link IsLoadingVersions}. */
    public set isLoadingVersions(value) {
      this.IsLoadingVersions = value;
    }
    private previousArtifactName = ''; // Track for smart title updates

    // Collapsible section state
    public ShowOptions = false;

    /** @deprecated Use {@link ShowOptions}. */
    public get showOptions() {
      return this.ShowOptions;
    }
    /** @deprecated Use {@link ShowOptions}. */
    public set showOptions(value) {
      this.ShowOptions = value;
    }

    // Validation
    public ArtifactError = '';

    /** @deprecated Use {@link ArtifactError}. */
    public get artifactError() {
      return this.ArtifactError;
    }
    /** @deprecated Use {@link ArtifactError}. */
    public set artifactError(value) {
      this.ArtifactError = value;
    }

    // Tree configuration - initialized in ngOnInit with current user filter
    public CollectionConfig!: TreeBranchConfig;
    public ArtifactLeafConfig!: TreeLeafConfig;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnInit(): void {
        // Get current user ID for filtering
        const userId = this.ProviderToUse.CurrentUser?.ID;

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
        return this.artifactId ? CompositeKey.FromID(this.artifactId) : null; // first-pk-ok: artifactId is an MJ: Artifacts record (ArtifactLeafConfig) — core entity keyed by ID
    }

    public async initFromConfig(config: PanelConfig | null): Promise<void> {
        if (config && config.type === 'Artifact') {
            this.artifactId = (config['artifactId'] as string) || '';
            this.VersionNumber = (config['versionNumber'] as number) ?? null;
            this.ShowHeader = (config['showHeader'] as boolean) ?? false;
            this.ShowTabs = (config['showTabs'] as boolean) ?? true;
            this.ShowVersionSelector = (config['showVersionSelector'] as boolean) ?? true;
            this.ShowMetadata = (config['showMetadata'] as boolean) ?? false;
        } else {
            // Defaults for new Artifact panel
            this.artifactId = '';
            this.VersionNumber = null;
            this.ShowHeader = false;
            this.ShowTabs = true;
            this.ShowVersionSelector = true;
            this.ShowMetadata = false;
        }

        this.title = this.panel?.title || '';
        this.ArtifactName = '';
        this.previousArtifactName = '';
        this.ArtifactError = '';
        this.Versions = [];
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
            versionNumber: this.VersionNumber ?? undefined,
            showHeader: this.ShowHeader,
            showTabs: this.ShowTabs,
            showVersionSelector: this.ShowVersionSelector,
            showMetadata: this.ShowMetadata
        };
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.ArtifactError = '';

        if (!this.artifactId.trim()) {
            this.ArtifactError = 'Please select an artifact';
            errors.push(this.ArtifactError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.ArtifactName) {
            return this.ArtifactName;
        }
        return 'Artifact';
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
     * Handle artifact selection from tree dropdown
     */
    public async OnArtifactSelection(node: TreeNode | TreeNode[] | null): Promise<void> {
        // Ignore null/empty selections (these happen during sync, not user interaction)
        if (!node || (Array.isArray(node) && node.length === 0)) {
            return;
        }

        this.ArtifactError = '';

        if (!Array.isArray(node)) {
            // Only accept leaf nodes (actual artifacts, not collections)
            if (node.Type === 'leaf') {
                const oldArtifactName = this.ArtifactName;
                this.artifactId = node.ID;
                this.ArtifactName = node.Label;

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

    /** @deprecated Use {@link OnArtifactSelection}. */
    public async onArtifactSelection(node: TreeNode | TreeNode[] | null): Promise<void> {
      return this.OnArtifactSelection(node);
    }

    /**
     * Load all versions for a given artifact
     */
    private async loadVersionsForArtifact(artifactId: string): Promise<void> {
        this.IsLoadingVersions = true;
        this.Versions = [];
        this.cdr.detectChanges();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJArtifactVersionEntity>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID = '${artifactId}'`,
                OrderBy: 'VersionNumber DESC',
                ResultType: 'entity_object'
            });

            if (result.Success && result.Results) {
                this.Versions = result.Results;
                // Default to latest version (first in descending order) if no version selected
                if (this.Versions.length > 0 && this.VersionNumber == null) {
                    this.VersionNumber = this.Versions[0].VersionNumber;
                }
            }
        } catch (error) {
            console.error('Failed to load artifact versions:', error);
        } finally {
            this.IsLoadingVersions = false;
            this.cdr.detectChanges();
        }
    }

    public OnVersionChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnVersionChange}. */
    public onVersionChange(): void {
      return this.OnVersionChange();
    }

    public OnOptionChange(): void {
        this.emitConfigChanged();
    }

    /** @deprecated Use {@link OnOptionChange}. */
    public onOptionChange(): void {
      return this.OnOptionChange();
    }
}
