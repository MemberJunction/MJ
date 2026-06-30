import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, ContentChildren, TemplateRef, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, RunView, RunQuery, Metadata, CompositeKey, LogStatusEx, TransformSimpleObjectToEntityObject, DataSnapshot } from '@memberjunction/core';
import { MJConversationEntity, MJConversationDetailEntity, MJAIAgentRunEntity, MJArtifactEntity, MJTaskEntity, ArtifactMetadataEngine, ConversationEngine, ConversationDetailComplete, RatingJSON } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, CaptureDataSnapshotCommand, AppContextSnapshot } from "@memberjunction/ai-core-plus";
import { ActionableCommandRequest, UICommandHandlerService } from '../../services/ui-command-handler.service';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { ConversationAttachmentService } from '../../services/conversation-attachment.service';
import { MJResourcePermissionShareAdapter, ResourceShareContext } from '@memberjunction/ng-resource-permissions';

/** `MJ: Resource Types.ID` for Conversations. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';
import { MessageAttachment } from '../message/message-item.component';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { MessageInputComponent } from '../message/message-input.component';
import { PendingAttachment } from '../mention/mention-editor.component';
import { ArtifactViewerPanelComponent, NavigationRequest, AnalyzeArtifactService, InteractiveFormApplyService } from '@memberjunction/ng-artifacts';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationEmptyStateComponent } from './conversation-empty-state.component';
import { TestFeedbackDialogData, TestFeedbackDialogResult } from '@memberjunction/ng-testing';
import { DialogService as ConversationsDialogService } from '../../services/dialog.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConversationStreamingService } from '../../services/conversation-streaming.service';
import { ConversationBridgeService } from '../../services/conversation-bridge.service';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { RealtimeSessionService } from '../../services/realtime-session.service';
import { RealtimeSessionReview, RealtimeSessionReviewService } from '../../services/realtime-session-review.service';
import { GenerateAndApplyConversationName } from '../../services/conversation-naming';
import { RealtimeNavigateRequest, RealtimeStartLiveRequest } from '../realtime/realtime-session-overlay.component';
import { RealtimeSessionTimelineMeta } from '../../utils/realtime-session-timeline';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

// PR 2c — Widget extension surface
import { ChatSlotDirective, type MJChatSlotName } from '../../directives/chat-slot.directive';
import type {
  IMJChatAgentPresenceComponent,
  MJChatAgentPresenceState,
  IMJChatEmptyStateComponent,
} from '../slots/slot-interfaces';
import {
  BeforeAgentTurnEventArgs,
  AfterAgentTurnEventArgs,
  BeforeToolInvokedEventArgs,
  AfterToolInvokedEventArgs,
  BeforeResponseFormSubmittedEventArgs,
  AfterResponseFormSubmittedEventArgs,
  SessionStartedEventArgs,
  SessionChannelStateChangedEventArgs,
  SessionEndedEventArgs,
} from '../../events/chat-events';

/**
 * Configuration for the persona/character rendering in the `agentPresence` slot.
 * Off by default — opt in via `showAgentCharacter`. Mirrors {@link IMJChatAgentPresenceComponent}.
 */
export interface AgentCharacterConfig {
  /** Optional avatar URL. */
  avatarUrl?: string;
  /** Display name. */
  characterName?: string;
  /** Visual intensity. */
  voiceStateMode?: 'subtle' | 'prominent';
  /** Current voice state — drives state-colored styling on the default presence component. */
  state?: MJChatAgentPresenceState;
}

/**
 * Configuration payload for the `emptyState` slot's default component. When
 * supplied, drives the empty-state's greeting / subtext / suggested prompts.
 */
export interface EmptyStateConfig {
  greeting?: string;
  subtext?: string;
  suggestedPrompts?: string[];
  /** Hide the default suggested prompts even if greeting/subtext are set. */
  hideDefaultPrompts?: boolean;
}

/** Default width (percentage) for the artifact viewer pane */
const DEFAULT_ARTIFACT_PANE_WIDTH = 40;

@Component({
  standalone: false,
  selector: 'mj-conversation-chat-area',
  templateUrl: `./conversation-chat-area.component.html`,
  styleUrls: ['./conversation-chat-area.component.css']
})
export class ConversationChatAreaComponent extends BaseAngularComponent implements OnInit, OnDestroy, AfterViewChecked  {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  // LOCAL STATE INPUTS - passed from parent workspace
  private _conversationId: string | null = null;
  @Input()
  set conversationId(value: string | null) {
    if (value !== this._conversationId) {
      this._conversationId = value;
      // SESSION-REVIEW lifecycle: changing the active conversation must NEVER leave a
      // stale review overlay hosted over the new conversation. A LIVE call is untouched
      // by this — the overlay's live mode renders off RealtimeSession.Active$, not
      // RealtimeReview (and a review can't open while a call is live anyway).
      this.ClearRealtimeSessionReview();
      // Trigger change handler after initialization is complete
      // Only skip during Angular's initial binding before ngOnInit completes
      if (this.isInitialized) {
        this.onConversationChanged(value);
      }
    }
  }
  get conversationId(): string | null {
    return this._conversationId;
  }

  @Input() conversation: MJConversationEntity | null = null;
  @Input() threadId: string | null = null;

  /**
   * When true, render the normal message-list + message-input layout even
   * before a conversation exists, instead of the centered empty-state
   * welcome card. Lets host pages (e.g. Form Builder cockpit) put the chat
   * header + mode picker front-and-center on first open and let the user
   * pick a mode before typing. The first send still routes through
   * MessageInputComponent and triggers conversationCreated as usual.
   */
  @Input() suppressNewConversationEmptyState = false;

  /**
   * Host-level cap for @-mention autocomplete (agents and users).
   * Defaults true. Hosts addressing a single fixed agent (e.g. Form Builder
   * cockpit pinned to the Form Builder agent) should set false so the user
   * can't accidentally redirect a turn to a different agent.
   */
  @Input() allowMentions = true;

  /**
   * Host-level cap for attachments. Defaults true. When false, the host
   * disables attachments regardless of agent modality support — useful for
   * surfaces where attachments don't make sense (cockpit text-only flows).
   * When true (default), attachment availability still depends on the
   * agent's modality support, computed at runtime.
   */
  @Input() allowAttachments = true;

  private _isNewConversation: boolean = false;
  @Input()
  set isNewConversation(value: boolean) {
    this._isNewConversation = value;
    if (value) {
      this.focusEmptyStateInput();
    }
  }
  get isNewConversation(): boolean {
    return this._isNewConversation;
  }

  // Using getter/setter to ensure correct type handling
  private _pendingMessage: string | null = null;
  @Input()
  set pendingMessage(value: string | null) {
    // Handle case where an object is incorrectly passed
    if (value && typeof value === 'object' && 'text' in value) {
      this._pendingMessage = (value as { text: string }).text;
    } else {
      this._pendingMessage = value;
    }
    // Once the host clears the pending message (consumed), drop the captured target so a later
    // pending message can't be misrouted to a stale conversation.
    if (!this._pendingMessage) {
      this._pendingMessageTargetId = null;
    }
  }
  get pendingMessage(): string | null {
    return this._pendingMessage;
  }

  /**
   * The conversation the {@link pendingMessage} was created FOR. The pending message's
   * auto-send is delivered ONLY to the cached input whose conversationId matches this —
   * NOT the live-active conversationId. Without this, swapping conversations during the
   * (async) auto-send window lets the swapped-to conversation's input grab the still-set
   * pendingMessage and send it too, duplicating the message into the wrong conversation.
   *
   * Hosts MAY set this explicitly; it also self-resolves from {@link _pendingMessageTargetId}
   * (captured in onEmptyStateMessageSent) so the guard works regardless of host wiring.
   */
  @Input() pendingMessageConversationId: string | null = null;

  /** Internally-captured target for {@link pendingMessage}, set when this component creates a
   *  new conversation from the empty state. Host-independent; immune to conversation-swap timing. */
  private _pendingMessageTargetId: string | null = null;

  /**
   * The conversation a pending message must be delivered to. Prefers the explicit host input,
   * then the internally-captured new-conversation target, finally the active conversation
   * (legacy fallback for single-conversation hosts that never swap).
   */
  public get EffectivePendingMessageTarget(): string | null {
    return this.pendingMessageConversationId ?? this._pendingMessageTargetId ?? this.conversationId;
  }

  // Using getter/setter to ensure reactivity
  private _pendingAttachments: PendingAttachment[] | null = null;
  @Input()
  set pendingAttachments(value: PendingAttachment[] | null) {
    this._pendingAttachments = value;
  }
  get pendingAttachments(): PendingAttachment[] | null {
    return this._pendingAttachments;
  }

  @Input() pendingArtifactId: string | null = null;
  @Input() pendingArtifactVersionNumber: number | null = null;
  @Input() pendingArtifactConversationId: string | null = null;

  /** When true, the component is rendered inside the floating overlay (hides suggested topics, etc.) */
  @Input() overlayMode: boolean = false;

  /** Show the Export button in the conversation header. Default true. */
  @Input() showExportButton: boolean = true;

  /** Show the Share button in the conversation header. Default true. */
  @Input() showShareButton: boolean = true;

  /** Show the artifact count indicator in the conversation header. Default true. */
  @Input() showArtifactIndicator: boolean = true;

  /** Application context snapshot for AI agent awareness. Included in agent execution data. */
  @Input() appContext: Record<string, unknown> | null = null;

  /**
   * Optional default agent ID for the conversation. Forwarded to
   * `<mj-message-input>` as its `[defaultAgentId]` so the first message
   * routes directly to this agent instead of Sage. See
   * `MessageInputComponent.routeMessage` priority rules — explicit
   * @mention and prior-agent continuity still take precedence.
   *
   * Embedded chat surfaces (Form Builder cockpit, future domain chats)
   * set this to the specialist agent's ID; the main Chat app leaves it
   * unset to preserve the Sage-fronted UX.
   */
  @Input() defaultAgentId: string | null = null;

  /**
   * Scope to apply when this surface CREATES a new conversation. Forwarded
   * to `ConversationEngine.CreateConversation` so the new row's
   * `ApplicationScope` column is stamped correctly. Embedded surfaces
   * (e.g. the Form Builder cockpit) set this to `'Application'` so their
   * conversations don't pollute the main Chat app list. Main Chat leaves
   * it as the default `'Global'`. Has no effect on existing conversations.
   */
  @Input() applicationScope: 'Global' | 'Application' | 'Both' = 'Global';

  /**
   * Application ID to bind a newly-created conversation to. REQUIRED when
   * `applicationScope` is 'Application' or 'Both' (DB CHECK constraint
   * enforces it). Used by embedded chat surfaces to scope their
   * conversations to their owning Application.
   */
  @Input() applicationId: string | null = null;

  /**
   * "What is this conversation about?" — the Entity ID this conversation
   * references. Forwarded to `ConversationEngine.CreateConversation` so
   * the new row's `LinkedEntityID` is stamped at creation time. Paired
   * with {@link linkedRecordId} (DB CHECK requires both populated or both
   * null). Form Builder cockpit passes the MJ: Components entity ID;
   * Component Studio's AI panel does the same. Surfaces use this to
   * later list "prior conversations about THIS form/component."
   * Has no effect on existing conversations.
   */
  @Input() linkedEntityId: string | null = null;

  /**
   * Primary key of the linked record, serialized as a string. Used with
   * {@link linkedEntityId}. Form Builder cockpit passes the active
   * form's ComponentID; Component Studio's AI panel passes the
   * currently-selected component's ID.
   */
  @Input() linkedRecordId: string | null = null;

  /**
   * Whether the conversation header should render the per-conversation
   * agent picker. Default true. The picker lets a user pin a default
   * agent on the active conversation (saved to
   * `MJConversationEntity.DefaultAgentID`), so non-mention messages route
   * to that agent instead of through Sage. Surfaces with no meaningful
   * agent-choice UX can set this to false to hide the widget.
   */
  @Input() showAgentPicker: boolean = true;

  /**
   * Whether the chat header should render the per-agent mode/quality
   * picker (Draft / Standard / High, etc.). Default true. The picker
   * auto-hides when the bound agent has fewer than 2 configured
   * presets, so embedders rarely need to set this explicitly — turn
   * off only when the surface should never expose model-tier choice
   * (kiosks, specialty embeds).
   */
  @Input() showAgentModePicker: boolean = true;

  /**
   * The mode/preset picker's selected configuration ID, forwarded to
   * `<mj-message-input>` so non-mention routes apply it on the next
   * send. Past messages are NOT retroactively re-routed — the picker
   * only affects subsequent requests. Updated when the user picks a
   * row in the mode picker; the picker itself persists the choice
   * per-user, per-agent via UserInfoEngine.
   */
  public ActiveAgentConfigurationPresetId: string | null = null;

  /**
   * Agent the mode picker should target. Mirrors the routing precedence
   * minus message-history continuity (the picker is persistent UI; it
   * shouldn't flip as the user scrolls history).
   *
   * Order: conversation-pinned default → embedder default → Sage.
   */
  /**
   * True when the chat header should render even before a conversation
   * row exists. Currently means: the embedder has enabled the mode
   * picker AND we resolved a target agent for it (so there's actually
   * something to put in the header). Lets surfaces like the Form
   * Builder cockpit show the mode picker on top of the empty-state
   * instead of waiting for the first message to create a conversation.
   */
  public get HasPreConversationHeader(): boolean {
    return this.showAgentModePicker && !!this.ModePickerTargetAgentId;
  }

  public get ModePickerTargetAgentId(): string | null {
    return this.conversation?.DefaultAgentID
        ?? this.defaultAgentId
        ?? this.conversationManagerAgent?.ID
        ?? null;
  }

  /**
   * Mode picker emitted a new selection. Store it; the next message's
   * route picks it up via `<mj-message-input>`'s
   * `[agentConfigurationPresetId]` binding. Past messages stay routed
   * as they were — the change is forward-only.
   */
  public OnAgentModePresetChanged(presetId: string | null): void {
    this.ActiveAgentConfigurationPresetId = presetId;
    this.cdr.markForCheck();
  }

  /** Greeting message shown in the empty state when no conversation is active */
  @Input() emptyStateGreeting: string = 'How can I help you?';

  // Sidebar toggle - when true, shows toggle button in header to expand sidebar
  @Input() showSidebarToggle: boolean = false;

  // ────────────────────────────────────────────────────────────────────
  // PR 2c — Widget extension surface (additive — no breaking changes)
  // ────────────────────────────────────────────────────────────────────

  /**
   * When true, the `agentPresence` slot is allowed to render (using the
   * supplied `agentCharacterConfig` for visualization data). Off by default
   * so existing embeds (Form Builder, Component Studio AI Assistant, the
   * corner overlay) see no UI change.
   */
  @Input() showAgentCharacter: boolean = false;

  /**
   * Visualization data forwarded to the `agentPresence` slot's default
   * component (or to any consumer-projected template via slot context).
   * Includes avatar URL, character name, voice state, and visual intensity.
   */
  @Input() agentCharacterConfig: AgentCharacterConfig | null = null;

  /**
   * Structured config for the `emptyState` slot's default component —
   * greeting, subtext, and optional suggested prompts. Backwards-compatible
   * with the existing `emptyStateGreeting` input (which still wins when
   * `emptyStateConfig` is null).
   */
  @Input() emptyStateConfig: EmptyStateConfig | null = null;

  /**
   * Activate the `demonstrationSurface` slot layout-mode. Per Matt's 06-10
   * placement design: when true AND a consumer has projected
   * `mjChatSlot="demonstrationSurface"`, the chat-content-area restructures
   * into [stage | conversation-rail] — the stage takes the main pane, the
   * messages pane shrinks to a side rail (below the stage on mobile). When
   * false (default), no layout change; the chat-area renders as normal.
   *
   * The consumer is expected to drive this from their own state (e.g., an
   * agent emits a demonstration intent → host sets this true; user dismisses
   * → host sets it false). The widget itself doesn't decide.
   */
  @Input() showDemonstrationSurface: boolean = false;

  /**
   * Content payload forwarded to the `demonstrationSurface` slot via
   * `$implicit` + named `content` context. Shape is consumer-defined per the
   * {@link IMJChatDemonstrationSurfaceComponent} interface — the widget
   * doesn't introspect or render it directly, just hands it through.
   */
  @Input() demonstrationSurfaceContent: unknown = null;

  /**
   * True when the demonstrationSurface layout-mode is BOTH opted-in
   * (`showDemonstrationSurface`) AND has a slot template projected to render
   * into. Both conditions must hold for the layout restructure to kick in.
   */
  public get isDemonstrationActive(): boolean {
    return this.showDemonstrationSurface && this.slotTemplate('demonstrationSurface') !== null;
  }

  // ────────────────────────────────────────────────────────────────────
  // PR 2c — Before/After cancelable @Output() events
  // ────────────────────────────────────────────────────────────────────
  //
  // Listeners set `event.Cancel = true` on the `Before*` event to halt the
  // default behavior; the matching `After*` event then does NOT fire.
  // Informational events (progress, shown notifications, session lifecycle)
  // stay as single emitters without a Before-pair.
  //
  // WIRING STATUS:
  //   ✓ beforeAgentTurn / afterAgentTurn — wired in message-input.component
  //     around `agentService.processMessage()` (re-emitted from chat-area).
  //   ✓ beforeResponseFormSubmitted / afterResponseFormSubmitted — wired in
  //     message-item.component's `onFormSubmitted()`, forwarded through
  //     message-list to chat-area.
  //   ✓ beforeToolInvoked / afterToolInvoked — wired AND cancel-enforced.
  //     Subscribed to AgentClientService.ToolRequested$ / ToolExecuted$ in
  //     ngOnInit. When a listener sets event.Cancel = true, the chat-area's
  //     subscriber copies it back to the ClientToolRequestEvent and
  //     AgentClientSession.handleToolRequest short-circuits dispatch (tool
  //     handler NOT called, ToolExecuted$ NOT emitted, server receives a
  //     failure response carrying any CancelReason).
  //   ✓ sessionStarted / sessionChannelStateChanged / sessionEnded — subscribed
  //     to ConversationsRuntime.Sessions.SessionLifecycle$ in ngOnInit. The
  //     runtime's SessionsObserver consumes whichever ISessionsAdapter the host
  //     registered at bootstrap; the Angular default is RealtimeSessionsAdapter,
  //     which bridges RealtimeSessionService's SessionStarted$ / ActiveChannels$
  //     (diffed for open/close) / SessionEnded$. Non-Angular hosts (React,
  //     Vue, Node) register their own adapter — the chat-area code is unchanged.

