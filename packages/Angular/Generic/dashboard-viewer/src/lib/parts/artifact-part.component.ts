import { Component, ChangeDetectorRef, AfterViewInit, OnDestroy, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { UserInfo, Metadata, CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';

/**
 * Runtime renderer for Artifact dashboard parts.
 * Displays artifacts using mj-artifact-viewer-panel including reports, charts, and AI-generated content.
 */
@RegisterClass(BaseDashboardPart, 'ArtifactPanelRenderer')
@Component({
    selector: 'mj-artifact-part',
    template: `
        <div class="artifact-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
            <!-- Loading state -->
            <div class="loading-state" *ngIf="IsLoading">
                <mj-loading text="Loading artifact..."></mj-loading>
            </div>

            <!-- Error state -->
            <div class="error-state" *ngIf="ErrorMessage && !IsLoading">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <span>{{ ErrorMessage }}</span>
            </div>

            <!-- No artifact configured -->
            <div class="empty-state" *ngIf="!IsLoading && !ErrorMessage && !hasArtifact">
                <i class="fa-solid fa-palette"></i>
                <h4>No Artifact Selected</h4>
                <p>Click the configure button to select an artifact for this part.</p>
            </div>

            <!-- Artifact Viewer Panel -->
            <mj-artifact-viewer-panel
                *ngIf="!IsLoading && !ErrorMessage && hasArtifact && artifactId"
                [artifactId]="artifactId"
                [currentUser]="currentUser"
                [environmentId]="environmentId"
                [versionNumber]="versionNumber"
                [showSaveToCollection]="false"
                [showHeader]="showHeader"
                [showTabs]="showTabs"
                [showCloseButton]="showCloseButton"
                [showMaximizeButton]="showMaximizeButton"
                [viewContext]="null"
                [canShare]="false"
                [canEdit]="false"
                [isMaximized]="false"
                [refreshTrigger]="refreshTrigger"
                (navigateToLink)="onNavigateToLink($event)"
                (openEntityRecord)="onOpenEntityRecord($event)">
            </mj-artifact-viewer-panel>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }

        .artifact-part {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #fff;
        }

        .loading-state,
        .error-state,
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
            text-align: center;
            padding: 24px;
        }

        .error-state i,
        .empty-state i {
            font-size: 48px;
            color: #ccc;
            margin-bottom: 16px;
        }

        .error-state i {
            color: #d32f2f;
        }

        .empty-state h4 {
            margin: 0 0 8px 0;
            color: #333;
        }

        .empty-state p {
            margin: 0;
            font-size: 13px;
        }

        mj-artifact-viewer-panel {
            flex: 1;
            min-height: 0;
        }
    `]
})
export class ArtifactPartComponent extends BaseDashboardPart implements AfterViewInit, OnDestroy {
    /**
     * Current user - required by the artifact viewer panel.
     * Should be provided by the dashboard host or retrieved from a service.
     */
    @Input() CurrentUser: UserInfo | null = null;

    /**
     * Environment ID - required by the artifact viewer panel.
     * Should be provided by the dashboard host.
     */
    @Input() EnvironmentId: string = '';

    public hasArtifact = false;
    public artifactId: string | null = null;
    public versionNumber: number | undefined;
    public showHeader: boolean = false; // Default to false for dashboard embedding
    public showTabs: boolean = true;
    public showCloseButton: boolean = false; // Always false in dashboard context - close handled by dashboard
    public showMaximizeButton: boolean = false; // Always false in dashboard context - maximize handled by dashboard
    public refreshTrigger = new Subject<{ artifactId: string; versionNumber: number }>();

    // Expose for template
    public get currentUser(): UserInfo {
        // Use provided CurrentUser, or fall back to Metadata.CurrentUser
        // In client-side Angular context, Metadata.CurrentUser should always be available
        const user = this.CurrentUser || new Metadata().CurrentUser;
        if (!user) {
            throw new Error('No current user available - user must be logged in to view artifacts');
        }
        return user;
    }

    public get environmentId(): string {
        return this.EnvironmentId || '';
    }

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngAfterViewInit(): void {
        if (this.Panel) {
            this.loadContent();
        }
    }

    public async loadContent(): Promise<void> {
        const config = this.getConfig<PanelConfig>();
        const artifactId = config?.['artifactId'] as string | undefined;

        if (!artifactId) {
            this.hasArtifact = false;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            // Set artifact ID and version from config
            this.artifactId = artifactId;
            this.versionNumber = config?.['versionNumber'] as number | undefined;
            // Display options - showHeader defaults to false for clean dashboard embedding
            this.showHeader = (config?.['showHeader'] as boolean) ?? false;
            this.showTabs = (config?.['showTabs'] as boolean) ?? true;
            this.hasArtifact = true;

            this.setLoading(false);
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load artifact');
        }
    }

    /**
     * Refresh the artifact display
     */
    public refresh(): void {
        if (this.artifactId && this.versionNumber) {
            this.refreshTrigger.next({
                artifactId: this.artifactId,
                versionNumber: this.versionNumber
            });
        }
    }

    /**
     * Handle navigation link events from artifact viewer (conversation/collection links)
     */
    public onNavigateToLink(event: { type: 'conversation' | 'collection'; id: string; artifactId?: string; versionNumber?: number; versionId?: string }): void {
        // Emit data change event for navigation link (for listeners)
        this.emitDataChanged({
            type: 'navigate-to-link',
            linkType: event.type,
            linkId: event.id,
            artifactId: event.artifactId,
            versionNumber: event.versionNumber,
            versionId: event.versionId
        });

        // TODO: Add navigation request methods for conversation/collection when needed
        // For now, these are emitted as data change events for parent components to handle
    }

    /**
     * Handle entity record navigation events from artifact viewer
     */
    public onOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
        // Emit data change event for listeners
        this.emitDataChanged({
            type: 'open-entity-record',
            entityName: event.entityName,
            compositeKey: event.compositeKey
        });

        // Use proper navigation request to bubble up through the stack
        if (event.entityName && event.compositeKey) {
            this.RequestOpenEntityRecord(
                event.entityName,
                event.compositeKey.ToURLSegment(),
                'view',
                false
            );
        }
    }

    protected override cleanup(): void {
        this.refreshTrigger.complete();
        this.artifactId = null;
        this.versionNumber = undefined;
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadArtifactPart() {
    // Prevents tree-shaking of the component
}
