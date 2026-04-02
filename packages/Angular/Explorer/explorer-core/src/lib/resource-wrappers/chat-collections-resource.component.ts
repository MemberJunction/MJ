import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { Metadata, CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { ArtifactStateService, ArtifactPermissionService, CollectionStateService } from '@memberjunction/ng-conversations';
import { Subject, takeUntil, distinctUntilChanged, combineLatest } from 'rxjs';
/**
 * Chat Collections Resource - displays the collections full view for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Shows all collections and their artifacts in a comprehensive view
 * Includes artifact panel support for viewing selected artifacts
 */
@RegisterClass(BaseResourceComponent, 'ChatCollectionsResource')
@Component({
  standalone: false,
  selector: 'mj-chat-collections-resource',
  template: `
    <div class="chat-collections-container">
      <!-- Collections view -->
      <div class="collections-main" [class.with-artifact-panel]="isArtifactPanelOpen && activeArtifactId">
        @if (currentUser) {
          <mj-collections-full-view
            [environmentId]="environmentId"
            [currentUser]="currentUser">
          </mj-collections-full-view>
        }
      </div>
    
      <!-- Artifact Panel -->
      @if (isArtifactPanelOpen && activeArtifactId) {
        @if (!isArtifactPanelMaximized) {
          <div class="artifact-panel-resize-handle"
          (mousedown)="onResizeStart($event)"></div>
        }
        <div class="artifact-panel"
          [style.width.%]="artifactPanelWidth"
          [class.maximized]="isArtifactPanelMaximized">
          <mj-artifact-viewer-panel
            [artifactId]="activeArtifactId"
            [currentUser]="currentUser"
            [environmentId]="environmentId"
            [versionNumber]="activeVersionNumber ?? undefined"
            [showSaveToCollection]="false"
            [viewContext]="'collection'"
            [contextCollectionId]="collectionState.activeCollectionId ?? undefined"
            [canShare]="canShareActiveArtifact"
            [canEdit]="canEditActiveArtifact"
            [isMaximized]="isArtifactPanelMaximized"
            (closed)="closeArtifactPanel()"
            (maximizeToggled)="toggleMaximizeArtifactPanel()"
            (navigateToLink)="onNavigateToLink($event)"
            (openEntityRecord)="onOpenEntityRecord($event)">
          </mj-artifact-viewer-panel>
        </div>
      }
    </div>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-collections-container {
      display: flex;
      width: 100%;
      height: 100%;
      flex: 1;
      overflow: hidden;
      position: relative; /* Required for absolute positioning of maximized panel */
    }

    .collections-main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .collections-main.with-artifact-panel {
      /* When artifact panel is open, main area shrinks */
    }

    .artifact-panel-resize-handle {
      width: 8px;
      cursor: col-resize;
      background: transparent;
      transition: background 150ms ease;
      flex-shrink: 0;
    }

    .artifact-panel-resize-handle:hover {
      background: var(--mj-brand-primary);
    }

    .artifact-panel-resize-handle:active {
      background: var(--mj-brand-primary-hover);
    }

    .artifact-panel {
      border-left: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-card);
      transition: width 0.2s ease;
    }

    .artifact-panel.maximized {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100% !important;
      z-index: 100;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ChatCollectionsResource extends BaseResourceComponent implements OnInit, OnDestroy {
  public currentUser: any = null;

  // Artifact panel state
  public isArtifactPanelOpen: boolean = false;
  public activeArtifactId: string | null = null;
  public activeVersionNumber: number | null = null;
  public canShareActiveArtifact: boolean = false;
  public canEditActiveArtifact: boolean = false;
  public artifactPanelWidth: number = 40; // Default 40% width (percentage-based)
  public isArtifactPanelMaximized: boolean = false;
  private artifactPanelWidthBeforeMaximize: number = 40; // Store width before maximizing

  // Resize state
  private isResizing: boolean = false;
  private resizeStartX: number = 0;
  private resizeStartWidth: number = 0;

  private destroy$ = new Subject<void>();
  private skipUrlUpdate = true; // Skip URL updates during initialization

  constructor(
    private artifactState: ArtifactStateService,
    private artifactPermissionService: ArtifactPermissionService,
    public collectionState: CollectionStateService,
    private navigationService: NavigationService
  ) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Subscribe to artifact state changes
    this.subscribeToArtifactState();

    // Setup resize listeners
    this.setupResizeListeners();

    // Apply initial state from tab configuration (populated by shell from URL or nav params)
    this.applyNavigationParams();

    // Subscribe to state changes to update URL
    this.subscribeToUrlStateChanges();

    // Subscribe to collection and artifact changes to update tab title
    this.collectionState.activeCollectionId$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(collectionId => {
        // Only update if no artifact is open (artifact title takes priority)
        if (!this.activeArtifactId) {
          this.updateCollectionTabTitle(collectionId);
        }
      });

    this.artifactState.activeArtifact$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(artifact => {
        if (artifact && artifact.Name) {
          this.NotifyDisplayNameChanged(artifact.Name);
        } else {
          // Artifact closed — fall back to collection name
          this.updateCollectionTabTitle(this.collectionState.activeCollectionId);
        }
      });

    // Enable URL updates after initialization
    this.skipUrlUpdate = false;

    // Update URL to reflect current state
    this.updateUrl();

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }


  /**
   * Apply initial state from tab configuration.
   * The shell populates queryParams from the URL, and nav params come from cross-resource linking.
   */
  private applyNavigationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    // Check queryParams first (shell populates these from the URL for deep-linking)
    const qp = config['queryParams'] as Record<string, string> | undefined;
    const collectionId = (qp?.['collectionId'] as string) || (config.collectionId as string);
    const artifactId = (qp?.['artifactId'] as string) || (config.artifactId as string);
    const versionNumber = qp?.['versionNumber'] ? parseInt(qp['versionNumber'], 10)
      : config.versionNumber ? (config.versionNumber as number) : undefined;

    if (collectionId) {
      this.collectionState.setActiveCollection(collectionId);
    }

    if (artifactId) {
      this.artifactState.openArtifact(artifactId, versionNumber);
    }
  }

  /**
   * Subscribe to state changes for URL updates.
   */
  private subscribeToUrlStateChanges(): void {
    // Combine collection and artifact state changes
    combineLatest([
      this.collectionState.activeCollectionId$.pipe(distinctUntilChanged()),
      this.artifactState.activeArtifactId$.pipe(distinctUntilChanged()),
      this.artifactState.activeVersionNumber$.pipe(distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.skipUrlUpdate) {
          this.updateUrl();
        }
      });
  }

  /**
   * Update URL query string to reflect current state.
   * Uses NavigationService for proper URL management that respects app-scoped routes.
   */
  private updateUrl(): void {
    const queryParams: Record<string, string | null> = {};

    // Add collection ID
    const collectionId = this.collectionState.activeCollectionId;
    if (collectionId) {
      queryParams['collectionId'] = collectionId;
    } else {
      queryParams['collectionId'] = null;
    }

    // Add artifact ID if panel is open
    if (this.activeArtifactId) {
      queryParams['artifactId'] = this.activeArtifactId;
      if (this.activeVersionNumber) {
        queryParams['versionNumber'] = this.activeVersionNumber.toString();
      }
    } else {
      queryParams['artifactId'] = null;
      queryParams['versionNumber'] = null;
    }

    // Use NavigationService to update query params properly
    this.navigationService.UpdateActiveTabQueryParams(queryParams);
  }


  /**
   * Update the tab/browser title based on the active collection.
   */
  private async updateCollectionTabTitle(collectionId: string | null): Promise<void> {
    if (!collectionId) {
      this.NotifyDisplayNameChanged('Collections');
      return;
    }
    try {
      const rv = new RunView();
      const result = await rv.RunView<{ Name: string }>({
        EntityName: 'MJ: Collections',
        Fields: ['Name'],
        ExtraFilter: `ID='${collectionId}'`,
        ResultType: 'simple'
      });
      if (result.Results?.length > 0 && result.Results[0].Name) {
        this.NotifyDisplayNameChanged(result.Results[0].Name);
      }
    } catch {
      // Fall back to generic title
      this.NotifyDisplayNameChanged('Collections');
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.removeResizeListeners();
  }

  /**
   * Subscribe to artifact state service for panel open/close
   */
  private subscribeToArtifactState(): void {
    // Subscribe to panel open state
    this.artifactState.isPanelOpen$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOpen => {
        this.isArtifactPanelOpen = isOpen;
      });

    // Subscribe to active artifact ID
    this.artifactState.activeArtifactId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async id => {
        this.activeArtifactId = id;
        if (id) {
          await this.loadArtifactPermissions(id);
        } else {
          this.canShareActiveArtifact = false;
          this.canEditActiveArtifact = false;
        }
      });

    // Subscribe to active version number
    this.artifactState.activeVersionNumber$
      .pipe(takeUntil(this.destroy$))
      .subscribe(versionNumber => {
        this.activeVersionNumber = versionNumber;
      });
  }

  /**
   * Load permissions for the active artifact
   */
  private async loadArtifactPermissions(artifactId: string): Promise<void> {
    if (!artifactId || !this.currentUser) {
      this.canShareActiveArtifact = false;
      this.canEditActiveArtifact = false;
      return;
    }

    try {
      const permissions = await this.artifactPermissionService.getUserPermissions(artifactId, this.currentUser);
      this.canShareActiveArtifact = permissions.canShare;
      this.canEditActiveArtifact = permissions.canEdit;
    } catch (error) {
      console.error('Failed to load artifact permissions:', error);
      this.canShareActiveArtifact = false;
      this.canEditActiveArtifact = false;
    }
  }

  /**
   * Close the artifact panel
   */
  closeArtifactPanel(): void {
    this.artifactState.closeArtifact();
  }

  /**
   * Toggle maximize/restore state for artifact panel
   */
  toggleMaximizeArtifactPanel(): void {
    if (this.isArtifactPanelMaximized) {
      // Restore to previous width
      this.artifactPanelWidth = this.artifactPanelWidthBeforeMaximize;
      this.isArtifactPanelMaximized = false;
    } else {
      // Maximize - store current width and set to 100%
      this.artifactPanelWidthBeforeMaximize = this.artifactPanelWidth;
      this.artifactPanelWidth = 100;
      this.isArtifactPanelMaximized = true;
    }
  }

  /**
   * Handle navigation request from artifact viewer panel.
   * Converts the link event to a generic navigation request and uses NavigationService.
   */
  onNavigateToLink(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
    versionId?: string;
  }): void {
    // Map the link type to the nav item name
    const navItemName = event.type === 'conversation' ? 'Conversations' : 'Collections';

    // Build configuration params to pass to the target resource
    const params: Record<string, unknown> = {};
    if (event.type === 'conversation') {
      params['conversationId'] = event.id;
    } else {
      params['collectionId'] = event.id;
    }

    // Include artifact info so destination can open it
    if (event.artifactId) {
      params['artifactId'] = event.artifactId;
      if (event.versionNumber) {
        params['versionNumber'] = event.versionNumber;
      }
    }

    // Navigate using the generic nav item method
    this.navigationService.OpenNavItemByName(navItemName, params);
  }

  /**
   * Handle entity record open request from artifact viewer (from React component grids).
   * Uses NavigationService to open the record in a new tab.
   */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
  }

  /**
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /**
   * Get the display name for chat collections
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Collections';
  }

  /**
   * Get the icon class for chat collections
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-open';
  }

  // Resize handling
  private setupResizeListeners(): void {
    this.boundOnResizeMove = this.onResizeMove.bind(this);
    this.boundOnResizeEnd = this.onResizeEnd.bind(this);
  }

  private removeResizeListeners(): void {
    window.removeEventListener('mousemove', this.boundOnResizeMove);
    window.removeEventListener('mouseup', this.boundOnResizeEnd);
  }

  private boundOnResizeMove: (e: MouseEvent) => void = () => {};
  private boundOnResizeEnd: (e: MouseEvent) => void = () => {};

  onResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.artifactPanelWidth;
    window.addEventListener('mousemove', this.boundOnResizeMove);
    window.addEventListener('mouseup', this.boundOnResizeEnd);
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const container = document.querySelector('.chat-collections-container') as HTMLElement;
    if (!container) return;

    const containerWidth = container.offsetWidth;
    const deltaX = event.clientX - this.resizeStartX;
    const deltaPercent = (deltaX / containerWidth) * -100; // Negative because we're pulling from the right
    let newWidth = this.resizeStartWidth + deltaPercent;

    // Constrain between 20% and 80%
    newWidth = Math.max(20, Math.min(80, newWidth));
    this.artifactPanelWidth = newWidth;
  }

  private onResizeEnd(event: MouseEvent): void {
    this.isResizing = false;
    window.removeEventListener('mousemove', this.boundOnResizeMove);
    window.removeEventListener('mouseup', this.boundOnResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
}