  /** Cancelable — fired BEFORE a user message is sent to the agent. */
  @Output() beforeAgentTurn = new EventEmitter<BeforeAgentTurnEventArgs>();
  /** Fired AFTER a successful agent turn completes. */
  @Output() afterAgentTurn = new EventEmitter<AfterAgentTurnEventArgs>();

  /** Cancelable — fired BEFORE a registered client tool is invoked by the agent. */
  @Output() beforeToolInvoked = new EventEmitter<BeforeToolInvokedEventArgs>();
  /** Fired AFTER a client tool invocation completes. */
  @Output() afterToolInvoked = new EventEmitter<AfterToolInvokedEventArgs>();

  /** Cancelable — fired BEFORE a response form's submitted values are sent. */
  @Output() beforeResponseFormSubmitted = new EventEmitter<BeforeResponseFormSubmittedEventArgs>();
  /** Fired AFTER a response form's values have been sent. */
  @Output() afterResponseFormSubmitted = new EventEmitter<AfterResponseFormSubmittedEventArgs>();

  /** Informational. */
  @Output() sessionStarted = new EventEmitter<SessionStartedEventArgs>();
  /** Informational. */
  @Output() sessionChannelStateChanged = new EventEmitter<SessionChannelStateChangedEventArgs>();
  /** Informational. */
  @Output() sessionEnded = new EventEmitter<SessionEndedEventArgs>();

  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * A realtime session that CREATED its own conversation has ended — the new
   * conversation is named (background, shared helper) and ready. The workspace folds
   * it into the cached list and selects it when the conversation list is visible.
   */
  @Output() realtimeConversationReady = new EventEmitter<{conversationId: string; select: boolean}>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() taskClicked = new EventEmitter<MJTaskEntity>();
  @Output() artifactLinkClicked = new EventEmitter<{type: 'conversation' | 'collection'; id: string}>();
  @Output() sidebarToggleClicked = new EventEmitter<void>();

  // STATE CHANGE OUTPUTS - notify parent of state changes
  // conversationCreated now includes pendingMessage and pendingAttachments to ensure atomic state update
  @Output() conversationCreated = new EventEmitter<{
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }>();
  @Output() threadOpened = new EventEmitter<string>();
  @Output() threadClosed = new EventEmitter<void>();
  @Output() pendingArtifactConsumed = new EventEmitter<void>();
  @Output() pendingMessageConsumed = new EventEmitter<void>();
  // pendingMessageRequested is deprecated - use conversationCreated with pendingMessage instead
  @Output() pendingMessageRequested = new EventEmitter<{text: string; attachments: PendingAttachment[]}>();

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChildren('messageInput') private messageInputComponents!: QueryList<MessageInputComponent>;
  @ViewChild(ArtifactViewerPanelComponent) private artifactViewerComponent?: ArtifactViewerPanelComponent;
  @ViewChild(ConversationEmptyStateComponent) private emptyStateComponent?: ConversationEmptyStateComponent;

  /**
   * Slot-fill templates supplied by consumers via the `mjChatSlot` directive.
   * Looked up by slot name with {@link slotTemplate}.
   */
  @ContentChildren(ChatSlotDirective) private chatSlotChildren!: QueryList<ChatSlotDirective>;

  /**
   * Public helper for the template + consumers — resolve a slot name to the
   * consumer-supplied `TemplateRef`, or `null` if no consumer template was
   * projected for that slot. When `null`, the template should render the
   * slot's default standalone component.
   */
  public slotTemplate(name: MJChatSlotName): TemplateRef<unknown> | null {
    return this.chatSlotChildren?.find((s) => s.SlotName === name)?.Template ?? null;
  }

  public messages: MJConversationDetailEntity[] = [];
  public showScrollToBottomIcon = false;
  private scrollToBottom = false;
  private lastLoadedConversationId: string | null = null; // Track which conversation's peripheral data was loaded
  private currentlyLoadingConversationId: string | null = null; // Track which conversation is currently being loaded
  private conversationLoadToken = 0; // Monotonic token to discard stale async conversation loads
  public isProcessing: boolean = false;
  private intentCheckMessage: MJConversationDetailEntity | null = null; // Temporary message shown during intent checking
  public isLoadingConversation: boolean = false; // Set to true only when actively loading conversation data

  // User avatar map derived from engine cache
  public userAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();
  public memberCount: number = 1;
  public artifactCount: number = 0;
  public artifactCountDisplay: number = 0;
  public isShared: boolean = false;
  public showExportModal: boolean = false;
  public showShareModal: boolean = false;
  public shareContext: ResourceShareContext | null = null;
  public shareAdapter = new MJResourcePermissionShareAdapter(CONVERSATIONS_RESOURCE_TYPE_ID);
  public showAgentPanel: boolean = false;
  public showMembersModal: boolean = false;
  public showProjectSelector: boolean = false;
  public showArtifactPanel: boolean = false;
  public showArtifactsModal: boolean = false;
  public showSystemArtifacts: boolean = false; // Toggle for showing system-only artifacts
  public selectedArtifactId: string | null = null;
  public selectedVersionNumber: number | undefined = undefined; // Version to show in artifact viewer
  public artifactPaneWidth: number = DEFAULT_ARTIFACT_PANE_WIDTH;
  public isArtifactPaneMaximized: boolean = false; // Track maximize state
  private artifactPaneWidthBeforeMaximize: number = DEFAULT_ARTIFACT_PANE_WIDTH;
  public expandedArtifactId: string | null = null; // Track which artifact card is expanded in modal
  public showCollectionPicker: boolean = false;
  public collectionPickerArtifactId: string | null = null;
  public collectionPickerExcludedIds: string[] = [];
  public collectionPickerVersionId: string | null = null;
  public collectionPickerArtifactName: string = '';
  public collectionPickerVersionNumber: number | null = null;

  // Artifact permissions
  public canShareSelectedArtifact: boolean = false;
  public canEditSelectedArtifact: boolean = false;

  // Share modal state
  public isArtifactShareModalOpen: boolean = false;
  public artifactToShare: MJArtifactEntity | null = null;


  // Artifact mapping: ConversationDetailID -> Array of LazyArtifactInfo
  // Uses lazy-loading pattern: display data loaded immediately, full entities on-demand
  // Supports multiple artifacts per conversation detail (0-N relationship)
  public artifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  // System artifacts mapping: ConversationDetailID -> Array of LazyArtifactInfo (Visibility='System Only')
  // Kept separate so we can toggle their display without reloading
  // Made public so it can be passed to MessageInputComponent for payload loading
  public systemArtifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  // Cached combined artifacts map - updated when toggle changes
  private _combinedArtifactsMap: Map<string, LazyArtifactInfo[]> | null = null;

  // Agent run mapping: ConversationDetailID -> MJAIAgentRunEntityExtended
  // Loaded once per conversation and kept in sync as new runs are created
  public agentRunsByDetailId = new Map<string, MJAIAgentRunEntityExtended>();

  /**
   * Ratings by conversation detail ID (parsed from RatingsJSON)
   */
  public ratingsByDetailId = new Map<string, RatingJSON[]>();

  /**
   * Attachments by conversation detail ID (loaded from ConversationDetailAttachments)
   */
  public attachmentsByDetailId = new Map<string, MessageAttachment[]>();

  /**
   * In-progress message IDs for streaming reconnection
   * Passed to message-input component to reconnect PubSub updates
   */
  public inProgressMessageIds: string[] = [];

  // Subject for cleanup on destroy
  private destroy$ = new Subject<void>();

  // Cache of message-input metadata for rendering multiple instances
  // Prevents destruction/recreation when switching conversations for performance
  private messageInputMetadataCache = new Map<string, {conversationId: string; conversationName: string | null}>();

  // Empty collections for hidden message-input components
  public readonly emptyArtifactsMap = new Map<string, LazyArtifactInfo[]>();
  public readonly emptyAgentRunsMap = new Map<string, MJAIAgentRunEntityExtended>();
  public readonly emptyInProgressIds: string[] = [];

  // Loading state for peripheral data
  public isLoadingPeripheralData: boolean = false;

  // Subject to trigger artifact viewer refresh when new version is created
  public artifactViewerRefresh$ = new Subject<{artifactId: string; versionNumber: number}>();

  // Track initialization state to prevent loading messages before agents are ready
  private isInitialized: boolean = false;

  // Track whether we had active agents on the current conversation's last poll cycle.
  // Used to detect when polling transitions from active → no active agents (completion via poll).
  private hadActiveAgents: boolean = false;

  // Resize state
  private isResizing: boolean = false;
  private startX: number = 0;
  private startWidth: number = 0;

  // Stored bound references so addEventListener and removeEventListener get the same function object.
  private readonly boundOnResizeMove = this.onResizeMove.bind(this);
  private readonly boundOnResizeEnd = this.onResizeEnd.bind(this);
  private readonly boundOnResizeTouchMove = this.onResizeTouchMove.bind(this);
  private readonly boundOnResizeTouchEnd = this.onResizeTouchEnd.bind(this);

  // LocalStorage key
  private readonly ARTIFACT_PANE_WIDTH_KEY = 'mj-conversations-artifact-pane-width';

  // Pinned messages panel state
  public showPinsPanel: boolean = false;

  /** All currently pinned messages in the active conversation, newest pin first */
  get pinnedMessages(): MJConversationDetailEntity[] {
    return this.messages.filter(m => m.IsPinned).reverse();
  }

  // Test feedback dialog state
  public showTestFeedbackDialog: boolean = false;
  public testFeedbackDialogData: TestFeedbackDialogData | null = null;

  // Image viewer state
  public showImageViewer: boolean = false;
  public selectedImageUrl: string = '';
  public selectedImageAlt: string = '';
  public selectedImageFileName: string = '';

  // Upload indicator state (shown centered in conversation area)
  public isUploadingAttachments: boolean = false;
  public uploadingMessage: string = '';

  // Attachment support based on agent modalities
  // Computed from conversation manager (Sage) and any previous agent in conversation
  public enableAttachments: boolean = false;
  public maxAttachments: number = 10;
  public maxAttachmentSizeBytes: number = 20 * 1024 * 1024; // 20MB default
  public acceptedFileTypes: string = 'image/*';
  private conversationManagerAgent: MJAIAgentEntityExtended | null = null;

  private engine = ConversationEngine.Instance;

  /**
   * Voice session service — exposed to the template so the realtime "call mode"
   * overlay can be hosted here (it fills this conversation panel in place while
   * `Active$` is true). The trigger wiring lives in <mj-message-input>.
   */
  public readonly RealtimeSession = inject(RealtimeSessionService);

  /** Stateless loader for the call overlay's SESSION REVIEW mode (past realtime sessions). */
  private readonly realtimeReviewService = inject(RealtimeSessionReviewService);

  /**
   * The PAST realtime session currently under review, or null. While set (and no live
   * call is active) the realtime overlay renders in SESSION REVIEW mode over this
   * conversation panel. Populated via {@link OpenRealtimeSessionReview}; cleared when
   * the user closes the review or resumes it as a new live call.
   */
  public RealtimeReview: RealtimeSessionReview | null = null;

  /**
   * Session-row enrichment for the timeline's realtime SESSION BLOCKS (details stamped
   * with an `AgentSessionID` collapse to one card per session — see the message list's
   * timeline pass). Keyed by `NormalizeUUID(sessionId)`; loaded with ONE batched
   * `MJ: AI Agent Sessions` lookup per conversation, only when stamped rows exist.
   * Tolerant: a failed lookup leaves the map empty and cards render their generic label.
   */
  public realtimeSessionMetaMap: Map<string, RealtimeSessionTimelineMeta> = new Map();

  /** Agent name the overlay banner shows: the reviewed session's agent while reviewing, else the live call's. */
  public get realtimeOverlayAgentName(): string {
    if (this.RealtimeReview && !this.RealtimeSession.IsActive) {
      return this.RealtimeReview.AgentName;
    }
    return this.RealtimeSession.CurrentAgentName;
  }

  constructor(
    private agentStateService: AgentStateService,
    private conversationAgentService: ConversationAgentService,
    private activeTasks: ActiveTasksService,
    private cdr: ChangeDetectorRef,
    private mentionAutocompleteService: MentionAutocompleteService,
    private artifactPermissionService: ArtifactPermissionService,
    private attachmentService: ConversationAttachmentService,
    private streamingService: ConversationStreamingService,
    private confirmDialog: ConversationsDialogService,
    private bridge: ConversationBridgeService,
    private analyzeArtifactService: AnalyzeArtifactService,
    private uiCommandHandler: UICommandHandlerService,
    private interactiveFormApplyService: InteractiveFormApplyService,
    private agentClientService: AgentClientService
  ) {
  super();}

  /**
   * Apply a form-role artifact's spec as an EntityFormOverride for the
   * current user. The service handles the Create-vs-Modify decision (based
   * on whether an Active override already exists), confirms via dialog,
   * and surfaces success/failure via notification.
   */
  async OnApplyFormRequested(event: { spec: unknown; entityName: string }): Promise<void> {
    await this.interactiveFormApplyService.ConfirmAndApply(
      event.spec as ComponentSpec,
      event.entityName,
      this.ProviderToUse,
    );
  }

