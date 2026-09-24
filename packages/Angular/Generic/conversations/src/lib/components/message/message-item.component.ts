import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit,
  OnInit,
  OnChanges,
  SimpleChanges,
  DoCheck,
  TemplateRef
} from '@angular/core';
import { MJConversationDetailEntity, MJConversationEntity, MJArtifactEntity, MJArtifactVersionEntity, MJTaskEntity, RatingJSON } from '@memberjunction/core-entities';
import { UserInfo, RunView, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AgentResponseForm, FormQuestion, ChoiceQuestionType, ActionableCommand, AutomaticCommand, ConversationUtility, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { FormResponseUtils } from '@memberjunction/ng-forms';
import { MentionParserService } from '../../services/mention-parser.service';
import { PlanModePreference } from '../../utils/plan-mode-preference';
import { MarkdownService } from '@memberjunction/ng-markdown';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { UICommandHandlerService } from '../../services/ui-command-handler.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import {
  BeforeResponseFormSubmittedEventArgs,
  AfterResponseFormSubmittedEventArgs,
} from '../../events/chat-events';
import { UUIDsEqual } from '@memberjunction/global';
import { BadgeTextForAttachment } from '../../util/attachment-badge';

/**
 * Represents an attachment on a message for display
 */
/**
 * How much the displayed progress can still be trusted for an in-flight run.
 *
 * - `live` — the server is heart-beating; the timer means what it says.
 * - `checking` — nothing has been heard for a while and the client is re-reading durable state.
 * - `stalled` — silent long enough that the server's own watchdog will force-fail the run.
 */
export type MessageLivenessState = 'live' | 'checking' | 'stalled';

/**
 * Silence after which an in-flight run is no longer presented as healthy. Three missed heartbeats
 * (`AgentRunWatchdogConfig.heartbeatIntervalMs` is 30s), so ordinary jitter never trips it.
 */
export const LIVENESS_CHECKING_MS = 90_000;

/**
 * Silence after which the run is presented as stalled. Matches the watchdog's
 * `staleThresholdMinutes`, which is the point the server force-fails the run — so the UI stops
 * claiming progress exactly when the server stops believing in it.
 */
export const LIVENESS_STALLED_MS = 5 * 60_000;

/** Minimum gap between re-check requests from one message. The pill re-evaluates every second. */
export const LIVENESS_RECHECK_THROTTLE_MS = 30_000;

export interface MessageAttachment {
  id: string;
  type: 'Image' | 'Video' | 'Audio' | 'Document';
  mimeType: string;
  fileName: string | null;
  sizeBytes: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  contentUrl?: string;
  /** Source of the attachment: 'upload' for chat uploads, 'artifact' for artifact picker */
  source?: 'upload' | 'artifact';
  /** For source='artifact': the underlying MJArtifact.ID so clicks can open the viewer. */
  artifactId?: string;
  /** For source='artifact': the underlying MJArtifactVersion.ID. */
  artifactVersionId?: string;
  /** For source='artifact': resolved MJArtifactType.Name, e.g. "Data Snapshot". Drives the type badge. */
  artifactTypeName?: string;
}

/**
 * A fully-loaded artifact + its version to render as a card under a message.
 * A single message can carry more than one DISTINCT artifact (e.g. a research
 * report plus a standalone generated infographic), so the message renders an
 * array of these — one card each.
 */
export interface MessageArtifactRef {
  artifact: MJArtifactEntity;
  version: MJArtifactVersionEntity;
}

/**
 * An artifact known to be attached to a message whose entity rows are still loading.
 *
 * These fields all come off `LazyArtifactInfo`, which the conversation query populates
 * synchronously — only the artifact and version ENTITIES are lazy, because a version's `Content`
 * can be arbitrarily large. Carrying the display data rather than a bare count means the
 * placeholder can name what is arriving and match its final styling.
 */
export interface MessagePendingArtifactRef {
  artifactId: string;
  artifactName: string;
  visibility: string;
}

/** Shared empty result so the placeholder getter allocates nothing once loading has finished. */
const NO_PENDING_ARTIFACTS: readonly MessagePendingArtifactRef[] = Object.freeze([]);

/**
 * Component for displaying a single message in a conversation
 * Follows the dynamic rendering pattern from skip-chat for optimal performance
 * This component is created dynamically via ViewContainerRef.createComponent()
 */
@Component({
  standalone: false,
  selector: 'mj-conversation-message-item',
  templateUrl: './message-item.component.html',
  styleUrls: [
    './message-item.component.css',
    '../../styles/custom-agent-icons.css'
  ]
})
export class MessageItemComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges, DoCheck {
  @Input() public message!: MJConversationDetailEntity;
  @Input() public Conversation!: MJConversationEntity | null;

  /** @deprecated Use {@link Conversation}. */
  @Input() public set conversation(value: MJConversationEntity | null) {
    this.Conversation = value;
  }
  /** @deprecated Use {@link Conversation}. */
  public get conversation(): MJConversationEntity | null {
    return this.Conversation;
  }
  @Input() public CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() public set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  public get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() public AllMessages!: MJConversationDetailEntity[];

  /** @deprecated Use {@link AllMessages}. */
  @Input() public set allMessages(value: MJConversationDetailEntity[]) {
    this.AllMessages = value;
  }
  /** @deprecated Use {@link AllMessages}. */
  public get allMessages(): MJConversationDetailEntity[] {
    return this.AllMessages;
  }
  @Input() public IsProcessing: boolean = false;

  /** @deprecated Use {@link IsProcessing}. */
  @Input() public set isProcessing(value: boolean) {
    this.IsProcessing = value;
  }
  /** @deprecated Use {@link IsProcessing}. */
  public get isProcessing(): boolean {
    return this.IsProcessing;
  }
  @Input() public Artifact?: MJArtifactEntity;

  /** @deprecated Use {@link Artifact}. */
  @Input() public set artifact(value: MJArtifactEntity | undefined) {
    this.Artifact = value;
  }
  /** @deprecated Use {@link Artifact}. */
  public get artifact(): MJArtifactEntity | undefined {
    return this.Artifact;
  }
  @Input() public artifactVersion?: MJArtifactVersionEntity;
  /**
   * All distinct artifacts attached to this message, each at its latest version.
   * Preferred over the single `artifact`/`artifactVersion` inputs above (which are
   * retained for backward compatibility and kept pointed at the first entry).
   */
  @Input() public Artifacts: MessageArtifactRef[] = [];

  /** @deprecated Use {@link Artifacts}. */
  @Input() public set artifacts(value: MessageArtifactRef[]) {
    this.Artifacts = value;
  }
  /** @deprecated Use {@link Artifacts}. */
  public get artifacts(): MessageArtifactRef[] {
    return this.Artifacts;
  }
  @Input() public AgentRun: MJAIAgentRunEntityExtended | null = null;

  /** @deprecated Use {@link AgentRun}. */
  @Input() public set agentRun(value: MJAIAgentRunEntityExtended | null) {
    this.AgentRun = value;
  }
  /** @deprecated Use {@link AgentRun}. */
  public get agentRun(): MJAIAgentRunEntityExtended | null {
    return this.AgentRun;
  } // Passed from parent, loaded once per conversation
  @Input() public UserAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();

  /** @deprecated Use {@link UserAvatarMap}. */
  @Input() public set userAvatarMap(value: Map<string, {imageUrl: string | null; iconClass: string | null}>) {
    this.UserAvatarMap = value;
  }
  /** @deprecated Use {@link UserAvatarMap}. */
  public get userAvatarMap(): Map<string, {imageUrl: string | null; iconClass: string | null}> {
    return this.UserAvatarMap;
  }
  @Input() public Ratings?: RatingJSON[];

  /** @deprecated Use {@link Ratings}. */
  @Input() public set ratings(value: RatingJSON[] | undefined) {
    this.Ratings = value;
  }
  /** @deprecated Use {@link Ratings}. */
  public get ratings(): RatingJSON[] | undefined {
    return this.Ratings;
  } // Pre-loaded ratings from parent (RatingsJSON from query)
  @Input() public IsLastMessage: boolean = false;

  /** @deprecated Use {@link IsLastMessage}. */
  @Input() public set isLastMessage(value: boolean) {
    this.IsLastMessage = value;
  }
  /** @deprecated Use {@link IsLastMessage}. */
  public get isLastMessage(): boolean {
    return this.IsLastMessage;
  } // Whether this is the last message in the conversation
  @Input() public Attachments: MessageAttachment[] = [];

  /** @deprecated Use {@link Attachments}. */
  @Input() public set attachments(value: MessageAttachment[]) {
    this.Attachments = value;
  }
  /** @deprecated Use {@link Attachments}. */
  public get attachments(): MessageAttachment[] {
    return this.Attachments;
  } // Attachments for this message

  /**
   * Artifacts attached to this message whose entity rows have not arrived yet.
   *
   * The parent knows these synchronously — the message-to-artifact map is already in memory —
   * while loading each artifact and version row is not. Without them the message rendered as
   * finished with nothing where the image belonged, then the card appeared unannounced seconds
   * later, which reads as "generation failed" rather than "still loading".
   *
   * Set alongside, not instead of, {@link artifacts}: on a message that already shows a report and
   * is still loading an image, both render at once. Entries whose artifact has since loaded are
   * filtered out by {@link pendingArtifactPlaceholders}.
   */
  @Input() public PendingArtifacts: readonly MessagePendingArtifactRef[] = [];

  /** @deprecated Use {@link PendingArtifacts}. */
  @Input() public set pendingArtifacts(value: readonly MessagePendingArtifactRef[]) {
    this.PendingArtifacts = value;
  }
  /** @deprecated Use {@link PendingArtifacts}. */
  public get pendingArtifacts(): readonly MessagePendingArtifactRef[] {
    return this.PendingArtifacts;
  }

  /**
   * Optional additive per-message slot template (forwarded from chat-area's
   * `mjChatSlot="messageExtra"`). Rendered inside the bubble after the message
   * content, before attachments. Receives the message as `$implicit` + a named
   * `message` context binding. Null when no consumer template is projected.
   */
  @Input() public MessageExtraTemplate: TemplateRef<unknown> | null = null;

  /** @deprecated Use {@link MessageExtraTemplate}. */
  @Input() public set messageExtraTemplate(value: TemplateRef<unknown> | null) {
    this.MessageExtraTemplate = value;
  }
  /** @deprecated Use {@link MessageExtraTemplate}. */
  public get messageExtraTemplate(): TemplateRef<unknown> | null {
    return this.MessageExtraTemplate;
  }

  // --- Host-level feature gates (forwarded from mj-conversation-chat-area) ---
  // All default true so existing consumers are unaffected; set false to remove
  // the affordance entirely (the control is not rendered, not merely disabled).
  /** Show the per-message agent run-detail grid (run ID, step/token counts, $ cost). */
  @Input() public ShowAgentRunDetails: boolean = true;

