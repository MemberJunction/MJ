import { Component, ViewEncapsulation, OnDestroy, ViewChild, ChangeDetectorRef, HostListener } from '@angular/core';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJEnvironmentEntityExtended, MJConversationEntity, MJUserSettingEntity, UserInfoEngine, ConversationEngine } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent, ConversationListComponent, MentionAutocompleteService, ConversationStreamingService, ActiveTasksService, PendingAttachment, UICommandHandlerService, ConversationBridgeService } from '@memberjunction/ng-conversations';
import { ActionableCommand, OpenResourceCommand } from '@memberjunction/ai-core-plus';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Subject, takeUntil } from 'rxjs';
/**
 * Chat Conversations Resource - wraps the conversation chat area for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Displays conversation list sidebar + active conversation chat interface
 * Designed to work with the tab system for multi-tab conversation management
 *
 * This component manages its own selection state locally, following the encapsulation pattern:
 * - ConversationEngine singleton is used for shared DATA (caching, loading, saving)
 * - Local state variables manage SELECTION state (which conversation is active)
 * - State flows down to children via @Input, events flow up via @Output
 */
@RegisterClass(BaseResourceComponent, 'ChatConversationsResource')
@Component({
  standalone: false,
  selector: 'mj-chat-conversations-resource',
  template: `
    @if (isReady) {
      <div class="chat-conversations-container">
        <!-- Left sidebar: Conversation list -->
        @if (isSidebarSettingsLoaded) {
          <div class="conversation-sidebar"
            [class.collapsed]="isSidebarCollapsed"
            [class.no-transition]="!sidebarTransitionsEnabled"
            [style.width.px]="isSidebarCollapsed ? 0 : sidebarWidth">
            @if (currentUser) {
              <mj-conversation-list
                #conversationList
                [environmentId]="environmentId"
                [currentUser]="currentUser"
                [selectedConversationId]="selectedConversationId"
                [renamedConversationId]="renamedConversationId"
                [isSidebarPinned]="isSidebarPinned"
                [isMobileView]="isMobileView"
                (conversationSelected)="onConversationSelected($event)"
                (conversationDeleted)="onConversationDeleted($event)"
                (newConversationRequested)="onNewConversationRequested()"
                (pinSidebarRequested)="pinSidebar()"
                (unpinSidebarRequested)="unpinSidebar()"
                (refreshRequested)="onRefreshRequested()">
              </mj-conversation-list>
            }
          </div>
        }
        <!-- Resize handle for sidebar (only when expanded and settings loaded) -->
        @if (!isSidebarCollapsed && isSidebarSettingsLoaded) {
          <div class="sidebar-resize-handle"
          (mousedown)="onSidebarResizeStart($event)"></div>
        }
        <!-- Main area: Chat interface -->
        <div class="conversation-main">
          @if (currentUser) {
            <mj-conversation-chat-area
              #chatArea
              [environmentId]="environmentId"
              [currentUser]="currentUser"
              [conversationId]="selectedConversationId"
              [conversation]="selectedConversation"
              [threadId]="selectedThreadId"
              [isNewConversation]="isNewUnsavedConversation"
              [pendingMessage]="pendingMessageToSend"
              [pendingAttachments]="pendingAttachmentsToSend"
              [pendingArtifactId]="pendingArtifactId"
              [pendingArtifactVersionNumber]="pendingArtifactVersionNumber"
              [showSidebarToggle]="isSidebarCollapsed && isSidebarSettingsLoaded"
              (sidebarToggleClicked)="expandSidebar()"
              (conversationRenamed)="onConversationRenamed($event)"
              (conversationCreated)="onConversationCreated($event)"
              (threadOpened)="onThreadOpened($event)"
              (threadClosed)="onThreadClosed()"
              (pendingArtifactConsumed)="onPendingArtifactConsumed()"
              (pendingMessageConsumed)="onPendingMessageConsumed()"
              (pendingMessageRequested)="onPendingMessageRequested($event)"
              (artifactLinkClicked)="onArtifactLinkClicked($event)"
              (openEntityRecord)="onOpenEntityRecord($event)"
              (navigationRequest)="onNavigationRequest($event)">
            </mj-conversation-chat-area>
          }
        </div>
      </div>
    } @else {
      <div class="initializing-container">
        <mj-loading text="Initializing..." size="large"></mj-loading>
      </div>
    }
    
    <!-- Toast notifications container -->
    <mj-toast></mj-toast>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-conversations-container {
      display: flex;
      width: 100%;
      height: 100%;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .conversation-sidebar {
      flex-shrink: 0;
      border-right: 1px solid var(--mj-border-default);
      overflow-y: auto;
      background: var(--mj-bg-surface-sunken);
      transition: width 0.3s ease;
    }

    /* Disable transitions during initial load to prevent jarring animation */
    .conversation-sidebar.no-transition {
      transition: none !important;
    }

    .conversation-sidebar.collapsed {
      width: 0 !important;
      min-width: 0;
      border-right: none;
      overflow: hidden;
    }

    /* Resize handle for sidebar */
    .sidebar-resize-handle {
      width: 4px;
      background: transparent;
      cursor: ew-resize;
      flex-shrink: 0;
      position: relative;
      transition: background-color 0.2s;
    }

    .sidebar-resize-handle:hover {
      background: var(--mj-brand-primary);
    }

    .sidebar-resize-handle:active {
      background: var(--mj-brand-primary-hover);
    }

    .sidebar-resize-handle::before {
      content: '';
      position: absolute;
      left: -4px;
      right: -4px;
      top: 0;
      bottom: 0;
      cursor: ew-resize;
    }

    .conversation-main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .initializing-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      flex: 1;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ChatConversationsResource extends BaseResourceComponent implements OnDestroy {
  @ViewChild('conversationList') conversationList?: ConversationListComponent;
  @ViewChild('chatArea') chatArea?: ConversationChatAreaComponent;

  public currentUser: any = null;
  private skipUrlUpdate = true; // Skip URL updates during initialization

  // Ready flag - blocks child rendering until AIEngine is initialized
  public isReady: boolean = false;

  // LOCAL SELECTION STATE - each wrapper instance manages its own selection
  public selectedConversationId: string | null = null;
  public selectedConversation: MJConversationEntity | null = null;
  public selectedThreadId: string | null = null;
  public isNewUnsavedConversation: boolean = false;
  public renamedConversationId: string | null = null;
  public isSidebarCollapsed: boolean = false;
  public isSidebarPinned: boolean = true; // Whether sidebar stays open after selection
  public isMobileView: boolean = false;
  public sidebarTransitionsEnabled: boolean = false; // Disabled during initial load to prevent jarring animation
  public isSidebarSettingsLoaded: boolean = false; // Prevents UI flash while loading settings

  // Sidebar resize state
  public sidebarWidth: number = 300; // Default width in pixels
  private isSidebarResizing: boolean = false;
  private sidebarResizeStartX: number = 0;
  private sidebarResizeStartWidth: number = 0;
  private readonly SIDEBAR_MIN_WIDTH = 200;
  private readonly SIDEBAR_MAX_WIDTH = 500;

  // Pending navigation state
  public pendingArtifactId: string | null = null;
  public pendingArtifactVersionNumber: number | null = null;
  public pendingMessageToSend: string | null = null;
  public pendingAttachmentsToSend: PendingAttachment[] | null = null;

  // User Settings persistence
  private readonly USER_SETTING_SIDEBAR_KEY = 'Conversations.SidebarState';
  private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;

  private engine = ConversationEngine.Instance;

  constructor(
    private mentionAutocompleteService: MentionAutocompleteService,
    private cdr: ChangeDetectorRef,
    private streamingService: ConversationStreamingService,
    private activeTasksService: ActiveTasksService,
    private uiCommandHandler: UICommandHandlerService,
    private bridge: ConversationBridgeService
  ) {
    super();
  }

  async ngOnInit() {
    super.ngOnInit();
    const md = this.ProviderToUse;
    this.currentUser = md.CurrentUser;

    // Check initial mobile state and set default collapsed
    this.checkMobileView();
    if (this.isMobileView) {
      this.isSidebarCollapsed = true;
      this.isSidebarSettingsLoaded = true; // Mobile uses defaults, no need to load from server
      // Enable transitions after a brief delay to ensure initial state is applied
      setTimeout(() => {
        this.sidebarTransitionsEnabled = true;
      }, 50);
    } else {
      // Load sidebar state from User Settings (non-blocking)
      this.loadSidebarState().then(() => {
        this.cdr.detectChanges();
        // Enable transitions after state is loaded and applied
        setTimeout(() => {
          this.sidebarTransitionsEnabled = true;
        }, 50);
      });
    }

    // CRITICAL: Initialize AIEngine and mention service BEFORE children render
    // This prevents the slow first-load issue where each child would trigger initialization
    await this.initializeEngines();

    // Initialize global streaming service for PubSub updates
    // This enables reconnection to in-progress agents after browser refresh
    this.streamingService.initialize();

    // Apply initial state from tab configuration (populated by shell from URL or nav params)
    this.applyConfigurationParams();

    // Subscribe to actionable commands (open:resource) from the UI command handler service.
    // open:url commands are handled directly by the service; open:resource needs NavigationService.
    this.uiCommandHandler.actionableCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(command => this.handleActionableCommand(command));

    // Subscribe to bridge switch events so the overlay can hand off a conversation to this workspace
    this.bridge.SwitchEvent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.Target === 'workspace' && event.ConversationID) {
          void this.selectConversation(event.ConversationID);
          this.updateTabTitle();
          this.cdr.detectChanges();
        }
      });

    // Notify the bridge that the workspace is active
    this.bridge.NotifyWorkspaceActive(true);

    // Enable URL updates after initialization
    this.skipUrlUpdate = false;

    // Update URL to reflect current state
    this.updateUrl();

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.bridge.NotifyWorkspaceActive(false);

    // Clear any pending save timeout
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }

    // Clean up resize event listeners
    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeEnd);
  }

  /**
   * Initialize AI Engine, conversations, and services BEFORE child components render.
   * This prevents the slow first-load issue where initialization would block conversation loading.
   * The `false` parameter means "don't force refresh if already initialized".
   */
  private async initializeEngines(): Promise<void> {
    try {
      // Initialize AIEngine, conversations, and mention service in parallel
      await Promise.all([
        AIEngineBase.Instance.Config(false),
        this.engine.LoadConversations(this.environmentId, this.currentUser, false),
        this.mentionAutocompleteService.initialize(this.currentUser)
      ]);

      // Restore active tasks AFTER conversations are cached (uses in-memory lookup)
      await this.activeTasksService.restoreFromDatabase(this.currentUser);

      // Mark as ready - child components can now render
      this.isReady = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to initialize AI engines:', error);
      // Still mark as ready so UI isn't blocked forever
      this.isReady = true;
      this.cdr.detectChanges();
    }
  }

  /**
   * Load the conversation entity asynchronously (non-blocking).
   * The conversationId is already set synchronously, this just loads the full entity.
   */
  private async loadConversationEntity(conversationId: string | undefined): Promise<void> {
    if (!conversationId) return;

    // Try to get from cache first
    const conversation = this.engine.GetConversation(conversationId);
    if (conversation) {
      this.selectedConversation = conversation;
      this.updateTabTitle();
    }
    // If not in cache, the chat area component will handle loading it
  }

  /**
   * Apply initial state from tab configuration.
   * The shell populates queryParams from the URL, and nav params come from cross-resource linking.
   * Sets state synchronously so child components see values immediately.
   */
  private applyConfigurationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    // Check queryParams first (shell populates these from the URL for deep-linking)
    const qp = config['queryParams'] as Record<string, string> | undefined;
    const conversationId = qp?.['conversationId'] || (config.conversationId as string);
    const artifactId = qp?.['artifactId'] || (config.artifactId as string);
    const versionNumber = qp?.['versionNumber'] ? parseInt(qp['versionNumber'], 10)
      : config.versionNumber ? (config.versionNumber as number) : null;

    // Set pending artifact if provided
    if (artifactId) {
      this.pendingArtifactId = artifactId;
      this.pendingArtifactVersionNumber = versionNumber;
    }

    // Set conversationId synchronously so child components see it immediately
    if (conversationId) {
      this.selectedConversationId = conversationId;
      this.bridge.SetActiveFromWorkspace(conversationId);
      this.isNewUnsavedConversation = false;
      // Load entity asynchronously
      this.loadConversationEntity(conversationId);
    }
  }

  /**
   * React to query param changes that arrive AFTER initial load — e.g. clicking a
   * Home pin for a different conversation, or browser back/forward — when this tab
   * already exists and is simply re-focused (so ngOnInit / applyConfigurationParams
   * does NOT run again). Without this, every pin would land on whatever conversation
   * was already open instead of the pinned one.
   */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const conversationId = params['conversationId'] || null;
    const artifactId = params['artifactId'] || null;
    const versionNumber = params['versionNumber'] ? parseInt(params['versionNumber'], 10) : null;

    // Reflect any artifact intent so the chat area can open it.
    this.pendingArtifactId = artifactId;
    this.pendingArtifactVersionNumber = versionNumber;

    if (conversationId && conversationId !== this.selectedConversationId) {
      // The URL is already the source of truth here — suppress the echo back to it.
      // selectConversation()'s body is synchronous up to its URL-update check, so
      // toggling the flag around the call reliably gates that check.
      const prevSkip = this.skipUrlUpdate;
      this.skipUrlUpdate = true;
      void this.selectConversation(conversationId);
      this.skipUrlUpdate = prevSkip;
      this.cdr.detectChanges();
    }
  }

  /**
   * Apply navigation state to local selection state.
   * Sets state synchronously so child components see values immediately.
   */
  /**
   * Select a conversation by ID - loads the entity and updates local state
   */
  private async selectConversation(conversationId: string): Promise<void> {
    this.selectedConversationId = conversationId;
    this.isNewUnsavedConversation = false;

    // Keep bridge in sync so other consumers (toast suppression, overlay) know
    // which conversation the workspace is viewing
    this.bridge.SetActiveFromWorkspace(conversationId);

    // Load the conversation entity from data service
    const conversation = this.engine.GetConversation(conversationId);
    if (conversation) {
      this.selectedConversation = conversation;
    } else {
      // Conversation might not be loaded yet - the chat area will handle loading
      this.selectedConversation = null;
    }

    // Update URL if not skipping
    if (!this.skipUrlUpdate) {
      this.updateUrl();
    }
  }

  /**
   * Update URL query string to reflect current state.
   * Uses NavigationService for proper URL management that respects app-scoped routes.
   */
  private updateUrl(): void {
    const queryParams: Record<string, string | null> = {};

    // Add conversation ID
    if (this.selectedConversationId) {
      queryParams['conversationId'] = this.selectedConversationId;
    } else {
      queryParams['conversationId'] = null;
    }

    // Add artifact ID if we have a pending artifact (will be cleared once opened)
    if (this.pendingArtifactId) {
      queryParams['artifactId'] = this.pendingArtifactId;
      if (this.pendingArtifactVersionNumber) {
        queryParams['versionNumber'] = this.pendingArtifactVersionNumber.toString();
      }
    } else {
      queryParams['artifactId'] = null;
      queryParams['versionNumber'] = null;
    }

    // Use NavigationService to update query params properly
    this.navigationService.UpdateActiveTabQueryParams(queryParams);
  }

  /**
   * Update the tab/browser title based on the currently selected conversation.
   */
  private updateTabTitle(): void {
    if (this.isNewUnsavedConversation || !this.selectedConversation) {
      this.NotifyDisplayNameChanged('Conversations');
      return;
    }
    const name = this.selectedConversation.Name;
    if (name) {
      this.NotifyDisplayNameChanged(name);
    }
  }


  /**
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /**
   * Get the display name for chat conversations
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // If we have a specific conversation ID, we could load the conversation name
    // For now, just return a generic name
    if (data.Configuration?.conversationId) {
      return `Conversation: ${(data.Configuration.conversationId as string).substring(0, 8)}...`;
    }
    return 'Conversations';
  }

  /**
   * Get the icon class for chat conversations
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comments';
  }

  // ============================================
  // EVENT HANDLERS FROM CHILD COMPONENTS
  // ============================================

  /**
   * Handle refresh request from the conversation list.
   * After the list refreshes, also reload messages in the active chat area so any
   * new agent responses are visible without a full page reload.
   */
  onRefreshRequested(): void {
    void this.chatArea?.reloadMessages();
  }

  /**
   * Handle conversation deletion from the list.
   * If the deleted conversation was selected, navigate to the first remaining conversation.
   */
  onConversationDeleted(deletedId: string): void {
    if (this.selectedConversationId === deletedId) {
      const remaining = this.engine.Conversations.filter(c => !UUIDsEqual(c.ID, deletedId));
      if (remaining.length > 0) {
        void this.selectConversation(remaining[0].ID);
        this.updateUrl();
      } else {
        this.selectedConversationId = null;
        this.selectedConversation = null;
        this.selectedThreadId = null;
        this.isNewUnsavedConversation = true;
        this.updateUrl();
      }
    }
  }

  /**
   * Handle conversation selection from the list
   */
  async onConversationSelected(conversationId: string): Promise<void> {
    await this.selectConversation(conversationId);
    this.selectedThreadId = null; // Clear thread when switching conversations
    this.isNewUnsavedConversation = false;
    this.updateUrl();
    this.updateTabTitle();

    // Auto-collapse if mobile OR if sidebar is not pinned
    if (this.isMobileView || !this.isSidebarPinned) {
      this.collapseSidebar();
    }
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
    const sidebarElement = target.closest('.conversation-sidebar');
    const expandHandle = target.closest('.sidebar-expand-handle');

    // If click is outside sidebar and expand handle, collapse it
    if (!sidebarElement && !expandHandle) {
      this.collapseSidebar();
    }
  }

  /**
   * Check if we're in mobile view and handle state accordingly
   */
  private checkMobileView(): void {
    const wasMobile = this.isMobileView;
    this.isMobileView = window.innerWidth < 768;

    if (this.isMobileView && !wasMobile) {
      // Switched to mobile - default to collapsed
      this.isSidebarCollapsed = true;
    }
  }

  /**
   * Collapse sidebar
   */
  collapseSidebar(): void {
    this.isSidebarCollapsed = true;
  }

  /**
   * Expand sidebar (pinned - stays open until unpinned)
   */
  expandSidebar(): void {
    this.isSidebarCollapsed = false;
    this.isSidebarPinned = true; // Pin it so it stays open
    this.saveSidebarState();
  }

  /**
   * Handle sidebar resize start
   */
  onSidebarResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isSidebarResizing = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;

    // Disable transitions during resize for immediate feedback
    this.sidebarTransitionsEnabled = false;

    // Add event listeners for mousemove and mouseup
    document.addEventListener('mousemove', this.onSidebarResizeMove);
    document.addEventListener('mouseup', this.onSidebarResizeEnd);
  }

  /**
   * Handle sidebar resize move (bound method for proper 'this' context)
   */
  private onSidebarResizeMove = (event: MouseEvent): void => {
    if (!this.isSidebarResizing) return;

    const delta = event.clientX - this.sidebarResizeStartX;
    const newWidth = this.sidebarResizeStartWidth + delta;

    // Clamp to min/max bounds
    this.sidebarWidth = Math.max(this.SIDEBAR_MIN_WIDTH, Math.min(this.SIDEBAR_MAX_WIDTH, newWidth));
    this.cdr.detectChanges();
  };

  /**
   * Handle sidebar resize end (bound method for proper 'this' context)
   */
  private onSidebarResizeEnd = (): void => {
    if (!this.isSidebarResizing) return;

    this.isSidebarResizing = false;

    // Re-enable transitions for collapse/expand animations
    this.sidebarTransitionsEnabled = true;

    // Remove event listeners
    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeEnd);

    // Save the new width to User Settings
    this.saveSidebarState();
  };

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
   * Save sidebar state to User Settings (server only - no localStorage fallback)
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
        width: this.sidebarWidth
      };

      const engine = UserInfoEngine.Instance;
      const md = this.ProviderToUse;

      // Find existing setting from cached user settings
      let setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_SIDEBAR_KEY);

      if (!setting) {
        // Create new setting
        setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
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
   * For new users with no saved state, defaults to collapsed with new conversation
   */
  private async loadSidebarState(): Promise<void> {
    try {
      const userId = this.currentUser?.ID;
      if (userId) {
        // Load from cached User Settings
        const engine = UserInfoEngine.Instance;
        const setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_SIDEBAR_KEY);

        if (setting?.Value) {
          const state = JSON.parse(setting.Value);
          this.isSidebarCollapsed = state.collapsed ?? true;
          this.isSidebarPinned = state.pinned ?? false;
          this.sidebarWidth = state.width ?? 300;
          // Clamp width to valid range
          this.sidebarWidth = Math.max(this.SIDEBAR_MIN_WIDTH, Math.min(this.SIDEBAR_MAX_WIDTH, this.sidebarWidth));
          this.isSidebarSettingsLoaded = true;
          return;
        }
      }

      // No saved state found - NEW USER DEFAULT:
      // Start with sidebar collapsed and show new conversation screen
      this.isSidebarCollapsed = true;
      this.isSidebarPinned = false;
      this.sidebarWidth = 300;
      this.isNewUnsavedConversation = true;
      this.isSidebarSettingsLoaded = true;
    } catch (error) {
      console.warn('Failed to load sidebar state:', error);
      // Default to collapsed for new users on error
      this.isSidebarCollapsed = true;
      this.isSidebarPinned = false;
      this.sidebarWidth = 300;
      this.isSidebarSettingsLoaded = true;
    }
  }

  /**
   * Handle new conversation request from the list
   */
  onNewConversationRequested(): void {
    this.selectedConversationId = null;
    this.selectedConversation = null;
    this.selectedThreadId = null;
    this.isNewUnsavedConversation = true;
    this.updateUrl();
    this.NotifyDisplayNameChanged('New Conversation');

    // Auto-collapse if mobile OR if sidebar is not pinned
    if (this.isMobileView || !this.isSidebarPinned) {
      this.collapseSidebar();
    }
  }

  /**
   * Handle conversation created from chat area (after first message in new conversation).
   * The event now includes pending message and attachments for atomic state update.
   */
  async onConversationCreated(event: {
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }): Promise<void> {
    // Set ALL state atomically before Angular change detection runs
    this.pendingMessageToSend = event.pendingMessage || null;
    this.pendingAttachmentsToSend = event.pendingAttachments || null;
    this.selectedConversationId = event.conversation.ID;
    this.selectedConversation = event.conversation;
    this.isNewUnsavedConversation = false;
    this.bridge.SetActiveFromWorkspace(event.conversation.ID);
    this.updateUrl();
    this.updateTabTitle();
  }

  /**
   * Handle conversation rename event
   */
  onConversationRenamed(event: { conversationId: string; name: string; description: string }): void {
    // Trigger rename animation in the list
    this.renamedConversationId = event.conversationId;

    // Update tab title with the new name
    if (event.name) {
      this.NotifyDisplayNameChanged(event.name);
    }

    // Clear the animation trigger after it completes
    setTimeout(() => {
      this.renamedConversationId = null;
    }, 1500);
  }

  /**
   * Handle thread opened event
   */
  onThreadOpened(threadId: string): void {
    this.selectedThreadId = threadId;
  }

  /**
   * Handle thread closed event
   */
  onThreadClosed(): void {
    this.selectedThreadId = null;
  }

  /**
   * Handle pending artifact consumed event
   */
  onPendingArtifactConsumed(): void {
    this.pendingArtifactId = null;
    this.pendingArtifactVersionNumber = null;
    // Update URL to remove artifact params
    this.updateUrl();
  }

  /**
   * Handle pending message consumed event
   */
  onPendingMessageConsumed(): void {
    this.pendingMessageToSend = null;
    this.pendingAttachmentsToSend = null;
  }

  /**
   * Handle pending message requested event (from empty state creating conversation).
   * @deprecated Use onConversationCreated with pendingMessage instead - this is kept for backwards compatibility.
   */
  onPendingMessageRequested(event: {text: string; attachments: PendingAttachment[]}): void {
    this.pendingMessageToSend = event.text;
    this.pendingAttachmentsToSend = event.attachments || null;
  }

  /**
   * Handle navigation request from artifact viewer panel within the chat area.
   * Converts the link event to a generic navigation request and uses NavigationService.
   */
  onArtifactLinkClicked(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
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
   * Handle entity record open request from chat area (from React component grids).
   * Uses NavigationService to open the record in a new tab.
   */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
  }

  /**
   * Handle navigation request from artifact viewer plugins.
   * Opens the target nav item (switching apps if needed) then applies query params to the URL.
   */
  async onNavigationRequest(event: NavigationRequest): Promise<void> {
    const appId = event.appName ? this.resolveAppId(event.appName) : undefined;
    await this.navigationService.OpenNavItemByName(event.navItemName, undefined, appId, {
      queryParams: event.queryParams
    });
  }

  /**
   * Resolve an application name to its ID.
   */
  private resolveAppId(appName: string): string | undefined {
    const md = this.ProviderToUse;
    const apps = md.Applications;
    const app = apps.find(a => a.Name.toLowerCase() === appName.toLowerCase());
    return app?.ID;
  }

  /**
   * Handle actionable commands that require app-specific navigation (open:resource).
   * open:url commands are already handled directly by UICommandHandlerService.
   */
  private handleActionableCommand(command: ActionableCommand): void {
    if (command.type === 'open:resource') {
      const resourceCommand = command as OpenResourceCommand;
      if (resourceCommand.resourceType === 'Record' && resourceCommand.entityName) {
        const compositeKey = new CompositeKey([{
          FieldName: 'ID',
          Value: resourceCommand.resourceId
        }]);
        this.navigationService.OpenEntityRecord(resourceCommand.entityName, compositeKey);
      } else if (resourceCommand.resourceType === 'Report' || resourceCommand.resourceType === 'Dashboard') {
        // Reports and dashboards from agents are stored as conversation artifacts.
        // Find the most recent artifact in the active conversation and open it.
        this.openMostRecentArtifact();
      }
    }
  }

  /**
   * Open the most recent artifact in the active conversation's artifact viewer.
   * Used for open:resource commands with resourceType Report/Dashboard where
   * the resourceId is an agent-internal ID, not a database artifact ID.
   */
  private openMostRecentArtifact(): void {
    if (!this.chatArea) return;

    // Find the last artifact across all messages
    const artifactMap = this.chatArea.artifactsByDetailId;
    let latestArtifact: { artifactId: string; versionId?: string } | null = null;
    for (const artifacts of artifactMap.values()) {
      if (artifacts.length > 0) {
        const last = artifacts[artifacts.length - 1];
        latestArtifact = {
          artifactId: last.artifactId,
          versionId: last.artifactVersionId
        };
      }
    }

    if (latestArtifact) {
      this.chatArea.onArtifactClicked(latestArtifact);
    } else {
      console.warn('No artifacts found in conversation to open for Report/Dashboard command');
    }
  }
}
