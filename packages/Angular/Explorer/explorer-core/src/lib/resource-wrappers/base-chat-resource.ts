import { Directive, ViewChild, ChangeDetectorRef, HostListener, inject, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Metadata, CompositeKey, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJEnvironmentEntityExtended, MJConversationEntity, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import {
  ConversationDataService,
  ConversationChatAreaComponent,
  ConversationListComponent,
  MentionAutocompleteService,
  ConversationStreamingService,
  ActiveTasksService,
  PendingAttachment,
  UICommandHandlerService,
  AgentRoutingConfig,
  BrandingLabels
} from '@memberjunction/ng-conversations';
import { ActionableCommand, OpenResourceCommand } from '@memberjunction/ai-core-plus';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Subject, takeUntil, filter } from 'rxjs';

/**
 * Shared template for both ChatConversationsResource and BrandedChatResource.
 * The only difference was [AgentRouting] and [BrandingLabels] bindings, which are
 * now on the base class with null defaults (no-op for Chat, set by Branded).
 */
export const CHAT_RESOURCE_TEMPLATE = `
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
            [AgentRouting]="AgentRouting"
            [BrandingLabels]="BrandingLabels"
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
`;

export const CHAT_RESOURCE_STYLES = `
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
`;

/**
 * Base class for chat resource components (Chat and branded variants like Skip).
 *
 * Contains ALL shared logic:
 * - Sidebar state, resize, collapse, pin/unpin, UserSettings persistence
 * - URL state management (conversationId, artifactId query params)
 * - Conversation CRUD event handlers
 * - Engine initialization (AIEngine, conversations, mentions, streaming)
 * - Actionable command handling and navigation
 *
 * Subclasses only need to:
 * - Set `SidebarSettingKey` for separate UserSettings namespacing
 * - Override `GetResourceDisplayName` and `GetResourceIconClass`
 * - Optionally override `ngOnInit`/`ngOnDestroy` for branding (call super)
 */
@Directive()
export abstract class BaseChatResource extends BaseResourceComponent implements OnDestroy {
  @ViewChild('conversationList') conversationList?: ConversationListComponent;
  @ViewChild('chatArea') chatArea?: ConversationChatAreaComponent;

  // Services (inject() for all — works in both standalone and NgModule components)
  protected navigationService = inject(NavigationService);
  protected conversationData = inject(ConversationDataService);
  protected router = inject(Router);
  protected mentionAutocompleteService = inject(MentionAutocompleteService);
  protected cdr = inject(ChangeDetectorRef);
  protected streamingService = inject(ConversationStreamingService);
  protected activeTasksService = inject(ActiveTasksService);
  protected uiCommandHandler = inject(UICommandHandlerService);

  // Current user — set in ngOnInit before child rendering
  public currentUser: UserInfo = null!;
  protected destroy$ = new Subject<void>();
  protected skipUrlUpdate = true;
  protected lastNavigatedUrl: string = '';

  // Ready flag — blocks child rendering until AIEngine is initialized
  public isReady: boolean = false;

  // Branding — null defaults (no-op for Chat, set by Branded subclasses)
  public AgentRouting: AgentRoutingConfig | null = null;
  public BrandingLabels: BrandingLabels | null = null;

  // Selection state
  public selectedConversationId: string | null = null;
  public selectedConversation: MJConversationEntity | null = null;
  public selectedThreadId: string | null = null;
  public isNewUnsavedConversation: boolean = false;
  public renamedConversationId: string | null = null;
  public isSidebarCollapsed: boolean = false;
  public isSidebarPinned: boolean = true;
  public isMobileView: boolean = false;
  public sidebarTransitionsEnabled: boolean = false;
  public isSidebarSettingsLoaded: boolean = false;

  // Sidebar resize state
  public sidebarWidth: number = 300;
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

  // User Settings persistence — subclasses set the key
  protected abstract get SidebarSettingKey(): string;
  private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // LIFECYCLE
  // ============================================

