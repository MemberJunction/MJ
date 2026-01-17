import { Component, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigDialog } from './base-config-dialog';
import { PanelConfig, ArtifactPanelConfig, createDefaultArtifactPanelConfig } from '../models/dashboard-types';

/**
 * Configuration dialog for Artifact parts.
 * Allows selecting an artifact and configuring display options.
 */
@RegisterClass(BaseConfigDialog, 'ArtifactPanelConfigDialog')
@Component({
    selector: 'mj-artifact-config-dialog',
    templateUrl: './artifact-config-dialog.component.html',
    styleUrls: ['./config-dialog.component.css']
})
export class ArtifactConfigDialogComponent extends BaseConfigDialog implements OnChanges {
    // Form fields
    public title = '';
    public artifactId = '';
    public versionNumber: number | null = null;
    public showVersionSelector = true;
    public showMetadata = false;

    // Validation
    public artifactError = '';

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['config'] || changes['panel']) {
            this.initFromConfig(this.config);
        }
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

        this.title = this.panel?.title || this.getDefaultTitle();
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
            this.artifactError = 'Please enter an artifact ID';
            errors.push(this.artifactError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        return 'Artifact';
    }

    protected override getTitle(): string {
        return this.title || this.getDefaultTitle();
    }
}
