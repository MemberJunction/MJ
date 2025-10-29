import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  DoCheck,
  ChangeDetectorRef
} from '@angular/core';
import { ConversationEntity, ArtifactEntity, TaskEntity } from '@memberjunction/core-entities';
import { UserInfo, CompositeKey, KeyValuePair, Metadata } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ConversationStateService } from '../../services/conversation-state.service';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { CollectionStateService } from '../../services/collection-state.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationTab, WorkspaceLayout } from '../../models/conversation-state.model';
import { SearchResult } from '../../services/search.service';
import { Subject, takeUntil } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Top-level workspace component for conversations
 * Provides 3-column Slack-style layout: Navigation | Sidebar | Chat Area | Artifact Panel
 * Supports context-based navigation (library or task views)
 */
@Component({
  selector: 'mj-conversation-workspace',
  templateUrl: './conversation-workspace.component.html',
  styleUrls: ['./conversation-workspace.component.css']
})
export class ConversationWorkspaceComponent extends BaseAngularComponent implements OnInit, OnDestroy, DoCheck {
  @Input() environmentId!: string;
  @Input() initialConversationId?: string;
  @Input() layout: WorkspaceLayout = 'full';
  @Input() currentUser!: UserInfo;
  @Input() activeContext?: 'library' | 'task';
  @Input() contextItemId?: string;

  // Navigation properties for external control (deep linking from URL)
  @Input() set activeTabInput(value: 'conversations' | 'collections' | 'tasks' | undefined) {
    if (value && value !== this.activeTab) {
      this.activeTab = value;
    }
  }

  @Input() set activeConversationInput(value: string | undefined) {
    if (value && value !== this.conversationState.activeConversationId) {
      console.log('🔗 Deep link to conversation:', value);
      this.activeTab = 'conversations';
      this.conversationState.setActiveConversation(value);
    }
  }

  @Input() set activeCollectionInput(value: string | undefined) {
    if (value && value !== this.collectionState.activeCollectionId) {
      console.log('🔗 Deep link to collection:', value);
      this.activeTab = 'collections';
      this.collectionState.setActiveCollection(value);
    }
  }

  @Input() set activeArtifactInput(value: string | undefined) {
    if (value && value !== this.activeArtifactId) {
      console.log('🔗 Deep link to artifact:', value);
      this.activeTab = 'collections';
      // Open artifact with version number if provided
      this.artifactState.openArtifact(value, this._pendingVersionNumber);
      this._pendingVersionNumber = undefined; // Clear after use
    }
  }

  @Input() set activeVersionNumberInput(value: number | undefined) {
    // Store version number to use when artifact is opened
    this._pendingVersionNumber = value;
  }

  private _pendingVersionNumber?: number;

  @Input() set activeTaskInput(value: string | undefined) {
    if (value && value !== this._activeTaskId) {
      this._activeTaskId = value;
    }
  }

  private _activeTaskId?: string;
  get activeTaskId(): string | undefined {
    return this._activeTaskId;
  }

  @Output() conversationChanged = new EventEmitter<ConversationEntity>();
  @Output() artifactOpened = new EventEmitter<ArtifactEntity>();
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() navigationChanged = new EventEmitter<{
    tab: 'conversations' | 'collections' | 'tasks';
    conversationId?: string;
    collectionId?: string;
    artifactId?: string;
    taskId?: string;
  }>();

  public activeTab: NavigationTab = 'conversations';
  public isSidebarVisible: boolean = true;
  public isArtifactPanelOpen: boolean = false;
  public isSearchPanelOpen: boolean = false;
  public renamedConversationId: string | null = null;
  public activeArtifactId: string | null = null;
  public activeVersionNumber: number | null = null;

  // Artifact permissions
  public canShareActiveArtifact: boolean = false;
  public canEditActiveArtifact: boolean = false;

  // Share modal state
  public isArtifactShareModalOpen: boolean = false;
  public artifactToShare: ArtifactEntity | null = null;