  /** @deprecated Use {@link ShowAgentRunDetails}. */
  @Input() public set showAgentRunDetails(value: boolean) {
    this.ShowAgentRunDetails = value;
  }
  /** @deprecated Use {@link ShowAgentRunDetails}. */
  public get showAgentRunDetails(): boolean {
    return this.ShowAgentRunDetails;
  }
  /** Show the per-message reaction buttons (like / comment). */
  @Input() public ShowReactions: boolean = true;

  /** @deprecated Use {@link ShowReactions}. */
  @Input() public set showReactions(value: boolean) {
    this.ShowReactions = value;
  }
  /** @deprecated Use {@link ShowReactions}. */
  public get showReactions(): boolean {
    return this.ShowReactions;
  }
  /** Show the per-message thumbs rating control on completed AI messages. */
  @Input() public ShowMessageRating: boolean = true;

  /** @deprecated Use {@link ShowMessageRating}. */
  @Input() public set showMessageRating(value: boolean) {
    this.ShowMessageRating = value;
  }
  /** @deprecated Use {@link ShowMessageRating}. */
  public get showMessageRating(): boolean {
    return this.ShowMessageRating;
  }
  /** Allow pinning messages (the per-message pin button). */
  @Input() public AllowPinning: boolean = true;

  /** @deprecated Use {@link AllowPinning}. */
  @Input() public set allowPinning(value: boolean) {
    this.AllowPinning = value;
  }
  /** @deprecated Use {@link AllowPinning}. */
  public get allowPinning(): boolean {
    return this.AllowPinning;
  }
  /** Allow editing the user's own messages (the per-message edit button). */
  @Input() public AllowMessageEdit: boolean = true;

  /** @deprecated Use {@link AllowMessageEdit}. */
  @Input() public set allowMessageEdit(value: boolean) {
    this.AllowMessageEdit = value;
  }
  /** @deprecated Use {@link AllowMessageEdit}. */
  public get allowMessageEdit(): boolean {
    return this.AllowMessageEdit;
  }
  /** Allow deleting the user's own messages (the per-message delete button). */
  @Input() public AllowMessageDelete: boolean = true;

  /** @deprecated Use {@link AllowMessageDelete}. */
  @Input() public set allowMessageDelete(value: boolean) {
    this.AllowMessageDelete = value;
  }
  /** @deprecated Use {@link AllowMessageDelete}. */
  public get allowMessageDelete(): boolean {
    return this.AllowMessageDelete;
  }
  /** Host override for the AI message display name (white-label persona). Null = the agent record's name. */
  @Input() public AssistantDisplayName: string | null = null;

  /** @deprecated Use {@link AssistantDisplayName}. */
  @Input() public set assistantDisplayName(value: string | null) {
    this.AssistantDisplayName = value;
  }
  /** @deprecated Use {@link AssistantDisplayName}. */
  public get assistantDisplayName(): string | null {
    return this.AssistantDisplayName;
  }
  /** Host image URL for the AI message avatar. Null = the agent's Font Awesome icon. */
  @Input()
  public set AssistantAvatarUrl(value: string | null) {
    if (value !== this._assistantAvatarUrl) {
      this._assistantAvatarUrl = value;
      // A new URL gets a fresh chance even if the previous one 404'd.
      this.AssistantAvatarFailed = false;
    }
  }
  public get AssistantAvatarUrl(): string | null {
    return this._assistantAvatarUrl;
  }

  /** @deprecated Use {@link AssistantAvatarUrl}. */
  public get assistantAvatarUrl(): string | null {
    return this.AssistantAvatarUrl;
  }
  /** @deprecated Use {@link AssistantAvatarUrl}. */
  @Input() public set assistantAvatarUrl(value: string | null) {
    this.AssistantAvatarUrl = value;
  }
  private _assistantAvatarUrl: string | null = null;

  /** The last assistantAvatarUrl failed to load — fall back to the icon branch. */
  public AssistantAvatarFailed = false;

  /** @deprecated Use {@link AssistantAvatarFailed}. */
  public get assistantAvatarFailed() {
    return this.AssistantAvatarFailed;
  }
  /** @deprecated Use {@link AssistantAvatarFailed}. */
  public set assistantAvatarFailed(value) {
    this.AssistantAvatarFailed = value;
  }

  /** The avatar image URL actually rendered: trimmed, and null after a load error
   *  so a broken/whitespace URL degrades to the agent icon instead of a broken-image glyph. */
  public get EffectiveAssistantAvatarUrl(): string | null {
    if (this.AssistantAvatarFailed) return null;
    const url = this._assistantAvatarUrl?.trim();
    return url ? url : null;
  }

  /** @deprecated Use {@link EffectiveAssistantAvatarUrl}. */
  public get effectiveAssistantAvatarUrl(): string | null {
    return this.EffectiveAssistantAvatarUrl;
  }

  @Output() public EditClicked = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link EditClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (editClicked) keeps working. Must stay AFTER EditClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public editClicked = this.EditClicked;
  @Output() public DeleteClicked = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link DeleteClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (deleteClicked) keeps working. Must stay AFTER DeleteClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public deleteClicked = this.DeleteClicked;
  @Output() public RetryClicked = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link RetryClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (retryClicked) keeps working. Must stay AFTER RetryClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public retryClicked = this.RetryClicked;
  @Output() public TestFeedbackClicked = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link TestFeedbackClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (testFeedbackClicked) keeps working. Must stay AFTER TestFeedbackClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public testFeedbackClicked = this.TestFeedbackClicked;
  @Output() public ArtifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();

  /**
   * @deprecated Use {@link ArtifactClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (artifactClicked) keeps working. Must stay AFTER ArtifactClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public artifactClicked = this.ArtifactClicked;
  @Output() public ArtifactActionPerformed = new EventEmitter<{action: string; artifactId: string}>();

  /**
   * @deprecated Use {@link ArtifactActionPerformed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (artifactActionPerformed) keeps working. Must stay AFTER ArtifactActionPerformed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public artifactActionPerformed = this.ArtifactActionPerformed;
  @Output() public MessageEdited = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link MessageEdited}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (messageEdited) keeps working. Must stay AFTER MessageEdited: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public messageEdited = this.MessageEdited;
  @Output() public OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public openEntityRecord = this.OpenEntityRecord;
  @Output() public SuggestedResponseSelected = new EventEmitter<{text: string; customInput?: string}>();

  /**
   * @deprecated Use {@link SuggestedResponseSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (suggestedResponseSelected) keeps working. Must stay AFTER SuggestedResponseSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public suggestedResponseSelected = this.SuggestedResponseSelected;
  @Output() public AttachmentClicked = new EventEmitter<MessageAttachment>();

  /**
   * @deprecated Use {@link AttachmentClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (attachmentClicked) keeps working. Must stay AFTER AttachmentClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public attachmentClicked = this.AttachmentClicked;
  @Output() public DiagnosticRequested = new EventEmitter<string>();

  /**
   * @deprecated Use {@link DiagnosticRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (diagnosticRequested) keeps working. Must stay AFTER DiagnosticRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public diagnosticRequested = this.DiagnosticRequested; // emits messageId on Shift+Click
  @Output() public MessagePinToggled = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link MessagePinToggled}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (messagePinToggled) keeps working. Must stay AFTER MessagePinToggled: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public messagePinToggled = this.MessagePinToggled;

  /**
   * Raised when this message's run has gone quiet long enough that the displayed state may be
   * fiction (MJ #4222). The parent answers by re-reading durable state; if the run really is alive
   * its heartbeat advances and the pill returns to 'live' on the next tick.
   */
  @Output() public LivenessCheckRequested = new EventEmitter<string>(); // emits messageId

  /**
   * Cancelable — fired BEFORE the response form's values are sent back as a new
   * conversation message. Listeners may set `event.Cancel = true` to halt the
   * submission (e.g., a validation pass that finds required fields unfilled).
   * When canceled, the corresponding {@link afterResponseFormSubmitted} event is
   * NOT fired and `suggestedResponseSelected` is NOT emitted.
   * Follows MJ's established Before/After cancelable event pattern.
   */
  @Output() public BeforeResponseFormSubmitted = new EventEmitter<BeforeResponseFormSubmittedEventArgs>();

  /**
   * @deprecated Use {@link BeforeResponseFormSubmitted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeResponseFormSubmitted) keeps working. Must stay AFTER BeforeResponseFormSubmitted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public beforeResponseFormSubmitted = this.BeforeResponseFormSubmitted;

  /**
   * Fired AFTER the response form's values have been submitted. Carries the form id
   * (using the message ID as a stable per-message identifier) and the submitted
   * values map. Not fired when {@link beforeResponseFormSubmitted} was canceled.
   */
  @Output() public AfterResponseFormSubmitted = new EventEmitter<AfterResponseFormSubmittedEventArgs>();

  /**
   * @deprecated Use {@link AfterResponseFormSubmitted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterResponseFormSubmitted) keeps working. Must stay AFTER AfterResponseFormSubmitted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public afterResponseFormSubmitted = this.AfterResponseFormSubmitted;

  private _loadTime: number = Date.now();
  private _elapsedTimeInterval: any = null;
  public ElapsedTimeFormatted: string = '0:00';

  /** @deprecated Use {@link ElapsedTimeFormatted}. */
  public get _elapsedTimeFormatted(): string {
    return this.ElapsedTimeFormatted;
  }
  /** @deprecated Use {@link ElapsedTimeFormatted}. */
  public set _elapsedTimeFormatted(value: string) {
    this.ElapsedTimeFormatted = value;
  }
  public AgentRunDurationFormatted: string = '0:00';

  /** @deprecated Use {@link AgentRunDurationFormatted}. */
  public get _agentRunDurationFormatted(): string {
    return this.AgentRunDurationFormatted;
  }
  /** @deprecated Use {@link AgentRunDurationFormatted}. */
  public set _agentRunDurationFormatted(value: string) {
    this.AgentRunDurationFormatted = value;
  }
  public IsEditing: boolean = false;

  /** @deprecated Use {@link IsEditing}. */
  public get isEditing(): boolean {
    return this.IsEditing;
  }
  /** @deprecated Use {@link IsEditing}. */
  public set isEditing(value: boolean) {
    this.IsEditing = value;
  }
  public EditedText: string = '';

  /** @deprecated Use {@link EditedText}. */
  public get editedText(): string {
    return this.EditedText;
  }
  /** @deprecated Use {@link EditedText}. */
  public set editedText(value: string) {
    this.EditedText = value;
  }
  private originalText: string = '';

  // Track previous status for DoCheck comparison
  private _previousMessageStatus: 'Complete' | 'In-Progress' | 'Error' | undefined = undefined;

