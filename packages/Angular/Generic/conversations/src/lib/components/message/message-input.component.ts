import { Component, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, Metadata, LogStatusEx } from '@memberjunction/core';
import { MJConversationDetailEntity, MJEnvironmentEntityExtended, ConversationEngine, UserInfoEngine, TaskGraphSubmitOperation, type TaskGraphSubmitInput } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, AppContextSnapshot } from "@memberjunction/ai-core-plus";
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { BeforeAgentTurnEventArgs, AfterAgentTurnEventArgs } from '../../events/chat-events';
import type { AgentReplyMode, AgentTurnHandler, AgentTurnRequest, AgentTurnResult, AgentTurnTarget } from '../../models/agent-turn.model';
import { ResolveAgentTurn, FindDisallowedTaskGraphAgents, type AgentTurnCandidates, type AgentTurnRules } from '../../utils/agent-turn-routing';
import {
  ApplyRoutingDecision,
  ArtifactVersionForTurn,
  RunRoutingDecision,
  ShouldRunRoutingDecision
} from '../../utils/decision-routing';
import {
  BuildRecentTurns,
  BuildRoutingArtifactVersions,
  CanAskRoutingDecision,
  CollectRoutingParticipants,
  IsAgentAllowed,
  type RoutingArtifactVersion,
  type RoutingCatalogAgent,
  type RoutingDecisionInput,
  type RoutingDecisionOutcome,
  type RoutingParticipant
} from '@memberjunction/ai-core-plus';
import type { MentionPerson } from '@memberjunction/conversations-runtime';
import { DataCacheService } from '../../services/data-cache.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { ConversationStreamingService, MessageProgressUpdate, MessageProgressMetadata } from '../../services/conversation-streaming.service';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { GenerateAndApplyConversationName } from '../../services/conversation-naming';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ExecuteAgentResult, AgentExecutionProgressCallback, AgentResponseForm, ActionableCommand, AutomaticCommand, ConversationUtility, agentFailureDisposition, agentFailureMessage } from '@memberjunction/ai-core-plus';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { AiComposerComponent } from '../composer/ai-composer.component';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { MentionParserService } from '../../services/mention-parser.service';
import { ConversationAttachmentService } from '../../services/conversation-attachment.service';
import { Mention, MentionParseResult } from '../../models/conversation-state.model';
import { PlanModePreference } from '../../utils/plan-mode-preference';
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
import { UUIDsEqual, CleanAndParseJSON } from '@memberjunction/global';
import { InjectFrameZone } from '../../util/frame-zone';

/** Streamed-delta render cadence where no animation frame will come (hidden tab, no rAF). */
const STREAMED_FRAME_FALLBACK_MS = 50;

@Component({
  standalone: false,
  selector: 'mj-message-input',
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.css'
})
export class MessageInputComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit  {
  // Default artifact type ID for JSON (when agent doesn't specify DefaultArtifactTypeID)
  private readonly JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';

  @Input() ConversationId!: string;

  /** @deprecated Use {@link ConversationId}. */
  @Input() set conversationId(value: string) {
    this.ConversationId = value;
  }
  /** @deprecated Use {@link ConversationId}. */
  get conversationId(): string {
    return this.ConversationId;
  }
  @Input() ConversationName?: string | null;

  /** @deprecated Use {@link ConversationName}. */
  @Input() set conversationName(value: string | null | undefined) {
    this.ConversationName = value;
  }
  /** @deprecated Use {@link ConversationName}. */
  get conversationName(): string | null | undefined {
    return this.ConversationName;
  } // For task tracking display
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() Disabled: boolean = false;

  /** @deprecated Use {@link Disabled}. */
  @Input() set disabled(value: boolean) {
    this.Disabled = value;
  }
  /** @deprecated Use {@link Disabled}. */
  get disabled(): boolean {
    return this.Disabled;
  }
  /**
   * Blocks sending. Distinct from {@link Disabled}, which means the composer is busy.
   */
  @Input() ReadOnly = false;
  @Input() Placeholder: string = 'Type a message... (Ctrl+Enter to send)';

  /** @deprecated Use {@link Placeholder}. */
  @Input() set placeholder(value: string) {
    this.Placeholder = value;
  }
  /** @deprecated Use {@link Placeholder}. */
  get placeholder(): string {
    return this.Placeholder;
  }
  @Input() ParentMessageId?: string;

  /** @deprecated Use {@link ParentMessageId}. */
  @Input() set parentMessageId(value: string | undefined) {
    this.ParentMessageId = value;
  }
  /** @deprecated Use {@link ParentMessageId}. */
  get parentMessageId(): string | undefined {
    return this.ParentMessageId;
  } // Optional: for replying in threads
  @Input() EnableAttachments: boolean = true;

  /** @deprecated Use {@link EnableAttachments}. */
  @Input() set enableAttachments(value: boolean) {
    this.EnableAttachments = value;
  }
  /** @deprecated Use {@link EnableAttachments}. */
  get enableAttachments(): boolean {
    return this.EnableAttachments;
  } // Whether to show attachment button (based on agent modality support)
  @Input() EnableMentions: boolean = true;

  /** @deprecated Use {@link EnableMentions}. */
  @Input() set enableMentions(value: boolean) {
    this.EnableMentions = value;
  }
  /** @deprecated Use {@link EnableMentions}. */
  get enableMentions(): boolean {
    return this.EnableMentions;
  } // Whether to enable @-mention autocomplete (agents/users). Hosts addressing a single fixed agent (e.g. Form Builder cockpit) typically set false.
  // Per-type caps under enableMentions (all default true) — forwarded to the AI composer's
  // EnableAgentMentions/EnableEntityMentions/EnableSkillCommands. Let a host keep '/' skill
  // commands while dropping '@' agent mentions (which would override a pinned default agent).
  @Input() EnableAgentMentions: boolean = true;

  /** @deprecated Use {@link EnableAgentMentions}. */
  @Input() set enableAgentMentions(value: boolean) {
    this.EnableAgentMentions = value;
  }
  /** @deprecated Use {@link EnableAgentMentions}. */
  get enableAgentMentions(): boolean {
    return this.EnableAgentMentions;
  }
  @Input() EnableEntityMentions: boolean = true;

  /** @deprecated Use {@link EnableEntityMentions}. */
  @Input() set enableEntityMentions(value: boolean) {
    this.EnableEntityMentions = value;
  }
  /** @deprecated Use {@link EnableEntityMentions}. */
  get enableEntityMentions(): boolean {
    return this.EnableEntityMentions;
  }
  @Input() EnableSkillCommands: boolean = true;

  /** @deprecated Use {@link EnableSkillCommands}. */
  @Input() set enableSkillCommands(value: boolean) {
    this.EnableSkillCommands = value;
  }
  /** @deprecated Use {@link EnableSkillCommands}. */
  get enableSkillCommands(): boolean {
    return this.EnableSkillCommands;
  }
  @Input() EnablePlanMode: boolean = true;

  /** @deprecated Use {@link EnablePlanMode}. */
  @Input() set enablePlanMode(value: boolean) {
    this.EnablePlanMode = value;
  }
  /** @deprecated Use {@link EnablePlanMode}. */
  get enablePlanMode(): boolean {
    return this.EnablePlanMode;
  } // Whether the composer shows the Plan Mode toggle. Hosts that don't expose plan-mode workflows set false.
  @Input() EnableRealtime: boolean = true;

  /** @deprecated Use {@link EnableRealtime}. */
  @Input() set enableRealtime(value: boolean) {
    this.EnableRealtime = value;
  }
  /** @deprecated Use {@link EnableRealtime}. */
  get enableRealtime(): boolean {
    return this.EnableRealtime;
  } // Whether the composer shows the realtime voice-call launcher/options. Hosts without a voice experience set false.
  @Input() MaxAttachments: number = 10;

  /** @deprecated Use {@link MaxAttachments}. */
  @Input() set maxAttachments(value: number) {
    this.MaxAttachments = value;
  }
  /** @deprecated Use {@link MaxAttachments}. */
  get maxAttachments(): number {
    return this.MaxAttachments;
  } // Maximum number of attachments per message
  @Input() MaxAttachmentSizeBytes: number = 20 * 1024 * 1024;

  /** @deprecated Use {@link MaxAttachmentSizeBytes}. */
  @Input() set maxAttachmentSizeBytes(value: number) {
    this.MaxAttachmentSizeBytes = value;
  }
  /** @deprecated Use {@link MaxAttachmentSizeBytes}. */
  get maxAttachmentSizeBytes(): number {
    return this.MaxAttachmentSizeBytes;
  } // Maximum size per attachment (20MB default)
  @Input() AcceptedFileTypes: string = 'image/*';

  /** @deprecated Use {@link AcceptedFileTypes}. */
  @Input() set acceptedFileTypes(value: string) {
    this.AcceptedFileTypes = value;
  }
  /** @deprecated Use {@link AcceptedFileTypes}. */
  get acceptedFileTypes(): string {
    return this.AcceptedFileTypes;
  } // Accepted MIME types pattern
  @Input() ArtifactsByDetailId?: Map<string, LazyArtifactInfo[]>;

  /** @deprecated Use {@link ArtifactsByDetailId}. */
  @Input() set artifactsByDetailId(value: Map<string, LazyArtifactInfo[]> | undefined) {
    this.ArtifactsByDetailId = value;
  }
  /** @deprecated Use {@link ArtifactsByDetailId}. */
  get artifactsByDetailId(): Map<string, LazyArtifactInfo[]> | undefined {
    return this.ArtifactsByDetailId;
  } // Pre-loaded artifact data for performance
  @Input() SystemArtifactsByDetailId?: Map<string, LazyArtifactInfo[]>;

  /** @deprecated Use {@link SystemArtifactsByDetailId}. */
  @Input() set systemArtifactsByDetailId(value: Map<string, LazyArtifactInfo[]> | undefined) {
    this.SystemArtifactsByDetailId = value;
  }
  /** @deprecated Use {@link SystemArtifactsByDetailId}. */
  get systemArtifactsByDetailId(): Map<string, LazyArtifactInfo[]> | undefined {
    return this.SystemArtifactsByDetailId;
  } // Pre-loaded system artifact data (Visibility='System Only')
  @Input() AgentRunsByDetailId?: Map<string, MJAIAgentRunEntityExtended>;

  /** @deprecated Use {@link AgentRunsByDetailId}. */
  @Input() set agentRunsByDetailId(value: Map<string, MJAIAgentRunEntityExtended> | undefined) {
    this.AgentRunsByDetailId = value;
  }
  /** @deprecated Use {@link AgentRunsByDetailId}. */
  get agentRunsByDetailId(): Map<string, MJAIAgentRunEntityExtended> | undefined {
    return this.AgentRunsByDetailId;
  } // Pre-loaded agent run data for performance
  @Input() EmptyStateMode: boolean = false;

  /** @deprecated Use {@link EmptyStateMode}. */
  @Input() set emptyStateMode(value: boolean) {
    this.EmptyStateMode = value;
  }
  /** @deprecated Use {@link EmptyStateMode}. */
  get emptyStateMode(): boolean {
    return this.EmptyStateMode;
  } // When true, emits emptyStateSubmit instead of creating messages directly
  @Input() AppContext: Record<string, unknown> | null = null;

  /** @deprecated Use {@link AppContext}. */
  @Input() set appContext(value: Record<string, unknown> | null) {
    this.AppContext = value;
  }
  /** @deprecated Use {@link AppContext}. */
  get appContext(): Record<string, unknown> | null {
    return this.AppContext;
  } // Application context for AI agent awareness

  /**
   * Plan Mode toggle state — sticky PER CONVERSATION, OFF by default (no behavior change unless
   * the user turns it on). When on, the user's next message(s) in THIS conversation request Plan
   * Mode: the routed root agent must present a plan for approval before executing Actions/
   * Sub-Agents. The toggle is always shown and the server enforces the `AIAgent.SupportsPlanMode`
   * capability — a plan-mode request to an agent that doesn't support it simply no-ops the gate
   * (see resolvePlanModeGate), so we don't need to resolve "the current agent" client-side.
   *
   * IMPORTANT: this is a GETTER over {@link PlanModePreference} (UserInfoEngine-backed), NOT a
   * local field. The composer is mounted in multiple places at once (empty-state, chat-area,
   * thread panel) — a local boolean per instance goes stale the moment another instance toggles.
   * On the new-conversation composer (no conversationId yet) the value lives in a pending bucket
   * that transfers to the real conversation on its first message. Approving a plan turns the
   * conversation's flag OFF automatically (see message-item's plan-decision handling).
   */
  public get PlanModeEnabled(): boolean {
    return PlanModePreference.IsEnabled(this.ConversationId);
  }

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
    const chipData = this.InputBox?.getMentionChipsData() || [];
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
  @Input() DefaultAgentId: string | null = null;

  /** @deprecated Use {@link DefaultAgentId}. */
  @Input() set defaultAgentId(value: string | null) {
    this.DefaultAgentId = value;
  }
  /** @deprecated Use {@link DefaultAgentId}. */
  get defaultAgentId(): string | null {
    return this.DefaultAgentId;
  }

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
  @Input() ConversationDefaultAgentId: string | null = null;

  /** @deprecated Use {@link ConversationDefaultAgentId}. */
  @Input() set conversationDefaultAgentId(value: string | null) {
    this.ConversationDefaultAgentId = value;
  }
  /** @deprecated Use {@link ConversationDefaultAgentId}. */
  get conversationDefaultAgentId(): string | null {
    return this.ConversationDefaultAgentId;
  }

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
  @Input() AgentConfigurationPresetId: string | null = null;

  /** @deprecated Use {@link AgentConfigurationPresetId}. */
  @Input() set agentConfigurationPresetId(value: string | null) {
    this.AgentConfigurationPresetId = value;
  }
  /** @deprecated Use {@link AgentConfigurationPresetId}. */
  get agentConfigurationPresetId(): string | null {
    return this.AgentConfigurationPresetId;
  }

  // Initial message to send automatically - using getter/setter for precise control
  private _initialMessage: string | null = null;
  private _initialAttachments: PendingAttachment[] | null = null;
  private _isComponentReady = false; // Track if component is ready to send
  /** Conversation this input has already auto-sent its pending first message for. */
  private _autoSentForConversationId: string | null = null;

