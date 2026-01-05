/**
 * ============================================================================
 * DEPRECATED - DO NOT USE
 * ============================================================================
 *
 * This workspace component was used when conversations, collections, and tasks
 * were all combined into a single tabbed interface.
 *
 * The new architecture uses SEPARATE resource components for each feature:
 * - ChatConversationsResource for conversations
 * - CollectionsResource for collections
 * - TasksResource for tasks
 *
 * These resource components are located in @memberjunction/ng-explorer-core
 * and integrate with MJExplorer's tab/navigation system.
 *
 * This file is kept for backwards compatibility only. Any new features or
 * bug fixes should be made to the individual resource components instead.
 * ============================================================================
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  DoCheck,
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import { ConversationEntity, ArtifactEntity, TaskEntity, ArtifactMetadataEngine, UserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { UserInfo, CompositeKey, KeyValuePair, Metadata } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ConversationDataService } from '../../services/conversation-data.service';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { CollectionStateService } from '../../services/collection-state.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { ConversationStreamingService } from '../../services/conversation-streaming.service';
import { UICommandHandlerService } from '../../services/ui-command-handler.service';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationTab, WorkspaceLayout } from '../../models/conversation-state.model';
import { SearchResult } from '../../services/search.service';
import { Subject, takeUntil } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionableCommand, AutomaticCommand } from '@memberjunction/ai-core-plus';
import { PendingAttachment } from '../mention/mention-editor.component';

/**
 * Top-level workspace component for conversations
 * Provides 3-column Slack-style layout: Navigation | Sidebar | Chat Area | Artifact Panel
 * Supports context-based navigation (library or task views)
 *
 * @deprecated Use ChatConversationsResource from @memberjunction/ng-explorer-core instead.
 * This component is maintained for backwards compatibility but the resource-wrapper pattern
 * is the preferred approach for MJExplorer integration.
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
    if (value && value !== this.selectedConversationId) {
      console.log('🔗 Deep link to conversation:', value);
      this.activeTab = 'conversations';
      this.setActiveConversation(value);
    }
  }

  @Input() set activeCollectionInput(value: string | undefined) {
    if (value && value !== this.collectionState.activeCollectionId) {
      console.log('🔗 Deep link to collection:', value);
      this.activeTab = 'collections';
      this.collectionState.setActiveCollection(value);
    }
  }

  @Input() set activeVersionIdInput(value: string | undefined) {
    if (value && value !== this.activeVersionId) {
      console.log('🔗 Deep link to version:', value);
      this.activeTab = 'collections';
      // Store the version ID immediately to prevent ngDoCheck from clearing it
      this.activeVersionId = value;
      // Open artifact by version ID
      this.artifactState.openArtifactByVersionId(value);
    }
  }

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
  @Output() navigationChanged = new EventEmitter<{
    tab: 'conversations' | 'collections' | 'tasks';
    conversationId?: string;
    collectionId?: string;
    versionId?: string;
    taskId?: string;
  }>();
  @Output() newConversationStarted = new EventEmitter<void>();
  @Output() actionableCommandExecuted = new EventEmitter<ActionableCommand>();
  @Output() automaticCommandExecuted = new EventEmitter<AutomaticCommand>();

  public activeTab: NavigationTab = 'conversations';
  public isSidebarVisible: boolean = true;
  public isArtifactPanelOpen: boolean = false;
  public isSearchPanelOpen: boolean = false;
  public isWorkspaceReady: boolean = false;
  public renamedConversationId: string | null = null;
  public activeArtifactId: string | null = null;
  public activeVersionNumber: number | null = null;
  public activeVersionId: string | null = null;
  public isMobileView: boolean = false;
  public isSidebarPinned: boolean = false; // Default unpinned until settings load (prevents flicker)

  // Artifact permissions
  public canShareActiveArtifact: boolean = false;
  public canEditActiveArtifact: boolean = false;

  // Share modal state
  public isArtifactShareModalOpen: boolean = false;
  public artifactToShare: ArtifactEntity | null = null;

  // Resize state - Sidebar
  public sidebarWidth: number = 260; // Default width
  public isSidebarCollapsed: boolean = true; // Default collapsed until settings load (prevents flicker)
  public sidebarTransitionsEnabled: boolean = false; // Disabled during initial load to prevent jarring animation
  public isSidebarSettingsLoaded: boolean = false; // Tracks whether settings have been loaded (prevents render before state is known)
  private isSidebarResizing: boolean = false;
  private sidebarResizeStartX: number = 0;
  private sidebarResizeStartWidth: number = 0;

  // Resize state - Artifact Panel
  public artifactPanelWidth: number = 40; // Default 40% width
  public isArtifactPanelMaximized: boolean = false;
  private artifactPanelWidthBeforeMaximize: number = 40; // Store width before maximizing
  private isArtifactPanelResizing: boolean = false;
  private artifactPanelResizeStartX: number = 0;
  private artifactPanelResizeStartWidth: number = 0;

  private previousConversationId: string | null = null;
  private previousTaskId: string | undefined = undefined;
  private previousVersionId: string | null = null; // Used to track version changes in ngDoCheck
  private previousIsNewConversation: boolean = false; // Track new conversation state changes
  private destroy$ = new Subject<void>();

  // User Settings key for server-side persistence
  private readonly USER_SETTING_SIDEBAR_KEY = 'Conversations.SidebarState';
  private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;
  private isLoadingSettings: boolean = false;

  // Task filter for conversation-specific filtering
  public tasksFilter: string = '1=1';

  // LOCAL CONVERSATION STATE - enables multiple workspace instances
  // Each workspace manages its own selection state independently
  public selectedConversationId: string | null = null;
  public selectedConversation: ConversationEntity | null = null;
  public selectedThreadId: string | null = null;
  public isNewUnsavedConversation: boolean = false;
  public pendingMessageToSend: string | null = null;
  public pendingAttachmentsToSend: PendingAttachment[] | null = null;
  public pendingArtifactId: string | null = null;
  public pendingArtifactVersionNumber: number | null = null;

  constructor(
    public conversationData: ConversationDataService,
    public artifactState: ArtifactStateService,
    public collectionState: CollectionStateService,
    private artifactPermissionService: ArtifactPermissionService,
    private mentionAutocompleteService: MentionAutocompleteService,
    private notificationService: MJNotificationService,
    private streamingService: ConversationStreamingService,
    private uiCommandHandler: UICommandHandlerService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  // =========================================================================
  // LOCAL CONVERSATION STATE MANAGEMENT
  // These methods manage the workspace's local selection state
  // =========================================================================

  /**
   * Sets the active conversation for this workspace instance
   * @param id The conversation ID to activate (or null to clear)
   */
  setActiveConversation(id: string | null): void {
    console.log('🎯 Setting active conversation:', id);
    this.selectedConversationId = id;
    this.selectedConversation = id ? this.conversationData.getConversationById(id) : null;
    // Clear unsaved state when switching to an existing conversation
    if (id) {
      this.isNewUnsavedConversation = false;
    }
  }

  /**
   * Initiates a new unsaved conversation (doesn't create DB record yet)
   * This shows the welcome screen and delays DB creation until first message
   */
  startNewConversation(): void {
    console.log('✨ Starting new unsaved conversation');
    this.selectedConversationId = null;
    this.selectedConversation = null;
    this.isNewUnsavedConversation = true;
    this.pendingMessageToSend = null;
    this.pendingAttachmentsToSend = null;

    // Auto-collapse if mobile OR if sidebar is not pinned
    if (this.isMobileView || !this.isSidebarPinned) {
      this.collapseSidebar();
    }
  }

  /**
   * Clears the new unsaved conversation state
   * Called when the conversation is actually created or cancelled
   */
  clearNewConversationState(): void {
    this.isNewUnsavedConversation = false;
  }

  /**
   * Opens a thread panel for a specific message
   * @param messageId The parent message ID
   */
  openThread(messageId: string): void {
    this.selectedThreadId = messageId;
  }

  /**
   * Closes the currently open thread panel
   */
  closeThread(): void {
    this.selectedThreadId = null;
  }

  /**
   * Handler for conversation selection from sidebar/list
   */
  onConversationSelected(conversationId: string): void {
    this.setActiveConversation(conversationId);

    // Auto-collapse if mobile OR if sidebar is not pinned
    if (this.isMobileView || !this.isSidebarPinned) {
      this.collapseSidebar();
    }
  }

  /**
   * Handler for new conversation creation from chat area
   * Now includes pending message and attachments to ensure atomic state update
   */
  onConversationCreated(event: {
    conversation: ConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }): void {
    try {
      // Set ALL state atomically before Angular change detection runs
      // This ensures the new message-input component receives the pending data
      this.pendingMessageToSend = event.pendingMessage || null;
      this.pendingAttachmentsToSend = event.pendingAttachments || null;
      this.selectedConversationId = event.conversation.ID;
      this.selectedConversation = event.conversation;
      this.isNewUnsavedConversation = false;
      // The conversation is already added to conversationData by the chat area
    } catch (error) {
      console.error('onConversationCreated ERROR:', error);
    }
  }

  /**
   * Handler for pending message requested from chat area (empty state)
   * @deprecated Use onConversationCreated with pendingMessage instead
   */
  onPendingMessageRequested(event: {text: string; attachments: PendingAttachment[]}): void {
    this.pendingMessageToSend = event.text;
    this.pendingAttachmentsToSend = event.attachments;
  }

  /**
   * Handler for thread opened from chat area
   */
  onThreadOpened(threadId: string): void {
    this.selectedThreadId = threadId;
  }

  /**
   * Handler for thread closed from chat area
   */
  onThreadClosed(): void {
    this.selectedThreadId = null;
  }

  async ngOnInit() {
    // Initialize global streaming service FIRST
    // This establishes the single PubSub connection for all conversations
    this.streamingService.initialize();
    console.log('✅ Global streaming service initialized');

    // Subscribe to command events from UI Command Handler service
    // These will be bubbled up to the host application
    this.uiCommandHandler.actionableCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(command => {
        this.onActionableCommand(command);
      });

    this.uiCommandHandler.automaticCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(command => {
        this.onAutomaticCommand(command);
      });

    // Check initial mobile state FIRST
    this.checkMobileView();

    // Load sidebar state - but on mobile, always default to collapsed
    if (this.isMobileView) {
      this.isSidebarCollapsed = true;
      this.isSidebarVisible = false;
      this.isSidebarSettingsLoaded = true; // Mobile doesn't need to load settings
      // Enable transitions after a brief delay to ensure initial state is applied
      setTimeout(() => {
        this.sidebarTransitionsEnabled = true;
      }, 50);
    } else {
      // Load from User Settings (async) - await before continuing to prevent flicker
      await this.loadSidebarState();
      this.cdr.detectChanges();
      // Enable transitions after state is loaded and applied
      setTimeout(() => {
        this.sidebarTransitionsEnabled = true;
      }, 50);
    }

    // Setup resize listeners
    window.addEventListener('mousemove', this.onResizeMove.bind(this));
    window.addEventListener('mouseup', this.onResizeEnd.bind(this));

    // Setup touch listeners for mobile
    window.addEventListener('touchmove', this.onResizeTouchMove.bind(this));
    window.addEventListener('touchend', this.onResizeTouchEnd.bind(this));

    // CRITICAL: Initialize engines FIRST before rendering any UI
    // The isWorkspaceReady flag blocks all child components from rendering
    // until engines are fully loaded and ready
    try {
      // Load both engines in parallel - ArtifactMetadataEngine is lightweight (just artifact types)
      // Using Promise.all ensures optimal performance with no additional delay
      await Promise.all([
        AIEngineBase.Instance.Config(false),
        ArtifactMetadataEngine.Instance.Config(false)
      ]);

      console.log('✅ AI Engine initialized with', AIEngineBase.Instance.Agents?.length || 0, 'agents');
      console.log('✅ Artifact Metadata Engine initialized with',
        ArtifactMetadataEngine.Instance.ArtifactTypes?.length || 0, 'artifact types');

      // Initialize mention autocomplete service immediately after AI engine
      // This ensures the cache is built from the fully-loaded agent list
      await this.mentionAutocompleteService.initialize(this.currentUser);
      console.log('✅ Mention autocomplete initialized');

      // Mark workspace as ready - this allows UI to render
      this.isWorkspaceReady = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Failed to initialize engines:', error);
      // Still mark as ready so UI isn't blocked forever
      this.isWorkspaceReady = true;
      this.cdr.detectChanges();
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
      this.setActiveConversation(this.initialConversationId);
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
    // Detect new unsaved conversation state changes
    const currentIsNewConversation = this.isNewUnsavedConversation;
    if (currentIsNewConversation !== this.previousIsNewConversation) {
      this.previousIsNewConversation = currentIsNewConversation;
      if (currentIsNewConversation) {
        // Emit event to clear URL conversation parameter
        Promise.resolve().then(() => {
          this.newConversationStarted.emit();
        });
      }
    }

    // Detect conversation changes and emit event
    const currentId = this.selectedConversationId;
    if (currentId !== this.previousConversationId) {
      this.previousConversationId = currentId;
      const conversation = this.selectedConversation;
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

    // Version changes are handled by onCollectionNavigated and deep link inputs
    // We don't need ngDoCheck to track them as it causes double navigation events
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Clear any pending save timeout
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }

    // Remove resize listeners
    window.removeEventListener('mousemove', this.onResizeMove.bind(this));
    window.removeEventListener('mouseup', this.onResizeEnd.bind(this));
    window.removeEventListener('touchmove', this.onResizeTouchMove.bind(this));
    window.removeEventListener('touchend', this.onResizeTouchEnd.bind(this));
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.checkMobileView();
  }

  /**
   * Handle clicks outside the sidebar to auto-collapse when unpinned
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Only handle when sidebar is expanded but unpinned
    if (this.isSidebarCollapsed || this.isSidebarPinned) {
      return;
    }

    // Check if click is outside the sidebar
    const target = event.target as HTMLElement;
    const sidebarElement = target.closest('.workspace-sidebar');
    const expandHandle = target.closest('.sidebar-expand-handle');

    // If click is outside sidebar and expand handle, collapse it
    if (!sidebarElement && !expandHandle) {
      this.collapseSidebar();
    }
  }

  private checkMobileView(): void {
    const wasMobile = this.isMobileView;
    this.isMobileView = window.innerWidth < 768;

    if (this.isMobileView && !wasMobile) {
      // Switched to mobile - hide sidebar and default to collapsed
      this.isSidebarVisible = false;
      this.isSidebarCollapsed = true;
    } else if (!this.isMobileView && wasMobile) {
      // Switched to desktop - show sidebar, restore state from User Settings
      this.isSidebarVisible = true;
      this.loadSidebarState().then(() => {
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Collapse sidebar
   */
  collapseSidebar(): void {
    this.isSidebarCollapsed = true;
    if (this.isMobileView) {
      this.isSidebarVisible = false;
    }
  }

  /**
   * Expand sidebar (unpinned - will auto-collapse on selection)
   */
  expandSidebar(): void {
    this.isSidebarCollapsed = false;
    this.isSidebarPinned = false;
  }

  /**
   * Pin sidebar - keep it open after selection
   */
  pinSidebar(): void {
    this.isSidebarPinned = true;
    this.saveSidebarState();
  }

  /**
   * Unpin sidebar - will auto-collapse on next selection
   */
  unpinSidebar(): void {
    this.isSidebarPinned = false;
    this.collapseSidebar();
    this.saveSidebarState();
  }

  /**
   * Save sidebar state to User Settings (server)
   * Uses debouncing to avoid excessive database writes
   */
  private saveSidebarState(): void {
    // Debounce the server save to avoid excessive writes
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }
    this.saveSettingsTimeout = setTimeout(() => {
      this.saveSidebarStateToServer();
    }, 1000); // 1 second debounce
  }

  /**
   * Save sidebar state to User Settings entity on server using UserInfoEngine for cached lookup
   * Includes collapsed, pinned, sidebarWidth, and artifactPanelWidth
   */
  private async saveSidebarStateToServer(): Promise<void> {
    try {
      const userId = this.currentUser?.ID;
      if (!userId) {
        return;
      }

      const stateToSave = {
        collapsed: this.isSidebarCollapsed,
        pinned: this.isSidebarPinned,
        sidebarWidth: this.sidebarWidth,
        artifactPanelWidth: this.artifactPanelWidth
      };

      const engine = UserInfoEngine.Instance;
      const md = new Metadata();

      // Find existing setting from cached user settings
      let setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_SIDEBAR_KEY);

      if (!setting) {
        // Create new setting
        setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings');
        setting.UserID = userId;
        setting.Setting = this.USER_SETTING_SIDEBAR_KEY;
      }

      setting.Value = JSON.stringify(stateToSave);
      await setting.Save();
    } catch (error) {
      console.warn('Failed to save sidebar state to User Settings:', error);
    }
  }

  /**
   * Load sidebar state from User Settings (server) using UserInfoEngine
   * Includes collapsed, pinned, sidebarWidth, and artifactPanelWidth
   * For new users with no saved state, defaults to collapsed with new conversation
   */
  private async loadSidebarState(): Promise<void> {
    this.isLoadingSettings = true;

    try {
      const userId = this.currentUser?.ID;
      if (userId) {
        // Try loading from cached User Settings
        const engine = UserInfoEngine.Instance;
        const setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_SIDEBAR_KEY);

        if (setting?.Value) {
          const state = JSON.parse(setting.Value);
          this.isSidebarCollapsed = state.collapsed ?? true;
          this.isSidebarPinned = state.pinned ?? false;

          // Load width values if present (with validation)
          if (typeof state.sidebarWidth === 'number' && state.sidebarWidth >= 200 && state.sidebarWidth <= 500) {
            this.sidebarWidth = state.sidebarWidth;
          }
          if (typeof state.artifactPanelWidth === 'number' && state.artifactPanelWidth >= 20 && state.artifactPanelWidth <= 70) {
            this.artifactPanelWidth = state.artifactPanelWidth;
          }

          this.isLoadingSettings = false;
          return;
        }
      }

      // No saved state found - NEW USER DEFAULT:
      // Start with sidebar collapsed and show new conversation screen
      this.isSidebarCollapsed = true;
      this.isSidebarPinned = false;
      this.isNewUnsavedConversation = true;
    } catch (error) {
      console.warn('Failed to load sidebar state:', error);
      // Default to collapsed for new users on error
      this.isSidebarCollapsed = true;
      this.isSidebarPinned = false;
    } finally {
      this.isLoadingSettings = false;
      this.isSidebarSettingsLoaded = true;
    }
  }

  onTabChanged(tab: NavigationTab): void {
    const wasOnDifferentTab = this.activeTab !== tab;
    this.activeTab = tab;

    // Emit navigation change event with current state
    const navEvent: any = {
      tab: tab as 'conversations' | 'collections' | 'tasks'
    };

    if (tab === 'conversations') {
      navEvent.conversationId = this.selectedConversationId || undefined;
    } else if (tab === 'collections') {
      // If switching TO collections tab from another tab, clear to root level
      if (wasOnDifferentTab) {
        this.collectionState.setActiveCollection(null);
        this.activeVersionId = null;
        // Don't include collectionId or versionId - go to root
      } else {
        // Already on collections tab, preserve current state
        if (this.collectionState.activeCollectionId) {
          navEvent.collectionId = this.collectionState.activeCollectionId;
        }
        if (this.activeVersionId && this.collectionState.activeCollectionId) {
          navEvent.versionId = this.activeVersionId;
        }
      }
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

  closeSidebar(): void {
    if (this.isMobileView && this.isSidebarVisible) {
      this.isSidebarVisible = false;
    }
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

      // Refresh the mention autocomplete service to pick up new agents
      await this.mentionAutocompleteService.refresh(this.currentUser);

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
        this.setActiveConversation(result.id);
        this.navigationChanged.emit({
          tab: 'conversations',
          conversationId: result.id
        });
        break;

      case 'message':
        // Switch to conversations tab, open conversation, and scroll to message (future enhancement)
        this.activeTab = 'conversations';
        if (result.conversationId) {
          this.setActiveConversation(result.conversationId);
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

        // Search results don't have version ID, so just navigate to collection
        // The artifact will open with latest version
        this.navigationChanged.emit({
          tab: 'collections',
          collectionId
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
      this.saveSidebarState(); // Save width to User Settings
    } else if (this.isArtifactPanelResizing) {
      this.isArtifactPanelResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveSidebarState(); // Save width to User Settings
    }
  }

  /**
   * Touch event handlers for mobile resize support
   */
  onSidebarResizeTouchStart(event: TouchEvent): void {
    this.isSidebarResizing = true;
    const touch = event.touches[0];
    this.sidebarResizeStartX = touch.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    event.preventDefault();
  }

  onArtifactPanelResizeTouchStart(event: TouchEvent): void {
    this.isArtifactPanelResizing = true;
    const touch = event.touches[0];
    this.artifactPanelResizeStartX = touch.clientX;
    this.artifactPanelResizeStartWidth = this.artifactPanelWidth;
    event.preventDefault();
  }

  private onResizeTouchMove(event: TouchEvent): void {
    if (this.isSidebarResizing) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.sidebarResizeStartX;
      let newWidth = this.sidebarResizeStartWidth + deltaX;

      newWidth = Math.max(200, Math.min(500, newWidth));
      this.sidebarWidth = newWidth;
    } else if (this.isArtifactPanelResizing) {
      const container = document.querySelector('.workspace-content') as HTMLElement;
      if (!container) return;

      const touch = event.touches[0];
      const containerWidth = container.offsetWidth;
      const deltaX = touch.clientX - this.artifactPanelResizeStartX;
      const deltaPercent = (deltaX / containerWidth) * -100;
      let newWidth = this.artifactPanelResizeStartWidth + deltaPercent;

      newWidth = Math.max(20, Math.min(70, newWidth));
      this.artifactPanelWidth = newWidth;
    }
  }

  private onResizeTouchEnd(event: TouchEvent): void {
    if (this.isSidebarResizing) {
      this.isSidebarResizing = false;
      this.saveSidebarState(); // Save width to User Settings
    } else if (this.isArtifactPanelResizing) {
      this.isArtifactPanelResizing = false;
      this.saveSidebarState(); // Save width to User Settings
    }
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
    // Convert to actionable command and emit
    const firstKeyValue = event.compositeKey.KeyValuePairs[0]?.Value || '';
    const command: ActionableCommand = {
      type: 'open:resource',
      label: `Open ${event.entityName}`,
      resourceType: 'Record',
      entityName: event.entityName,
      resourceId: firstKeyValue,
      mode: 'view'
    };
    this.actionableCommandExecuted.emit(command);
  }

  onOpenEntityRecordFromTasks(event: {entityName: string; recordId: string}): void {
    // Convert to actionable command and emit
    const command: ActionableCommand = {
      type: 'open:resource',
      label: `Open ${event.entityName}`,
      resourceType: 'Record',
      entityName: event.entityName,
      resourceId: event.recordId,
      mode: 'view'
    };
    this.actionableCommandExecuted.emit(command);
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
  onCollectionNavigated(event: { collectionId: string | null; versionId?: string | null }): void {
    console.log('📁 Collection navigated:', event);

    // Store the version ID for URL sync
    // CRITICAL: Only update activeVersionId if versionId was explicitly provided in the event
    // If versionId is undefined (not provided), keep the current activeVersionId
    if (event.versionId !== undefined) {
      this.activeVersionId = event.versionId;
    }
    // Otherwise: versionId not provided in event, preserve current activeVersionId

    // IMPORTANT: Don't emit navigationChanged here when doing programmatic navigation (deep linking)
    // The artifact state is managed separately
    // Only emit if the event explicitly includes a versionId, or if we're intentionally closing the artifact
    if (event.versionId !== undefined) {
      // Event explicitly specifies artifact state (user clicked artifact or intentionally closed it)
      this.navigationChanged.emit({
        tab: 'collections',
        collectionId: event.collectionId || undefined,
        versionId: event.versionId || undefined
      });
    } else if (!this.activeVersionId) {
      // No artifact currently open, safe to emit collection-only navigation
      this.navigationChanged.emit({
        tab: 'collections',
        collectionId: event.collectionId || undefined
      });
    }
    // Otherwise: artifact is open but event doesn't specify versionId
    // Don't emit - preserve current URL state with artifact
  }

  /**
   * Handle navigation from artifact links
   */
  onArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string; artifactId?: string; versionNumber?: number; versionId?: string}): void {
    console.log('🔗 Navigating from artifact link:', event);

    if (event.type === 'conversation') {
      this.activeTab = 'conversations';

      // Close collection artifact viewer if it's open
      this.artifactState.closeArtifact();

      // Store pending artifact info so chat area can show it and scroll to message
      if (event.artifactId) {
        this.pendingArtifactId = event.artifactId;
        this.pendingArtifactVersionNumber = event.versionNumber || null;
        console.log('📦 Pending artifact set:', event.artifactId, 'v' + event.versionNumber);
      }

      this.setActiveConversation(event.id);

      this.navigationChanged.emit({
        tab: 'conversations',
        conversationId: event.id
      });
    } else if (event.type === 'collection') {
      this.activeTab = 'collections';
      this.collectionState.setActiveCollection(event.id);

      // Open the artifact automatically when navigating to the collection
      if (event.artifactId) {
        this.artifactState.openArtifact(event.artifactId, event.versionNumber);
      }

      // Store version ID for URL sync (same as viewArtifact does)
      if (event.versionId) {
        this.activeVersionId = event.versionId;
      }

      // Emit navigation with version ID so URL includes it
      this.navigationChanged.emit({
        tab: 'collections',
        collectionId: event.id,
        versionId: event.versionId
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

  /**
   * Handle actionable command execution from child components
   * Bubbles up to host application for handling
   */
  onActionableCommand(command: ActionableCommand): void {
    console.log('📤 Bubbling up actionable command:', command);
    this.actionableCommandExecuted.emit(command);
  }

  /**
   * Handle automatic command execution from child components
   * Bubbles up to host application for handling
   */
  onAutomaticCommand(command: AutomaticCommand): void {
    console.log('📤 Bubbling up automatic command:', command);
    this.automaticCommandExecuted.emit(command);
  }
}