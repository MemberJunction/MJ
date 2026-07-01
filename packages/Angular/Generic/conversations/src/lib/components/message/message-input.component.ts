import { Component, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, Metadata } from '@memberjunction/core';
import { MJConversationDetailEntity, MJEnvironmentEntityExtended, ConversationEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, AppContextSnapshot } from "@memberjunction/ai-core-plus";
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { BeforeAgentTurnEventArgs, AfterAgentTurnEventArgs } from '../../events/chat-events';
import { DataCacheService } from '../../services/data-cache.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { ConversationStreamingService, MessageProgressUpdate, MessageProgressMetadata } from '../../services/conversation-streaming.service';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { GenerateAndApplyConversationName } from '../../services/conversation-naming';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ExecuteAgentResult, AgentExecutionProgressCallback, AgentResponseForm, ActionableCommand, AutomaticCommand, ConversationUtility } from '@memberjunction/ai-core-plus';
import { MentionAutocompleteService, MentionSuggestion } from '../../services/mention-autocomplete.service';
import { MentionParserService } from '../../services/mention-parser.service';
import { ConversationAttachmentService } from '../../services/conversation-attachment.service';
import { Mention, MentionParseResult } from '../../models/conversation-state.model';
import { PendingAttachment } from '../mention/mention-editor.component';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationBridgeService } from '../../services/conversation-bridge.service';
import { RealtimeSessionService } from '../../services/realtime-session.service';
import { RealtimeAgentPick } from '../realtime/realtime-agent-picker.component';
import {
  BuildRealtimeConfigOverridesJson,
  FilterRealtimeCoAgents,
  LoadCoAgentPairings,
  PairingsAllowTarget
} from '../../services/realtime-pairing';
import { Subscription } from 'rxjs';
import { MessageInputBoxComponent } from './message-input-box.component';
import { UUIDsEqual, CleanAndParseJSON } from '@memberjunction/global';

@Component({
  standalone: false,
  selector: 'mj-message-input',
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.scss'
})
export class MessageInputComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit  {
  // Default artifact type ID for JSON (when agent doesn't specify DefaultArtifactTypeID)
  private readonly JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';

  @Input() conversationId!: string;
  @Input() conversationName?: string | null; // For task tracking display
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() placeholder: string = 'Type a message... (Ctrl+Enter to send)';
  @Input() parentMessageId?: string; // Optional: for replying in threads
  @Input() enableAttachments: boolean = true; // Whether to show attachment button (based on agent modality support)
  @Input() enableMentions: boolean = true; // Whether to enable @-mention autocomplete (agents/users). Hosts addressing a single fixed agent (e.g. Form Builder cockpit) typically set false.
  @Input() maxAttachments: number = 10; // Maximum number of attachments per message
  @Input() maxAttachmentSizeBytes: number = 20 * 1024 * 1024; // Maximum size per attachment (20MB default)
  @Input() acceptedFileTypes: string = 'image/*'; // Accepted MIME types pattern
  @Input() artifactsByDetailId?: Map<string, LazyArtifactInfo[]>; // Pre-loaded artifact data for performance
  @Input() systemArtifactsByDetailId?: Map<string, LazyArtifactInfo[]>; // Pre-loaded system artifact data (Visibility='System Only')
  @Input() agentRunsByDetailId?: Map<string, MJAIAgentRunEntityExtended>; // Pre-loaded agent run data for performance
  @Input() emptyStateMode: boolean = false; // When true, emits emptyStateSubmit instead of creating messages directly
  @Input() appContext: Record<string, unknown> | null = null; // Application context for AI agent awareness

  /**
   * Plan Mode pill state — sticky per-composer toggle, OFF by default (no behavior change unless
   * the user turns it on). When on, the user's next message(s) request Plan Mode: the routed root
   * agent must present a plan for approval before executing Actions/Sub-Agents. The toggle is
   * always shown and the server enforces the `AIAgent.SupportsPlanMode` capability — a plan-mode
   * request to an agent that doesn't support it simply no-ops the gate (see resolvePlanModeGate),
   * so we don't need to resolve "the current agent" client-side just to hide the pill.
   */
  public PlanModeEnabled = false;

  /**
   * Skill IDs the user requested via `/skill-name` mentions in the message being routed. Collected
   * once per send from the composer's mention chips and forwarded to every agent-invocation path so
   * whichever agent handles the message receives them as `RequestedSkillIDs`. The server intersects
   * them with the agent's accepted skills AND the user's Run permission before any activate, so a
   * skill the user can't run (or the agent doesn't accept) is silently dropped. Reset each send.
   */
  private _pendingRequestedSkillIDs: string[] = [];

  /**
   * Collects the skill IDs from `/skill` mention chips currently in the composer. Called at the
   * start of routing so the value is stable for the whole message dispatch.
   */
  private collectRequestedSkillIDs(): string[] {
    const chipData = this.inputBox?.getMentionChipsData() || [];
    return chipData.filter(chip => chip.type === 'skill').map(chip => chip.id);
  }

  /**
   * Optional default agent ID for the conversation. When set, the FIRST
   * message routes directly to this agent — skipping Sage's default
   * delegation — provided the user did not @mention a different agent
   * and there is no prior agent in the conversation history. After the
   * first message, the existing "last non-Sage agent" continuity rule
   * keeps subsequent messages on the same agent.
   *
   * Used by embedded chat surfaces (Form Builder cockpit, future
   * domain-specific chats) that have an obvious specialist agent for the
   * context and don't need Sage to route. Leave unset to preserve the
   * standard Sage-fronted UX of the main Chat app.
   */
  @Input() defaultAgentId: string | null = null;

  /**
   * Per-conversation pinned default agent — sourced from the loaded
   * `MJConversationEntity.DefaultAgentID`. When set, this agent is used in
   * preference to the embedder-supplied {@link defaultAgentId} so a user
   * who pins a conversation to e.g. Research Agent gets that routing even
   * inside an embedded surface whose embedder defaults to a different
   * specialist. Routing precedence:
   *   1. @mention
   *   2. continuity (last responder)
   *   3. **conversationDefaultAgentId** (this input — user's per-conversation pin)
   *   4. defaultAgentId (embedder-supplied)
   *   5. Sage fallback
   */
  @Input() conversationDefaultAgentId: string | null = null;

  /**
   * The `MJ: AI Agent Configurations.ID` selected via the chat header's
   * mode picker (Draft / Standard / High). Applied to **non-mention**
   * routes — when the user types without `@mention`, this preset rides
   * along on the next `invokeSubAgent` call so the server resolves the
   * agent's Fast / Standard / High Power AI configuration accordingly.
   *
   * Mentioned-route turns still use the preset embedded in the mention
   * (e.g. `@Form Builder /high`) because that's a per-message intent
   * the user just expressed. Continuity-route turns (last responder
   * agent) also honor this input as the fallback when the prior
   * message itself doesn't carry an explicit configuration preset.
   *
   * Picker writes are forward-only: changing the mode does NOT re-route
   * messages already in flight or already in history. Affects "what
   * happens next."
   */
  @Input() agentConfigurationPresetId: string | null = null;

  // Initial message to send automatically - using getter/setter for precise control
  private _initialMessage: string | null = null;
  private _initialAttachments: PendingAttachment[] | null = null;
  private _isComponentReady = false; // Track if component is ready to send
  /** Conversation this input has already auto-sent its pending first message for. */
  private _autoSentForConversationId: string | null = null;

  @Input()
  set initialMessage(value: string | null) {
    // Handle case where an object with {text, attachments} is passed instead of just a string
    // This can happen if there's a type mismatch in the binding chain
    let actualValue = value;
    if (value && typeof value === 'object' && 'text' in value) {
      actualValue = (value as { text: string }).text;
    }

    const previousValue = this._initialMessage;
    this._initialMessage = actualValue;

    // If component is ready and we have a new non-null message, trigger send
    if (this._isComponentReady && actualValue && actualValue !== previousValue) {
      this.triggerInitialSend();
    }
  }
  get initialMessage(): string | null {
    return this._initialMessage;
  }

  @Input()
  set initialAttachments(value: PendingAttachment[] | null) {
    this._initialAttachments = value;
  }
  get initialAttachments(): PendingAttachment[] | null {
    return this._initialAttachments;
  }

  private _conversationHistory: MJConversationDetailEntity[] = [];
  @Input()
  public get conversationHistory(): MJConversationDetailEntity[] {
    return this._conversationHistory;
  }
  public set conversationHistory(value: MJConversationDetailEntity[]) {
    this._conversationHistory = value;
  }

  // Message IDs that are in-progress and need streaming reconnection
  // Using getter/setter to react immediately when value changes (avoids timing issues with ngOnChanges)
  private _inProgressMessageIds?: string[];
  @Input()
  set inProgressMessageIds(value: string[] | undefined) {
    this._inProgressMessageIds = value;
    // React immediately when input changes (after component initialized)
    // This ensures callbacks are registered without relying on ngOnChanges timing
    if (this.streamingService && value && value.length > 0) {
      this.reconnectInProgressMessages();
    } else if (this.streamingService) {
      // Empty/undefined — e.g. this input was backgrounded by a conversation swap
      // ([] is bound to non-active inputs). Drop any streaming callbacks so a hidden
      // input isn't left subscribed; reconnectInProgressMessages re-registers when it
      // becomes active again with a non-empty list.
      this.unregisterAllCallbacks();
    }
  }
  get inProgressMessageIds(): string[] | undefined {
    return this._inProgressMessageIds;
  }

  /**
   * Application context for the current conversation. Threaded through from the
   * chat-area component for inclusion in the {@link beforeAgentTurn} event payload —
   * lets listeners reason about which app's chat surface is invoking the agent.
   * Optional; defaults to null for surfaces with no app context.
   */
  @Input() applicationId: string | null = null;

  @Output() messageSent = new EventEmitter<MJConversationDetailEntity>();
  @Output() agentResponse = new EventEmitter<{message: MJConversationDetailEntity, agentResult: any}>();

  /**
   * Cancelable — fired BEFORE `agentService.processMessage()` is called for a user turn.
   * Listeners may set `event.Cancel = true` to halt the agent invocation (e.g., a
   * client-side guardrail blocking the turn). When canceled, the corresponding
   * {@link afterAgentTurn} event is NOT fired and the running task is cleared.
   * Follows MJ's established Before/After cancelable event pattern.
   */
  @Output() beforeAgentTurn = new EventEmitter<BeforeAgentTurnEventArgs>();

  /**
   * Fired AFTER a successful agent turn completes. Carries the agent run id and the
   * full agent result. Not fired when {@link beforeAgentTurn} was canceled or when
   * the underlying `processMessage` errored.
   */
  @Output() afterAgentTurn = new EventEmitter<AfterAgentTurnEventArgs>();
  // conversationId is carried on every agent-lifecycle event so the parent chat-area can drop
  // events emitted by a BACKGROUND conversation's (hidden, still-streaming) input after the user
  // has swapped conversations — preventing cross-conversation state/cache bleed. Sourced from the
  // ConversationDetail entity's ConversationID (the captured, immutable value), never this.conversationId.
  @Output() agentRunDetected = new EventEmitter<{conversationId: string; conversationDetailId: string; agentRunId: string}>();
  @Output() agentRunUpdate = new EventEmitter<{conversationId: string; conversationDetailId: string; agentRun?: any, agentRunId?: string}>(); // Emits when agent run data updates during progress
  @Output() messageComplete = new EventEmitter<{conversationId: string; conversationDetailId: string; agentId?: string}>(); // Emits when message completes (success or error)
  @Output() artifactCreated = new EventEmitter<{conversationId: string; artifactId: string; versionId: string; versionNumber: number; conversationDetailId: string; name: string}>();
  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();
  @Output() intentCheckStarted = new EventEmitter<{conversationId: string}>(); // Emits when intent checking starts
  @Output() intentCheckCompleted = new EventEmitter<{conversationId: string}>(); // Emits when intent checking completes (carries conversationId so the parent can drop a background conversation's completion after a swap — symmetric with intentCheckStarted)
  @Output() initialMessageAutoSendStarted = new EventEmitter<{conversationId: string}>(); // Emitted when this input latches the pending first message for auto-send
  @Output() initialMessageAutoSendFailed = new EventEmitter<{conversationId: string}>(); // Emitted when a latched pending first message fails before messageSent
  @Output() emptyStateSubmit = new EventEmitter<{text: string; attachments: PendingAttachment[]}>(); // Emitted when in emptyStateMode
  @Output() uploadStateChanged = new EventEmitter<{isUploading: boolean; message: string}>(); // Emits when attachment upload state changes