  @Input()
  set InitialMessage(value: string | null) {
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
  get InitialMessage(): string | null {
    return this._initialMessage;
  }

  /** @deprecated Use {@link InitialMessage}. */
  get initialMessage(): string | null {
    return this.InitialMessage;
  }
  /** @deprecated Use {@link InitialMessage}. */
  @Input() set initialMessage(value: string | null) {
    this.InitialMessage = value;
  }

  @Input()
  set InitialAttachments(value: PendingAttachment[] | null) {
    this._initialAttachments = value;
  }
  get InitialAttachments(): PendingAttachment[] | null {
    return this._initialAttachments;
  }

  /** @deprecated Use {@link InitialAttachments}. */
  get initialAttachments(): PendingAttachment[] | null {
    return this.InitialAttachments;
  }
  /** @deprecated Use {@link InitialAttachments}. */
  @Input() set initialAttachments(value: PendingAttachment[] | null) {
    this.InitialAttachments = value;
  }

  private _conversationHistory: MJConversationDetailEntity[] = [];
  @Input()
  public get ConversationHistory(): MJConversationDetailEntity[] {
    return this._conversationHistory;
  }
  public set ConversationHistory(value: MJConversationDetailEntity[]) {
    this._conversationHistory = value;
  }

  /** @deprecated Use {@link ConversationHistory}. */
  public get conversationHistory(): MJConversationDetailEntity[] {
    return this.ConversationHistory;
  }
  /** @deprecated Use {@link ConversationHistory}. */
  @Input() public set conversationHistory(value: MJConversationDetailEntity[]) {
    this.ConversationHistory = value;
  }

  // Message IDs that are in-progress and need streaming reconnection
  // Using getter/setter to react immediately when value changes (avoids timing issues with ngOnChanges)
  private _inProgressMessageIds?: string[];
  @Input()
  set InProgressMessageIds(value: string[] | undefined) {
    this._inProgressMessageIds = value;
    // React immediately when input changes (after component initialized)
    // This ensures callbacks are registered without relying on ngOnChanges timing
    if (this.streamingService && value && value.length > 0) {
      this.ReconnectInProgressMessages();
    } else if (this.streamingService) {
      // Empty/undefined — e.g. this input was backgrounded by a conversation swap
      // ([] is bound to non-active inputs). Drop any streaming callbacks so a hidden
      // input isn't left subscribed; reconnectInProgressMessages re-registers when it
      // becomes active again with a non-empty list.
      this.unregisterAllCallbacks();
    }
  }
  get InProgressMessageIds(): string[] | undefined {
    return this._inProgressMessageIds;
  }

  /** @deprecated Use {@link InProgressMessageIds}. */
  get inProgressMessageIds(): string[] | undefined {
    return this.InProgressMessageIds;
  }
  /** @deprecated Use {@link InProgressMessageIds}. */
  @Input() set inProgressMessageIds(value: string[] | undefined) {
    this.InProgressMessageIds = value;
  }

  /**
   * Application context for the current conversation. Threaded through from the
   * chat-area component for inclusion in the {@link beforeAgentTurn} event payload —
   * lets listeners reason about which app's chat surface is invoking the agent.
   * Optional; defaults to null for surfaces with no app context.
   */
  @Input() ApplicationId: string | null = null;

  /** @deprecated Use {@link ApplicationId}. */
  @Input() set applicationId(value: string | null) {
    this.ApplicationId = value;
  }
  /** @deprecated Use {@link ApplicationId}. */
  get applicationId(): string | null {
    return this.ApplicationId;
  }

  // ── Host rules for agent turns ──────────────────────────────────────────
  // All opt-in. Left at their defaults, every message is answered exactly as before.

  /**
   * When a message starts an agent turn. `'Always'` (the default) answers every message, as
   * before. `'MentionOnly'` answers only a message that tags an agent; any other message is
   * posted with no turn at all — no reply row, no placeholder, no turn events — which is what a
   * chat between several people needs.
   */
  @Input() AgentReplyMode: AgentReplyMode = 'Always';

  /**
   * The agents that may answer here. Narrows the composer's '@' list, every route (a tagged
   * agent, continuity, the pinned and host default agents, the conversation manager) and the
   * conversation manager's delegation, including each agent step of a workflow it plans. A tagged
   * agent outside the list is ignored. Null (the default) allows every agent the user can run;
   * an empty list allows none.
   */
  @Input() AllowedAgentIDs: readonly string[] | null = null;

  /**
   * The people the composer's '@' list offers, such as the chat's members. Null (the default)
   * offers only the current user, as before.
   */
  @Input() MentionPeople: readonly MentionPerson[] | null = null;

  /**
   * The first moment of the conversation an agent turn may read. The server loads the agent's
   * history from there and uses no summary of earlier messages; the run's own reads of the
   * conversation (history tools, attached artifacts, the previous output it continues from)
   * start there too, and so does the continuity route, which considers only replies written at
   * or after it. Sent to the server only when set, so leaving it null keeps working against an
   * MJAPI that predates it (one that predates it rejects a turn that sets it, rather than
   * reading past the floor). Null (the default) reads the whole conversation.
   */
  @Input() AgentHistoryFrom: Date | null = null;

  /**
   * Runs agent turns on the host's server instead of MJ's own path. The chat area still picks
   * the agent and fires {@link BeforeAgentTurn}; it then calls the handler once per turn, before
   * any reply row exists, and shows the rows the handler reports. Null (the default) runs turns
   * on MJ's path.
   */
  @Input() AgentTurnHandler: AgentTurnHandler | null = null;

  /**
   * Whether MJ names a new conversation from its first message. True (the default) keeps
   * today's behavior; a host that names its own chats turns it off.
   */
  @Input() AutoNameConversation: boolean = true;

  /**
   * Whether an unmentioned message asks one typed decision which agent in the conversation should
   * answer it, instead of always going back to the last agent that answered. The same call can
   * name the artifact version the message modifies. The answer replaces continuity only when it
   * is confident and arrives in time; an error, a slow or unsure answer keeps today's routing, and
   * a tagged message or a form response makes no call (see `decision-routing.ts`). False (the
   * default) changes nothing: no call, and today's routing.
   *
   * What goes to the model: each qualifying message sends these to the model behind the
   * `Default Decision` prompt, which can be a different vendor from the agents' own: the first
   * 1,000 characters of the new message, the last 6 turns (150 characters each), each participant's
   * name, description and last reply, and the names of their artifact versions. Each call writes an
   * `MJ: AI Prompt Runs` row, even when the answer comes too late to be used.
   */
  @Input() EnableDecisionRouting: boolean = false;

  @Output() MessageSent = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link MessageSent}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (messageSent) keeps working. Must stay AFTER MessageSent: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() messageSent = this.MessageSent;
  /**
   * A streamed final-response delta was applied to an in-progress message: `Message` holds the
   * full reply so far. Informational, so no Before/After pair; coalesced to at most one emission
   * per animation frame; silent once the message has settled, because the completion path owns
   * the final render. Hosts refresh the bubble in place on this, while {@link MessageSent} keeps
   * announcing new and status-changed messages.
   */
  @Output() MessageStreamed = new EventEmitter<MJConversationDetailEntity>();
  @Output() AgentResponse = new EventEmitter<{message: MJConversationDetailEntity, agentResult: any}>();

  /**
   * @deprecated Use {@link AgentResponse}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (agentResponse) keeps working. Must stay AFTER AgentResponse: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() agentResponse = this.AgentResponse;

  /**
   * Cancelable — fired once per agent turn, on every route, after routing has picked the agent
   * and BEFORE any reply row exists. Listeners may set `event.Cancel = true` to stop the turn
   * (nothing more is written, and {@link AfterAgentTurn} does not fire) or set
   * `event.RedirectAgentId` to send it to another allowed agent. A message that starts no turn
   * fires nothing. Follows MJ's established Before/After cancelable event pattern.
   */
  @Output() BeforeAgentTurn = new EventEmitter<BeforeAgentTurnEventArgs>();

  /**
   * @deprecated Use {@link BeforeAgentTurn}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeAgentTurn) keeps working. Must stay AFTER BeforeAgentTurn: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeAgentTurn = this.BeforeAgentTurn;

  /**
   * Fired AFTER a successful agent turn, on every route. Carries the agent run id and the
   * full agent result. Not fired when {@link BeforeAgentTurn} was canceled, when the turn
   * failed, or when a host {@link AgentTurnHandler} reported no result.
   */
  @Output() AfterAgentTurn = new EventEmitter<AfterAgentTurnEventArgs>();

  /**
   * @deprecated Use {@link AfterAgentTurn}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterAgentTurn) keeps working. Must stay AFTER AfterAgentTurn: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterAgentTurn = this.AfterAgentTurn;
  // conversationId is carried on every agent-lifecycle event so the parent chat-area can drop
  // events emitted by a BACKGROUND conversation's (hidden, still-streaming) input after the user
  // has swapped conversations — preventing cross-conversation state/cache bleed. Sourced from the
  // ConversationDetail entity's ConversationID (the captured, immutable value), never this.conversationId.
  @Output() AgentRunDetected = new EventEmitter<{conversationId: string; conversationDetailId: string; agentRunId: string}>();

  /**
   * @deprecated Use {@link AgentRunDetected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (agentRunDetected) keeps working. Must stay AFTER AgentRunDetected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() agentRunDetected = this.AgentRunDetected;
  @Output() AgentRunUpdate = new EventEmitter<{conversationId: string; conversationDetailId: string; agentRun?: any, agentRunId?: string}>();

  /**
   * @deprecated Use {@link AgentRunUpdate}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (agentRunUpdate) keeps working. Must stay AFTER AgentRunUpdate: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() agentRunUpdate = this.AgentRunUpdate; // Emits when agent run data updates during progress
  @Output() MessageComplete = new EventEmitter<{conversationId: string; conversationDetailId: string; agentId?: string}>();

  /**
   * @deprecated Use {@link MessageComplete}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (messageComplete) keeps working. Must stay AFTER MessageComplete: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() messageComplete = this.MessageComplete; // Emits when message completes (success or error)
  @Output() ArtifactCreated = new EventEmitter<{conversationId: string; artifactId: string; versionId: string; versionNumber: number; conversationDetailId: string; name: string}>();

  /**
   * @deprecated Use {@link ArtifactCreated}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (artifactCreated) keeps working. Must stay AFTER ArtifactCreated: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() artifactCreated = this.ArtifactCreated;
  @Output() ConversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();

  /**
   * @deprecated Use {@link ConversationRenamed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationRenamed) keeps working. Must stay AFTER ConversationRenamed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationRenamed = this.ConversationRenamed;
  @Output() IntentCheckStarted = new EventEmitter<{conversationId: string}>();

  /**
   * @deprecated Use {@link IntentCheckStarted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (intentCheckStarted) keeps working. Must stay AFTER IntentCheckStarted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() intentCheckStarted = this.IntentCheckStarted; // Emits when intent checking starts
  @Output() IntentCheckCompleted = new EventEmitter<{conversationId: string}>();

  /**
   * @deprecated Use {@link IntentCheckCompleted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (intentCheckCompleted) keeps working. Must stay AFTER IntentCheckCompleted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() intentCheckCompleted = this.IntentCheckCompleted; // Emits when intent checking completes (carries conversationId so the parent can drop a background conversation's completion after a swap — symmetric with intentCheckStarted)
  @Output() InitialMessageAutoSendStarted = new EventEmitter<{conversationId: string}>();

  /**
   * @deprecated Use {@link InitialMessageAutoSendStarted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (initialMessageAutoSendStarted) keeps working. Must stay AFTER InitialMessageAutoSendStarted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() initialMessageAutoSendStarted = this.InitialMessageAutoSendStarted; // Emitted when this input latches the pending first message for auto-send
  @Output() InitialMessageAutoSendFailed = new EventEmitter<{conversationId: string}>();

  /**
   * @deprecated Use {@link InitialMessageAutoSendFailed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (initialMessageAutoSendFailed) keeps working. Must stay AFTER InitialMessageAutoSendFailed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() initialMessageAutoSendFailed = this.InitialMessageAutoSendFailed; // Emitted when a latched pending first message fails before messageSent
  @Output() EmptyStateSubmit = new EventEmitter<{text: string; attachments: PendingAttachment[]}>();

  /**
   * @deprecated Use {@link EmptyStateSubmit}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (emptyStateSubmit) keeps working. Must stay AFTER EmptyStateSubmit: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() emptyStateSubmit = this.EmptyStateSubmit; // Emitted when in emptyStateMode
  @Output() UploadStateChanged = new EventEmitter<{isUploading: boolean; message: string}>();

  /**
   * @deprecated Use {@link UploadStateChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (uploadStateChanged) keeps working. Must stay AFTER UploadStateChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() uploadStateChanged = this.UploadStateChanged; // Emits when attachment upload state changes

  @ViewChild('inputBox') InputBox!: AiComposerComponent;

  /** @deprecated Use {@link InputBox}. */
  get inputBox(): AiComposerComponent {
    return this.InputBox;
  }
  /** @deprecated Use {@link InputBox}. */
  set inputBox(value: AiComposerComponent) {
    this.InputBox = value;
  }

  private _messageText: string = '';
  /**
   * The composer's text. An accessor pair rather than a plain field because every write reaches the
   * editor through `[value]` -> `ngModel.writeValue`, which rebuilds or empties the chip DOM WITHOUT
   * emitting `valueChange` — so a write is exactly the event {@link mentionedAgentId} has to hear
   * about, and the setter is the one place that cannot be bypassed.
   *
   * Bypassing it is not hypothetical: `handleSuccessfulSend` and the empty-state submit clear the
   * text without touching the editor, and `conversation-chat-area` assigns `messageText` on this
   * component from the outside (three call sites). Invalidating at the individual call sites instead
   * would leave every future one to remember.
   *
   * Read is a plain field read; there is no two-way `ngModel` on this property (the template binds
   * `[value]="messageText"` one-way), so the pair is transparent to callers.
   */
  public get MessageText(): string {
    return this._messageText;
  }
  public set MessageText(value: string) {
    this._messageText = value;
    this.mentionedAgentId = undefined;
  }

  /** @deprecated Use {@link MessageText}. */
  public get messageText(): string {
    return this.MessageText;
  }
  /** @deprecated Use {@link MessageText}. */
  public set messageText(value: string) {
    this.MessageText = value;
  }

  /**
   * Prefills the composer with draft text WITHOUT sending (unlike pendingMessage,
   * which auto-sends) and focuses the input — e.g. the omnibar's '@agent' flow
   * lands in chat with '@AgentName ' staged so the user just types their ask.
   */
  /**
   * Draft text to stage in the composer when this input mounts (NOT sent — unlike
   * pendingMessage). Applied once per distinct value, view-readiness-proof: if the
   * view isn't up yet, ngAfterViewInit applies it. Emits initialDraftApplied so the
   * host can clear its pending state.
   */
  @Input()
  set InitialDraft(value: string | null) {
    if (value && value !== this.appliedInitialDraft) {
      this.appliedInitialDraft = value;
      if (this.InputBox) {
        this.SetDraft(value, true);
        this.InitialDraftApplied.emit();
      } else {
        this.pendingInitialDraft = value;
      }
    }
  }
  get InitialDraft(): string | null {
    return this.appliedInitialDraft;
  }

  /** @deprecated Use {@link InitialDraft}. */
  get initialDraft(): string | null {
    return this.InitialDraft;
  }
  /** @deprecated Use {@link InitialDraft}. */
  @Input() set initialDraft(value: string | null) {
    this.InitialDraft = value;
  }
  private appliedInitialDraft: string | null = null;
  private pendingInitialDraft: string | null = null;

  @Output() InitialDraftApplied = new EventEmitter<void>();

  /**
   * @deprecated Use {@link InitialDraftApplied}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (initialDraftApplied) keeps working. Must stay AFTER InitialDraftApplied: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() initialDraftApplied = this.InitialDraftApplied;

  /**
   * Live draft-state signal: fires on every composer value change with the
   * SERIALIZED content (mention pills encoded via getPlainTextWithJsonMentions,
   * so hosts can persist drafts losslessly). Empty string = draft cleared.
   */
  @Output() DraftStateChanged = new EventEmitter<string>();

  /** The composer lost focus — hosts flush persisted drafts on this. */
  @Output() ComposerBlurred = new EventEmitter<void>();

  /** Handles the composer's value stream: keeps messageText in sync + emits draft state. */
  public OnComposerValueChanged(value: string): void {
    this.MessageText = value;
    this.DraftStateChanged.emit(this.GetSerializedDraft());
  }