  async ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Check initial mobile state
    this.checkMobileView();
    if (this.isMobileView) {
      this.isSidebarCollapsed = true;
      this.isSidebarSettingsLoaded = true;
      setTimeout(() => { this.sidebarTransitionsEnabled = true; }, 50);
    } else {
      this.loadSidebarState().then(() => {
        this.cdr.detectChanges();
        setTimeout(() => { this.sidebarTransitionsEnabled = true; }, 50);
      });
    }

    // Initialize engines before children render
    await this.initializeEngines();

    // Initialize global streaming service
    this.streamingService.initialize();

    // Parse URL state synchronously
    const urlState = this.parseUrlState();
    if (urlState) {
      if (urlState.conversationId) {
        this.selectedConversationId = urlState.conversationId;
        this.isNewUnsavedConversation = false;
      }
      if (urlState.artifactId) {
        this.pendingArtifactId = urlState.artifactId;
        this.pendingArtifactVersionNumber = urlState.versionNumber || null;
      }
      this.loadConversationEntity(urlState.conversationId);
    } else {
      this.applyConfigurationParams();
    }

    // Subscribe to router events for back/forward
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

    // Subscribe to actionable commands
    this.uiCommandHandler.actionableCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(command => this.handleActionableCommand(command));

    // Enable URL updates
    this.skipUrlUpdate = false;
    this.updateUrl();