  /**
   * Cached values updated in ngDoCheck so they stay stable through Angular's
   * dev-mode verify pass. The underlying message entity properties (Status,
   * Message) can mutate between the check and verify passes (e.g., from
   * WebSocket streaming updates), which causes ExpressionChangedAfterItHasBeenCheckedError
   * if templates read the live properties directly.
   */
  private _messageClasses: string = 'message-item';
  private _stableDisplayMessage: string = '';
  private _stableIsInProgressAIMessage: boolean = false;
  private _stableLivenessState: MessageLivenessState = 'live';
  /** When this component started watching the current run. Bounds the server-clock comparison. */
  private _livenessWatchStart: number = Date.now();
  /** Last time a re-check was requested, so a quiet run asks once per window, not once per second. */
  private _lastLivenessRequestAt: number = 0;

  // Agent run details
  public IsAgentDetailsExpanded: boolean = false;

  /** @deprecated Use {@link IsAgentDetailsExpanded}. */
  public get isAgentDetailsExpanded(): boolean {
    return this.IsAgentDetailsExpanded;
  }
  /** @deprecated Use {@link IsAgentDetailsExpanded}. */
  public set isAgentDetailsExpanded(value: boolean) {
    this.IsAgentDetailsExpanded = value;
  }
  public DetailTasks: MJTaskEntity[] = [];

  /** @deprecated Use {@link DetailTasks}. */
  public get detailTasks(): MJTaskEntity[] {
    return this.DetailTasks;
  }
  /** @deprecated Use {@link DetailTasks}. */
  public set detailTasks(value: MJTaskEntity[]) {
    this.DetailTasks = value;
  }
  private tasksLoaded: boolean = false;

  // Memoization for mention parsing to prevent repeated parsing on change detection
  private _cachedDisplayMessage: string = '';
  private _cachedMessageText: string = '';

  // Shared AI mention/suggestion engine (BaseSingleton — same instance the composer plugins use)
  private mentionAutocomplete = MentionAutocompleteService.Instance;

  constructor(
    private cdRef: ChangeDetectorRef,
    private mentionParser: MentionParserService,
    private uiCommandHandler: UICommandHandlerService,
    private agentService: ConversationAgentService,
    private markdownService: MarkdownService
  ) {
    super();
  }

  async ngOnInit() {
    // AIEngineBase is deferred at startup; kick off the load early so the
    // template-bound aiAgentInfo getter finds populated .Agents data when
    // change detection asks for it. Fire-and-forget — the getter falls back
    // to defaults until it's loaded.
    AIEngineBase.Instance.EnsureLoaded();

    // Warm the conversation-manager-agent cache (DefaultAgentResolver chain)
    // so the synchronous isConversationManager getter returns the right answer
    // on first render. Fire-and-forget — the getter returns false until cached,
    // matching the pre-PR-2 behavior of the previous hardcoded check.
    void this.agentService.getConversationManagerAgent();

    // Execute automatic commands if present
    await this.executeAutomaticCommands();
  }

  ngOnChanges(_changes: SimpleChanges) {
    // No longer need to manage timer for agentRun changes
    // Parent's 1-second timer + agentRunDuration getter handles all agent run timing
    // Component's timer only runs for temporary messages (handled in ngAfterViewInit)
  }

  /**
   * DoCheck lifecycle hook - detects changes to message properties
   * This runs on every change detection cycle, so we check if Status actually changed
   * This is more reliable than ngOnChanges when the message object reference doesn't change
   */
  ngDoCheck() {
    if (!this.message) {
      return;
    }

    const currentStatus = this.message.Status;

    // Check if status changed from non-Complete to Complete
    if (this._previousMessageStatus !== 'Complete' && currentStatus === 'Complete') {
      // Stop the elapsed time interval
      if (this._elapsedTimeInterval !== null) {
        clearInterval(this._elapsedTimeInterval);
        this._elapsedTimeInterval = null;
      }

      // Force immediate synchronous change detection for dynamically created components
      // markForCheck() only schedules a check which may not run for dynamic components
      // detectChanges() forces immediate view update so UI shows timer stopped right away
      this.cdRef.detectChanges();
    }

    // Update previous status for next check
    this._previousMessageStatus = currentStatus;

    // Rebuild cached values so they're stable during Angular's check/verify cycle.
    // ngDoCheck runs once per CD pass but NOT during the dev-mode verify pass, so
    // snapshotting here produces values that don't change between the two reads.
    this._messageClasses = this.buildMessageClasses();
    this._stableIsInProgressAIMessage = this.IsAIMessage && currentStatus === 'In-Progress';
    this._stableDisplayMessage = this.computeDisplayMessage();

    // Nothing in flight means nothing to watch — restart the clock so a run that begins later is
    // measured from when it began, not from when this component was created.
    const inFlight = this.isLivenessInFlight();
    this.refreshLivenessState();

    // Re-arm the elapsed timer here, not only in ngAfterViewInit. A message that becomes
    // in-progress AFTER the view initialised — the common case, since the row is rendered before
    // the agent starts — otherwise never got an interval, so its pill never ticked and its liveness
    // state was never recomputed on a schedule.
    if (inFlight && this._elapsedTimeInterval === null) {
      this.startElapsedTimeUpdater();
    }
  }

  /** Whether something is still running for this message, read live rather than from a cache. */
  private isLivenessInFlight(): boolean {
    return (this.IsAIMessage && this.message?.Status === 'In-Progress') || this.IsAgentRunActive;
  }

  /**
   * Recompute the liveness state, and ask the host to re-read durable state when it has degraded.
   *
   * Called from ngDoCheck AND from the one-second timer, and the timer path is the load-bearing
   * one. `ChangeDetectorRef.detectChanges()` re-renders this view but does NOT re-invoke this
   * component's own `ngDoCheck` — that runs only when an ancestor's change detection reaches this
   * node. During the outage this exists to report, nothing triggers an ancestor pass, so a state
   * computed only in `ngDoCheck` freezes at 'live' and the pill keeps counting as though healthy.
   */
  private refreshLivenessState(): void {
    if (!this.isLivenessInFlight()) {
      // Nothing in flight means nothing to watch — restart the clock so a run that begins later is
      // measured from when it began, not from when this component was created.
      this._livenessWatchStart = Date.now();
      this._stableLivenessState = 'live';
      return;
    }

    this._stableLivenessState = this.computeLivenessState();
    if (this._stableLivenessState !== 'live') {
      this.requestLivenessCheck();
    }
  }

  /**
   * Classify how much the displayed progress can still be trusted.
   *
   * Only meaningful while something is in flight; a finished message is always reported `live`.
   */
  private computeLivenessState(): MessageLivenessState {
    if (!this.isLivenessInFlight()) {
      return 'live';
    }

    const silence = this.runSilenceMs();
    if (silence >= LIVENESS_STALLED_MS) {
      return 'stalled';
    }
    if (silence >= LIVENESS_CHECKING_MS) {
      return 'checking';
    }
    return 'live';
  }

  /**
   * How long the server has been silent about this run, in milliseconds.
   *
   * `LastHeartbeatAt` is stamped on the DATABASE clock and compared here against the browser's, so
   * the raw difference carries whatever skew exists between them. It is therefore bounded by how
   * long this component has actually been watching: we can never claim more silence than we have
   * observed. A browser clock running fast can no longer invent a stall, and the bound lifts on its
   * own within the first check window.
   */
  private runSilenceMs(): number {
    const now = Date.now();
    const watching = Math.max(0, now - this._livenessWatchStart);

    const stamps = [this.AgentRun?.LastHeartbeatAt, this.AgentRun?.__mj_UpdatedAt]
      .filter((d): d is Date => d != null)
      .map(d => new Date(d).getTime())
      .filter(t => !Number.isNaN(t));

    if (stamps.length === 0) {
      // No run row yet, or one carrying no timestamps. Our own watch time is all we have.
      return watching;
    }

    const serverSilence = now - Math.max(...stamps);
    return Math.max(0, Math.min(serverSilence, watching));
  }

  /**
   * Ask the parent to re-read durable state for this message, at most once per window.
   *
   * This closes the loop with the reconciliation triggers: those fire on transport events, and this
   * one fires on the symptom itself — a run that has simply gone quiet, with no event to notice.
   */
  private requestLivenessCheck(): void {
    const now = Date.now();
    if (now - this._lastLivenessRequestAt < LIVENESS_RECHECK_THROTTLE_MS) {
      return;
    }
    this._lastLivenessRequestAt = now;
    this.LivenessCheckRequested.emit(this.message.ID);
  }

  /** How much the displayed progress can still be trusted. See {@link MessageLivenessState}. */
  public get LivenessState(): MessageLivenessState {
    return this._stableLivenessState;
  }

  ngAfterViewInit() {
    // Use message creation timestamp if available (for reconnecting to in-progress messages)
    // Otherwise use current time for brand new messages
    if (this.message?.__mj_CreatedAt) {
      this._loadTime = new Date(this.message.__mj_CreatedAt).getTime();
    } else {
      this._loadTime = Date.now();
    }
    this.startElapsedTimeUpdater();
    this.cdRef.detectChanges();
  }

  ngOnDestroy() {
    if (this._elapsedTimeInterval !== null) {
      clearInterval(this._elapsedTimeInterval);
      this._elapsedTimeInterval = null;
    }
  }

  /**
   * Handles clicks on the message bubble.
   * Shift+Click on any AI message emits a diagnosticRequested event so the parent
   * can dump live streaming state to the browser console — useful for debugging
   * stuck or forever-spinning conversations without any code changes.
   */
  public OnMessageBubbleClick(event: MouseEvent): void {
    const recordBadge = (event.target as HTMLElement | null)?.closest?.('.mention-badge.record') as HTMLElement | null;
    if (recordBadge) {
      event.preventDefault();
      event.stopPropagation();
      this.openRecordLinkBadge(recordBadge);
      return;
    }
    if (!event.shiftKey || !this.IsAIMessage) return;
    event.preventDefault();
    event.stopPropagation();
    this.DiagnosticRequested.emit(this.message.ID);
  }

  /** @deprecated Use {@link OnMessageBubbleClick}. */
  public onMessageBubbleClick(event: MouseEvent): void {
    return this.OnMessageBubbleClick(event);
  }

  private openRecordLinkBadge(el: HTMLElement): void {
    const entityName = el.getAttribute('data-record-entity');
    const keysJson = el.getAttribute('data-record-keys');
    if (!entityName) return;
    let content: { type: 'record'; name: string; entityName: string; keys?: Record<string, string | number> };
    try {
      const keys = keysJson ? JSON.parse(keysJson) as Record<string, string | number> : {};
      content = { type: 'record', name: el.textContent?.trim() || entityName, entityName, keys };
    } catch {
      return;
    }
    const entity = this.ProviderToUse.EntityByName(entityName);
    if (!entity) {
      console.warn('Record link: unknown entity', entityName);
      return;
    }
    const compositeKey = ConversationUtility.CompositeKeyFromRecordLink(
      content,
      entity.PrimaryKeys.map(pk => pk.Name)
    );
    if (!compositeKey) {
      console.warn('Record link: incomplete primary key', entityName, keysJson);
      return;
    }
    this.OpenEntityRecord.emit({ entityName, compositeKey });
  }