  @ViewChild('inputBox') inputBox!: MessageInputBoxComponent;

  public messageText: string = '';
  public isSending: boolean = false;
  public isProcessing: boolean = false; // True when waiting for agent/naming response
  public processingMessage: string = 'AI is responding...'; // Message shown during processing
  public isUploadingAttachments: boolean = false; // True when uploading attachments to server
  public uploadingMessage: string = 'Uploading attachments...'; // Message shown during upload
  public converationManagerAgent: MJAIAgentEntityExtended | null = null;

  // Track completion timestamps to prevent race conditions with late progress updates
  private completionTimestamps = new Map<string, number>();
  // Track registered streaming callbacks for cleanup
  private registeredCallbacks = new Map<string, (progress: MessageProgressUpdate) => Promise<void>>();

  // Track pending attachments from the input box
  private pendingAttachments: PendingAttachment[] = [];

  private engine = ConversationEngine.Instance;

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private agentService: ConversationAgentService,
    private dataCache: DataCacheService,
    private activeTasks: ActiveTasksService,
    private streamingService: ConversationStreamingService,
    private mentionParser: MentionParserService,
    private mentionAutocomplete: MentionAutocompleteService,
    private attachmentService: ConversationAttachmentService,
    private bridge: ConversationBridgeService,
    private realtimeSession: RealtimeSessionService
  ) {
  super();}

  // ── Voice session (Realtime Co-Agent) ───────────────────────────────
  /** True while a live voice session is active — drives the overlay + mic state. */
  public voiceActive: boolean = false;
  private realtimeActiveSub?: Subscription;

  async ngOnInit() {
    // Bind provider-aware services to this component's provider.
    const p = this.ProviderToUse;
    this.agentService.Provider = p;
    this.dataCache.Provider = p;
    this.activeTasks.Provider = p;
    this.attachmentService.Provider = p;
    this.realtimeSession.Provider = p;

    // Reflect the live voice-session Active flag into a local field for the template.
    this.realtimeActiveSub = this.realtimeSession.Active$.subscribe(active => {
      this.voiceActive = active;
    });

    this.converationManagerAgent = await this.agentService.getConversationManagerAgent();

    // Initialize mention autocomplete (needed for parsing mentions in messages)
    await this.mentionAutocomplete.initialize(this.currentUser);

    // Reconnect to any in-progress messages for streaming updates (via global streaming service)
    this.reconnectInProgressMessages();
  }

  ngOnChanges(changes: SimpleChanges) {
    // When conversation changes, focus the input
    if (changes['conversationId'] && !changes['conversationId'].firstChange) {
      this.focusInput();
    }
    // Note: initialMessage/initialAttachments handled by setters, inProgressMessageIds handled by setter
  }

  ngAfterViewInit() {
    // Focus input on initial load
    this.focusInput();

    // Mark component as ready
    this._isComponentReady = true;

    // If there's an initial message to send (from empty state), send it automatically
    if (this._initialMessage || (this._initialAttachments && this._initialAttachments.length > 0)) {
      this.triggerInitialSend();
    }
  }

  /**
   * Triggers sending of initial message and attachments.
   * Called from setter or ngAfterViewInit when conditions are met.
   */
  private triggerInitialSend(): void {
    const message = this._initialMessage;
    const attachments = this._initialAttachments;
    const hasContent = !!message || !!(attachments && attachments.length > 0);

    if (!hasContent || !this.conversationId || UUIDsEqual(this._autoSentForConversationId, this.conversationId)) {
      return;
    }
    this._autoSentForConversationId = this.conversationId;

    // Set pending attachments before sending
    if (attachments && attachments.length > 0) {
      this.pendingAttachments = [...attachments];
    }

    Promise.resolve().then(() => {
      this.initialMessageAutoSendStarted.emit({ conversationId: this.conversationId });
    });

    // Use setTimeout to ensure we're outside of change detection cycle
    setTimeout(async () => {
      const sent = await this.sendMessageWithText(message || '');
      if (!sent) {
        this._autoSentForConversationId = null;
        this.initialMessageAutoSendFailed.emit({ conversationId: this.conversationId });
      }
    }, 100);
  }

  ngOnDestroy() {
    // Unregister all streaming callbacks
    this.unregisterAllCallbacks();
    this.realtimeActiveSub?.unsubscribe();
    // If the user navigates away mid-call, tear the session down.
    if (this.realtimeSession.IsActive) {
      void this.realtimeSession.EndRealtimeSession();
    }
  }

  /**
   * Resolve the agent the voice session should front for THIS conversation.
   * Mirrors the routing precedence used for text turns ({@link routeMessage}):
   *   1. last non-Sage agent (continuity)
   *   2. per-conversation pinned default
   *   3. embedder-supplied default
   *   4. Sage fallback
   * Returns null only if Sage itself failed to load.
   */
  public resolveCurrentAgentId(): string | null {
    return this.findLastNonSageAgentId()
      ?? this.conversationDefaultAgentId
      ?? this.defaultAgentId
      ?? this.converationManagerAgent?.ID
      ?? null;
  }

  /** True when the mic button should be enabled (have an agent + not disabled). */
  public get canStartRealtime(): boolean {
    return !this.disabled && !this.voiceActive && !!this.resolveCurrentAgentId();
  }

  /**
   * Display name of the agent the voice session fronts. Resolved here (this component
   * owns the conversation's routing context) and passed to RealtimeSessionService at
   * session start so the chat-area-hosted overlay can read it from the service.
   */
  private resolveRealtimeAgentName(): string {
    const agentId = this.resolveCurrentAgentId();
    if (agentId) {
      const match = this.mentionAutocomplete
        .getAvailableAgents()
        .find(a => UUIDsEqual(a.ID, agentId));
      if (match?.Name) {
        return match.Name;
      }
    }
    return this.converationManagerAgent?.Name ?? 'Sage';
  }

  /** True while the "Start a voice call with…" agent picker popover is open. */
  public showRealtimeAgentPicker: boolean = false;

  /**
   * CDK connected-overlay positions for the voice agent picker. Preferred: open UPWARD,
   * right edge aligned to the composer's right edge (matching the old absolute placement).
   * Fallback: open downward when there isn't room above. Because the popover renders in the
   * body-level CDK overlay container (with `cdkConnectedOverlayPush`), it escapes the chat
   * overlay's `overflow: hidden` border and can never clip at the top of a narrow overlay.
   */
  public readonly pickerOverlayPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  ];

  /**
   * `MJ: User Settings` key persisting the user's co-agent choice for realtime calls
   * (server-side, cross-device — never localStorage). Stored shape: `{"coAgentId":
   * string | null}` — `null` is an explicit "Auto" choice that overwrites an older pick.
   */
  private static readonly CoAgentPrefKey = 'mj.realtimeVoice.coAgent.v1';

  /**
   * The persisted co-agent preference, loaded just before the picker opens (and read by
   * the instant-start path). `null` = no preference / explicit "Auto".
   */
  public voicePickerDefaultCoAgentId: string | null = null;

  /**
   * Agents the voice picker offers — the same cached set the @mention
   * autocomplete and {@link resolveRealtimeAgentName} use, so the picker can
   * never offer an agent the conversation couldn't otherwise route to.
   */
  public get voicePickerAgents(): MJAIAgentEntityExtended[] {
    return this.mentionAutocomplete.getAvailableAgents();
  }

  /**
   * The ACTIVE Realtime-type co-agent candidates — the same run-permission-filtered
   * cached set as {@link voicePickerAgents}, narrowed to the Realtime agent type. The
   * picker shows its co-agent selector only when more than one exists.
   */
  public get voicePickerCoAgents(): MJAIAgentEntityExtended[] {
    return FilterRealtimeCoAgents(this.mentionAutocomplete.getAvailableAgents());
  }

  /** The agent the default resolution would call — preselected in the picker. */
  public get voicePickerDefaultAgentId(): string | null {
    return this.resolveCurrentAgentId();
  }

  /**
   * Start a real-time voice session fronting the conversation's current agent.
   * Client-direct: the RealtimeSessionService mints an ephemeral token and connects
   * the browser straight to the realtime provider over WebRTC. The "call mode"
   * overlay itself is hosted by the conversation chat area (driven by Active$).
   *
   * NEW vs EXISTING conversation:
   * - When an agent has already participated (a prior non-Sage AI turn exists),
   *   start immediately with the resolved agent — zero added friction.
   * - When the conversation has NO prior agent participation (new / empty
   *   conversation), the resolution would silently fall through to a default
   *   the user never chose — so show a compact agent picker instead and start
   *   with whichever agent they pick.
   */
  public async onStartRealtime(): Promise<void> {
    if (!this.canStartRealtime) {
      return;
    }
    // New/empty conversation (no prior agent turn): let the user choose who
    // to call. Falls through to the immediate path if the agent cache is
    // empty (nothing to pick from — the resolved default is the only option).
    if (!this.findLastNonSageAgentId() && this.voicePickerAgents.length > 0) {
      await this.openRealtimeAgentPicker();
      return;
    }
    const targetAgentId = this.resolveCurrentAgentId();
    if (!targetAgentId) {
      this.toastService.error('No agent available for a voice session.');
      return;
    }
    const coAgentId = await this.resolveInstantCoAgentId(targetAgentId);
    await this.startRealtimeWithAgent(targetAgentId, this.resolveRealtimeAgentName(), null, coAgentId);
  }

  /**
   * Caret-next-to-the-phone click: open the agent/co-agent/model picker ON DEMAND, even
   * when the conversation already has agent history (where the plain phone click
   * instant-starts). The resolved agent is preselected, so "open → Start" matches the
   * instant path while keeping the co-agent (and, for authorized users, voice-model)
   * choice one click away. Falls through to the instant path when there is nothing to
   * pick from.
   */
  public async onRealtimeOptions(): Promise<void> {
    if (!this.canStartRealtime) {
      return;
    }
    if (this.voicePickerAgents.length > 0) {
      await this.openRealtimeAgentPicker();
      return;
    }
    void this.onStartRealtime();
  }

  /** Loads the persisted co-agent preference, then shows the picker (pref preselected). */
  private async openRealtimeAgentPicker(): Promise<void> {
    this.voicePickerDefaultCoAgentId = await this.loadPersistedCoAgentId();
    this.showRealtimeAgentPicker = true;
  }

  /** User confirmed an agent (+ optional co-agent / voice model) in the voice picker — start the call. */
  public async onRealtimeAgentPicked(pick: RealtimeAgentPick): Promise<void> {
    this.showRealtimeAgentPicker = false;
    this.persistCoAgentChoice(pick.CoAgentId);
    await this.startRealtimeWithAgent(
      pick.Agent.ID,
      pick.Agent.Name || this.resolveRealtimeAgentName(),
      pick.PreferredModelId,
      pick.CoAgentId,
      BuildRealtimeConfigOverridesJson(pick.PreferredModelId, pick.PreferredVoice),
      pick.RecordingConsent
    );
  }

  /**
   * Reads the persisted co-agent preference from `MJ: User Settings` (via
   * `UserInfoEngine`'s cached settings). Defensive: any failure or malformed payload
   * resolves to `null` (Auto — the server's co-agent resolution chain).
   */
  private async loadPersistedCoAgentId(): Promise<string | null> {
    try {
      await UserInfoEngine.Instance.Config();
      const raw = UserInfoEngine.Instance.GetSetting(MessageInputComponent.CoAgentPrefKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { coAgentId?: string | null };
      return typeof parsed.coAgentId === 'string' && parsed.coAgentId.length > 0 ? parsed.coAgentId : null;
    } catch {
      return null;
    }
  }

  /** Persists the user's co-agent choice (including explicit "Auto" = null) cross-device. */
  private persistCoAgentChoice(coAgentId: string | null): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(
        MessageInputComponent.CoAgentPrefKey,
        JSON.stringify({ coAgentId: coAgentId ?? null })
      );
    } catch (error) {
      console.warn('[MessageInput] Failed to persist co-agent preference:', error);
    }
  }

  /**
   * Co-agent for the INSTANT start path (plain phone click, no picker): the persisted
   * preference is honored when it's still a valid candidate AND its pairing rows (if
   * any) allow the resolved target. Anything else falls back to `null` — the server's
   * co-agent resolution chain — so a stale/deactivated/incompatible preference can never
   * block the friction-free start (pairings constrain a chosen co-agent; they never
   * mandate one).
   */
  private async resolveInstantCoAgentId(targetAgentId: string): Promise<string | null> {
    const preferred = await this.loadPersistedCoAgentId();
    if (!preferred) {
      return null;
    }
    const isValidCandidate = this.voicePickerCoAgents.some(a => UUIDsEqual(a.ID, preferred));
    if (!isValidCandidate) {
      return null;
    }
    const pairings = await LoadCoAgentPairings(this.ProviderToUse, preferred);
    return PairingsAllowTarget(pairings, targetAgentId) ? preferred : null;
  }

  /** User dismissed the voice picker without starting a call. */
  public onRealtimeAgentPickerCancelled(): void {
    this.showRealtimeAgentPicker = false;
  }

  /**
   * Shared session-start path for both the immediate (existing conversation)
   * and picker (new conversation / caret options) flows. The agent NAME is passed
   * through to RealtimeSessionService so the chat-area-hosted overlay banner (AgentName$)
   * shows who the call fronts without re-resolving. An explicit voice-model choice
   * (authorization-gated, picker only) rides along as `preferredModelId` — the server
   * uses exactly that model or fails with a clear reason (no silent fallback) — and is
   * mirrored into `configOverridesJson` (`{"realtime":{"modelPreference":…}}`, the
   * pinned override envelope). An explicit co-agent choice (picker pick or persisted
   * preference) rides along as `coAgentId`.
   *
   * Interactive-channel tools (e.g. the live whiteboard's `Whiteboard_*` set) are NOT
   * passed here — the session service resolves the active channel plugins from the
   * `MJ: AI Agent Channels` registry and aggregates their tool sets at mint itself.
   */
  private async startRealtimeWithAgent(
    agentId: string,
    agentName: string,
    preferredModelId?: string | null,
    coAgentId?: string | null,
    configOverridesJson?: string | null,
    recordingConsent?: boolean | null
  ): Promise<void> {
    try {
      await this.realtimeSession.StartRealtimeSession(
        agentId,
        this.conversationId,
        null,
        agentName,
        preferredModelId ?? null,
        null,
        coAgentId ?? null,
        configOverridesJson ?? null,
        recordingConsent ?? null,
        null,
        // App awareness: the app the session runs in + the live app-context snapshot (where the
        // user is, what they see, capability manifest) — drives the server-side app cascade + the
        // mint-time prompt injection, and seeds the ClientContextChannel's streaming.
        this.applicationId,
        this.appContext as AppContextSnapshot | null
      );
    } catch (error) {
      console.error('Failed to start voice session:', error);
      this.toastService.error('Could not start the voice session.');
    }
  }

  /**
   * Focus the message input textarea
   */
  private focusInput(): void {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      if (this.inputBox) {
        this.inputBox.focus();
      }
    }, 100);
  }

  /**
   * Reconnect to in-progress messages for streaming updates via global streaming service.
   * This is called when:
   * 1. Component initializes (ngOnInit)
   * 2. Conversation changes (ngOnChanges)
   * 3. User returns to a conversation with in-progress messages
   * 4. Parent component explicitly triggers reconnection
   */
  public reconnectInProgressMessages(): void {
    if (!this.inProgressMessageIds || this.inProgressMessageIds.length === 0) {
      return;
    }

    // Unregister any previously registered callbacks for this component
    this.unregisterAllCallbacks();

    // Register new callbacks for each in-progress message
    for (const messageId of this.inProgressMessageIds) {
      // Create callback bound to this message ID
      const callback = this.createMessageProgressCallback(messageId);

      // Store reference for cleanup
      this.registeredCallbacks.set(messageId, callback);

      // Register with streaming service
      this.streamingService.registerMessageCallback(messageId, callback);
    }
  }

  /**
   * Create a progress callback for a specific message ID.
   * This callback will be invoked by the streaming service when progress updates arrive.
   */
  private createMessageProgressCallback(messageId: string): (progress: MessageProgressUpdate) => Promise<void> {
    return async (progress: MessageProgressUpdate) => {
      try {
        // Get message from cache (single source of truth)
        const message = await this.dataCache.getConversationDetail(messageId, this.currentUser);

        if (!message) {
          console.warn(`[StreamingCallback] Message ${messageId} not found in cache`);
          return;
        }

        // Skip if already complete or errored
        if (message.Status === 'Complete' || message.Status === 'Error') {
          console.log(`[StreamingCallback] Message ${messageId} is ${message.Status}, ignoring progress update`);
          return;
        }

        // Check if message was marked as completed (prevents race condition)
        const completionTime = this.completionTimestamps.get(messageId);
        if (completionTime) {
          console.log(`[StreamingCallback] Message ${messageId} marked complete at ${new Date(completionTime).toISOString()}, ignoring late progress update`);
          return;
        }

        // Default: plain message (used by RunAIAgentResolver and TaskOrchestrator without step info)
        message.Message = progress.message;

        // TaskOrchestrator with step info: add formatted header
        // Prefer hierarchical step (e.g., "2.1.3") over flat stepCount
        if (progress.resolver === 'TaskOrchestrator') {
          const stepDisplay = progress.metadata?.progress?.hierarchicalStep || progress.stepCount;
          if (stepDisplay != null) {
            message.Message = `**Step ${stepDisplay}**\n\n${progress.message}`;
          }
        }

        // Server now saves progress - client only updates in-memory and emits for UI
        // (Prevents race condition where client's late save overwrites server's final Status)

        // CRITICAL: Emit update to trigger UI refresh
        this.messageSent.emit(message);

        // CRITICAL: Update ActiveTasksService to keep the tasks dropdown in sync
        this.activeTasks.updateStatusByConversationDetailId(message.ID, progress.message);

        console.log(`[StreamingCallback] Updated message ${messageId}: ${progress.taskName || 'Agent'}`);
      } catch (error) {
        console.error(`[StreamingCallback] Error updating message ${messageId}:`, error);
      }
    };
  }

  /**
   * Unregister all callbacks registered by this component.
   * Called during cleanup and when switching conversations.
   */
  private unregisterAllCallbacks(): void {
    if (this.registeredCallbacks.size === 0) {
      return;
    }

    console.log(`🧹 Unregistering ${this.registeredCallbacks.size} message callbacks`);

    for (const [messageId, callback] of this.registeredCallbacks) {
      this.streamingService.unregisterMessageCallback(messageId, callback);
    }

    this.registeredCallbacks.clear();
  }

  get canSend(): boolean {
    return !this.disabled && !this.isSending && this.messageText.trim().length > 0;
  }

  /**
   * Handle attachments changed from the input box
   */
  onAttachmentsChanged(attachments: PendingAttachment[]): void {
    this.pendingAttachments = attachments;
  }

  /**
   * Handle attachment errors from the input box
   */
  onAttachmentError(error: string): void {
    this.toastService.error(error);
  }

  /**
   * Handle text submitted from the input box
   */
  async onTextSubmitted(text: string): Promise<void> {
    // Check if we have either text or attachments
    const hasText = text && text.trim().length > 0;
    const hasAttachments = this.pendingAttachments.length > 0;

    if (!hasText && !hasAttachments) {
      return;
    }

    // In empty state mode, just emit the data and let parent handle conversation creation
    if (this.emptyStateMode) {
      const attachmentsToEmit = [...this.pendingAttachments];
      this.pendingAttachments = [];
      this.messageText = '';
      this.emptyStateSubmit.emit({ text: text?.trim() || '', attachments: attachmentsToEmit });
      return;
    }

    this.isSending = true;

    // Store attachments locally since we'll clear them after send
    const attachmentsToSave = [...this.pendingAttachments];

    try {
      const messageDetail = await this.createMessageDetailFromText(text?.trim() || '');

      const saved = await messageDetail.Save();

      if (saved) {
        // Save attachments if any were pending
        // Attachments are stored in ConversationDetailAttachment table and loaded
        // separately when building AI messages - no need to add tokens to Message field
        if (attachmentsToSave.length > 0) {
          // Show upload indicator for attachments
          this.isUploadingAttachments = true;
          this.uploadingMessage = `Uploading ${attachmentsToSave.length} attachment${attachmentsToSave.length > 1 ? 's' : ''}...`;
          this.uploadStateChanged.emit({ isUploading: true, message: this.uploadingMessage });

          let attachmentRejection: string | null = null;
          try {
            await this.attachmentService.saveAttachments(
              messageDetail.ID,
              attachmentsToSave,
              this.currentUser
            );
          } catch (attachmentError) {
            console.error('Failed to save attachments:', attachmentError);
            attachmentRejection = attachmentError instanceof Error
              ? attachmentError.message
              : 'Some attachments could not be saved';
          } finally {
            this.isUploadingAttachments = false;
            this.uploadStateChanged.emit({ isUploading: false, message: '' });
          }

          // Plan §6: when attachments are rejected, the message itself must
          // not go through. Roll back the ConversationDetail and notify the
          // user with the server's rejection message so they can see exactly
          // why and either remove the file or upload a supported one. The
          // text and pending attachments stay in the input so the user can edit.
          if (attachmentRejection) {
            MJNotificationService.Instance?.CreateSimpleNotification(attachmentRejection, 'error', 5000);
            try {
              await messageDetail.Delete();
            } catch (rollbackErr) {
              console.error('Failed to roll back conversation detail after attachment rejection:', rollbackErr);
            }
            this.isSending = false;
            return;
          }
        }

        // Clear pending attachments after successful send
        this.pendingAttachments = [];

        await this.handleSuccessfulSend(messageDetail);
      } else {
        this.handleSendFailure(messageDetail);
      }
    } catch (error) {
      this.handleSendError(error);
    } finally {
      this.isSending = false;
    }
  }

  /** Toggle the sticky Plan Mode pill. Applies to subsequent user-initiated sends. */
  public TogglePlanMode(): void {
    this.PlanModeEnabled = !this.PlanModeEnabled;
  }

  async onSend(): Promise<void> {
    if (!this.canSend) return;

    this.isSending = true;
    try {
      const messageDetail = await this.createMessageDetail();
      const saved = await messageDetail.Save();

      if (saved) {
        await this.handleSuccessfulSend(messageDetail);
      } else {
        this.handleSendFailure(messageDetail);
      }
    } catch (error) {
      this.handleSendError(error);
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Send a message with custom text WITHOUT modifying the visible messageText input
   * Used for suggested responses and initial messages from empty state.
   * Also saves any pending attachments.
   *
   * `extraAttachments` is an escape hatch for callers that programmatically
   * attached something via `AddArtifactAttachment` and want to send in the same
   * tick — the `attachmentsChanged` event chain hasn't propagated yet, so
   * `this.pendingAttachments` may not contain the attachment. Pass it in
   * explicitly and we merge + dedupe (by `id`) before saving.
   */
  public async sendMessageWithText(text: string, extraAttachments?: PendingAttachment[]): Promise<boolean> {
    const merged: PendingAttachment[] = (() => {
      if (!extraAttachments || extraAttachments.length === 0) {
        return [...this.pendingAttachments];
      }
      const seen = new Set<string>();
      const out: PendingAttachment[] = [];
      for (const a of [...this.pendingAttachments, ...extraAttachments]) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(a);
      }
      return out;
    })();

    const hasText = text && text.trim().length > 0;
    const hasAttachments = merged.length > 0;

    if (!hasText && !hasAttachments) {
      return false;
    }

    if (this.isSending) {
      return false;
    }

    this.isSending = true;
    const attachmentsToSave = merged;

    try {
      const detail = await this.dataCache.createConversationDetail(this.currentUser);
      detail.ConversationID = this.conversationId;
      detail.Message = text?.trim() || '';
      detail.Role = 'User';
      detail.UserID = this.currentUser.ID; // Set the user who sent the message

      if (this.parentMessageId) {
        detail.ParentID = this.parentMessageId;
      }

      const saved = await detail.Save();

      if (saved) {
        // Save attachments if any were pending
        if (attachmentsToSave.length > 0) {
          // Show upload indicator for attachments
          this.isUploadingAttachments = true;
          this.uploadingMessage = `Uploading ${attachmentsToSave.length} attachment${attachmentsToSave.length > 1 ? 's' : ''}...`;
          this.uploadStateChanged.emit({ isUploading: true, message: this.uploadingMessage });

          let attachmentRejection: string | null = null;
          try {
            await this.attachmentService.saveAttachments(
              detail.ID,
              attachmentsToSave,
              this.currentUser
            );
          } catch (attachmentError) {
            console.error('Failed to save attachments:', attachmentError);
            attachmentRejection = attachmentError instanceof Error
              ? attachmentError.message
              : 'Some attachments could not be saved';
          } finally {
            this.isUploadingAttachments = false;
            this.uploadStateChanged.emit({ isUploading: false, message: '' });
          }

          // Plan §6: roll back the message when attachments are rejected so
          // the user sees the rejection clearly instead of the agent answering
          // a question that was supposed to include the file.
          if (attachmentRejection) {
            MJNotificationService.Instance?.CreateSimpleNotification(attachmentRejection, 'error', 5000);
            try {
              await detail.Delete();
            } catch (rollbackErr) {
              console.error('Failed to roll back conversation detail after attachment rejection:', rollbackErr);
            }
            this.isSending = false;
            return false;
          }
        }

        // Clear pending attachments after successful send
        this.pendingAttachments = [];

        // Also clear the mention editor's content + its own attachments list.
        // The user-initiated send path (MessageInputBoxComponent.onSendClick)
        // calls mentionEditor.clear() — we bypass that path here, so the chips
        // would otherwise stay on screen after the message goes out.
        this.inputBox?.mentionEditor?.clear();

        this.messageSent.emit(detail);

        const mentionResult = this.parseMentionsFromMessage(detail.Message);
        const isFirstMessage = this.conversationHistory.length === 0;
        await this.routeMessage(detail, mentionResult, isFirstMessage);
        return true;
      } else {
        this.handleSendFailure(detail);
        return false;
      }
    } catch (error) {
      this.handleSendError(error);
      return false;
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Creates and configures a new conversation detail message
   */
  private async createMessageDetail(): Promise<MJConversationDetailEntity> {
    const detail = await this.dataCache.createConversationDetail(this.currentUser);

    detail.ConversationID = this.conversationId;
    detail.Message = this.messageText.trim();
    detail.Role = 'User';
    detail.UserID = this.currentUser.ID; // Set the user who sent the message

    if (this.parentMessageId) {
      detail.ParentID = this.parentMessageId;
    }

    return detail;
  }

  /**
   * Creates and configures a new conversation detail message from provided text
   */
  private async createMessageDetailFromText(text: string): Promise<MJConversationDetailEntity> {
    const detail = await this.dataCache.createConversationDetail(this.currentUser);

    detail.ConversationID = this.conversationId;
    detail.Message = text;
    detail.Role = 'User';
    detail.UserID = this.currentUser.ID; // Set the user who sent the message

    if (this.parentMessageId) {
      detail.ParentID = this.parentMessageId;
    }

    return detail;
  }

  /**
   * Handles successful message send - routes to appropriate agent
   */
  private async handleSuccessfulSend(messageDetail: MJConversationDetailEntity): Promise<void> {
    this.messageSent.emit(messageDetail);
    this.messageText = '';

    const mentionResult = this.parseMentionsFromMessage(messageDetail.Message);
    const isFirstMessage = this.conversationHistory.length === 0;

    await this.routeMessage(messageDetail, mentionResult, isFirstMessage);
    this.refocusTextarea();
  }

  /**
   * Parses mentions from the message for routing decisions
   */
  private parseMentionsFromMessage(message: string): MentionParseResult {
    const mentionResult = this.mentionParser.parseMentions(
      message,
      this.mentionAutocomplete.getAvailableAgents(),
      this.mentionAutocomplete.getAvailableUsers()
    );

    return mentionResult;
  }

  /**
   * Routes the message to the appropriate agent or Sage based on context.
   * Priority: explicit @mention > prior-agent continuity > embedder-supplied
   * default agent > Sage fallback.
   */
  private async routeMessage(
    messageDetail: MJConversationDetailEntity,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    // Snapshot user-requested skills (from /skill chips) once, before any routing branch, so every
    // invocation path forwards the same set for this message.
    this._pendingRequestedSkillIDs = this.collectRequestedSkillIDs();

    // Priority 1: Direct @mention
    if (mentionResult.agentMention) {
      await this.handleDirectMention(messageDetail, mentionResult.agentMention, isFirstMessage);
      return;
    }

    // Priority 2: Check for previous agent with intent check
    const lastAgentId = this.findLastNonSageAgentId();
    if (lastAgentId) {
      await this.handleAgentContinuity(messageDetail, lastAgentId, mentionResult, isFirstMessage);
      return;
    }

    // Priority 3: User's per-conversation pinned default agent — sourced
    // from MJConversationEntity.DefaultAgentID. Wins over the embedder's
    // default because it represents an explicit user choice on this
    // conversation (e.g. "always route to Research Agent for this thread").
    if (this.conversationDefaultAgentId) {
      await this.handleAgentContinuity(
        messageDetail, this.conversationDefaultAgentId, mentionResult, isFirstMessage,
      );
      return;
    }

    // Priority 4: Embedder-supplied default agent. Set by chat surfaces
    // that have a specialist agent for the context (e.g. Form Builder
    // cockpit). Only kicks in when nothing more explicit is present —
    // @mention always wins, conversation continuity always wins. The
    // intent is to skip Sage's default delegation when the embedder
    // already knows what agent owns this conversation.
    if (this.defaultAgentId) {
      await this.handleAgentContinuity(
        messageDetail, this.defaultAgentId, mentionResult, isFirstMessage,
      );
      return;
    }

    // Priority 5: Check if Sage was explicitly @mentioned with a config preset
    // If so, treat it like agent continuity so the config preset is preserved
    if (this.converationManagerAgent?.ID) {
      const sageConfigPreset = this.agentService.findConfigurationPresetFromHistory(
        this.converationManagerAgent.ID,
        this.conversationHistory
      );
      if (sageConfigPreset) {
        // User explicitly @mentioned Sage with a config - use the shared execution helper directly
        // Pass the already-found config preset to avoid redundant history search
        await this.executeRouteWithNaming(
          () => this.executeAgentContinuation(
            messageDetail,
            this.converationManagerAgent!.ID,
            this.converationManagerAgent!.Name || 'Sage',
            messageDetail.ConversationID,
            null, // Sage doesn't use payload continuity
            null, // Sage doesn't use artifact info
            sageConfigPreset // Pass the already-found config preset
          ),
          messageDetail.Message,
          isFirstMessage,
          messageDetail.ConversationID
        );
        return;
      }
    }

    // Priority 6: No context - use Sage with default config
    await this.handleNoAgentContext(messageDetail, mentionResult, isFirstMessage);
  }

  /**
   * Handles routing when user directly mentions an agent with @
   */
  private async handleDirectMention(
    messageDetail: MJConversationDetailEntity,
    agentMention: Mention,
    isFirstMessage: boolean
  ): Promise<void> {
    // The agentMention already has configurationId from JSON parsing
    // If it wasn't in JSON (legacy format), try to get from chip data
    if (!agentMention.configurationId) {
      const chipData = this.inputBox?.getMentionChipsData() || [];
      const agentChip = chipData.find(chip => chip.id === agentMention.id && chip.type === 'agent');
      if (agentChip?.presetId) {
        agentMention.configurationId = agentChip.presetId;
      }
    }

    if (agentMention.configurationId) {
      //console.log(`🎯 Agent mention has configuration ID: ${agentMention.configurationId}`);
    }

    await this.executeRouteWithNaming(
      () => this.invokeAgentDirectly(messageDetail, agentMention, messageDetail.ConversationID),
      messageDetail.Message,
      isFirstMessage,
      messageDetail.ConversationID
    );
  }

  /**
   * Handles routing when there's a previous non-Sage agent in the conversation.
   *
   * LATENCY OPTIMIZATION (PR #2309 / plans/agent-latency-optimization.md — Opt #1):
   * Previously, this method made a separate LLM call via checkContinuityIntent() to decide
   * whether the user's new message was still directed at the previous agent or should be
   * routed to Sage. That call added ~300ms of latency on every message in a conversation
   * with an active agent — the single largest source of non-inference overhead on the client.
   *
   * The heuristic replacement is simple: if a previous non-Sage agent exists, always continue
   * with it. The user can @mention a different agent (or Sage) to explicitly switch. This is
   * more predictable and eliminates a common source of confusion where the intent check
   * incorrectly rerouted messages away from the active agent.
   *
   * The checkContinuityIntent() method and the underlying checkAgentContinuityIntent() service
   * method are preserved (not deleted) so we can reintroduce intent checking in the future
   * when browser-local inference is fast enough (~20-50ms) to do this without blocking the
   * user. See PR #2309 for the full discussion.
   */
  private async handleAgentContinuity(
    messageDetail: MJConversationDetailEntity,
    lastAgentId: string,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    // COMMENTED OUT — LLM intent check removed for latency optimization (see JSDoc above).
    // const intentResult = await this.checkContinuityIntent(lastAgentId, messageDetail.Message);
    //
    // if (intentResult.decision === 'YES') {
    //   await this.executeRouteWithNaming(
    //     () => this.continueWithAgent(
    //       messageDetail,
    //       lastAgentId,
    //       this.conversationId,
    //       intentResult.targetArtifactVersionId
    //     ),
    //     messageDetail.Message,
    //     isFirstMessage
    //   );
    // } else {
    //   await this.executeRouteWithNaming(
    //     () => this.processMessageThroughAgent(messageDetail, mentionResult),
    //     messageDetail.Message,
    //     isFirstMessage
    //   );
    // }

    // Always continue with the previous agent — user can @mention another agent to switch.
    await this.executeRouteWithNaming(
      () => this.continueWithAgent(
        messageDetail,
        lastAgentId,
        messageDetail.ConversationID,
        undefined // artifact version targeting unavailable without intent check
      ),
      messageDetail.Message,
      isFirstMessage,
      messageDetail.ConversationID
    );
  }

  /**
   * Handles routing when there's no previous agent context
   */
  private async handleNoAgentContext(
    messageDetail: MJConversationDetailEntity,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    await this.executeRouteWithNaming(
      () => this.processMessageThroughAgent(messageDetail, mentionResult),
      messageDetail.Message,
      isFirstMessage,
      messageDetail.ConversationID
    );
  }

  /**
   * Finds the last agent ID that isn't Sage
   */
  private findLastNonSageAgentId(): string | null {
    const lastAIMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(msg =>
        msg.Role === 'AI' &&
        msg.AgentID &&
        !UUIDsEqual(msg.AgentID, this.converationManagerAgent?.ID)
      );

    return lastAIMessage?.AgentID || null;
  }

  /**
   * Checks if message should continue with the previous agent
   * Emits events to show temporary intent checking message in conversation
   */
  private async checkContinuityIntent(agentId: string, message: string) {
    // FAST PATH: If message contains form response syntax, skip the intent check entirely
    // Form responses always continue with the agent that requested the form
    // Don't show "Analyzing intent..." message for this obvious case
    if (ConversationUtility.ContainsFormResponse(message)) {
      console.log('✅ Form response detected, skipping intent check UI (fast path)');
      return {
        decision: 'YES' as const,
        reasoning: 'User submitted a form response to the previous agent'
      };
    }

    // Emit event to show temporary "Analyzing intent..." message in conversation
    this.intentCheckStarted.emit({ conversationId: this.conversationId });

    try {
      // Build context from pre-loaded maps (if available)
      if (!this.artifactsByDetailId || !this.agentRunsByDetailId) {
        console.warn('⚠️ Artifact/agent run context not available for intent check');
        return { decision: 'UNSURE' as const, reasoning: 'Context not available' };
      }

      const intent = await this.agentService.checkAgentContinuityIntent(
        agentId,
        message,
        this.conversationHistory,
        {
          artifactsByDetailId: this.artifactsByDetailId,
          agentRunsByDetailId: this.agentRunsByDetailId
        }
      );
      return intent;
    } catch (error) {
      console.error('❌ Intent check failed, defaulting to UNSURE:', error);
      return { decision: 'UNSURE' as const, reasoning: 'Intent check failed with error' };
    } finally {
      // Emit event to remove temporary intent checking message
      this.intentCheckCompleted.emit({ conversationId: this.conversationId });
    }
  }

  /**
   * Executes a routing function, optionally with conversation naming for first message
   *
   * IMPORTANT: Conversation naming runs asynchronously in the background and does NOT
   * block the agent invocation. This prevents UI blocking if naming times out.
   */
  private async executeRouteWithNaming(
    routeFunction: () => Promise<void>,
    userMessage: string,
    isFirstMessage: boolean,
    conversationId: string
  ): Promise<void> {
    if (isFirstMessage) {
      // Fire conversation naming in background (don't await)
      // This prevents 2+ minute UI blocking if naming times out
      this.nameConversation(userMessage, conversationId);

      // Execute route immediately (don't wait for naming)
      await routeFunction();
    } else {
      await routeFunction();
    }
  }

  /**
   * Returns focus to the message textarea
   */
  private refocusTextarea(): void {
    setTimeout(() => {
      if (this.inputBox) {
        this.inputBox.focus();
      }
    }, 100);
  }

  /**
   * Handles message send failure
   */
  private handleSendFailure(messageDetail: MJConversationDetailEntity): void {
    console.error('Failed to send message:', messageDetail.LatestResult?.Message);
    this.toastService.error('Failed to send message. Please try again.');
  }

  /**
   * Handles message send error
   */
  private handleSendError(error: unknown): void {
    console.error('Error sending message:', error);
    this.toastService.error('Error sending message. Please try again.');
  }

  /**
   * Create a progress callback for agent execution
   * This callback updates both the active task and the ConversationDetail message
   * IMPORTANT: Filters by agentRunId to prevent cross-contamination when multiple agents run in parallel
   */
  private createProgressCallback(
    conversationDetail: MJConversationDetailEntity,
    agentName: string
  ): AgentExecutionProgressCallback {
    // Use closure to capture the agent run ID from the first progress message
    // This allows us to filter out progress messages from other concurrent agents
    let capturedAgentRunId: string | null = null;

    return async (progress) => {
      const metadata = progress.metadata as MessageProgressMetadata | undefined;
      const progressAgentRun = metadata?.agentRun;
      const progressAgentRunId = metadata?.agentRun?.ID || metadata?.agentRunId;

      // Capture the agent run ID from the first progress message
      if (!capturedAgentRunId && progressAgentRunId) {
        capturedAgentRunId = progressAgentRunId;
      }

      // Filter out progress messages from other concurrent agents
      // This prevents cross-contamination when multiple agents run in parallel
      if (capturedAgentRunId && progressAgentRunId && progressAgentRunId !== capturedAgentRunId) {
        return;
      }

      // Format progress message with visual indicator
      const progressText = progress.message;

      // Update the active task with progress details (if it exists)
      this.activeTasks.updateStatusByConversationDetailId(conversationDetail.ID, progressText);

      // Update the ConversationDetail message in real-time
      try {
        if (conversationDetail) {
          // Check 1: Skip if message is already complete or errored
          if (conversationDetail.Status === 'Complete' || conversationDetail.Status === 'Error') {
            return;
          }

          // Check 2: Skip if message was marked as completed (prevents race condition)
          // Once a message is marked complete, we reject ALL further progress updates
          const completionTime = this.completionTimestamps.get(conversationDetail.ID);
          if (completionTime) {
            return;
          }

          // CRITICAL FIX: Emit FULL agent run object for incremental updates
          // This contains live timestamps, status, and other fields that change during execution
          if (progressAgentRun || progressAgentRunId) {
            this.agentRunUpdate.emit({
              conversationId: conversationDetail.ConversationID,
              conversationDetailId: conversationDetail.ID,
              agentRun: progressAgentRun,
              agentRunId: progressAgentRunId
            });
          } else if (progressAgentRunId && !capturedAgentRunId) {
            // Fallback: If we don't have the full object but have the ID, emit agentRunDetected
            // This will trigger a database query to load the agent run
            this.agentRunDetected.emit({
              conversationId: conversationDetail.ConversationID,
              conversationDetailId: conversationDetail.ID,
              agentRunId: progressAgentRunId
            });
          }

          if (conversationDetail.Status === 'In-Progress') {
            conversationDetail.Message = progressText;
            // Server now saves progress - client only updates in-memory and emits for UI
            // (Prevents race condition where client's late save overwrites server's final Status)
            this.messageSent.emit(conversationDetail);
          }
        }
      } catch (error) {
        console.warn('Failed to update progress in ConversationDetail:', error);
      }
    };
  }

  /**
   * Process the message through agents (multi-stage: Sage -> possible sub-agent)
   * Only called when there's no @mention and no implicit agent context
   */
  private async processMessageThroughAgent(
    userMessage: MJConversationDetailEntity,
    mentionResult: MentionParseResult
  ): Promise<void> {
    let taskId: string | null = null;
    let conversationManagerMessage: MJConversationDetailEntity | null = null;

    // CRITICAL: Capture conversationId from user message at start
    // This prevents race condition when user switches conversations during async processing
    const conversationId = userMessage.ConversationID;

    try {
      // Create AI message for Sage BEFORE invoking
      conversationManagerMessage = await this.dataCache.createConversationDetail(this.currentUser);

      conversationManagerMessage.ConversationID = conversationId;
      conversationManagerMessage.Role = 'AI';
      conversationManagerMessage.Message = '⏳ Starting...';
      conversationManagerMessage.ParentID = userMessage.ID;
      conversationManagerMessage.Status = 'In-Progress';
      conversationManagerMessage.HiddenToUser = false;
      // Use the preloaded Sage agent instead of looking it up
      if (this.converationManagerAgent?.ID) {
        conversationManagerMessage.AgentID = this.converationManagerAgent.ID;
      }

      await conversationManagerMessage.Save();
      this.messageSent.emit(conversationManagerMessage);

      // Use Sage to evaluate and route
      // Stage 1: Sage evaluates the message
      taskId = this.activeTasks.add({
        agentName: 'Sage',
        status: 'Evaluating message...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: conversationManagerMessage.ID,
        conversationId,
        conversationName: this.conversationName
      });

      // ── PR 2c follow-up: Before/After cancelable event wiring ──
      // Emit beforeAgentTurn so consumers can veto the turn (rate-limit, guardrail,
      // confirm-dialog, etc.). Cancel propagates synchronously through the chat-area
      // re-emit binding, so by the time .emit() returns, event.Cancel reflects every
      // subscriber's final answer.
      const beforeEvent = new BeforeAgentTurnEventArgs(
        conversationId,
        userMessage.Message ?? '',
        this.applicationId
      );
      this.beforeAgentTurn.emit(beforeEvent);
      if (beforeEvent.Cancel) {
        // Mark the conversation-manager message as canceled + clear its task so the
        // UI doesn't show a forever-pending spinner. afterAgentTurn is NOT emitted.
        await this.updateConversationDetail(
          conversationManagerMessage,
          beforeEvent.CancelReason ?? '⛔ Turn canceled before agent invocation',
          'Error'
        );
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        if (taskId) {
          this.activeTasks.remove(taskId);
          taskId = null;
        }
        return;
      }

      const result = await this.agentService.processMessage(
        conversationId,
        userMessage,
        this.conversationHistory,
        conversationManagerMessage.ID,
        this.createProgressCallback(conversationManagerMessage, 'Sage'),
        this.appContext
      );

      // Emit afterAgentTurn on the happy path only — the error/failure branch
      // immediately below handles its own cleanup and skips this emit.
      if (result && result.success) {
        this.afterAgentTurn.emit(new AfterAgentTurnEventArgs(
          conversationId,
          (result.agentRun?.ID ?? '') as string,
          result as unknown as import('@memberjunction/ai-core-plus').ExecuteAgentResult
        ));
      }

      // Task will be removed automatically in markMessageComplete()
      // DO NOT remove here - agent may still be streaming/processing
      taskId = null; // Clear reference but don't remove from service

      if (!result || !result.success) {
        // Evaluation failed - use updateConversationDetail to ensure task cleanup
        const errorMsg = result?.agentRun?.ErrorMessage || 'Agent evaluation failed';
        conversationManagerMessage.Error = errorMsg;
        await this.updateConversationDetail(conversationManagerMessage, `❌ Evaluation failed`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        console.warn('⚠️ Sage failed:', result?.agentRun?.ErrorMessage);

        // Clean up completion timestamp
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        return;
      }

      // Stage 2: Check for task graph (multi-step orchestration)
      if (result.payload?.taskGraph) {
        await this.handleTaskGraphExecution(userMessage, result, conversationId, conversationManagerMessage);
        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }
      }
      // Stage 3: Check for sub-agent invocation (single-step delegation)
      else if (result.agentRun.FinalStep === 'Success' && result.payload?.invokeAgent) {
        // Reuse the existing conversationManagerMessage instead of creating new ones
        await this.handleSubAgentInvocation(userMessage, result, conversationId, conversationManagerMessage);
        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }
      }
      // Stage 4: Direct chat response from Agent
      else if (result.agentRun.FinalStep === 'Chat' && result.agentRun.Message) {
        // Normal chat response
        // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
        // Note: updateConversationDetail will call markMessageComplete() for us
        await this.updateConversationDetail(conversationManagerMessage, result.agentRun.Message, 'Complete', result);

        // Handle artifacts if any (but NOT task graphs - those are intermediate work products)
        // Server already created artifacts - just emit event to trigger UI reload
        if (result.payload && Object.keys(result.payload).length > 0) {
          this.emitArtifactReload(conversationManagerMessage);
          this.messageSent.emit(conversationManagerMessage);
        }

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }

        // Clean up completion timestamp after delay
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
      }
      // Stage 5: Silent observation - but check for message content first
      else {
        // Check if there's a message to display even without payload/taskGraph
        if (result.agentRun.Message) {
          // Mark message as completing BEFORE setting final content
          this.markMessageComplete(conversationManagerMessage);

          conversationManagerMessage.HiddenToUser = false;

          // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
          await this.updateConversationDetail(conversationManagerMessage, result.agentRun.Message, 'Complete', result);

          this.messageSent.emit(conversationManagerMessage);

          // Clean up completion timestamp after delay
          this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        } else {
          // Mark message as completing
          this.markMessageComplete(conversationManagerMessage);

          // Hide the Sage message
          conversationManagerMessage.HiddenToUser = true;

          // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
          await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Complete', result);

          this.messageSent.emit(conversationManagerMessage);

          await this.handleSilentObservation(userMessage, conversationId);

          // Clean up completion timestamp after delay
          this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        }

        // Remove CM from active tasks
        if (taskId) {
          // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
        }
      }

    } catch (error) {
      console.error('❌ Error processing message through agents:', error);

      // Update conversationManagerMessage status to Error
      if (conversationManagerMessage && conversationManagerMessage.ID) {
        // Use updateConversationDetail to ensure task cleanup
        conversationManagerMessage.Error = String(error);
        await this.updateConversationDetail(conversationManagerMessage, `❌ Error: ${String(error)}`, 'Error');

        // Clean up completion timestamp
        this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
      }

      // Mark user message as complete
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

      // Clean up active task
      if (taskId) {
        // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);
      }
    }
  }

  /**
   * Handle task graph execution based on Sage's payload
   * Creates tasks and orchestrates their execution
   */
  private async handleTaskGraphExecution(
    userMessage: MJConversationDetailEntity,
    managerResult: ExecuteAgentResult,
    conversationId: string,
    conversationManagerMessage: MJConversationDetailEntity
  ): Promise<void> {
    const taskGraph = managerResult.payload.taskGraph;
    const workflowName = taskGraph.workflowName || 'Workflow';
    const reasoning = taskGraph.reasoning || 'Executing multi-step workflow';
    const taskCount = taskGraph.tasks?.length || 0;

    // Deduplicate tasks by tempId (LLM sometimes returns duplicates)
    const seenTempIds = new Set<string>();
    const uniqueTasks = taskGraph.tasks.filter((task: any) => {
      if (seenTempIds.has(task.tempId)) {
        console.warn(`⚠️ Duplicate tempId detected on client, filtering: ${task.tempId} (${task.name})`);
        return false;
      }
      seenTempIds.add(task.tempId);
      return true;
    });

    const uniqueTaskCount = uniqueTasks.length;

    const isSingleTask = uniqueTaskCount === 1;

    // If single task, use direct agent execution (existing pattern with great PubSub support)
    if (isSingleTask) {
      const task = uniqueTasks[0];
      const agentName = task.agentName;

      // Update CM message
      const delegationMessage = `👉 Delegating to **${agentName}**`;
      await this.updateConversationDetail(conversationManagerMessage, delegationMessage, 'Complete');

      // Execute single agent directly using existing pattern
      await this.handleSingleTaskExecution(
        userMessage,
        task,
        agentName,
        conversationId,
        conversationManagerMessage
      );

      return;
    }

    // Multi-step workflow - use server-side task orchestration
    console.log(`📋 Multi-step workflow detected (${uniqueTaskCount} tasks), using task orchestration`);

    // Update CM message with task summary (use unique tasks only)
    const taskSummary = uniqueTasks.map((t: any) => `• ${t.name}`).join('\n');

    await this.updateConversationDetail(conversationManagerMessage, `📋 Setting up multi-step workflow...\n\n**${workflowName}**\n${taskSummary}`, 'Complete');

    // Step 2: Create new ConversationDetail for task execution updates
    const taskExecutionMessage = await this.dataCache.createConversationDetail(this.currentUser);
    taskExecutionMessage.ConversationID = conversationId;
    taskExecutionMessage.Role = 'AI';
    taskExecutionMessage.Message = '⏳ Starting workflow execution...';
    taskExecutionMessage.ParentID = conversationManagerMessage.ID; // Thread under delegation message
    taskExecutionMessage.Status = 'In-Progress';
    taskExecutionMessage.HiddenToUser = false;
    // No AgentID for now - this represents the task orchestration system
    await taskExecutionMessage.Save();
    this.messageSent.emit(taskExecutionMessage);

    // Register for streaming updates via global streaming service
    const callback = this.createMessageProgressCallback(taskExecutionMessage.ID);
    this.registeredCallbacks.set(taskExecutionMessage.ID, callback);
    this.streamingService.registerMessageCallback(taskExecutionMessage.ID, callback);

    try {
      // Get default environment ID (MJ standard environment used across all installations)
      const environmentId = MJEnvironmentEntityExtended.DefaultEnvironmentID;

      // Get session ID for PubSub subscriptions
      const sessionId = GraphQLDataProvider.Instance.sessionId || '';
      
      // Step 3: Call ExecuteTaskGraph mutation (links to taskExecutionMessage)
      const mutation = `
        mutation ExecuteTaskGraph($taskGraphJson: String!, $conversationDetailId: String!, $environmentId: String!, $sessionId: String!, $createNotifications: Boolean) {
          ExecuteTaskGraph(
            taskGraphJson: $taskGraphJson
            conversationDetailId: $conversationDetailId
            environmentId: $environmentId
            sessionId: $sessionId
            createNotifications: $createNotifications
          ) {
            success
            errorMessage
            results {
              taskId
              success
              output
              error
            }
          }
        }
      `;

      const variables = {
        taskGraphJson: JSON.stringify(taskGraph),
        conversationDetailId: taskExecutionMessage.ID, // Link tasks to execution message, not CM message
        environmentId: environmentId,
        sessionId: sessionId,
        createNotifications: true
      };

      const result = await GraphQLDataProvider.Instance.ExecuteGQL(mutation, variables);

      // Step 4: Update task execution message with results
      // ExecuteGQL returns data directly (not wrapped in {data, errors})
      if (result?.ExecuteTaskGraph?.success) {
        await this.updateConversationDetail(taskExecutionMessage, `✅ **${workflowName}** completed successfully`, 'Complete');
      } else {
        const errorMsg = result?.ExecuteTaskGraph?.errorMessage || 'Unknown error';
        console.error('❌ Task graph execution failed:', errorMsg);
        taskExecutionMessage.Error = errorMsg;
        await this.updateConversationDetail(taskExecutionMessage, `❌ **${workflowName}** failed: ${errorMsg}`, 'Error');
      }

      // Trigger artifact reload for this message
      // Artifacts were created on server during task execution and linked to this message
      // This event triggers the parent component to reload artifacts from the database
      this.emitArtifactReload(taskExecutionMessage);

      // Unregister streaming callback (task complete)
      const callback = this.registeredCallbacks.get(taskExecutionMessage.ID);
      if (callback) {
        this.streamingService.unregisterMessageCallback(taskExecutionMessage.ID, callback);
        this.registeredCallbacks.delete(taskExecutionMessage.ID);
      }

      // Mark agent response message as complete (removes task from active tasks)
      await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Complete');

      // Mark user message as complete
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

    } catch (error) {
      console.error('❌ Error executing task graph:', error);
      taskExecutionMessage.Error = String(error);
      await this.updateConversationDetail(taskExecutionMessage, `❌ **${workflowName}** - Error: ${String(error)}`, 'Error');

      // Trigger artifact reload even on error - partial artifacts may have been created
      this.emitArtifactReload(taskExecutionMessage);

      // Unregister streaming callback (task failed)
      const callback = this.registeredCallbacks.get(taskExecutionMessage.ID);
      if (callback) {
        this.streamingService.unregisterMessageCallback(taskExecutionMessage.ID, callback);
        this.registeredCallbacks.delete(taskExecutionMessage.ID);
      }

      // Mark agent response message as complete (removes task from active tasks)
      conversationManagerMessage.Error = String(error);
      await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Error');

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  protected async updateConversationDetail(convoDetail: MJConversationDetailEntity, message: string, status: 'In-Progress' | 'Complete' | 'Error', result?: ExecuteAgentResult): Promise<void> {
    // Mark as completing FIRST if status is Complete or Error
    // This ensures task cleanup happens even if we return early due to guard clause
    if (status === 'Complete' || status === 'Error') {
      this.markMessageComplete(convoDetail);
    }

    // Race condition guard: Before writing Error, reload from DB to check if the server
    // already completed this record. The server and client write to the same conversation
    // detail record — if the server completed successfully but a client-side timeout or
    // WebSocket disconnect triggered this error path, we must not overwrite the server's
    // successful completion with an error status.
    if (status === 'Error' && convoDetail.ID) {
      await convoDetail.Load(convoDetail.ID);
      if (convoDetail.Status === 'Complete') {
        // Server already completed — emit updated message, don't overwrite with error
        this.messageSent.emit(convoDetail);
        return;
      }
    }

    // Guard clause: Don't re-save if already complete/errored (prevents duplicate saves)
    // Task has already been removed by markMessageComplete() above
    if (convoDetail.Status === 'Complete' || convoDetail.Status === 'Error') {
      return; // Already complete, no need to save again
    }

    const maxAttempts = 2;
    let attempts = 0, done = false;
    while (attempts < maxAttempts && !done) {
      // Set response form and command fields before saving
      if (result?.responseForm) {
        convoDetail.ResponseForm = JSON.stringify(result.responseForm);
      }
      if (result?.actionableCommands) {
        convoDetail.ActionableCommands = JSON.stringify(result.actionableCommands);
      }
      if (result?.automaticCommands) {
        convoDetail.AutomaticCommands = JSON.stringify(result.automaticCommands);
      }

      convoDetail.Message = message;
      convoDetail.Status = status;

      await convoDetail.Save();

      if (convoDetail.Message === message && convoDetail.Status === status) {
        done = true;
        this.messageSent.emit(convoDetail);
      }
      else {
        console.warn(`   ⚠️ ConversationDetail update attempt ${attempts + 1} did not persist. ${attempts + 1 < maxAttempts ? 'Retrying...' : 'Giving up.'}`);
      }
      attempts++;
    }

    // Clean up completion timestamp after delay
    if (status === 'Complete' || status === 'Error') {
      this.cleanupCompletionTimestamp(convoDetail.ID);
    }
  }

  /**
   * Load previous payload for an agent from its most recent OUTPUT artifact.
   * Searches backwards through all messages from this agent until an artifact is found.
   * This ensures payload continuity even after clarifying exchanges without artifacts.
   * Checks both user-visible and system artifacts to support agents like Agent Manager.
   */
  private async loadPreviousPayloadForAgent(agentId: string): Promise<{
    payload: any;
    artifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null;
  }> {
    // Get all messages from this agent in reverse order (most recent first)
    const agentMessages = this.conversationHistory
      .slice()
      .reverse()
      .filter(msg => msg.Role === 'AI' && UUIDsEqual(msg.AgentID, agentId));

    if (agentMessages.length === 0) {
      return { payload: null, artifactInfo: null };
    }

    // Search through all agent messages until we find one with an artifact
    for (const message of agentMessages) {
      // Check user-visible artifacts first
      let artifacts = this.artifactsByDetailId?.get(message.ID);

      // If not found, check system artifacts (Agent Manager, etc.)
      if (!artifacts || artifacts.length === 0) {
        artifacts = this.systemArtifactsByDetailId?.get(message.ID);
      }

      // Try to load artifact content as payload
      if (artifacts && artifacts.length > 0) {
        const artifact = artifacts[0];
        try {
          const version = await artifact.getVersion();
          if (version.Content) {
            console.log(`📦 Loaded previous payload for agent ${agentId} from artifact (message: ${message.ID})`);
            return {
              payload: JSON.parse(version.Content),
              artifactInfo: {
                artifactId: artifact.artifactId,
                versionId: artifact.artifactVersionId,
                versionNumber: artifact.versionNumber
              }
            };
          }
        } catch (error) {
          console.error('Error loading payload from artifact:', error);
          // Continue to next message
        }
      }
    }

    console.log(`📦 No previous payload found for agent ${agentId} after searching ${agentMessages.length} messages`);
    return { payload: null, artifactInfo: null };
  }

  /**
   * Handle single task execution from task graph using direct agent execution
   * Uses the existing agent execution pattern with PubSub support
   */
  private async handleSingleTaskExecution(
    userMessage: MJConversationDetailEntity,
    task: any, // Task definition from taskGraph
    agentName: string,
    conversationId: string,
    conversationManagerMessage: MJConversationDetailEntity
  ): Promise<void> {
    try {
      // Look up the agent
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);
      if (!agent) {
        throw new Error(`Agent not found: ${agentName}`);
      }

      // Create AI response message for the agent execution
      const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...';
      agentResponseMessage.ParentID = conversationManagerMessage.ID; // Thread under delegation
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      agentResponseMessage.AgentID = agent.ID;

      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Add to active tasks
      const newTaskId = this.activeTasks.add({
        agentName: agentName,
        status: 'Starting...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: agentResponseMessage.ID,
        conversationId,
        conversationName: this.conversationName
      });

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = await this.loadPreviousPayloadForAgent(agent.ID);

      // Merge Sage's task payload with previous agent payload (Sage's takes precedence)
      const mergedPayload = previousPayload
        ? { ...previousPayload, ...task.inputPayload }
        : task.inputPayload;

      // Invoke agent with merged payload
      const agentResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        task.description || task.name,
        agentResponseMessage.ID,
        mergedPayload, // Pass merged payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId,
        undefined, // configurationPresetId not used in this path
        this.appContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
      );

      // Task will be removed automatically in markMessageComplete() when status changes to Complete/Error
      // DO NOT remove here - allows UI to show task during entire execution

      if (agentResult && agentResult.success) {
        // Update message with result
        await this.updateConversationDetail(agentResponseMessage, agentResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', agentResult);

        // Server created artifacts - emit event to trigger UI reload
        if (agentResult.payload && Object.keys(agentResult.payload).length > 0) {
          this.emitArtifactReload(agentResponseMessage);
          console.log('🎨 Server created artifact from single task execution');
          this.messageSent.emit(agentResponseMessage);
        }
      } else {
        // Handle failure
        const errorMsg = agentResult?.agentRun?.ErrorMessage || 'Agent execution failed';
        agentResponseMessage.Error = errorMsg;
        await this.updateConversationDetail(agentResponseMessage, `❌ **${agentName}** failed: ${errorMsg}`, 'Error');
      }

      // Mark user message as complete
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');

    } catch (error) {
      console.error('❌ Error in single task execution:', error);
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Handle sub-agent invocation based on Sage's payload
   * Reuses the existing conversationManagerMessage to avoid creating multiple records
   */
  private async handleSubAgentInvocation(
    userMessage: MJConversationDetailEntity,
    managerResult: ExecuteAgentResult,
    conversationId: string,
    conversationManagerMessage: MJConversationDetailEntity
  ): Promise<void> {
    const payload = managerResult.payload;
    const agentName = payload.invokeAgent;
    const reasoning = payload.reasoning || 'Delegating to specialist agent';

    // Now create a NEW message for the sub-agent execution
    try {
      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = conversationManagerMessage.ID; // Thread under delegation message
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      // Set AgentID immediately for proper attribution
      if (agent?.ID) {
        agentResponseMessage.AgentID = agent.ID;
      }

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Add sub-agent to active tasks
      const newTaskId = this.activeTasks.add({
        agentName: agentName,
        status: 'Starting...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: agentResponseMessage.ID,
        conversationId,
        conversationName: this.conversationName
      });

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = agent?.ID
        ? await this.loadPreviousPayloadForAgent(agent.ID)
        : { payload: null, artifactInfo: null };

      // Find configuration preset from previous @mention in conversation history
      const configurationPresetId = agent?.ID
        ? this.agentService.findConfigurationPresetFromHistory(agent.ID, this.conversationHistory)
        : undefined;

      // Invoke the sub-agent with progress callback
      const subResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        reasoning,
        agentResponseMessage.ID,
        previousPayload, // Pass previous payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId,
        configurationPresetId, // Pass configuration from previous @mention for continuity
        this.appContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
      );

      // Task will be removed automatically in markMessageComplete() when status changes to Complete/Error
      // DO NOT remove here - allows UI to show task during entire execution

      if (subResult && subResult.success) {
        // Update the response message with agent result
        // Store the agent ID for display
        if (subResult.agentRun.AgentID) {
          agentResponseMessage.AgentID = subResult.agentRun.AgentID;
        }

        await this.updateConversationDetail(agentResponseMessage, subResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', subResult);

        // Always emit artifactCreated to trigger UI reload — the server may have created
        // artifacts even when the result payload is empty (e.g., remote stage server).
        // onArtifactCreated will reload from DB and discover any artifacts that exist.
        this.emitArtifactReload(agentResponseMessage);
        this.messageSent.emit(agentResponseMessage);

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // Sub-agent failed - attempt auto-retry once
        console.log(`⚠️ ${agentName} failed, attempting auto-retry...`);

        await this.updateConversationDetail(conversationManagerMessage, `👉 **${agentName}** will handle this request...\n\n⚠️ First attempt failed, retrying...`, conversationManagerMessage.Status);

        // Update the existing agentResponseMessage to show retry status
        await this.updateConversationDetail(agentResponseMessage, "Retrying...", agentResponseMessage.Status);

        // Retry the sub-agent (reuse previously loaded payload and config from first attempt)
        const retryResult = await this.agentService.invokeSubAgent(
          agentName,
          conversationId,
          userMessage,
          this.conversationHistory,
          reasoning,
          agentResponseMessage.ID,
          previousPayload, // Pass same payload as first attempt
          this.createProgressCallback(agentResponseMessage, `${agentName} (retry)`),
          artifactInfo?.artifactId,
          artifactInfo?.versionId,
          configurationPresetId, // Pass same config as first attempt
          this.appContext, // Embedder-supplied app/form context
          this.PlanModeEnabled, // per-request Plan Mode toggle
          this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
        );

        if (retryResult && retryResult.success) {
          // Retry succeeded - update the same message
          if (retryResult.agentRun.AgentID) {
            agentResponseMessage.AgentID = retryResult.agentRun.AgentID;
          }

          await this.updateConversationDetail(agentResponseMessage, retryResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', retryResult);

          // Always emit artifactCreated to trigger UI reload (same as initial attempt)
          this.emitArtifactReload(agentResponseMessage);
          this.messageSent.emit(agentResponseMessage);

          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        } else {
          // Retry also failed - show error with manual retry option
          conversationManagerMessage.Error = retryResult?.agentRun?.ErrorMessage || null;
          await this.updateConversationDetail(conversationManagerMessage, `❌ **${agentName}** failed after retry\n\n${retryResult?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        }
      }
    } catch (error) {
      console.error(`❌ Error invoking sub-agent ${agentName}:`, error);

      conversationManagerMessage.Error = String(error);
      await this.updateConversationDetail(conversationManagerMessage, `❌ **${agentName}** encountered an error\n\n${String(error)}`, 'Error');

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Handle silent observation - when Sage stays silent,
   * check if we should continue with the last agent for iterative refinement
   */
  private async handleSilentObservation(
    userMessage: MJConversationDetailEntity,
    conversationId: string
  ): Promise<void> {
    // Find the last AI message (excluding Sage) in the conversation history
    const lastAIMessage = this.conversationHistory
      .slice()
      .reverse()
      .find(msg =>
        msg.Role === 'AI' &&
        msg.AgentID &&
        !UUIDsEqual(msg.AgentID, this.converationManagerAgent?.ID)
      );

    if (!lastAIMessage || !lastAIMessage.AgentID) {
      // No previous specialist agent - just mark user message as complete
      console.log('🔇 No previous specialist agent found - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    // Load the agent entity to get its name
    const previousAgent = AIEngineBase.Instance.Agents.find(a => UUIDsEqual(a.ID, lastAIMessage.AgentID));
    if (!previousAgent) {
      console.warn('⚠️ Could not load previous agent - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    const agentName = previousAgent.Name || 'Agent';

    let previousPayload: any = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;

    // Use pre-loaded artifact data (no DB queries!)
    // Check both user-visible and system artifacts
    let artifacts = this.artifactsByDetailId?.get(lastAIMessage.ID);
    if (!artifacts || artifacts.length === 0) {
      artifacts = this.systemArtifactsByDetailId?.get(lastAIMessage.ID);
    }

    if (artifacts && artifacts.length > 0) {
      try {
        // Use the first artifact (should only be one OUTPUT per message)
        const artifact = artifacts[0];
        const version = await artifact.getVersion();
        if (version.Content) {
          previousPayload = JSON.parse(version.Content);
          previousArtifactInfo = {
            artifactId: artifact.artifactId,
            versionId: artifact.artifactVersionId,
            versionNumber: artifact.versionNumber
          };
          console.log('📦 Loaded previous OUTPUT artifact as payload for continuity', previousArtifactInfo);
        }
      } catch (error) {
        console.warn('⚠️ Could not parse previous artifact content:', error);
      }
    }

    // Create status message showing agent continuity
    const statusMessage = await this.dataCache.createConversationDetail(this.currentUser);

    statusMessage.ConversationID = conversationId;
    statusMessage.Role = 'AI';
    statusMessage.Message = `Continuing with **${agentName}** for refinement...`;
    statusMessage.ParentID = userMessage.ID;
    statusMessage.Status = 'Complete';
    statusMessage.HiddenToUser = false;
    statusMessage.AgentID = this.converationManagerAgent?.ID || null;

    await statusMessage.Save();
    this.messageSent.emit(statusMessage);

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing refinement...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: statusMessage.ID,
      conversationId,
      conversationName: this.conversationName
    });

    try {
      // Invoke the agent with the previous payload
      const continuityResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        'Continuing previous work based on user feedback',
        statusMessage.ID,
        previousPayload,
        this.createProgressCallback(statusMessage, agentName),
        previousArtifactInfo?.artifactId,
        previousArtifactInfo?.versionId,
        undefined, // configurationPresetId not used in this path
        this.appContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (continuityResult && continuityResult.success) {
        // Create response message
        const agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

        agentResponseMessage.ConversationID = conversationId;
        agentResponseMessage.Role = 'AI';
        agentResponseMessage.Message = continuityResult.agentRun?.Message || `✅ **${agentName}** completed refinement`;
        agentResponseMessage.ParentID = statusMessage.ID;
        agentResponseMessage.Status = 'Complete';
        agentResponseMessage.HiddenToUser = false;
        agentResponseMessage.AgentID = lastAIMessage.AgentID;

        await agentResponseMessage.Save();
        this.messageSent.emit(agentResponseMessage);

        // Server created artifacts (handles versioning automatically) - emit event to trigger UI reload
        if (continuityResult.payload && Object.keys(continuityResult.payload).length > 0) {
          this.emitArtifactReload(agentResponseMessage);
          console.log('🎨 Server created artifact (versioned) from agent continuity');
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // Agent failed
        statusMessage.Error = continuityResult?.agentRun?.ErrorMessage || null;
        await this.updateConversationDetail(statusMessage, `❌ **${agentName}** failed during refinement\n\n${continuityResult?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
    } catch (error) {
      console.error(`❌ Error in agent continuity with ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      statusMessage.Error = String(error);
      await this.updateConversationDetail(statusMessage, `❌ **${agentName}** encountered an error\n\n${String(error)}`, 'Error');

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }
 

  /**
   * Invoke an agent directly when mentioned with @ symbol
   * Bypasses Sage completely - no status messages
   */
  private async invokeAgentDirectly(
    userMessage: MJConversationDetailEntity,
    agentMention: Mention,
    conversationId: string
  ): Promise<void> {
    const agentName = agentMention.name;

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: userMessage.ID,
      conversationId,
      conversationName: this.conversationName
    });

    // Declare agentResponseMessage outside try block so it's accessible in catch
    let agentResponseMessage: MJConversationDetailEntity | undefined = undefined;

    try {
      // User message is sent successfully - mark complete immediately
      // (No UI uses User message 'In-Progress' - only AI messages need that status)
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.Agents.find(a => a.Name === agentName);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = userMessage.ID;
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      // Set AgentID immediately for proper attribution
      if (agent?.ID) {
        agentResponseMessage.AgentID = agent.ID;
      }

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = agent?.ID
        ? await this.loadPreviousPayloadForAgent(agent.ID)
        : { payload: null, artifactInfo: null };

      // Invoke the agent directly
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        `User mentioned agent directly with @${agentName}`,
        agentResponseMessage.ID,
        previousPayload, // Pass previous payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId,
        agentMention.configurationId, // Pass configuration preset ID
        this.appContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (result && result.success) {
        if (result.agentRun.AgentID) {
          agentResponseMessage.AgentID = result.agentRun.AgentID;
        }

        // Multi-stage response handling (same logic as ambient Sage)
        // Stage 1: Check for task graph (multi-step orchestration)
        if (result.payload?.taskGraph) {
          console.log('📋 Task graph detected from @mention, starting task orchestration');
          await this.handleTaskGraphExecution(userMessage, result, conversationId, agentResponseMessage);
        }
        // Stage 2: Check for sub-agent invocation (single-step delegation)
        else if (result.agentRun.FinalStep === 'Success' && result.payload?.invokeAgent) {
          console.log('🎯 Sub-agent invocation detected from @mention');
          await this.handleSubAgentInvocation(userMessage, result, conversationId, agentResponseMessage);
        }
        // Stage 3: Normal chat response
        else {
          await this.updateConversationDetail(agentResponseMessage, result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', result)

          // Server created artifacts - emit event to trigger UI reload
          if (result.payload && Object.keys(result.payload).length > 0) {
            this.emitArtifactReload(agentResponseMessage);
            this.messageSent.emit(agentResponseMessage);
          }

          // Mark user message as complete
          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        }
      } else {
        // Agent failed - update the existing message instead of creating a new one
        agentResponseMessage.Error = result?.agentRun?.ErrorMessage || null;
        await this.updateConversationDetail(agentResponseMessage, `❌ **@${agentName}** failed\n\n${result?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
    } catch (error) {
      console.error(`❌ Error invoking mentioned agent ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      // Update the existing agent response message if it was created
      if (agentResponseMessage) {
        agentResponseMessage.Error = String(error);
        await this.updateConversationDetail(agentResponseMessage, `❌ **@${agentName}** encountered an error\n\n${String(error)}`, 'Error');
      }

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Continue with the same agent from previous message (implicit continuation)
   * Bypasses Sage - no status messages
   *
   * @param targetArtifactVersionId Optional specific artifact version to use as payload (from intent check)
   */
  private async continueWithAgent(
    userMessage: MJConversationDetailEntity,
    agentId: string,
    conversationId: string,
    targetArtifactVersionId?: string
  ): Promise<void> {
    // Load the agent entity to get its name
    const agent = AIEngineBase.Instance.Agents.find(a => UUIDsEqual(a.ID, agentId));
    if (!agent) {
      console.warn('⚠️ Could not load agent for continuation - falling back to Sage');
      await this.processMessageThroughAgent(userMessage, { mentions: [], agentMention: null, userMentions: [], entityMentions: [] });
      return;
    }

    const agentName = agent.Name || 'Agent';

    let previousPayload: any = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;
    let previousConfigurationId: string | undefined = undefined;

    // Use targetArtifactVersionId if specified (from intent check)
    if (targetArtifactVersionId) {
      // Find the artifact in pre-loaded data (check both user-visible and system artifacts)
      for (const [detailId, artifacts] of (this.artifactsByDetailId?.entries() || [])) {
        const targetArtifact = artifacts.find(a => a.artifactVersionId === targetArtifactVersionId);
        if (targetArtifact) {
          try {
            // Lazy load the full version entity to get Content
            const version = await targetArtifact.getVersion();
            if (version.Content) {
              previousPayload = JSON.parse(version.Content);
              previousArtifactInfo = {
                artifactId: targetArtifact.artifactId,
                versionId: targetArtifact.artifactVersionId,
                versionNumber: targetArtifact.versionNumber
              };
              console.log('📦 Loaded target artifact version as payload', previousArtifactInfo);
            }
          } catch (error) {
            console.warn('⚠️ Could not load target artifact version:', error);
          }
          break;
        }
      }

      // If not found in user-visible artifacts, check system artifacts
      if (!previousPayload && this.systemArtifactsByDetailId) {
        for (const [detailId, artifacts] of this.systemArtifactsByDetailId.entries()) {
          const targetArtifact = artifacts.find(a => a.artifactVersionId === targetArtifactVersionId);
          if (targetArtifact) {
            try {
              const version = await targetArtifact.getVersion();
              if (version.Content) {
                previousPayload = JSON.parse(version.Content);
                previousArtifactInfo = {
                  artifactId: targetArtifact.artifactId,
                  versionId: targetArtifact.artifactVersionId,
                  versionNumber: targetArtifact.versionNumber
                };
                console.log('📦 Loaded target artifact version as payload (from system artifacts)', previousArtifactInfo);
              }
            } catch (error) {
              console.warn('⚠️ Could not load target artifact version:', error);
            }
            break;
          }
        }
      }
    }

    // Get all messages from this agent in reverse order (most recent first)
    const agentMessages = this.conversationHistory
      .slice()
      .reverse()
      .filter(msg => msg.Role === 'AI' && UUIDsEqual(msg.AgentID, agentId));

    // Extract configuration preset from the User message that @mentioned this agent
    // Uses the shared helper method in the agent service
    previousConfigurationId = this.agentService.findConfigurationPresetFromHistory(agentId, this.conversationHistory);

    // Fall back to the chat header's mode-picker selection when nothing
    // in the message history pinned a preset. The picker reflects the
    // user's persistent per-agent mode preference (Draft / Standard /
    // High) and applies to all subsequent non-mention routes. A
    // history-derived preset still wins because it represents an
    // explicit per-message intent the user expressed earlier.
    if (!previousConfigurationId && this.agentConfigurationPresetId) {
      previousConfigurationId = this.agentConfigurationPresetId;
    }

    // Fall back to searching through all agent messages for an artifact
    // This ensures payload continuity even after clarifying exchanges without artifacts
    if (!previousPayload && agentMessages.length > 0) {
      console.log('📦 Searching through agent messages for most recent artifact...');

      for (const message of agentMessages) {
        // Get artifacts from pre-loaded data (check both user-visible and system artifacts)
        let artifacts = this.artifactsByDetailId?.get(message.ID);
        if (!artifacts || artifacts.length === 0) {
          artifacts = this.systemArtifactsByDetailId?.get(message.ID);
        }

        if (artifacts && artifacts.length > 0) {
          try {
            // Use the first artifact (should only be one OUTPUT per message)
            const artifact = artifacts[0];
            const version = await artifact.getVersion();
            if (version.Content) {
              previousPayload = JSON.parse(version.Content);
              previousArtifactInfo = {
                artifactId: artifact.artifactId,
                versionId: artifact.artifactVersionId,
                versionNumber: artifact.versionNumber
              };
              console.log(`📦 Loaded artifact as payload from message ${message.ID}`, previousArtifactInfo);
              break; // Found an artifact, stop searching
            }
          } catch (error) {
            console.warn('⚠️ Could not parse artifact content:', error);
            // Continue to next message
          }
        }
      }

      if (!previousPayload) {
        console.log(`📦 No artifact found after searching ${agentMessages.length} messages from agent`);
      }
    }

    // Execute the agent with the gathered context
    await this.executeAgentContinuation(
      userMessage,
      agentId,
      agentName,
      conversationId,
      previousPayload,
      previousArtifactInfo,
      previousConfigurationId
    );
  }

  /**
   * Executes agent continuation with all context already gathered.
   * This is the shared execution logic used by both continueWithAgent and direct Sage config path.
   *
   * @param userMessage The user's message entity
   * @param agentId The agent ID to invoke
   * @param agentName The agent's display name
   * @param conversationId The conversation ID
   * @param previousPayload Optional payload from previous artifact
   * @param previousArtifactInfo Optional artifact info (id, versionId, versionNumber)
   * @param configurationId Optional configuration preset ID to use
   */
  private async executeAgentContinuation(
    userMessage: MJConversationDetailEntity,
    agentId: string,
    agentName: string,
    conversationId: string,
    previousPayload: Record<string, unknown> | null,
    previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null,
    configurationId?: string
  ): Promise<void> {
    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: userMessage.ID,
      conversationId,
      conversationName: this.conversationName
    });

    // Declare agentResponseMessage outside try block so it's accessible in catch
    let agentResponseMessage: MJConversationDetailEntity | undefined = undefined;

    try {
      // User message is sent successfully - mark complete immediately
      // (No UI uses User message 'In-Progress' - only AI messages need that status)
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.messageSent.emit(userMessage);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.currentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = userMessage.ID;
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      agentResponseMessage.AgentID = agentId;

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.messageSent.emit(agentResponseMessage);

      // Invoke the agent directly (continuation) with previous payload if available.
      // `this.appContext` is forwarded so direct-routed sub-agents (e.g. Form
      // Builder via [defaultAgentId]) see the embedder's ActiveForm/Schema/
      // OverrideID block in their prompt — same flow Sage gets via
      // `processMessage`.
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.conversationHistory,
        'Continuing previous conversation with user',
        agentResponseMessage.ID,
        previousPayload, // Pass previous OUTPUT artifact payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        previousArtifactInfo?.artifactId,
        previousArtifactInfo?.versionId,
        configurationId, // Pass configuration for continuity
        this.appContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (result && result.success) {
        // Update the response message with agent result
        await this.updateConversationDetail(agentResponseMessage,result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', result);

        // Server created artifacts (handles versioning) - emit event to trigger UI reload
        if (result.payload && Object.keys(result.payload).length > 0) {
          this.emitArtifactReload(agentResponseMessage);
          this.messageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // Agent failed - update the existing message instead of creating a new one
        agentResponseMessage.Error = result?.agentRun?.ErrorMessage || null;
        await this.updateConversationDetail(agentResponseMessage, `❌ **${agentName}** failed\n\n${result?.agentRun?.ErrorMessage || 'Unknown error'}`, 'Error');

        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
    } catch (error) {
      console.error(`❌ Error continuing with agent ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      // Update the existing agent response message if it was created
      if (agentResponseMessage) {
        agentResponseMessage.Error = String(error);
        await this.updateConversationDetail(agentResponseMessage, `❌ **${agentName}** encountered an error\n\n${String(error)}`, 'Error');
      }

      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    }
  }

  /**
   * Names the conversation from its first message via the SHARED naming helper
   * ({@link GenerateAndApplyConversationName}) — the same implementation the realtime
   * session path uses. This wrapper keeps the composer-specific concerns local:
   * mention stripping and the sidebar rename animation event.
   */
  private async nameConversation(message: string, conversationId: string): Promise<void> {
    // Convert message to plain text (strips JSON-encoded mentions like @{"id":"...","name":"Sage"} to @Sage)
    const plainTextMessage = this.mentionParser.toPlainText(
      message,
      this.mentionAutocomplete.getAvailableAgents(),
      this.mentionAutocomplete.getAvailableUsers()
    );

    // Use the captured conversationId (not this.conversationId): naming runs fire-and-forget
    // in the background, so the user may have swapped conversations before it resolves.
    const result = await GenerateAndApplyConversationName({
      ConversationId: conversationId,
      MessageText: plainTextMessage,
      Provider: this.ProviderToUse as GraphQLDataProvider,
      CurrentUser: this.currentUser
    });

    if (result) {
      // Emit event for animation in conversation list
      this.conversationRenamed.emit({
        conversationId,
        name: result.Name,
        description: result.Description
      });
      console.log(`✅ Conversation renamed to: "${result.Name}"`);
    }
  }

  /**
   * Marks a conversation detail as complete and records timestamp to prevent race conditions
   * Emits event to parent to refresh agent run data from database
   */
  private markMessageComplete(conversationDetail: MJConversationDetailEntity): void {
    const now = Date.now();
    this.completionTimestamps.set(conversationDetail.ID, now);

    // Unregister streaming callback for this message (no more updates needed)
    const callback = this.registeredCallbacks.get(conversationDetail.ID);
    if (callback) {
      this.streamingService.unregisterMessageCallback(conversationDetail.ID, callback);
      this.registeredCallbacks.delete(conversationDetail.ID);
      console.log(`[MarkComplete] Unregistered streaming callback for completed message ${conversationDetail.ID}`);
    }

    // Remove task from active tasks if it exists
    const task = this.activeTasks.getByConversationDetailId(conversationDetail.ID);
    if (task) {
      console.log(`✅ Task found for message ${conversationDetail.ID} - removing from active tasks:`, {
        taskId: task.id,
        agentName: task.agentName,
        conversationId: task.conversationId,
        conversationName: task.conversationName
      });

      this.activeTasks.remove(task.id);

      // Show toast only if the user isn't currently viewing this conversation.
      // If they're watching, the inline completion is sufficient.
      const isConvoVisible = UUIDsEqual(this.bridge.ActiveConversationID$.value, task.conversationId)
        && (this.bridge.OverlayActive$.value || this.bridge.WorkspaceActive$.value);
      if (!isConvoVisible) {
        MJNotificationService.Instance?.CreateSimpleNotification(
          `${task.agentName} completed in ${task.conversationName || 'conversation'}`,
          'success',
          3000
        );
      }
    } else {
      console.warn(`⚠️ No task found for completed message ${conversationDetail.ID} - task may have been removed prematurely or not added`);
    }

    // Emit completion event to parent so it can refresh agent run data
    this.messageComplete.emit({
      conversationId: conversationDetail.ConversationID,
      conversationDetailId: conversationDetail.ID,
      agentId: conversationDetail.AgentID || undefined
    });
  }

  /**
   * Emit an artifact-reload signal for {@link detail}. The artifact metadata fields are
   * placeholders — the parent reloads the real artifacts from the DB; the only fields it
   * consumes are conversationDetailId and conversationId (the latter lets it drop events from
   * a background conversation after a conversation swap). conversationId is taken from the
   * detail entity's immutable ConversationID, never this.conversationId.
   */
  private emitArtifactReload(detail: MJConversationDetailEntity): void {
    this.artifactCreated.emit({
      conversationId: detail.ConversationID,
      artifactId: '',
      versionId: '',
      versionNumber: 0,
      conversationDetailId: detail.ID,
      name: ''
    });
  }

  /**
   * Cleans up completion timestamps for completed messages (prevents memory leak)
   */
  private cleanupCompletionTimestamp(conversationDetailId: string): void {
    // Keep timestamp for a short period to catch any late progress updates
    setTimeout(() => {
      this.completionTimestamps.delete(conversationDetailId);
    }, 5000); // 5 seconds should be more than enough
  }
}