  /** Current composer content in the lossless serialized form ('' when empty). */
  public GetSerializedDraft(): string {
    const serialized = this.InputBox?.getPlainTextWithJsonMentions() ?? this.MessageText ?? '';
    return serialized.trim().length === 0 ? '' : serialized;
  }

  /**
   * Pre-addresses the composer to an agent as a RESOLVED mention pill (+ trailing
   * space, caret after, focused) — identical to the user typing '@agent' and picking
   * it from the dropdown. Resolves the agent through MentionAutocompleteService so
   * the chip carries the agent's real id/icon/presets; falls back to a plain-text
   * '@Name ' draft when the agent can't be resolved (e.g. name mismatch).
   *
   * @returns false while the composer view isn't mounted yet — callers may retry.
   */
  public async InsertAgentMention(agentName: string, focus: boolean = true, clearExisting: boolean = true): Promise<boolean> {
    if (!this.InputBox) {
      console.log(`[Omnibar→Chat] InsertAgentMention('${agentName}'): input box not mounted yet — caller will retry`);
      return false;
    }
    if (clearExisting) {
      // Pre-addressing REPLACES any un-sent draft (tagging agent B after agent A
      // must not stack pills).
      this.InputBox.mentionEditor?.clear();
      this.MessageText = '';
    }
    try {
      if (!this.mentionAutocomplete.IsInitialized && this.CurrentUser) {
        console.log(`[Omnibar→Chat] InsertAgentMention('${agentName}'): initializing mention autocomplete…`);
        await this.mentionAutocomplete.initialize(this.CurrentUser);
      }
      const wanted = agentName.trim().toLowerCase();
      const suggestion = this.mentionAutocomplete
        .getSuggestions(agentName, false, '@')
        .find(s => s.type === 'agent' && s.name.trim().toLowerCase() === wanted);
      if (suggestion) {
        const inserted = this.InputBox.InsertMention(suggestion, focus);
        console.log(`[Omnibar→Chat] InsertAgentMention('${agentName}'): resolved to pill (id=${suggestion.id}) — insert ${inserted ? 'OK' : 'FAILED (editor view not ready)'}`);
        if (inserted) {
          if (focus) {
            this.scheduleFocusReassert(agentName);
          }
          return true;
        }
        return false; // editor view not mounted — caller retries
      }
      console.warn(`[Omnibar→Chat] InsertAgentMention('${agentName}'): agent NOT found in autocomplete (initialized=${this.mentionAutocomplete.IsInitialized}) — falling back to plain text`);
    } catch (e) {
      console.warn(`[Omnibar→Chat] InsertAgentMention('${agentName}'): resolution error — falling back to plain text`, e);
    }
    const mention = agentName.includes(' ') ? `@"${agentName}" ` : `@${agentName} `;
    this.SetDraft(mention, focus);
    return true;
  }

  /**
   * The insert happens mid-tab-mount; late-arriving chat UI (lists, empty-state
   * autofocus, tab chrome) can steal focus AFTER we set it. Re-assert at settle
   * points — only when focus genuinely left the editor, so we never fight the user.
   */
  private scheduleFocusReassert(context: string): void {
    for (const delay of [300, 900, 1800]) {
      setTimeout(() => {
        const editor = this.InputBox?.mentionEditor;
        if (editor && !editor.HasFocus) {
          const ok = editor.FocusCaretAtEnd();
          console.log(`[Omnibar→Chat] focus re-assert (+${delay}ms) for '${context}': ${ok ? 'refocused' : 'editor gone'}`);
        }
      }, delay);
    }
  }

  public SetDraft(text: string, focus: boolean = true): void {
    this.MessageText = text;
    if (focus) {
      // The composer mounts/binds on the next tick after messageText flows down.
      setTimeout(() => this.InputBox?.focus(), 50);
    }
  }
  public IsSending: boolean = false;

  /** @deprecated Use {@link IsSending}. */
  public get isSending(): boolean {
    return this.IsSending;
  }
  /** @deprecated Use {@link IsSending}. */
  public set isSending(value: boolean) {
    this.IsSending = value;
  }
  public IsProcessing: boolean = false;

  /** @deprecated Use {@link IsProcessing}. */
  public get isProcessing(): boolean {
    return this.IsProcessing;
  }
  /** @deprecated Use {@link IsProcessing}. */
  public set isProcessing(value: boolean) {
    this.IsProcessing = value;
  } // True when waiting for agent/naming response
  public ProcessingMessage: string = 'AI is responding...';

  /** @deprecated Use {@link ProcessingMessage}. */
  public get processingMessage(): string {
    return this.ProcessingMessage;
  }
  /** @deprecated Use {@link ProcessingMessage}. */
  public set processingMessage(value: string) {
    this.ProcessingMessage = value;
  } // Message shown during processing
  public IsUploadingAttachments: boolean = false;

  /** @deprecated Use {@link IsUploadingAttachments}. */
  public get isUploadingAttachments(): boolean {
    return this.IsUploadingAttachments;
  }
  /** @deprecated Use {@link IsUploadingAttachments}. */
  public set isUploadingAttachments(value: boolean) {
    this.IsUploadingAttachments = value;
  } // True when uploading attachments to server
  public UploadingMessage: string = 'Uploading attachments...';

  /** @deprecated Use {@link UploadingMessage}. */
  public get uploadingMessage(): string {
    return this.UploadingMessage;
  }
  /** @deprecated Use {@link UploadingMessage}. */
  public set uploadingMessage(value: string) {
    this.UploadingMessage = value;
  } // Message shown during upload
  public ConverationManagerAgent: MJAIAgentEntityExtended | null = null;

  /** @deprecated Use {@link ConverationManagerAgent}. */
  public get converationManagerAgent(): MJAIAgentEntityExtended | null {
    return this.ConverationManagerAgent;
  }
  /** @deprecated Use {@link ConverationManagerAgent}. */
  public set converationManagerAgent(value: MJAIAgentEntityExtended | null) {
    this.ConverationManagerAgent = value;
  }

  // Track completion timestamps to prevent race conditions with late progress updates
  private completionTimestamps = new Map<string, number>();
  private readonly ngZone = InjectFrameZone();
  // Track registered streaming callbacks for cleanup
  private registeredCallbacks = new Map<string, (progress: MessageProgressUpdate) => Promise<void>>();
  // After a post-ACK disconnect, keep observing ConversationDetail.Status until
  // the *server* writes Complete/Error (MaxTimePerRun terminates the run).
  // Back off 5s → 15s → 60s so we bound polling cost, not invent a client
  // verdict. Do not paint Error here — that would unregister the streaming
  // callback and make a later server Complete sticky-wrong until reload.
  private static readonly IN_FLIGHT_WATCH_BACKOFF_MS = [5_000, 15_000, 60_000] as const;
  private inFlightWatches = new Map<string, ReturnType<typeof setTimeout>>();

  // Track pending attachments from the input box
  private pendingAttachments: PendingAttachment[] = [];

