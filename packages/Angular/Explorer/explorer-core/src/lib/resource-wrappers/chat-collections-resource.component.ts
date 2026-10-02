import { Component, ViewEncapsulation, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { DataSnapshot, Metadata, CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { ArtifactStateService, ArtifactPermissionService, CollectionStateService } from '@memberjunction/ng-conversations';
import { AnalyzeArtifactService } from '@memberjunction/ng-artifacts';
import { MJNotificationService } from '@memberjunction/ng-notifications';
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
            [currentUser]="currentUser"
            (openConversationRequested)="onOpenConversation($event)">
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
            [contextCollectionId]="activeCollectionId ?? undefined"
            [canShare]="canShareActiveArtifact"
            [canEdit]="canEditActiveArtifact"
            [isMaximized]="isArtifactPanelMaximized"
            (closed)="closeArtifactPanel()"
            (maximizeToggled)="toggleMaximizeArtifactPanel()"
            (navigateToLink)="onNavigateToLink($event)"
            (openEntityRecord)="onOpenEntityRecord($event)"
            (analyzeRequested)="onAnalyzeRequested($event)">
          </mj-artifact-viewer-panel>
        </div>
      }
    </div>
    `,
  styles: [`
    /* :host doesn't work with ViewEncapsulation.None — use the element selector */
    mj-chat-collections-resource {
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
  public CurrentUser: any = null;

  /** @deprecated Use {@link CurrentUser}. */
  public get currentUser(): any {
    return this.CurrentUser;
  }
  /** @deprecated Use {@link CurrentUser}. */
  public set currentUser(value: any) {
    this.CurrentUser = value;
  }

  // Artifact panel state
  public IsArtifactPanelOpen: boolean = false;

  /** @deprecated Use {@link IsArtifactPanelOpen}. */
  public get isArtifactPanelOpen(): boolean {
    return this.IsArtifactPanelOpen;
  }
  /** @deprecated Use {@link IsArtifactPanelOpen}. */
  public set isArtifactPanelOpen(value: boolean) {
    this.IsArtifactPanelOpen = value;
  }
  public ActiveCollectionId: string | null = null;

  /** @deprecated Use {@link ActiveCollectionId}. */
  public get activeCollectionId(): string | null {
    return this.ActiveCollectionId;
  }
  /** @deprecated Use {@link ActiveCollectionId}. */
  public set activeCollectionId(value: string | null) {
    this.ActiveCollectionId = value;
  }
  public ActiveArtifactId: string | null = null;

  /** @deprecated Use {@link ActiveArtifactId}. */
  public get activeArtifactId(): string | null {
    return this.ActiveArtifactId;
  }
  /** @deprecated Use {@link ActiveArtifactId}. */
  public set activeArtifactId(value: string | null) {
    this.ActiveArtifactId = value;
  }
  public ActiveVersionNumber: number | null = null;

  /** @deprecated Use {@link ActiveVersionNumber}. */
  public get activeVersionNumber(): number | null {
    return this.ActiveVersionNumber;
  }
  /** @deprecated Use {@link ActiveVersionNumber}. */
  public set activeVersionNumber(value: number | null) {
    this.ActiveVersionNumber = value;
  }
  public CanShareActiveArtifact: boolean = false;

  /** @deprecated Use {@link CanShareActiveArtifact}. */
  public get canShareActiveArtifact(): boolean {
    return this.CanShareActiveArtifact;
  }
  /** @deprecated Use {@link CanShareActiveArtifact}. */
  public set canShareActiveArtifact(value: boolean) {
    this.CanShareActiveArtifact = value;
  }
  public CanEditActiveArtifact: boolean = false;

  /** @deprecated Use {@link CanEditActiveArtifact}. */
  public get canEditActiveArtifact(): boolean {
    return this.CanEditActiveArtifact;
  }
  /** @deprecated Use {@link CanEditActiveArtifact}. */
  public set canEditActiveArtifact(value: boolean) {
    this.CanEditActiveArtifact = value;
  }
  public ArtifactPanelWidth: number = 40;

  /** @deprecated Use {@link ArtifactPanelWidth}. */
  public get artifactPanelWidth(): number {
    return this.ArtifactPanelWidth;
  }
  /** @deprecated Use {@link ArtifactPanelWidth}. */
  public set artifactPanelWidth(value: number) {
    this.ArtifactPanelWidth = value;
  } // Default 40% width (percentage-based)
  public IsArtifactPanelMaximized: boolean = false;

  /** @deprecated Use {@link IsArtifactPanelMaximized}. */
  public get isArtifactPanelMaximized(): boolean {
    return this.IsArtifactPanelMaximized;
  }
  /** @deprecated Use {@link IsArtifactPanelMaximized}. */
  public set isArtifactPanelMaximized(value: boolean) {
    this.IsArtifactPanelMaximized = value;
  }
  private artifactPanelWidthBeforeMaximize: number = 40; // Store width before maximizing

  // Resize state
  private isResizing: boolean = false;
  private resizeStartX: number = 0;
  private resizeStartWidth: number = 0;

  private initializing = true; // Prevents URL updates during initialization

  private artifactState = inject(ArtifactStateService);
  private artifactPermissionService = inject(ArtifactPermissionService);
  public CollectionState = inject(CollectionStateService);

  /** @deprecated Use {@link CollectionState}. */
  public get collectionState() {
    return this.CollectionState;
  }
  /** @deprecated Use {@link CollectionState}. */
  public set collectionState(value) {
    this.CollectionState = value;
  }
  private cdr = inject(ChangeDetectorRef);
  private analyzeService = inject(AnalyzeArtifactService);

  ngOnInit() {
    super.ngOnInit();
    const md = this.ProviderToUse;
    this.CurrentUser = md.CurrentUser;

    // Subscribe to artifact state changes
    this.subscribeToArtifactState();

    // Setup resize listeners
    this.setupResizeListeners();

    // Apply initial state from query params or tab config
    this.applyInitialParams();

    // Subscribe to state changes to push URL updates
    this.subscribeToUrlStateChanges();

    // Subscribe to collection and artifact changes to update tab title
    this.CollectionState.activeCollectionId$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(collectionId => {
        this.ActiveCollectionId = collectionId;
        // Only update if no artifact is open (artifact title takes priority)
        if (!this.ActiveArtifactId) {
          this.updateCollectionTabTitle(collectionId);
        }
        this.cdr.detectChanges();
      });

    this.artifactState.activeArtifact$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(artifact => {
        if (artifact && artifact.Name) {
          this.NotifyDisplayNameChanged(artifact.Name);
        } else {
          // Artifact closed — fall back to collection name
          this.updateCollectionTabTitle(this.CollectionState.activeCollectionId);
        }
      });

    // Enable URL updates after initialization
    this.initializing = false;

    // Push initial state to URL — but only if we actually have state to reflect.
    // On a cold/direct deep-link load the params may arrive via the reactive
    // OnQueryParamsChanged delivery slightly after ngOnInit; pushing empty params
    // here would strip the deep link from the URL before that delivery lands.
    // Once state is set (synchronously when params are already present, or via the
    // reactive delivery), subscribeToUrlStateChanges() pushes the normalized URL.
    if (this.CollectionState.activeCollectionId || this.ActiveArtifactId) {
      this.pushStateToUrl();
    }

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }


  /**
   * Apply initial state from query params or tab configuration.
   */
  private applyInitialParams(): void {
    const params = this.GetQueryParams();
    const config = this.Data?.Configuration;

    const collectionId = params['collectionId'] || (config?.collectionId as string);
    const artifactId = params['artifactId'] || (config?.artifactId as string);
    const versionNumber = params['versionNumber'] ? parseInt(params['versionNumber'], 10)
      : config?.versionNumber ? (config.versionNumber as number) : undefined;

    if (collectionId) {
      this.CollectionState.setActiveCollection(collectionId);
    }
    if (artifactId) {
      this.artifactState.openArtifact(artifactId, versionNumber);
    }
  }

  /**
   * React to browser back/forward query param changes.
   */
  protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    const collectionId = params['collectionId'];
    const artifactId = params['artifactId'];
    const versionNumber = params['versionNumber'] ? parseInt(params['versionNumber'], 10) : undefined;

    if (collectionId) {
      this.CollectionState.setActiveCollection(collectionId);
    } else {
      this.CollectionState.setActiveCollection(null);
    }

    if (artifactId) {
      this.artifactState.openArtifact(artifactId, versionNumber);
    } else {
      this.artifactState.closeArtifact();
    }
  }

  /**
   * Subscribe to state changes for URL updates.
   */
  private subscribeToUrlStateChanges(): void {
    combineLatest([
      this.CollectionState.activeCollectionId$.pipe(distinctUntilChanged()),
      this.artifactState.activeArtifactId$.pipe(distinctUntilChanged()),
      this.artifactState.activeVersionNumber$.pipe(distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.initializing) {
          this.pushStateToUrl();
        }
      });
  }

  /**
   * Push current state to URL via framework query params.
   */
  private pushStateToUrl(): void {
    const queryParams: Record<string, string | null> = {};

    const collectionId = this.CollectionState.activeCollectionId;
    queryParams['collectionId'] = collectionId || null;

    if (this.ActiveArtifactId) {
      queryParams['artifactId'] = this.ActiveArtifactId;
      queryParams['versionNumber'] = this.ActiveVersionNumber ? this.ActiveVersionNumber.toString() : null;
    } else {
      queryParams['artifactId'] = null;
      queryParams['versionNumber'] = null;
    }

    this.UpdateQueryParams(queryParams);
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
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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
    super.ngOnDestroy();
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
        this.IsArtifactPanelOpen = isOpen;
        this.cdr.detectChanges();
      });

    // Subscribe to active artifact ID
    this.artifactState.activeArtifactId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async id => {
        this.ActiveArtifactId = id;
        if (id) {
          await this.loadArtifactPermissions(id);
        } else {
          this.CanShareActiveArtifact = false;
          this.CanEditActiveArtifact = false;
        }
        this.cdr.detectChanges();
      });

    // Subscribe to active version number
    this.artifactState.activeVersionNumber$
      .pipe(takeUntil(this.destroy$))
      .subscribe(versionNumber => {
        this.ActiveVersionNumber = versionNumber;
      });
  }

  /**
   * Load permissions for the active artifact
   */
  private async loadArtifactPermissions(artifactId: string): Promise<void> {
    if (!artifactId || !this.CurrentUser) {
      this.CanShareActiveArtifact = false;
      this.CanEditActiveArtifact = false;
      return;
    }

    try {
      const permissions = await this.artifactPermissionService.getUserPermissions(artifactId, this.CurrentUser);
      this.CanShareActiveArtifact = permissions.canShare;
      this.CanEditActiveArtifact = permissions.canEdit;
    } catch (error) {
      console.error('Failed to load artifact permissions:', error);
      this.CanShareActiveArtifact = false;
      this.CanEditActiveArtifact = false;
    }
  }

  /**
   * Close the artifact panel
   */
  CloseArtifactPanel(): void {
    this.artifactState.closeArtifact();
  }

  /** @deprecated Use {@link CloseArtifactPanel}. */
  closeArtifactPanel(): void {
    return this.CloseArtifactPanel();
  }

  /**
   * Toggle maximize/restore state for artifact panel
   */
  ToggleMaximizeArtifactPanel(): void {
    if (this.IsArtifactPanelMaximized) {
      // Restore to previous width
      this.ArtifactPanelWidth = this.artifactPanelWidthBeforeMaximize;
      this.IsArtifactPanelMaximized = false;
    } else {
      // Maximize - store current width and set to 100%
      this.artifactPanelWidthBeforeMaximize = this.ArtifactPanelWidth;
      this.ArtifactPanelWidth = 100;
      this.IsArtifactPanelMaximized = true;
    }
  }

  /** @deprecated Use {@link ToggleMaximizeArtifactPanel}. */
  toggleMaximizeArtifactPanel(): void {
    return this.ToggleMaximizeArtifactPanel();
  }

  /**
   * Handle navigation request from artifact viewer panel.
   * Converts the link event to a generic navigation request and uses NavigationService.
   */
  OnNavigateToLink(event: {
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

    // Also deliver as query params so an already-open/cached target tab applies them
    // (configuration alone is only read by a fresh tab's ngOnInit).
    const queryParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value != null) queryParams[key] = String(value);
    }

    // Navigate using the generic nav item method
    this.navigationService.OpenNavItemByName(navItemName, params, undefined, { queryParams });
  }

  /** @deprecated Use {@link OnNavigateToLink}. */
  onNavigateToLink(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
    versionId?: string;
  }): void {
    return this.OnNavigateToLink(event);
  }

  /**
   * Open the conversation an artifact was produced in (from the Collections view's
   * right-click "Open source conversation"). Routes to the Conversations nav item.
   */
  OnOpenConversation(event: { conversationId: string }): void {
    // Pass conversationId BOTH as configuration (read by a fresh tab's ngOnInit) AND as
    // queryParams (drives OnQueryParamsChanged on the already-open/cached Conversations tab).
    // Without the queryParams, switching to an existing Conversations tab opens the app but
    // never selects the conversation, since the cached component doesn't re-run ngOnInit.
    this.navigationService.OpenNavItemByName(
      'Conversations',
      { conversationId: event.conversationId },
      undefined,
      { queryParams: { conversationId: event.conversationId } }
    );
  }

  /** @deprecated Use {@link OnOpenConversation}. */
  onOpenConversation(event: { conversationId: string }): void {
    return this.OnOpenConversation(event);
  }

  /**
   * Handle entity record open request from artifact viewer (from React component grids).
   * Uses NavigationService to open the record in a new tab.
   */
  OnOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    return this.OnOpenEntityRecord(event);
  }

  /**
   * Handler for the Analyze button on the artifact viewer panel.
   * Captures the live DataSnapshot, creates a new analysis conversation
   * with the snapshot attached as an input artifact, and routes the user
   * to the Conversations nav item for the new conversation.
   */
  async OnAnalyzeRequested(event: { artifactId: string; snapshot: DataSnapshot }): Promise<void> {
    if (!this.CurrentUser) return;

    try {
      const result = await this.analyzeService.StartAnalysisConversation({
        snapshot: event.snapshot,
        currentUser: this.CurrentUser,
        environmentId: this.EnvironmentId,
      });

      await this.navigationService.OpenNavItemByName(
        'Conversations',
        { conversationId: result.conversationId },
        undefined,
        { queryParams: { conversationId: result.conversationId } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start analysis conversation';
      MJNotificationService.Instance.CreateSimpleNotification(message, 'error', 5000);
    }
  }

  /** @deprecated Use {@link OnAnalyzeRequested}. */
  async onAnalyzeRequested(event: { artifactId: string; snapshot: DataSnapshot }): Promise<void> {
    return this.OnAnalyzeRequested(event);
  }

  /**
   * Get the environment ID from configuration or use default
   */
  get EnvironmentId(): string {
    return this.Data?.Configuration?.environmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
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

  OnResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.ArtifactPanelWidth;
    window.addEventListener('mousemove', this.boundOnResizeMove);
    window.addEventListener('mouseup', this.boundOnResizeEnd);
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /** @deprecated Use {@link OnResizeStart}. */
  onResizeStart(event: MouseEvent): void {
    return this.OnResizeStart(event);
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
    this.ArtifactPanelWidth = newWidth;
  }

  private onResizeEnd(event: MouseEvent): void {
    this.isResizing = false;
    window.removeEventListener('mousemove', this.boundOnResizeMove);
    window.removeEventListener('mouseup', this.boundOnResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
}
