import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { ArtifactStateService, ArtifactPermissionService, CollectionStateService } from '@memberjunction/ng-conversations';
import { Subject, takeUntil, distinctUntilChanged, combineLatest, filter } from 'rxjs';
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
      background: #0076B6;
    }

    .artifact-panel-resize-handle:active {
      background: #005a8c;
    }

    .artifact-panel {
      border-left: 1px solid #e0e0e0;
      background: white;
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
  private lastNavigatedUrl: string = ''; // Track URL to avoid reacting to our own navigation

  constructor(
    private artifactState: ArtifactStateService,
    private artifactPermissionService: ArtifactPermissionService,
    public collectionState: CollectionStateService,
    private navigationService: NavigationService,
    private router: Router
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

    // Parse URL first and apply state
    const urlState = this.parseUrlState();
    if (urlState) {
      this.applyUrlState(urlState);
    } else {
      // Check if we have navigation params from config (e.g., from Conversations linking here)
      this.applyNavigationParams();
    }

    // Subscribe to state changes to update URL
    this.subscribeToUrlStateChanges();

    // Subscribe to router NavigationEnd events for back/forward button support
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        const currentUrl = event.urlAfterRedirects || event.url;
        if (currentUrl !== this.lastNavigatedUrl) {
          this.onExternalNavigation(currentUrl);
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
   * Parse URL query string for collection state.
   * Query params: collectionId, artifactId, versionNumber
   */
  private parseUrlState(): { collectionId?: string; artifactId?: string; versionNumber?: number } | null {
    const url = this.router.url;
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const collectionId = params.get('collectionId');
    const artifactId = params.get('artifactId');
    const versionNumber = params.get('versionNumber');

    if (!collectionId && !artifactId) return null;

    return {
      collectionId: collectionId || undefined,
      artifactId: artifactId || undefined,
      versionNumber: versionNumber ? parseInt(versionNumber, 10) : undefined
    };
  }

  /**
   * Apply URL state to collection services.
   */
  private applyUrlState(state: { collectionId?: string; artifactId?: string; versionNumber?: number }): void {
    // Set active collection if specified
    if (state.collectionId) {
      this.collectionState.setActiveCollection(state.collectionId);
    }

    // Open artifact if specified
    if (state.artifactId) {
      this.artifactState.openArtifact(state.artifactId, state.versionNumber);
    }
  }

  /**
   * Apply navigation parameters from configuration.
   * This handles deep-linking from other resources (e.g., clicking a link in Conversations).
   */
  private applyNavigationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    // Set active collection if specified
    if (config.collectionId) {
      this.collectionState.setActiveCollection(config.collectionId as string);
    }

    // Open artifact if specified
    if (config.artifactId) {
      const versionNumber = config.versionNumber ? (config.versionNumber as number) : undefined;
      this.artifactState.openArtifact(config.artifactId as string, versionNumber);
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
   * Handle external navigation (back/forward buttons).
   * Parses the URL and applies the state without triggering a new navigation.
   */
  private onExternalNavigation(url: string): void {
    // Check if this URL is for our component (contains our base path)
    const currentPath = this.router.url.split('?')[0];
    const newPath = url.split('?')[0];

    // Only handle if we're still on the same base path (same component instance)
    if (currentPath !== newPath) {
      return; // Different route entirely, shell will handle it
    }

    // Parse the new URL state
    const urlState = this.parseUrlFromString(url);

    // Apply the state without triggering URL updates
    this.skipUrlUpdate = true;
    if (urlState) {
      this.applyUrlState(urlState);
    } else {
      // No params means clear state
      this.collectionState.setActiveCollection(null as unknown as string);
      this.artifactState.closeArtifact();
    }
    this.skipUrlUpdate = false;

    // Update the tracked URL
    this.lastNavigatedUrl = url;
  }

  /**
   * Parse URL state from a URL string (used for external navigation).
   */
  private parseUrlFromString(url: string): { collectionId?: string; artifactId?: string; versionNumber?: number } | null {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const collectionId = params.get('collectionId');
    const artifactId = params.get('artifactId');
    const versionNumber = params.get('versionNumber');

    if (!collectionId && !artifactId) return null;

    return {
      collectionId: collectionId || undefined,
      artifactId: artifactId || undefined,
      versionNumber: versionNumber ? parseInt(versionNumber, 10) : undefined
    };
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