  async ngOnInit() {
    // Bind provider-aware services to this component's provider so multi-server
    // browser apps don't silently fall back to the global Metadata.Provider.
    const p = this.ProviderToUse;
    this.agentStateService.Provider = p;
    this.conversationAgentService.Provider = p;
    this.activeTasks.Provider = p;
    this.artifactPermissionService.Provider = p;
    this.attachmentService.Provider = p;
    this.analyzeArtifactService.Provider = p;

    // Subscribe to actionable commands from UICommandHandlerService so we can
    // intercept and locally handle commands that depend on the conversation
    // surface (e.g. `client:capture-data-snapshot`, which needs access to the
    // artifact viewer panel and the message input — both live in this chat-area).
    // The workspace's existing subscription still fires and bubbles every command
    // up to the host application; this is purely additive — host apps can still
    // override or augment behavior by handling the bubbled event.
    this.uiCommandHandler.actionableCommandRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe((request: ActionableCommandRequest) => {
        const { command, conversationId } = request;
        if (command.type === 'client:capture-data-snapshot') {
          if (conversationId && !this.isActiveConversation(conversationId)) {
            return;
          }
          void this.handleCaptureDataSnapshotCommand(command);
        }
      });

    // REALTIME-CREATED CONVERSATIONS — three-beat lifecycle so the UI feels live:
    //  START: fold the server-created conversation into the cached list right away
    //         (it shows as 'New Conversation' while the call runs; no selection yet).
    //         Driven by SessionStarted$ — it fires AFTER mintSession resolves, so the
    //         created conversation id is guaranteed present (Active$ races the mint).
    //  FIRST UTTERANCE: auto-name it via the shared helper (background) — the list
    //         updates reactively through ConversationEngine.Conversations$.
    //  END:   select it (workspace gates on the list being visible).
    let namedThisSession = false;
    this.RealtimeSession.SessionStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        namedThisSession = false;
        this.onRealtimeSessionStarted();
      });
    let voiceWasActive = false;
    this.RealtimeSession.Active$
      .pipe(takeUntil(this.destroy$))
      .subscribe((active) => {
        if (voiceWasActive && !active) {
          this.onRealtimeSessionEnded();
        }
        voiceWasActive = active;
      });
    this.RealtimeSession.Captions$
      .pipe(takeUntil(this.destroy$))
      .subscribe((captions) => {
        if (namedThisSession) {
          return;
        }
        const created = this.RealtimeSession.SessionCreatedConversationId;
        const seed = this.RealtimeSession.FirstUserTranscript;
        if (created && seed && captions.some(c => c.Role === 'User')) {
          namedThisSession = true;
          void GenerateAndApplyConversationName({
            ConversationId: created,
            MessageText: seed,
            Provider: this.ProviderToUse as GraphQLDataProvider,
            CurrentUser: this.currentUser
          });
        }
      });

    // Bridge AgentClientService's tool-dispatch observables to chat-area's
    // Before/After cancelable @Outputs. `ToolRequested$` fires synchronously
    // BEFORE the tool runs; `ToolExecuted$` fires after a successful dispatch
    // (suppressed when the host vetoes via Cancel).
    //
    // Cancel-enforcement: the `ClientToolRequestEvent` carries a mutable
    // `Cancel: boolean` field. We emit the Angular `beforeToolInvoked` event
    // synchronously inside the RxJS subscriber, listeners can flip
    // `args.Cancel = true`, and we copy that decision back to `toolEvent.Cancel`
    // before the subscriber returns. `AgentClientSession.handleToolRequest` then
    // sees the veto, short-circuits dispatch, and reports the cancellation back
    // to the server. `afterToolInvoked` does NOT fire in the canceled case.
    this.agentClientService.ToolRequested$
      .pipe(takeUntil(this.destroy$))
      .subscribe((toolEvent) => {
        const args = new BeforeToolInvokedEventArgs(
          toolEvent.Request.ToolName,
          toolEvent.Request.Params
        );
        this.beforeToolInvoked.emit(args);
        if (args.Cancel) {
          toolEvent.Cancel = true;
          toolEvent.CancelReason = args.CancelReason;
        }
      });
    this.agentClientService.ToolExecuted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((toolEvent) => {
        this.afterToolInvoked.emit(
          new AfterToolInvokedEventArgs(
            toolEvent.Request.ToolName,
            toolEvent.Request.Params,
            toolEvent.Result
          )
        );
      });

    // Bridge ConversationsRuntime.Sessions.SessionLifecycle$ → chat-area's
    // informational session* outputs. The runtime's SessionsObserver subscribes
    // to whichever ISessionsAdapter the host registered at bootstrap (today:
    // RealtimeSessionsAdapter from ConversationsRuntimeBootstrap, bridging
    // RealtimeSessionService from PR #2787). Each event variant maps 1:1 to one
    // of the three @Output() emitters declared above.
    ConversationsRuntime.Instance.Sessions.SessionLifecycle$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        switch (event.kind) {
          case 'session-started':
            this.sessionStarted.emit(
              new SessionStartedEventArgs(event.sessionId, event.channelKinds)
            );
            return;
          case 'session-channel':
            this.sessionChannelStateChanged.emit(
              new SessionChannelStateChangedEventArgs(
                event.sessionId,
                event.channelKind,
                event.state
              )
            );
            return;
          case 'session-ended':
            this.sessionEnded.emit(
              new SessionEndedEventArgs(event.sessionId, event.reason)
            );
            return;
        }
      });

    // The workspace component initializes AI Engine and mention service before
    // any child components render, so we can safely skip duplicate initialization.
    // This prevents race conditions and ensures agents are fully loaded.

    // Fallback: If workspace didn't initialize (shouldn't happen), initialize now
    if (!this.mentionAutocompleteService['isInitialized']) {
      console.warn('⚠️ Mention autocomplete not initialized by workspace, initializing now...');
      await this.mentionAutocompleteService.initialize(this.currentUser);
    }

    // Ensure ConversationEngine and ArtifactMetadataEngine are loaded.
    // Config(false) is a no-op if already loaded by another component.
    // ConversationEngine.Config() also initializes ArtifactMetadataEngine internally.
    await ConversationEngine.Instance.Config(false, this.currentUser);

    // Initialize attachment support based on agent modalities
    await this.initializeAttachmentSupport();

    // Load saved artifact pane width
    this.loadArtifactPaneWidth();

    // Mark as initialized so setter can trigger conversation changes
    this.isInitialized = true;

    // Initial load if there's already an active conversation
    if (this.conversationId) {
      await this.onConversationChanged(this.conversationId);
    }

    // Setup resize listeners
    window.addEventListener('mousemove', this.boundOnResizeMove);
    window.addEventListener('mouseup', this.boundOnResizeEnd);
    window.addEventListener('touchmove', this.boundOnResizeTouchMove);
    window.addEventListener('touchend', this.boundOnResizeTouchEnd);

    // Handle overlay→workspace handoffs: if the handed-off conversation is already
    // loaded, force a reload from the engine (which has the latest data).
    this.bridge.SwitchEvent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.Target === 'workspace' && event.ConversationID) {
          if (UUIDsEqual(event.ConversationID, this._conversationId)) {
            // Same conversation already displayed — reload from engine
            this.lastLoadedConversationId = null; // Reset so peripheral data reprocesses
            void this.onConversationChanged(event.ConversationID);
          }
          // Different conversation — engine cache is already warm, onConversationChanged
          // will read from it when the parent sets the conversationId input.
        }
      });

    // Subscribe to completion events from PubSub
    this.streamingService.completionEvents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (event) => {
        // Find the message in our current conversation
        const conversationId = this.conversationId;
        const message = this.messages.find(m => UUIDsEqual(m.ID, event.conversationDetailId));
        if (message && conversationId) {
          await this.handleMessageCompletion(message, event.agentRunId, conversationId);
        }
      });

    // Subscribe to polling-based agent state as a secondary fallback for completion detection.
    // The sessionId is persisted in localStorage and reused on refresh, so WebSocket events
    // normally arrive correctly. However, there's a brief timing gap between page load and
    // WebSocket reconnection where events can be lost. The catch-up check in
    // detectAndReconcileAgentRuns() is the primary fallback; polling is the last resort.
    this.agentStateService.activeAgents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (agents) => {
        const conversationId = this.conversationId;
        if (!conversationId) return;
        const conversationAgents = agents.filter(a => UUIDsEqual(a.run.ConversationID, conversationId));
        const hasActiveAgents = conversationAgents.length > 0;
        if (this.hadActiveAgents && !hasActiveAgents) {
          // Agents just completed — surgical refresh picks up new messages,
          // updated agent runs, and new artifacts in one query with minimal UI repaint
          await this.engine.RefreshConversationDetails(conversationId, this.currentUser);
          if (!this.isActiveConversation(conversationId)) {
            return;
          }

          // Re-read messages from the surgically updated engine cache
          const freshDetails = this.engine.GetCachedDetails(conversationId);
          if (freshDetails) {
            this.messages = freshDetails;
          }

          // Reprocess peripheral data (artifacts, ratings) from updated cache
          this.lastLoadedConversationId = null;
          await this.loadPeripheralData(conversationId);
          if (!this.isActiveConversation(conversationId)) {
            return;
          }

          // Clear active tasks for messages that are no longer in-progress
          for (const message of this.messages) {
            if (message.Status !== 'In-Progress') {
              const task = this.activeTasks.getByConversationDetailId(message.ID);
              if (task) {
                this.activeTasks.remove(task.id);
              }
            }
          }

          this.cdr.detectChanges();
        }
        this.hadActiveAgents = hasActiveAgents;
      });
  }

  /**
   * Initializes attachment support by checking if the conversation manager agent (Sage)
   * or any recent agent in the conversation supports non-text input modalities.
   */
  private async initializeAttachmentSupport(): Promise<void> {
    try {
      // Ensure AIEngineBase is configured with modality data
      await AIEngineBase.Instance.Config(false);

      // Get the conversation manager agent (Sage)
      this.conversationManagerAgent = await this.conversationAgentService.getConversationManagerAgent();

      if (this.conversationManagerAgent?.ID) {
        // Get attachment limits from agent metadata (uses Agent → Model → System → Default cascade)
        const limits = AIEngineBase.Instance.GetAgentAttachmentLimits(this.conversationManagerAgent.ID);
        this.enableAttachments = limits.enabled;
        this.maxAttachments = limits.maxAttachments;
        this.maxAttachmentSizeBytes = limits.maxAttachmentSizeBytes;
        this.acceptedFileTypes = limits.acceptedFileTypes;
        LogStatusEx({message: `Attachment support initialized: ${this.enableAttachments} (max ${this.maxAttachments}, ${(this.maxAttachmentSizeBytes / 1024 / 1024).toFixed(0)}MB)`, verboseOnly: true});
      } else {
        // Default to false if we can't determine
        this.enableAttachments = false;
        LogStatusEx({message: 'Attachment support disabled: conversation manager agent not available', verboseOnly: true});
      }
    } catch (error) {
      console.warn('Failed to initialize attachment support:', error);
      this.enableAttachments = false;
    }
  }

  /**
   * Updates attachment support based on the current conversation context.
   * Called when conversation changes to check if any agent in the conversation supports attachments.
   */
  private updateAttachmentSupport(): void {
    // Determine which agent to use for limits - prefer last non-Sage agent, fall back to Sage
    let agentIdForLimits = this.conversationManagerAgent?.ID || null;

    // Check if any previous non-Sage agent in the conversation supports attachments
    if (this.messages.length > 0) {
      const lastNonSageAgent = this.messages
        .slice()
        .reverse()
        .find(msg =>
          msg.Role === 'AI' &&
          msg.AgentID &&
          !UUIDsEqual(msg.AgentID, this.conversationManagerAgent?.ID)
        );

      if (lastNonSageAgent?.AgentID) {
        // Check if this agent supports attachments
        if (AIEngineBase.Instance.AgentSupportsAttachments(lastNonSageAgent.AgentID)) {
          agentIdForLimits = lastNonSageAgent.AgentID;
        }
      }
    }

    // Get limits from the determined agent
    if (agentIdForLimits) {
      const limits = AIEngineBase.Instance.GetAgentAttachmentLimits(agentIdForLimits);
      this.enableAttachments = limits.enabled;
      this.maxAttachments = limits.maxAttachments;
      this.maxAttachmentSizeBytes = limits.maxAttachmentSizeBytes;
      this.acceptedFileTypes = limits.acceptedFileTypes;
    } else {
      this.enableAttachments = false;
    }
  }

  ngAfterViewChecked() {
    if (this.scrollToBottom) {
      this.scrollToBottom = false;
      setTimeout(() => {
        this.scrollToBottomNow();
        // Check scroll state after scrolling to bottom
        this.checkScroll();
      }, 100);
    }
    // Removed synchronous checkScroll() from else branch to prevent
    // ExpressionChangedAfterItHasBeenCheckedError. Calling detectChanges()
    // inside ngAfterViewChecked re-enters change detection and causes
    // Angular's verification pass to see inconsistent state.
    // Scroll icon visibility is still updated via:
    // 1. (scroll)="checkScroll()" on the scroll container (user scroll events)
    // 2. setTimeout callback above (after programmatic scroll-to-bottom)
  }

  ngOnDestroy() {
    // Stop polling when component is destroyed
    this.agentStateService.stopPolling();

    // Complete destroy subject to cleanup subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Remove resize listeners
    window.removeEventListener('mousemove', this.boundOnResizeMove);
    window.removeEventListener('mouseup', this.boundOnResizeEnd);
    window.removeEventListener('touchmove', this.boundOnResizeTouchMove);
    window.removeEventListener('touchend', this.boundOnResizeTouchEnd);
  }

  private isActiveConversation(conversationId: string | null | undefined): boolean {
    return UUIDsEqual(conversationId, this.conversationId);
  }

  private isActiveConversationLoad(conversationId: string | null | undefined, loadToken: number): boolean {
    return loadToken === this.conversationLoadToken && this.isActiveConversation(conversationId);
  }

  private isCurrentConversationContext(conversationId: string | null | undefined, loadToken?: number): boolean {
    return loadToken != null
      ? this.isActiveConversationLoad(conversationId, loadToken)
      : this.isActiveConversation(conversationId);
  }

  private resetConversationScopedViewState(): void {
    this.showArtifactPanel = false;
    this.selectedArtifactId = null;
    this.selectedVersionNumber = undefined;
    this.canShareSelectedArtifact = false;
    this.canEditSelectedArtifact = false;
    this.showArtifactsModal = false;
    this.showSystemArtifacts = false;
    this.expandedArtifactId = null;
    this._combinedArtifactsMap = null;

    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;
    this.showCollectionPicker = false;
    this.collectionPickerArtifactId = null;
    this.collectionPickerExcludedIds = [];
    this.collectionPickerVersionId = null;
    this.collectionPickerArtifactName = '';
    this.collectionPickerVersionNumber = null;

    this.showImageViewer = false;
    this.selectedImageUrl = '';
    this.selectedImageAlt = '';
    this.selectedImageFileName = '';
    this.showTestFeedbackDialog = false;
    this.testFeedbackDialogData = null;
    this.showPinsPanel = false;
    this.showAgentPanel = false;
    this.showExportModal = false;
    this.showShareModal = false;
    this.shareContext = null;
    this.showMembersModal = false;
    this.showProjectSelector = false;
    this.isUploadingAttachments = false;
    this.uploadingMessage = '';
    this.intentCheckMessage = null;

    this.isArtifactPaneMaximized = false;
  }

  private async onConversationChanged(conversationId: string | null): Promise<void> {
    // Prevent double-loading if we're already loading this same conversation
    // (ngDoCheck can fire multiple times during state changes)
    if (this.currentlyLoadingConversationId === conversationId && conversationId !== null) {
      return;
    }
    const loadToken = ++this.conversationLoadToken;

    this.resetConversationScopedViewState();

    // Reset poll-based completion tracking whenever we switch conversations,
    // so the first empty poll on the new conversation doesn't trigger a spurious reload.
    this.hadActiveAgents = false;

    if (conversationId) {
      this.currentlyLoadingConversationId = conversationId;

      if (!this.messageInputMetadataCache.has(conversationId)) {
        this.messageInputMetadataCache.set(conversationId, {
          conversationId: conversationId,
          conversationName: this.conversation?.Name || null
        });
      }

      // Only show loading spinner if the engine doesn't have cached data for this conversation.
      // This prevents the "no messages" flash when switching between conversations.
      const hasCachedMessages = this.engine.HasCachedDetails(conversationId);
      if (!hasCachedMessages) {
        this.isLoadingConversation = true;
        this.messages = [];
        this.cdr.detectChanges();
      }

      try {
        await this.loadMessages(conversationId, loadToken);
        if (!this.isActiveConversationLoad(conversationId, loadToken)) {
          return;
        }
        await this.restoreActiveTasks(conversationId);
        if (!this.isActiveConversationLoad(conversationId, loadToken)) {
          return;
        }
        // TODO: Replace polling with PubSub - see plans/repair-conversations-ui-performance.md
        this.agentStateService.startPolling(this.currentUser, conversationId);
      } catch (error) {
        if (!this.isActiveConversationLoad(conversationId, loadToken)) {
          return;
        }
        console.error('Error loading conversation:', error);
        this.messages = [];
      } finally {
        if (!this.isActiveConversationLoad(conversationId, loadToken)) {
          return;
        }
        this.currentlyLoadingConversationId = null;
        this.isLoadingConversation = false;

        // Create new array reference to trigger Angular change detection
        this.messages = [...this.messages];
        this.cdr.detectChanges();

        // Defensive fallback: force another change detection cycle after async ops complete
        setTimeout(() => {
          if (conversationId === this._conversationId && this.messages.length > 0) {
            this.messages = [...this.messages];
            this.cdr.detectChanges();
          }
        }, 50);
      }
    } else {
      // No active conversation - show empty state
      this.messages = [];
      this.isLoadingConversation = false;
      this.currentlyLoadingConversationId = null;
      this.agentStateService.stopPolling();
    }
  }

  /**
   * Returns array of cached message-input metadata for rendering
   * This allows multiple message-input components to exist simultaneously (hidden)
   * preserving their state when switching conversations
   */
  public getCachedInputs(): Array<{conversationId: string; conversationName: string | null}> {
    return Array.from(this.messageInputMetadataCache.values());
  }

  /**
   * Focus the message input inside the empty state component.
   * Uses a delay to allow Angular to render the empty state if it's being created.
   */
  private focusEmptyStateInput(): void {
    setTimeout(() => {
      if (this.emptyStateComponent) {
        this.emptyStateComponent.FocusInput();
      }
    }, 150);
  }

  /**
   * Get the message input component for the current conversation.
   * Since we cache multiple message-input instances (one per visited conversation),
   * we need to find the one that matches the current conversationId.
   */
  private getActiveMessageInputComponent(): MessageInputComponent | undefined {
    if (!this.messageInputComponents || !this.conversationId) {
      return undefined;
    }
    return this.messageInputComponents.find(
      component => component.conversationId === this.conversationId
    );
  }

  private async loadMessages(conversationId: string, loadToken: number): Promise<void> {
    try {
      // Single source of truth: ConversationEngine handles caching and DB queries.
      // Cache hit = instant (no DB). Cache miss = one GetConversationComplete query.
      // If peripheral data (artifacts/ratings) changed externally, force refresh to pick up joined fields.
      const existingEntry = this.engine.GetCachedDetailEntry(conversationId);
      const forceRefresh = existingEntry?.PeripheralDataStale === true;
      const cacheEntry = await this.engine.LoadConversationDetails(conversationId, this.currentUser, forceRefresh);
      if (!this.isActiveConversationLoad(conversationId, loadToken)) {
        return;
      }

      // Set messages from engine cache
      this.messages = cacheEntry.Details;

      // Copy user avatars from engine cache
      this.userAvatarMap.clear();
      for (const [userId, avatar] of cacheEntry.UserAvatars) {
        this.userAvatarMap.set(userId, {
          imageUrl: avatar.ImageURL,
          iconClass: avatar.IconClass
        });
      }

      this.updateAttachmentSupport();

      // Detect in-progress messages for streaming reconnection
      this.inProgressMessageIds = [...this.messages
        .filter(m => m.Status === 'In-Progress')
        .map(m => m.ID)];

      if (this.inProgressMessageIds.length > 0) {
        LogStatusEx({message: `🔌 Detected ${this.inProgressMessageIds.length} in-progress messages for reconnection`, verboseOnly: true});
      }

      // Check for missed completions (user navigated away, agent completed, user returned)
      for (const message of this.messages) {
        if (message.Status === 'In-Progress' && message.ID) {
          const recentCompletion = this.streamingService.getRecentCompletion(message.ID);
          if (recentCompletion) {
            LogStatusEx({message: `📥 Found missed completion for message ${message.ID}, handling...`, verboseOnly: true});
            await this.handleMessageCompletion(message, recentCompletion.agentRunId, conversationId, loadToken);
            if (!this.isActiveConversationLoad(conversationId, loadToken)) {
              return;
            }
            this.streamingService.clearRecentCompletion(message.ID);
          }
        }
      }

      this.scrollToBottom = true;

      // Process peripheral data (agent runs, artifacts, ratings, attachments) from engine cache
      await this.loadPeripheralData(conversationId, loadToken);
      if (!this.isActiveConversationLoad(conversationId, loadToken)) {
        return;
      }

      await this.detectAndReconcileAgentRuns(conversationId, loadToken);
      if (!this.isActiveConversationLoad(conversationId, loadToken)) {
        return;
      }
      await this.handlePendingArtifactNavigation();

    } catch (error) {
      if (!this.isActiveConversationLoad(conversationId, loadToken)) {
        return;
      }
      console.error('Error loading messages:', error);
      this.messages = [];
    }
  }


  /**
   * Process peripheral data (agent runs and artifacts) from cached conversation data
   * Parses JSON columns and builds maps for display
   *
   * PERFORMANCE OPTIMIZATION: Uses cached data instead of querying
   * - Data already loaded by loadMessages() - no additional queries needed
   * - Processes cached JSON data to build display maps
   * - Instant when switching between conversations
   */
  private async loadPeripheralData(conversationId: string, loadToken?: number): Promise<void> {
    if (!this.isCurrentConversationContext(conversationId, loadToken)) {
      return;
    }

    // Skip if we've already processed peripheral data for this conversation
    if (this.lastLoadedConversationId === conversationId) {
      return;
    }

    this.lastLoadedConversationId = conversationId;

    try {
      // Read from engine cache — always present after loadMessages() calls LoadConversationDetails()
      const cacheEntry = this.engine.GetCachedDetailEntry(conversationId);
      if (!cacheEntry) {
        console.warn(`No engine cache found for conversation ${conversationId}`);
        return;
      }

      // Clear and rebuild component maps from engine cache
      this.agentRunsByDetailId.clear();
      this.artifactsByDetailId.clear();
      this.systemArtifactsByDetailId.clear();
      this.ratingsByDetailId.clear();

      // Copy agent runs from engine (cast to extended type for UI compatibility)
      for (const [detailId, agentRun] of cacheEntry.AgentRunsByDetailId) {
        this.agentRunsByDetailId.set(detailId, agentRun as MJAIAgentRunEntityExtended);
      }

      // Convert ArtifactJSON[] from engine cache into LazyArtifactInfo[] for UI
      for (const [detailId, artifacts] of cacheEntry.ArtifactsByDetailId) {
        const artifactList: LazyArtifactInfo[] = [];
        const systemArtifactList: LazyArtifactInfo[] = [];

        for (const artifactData of artifacts) {
          const lazyInfo = new LazyArtifactInfo(artifactData, this.currentUser);
          if (artifactData.Visibility === 'System Only') {
            systemArtifactList.push(lazyInfo);
          } else {
            artifactList.push(lazyInfo);
          }
        }

        if (artifactList.length > 0) {
          this.artifactsByDetailId.set(detailId, artifactList);
        }
        if (systemArtifactList.length > 0) {
          this.systemArtifactsByDetailId.set(detailId, systemArtifactList);
        }
      }

      // Copy ratings from engine cache
      for (const [detailId, ratings] of cacheEntry.RatingsByDetailId) {
        this.ratingsByDetailId.set(detailId, ratings);
      }

      // Load attachments (still separate — not part of GetConversationComplete query)
      this.attachmentsByDetailId.clear();
      const messageIds = cacheEntry.Details.map(d => d.ID).filter((id): id is string => !!id);
      if (messageIds.length > 0) {
        const attachmentsMap = await this.attachmentService.loadAttachmentsForMessages(messageIds, this.currentUser);
        if (!this.isCurrentConversationContext(conversationId, loadToken)) {
          return;
        }
        for (const [detailId, attachments] of attachmentsMap) {
          this.attachmentsByDetailId.set(detailId, attachments);
        }
      }

      // Load session-row meta for any realtime SESSION BLOCKS in the timeline
      // (agent name + status/close-reason chip on the collapsed session cards)
      await this.loadRealtimeSessionMeta(cacheEntry.Details, conversationId, loadToken);
      if (!this.isCurrentConversationContext(conversationId, loadToken)) {
        return;
      }

      // Create new Map references to trigger Angular change detection
      this.agentRunsByDetailId = new Map(this.agentRunsByDetailId);
      this.artifactsByDetailId = new Map(this.artifactsByDetailId);
      this.ratingsByDetailId = new Map(this.ratingsByDetailId);
      this.systemArtifactsByDetailId = new Map(this.systemArtifactsByDetailId);
      this.attachmentsByDetailId = new Map(this.attachmentsByDetailId);

      // Clear combined cache since we loaded new artifacts
      this._combinedArtifactsMap = null;

      // Update artifact count for header display
      this.artifactCount = this.calculateUniqueArtifactCount();
      this.updateArtifactCountDisplay();

      // Trigger message re-render now that peripheral data is loaded
      this.messages = [...this.messages];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to process peripheral data:', error);
      this.lastLoadedConversationId = null;
    }
  }

  /**
   * Loads the `MJ: AI Agent Sessions` rows referenced by the conversation's
   * session-stamped details (one batched lookup, narrow fields, only when stamped rows
   * exist) and rebuilds {@link realtimeSessionMetaMap} so the timeline's session cards
   * can show the agent name and a status / close-reason chip. TOLERANT by design: any
   * failure leaves the map empty — cards degrade to their generic label.
   */
  private async loadRealtimeSessionMeta(details: MJConversationDetailEntity[], conversationId?: string, loadToken?: number): Promise<void> {
    const sessionIds: string[] = [];
    const seen = new Set<string>();
    for (const detail of details) {
      const raw = detail.AgentSessionID?.trim() ?? '';
      if (raw.length === 0) {
        continue;
      }
      const key = NormalizeUUID(raw);
      if (!seen.has(key)) {
        seen.add(key);
        sessionIds.push(raw);
      }
    }

    const metaMap = new Map<string, RealtimeSessionTimelineMeta>();
    if (sessionIds.length > 0) {
      try {
        const idList = sessionIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{
          ID: string;
          Agent: string | null;
          Status: 'Active' | 'Closed' | 'Idle';
          CloseReason: string | null;
          ClosedAt: string | Date | null;
        }>({
          EntityName: 'MJ: AI Agent Sessions',
          ExtraFilter: `ID IN (${idList})`,
          Fields: ['ID', 'Agent', 'Status', 'CloseReason', 'ClosedAt'],
          ResultType: 'simple'
        });
        if (result.Success) {
          for (const row of result.Results ?? []) {
            const closedAt = row.ClosedAt ? new Date(row.ClosedAt) : null;
            metaMap.set(NormalizeUUID(row.ID), {
              SessionID: row.ID,
              AgentName: row.Agent ?? null,
              Status: row.Status ?? null,
              CloseReason: row.CloseReason ?? null,
              ClosedAt: closedAt && !isNaN(closedAt.getTime()) ? closedAt : null
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load realtime session meta — session cards render without status chips:', error);
      }
    }
    if (conversationId && !this.isCurrentConversationContext(conversationId, loadToken)) {
      return;
    }

    // New reference so the message list's ngOnChanges sees the update
    this.realtimeSessionMetaMap = metaMap;
  }

  /**
   * REMOVED: Active tasks should only track currently-running tasks in this browser session.
   * Database tasks with 'In-Progress' status are shown in the Tasks dropdown via loadDatabaseTasks().
   * Restoring them here causes duplicate "Agent Processing..." entries.
   */
  private async restoreActiveTasks(conversationId: string): Promise<void> {
    // Intentionally empty - ActiveTasksService only tracks in-memory running tasks
    // Database tasks are loaded separately by TasksDropdownComponent
  }

  async onMessageSent(message: MJConversationDetailEntity): Promise<void> {
    if (this.pendingMessage && this.isPendingMessageTarget(message.ConversationID)) {
      this.pendingMessageConsumed.emit();
    }

    // Guard: ignore events from hidden message-input instances belonging to other conversations.
    // Multiple inputs are kept alive in the DOM cache (one per visited conversation) and all
    // emit events to this single parent. Without this check, a background agent's response
    // for conversation A would pollute conversation B's message list.
    if (!UUIDsEqual(message.ConversationID, this.conversationId)) {
      // Invalidate that conversation's cache so fresh data loads when the user switches back
      if (message.ConversationID) {
        this.resetComponentState(message.ConversationID);
      }
      return;
    }

    // Check if message already exists in the array (by ID) to prevent duplicates
    // Messages can be emitted multiple times as they're updated (e.g., status changes)
    const existingIndex = this.messages.findIndex(m => UUIDsEqual(m.ID, message.ID));

    if (existingIndex >= 0) {
      // Update existing message in place (replace with updated version)
      this.messages = [
        ...this.messages.slice(0, existingIndex),
        message,
        ...this.messages.slice(existingIndex + 1)
      ];
    } else {
      // Add new message to the list
      this.messages = [...this.messages, message];

      // Ensure current user is in the avatar map for new messages
      this.ensureCurrentUserInAvatarMap();

      // Invalidate cache when new message is added.
      // Without this, navigating away and back would load stale cached data
      // that doesn't include this new message.
      if (this.conversationId) {
        this.resetComponentState(this.conversationId);
      }

      // Load attachments for the new message (if any were saved with it)
      // This ensures attachments are displayed immediately after sending
      await this.loadAttachmentsForMessage(message.ID, message.ConversationID);
      if (!this.isActiveConversation(message.ConversationID)) {
        return;
      }

      // CRITICAL: If this is a new In-Progress AI message, add it to inProgressMessageIds
      // immediately so message-input registers a PubSub streaming callback for it.
      // buildMessagesFromCache handles the nav-away/nav-back reconnection case;
      // this handles the active-session case where the agent just started.
      // Without this, inProgressMessageIds stays [] and the completion event is never received.
      if (message.Status === 'In-Progress' && message.ID && !this.inProgressMessageIds.includes(message.ID)) {
        this.inProgressMessageIds = [...this.inProgressMessageIds, message.ID];
      }
    }

    // Scroll to bottom when new message is sent
    this.scrollToBottom = true;

    // Force change detection — zone.js 0.15 no longer patches graphql-ws WebSocket callbacks,
    // so progress updates that arrive via PubSub run outside Angular's zone. Without this,
    // the UI does not update when the messages array is modified from a streaming callback.
    this.cdr.detectChanges();
  }

  onInitialMessageAutoSendStarted(event: {conversationId: string}): void {
    if (this.pendingMessage && this.isPendingMessageTarget(event.conversationId)) {
      this.pendingMessageConsumed.emit();
    }
  }

  private isPendingMessageTarget(conversationId: string | null | undefined): boolean {
    return UUIDsEqual(conversationId, this.EffectivePendingMessageTarget);
  }

  /**
   * Loads attachments for a single message and adds them to the attachmentsByDetailId map.
   * Called after a new message is sent to ensure attachments are displayed immediately.
   */
  private async loadAttachmentsForMessage(messageId: string, conversationId: string | null | undefined): Promise<void> {
    try {
      const attachments = await this.attachmentService.loadAttachmentsForMessage(messageId, this.currentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }
      if (attachments.length > 0) {
        this.attachmentsByDetailId.set(messageId, attachments);
        // Create new map reference to trigger Angular change detection
        this.attachmentsByDetailId = new Map(this.attachmentsByDetailId);
        LogStatusEx({message: `Loaded ${attachments.length} attachment(s) for message ${messageId}`, verboseOnly: true});
      }
    } catch (error) {
      console.warn('Failed to load attachments for message:', error);
    }
  }

  /**
   * Ensures the current user is in the avatar map
   * Called when new messages are created to ensure avatar data is available
   */
  private async ensureCurrentUserInAvatarMap(): Promise<void> {
    const userId = this.currentUser.ID;

    // If user already in map, skip
    if (this.userAvatarMap.has(userId)) {
      return;
    }

    // Load the current user's avatar data
    const md = this.ProviderToUse;
    const userEntity = await md.GetEntityObject<any>('MJ: Users');
    await userEntity.Load(userId);

    this.userAvatarMap.set(userId, {
      imageUrl: userEntity.UserImageURL || null,
      iconClass: userEntity.UserImageIconClass || null
    });

    LogStatusEx({message: `👤 Added current user to avatar map`, verboseOnly: true});
  }

  /**
   * Handle agent run detected event from progress updates
   * This is called when the first progress update arrives with an agent run ID
   */
  async onAgentRunDetected(event: {conversationId: string; conversationDetailId: string; agentRunId: string}): Promise<void> {
    // Guard: ignore events from a background conversation's (hidden, still-streaming) input
    // after a conversation swap. Without this, a background run would be written into the
    // active conversation's agent-run map and engine cache. See onMessageSent() for context.
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    await this.addAgentRunToMap(event.conversationId, event.conversationDetailId, event.agentRunId);
  }

  /**
   * Handle message completion event from message-input
   * Refreshes the agent run data in-place to get final status and timestamps
   * Also reloads attachments created during agent execution (e.g., generated images)
   */
  async onMessageComplete(event: {conversationId: string; conversationDetailId: string; agentId?: string}): Promise<void> {
    // Guard: ignore completion of a background conversation's run after a conversation swap.
    // Without this, a background run is refreshed into the active conversation's engine cache
    // (keyed by this.conversationId) and its attachments loaded into the active map.
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }

    // Get existing agent run from map
    const existingAgentRun = this.agentRunsByDetailId.get(event.conversationDetailId);

    if (existingAgentRun?.ID) {
      // Refresh the SAME object by calling Load() - preserves all references
      // duck type check to see if we have a BaseEntity or not
      if (!!existingAgentRun.Load) {
        await existingAgentRun.Load(existingAgentRun.ID);
        if (!this.isActiveConversation(event.conversationId)) {
          return;
        }
      }
      else {
        // we do NOT have an existingAgentRun base entity, but rather a simple JSON object so we need to create an object here
        const md = this.ProviderToUse;
        const newEntity = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs');
        newEntity.LoadFromData(existingAgentRun);
        // swap the map entry to have this object now
        this.agentRunsByDetailId.set(event.conversationDetailId, newEntity);

        // Also update ConversationEngine's cache
        if (event.conversationId) {
          ConversationEngine.Instance.SetAgentRunForDetail(event.conversationId, event.conversationDetailId, newEntity);
        }
      }

      // Trigger re-render to show updated status
      this.messages = [...this.messages];
      this.cdr.detectChanges();
    }

    // Reload attachments for this message to pick up newly created media attachments
    // (e.g., images generated by agent via Generate Image action)
    // This must be done after agent completion because attachments are created by AgentRunner
    // after the agent execution finishes
    await this.loadAttachmentsForMessage(event.conversationDetailId, event.conversationId);

    // Trigger change detection after async attachment loading to ensure UI updates
    this.cdr.detectChanges();
  }

  /**
   * Handle agent run update event from progress updates
   * This is called on EVERY progress update with the full, live agent run object
   * Provides real-time updates of status, timestamps, tokens, cost during execution
   */
  async onAgentRunUpdate(event: {conversationId: string; conversationDetailId: string; agentRun?: MJAIAgentRunEntityExtended, agentRunId?: string}): Promise<void> {
    // Guard: ignore live progress updates from a background conversation's run after a swap.
    // Without this, a background run is written into the active conversation's agent-run map
    // and into ConversationEngine's cache keyed by this.conversationId. See onMessageSent().
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    if (event.agentRun) {
      // Directly update map with fresh data from progress (no database query needed)
      // Don't create new Map - message-list component needs to keep the same reference
      this.agentRunsByDetailId.set(event.conversationDetailId, event.agentRun);

      // Also update ConversationEngine's cache for other consumers
      if (event.conversationId) {
        ConversationEngine.Instance.SetAgentRunForDetail(event.conversationId, event.conversationDetailId, event.agentRun);
      }
    }
    else {
      // no agent run, should have agentRunId
      await this.addAgentRunToMap(event.conversationId, event.conversationDetailId, event.agentRunId!);
    }

    // Force message list to re-render with updated agent run
    // This ensures message components receive the fresh agent run data
    this.messages = [...this.messages];
    this.cdr.detectChanges();
  }

  /**
   * Public entry point to reload messages in the active conversation.
   * Called by the parent resource wrapper when the user clicks the Refresh button,
   * so that new agent responses are visible without a full page reload.
   */
  public async reloadMessages(): Promise<void> {
    await this.reloadMessagesForActiveConversation();
  }

  /**
   * Reload messages from the ConversationEngine cache (no DB round-trip).
   * The engine cache is kept warm by entity event handlers that auto-sync on save/delete.
   * Called when agent completion is detected to discover newly delegated agent messages.
   */
  private async reloadMessagesForActiveConversation(): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) {
      return;
    }

    try {
      // Read from engine cache — already warm from entity event handler auto-sync
      const engineDetails = this.engine.GetCachedDetails(conversationId);
      if (!engineDetails || engineDetails.length === 0) {
        return;
      }
      if (!this.isActiveConversation(conversationId)) {
        return;
      }

      // Track existing message IDs before reload to identify new messages
      const existingMessageIds = new Set(this.messages.map(m => m.ID));

      // Merge engine cache with existing client-side messages.
      // Preserves messages added client-side (e.g., by handleSubAgentInvocation)
      // that haven't been picked up by entity events yet due to timing.
      const merged = new Map<string, MJConversationDetailEntity>();

      for (const msg of engineDetails) {
        merged.set(msg.ID, msg);
      }

      // Preserve client-side messages not yet in engine cache
      for (const msg of this.messages) {
        if (!merged.has(msg.ID)) {
          merged.set(msg.ID, msg);
        }
      }

      this.messages = Array.from(merged.values())
        .sort((a, b) => (a.__mj_CreatedAt?.getTime() || 0) - (b.__mj_CreatedAt?.getTime() || 0));

      // Find newly discovered messages (delegated agents)
      const newMessages = engineDetails.filter(m => !existingMessageIds.has(m.ID));

      // Check engine cache for agent runs on new messages
      for (const message of newMessages) {
        if (message.AgentID && message.ID) {
          const agentRun = this.engine.GetAgentRunForDetail(conversationId, message.ID);
          if (agentRun) {
            this.agentRunsByDetailId.set(message.ID, agentRun as MJAIAgentRunEntityExtended);
            LogStatusEx({message: `✅ Found cached agent run for new delegated message ${message.ID}`, verboseOnly: true});
          }
        }
      }

      LogStatusEx({message: `✅ Refreshed ${engineDetails.length} messages from engine cache (${newMessages.length} new)`, verboseOnly: true});
    } catch (error) {
      console.error('Failed to reload messages for active conversation:', error);
    }
  }

  /**
   * Handle message completion triggered by PubSub completion event
   * Reloads message, agent run, and artifacts, then updates UI
   * @param message The message that completed
   * @param agentRunId The ID of the agent run that completed
   */
  private async handleMessageCompletion(
    message: MJConversationDetailEntity,
    _agentRunId: string,
    expectedConversationId: string | null | undefined = message.ConversationID,
    loadToken?: number
  ): Promise<void> {
    try {
      const isCurrent = () => this.isCurrentConversationContext(expectedConversationId, loadToken);

      LogStatusEx({message: `🎉 Handling completion for message ${message.ID}`, verboseOnly: true});

      // Snapshot artifact IDs before reload to detect newly created artifacts
      const artifactIdsBefore = this.collectAllArtifactIds();

      // Reload message from database to get final content and status
      await message.Load(message.ID);
      if (!isCurrent()) {
        return;
      }

      // Reload agent run to get final status, timestamps, and cost
      const agentRun = this.agentRunsByDetailId.get(message.ID);
      if (agentRun?.ID) {
        await agentRun.Load(agentRun.ID);
        if (!isCurrent()) {
          return;
        }
      }

      // Reload artifacts for this completed message
      await this.reloadArtifactsForMessage(message.ID, expectedConversationId, loadToken);
      if (!isCurrent()) {
        return;
      }

      // Reload messages to pick up newly delegated agent messages
      // When Sage delegates to Marketing Agent, a new message is created
      await this.reloadMessagesForActiveConversation();
      if (!isCurrent()) {
        return;
      }

      // Invalidate cache since reloadMessages may have loaded new delegated-agent messages
      // that are not in the cache set by reloadArtifactsForMessage().
      // Without this, navigating away and back would show stale data.
      if (message.ConversationID) {
        this.resetComponentState(message.ConversationID);
      }

      // Update inProgressMessageIds to include new delegated agents
      // This triggers callback registration via the setter in message-input
      this.inProgressMessageIds = [...this.messages
        .filter(m => m.Status === 'In-Progress')
        .map(m => m.ID)];

      // Auto-open artifact panel if NEW artifacts were discovered (not just the triggering message).
      // When Sage delegates to a sub-agent (e.g., Skip), the artifact is on the sub-agent's
      // message, not Sage's. Checking only the triggering message would miss delegated artifacts.
      if (!this.showArtifactPanel) {
        await this.autoOpenNewArtifact(artifactIdsBefore, expectedConversationId);
      }

      // Remove task from ActiveTasksService (clears spinner in conversation list)
      const task = this.activeTasks.getByConversationDetailId(message.ID);
      if (task) {
        this.activeTasks.remove(task.id);
      }

      // Force re-render with updated agent run and artifacts
      this.messages = [...this.messages];
      this.cdr.detectChanges();

      LogStatusEx({message: `✅ Completion handled for message ${message.ID}`, verboseOnly: true});
    } catch (error) {
      console.error(`Error handling message completion for ${message.ID}:`, error);
      this.cdr.detectChanges();
    }
  }

  async onAgentResponse(event: {message: MJConversationDetailEntity, agentResult: any}): Promise<void> {
    // Guard: ignore agent responses from background inputs for other conversations.
    // See onMessageSent() for the full explanation.
    if (!UUIDsEqual(event.message.ConversationID, this.conversationId)) {
      if (event.message.ConversationID) {
        this.resetComponentState(event.message.ConversationID);
      }
      return;
    }

    // Add the agent's response message to the conversation
    this.messages = [...this.messages, event.message];

    // Invalidate cache for this conversation since we have new messages
    if (this.conversationId) {
      this.resetComponentState(this.conversationId);
    }

    // Scroll to bottom when agent responds
    this.scrollToBottom = true;

    // CRITICAL FIX: Always refresh the agent run data when agent completes
    // This ensures we get the final status and timestamps, replacing any stale data from when agent started
    // agentResult is ExecuteAgentResult which contains agentRun property
    if (event.agentResult?.agentRun?.ID) {
      await this.addAgentRunToMap(event.message.ConversationID, event.message.ID, event.agentResult.agentRun.ID, true);  // forceRefresh = true
      if (!this.isActiveConversation(event.message.ConversationID)) {
        return;
      }
    }

    // Snapshot artifact IDs before reload to detect newly created artifacts
    const artifactIdsBefore = this.collectAllArtifactIds();

    // Reload artifact mapping for this message to pick up newly created artifacts
    await this.reloadArtifactsForMessage(event.message.ID, event.message.ConversationID);
    if (!this.isActiveConversation(event.message.ConversationID)) {
      return;
    }

    // Auto-open artifact panel if NEW artifacts were discovered
    if (!this.showArtifactPanel) {
      await this.autoOpenNewArtifact(artifactIdsBefore, event.message.ConversationID);
    }

    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  /**
   * Reset component-level UI state so peripheral data reprocesses on next load.
   * Does NOT invalidate ConversationEngine cache — the engine is the single source of truth
   * and is kept warm via AddDetailToCache/UpdateDetailInCache.
   */
  private resetComponentState(conversationId: string): void {
    // Reset so loadPeripheralData re-runs on next conversation load
    if (this.lastLoadedConversationId === conversationId) {
      this.lastLoadedConversationId = null;
    }
  }

  /**
   * Add or update an agent run in the map
   * Called when a new agent run completes to keep the map in sync
   * @param forceRefresh If true, always reload from database even if already in map (used when status changes)
   */
  private async addAgentRunToMap(conversationId: string | null | undefined, conversationDetailId: string, agentRunId: string, forceRefresh: boolean = false): Promise<MJAIAgentRunEntityExtended> {
    try {
      // Always refresh if forced, or if not in map yet
      if (forceRefresh || !this.agentRunsByDetailId.has(conversationDetailId)) {
        const md = this.ProviderToUse;
        const agentRun = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', this.currentUser);
        if (await agentRun.Load(agentRunId)) {
          if (!this.isActiveConversation(conversationId)) {
            return agentRun;
          }
          this.agentRunsByDetailId.set(conversationDetailId, agentRun);

          // Also update ConversationEngine's cache for other consumers
          if (conversationId) {
            ConversationEngine.Instance.SetAgentRunForDetail(conversationId, conversationDetailId, agentRun);
          }

          // Force message list to re-render with updated agent run
          // Keep same Map reference so message-list component can access updates
          this.messages = [...this.messages];
          this.cdr.detectChanges();

        }
        return agentRun;
      } 
      else {
        return this.agentRunsByDetailId.get(conversationDetailId)!;
      }
    } catch (error) {
      console.error('Failed to load agent run for map:', error);
      throw error;
    }
  }

  /**
   * Reload artifacts for a conversation, triggered by a specific message ID.
   * Processes ALL messages in the conversation (not just the trigger message)
   * so that artifacts from delegated sub-agent messages are also picked up.
   * Called after an artifact is created to update the UI immediately.
   * Invalidates and refreshes the conversation cache.
   */
  private async reloadArtifactsForMessage(conversationDetailId: string, expectedConversationId?: string | null, loadToken?: number): Promise<void> {
    LogStatusEx({message: `🔄 Reloading artifacts for message ${conversationDetailId}`, verboseOnly: true});
    try {
      const md = this.ProviderToUse;

      // Get the ConversationID for this detail
      const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);
      if (!(await detail.Load(conversationDetailId))) {
        console.error('Failed to load conversation detail');
        return;
      }
      const detailConversationId = detail.ConversationID;
      const targetConversationId = expectedConversationId ?? detailConversationId;
      const isCurrent = () => this.isCurrentConversationContext(targetConversationId, loadToken);
      if (!UUIDsEqual(detailConversationId, targetConversationId) || !isCurrent()) {
        return;
      }

      // Surgical refresh — merges new artifacts into existing cache without replacing objects
      await this.engine.RefreshConversationDetails(detailConversationId, this.currentUser);
      if (!isCurrent()) {
        return;
      }

      // Reprocess peripheral data from the updated engine cache
      this.lastLoadedConversationId = null;
      await this.loadPeripheralData(detailConversationId, loadToken);
    } catch (error) {
      console.error('Failed to reload artifacts for message:', error);
    }
  }

  openProjectSelector(): void {
    this.showProjectSelector = true;
  }

  toggleMembersModal(): void {
    this.showMembersModal = !this.showMembersModal;
  }

  viewArtifacts(): void {
    this.showArtifactsModal = true;
  }

  /**
   * Recompute the cached artifactCountDisplay from the effective artifacts map.
   * Must be called whenever artifactsByDetailId, systemArtifactsByDetailId,
   * or showSystemArtifacts changes, instead of using a getter that can produce
   * different values between Angular change-detection passes (NG0100).
   */
  private updateArtifactCountDisplay(): void {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.effectiveArtifactsMap.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifactId);
      }
    }
    this.artifactCountDisplay = uniqueArtifactIds.size;
  }

  /**
   * Calculate count of unique artifacts (not versions) - user-visible only
   * Used for initial artifact count (doesn't change with toggle)
   */
  private calculateUniqueArtifactCount(): number {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.artifactsByDetailId.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifactId);
      }
    }
    return uniqueArtifactIds.size;
  }

  /**
   * Collect all currently known artifact IDs across all messages.
   * Used as a "before" snapshot to detect newly created artifacts after a reload.
   */
  private collectAllArtifactIds(): Set<string> {
    const ids = new Set<string>();
    for (const artifactList of this.artifactsByDetailId.values()) {
      for (const info of artifactList) {
        ids.add(info.artifactId);
      }
    }
    return ids;
  }

  /**
   * Auto-open the artifact panel for the most recent NEW artifact.
   * Compares current artifacts against a pre-reload snapshot to find
   * only artifacts that were just discovered (avoiding re-opening for old artifacts).
   * Searches artifactsByDetailId directly rather than iterating this.messages,
   * because reloadMessagesForActiveConversation can temporarily remove messages
   * from this.messages during concurrent operations.
   */
  private async autoOpenNewArtifact(artifactIdsBefore: Set<string>, expectedConversationId: string | null | undefined = this.conversationId): Promise<void> {
    if (!this.isActiveConversation(expectedConversationId)) {
      return;
    }
    for (const [detailId, artifactList] of this.artifactsByDetailId) {
      const newArtifact = artifactList.find(a => !artifactIdsBefore.has(a.artifactId));
      if (newArtifact) {
        this.selectedArtifactId = newArtifact.artifactId;
        this.showArtifactPanel = true;
        await this.loadArtifactPermissions(newArtifact.artifactId, expectedConversationId, newArtifact.artifactId);
        if (!this.isActiveConversation(expectedConversationId) || !UUIDsEqual(this.selectedArtifactId, newArtifact.artifactId)) {
          return;
        }
        LogStatusEx({message: `🎨 Auto-opening new artifact ${newArtifact.artifactId} from detail ${detailId}`, verboseOnly: true});
        return;
      }
    }
  }

  /**
   * Get the effective artifacts map based on showSystemArtifacts toggle
   * Combines user-visible and system artifacts when toggle is on
   * Uses caching to prevent infinite change detection loops
   */
  public get effectiveArtifactsMap(): Map<string, LazyArtifactInfo[]> {
    if (!this.showSystemArtifacts) {
      // Only user-visible artifacts - no need to cache
      return this.artifactsByDetailId;
    }

    // Return cached combined map if available
    if (this._combinedArtifactsMap) {
      return this._combinedArtifactsMap;
    }

    // Combine both maps when showing system artifacts
    const combined = new Map<string, LazyArtifactInfo[]>();

    // Add all user-visible artifacts
    for (const [key, value] of this.artifactsByDetailId) {
      combined.set(key, [...value]);
    }

    // Add system artifacts
    for (const [key, value] of this.systemArtifactsByDetailId) {
      if (combined.has(key)) {
        // Merge with existing artifacts for this detail
        combined.get(key)!.push(...value);
      } else {
        combined.set(key, [...value]);
      }
    }

    // Cache the result
    this._combinedArtifactsMap = combined;
    return combined;
  }

  /**
   * Toggles system artifacts visibility
   * Clears the cache so the map will be rebuilt on next access
   */
  public toggleSystemArtifacts(): void {
    this.showSystemArtifacts = !this.showSystemArtifacts;
    this._combinedArtifactsMap = null; // Clear cache
    this.updateArtifactCountDisplay();
    this.cdr.detectChanges(); // Force update
  }

  /**
   * Check if there are any system artifacts in this conversation
   * Used to conditionally show/hide the "Show System" toggle button
   */
  public get hasSystemArtifacts(): boolean {
    return this.systemArtifactsByDetailId.size > 0;
  }

  /**
   * Get unique artifacts grouped by artifact ID (not by conversation detail)
   * Returns the latest version info for each unique artifact with all versions
   * Works with LazyArtifactInfo - uses display data without loading full entities
   * Respects showSystemArtifacts toggle
   */
  getArtifactsArray(): Array<{
    artifactId: string;
    versionId: string;
    name: string;
    versionCount: number;
    visibility: string;
    versions: Array<{versionId: string; versionNumber: number}>
  }> {
    const artifactMap = new Map<string, {
      artifactId: string;
      versionId: string;
      name: string;
      visibility: string;
      versions: Array<{versionId: string; versionNumber: number}>
    }>();

    // Group by artifactId, collecting all version details
    // Use effectiveArtifactsMap to respect showSystemArtifacts toggle
    for (const artifactList of this.effectiveArtifactsMap.values()) {
      for (const info of artifactList) {
        const artifactId = info.artifactId;
        const versionId = info.artifactVersionId;
        const versionNumber = info.versionNumber || 1;
        const name = info.artifactName || 'Untitled';

        if (!artifactMap.has(artifactId)) {
          artifactMap.set(artifactId, {
            artifactId: artifactId,
            versionId: versionId, // Latest version ID
            name: name,
            visibility: info.visibility,
            versions: [{versionId: versionId, versionNumber: versionNumber}]
          });
        } else {
          // Add version if not already present
          const existing = artifactMap.get(artifactId)!;
          if (!existing.versions.some(v => v.versionId === versionId)) {
            existing.versions.push({versionId: versionId, versionNumber: versionNumber});
            // Update to latest version ID (assuming versions are added chronologically)
            existing.versionId = versionId;
          }
        }
      }
    }

    // Convert to array with version count, sorted by version number descending
    return Array.from(artifactMap.values()).map(item => ({
      artifactId: item.artifactId,
      versionId: item.versionId,
      name: item.name,
      visibility: item.visibility,
      versionCount: item.versions.length,
      versions: item.versions.sort((a, b) => b.versionNumber - a.versionNumber)
    }));
  }

  toggleArtifactExpansion(artifactId: string, event: Event): void {
    event.stopPropagation(); // Prevent opening artifact when clicking expand button
    this.expandedArtifactId = this.expandedArtifactId === artifactId ? null : artifactId;
  }

  async openArtifactFromModal(artifactId: string, versionNumber?: number): Promise<void> {
    const conversationId = this.conversationId;
    this.selectedArtifactId = artifactId;
    this.selectedVersionNumber = versionNumber;
    this.showArtifactPanel = true;
    this.showArtifactsModal = false;

    // Load permissions for the selected artifact
    await this.loadArtifactPermissions(artifactId, conversationId, artifactId);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.selectedArtifactId, artifactId)) {
      return;
    }
    this.cdr.detectChanges();
  }

  exportConversation(): void {
    if (this.conversation) {
      this.showExportModal = true;
    }
  }

  onExportModalCancelled(): void {
    this.showExportModal = false;
  }

  onExportModalComplete(): void {
    this.showExportModal = false;
  }

  async onProjectSelected(project: any): Promise<void> {
    if (this.conversation && project) {
      try {
        await this.engine.SaveConversation(
          this.conversation.ID,
          { ProjectID: project.ID },
          this.currentUser
        );
        this.showProjectSelector = false;
      } catch (error) {
        console.error('Failed to assign project:', error);
      }
    } else if (this.conversation && !project) {
      // Remove project assignment
      try {
        await this.engine.SaveConversation(
          this.conversation.ID,
          { ProjectID: null },
          this.currentUser
        );
        this.showProjectSelector = false;
      } catch (error) {
        console.error('Failed to remove project:', error);
      }
    }
  }

  shareConversation(): void {
    if (!this.conversation) return;
    this.shareContext = {
      ResourceID: this.conversation.ID,
      ResourceName: this.conversation.Name ?? 'Conversation',
      OwnerUserID: this.conversation.UserID ?? null,
      OwnerDisplayName: this.conversation.User ?? 'You',
      CurrentUserID: this.currentUser?.ID ?? null
    };
    this.showShareModal = true;
  }

  onShareDialogResult(_result: { Action: 'save' | 'cancel' }): void {
    this.showShareModal = false;
  }

  /**
   * Display info for the header "Shared by {email}" badge. Returns `null`
   * when the current user owns the conversation or when the share has no
   * recorded grantor (legacy share pre-dating `SharedByUserID`).
   */
  public get sharedByBadge(): { display: string; fullTooltip: string } | null {
    if (!this.conversation) return null;
    const info = this.engine.GetSharedByInfo(this.conversation.ID);
    if (!info || !info.UserID) return null;
    const display = info.Email ?? info.Name ?? 'another user';
    const tooltip = info.Email && info.Name ? `${info.Name} <${info.Email}>` : display;
    return { display, fullTooltip: `Shared by ${tooltip}` };
  }

  /**
   * `true` when the current user only has `View` access to this conversation
   * (i.e., it was shared with them read-only). Gates the message input and
   * any other write-capable UI.
   */
  public get isReadOnlyView(): boolean {
    if (!this.conversation) return false;
    const info = this.engine.GetSharedByInfo(this.conversation.ID);
    return info?.Level === 'View';
  }

  /**
   * `true` when the current user is allowed to create new shares on this
   * conversation. Only the conversation's owner — or a user with an existing
   * Owner-level grant — may do so. Matches the server-side gate in
   * {@link MJResourcePermissionEntityExtended.callerMayGrantShare}, so the UI
   * doesn't offer an action the save would refuse.
   */
  public get canShareConversation(): boolean {
    if (!this.conversation || !this.currentUser) return false;
    if (this.conversation.UserID && this.conversation.UserID.toLowerCase() === this.currentUser.ID.toLowerCase()) {
      return true;
    }
    const info = this.engine.GetSharedByInfo(this.conversation.ID);
    return info?.Level === 'Owner';
  }

  onReplyInThread(message: MJConversationDetailEntity): void {
    // Open thread panel for this message - emit to parent
    this.threadOpened.emit(message.ID);
  }

  onViewThread(message: MJConversationDetailEntity): void {
    // Open thread panel for this message - emit to parent
    this.threadOpened.emit(message.ID);
  }

  onLocalThreadClosed(): void {
    // Close the thread panel - emit to parent
    this.threadClosed.emit();
  }

  onThreadReplyAdded(reply: MJConversationDetailEntity): void {
    // Optionally refresh the message list to update thread counts
    // For now, we'll just log it
    LogStatusEx({message: 'Thread reply added', verboseOnly: true, additionalArgs: [reply]});

    // Reload messages to get updated thread counts
    if (this.conversationId) {
      const conversationId = this.conversationId;
      const loadToken = ++this.conversationLoadToken;
      void this.loadMessages(conversationId, loadToken);
    }
  }

  onToggleAgentPanel(): void {
    this.showAgentPanel = !this.showAgentPanel;
    // The agent panel component handles its own visibility
    // This could be used to toggle a modal or different view
  }

  onAgentSelected(agentRun: MJAIAgentRunEntity): void {
    // When an agent is clicked in the indicator, could show details
    LogStatusEx({message: 'Agent selected', verboseOnly: true, additionalArgs: [agentRun.ID]});
    // Could open a modal or navigate to agent details
  }

  onMessageEdited(message: MJConversationDetailEntity): void {
    // Message was edited and saved, trigger change detection
    LogStatusEx({message: 'Message edited', verboseOnly: true, additionalArgs: [message.ID]});
    // The message entity is already updated in place, so no need to reload
    // Just ensure the UI reflects the changes
  }

  onMessagePinToggled(message: MJConversationDetailEntity): void {
    // The entity object is already mutated by .Save() and the engine cache holds the same
    // object reference, so no explicit cache update is needed here.
    // Update engine's raw data cache to stay in sync
    if (this.conversationId) {
      const cacheEntry = this.engine.GetCachedDetailEntry(this.conversationId);
      if (cacheEntry) {
        const row = cacheEntry.RawData.find((r: ConversationDetailComplete) => UUIDsEqual(r.ID, message.ID));
        if (row) {
          row.IsPinned = message.IsPinned;
        }
      }
    }
    // Auto-close the panel when the last pin is removed
    if (this.showPinsPanel && this.pinnedMessages.length === 0) {
      setTimeout(() => { this.showPinsPanel = false; this.cdr.detectChanges(); }, 600);
    }
    this.cdr.detectChanges();
  }

  /**
   * Scrolls the message list to the target message and plays the beacon animation.
   * Called when the user clicks "Jump to message" in the pins panel.
   */
  onJumpToMessage(messageId: string): void {
    const el = this.scrollContainer?.nativeElement?.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add beacon animation after scroll settles
    setTimeout(() => {
      el.classList.add('pin-beacon');
      setTimeout(() => el.classList.remove('pin-beacon'), 1500);
    }, 350);
  }

  /**
   * Unpins a message from the pins panel — saves to DB and patches the cache.
   */
  async onUnpinFromPanel(message: MJConversationDetailEntity): Promise<void> {
    const previous = message.IsPinned;
    message.IsPinned = false;
    this.cdr.detectChanges();
    try {
      await message.Save();
      this.onMessagePinToggled(message);
    } catch (err) {
      console.error('Failed to unpin message from panel:', err);
      message.IsPinned = previous;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle suggested response selection from user
   * Sends the selected response as a new user message WITHOUT modifying the visible input
   */
  async onSuggestedResponseSelected(event: {text: string; customInput?: string}): Promise<void> {
    const messageText = event.customInput || event.text;

    // Get the active message input for the current conversation
    // (we cache multiple instances, one per visited conversation)
    const activeInput = this.getActiveMessageInputComponent();

    // If we have an active conversation with message input available, use it
    if (activeInput && !this.isNewConversation) {
      await activeInput.sendMessageWithText(messageText);
    } else if (!this.conversation || this.isNewConversation) {
      // If no conversation or in new unsaved state, route through empty state handler
      // This will create the conversation and send the message
      await this.onEmptyStateMessageSent({ text: messageText, attachments: [] });
    } else {
      console.error('MessageInputComponent not available and not in a valid state to create conversation');
    }
  }

  async onDeleteMessage(message: MJConversationDetailEntity): Promise<void> {
    if (!UUIDsEqual(this.conversation?.UserID, this.currentUser?.ID)) return;

    // Find this message and all messages after it sorted by creation time
    const sortedMessages = [...this.messages].sort((a, b) =>
      new Date(a.__mj_CreatedAt!).getTime() - new Date(b.__mj_CreatedAt!).getTime()
    );
    const targetIndex = sortedMessages.findIndex(m => UUIDsEqual(m.ID, message.ID));
    if (targetIndex === -1) return;

    const toHide = sortedMessages.slice(targetIndex);
    const count = toHide.length;

    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete Messages',
      message: count === 1
        ? 'Delete this message? This cannot be undone.'
        : `Delete this message and the ${count - 1} message${count - 1 === 1 ? '' : 's'} after it? This cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;

    // Load all entities in parallel, then delete in parallel.
    // entity.Delete() calls spDeleteConversationDetail which handles all FK children:
    // hard-deletes junction tables (Artifact/Attachment/Rating), nullifies FKs on AI* records.
    const md = this.ProviderToUse;
    const loadResults = await Promise.all(
      toHide.map(async msg => {
        const entity = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);
        const loaded = await entity.Load(msg.ID);
        return loaded ? entity : null;
      })
    );
    const entities = loadResults.filter((e): e is MJConversationDetailEntity => e !== null);
    if (entities.length === 0) return;

    // Sequential deletes — parallel fires concurrent server-side transactions which race on
    // SQLServerDataProvider's singleton _transactionDepth counter and fail with SAVE TRANSACTION errors.
    for (const e of entities) {
      const ok = await e.Delete();
      if (!ok) {
        const last = e.ResultHistory[e.ResultHistory.length - 1];
        console.error(`Failed to delete ConversationDetail ${e.ID}: ${last?.Message ?? 'unknown error'}`, last?.Error ?? '');
      }
    }

    const hideIds = new Set(toHide.map(m => m.ID));
    this.messages = this.messages.filter(m => !hideIds.has(m.ID));
    this.resetComponentState(this.conversationId!);
    this.cdr.detectChanges();
  }

  onRetryMessage(message: MJConversationDetailEntity): void {
    // TODO: Implement retry logic
    // This should find the parent user message and re-trigger the agent invocation
    LogStatusEx({message: 'Retry requested for message', verboseOnly: true, additionalArgs: [message.ID]});
    // For now, just log it - full implementation would require refactoring agent invocation
  }

  /**
   * Handle attachment click - opens the image viewer for images
   */
  onAttachmentClicked(attachment: MessageAttachment): void {
    if (attachment.type === 'Image' && attachment.contentUrl) {
      this.selectedImageUrl = attachment.contentUrl;
      this.selectedImageAlt = attachment.fileName || 'Image attachment';
      this.selectedImageFileName = attachment.fileName || 'image';
      this.showImageViewer = true;
      return;
    }

    // Artifact-backed attachments open in the artifact viewer panel.
    if (attachment.source === 'artifact' && attachment.artifactId) {
      this.onArtifactClicked({
        artifactId: attachment.artifactId,
        versionId: attachment.artifactVersionId
      });
      return;
    }

    // Plain uploads: trigger a browser download if we have a usable content URL.
    if (attachment.contentUrl) {
      const a = document.createElement('a');
      a.href = attachment.contentUrl;
      a.download = attachment.fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  /**
   * Handle image viewer close
   */
  onImageViewerClosed(): void {
    this.showImageViewer = false;
    this.selectedImageUrl = '';
    this.selectedImageAlt = '';
    this.selectedImageFileName = '';
  }

  /**
   * Handle upload state changes from message input component
   */
  onUploadStateChanged(event: {isUploading: boolean; message: string}): void {
    this.isUploadingAttachments = event.isUploading;
    this.uploadingMessage = event.message;
  }

  async onArtifactClicked(data: {artifactId: string; versionId?: string}): Promise<void> {
    const conversationId = this.conversationId;
    this.selectedArtifactId = data.artifactId;

    // If versionId is provided, find the version number from display data (no lazy load needed)
    if (data.versionId) {
      for (const artifactList of this.artifactsByDetailId.values()) {
        for (const artifactInfo of artifactList) {
          if (artifactInfo.artifactVersionId === data.versionId) {
            this.selectedVersionNumber = artifactInfo.versionNumber;
            LogStatusEx({message: `📦 Opening artifact viewer for v${this.selectedVersionNumber}`, verboseOnly: true});
            break;
          }
        }
      }
    } else {
      // No specific version, let viewer default to latest
      this.selectedVersionNumber = undefined;
    }

    this.showArtifactPanel = true;

    // Load permissions for the selected artifact
    await this.loadArtifactPermissions(data.artifactId, conversationId, data.artifactId);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.selectedArtifactId, data.artifactId)) {
      return;
    }

    // Trigger detectChanges after all state is settled (showArtifactPanel, permissions)
    // to prevent ExpressionChangedAfterItHasBeenCheckedError from zone-triggered CD
    // seeing partial state between the await boundaries
    this.cdr.detectChanges();
  }

  async onArtifactCreated(data: {conversationId: string, conversationDetailId: string, artifactId: string; versionId: string; versionNumber: number; name: string}): Promise<void> {
    // Guard: ignore artifacts created by a background conversation's agent after a swap.
    // Without this, reloadArtifactsForMessage -> loadPeripheralData would CLEAR the active
    // conversation's artifact/agent-run/rating/attachment maps and rebuild them from the
    // background conversation's cache — wiping the displayed conversation's artifacts.
    // The background conversation's artifacts persist server-side and reload when the user
    // navigates back to it. See onMessageSent() for the broader pattern.
    if (!this.isActiveConversation(data.conversationId)) {
      return;
    }

    // Snapshot artifact IDs before reload to detect newly created artifacts
    const artifactIdsBefore = this.collectAllArtifactIds();

    // Reload artifacts to get full entities (processes ALL messages in the conversation)
    await this.reloadArtifactsForMessage(data.conversationDetailId, data.conversationId);
    if (!this.isActiveConversation(data.conversationId)) {
      return;
    }

    // Auto-open artifact panel if no artifact currently shown
    if (!this.showArtifactPanel) {
      // Use robust auto-open that checks ALL messages for new artifacts.
      // When a sub-agent (e.g., Skip) creates an artifact on a different ConversationDetail
      // than the one specified in the event, checking only data.conversationDetailId would miss it.
      await this.autoOpenNewArtifact(artifactIdsBefore, data.conversationId);
    } else if (this.selectedArtifactId) {
      // Panel is already open - check if new artifact is a new version of currently displayed artifact
      const artifactList = this.artifactsByDetailId.get(data.conversationDetailId);
      if (artifactList && artifactList.length > 0) {
        const currentArtifact = artifactList.find(a => a.artifactId === this.selectedArtifactId);
        if (currentArtifact) {
          // New version of the same artifact - refresh to show latest version
          const latestVersion = artifactList[artifactList.length - 1];
          this.artifactViewerRefresh$.next({
            artifactId: latestVersion.artifactId,
            versionNumber: latestVersion.versionNumber
          });
        }
      }
    }

    // Force change detection to update the UI immediately
    this.cdr.detectChanges();
  }

  onCloseArtifactPanel(): void {
    this.showArtifactPanel = false;
    this.selectedArtifactId = null;
    // Clear permissions
    this.canShareSelectedArtifact = false;
    this.canEditSelectedArtifact = false;
    // Reset maximize state and width when closing so the next artifact opens at default size
    this.isArtifactPaneMaximized = false;
    this.artifactPaneWidth = DEFAULT_ARTIFACT_PANE_WIDTH;
    this.cdr.detectChanges();
  }

  toggleMaximizeArtifactPane(): void {
    if (this.isArtifactPaneMaximized) {
      // Restore to previous width
      this.artifactPaneWidth = this.artifactPaneWidthBeforeMaximize;
      this.isArtifactPaneMaximized = false;
    } else {
      // Maximize - store current width and set to 100%
      this.artifactPaneWidthBeforeMaximize = this.artifactPaneWidth;
      this.artifactPaneWidth = 100;
      this.isArtifactPaneMaximized = true;
    }
  }

  onSaveToCollectionRequested(event: {artifactId: string; excludedCollectionIds: string[]}): void {
    this.collectionPickerArtifactId = event.artifactId;
    this.collectionPickerExcludedIds = event.excludedCollectionIds;
    // Snapshot version + name from the viewer so the picker's preview pane has real context
    const viewer = this.artifactViewerComponent;
    this.collectionPickerVersionId = viewer?.artifactVersion?.ID ?? null;
    this.collectionPickerArtifactName = viewer?.displayName ?? '';
    this.collectionPickerVersionNumber = viewer?.selectedVersionNumber ?? null;
    this.showCollectionPicker = true;
  }

  async onCollectionPickerCompleted(event: { successIds: string[]; failedIds: string[] }): Promise<void> {
    // Refresh the viewer's bookmark / "already saved" state if anything actually wrote
    if (event.successIds.length > 0 && this.artifactViewerComponent) {
      await this.artifactViewerComponent.ReloadCollectionAssociations();
    }
    this.closeCollectionPicker();

    if (event.failedIds.length === 0 && event.successIds.length > 0) {
      const n = event.successIds.length;
      MJNotificationService.Instance.CreateSimpleNotification(
        `Saved to ${n} ${n === 1 ? 'collection' : 'collections'}`,
        'success',
        2500
      );
    }
  }

  onCollectionPickerCancelled(): void {
    this.closeCollectionPicker();
  }

  private closeCollectionPicker(): void {
    this.showCollectionPicker = false;
    this.collectionPickerArtifactId = null;
    this.collectionPickerExcludedIds = [];
    this.collectionPickerVersionId = null;
    this.collectionPickerArtifactName = '';
    this.collectionPickerVersionNumber = null;
    this.cdr.detectChanges();
  }

  /**
   * Helper method to check if a conversation detail has an artifact
   * Used by message components to determine whether to show artifact card
   */
  public conversationDetailHasArtifact(conversationDetailId: string): boolean {
    return this.artifactsByDetailId.has(conversationDetailId);
  }

  /**
   * Get artifact info for a conversation detail
   * Returns the LAST (most recent) artifact if multiple exist
   * Returns LazyArtifactInfo - caller can trigger lazy load if full entities needed
   */
  public getArtifactInfo(conversationDetailId: string): LazyArtifactInfo | undefined {
    const artifactList = this.artifactsByDetailId.get(conversationDetailId);
    return artifactList && artifactList.length > 0
      ? artifactList[artifactList.length - 1]
      : undefined;
  }

  /**
   * Get ALL artifacts for a conversation detail
   * Use this when you need to display all artifacts (e.g., in a list)
   * Returns LazyArtifactInfo array - caller can trigger lazy load if full entities needed
   */
  public getAllArtifactsForDetail(conversationDetailId: string): LazyArtifactInfo[] {
    return this.artifactsByDetailId.get(conversationDetailId) || [];
  }

  /**
   * Resize handle methods for artifact pane
   */
  onResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.artifactPaneWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const containerWidth = (event.currentTarget as Window).innerWidth;
    const deltaX = this.startX - event.clientX; // Reversed: drag left = wider artifact pane
    const deltaPercent = (deltaX / containerWidth) * 100;
    let newWidth = this.startWidth + deltaPercent;

    // Constrain between 20% and 70%
    newWidth = Math.max(20, Math.min(70, newWidth));
    this.artifactPaneWidth = newWidth;
  }

  private onResizeEnd(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save to localStorage
      this.saveArtifactPaneWidth();
    }
  }

  /**
   * Touch event handlers for mobile resize support
   */
  onResizeTouchStart(event: TouchEvent): void {
    this.isResizing = true;
    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startWidth = this.artifactPaneWidth;
    event.preventDefault();
  }

  private onResizeTouchMove(event: TouchEvent): void {
    if (!this.isResizing) return;

    const touch = event.touches[0];
    const containerWidth = window.innerWidth;
    const deltaX = this.startX - touch.clientX;
    const deltaPercent = (deltaX / containerWidth) * 100;
    let newWidth = this.startWidth + deltaPercent;

    newWidth = Math.max(20, Math.min(70, newWidth));
    this.artifactPaneWidth = newWidth;
  }

  private onResizeTouchEnd(event: TouchEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.saveArtifactPaneWidth();
    }
  }

  /**
   * LocalStorage persistence methods for artifact pane
   */
  private loadArtifactPaneWidth(): void {
    try {
      const saved = localStorage.getItem(this.ARTIFACT_PANE_WIDTH_KEY);
      if (saved) {
        const width = parseFloat(saved);
        if (!isNaN(width) && width >= 20 && width <= 70) {
          this.artifactPaneWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load artifact pane width from localStorage:', error);
    }
  }

  private saveArtifactPaneWidth(): void {
    try {
      localStorage.setItem(this.ARTIFACT_PANE_WIDTH_KEY, this.artifactPaneWidth.toString());
    } catch (error) {
      console.warn('Failed to save artifact pane width to localStorage:', error);
    }
  }

  onConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    LogStatusEx({message: '🎉 Conversation renamed', verboseOnly: true, additionalArgs: [event]});
    // Pass the event up to workspace component for animation
    this.conversationRenamed.emit(event);
  }

  /**
   * Handle message sent from empty state component
   * Creates a new conversation and emits to parent to update selection
   */
  async onEmptyStateMessageSent(event: {text: string; attachments: PendingAttachment[]}): Promise<void> {
    const { text, attachments } = event;
    if (!text?.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    LogStatusEx({message: '📨 Empty state message received', verboseOnly: true, additionalArgs: [text, `${attachments?.length || 0} attachments`]});

    try {
      this.isProcessing = true;

      // Create a new conversation using the engine. applicationScope +
      // applicationId let embedded surfaces (e.g. the Form Builder cockpit)
      // stamp their conversations as 'Application'-scoped so they don't
      // leak into the main chat list. defaultAgentId pins the routing
      // target for the first message — it's the same value forwarded to
      // <mj-message-input> as [defaultAgentId].
      //
      // Safety net: the DB CHECK constraint rejects ('Application' || 'Both')
      // without an ApplicationID. If the embedder hasn't resolved its app
      // ID yet (or it's missing from the Metadata cache), demote to
      // 'Global' so the save doesn't blow up. The conversation lands in
      // the main list — visible but not silently lost.
      const effectiveScope: 'Global' | 'Application' | 'Both' =
        (this.applicationScope !== 'Global' && !this.applicationId)
          ? 'Global'
          : this.applicationScope;
      // Linked-record stamping — both columns must be populated together
      // or both null (DB CHECK constraint CK_Conversation_LinkBinding).
      // We only forward the pair when BOTH inputs are supplied; if the
      // host bound one but not the other, treat as misconfiguration and
      // skip the linkage rather than failing the save.
      const hasLink = !!this.linkedEntityId && !!this.linkedRecordId;
      const newConversation = await this.engine.CreateConversation(
        'New Conversation', // Temporary name - will be auto-named after first message
        this.environmentId,
        this.currentUser,
        undefined,
        undefined,
        {
          applicationScope: effectiveScope,
          applicationId: effectiveScope === 'Global' ? null : this.applicationId,
          defaultAgentId: this.defaultAgentId,
          linkedEntityId: hasLink ? this.linkedEntityId : null,
          linkedRecordId: hasLink ? this.linkedRecordId : null,
        }
      );

      if (!newConversation) {
        console.error('Failed to create new conversation');
        this.isProcessing = false;
        return;
      }

      LogStatusEx({message: '✅ Created new conversation', verboseOnly: true, additionalArgs: [newConversation.ID]});

      // Pin the auto-send to THIS newly-created conversation, host-independent and immune to
      // conversation-swap timing. The pending message round-trips through the host (which sets
      // [pendingMessage]) and comes back as an @Input; the @for delivers it ONLY to the input
      // whose conversationId matches this target. Without this, a fast swap during the async
      // auto-send window lets the swapped-to conversation's input grab the pending message and
      // send it there instead (the cross-conversation bleed).
      this._pendingMessageTargetId = newConversation.ID;

      // Emit to parent with the new conversation AND the pending message/attachments in a single event
      // This ensures atomic state update - workspace sets all state before Angular change detection
      // creates the new message-input component
      const pendingMessage = text?.trim() || '';
      const pendingAttachments = attachments || [];
      this.conversationCreated.emit({
        conversation: newConversation,
        pendingMessage,
        pendingAttachments
      });

    } catch (error) {
      console.error('Error creating conversation from empty state:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    // Pass the event up to the parent component (workspace or explorer wrapper)
    this.openEntityRecord.emit(event);
  }

  onNavigationRequest(event: NavigationRequest): void {
    // Pass the event up to the parent component for app-level navigation
    this.navigationRequest.emit(event);
  }

  viewTestRun(testRunId: string): void {
    // Open the test run record in the entity viewer
    const compositeKey = new CompositeKey();
    compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: testRunId });
    this.openEntityRecord.emit({
      entityName: 'MJ: Test Runs',
      compositeKey
    });
  }

  /**
   * A gear-gated developer link in the live call overlay asked to open a record
   * (delegated agent run / agent session). The overlay has already minimized itself
   * (the call stays live behind the floating "on call" pill); re-emit on the SAME
   * `openEntityRecord` chain every other chat record-open uses, so the Explorer
   * wrapper routes it through `NavigationService.OpenEntityRecord`.
   */
  onRealtimeNavigateRequest(event: RealtimeNavigateRequest): void {
    const compositeKey = new CompositeKey();
    compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: event.RecordID });
    this.openEntityRecord.emit({
      entityName: event.EntityName,
      compositeKey
    });
  }

  /**
   * Session-START hook for a realtime session that CREATED its own conversation (started
   * without one). Folds that server-created conversation into the engine's reactive cache
   * directly — ONE single-row load, only when it isn't already cached — so the sidebar list
   * emits via `Conversations$` the moment the call starts, independent of the host's refresh
   * round-trip. Also emits {@link realtimeConversationReady} so the host can react (it
   * selects on close). No-op when the session joined an existing conversation. Fire-and-forget
   * on the load: a failed load just leaves the host's emit to fold it in.
   */
  private onRealtimeSessionStarted(): void {
    const created = this.RealtimeSession.SessionCreatedConversationId;
    if (!created) {
      return;
    }
    void this.engine.EnsureConversationLoaded(created, this.currentUser);
    this.realtimeConversationReady.emit({ conversationId: created, select: false });
  }

  /**
   * Post-call hook. Two responsibilities:
   *  1. Reload the ACTIVE conversation's timeline so the session that just ended — whose
   *     session-stamped `MJ: Conversation Details` were persisted server-side during the
   *     call — surfaces as a reviewable past-session block WITHOUT a manual refresh.
   *  2. For a session that CREATED its own conversation, kick the shared auto-naming
   *     helper (covered elsewhere on first utterance; this covers a silent call) and
   *     emit {@link realtimeConversationReady} so the host can refresh the list + select.
   */
  private onRealtimeSessionEnded(): void {
    // (1) Refresh the active conversation's timeline (cheap — single conversation).
    void this.reloadActiveConversationTimeline();

    // (2) New-conversation case: let the host fold + select it.
    const conversationId = this.RealtimeSession.SessionCreatedConversationId;
    if (!conversationId) {
      return;
    }
    // Naming normally fired at the first utterance; this covers a silent call's default.
    this.realtimeConversationReady.emit({ conversationId, select: true });
  }

  /**
   * Surgically reloads the CURRENTLY-OPEN conversation's details so newly-persisted rows
   * (e.g. a just-ended realtime session's session-stamped caption turns) appear in the
   * timeline — and therefore in the "review past sessions" affordances — without a manual
   * browser refresh. Re-queries ONLY the active conversation (no broad reload), mirrors the
   * agent-completion refresh path, and no-ops when no conversation is open.
   */
  private async reloadActiveConversationTimeline(): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) {
      return;
    }
    try {
      await this.engine.RefreshConversationDetails(conversationId, this.currentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }

      // Re-read messages from the surgically updated engine cache
      const freshDetails = this.engine.GetCachedDetails(conversationId);
      if (freshDetails) {
        this.messages = freshDetails;
      }

      // Reprocess peripheral data + realtime session meta (drives the timeline's session cards)
      this.lastLoadedConversationId = null;
      await this.loadPeripheralData(conversationId);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to reload conversation timeline after the session ended:', error);
    }
  }

  /**
   * ENTRY API for SESSION REVIEW: opens the realtime overlay in review mode over this
   * conversation panel, rendering what went down in a PAST agent session (caption turns,
   * delegated-run cards, the saved read-only whiteboard). Intended for conversation
   * timeline affordances that reopen historical realtime sessions.
   *
   * @param agentSessionId The `MJ: AI Agent Sessions.ID` to review.
   * @returns `true` when the session loaded and the review opened; `false` when it
   *   couldn't be loaded (missing/unreadable session) or a live call is already active.
   */
  public async OpenRealtimeSessionReview(agentSessionId: string): Promise<boolean> {
    if (this.RealtimeSession.IsActive) {
      return false; // a live call owns the overlay — don't fight it with a review
    }
    const conversationAtRequest = this._conversationId;
    const review = await this.realtimeReviewService.LoadSessionReview(agentSessionId, this.ProviderToUse);
    if (!review) {
      return false;
    }
    if (this.RealtimeSession.IsActive) {
      return false; // a live call started while the review was loading — it wins
    }
    if (!this.canHostLoadedReview(conversationAtRequest, review.ConversationID)) {
      return false; // the active conversation changed mid-load and the review isn't its own — discard, don't go stale
    }
    this.RealtimeReview = review;
    this.cdr.detectChanges();
    return true;
  }

  /**
   * STALENESS GUARD for the async review load: hosting is allowed when the active
   * conversation hasn't changed since the request started, OR when it HAS changed but
   * the loaded review belongs to the now-active conversation (the deep-link case where
   * the conversation selection and the review open race each other). Anything else is
   * a stale review for a conversation the user already left — never host it.
   */
  private canHostLoadedReview(conversationAtRequest: string | null, reviewConversationId: string | null): boolean {
    const current = this._conversationId;
    if (conversationAtRequest === current) {
      return true;
    }
    return !!reviewConversationId && !!current && UUIDsEqual(reviewConversationId, current);
  }

  /**
   * Drops any hosted SESSION REVIEW so the overlay unhosts itself. Safe to call at any
   * time: a LIVE call's overlay is unaffected (it renders off `RealtimeSession.Active$`).
   * Called on every conversation change, on the overlay's Close, and available to hosts
   * that need to programmatically dismiss a review.
   */
  public ClearRealtimeSessionReview(): void {
    if (this.RealtimeReview) {
      this.RealtimeReview = null;
    }
  }

  /**
   * Review mode's "Start live session": RESUMES the reviewed session as a new live call
   * through the SAME start path the composer's mic uses, chaining `lastSessionId` so the
   * server restores saved channel states (e.g. the whiteboard) via `PriorChannelStatesJson`.
   * The start flips `Active$` synchronously, so clearing the review immediately after
   * never unhosts the overlay mid-transition.
   */
  public async onReviewStartLive(request: RealtimeStartLiveRequest): Promise<void> {
    const agentName = this.RealtimeReview?.AgentName ?? null;
    try {
      const start = this.RealtimeSession.StartRealtimeSession(
        request.TargetAgentId,
        request.ConversationId ?? this.conversationId,
        request.LastSessionId,
        agentName,
        null, // preferredModelId
        null, // clientTools
        null, // coAgentId
        null, // configOverridesJson
        null, // recordingConsent
        null, // mediaCollectionId
        // App awareness — see message-input.startVoiceSession for the rationale.
        this.applicationId,
        this.appContext as AppContextSnapshot | null
      );
      this.RealtimeReview = null;
      await start;
    } catch (error) {
      console.error('Failed to resume the reviewed session as a live call:', error);
      MJNotificationService.Instance.CreateSimpleNotification('Could not start the live session.', 'error', 3000);
    }
  }

  /** Review mode's Close: drop the review state (the overlay unhosts itself). */
  public onReviewClosed(): void {
    this.ClearRealtimeSessionReview();
  }

  /**
   * Handles Shift+Click on an AI message bubble.
   * Dumps a live snapshot of in-memory streaming and agent-run state to the browser
   * console so engineers can debug stuck/forever-spinning conversations without
   * needing to add any temporary code.
   *
   * Usage: Hold Shift and click any AI message bubble. Open DevTools Console to see the dump.
   */
  onDiagnosticRequested(messageId: string): void {
    const streaming = this.streamingService.getDiagnosticSnapshot(messageId);
    const agentRun = this.agentRunsByDetailId.get(messageId);
    const isInProgress = this.inProgressMessageIds.includes(messageId);

    console.group(`%c[MJ Diagnostic Dump] Message ${messageId}`, 'color: #0076b6; font-weight: bold');
    console.log('Timestamp:', new Date().toISOString());
    console.log('ConversationID:', this.conversationId);
    console.log('isInProgress (UI):', isInProgress);
    console.log('All inProgressMessageIds:', [...this.inProgressMessageIds]);
    console.log('Streaming connection:', streaming.connectionStatus);
    console.log('Streaming callbacks registered:', streaming.callbackCount);
    if (streaming.recentCompletion) {
      console.log('Recent completion (not yet processed):', streaming.recentCompletion);
    }
    if (agentRun) {
      console.log('Agent run:', { id: agentRun.ID, status: agentRun.Status, name: agentRun.Agent });
    } else {
      console.log('Agent run: none loaded for this message');
    }
    console.groupEnd();
  }

  onTestFeedbackMessage(message: MJConversationDetailEntity): void {
    if (!message.TestRunID) {
      console.error('Cannot provide test feedback: message has no TestRunID');
      return;
    }

    this.testFeedbackDialogData = {
      testRunId: message.TestRunID,
      conversationDetailId: message.ID,
      currentUser: this.currentUser
    };
    this.showTestFeedbackDialog = true;
  }

  onTestFeedbackDialogClosed(result: TestFeedbackDialogResult): void {
    this.showTestFeedbackDialog = false;
    this.testFeedbackDialogData = null;
    if (result.success) {
      console.log('Test feedback saved successfully:', result.feedbackId);
    }
  }

  onTaskClicked(task: MJTaskEntity): void {
    // Pass task click up to workspace to navigate to Tasks tab
    this.taskClicked.emit(task);
  }

  onNavigateToConversation(event: {conversationId: string; taskId: string}): void {
    // Navigate to the conversation with the active task - emit to parent
    // Parent will update its selection state
    // For now, we can't navigate to a different conversation from within chat area
    // This would require emitting an event to the parent
    console.log('Navigate to conversation requested:', event.conversationId);
  }

  /**
   * Handle navigation request from artifact viewer Links tab
   */
  onArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string}): void {
    LogStatusEx({message: '🔗 Chat area: Artifact link clicked', verboseOnly: true, additionalArgs: [event]});
    this.artifactLinkClicked.emit(event);
  }

  /**
   * Load permissions for the given artifact
   */
  private async loadArtifactPermissions(artifactId: string, expectedConversationId?: string | null, expectedSelectedArtifactId?: string | null): Promise<boolean> {
    const canApply = () => {
      const conversationOk = expectedConversationId === undefined || this.isActiveConversation(expectedConversationId);
      const artifactOk = !expectedSelectedArtifactId || UUIDsEqual(this.selectedArtifactId, expectedSelectedArtifactId);
      return conversationOk && artifactOk;
    };

    // Guard against null/undefined
    if (!artifactId) {
      if (canApply()) {
        this.canShareSelectedArtifact = false;
        this.canEditSelectedArtifact = false;
      }
      return false;
    }

    try {
      const permissions = await this.artifactPermissionService.getUserPermissions(artifactId, this.currentUser);
      if (!canApply()) {
        return false;
      }
      this.canShareSelectedArtifact = permissions.canShare;
      this.canEditSelectedArtifact = permissions.canEdit;
      return true;
    } catch (error) {
      console.error('Failed to load artifact permissions:', error);
      if (canApply()) {
        this.canShareSelectedArtifact = false;
        this.canEditSelectedArtifact = false;
      }
      return false;
    }
  }

  /**
   * Handle share request from artifact viewer
   */
  async onArtifactShareRequested(artifactId: string): Promise<void> {
    // Load the artifact entity to pass to the modal
    const md = this.ProviderToUse;
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts');
    await artifact.Load(artifactId);

    if (artifact) {
      this.artifactToShare = artifact;
      this.isArtifactShareModalOpen = true;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle Analyze button click from the artifact viewer panel.
   * Creates a user message with the artifact attached as an input,
   * then routes through the normal agent flow so the agent can
   * explore the artifact via artifact tools.
   */
  /**
   * Handle Analyze button click from the artifact viewer panel.
   *
   * Persists the captured snapshot as a new Data Snapshot artifact and attaches
   * it to the user's in-progress message as a pending attachment chip (same UX
   * as image/file uploads). On send, the existing attachment pipeline creates
   * a `ConversationDetailArtifact` with Direction='Input'; AgentRunner then
   * picks it up via `gatherConversationArtifacts` and resolves the
   * DataSnapshotToolLibrary for tool calls.
   *
   * Falls back to plain message prefill if snapshot persistence fails — the
   * user can still ask questions about the artifact that's already attached
   * to the prior conversation turn.
   */
  async OnAnalyzeArtifact(event: { artifactId: string; snapshot: DataSnapshot }): Promise<PendingAttachment | null> {
    const conversationId = this.conversationId;
    if (!conversationId || !this.currentUser) return null;

    const messageInput = this.getActiveMessageInputComponent();
    const snapshotTitle = event.snapshot.title || 'Untitled Snapshot';

    try {
      const result = await this.analyzeArtifactService.CreateSnapshotArtifact({
        snapshot: event.snapshot,
        currentUser: this.currentUser,
        environmentId: this.environmentId,
      });
      if (!this.isActiveConversation(conversationId)) {
        return null;
      }

      if (messageInput) {
        const rowCount = (event.snapshot.tables ?? []).reduce(
          (sum, t) => sum + (t.rows?.length ?? 0),
          0,
        );
        const serialized = JSON.stringify(event.snapshot);
        const created = messageInput.inputBox?.mentionEditor?.AddArtifactAttachment({
          fileID: '',
          fileName: rowCount > 0
            ? `📸 ${result.title} · ${rowCount.toLocaleString()} rows`
            : `📸 ${result.title}`,
          mimeType: 'application/json',
          sizeBytes: serialized.length,
          artifactVersionId: result.artifactVersionId,
        });
        messageInput.messageText = `Analyze "${result.title}" — `;
        messageInput.inputBox?.focus();
        return created ?? null;
      }
    } catch (error) {
      LogStatusEx({
        message: `[OnAnalyzeArtifact] CreateSnapshotArtifact failed: ${error instanceof Error ? error.message : String(error)}`,
        verboseOnly: false,
      });
      if (!this.isActiveConversation(conversationId)) {
        return null;
      }
      if (messageInput) {
        messageInput.messageText = `Analyze "${snapshotTitle}" — `;
        messageInput.inputBox?.focus();
      }
    }
    return null;
  }

  /**
   * Handle a `client:capture-data-snapshot` actionable command emitted by an
   * analysis-class agent that needs the user's current view of an artifact to
   * answer accurately but has no Data Snapshot artifact attached.
   *
   * Flow:
   *  1. Resolve the target artifact — `command.artifactId` if provided,
   *     otherwise the most-recent output artifact on the conversation.
   *  2. Open the artifact viewer panel for it (mounts the viewer plugin if not
   *     already mounted).
   *  3. Poll until the viewer can produce a snapshot via
   *     `GetCurrentStateSnapshot()`, with a short timeout.
   *  4. Reuse the existing `OnAnalyzeArtifact` flow to persist the snapshot
   *     as a Data Snapshot artifact + attach it as a chip on the message input.
   *  5. If `command.followupMessage` is provided, replace the prefill and
   *     auto-send so the agent immediately re-runs with the snapshot attached.
   *     Otherwise, leave the chip + prefill in place for the user to send manually.
   *
   * Soft-fails — logs a warning and stops on any unrecoverable error rather
   * than throwing. The user's conversation state isn't disrupted.
   */
  private async handleCaptureDataSnapshotCommand(command: CaptureDataSnapshotCommand): Promise<void> {
    const conversationId = this.conversationId;
    console.log('[client:capture-data-snapshot] Handler invoked', { command, conversationId });
    if (!conversationId || !this.currentUser) {
      console.warn('[client:capture-data-snapshot] No active conversation/user; ignoring');
      return;
    }

    let artifactId = command.artifactId;
    if (!artifactId) {
      artifactId = (await this.findMostRecentComponentArtifactId()) ?? undefined;
      if (!this.isActiveConversation(conversationId)) {
        return;
      }
      console.log('[client:capture-data-snapshot] Resolved artifactId via lookup:', artifactId);
    } else {
      console.log('[client:capture-data-snapshot] Using artifactId from command:', artifactId);
    }
    if (!artifactId) {
      console.warn('[client:capture-data-snapshot] No artifact found on this conversation; cannot capture');
      return;
    }

    const panelAlreadyOpen = this.selectedArtifactId === artifactId && this.showArtifactPanel;
    console.log(
      '[client:capture-data-snapshot] Panel state — currentSelectedId=' +
        this.selectedArtifactId +
        ' showPanel=' +
        this.showArtifactPanel +
        ' panelAlreadyOpen=' +
        panelAlreadyOpen,
    );

    // Open the artifact panel so the viewer mounts (if it isn't already).
    if (!panelAlreadyOpen) {
      this.selectedArtifactId = artifactId;
      this.selectedVersionNumber = undefined;
      this.showArtifactPanel = true;
      try {
        await this.loadArtifactPermissions(artifactId, conversationId, artifactId);
      } catch {
        // Non-fatal — permissions are for UI affordances, not capture
      }
      if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.selectedArtifactId, artifactId)) {
        return;
      }
      this.cdr.detectChanges();
      console.log('[client:capture-data-snapshot] Opened artifact panel; waiting for viewer mount + data load');
    }

    // Poll for the snapshot — interactive components need a few render cycles
    // before `getCurrentDataState()` registers via callbacks.RegisterMethod,
    // and query-backed / server-paged components need additional time to load
    // their rows (we now wait for rows, not just a registered table).
    const snapshot = await this.waitForViewerSnapshot(15000);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.selectedArtifactId, artifactId)) {
      return;
    }
    if (!snapshot) {
      console.warn('[client:capture-data-snapshot] Artifact viewer did not produce a snapshot within timeout');
      return;
    }

    // Persist + attach via the existing Analyze flow. Capture the created
    // PendingAttachment so we can pass it directly into sendMessageWithText
    // below — the mention-editor → message-input-box → message-input event
    // chain that normally syncs `pendingAttachments` is async (next-tick) and
    // hasn't propagated by the time we auto-send.
    const capturedAttachment = await this.OnAnalyzeArtifact({ artifactId, snapshot });
    if (!this.isActiveConversation(conversationId)) {
      return;
    }

    // Auto-send the followup so the agent re-runs immediately with the
    // captured snapshot now attached. Resolution order:
    //   1. command.followupMessage   — if the agent provided one
    //   2. most-recent User message  — re-sends the question that triggered
    //      this capture exchange (typical: "Looking at this dashboard, …")
    //      so the agent sees the same question with the artifact attached
    //   3. a generic re-prompt        — last resort if no user message found
    // OnAnalyzeArtifact prefilled messageText with 'Analyze "..." — '; we
    // overwrite that with the resolved followup before sending.
    const messageInput = this.getActiveMessageInputComponent();
    if (messageInput) {
      let followup = command.followupMessage?.trim();
      if (!followup) {
        const lastUserMsg = [...this.messages]
          .reverse()
          .find((m) => m.Role === 'User' && m.Message && m.Message.trim().length > 0);
        followup = lastUserMsg?.Message?.trim();
      }
      if (!followup) {
        followup = 'Please answer my previous question using the captured snapshot.';
      }
      messageInput.messageText = '';
      try {
        await messageInput.sendMessageWithText(
          followup,
          capturedAttachment ? [capturedAttachment] : undefined,
        );
      } catch (error) {
        console.error('[client:capture-data-snapshot] Auto-send failed:', error);
      }
    }
  }

  /**
   * Poll `artifactViewerComponent.GetCurrentStateSnapshot()` for the LIVE
   * data snapshot. The React component inside the viewer plugin needs several
   * render cycles after `selectedArtifactId` changes before its inner data
   * fetches run and its `getCurrentDataState()` becomes callable via
   * `callbacks.RegisterMethod('getCurrentDataState', ...)`.
   *
   * `GetCurrentStateSnapshot()` returns three distinct shapes:
   *   - **Live**: a populated DataSnapshot with `tables[]` whose rows are filled.
   *   - **Fallback**: an empty placeholder with only `title` + `interpretation`
   *     ("No live data was captured — the component either has no data-fetching
   *     hooks or has not yet run its queries"). This fires when the React
   *     component hasn't yet registered `getCurrentDataState()`.
   *   - **Schema-only**: a structured snapshot with real `tables`/`columns` and
   *     metadata (e.g. `totalAvailableRowCount`) but `rows: []`. This is common
   *     for query-backed / server-paged components whose data load hasn't
   *     completed (or whose visible page is empty) at the moment of capture.
   *
   * We must accept ONLY a snapshot that actually carries rows — a schema-only
   * or placeholder snapshot defeats the point of the pipeline (the analysis
   * agent receives an empty table). So we key "live" on `rows.length`, not just
   * `tables.length`, and keep polling so async/paged data has time to load.
   * Only after timeout do we return the last available row-less snapshot (any
   * structure is better than nothing, but the user will see an empty table in
   * the resulting artifact).
   */
  private async waitForViewerSnapshot(timeoutMs: number): Promise<DataSnapshot | null> {
    const intervalMs = 200;
    const deadline = Date.now() + timeoutMs;
    let lastFallback: DataSnapshot | null = null;
    let tick = 0;
    const startTime = Date.now();
    console.log('[client:capture-data-snapshot] Polling for live snapshot, timeout=' + timeoutMs + 'ms');
    while (Date.now() < deadline) {
      tick++;
      const viewer = this.artifactViewerComponent;
      const snap = viewer?.GetCurrentStateSnapshot?.();
      if (snap) {
        const hasLiveData = Array.isArray(snap.tables) && snap.tables.some((t) => Array.isArray(t.rows) && t.rows.length > 0);
        const tableShape = Array.isArray(snap.tables)
          ? snap.tables.map((t) => `${t.name}:${(t.rows ?? []).length}rows`).join(', ')
          : 'no-tables';
        const elapsed = Date.now() - startTime;
        // Log every 5th tick to avoid spamming
        if (tick % 5 === 1 || hasLiveData) {
          console.log(
            `[client:capture-data-snapshot] tick=${tick} elapsed=${elapsed}ms viewer=${!!viewer} ` +
              `snap=${!!snap} hasLiveData=${hasLiveData} shape=[${tableShape}] ` +
              `keys=[${Object.keys(snap).join(',')}]`,
          );
        }
        if (hasLiveData) {
          return snap; // real snapshot — done
        }
        lastFallback = snap; // remember for timeout case
      } else if (tick % 5 === 1) {
        console.log(
          `[client:capture-data-snapshot] tick=${tick} viewer=${!!viewer} snap=null (viewer hasn't returned a snapshot yet)`,
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    if (lastFallback) {
      console.warn(
        '[client:capture-data-snapshot] Timed out waiting for live data after ' +
          timeoutMs +
          'ms; falling back to placeholder snapshot. The component may not have registered ' +
          'getCurrentDataState() via callbacks.RegisterMethod, OR its data has not finished loading.',
      );
    } else {
      console.warn(
        '[client:capture-data-snapshot] Timed out after ' +
          timeoutMs +
          'ms — viewer never returned even a fallback snapshot. Artifact viewer may not have mounted.',
      );
    }
    return lastFallback;
  }

  /**
   * Find the most-recent Component artifact attached as `Output` to this
   * conversation. Used when a `client:capture-data-snapshot` command arrives
   * without an explicit `artifactId`.
   *
   * Filtering to Component-typed artifacts is intentional even though the
   * command type itself is artifact-generic: the downstream
   * `waitForViewerSnapshot` polling waits for `tables[]` to populate (the
   * shape Components produce via React `getCurrentDataState()`). Falling back
   * to a non-Component artifact would 10s-timeout to a placeholder snapshot.
   * When other artifact types need a usable fallback, generalize the polling
   * first, then drop the filter here.
   */
  private async findMostRecentComponentArtifactId(): Promise<string | null> {
    if (!this.conversationId || !this.currentUser) return null;
    try {
      const rv = new RunView();
      // Get all conversation detail IDs for this conversation, newest first.
      const detailsResult = await rv.RunView<MJConversationDetailEntity>(
        {
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ConversationID='${this.conversationId}'`,
          Fields: ['ID'],
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'simple',
        },
        this.currentUser,
      );
      if (!detailsResult.Success || !detailsResult.Results?.length) return null;
      const detailIds = detailsResult.Results.map((d) => `'${d.ID}'`).join(',');

      // Find the most recent Output artifact junction across those details.
      const junctionResult = await rv.RunView(
        {
          EntityName: 'MJ: Conversation Detail Artifacts',
          ExtraFilter: `ConversationDetailID IN (${detailIds}) AND Direction='Output'`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'simple',
        },
        this.currentUser,
      );
      if (!junctionResult.Success || !junctionResult.Results?.length) return null;

      // Look up artifact IDs for each version and filter to Component type.
      const versionIds = Array.from(
        new Set((junctionResult.Results as Array<{ ArtifactVersionID: string }>).map((j) => j.ArtifactVersionID)),
      );
      if (versionIds.length === 0) return null;
      const versionFilter = versionIds.map((id) => `'${id}'`).join(',');
      const versionsResult = await rv.RunView(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ID IN (${versionFilter})`,
          Fields: ['ID', 'ArtifactID'],
          ResultType: 'simple',
        },
        this.currentUser,
      );
      if (!versionsResult.Success || !versionsResult.Results?.length) return null;

      const versionToArtifact = new Map<string, string>();
      for (const v of versionsResult.Results as Array<{ ID: string; ArtifactID: string }>) {
        versionToArtifact.set(v.ID, v.ArtifactID);
      }

      const artifactIds = Array.from(new Set([...versionToArtifact.values()]));
      const artifactFilter = artifactIds.map((id) => `'${id}'`).join(',');
      const artifactsResult = await rv.RunView<MJArtifactEntity>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `ID IN (${artifactFilter})`,
          ResultType: 'simple',
        },
        this.currentUser,
      );
      if (!artifactsResult.Success || !artifactsResult.Results?.length) return null;

      // Resolve the Component type ID from the metadata engine to filter to it.
      const componentType = ArtifactMetadataEngine.Instance.FindArtifactType('Component');
      if (!componentType) return null;

      const componentArtifactIds = new Set(
        (artifactsResult.Results as Array<{ ID: string; TypeID: string | null }>)
          .filter((a) => UUIDsEqual(a.TypeID, componentType.ID))
          .map((a) => a.ID),
      );
      if (componentArtifactIds.size === 0) return null;

      // Walk junctions in newest-first order; return the first whose artifact is Component.
      for (const junction of junctionResult.Results as Array<{ ArtifactVersionID: string }>) {
        const artifactId = versionToArtifact.get(junction.ArtifactVersionID);
        if (artifactId && componentArtifactIds.has(artifactId)) {
          return artifactId;
        }
      }
      return null;
    } catch (error) {
      console.error('[client:capture-data-snapshot] findMostRecentComponentArtifactId failed:', error);
      return null;
    }
  }

  /**
   * Handle close of artifact share modal
   */
  onArtifactShareModalClose(): void {
    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;
    this.cdr.detectChanges();
  }

  /**
   * Handle successful share - refresh permissions
   */
  async onArtifactShared(): Promise<void> {
    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;

    // Refresh permissions for the active artifact
    if (this.selectedArtifactId) {
      await this.loadArtifactPermissions(this.selectedArtifactId);
    }
    this.cdr.detectChanges();
  }

  // Scroll functionality (pattern from skip-chat)
  checkScroll(): void {
    if (!this.scrollContainer) return;

    const element = this.scrollContainer.nativeElement;
    const buffer = 15; // Tolerance in pixels
    const scrollDifference = element.scrollHeight - (element.scrollTop + element.clientHeight);
    const hasScrollableContent = element.scrollHeight > element.clientHeight + 50;
    const atBottom = scrollDifference <= buffer;

    const newValue = !atBottom && hasScrollableContent;

    // Only update if value changed to prevent unnecessary change detection
    if (this.showScrollToBottomIcon !== newValue) {
      this.showScrollToBottomIcon = newValue;
      this.cdr.detectChanges();
    }
  }

  scrollToBottomNow(retryCount: number = 0): void {
    try {
      if (!this.scrollContainer) {
        if (retryCount < 10) {
          setTimeout(() => this.scrollToBottomNow(retryCount + 1), 50);
        }
        return;
      }

      const element = this.scrollContainer.nativeElement;
      if (element.scrollHeight === 0 && retryCount < 10) {
        setTimeout(() => this.scrollToBottomNow(retryCount + 1), 50);
      } else if (element.scrollHeight > 0) {
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  scrollToBottomAnimate(): void {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scroll({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }

  /**
   * Detect and reconcile agent run states against conversation detail statuses.
   * Called after loading a conversation to handle two scenarios:
   *
   * 1. **In-progress catch-up**: If an agent completed between page refresh and
   *    WebSocket reconnection, the completion PubSub event is lost. We catch this
   *    by comparing message status against the agent run status from the database.
   *
   * 2. **Stale error correction**: If the client previously marked a conversation
   *    detail as 'Error' (e.g., due to WebSocket timeout) but the server actually
   *    completed successfully, we detect the mismatch and correct it. This prevents
   *    the race condition where the client overwrites a server-completed record.
   */
  private async detectAndReconcileAgentRuns(conversationId: string, loadToken: number): Promise<void> {
    if (!this.isActiveConversationLoad(conversationId, loadToken)) {
      return;
    }
    await this.reconnectInProgressRuns(conversationId, loadToken);
    if (!this.isActiveConversationLoad(conversationId, loadToken)) {
      return;
    }
    await this.correctStaleErrorMessages(conversationId, loadToken);
  }

  /**
   * Reconnect to in-progress agent runs whose completion events were missed.
   */
  private async reconnectInProgressRuns(conversationId: string, loadToken: number): Promise<void> {
    const inProgressMessages = this.messages.filter(
      m => m.Status === 'In-Progress' && m.Role === 'AI'
    );

    if (inProgressMessages.length === 0) {
      return;
    }

    LogStatusEx({message: `🔄 Found ${inProgressMessages.length} in-progress messages, checking status...`, verboseOnly: true});

    const completedStatuses = ['Completed', 'Failed', 'Error', 'Cancelled'];

    for (const message of inProgressMessages) {
      const agentRun = this.agentRunsByDetailId.get(message.ID);

      if (!agentRun) {
        // No agent run yet — fire-and-forget may not have created it.
        // Polling will pick this up once the server creates the run.
        LogStatusEx({message: `⏳ No agent run found for in-progress message ${message.ID}, waiting for server...`, verboseOnly: true});
        continue;
      }

      if (completedStatuses.includes(agentRun.Status)) {
        // Agent completed during the WebSocket reconnection gap — handle now
        LogStatusEx({message: `🔄 Agent run ${agentRun.ID} already completed (${agentRun.Status}) for message ${message.ID}, handling catch-up...`, verboseOnly: true});
        await this.handleMessageCompletion(message, agentRun.ID, conversationId, loadToken);
      } else {
        LogStatusEx({message: `🔌 Agent run ${agentRun.ID} still ${agentRun.Status} for message ${message.ID}, WebSocket will receive updates`, verboseOnly: true});
      }
    }
  }

  /**
   * Detect conversation details marked as 'Error' by the client whose corresponding
   * agent run actually completed successfully on the server. This corrects the race
   * condition where the client overwrote a server-completed record with an error status.
   */
  private async correctStaleErrorMessages(conversationId: string, loadToken: number): Promise<void> {
    const errorMessages = this.messages.filter(
      m => m.Status === 'Error' && m.Role === 'AI'
    );

    if (errorMessages.length === 0) {
      return;
    }

    for (const message of errorMessages) {
      const agentRun = this.agentRunsByDetailId.get(message.ID);
      if (agentRun && agentRun.Status === 'Completed') {
        LogStatusEx({message: `🔧 Correcting stale error: message ${message.ID} shows Error but agent run ${agentRun.ID} completed successfully`, verboseOnly: true});
        await this.handleMessageCompletion(message, agentRun.ID, conversationId, loadToken);
      }
    }
  }

  /**
   * Handle pending artifact navigation from collection
   * Opens the artifact and scrolls to the message containing it
   */
  private async handlePendingArtifactNavigation(): Promise<void> {
    if (!this.pendingArtifactId) {
      return; // No pending navigation
    }
    const pendingTargetConversationId = this.pendingArtifactConversationId ?? this.conversationId;
    if (!this.pendingArtifactId || !this.isActiveConversation(pendingTargetConversationId)) {
      return;
    }

    console.log('📦 Processing pending artifact navigation:', this.pendingArtifactId, 'v' + this.pendingArtifactVersionNumber);

    // Capture values before emitting consumed event
    const artifactIdToOpen = this.pendingArtifactId;
    const versionNumberToOpen = this.pendingArtifactVersionNumber;
    const conversationId = this.conversationId;

    // Notify parent that we consumed the pending artifact
    this.pendingArtifactConsumed.emit();

    // Find the message containing this artifact version
    let messageIdWithArtifact: string | null = null;

    for (const [detailId, artifactList] of this.artifactsByDetailId.entries()) {
      for (const artifactInfo of artifactList) {
        if (artifactInfo.artifactId === artifactIdToOpen) {
          // Found the artifact - check if version matches (if specified)
          if (versionNumberToOpen == null || artifactInfo.versionNumber === versionNumberToOpen) {
            messageIdWithArtifact = detailId;
            console.log('✅ Found artifact in message:', detailId);
            break;
          }
        }
      }
      if (messageIdWithArtifact) break;
    }

    if (!messageIdWithArtifact) {
      console.warn('⚠️ Could not find message containing artifact:', artifactIdToOpen);
      return;
    }

    // Open the artifact panel
    this.selectedArtifactId = artifactIdToOpen;
    this.selectedVersionNumber = versionNumberToOpen ?? undefined;
    this.showArtifactPanel = true;

    // Load permissions for the artifact
    await this.loadArtifactPermissions(artifactIdToOpen, conversationId, artifactIdToOpen);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.selectedArtifactId, artifactIdToOpen)) {
      return;
    }
    this.cdr.detectChanges();

    // Scroll to the message
    this.scrollToMessage(messageIdWithArtifact);

    console.log('✅ Opened artifact and scrolled to message:', messageIdWithArtifact);
  }

  /**
   * Scroll to a specific message in the conversation
   * @param messageId The conversation detail ID to scroll to
   */
  private scrollToMessage(messageId: string): void {
    // Wait for DOM to update, then scroll
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('📍 Scrolled to message:', messageId);
      } else {
        console.warn('⚠️ Message element not found for ID:', messageId);
      }
    }, 300); // Give time for artifact panel to open and DOM to render
  }

  /**
   * Handle intent check started - show temporary "Analyzing intent..." message
   */
  async onIntentCheckStarted(event: {conversationId: string}): Promise<void> {
    // Guard: ignore intent-check UI from a background conversation's input after a swap,
    // so the "Analyzing..." placeholder isn't injected into the displayed conversation.
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    const md = this.ProviderToUse;
    const tempMessage = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);

    // Create a temporary message that looks like an AI response in-progress
    tempMessage.Message = '🔍 Analyzing your request to determine the best agent...';
    tempMessage.Role = 'AI';
    tempMessage.Status = 'In-Progress';
    // Set created date using LoadFromData to bypass read-only protection
    tempMessage.LoadFromData({
      Message: tempMessage.Message,
      Role: tempMessage.Role,
      Status: tempMessage.Status,
      __mj_CreatedAt: new Date()
    });
    // No ID means it's temporary (won't be saved)

    this.intentCheckMessage = tempMessage;
    this.messages = [...this.messages, tempMessage];
    this.scrollToBottom = true;
    this.cdr.detectChanges();
  }

  /**
   * Handle intent check completed - remove temporary message
   */
  onIntentCheckCompleted(event: {conversationId: string}): void {
    // Guard (symmetric with onIntentCheckStarted): ignore a background conversation's
    // intent-check completion after a swap. Without this, a late completion from the
    // conversation the user just left would remove the ACTIVE conversation's own
    // "Analyzing..." placeholder (intentCheckMessage is a single shared field).
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    if (this.intentCheckMessage) {
      // Remove the temporary intent check message
      this.messages = this.messages.filter(m => m !== this.intentCheckMessage);
      this.intentCheckMessage = null;
      this.cdr.detectChanges();
    }
  }
}