  /**
   * Starts the elapsed time updater interval for temporary messages only
   * For agent runs with IDs, the parent's timer + agentRunDuration getter handles updates
   * Updates every second for temporary messages that use _elapsedTimeFormatted
   */
  private startElapsedTimeUpdater(): void {
    // Start timer for temporary messages (in-progress, no ID) OR active agent runs
    // Both need periodic updates to _elapsedTimeFormatted / _agentRunDurationFormatted
    if (this.IsInProgressAIMessage || this.IsAgentRunActive) {
      // Initial update
      this.updateTimers();
      this.cdRef.markForCheck();

      // Start interval if not already running
      if (this._elapsedTimeInterval === null) {
        this._elapsedTimeInterval = setInterval(() => {
          this.updateTimers();
          // Use detectChanges to force immediate synchronous view update
          // markForCheck only schedules a check which may not happen if parent already checked
          this.cdRef.detectChanges();
        }, 1000);
      }
    }
  }

  /**
   * Update all timer displays
   * Called every second by the interval timer
   */
  private updateTimers(): void {
    // Update temporary message elapsed time
    if (this.IsInProgressAIMessage) {
      this.ElapsedTimeFormatted = this.formatElapsedTime(this.ElapsedTimeSinceLoad);
    }

    // Update agent run duration for active runs
    if (this.IsAgentRunActive && this.AgentRun?.__mj_CreatedAt) {
      const createdAt = new Date(this.AgentRun.__mj_CreatedAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      this.AgentRunDurationFormatted = this.formatDurationFromMs(diffMs);
    }

    // Silence only grows with time, so it has to be re-evaluated on the clock rather than on
    // change detection. This is the only path that runs while the transport is dead.
    this.refreshLivenessState();
  }

  private formatElapsedTime(elapsedTime: number): string {
    let seconds = Math.floor(elapsedTime / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    let formattedTime = (hours > 0 ? hours + ':' : '') +
      (minutes < 10 && hours > 0 ? '0' : '') + minutes + ':' +
      (seconds < 10 ? '0' : '') + seconds;
    return formattedTime;
  }

  private formatDurationFromMs(diffMs: number): string {
    if (diffMs <= 0) {
      return '0:00';
    }

    let seconds = Math.floor(diffMs / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    let formattedTime = (hours > 0 ? hours + ':' : '') +
      (minutes < 10 && hours > 0 ? '0' : '') + minutes + ':' +
      (seconds < 10 ? '0' : '') + seconds;
    return formattedTime;
  }

  public get ElapsedTimeSinceLoad(): number {
    return Date.now() - this._loadTime;
  }

  /** @deprecated Use {@link ElapsedTimeSinceLoad}. */
  public get elapsedTimeSinceLoad(): number {
    return this.ElapsedTimeSinceLoad;
  }

  public get IsAIMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'ai';
  }

  /** @deprecated Use {@link IsAIMessage}. */
  public get isAIMessage(): boolean {
    return this.IsAIMessage;
  }

  /**
   * The agent identity as shown in the UI: the ENGINE-resolved identity (see
   * {@link engineAgentInfo}) with the host's `assistantDisplayName` override
   * applied to the name when set. Internal logic that must compare against the
   * real agent name (e.g. {@link isConversationManager}) uses `engineAgentInfo`
   * directly, so a display override can never change routing/behavior decisions.
   */
  public get AiAgentInfo(): { name: string; iconClass: string; role: string } | null {
    const info = this.engineAgentInfo;
    if (!info) return null;
    const override = this.AssistantDisplayName?.trim();
    return override ? { ...info, name: override } : info;
  }

  /** @deprecated Use {@link AiAgentInfo}. */
  public get aiAgentInfo(): { name: string; iconClass: string; role: string } | null {
    return this.AiAgentInfo;
  }

  /** The engine-resolved agent identity — no host display overrides applied.
   *  Protected (not private) so the template's run-details header — which labels
   *  the REAL agent's diagnostics and record link — can read it directly. */
  protected get engineAgentInfo(): { name: string; iconClass: string; role: string } | null {
    if (!this.IsAIMessage) return null;

    // Get agent ID from denormalized field (populated when message is created)
    const agentID = this.message.AgentID;

    // Look up agent from AIEngineBase cache
    if (agentID && AIEngineBase.Instance?.Agents) {
      const agent = AIEngineBase.Instance.Agents.find(a => UUIDsEqual(a.ID, agentID));
      if (agent) {
        return {
          name: agent.Name || 'AI Assistant',
          iconClass: agent.IconClass || 'fa-robot',
          role: agent.Description || 'AI Assistant'
        };
      } else {
        // Only log if the message is complete (should have AgentID by then)
        if (this.message.Status === 'Complete') {
          console.warn('⚠️ Agent not found in cache for ID:', agentID);
        }
      }
    }
    // Note: In-progress messages won't have AgentID yet, so we don't log warnings for them

    // Default fallback for AI messages without agent info
    return {
      name: 'AI Assistant',
      iconClass: 'fa-robot',
      role: 'AI Assistant'
    };
  }

  public get IsUserMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'user';
  }

  /** @deprecated Use {@link IsUserMessage}. */
  public get isUserMessage(): boolean {
    return this.IsUserMessage;
  }

  /**
   * Get the actual sender name for user messages
   * Uses the denormalized User field from the view if available,
   * otherwise falls back to current user name
   */
  public get MessageSenderName(): string {
    // Use the denormalized User field from the ConversationDetail view
    // This is populated from the UserID (if present) or falls back to Conversation.UserID
    if (this.message.User) {
      return this.message.User;
    }

    // Fallback to current user name (for backwards compatibility)
    return this.CurrentUser.Name;
  }

  /** @deprecated Use {@link MessageSenderName}. */
  public get messageSenderName(): string {
    return this.MessageSenderName;
  }

  /**
   * Get the user's avatar image URL from the userAvatarMap
   * Uses fast O(1) lookup by UserID
   */
  public get UserAvatarUrl(): string | null {
    if (!this.IsUserMessage || !this.message.UserID) {
      return null;
    }
    const avatarData = this.UserAvatarMap.get(this.message.UserID);
    return avatarData?.imageUrl || null;
  }

  /** @deprecated Use {@link UserAvatarUrl}. */
  public get userAvatarUrl(): string | null {
    return this.UserAvatarUrl;
  }

  /**
   * Get the user's avatar icon class from the userAvatarMap
   * Uses fast O(1) lookup by UserID
   */
  public get UserAvatarIconClass(): string | null {
    if (!this.IsUserMessage || !this.message.UserID) {
      return null;
    }
    const avatarData = this.UserAvatarMap.get(this.message.UserID);
    return avatarData?.iconClass || null;
  }

  /** @deprecated Use {@link UserAvatarIconClass}. */
  public get userAvatarIconClass(): string | null {
    return this.UserAvatarIconClass;
  }

  public get IsConversationManager(): boolean {
    // Resolved at runtime via the conversation manager agent registered through
    // ConversationsRuntime's DefaultAgentResolver chain — explicit input wins,
    // then app-scoped Application Setting, then global Application Setting, then
    // the code-const Sage fallback. Replaces the previous hardcoded 'Sage'
    // name check. Returns false until the agent service has cached the
    // resolved agent (warmed by message-input's first routing call).
    // Compares the ENGINE-resolved name deliberately: a host assistantDisplayName
    // override renames what the user SEES, never what the component decides.
    const cmName = this.agentService.ConversationManagerAgentName;
    if (!cmName) return false;
    return this.engineAgentInfo?.name === cmName;
  }

  /** @deprecated Use {@link IsConversationManager}. */
  public get isConversationManager(): boolean {
    return this.IsConversationManager;
  }

  public get DisplayMessage(): string {
    return this._stableDisplayMessage;
  }

  /** @deprecated Use {@link DisplayMessage}. */
  public get displayMessage(): string {
    return this.DisplayMessage;
  }

  /**
   * Computes the display message from the current message text. Called from
   * ngDoCheck to snapshot the value; templates read _stableDisplayMessage.
   */
  private computeDisplayMessage(): string {
    let text = this.message.Message || '';

    // For Sage, only show the delegation line (starts with emoji)
    if (this.IsConversationManager && text) {
      const delegationMatch = text.match(/🤖.*Delegating to.*Agent.*/);
      if (delegationMatch) {
        text = delegationMatch[0];
      }
    }

    // Use cached result if message text hasn't changed (avoids re-parsing mentions)
    if (this._cachedMessageText === text && this._cachedDisplayMessage) {
      return this._cachedDisplayMessage;
    }

    // Transform @mentions to HTML pills
    const transformed = this.transformMentionsToHTML(text);

    // Cache the result
    this._cachedMessageText = text;
    this._cachedDisplayMessage = transformed;

    return transformed;
  }

  /**
   * Transform @mentions in text to HTML badge elements
   * Supports both JSON format (@{type:"agent",id:"uuid",...}) and legacy text format (@AgentName)
   * Uses inline HTML that markdown will preserve
   */
  private transformMentionsToHTML(text: string): string {
    if (!text) return '';

    // Get available agents and users for name/icon lookup
    const agents = this.mentionAutocomplete.getAvailableAgents();
    const users = this.mentionAutocomplete.getAvailableUsers();

    // Parse all @{...} tokens
    const tokens = ConversationUtility.ParseSpecialContent(text);
    if (tokens.length === 0) return text; // No tokens found, return original text

    // Replace tokens in reverse order to maintain indices
    let result = text;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      let html = '';

      switch (token.mode) {
        case 'mention':
          html = this.renderMentionHTML(token.content as any, agents, users);
          break;
        case 'form':
          html = this.renderFormHTML(token.content as any);
          break;
        default:
          // Unknown mode, leave original text as-is
          html = token.originalText;
      }

      result = result.substring(0, token.startIndex) + html + result.substring(token.endIndex);
    }

    return result;
  }