  private engine = ConversationEngine.Instance;
  // Shared AI mention/suggestion engine (BaseSingleton — same instance the composer plugins use)
  private mentionAutocomplete = MentionAutocompleteService.Instance;

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private agentService: ConversationAgentService,
    private dataCache: DataCacheService,
    private activeTasks: ActiveTasksService,
    private streamingService: ConversationStreamingService,
    private mentionParser: MentionParserService,
    private attachmentService: ConversationAttachmentService,
    private bridge: ConversationBridgeService,
    private realtimeSession: RealtimeSessionService
  ) {
  super();}

  // ── Voice session (Realtime Co-Agent) ───────────────────────────────
  /** True while a live voice session is active — drives the overlay + mic state. */
  public VoiceActive: boolean = false;

  /** @deprecated Use {@link VoiceActive}. */
  public get voiceActive(): boolean {
    return this.VoiceActive;
  }
  /** @deprecated Use {@link VoiceActive}. */
  public set voiceActive(value: boolean) {
    this.VoiceActive = value;
  }
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
      this.VoiceActive = active;
    });

    this.ConverationManagerAgent = await this.agentService.getConversationManagerAgent();

    // Warm UserInfoEngine so the PlanModeEnabled getter has the cached settings available
    // (no-op when already loaded; failure just leaves the toggle at its default OFF).
    PlanModePreference.Warm();

    // Initialize mention autocomplete (needed for parsing mentions in messages)
    await this.mentionAutocomplete.initialize(this.CurrentUser);

    // Reconnect to any in-progress messages for streaming updates (via global streaming service)
    this.ReconnectInProgressMessages();
  }

  ngOnChanges(changes: SimpleChanges) {
    // When conversation changes, focus the input
    if (changes['conversationId'] && !changes['conversationId'].firstChange) {
      this.focusInput();
    }
    // Note: initialMessage/initialAttachments handled by setters, inProgressMessageIds handled by setter
  }

  ngAfterViewInit() {
    if (this.pendingInitialDraft) {
      const draft = this.pendingInitialDraft;
      this.pendingInitialDraft = null;
      // next tick — the composer's own view finishes mounting first
      setTimeout(() => {
        this.SetDraft(draft, true);
        this.InitialDraftApplied.emit();
      }, 50);
    }
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
    if (this.ReadOnly) {
      return;
    }
    const message = this._initialMessage;
    const attachments = this._initialAttachments;
    const hasContent = !!message || !!(attachments && attachments.length > 0);

    if (!hasContent || !this.ConversationId || UUIDsEqual(this._autoSentForConversationId, this.ConversationId)) {
      return;
    }
    this._autoSentForConversationId = this.ConversationId;

    // Set pending attachments before sending
    if (attachments && attachments.length > 0) {
      this.pendingAttachments = [...attachments];
    }

    Promise.resolve().then(() => {
      this.InitialMessageAutoSendStarted.emit({ conversationId: this.ConversationId });
    });

    // Use setTimeout to ensure we're outside of change detection cycle
    setTimeout(async () => {
      const sent = await this.SendMessageWithText(message || '');
      if (!sent) {
        this._autoSentForConversationId = null;
        this.InitialMessageAutoSendFailed.emit({ conversationId: this.ConversationId });
      }
    }, 100);
  }

  ngOnDestroy() {
    // Unregister all streaming callbacks
    this.unregisterAllCallbacks();
    this.clearInFlightWatches();
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
   * skipping any agent outside {@link AllowedAgentIDs}. {@link AgentReplyMode} does not apply:
   * starting a call is itself a choice to talk to an agent. Returns null when Sage failed to
   * load, or when the host allows none of these agents.
   */
  public ResolveCurrentAgentId(): string | null {
    const target = ResolveAgentTurn(
      this.agentTurnCandidates([]),
      { ReplyMode: 'Always', AllowedAgentIDs: this.AllowedAgentIDs },
      () => true
    );
    return target?.AgentId ?? null;
  }

  /** @deprecated Use {@link ResolveCurrentAgentId}. */
  public resolveCurrentAgentId(): string | null {
    return this.ResolveCurrentAgentId();
  }

  /**
   * The agent the '/' skill picker should narrow to. Mirrors routing's priority: an explicit
   * `@agent` chip already in the draft wins (routeMessage's Priority 1), else the agent the message
   * would otherwise go to ({@link resolveCurrentAgentId}). Bound to `mj-ai-composer`'s
   * `TargetAgentId`; null = unknown, no narrowing.
   */
  public get PickerTargetAgentId(): string | null {
    if (this.mentionedAgentId === undefined) {
      const chips = this.InputBox?.getMentionChipsData() || [];
      this.mentionedAgentId = chips.find(chip => chip.type === 'agent')?.id ?? null;
    }
    return this.mentionedAgentId ?? this.ResolveCurrentAgentId();
  }

  /** @deprecated Use {@link PickerTargetAgentId}. */
  public get pickerTargetAgentId(): string | null {
    return this.PickerTargetAgentId;
  }

  /**
   * Memo for the first `@agent` chip in the draft, so the template-bound
   * {@link pickerTargetAgentId} does not walk the editor DOM on every change-detection cycle.
   *
   * `undefined` = dirty, recompute on next read; `null` = computed, no `@agent` chip present.
   * The two are NOT interchangeable — collapsing them to `null` is what makes a cleared or restored
   * draft read as "no chip" forever.
   *
   * Invalidated from {@link messageText}'s setter, which is the only choke point every chip change
   * passes through. Chips reach the editor by two kinds of path and only one announces itself:
   *
   *   - user editing (autocomplete insert, backspace-delete, `InsertMention`) and `clear()` all end
   *     in the editor's `onInput()`, which emits `valueChange` -> {@link OnComposerValueChanged},
   *     which assigns `messageText`;
   *   - a programmatic write — a restored draft (`[initialDraft]` -> {@link SetDraft}), a post-send
   *     reset, or a host assigning `messageText` directly — goes `[value]` ->
   *     `ngModel.writeValue` -> `setEditorContent`, which rebuilds the chips with `appendChild` (or
   *     empties the editor) and never calls `onInput()`. No `valueChange`, so no hook fires.
   *
   * Invalidate-and-lazy rather than eager refresh, because an eager read in the setter would be too
   * early: `ngModel` writes the editor on a later change-detection pass, so the read would predate
   * the chips it wants. Marking dirty is timing-independent — the recompute happens on the next
   * read, by which point the editor holds the new content.
   *
   * The picker can be opened by the Skills button as well as by typing `/`, so "the next keystroke
   * would repair it" is not a defence: the button path takes whatever the memo holds.
   */
  private mentionedAgentId: string | null | undefined = undefined;

  /** True when the mic button should be enabled (have an agent + not disabled). */
  public get CanStartRealtime(): boolean {
    return !this.ReadOnly && !this.Disabled && !this.VoiceActive && !!this.ResolveCurrentAgentId();
  }

  /** @deprecated Use {@link CanStartRealtime}. */
  public get canStartRealtime(): boolean {
    return this.CanStartRealtime;
  }

  /**
   * Display name of the agent the voice session fronts. Resolved here (this component
   * owns the conversation's routing context) and passed to RealtimeSessionService at
   * session start so the chat-area-hosted overlay can read it from the service.
   */
  private resolveRealtimeAgentName(): string {
    const agentId = this.ResolveCurrentAgentId();
    if (agentId) {
      const match = this.mentionAutocomplete
        .getAvailableAgents()
        .find(a => UUIDsEqual(a.ID, agentId));
      if (match?.Name) {
        return match.Name;
      }
    }
    return this.ConverationManagerAgent?.Name ?? 'Sage';
  }

  /** True while the "Start a voice call with…" agent picker popover is open. */
  public ShowRealtimeAgentPicker: boolean = false;

  /** @deprecated Use {@link ShowRealtimeAgentPicker}. */
  public get showRealtimeAgentPicker(): boolean {
    return this.ShowRealtimeAgentPicker;
  }
  /** @deprecated Use {@link ShowRealtimeAgentPicker}. */
  public set showRealtimeAgentPicker(value: boolean) {
    this.ShowRealtimeAgentPicker = value;
  }

  /**
   * CDK connected-overlay positions for the voice agent picker. Preferred: open UPWARD,
   * right edge aligned to the composer's right edge (matching the old absolute placement).
   * Fallback: open downward when there isn't room above. Because the popover renders in the
   * body-level CDK overlay container (with `cdkConnectedOverlayPush`), it escapes the chat
   * overlay's `overflow: hidden` border and can never clip at the top of a narrow overlay.
   */
  public readonly PickerOverlayPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  ];

  /** @deprecated Use {@link PickerOverlayPositions}. */
  public get pickerOverlayPositions(): ConnectedPosition[] {
    return this.PickerOverlayPositions;
  }

  /**
   * `MJ: User Settings` key persisting the user's co-agent choice for realtime calls
   * (server-side, cross-device — never localStorage). Stored shape: `{"coAgentId":
   * string | null}` — `null` is an explicit "Auto" choice that overwrites an older pick.
   */
  private static readonly coAgentPrefKey = 'mj.realtimeVoice.coAgent.v1';

  /**
   * The persisted co-agent preference, loaded just before the picker opens (and read by
   * the instant-start path). `null` = no preference / explicit "Auto".
   */
  public VoicePickerDefaultCoAgentId: string | null = null;

  /** @deprecated Use {@link VoicePickerDefaultCoAgentId}. */
  public get voicePickerDefaultCoAgentId(): string | null {
    return this.VoicePickerDefaultCoAgentId;
  }
  /** @deprecated Use {@link VoicePickerDefaultCoAgentId}. */
  public set voicePickerDefaultCoAgentId(value: string | null) {
    this.VoicePickerDefaultCoAgentId = value;
  }

  /**
   * Agents the voice picker offers — the same cached set the @mention
   * autocomplete and {@link resolveRealtimeAgentName} use, narrowed to
   * {@link AllowedAgentIDs}, so the picker can never offer an agent the
   * conversation couldn't otherwise route to.
   */
  public get VoicePickerAgents(): MJAIAgentEntityExtended[] {
    const agents = this.mentionAutocomplete.getAvailableAgents();
    const allowed = this.AllowedAgentIDs;
    if (allowed == null) {
      return agents;
    }
    // Memoized on both inputs: the picker binds this getter, and a fresh array on every
    // change-detection pass would look like a new input each time.
    const memo = this.voicePickerAgentsMemo;
    if (memo && memo.Source === agents && memo.Allowed === allowed) {
      return memo.Result;
    }
    const result = agents.filter(agent => IsAgentAllowed(agent.ID, allowed));
    this.voicePickerAgentsMemo = { Source: agents, Allowed: allowed, Result: result };
    return result;
  }
  private voicePickerAgentsMemo: {
    Source: MJAIAgentEntityExtended[];
    Allowed: readonly string[];
    Result: MJAIAgentEntityExtended[];
  } | null = null;

  /** @deprecated Use {@link VoicePickerAgents}. */
  public get voicePickerAgents(): MJAIAgentEntityExtended[] {
    return this.VoicePickerAgents;
  }

  /**
   * The ACTIVE Realtime-type co-agent candidates — the same run-permission-filtered
   * cached set as {@link voicePickerAgents}, narrowed to the Realtime agent type. The
   * picker shows its co-agent selector only when more than one exists.
   */
  public get VoicePickerCoAgents(): MJAIAgentEntityExtended[] {
    return FilterRealtimeCoAgents(this.mentionAutocomplete.getAvailableAgents());
  }

  /** @deprecated Use {@link VoicePickerCoAgents}. */
  public get voicePickerCoAgents(): MJAIAgentEntityExtended[] {
    return this.VoicePickerCoAgents;
  }

  /** The agent the default resolution would call — preselected in the picker. */
  public get VoicePickerDefaultAgentId(): string | null {
    return this.ResolveCurrentAgentId();
  }

  /** @deprecated Use {@link VoicePickerDefaultAgentId}. */
  public get voicePickerDefaultAgentId(): string | null {
    return this.VoicePickerDefaultAgentId;
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
  public async OnStartRealtime(): Promise<void> {
    if (!this.CanStartRealtime) {
      return;
    }
    // New/empty conversation (no prior agent turn): let the user choose who
    // to call. Falls through to the immediate path if the agent cache is
    // empty (nothing to pick from — the resolved default is the only option).
    if (!this.findLastNonSageAgentId() && this.VoicePickerAgents.length > 0) {
      await this.openRealtimeAgentPicker();
      return;
    }
    const targetAgentId = this.ResolveCurrentAgentId();
    if (!targetAgentId) {
      this.toastService.error('No agent available for a voice session.');
      return;
    }
    const coAgentId = await this.resolveInstantCoAgentId(targetAgentId);
    await this.startRealtimeWithAgent(targetAgentId, this.resolveRealtimeAgentName(), null, coAgentId);
  }

  /** @deprecated Use {@link OnStartRealtime}. */
  public async onStartRealtime(): Promise<void> {
    return this.OnStartRealtime();
  }

  /**
   * Caret-next-to-the-phone click: open the agent/co-agent/model picker ON DEMAND, even
   * when the conversation already has agent history (where the plain phone click
   * instant-starts). The resolved agent is preselected, so "open → Start" matches the
   * instant path while keeping the co-agent (and, for authorized users, voice-model)
   * choice one click away. Falls through to the instant path when there is nothing to
   * pick from.
   */
  public async OnRealtimeOptions(): Promise<void> {
    if (!this.CanStartRealtime) {
      return;
    }
    if (this.VoicePickerAgents.length > 0) {
      await this.openRealtimeAgentPicker();
      return;
    }
    void this.OnStartRealtime();
  }

  /** @deprecated Use {@link OnRealtimeOptions}. */
  public async onRealtimeOptions(): Promise<void> {
    return this.OnRealtimeOptions();
  }

  /** Loads the persisted co-agent preference, then shows the picker (pref preselected). */
  private async openRealtimeAgentPicker(): Promise<void> {
    this.VoicePickerDefaultCoAgentId = await this.loadPersistedCoAgentId();
    this.ShowRealtimeAgentPicker = true;
  }

  /** User confirmed an agent (+ optional co-agent / voice model) in the voice picker — start the call. */
  public async OnRealtimeAgentPicked(pick: RealtimeAgentPick): Promise<void> {
    this.ShowRealtimeAgentPicker = false;
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

  /** @deprecated Use {@link OnRealtimeAgentPicked}. */
  public async onRealtimeAgentPicked(pick: RealtimeAgentPick): Promise<void> {
    return this.OnRealtimeAgentPicked(pick);
  }

  /**
   * Reads the persisted co-agent preference from `MJ: User Settings` (via
   * `UserInfoEngine`'s cached settings). Defensive: any failure or malformed payload
   * resolves to `null` (Auto — the server's co-agent resolution chain).
   */
  private async loadPersistedCoAgentId(): Promise<string | null> {
    try {
      await UserInfoEngine.Instance.Config();
      const raw = UserInfoEngine.Instance.GetSetting(MessageInputComponent.coAgentPrefKey);
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
        MessageInputComponent.coAgentPrefKey,
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
    const isValidCandidate = this.VoicePickerCoAgents.some(a => UUIDsEqual(a.ID, preferred));
    if (!isValidCandidate) {
      return null;
    }
    const pairings = await LoadCoAgentPairings(this.ProviderToUse, preferred);
    return PairingsAllowTarget(pairings, targetAgentId) ? preferred : null;
  }

  /** User dismissed the voice picker without starting a call. */
  public OnRealtimeAgentPickerCancelled(): void {
    this.ShowRealtimeAgentPicker = false;
  }

  /** @deprecated Use {@link OnRealtimeAgentPickerCancelled}. */
  public onRealtimeAgentPickerCancelled(): void {
    return this.OnRealtimeAgentPickerCancelled();
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
        this.ConversationId,
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
        this.ApplicationId,
        this.AppContext as AppContextSnapshot | null
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
      if (this.InputBox) {
        this.InputBox.focus();
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
  public ReconnectInProgressMessages(): void {
    if (!this.InProgressMessageIds || this.InProgressMessageIds.length === 0) {
      return;
    }

    // Unregister any previously registered callbacks for this component
    this.unregisterAllCallbacks();

    // Register new callbacks for each in-progress message
    for (const messageId of this.InProgressMessageIds) {
      // Create callback bound to this message ID
      const callback = this.createMessageProgressCallback(messageId);

      // Store reference for cleanup
      this.registeredCallbacks.set(messageId, callback);

      // Register with streaming service
      this.streamingService.registerMessageCallback(messageId, callback);
    }
  }

  /** @deprecated Use {@link ReconnectInProgressMessages}. */
  public reconnectInProgressMessages(): void {
    return this.ReconnectInProgressMessages();
  }

  /**
   * Create a progress callback for a specific message ID.
   * This callback will be invoked by the streaming service when progress updates arrive.
   */
  /**
   * Emits {@link MessageStreamed} for a coalesced frame of streamed deltas, unless the message
   * settled in the meantime: then the completion path has already reconciled the bubble and a
   * late frame has nothing to add. Settled is read off the captured entity's status and off the
   * callback registration, which markMessageComplete drops: a frame can sleep through completion
   * in a hidden tab, and the registration outlasts every other trace of it.
   */
  private emitStreamedUpdate(messageId: string, message: MJConversationDetailEntity): void {
    if (message.Status !== 'In-Progress' || !this.registeredCallbacks.has(messageId)) {
      return;
    }
    if (this.MessageStreamed.observed) {
      this.MessageStreamed.emit(message);
    } else {
      // TRANSITIONAL: a host that still binds only the old output keeps streaming on MessageSent at
      // the coalesced cadence. Remove once direct hosts bind MessageStreamed. Re-enters the zone
      // because MessageSent handlers replace template-bound state.
      this.ngZone.run(() => this.MessageSent.emit(message));
    }
  }

  /**
   * Runs `callback` on the next animation frame, outside Angular: the in-place render checks its
   * own child view, so a zone-triggered application tick per frame would be pure waste, and the
   * paths that do touch template-bound state re-enter the zone themselves. A hidden tab never
   * paints a frame, so there (and without requestAnimationFrame) a short timer stands in; the
   * browser throttles it in the background, the right cadence for a bubble nobody is looking at.
   */
  private scheduleFrame(callback: () => void): void {
    this.ngZone.runOutsideAngular(() => {
      if (typeof requestAnimationFrame === 'function' && !document.hidden) {
        requestAnimationFrame(callback);
      } else {
        setTimeout(callback, STREAMED_FRAME_FALLBACK_MS);
      }
    });
  }

  private createMessageProgressCallback(messageId: string): (progress: MessageProgressUpdate) => Promise<void> {
    // Resolve the message once and reuse it for the callback's lifetime: streamed
    // final-response updates arrive per content delta, and re-awaiting the cache on
    // every delta both wastes work and (on a cold cache) races concurrent loads.
    let resolvedMessage: Awaited<ReturnType<DataCacheService['getConversationDetail']>> = null;
    // One pending frame per message: deltas arriving inside a frame collapse into one emission.
    let streamedFramePending = false;
    return async (progress: MessageProgressUpdate) => {
      try {
        // Get message from cache (single source of truth)
        const message = (resolvedMessage ??= await this.dataCache.getConversationDetail(messageId, this.CurrentUser));

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

        // Streamed final-response content: the service accumulates deltas, so
        // progress.streaming.content is always the full reply text so far — assign it.
        // The completion flow (above guards + the 'complete' path) reconciles the
        // bubble with the server-saved final message, so no append/merge is needed here.
        if (progress.streaming) {
          message.Message = progress.streaming.content;
          if (!streamedFramePending) {
            streamedFramePending = true;
            this.scheduleFrame(() => {
              streamedFramePending = false;
              this.emitStreamedUpdate(messageId, message);
            });
            // Keep the tasks dropdown on a stable status line rather than the growing reply text.
            this.activeTasks.updateStatusByConversationDetailId(message.ID, 'Responding…');
          }
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
        this.MessageSent.emit(message);

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

  get CanSend(): boolean {
    return !this.ReadOnly && !this.Disabled && !this.IsSending && this.MessageText.trim().length > 0;
  }

  /** @deprecated Use {@link CanSend}. */
  get canSend(): boolean {
    return this.CanSend;
  }

  /**
   * Handle attachments changed from the input box
   */
  OnAttachmentsChanged(attachments: PendingAttachment[]): void {
    this.pendingAttachments = attachments;
  }

  /** @deprecated Use {@link OnAttachmentsChanged}. */
  onAttachmentsChanged(attachments: PendingAttachment[]): void {
    return this.OnAttachmentsChanged(attachments);
  }

  /**
   * Handle attachment errors from the input box
   */
  OnAttachmentError(error: string): void {
    this.toastService.error(error);
  }

  /** @deprecated Use {@link OnAttachmentError}. */
  onAttachmentError(error: string): void {
    return this.OnAttachmentError(error);
  }

  /**
   * Handle text submitted from the input box
   */
  async OnTextSubmitted(text: string): Promise<void> {
    if (this.ReadOnly) {
      return;
    }
    // Check if we have either text or attachments
    const hasText = text && text.trim().length > 0;
    const hasAttachments = this.pendingAttachments.length > 0;

    if (!hasText && !hasAttachments) {
      return;
    }

    // In empty state mode, just emit the data and let parent handle conversation creation
    if (this.EmptyStateMode) {
      const attachmentsToEmit = [...this.pendingAttachments];
      this.pendingAttachments = [];
      this.MessageText = '';
      this.EmptyStateSubmit.emit({ text: text?.trim() || '', attachments: attachmentsToEmit });
      return;
    }

    this.IsSending = true;

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
          this.IsUploadingAttachments = true;
          this.UploadingMessage = `Uploading ${attachmentsToSave.length} attachment${attachmentsToSave.length > 1 ? 's' : ''}...`;
          this.UploadStateChanged.emit({ isUploading: true, message: this.UploadingMessage });

          let attachmentRejection: string | null = null;
          try {
            await this.attachmentService.saveAttachments(
              messageDetail.ID,
              attachmentsToSave,
              this.CurrentUser
            );
          } catch (attachmentError) {
            console.error('Failed to save attachments:', attachmentError);
            attachmentRejection = attachmentError instanceof Error
              ? attachmentError.message
              : 'Some attachments could not be saved';
          } finally {
            this.IsUploadingAttachments = false;
            this.UploadStateChanged.emit({ isUploading: false, message: '' });
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
            this.IsSending = false;
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
      this.IsSending = false;
    }
  }

  /** @deprecated Use {@link OnTextSubmitted}. */
  async onTextSubmitted(text: string): Promise<void> {
    return this.OnTextSubmitted(text);
  }

  /**
   * Toggle sticky Plan Mode for THIS conversation (or the pending-new bucket on the
   * new-conversation composer). Writes through {@link PlanModePreference} — the
   * {@link PlanModeEnabled} getter reads the same cached setting, so ALL live composer
   * instances flip together, and the value survives component recreation and sessions
   * until the user turns it off or approves a plan.
   */
  public TogglePlanMode(): void {
    PlanModePreference.Set(this.ConversationId, !this.PlanModeEnabled);
  }

  async OnSend(): Promise<void> {
    if (!this.CanSend) return;

    this.IsSending = true;
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
      this.IsSending = false;
    }
  }

  /** @deprecated Use {@link OnSend}. */
  async onSend(): Promise<void> {
    return this.OnSend();
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
  public async SendMessageWithText(text: string, extraAttachments?: PendingAttachment[]): Promise<boolean> {
    if (this.ReadOnly) {
      return false;
    }
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

    if (this.IsSending) {
      return false;
    }

    this.IsSending = true;
    const attachmentsToSave = merged;

    try {
      const detail = await this.dataCache.createConversationDetail(this.CurrentUser);
      detail.ConversationID = this.ConversationId;
      detail.Message = text?.trim() || '';
      detail.Role = 'User';
      detail.UserID = this.CurrentUser.ID; // Set the user who sent the message

      if (this.ParentMessageId) {
        detail.ParentID = this.ParentMessageId;
      }

      const saved = await detail.Save();

      if (saved) {
        // Save attachments if any were pending
        if (attachmentsToSave.length > 0) {
          // Show upload indicator for attachments
          this.IsUploadingAttachments = true;
          this.UploadingMessage = `Uploading ${attachmentsToSave.length} attachment${attachmentsToSave.length > 1 ? 's' : ''}...`;
          this.UploadStateChanged.emit({ isUploading: true, message: this.UploadingMessage });

          let attachmentRejection: string | null = null;
          try {
            await this.attachmentService.saveAttachments(
              detail.ID,
              attachmentsToSave,
              this.CurrentUser
            );
          } catch (attachmentError) {
            console.error('Failed to save attachments:', attachmentError);
            attachmentRejection = attachmentError instanceof Error
              ? attachmentError.message
              : 'Some attachments could not be saved';
          } finally {
            this.IsUploadingAttachments = false;
            this.UploadStateChanged.emit({ isUploading: false, message: '' });
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
            this.IsSending = false;
            return false;
          }
        }

        // Clear pending attachments after successful send
        this.pendingAttachments = [];

        // Also clear the mention editor's content + its own attachments list.
        // The user-initiated send path (MessageInputBoxComponent.onSendClick)
        // calls mentionEditor.clear() — we bypass that path here, so the chips
        // would otherwise stay on screen after the message goes out.
        this.InputBox?.mentionEditor?.clear();

        this.MessageSent.emit(detail);

        const mentionResult = this.parseMentionsFromMessage(detail.Message);
        const isFirstMessage = this.ConversationHistory.length === 0;
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
      this.IsSending = false;
    }
  }

  /** @deprecated Use {@link SendMessageWithText}. */
  public async sendMessageWithText(text: string, extraAttachments?: PendingAttachment[]): Promise<boolean> {
    return this.SendMessageWithText(text, extraAttachments);
  }

  /**
   * Creates and configures a new conversation detail message
   */
  private async createMessageDetail(): Promise<MJConversationDetailEntity> {
    const detail = await this.dataCache.createConversationDetail(this.CurrentUser);

    detail.ConversationID = this.ConversationId;
    detail.Message = this.MessageText.trim();
    detail.Role = 'User';
    detail.UserID = this.CurrentUser.ID; // Set the user who sent the message

    if (this.ParentMessageId) {
      detail.ParentID = this.ParentMessageId;
    }

    return detail;
  }

  /**
   * Creates and configures a new conversation detail message from provided text
   */
  private async createMessageDetailFromText(text: string): Promise<MJConversationDetailEntity> {
    const detail = await this.dataCache.createConversationDetail(this.CurrentUser);

    detail.ConversationID = this.ConversationId;
    detail.Message = text;
    detail.Role = 'User';
    detail.UserID = this.CurrentUser.ID; // Set the user who sent the message

    if (this.ParentMessageId) {
      detail.ParentID = this.ParentMessageId;
    }

    return detail;
  }

  /**
   * Handles successful message send - routes to appropriate agent
   */
  private async handleSuccessfulSend(messageDetail: MJConversationDetailEntity): Promise<void> {
    this.MessageSent.emit(messageDetail);
    this.MessageText = '';

    const mentionResult = this.parseMentionsFromMessage(messageDetail.Message);
    const isFirstMessage = this.ConversationHistory.length === 0;

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
   * Routes a saved message to the agent that answers it — or to none.
   *
   * Routing picks the agent ({@link resolveAgentTurnTarget}): a tagged agent, then (under
   * `AgentReplyMode` `'Always'`) the last agent that answered, the conversation's pinned agent,
   * the host's default agent, and the conversation manager, each only if the host allows it.
   * With {@link EnableDecisionRouting} on, a routing decision may first put another agent in the
   * last agent's place ({@link decideAgentRouting}).
   * {@link BeforeAgentTurn} is then fired once, before any reply row exists, and the turn runs on
   * MJ's path or through the host's {@link AgentTurnHandler}.
   */
  private async routeMessage(
    messageDetail: MJConversationDetailEntity,
    mentionResult: MentionParseResult,
    isFirstMessage: boolean
  ): Promise<void> {
    // A Plan Mode choice made on the new-conversation composer (no conversation yet) lives in a
    // pending bucket — the FIRST routed message claims it onto the real conversation so the
    // toggle carries across the empty-state → chat-area transition without bleeding into other
    // conversations.
    if (isFirstMessage && messageDetail.ConversationID) {
      PlanModePreference.ClaimPendingNew(messageDetail.ConversationID);
    }

    // Snapshot user-requested skills once, before any routing branch, so every invocation path
    // forwards the same set for this message. Derived from the SAVED MESSAGE TEXT via the shared
    // MentionParser (`@{"type":"skill",…}` JSON mentions — same encoding as @agent/#entity), so the
    // source of truth is the message itself, not composer DOM state. Chip-DOM read is the fallback
    // for any path where the parsed result isn't available.
    this._pendingRequestedSkillIDs = mentionResult.skillMentions?.length
      ? mentionResult.skillMentions.map(m => m.id)
      : this.collectRequestedSkillIDs();

    // Naming is about the conversation, not the turn, so it doesn't wait on (or depend on) one.
    // It runs in the background: naming can take minutes to time out.
    if (isFirstMessage && this.AutoNameConversation) {
      void this.nameConversation(messageDetail.Message, messageDetail.ConversationID)
        .catch(error => console.error('Conversation naming failed:', error));
    }

    // Read the candidates before any await. This composer stays cached while the person opens
    // another conversation, and the chat area then rebinds its history and pinned agent, so a
    // read after the routing decision could see another conversation's state (or none).
    const candidates = this.agentTurnCandidates(this.agentMentionIds(mentionResult));
    const routing = await this.decideAgentRouting(messageDetail, candidates);
    const target = this.resolveAgentTurnTarget(candidates, routing);
    if (!target) {
      await this.finishWithoutAgentTurn(messageDetail, 'NoAgent');
      return;
    }
    const turn = this.announceAgentTurn(messageDetail, target);
    if (!turn) {
      await this.finishWithoutAgentTurn(messageDetail, 'Declined');
      return;
    }
    await this.runAgentTurn(messageDetail, mentionResult, turn, routing);
  }

  /**
   * Asks the routing decision for this message when {@link EnableDecisionRouting} is on and the
   * message qualifies (see `ShouldRunRoutingDecision`). Returns null, with no call, otherwise, and
   * when anything fails: the message then keeps today's routing.
   *
   * @param candidates The turn's candidates, read before any await (see {@link routeMessage}).
   */
  private async decideAgentRouting(
    message: MJConversationDetailEntity,
    candidates: AgentTurnCandidates
  ): Promise<RoutingDecisionOutcome | null> {
    const continuityAgentId = candidates.ContinuityAgentId;
    const qualifies = ShouldRunRoutingDecision({
      Enabled: this.EnableDecisionRouting,
      ReplyMode: this.AgentReplyMode,
      MentionedAgentIds: candidates.MentionedAgentIds,
      Message: message.Message ?? '',
      ContinuityAgentId: continuityAgentId
    });
    if (!qualifies || !continuityAgentId) {
      return null;
    }
    try {
      // Built before the first await, so it reads the same conversation as the candidates.
      const input = this.buildRoutingDecisionInput(message, continuityAgentId);
      if (!CanAskRoutingDecision(input)) {
        return null;
      }
      input.ArtifactVersions = await this.loadRoutingArtifactVersions(message.ConversationID, input.Participants);
      const outcome = await RunRoutingDecision(input, params => this.agentService.RunDecision(params));
      LogStatusEx({
        message: `Decision routing: ${outcome.Verdict}, ${outcome.Reason} (prompt run ${outcome.PromptRunID ?? 'none'})`,
        verboseOnly: true
      });
      return outcome;
    } catch (error) {
      console.warn('Decision routing failed, so the message keeps continuity:', error);
      return null;
    }
  }

  /**
   * The routing decision's input, rebuilt from the conversation as it is now: the agents that
   * have answered within the history floor, the last few turns, and the conversation manager.
   * Artifact versions are added after, once the input is known to be worth asking about.
   *
   * Participants come only from the '@' list's agents (`GetAvailableAgents`): active, top-level,
   * unrestricted agents this person has run permission for. An agent that answered here but that
   * the person can't run (a shared conversation, a revoked permission) is never offered, so routing
   * can't send the turn to an agent the server would refuse. Before that list has loaded there are
   * no participants, so no call is made and the message keeps today's routing. Speaker names in
   * the recent turns still come from the full catalog, since any agent may have spoken.
   */
  private buildRoutingDecisionInput(message: MJConversationDetailEntity, continuityAgentId: string): RoutingDecisionInput {
    const history = this.ConversationHistory.filter(row => this.isWithinHistoryFloor(row) && !UUIDsEqual(row.ID, message.ID));
    const findAgent = (agentId: string): RoutingCatalogAgent | undefined => AIEngineBase.Instance.ReadableAgents.find(a => UUIDsEqual(a.ID, agentId));
    const runnable = this.mentionAutocomplete.GetAvailableAgents();
    const findRunnable = (agentId: string): RoutingCatalogAgent | undefined => runnable.find(a => UUIDsEqual(a.ID, agentId));
    const manager = this.ConverationManagerAgent;
    return {
      Message: message.Message ?? '',
      ContinuityAgentId: continuityAgentId,
      Participants: CollectRoutingParticipants(history, manager?.ID ?? null, this.AllowedAgentIDs, findRunnable),
      ConversationManager: manager?.ID && IsAgentAllowed(manager.ID, this.AllowedAgentIDs) ? manager : null,
      RecentTurns: BuildRecentTurns(history, findAgent),
      ArtifactVersions: [],
      AllowedAgentIDs: this.AllowedAgentIDs
    };
  }

  /** Every participant's artifact versions in this conversation, for the artifact question. */
  private async loadRoutingArtifactVersions(
    conversationId: string,
    participants: readonly RoutingParticipant[]
  ): Promise<RoutingArtifactVersion[]> {
    const artifactsByAgent = await Promise.all(participants.map(async participant => ({
      Agent: participant.Agent,
      Artifacts: await this.agentService.FindAgentArtifacts(conversationId, participant.Agent.ID, this.AgentHistoryFrom)
    })));
    return BuildRoutingArtifactVersions(artifactsByAgent);
  }

  /** The host's rules, as the routing functions take them. */
  private get agentTurnRules(): AgentTurnRules {
    return { ReplyMode: this.AgentReplyMode, AllowedAgentIDs: this.AllowedAgentIDs };
  }

  /** The agent each route would use for this conversation, before the host's rules apply. */
  private agentTurnCandidates(mentionedAgentIds: readonly string[]): AgentTurnCandidates {
    return {
      MentionedAgentIds: mentionedAgentIds,
      ContinuityAgentId: this.findLastNonSageAgentId(),
      ConversationDefaultAgentId: this.ConversationDefaultAgentId,
      HostDefaultAgentId: this.DefaultAgentId,
      ConversationManagerAgentId: this.ConverationManagerAgent?.ID ?? null
    };
  }

  /**
   * Picks the agent that answers this message and the route that chose it, or null for no turn.
   * A routing decision, when there was one, is applied to the candidates first.
   */
  private resolveAgentTurnTarget(
    candidates: AgentTurnCandidates,
    routing: RoutingDecisionOutcome | null
  ): AgentTurnTarget | null {
    return ResolveAgentTurn(
      ApplyRoutingDecision(candidates, routing),
      this.agentTurnRules,
      agentId => this.isKnownAgent(agentId)
    );
  }

  /** The agents a message tags, in the order they appear. */
  private agentMentionIds(mentionResult: MentionParseResult): string[] {
    return mentionResult.mentions.filter(m => m.type === 'agent').map(m => m.id);
  }

  /**
   * Fires {@link BeforeAgentTurn} for the turn routing picked — before any reply row exists —
   * and applies what its listeners decided. Returns the turn to run, or null when a listener
   * canceled it or redirected it to an agent this chat can't use.
   */
  private announceAgentTurn(userMessage: MJConversationDetailEntity, target: AgentTurnTarget): AgentTurnTarget | null {
    const args = new BeforeAgentTurnEventArgs(
      userMessage.ConversationID,
      userMessage.Message ?? '',
      this.ApplicationId,
      { ...target, AgentName: this.agentNameFor(target.AgentId), UserMessageId: userMessage.ID }
    );
    this.BeforeAgentTurn.emit(args);
    if (args.Cancel) {
      LogStatusEx({ message: `Agent turn canceled by a BeforeAgentTurn listener${args.CancelReason ? `: ${args.CancelReason}` : ''}` });
      return null;
    }
    const redirectAgentId = args.RedirectAgentId;
    if (!redirectAgentId || UUIDsEqual(redirectAgentId, target.AgentId)) {
      return target;
    }
    if (!IsAgentAllowed(redirectAgentId, this.AllowedAgentIDs) || !this.isKnownAgent(redirectAgentId)) {
      this.notifyAgentTurnProblem('That agent isn\'t available in this chat, so it didn\'t answer.', 'warning');
      return null;
    }
    return { AgentId: redirectAgentId, Route: 'Redirect' };
  }

  /**
   * Settles a message that starts no agent turn — `MentionOnly` with no tagged agent, no allowed
   * agent left, or a turn declined in {@link BeforeAgentTurn}. Nothing new is written; the
   * person's own row is only confirmed Complete.
   */
  private async finishWithoutAgentTurn(userMessage: MJConversationDetailEntity, reason: 'NoAgent' | 'Declined'): Promise<void> {
    // Under the default rules a turn always has somewhere to go, so reaching here with no agent
    // means MJ's conversation manager failed to load. Say so rather than sit silent.
    if (reason === 'NoAgent' && this.AgentReplyMode === 'Always' && this.AllowedAgentIDs == null) {
      this.notifyAgentTurnProblem('No agent is available to answer this message.', 'error');
    }
    await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
  }

  /**
   * Runs a turn that {@link BeforeAgentTurn} let through, on the host's handler or MJ's path.
   * The routing decision, when there was one, supplies the artifact version the turn's agent
   * continues from; a host's handler receives it as `TargetArtifactVersionId`.
   */
  private async runAgentTurn(
    userMessage: MJConversationDetailEntity,
    mentionResult: MentionParseResult,
    turn: AgentTurnTarget,
    routing: RoutingDecisionOutcome | null = null
  ): Promise<void> {
    const mention = turn.Route === 'Mention' ? this.findAgentMention(mentionResult, turn.AgentId) : null;
    const targetArtifactVersionId = ArtifactVersionForTurn(routing, turn.AgentId);
    if (this.AgentTurnHandler) {
      await this.runHostAgentTurn(this.AgentTurnHandler, userMessage, turn, mention, targetArtifactVersionId);
      return;
    }
    if (mention) {
      await this.invokeAgentDirectly(userMessage, mention, userMessage.ConversationID);
    } else if (turn.Route === 'ConversationManager' || (turn.Route === 'Redirect' && this.isConversationManager(turn.AgentId))) {
      await this.runConversationManagerTurn(userMessage, mentionResult);
    } else {
      // Pinned and host defaults keep their direct call even when they name the manager, as before.
      await this.handleAgentContinuity(userMessage, turn.AgentId, targetArtifactVersionId);
    }
  }

  /**
   * The tagged agent's mention, with its configuration preset. A mention saved without one
   * (legacy text format) takes the preset from its chip in the composer, when there is one.
   */
  private findAgentMention(mentionResult: MentionParseResult, agentId: string): Mention | null {
    const mention = mentionResult.mentions.find(m => m.type === 'agent' && UUIDsEqual(m.id, agentId));
    if (!mention) {
      return null;
    }
    if (!mention.configurationId) {
      const chipData = this.InputBox?.getMentionChipsData() || [];
      const agentChip = chipData.find(chip => chip.id === mention.id && chip.type === 'agent');
      if (agentChip?.presetId) {
        mention.configurationId = agentChip.presetId;
      }
    }
    return mention;
  }

  /**
   * Continues with an agent chosen without a mention: the last agent that answered, the pinned
   * or host default agent, or a redirect.
   *
   * LATENCY OPTIMIZATION (PR #2309 / plans/agent-latency-optimization.md — Opt #1):
   * This used to make a separate LLM call via checkContinuityIntent() to decide whether the
   * user's new message was still directed at the previous agent or should be routed to Sage.
   * That call added ~300ms of latency on every message in a conversation with an active agent —
   * the single largest source of non-inference overhead on the client.
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
   *
   * With {@link EnableDecisionRouting} on, a typed routing decision runs before routing instead
   * ({@link decideAgentRouting}); the prompt-based check stays unused. A confident answer from it
   * may name the artifact version this agent should continue from.
   *
   * @param targetArtifactVersionId The artifact version the routing decision named, or null.
   */
  private async handleAgentContinuity(
    messageDetail: MJConversationDetailEntity,
    agentId: string,
    targetArtifactVersionId: string | null = null
  ): Promise<void> {
    await this.continueWithAgent(
      messageDetail,
      agentId,
      messageDetail.ConversationID,
      targetArtifactVersionId ?? undefined // set only by a confident routing decision
    );
  }

  /**
   * The conversation manager's turn. When an earlier message @mentioned the manager with a
   * configuration preset, the preset keeps applying and the manager answers directly;
   * otherwise it evaluates the message and may delegate.
   */
  private async runConversationManagerTurn(
    messageDetail: MJConversationDetailEntity,
    mentionResult: MentionParseResult
  ): Promise<void> {
    const manager = this.ConverationManagerAgent;
    const managerPreset = manager?.ID && messageDetail.ConversationID
      ? await this.agentService.FindConfigurationPresetForAgent(messageDetail.ConversationID, manager.ID)
      : undefined;
    if (manager?.ID && managerPreset) {
      await this.executeAgentContinuation(
        messageDetail,
        manager.ID,
        manager.Name || 'Sage',
        messageDetail.ConversationID,
        null, // Sage doesn't use payload continuity
        null, // Sage doesn't use artifact info
        managerPreset // Pass the already-found config preset
      );
      return;
    }
    await this.processMessageThroughAgent(messageDetail, mentionResult);
  }

  /**
   * The newest reply from an agent other than the conversation manager — among the replies a
   * turn may read, so from {@link AgentHistoryFrom} onward when it's set.
   */
  private findLastNonSageReply(): MJConversationDetailEntity | null {
    return this.ConversationHistory
      .slice()
      .reverse()
      .find(msg =>
        msg.Role === 'AI' &&
        !!msg.AgentID &&
        !UUIDsEqual(msg.AgentID, this.ConverationManagerAgent?.ID) &&
        this.isWithinHistoryFloor(msg)
      ) ?? null;
  }

  /**
   * Finds the last agent ID that isn't Sage (see {@link findLastNonSageReply}).
   */
  private findLastNonSageAgentId(): string | null {
    return this.findLastNonSageReply()?.AgentID || null;
  }

  /** True when a row was written at or after {@link AgentHistoryFrom}; always true without one. */
  private isWithinHistoryFloor(detail: MJConversationDetailEntity): boolean {
    const floor = this.AgentHistoryFrom;
    if (!floor) {
      return true;
    }
    const createdAt = detail.__mj_CreatedAt;
    return createdAt != null && new Date(createdAt).getTime() >= floor.getTime();
  }

  /** True when the agent is in the client's agent catalog. */
  private isKnownAgent(agentId: string): boolean {
    return AIEngineBase.Instance.ReadableAgents.some(a => UUIDsEqual(a.ID, agentId));
  }

  /** The agent's name, when the client's agent catalog has it. */
  private agentNameFor(agentId: string): string | null {
    return AIEngineBase.Instance.ReadableAgents.find(a => UUIDsEqual(a.ID, agentId))?.Name ?? null;
  }

  /** The ID of the agent with this name, or null when there is none. */
  private agentIdByName(agentName: string): string | null {
    return AIEngineBase.Instance.ReadableAgents.find(a => a.Name === agentName)?.ID ?? null;
  }

  /** True when the agent is MJ's conversation manager. */
  private isConversationManager(agentId: string): boolean {
    return !!this.ConverationManagerAgent?.ID && UUIDsEqual(agentId, this.ConverationManagerAgent.ID);
  }

  /** Shows the person why an agent turn didn't happen, or didn't finish. */
  private notifyAgentTurnProblem(message: string, style: 'warning' | 'error'): void {
    MJNotificationService.Instance?.CreateSimpleNotification(message, style, 5000);
  }

  /**
   * Refuses agents the host doesn't allow — named by the conversation manager's delegation or
   * by a workflow it planned — and settles the person's message.
   */
  private async refuseDisallowedAgents(userMessage: MJConversationDetailEntity, agentNames: string[]): Promise<void> {
    const subject = agentNames.join(', ');
    this.notifyAgentTurnProblem(
      agentNames.length === 1
        ? `${subject} isn't available in this chat, so it didn't run.`
        : `${subject} aren't available in this chat, so they didn't run.`,
      'warning'
    );
    await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
  }

  /**
   * Runs the turn through the host's {@link AgentTurnHandler} instead of MJ's path. Nothing is
   * written here: the host writes the reply rows and reports them, and each is shown like a row
   * MJ wrote — one still In-Progress is followed like any other in-progress reply.
   */
  private async runHostAgentTurn(
    handler: AgentTurnHandler,
    userMessage: MJConversationDetailEntity,
    turn: AgentTurnTarget,
    mention: Mention | null,
    targetArtifactVersionId: string | null
  ): Promise<void> {
    const request = this.buildAgentTurnRequest(userMessage, turn, mention, targetArtifactVersionId);
    const result = await this.callAgentTurnHandler(handler, request);
    if (!result.Success) {
      this.notifyAgentTurnProblem(result.ErrorMessage || 'The agent could not answer this message.', 'error');
    } else {
      await this.showHostTurnRows(result.ReplyDetailIds ?? []);
    }
    await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
    if (result.Success && result.Result) {
      this.emitAfterAgentTurn(userMessage.ConversationID, result.Result, result.AgentRunId);
    }
  }

  /** Calls the host's handler; a throw is reported as a failed turn, never swallowed. */
  private async callAgentTurnHandler(handler: AgentTurnHandler, request: AgentTurnRequest): Promise<AgentTurnResult> {
    try {
      return await handler(request);
    } catch (error) {
      console.error('AgentTurnHandler failed:', error);
      return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * What the host's handler is told about the turn.
   *
   * @param targetArtifactVersionId The artifact version the routing decision named for this
   *   turn's agent, or null.
   */
  private buildAgentTurnRequest(
    userMessage: MJConversationDetailEntity,
    turn: AgentTurnTarget,
    mention: Mention | null,
    targetArtifactVersionId: string | null
  ): AgentTurnRequest {
    return {
      ConversationId: userMessage.ConversationID,
      UserMessageId: userMessage.ID,
      MessageText: userMessage.Message ?? '',
      AgentId: turn.AgentId,
      AgentName: this.agentNameFor(turn.AgentId),
      Route: turn.Route,
      ApplicationId: this.ApplicationId,
      AppContext: this.AppContext,
      AgentHistoryFrom: this.AgentHistoryFrom,
      // A mention carries its own preset (or none); every other route follows the header picker.
      ConfigurationPresetId: turn.Route === 'Mention' ? (mention?.configurationId ?? null) : this.AgentConfigurationPresetId,
      RequestedSkillIDs: [...this._pendingRequestedSkillIDs],
      PlanMode: this.PlanModeEnabled,
      TargetArtifactVersionId: targetArtifactVersionId
    };
  }

  /** Shows the rows a host's handler reported for its turn, oldest first. */
  private async showHostTurnRows(detailIds: readonly string[]): Promise<void> {
    for (const detailId of detailIds) {
      const detail = await this.dataCache.getConversationDetail(detailId, this.CurrentUser);
      if (detail) {
        this.MessageSent.emit(detail);
      } else {
        console.warn(`AgentTurnHandler reported conversation detail ${detailId}, but it could not be loaded`);
      }
    }
  }

  /** Fires {@link AfterAgentTurn} for a turn that succeeded. */
  private emitAfterAgentTurn(conversationId: string, result: ExecuteAgentResult, agentRunId?: string): void {
    this.AfterAgentTurn.emit(new AfterAgentTurnEventArgs(conversationId, agentRunId ?? result.agentRun?.ID ?? '', result));
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
    this.IntentCheckStarted.emit({ conversationId: this.ConversationId });

    try {
      // The pre-loaded artifact/agent-run maps are no longer passed: they are scoped to the
      // loaded transcript window, and the service now queries for this agent's artifacts so
      // the classifier reasons over the whole conversation. A conversation id is what it
      // needs instead, and without one there is nothing to query.
      if (!this.ConversationId) {
        console.warn('⚠️ No conversation id available for intent check');
        return { decision: 'UNSURE' as const, reasoning: 'Conversation not available' };
      }

      const intent = await this.agentService.checkAgentContinuityIntent(
        this.ConversationId,
        agentId,
        message,
        this.ConversationHistory
      );
      return intent;
    } catch (error) {
      console.error('❌ Intent check failed, defaulting to UNSURE:', error);
      return { decision: 'UNSURE' as const, reasoning: 'Intent check failed with error' };
    } finally {
      // Emit event to remove temporary intent checking message
      this.IntentCheckCompleted.emit({ conversationId: this.ConversationId });
    }
  }

  /**
   * Returns focus to the message textarea
   */
  private refocusTextarea(): void {
    setTimeout(() => {
      if (this.InputBox) {
        this.InputBox.focus();
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
            this.AgentRunUpdate.emit({
              conversationId: conversationDetail.ConversationID,
              conversationDetailId: conversationDetail.ID,
              agentRun: progressAgentRun,
              agentRunId: progressAgentRunId
            });
          } else if (progressAgentRunId && !capturedAgentRunId) {
            // Fallback: If we don't have the full object but have the ID, emit agentRunDetected
            // This will trigger a database query to load the agent run
            this.AgentRunDetected.emit({
              conversationId: conversationDetail.ConversationID,
              conversationDetailId: conversationDetail.ID,
              agentRunId: progressAgentRunId
            });
          }

          if (conversationDetail.Status === 'In-Progress') {
            conversationDetail.Message = progressText;
            // Server now saves progress - client only updates in-memory and emits for UI
            // (Prevents race condition where client's late save overwrites server's final Status)
            this.MessageSent.emit(conversationDetail);
          }
        }
      } catch (error) {
        console.warn('Failed to update progress in ConversationDetail:', error);
      }
    };
  }

  /**
   * Process the message through agents (multi-stage: Sage -> possible sub-agent)
   * Only called when there's no @mention and no implicit agent context.
   * {@link BeforeAgentTurn} has already fired — routing announces the turn before any row exists.
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
      conversationManagerMessage = await this.dataCache.createConversationDetail(this.CurrentUser);

      conversationManagerMessage.ConversationID = conversationId;
      conversationManagerMessage.Role = 'AI';
      conversationManagerMessage.Message = '⏳ Starting...';
      conversationManagerMessage.ParentID = userMessage.ID;
      conversationManagerMessage.Status = 'In-Progress';
      conversationManagerMessage.HiddenToUser = false;
      // Use the preloaded Sage agent instead of looking it up
      if (this.ConverationManagerAgent?.ID) {
        conversationManagerMessage.AgentID = this.ConverationManagerAgent.ID;
      }

      await conversationManagerMessage.Save();
      this.MessageSent.emit(conversationManagerMessage);

      // Use Sage to evaluate and route
      // Stage 1: Sage evaluates the message
      taskId = this.activeTasks.add({
        agentName: 'Sage',
        status: 'Evaluating message...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: conversationManagerMessage.ID,
        conversationId,
        conversationName: this.ConversationName
      });

      const result = await this.agentService.ProcessMessage(
        conversationId,
        userMessage,
        this.ConversationHistory,
        conversationManagerMessage.ID,
        this.createProgressCallback(conversationManagerMessage, 'Sage'),
        this.AppContext,
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
        this.AllowedAgentIDs, // the agents the manager may delegate to
        this.AgentHistoryFrom, // the first moment of the conversation the run may read
      );

      // Emit afterAgentTurn on the happy path only — the error/failure branch
      // immediately below handles its own cleanup and skips this emit.
      if (result && result.success) {
        this.emitAfterAgentTurn(conversationId, result);
      }

      // Task will be removed automatically in markMessageComplete()
      // DO NOT remove here - agent may still be streaming/processing
      taskId = null; // Clear reference but don't remove from service

      if (!result || !result.success) {
        await this.applyAgentFailureToDetail(
          conversationManagerMessage,
          userMessage,
          this.ConverationManagerAgent?.Name || 'Sage',
          result,
          'failed',
        );
        console.warn('⚠️ Sage failed:', agentFailureMessage(result, 'Agent evaluation failed'));
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
          this.MessageSent.emit(conversationManagerMessage);
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

          this.MessageSent.emit(conversationManagerMessage);

          // Clean up completion timestamp after delay
          this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
        } else {
          // Mark message as completing
          this.markMessageComplete(conversationManagerMessage);

          // Hide the Sage message
          conversationManagerMessage.HiddenToUser = true;

          // use update helper to ensure that if there is a race condition with more streaming updates we don't allow that to override this final message
          await this.updateConversationDetail(conversationManagerMessage, conversationManagerMessage.Message, 'Complete', result);

          this.MessageSent.emit(conversationManagerMessage);

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

  /** Detaches the progress callback for one message — used when submission never starts. */
  private releaseProgressCallback(messageId: string): void {
    const callback = this.registeredCallbacks.get(messageId);
    if (callback) {
      this.streamingService.unregisterMessageCallback(messageId, callback);
      this.registeredCallbacks.delete(messageId);
    }
  }

  /**
   * Submits a task graph to the server and returns — the client no longer drives execution.
   *
   * This used to call the `ExecuteTaskGraph` mutation and await the ENTIRE workflow inside one
   * long-lived GraphQL request. That had three unfixable problems: a page reload lost the awaited
   * promise (leaving a workflow running with nobody watching), a server restart orphaned every
   * in-flight task, and no other channel could reach the substrate at all.
   *
   * Now submission returns as soon as the graph is durable and the server-side dispatcher executes
   * it. The client is purely an observer: progress arrives over the existing PubSub frames, and
   * because the work lives in Task rows rather than in a promise, a reload can re-attach to a
   * workflow already in flight.
   *
   * Single-task graphs are no longer special-cased here. The old client-side fork ran them through
   * a different code path entirely; they now submit like any other graph, and the decision about
   * whether a one-node graph is worth durable machinery moves server-side where it can be recorded.
   */
  private async handleTaskGraphExecution(
    userMessage: MJConversationDetailEntity,
    managerResult: ExecuteAgentResult,
    conversationId: string,
    conversationManagerMessage: MJConversationDetailEntity
  ): Promise<void> {
    // `payload` is untyped by construction (an agent's payload shape is agent-specific), so pin the
    // graph to the operation's own input contract at the boundary rather than letting it stay loose.
    const taskGraph: TaskGraphSubmitInput['spec'] | undefined = managerResult.payload?.taskGraph;
    if (!taskGraph) return;

    // The host's allowed list holds for every agent step of the plan, not only for a single
    // delegation: a workflow naming an agent the chat doesn't allow is not submitted at all.
    const disallowedAgents = FindDisallowedTaskGraphAgents(
      Array.isArray(taskGraph.tasks) ? taskGraph.tasks : [],
      this.AllowedAgentIDs,
      agentName => this.agentIdByName(agentName)
    );
    if (disallowedAgents.length > 0) {
      await this.refuseDisallowedAgents(userMessage, disallowedAgents);
      return;
    }

    const workflowName = taskGraph.workflowName || 'Workflow';
    const reasoning = taskGraph.reasoning || 'Executing multi-step workflow';
    const taskCount = Array.isArray(taskGraph.tasks) ? taskGraph.tasks.length : 0;

    // A message the user can watch. Progress frames from the dispatcher land against this ID.
    const taskExecutionMessage = await this.dataCache.createConversationDetail(this.CurrentUser);
    taskExecutionMessage.ConversationID = conversationId;
    taskExecutionMessage.Role = 'AI';
    taskExecutionMessage.Message = `⏳ **${workflowName}**\n\n${reasoning}\n\nSubmitting ${taskCount} task(s)…`;
    taskExecutionMessage.ParentID = conversationManagerMessage.ID;
    taskExecutionMessage.Status = 'In-Progress';
    taskExecutionMessage.HiddenToUser = false;
    await taskExecutionMessage.Save();
    this.MessageSent.emit(taskExecutionMessage);

    const callback = this.createMessageProgressCallback(taskExecutionMessage.ID);
    this.registeredCallbacks.set(taskExecutionMessage.ID, callback);
    this.streamingService.registerMessageCallback(taskExecutionMessage.ID, callback);

    try {
      // `TaskGraph.Submit` is a Remote Operation, not a bespoke mutation: the same call site is
      // reachable from MCP, an Action wrapper, and this UI. `Execute` marshals over the generic
      // `ExecuteRemoteOperation` transport, so there is no hand-written GraphQL document here.
      const result = await new TaskGraphSubmitOperation().Execute({
        spec: taskGraph,
        environmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
        conversationDetailID: taskExecutionMessage.ID,
      });

      if (result.Success && result.Output?.success) {
        // Deliberately NOT "completed" — submission means the work is durable and running, and
        // claiming completion here is exactly the lie the old await-everything path told when it
        // returned early. The dispatcher's progress frames update this message as tasks finish.
        await this.updateConversationDetail(
          taskExecutionMessage,
          `▶️ **${workflowName}** started — ${taskCount} task(s) running.`,
          'In-Progress'
        );
      } else {
        const errorMsg = result.Output?.errorMessage || result.ErrorMessage || 'Unknown error';
        console.error('Task graph submission rejected:', errorMsg);
        taskExecutionMessage.Error = errorMsg;
        await this.updateConversationDetail(taskExecutionMessage, `❌ **${workflowName}** rejected: ${errorMsg}`, 'Error');
        this.releaseProgressCallback(taskExecutionMessage.ID);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Task graph submission failed:', error);
      taskExecutionMessage.Error = msg;
      await this.updateConversationDetail(taskExecutionMessage, `❌ **${workflowName}** failed to submit: ${msg}`, 'Error');
      this.releaseProgressCallback(taskExecutionMessage.ID);
    }
  }



  protected async updateConversationDetail(convoDetail: MJConversationDetailEntity, message: string, status: 'In-Progress' | 'Complete' | 'Error', result?: ExecuteAgentResult): Promise<void> {
    // Mark as completing FIRST if status is Complete or Error
    // This ensures task cleanup happens even if we return early due to guard clause
    if (status === 'Complete' || status === 'Error') {
      this.markMessageComplete(convoDetail);
    }

    // Race condition guard: Before writing Error *or* In-Progress, reload from DB.
    // The In-Progress disconnect branch is the path that most needs this: a dropped
    // socket leaves the in-memory Status stale (still In-Progress from creation), and
    // without a reload we can overwrite a server Complete with the "still running"
    // placeholder. If the server already finished, emit that record and stop the timer.
    if ((status === 'Error' || status === 'In-Progress') && convoDetail.ID) {
      await convoDetail.Load(convoDetail.ID);
      if (convoDetail.Status === 'Complete' || convoDetail.Status === 'Error') {
        this.markMessageComplete(convoDetail);
        this.MessageSent.emit(convoDetail);
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
        this.MessageSent.emit(convoDetail);
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
   *
   * Resolved by QUERY rather than by scanning `conversationHistory`. That array is now the
   * loaded transcript WINDOW, not the full conversation, so a scan silently misses any
   * artifact below the window's oldest row — and a null payload is a legal agent input, so
   * the miss surfaces as the agent regenerating from scratch instead of modifying. Covers
   * system-visibility artifacts (Agent Manager and friends) for free: the query filters on
   * Direction, not on Visibility.
   */
  private async loadPreviousPayloadForAgent(agentId: string): Promise<{
    payload: Record<string, unknown> | null;
    artifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null;
  }> {
    if (!this.ConversationId) {
      return { payload: null, artifactInfo: null };
    }

    const source = await this.agentService.FindLatestAgentOutputVersion(this.ConversationId, agentId, this.AgentHistoryFrom);
    if (!source || source.payload == null) {
      console.log(`📦 No previous payload found for agent ${agentId}`);
      return { payload: null, artifactInfo: null };
    }

    console.log(`📦 Loaded previous payload for agent ${agentId} from artifact version ${source.versionId}`);
    return {
      payload: source.payload,
      artifactInfo: {
        artifactId: source.artifactId,
        versionId: source.versionId,
        versionNumber: source.versionNumber
      }
    };
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
    let agentResponseMessage: MJConversationDetailEntity | null = null;
    try {
      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.ReadableAgents.find(a => a.Name === agentName);

      // The manager routes only among the allowed agents, but its answer is model output: hold
      // the host's list here too, before any row is written for the delegate.
      if (this.AllowedAgentIDs != null && !IsAgentAllowed(agent?.ID, this.AllowedAgentIDs)) {
        await this.refuseDisallowedAgents(userMessage, [agentName]);
        return;
      }

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.CurrentUser);

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
      this.MessageSent.emit(agentResponseMessage);

      // Add sub-agent to active tasks
      const newTaskId = this.activeTasks.add({
        agentName: agentName,
        status: 'Starting...',
        relatedMessageId: userMessage.ID,
        conversationDetailId: agentResponseMessage.ID,
        conversationId,
        conversationName: this.ConversationName
      });

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = agent?.ID
        ? await this.loadPreviousPayloadForAgent(agent.ID)
        : { payload: null, artifactInfo: null };

      // Find configuration preset from previous @mention in conversation history
      const configurationPresetId = agent?.ID
        ? await this.agentService.FindConfigurationPresetForAgent(conversationId, agent.ID)
        : undefined;

      // Invoke the sub-agent with progress callback
      const subResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.ConversationHistory,
        reasoning,
        agentResponseMessage.ID,
        previousPayload, // Pass previous payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId,
        configurationPresetId, // Pass configuration from previous @mention for continuity
        this.AppContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
        this.AgentHistoryFrom, // the first moment of the conversation the run may read
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
        this.MessageSent.emit(agentResponseMessage);

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        // A post-ACK disconnect means the first run may still be executing on this
        // detail — do not start a second run on the same conversationDetailId.
        if (agentFailureDisposition(subResult).status === 'In-Progress') {
          await this.applyAgentFailureToDetail(agentResponseMessage, userMessage, agentName, subResult);
          return;
        }

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
          this.ConversationHistory,
          reasoning,
          agentResponseMessage.ID,
          previousPayload, // Pass same payload as first attempt
          this.createProgressCallback(agentResponseMessage, `${agentName} (retry)`),
          artifactInfo?.artifactId,
          artifactInfo?.versionId,
          configurationPresetId, // Pass same config as first attempt
          this.AppContext, // Embedder-supplied app/form context
          this.PlanModeEnabled, // per-request Plan Mode toggle
          this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
          this.AgentHistoryFrom, // the first moment of the conversation the run may read
        );

        if (retryResult && retryResult.success) {
          // Retry succeeded - update the same message
          if (retryResult.agentRun.AgentID) {
            agentResponseMessage.AgentID = retryResult.agentRun.AgentID;
          }

          await this.updateConversationDetail(agentResponseMessage, retryResult.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', retryResult);

          // Always emit artifactCreated to trigger UI reload (same as initial attempt)
          this.emitArtifactReload(agentResponseMessage);
          this.MessageSent.emit(agentResponseMessage);

          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        } else {
          // Retry also failed — terminate the agent bubble (the red-pill timer lives here),
          // not only the Sage delegation message.
          await this.applyAgentFailureToDetail(
            agentResponseMessage,
            userMessage,
            agentName,
            retryResult,
            'failed after retry',
          );
          const retryDisposition = agentFailureDisposition(retryResult);
          if (retryDisposition.status === 'Error') {
            conversationManagerMessage.Error = retryDisposition.message;
            await this.updateConversationDetail(
              conversationManagerMessage,
              `❌ **${agentName}** failed after retry\n\n${retryDisposition.message}`,
              'Error',
            );
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error invoking sub-agent ${agentName}:`, error);

      const catchResult = {
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      } as ExecuteAgentResult;
      if (agentResponseMessage) {
        await this.applyAgentFailureToDetail(agentResponseMessage, userMessage, agentName, catchResult);
      } else {
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
      const catchDisposition = agentFailureDisposition(catchResult);
      if (catchDisposition.status === 'Error') {
        conversationManagerMessage.Error = catchDisposition.message;
        await this.updateConversationDetail(
          conversationManagerMessage,
          `❌ **${agentName}** encountered an error\n\n${catchDisposition.message}`,
          'Error',
        );
      }
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
    // Find the last AI message (excluding Sage) this turn may read
    const lastAIMessage = this.findLastNonSageReply();

    if (!lastAIMessage || !lastAIMessage.AgentID) {
      // No previous specialist agent - just mark user message as complete
      console.log('🔇 No previous specialist agent found - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    if (!IsAgentAllowed(lastAIMessage.AgentID, this.AllowedAgentIDs)) {
      console.log('🔇 Previous specialist agent is not allowed in this chat - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    // Load the agent entity to get its name
    const previousAgent = AIEngineBase.Instance.ReadableAgents.find(a => UUIDsEqual(a.ID, lastAIMessage.AgentID));
    if (!previousAgent) {
      console.warn('⚠️ Could not load previous agent - marking complete');
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }

    const agentName = previousAgent.Name || 'Agent';

    let previousPayload: Record<string, unknown> | null = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;

    // Resolved by QUERY, not from the window's artifact maps: `lastAIMessage` can sit inside
    // the loaded window while its artifact does not, and this path silently degrades to a
    // null payload when the lookup misses.
    const source = await this.agentService.FindLatestAgentOutputVersion(
      conversationId, lastAIMessage.AgentID, this.AgentHistoryFrom
    );
    if (source && source.payload != null) {
      previousPayload = source.payload;
      previousArtifactInfo = {
        artifactId: source.artifactId,
        versionId: source.versionId,
        versionNumber: source.versionNumber
      };
      console.log('📦 Loaded previous OUTPUT artifact as payload for continuity', previousArtifactInfo);
    }

    // Create status message showing agent continuity
    const statusMessage = await this.dataCache.createConversationDetail(this.CurrentUser);

    statusMessage.ConversationID = conversationId;
    statusMessage.Role = 'AI';
    statusMessage.Message = `Continuing with **${agentName}** for refinement...`;
    statusMessage.ParentID = userMessage.ID;
    statusMessage.Status = 'Complete';
    statusMessage.HiddenToUser = false;
    statusMessage.AgentID = this.ConverationManagerAgent?.ID || null;

    await statusMessage.Save();
    this.MessageSent.emit(statusMessage);

    // Add agent to active tasks
    const taskId = this.activeTasks.add({
      agentName: agentName,
      status: 'Processing refinement...',
      relatedMessageId: userMessage.ID,
      conversationDetailId: statusMessage.ID,
      conversationId,
      conversationName: this.ConversationName
    });

    try {
      // Invoke the agent with the previous payload
      const continuityResult = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.ConversationHistory,
        'Continuing previous work based on user feedback',
        statusMessage.ID,
        previousPayload,
        this.createProgressCallback(statusMessage, agentName),
        previousArtifactInfo?.artifactId,
        previousArtifactInfo?.versionId,
        undefined, // configurationPresetId not used in this path
        this.AppContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
        this.AgentHistoryFrom, // the first moment of the conversation the run may read
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (continuityResult && continuityResult.success) {
        // Create response message
        const agentResponseMessage = await this.dataCache.createConversationDetail(this.CurrentUser);

        agentResponseMessage.ConversationID = conversationId;
        agentResponseMessage.Role = 'AI';
        agentResponseMessage.Message = continuityResult.agentRun?.Message || `✅ **${agentName}** completed refinement`;
        agentResponseMessage.ParentID = statusMessage.ID;
        agentResponseMessage.Status = 'Complete';
        agentResponseMessage.HiddenToUser = false;
        agentResponseMessage.AgentID = lastAIMessage.AgentID;

        await agentResponseMessage.Save();
        this.MessageSent.emit(agentResponseMessage);

        // Server created artifacts (handles versioning automatically) - emit event to trigger UI reload
        if (continuityResult.payload && Object.keys(continuityResult.payload).length > 0) {
          this.emitArtifactReload(agentResponseMessage);
          console.log('🎨 Server created artifact (versioned) from agent continuity');
          this.MessageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        await this.applyAgentFailureToDetail(statusMessage, userMessage, agentName, continuityResult, 'failed during refinement');
      }
    } catch (error) {
      console.error(`❌ Error in agent continuity with ${agentName}:`, error);

      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      await this.applyAgentFailureToDetail(
        statusMessage,
        userMessage,
        agentName,
        { success: false, errorMessage: error instanceof Error ? error.message : String(error) } as ExecuteAgentResult,
        'encountered an error',
      );
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
      conversationName: this.ConversationName
    });

    // Declare agentResponseMessage outside try block so it's accessible in catch
    let agentResponseMessage: MJConversationDetailEntity | undefined = undefined;

    try {
      // User message is sent successfully - mark complete immediately
      // (No UI uses User message 'In-Progress' - only AI messages need that status)
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.MessageSent.emit(userMessage);

      // Look up the agent to get its ID
      const agent = AIEngineBase.Instance.ReadableAgents.find(a => a.Name === agentName);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.CurrentUser);

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
      this.MessageSent.emit(agentResponseMessage);

      // Load previous payload if agent has been invoked before
      const { payload: previousPayload, artifactInfo } = agent?.ID
        ? await this.loadPreviousPayloadForAgent(agent.ID)
        : { payload: null, artifactInfo: null };

      // Invoke the agent directly
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.ConversationHistory,
        `User mentioned agent directly with @${agentName}`,
        agentResponseMessage.ID,
        previousPayload, // Pass previous payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        artifactInfo?.artifactId,
        artifactInfo?.versionId,
        agentMention.configurationId, // Pass configuration preset ID
        this.AppContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
        this.AgentHistoryFrom, // the first moment of the conversation the run may read
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (result && result.success) {
        if (result.agentRun.AgentID) {
          agentResponseMessage.AgentID = result.agentRun.AgentID;
        }
        this.emitAfterAgentTurn(conversationId, result);

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
            this.MessageSent.emit(agentResponseMessage);
          }

          // Mark user message as complete
          await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
        }
      } else {
        await this.applyAgentFailureToDetail(agentResponseMessage, userMessage, agentName, result);
      }
    } catch (error) {
      console.error(`❌ Error invoking mentioned agent ${agentName}:`, error);

      if (agentResponseMessage) {
        await this.applyAgentFailureToDetail(
          agentResponseMessage,
          userMessage,
          agentName,
          { success: false, errorMessage: error instanceof Error ? error.message : String(error) } as ExecuteAgentResult,
        );
      } else {
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
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
    const agent = AIEngineBase.Instance.ReadableAgents.find(a => UUIDsEqual(a.ID, agentId));
    if (!agent) {
      if (!IsAgentAllowed(this.ConverationManagerAgent?.ID, this.AllowedAgentIDs)) {
        console.warn('⚠️ Could not load agent for continuation, and Sage is not allowed in this chat');
        await this.finishWithoutAgentTurn(userMessage, 'Declined');
        return;
      }
      console.warn('⚠️ Could not load agent for continuation - falling back to Sage');
      await this.processMessageThroughAgent(userMessage, { mentions: [], agentMention: null, userMentions: [], entityMentions: [], skillMentions: [] });
      return;
    }

    const agentName = agent.Name || 'Agent';

    let previousPayload: Record<string, unknown> | null = null;
    let previousArtifactInfo: {artifactId: string; versionId: string; versionNumber: number} | null = null;
    let previousConfigurationId: string | undefined = undefined;

    // Use targetArtifactVersionId if specified (from intent check).
    // Resolved by ID against the database, not against artifactsByDetailId: the intent check
    // may well have named a version attached to a message BELOW the loaded window, which is
    // precisely when continuity matters and precisely what the window's maps cannot see.
    if (targetArtifactVersionId) {
      const target = await this.agentService.FindArtifactVersionById(targetArtifactVersionId);
      if (target && target.payload != null) {
        previousPayload = target.payload;
        previousArtifactInfo = {
          artifactId: target.artifactId,
          versionId: target.versionId,
          versionNumber: target.versionNumber
        };
        console.log('📦 Loaded target artifact version as payload', previousArtifactInfo);
      } else {
        console.warn('⚠️ Could not load target artifact version:', targetArtifactVersionId);
      }
    }

    // Extract configuration preset from the User message that @mentioned this agent
    // Uses the shared helper method in the agent service
    previousConfigurationId = await this.agentService.FindConfigurationPresetForAgent(conversationId, agentId);

    // Fall back to the chat header's mode-picker selection when nothing
    // in the message history pinned a preset. The picker reflects the
    // user's persistent per-agent mode preference (Draft / Standard /
    // High) and applies to all subsequent non-mention routes. A
    // history-derived preset still wins because it represents an
    // explicit per-message intent the user expressed earlier.
    if (!previousConfigurationId && this.AgentConfigurationPresetId) {
      previousConfigurationId = this.AgentConfigurationPresetId;
    }

    // Fall back to searching through all agent messages for an artifact
    // This ensures payload continuity even after clarifying exchanges without artifacts
    // Fall back to this agent's newest OUTPUT artifact when the intent check named no
    // version (or named one that no longer resolves). Queried, not scanned: the array this
    // used to walk is the loaded window, so the artifact it is looking for is exactly the
    // one most likely to be missing from it.
    if (!previousPayload) {
      const source = await this.agentService.FindLatestAgentOutputVersion(conversationId, agentId, this.AgentHistoryFrom);
      if (source && source.payload != null) {
        previousPayload = source.payload;
        previousArtifactInfo = {
          artifactId: source.artifactId,
          versionId: source.versionId,
          versionNumber: source.versionNumber
        };
        console.log('📦 Loaded artifact as payload for continuation', previousArtifactInfo);
      } else {
        console.log(`📦 No artifact found for agent ${agentId} in this conversation`);
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
      conversationName: this.ConversationName
    });

    // Declare agentResponseMessage outside try block so it's accessible in catch
    let agentResponseMessage: MJConversationDetailEntity | undefined = undefined;

    try {
      // User message is sent successfully - mark complete immediately
      // (No UI uses User message 'In-Progress' - only AI messages need that status)
      userMessage.Status = 'Complete';
      await userMessage.Save();
      this.MessageSent.emit(userMessage);

      // Create AI response message BEFORE invoking agent (for duration tracking)
      agentResponseMessage = await this.dataCache.createConversationDetail(this.CurrentUser);

      agentResponseMessage.ConversationID = conversationId;
      agentResponseMessage.Role = 'AI';
      agentResponseMessage.Message = '⏳ Starting...'; // Initial message
      agentResponseMessage.ParentID = userMessage.ID;
      agentResponseMessage.Status = 'In-Progress';
      agentResponseMessage.HiddenToUser = false;
      agentResponseMessage.AgentID = agentId;

      // Save the record to establish __mj_CreatedAt timestamp
      await agentResponseMessage.Save();
      this.MessageSent.emit(agentResponseMessage);

      // Invoke the agent directly (continuation) with previous payload if available.
      // `this.appContext` is forwarded so direct-routed sub-agents (e.g. Form
      // Builder via [defaultAgentId]) see the embedder's ActiveForm/Schema/
      // OverrideID block in their prompt — same flow Sage gets via
      // `processMessage`.
      const result = await this.agentService.invokeSubAgent(
        agentName,
        conversationId,
        userMessage,
        this.ConversationHistory,
        'Continuing previous conversation with user',
        agentResponseMessage.ID,
        previousPayload, // Pass previous OUTPUT artifact payload for continuity
        this.createProgressCallback(agentResponseMessage, agentName),
        previousArtifactInfo?.artifactId,
        previousArtifactInfo?.versionId,
        configurationId, // Pass configuration for continuity
        this.AppContext, // Embedder-supplied app/form context
        this.PlanModeEnabled, // per-request Plan Mode toggle
        this._pendingRequestedSkillIDs, // user-requested skills (/skill mentions)
        this.AgentHistoryFrom, // the first moment of the conversation the run may read
      );

      // Remove from active tasks
      // Task removed in markMessageComplete() - this.activeTasks.remove(taskId);

      if (result && result.success) {
        this.emitAfterAgentTurn(conversationId, result);

        // Update the response message with agent result
        await this.updateConversationDetail(agentResponseMessage,result.agentRun?.Message || `✅ **${agentName}** completed`, 'Complete', result);

        // Server created artifacts (handles versioning) - emit event to trigger UI reload
        if (result.payload && Object.keys(result.payload).length > 0) {
          this.emitArtifactReload(agentResponseMessage);
          this.MessageSent.emit(agentResponseMessage);
        }

        // Mark user message as complete
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      } else {
        await this.applyAgentFailureToDetail(agentResponseMessage, userMessage, agentName, result);
      }
    } catch (error) {
      console.error(`❌ Error continuing with agent ${agentName}:`, error);

      if (agentResponseMessage) {
        await this.applyAgentFailureToDetail(
          agentResponseMessage,
          userMessage,
          agentName,
          { success: false, errorMessage: error instanceof Error ? error.message : String(error) } as ExecuteAgentResult,
        );
      } else {
        await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      }
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
      CurrentUser: this.CurrentUser
    });

    if (result) {
      // Emit event for animation in conversation list
      this.ConversationRenamed.emit({
        conversationId,
        name: result.Name,
        description: result.Description
      });
      console.log(`✅ Conversation renamed to: "${result.Name}"`);
    }
  }

  /**
   * Persist an agent failure onto the response bubble.
   *
   * A dropped HTTP/WebSocket path used to return `null` from invokeSubAgent, so
   * the bubble said "Unknown error" while the AIAgentRun stayed Running and the
   * timer kept ticking. If the transport ACKed the mutation and then died, keep
   * In-Progress so a later completion event (or {@link startInFlightDetailWatch})
   * can land. ConversationDetail.Status is the server's claim; the client only
   * renders it. The GraphQLAIClient stall reconciler covers the wait inside
   * invokeSubAgent; once that returns, the watch observes the detail until the
   * server writes a terminal status (MaxTimePerRun).
   *
   * Always completes the user message — the user turn finished regardless of
   * what the agent is doing.
   */
  private async applyAgentFailureToDetail(
    agentResponseMessage: MJConversationDetailEntity,
    userMessage: MJConversationDetailEntity,
    agentName: string,
    result: ExecuteAgentResult | null | undefined,
    failedVerb = 'failed',
  ): Promise<void> {
    const disposition = agentFailureDisposition(result);
    if (disposition.status === 'In-Progress') {
      await this.updateConversationDetail(
        agentResponseMessage,
        `⏳ **${agentName}** is still running on the server.\n\n${disposition.message}`,
        'In-Progress',
      );
      // Skip the watch if the reload-before-write guard already found a
      // terminal server status (Complete/Error) — starting it would race the
      // just-completed bubble.
      if (agentResponseMessage.Status === 'In-Progress') {
        this.startInFlightDetailWatch(agentResponseMessage);
      }
      await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
      return;
    }
    agentResponseMessage.Error = disposition.message;
    await this.updateConversationDetail(
      agentResponseMessage,
      `❌ **${agentName}** ${failedVerb}\n\n${disposition.message}`,
      'Error',
    );
    await this.updateConversationDetail(userMessage, userMessage.Message, 'Complete');
  }

  private startInFlightDetailWatch(detail: MJConversationDetailEntity): void {
    if (!detail.ID) {
      return;
    }
    this.stopInFlightDetailWatch(detail.ID);
    this.scheduleInFlightDetailPoll(detail, 0);
  }

  private scheduleInFlightDetailPoll(detail: MJConversationDetailEntity, step: number): void {
    const delays = MessageInputComponent.IN_FLIGHT_WATCH_BACKOFF_MS;
    const delay = delays[Math.min(step, delays.length - 1)];
    const handle = setTimeout(() => {
      void this.pollInFlightDetail(detail, step);
    }, delay);
    this.inFlightWatches.set(detail.ID, handle);
  }

  private async pollInFlightDetail(detail: MJConversationDetailEntity, step: number): Promise<void> {
    if (!this.inFlightWatches.has(detail.ID)) {
      return;
    }
    try {
      await detail.Load(detail.ID);
      if (detail.Status === 'Complete' || detail.Status === 'Error') {
        this.stopInFlightDetailWatch(detail.ID);
        this.markMessageComplete(detail);
        this.MessageSent.emit(detail);
        return;
      }
    } catch (e) {
      console.warn(`[InFlightWatch] Failed to reload conversation detail ${detail.ID}:`, e);
    }
    if (!this.inFlightWatches.has(detail.ID)) {
      return;
    }
    this.scheduleInFlightDetailPoll(detail, step + 1);
  }

  private stopInFlightDetailWatch(detailId: string): void {
    const handle = this.inFlightWatches.get(detailId);
    if (handle) {
      clearTimeout(handle);
      this.inFlightWatches.delete(detailId);
    }
  }

  private clearInFlightWatches(): void {
    for (const handle of this.inFlightWatches.values()) {
      clearTimeout(handle);
    }
    this.inFlightWatches.clear();
  }

  /**
   * Marks a conversation detail as complete and records timestamp to prevent race conditions
   * Emits event to parent to refresh agent run data from database
   */
  private markMessageComplete(conversationDetail: MJConversationDetailEntity): void {
    const now = Date.now();
    this.completionTimestamps.set(conversationDetail.ID, now);
    this.stopInFlightDetailWatch(conversationDetail.ID);

    // Unregister streaming callback for this message (no more updates needed)
    const callback = this.registeredCallbacks.get(conversationDetail.ID);
    if (callback) {
      this.streamingService.unregisterMessageCallback(conversationDetail.ID, callback);
      this.registeredCallbacks.delete(conversationDetail.ID);
      LogStatusEx({ message: `[MarkComplete] Unregistered streaming callback for completed message ${conversationDetail.ID}`, verboseOnly: true });
    }

    // Remove task from active tasks if it exists
    const task = this.activeTasks.getByConversationDetailId(conversationDetail.ID);
    if (task) {
      LogStatusEx({
        message: `✅ Task found for message ${conversationDetail.ID} - removing from active tasks:`,
        additionalArgs: [{
          taskId: task.id,
          agentName: task.agentName,
          conversationId: task.conversationId,
          conversationName: task.conversationName
        }],
        verboseOnly: true,
      });

      this.activeTasks.remove(task.id);

      // Show toast only if the user isn't currently viewing this conversation.
      // If they're watching, the inline completion is sufficient.
      const isConvoVisible = UUIDsEqual(this.bridge.ActiveConversationID$.value, task.conversationId)
        && (this.bridge.OverlayActive$.value || this.bridge.WorkspaceActive$.value);
      if (!isConvoVisible) {
        // The server announces the same completion through its Agent Completion notification
        // (when the run produced an artifact); the shared dedupe key folds the two into one
        // toast, and this wording — the later of the two — is what stays on screen.
        const agent = task.agentId
          ? AIEngineBase.Instance.ReadableAgents.find(a => UUIDsEqual(a.ID, task.agentId))
          : undefined;
        // The task carries the name from send time; the engine has the current one (the
        // first exchange auto-names the conversation). The placeholder a brand-new
        // conversation starts with is not a name worth announcing.
        const currentName = this.engine.Conversations.find(c => UUIDsEqual(c.ID, task.conversationId))?.Name
          ?? task.conversationName;
        const conversationName = currentName && currentName !== 'New Conversation' ? currentName : null;
        MJNotificationService.Instance?.CreateRichNotification({
          title: `${task.agentName} finished`,
          message: conversationName ? `in ${conversationName}` : null,
          imageUrl: agent?.LogoURL ?? null,
          iconClass: agent?.IconClass ?? 'fa-solid fa-robot',
          hideAfter: 5000,
          dedupeKey: `agent-completion:${task.conversationId ?? task.id}`,
          context: { conversationId: task.conversationId, agentId: task.agentId, agentName: task.agentName }
        });
      }
    } else {
      // verboseOnly, and no longer a warning. A turn registers ONE task, against whichever message
      // its flow chose — activeTasks.add() is called with the user message, a Sage delegation
      // message, a status message or the agent response depending on the path — while this method
      // runs for EVERY message in the turn reaching Complete or Error. Most calls therefore land
      // here, so it is the normal case rather than the lifecycle race the old text described
      // ("task may have been removed prematurely or not added"). Kept for tracing, off by default.
      LogStatusEx({ message: `[MarkComplete] No task registered against completed message ${conversationDetail.ID} — expected for any message that did not start the turn`, verboseOnly: true });
    }

    // Emit completion event to parent so it can refresh agent run data
    this.MessageComplete.emit({
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
    this.ArtifactCreated.emit({
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
