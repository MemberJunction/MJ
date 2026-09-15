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
import { UUIDsEqual } from '@memberjunction/global';
import { MJConversationEntity, MJArtifactEntity, MJTaskEntity, ArtifactMetadataEngine, MJUserSettingEntity, UserInfoEngine, ConversationEngine } from '@memberjunction/core-entities';
import { UserInfo, CompositeKey, KeyValuePair, Metadata } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { CollectionStateService } from '../../services/collection-state.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { ConversationStreamingService } from '../../services/conversation-streaming.service';
import { UICommandHandlerService } from '../../services/ui-command-handler.service';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationTab, WorkspaceLayout } from '../../models/conversation-state.model';
import { SearchResult } from '../../services/search.service';
import { Subject, takeUntil } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionableCommand, AutomaticCommand } from '@memberjunction/ai-core-plus';
import { NavigationRequest } from '@memberjunction/ng-artifacts';

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
  standalone: false,
  selector: 'mj-conversation-workspace',
  templateUrl: './conversation-workspace.component.html',
  styleUrls: ['./conversation-workspace.component.css']
})
export class ConversationWorkspaceComponent extends BaseAngularComponent implements OnInit, OnDestroy, DoCheck {
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() InitialConversationId?: string;

  /** @deprecated Use {@link InitialConversationId}. */
  @Input() set initialConversationId(value: string | undefined) {
    this.InitialConversationId = value;
  }
  /** @deprecated Use {@link InitialConversationId}. */
  get initialConversationId(): string | undefined {
    return this.InitialConversationId;
  }
  @Input() Layout: WorkspaceLayout = 'full';