  private renderMentionHTML(content: any, agents: any[], users: any[]): string {
    let name = typeof content.name === 'string' ? content.name : '';
    let iconClass = '';
    let logoURL = '';
    let configPresetName = '';
    let inlineStyle = '';

    // Look up actual name and icon if ID provided
    if (content.type === 'agent' && agents) {
      const agent = agents.find(a => UUIDsEqual(a.ID, content.id));
      if (agent) {
        name = agent.Name;
        iconClass = agent.IconClass || '';
        logoURL = agent.LogoURL || '';

        // Check for configuration preset (only show if non-default)
        if (content.configId && AIEngineBase.Instance) {
          const presets = AIEngineBase.Instance.GetAgentConfigurationPresets(content.id, true);
          if (presets && presets.length > 0) {
            const defaultPreset = presets.find(p => p.IsDefault) || presets[0];
            const isNonDefault = content.configId !== defaultPreset?.ID;

            // Only include preset name if it's not the default
            if (isNonDefault && content.config) {
              configPresetName = content.config;
            }
          }
        }
      }
    } else if (content.type === 'user' && users) {
      const user = users.find(u => UUIDsEqual(u.ID, content.id));
      if (user) name = user.Name;
    } else if (content.type === 'entity') {
      const entity = this.mentionAutocomplete.getAvailableEntities().find(e => UUIDsEqual(e.ID, content.id));
      name = entity ? entity.DisplayNameOrName : name;
      iconClass = this.normalizeIconClass(entity?.Icon || 'fa-solid fa-table');
    } else if (content.type === 'query') {
      const query = this.mentionAutocomplete.getAvailableQueries().find(q => UUIDsEqual(q.ID, content.id));
      if (query) name = query.Name;
      iconClass = this.normalizeIconClass(this.mentionAutocomplete.getQueriesEntityIcon());
    } else if (content.type === 'skill') {
      const skill = AIEngineBase.Instance?.Skills?.find(s => UUIDsEqual(s.ID, content.id));
      if (skill) name = skill.Name;
      iconClass = this.normalizeIconClass(skill?.IconClass || 'fa-solid fa-wand-magic-sparkles');
      // Per-skill accent color (AISkill.Color) overrides the standard skill green — same
      // logic as the composer chip (mention-editor's createMentionChip). Keep in sync.
      if (skill?.Color) {
        inlineStyle = ` style="background: ${this.escapeHtml(skill.Color)}; border-color: rgba(255, 255, 255, 0.35);"`;
      }
    } else if (content.type === 'record') {
      name = (content.name ?? '').trim();
      iconClass = this.normalizeIconClass('fa-solid fa-up-right-from-square');
    }

    const iconOnly = content.type === 'record' && !name;
    const escapedName = name ? this.escapeHtml(name) : '';
    const typeClass =
      (content.type === 'agent' || content.type === 'entity' || content.type === 'query' || content.type === 'skill' || content.type === 'record' ? content.type : 'user')
      + (iconOnly ? ' icon-only' : '');

    // Build preset indicator HTML if present
    const presetIndicator = configPresetName
      ? `<span class="preset-indicator">${this.escapeHtml(configPresetName)}</span>`
      : '';

    const recordOpenLabel = content.type === 'record'
      ? (name ? `Open ${name}` : `Open ${content.entityName || 'record'}`)
      : '';
    const recordAttrs = content.type === 'record' && content.entityName
      ? ` role="link" title="${this.escapeHtml(recordOpenLabel)}" aria-label="${this.escapeHtml(recordOpenLabel)}" data-record-entity="${this.escapeHtml(content.entityName)}" data-record-keys="${this.escapeHtml(JSON.stringify(ConversationUtility.RecordLinkKeyMap(content)))}"`
      : '';

    // Generate HTML based on whether we have an icon
    if (logoURL) {
      return `<span class="mention-badge ${typeClass}"${inlineStyle}${recordAttrs}><img src="${this.escapeHtml(logoURL)}" alt="" />${escapedName}${presetIndicator}</span>`;
    } else if (iconClass) {
      return `<span class="mention-badge ${typeClass}"${inlineStyle}${recordAttrs}><i class="${this.escapeHtml(iconClass)}" aria-hidden="true"></i>${escapedName}${presetIndicator}</span>`;
    } else {
      return `<span class="mention-badge ${typeClass}"${inlineStyle}${recordAttrs}>${escapedName}${presetIndicator}</span>`;
    }
  }

  /**
   * Normalize a Font Awesome icon class to include a style family (defaults to fa-solid)
   * so stored values that omit one (e.g. 'fa-table') still render.
   */
  private normalizeIconClass(iconClass: string): string {
    if (!iconClass) return 'fa-solid fa-table';
    if (iconClass.includes('fa-') && !/\b(fa-solid|fa-regular|fa-light|fa-thin|fa-duotone|fa-brands|fa-sharp)\b/.test(iconClass)) {
      return `fa-solid ${iconClass}`;
    }
    return iconClass;
  }

  private renderFormHTML(content: { title?: string; fields?: Array<{ name?: string; value: unknown; label?: string; type?: string; displayValue?: string }> }): string {
    if (!content.fields || content.fields.length === 0) {
      return FormResponseUtils.EscapeHtml(JSON.stringify(content));
    }

    // Filter out fields with empty/null/undefined values (optional fields not provided)
    const nonEmptyFields = content.fields.filter(f => {
      const value = f.value;
      return value != null && value !== '' && !(Array.isArray(value) && value.length === 0);
    });

    if (nonEmptyFields.length === 0) {
      return FormResponseUtils.EscapeHtml(JSON.stringify(content));
    }

    if (nonEmptyFields.length === 1) {
      // Single field - simple inline pill
      const field = nonEmptyFields[0];
      const value = this.formatFieldValueHtml(field);
      return `<span class="form-response-pill single-field"><i class="fa fa-check" aria-hidden="true"></i>${value}</span>`;
    } else {
      // Multiple fields - vertical question/answer layout
      const title = content.title ? FormResponseUtils.EscapeHtml(content.title) : 'Form Response';
      const fieldsHTML = nonEmptyFields.map(f => {
        const label = FormResponseUtils.EscapeHtml(f.label || f.name || '');
        const value = this.formatFieldValueHtml(f);
        return `<div class="pill-field">
          <div class="field-question">${label}</div>
          <div class="field-answer">${value}</div>
        </div>`;
      }).join('');

      return `<div class="form-response-pill multi-field">
        <div class="pill-header">
          <i class="fa fa-check-square" aria-hidden="true"></i>
          ${title}
        </div>
        <div class="pill-fields">${fieldsHTML}</div>
      </div>`;
    }
  }

  /**
   * Format a field value for HTML display using the shared FormResponseUtils.
   * This handles the inline-HTML context where values need HTML escaping.
   */
  private formatFieldValueHtml(field: { name?: string; value: unknown; label?: string; type?: string; displayValue?: string }): string {
    if (field.value == null) return '';

    // For choice types with displayValue, use it directly
    const choiceTypes = ['buttongroup', 'radio', 'dropdown', 'checkbox'];
    if (field.type && choiceTypes.includes(field.type) && field.displayValue) {
      return FormResponseUtils.EscapeHtml(field.displayValue);
    }

    // Textarea values render as formatted Markdown — agent-authored long-form content
    // (e.g. the approved Plan in the plan-approval response) is Markdown by convention,
    // and the submitted-form pill should look as good as the live form's preview did.
    // Script safety: the whole message passes through mj-markdown's stripJavaScript.
    if (field.type === 'textarea' && typeof field.value === 'string' && field.value.trim().length > 0) {
      try {
        return `<div class="field-answer-markdown">${this.markdownService.parse(field.value)}</div>`;
      } catch {
        // fall through to the escaped-plaintext path below
      }
    }

    // Delegate type-aware formatting to shared utility (no schema question available here)
    const formatted = FormResponseUtils.FormatValue(field.value, null, field.type || null);
    return FormResponseUtils.EscapeHtml(formatted);
  }

  private escapeHtml(text: string): string {
    return FormResponseUtils.EscapeHtml(text);
  }

  public get IsInProgressAIMessage(): boolean {
    return this._stableIsInProgressAIMessage;
  }

  /** @deprecated Use {@link IsInProgressAIMessage}. */
  public get isInProgressAIMessage(): boolean {
    return this.IsInProgressAIMessage;
  }

  public get IsAgentRunActive(): boolean {
    if (!this.AgentRun) {
      return false;
    }
    const status = this.AgentRun.Status?.toLowerCase();
    return status === 'in-progress' || status === 'running';
  }

  /** @deprecated Use {@link IsAgentRunActive}. */
  public get isAgentRunActive(): boolean {
    return this.IsAgentRunActive;
  }

  public get MessageStatus(): 'Complete' | 'In-Progress' | 'Error' {
    return this.message.Status || 'Complete';
  }

  /** @deprecated Use {@link MessageStatus}. */
  public get messageStatus(): 'Complete' | 'In-Progress' | 'Error' {
    return this.MessageStatus;
  }

  public GetStatusText(): string {
    switch (this.MessageStatus) {
      case 'In-Progress':
        return 'Processing...';
      case 'Error':
        return 'Failed';
      default:
        return '';
    }
  }

  /** @deprecated Use {@link GetStatusText}. */
  public getStatusText(): string {
    return this.GetStatusText();
  }

  public get IsFirstMessageInConversation(): boolean {
    return this.AllMessages.indexOf(this.message) === 0;
  }

  /** @deprecated Use {@link IsFirstMessageInConversation}. */
  public get isFirstMessageInConversation(): boolean {
    return this.IsFirstMessageInConversation;
  }

  public get IsLastMessageInConversation(): boolean {
    return this.AllMessages.indexOf(this.message) === this.AllMessages.length - 1;
  }

  /** @deprecated Use {@link IsLastMessageInConversation}. */
  public get isLastMessageInConversation(): boolean {
    return this.IsLastMessageInConversation;
  }

  /**
   * Determine if rating component should be shown inline (Option C - Hybrid).
   * Show for latest completed AI message that user hasn't rated yet.
   * For older/already-rated messages, ratings accessible via gear menu.
   */
  public ShouldShowRating(): boolean {
    // Must be an AI message
    if (!this.IsAIMessage) return false;

    // Must be completed (not in progress or failed)
    if (this.MessageStatus !== 'Complete') return false;

    // Must not be editing
    if (this.IsEditing) return false;

    // Must be the last message in conversation
    if (!this.IsLastMessageInConversation) return false;

    // Check if current user has already rated this message
    if (this.Ratings && this.Ratings.length > 0) {
      const currentUserId = this.CurrentUser?.ID;
      const userHasRated = this.Ratings.some(r => UUIDsEqual(r.UserID, currentUserId));

      // If user already rated, don't show inline (accessible via gear menu)
      if (userHasRated) return false;
    }

    // Show inline rating for latest completed AI message not yet rated by user
    return true;
  }

  /** @deprecated Use {@link ShouldShowRating}. */
  public shouldShowRating(): boolean {
    return this.ShouldShowRating();
  }

  /**
   * Check if message has any ratings (for gear icon badge)
   */
  public HasRatings(): boolean {
    return !!(this.Ratings && this.Ratings.length > 0);
  }

  /** @deprecated Use {@link HasRatings}. */
  public hasRatings(): boolean {
    return this.HasRatings();
  }

