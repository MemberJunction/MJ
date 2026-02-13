import { Component, ViewEncapsulation, OnDestroy, ViewChild, ChangeDetectorRef, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, EnvironmentEntityExtended, MJConversationEntity, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ConversationDataService, ConversationChatAreaComponent, ConversationListComponent, MentionAutocompleteService, ConversationStreamingService, ActiveTasksService, PendingAttachment } from '@memberjunction/ng-conversations';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Subject, takeUntil, filter } from 'rxjs';
/**
 * Chat Conversations Resource - wraps the conversation chat area for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Displays conversation list sidebar + active conversation chat interface
 * Designed to work with the tab system for multi-tab conversation management
 *
 * This component manages its own selection state locally, following the encapsulation pattern:
 * - Services (ConversationDataService) are used for shared DATA (caching, loading, saving)
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
                (newConversationRequested)="onNewConversationRequested()"
                (pinSidebarRequested)="pinSidebar()"
                (unpinSidebarRequested)="unpinSidebar()">
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
              (openEntityRecord)="onOpenEntityRecord($event)">
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
      border-right: 1px solid #e0e0e0;
      overflow-y: auto;
      background: #f5f5f5;
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
      background: #1e40af;
    }

    .sidebar-resize-handle:active {
      background: #1e3a8a;
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
  private destroy$ = new Subject<void>();
  private skipUrlUpdate = true; // Skip URL updates during initialization
  private lastNavigatedUrl: string = ''; // Track URL to avoid reacting to our own navigation

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

  constructor(
    private navigationService: NavigationService,
    private conversationData: ConversationDataService,
    private router: Router,
    private mentionAutocompleteService: MentionAutocompleteService,
    private cdr: ChangeDetectorRef,
    private streamingService: ConversationStreamingService,
    private activeTasksService: ActiveTasksService
  ) {
    super();
  }

  async ngOnInit() {
    const md = new Metadata();
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

    // CRITICAL: Set selectedConversationId SYNCHRONOUSLY before child components initialize
    // Parse URL first and apply state synchronously for the ID
    const urlState = this.parseUrlState();

    if (urlState) {
      // Set conversationId synchronously so child components see it immediately
      if (urlState.conversationId) {
        this.selectedConversationId = urlState.conversationId;
        this.isNewUnsavedConversation = false;
      }
      if (urlState.artifactId) {
        this.pendingArtifactId = urlState.artifactId;
        this.pendingArtifactVersionNumber = urlState.versionNumber || null;
      }
      // Load the conversation entity asynchronously (non-blocking)
      this.loadConversationEntity(urlState.conversationId);
    } else {
      // Check if we have navigation params from config (e.g., from Collections linking here)
      this.applyConfigurationParams();
    }

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

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

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
        this.conversationData.loadConversations(this.environmentId, this.currentUser),
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
   * Parse URL query string for conversation state.
   * Query params: conversationId, artifactId, versionNumber
   */
  private parseUrlState(): { conversationId?: string; artifactId?: string; versionNumber?: number } | null {
    const url = this.router.url;
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const conversationId = params.get('conversationId');
    const artifactId = params.get('artifactId');
    const versionNumber = params.get('versionNumber');

    if (!conversationId && !artifactId) return null;

    return {
      conversationId: conversationId || undefined,
      artifactId: artifactId || undefined,
      versionNumber: versionNumber ? parseInt(versionNumber, 10) : undefined
    };
  }

  /**
   * Load the conversation entity asynchronously (non-blocking).
   * The conversationId is already set synchronously, this just loads the full entity.
   */
  private async loadConversationEntity(conversationId: string | undefined): Promise<void> {
    if (!conversationId) return;

    // Try to get from cache first
    const conversation = this.conversationData.getConversationById(conversationId);
    if (conversation) {
      this.selectedConversation = conversation;
    }
    // If not in cache, the chat area component will handle loading it
  }

  /**
   * Apply configuration params from resource data (e.g., from deep-linking via Collections).
   * Sets state synchronously so child components see values immediately.
   */
  private applyConfigurationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    // Set pending artifact if provided
    if (config.artifactId) {
      this.pendingArtifactId = config.artifactId as string;
      this.pendingArtifactVersionNumber = (config.versionNumber as number) || null;
    }

    // Set conversationId synchronously so child components see it immediately
    if (config.conversationId) {
      this.selectedConversationId = config.conversationId as string;
      this.isNewUnsavedConversation = false;
      // Load entity asynchronously
      this.loadConversationEntity(config.conversationId as string);
    }
  }

  /**
   * Apply navigation state to local selection state.
   * Sets state synchronously so child components see values immediately.
   */
  private applyNavigationState(state: { conversationId?: string; artifactId?: string; versionNumber?: number }): void {
    // Set pending artifact if provided (will be consumed by chat area after loading)
    if (state.artifactId) {
      this.pendingArtifactId = state.artifactId;
      this.pendingArtifactVersionNumber = state.versionNumber || null;
    }

    // Set the conversation synchronously
    if (state.conversationId) {
      this.selectedConversationId = state.conversationId;
      this.isNewUnsavedConversation = false;
      this.loadConversationEntity(state.conversationId);
    }
  }

  /**
   * Select a conversation by ID - loads the entity and updates local state
   */
  private async selectConversation(conversationId: string): Promise<void> {
    this.selectedConversationId = conversationId;
    this.isNewUnsavedConversation = false;

    // Load the conversation entity from data service
    const conversation = this.conversationData.getConversationById(conversationId);
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
      this.applyNavigationState(urlState);
    } else {
      // No params means clear state
      this.selectedConversationId = null;
      this.selectedConversation = null;
      this.selectedThreadId = null;
      this.pendingArtifactId = null;
      this.pendingArtifactVersionNumber = null;
    }
    this.skipUrlUpdate = false;

    // Update the tracked URL
    this.lastNavigatedUrl = url;
  }

  /**
   * Parse URL state from a URL string (used for external navigation).
   */
  private parseUrlFromString(url: string): { conversationId?: string; artifactId?: string; versionNumber?: number } | null {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const conversationId = params.get('conversationId');
    const artifactId = params.get('artifactId');
    const versionNumber = params.get('versionNumber');

    if (!conversationId && !artifactId) return null;

    return {
      conversationId: conversationId || undefined,
      artifactId: artifactId || undefined,
      versionNumber: versionNumber ? parseInt(versionNumber, 10) : undefined
    };
  }

  /**
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || EnvironmentEntityExtended.DefaultEnvironmentID;
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
   * Handle conversation selection from the list
   */
  async onConversationSelected(conversationId: string): Promise<void> {
    await this.selectConversation(conversationId);
    this.selectedThreadId = null; // Clear thread when switching conversations
    this.isNewUnsavedConversation = false;
    this.updateUrl();

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
      const md = new Metadata();

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
    this.updateUrl();
  }

  /**
   * Handle conversation rename event
   */
  onConversationRenamed(event: { conversationId: string; name: string; description: string }): void {
    // Trigger rename animation in the list
    this.renamedConversationId = event.conversationId;

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
}