    // Notify load complete
    setTimeout(() => { this.NotifyLoadComplete(); }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }

    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeEnd);
  }

  // ============================================
  // ENGINE INITIALIZATION
  // ============================================

  private async initializeEngines(): Promise<void> {
    try {
      await Promise.all([
        AIEngineBase.Instance.Config(false),
        this.conversationData.loadConversations(this.environmentId, this.currentUser),
        this.mentionAutocompleteService.initialize(this.currentUser)
      ]);

      await this.activeTasksService.restoreFromDatabase(this.currentUser);

      this.isReady = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to initialize AI engines:', error);
      this.isReady = true;
      this.cdr.detectChanges();
    }
  }

  // ============================================
  // URL STATE MANAGEMENT
  // ============================================

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

  private async loadConversationEntity(conversationId: string | undefined): Promise<void> {
    if (!conversationId) return;
    const conversation = this.conversationData.getConversationById(conversationId);
    if (conversation) {
      this.selectedConversation = conversation;
    }
  }

  protected applyConfigurationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    if (config.artifactId) {
      this.pendingArtifactId = config.artifactId as string;
      this.pendingArtifactVersionNumber = (config.versionNumber as number) || null;
    }

    if (config.conversationId) {
      this.selectedConversationId = config.conversationId as string;
      this.isNewUnsavedConversation = false;
      this.loadConversationEntity(config.conversationId as string);
    }
  }

  private applyNavigationState(state: { conversationId?: string; artifactId?: string; versionNumber?: number }): void {
    if (state.artifactId) {
      this.pendingArtifactId = state.artifactId;
      this.pendingArtifactVersionNumber = state.versionNumber || null;
    }
    if (state.conversationId) {
      this.selectedConversationId = state.conversationId;
      this.isNewUnsavedConversation = false;
      this.loadConversationEntity(state.conversationId);
    }
  }

  private async selectConversation(conversationId: string): Promise<void> {
    this.selectedConversationId = conversationId;
    this.isNewUnsavedConversation = false;

    const conversation = this.conversationData.getConversationById(conversationId);
    this.selectedConversation = conversation || null;

    if (!this.skipUrlUpdate) {
      this.updateUrl();
    }
  }

  private updateUrl(): void {
    const queryParams: Record<string, string | null> = {};

    queryParams['conversationId'] = this.selectedConversationId || null;

    if (this.pendingArtifactId) {
      queryParams['artifactId'] = this.pendingArtifactId;
      queryParams['versionNumber'] = this.pendingArtifactVersionNumber?.toString() || null;
    } else {
      queryParams['artifactId'] = null;
      queryParams['versionNumber'] = null;
    }

    this.navigationService.UpdateActiveTabQueryParams(queryParams);
  }

  private onExternalNavigation(url: string): void {
    const currentPath = this.router.url.split('?')[0];
    const newPath = url.split('?')[0];
    if (currentPath !== newPath) return;

    const urlState = this.parseUrlFromString(url);
    this.skipUrlUpdate = true;
    if (urlState) {
      this.applyNavigationState(urlState);
    } else {
      this.selectedConversationId = null;
      this.selectedConversation = null;
      this.selectedThreadId = null;
      this.pendingArtifactId = null;
      this.pendingArtifactVersionNumber = null;
    }
    this.skipUrlUpdate = false;
    this.lastNavigatedUrl = url;
  }

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

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  // ============================================
  // EVENT HANDLERS FROM CHILD COMPONENTS
  // ============================================

  onRefreshRequested(): void {
    void this.chatArea?.reloadMessages();
  }

  onConversationDeleted(deletedId: string): void {
    if (this.selectedConversationId === deletedId) {
      const remaining = this.conversationData.conversations.filter(c => !UUIDsEqual(c.ID, deletedId));
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

  async onConversationSelected(conversationId: string): Promise<void> {
    await this.selectConversation(conversationId);
    this.selectedThreadId = null;
    this.isNewUnsavedConversation = false;
    this.updateUrl();

    if (this.isMobileView || !this.isSidebarPinned) {
      this.collapseSidebar();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.checkMobileView();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isSidebarCollapsed || this.isSidebarPinned) return;

    const target = event.target as HTMLElement;
    const sidebarElement = target.closest('.conversation-sidebar');
    const expandHandle = target.closest('.sidebar-expand-handle');

    if (!sidebarElement && !expandHandle) {
      this.collapseSidebar();
    }
  }

  private checkMobileView(): void {
    const wasMobile = this.isMobileView;
    this.isMobileView = window.innerWidth < 768;
    if (this.isMobileView && !wasMobile) {
      this.isSidebarCollapsed = true;
    }
  }

  collapseSidebar(): void {
    this.isSidebarCollapsed = true;
  }

  expandSidebar(): void {
    this.isSidebarCollapsed = false;
    this.isSidebarPinned = true;
    this.saveSidebarState();
  }

  onSidebarResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isSidebarResizing = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    this.sidebarTransitionsEnabled = false;

    document.addEventListener('mousemove', this.onSidebarResizeMove);
    document.addEventListener('mouseup', this.onSidebarResizeEnd);
  }

  private onSidebarResizeMove = (event: MouseEvent): void => {
    if (!this.isSidebarResizing) return;
    const delta = event.clientX - this.sidebarResizeStartX;
    const newWidth = this.sidebarResizeStartWidth + delta;
    this.sidebarWidth = Math.max(this.SIDEBAR_MIN_WIDTH, Math.min(this.SIDEBAR_MAX_WIDTH, newWidth));
    this.cdr.detectChanges();
  };

  private onSidebarResizeEnd = (): void => {
    if (!this.isSidebarResizing) return;
    this.isSidebarResizing = false;
    this.sidebarTransitionsEnabled = true;
    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeEnd);
    this.saveSidebarState();
  };

  pinSidebar(): void {
    this.isSidebarPinned = true;
    this.saveSidebarState();
  }

  unpinSidebar(): void {
    this.isSidebarPinned = false;
    this.collapseSidebar();
    this.saveSidebarState();
  }

  onNewConversationRequested(): void {
    this.selectedConversationId = null;
    this.selectedConversation = null;
    this.selectedThreadId = null;
    this.isNewUnsavedConversation = true;
    this.updateUrl();

    if (this.isMobileView || !this.isSidebarPinned) {
      this.collapseSidebar();
    }
  }

  async onConversationCreated(event: {
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }): Promise<void> {
    this.pendingMessageToSend = event.pendingMessage || null;
    this.pendingAttachmentsToSend = event.pendingAttachments || null;
    this.selectedConversationId = event.conversation.ID;
    this.selectedConversation = event.conversation;
    this.isNewUnsavedConversation = false;
    this.updateUrl();
  }

  onConversationRenamed(event: { conversationId: string; name: string; description: string }): void {
    this.renamedConversationId = event.conversationId;
    setTimeout(() => { this.renamedConversationId = null; }, 1500);
  }

  onThreadOpened(threadId: string): void {
    this.selectedThreadId = threadId;
  }

  onThreadClosed(): void {
    this.selectedThreadId = null;
  }

  onPendingArtifactConsumed(): void {
    this.pendingArtifactId = null;
    this.pendingArtifactVersionNumber = null;
    this.updateUrl();
  }

  onPendingMessageConsumed(): void {
    this.pendingMessageToSend = null;
    this.pendingAttachmentsToSend = null;
  }

  onPendingMessageRequested(event: { text: string; attachments: PendingAttachment[] }): void {
    this.pendingMessageToSend = event.text;
    this.pendingAttachmentsToSend = event.attachments || null;
  }

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================

  onArtifactLinkClicked(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
  }): void {
    const navItemName = event.type === 'conversation' ? 'Conversations' : 'Collections';
    const params: Record<string, unknown> = {};

    if (event.type === 'conversation') {
      params['conversationId'] = event.id;
    } else {
      params['collectionId'] = event.id;
    }

    if (event.artifactId) {
      params['artifactId'] = event.artifactId;
      if (event.versionNumber) {
        params['versionNumber'] = event.versionNumber;
      }
    }

    this.navigationService.OpenNavItemByName(navItemName, params);
  }

  onOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
    this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
  }

  async onNavigationRequest(event: NavigationRequest): Promise<void> {
    const appId = event.appName ? this.resolveAppId(event.appName) : undefined;
    await this.navigationService.OpenNavItemByName(event.navItemName, undefined, appId, {
      queryParams: event.queryParams
    });
  }

  private resolveAppId(appName: string): string | undefined {
    const md = new Metadata();
    const apps = md.Applications;
    const app = apps.find(a => a.Name.toLowerCase() === appName.toLowerCase());
    return app?.ID;
  }

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
        this.openMostRecentArtifact();
      }
    }
  }

  private openMostRecentArtifact(): void {
    if (!this.chatArea) return;

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

  // ============================================
  // SIDEBAR STATE PERSISTENCE
  // ============================================

  private saveSidebarState(): void {
    if (this.saveSettingsTimeout) {
      clearTimeout(this.saveSettingsTimeout);
    }
    this.saveSettingsTimeout = setTimeout(() => {
      this.saveSidebarStateToServer();
    }, 1000);
  }

  private async saveSidebarStateToServer(): Promise<void> {
    try {
      const userId = this.currentUser?.ID;
      if (!userId) return;

      const stateToSave = {
        collapsed: this.isSidebarCollapsed,
        pinned: this.isSidebarPinned,
        width: this.sidebarWidth
      };

      const engine = UserInfoEngine.Instance;
      const md = new Metadata();

      let setting = engine.UserSettings.find(s => s.Setting === this.SidebarSettingKey);

      if (!setting) {
        setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
        setting.UserID = userId;
        setting.Setting = this.SidebarSettingKey;
      }

      setting.Value = JSON.stringify(stateToSave);
      await setting.Save();
    } catch (error) {
      console.warn('Failed to save sidebar state to User Settings:', error);
    }
  }

  private async loadSidebarState(): Promise<void> {
    try {
      const userId = this.currentUser?.ID;
      if (userId) {
        const engine = UserInfoEngine.Instance;
        const setting = engine.UserSettings.find(s => s.Setting === this.SidebarSettingKey);

        if (setting?.Value) {
          const state = JSON.parse(setting.Value);
          this.isSidebarCollapsed = state.collapsed ?? true;
          this.isSidebarPinned = state.pinned ?? false;
          this.sidebarWidth = state.width ?? 300;
          this.sidebarWidth = Math.max(this.SIDEBAR_MIN_WIDTH, Math.min(this.SIDEBAR_MAX_WIDTH, this.sidebarWidth));
          this.isSidebarSettingsLoaded = true;
          return;
        }
      }

      // No saved state — defaults for new users
      this.isSidebarCollapsed = true;
      this.isSidebarPinned = false;
      this.sidebarWidth = 300;
      this.isNewUnsavedConversation = true;
      this.isSidebarSettingsLoaded = true;
    } catch (error) {
      console.warn('Failed to load sidebar state:', error);
      this.isSidebarCollapsed = true;
      this.isSidebarPinned = false;
      this.sidebarWidth = 300;
      this.isSidebarSettingsLoaded = true;
    }
  }
}