  /**
   * Get rating count for badge display on gear icon
   */
  public GetRatingCount(): number {
    return this.Ratings?.length || 0;
  }

  /** @deprecated Use {@link GetRatingCount}. */
  public getRatingCount(): number {
    return this.GetRatingCount();
  }

  /**
   * Get thumbs up count (ratings >= 8)
   */
  public GetThumbsUpCount(): number {
    return this.Ratings?.filter(r => r.Rating ? r.Rating >= 8 : false).length || 0;
  }

  /** @deprecated Use {@link GetThumbsUpCount}. */
  public getThumbsUpCount(): number {
    return this.GetThumbsUpCount();
  }

  /**
   * Get thumbs down count (ratings <= 3)
   */
  public GetThumbsDownCount(): number {
    return this.Ratings?.filter(r => r.Rating ? r.Rating <= 3 : false).length || 0;
  }

  /** @deprecated Use {@link GetThumbsDownCount}. */
  public getThumbsDownCount(): number {
    return this.GetThumbsDownCount();
  }

  /**
   * Determine if pin/delete actions should show inline (with rating buttons).
   * Show for latest completed AI message that user hasn't rated yet.
   */
  public ShouldShowInlineActions(): boolean {
    // Same logic as shouldShowRating - latest unrated message
    return this.ShouldShowRating();
  }

  /** @deprecated Use {@link ShouldShowInlineActions}. */
  public shouldShowInlineActions(): boolean {
    return this.ShouldShowInlineActions();
  }

  /**
   * The artifacts to render under this message, one card each. Prefers the
   * `artifacts` array; falls back to the legacy single `artifact`/`artifactVersion`
   * inputs so older callers that set only those keep working.
   */
  public get DisplayArtifacts(): MessageArtifactRef[] {
    if (this.Artifacts && this.Artifacts.length > 0) {
      return this.Artifacts;
    }
    if (this.Artifact && this.artifactVersion) {
      return [{ artifact: this.Artifact, version: this.artifactVersion }];
    }
    return [];
  }

  /** @deprecated Use {@link DisplayArtifacts}. */
  public get displayArtifacts(): MessageArtifactRef[] {
    return this.DisplayArtifacts;
  }

  public get HasArtifact(): boolean {
    return this.DisplayArtifacts.length > 0;
  }

  /** @deprecated Use {@link HasArtifact}. */
  public get hasArtifact(): boolean {
    return this.HasArtifact;
  }

  /**
   * Label for a pending artifact. Says what is happening as well as to what — a bare artifact name
   * beside a spinner reads as a title, not as progress, which is the confusion this whole change
   * exists to remove. Matches the media previews' "Loading image..." phrasing.
   */
  public PendingLabel(pending: MessagePendingArtifactRef): string {
    return pending.artifactName ? `Loading ${pending.artifactName}...` : 'Loading attachment...';
  }

  /** @deprecated Use {@link PendingLabel}. */
  public pendingLabel(pending: MessagePendingArtifactRef): string {
    return this.PendingLabel(pending);
  }

  /**
   * The pending artifacts that still have no card of their own, filtered per artifact rather than
   * suppressed wholesale: a message can hold a loaded report and an in-flight image at once, and
   * gating on `displayArtifacts.length` would leave that image's window silent.
   */
  public get PendingArtifactPlaceholders(): readonly MessagePendingArtifactRef[] {
    // Shared constant in the steady state, which the parent now keeps us in most of the time by
    // only publishing artifacts that are genuinely still loading. The component is CheckAlways and
    // runs a per-second refresh while an agent run is active, so allocating here would cost for
    // the life of every message.
    if (this.PendingArtifacts.length === 0) {
      return NO_PENDING_ARTIFACTS;
    }
    // UUIDsEqual, not string equality: these two IDs come from different sources — one from the
    // conversation query, one off a loaded entity — and SQL Server returns upper-case UUIDs where
    // PostgreSQL returns lower-case. A case-sensitive match left a placeholder sitting above the
    // very card it was waiting for. See guides/UUID_COMPARISON_GUIDE.md.
    const loaded = this.DisplayArtifacts;
    return this.PendingArtifacts.filter(p => !loaded.some(a => UUIDsEqual(a.artifact.ID, p.artifactId)));
  }

  /** @deprecated Use {@link PendingArtifactPlaceholders}. */
  public get pendingArtifactPlaceholders(): readonly MessagePendingArtifactRef[] {
    return this.PendingArtifactPlaceholders;
  }

  /**
   * Check if the artifact is a system-only artifact
   */
  public get IsSystemArtifact(): boolean {
    return this.Artifact?.Visibility === 'System Only';
  }

  /** @deprecated Use {@link IsSystemArtifact}. */
  public get isSystemArtifact(): boolean {
    return this.IsSystemArtifact;
  }

  /**
   * Unified time pill text for all AI message states
   * Returns the appropriate time display based on message state:
   * - Temporary messages (in-progress): Live elapsed time
   * - Active agent runs: Live agent run duration (calculated on-demand)
   * - Completed messages: Final generation time
   * - Failed messages: Time before failure
   */
  public get TimePillText(): string | null {
    return this.calculateTimePillText();
  }

  /** @deprecated Use {@link TimePillText}. */
  public get timePillText(): string | null {
    return this.TimePillText;
  }

  private calculateTimePillText(): string | null {
    if (this.IsUserMessage) {
      return null;
    }

    // For temporary messages (in-progress), show live elapsed time
    if (this.IsInProgressAIMessage) {
      return this.ElapsedTimeFormatted;
    }

    // For active agent runs, calculate live duration from agentRun timestamps
    // This getter recalculates every time using new Date(), so it updates smoothly
    if (this.IsAgentRunActive && this.AgentRun?.__mj_CreatedAt) {
      return this.AgentRunDuration;
    }

    // For completed/failed messages with an agent run, use agentRun timestamps.
    // These are set when the run finishes and never change, so pin/edit saves on the
    // message entity cannot corrupt the displayed duration.
    if (this.AgentRun?.__mj_CreatedAt && this.AgentRun?.__mj_UpdatedAt) {
      return this.AgentRunDuration;
    }

    // No agent run — fall back to message entity timestamps.
    const fromMessage = this.FormattedGenerationTime;
    if (fromMessage) {
      return fromMessage;
    }

    // Last resort: the live elapsed-time string is frozen at the value it had
    // when status flipped to Complete (the interval is cleared in ngDoCheck). If
    // the same component instance handled the in-progress phase, this is the
    // accurate duration the user just watched tick. If the message arrived already
    // complete (no in-progress phase observed), `_elapsedTimeFormatted` is still
    // its initial '0:00' — return null in that case so the time pill doesn't render
    // a misleading zero.
    return this.ElapsedTimeFormatted !== '0:00' ? this.ElapsedTimeFormatted : null;
  }

