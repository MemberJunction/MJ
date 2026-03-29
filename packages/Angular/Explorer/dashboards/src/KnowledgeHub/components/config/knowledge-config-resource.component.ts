/**
 * @fileoverview Knowledge Hub Configuration Resource Component (Task 5)
 *
 * Settings page with left navigation for configuring the Knowledge Hub:
 * Pipeline, Vector DB, Full-Text Indexes, Embedding Models, Thresholds.
 * Inspired by config-option-b.html mockup.
 */

import { Component, ChangeDetectorRef, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/** Configuration section definition */
interface ConfigSection {
    ID: string;
    Label: string;
    Icon: string;
    Description: string;
}

/** Pipeline configuration settings */
interface PipelineConfig {
    AutotagOnIngest: boolean;
    VectorizeOnIngest: boolean;
    DefaultBatchSize: number;
    MaxConcurrentJobs: number;
}

/** Vector DB configuration settings */
interface VectorDBConfig {
    Provider: string;
    IndexName: string;
    Dimensions: number;
    Metric: string;
}

/** Threshold settings */
interface ThresholdConfig {
    DuplicateAbsolute: number;
    DuplicatePotential: number;
    SearchRelevance: number;
    AutotagConfidence: number;
}

@RegisterClass(BaseResourceComponent, 'KnowledgeConfigResource')
@Component({
    standalone: false,
    selector: 'app-knowledge-config-resource',
    templateUrl: './knowledge-config-resource.component.html',
    styleUrls: ['./knowledge-config-resource.component.css']
})
export class KnowledgeConfigResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Configuration';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-gear';
    }

    // --- Configuration Sections ---
    public Sections: ConfigSection[] = [
        { ID: 'pipeline', Label: 'Pipeline', Icon: 'fa-solid fa-diagram-project', Description: 'Configure the knowledge ingestion pipeline stages' },
        { ID: 'vectordb', Label: 'Vector Database', Icon: 'fa-solid fa-database', Description: 'Manage vector database connections and shared index' },
        { ID: 'fulltext', Label: 'Full-Text Indexes', Icon: 'fa-solid fa-text-width', Description: 'Configure SQL full-text search indexes' },
        { ID: 'embedding', Label: 'Embedding Models', Icon: 'fa-solid fa-microchip', Description: 'Select and configure embedding models' },
        { ID: 'thresholds', Label: 'Thresholds', Icon: 'fa-solid fa-sliders', Description: 'Set scoring thresholds for search and deduplication' },
    ];

    public ActiveSection = 'pipeline';
    public IsLoading = true;
    public IsSaving = false;
    public HasUnsavedChanges = false;

    // --- Configuration Data ---
    public PipelineSettings: PipelineConfig = {
        AutotagOnIngest: true,
        VectorizeOnIngest: true,
        DefaultBatchSize: 100,
        MaxConcurrentJobs: 3
    };

    public VectorDBSettings: VectorDBConfig = {
        Provider: 'Pinecone',
        IndexName: 'mj-shared-knowledge',
        Dimensions: 1536,
        Metric: 'cosine'
    };

    public ThresholdSettings: ThresholdConfig = {
        DuplicateAbsolute: 0.95,
        DuplicatePotential: 0.75,
        SearchRelevance: 0.3,
        AutotagConfidence: 0.7
    };

    ngAfterViewInit(): void {
        this.loadConfiguration();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Navigate to a section */
    public SelectSection(sectionId: string): void {
        this.ActiveSection = sectionId;
        this.cdr.detectChanges();
    }

    /** Mark configuration as changed */
    public OnSettingChanged(): void {
        this.HasUnsavedChanges = true;
        this.cdr.detectChanges();
    }

    /** Save all configuration changes */
    public async SaveConfiguration(): Promise<void> {
        this.IsSaving = true;
        this.cdr.detectChanges();

        try {
            // TODO: Save configuration via API
            await new Promise(resolve => setTimeout(resolve, 500));
            this.HasUnsavedChanges = false;
        } finally {
            this.IsSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** Reset to last saved values */
    public ResetConfiguration(): void {
        this.loadConfiguration();
        this.HasUnsavedChanges = false;
        this.cdr.detectChanges();
    }

    /** Format a threshold as a percentage */
    public FormatThreshold(value: number): string {
        return `${Math.round(value * 100)}%`;
    }

    // --- Private Methods ---

    private async loadConfiguration(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            // TODO: Load from API / entity records
            await new Promise(resolve => setTimeout(resolve, 300));
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }
}

/** Tree-shaking prevention */
export function LoadKnowledgeConfigResource(): void {
    // Prevents tree-shaking
}