  // Resize state - Sidebar
  public sidebarWidth: number = 260; // Default width
  private isSidebarResizing: boolean = false;
  private sidebarResizeStartX: number = 0;
  private sidebarResizeStartWidth: number = 0;

  // Resize state - Artifact Panel
  public artifactPanelWidth: number = 40; // Default 40% width
  private isArtifactPanelResizing: boolean = false;
  private artifactPanelResizeStartX: number = 0;
  private artifactPanelResizeStartWidth: number = 0;

  private previousConversationId: string | null = null;
  private previousTaskId: string | undefined = undefined;
  private previousArtifactId: string | null = null; // Used to track artifact changes in ngDoCheck
  private destroy$ = new Subject<void>();

  // LocalStorage keys
  private readonly SIDEBAR_WIDTH_KEY = 'mj-conversations-sidebar-width';
  private readonly ARTIFACT_PANEL_WIDTH_KEY = 'mj-artifact-panel-width';

  // Task filter for conversation-specific filtering
  public tasksFilter: string = '1=1';

  constructor(
    public conversationState: ConversationStateService,
    public artifactState: ArtifactStateService,
    public collectionState: CollectionStateService,
    private artifactPermissionService: ArtifactPermissionService,
    private notificationService: MJNotificationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  async ngOnInit() {
    // Load saved widths from localStorage
    this.loadSidebarWidth();
    this.loadArtifactPanelWidth();

    // Setup resize listeners
    window.addEventListener('mousemove', this.onResizeMove.bind(this));
    window.addEventListener('mouseup', this.onResizeEnd.bind(this));

    // Initialize AI Engine to load agent metadata cache
    // This ensures agent names and icons are available for display
    try {
      await AIEngineBase.Instance.Config(false);
      console.log('✅ AI Engine initialized with', AIEngineBase.Instance.Agents?.length || 0, 'agents');
    } catch (error) {
      console.error('❌ Failed to initialize AI Engine:', error);
    }

    // Subscribe to artifact panel state
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
        // Load permissions when artifact changes
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

    // Set initial conversation if provided
    if (this.initialConversationId) {
      this.conversationState.setActiveConversation(this.initialConversationId);
    }

    // Handle context-based navigation
    if (this.activeContext === 'library') {
      this.activeTab = 'collections';
    }
    // Task context will be handled by chat header dropdown, not navigation tabs

    // Build task filter for conversations domain
    this.buildTasksFilter();
  }

  /**
   * Builds the SQL filter for tasks in conversations the user has access to
   */
  private buildTasksFilter(): void {
    // Filter tasks by conversations the user owns or is a participant in, or tasks owned
    // by the user
    const md = new Metadata();
    const cd = md.EntityByName('Conversation Details');
    const c = md.EntityByName('Conversations');
    if (!cd || !c) {
      console.warn('⚠️ Missing metadata for Conversations or Conversation Details');
      this.tasksFilter = `ParentID IS NULL AND UserID = '${this.currentUser.ID}'`; // Fallback to user-owned tasks only
      return;
    }

    this.tasksFilter = `ParentID IS NULL AND (UserID = '${this.currentUser.ID}' OR ConversationDetailID IN (
      SELECT ID FROM [${cd.SchemaName}].[${cd.BaseView}] 
      WHERE 
      UserID ='${this.currentUser.ID}' OR 
      ConversationID IN (
        SELECT ID FROM [${c.SchemaName}].[${c.BaseView}] WHERE UserID='${this.currentUser.ID}'
      )
    ))`;
    console.log('📝 Conversations domain tasks filter built:', this.tasksFilter);
  }

  ngDoCheck() {
    // Detect conversation changes and emit event
    const currentId = this.conversationState.activeConversationId;
    if (currentId !== this.previousConversationId) {
      this.previousConversationId = currentId;
      const conversation = this.conversationState.activeConversation;
      if (conversation) {
        this.conversationChanged.emit(conversation);

        // Also emit navigationChanged for URL updates (only if on conversations tab)
        if (this.activeTab === 'conversations' && currentId) {
          // Defer emission until after change detection completes
          Promise.resolve().then(() => {
            this.navigationChanged.emit({
              tab: 'conversations',
              conversationId: currentId
            });
          });
        }
      }
    }

    // Detect task selection changes (when on tasks tab)
    if (this.activeTab === 'tasks') {
      const currentTaskId = this.activeTaskId;
      if (currentTaskId !== this.previousTaskId) {
        this.previousTaskId = currentTaskId;
        if (currentTaskId) {
          // Defer emission until after change detection completes
          Promise.resolve().then(() => {
            this.navigationChanged.emit({
              tab: 'tasks',
              taskId: currentTaskId
            });
          });
        }
      }
    }

    // Detect artifact changes (when on collections tab)
    // This ensures URL stays in sync with artifact state even after async updates
    if (this.activeTab === 'collections') {
      const currentArtifactId = this.activeArtifactId;
      if (currentArtifactId !== this.previousArtifactId) {
        this.previousArtifactId = currentArtifactId;
        // Defer emission until after change detection completes to avoid ExpressionChangedAfterItHasBeenCheckedError
        Promise.resolve().then(() => {
          this.navigationChanged.emit({
            tab: 'collections',
            collectionId: this.collectionState.activeCollectionId || undefined,
            artifactId: currentArtifactId || undefined
          });
        });
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Remove resize listeners
    window.removeEventListener('mousemove', this.onResizeMove.bind(this));
    window.removeEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  onTabChanged(tab: NavigationTab): void {
    this.activeTab = tab;

    // Emit navigation change event with current state
    const navEvent: any = {
      tab: tab as 'conversations' | 'collections' | 'tasks'
    };

    if (tab === 'conversations') {
      navEvent.conversationId = this.conversationState.activeConversationId || undefined;
    } else if (tab === 'collections') {
      navEvent.collectionId = this.collectionState.activeCollectionId || undefined;
      navEvent.artifactId = this.activeArtifactId || undefined;
    } else if (tab === 'tasks') {
      navEvent.taskId = this.activeTaskId || undefined;
    }

    this.navigationChanged.emit(navEvent);

    // Auto-close artifact panel when switching away from collections
    if (tab === 'conversations' || tab === 'tasks') {
      this.artifactState.closeArtifact();
    }
  }

  toggleSidebar(): void {
    this.isSidebarVisible = !this.isSidebarVisible;
  }

  closeArtifactPanel(): void {
    this.artifactState.closeArtifact();
  }

  openSearch(): void {
    this.isSearchPanelOpen = true;
  }

  closeSearch(): void {
    this.isSearchPanelOpen = false;
  }

  async onRefreshAgentCache(): Promise<void> {
    try {
      await AIEngineBase.Instance.Config(true);
      const agentCount = AIEngineBase.Instance.Agents?.length || 0;
      this.notificationService.CreateSimpleNotification(`Agent cache refreshed (${agentCount} agents)`, 'success', 3000);
      this.cdr.detectChanges();
    } catch (error) {
      this.notificationService.CreateSimpleNotification('Failed to refresh agent cache', 'error', 3000);
      console.error('Failed to refresh AI Engine:', error);
    }
  }

  handleSearchResult(result: SearchResult): void {
    console.log('🔍 Navigating to search result:', result);

    switch (result.type) {
      case 'conversation':
        // Switch to conversations tab and select conversation
        this.activeTab = 'conversations';
        this.conversationState.setActiveConversation(result.id);
        this.navigationChanged.emit({
          tab: 'conversations',
          conversationId: result.id
        });
        break;

      case 'message':
        // Switch to conversations tab, open conversation, and scroll to message (future enhancement)
        this.activeTab = 'conversations';
        if (result.conversationId) {
          this.conversationState.setActiveConversation(result.conversationId);
          this.navigationChanged.emit({
            tab: 'conversations',
            conversationId: result.conversationId
            // TODO: Add messageId for scroll-to support in future
          });
        }
        break;

      case 'artifact':
        // Switch to collections tab and open artifact
        this.activeTab = 'collections';
        this.artifactState.openArtifact(result.id);

        // If artifact is in a collection, navigate to that collection
        const collectionId = result.collectionId || undefined;

        this.navigationChanged.emit({
          tab: 'collections',
          collectionId,
          artifactId: result.id
        });
        break;

      case 'collection':
        // Switch to collections tab and navigate to collection
        this.activeTab = 'collections';
        this.collectionState.setActiveCollection(result.id);

        this.navigationChanged.emit({
          tab: 'collections',
          collectionId: result.id
        });
        break;

      case 'task':
        // Switch to tasks tab and select task
        this.activeTab = 'tasks';
        this._activeTaskId = result.id;
        this.navigationChanged.emit({
          tab: 'tasks',
          taskId: result.id
        });
        break;
    }

    // Close search panel after navigation
    this.closeSearch();
  }

  /**
   * Sidebar resize methods
   */
  onSidebarResizeStart(event: MouseEvent): void {
    this.isSidebarResizing = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Artifact panel resize methods
   */
  onArtifactPanelResizeStart(event: MouseEvent): void {
    this.isArtifactPanelResizing = true;
    this.artifactPanelResizeStartX = event.clientX;
    this.artifactPanelResizeStartWidth = this.artifactPanelWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove(event: MouseEvent): void {
    if (this.isSidebarResizing) {
      const deltaX = event.clientX - this.sidebarResizeStartX;
      let newWidth = this.sidebarResizeStartWidth + deltaX;

      // Constrain between 200px and 500px
      newWidth = Math.max(200, Math.min(500, newWidth));
      this.sidebarWidth = newWidth;
    } else if (this.isArtifactPanelResizing) {
      const container = document.querySelector('.workspace-content') as HTMLElement;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const deltaX = event.clientX - this.artifactPanelResizeStartX;
      const deltaPercent = (deltaX / containerWidth) * -100; // Negative because we're pulling from the right
      let newWidth = this.artifactPanelResizeStartWidth + deltaPercent;

      // Constrain between 20% and 70%
      newWidth = Math.max(20, Math.min(70, newWidth));
      this.artifactPanelWidth = newWidth;
    }
  }

  private onResizeEnd(event: MouseEvent): void {
    if (this.isSidebarResizing) {
      this.isSidebarResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveSidebarWidth();
    } else if (this.isArtifactPanelResizing) {
      this.isArtifactPanelResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveArtifactPanelWidth();
    }
  }

  /**
   * LocalStorage persistence methods
   */
  private loadSidebarWidth(): void {
    try {
      const saved = localStorage.getItem(this.SIDEBAR_WIDTH_KEY);
      if (saved) {
        const width = parseInt(saved, 10);
        if (!isNaN(width) && width >= 200 && width <= 500) {
          this.sidebarWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load sidebar width from localStorage:', error);
    }
  }

  private saveSidebarWidth(): void {
    try {
      localStorage.setItem(this.SIDEBAR_WIDTH_KEY, this.sidebarWidth.toString());
    } catch (error) {
      console.warn('Failed to save sidebar width to localStorage:', error);
    }
  }

  private loadArtifactPanelWidth(): void {
    try {
      const saved = localStorage.getItem(this.ARTIFACT_PANEL_WIDTH_KEY);
      if (saved) {
        const width = parseFloat(saved);
        if (!isNaN(width) && width >= 20 && width <= 70) {
          this.artifactPanelWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load artifact panel width from localStorage:', error);
    }
  }

  private saveArtifactPanelWidth(): void {
    try {
      localStorage.setItem(this.ARTIFACT_PANEL_WIDTH_KEY, this.artifactPanelWidth.toString());
    } catch (error) {
      console.warn('Failed to save artifact panel width to localStorage:', error);
    }
  }

  onConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    console.log('✨ Workspace received rename event:', event);
    // Trigger animation in sidebar by setting the ID
    this.renamedConversationId = event.conversationId;

    // Clear after animation completes (1500ms)
    setTimeout(() => {
      this.renamedConversationId = null;
    }, 1500);
  }

  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    // Pass the event up to the parent component (chat-wrapper in explorer-core)
    this.openEntityRecord.emit(event);
  }

  onOpenEntityRecordFromTasks(event: {entityName: string; recordId: string}): void {
    // Convert from tasks format (recordId) to workspace format (compositeKey)
    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', event.recordId)
    ]);
    this.openEntityRecord.emit({
      entityName: event.entityName,
      compositeKey
    });
  }

  onTaskClicked(task: TaskEntity): void {
    // Switch to Tasks tab and set active task ID
    this.activeTab = 'tasks';
    this._activeTaskId = task.ID;

    // Emit navigation change
    this.navigationChanged.emit({
      tab: 'tasks',
      taskId: task.ID
    });
  }

  /**
   * Handle collection navigation events
   */
  onCollectionNavigated(event: { collectionId: string | null; artifactId?: string | null }): void {
    console.log('📁 Collection navigated:', event);

    // IMPORTANT: Don't emit navigationChanged here when doing programmatic navigation (deep linking)
    // The artifact state is managed separately and ngDoCheck will handle URL sync
    // Only emit if the event explicitly includes an artifactId, or if we're intentionally closing the artifact
    if (event.artifactId !== undefined) {
      // Event explicitly specifies artifact state (user clicked artifact or intentionally closed it)
      this.navigationChanged.emit({
        tab: 'collections',
        collectionId: event.collectionId || undefined,
        artifactId: event.artifactId || undefined
      });
    } else if (!this.activeArtifactId) {
      // No artifact currently open, safe to emit collection-only navigation
      this.navigationChanged.emit({
        tab: 'collections',
        collectionId: event.collectionId || undefined
      });
    }
    // Otherwise: artifact is open but event doesn't specify artifactId
    // Don't emit - let ngDoCheck handle keeping the URL in sync with artifact state
  }

  /**
   * Handle navigation from artifact links
   */
  onArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string}): void {
    console.log('🔗 Navigating from artifact link:', event);

    if (event.type === 'conversation') {
      this.activeTab = 'conversations';
      this.conversationState.setActiveConversation(event.id);
      this.navigationChanged.emit({
        tab: 'conversations',
        conversationId: event.id
      });
    } else if (event.type === 'collection') {
      this.activeTab = 'collections';
      this.collectionState.setActiveCollection(event.id);
      this.navigationChanged.emit({
        tab: 'collections',
        collectionId: event.id
      });
    }
  }

  /**
   * Load permissions for the given artifact
   */
  private async loadArtifactPermissions(artifactId: string): Promise<void> {
    // Guard against null/undefined
    if (!artifactId) {
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
   * Handle share request from artifact viewer
   */
  async onArtifactShareRequested(artifactId: string): Promise<void> {
    // Load the artifact entity to pass to the modal
    const md = new Metadata();
    const artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts');
    await artifact.Load(artifactId);

    if (artifact) {
      this.artifactToShare = artifact;
      this.isArtifactShareModalOpen = true;
    }
  }

  /**
   * Handle close of artifact share modal
   */
  onArtifactShareModalClose(): void {
    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;
  }

  /**
   * Handle successful share - refresh permissions
   */
  async onArtifactShared(): Promise<void> {
    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;

    // Refresh permissions for the active artifact
    if (this.activeArtifactId) {
      await this.loadArtifactPermissions(this.activeArtifactId);
    }
  }
}