  public get FormattedGenerationTime(): string | null {
    // Only show generation time for AI messages
    if (this.IsUserMessage || !this.message.__mj_CreatedAt || !this.message.__mj_UpdatedAt) {
      return null;
    }

    // Calculate generation time from created -> updated timestamps
    const createdAt = new Date(this.message.__mj_CreatedAt);
    const updatedAt = new Date(this.message.__mj_UpdatedAt);
    const diffMs = updatedAt.getTime() - createdAt.getTime();

    // If no time difference, don't show (e.g., not yet completed)
    if (diffMs <= 0) {
      return null;
    }

    const seconds = diffMs / 1000;

    if (seconds < 1) {
      return `${Math.round(diffMs)}ms`;
    } else if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    }
  }

  /** @deprecated Use {@link FormattedGenerationTime}. */
  public get formattedGenerationTime(): string | null {
    return this.FormattedGenerationTime;
  }

  /**
   * Returns the cached CSS class string. Updated in ngDoCheck so the value
   * is stable within a single change detection cycle, preventing
   * ExpressionChangedAfterItHasBeenCheckedError.
   */
  public get MessageClasses(): string {
    return this._messageClasses;
  }

  /** @deprecated Use {@link MessageClasses}. */
  public get messageClasses(): string {
    return this.MessageClasses;
  }

  private buildMessageClasses(): string {
    const classes: string[] = ['message-item'];
    if (this.IsAIMessage) {
      classes.push('ai-message');
      if (this.IsInProgressAIMessage) {
        classes.push('in-progress');
      }
    } else if (this.IsUserMessage) {
      classes.push('user-message');
    }
    if (this.message?.IsPinned) {
      classes.push('pinned');
    }
    if (this.IsEditing) {
      classes.push('editing');
    }
    return classes.join(' ');
  }

  public get IsMessageEdited(): boolean {
    // Only show edited badge if user actually edited the message content
    // The OriginalMessageChanged flag is set server-side when the Message field changes on update
    if (!this.IsUserMessage) {
      return false;
    }
    return this.message.OriginalMessageChanged === true;
  }

  /** @deprecated Use {@link IsMessageEdited}. */
  public get isMessageEdited(): boolean {
    return this.IsMessageEdited;
  }

  public OnEditClick(): void {
    if (!this.IsProcessing && !this.IsEditing) {
      this.StartEditing();
    }
  }

  /** @deprecated Use {@link OnEditClick}. */
  public onEditClick(): void {
    return this.OnEditClick();
  }

  public StartEditing(): void {
    this.originalText = this.message.Message || '';
    this.EditedText = this.originalText;
    this.IsEditing = true;

    // Focus textarea after Angular renders it
    Promise.resolve().then(() => {
      const textarea = document.querySelector('.message-edit-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
      this.cdRef.detectChanges();
    });
  }

  /** @deprecated Use {@link StartEditing}. */
  public startEditing(): void {
    return this.StartEditing();
  }

  public CancelEditing(): void {
    this.IsEditing = false;
    this.EditedText = '';
    this.originalText = '';
    this.cdRef.detectChanges();
  }

  /** @deprecated Use {@link CancelEditing}. */
  public cancelEditing(): void {
    return this.CancelEditing();
  }

  public async SaveEdit(): Promise<void> {
    if (!this.EditedText.trim() || this.EditedText === this.originalText) {
      this.CancelEditing();
      return;
    }

    try {
      // Update the message entity
      this.message.Message = this.EditedText;
      const saveResult = await this.message.Save();

      if (saveResult) {
        this.IsEditing = false;
        this.EditedText = '';
        this.originalText = '';
        // Invalidate display message cache since message changed
        this._cachedMessageText = '';
        this._cachedDisplayMessage = '';
        this.MessageEdited.emit(this.message);
        this.cdRef.detectChanges();
      } else {
        console.error('Failed to save message edit');
        alert('Failed to save message. Please try again.');
      }
    } catch (error) {
      console.error('Error saving message edit:', error);
      alert('Error saving message. Please try again.');
    }
  }

  /** @deprecated Use {@link SaveEdit}. */
  public async saveEdit(): Promise<void> {
    return this.SaveEdit();
  }

  public OnEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.CancelEditing();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.SaveEdit();
    }
  }

  /** @deprecated Use {@link OnEditKeydown}. */
  public onEditKeydown(event: KeyboardEvent): void {
    return this.OnEditKeydown(event);
  }

  public OnDeleteClick(): void {
    if (!this.IsProcessing) {
      this.DeleteClicked.emit(this.message);
    }
  }

  /** @deprecated Use {@link OnDeleteClick}. */
  public onDeleteClick(): void {
    return this.OnDeleteClick();
  }

  public async PinMessage(): Promise<void> {
    // Optimistic update — toggle immediately so the UI responds at once
    const previousValue = this.message.IsPinned;
    this.message.IsPinned = !previousValue;
    this.cdRef.detectChanges();

    const saved = await this.message.Save();
    if (!saved) {
      // Revert on failure
      this.message.IsPinned = previousValue;
      this.cdRef.detectChanges();
      console.error('Failed to save pin state for message', this.message.ID);
    } else {
      // Notify parent so it can patch the conversation cache in-place.
      // Without this, navigating away and back rebuilds entities from stale cache data,
      // causing the pin state to appear lost until the next full page reload.
      this.MessagePinToggled.emit(this.message);
    }
  }

  public OnTestFeedbackClick(): void {
    if (!this.IsProcessing) {
      this.TestFeedbackClicked.emit(this.message);
    }
  }

  /** @deprecated Use {@link OnTestFeedbackClick}. */
  public onTestFeedbackClick(): void {
    return this.OnTestFeedbackClick();
  }

  public OnRetryClick(): void {
    if (!this.IsProcessing && this.MessageStatus === 'Error') {
      this.RetryClicked.emit(this.message);
    }
  }

  /** @deprecated Use {@link OnRetryClick}. */
  public onRetryClick(): void {
    return this.OnRetryClick();
  }

  public OnArtifactClick(): void {
    if (this.HasArtifact && this.Artifact) {
      this.ArtifactClicked.emit({
        artifactId: this.Artifact.ID,
        versionId: this.artifactVersion?.ID
      });
    }
  }

  /** @deprecated Use {@link OnArtifactClick}. */
  public onArtifactClick(): void {
    return this.OnArtifactClick();
  }

  public OnArtifactActionPerformed(event: {action: string; artifact: MJArtifactEntity; version?: MJArtifactVersionEntity}): void {
    // Handle artifact actions from inline-artifact component
    if (event.action === 'open') {
      this.ArtifactClicked.emit({
        artifactId: event.artifact.ID,
        versionId: event.version?.ID
      });
    } else {
      // Emit other actions to parent
      this.ArtifactActionPerformed.emit({ action: event.action, artifactId: event.artifact.ID });
    }
  }

  /** @deprecated Use {@link OnArtifactActionPerformed}. */
  public onArtifactActionPerformed(event: {action: string; artifact: MJArtifactEntity; version?: MJArtifactVersionEntity}): void {
    return this.OnArtifactActionPerformed(event);
  }

  public ToggleReaction(type: 'like' | 'comment'): void {
    // TODO: Implement reaction toggling
    console.log('Toggle reaction:', type, 'for message:', this.message.ID);
  }

  /** @deprecated Use {@link ToggleReaction}. */
  public toggleReaction(type: 'like' | 'comment'): void {
    return this.ToggleReaction(type);
  }

  public OnSaveArtifact(event: Event): void {
    event.stopPropagation();
    // TODO: Implement artifact save
    console.log('Save artifact for message:', this.message.ID);
  }

  /** @deprecated Use {@link OnSaveArtifact}. */
  public onSaveArtifact(event: Event): void {
    return this.OnSaveArtifact(event);
  }

  public OnShareArtifact(event: Event): void {
    event.stopPropagation();
    // TODO: Implement artifact share
    console.log('Share artifact for message:', this.message.ID);
  }

  /** @deprecated Use {@link OnShareArtifact}. */
  public onShareArtifact(event: Event): void {
    return this.OnShareArtifact(event);
  }

  public OnExportArtifact(event: Event): void {
    event.stopPropagation();
    // TODO: Implement artifact export
    console.log('Export artifact for message:', this.message.ID);
  }

  /** @deprecated Use {@link OnExportArtifact}. */
  public onExportArtifact(event: Event): void {
    return this.OnExportArtifact(event);
  }

  /**
   * Handle attachment thumbnail click
   * Emits the attachment for the parent to display in the image viewer
   */
  public OnAttachmentClick(attachment: MessageAttachment): void {
    this.AttachmentClicked.emit(attachment);
  }

  /** @deprecated Use {@link OnAttachmentClick}. */
  public onAttachmentClick(attachment: MessageAttachment): void {
    return this.OnAttachmentClick(attachment);
  }

  /**
   * Check if message has any attachments
   */
  public get HasAttachments(): boolean {
    return this.Attachments && this.Attachments.length > 0;
  }

  /** @deprecated Use {@link HasAttachments}. */
  public get hasAttachments(): boolean {
    return this.HasAttachments;
  }

  /**
   * Get only image attachments
   */
  public get ImageAttachments(): MessageAttachment[] {
    return this.Attachments?.filter(a => a.type === 'Image') || [];
  }

  /** @deprecated Use {@link ImageAttachments}. */
  public get imageAttachments(): MessageAttachment[] {
    return this.ImageAttachments;
  }

  /**
   * Format file size for display
   */
  public FormatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** @deprecated Use {@link FormatFileSize}. */
  public formatFileSize(bytes: number): string {
    return this.FormatFileSize(bytes);
  }

  /** Compact UPPERCASE badge label (artifact-type name wins over file extension). */
  public BadgeTextFor(attachment: MessageAttachment): string {
    return BadgeTextForAttachment(attachment);
  }

  /** @deprecated Use {@link BadgeTextFor}. */
  public badgeTextFor(attachment: MessageAttachment): string {
    return this.BadgeTextFor(attachment);
  }

  /**
   * Whether this message has an associated agent run
   * Based on whether the message has an AgentID (not whether agentRun object is loaded)
   */
  public get HasAgentRun(): boolean {
    return !!this.message?.AgentID;
  }

  /** @deprecated Use {@link HasAgentRun}. */
  public get hasAgentRun(): boolean {
    return this.HasAgentRun;
  }

  /**
   * Whether the agent-run gear's expanded panel would actually render anything —
   * used to gate the gear button itself so it doesn't appear as a dead control
   * that opens an empty popup. The panel hosts, in order: the run-details section
   * (only when `showAgentRunDetails`), associated tasks, and (non-last messages
   * only) the delete / rating / pin overflow. With `showAgentRunDetails=false` and
   * none of those enabled — a white-labeled end-user surface — the gear vanishes
   * entirely instead of opening onto nothing.
   *
   * Each arm below mirrors the corresponding template condition EXACTLY; keep them
   * in lockstep with `message-item.component.html`'s `.agent-details-panel` block.
   *
   * Defaults leave it unchanged: with `showAgentRunDetails=true` (the default) this
   * is unconditionally true, so the gear renders exactly as before — including the
   * pre-existing window where `agentRun` hasn't loaded yet and the panel is briefly
   * empty. That window is deliberately preserved (byte-identical defaults) rather
   * than fixed here.
   */
  public get HasAgentDetailsPanelContent(): boolean {
    // Run-details enabled → gear shows for any agent-run message (the button
    // already AND-gates hasAgentRun), exactly as before the gate existed — even
    // before the agentRun object finishes loading. This keeps the default
    // (showAgentRunDetails=true) byte-identical.
    if (this.ShowAgentRunDetails) return true;
    if (this.DetailTasks.length > 0) return true;
    if (!this.IsLastMessage) {
      if (this.AllowMessageDelete && this.IsConversationOwner) return true;
      if (this.AllowPinning) return true;
      // The rating only renders inside the template's `messageStatus === 'Complete'`
      // branch, so an incomplete/errored message must NOT count it as content —
      // otherwise the gear reappears over an empty panel, which is the whole bug
      // this getter exists to prevent.
      if (this.ShowMessageRating && this.MessageStatus === 'Complete') return true;
    }
    return false;
  }

  /** @deprecated Use {@link HasAgentDetailsPanelContent}. */
  public get hasAgentDetailsPanelContent(): boolean {
    return this.HasAgentDetailsPanelContent;
  }

  /**
   * Toggle the agent details panel expansion
   */
  public async ToggleAgentDetails(): Promise<void> {
    this.IsAgentDetailsExpanded = !this.IsAgentDetailsExpanded;

    // Load tasks when expanding if not already loaded
    if (this.IsAgentDetailsExpanded && !this.tasksLoaded) {
      await this.loadTasks();
    }

    this.cdRef.detectChanges();
  }

  /** @deprecated Use {@link ToggleAgentDetails}. */
  public async toggleAgentDetails(): Promise<void> {
    return this.ToggleAgentDetails();
  }

  /**
   * Load tasks associated with this conversation detail
   */
  private async loadTasks(): Promise<void> {
    if (!this.message?.ID) {
      return;
    }

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: `ConversationDetailID='${this.message.ID}'`,
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object'
        },
        this.CurrentUser
      );

      if (result.Success) {
        this.DetailTasks = result.Results || [];
        this.tasksLoaded = true;
      }
    } catch (error) {
      console.error('Failed to load tasks for conversation detail:', error);
    }
  }

  /**
   * Get formatted duration for the agent run
   * For active runs: Calculate from created to NOW (live updates)
   * For completed runs: Calculate from created to updated timestamp (static)
   */
  public get AgentRunDuration(): string | null {
    if (!this.AgentRun || !this.AgentRun.__mj_CreatedAt) {
      return null;
    }

    // For active runs, return the interval-updated field to avoid
    // ExpressionChangedAfterItHasBeenCheckedError (new Date() changes between CD cycles)
    if (this.IsAgentRunActive) {
      return this.AgentRunDurationFormatted;
    }

    // For completed runs, calculate static duration from timestamps
    if (!this.AgentRun.__mj_UpdatedAt) {
      return null;
    }
    const createdAt = new Date(this.AgentRun.__mj_CreatedAt);
    const endTime = new Date(this.AgentRun.__mj_UpdatedAt);
    const diffMs = endTime.getTime() - createdAt.getTime();

    if (diffMs <= 0) {
      return null;
    }

    return this.formatDurationFromMs(diffMs);
  }

  /** @deprecated Use {@link AgentRunDuration}. */
  public get agentRunDuration(): string | null {
    return this.AgentRunDuration;
  }

  /**
   * Get total tokens used in the agent run
   */
  public get AgentRunTotalTokens(): number {
    if (!this.AgentRun) {
      return 0;
    }
    return (this.AgentRun.TotalPromptTokensUsed || 0) + (this.AgentRun.TotalCompletionTokensUsed || 0);
  }

  /** @deprecated Use {@link AgentRunTotalTokens}. */
  public get agentRunTotalTokens(): number {
    return this.AgentRunTotalTokens;
  }

  /**
   * Get total cost of the agent run
   */
  public get AgentRunTotalCost(): number {
    return this.AgentRun?.TotalCost || 0;
  }

  /** @deprecated Use {@link AgentRunTotalCost}. */
  public get agentRunTotalCost(): number {
    return this.AgentRunTotalCost;
  }

  /**
   * Get number of steps in the agent run
   */
  public get AgentRunStepCount(): number {
    // Count from the Steps array if available
    if (this.AgentRun && (this.AgentRun as any).Steps) {
      return (this.AgentRun as any).Steps.length;
    }
    return 0;
  }

  /** @deprecated Use {@link AgentRunStepCount}. */
  public get agentRunStepCount(): number {
    return this.AgentRunStepCount;
  }

  /**
   * Format number with commas
   */
  public FormatNumber(num: number): string {
    return num.toLocaleString();
  }

  /** @deprecated Use {@link FormatNumber}. */
  public formatNumber(num: number): string {
    return this.FormatNumber(num);
  }

  /**
   * Open the agent run entity record in a new tab
   */
  public OpenAgentRunRecord(): void {
    if (!this.AgentRun?.ID) return;

    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', this.AgentRun.ID)
    ]);

    this.OpenEntityRecord.emit({
      entityName: 'MJ: AI Agent Runs',
      compositeKey
    });
  }

  /** @deprecated Use {@link OpenAgentRunRecord}. */
  public openAgentRunRecord(): void {
    return this.OpenAgentRunRecord();
  }

  /**
   * Open the agent entity record in a new tab
   */
  public OpenAgentRecord(): void {
    if (!this.AgentRun?.AgentID) return;

    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', this.AgentRun.AgentID)
    ]);

    this.OpenEntityRecord.emit({
      entityName: 'MJ: AI Agents',
      compositeKey
    });
  }

  /** @deprecated Use {@link OpenAgentRecord}. */
  public openAgentRecord(): void {
    return this.OpenAgentRecord();
  }

  /**
   * Check if current user is the conversation owner
   */
  public get IsConversationOwner(): boolean {
    return UUIDsEqual(this.Conversation?.UserID, this.CurrentUser.ID);
  }

  /** @deprecated Use {@link IsConversationOwner}. */
  public get isConversationOwner(): boolean {
    return this.IsConversationOwner;
  }

  /**
   * Get agent response form from message
   * Uses ResponseForm property from MJConversationDetailEntity
   *
   * Cached against the raw JSON string so the getter returns a stable object reference
   * for the same input. Without caching, `JSON.parse` produces a new object every call,
   * which makes Angular's `@if (responseForm)` template index churn between CD passes —
   * the classic NG0100 "ExpressionChangedAfterItHasBeenCheckedError" we used to hit here.
   */
  private _responseFormRaw: string | null | undefined = undefined;
  private _responseFormCache: AgentResponseForm | null = null;
  public get ResponseForm(): AgentResponseForm | null {
    const rawData = this.message.ResponseForm ?? null;
    if (rawData === this._responseFormRaw) return this._responseFormCache;
    this._responseFormRaw = rawData;
    if (!rawData) {
      this._responseFormCache = null;
      return null;
    }
    try {
      this._responseFormCache = (JSON.parse(rawData) as AgentResponseForm) || null;
    } catch (error) {
      console.error('Failed to parse response form:', error, 'Raw data:', rawData);
      this._responseFormCache = null;
    }
    return this._responseFormCache;
  }

  /** @deprecated Use {@link ResponseForm}. */
  public get responseForm(): AgentResponseForm | null {
    return this.ResponseForm;
  }

  /**
   * Get actionable commands from message
   * Uses ActionableCommands property from MJConversationDetailEntity
   *
   * Cached against the raw JSON string (see {@link responseForm} for rationale).
   */
  private _actionableCommandsRaw: string | null | undefined = undefined;
  private _actionableCommandsCache: ActionableCommand[] = [];
  public get ActionableCommands(): ActionableCommand[] {
    const rawData = this.message.ActionableCommands ?? null;
    if (rawData === this._actionableCommandsRaw) return this._actionableCommandsCache;
    this._actionableCommandsRaw = rawData;
    if (!rawData) {
      this._actionableCommandsCache = [];
      return this._actionableCommandsCache;
    }
    try {
      const commands = JSON.parse(rawData);
      this._actionableCommandsCache = Array.isArray(commands) ? commands : [];
    } catch (error) {
      console.error('Failed to parse actionable commands:', error);
      this._actionableCommandsCache = [];
    }
    return this._actionableCommandsCache;
  }

  /** @deprecated Use {@link ActionableCommands}. */
  public get actionableCommands(): ActionableCommand[] {
    return this.ActionableCommands;
  }

  /**
   * Handle agent response form submission
   * Converts form data to the new @{_mode:"form",...} format
   */
  public OnFormSubmitted(formData: Record<string, any>): void {
    const form = this.ResponseForm;
    if (!form) {
      console.error('No response form available for submission');
      return;
    }

    // Build fields array with proper labels and type metadata
    const fields = Object.entries(formData).map(([questionId, value]) => {
      const question = form.questions.find(q => q.id === questionId);
      const questionType = typeof question?.type === 'string' ? question.type : question?.type?.type;

      // Look up display value for choice types (buttongroup, radio, dropdown, checkbox)
      const displayValue = this.getChoiceDisplayValue(question, value);

      return {
        name: questionId,
        value: value,
        label: question?.label || questionId,
        type: questionType, // Include type for proper formatting
        displayValue: displayValue // Include friendly display text for choice fields
      };
    });

    // ── PR 2c follow-up: Before/After cancelable event wiring ──
    // Emit beforeResponseFormSubmitted so consumers can veto (e.g., a validation
    // pass that finds required fields unfilled). Cancel propagates synchronously
    // through the message-list + chat-area re-emit bindings, so by the time .emit()
    // returns, event.Cancel reflects every subscriber's final answer. We use the
    // message ID as the form id — each AgentResponseForm is attached to exactly
    // one message, giving a stable per-message identifier.
    const beforeEvent = new BeforeResponseFormSubmittedEventArgs(this.message.ID, formData);
    this.BeforeResponseFormSubmitted.emit(beforeEvent);
    if (beforeEvent.Cancel) {
      return;
    }

    // Plan-approval semantics: approving a plan is a HIGHER-ORDER signal, not just a form
    // reply — it ends the plan phase, so the conversation switches out of Plan Mode and the
    // follow-up run executes the approved plan instead of planning again. Rejection leaves
    // Plan Mode on so the agent re-plans (the optional feedback field steers it).
    this.applyPlanDecision(formData);

    // Create formatted message using ConversationUtility
    const formMessage = ConversationUtility.CreateFormResponse(
      'formSubmit', // Generic action name
      fields,
      form.title
    );

    // Emit the formatted message
    this.SuggestedResponseSelected.emit({
      text: formMessage,
      customInput: undefined // No longer needed with new format
    });

    this.AfterResponseFormSubmitted.emit(
      new AfterResponseFormSubmittedEventArgs(this.message.ID, formData)
    );
  }

  /** @deprecated Use {@link OnFormSubmitted}. */
  public onFormSubmitted(formData: Record<string, any>): void {
    return this.OnFormSubmitted(formData);
  }

  /**
   * Detects a plan-approval form submission (the Plan Mode HITL card — identified by its
   * 'plan' + 'decision' questions, see BaseAgent.buildPlanApprovalForm) and applies the
   * decision's conversation-level effect: APPROVE switches this conversation out of Plan
   * Mode (plan phase complete — execute); REJECT intentionally leaves it on (re-plan).
   */
  private applyPlanDecision(formData: Record<string, unknown>): void {
    const form = this.ResponseForm;
    const isPlanForm =
      !!form?.questions.some(q => q.id === 'plan') &&
      !!form?.questions.some(q => q.id === 'decision');
    if (!isPlanForm) {
      return;
    }
    if (formData['decision'] === 'approve' && this.message.ConversationID) {
      PlanModePreference.Set(this.message.ConversationID, false);
    }
  }

  /**
   * Handle actionable command execution
   */
  public async OnCommandExecuted(command: ActionableCommand): Promise<void> {
    try {
      await this.uiCommandHandler.executeActionableCommand(command, {
        conversationId: this.message.ConversationID,
        conversationDetailId: this.message.ID
      });
    } catch (error) {
      console.error('Failed to execute command:', command, error);
    }
  }

  /** @deprecated Use {@link OnCommandExecuted}. */
  public async onCommandExecuted(command: ActionableCommand): Promise<void> {
    return this.OnCommandExecuted(command);
  }

  /**
   * Execute automatic commands when message loads
   * This is called after a message with automatic commands is received
   */
  private async executeAutomaticCommands(): Promise<void> {
    try {
      if (!this.IsLastMessage)
        return; // we only do this when the message is the last one in the conversation

      // TODO - IMPORTANT
      // BELOW, after doing the commands,
      // we need to mark the message as haveing completed its automatic commands to avoid re-running on reload


      // For now, check if the property exists (will be added to schema)
      const rawData = (this.message as any).AutomaticCommands;
      if (!rawData) return;

      // Parse JSON string to array of AutomaticCommand objects
      const commands: AutomaticCommand[] = JSON.parse(rawData);
      if (Array.isArray(commands) && commands.length > 0) {
        await this.uiCommandHandler.executeAutomaticCommands(commands);
      }
    } catch (error) {
      console.error('Failed to execute automatic commands:', error);
    }
  }

  /**
   * Get the display value for choice-type questions (buttongroup, radio, dropdown, checkbox)
   * This looks up the option's label based on the selected value
   */
  private getChoiceDisplayValue(question: FormQuestion | undefined, value: string | number | boolean | string[]): string | undefined {
    if (!question) return undefined;

    // Get the question type object
    const typeObj = question.type;
    if (typeof typeObj === 'string') return undefined;

    // Check if it's a choice type with options
    const choiceTypes = ['buttongroup', 'radio', 'dropdown', 'checkbox'];
    if (!choiceTypes.includes(typeObj.type)) return undefined;

    const choiceType = typeObj as ChoiceQuestionType;
    if (!choiceType.options || choiceType.options.length === 0) return undefined;

    // Handle array values (checkbox with multiple selections)
    if (Array.isArray(value)) {
      const labels = value.map(v => {
        const option = choiceType.options.find(opt => opt.value === v);
        return option?.label || String(v);
      });
      return labels.join(', ');
    }

    // Handle single value
    const option = choiceType.options.find(opt => opt.value === value);
    return option?.label;
  }

}