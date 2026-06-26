import { Component, ChangeDetectorRef, AfterViewInit, OnDestroy, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { AnalyzeArtifactService, NavigationRequest } from '@memberjunction/ng-artifacts';
import { DataSnapshot, UserInfo, CompositeKey } from '@memberjunction/core';
import { Subject } from 'rxjs';

/**
 * Runtime renderer for Artifact dashboard parts.
 * Displays artifacts using mj-artifact-viewer-panel including reports, charts, and AI-generated content.
 */
@RegisterClass(BaseDashboardPart, 'ArtifactPanelRenderer')
@Component({
  standalone: false,
    selector: 'mj-artifact-part',
    template: `
        <div class="artifact-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
          <!-- Loading state -->
          @if (IsLoading) {
            <div class="loading-state">
              <mj-loading text="Loading artifact..."></mj-loading>
            </div>
          }
        
          <!-- Error state -->
          @if (ErrorMessage && !IsLoading) {
            <mj-empty-state
              class="part-placeholder"
              Variant="error"
              Icon="fa-solid fa-triangle-exclamation"
              Title="Couldn't load artifact"
              [Message]="ErrorMessage"
              Size="compact" />
          }

          <!-- No artifact configured -->
          @if (!IsLoading && !ErrorMessage && !hasArtifact) {
            <mj-empty-state
              class="part-placeholder"
              Icon="fa-solid fa-palette"
              Title="No Artifact Selected"
              Message="Click the configure button to select an artifact for this part."
              Size="compact" />
          }
        
          <!-- Artifact Viewer Panel -->
          @if (!IsLoading && !ErrorMessage && hasArtifact && artifactId) {
            <mj-artifact-viewer-panel
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
              (openEntityRecord)="onOpenEntityRecord($event)"
              (navigationRequest)="onNavigationRequest($event)"
              (analyzeRequested)="onAnalyzeRequested($event)">
            </mj-artifact-viewer-panel>
          }
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
            background: var(--mj-bg-surface);
        }

        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--mj-text-secondary);
            text-align: center;
            padding: 24px;
        }

        .part-placeholder {
            height: 100%;
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
        const user = this.CurrentUser || this.ProviderToUse.CurrentUser;
        if (!user) {
            throw new Error('No current user available - user must be logged in to view artifacts');
        }
        return user;
    }

    public get environmentId(): string {
        return this.EnvironmentId || '';
    }

    constructor(cdr: ChangeDetectorRef, private analyzeService: AnalyzeArtifactService) {
        // Note: this component is instantiated twice — once via bare `new` by
        // ClassFactory.CreateInstanceAsync (just to extract the constructor
        // reference), then properly via createComponent() with a full injector.
        // Constructor parameters are undefined on the bare path but Angular DI
        // populates them on the real path. Field initializers calling inject()
        // would throw on the bare path, so we use constructor injection.
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

    /**
     * Handle general navigation request events from artifact viewer plugins
     */
    public onNavigationRequest(event: NavigationRequest): void {
        this.RequestOpenNavItem(
            event.navItemName,
            event.appName,
            event.queryParams,
            false
        );
    }

    /**
     * Handler for the Analyze button on the embedded artifact viewer.
     * Captures the live DataSnapshot, creates an analysis conversation with
     * the snapshot attached as input, and emits a navigation request to open
     * the new conversation in the host application.
     */
    public async onAnalyzeRequested(event: { artifactId: string; snapshot: DataSnapshot }): Promise<void> {
        try {
            const result = await this.analyzeService.StartAnalysisConversation({
                snapshot: event.snapshot,
                currentUser: this.currentUser,
                environmentId: this.environmentId,
            });

            this.RequestOpenNavItem(
                'Conversations',
                undefined,
                { conversationId: result.conversationId },
                false,
            );
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to start analysis conversation');
        }
    }

    protected override cleanup(): void {
        this.refreshTrigger.complete();
        this.artifactId = null;
        this.versionNumber = undefined;
    }
}