  /** @deprecated Use {@link Layout}. */
  @Input() set layout(value: WorkspaceLayout) {
    this.Layout = value;
  }
  /** @deprecated Use {@link Layout}. */
  get layout(): WorkspaceLayout {
    return this.Layout;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() ActiveContext?: 'library' | 'task';

  /** @deprecated Use {@link ActiveContext}. */
  @Input() set activeContext(value: 'library' | 'task' | undefined) {
    this.ActiveContext = value;
  }
  /** @deprecated Use {@link ActiveContext}. */
  get activeContext(): 'library' | 'task' | undefined {
    return this.ActiveContext;
  }
  @Input() ContextItemId?: string;

  /** @deprecated Use {@link ContextItemId}. */
  @Input() set contextItemId(value: string | undefined) {
    this.ContextItemId = value;
  }
  /** @deprecated Use {@link ContextItemId}. */
  get contextItemId(): string | undefined {
    return this.ContextItemId;
  }
  /**
   * Show the Routines section at the very bottom of the left sidebar. Default true;
   * hosts that don't want routines (or embed a reduced chat surface) set false.
   * The section additionally hides itself when the current user lacks Read
   * permission on 'MJ: User Routines'.
   */
  @Input() ShowRoutines: boolean = true;

  // Navigation properties for external control (deep linking from URL)
  @Input() set activeTabInput(value: 'conversations' | 'collections' | 'tasks' | undefined) {
    if (value && value !== this.ActiveTab) {
      this.ActiveTab = value;
    }
  }

  @Input() set activeConversationInput(value: string | undefined) {
    if (value && value !== this.SelectedConversationId) {
      console.log('🔗 Deep link to conversation:', value);
      this.ActiveTab = 'conversations';
      this.SetActiveConversation(value);
    }
  }

  @Input() set activeCollectionInput(value: string | undefined) {
    if (value && value !== this.CollectionState.activeCollectionId) {
      console.log('🔗 Deep link to collection:', value);
      this.ActiveTab = 'collections';
      this.CollectionState.setActiveCollection(value);
    }
  }

  @Input() set activeVersionIdInput(value: string | undefined) {
    if (value && value !== this.ActiveVersionId) {
      console.log('🔗 Deep link to version:', value);
      this.ActiveTab = 'collections';
      // Store the version ID immediately to prevent ngDoCheck from clearing it
      this.ActiveVersionId = value;
      // Open artifact by version ID
      this.ArtifactState.openArtifactByVersionId(value);
    }
  }

  @Input() set activeTaskInput(value: string | undefined) {
    if (value && value !== this._activeTaskId) {
      this._activeTaskId = value;
    }
  }

  private _activeTaskId?: string;
  get ActiveTaskId(): string | undefined {
    return this._activeTaskId;
  }

  /** @deprecated Use {@link ActiveTaskId}. */
  get activeTaskId(): string | undefined {
    return this.ActiveTaskId;
  }

  @Output() ConversationChanged = new EventEmitter<MJConversationEntity>();

  /**
   * @deprecated Use {@link ConversationChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationChanged) keeps working. Must stay AFTER ConversationChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationChanged = this.ConversationChanged;
  @Output() ArtifactOpened = new EventEmitter<MJArtifactEntity>();

  /**
   * @deprecated Use {@link ArtifactOpened}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (artifactOpened) keeps working. Must stay AFTER ArtifactOpened: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() artifactOpened = this.ArtifactOpened;
  @Output() NavigationChanged = new EventEmitter<{
    tab: 'conversations' | 'collections' | 'tasks';
    conversationId?: string;
    collectionId?: string;
    versionId?: string;
    taskId?: string;
  }>();

  /**
   * @deprecated Use {@link NavigationChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigationChanged) keeps working. Must stay AFTER NavigationChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigationChanged = this.NavigationChanged;
  @Output() NewConversationStarted = new EventEmitter<void>();

  /**
   * @deprecated Use {@link NewConversationStarted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (newConversationStarted) keeps working. Must stay AFTER NewConversationStarted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() newConversationStarted = this.NewConversationStarted;
  @Output() ActionableCommandExecuted = new EventEmitter<ActionableCommand>();

  /**
   * @deprecated Use {@link ActionableCommandExecuted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (actionableCommandExecuted) keeps working. Must stay AFTER ActionableCommandExecuted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() actionableCommandExecuted = this.ActionableCommandExecuted;
  @Output() AutomaticCommandExecuted = new EventEmitter<AutomaticCommand>();

  /**
   * @deprecated Use {@link AutomaticCommandExecuted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (automaticCommandExecuted) keeps working. Must stay AFTER AutomaticCommandExecuted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() automaticCommandExecuted = this.AutomaticCommandExecuted;
  @Output() NavigationRequested = new EventEmitter<NavigationRequest>();

  /**
   * @deprecated Use {@link NavigationRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (navigationRequested) keeps working. Must stay AFTER NavigationRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() navigationRequested = this.NavigationRequested;

  public ActiveTab: NavigationTab = 'conversations';

  /** @deprecated Use {@link ActiveTab}. */
  public get activeTab(): NavigationTab {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  public set activeTab(value: NavigationTab) {
    this.ActiveTab = value;
  }
  public IsSidebarVisible: boolean = true;

  /** @deprecated Use {@link IsSidebarVisible}. */
  public get isSidebarVisible(): boolean {
    return this.IsSidebarVisible;
  }
  /** @deprecated Use {@link IsSidebarVisible}. */
  public set isSidebarVisible(value: boolean) {
    this.IsSidebarVisible = value;
  }
  public IsArtifactPanelOpen: boolean = false;

  /** @deprecated Use {@link IsArtifactPanelOpen}. */
  public get isArtifactPanelOpen(): boolean {
    return this.IsArtifactPanelOpen;
  }
  /** @deprecated Use {@link IsArtifactPanelOpen}. */
  public set isArtifactPanelOpen(value: boolean) {
    this.IsArtifactPanelOpen = value;
  }
  public IsSearchPanelOpen: boolean = false;

  /** @deprecated Use {@link IsSearchPanelOpen}. */
  public get isSearchPanelOpen(): boolean {
    return this.IsSearchPanelOpen;
  }
  /** @deprecated Use {@link IsSearchPanelOpen}. */
  public set isSearchPanelOpen(value: boolean) {
    this.IsSearchPanelOpen = value;
  }
  public IsWorkspaceReady: boolean = false;

  /** @deprecated Use {@link IsWorkspaceReady}. */
  public get isWorkspaceReady(): boolean {
    return this.IsWorkspaceReady;
  }
  /** @deprecated Use {@link IsWorkspaceReady}. */
  public set isWorkspaceReady(value: boolean) {
    this.IsWorkspaceReady = value;
  }
  public RenamedConversationId: string | null = null;

  /** @deprecated Use {@link RenamedConversationId}. */
  public get renamedConversationId(): string | null {
    return this.RenamedConversationId;
  }
  /** @deprecated Use {@link RenamedConversationId}. */
  public set renamedConversationId(value: string | null) {
    this.RenamedConversationId = value;
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
  public ActiveVersionId: string | null = null;

  /** @deprecated Use {@link ActiveVersionId}. */
  public get activeVersionId(): string | null {
    return this.ActiveVersionId;
  }
  /** @deprecated Use {@link ActiveVersionId}. */
  public set activeVersionId(value: string | null) {
    this.ActiveVersionId = value;
  }
  public IsMobileView: boolean = false;

  /** @deprecated Use {@link IsMobileView}. */
  public get isMobileView(): boolean {
    return this.IsMobileView;
  }
  /** @deprecated Use {@link IsMobileView}. */
  public set isMobileView(value: boolean) {
    this.IsMobileView = value;
  }
  public IsSidebarPinned: boolean = false;

  /** @deprecated Use {@link IsSidebarPinned}. */
  public get isSidebarPinned(): boolean {
    return this.IsSidebarPinned;
  }
  /** @deprecated Use {@link IsSidebarPinned}. */
  public set isSidebarPinned(value: boolean) {
    this.IsSidebarPinned = value;
  } // Default unpinned until settings load (prevents flicker)

  // Artifact permissions
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

  // Share modal state
  public IsArtifactShareModalOpen: boolean = false;

  /** @deprecated Use {@link IsArtifactShareModalOpen}. */
  public get isArtifactShareModalOpen(): boolean {
    return this.IsArtifactShareModalOpen;
  }
  /** @deprecated Use {@link IsArtifactShareModalOpen}. */
  public set isArtifactShareModalOpen(value: boolean) {
    this.IsArtifactShareModalOpen = value;
  }
  public ArtifactToShare: MJArtifactEntity | null = null;

  /** @deprecated Use {@link ArtifactToShare}. */
  public get artifactToShare(): MJArtifactEntity | null {
    return this.ArtifactToShare;
  }
  /** @deprecated Use {@link ArtifactToShare}. */
  public set artifactToShare(value: MJArtifactEntity | null) {
    this.ArtifactToShare = value;
  }

  // Resize state - Sidebar
  public SidebarWidth: number = 260;

  /** @deprecated Use {@link SidebarWidth}. */
  public get sidebarWidth(): number {
    return this.SidebarWidth;
  }
  /** @deprecated Use {@link SidebarWidth}. */
  public set sidebarWidth(value: number) {
    this.SidebarWidth = value;
  } // Default width
  public IsSidebarCollapsed: boolean = true;

  /** @deprecated Use {@link IsSidebarCollapsed}. */
  public get isSidebarCollapsed(): boolean {
    return this.IsSidebarCollapsed;
  }
  /** @deprecated Use {@link IsSidebarCollapsed}. */
  public set isSidebarCollapsed(value: boolean) {
    this.IsSidebarCollapsed = value;
  } // Default collapsed until settings load (prevents flicker)
  public SidebarTransitionsEnabled: boolean = false;

  /** @deprecated Use {@link SidebarTransitionsEnabled}. */
  public get sidebarTransitionsEnabled(): boolean {
    return this.SidebarTransitionsEnabled;
  }
  /** @deprecated Use {@link SidebarTransitionsEnabled}. */
  public set sidebarTransitionsEnabled(value: boolean) {
    this.SidebarTransitionsEnabled = value;
  } // Disabled during initial load to prevent jarring animation
  public IsSidebarSettingsLoaded: boolean = false;

  /** @deprecated Use {@link IsSidebarSettingsLoaded}. */
  public get isSidebarSettingsLoaded(): boolean {
    return this.IsSidebarSettingsLoaded;
  }
  /** @deprecated Use {@link IsSidebarSettingsLoaded}. */
  public set isSidebarSettingsLoaded(value: boolean) {
    this.IsSidebarSettingsLoaded = value;
  } // Tracks whether settings have been loaded (prevents render before state is known)
  private isSidebarResizing: boolean = false;
  private sidebarResizeStartX: number = 0;
  private sidebarResizeStartWidth: number = 0;

  // Resize state - Artifact Panel
  public ArtifactPanelWidth: number = 40;

  /** @deprecated Use {@link ArtifactPanelWidth}. */
  public get artifactPanelWidth(): number {
    return this.ArtifactPanelWidth;
  }
  /** @deprecated Use {@link ArtifactPanelWidth}. */
  public set artifactPanelWidth(value: number) {
    this.ArtifactPanelWidth = value;
  } // Default 40% width
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
  private isArtifactPanelResizing: boolean = false;
  private artifactPanelResizeStartX: number = 0;
  private artifactPanelResizeStartWidth: number = 0;

  private previousConversationId: string | null = null;
  private previousTaskId: string | undefined = undefined;
  private previousVersionId: string | null = null; // Used to track version changes in ngDoCheck
  private previousIsNewConversation: boolean = false; // Track new conversation state changes
  private destroy$ = new Subject<void>();

  // Stored bound references so addEventListener and removeEventListener get the same function object.
  private readonly boundOnResizeMove = this.onResizeMove.bind(this);
  private readonly boundOnResizeEnd = this.onResizeEnd.bind(this);
  private readonly boundOnResizeTouchMove = this.onResizeTouchMove.bind(this);
  private readonly boundOnResizeTouchEnd = this.onResizeTouchEnd.bind(this);

  // User Settings key for server-side persistence
  private readonly USER_SETTING_SIDEBAR_KEY = 'Conversations.SidebarState';
  private saveSettingsTimeout: ReturnType<typeof setTimeout> | null = null;
  private isLoadingSettings: boolean = false;

  // Task filter for conversation-specific filtering
  public TasksFilter: string = '1=1';

  /** @deprecated Use {@link TasksFilter}. */
  public get tasksFilter(): string {
    return this.TasksFilter;
  }
  /** @deprecated Use {@link TasksFilter}. */
  public set tasksFilter(value: string) {
    this.TasksFilter = value;
  }

  // LOCAL CONVERSATION STATE - enables multiple workspace instances
  // Each workspace manages its own selection state independently
  public SelectedConversationId: string | null = null;

  /** @deprecated Use {@link SelectedConversationId}. */
  public get selectedConversationId(): string | null {
    return this.SelectedConversationId;
  }
  /** @deprecated Use {@link SelectedConversationId}. */
  public set selectedConversationId(value: string | null) {
    this.SelectedConversationId = value;
  }
  public SelectedConversation: MJConversationEntity | null = null;

  /** @deprecated Use {@link SelectedConversation}. */
  public get selectedConversation(): MJConversationEntity | null {
    return this.SelectedConversation;
  }
  /** @deprecated Use {@link SelectedConversation}. */
  public set selectedConversation(value: MJConversationEntity | null) {
    this.SelectedConversation = value;
  }
  public SelectedThreadId: string | null = null;

  /** @deprecated Use {@link SelectedThreadId}. */
  public get selectedThreadId(): string | null {
    return this.SelectedThreadId;
  }
  /** @deprecated Use {@link SelectedThreadId}. */
  public set selectedThreadId(value: string | null) {
    this.SelectedThreadId = value;
  }
  public IsNewUnsavedConversation: boolean = false;

  /** @deprecated Use {@link IsNewUnsavedConversation}. */
  public get isNewUnsavedConversation(): boolean {
    return this.IsNewUnsavedConversation;
  }
  /** @deprecated Use {@link IsNewUnsavedConversation}. */
  public set isNewUnsavedConversation(value: boolean) {
    this.IsNewUnsavedConversation = value;
  }
  public PendingMessageToSend: string | null = null;

  /** @deprecated Use {@link PendingMessageToSend}. */
  public get pendingMessageToSend(): string | null {
    return this.PendingMessageToSend;
  }
  /** @deprecated Use {@link PendingMessageToSend}. */
  public set pendingMessageToSend(value: string | null) {
    this.PendingMessageToSend = value;
  }
  public PendingAttachmentsToSend: PendingAttachment[] | null = null;

  /** @deprecated Use {@link PendingAttachmentsToSend}. */
  public get pendingAttachmentsToSend(): PendingAttachment[] | null {
    return this.PendingAttachmentsToSend;
  }
  /** @deprecated Use {@link PendingAttachmentsToSend}. */
  public set pendingAttachmentsToSend(value: PendingAttachment[] | null) {
    this.PendingAttachmentsToSend = value;
  }
  /** The conversation pendingMessageToSend is destined for — bound to the chat-area so the
   *  auto-send reaches only that conversation's input, even if the user swaps conversations
   *  during the async send window (prevents the message bleeding into the swapped-to conversation). */
  public PendingMessageConversationId: string | null = null;

  /** @deprecated Use {@link PendingMessageConversationId}. */
  public get pendingMessageConversationId(): string | null {
    return this.PendingMessageConversationId;
  }
  /** @deprecated Use {@link PendingMessageConversationId}. */
  public set pendingMessageConversationId(value: string | null) {
    this.PendingMessageConversationId = value;
  }
  public PendingArtifactId: string | null = null;

  /** @deprecated Use {@link PendingArtifactId}. */
  public get pendingArtifactId(): string | null {
    return this.PendingArtifactId;
  }
  /** @deprecated Use {@link PendingArtifactId}. */
  public set pendingArtifactId(value: string | null) {
    this.PendingArtifactId = value;
  }
  public PendingArtifactConversationId: string | null = null;

  /** @deprecated Use {@link PendingArtifactConversationId}. */
  public get pendingArtifactConversationId(): string | null {
    return this.PendingArtifactConversationId;
  }
  /** @deprecated Use {@link PendingArtifactConversationId}. */
  public set pendingArtifactConversationId(value: string | null) {
    this.PendingArtifactConversationId = value;
  }
  public PendingArtifactVersionNumber: number | null = null;

  /** @deprecated Use {@link PendingArtifactVersionNumber}. */
  public get pendingArtifactVersionNumber(): number | null {
    return this.PendingArtifactVersionNumber;
  }
  /** @deprecated Use {@link PendingArtifactVersionNumber}. */
  public set pendingArtifactVersionNumber(value: number | null) {
    this.PendingArtifactVersionNumber = value;
  }

  private engine = ConversationEngine.Instance;
  // Shared AI mention/suggestion engine (BaseSingleton — same instance the composer plugins use)
  private mentionAutocompleteService = MentionAutocompleteService.Instance;

  constructor(
    public ArtifactState: ArtifactStateService,
    public CollectionState: CollectionStateService,
    private artifactPermissionService: ArtifactPermissionService,
    private notificationService: MJNotificationService,
    private streamingService: ConversationStreamingService,
    private uiCommandHandler: UICommandHandlerService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  /** @deprecated Use {@link ArtifactState}. */
  public get artifactState(): ArtifactStateService {
    return this.ArtifactState;
  }
  /** @deprecated Use {@link ArtifactState}. */
  public set artifactState(value: ArtifactStateService) {
    this.ArtifactState = value;
  }

  /** @deprecated Use {@link CollectionState}. */
  public get collectionState(): CollectionStateService {
    return this.CollectionState;
  }
  /** @deprecated Use {@link CollectionState}. */
  public set collectionState(value: CollectionStateService) {
    this.CollectionState = value;
  }

  // =========================================================================
  // LOCAL CONVERSATION STATE MANAGEMENT
  // These methods manage the workspace's local selection state
  // =========================================================================

  /**
   * Sets the active conversation for this workspace instance
   * @param id The conversation ID to activate (or null to clear)
   */
  SetActiveConversation(id: string | null): void {
    console.log('🎯 Setting active conversation:', id);
    this.SelectedConversationId = id;
    this.SelectedConversation = id ? (this.engine.GetConversation(id) ?? null) : null;
    // Clear unsaved state when switching to an existing conversation
    if (id) {
      this.IsNewUnsavedConversation = false;
    }
  }

  /** @deprecated Use {@link SetActiveConversation}. */
  setActiveConversation(id: string | null): void {
    return this.SetActiveConversation(id);
  }

  /**
   * Initiates a new unsaved conversation (doesn't create DB record yet)
   * This shows the welcome screen and delays DB creation until first message
   */
  StartNewConversation(): void {
    console.log('✨ Starting new unsaved conversation');
    this.SelectedConversationId = null;
    this.SelectedConversation = null;
    this.IsNewUnsavedConversation = true;
    this.PendingMessageToSend = null;
    this.PendingAttachmentsToSend = null;
    this.PendingMessageConversationId = null;

    // Auto-collapse if mobile OR if sidebar is not pinned
    if (this.IsMobileView || !this.IsSidebarPinned) {
      this.CollapseSidebar();
    }
  }

  /** @deprecated Use {@link StartNewConversation}. */
  startNewConversation(): void {
    return this.StartNewConversation();
  }

  /**
   * Clears the new unsaved conversation state
   * Called when the conversation is actually created or cancelled
   */
  ClearNewConversationState(): void {
    this.IsNewUnsavedConversation = false;
  }

  /** @deprecated Use {@link ClearNewConversationState}. */
  clearNewConversationState(): void {
    return this.ClearNewConversationState();
  }

  /**
   * Opens a thread panel for a specific message
   * @param messageId The parent message ID
   */
  OpenThread(messageId: string): void {
    this.SelectedThreadId = messageId;
  }

  /** @deprecated Use {@link OpenThread}. */
  openThread(messageId: string): void {
    return this.OpenThread(messageId);
  }

  /**
   * Closes the currently open thread panel
   */
  CloseThread(): void {
    this.SelectedThreadId = null;
  }

  /** @deprecated Use {@link CloseThread}. */
  closeThread(): void {
    return this.CloseThread();
  }

  /**
   * Handler for conversation selection from sidebar/list
   */
  OnConversationSelected(conversationId: string): void {
    this.SetActiveConversation(conversationId);

    // Auto-collapse if mobile OR if sidebar is not pinned
    if (this.IsMobileView || !this.IsSidebarPinned) {
      this.CollapseSidebar();
    }
  }

  /** @deprecated Use {@link OnConversationSelected}. */
  onConversationSelected(conversationId: string): void {
    return this.OnConversationSelected(conversationId);
  }

  /**
   * Handler for new conversation creation from chat area
   * Now includes pending message and attachments to ensure atomic state update
   */
  /**
   * A realtime session created (and just finished with) a brand-new conversation. The
   * row was created SERVER-side, so it isn't in the engine cache yet — reload the list
   * to fold it in, then select it ONLY when the conversation list is visible (owner
   * spec: the user may have the sidebar hidden; don't yank their context if so —
   * the refreshed cache makes it appear whenever the list is reopened).
   */
  async OnRealtimeConversationReady(event: { conversationId: string; select: boolean }): Promise<void> {
    try {
      await ConversationEngine.Instance.LoadConversations(this.EnvironmentId, this.CurrentUser, true);
      if (event.select && this.IsSidebarVisible) {
        const conversation = ConversationEngine.Instance.Conversations.find(
          c => UUIDsEqual(c.ID, event.conversationId)
        );
        if (conversation) {
          this.SelectedConversationId = conversation.ID;
          this.SelectedConversation = conversation;
          this.IsNewUnsavedConversation = false;
        }
      }
    } catch (error) {
      console.error('onRealtimeConversationReady ERROR:', error);
    }
  }

  /** @deprecated Use {@link OnRealtimeConversationReady}. */
  async onRealtimeConversationReady(event: { conversationId: string; select: boolean }): Promise<void> {
    return this.OnRealtimeConversationReady(event);
  }

  OnConversationCreated(event: {
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }): void {
    try {
      // Set ALL state atomically before Angular change detection runs
      // This ensures the new message-input component receives the pending data
      this.PendingMessageToSend = event.pendingMessage || null;
      this.PendingAttachmentsToSend = event.pendingAttachments || null;
      // Pin the pending message to THIS conversation so a fast conversation-swap can't
      // redirect its auto-send into a different conversation.
      this.PendingMessageConversationId = event.conversation.ID;
      this.SelectedConversationId = event.conversation.ID;
      this.SelectedConversation = event.conversation;
      this.IsNewUnsavedConversation = false;
      // The conversation is already added to ConversationEngine by the chat area
    } catch (error) {
      console.error('onConversationCreated ERROR:', error);
    }
  }

  /** @deprecated Use {@link OnConversationCreated}. */
  onConversationCreated(event: {
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }): void {
    return this.OnConversationCreated(event);
  }

  /**
   * Handler for pending message requested from chat area (empty state)
   * @deprecated Use onConversationCreated with pendingMessage instead
   */
  onPendingMessageRequested(event: {text: string; attachments: PendingAttachment[]}): void {
    this.PendingMessageToSend = event.text;
    this.PendingAttachmentsToSend = event.attachments;
    this.PendingMessageConversationId = this.SelectedConversationId;
  }

  /**
   * Handler for thread opened from chat area
   */
  OnThreadOpened(threadId: string): void {
    this.SelectedThreadId = threadId;
  }

  /** @deprecated Use {@link OnThreadOpened}. */
  onThreadOpened(threadId: string): void {
    return this.OnThreadOpened(threadId);
  }

  /**
   * Handler for thread closed from chat area
   */
  OnThreadClosed(): void {
    this.SelectedThreadId = null;
  }

  /** @deprecated Use {@link OnThreadClosed}. */
  onThreadClosed(): void {
    return this.OnThreadClosed();
  }

  async ngOnInit() {
    // Bind provider-aware services to this component's provider so multi-server
    // browser apps don't silently fall back to the global Metadata.Provider.
    // ArtifactStateService cascades to ArtifactPermissionService and CollectionPermissionService.
    this.ArtifactState.Provider = this.ProviderToUse;
    this.artifactPermissionService.Provider = this.ProviderToUse;

    // Initialize global streaming service FIRST
    // This establishes the single PubSub connection for all conversations
    this.streamingService.initialize();
    console.log('✅ Global streaming service initialized');

    // Subscribe to command events from UI Command Handler service
    // These will be bubbled up to the host application
    this.uiCommandHandler.actionableCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(request => {
        this.OnActionableCommand(request.command);
      });

    this.uiCommandHandler.automaticCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(command => {
        this.OnAutomaticCommand(command);
      });

    // Check initial mobile state FIRST
    this.checkMobileView();

    // Load sidebar state - but on mobile, always default to collapsed
    if (this.IsMobileView) {
      this.IsSidebarCollapsed = true;
      this.IsSidebarVisible = false;
      this.IsSidebarSettingsLoaded = true; // Mobile doesn't need to load settings
      // Enable transitions after a brief delay to ensure initial state is applied
      setTimeout(() => {
        this.SidebarTransitionsEnabled = true;
      }, 50);
    } else {
      // Load from User Settings (async) - await before continuing to prevent flicker
      await this.loadSidebarState();
      this.cdr.detectChanges();
      // Enable transitions after state is loaded and applied
      setTimeout(() => {
        this.SidebarTransitionsEnabled = true;
      }, 50);
    }

    // Setup resize listeners
    window.addEventListener('mousemove', this.boundOnResizeMove);
    window.addEventListener('mouseup', this.boundOnResizeEnd);

    // Setup touch listeners for mobile
    window.addEventListener('touchmove', this.boundOnResizeTouchMove);
    window.addEventListener('touchend', this.boundOnResizeTouchEnd);

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
      await this.mentionAutocompleteService.initialize(this.CurrentUser);
      console.log('✅ Mention autocomplete initialized');

      // Mark workspace as ready - this allows UI to render
      this.IsWorkspaceReady = true;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Failed to initialize engines:', error);
      // Still mark as ready so UI isn't blocked forever
      this.IsWorkspaceReady = true;
      this.cdr.detectChanges();
    }

    // Subscribe to artifact panel state
    this.ArtifactState.isPanelOpen$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOpen => {
        this.IsArtifactPanelOpen = isOpen;
      });

    // Subscribe to active artifact ID
    this.ArtifactState.activeArtifactId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async id => {
        this.ActiveArtifactId = id;
        // Load permissions when artifact changes
        if (id) {
          await this.loadArtifactPermissions(id);
        } else {
          this.CanShareActiveArtifact = false;
          this.CanEditActiveArtifact = false;
        }
      });

    // Subscribe to active version number
    this.ArtifactState.activeVersionNumber$
      .pipe(takeUntil(this.destroy$))
      .subscribe(versionNumber => {
        this.ActiveVersionNumber = versionNumber;
      });

    // Set initial conversation if provided
    if (this.InitialConversationId) {
      this.SetActiveConversation(this.InitialConversationId);
    }

    // Handle context-based navigation
    if (this.ActiveContext === 'library') {
      this.ActiveTab = 'collections';
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
    const md = this.ProviderToUse;
    const cd = md.EntityByName('MJ: Conversation Details');
    const c = md.EntityByName('MJ: Conversations');
    if (!cd || !c) {
      console.warn('⚠️ Missing metadata for Conversations or Conversation Details');
      this.TasksFilter = `ParentID IS NULL AND UserID = '${this.CurrentUser.ID}'`; // Fallback to user-owned tasks only
      return;
    }

    this.TasksFilter = `ParentID IS NULL AND (UserID = '${this.CurrentUser.ID}' OR ConversationDetailID IN (
      SELECT ID FROM [${cd.SchemaName}].[${cd.BaseView}] 
      WHERE 
      UserID ='${this.CurrentUser.ID}' OR 
      ConversationID IN (
        SELECT ID FROM [${c.SchemaName}].[${c.BaseView}] WHERE UserID='${this.CurrentUser.ID}'
      )
    ))`;
    console.log('📝 Conversations domain tasks filter built:', this.TasksFilter);
  }

  ngDoCheck() {
    // Detect new unsaved conversation state changes
    const currentIsNewConversation = this.IsNewUnsavedConversation;
    if (currentIsNewConversation !== this.previousIsNewConversation) {
      this.previousIsNewConversation = currentIsNewConversation;
      if (currentIsNewConversation) {
        // Emit event to clear URL conversation parameter
        Promise.resolve().then(() => {
          this.NewConversationStarted.emit();
        });
      }
    }

    // Detect conversation changes and emit event
    const currentId = this.SelectedConversationId;
    if (currentId !== this.previousConversationId) {
      this.previousConversationId = currentId;
      const conversation = this.SelectedConversation;
      if (conversation) {
        this.ConversationChanged.emit(conversation);

        // Also emit navigationChanged for URL updates (only if on conversations tab)
        if (this.ActiveTab === 'conversations' && currentId) {
          // Defer emission until after change detection completes
          Promise.resolve().then(() => {
            this.NavigationChanged.emit({
              tab: 'conversations',
              conversationId: currentId
            });
          });
        }
      }
    }

    // Detect task selection changes (when on tasks tab)
    if (this.ActiveTab === 'tasks') {
      const currentTaskId = this.ActiveTaskId;
      if (currentTaskId !== this.previousTaskId) {
        this.previousTaskId = currentTaskId;
        if (currentTaskId) {
          // Defer emission until after change detection completes
          Promise.resolve().then(() => {
            this.NavigationChanged.emit({
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
    window.removeEventListener('mousemove', this.boundOnResizeMove);
    window.removeEventListener('mouseup', this.boundOnResizeEnd);
    window.removeEventListener('touchmove', this.boundOnResizeTouchMove);
    window.removeEventListener('touchend', this.boundOnResizeTouchEnd);
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
    if (this.IsSidebarCollapsed || this.IsSidebarPinned) {
      return;
    }

    // Check if click is outside the sidebar
    const target = event.target as HTMLElement;
    const sidebarElement = target.closest('.workspace-sidebar');
    const expandHandle = target.closest('.sidebar-expand-handle');

    // If click is outside sidebar and expand handle, collapse it
    if (!sidebarElement && !expandHandle) {
      this.CollapseSidebar();
    }
  }

  private checkMobileView(): void {
    const wasMobile = this.IsMobileView;
    this.IsMobileView = window.innerWidth < 768;

    if (this.IsMobileView && !wasMobile) {
      // Switched to mobile - hide sidebar and default to collapsed
      this.IsSidebarVisible = false;
      this.IsSidebarCollapsed = true;
    } else if (!this.IsMobileView && wasMobile) {
      // Switched to desktop - show sidebar, restore state from User Settings
      this.IsSidebarVisible = true;
      this.loadSidebarState().then(() => {
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Collapse sidebar
   */
  CollapseSidebar(): void {
    this.IsSidebarCollapsed = true;
    if (this.IsMobileView) {
      this.IsSidebarVisible = false;
    }
  }

  /** @deprecated Use {@link CollapseSidebar}. */
  collapseSidebar(): void {
    return this.CollapseSidebar();
  }

  /**
   * Expand sidebar (unpinned - will auto-collapse on selection)
   */
  ExpandSidebar(): void {
    this.IsSidebarCollapsed = false;
    this.IsSidebarPinned = false;
  }

  /** @deprecated Use {@link ExpandSidebar}. */
  expandSidebar(): void {
    return this.ExpandSidebar();
  }

  /**
   * Pin sidebar - keep it open after selection
   */
  PinSidebar(): void {
    this.IsSidebarPinned = true;
    this.saveSidebarState();
  }

  /** @deprecated Use {@link PinSidebar}. */
  pinSidebar(): void {
    return this.PinSidebar();
  }

  /**
   * Unpin sidebar - will auto-collapse on next selection
   */
  UnpinSidebar(): void {
    this.IsSidebarPinned = false;
    this.CollapseSidebar();
    this.saveSidebarState();
  }

  /** @deprecated Use {@link UnpinSidebar}. */
  unpinSidebar(): void {
    return this.UnpinSidebar();
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
      const userId = this.CurrentUser?.ID;
      if (!userId) {
        return;
      }

      const stateToSave = {
        collapsed: this.IsSidebarCollapsed,
        pinned: this.IsSidebarPinned,
        sidebarWidth: this.SidebarWidth,
        artifactPanelWidth: this.ArtifactPanelWidth
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
   * Includes collapsed, pinned, sidebarWidth, and artifactPanelWidth
   * For new users with no saved state, defaults to collapsed with new conversation
   */
  private async loadSidebarState(): Promise<void> {
    this.isLoadingSettings = true;

    try {
      const userId = this.CurrentUser?.ID;
      if (userId) {
        // Try loading from cached User Settings
        const engine = UserInfoEngine.Instance;
        const setting = engine.UserSettings.find(s => s.Setting === this.USER_SETTING_SIDEBAR_KEY);

        if (setting?.Value) {
          const state = JSON.parse(setting.Value);
          this.IsSidebarCollapsed = state.collapsed ?? true;
          this.IsSidebarPinned = state.pinned ?? false;

          // Load width values if present (with validation)
          if (typeof state.sidebarWidth === 'number' && state.sidebarWidth >= 200 && state.sidebarWidth <= 500) {
            this.SidebarWidth = state.sidebarWidth;
          }
          if (typeof state.artifactPanelWidth === 'number' && state.artifactPanelWidth >= 20 && state.artifactPanelWidth <= 70) {
            this.ArtifactPanelWidth = state.artifactPanelWidth;
          }

          this.isLoadingSettings = false;
          return;
        }
      }

      // No saved state found - NEW USER DEFAULT:
      // Start with sidebar collapsed and show new conversation screen
      this.IsSidebarCollapsed = true;
      this.IsSidebarPinned = false;
      this.IsNewUnsavedConversation = true;
    } catch (error) {
      console.warn('Failed to load sidebar state:', error);
      // Default to collapsed for new users on error
      this.IsSidebarCollapsed = true;
      this.IsSidebarPinned = false;
    } finally {
      this.isLoadingSettings = false;
      this.IsSidebarSettingsLoaded = true;
    }
  }

  OnTabChanged(tab: NavigationTab): void {
    const wasOnDifferentTab = this.ActiveTab !== tab;
    this.ActiveTab = tab;

    // Emit navigation change event with current state
    const navEvent: any = {
      tab: tab as 'conversations' | 'collections' | 'tasks'
    };

    if (tab === 'conversations') {
      navEvent.conversationId = this.SelectedConversationId || undefined;
    } else if (tab === 'collections') {
      // If switching TO collections tab from another tab, clear to root level
      if (wasOnDifferentTab) {
        this.CollectionState.setActiveCollection(null);
        this.ActiveVersionId = null;
        // Don't include collectionId or versionId - go to root
      } else {
        // Already on collections tab, preserve current state
        if (this.CollectionState.activeCollectionId) {
          navEvent.collectionId = this.CollectionState.activeCollectionId;
        }
        if (this.ActiveVersionId && this.CollectionState.activeCollectionId) {
          navEvent.versionId = this.ActiveVersionId;
        }
      }
    } else if (tab === 'tasks') {
      navEvent.taskId = this.ActiveTaskId || undefined;
    }

    this.NavigationChanged.emit(navEvent);

    // Auto-close artifact panel when switching away from collections
    if (tab === 'conversations' || tab === 'tasks') {
      this.ArtifactState.closeArtifact();
    }
  }

  /** @deprecated Use {@link OnTabChanged}. */
  onTabChanged(tab: NavigationTab): void {
    return this.OnTabChanged(tab);
  }

  ToggleSidebar(): void {
    this.IsSidebarVisible = !this.IsSidebarVisible;
  }

  /** @deprecated Use {@link ToggleSidebar}. */
  toggleSidebar(): void {
    return this.ToggleSidebar();
  }

  CloseSidebar(): void {
    if (this.IsMobileView && this.IsSidebarVisible) {
      this.IsSidebarVisible = false;
    }
  }

  /** @deprecated Use {@link CloseSidebar}. */
  closeSidebar(): void {
    return this.CloseSidebar();
  }

  CloseArtifactPanel(): void {
    this.ArtifactState.closeArtifact();
  }

  /** @deprecated Use {@link CloseArtifactPanel}. */
  closeArtifactPanel(): void {
    return this.CloseArtifactPanel();
  }

  OpenSearch(): void {
    this.IsSearchPanelOpen = true;
  }

  /** @deprecated Use {@link OpenSearch}. */
  openSearch(): void {
    return this.OpenSearch();
  }

  CloseSearch(): void {
    this.IsSearchPanelOpen = false;
  }

  /** @deprecated Use {@link CloseSearch}. */
  closeSearch(): void {
    return this.CloseSearch();
  }

  async OnRefreshAgentCache(): Promise<void> {
    try {
      await AIEngineBase.Instance.Config(true);

      // Refresh the mention autocomplete service to pick up new agents
      await this.mentionAutocompleteService.refresh(this.CurrentUser);

      const agentCount = AIEngineBase.Instance.Agents?.length || 0;
      this.notificationService.CreateSimpleNotification(`Agent cache refreshed (${agentCount} agents)`, 'success', 3000);
      this.cdr.detectChanges();
    } catch (error) {
      this.notificationService.CreateSimpleNotification('Failed to refresh agent cache', 'error', 3000);
      console.error('Failed to refresh AI Engine:', error);
    }
  }

  /** @deprecated Use {@link OnRefreshAgentCache}. */
  async onRefreshAgentCache(): Promise<void> {
    return this.OnRefreshAgentCache();
  }

  HandleSearchResult(result: SearchResult): void {
    console.log('🔍 Navigating to search result:', result);

    switch (result.type) {
      case 'conversation':
        // Switch to conversations tab and select conversation
        this.ActiveTab = 'conversations';
        this.SetActiveConversation(result.id);
        this.NavigationChanged.emit({
          tab: 'conversations',
          conversationId: result.id
        });
        break;

      case 'message':
        // Switch to conversations tab, open conversation, and scroll to message (future enhancement)
        this.ActiveTab = 'conversations';
        if (result.conversationId) {
          this.SetActiveConversation(result.conversationId);
          this.NavigationChanged.emit({
            tab: 'conversations',
            conversationId: result.conversationId
            // TODO: Add messageId for scroll-to support in future
          });
        }
        break;

      case 'artifact':
        // Switch to collections tab and open artifact
        this.ActiveTab = 'collections';
        this.ArtifactState.openArtifact(result.id);

        // If artifact is in a collection, navigate to that collection
        const collectionId = result.collectionId || undefined;

        // Search results don't have version ID, so just navigate to collection
        // The artifact will open with latest version
        this.NavigationChanged.emit({
          tab: 'collections',
          collectionId
        });
        break;

      case 'collection':
        // Switch to collections tab and navigate to collection
        this.ActiveTab = 'collections';
        this.CollectionState.setActiveCollection(result.id);

        this.NavigationChanged.emit({
          tab: 'collections',
          collectionId: result.id
        });
        break;

      case 'task':
        // Switch to tasks tab and select task
        this.ActiveTab = 'tasks';
        this._activeTaskId = result.id;
        this.NavigationChanged.emit({
          tab: 'tasks',
          taskId: result.id
        });
        break;
    }

    // Close search panel after navigation
    this.CloseSearch();
  }

  /** @deprecated Use {@link HandleSearchResult}. */
  handleSearchResult(result: SearchResult): void {
    return this.HandleSearchResult(result);
  }

  /**
   * Sidebar resize methods
   */
  OnSidebarResizeStart(event: MouseEvent): void {
    this.isSidebarResizing = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.SidebarWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /** @deprecated Use {@link OnSidebarResizeStart}. */
  onSidebarResizeStart(event: MouseEvent): void {
    return this.OnSidebarResizeStart(event);
  }

  /**
   * Artifact panel resize methods
   */
  OnArtifactPanelResizeStart(event: MouseEvent): void {
    this.isArtifactPanelResizing = true;
    this.artifactPanelResizeStartX = event.clientX;
    this.artifactPanelResizeStartWidth = this.ArtifactPanelWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /** @deprecated Use {@link OnArtifactPanelResizeStart}. */
  onArtifactPanelResizeStart(event: MouseEvent): void {
    return this.OnArtifactPanelResizeStart(event);
  }

  private onResizeMove(event: MouseEvent): void {
    if (this.isSidebarResizing) {
      const deltaX = event.clientX - this.sidebarResizeStartX;
      let newWidth = this.sidebarResizeStartWidth + deltaX;

      // Constrain between 200px and 500px
      newWidth = Math.max(200, Math.min(500, newWidth));
      this.SidebarWidth = newWidth;
    } else if (this.isArtifactPanelResizing) {
      const container = document.querySelector('.workspace-content') as HTMLElement;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const deltaX = event.clientX - this.artifactPanelResizeStartX;
      const deltaPercent = (deltaX / containerWidth) * -100; // Negative because we're pulling from the right
      let newWidth = this.artifactPanelResizeStartWidth + deltaPercent;

      // Constrain between 20% and 70%
      newWidth = Math.max(20, Math.min(70, newWidth));
      this.ArtifactPanelWidth = newWidth;
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
  OnSidebarResizeTouchStart(event: TouchEvent): void {
    this.isSidebarResizing = true;
    const touch = event.touches[0];
    this.sidebarResizeStartX = touch.clientX;
    this.sidebarResizeStartWidth = this.SidebarWidth;
    event.preventDefault();
  }

  /** @deprecated Use {@link OnSidebarResizeTouchStart}. */
  onSidebarResizeTouchStart(event: TouchEvent): void {
    return this.OnSidebarResizeTouchStart(event);
  }

  OnArtifactPanelResizeTouchStart(event: TouchEvent): void {
    this.isArtifactPanelResizing = true;
    const touch = event.touches[0];
    this.artifactPanelResizeStartX = touch.clientX;
    this.artifactPanelResizeStartWidth = this.ArtifactPanelWidth;
    event.preventDefault();
  }

  /** @deprecated Use {@link OnArtifactPanelResizeTouchStart}. */
  onArtifactPanelResizeTouchStart(event: TouchEvent): void {
    return this.OnArtifactPanelResizeTouchStart(event);
  }

  private onResizeTouchMove(event: TouchEvent): void {
    if (this.isSidebarResizing) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.sidebarResizeStartX;
      let newWidth = this.sidebarResizeStartWidth + deltaX;

      newWidth = Math.max(200, Math.min(500, newWidth));
      this.SidebarWidth = newWidth;
    } else if (this.isArtifactPanelResizing) {
      const container = document.querySelector('.workspace-content') as HTMLElement;
      if (!container) return;

      const touch = event.touches[0];
      const containerWidth = container.offsetWidth;
      const deltaX = touch.clientX - this.artifactPanelResizeStartX;
      const deltaPercent = (deltaX / containerWidth) * -100;
      let newWidth = this.artifactPanelResizeStartWidth + deltaPercent;

      newWidth = Math.max(20, Math.min(70, newWidth));
      this.ArtifactPanelWidth = newWidth;
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
  /**
   * Apply-to-my-form handler. This deprecated workspace component is no
   * longer the live chat surface — the real handler lives on
   * ConversationChatAreaComponent. This stub exists only so the template
   * binding compiles. New consumers should use the resource components in
   * @memberjunction/ng-explorer-core instead of this workspace.
   */
  OnApplyFormRequested(_event: { spec: unknown; entityName: string }): void {
    console.warn('Workspace.onApplyFormRequested: workspace is deprecated; use the per-feature resource components instead.');
  }

  /** @deprecated Use {@link OnApplyFormRequested}. */
  onApplyFormRequested(_event: { spec: unknown; entityName: string }): void {
    return this.OnApplyFormRequested(_event);
  }

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

  OnConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    console.log('✨ Workspace received rename event:', event);
    // Trigger animation in sidebar by setting the ID
    this.RenamedConversationId = event.conversationId;

    // Clear after animation completes (1500ms)
    setTimeout(() => {
      this.RenamedConversationId = null;
    }, 1500);
  }

  /** @deprecated Use {@link OnConversationRenamed}. */
  onConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    return this.OnConversationRenamed(event);
  }

  OnOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    const pairs = event.compositeKey.KeyValuePairs || [];
    const keys: Record<string, string | number> = {};
    for (const p of pairs) {
      if (p.FieldName) keys[p.FieldName] = p.Value;
    }
    const command: ActionableCommand = {
      type: 'open:resource',
      label: `Open ${event.entityName}`,
      resourceType: 'Record',
      entityName: event.entityName,
      resourceId: event.compositeKey.GetValueByFieldName('ID') ?? pairs[0]?.Value,
      keys,
      mode: 'view'
    };
    this.ActionableCommandExecuted.emit(command);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    return this.OnOpenEntityRecord(event);
  }

  OnNavigationRequest(event: NavigationRequest): void {
    this.NavigationRequested.emit(event);
  }

  /** @deprecated Use {@link OnNavigationRequest}. */
  onNavigationRequest(event: NavigationRequest): void {
    return this.OnNavigationRequest(event);
  }

  OnOpenEntityRecordFromTasks(event: {entityName: string; recordId: string}): void {
    // Convert to actionable command and emit
    const command: ActionableCommand = {
      type: 'open:resource',
      label: `Open ${event.entityName}`,
      resourceType: 'Record',
      entityName: event.entityName,
      resourceId: event.recordId,
      mode: 'view'
    };
    this.ActionableCommandExecuted.emit(command);
  }

  /** @deprecated Use {@link OnOpenEntityRecordFromTasks}. */
  onOpenEntityRecordFromTasks(event: {entityName: string; recordId: string}): void {
    return this.OnOpenEntityRecordFromTasks(event);
  }

  OnTaskClicked(task: MJTaskEntity): void {
    // Switch to Tasks tab and set active task ID
    this.ActiveTab = 'tasks';
    this._activeTaskId = task.ID;

    // Emit navigation change
    this.NavigationChanged.emit({
      tab: 'tasks',
      taskId: task.ID
    });
  }

  /** @deprecated Use {@link OnTaskClicked}. */
  onTaskClicked(task: MJTaskEntity): void {
    return this.OnTaskClicked(task);
  }

  /**
   * Handle collection navigation events
   */
  OnCollectionNavigated(event: { collectionId: string | null; versionId?: string | null }): void {
    console.log('📁 Collection navigated:', event);

    // Store the version ID for URL sync
    // CRITICAL: Only update activeVersionId if versionId was explicitly provided in the event
    // If versionId is undefined (not provided), keep the current activeVersionId
    if (event.versionId !== undefined) {
      this.ActiveVersionId = event.versionId;
    }
    // Otherwise: versionId not provided in event, preserve current activeVersionId

    // IMPORTANT: Don't emit navigationChanged here when doing programmatic navigation (deep linking)
    // The artifact state is managed separately
    // Only emit if the event explicitly includes a versionId, or if we're intentionally closing the artifact
    if (event.versionId !== undefined) {
      // Event explicitly specifies artifact state (user clicked artifact or intentionally closed it)
      this.NavigationChanged.emit({
        tab: 'collections',
        collectionId: event.collectionId || undefined,
        versionId: event.versionId || undefined
      });
    } else if (!this.ActiveVersionId) {
      // No artifact currently open, safe to emit collection-only navigation
      this.NavigationChanged.emit({
        tab: 'collections',
        collectionId: event.collectionId || undefined
      });
    }
    // Otherwise: artifact is open but event doesn't specify versionId
    // Don't emit - preserve current URL state with artifact
  }

  /** @deprecated Use {@link OnCollectionNavigated}. */
  onCollectionNavigated(event: { collectionId: string | null; versionId?: string | null }): void {
    return this.OnCollectionNavigated(event);
  }

  /**
   * Handle navigation from artifact links
   */
  OnArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string; artifactId?: string; versionNumber?: number; versionId?: string}): void {
    console.log('🔗 Navigating from artifact link:', event);

    if (event.type === 'conversation') {
      this.ActiveTab = 'conversations';

      // Close collection artifact viewer if it's open
      this.ArtifactState.closeArtifact();

      // Store pending artifact info so chat area can show it and scroll to message
      if (event.artifactId) {
        this.PendingArtifactId = event.artifactId;
        this.PendingArtifactConversationId = event.id;
        this.PendingArtifactVersionNumber = event.versionNumber || null;
        console.log('📦 Pending artifact set:', event.artifactId, 'v' + event.versionNumber);
      }

      this.SetActiveConversation(event.id);

      this.NavigationChanged.emit({
        tab: 'conversations',
        conversationId: event.id
      });
    } else if (event.type === 'collection') {
      this.ActiveTab = 'collections';
      this.CollectionState.setActiveCollection(event.id);

      // Open the artifact automatically when navigating to the collection
      if (event.artifactId) {
        this.ArtifactState.openArtifact(event.artifactId, event.versionNumber);
      }

      // Store version ID for URL sync (same as viewArtifact does)
      if (event.versionId) {
        this.ActiveVersionId = event.versionId;
      }

      // Emit navigation with version ID so URL includes it
      this.NavigationChanged.emit({
        tab: 'collections',
        collectionId: event.id,
        versionId: event.versionId
      });
    }
  }

  /** @deprecated Use {@link OnArtifactLinkNavigation}. */
  onArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string; artifactId?: string; versionNumber?: number; versionId?: string}): void {
    return this.OnArtifactLinkNavigation(event);
  }

  /**
   * Load permissions for the given artifact
   */
  private async loadArtifactPermissions(artifactId: string): Promise<void> {
    // Guard against null/undefined
    if (!artifactId) {
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
   * Handle share request from artifact viewer
   */
  async OnArtifactShareRequested(artifactId: string): Promise<void> {
    // Load the artifact entity to pass to the modal
    const md = this.ProviderToUse;
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts');
    await artifact.Load(artifactId);

    if (artifact) {
      this.ArtifactToShare = artifact;
      this.IsArtifactShareModalOpen = true;
    }
  }

  /** @deprecated Use {@link OnArtifactShareRequested}. */
  async onArtifactShareRequested(artifactId: string): Promise<void> {
    return this.OnArtifactShareRequested(artifactId);
  }

  /**
   * Handle close of artifact share modal
   */
  OnArtifactShareModalClose(): void {
    this.IsArtifactShareModalOpen = false;
    this.ArtifactToShare = null;
  }

  /** @deprecated Use {@link OnArtifactShareModalClose}. */
  onArtifactShareModalClose(): void {
    return this.OnArtifactShareModalClose();
  }

  /**
   * Handle successful share - refresh permissions
   */
  async OnArtifactShared(): Promise<void> {
    this.IsArtifactShareModalOpen = false;
    this.ArtifactToShare = null;

    // Refresh permissions for the active artifact
    if (this.ActiveArtifactId) {
      await this.loadArtifactPermissions(this.ActiveArtifactId);
    }
  }

  /** @deprecated Use {@link OnArtifactShared}. */
  async onArtifactShared(): Promise<void> {
    return this.OnArtifactShared();
  }

  /**
   * Handle actionable command execution from child components
   * Bubbles up to host application for handling
   */
  OnActionableCommand(command: ActionableCommand): void {
    if (command.type === 'open:resource' && command.resourceType === 'Record') {
      // chat-area converts Record commands to openEntityRecord; onOpenEntityRecord
      // re-emits them as actionableCommandExecuted. Skip the raw command to avoid a double open.
      return;
    }
    console.log('📤 Bubbling up actionable command:', command);
    this.ActionableCommandExecuted.emit(command);
  }

  /** @deprecated Use {@link OnActionableCommand}. */
  onActionableCommand(command: ActionableCommand): void {
    return this.OnActionableCommand(command);
  }

  /**
   * Handle automatic command execution from child components
   * Bubbles up to host application for handling
   */
  OnAutomaticCommand(command: AutomaticCommand): void {
    console.log('📤 Bubbling up automatic command:', command);
    this.AutomaticCommandExecuted.emit(command);
  }

  /** @deprecated Use {@link OnAutomaticCommand}. */
  onAutomaticCommand(command: AutomaticCommand): void {
    return this.OnAutomaticCommand(command);
  }
}