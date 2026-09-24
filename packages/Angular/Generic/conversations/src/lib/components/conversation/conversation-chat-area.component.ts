import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, ContentChildren, TemplateRef, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, RunView, RunQuery, Metadata, CompositeKey, LogStatusEx, TransformSimpleObjectToEntityObject, DataSnapshot } from '@memberjunction/core';
import { MJConversationEntity, MJConversationDetailEntity, MJAIAgentRunEntity, MJArtifactEntity, MJTaskEntity, ArtifactMetadataEngine, ConversationEngine, ConversationDetailComplete, RatingJSON, ArtifactJSON } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, CaptureDataSnapshotCommand, AppContextSnapshot, ConversationUtility, OpenResourceCommand } from "@memberjunction/ai-core-plus";
import { ActionableCommandRequest, UICommandHandlerService } from '../../services/ui-command-handler.service';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationLivenessDomService } from '../../services/conversation-liveness-dom.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import {
  ConversationDetailWindowStore,
  ConversationDetailWindowSnapshot
} from '../../services/conversation-detail-window.store';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { ConversationAttachmentService } from '../../services/conversation-attachment.service';
import { MJResourcePermissionShareAdapter, ResourceShareContext } from '@memberjunction/ng-resource-permissions';

/** `MJ: Resource Types.ID` for Conversations. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';
import { MessageAttachment } from '../message/message-item.component';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { MessageInputComponent } from '../message/message-input.component';
import { ArtifactViewerPanelComponent, NavigationRequest, AnalyzeArtifactService, InteractiveFormApplyService } from '@memberjunction/ng-artifacts';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ComposerDraftStore } from '../../services/composer-draft-store';
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
import type { ExportBranding } from '../../services/export.service';
import { RealtimeNavigateRequest, RealtimeStartLiveRequest } from '../realtime/realtime-session-overlay.component';
import {
  CollectRealtimeSessionIDs,
  MapRealtimeSessionMeta,
  REALTIME_SESSION_META_FIELDS,
  RealtimeSessionMetaRow,
  RealtimeSessionTimelineMeta
} from '../../utils/realtime-session-timeline';
import {
  ResolveDateJumpTarget,
  CombineDateJumpOutcome,
  DescribeDateJumpOutcome,
  DATE_JUMP_MAX_PAGES,
  type DateJumpPeriod,
  type DateJumpOutcome
} from '../../utils/date-jump';
import { MessageListComponent } from '../message/message-list.component';
import { DecideArtifactPanelAction, SnapshotArtifactVersions, ArtifactPanelAction, ArtifactPanelBaseline, ArtifactVersionRef } from '../../utils/artifact-panel-action';
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
export const DEFAULT_ARTIFACT_PANE_WIDTH = 40;

@Component({
  standalone: false,
  selector: 'mj-conversation-chat-area',
  templateUrl: `./conversation-chat-area.component.html`,
  styleUrls: ['./conversation-chat-area.component.css']
})
export class ConversationChatAreaComponent extends BaseAngularComponent implements OnInit, OnDestroy, AfterViewChecked  {
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
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

  // LOCAL STATE INPUTS - passed from parent workspace
  private _conversationId: string | null = null;
  @Input()
  set ConversationId(value: string | null) {
    if (value !== this._conversationId) {
      // Leaving a conversation is a save point for its in-progress draft.
      // (Optional-chained: harness-constructed instances may skip field initializers.)
      this.draftStore?.Flush();
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
  get ConversationId(): string | null {
    return this._conversationId;
  }

  /** @deprecated Use {@link ConversationId}. */
  get conversationId(): string | null {
    return this.ConversationId;
  }
  /** @deprecated Use {@link ConversationId}. */
  @Input() set conversationId(value: string | null) {
    this.ConversationId = value;
  }

  @Input() Conversation: MJConversationEntity | null = null;

  /** @deprecated Use {@link Conversation}. */
  @Input() set conversation(value: MJConversationEntity | null) {
    this.Conversation = value;
  }
  /** @deprecated Use {@link Conversation}. */
  get conversation(): MJConversationEntity | null {
    return this.Conversation;
  }
  @Input() ThreadId: string | null = null;

  /** @deprecated Use {@link ThreadId}. */
  @Input() set threadId(value: string | null) {
    this.ThreadId = value;
  }
  /** @deprecated Use {@link ThreadId}. */
  get threadId(): string | null {
    return this.ThreadId;
  }

  /**
   * When true, render the normal message-list + message-input layout even
   * before a conversation exists, instead of the centered empty-state
   * welcome card. Lets host pages (e.g. Form Builder cockpit) put the chat
   * header + mode picker front-and-center on first open and let the user
   * pick a mode before typing. The first send still routes through
   * MessageInputComponent and triggers conversationCreated as usual.
   */
  @Input() SuppressNewConversationEmptyState = false;

  /** @deprecated Use {@link SuppressNewConversationEmptyState}. */
  @Input() set suppressNewConversationEmptyState(value: ConversationChatAreaComponent['SuppressNewConversationEmptyState']) {
    this.SuppressNewConversationEmptyState = value;
  }
  /** @deprecated Use {@link SuppressNewConversationEmptyState}. */
  get suppressNewConversationEmptyState(): ConversationChatAreaComponent['SuppressNewConversationEmptyState'] {
    return this.SuppressNewConversationEmptyState;
  }

  /**
   * Host-level MASTER cap for the composer's mention/command triggers.
   * Defaults true. When false, ALL triggers (@ agents, # entities, / skills)
   * are off regardless of the per-type flags below. Hosts addressing a single
   * fixed agent (e.g. Form Builder cockpit) can set false wholesale.
   */
  @Input() AllowMentions = true;

  /** @deprecated Use {@link AllowMentions}. */
  @Input() set allowMentions(value: ConversationChatAreaComponent['AllowMentions']) {
    this.AllowMentions = value;
  }
  /** @deprecated Use {@link AllowMentions}. */
  get allowMentions(): ConversationChatAreaComponent['AllowMentions'] {
    return this.AllowMentions;
  }

  /**
   * Per-type caps under {@link allowMentions}, all default true. Let a host keep
   * one trigger while dropping another — e.g. a white-label surface pinned to a
   * default agent that wants to offer `/` skill-commands but NOT `@` agent
   * mentions (an `@` overrides the pinned default agent in message routing).
   * Effective only when `allowMentions` is also true.
   */
  @Input() AllowAgentMentions = true;

  /** @deprecated Use {@link AllowAgentMentions}. */
  @Input() set allowAgentMentions(value: ConversationChatAreaComponent['AllowAgentMentions']) {
    this.AllowAgentMentions = value;
  }
  /** @deprecated Use {@link AllowAgentMentions}. */
  get allowAgentMentions(): ConversationChatAreaComponent['AllowAgentMentions'] {
    return this.AllowAgentMentions;
  }
  @Input() AllowEntityMentions = true;

  /** @deprecated Use {@link AllowEntityMentions}. */
  @Input() set allowEntityMentions(value: ConversationChatAreaComponent['AllowEntityMentions']) {
    this.AllowEntityMentions = value;
  }
  /** @deprecated Use {@link AllowEntityMentions}. */
  get allowEntityMentions(): ConversationChatAreaComponent['AllowEntityMentions'] {
    return this.AllowEntityMentions;
  }
  @Input() AllowSkillCommands = true;

  /** @deprecated Use {@link AllowSkillCommands}. */
  @Input() set allowSkillCommands(value: ConversationChatAreaComponent['AllowSkillCommands']) {
    this.AllowSkillCommands = value;
  }
  /** @deprecated Use {@link AllowSkillCommands}. */
  get allowSkillCommands(): ConversationChatAreaComponent['AllowSkillCommands'] {
    return this.AllowSkillCommands;
  }

  /**
   * Host-level cap for attachments. Defaults true. When false, the host
   * disables attachments regardless of agent modality support — useful for
   * surfaces where attachments don't make sense (cockpit text-only flows).
   * When true (default), attachment availability still depends on the
   * agent's modality support, computed at runtime.
   */
  @Input() AllowAttachments = true;

  /** @deprecated Use {@link AllowAttachments}. */
  @Input() set allowAttachments(value: ConversationChatAreaComponent['AllowAttachments']) {
    this.AllowAttachments = value;
  }
  /** @deprecated Use {@link AllowAttachments}. */
  get allowAttachments(): ConversationChatAreaComponent['AllowAttachments'] {
    return this.AllowAttachments;
  }

  /**
   * Host-level cap for the composer's Plan Mode toggle. Defaults true
   * (current behavior). White-labeled / end-user hosts that don't expose
   * plan-mode workflows set false to remove the button entirely.
   */
  @Input() AllowPlanMode = true;

  /** @deprecated Use {@link AllowPlanMode}. */
  @Input() set allowPlanMode(value: ConversationChatAreaComponent['AllowPlanMode']) {
    this.AllowPlanMode = value;
  }
  /** @deprecated Use {@link AllowPlanMode}. */
  get allowPlanMode(): ConversationChatAreaComponent['AllowPlanMode'] {
    return this.AllowPlanMode;
  }

  /**
   * Host-level cap for the composer's realtime voice-call launcher (and its
   * options caret). Defaults true (current behavior). Hosts with no voice
   * experience set false to remove the buttons entirely.
   */
  @Input() AllowRealtime = true;

  /** @deprecated Use {@link AllowRealtime}. */
  @Input() set allowRealtime(value: ConversationChatAreaComponent['AllowRealtime']) {
    this.AllowRealtime = value;
  }
  /** @deprecated Use {@link AllowRealtime}. */
  get allowRealtime(): ConversationChatAreaComponent['AllowRealtime'] {
    return this.AllowRealtime;
  }

  /**
   * Whether the message list renders its built-in "No messages yet" filler
   * when a conversation has zero messages. Defaults true. Hosts that render
   * their own empty-state chrome around the chat area set false.
   */
  @Input() ShowEmptyFill = true;

  /** @deprecated Use {@link ShowEmptyFill}. */
  @Input() set showEmptyFill(value: ConversationChatAreaComponent['ShowEmptyFill']) {
    this.ShowEmptyFill = value;
  }
  /** @deprecated Use {@link ShowEmptyFill}. */
  get showEmptyFill(): ConversationChatAreaComponent['ShowEmptyFill'] {
    return this.ShowEmptyFill;
  }

  /**
   * Whether the built-in centered loading indicator renders while a
   * conversation loads. Defaults true. When false the pane stays blank
   * during the load (the loading branch still short-circuits rendering, so
   * no premature empty-state flash). Hosts with their own loading chrome
   * set false.
   */
  @Input() ShowLoadingState = true;

  /** @deprecated Use {@link ShowLoadingState}. */
  @Input() set showLoadingState(value: ConversationChatAreaComponent['ShowLoadingState']) {
    this.ShowLoadingState = value;
  }
  /** @deprecated Use {@link ShowLoadingState}. */
  get showLoadingState(): ConversationChatAreaComponent['ShowLoadingState'] {
    return this.ShowLoadingState;
  }

  /**
   * Read each reply from its top instead of its bottom.
   *
   * Default false (current behaviour): the pane follows the tail, so a run ends with the
   * reader looking at the END of the answer and scrolling back up to start reading it.
   *
   * When true, sending and the run itself behave as before, but when the reply lands and
   * the reader was following it, the turn — the reader's own message with the reply under
   * it — is scrolled so it starts at the top of the pane, IF it is taller than the pane. A
   * turn that fits stays where it is: it is all on screen anyway. A reader who scrolled up
   * during the run is never moved; the scroll-to-bottom button is their way back.
   */
  @Input() ReadReplyFromTop = false;

  /** @deprecated Use {@link ReadReplyFromTop}. */
  @Input() set readReplyFromTop(value: ConversationChatAreaComponent['ReadReplyFromTop']) {
    this.ReadReplyFromTop = value;
  }
  /** @deprecated Use {@link ReadReplyFromTop}. */
  get readReplyFromTop(): ConversationChatAreaComponent['ReadReplyFromTop'] {
    return this.ReadReplyFromTop;
  }

  // --- Additional host-level feature gates (all default true; false removes the
  //     affordance entirely). Forwarded to the message list / message items / empty
  //     state so white-labeled end-user surfaces can pare the chat down through the
  //     component contract instead of CSS on internal class names. ---
  /** Show the per-message agent run-detail grid (run ID, step/token counts, $ cost). */
  @Input() ShowAgentRunDetails = true;

  /** @deprecated Use {@link ShowAgentRunDetails}. */
  @Input() set showAgentRunDetails(value: ConversationChatAreaComponent['ShowAgentRunDetails']) {
    this.ShowAgentRunDetails = value;
  }
  /** @deprecated Use {@link ShowAgentRunDetails}. */
  get showAgentRunDetails(): ConversationChatAreaComponent['ShowAgentRunDetails'] {
    return this.ShowAgentRunDetails;
  }
  /** Show the per-message reaction buttons (like / comment). */
  @Input() ShowReactions = true;

  /** @deprecated Use {@link ShowReactions}. */
  @Input() set showReactions(value: ConversationChatAreaComponent['ShowReactions']) {
    this.ShowReactions = value;
  }
  /** @deprecated Use {@link ShowReactions}. */
  get showReactions(): ConversationChatAreaComponent['ShowReactions'] {
    return this.ShowReactions;
  }
  /** Show the per-message thumbs rating control on completed AI messages. */
  @Input() ShowMessageRating = true;

  /** @deprecated Use {@link ShowMessageRating}. */
  @Input() set showMessageRating(value: ConversationChatAreaComponent['ShowMessageRating']) {
    this.ShowMessageRating = value;
  }
  /** @deprecated Use {@link ShowMessageRating}. */
  get showMessageRating(): ConversationChatAreaComponent['ShowMessageRating'] {
    return this.ShowMessageRating;
  }
  /** Allow pinning messages (per-message pin button, the header pin chip, and the pinned-messages panel). */
  @Input() AllowPinning = true;

  /** @deprecated Use {@link AllowPinning}. */
  @Input() set allowPinning(value: ConversationChatAreaComponent['AllowPinning']) {
    this.AllowPinning = value;
  }
  /** @deprecated Use {@link AllowPinning}. */
  get allowPinning(): ConversationChatAreaComponent['AllowPinning'] {
    return this.AllowPinning;
  }
  /** Allow editing the user's own messages (per-message edit button). */
  @Input() AllowMessageEdit = true;

  /** @deprecated Use {@link AllowMessageEdit}. */
  @Input() set allowMessageEdit(value: ConversationChatAreaComponent['AllowMessageEdit']) {
    this.AllowMessageEdit = value;
  }
  /** @deprecated Use {@link AllowMessageEdit}. */
  get allowMessageEdit(): ConversationChatAreaComponent['AllowMessageEdit'] {
    return this.AllowMessageEdit;
  }
  /** Allow deleting the user's own messages (per-message delete button). */
  @Input() AllowMessageDelete = true;

  /** @deprecated Use {@link AllowMessageDelete}. */
  @Input() set allowMessageDelete(value: ConversationChatAreaComponent['AllowMessageDelete']) {
    this.AllowMessageDelete = value;
  }
  /** @deprecated Use {@link AllowMessageDelete}. */
  get allowMessageDelete(): ConversationChatAreaComponent['AllowMessageDelete'] {
    return this.AllowMessageDelete;
  }
  /** Show the empty-state's built-in suggested-prompt chips (and the @mention tip). */
  @Input() ShowSuggestedPrompts = true;

  /** @deprecated Use {@link ShowSuggestedPrompts}. */
  @Input() set showSuggestedPrompts(value: ConversationChatAreaComponent['ShowSuggestedPrompts']) {
    this.ShowSuggestedPrompts = value;
  }
  /** @deprecated Use {@link ShowSuggestedPrompts}. */
  get showSuggestedPrompts(): ConversationChatAreaComponent['ShowSuggestedPrompts'] {
    return this.ShowSuggestedPrompts;
  }
  /** Show the message list's sticky date header + jump-to-date navigation. */
  @Input() ShowDateNavigation = true;

  /** @deprecated Use {@link ShowDateNavigation}. */
  @Input() set showDateNavigation(value: ConversationChatAreaComponent['ShowDateNavigation']) {
    this.ShowDateNavigation = value;
  }
  /** @deprecated Use {@link ShowDateNavigation}. */
  get showDateNavigation(): ConversationChatAreaComponent['ShowDateNavigation'] {
    return this.ShowDateNavigation;
  }

  // --- Assistant identity overrides (both default null = engine-resolved agent
  //     identity, today's behavior). White-label hosts brand the AI side of the
  //     message feed — the persona NAME shown on AI messages and an IMAGE avatar
  //     replacing the Font Awesome agent icon — through the component contract
  //     instead of ::ng-deep on .message-sender / .avatar-circle internals.
  //     Complements agentCharacterConfig, which covers only the presence strip. ---
  /** Display name for AI messages (e.g. a per-tenant persona). Null = the agent record's name. */
  @Input() AssistantDisplayName: string | null = null;

  /** @deprecated Use {@link AssistantDisplayName}. */
  @Input() set assistantDisplayName(value: string | null) {
    this.AssistantDisplayName = value;
  }
  /** @deprecated Use {@link AssistantDisplayName}. */
  get assistantDisplayName(): string | null {
    return this.AssistantDisplayName;
  }
  /** Image URL for the AI message avatar. Null = the agent's Font Awesome icon. */
  @Input() AssistantAvatarUrl: string | null = null;

  /** @deprecated Use {@link AssistantAvatarUrl}. */
  @Input() set assistantAvatarUrl(value: string | null) {
    this.AssistantAvatarUrl = value;
  }
  /** @deprecated Use {@link AssistantAvatarUrl}. */
  get assistantAvatarUrl(): string | null {
    return this.AssistantAvatarUrl;
  }

  private _isNewConversation: boolean = false;
  @Input()
  set IsNewConversation(value: boolean) {
    this._isNewConversation = value;
    if (value) {
      this.focusEmptyStateInput();
    }
  }
  get IsNewConversation(): boolean {
    return this._isNewConversation;
  }

  /** @deprecated Use {@link IsNewConversation}. */
  get isNewConversation(): boolean {
    return this.IsNewConversation;
  }
  /** @deprecated Use {@link IsNewConversation}. */
  @Input() set isNewConversation(value: boolean) {
    this.IsNewConversation = value;
  }

  // Using getter/setter to ensure correct type handling
  private _pendingMessage: string | null = null;
  @Input()
  set PendingMessage(value: string | null) {
    const previousPendingMessage = this._pendingMessage;
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
      this._pendingMessageReservedTargetId = null;
    } else if (this._pendingMessage !== previousPendingMessage) {
      this._pendingMessageReservedTargetId = null;
    }
  }
  get PendingMessage(): string | null {
    return this._pendingMessage;
  }

  /** @deprecated Use {@link PendingMessage}. */
  get pendingMessage(): string | null {
    return this.PendingMessage;
  }
  /** @deprecated Use {@link PendingMessage}. */
  @Input() set pendingMessage(value: string | null) {
    this.PendingMessage = value;
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
  @Input() PendingMessageConversationId: string | null = null;

  /** @deprecated Use {@link PendingMessageConversationId}. */
  @Input() set pendingMessageConversationId(value: string | null) {
    this.PendingMessageConversationId = value;
  }
  /** @deprecated Use {@link PendingMessageConversationId}. */
  get pendingMessageConversationId(): string | null {
    return this.PendingMessageConversationId;
  }

  /** Internally-captured target for {@link pendingMessage}, set when this component creates a
   *  new conversation from the empty state. Host-independent; immune to conversation-swap timing. */
  private _pendingMessageTargetId: string | null = null;
  private _pendingMessageReservedTargetId: string | null = null;

  /**
   * The conversation a pending message must be delivered to. Prefers the explicit host input,
   * then the internally-captured new-conversation target, finally the active conversation
   * (legacy fallback for single-conversation hosts that never swap).
   */
  public get EffectivePendingMessageTarget(): string | null {
    return this.PendingMessageConversationId ?? this._pendingMessageTargetId ?? this.ConversationId;
  }

  public ShouldDeliverPendingMessageTo(conversationId: string): boolean {
    const targetId = this.EffectivePendingMessageTarget;
    return UUIDsEqual(conversationId, targetId) && !UUIDsEqual(this._pendingMessageReservedTargetId, targetId);
  }

  /** @deprecated Use {@link ShouldDeliverPendingMessageTo}. */
  public shouldDeliverPendingMessageTo(conversationId: string): boolean {
    return this.ShouldDeliverPendingMessageTo(conversationId);
  }

  // Using getter/setter to ensure reactivity
  private _pendingAttachments: PendingAttachment[] | null = null;
  @Input()
  set PendingAttachments(value: PendingAttachment[] | null) {
    this._pendingAttachments = value;
  }
  get PendingAttachments(): PendingAttachment[] | null {
    return this._pendingAttachments;
  }

  /** @deprecated Use {@link PendingAttachments}. */
  get pendingAttachments(): PendingAttachment[] | null {
    return this.PendingAttachments;
  }
  /** @deprecated Use {@link PendingAttachments}. */
  @Input() set pendingAttachments(value: PendingAttachment[] | null) {
    this.PendingAttachments = value;
  }

  @Input() PendingArtifactId: string | null = null;

  /** @deprecated Use {@link PendingArtifactId}. */
  @Input() set pendingArtifactId(value: string | null) {
    this.PendingArtifactId = value;
  }
  /** @deprecated Use {@link PendingArtifactId}. */
  get pendingArtifactId(): string | null {
    return this.PendingArtifactId;
  }
  @Input() PendingArtifactVersionNumber: number | null = null;

  /** @deprecated Use {@link PendingArtifactVersionNumber}. */
  @Input() set pendingArtifactVersionNumber(value: number | null) {
    this.PendingArtifactVersionNumber = value;
  }
  /** @deprecated Use {@link PendingArtifactVersionNumber}. */
  get pendingArtifactVersionNumber(): number | null {
    return this.PendingArtifactVersionNumber;
  }
  @Input() PendingArtifactConversationId: string | null = null;

  /** @deprecated Use {@link PendingArtifactConversationId}. */
  @Input() set pendingArtifactConversationId(value: string | null) {
    this.PendingArtifactConversationId = value;
  }
  /** @deprecated Use {@link PendingArtifactConversationId}. */
  get pendingArtifactConversationId(): string | null {
    return this.PendingArtifactConversationId;
  }

  /** When true, the component is rendered inside the floating overlay (hides suggested topics, etc.) */
  @Input() OverlayMode: boolean = false;

  /** @deprecated Use {@link OverlayMode}. */
  @Input() set overlayMode(value: boolean) {
    this.OverlayMode = value;
  }
  /** @deprecated Use {@link OverlayMode}. */
  get overlayMode(): boolean {
    return this.OverlayMode;
  }

  /** Show the Export button in the conversation header. Default true. */
  @Input() ShowExportButton: boolean = true;

  /** @deprecated Use {@link ShowExportButton}. */
  @Input() set showExportButton(value: boolean) {
    this.ShowExportButton = value;
  }
  /** @deprecated Use {@link ShowExportButton}. */
  get showExportButton(): boolean {
    return this.ShowExportButton;
  }

  /** Label for the header Export button (white-label hosts relabel it, e.g. "Download"). */
  @Input() ExportButtonLabel: string = 'Export';

  /** @deprecated Use {@link ExportButtonLabel}. */
  @Input() set exportButtonLabel(value: string) {
    this.ExportButtonLabel = value;
  }
  /** @deprecated Use {@link ExportButtonLabel}. */
  get exportButtonLabel(): string {
    return this.ExportButtonLabel;
  }

  /** Font Awesome class(es) for the header Export button's icon. */
  @Input() ExportButtonIcon: string = 'fas fa-download';

  /** @deprecated Use {@link ExportButtonIcon}. */
  @Input() set exportButtonIcon(value: string) {
    this.ExportButtonIcon = value;
  }
  /** @deprecated Use {@link ExportButtonIcon}. */
  get exportButtonIcon(): string {
    return this.ExportButtonIcon;
  }

  /**
   * Branding applied to exported files (theme tokens / logo / title) — forwarded
   * to the export modal, where it also defaults the "Include branding" checkbox
   * on. See `ExportBranding` in the export service. Null (default) keeps the
   * stock unthemed export.
   */
  @Input() ExportBranding: ExportBranding | null = null;

  /** @deprecated Use {@link ExportBranding}. */
  @Input() set exportBranding(value: ExportBranding | null) {
    this.ExportBranding = value;
  }
  /** @deprecated Use {@link ExportBranding}. */
  get exportBranding(): ExportBranding | null {
    return this.ExportBranding;
  }

  /** Show the Share button in the conversation header. Default true. */
  @Input() ShowShareButton: boolean = true;

  /** @deprecated Use {@link ShowShareButton}. */
  @Input() set showShareButton(value: boolean) {
    this.ShowShareButton = value;
  }
  /** @deprecated Use {@link ShowShareButton}. */
  get showShareButton(): boolean {
    return this.ShowShareButton;
  }

  /** Show the artifact count indicator in the conversation header. Default true. */
  @Input() ShowArtifactIndicator: boolean = true;

  /** @deprecated Use {@link ShowArtifactIndicator}. */
  @Input() set showArtifactIndicator(value: boolean) {
    this.ShowArtifactIndicator = value;
  }
  /** @deprecated Use {@link ShowArtifactIndicator}. */
  get showArtifactIndicator(): boolean {
    return this.ShowArtifactIndicator;
  }

  /** Application context snapshot for AI agent awareness. Included in agent execution data. */
  @Input() AppContext: Record<string, unknown> | null = null;

  /** @deprecated Use {@link AppContext}. */
  @Input() set appContext(value: Record<string, unknown> | null) {
    this.AppContext = value;
  }
  /** @deprecated Use {@link AppContext}. */
  get appContext(): Record<string, unknown> | null {
    return this.AppContext;
  }

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
   * Scope to apply when this surface CREATES a new conversation. Forwarded
   * to `ConversationEngine.CreateConversation` so the new row's
   * `ApplicationScope` column is stamped correctly. Embedded surfaces
   * (e.g. the Form Builder cockpit) set this to `'Application'` so their
   * conversations don't pollute the main Chat app list. Main Chat leaves
   * it as the default `'Global'`. Has no effect on existing conversations.
   */
  @Input() ApplicationScope: 'Global' | 'Application' | 'Both' = 'Global';

  /** @deprecated Use {@link ApplicationScope}. */
  @Input() set applicationScope(value: 'Global' | 'Application' | 'Both') {
    this.ApplicationScope = value;
  }
  /** @deprecated Use {@link ApplicationScope}. */
  get applicationScope(): 'Global' | 'Application' | 'Both' {
    return this.ApplicationScope;
  }

  /**
   * Application ID to bind a newly-created conversation to. REQUIRED when
   * `applicationScope` is 'Application' or 'Both' (DB CHECK constraint
   * enforces it). Used by embedded chat surfaces to scope their
   * conversations to their owning Application.
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
  @Input() LinkedEntityId: string | null = null;

  /** @deprecated Use {@link LinkedEntityId}. */
  @Input() set linkedEntityId(value: string | null) {
    this.LinkedEntityId = value;
  }
  /** @deprecated Use {@link LinkedEntityId}. */
  get linkedEntityId(): string | null {
    return this.LinkedEntityId;
  }

  /**
   * Primary key of the linked record, serialized as a string. Used with
   * {@link linkedEntityId}. Form Builder cockpit passes the active
   * form's ComponentID; Component Studio's AI panel passes the
   * currently-selected component's ID.
   */
  @Input() LinkedRecordId: string | null = null;

  /** @deprecated Use {@link LinkedRecordId}. */
  @Input() set linkedRecordId(value: string | null) {
    this.LinkedRecordId = value;
  }
  /** @deprecated Use {@link LinkedRecordId}. */
  get linkedRecordId(): string | null {
    return this.LinkedRecordId;
  }

  /**
   * Whether the conversation header should render the per-conversation
   * agent picker. Default true. The picker lets a user pin a default
   * agent on the active conversation (saved to
   * `MJConversationEntity.DefaultAgentID`), so non-mention messages route
   * to that agent instead of through Sage. Surfaces with no meaningful
   * agent-choice UX can set this to false to hide the widget.
   */
  @Input() ShowAgentPicker: boolean = true;

  /** @deprecated Use {@link ShowAgentPicker}. */
  @Input() set showAgentPicker(value: boolean) {
    this.ShowAgentPicker = value;
  }
  /** @deprecated Use {@link ShowAgentPicker}. */
  get showAgentPicker(): boolean {
    return this.ShowAgentPicker;
  }

  /**
   * Whether the chat header should render the per-agent mode/quality
   * picker (Draft / Standard / High, etc.). Default true. The picker
   * auto-hides when the bound agent has fewer than 2 configured
   * presets, so embedders rarely need to set this explicitly — turn
   * off only when the surface should never expose model-tier choice
   * (kiosks, specialty embeds).
   */
  @Input() ShowAgentModePicker: boolean = true;

  /** @deprecated Use {@link ShowAgentModePicker}. */
  @Input() set showAgentModePicker(value: boolean) {
    this.ShowAgentModePicker = value;
  }
  /** @deprecated Use {@link ShowAgentModePicker}. */
  get showAgentModePicker(): boolean {
    return this.ShowAgentModePicker;
  }

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
    return this.ShowAgentModePicker && !!this.ModePickerTargetAgentId;
  }

  public get ModePickerTargetAgentId(): string | null {
    return this.Conversation?.DefaultAgentID
        ?? this.DefaultAgentId
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
  @Input() EmptyStateGreeting: string = 'How can I help you?';

  /** @deprecated Use {@link EmptyStateGreeting}. */
  @Input() set emptyStateGreeting(value: string) {
    this.EmptyStateGreeting = value;
  }
  /** @deprecated Use {@link EmptyStateGreeting}. */
  get emptyStateGreeting(): string {
    return this.EmptyStateGreeting;
  }

  // Sidebar toggle - when true, shows toggle button in header to expand sidebar
  @Input() ShowSidebarToggle: boolean = false;

  /** @deprecated Use {@link ShowSidebarToggle}. */
  @Input() set showSidebarToggle(value: boolean) {
    this.ShowSidebarToggle = value;
  }
  /** @deprecated Use {@link ShowSidebarToggle}. */
  get showSidebarToggle(): boolean {
    return this.ShowSidebarToggle;
  }

  // ────────────────────────────────────────────────────────────────────
  // PR 2c — Widget extension surface (additive — no breaking changes)
  // ────────────────────────────────────────────────────────────────────

  /**
   * When true, the `agentPresence` slot is allowed to render (using the
   * supplied `agentCharacterConfig` for visualization data). Off by default
   * so existing embeds (Form Builder, Component Studio AI Assistant, the
   * corner overlay) see no UI change.
   */
  @Input() ShowAgentCharacter: boolean = false;

  /** @deprecated Use {@link ShowAgentCharacter}. */
  @Input() set showAgentCharacter(value: boolean) {
    this.ShowAgentCharacter = value;
  }
  /** @deprecated Use {@link ShowAgentCharacter}. */
  get showAgentCharacter(): boolean {
    return this.ShowAgentCharacter;
  }

  /**
   * Visualization data forwarded to the `agentPresence` slot's default
   * component (or to any consumer-projected template via slot context).
   * Includes avatar URL, character name, voice state, and visual intensity.
   */
  @Input() AgentCharacterConfig: AgentCharacterConfig | null = null;

  /** @deprecated Use {@link AgentCharacterConfig}. */
  @Input() set agentCharacterConfig(value: AgentCharacterConfig | null) {
    this.AgentCharacterConfig = value;
  }
  /** @deprecated Use {@link AgentCharacterConfig}. */
  get agentCharacterConfig(): AgentCharacterConfig | null {
    return this.AgentCharacterConfig;
  }

  /**
   * Structured config for the `emptyState` slot's default component —
   * greeting, subtext, and optional suggested prompts. Backwards-compatible
   * with the existing `emptyStateGreeting` input (which still wins when
   * `emptyStateConfig` is null).
   */
  @Input() EmptyStateConfig: EmptyStateConfig | null = null;

  /** @deprecated Use {@link EmptyStateConfig}. */
  @Input() set emptyStateConfig(value: EmptyStateConfig | null) {
    this.EmptyStateConfig = value;
  }
  /** @deprecated Use {@link EmptyStateConfig}. */
  get emptyStateConfig(): EmptyStateConfig | null {
    return this.EmptyStateConfig;
  }

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
  @Input() ShowDemonstrationSurface: boolean = false;

  /** @deprecated Use {@link ShowDemonstrationSurface}. */
  @Input() set showDemonstrationSurface(value: boolean) {
    this.ShowDemonstrationSurface = value;
  }
  /** @deprecated Use {@link ShowDemonstrationSurface}. */
  get showDemonstrationSurface(): boolean {
    return this.ShowDemonstrationSurface;
  }

  /**
   * Content payload forwarded to the `demonstrationSurface` slot via
   * `$implicit` + named `content` context. Shape is consumer-defined per the
   * {@link IMJChatDemonstrationSurfaceComponent} interface — the widget
   * doesn't introspect or render it directly, just hands it through.
   */
  @Input() DemonstrationSurfaceContent: unknown = null;

  /** @deprecated Use {@link DemonstrationSurfaceContent}. */
  @Input() set demonstrationSurfaceContent(value: unknown) {
    this.DemonstrationSurfaceContent = value;
  }
  /** @deprecated Use {@link DemonstrationSurfaceContent}. */
  get demonstrationSurfaceContent(): unknown {
    return this.DemonstrationSurfaceContent;
  }

  /**
   * True when the demonstrationSurface layout-mode is BOTH opted-in
   * (`showDemonstrationSurface`) AND has a slot template projected to render
   * into. Both conditions must hold for the layout restructure to kick in.
   */
  public get IsDemonstrationActive(): boolean {
    return this.ShowDemonstrationSurface && this.SlotTemplate('demonstrationSurface') !== null;
  }

  /** @deprecated Use {@link IsDemonstrationActive}. */
  public get isDemonstrationActive(): boolean {
    return this.IsDemonstrationActive;
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
  @Output() BeforeAgentTurn = new EventEmitter<BeforeAgentTurnEventArgs>();

  /**
   * @deprecated Use {@link BeforeAgentTurn}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeAgentTurn) keeps working. Must stay AFTER BeforeAgentTurn: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeAgentTurn = this.BeforeAgentTurn;
  /** Fired AFTER a successful agent turn completes. */
  @Output() AfterAgentTurn = new EventEmitter<AfterAgentTurnEventArgs>();

  /**
   * @deprecated Use {@link AfterAgentTurn}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterAgentTurn) keeps working. Must stay AFTER AfterAgentTurn: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterAgentTurn = this.AfterAgentTurn;

  /** Cancelable — fired BEFORE a registered client tool is invoked by the agent. */
  @Output() BeforeToolInvoked = new EventEmitter<BeforeToolInvokedEventArgs>();

  /**
   * @deprecated Use {@link BeforeToolInvoked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeToolInvoked) keeps working. Must stay AFTER BeforeToolInvoked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeToolInvoked = this.BeforeToolInvoked;
  /** Fired AFTER a client tool invocation completes. */
  @Output() AfterToolInvoked = new EventEmitter<AfterToolInvokedEventArgs>();

  /**
   * @deprecated Use {@link AfterToolInvoked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterToolInvoked) keeps working. Must stay AFTER AfterToolInvoked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterToolInvoked = this.AfterToolInvoked;

  /** Cancelable — fired BEFORE a response form's submitted values are sent. */
  @Output() BeforeResponseFormSubmitted = new EventEmitter<BeforeResponseFormSubmittedEventArgs>();

  /**
   * @deprecated Use {@link BeforeResponseFormSubmitted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeResponseFormSubmitted) keeps working. Must stay AFTER BeforeResponseFormSubmitted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeResponseFormSubmitted = this.BeforeResponseFormSubmitted;
  /** Fired AFTER a response form's values have been sent. */
  @Output() AfterResponseFormSubmitted = new EventEmitter<AfterResponseFormSubmittedEventArgs>();

  /**
   * @deprecated Use {@link AfterResponseFormSubmitted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterResponseFormSubmitted) keeps working. Must stay AFTER AfterResponseFormSubmitted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterResponseFormSubmitted = this.AfterResponseFormSubmitted;

  /** Informational. */
  @Output() SessionStarted = new EventEmitter<SessionStartedEventArgs>();

  /**
   * @deprecated Use {@link SessionStarted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (sessionStarted) keeps working. Must stay AFTER SessionStarted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() sessionStarted = this.SessionStarted;
  /** Informational. */
  @Output() SessionChannelStateChanged = new EventEmitter<SessionChannelStateChangedEventArgs>();

  /**
   * @deprecated Use {@link SessionChannelStateChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (sessionChannelStateChanged) keeps working. Must stay AFTER SessionChannelStateChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() sessionChannelStateChanged = this.SessionChannelStateChanged;
  /** Informational. */
  @Output() SessionEnded = new EventEmitter<SessionEndedEventArgs>();

  /**
   * @deprecated Use {@link SessionEnded}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (sessionEnded) keeps working. Must stay AFTER SessionEnded: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() sessionEnded = this.SessionEnded;

  @Output() ConversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();

  /**
   * @deprecated Use {@link ConversationRenamed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationRenamed) keeps working. Must stay AFTER ConversationRenamed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationRenamed = this.ConversationRenamed;
  @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;

  /**
   * A realtime session that CREATED its own conversation has ended — the new
   * conversation is named (background, shared helper) and ready. The workspace folds
   * it into the cached list and selects it when the conversation list is visible.
   */
  @Output() RealtimeConversationReady = new EventEmitter<{conversationId: string; select: boolean}>();

  /**
   * @deprecated Use {@link RealtimeConversationReady}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (realtimeConversationReady) keeps working. Must stay AFTER RealtimeConversationReady: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() realtimeConversationReady = this.RealtimeConversationReady;
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
  @Output() TaskClicked = new EventEmitter<MJTaskEntity>();

  /**
   * @deprecated Use {@link TaskClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (taskClicked) keeps working. Must stay AFTER TaskClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() taskClicked = this.TaskClicked;
  @Output() ArtifactLinkClicked = new EventEmitter<{type: 'conversation' | 'collection'; id: string}>();

  /**
   * @deprecated Use {@link ArtifactLinkClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (artifactLinkClicked) keeps working. Must stay AFTER ArtifactLinkClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() artifactLinkClicked = this.ArtifactLinkClicked;
  @Output() SidebarToggleClicked = new EventEmitter<void>();

  /**
   * @deprecated Use {@link SidebarToggleClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (sidebarToggleClicked) keeps working. Must stay AFTER SidebarToggleClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() sidebarToggleClicked = this.SidebarToggleClicked;

  // STATE CHANGE OUTPUTS - notify parent of state changes
  // conversationCreated now includes pendingMessage and pendingAttachments to ensure atomic state update
  @Output() ConversationCreated = new EventEmitter<{
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }>();

  /**
   * @deprecated Use {@link ConversationCreated}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationCreated) keeps working. Must stay AFTER ConversationCreated: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationCreated = this.ConversationCreated;
  @Output() ThreadOpened = new EventEmitter<string>();

  /**
   * @deprecated Use {@link ThreadOpened}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (threadOpened) keeps working. Must stay AFTER ThreadOpened: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() threadOpened = this.ThreadOpened;
  @Output() ThreadClosed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ThreadClosed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (threadClosed) keeps working. Must stay AFTER ThreadClosed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() threadClosed = this.ThreadClosed;
  @Output() PendingArtifactConsumed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link PendingArtifactConsumed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (pendingArtifactConsumed) keeps working. Must stay AFTER PendingArtifactConsumed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() pendingArtifactConsumed = this.PendingArtifactConsumed;
  @Output() PendingMessageConsumed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link PendingMessageConsumed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (pendingMessageConsumed) keeps working. Must stay AFTER PendingMessageConsumed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() pendingMessageConsumed = this.PendingMessageConsumed;
  // pendingMessageRequested is deprecated - use conversationCreated with pendingMessage instead
  @Output() PendingMessageRequested = new EventEmitter<{text: string; attachments: PendingAttachment[]}>();

  /**
   * @deprecated Use {@link PendingMessageRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (pendingMessageRequested) keeps working. Must stay AFTER PendingMessageRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() pendingMessageRequested = this.PendingMessageRequested;

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChildren('messageInput') private messageInputComponents!: QueryList<MessageInputComponent>;

  /**
   * Prefill the composer with draft text (NOT sent — unlike pendingMessage) and focus
   * it. Targets the empty-state input for new/unsaved conversations, else the active
   * conversation's cached input. Emits composerDraftConsumed once applied. Retries
   * briefly because the target input mounts asynchronously (config params can arrive
   * before the first render).
   */
  @Input() ComposerDraft: string | null = null;

  /** @deprecated Use {@link ComposerDraft}. */
  @Input() set composerDraft(value: string | null) {
    this.ComposerDraft = value;
  }
  /** @deprecated Use {@link ComposerDraft}. */
  get composerDraft(): string | null {
    return this.ComposerDraft;
  }

  @Output() ComposerDraftConsumed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ComposerDraftConsumed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (composerDraftConsumed) keeps working. Must stay AFTER ComposerDraftConsumed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() composerDraftConsumed = this.ComposerDraftConsumed;

  /**
   * Pre-address the composer to an AGENT as a resolved mention pill (+ space +
   * focus) — the chip-resolving sibling of {@link composerDraft}. Value = the
   * agent's name. Emits composerAgentMentionConsumed once applied.
   */
  @Input()
  set ComposerAgentMention(value: string | null) {
    if (value && value !== this._composerAgentMention) {
      this._composerAgentMention = value;
      this.applyComposerAgentMention(0);
    } else if (!value) {
      this._composerAgentMention = null;
    }
  }
  get ComposerAgentMention(): string | null {
    return this._composerAgentMention;
  }

  /** @deprecated Use {@link ComposerAgentMention}. */
  get composerAgentMention(): string | null {
    return this.ComposerAgentMention;
  }
  /** @deprecated Use {@link ComposerAgentMention}. */
  @Input() set composerAgentMention(value: string | null) {
    this.ComposerAgentMention = value;
  }
  private _composerAgentMention: string | null = null;

  @Output() ComposerAgentMentionConsumed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ComposerAgentMentionConsumed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (composerAgentMentionConsumed) keeps working. Must stay AFTER ComposerAgentMentionConsumed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() composerAgentMentionConsumed = this.ComposerAgentMentionConsumed;

  /**
   * Per-user persisted composer drafts (UserInfoEngine-backed): restore on mount,
   * debounced-persist while typing, flush on blur/switch, delete on send.
   * See {@link ComposerDraftStore} for the storage contract.
   */
  private readonly draftStore = new ComposerDraftStore();

  /**
   * ONE-SHOT restore snapshot per composer key. This MUST NOT be a live read:
   * the store updates on every keystroke (DraftStateChanged), and a live binding
   * would re-stage the serialized draft into the composer while the user types —
   * rewriting content and scrambling the caret. The first evaluation per key wins
   * for the life of this chat area: a pending agent pre-address or host-supplied
   * composerDraft outranks the persisted draft (fresher intent); afterwards the
   * binding returns the frozen snapshot so the initialDraft setter's dedupe holds.
   */
  private readonly initialDraftSnapshots = new Map<string, string | null>();

  public GetInitialDraftFor(conversationId: string | null): string | null {
    const key = conversationId ? conversationId.trim().toLowerCase() : 'new';
    if (!this.initialDraftSnapshots.has(key)) {
      let snapshot: string | null;
      if (this._composerAgentMention) {
        snapshot = null; // pre-address wins; never restore over it
      } else if (!conversationId && this.ComposerDraft) {
        snapshot = this.ComposerDraft;
      } else {
        snapshot = this.draftStore.GetDraft(conversationId);
      }
      this.initialDraftSnapshots.set(key, snapshot);
    }
    return this.initialDraftSnapshots.get(key) ?? null;
  }

  /** Live draft persistence (store debounces the server write). */
  public OnDraftStateChanged(conversationId: string | null, serialized: string): void {
    // verboseOnly: fires on every keystroke, same as the store's own SetDraft log below it.
    LogStatusEx({ message: `[Drafts] chat-area: draft change for '${conversationId ?? 'new'}' (${serialized.length} chars)`, verboseOnly: true });
    this.draftStore.SetDraft(conversationId, serialized);
  }

  /** Blur = a natural save point — persist immediately. */
  public OnComposerBlurred(): void {
    this.draftStore.Flush();
  }

  /** Cold deep-link boots can take several seconds before a composer mounts. */
  private static readonly AGENT_MENTION_MAX_ATTEMPTS = 60; // × 150ms ≈ 9s

  private applyComposerAgentMention(attempt: number): void {
    const agentName = this._composerAgentMention;
    if (!agentName) {
      return;
    }
    // New/unsaved conversations render the empty-state composer; established ones
    // use the active cached input. Both resolve the agent to a pill.
    const target = this.emptyStateComponent ? 'empty-state' : this.messageInputComponents?.first ? 'active-input' : null;
    if (attempt === 0 || attempt % 10 === 0 || target) {
      console.log(`[Omnibar→Chat] chat-area apply('${agentName}') attempt ${attempt}: target=${target ?? 'none-mounted'}`);
    }
    const insert: Promise<boolean> | null = this.emptyStateComponent
      ? this.emptyStateComponent.InsertAgentMention(agentName, true)
      : this.messageInputComponents?.first
        ? this.messageInputComponents.first.InsertAgentMention(agentName, true)
        : null;
    if (insert) {
      void insert.then((applied: boolean) => {
        if (applied) {
          console.log(`[Omnibar→Chat] chat-area apply('${agentName}'): APPLIED on ${target} (attempt ${attempt})`);
          this._composerAgentMention = null;
          this.ComposerAgentMentionConsumed.emit();
        } else if (attempt < ConversationChatAreaComponent.AGENT_MENTION_MAX_ATTEMPTS) {
          setTimeout(() => this.applyComposerAgentMention(attempt + 1), 150);
        } else {
          console.error(`[Omnibar→Chat] chat-area apply('${agentName}'): GAVE UP after ${attempt} attempts — composer never became insertable`);
        }
      });
      return;
    }
    if (attempt < ConversationChatAreaComponent.AGENT_MENTION_MAX_ATTEMPTS) {
      setTimeout(() => this.applyComposerAgentMention(attempt + 1), 150);
    } else {
      console.error(`[Omnibar→Chat] chat-area apply('${agentName}'): GAVE UP after ${attempt} attempts — no composer mounted (emptyState=${!!this.emptyStateComponent}, inputs=${this.messageInputComponents?.length ?? 0})`);
    }
  }

  /** The empty-state input applied the staged draft — clear + inform the host. */
  public OnComposerDraftApplied(): void {
    this.ComposerDraft = null;
    this.ComposerDraftConsumed.emit();
  }
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
  public SlotTemplate(name: MJChatSlotName): TemplateRef<unknown> | null {
    return this.chatSlotChildren?.find((s) => s.SlotName === name)?.Template ?? null;
  }

  /** @deprecated Use {@link SlotTemplate}. */
  public slotTemplate(name: MJChatSlotName): TemplateRef<unknown> | null {
    return this.SlotTemplate(name);
  }

  public messages: MJConversationDetailEntity[] = [];
  public ShowScrollToBottomIcon = false;

  /** @deprecated Use {@link ShowScrollToBottomIcon}. */
  public get showScrollToBottomIcon() {
    return this.ShowScrollToBottomIcon;
  }
  /** @deprecated Use {@link ShowScrollToBottomIcon}. */
  public set showScrollToBottomIcon(value) {
    this.ShowScrollToBottomIcon = value;
  }
  private scrollToBottom = false;
  /**
   * Whether the reader was at (within a few px of) the bottom at the last scroll event.
   * An in-place message update only follows the tail for a reader who is already there;
   * one who scrolled up to reread history is left alone, whichever mode is on.
   */
  private readerAtBottom = true;
  /** readReplyFromTop: the reader's message that opened the current turn. */
  private currentTurnStartMessageId: string | null = null;
  /** readReplyFromTop: set when the reply lands, consumed once it has rendered. */
  private pendingTurnStartMessageId: string | null = null;
  /**
   * readReplyFromTop: while a landing is under way, bottom-follow timers already armed by the
   * last progress updates must not fire and drag the reader back down.
   */
  private bottomFollowSuppressedUntil = 0;
  private turnStartRetryHandle: ReturnType<typeof setTimeout> | null = null;
  /** Gap kept between the pane's top edge and the turn's first message. */
  private static readonly TURN_TOP_GAP_PX = 16;
  private lastLoadedConversationId: string | null = null; // Track which conversation's peripheral data was loaded
  private currentlyLoadingConversationId: string | null = null; // Track which conversation is currently being loaded
  private conversationLoadToken = 0; // Monotonic token to discard stale async conversation loads
  public IsProcessing: boolean = false;

  /** @deprecated Use {@link IsProcessing}. */
  public get isProcessing(): boolean {
    return this.IsProcessing;
  }
  /** @deprecated Use {@link IsProcessing}. */
  public set isProcessing(value: boolean) {
    this.IsProcessing = value;
  }
  private intentCheckMessage: MJConversationDetailEntity | null = null; // Temporary message shown during intent checking
  public IsLoadingConversation: boolean = false;

  /** @deprecated Use {@link IsLoadingConversation}. */
  public get isLoadingConversation(): boolean {
    return this.IsLoadingConversation;
  }
  /** @deprecated Use {@link IsLoadingConversation}. */
  public set isLoadingConversation(value: boolean) {
    this.IsLoadingConversation = value;
  } // Set to true only when actively loading conversation data

  // User avatar map derived from engine cache
  public UserAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();

  /** @deprecated Use {@link UserAvatarMap}. */
  public get userAvatarMap(): Map<string, {imageUrl: string | null; iconClass: string | null}> {
    return this.UserAvatarMap;
  }
  /** @deprecated Use {@link UserAvatarMap}. */
  public set userAvatarMap(value: Map<string, {imageUrl: string | null; iconClass: string | null}>) {
    this.UserAvatarMap = value;
  }
  public MemberCount: number = 1;

  /** @deprecated Use {@link MemberCount}. */
  public get memberCount(): number {
    return this.MemberCount;
  }
  /** @deprecated Use {@link MemberCount}. */
  public set memberCount(value: number) {
    this.MemberCount = value;
  }
  public ArtifactCount: number = 0;

  /** @deprecated Use {@link ArtifactCount}. */
  public get artifactCount(): number {
    return this.ArtifactCount;
  }
  /** @deprecated Use {@link ArtifactCount}. */
  public set artifactCount(value: number) {
    this.ArtifactCount = value;
  }
  public ArtifactCountDisplay: number = 0;

  /** @deprecated Use {@link ArtifactCountDisplay}. */
  public get artifactCountDisplay(): number {
    return this.ArtifactCountDisplay;
  }
  /** @deprecated Use {@link ArtifactCountDisplay}. */
  public set artifactCountDisplay(value: number) {
    this.ArtifactCountDisplay = value;
  }
  public IsShared: boolean = false;

  /** @deprecated Use {@link IsShared}. */
  public get isShared(): boolean {
    return this.IsShared;
  }
  /** @deprecated Use {@link IsShared}. */
  public set isShared(value: boolean) {
    this.IsShared = value;
  }
  public ShowExportModal: boolean = false;

  /** @deprecated Use {@link ShowExportModal}. */
  public get showExportModal(): boolean {
    return this.ShowExportModal;
  }
  /** @deprecated Use {@link ShowExportModal}. */
  public set showExportModal(value: boolean) {
    this.ShowExportModal = value;
  }
  public ShowShareModal: boolean = false;

  /** @deprecated Use {@link ShowShareModal}. */
  public get showShareModal(): boolean {
    return this.ShowShareModal;
  }
  /** @deprecated Use {@link ShowShareModal}. */
  public set showShareModal(value: boolean) {
    this.ShowShareModal = value;
  }
  public ShareContext: ResourceShareContext | null = null;

  /** @deprecated Use {@link ShareContext}. */
  public get shareContext(): ResourceShareContext | null {
    return this.ShareContext;
  }
  /** @deprecated Use {@link ShareContext}. */
  public set shareContext(value: ResourceShareContext | null) {
    this.ShareContext = value;
  }
  public ShareAdapter = new MJResourcePermissionShareAdapter(CONVERSATIONS_RESOURCE_TYPE_ID);

  /** @deprecated Use {@link ShareAdapter}. */
  public get shareAdapter() {
    return this.ShareAdapter;
  }
  /** @deprecated Use {@link ShareAdapter}. */
  public set shareAdapter(value) {
    this.ShareAdapter = value;
  }
  public ShowAgentPanel: boolean = false;

  /** @deprecated Use {@link ShowAgentPanel}. */
  public get showAgentPanel(): boolean {
    return this.ShowAgentPanel;
  }
  /** @deprecated Use {@link ShowAgentPanel}. */
  public set showAgentPanel(value: boolean) {
    this.ShowAgentPanel = value;
  }
  public ShowMembersModal: boolean = false;

  /** @deprecated Use {@link ShowMembersModal}. */
  public get showMembersModal(): boolean {
    return this.ShowMembersModal;
  }
  /** @deprecated Use {@link ShowMembersModal}. */
  public set showMembersModal(value: boolean) {
    this.ShowMembersModal = value;
  }
  public ShowProjectSelector: boolean = false;

  /** @deprecated Use {@link ShowProjectSelector}. */
  public get showProjectSelector(): boolean {
    return this.ShowProjectSelector;
  }
  /** @deprecated Use {@link ShowProjectSelector}. */
  public set showProjectSelector(value: boolean) {
    this.ShowProjectSelector = value;
  }
  public ShowArtifactPanel: boolean = false;

  /** @deprecated Use {@link ShowArtifactPanel}. */
  public get showArtifactPanel(): boolean {
    return this.ShowArtifactPanel;
  }
  /** @deprecated Use {@link ShowArtifactPanel}. */
  public set showArtifactPanel(value: boolean) {
    this.ShowArtifactPanel = value;
  }
  public ShowArtifactsModal: boolean = false;

  /** @deprecated Use {@link ShowArtifactsModal}. */
  public get showArtifactsModal(): boolean {
    return this.ShowArtifactsModal;
  }
  /** @deprecated Use {@link ShowArtifactsModal}. */
  public set showArtifactsModal(value: boolean) {
    this.ShowArtifactsModal = value;
  }
  public ShowSystemArtifacts: boolean = false;

  /** @deprecated Use {@link ShowSystemArtifacts}. */
  public get showSystemArtifacts(): boolean {
    return this.ShowSystemArtifacts;
  }
  /** @deprecated Use {@link ShowSystemArtifacts}. */
  public set showSystemArtifacts(value: boolean) {
    this.ShowSystemArtifacts = value;
  } // Toggle for showing system-only artifacts
  public SelectedArtifactId: string | null = null;

  /** @deprecated Use {@link SelectedArtifactId}. */
  public get selectedArtifactId(): string | null {
    return this.SelectedArtifactId;
  }
  /** @deprecated Use {@link SelectedArtifactId}. */
  public set selectedArtifactId(value: string | null) {
    this.SelectedArtifactId = value;
  }
  public SelectedVersionNumber: number | undefined = undefined;

  /** @deprecated Use {@link SelectedVersionNumber}. */
  public get selectedVersionNumber(): number | undefined {
    return this.SelectedVersionNumber;
  }
  /** @deprecated Use {@link SelectedVersionNumber}. */
  public set selectedVersionNumber(value: number | undefined) {
    this.SelectedVersionNumber = value;
  } // Version to show in artifact viewer

  /**
   * Bumped whenever artifacts are MERGED into `artifactsByDetailId` by something other than the
   * turn in flight — today only the scroll-up paging path. A before/after diff spanning such a
   * merge cannot tell an artifact that arrived from an older page from one a run just created, so
   * the baseline records this counter and the decision refuses to infer creations when it moved.
   */
  private artifactMapGeneration = 0;

  /**
   * Bumped whenever the USER changes what the artifact panel is showing (clicks a card, opens one
   * from the modal or a deep link, closes the panel). An agent turn can finish while such a click
   * is in flight — two completion handlers run per turn, each holding its own pre-turn snapshot —
   * and without this the slower one would pull the panel back onto the run's artifact and discard
   * the selection the user just made.
   */
  private artifactSelectionEpoch = 0;
  public ArtifactPaneWidth: number = DEFAULT_ARTIFACT_PANE_WIDTH;

  /** @deprecated Use {@link ArtifactPaneWidth}. */
  public get artifactPaneWidth(): number {
    return this.ArtifactPaneWidth;
  }
  /** @deprecated Use {@link ArtifactPaneWidth}. */
  public set artifactPaneWidth(value: number) {
    this.ArtifactPaneWidth = value;
  }
  public IsArtifactPaneMaximized: boolean = false;

  /** @deprecated Use {@link IsArtifactPaneMaximized}. */
  public get isArtifactPaneMaximized(): boolean {
    return this.IsArtifactPaneMaximized;
  }
  /** @deprecated Use {@link IsArtifactPaneMaximized}. */
  public set isArtifactPaneMaximized(value: boolean) {
    this.IsArtifactPaneMaximized = value;
  } // Track maximize state
  private artifactPaneWidthBeforeMaximize: number = DEFAULT_ARTIFACT_PANE_WIDTH;
  public ExpandedArtifactId: string | null = null;

  /** @deprecated Use {@link ExpandedArtifactId}. */
  public get expandedArtifactId(): string | null {
    return this.ExpandedArtifactId;
  }
  /** @deprecated Use {@link ExpandedArtifactId}. */
  public set expandedArtifactId(value: string | null) {
    this.ExpandedArtifactId = value;
  } // Track which artifact card is expanded in modal
  public ShowCollectionPicker: boolean = false;

  /** @deprecated Use {@link ShowCollectionPicker}. */
  public get showCollectionPicker(): boolean {
    return this.ShowCollectionPicker;
  }
  /** @deprecated Use {@link ShowCollectionPicker}. */
  public set showCollectionPicker(value: boolean) {
    this.ShowCollectionPicker = value;
  }
  public CollectionPickerArtifactId: string | null = null;

  /** @deprecated Use {@link CollectionPickerArtifactId}. */
  public get collectionPickerArtifactId(): string | null {
    return this.CollectionPickerArtifactId;
  }
  /** @deprecated Use {@link CollectionPickerArtifactId}. */
  public set collectionPickerArtifactId(value: string | null) {
    this.CollectionPickerArtifactId = value;
  }
  public CollectionPickerExcludedIds: string[] = [];

  /** @deprecated Use {@link CollectionPickerExcludedIds}. */
  public get collectionPickerExcludedIds(): string[] {
    return this.CollectionPickerExcludedIds;
  }
  /** @deprecated Use {@link CollectionPickerExcludedIds}. */
  public set collectionPickerExcludedIds(value: string[]) {
    this.CollectionPickerExcludedIds = value;
  }
  public CollectionPickerVersionId: string | null = null;

  /** @deprecated Use {@link CollectionPickerVersionId}. */
  public get collectionPickerVersionId(): string | null {
    return this.CollectionPickerVersionId;
  }
  /** @deprecated Use {@link CollectionPickerVersionId}. */
  public set collectionPickerVersionId(value: string | null) {
    this.CollectionPickerVersionId = value;
  }
  public CollectionPickerArtifactName: string = '';

  /** @deprecated Use {@link CollectionPickerArtifactName}. */
  public get collectionPickerArtifactName(): string {
    return this.CollectionPickerArtifactName;
  }
  /** @deprecated Use {@link CollectionPickerArtifactName}. */
  public set collectionPickerArtifactName(value: string) {
    this.CollectionPickerArtifactName = value;
  }
  public CollectionPickerVersionNumber: number | null = null;

  /** @deprecated Use {@link CollectionPickerVersionNumber}. */
  public get collectionPickerVersionNumber(): number | null {
    return this.CollectionPickerVersionNumber;
  }
  /** @deprecated Use {@link CollectionPickerVersionNumber}. */
  public set collectionPickerVersionNumber(value: number | null) {
    this.CollectionPickerVersionNumber = value;
  }

  // Artifact permissions
  public CanShareSelectedArtifact: boolean = false;

  /** @deprecated Use {@link CanShareSelectedArtifact}. */
  public get canShareSelectedArtifact(): boolean {
    return this.CanShareSelectedArtifact;
  }
  /** @deprecated Use {@link CanShareSelectedArtifact}. */
  public set canShareSelectedArtifact(value: boolean) {
    this.CanShareSelectedArtifact = value;
  }
  public CanEditSelectedArtifact: boolean = false;

  /** @deprecated Use {@link CanEditSelectedArtifact}. */
  public get canEditSelectedArtifact(): boolean {
    return this.CanEditSelectedArtifact;
  }
  /** @deprecated Use {@link CanEditSelectedArtifact}. */
  public set canEditSelectedArtifact(value: boolean) {
    this.CanEditSelectedArtifact = value;
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


  // Artifact mapping: ConversationDetailID -> Array of LazyArtifactInfo
  // Uses lazy-loading pattern: display data loaded immediately, full entities on-demand
  // Supports multiple artifacts per conversation detail (0-N relationship)
  public ArtifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  /** @deprecated Use {@link ArtifactsByDetailId}. */
  public get artifactsByDetailId() {
    return this.ArtifactsByDetailId;
  }
  /** @deprecated Use {@link ArtifactsByDetailId}. */
  public set artifactsByDetailId(value) {
    this.ArtifactsByDetailId = value;
  }

  // System artifacts mapping: ConversationDetailID -> Array of LazyArtifactInfo (Visibility='System Only')
  // Kept separate so we can toggle their display without reloading
  // Made public so it can be passed to MessageInputComponent for payload loading
  public SystemArtifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  /** @deprecated Use {@link SystemArtifactsByDetailId}. */
  public get systemArtifactsByDetailId() {
    return this.SystemArtifactsByDetailId;
  }
  /** @deprecated Use {@link SystemArtifactsByDetailId}. */
  public set systemArtifactsByDetailId(value) {
    this.SystemArtifactsByDetailId = value;
  }

  // Cached combined artifacts map - updated when toggle changes
  private _combinedArtifactsMap: Map<string, LazyArtifactInfo[]> | null = null;

  // Agent run mapping: ConversationDetailID -> MJAIAgentRunEntityExtended
  // Loaded once per conversation and kept in sync as new runs are created
  public AgentRunsByDetailId = new Map<string, MJAIAgentRunEntityExtended>();

  /** @deprecated Use {@link AgentRunsByDetailId}. */
  public get agentRunsByDetailId() {
    return this.AgentRunsByDetailId;
  }
  /** @deprecated Use {@link AgentRunsByDetailId}. */
  public set agentRunsByDetailId(value) {
    this.AgentRunsByDetailId = value;
  }

  /**
   * Ratings by conversation detail ID (parsed from RatingsJSON)
   */
  public RatingsByDetailId = new Map<string, RatingJSON[]>();

  /** @deprecated Use {@link RatingsByDetailId}. */
  public get ratingsByDetailId() {
    return this.RatingsByDetailId;
  }
  /** @deprecated Use {@link RatingsByDetailId}. */
  public set ratingsByDetailId(value) {
    this.RatingsByDetailId = value;
  }

  /**
   * Attachments by conversation detail ID (loaded from ConversationDetailAttachments)
   */
  public AttachmentsByDetailId = new Map<string, MessageAttachment[]>();

  /** @deprecated Use {@link AttachmentsByDetailId}. */
  public get attachmentsByDetailId() {
    return this.AttachmentsByDetailId;
  }
  /** @deprecated Use {@link AttachmentsByDetailId}. */
  public set attachmentsByDetailId(value) {
    this.AttachmentsByDetailId = value;
  }

  /**
   * In-progress message IDs for streaming reconnection
   * Passed to message-input component to reconnect PubSub updates
   */
  public InProgressMessageIds: string[] = [];

  /** @deprecated Use {@link InProgressMessageIds}. */
  public get inProgressMessageIds(): string[] {
    return this.InProgressMessageIds;
  }
  /** @deprecated Use {@link InProgressMessageIds}. */
  public set inProgressMessageIds(value: string[]) {
    this.InProgressMessageIds = value;
  }

  // Subject for cleanup on destroy
  private destroy$ = new Subject<void>();

  // Cache of message-input metadata for rendering multiple instances
  // Prevents destruction/recreation when switching conversations for performance
  private messageInputMetadataCache = new Map<string, {conversationId: string; conversationName: string | null}>();

  // Empty collections for hidden message-input components
  public readonly EmptyArtifactsMap = new Map<string, LazyArtifactInfo[]>();

  /** @deprecated Use {@link EmptyArtifactsMap}. */
  public get emptyArtifactsMap() {
    return this.EmptyArtifactsMap;
  }
  public readonly EmptyAgentRunsMap = new Map<string, MJAIAgentRunEntityExtended>();

  /** @deprecated Use {@link EmptyAgentRunsMap}. */
  public get emptyAgentRunsMap() {
    return this.EmptyAgentRunsMap;
  }
  public readonly EmptyInProgressIds: string[] = [];

  /** @deprecated Use {@link EmptyInProgressIds}. */
  public get emptyInProgressIds(): string[] {
    return this.EmptyInProgressIds;
  }

  // Loading state for peripheral data
  public IsLoadingPeripheralData: boolean = false;

  /** @deprecated Use {@link IsLoadingPeripheralData}. */
  public get isLoadingPeripheralData(): boolean {
    return this.IsLoadingPeripheralData;
  }
  /** @deprecated Use {@link IsLoadingPeripheralData}. */
  public set isLoadingPeripheralData(value: boolean) {
    this.IsLoadingPeripheralData = value;
  }

  // Subject to trigger artifact viewer refresh when new version is created
  public ArtifactViewerRefresh$ = new Subject<{artifactId: string; versionNumber: number}>();

  /** @deprecated Use {@link ArtifactViewerRefresh$}. */
  public get artifactViewerRefresh$() {
    return this.ArtifactViewerRefresh$;
  }
  /** @deprecated Use {@link ArtifactViewerRefresh$}. */
  public set artifactViewerRefresh$(value) {
    this.ArtifactViewerRefresh$ = value;
  }

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
  public ShowPinsPanel: boolean = false;

  /** @deprecated Use {@link ShowPinsPanel}. */
  public get showPinsPanel(): boolean {
    return this.ShowPinsPanel;
  }
  /** @deprecated Use {@link ShowPinsPanel}. */
  public set showPinsPanel(value: boolean) {
    this.ShowPinsPanel = value;
  }

  /** True once the pin ENTITIES are loaded. The COUNT is known from conversation open. */
  private pinsHydrated = false;

  /** Spinner state for the panel's first open — the rows now arrive after the panel does. */
  public IsLoadingPins = false;

  /** @deprecated Use {@link IsLoadingPins}. */
  public get isLoadingPins() {
    return this.IsLoadingPins;
  }
  /** @deprecated Use {@link IsLoadingPins}. */
  public set isLoadingPins(value) {
    this.IsLoadingPins = value;
  }

  /**
   * TRUE pin count for the chip. Deliberately NOT `pinnedMessages.length`, which is 0 until
   * the panel has been opened and would hide the chip on a conversation full of pins.
   */
  get PinnedMessageCount(): number {
    return this.windowStore.PinnedTotalCount;
  }

  /** @deprecated Use {@link PinnedMessageCount}. */
  get pinnedMessageCount(): number {
    return this.PinnedMessageCount;
  }

  /**
   * Opens/closes the pins panel, hydrating its rows on first open.
   *
   * Lazy on purpose: the panel is closed by default, so loading pin entities during
   * conversation open costs every user for a panel most never open.
   */
  public async TogglePinsPanel(): Promise<void> {
    this.ShowPinsPanel = !this.ShowPinsPanel;
    if (this.ShowPinsPanel && !this.pinsHydrated && this.ConversationId) {
      this.IsLoadingPins = true;
      this.cdr.detectChanges();
      try {
        await this.hydratePinnedMessages(this.ConversationId);
      } finally {
        this.IsLoadingPins = false;
      }
    }
    this.cdr.detectChanges();
  }

  /**
   * All currently pinned messages in the active conversation, newest pin first.
   *
   * Read from the window store's separate pin set, NOT filtered out of `messages` — a pin
   * older than the loaded window would otherwise vanish from the panel. Loaded by its own
   * `IsPinned=1` query in {@link loadMessages}, already ordered `Sequence DESC`.
   *
   * This and the three getters around it are TEMPLATE-BOUND, so they run on every change
   * detection cycle. They read the store's cheap single-value accessors rather than
   * `GetSnapshot()`, which copies the whole loaded window on every call — four of those per
   * cycle, during streaming per token, is exactly the length-proportional work this feature
   * exists to remove.
   */
  get PinnedMessages(): readonly MJConversationDetailEntity[] {
    return this.windowStore.PinnedDetails;
  }

  /** @deprecated Use {@link PinnedMessages}. */
  get pinnedMessages(): readonly MJConversationDetailEntity[] {
    return this.PinnedMessages;
  }

  /** True when older transcript pages remain above the loaded window (drives the sentinel). */
  get HasMoreMessagesAbove(): boolean {
    return this.windowStore.HasMoreAbove;
  }

  /** @deprecated Use {@link HasMoreMessagesAbove}. */
  get hasMoreMessagesAbove(): boolean {
    return this.HasMoreMessagesAbove;
  }

  /** True while an older transcript page is being fetched. */
  get IsLoadingOlderMessages(): boolean {
    return this.windowStore.IsLoadingOlder;
  }

  /** @deprecated Use {@link IsLoadingOlderMessages}. */
  get isLoadingOlderMessages(): boolean {
    return this.IsLoadingOlderMessages;
  }

  /**
   * The transcript list — needed so a date jump can scroll AFTER this component has finished
   * paging older history. The list owns the scroll; this component owns the window.
   */
  @ViewChild(MessageListComponent) private messageListComponent?: MessageListComponent;

  /**
   * The element that actually scrolls the transcript, handed to the message list so its
   * "earlier messages" observer has a correct root.
   *
   * The list's own container does not scroll — this one carries the `overflow-y: auto` and
   * `min-height: 0` that make it a real scroller. Passing it down beats having the list
   * discover it, which depends on layout having settled.
   */
  public get MessageScrollRoot(): HTMLElement | null {
    return this.scrollContainer?.nativeElement ?? null;
  }

  /** @deprecated Use {@link MessageScrollRoot}. */
  public get messageScrollRoot(): HTMLElement | null {
    return this.MessageScrollRoot;
  }

  /**
   * Loads the next older page — fired by the message list's "earlier messages" sentinel.
   *
   * `LoadOlder` already no-ops when nothing is above or a load is in flight, so repeated
   * observer fires during a fast scroll are harmless. `messages` is reassigned to a NEW
   * array so the list's ngOnChanges runs; the list then detects the prepend and holds the
   * user's scroll position rather than jumping.
   */
  public async OnOlderMessagesRequested(): Promise<void> {
    const conversationId = this.ConversationId;
    await this.windowStore.LoadOlder(this.CurrentUser);
    if (!this.isActiveConversation(conversationId)) {
      return;
    }
    await this.refreshAfterPaging(conversationId!);
  }

  /** @deprecated Use {@link OnOlderMessagesRequested}. */
  public async onOlderMessagesRequested(): Promise<void> {
    return this.OnOlderMessagesRequested();
  }

  /**
   * Re-renders the transcript after one or more older pages have been merged.
   *
   * Costs proportional to what was ADDED, not to the whole window. It diffs the snapshot
   * against the rows currently rendered and hands only the difference to
   * {@link mergePeripheralsForNewRows} — so ordinary sentinel paging and a 50-page date jump
   * both pay per new row exactly once, and neither re-queries attachments for rows that are
   * already on screen.
   *
   * `this.messages` is assigned ONCE, after the peripherals land. Assigning it before the
   * await would show the rows a beat sooner, but the second assignment then changes bubble
   * heights (artifacts and attachments render) AFTER the list has already restored the
   * scroll position for the prepend — which is a visible jump. One render keeps the
   * measurement the list scrolls to and the content it finally paints in agreement.
   */
  private async refreshAfterPaging(conversationId: string): Promise<void> {
    const snapshot = this.windowStore.GetSnapshot();
    const renderedIds = new Set(this.messages.map(m => NormalizeUUID(m.ID)));
    const newDetails = snapshot.Details.filter(d => !renderedIds.has(NormalizeUUID(d.ID)));

    if (newDetails.length > 0) {
      await this.mergePeripheralsForNewRows(conversationId, snapshot, newDetails);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }
    }

    this.messages = [...snapshot.Details];
    this.cdr.detectChanges();
  }

  /**
   * Pages older history until a date jump can be satisfied, then scrolls to it.
   *
   * Windowing is exactly what broke the old implementation: the transcript no longer holds
   * every day, so "jump to last month" targets messages that are simply not loaded. This
   * pages until the target is in the loaded set, history runs out, or the page cap is hit —
   * and always reports the outcome, because the plan forbids a silent no-op here.
   */
  public async OnDateJumpRequested(period: DateJumpPeriod): Promise<void> {
    const conversationId = this.ConversationId;
    let pagesLoaded = 0;

    // The loop's ONLY job is to load enough history for the jump to be answerable. It does
    // not decide whether the jump succeeded — see CombineDateJumpOutcome.
    while (pagesLoaded < DATE_JUMP_MAX_PAGES) {
      const snapshot = this.windowStore.GetSnapshot();
      const { NeedsOlder } = ResolveDateJumpTarget(snapshot.Details, period, new Date());
      if (!NeedsOlder || !snapshot.Cursor.HasMoreAbove) {
        break;                              // answerable, or no more history to load
      }

      // Store-level paging: the per-page peripheral rebuild is deferred to a single
      // refresh below, so a deep jump costs one rebuild instead of one per page.
      await this.windowStore.LoadOlder(this.CurrentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;                             // user switched away mid-jump
      }
      pagesLoaded++;
    }

    // One rebuild for however many pages arrived, then let it render before measuring.
    if (pagesLoaded > 0) {
      await this.refreshAfterPaging(conversationId!);
    }
    this.cdr.detectChanges();
    const scrollOutcome = this.messageListComponent?.ScrollToDateTarget(period) ?? 'empty';
    const finalOutcome = CombineDateJumpOutcome(scrollOutcome, pagesLoaded >= DATE_JUMP_MAX_PAGES);

    if (finalOutcome !== 'reached') {
      MJNotificationService.Instance.CreateSimpleNotification(
        DescribeDateJumpOutcome(finalOutcome, period), 'info', 3000
      );
    }
  }

  /** @deprecated Use {@link OnDateJumpRequested}. */
  public async onDateJumpRequested(period: DateJumpPeriod): Promise<void> {
    return this.OnDateJumpRequested(period);
  }

  // Test feedback dialog state
  public ShowTestFeedbackDialog: boolean = false;

  /** @deprecated Use {@link ShowTestFeedbackDialog}. */
  public get showTestFeedbackDialog(): boolean {
    return this.ShowTestFeedbackDialog;
  }
  /** @deprecated Use {@link ShowTestFeedbackDialog}. */
  public set showTestFeedbackDialog(value: boolean) {
    this.ShowTestFeedbackDialog = value;
  }
  public TestFeedbackDialogData: TestFeedbackDialogData | null = null;

  /** @deprecated Use {@link TestFeedbackDialogData}. */
  public get testFeedbackDialogData(): TestFeedbackDialogData | null {
    return this.TestFeedbackDialogData;
  }
  /** @deprecated Use {@link TestFeedbackDialogData}. */
  public set testFeedbackDialogData(value: TestFeedbackDialogData | null) {
    this.TestFeedbackDialogData = value;
  }

  // Image viewer state
  public ShowImageViewer: boolean = false;

  /** @deprecated Use {@link ShowImageViewer}. */
  public get showImageViewer(): boolean {
    return this.ShowImageViewer;
  }
  /** @deprecated Use {@link ShowImageViewer}. */
  public set showImageViewer(value: boolean) {
    this.ShowImageViewer = value;
  }
  public SelectedImageUrl: string = '';

  /** @deprecated Use {@link SelectedImageUrl}. */
  public get selectedImageUrl(): string {
    return this.SelectedImageUrl;
  }
  /** @deprecated Use {@link SelectedImageUrl}. */
  public set selectedImageUrl(value: string) {
    this.SelectedImageUrl = value;
  }
  public SelectedImageAlt: string = '';

  /** @deprecated Use {@link SelectedImageAlt}. */
  public get selectedImageAlt(): string {
    return this.SelectedImageAlt;
  }
  /** @deprecated Use {@link SelectedImageAlt}. */
  public set selectedImageAlt(value: string) {
    this.SelectedImageAlt = value;
  }
  public SelectedImageFileName: string = '';

  /** @deprecated Use {@link SelectedImageFileName}. */
  public get selectedImageFileName(): string {
    return this.SelectedImageFileName;
  }
  /** @deprecated Use {@link SelectedImageFileName}. */
  public set selectedImageFileName(value: string) {
    this.SelectedImageFileName = value;
  }

  // Upload indicator state (shown centered in conversation area)
  public IsUploadingAttachments: boolean = false;

  /** @deprecated Use {@link IsUploadingAttachments}. */
  public get isUploadingAttachments(): boolean {
    return this.IsUploadingAttachments;
  }
  /** @deprecated Use {@link IsUploadingAttachments}. */
  public set isUploadingAttachments(value: boolean) {
    this.IsUploadingAttachments = value;
  }
  public UploadingMessage: string = '';

  /** @deprecated Use {@link UploadingMessage}. */
  public get uploadingMessage(): string {
    return this.UploadingMessage;
  }
  /** @deprecated Use {@link UploadingMessage}. */
  public set uploadingMessage(value: string) {
    this.UploadingMessage = value;
  }

  // Attachment support based on agent modalities
  // Computed from conversation manager (Sage) and any previous agent in conversation
  public EnableAttachments: boolean = false;

  /** @deprecated Use {@link EnableAttachments}. */
  public get enableAttachments(): boolean {
    return this.EnableAttachments;
  }
  /** @deprecated Use {@link EnableAttachments}. */
  public set enableAttachments(value: boolean) {
    this.EnableAttachments = value;
  }
  public MaxAttachments: number = 10;

  /** @deprecated Use {@link MaxAttachments}. */
  public get maxAttachments(): number {
    return this.MaxAttachments;
  }
  /** @deprecated Use {@link MaxAttachments}. */
  public set maxAttachments(value: number) {
    this.MaxAttachments = value;
  }
  public MaxAttachmentSizeBytes: number = 20 * 1024 * 1024;

  /** @deprecated Use {@link MaxAttachmentSizeBytes}. */
  public get maxAttachmentSizeBytes(): number {
    return this.MaxAttachmentSizeBytes;
  }
  /** @deprecated Use {@link MaxAttachmentSizeBytes}. */
  public set maxAttachmentSizeBytes(value: number) {
    this.MaxAttachmentSizeBytes = value;
  } // 20MB default
  public AcceptedFileTypes: string = 'image/*';

  /** @deprecated Use {@link AcceptedFileTypes}. */
  public get acceptedFileTypes(): string {
    return this.AcceptedFileTypes;
  }
  /** @deprecated Use {@link AcceptedFileTypes}. */
  public set acceptedFileTypes(value: string) {
    this.AcceptedFileTypes = value;
  }
  private conversationManagerAgent: MJAIAgentEntityExtended | null = null;

  private engine = ConversationEngine.Instance;

  private windowStore = new ConversationDetailWindowStore(ConversationEngine.Instance);


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
  public RealtimeSessionMetaMap: Map<string, RealtimeSessionTimelineMeta> = new Map();

  /** @deprecated Use {@link RealtimeSessionMetaMap}. */
  public get realtimeSessionMetaMap(): Map<string, RealtimeSessionTimelineMeta> {
    return this.RealtimeSessionMetaMap;
  }
  /** @deprecated Use {@link RealtimeSessionMetaMap}. */
  public set realtimeSessionMetaMap(value: Map<string, RealtimeSessionTimelineMeta>) {
    this.RealtimeSessionMetaMap = value;
  }

  /** Agent name the overlay banner shows: the reviewed session's agent while reviewing, else the live call's. */
  public get RealtimeOverlayAgentName(): string {
    if (this.RealtimeReview && !this.RealtimeSession.IsActive) {
      return this.RealtimeReview.AgentName;
    }
    return this.RealtimeSession.CurrentAgentName;
  }

  /** @deprecated Use {@link RealtimeOverlayAgentName}. */
  public get realtimeOverlayAgentName(): string {
    return this.RealtimeOverlayAgentName;
  }

  // Shared AI mention/suggestion engine (BaseSingleton — same instance the composer plugins use)
  private mentionAutocompleteService = MentionAutocompleteService.Instance;

  constructor(
    private agentStateService: AgentStateService,
    private livenessDom: ConversationLivenessDomService,
    private conversationAgentService: ConversationAgentService,
    private activeTasks: ActiveTasksService,
    private cdr: ChangeDetectorRef,
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
          return;
        }
        if (command.type === 'open:resource' && command.resourceType === 'Record' && command.entityName) {
          if (conversationId && !this.isActiveConversation(conversationId)) {
            return;
          }
          this.emitOpenResourceRecord(command);
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
            CurrentUser: this.CurrentUser
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
        this.BeforeToolInvoked.emit(args);
        if (args.Cancel) {
          toolEvent.Cancel = true;
          toolEvent.CancelReason = args.CancelReason;
        }
      });
    this.agentClientService.ToolExecuted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((toolEvent) => {
        this.AfterToolInvoked.emit(
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
            this.SessionStarted.emit(
              new SessionStartedEventArgs(event.sessionId, event.channelKinds)
            );
            return;
          case 'session-channel':
            this.SessionChannelStateChanged.emit(
              new SessionChannelStateChangedEventArgs(
                event.sessionId,
                event.channelKind,
                event.state
              )
            );
            return;
          case 'session-ended':
            this.SessionEnded.emit(
              new SessionEndedEventArgs(event.sessionId, event.reason)
            );
            return;
        }
      });

    // The workspace component initializes AI Engine and mention service before
    // any child components render, so we can safely skip duplicate initialization.
    // This prevents race conditions and ensures agents are fully loaded.

    // Fallback: If workspace didn't initialize (shouldn't happen), initialize now
    if (!this.mentionAutocompleteService.IsInitialized) {
      console.warn('⚠️ Mention autocomplete not initialized by workspace, initializing now...');
      await this.mentionAutocompleteService.initialize(this.CurrentUser);
    }

    // Ensure ConversationEngine and ArtifactMetadataEngine are loaded.
    // Config(false) is a no-op if already loaded by another component.
    // ConversationEngine.Config() also initializes ArtifactMetadataEngine internally.
    await ConversationEngine.Instance.Config(false, this.CurrentUser);

    // Initialize attachment support based on agent modalities
    await this.initializeAttachmentSupport();

    // Load saved artifact pane width
    this.loadArtifactPaneWidth();

    // Mark as initialized so setter can trigger conversation changes
    this.isInitialized = true;

    // Initial load if there's already an active conversation
    if (this.ConversationId) {
      await this.onConversationChanged(this.ConversationId);
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
        const conversationId = this.ConversationId;
        const message = this.messages.find(m => UUIDsEqual(m.ID, event.conversationDetailId));
        if (message && conversationId) {
          await this.handleMessageCompletion(message, event.agentRunId, conversationId);
        } else if (conversationId) {
          // The completion is for a message we do not currently hold — it belongs to another
          // conversation, or to one scrolled out of the loaded window. Previously this event was
          // simply dropped, and for the scrolled-out case nothing else ever picked it up: the
          // `recentCompletions` replay only fires on conversation OPEN. Reconciling reads durable
          // state for every in-progress message we do hold, which repairs it if it is ours and
          // costs one narrow query if it is not.
          await this.ReconcileNow('completion-for-unloaded-message');
        }
      });

    // Reconciliation triggers that do NOT depend on a clean socket close. This is the
    // independent second layer: `retryAttempts`, `_socketStateSubject`,
    // `ServerConnectivityService`, `scheduleReconnection()` and `FireAndForgetHelper.onStreamEnd`
    // are all downstream of `on('closed')`, so on a half-open socket they fail together. The
    // supervisor coalesces socket-reconnect, stream-reconnect, tab-visible and browser-online
    // into one pass (MJ #4222).
    this.livenessDom.Start();
    ConversationsRuntime.Instance.Liveness.ReconciliationRequired$
      .pipe(takeUntil(this.destroy$))
      .subscribe((reason) => {
        void this.ReconcileNow(reason);
      });

    // Subscribe to polling-based agent state as a secondary fallback for completion detection.
    // The sessionId is persisted in localStorage and reused on refresh, so WebSocket events
    // normally arrive correctly. However, there's a brief timing gap between page load and
    // WebSocket reconnection where events can be lost. The catch-up check in
    // detectAndReconcileAgentRuns() is the primary fallback; polling is the last resort.
    this.agentStateService.activeAgents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (agents) => {
        const conversationId = this.ConversationId;
        if (!conversationId) return;
        const conversationAgents = agents.filter(a => UUIDsEqual(a.run.ConversationID, conversationId));
        const hasActiveAgents = conversationAgents.length > 0;
        if (this.hadActiveAgents && !hasActiveAgents) {
          // Agents just completed — refresh the NEWEST window page to pick up new messages,
          // updated agent runs, and new artifacts. Deliberately not the engine's full-history
          // RefreshConversationDetails: that would re-query the whole conversation and, via
          // GetCachedDetails, replace the loaded window with every row.
          await this.windowStore.RefreshLatest(this.CurrentUser);
          if (!this.isActiveConversation(conversationId)) {
            return;
          }

          const refreshed = this.windowStore.GetSnapshot();
          this.messages = refreshed.Details;

          // Reprocess peripheral data (artifacts, ratings) from the refreshed window
          this.lastLoadedConversationId = null;
          await this.loadPeripheralData(conversationId, refreshed);
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
        this.EnableAttachments = limits.enabled;
        this.MaxAttachments = limits.maxAttachments;
        this.MaxAttachmentSizeBytes = limits.maxAttachmentSizeBytes;
        this.AcceptedFileTypes = limits.acceptedFileTypes;
        LogStatusEx({message: `Attachment support initialized: ${this.EnableAttachments} (max ${this.MaxAttachments}, ${(this.MaxAttachmentSizeBytes / 1024 / 1024).toFixed(0)}MB)`, verboseOnly: true});
      } else {
        // Default to false if we can't determine
        this.EnableAttachments = false;
        LogStatusEx({message: 'Attachment support disabled: conversation manager agent not available', verboseOnly: true});
      }
    } catch (error) {
      console.warn('Failed to initialize attachment support:', error);
      this.EnableAttachments = false;
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
      this.EnableAttachments = limits.enabled;
      this.MaxAttachments = limits.maxAttachments;
      this.MaxAttachmentSizeBytes = limits.maxAttachmentSizeBytes;
      this.AcceptedFileTypes = limits.acceptedFileTypes;
    } else {
      this.EnableAttachments = false;
    }
  }

  ngAfterViewChecked() {
    if (this.scrollToBottom) {
      this.scrollToBottom = false;
      setTimeout(() => {
        if (Date.now() < this.bottomFollowSuppressedUntil) {
          return;
        }
        this.ScrollToBottomNow();
        // Check scroll state after scrolling to bottom
        this.CheckScroll();
      }, 100);
    }
    if (this.pendingTurnStartMessageId) {
      const messageId = this.pendingTurnStartMessageId;
      this.pendingTurnStartMessageId = null;
      // Deferred for the same reason checkScroll() is not called synchronously below.
      setTimeout(() => this.scrollTurnToTop(messageId), 0);
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

    this.clearTurnTracking();

    // Remove resize listeners
    window.removeEventListener('mousemove', this.boundOnResizeMove);
    window.removeEventListener('mouseup', this.boundOnResizeEnd);
    window.removeEventListener('touchmove', this.boundOnResizeTouchMove);
    window.removeEventListener('touchend', this.boundOnResizeTouchEnd);
  }

  private isActiveConversation(conversationId: string | null | undefined): boolean {
    return UUIDsEqual(conversationId, this.ConversationId);
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
    this.clearTurnTracking();
    this.ShowArtifactPanel = false;
    this.SelectedArtifactId = null;
    this.SelectedVersionNumber = undefined;
    this.CanShareSelectedArtifact = false;
    this.CanEditSelectedArtifact = false;
    this.ShowArtifactsModal = false;
    this.ShowSystemArtifacts = false;
    this.ExpandedArtifactId = null;
    this._combinedArtifactsMap = null;

    this.IsArtifactShareModalOpen = false;
    this.ArtifactToShare = null;
    this.ShowCollectionPicker = false;
    this.CollectionPickerArtifactId = null;
    this.CollectionPickerExcludedIds = [];
    this.CollectionPickerVersionId = null;
    this.CollectionPickerArtifactName = '';
    this.CollectionPickerVersionNumber = null;

    this.ShowImageViewer = false;
    this.SelectedImageUrl = '';
    this.SelectedImageAlt = '';
    this.SelectedImageFileName = '';
    this.ShowTestFeedbackDialog = false;
    this.TestFeedbackDialogData = null;
    this.ShowPinsPanel = false;
    this.pinsHydrated = false;
    this.ShowAgentPanel = false;
    this.ShowExportModal = false;
    this.ShowShareModal = false;
    this.ShareContext = null;
    this.ShowMembersModal = false;
    this.ShowProjectSelector = false;
    this.IsUploadingAttachments = false;
    this.UploadingMessage = '';
    this.intentCheckMessage = null;

    // Reset width along with the flag — otherwise a pane maximized in the
    // previous conversation leaves artifactPaneWidth at 100, and the next
    // artifact opens overflowing the viewport (chat area still visible).
    // Guarded so a non-maximized user-dragged width survives the switch.
    if (this.IsArtifactPaneMaximized) {
      this.resetArtifactPaneSizing();
    }
  }

  private resetArtifactPaneSizing(): void {
    this.IsArtifactPaneMaximized = false;
    this.ArtifactPaneWidth = DEFAULT_ARTIFACT_PANE_WIDTH;
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
          conversationName: this.Conversation?.Name || null
        });
      }

      // Only show loading spinner if the engine doesn't have cached data for this conversation.
      // This prevents the "no messages" flash when switching between conversations.
      const hasCachedMessages = this.engine.HasCachedDetails(conversationId);
      if (!hasCachedMessages) {
        this.IsLoadingConversation = true;
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
        this.agentStateService.startPolling(this.CurrentUser, conversationId);
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
        this.IsLoadingConversation = false;

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
      this.IsLoadingConversation = false;
      this.currentlyLoadingConversationId = null;
      this.lastLoadedConversationId = null;
      this.agentStateService.stopPolling();
    }
  }

  /**
   * Returns array of cached message-input metadata for rendering
   * This allows multiple message-input components to exist simultaneously (hidden)
   * preserving their state when switching conversations
   */
  public GetCachedInputs(): Array<{conversationId: string; conversationName: string | null}> {
    return Array.from(this.messageInputMetadataCache.values());
  }

  /** @deprecated Use {@link GetCachedInputs}. */
  public getCachedInputs(): Array<{conversationId: string; conversationName: string | null}> {
    return this.GetCachedInputs();
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
    if (!this.messageInputComponents || !this.ConversationId) {
      return undefined;
    }
    return this.messageInputComponents.find(
      component => component.conversationId === this.ConversationId
    );
  }

  private async loadMessages(conversationId: string, loadToken: number): Promise<void> {
    try {
      // WINDOWED read: only the newest page of the transcript, not the whole conversation.
      // The store owns the loaded window and its paging cursors; the engine's full-history
      // LoadConversationDetails stays untouched for agent/server callers. There is no
      // forceRefresh here — a window is always fetched fresh, so no cache can go stale.
      //
      // DELIBERATE TRADE, both directions. The path this replaced went through
      // LoadConversationDetails, which cached per conversation id in the engine's
      // `_detailCache` — so re-entering a conversation you had already opened was instant
      // with zero database work. `LoadLatest` always fetches, so every re-entry now costs a
      // window read plus the follow-ups in LoadDetailWindow's round-trip profile. For a user
      // tabbing between a handful of conversations that is a REGRESSION against the old
      // behaviour, on a change whose headline is that opening a conversation got cheaper.
      //
      // Accepted for now because the win it buys is unbounded (first open no longer scales
      // with conversation length) and the loss is bounded (a fixed handful of queries), and
      // because the obvious remedy — caching partial windows — is exactly the thing that must
      // never leak into `_detailCache`, where `GetAgentContextWindow` would read it as
      // complete history. A separate `_partialDetailCache` is the shape to reach for if
      // measurement says re-entry is worth it. Measure before building it.
      // Pins are counted separately: a pin can sit far below the window's oldest Sequence,
      // and the pins panel must list ALL of them, not just the ones currently on screen.
      // Concurrent with the window — the two share only the conversation id, and running the
      // pin read after the window made it delay first paint for no reason.
      await Promise.all([
        this.windowStore.LoadLatest(conversationId, this.CurrentUser),
        this.loadPinnedMessageCount(conversationId, loadToken)
      ]);
      if (!this.isActiveConversationLoad(conversationId, loadToken)) {
        return;
      }

      // Read the loaded window back off the store
      const snapshot = this.windowStore.GetSnapshot();
      this.messages = snapshot.Details;

      // Copy user avatars from the window result
      this.UserAvatarMap.clear();
      for (const [userId, avatar] of snapshot.UserAvatars) {
        this.UserAvatarMap.set(userId, {
          imageUrl: avatar.ImageURL,
          iconClass: avatar.IconClass
        });
      }

      this.updateAttachmentSupport();

      // Detect in-progress messages for streaming reconnection
      this.InProgressMessageIds = [...this.messages
        .filter(m => m.Status === 'In-Progress')
        .map(m => m.ID)];

      if (this.InProgressMessageIds.length > 0) {
        LogStatusEx({message: `🔌 Detected ${this.InProgressMessageIds.length} in-progress messages for reconnection`, verboseOnly: true});
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

      this.followTranscript('load');

      // Process peripheral data (agent runs, artifacts, ratings, attachments) from engine cache
      await this.loadPeripheralData(conversationId, snapshot, loadToken);
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
   * Reads only the PIN COUNT on conversation open.
   *
   * `count_only` returns no rows at all — the chip needs a number, and the panel needs
   * nothing until it is opened. Hydrating every pin here put an unbounded `entity_object`
   * read on the critical path of a change whose whole point is a bounded open, and because
   * it was awaited AFTER the window load it also delayed first paint.
   *
   * The entities load in {@link hydratePinnedMessages}, on first panel open.
   */
  private async loadPinnedMessageCount(conversationId: string, loadToken: number): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJConversationDetailEntity>({
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `ConversationID='${conversationId}' AND IsPinned=1`,
      ResultType: 'count_only'
    }, this.CurrentUser);

    if (!this.isActiveConversationLoad(conversationId, loadToken)) {
      return;
    }
    this.windowStore.SetPinnedCount(result.Success ? result.TotalRowCount : 0);
  }

  /**
   * Hydrates the pins panel's rows — first panel open only.
   *
   * Deliberately unbounded: the panel's contract is that it lists EVERY pin, including ones
   * below the loaded window, and by this point the user has explicitly asked for them.
   *
   * `entity_object` is required, not incidental — {@link onUnpinFromPanel} mutates `IsPinned`
   * and calls `.Save()` on these instances directly, so `'simple'` would break unpinning
   * from the panel with no error at all.
   */
  private async hydratePinnedMessages(conversationId: string): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJConversationDetailEntity>({
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `ConversationID='${conversationId}' AND IsPinned=1`,
      OrderBy: 'Sequence DESC',   // newest pin first — the panel's order
      ResultType: 'entity_object'
    }, this.CurrentUser);

    if (!this.isActiveConversation(conversationId)) {
      return;
    }
    if (!result.Success) {
      console.error('Failed to load pinned messages:', result.ErrorMessage);
      return;   // keep the count — the chip stays honest even though the panel is empty
    }
    this.windowStore.SetPinnedDetails(result.Results ?? []);
    this.pinsHydrated = true;
  }


  /**
   * Reshapes one detail's artifacts into the UI's `LazyArtifactInfo` lists, splitting the
   * system-only ones out. Shared by the full rebuild and the incremental prepend so the two
   * can never disagree about how an artifact becomes a card.
   */
  private applyArtifactsForDetail(detailId: string, artifacts: ArtifactJSON[]): void {
    const artifactList: LazyArtifactInfo[] = [];
    const systemArtifactList: LazyArtifactInfo[] = [];

    for (const artifactData of artifacts) {
      const lazyInfo = new LazyArtifactInfo(artifactData, this.CurrentUser);
      if (artifactData.Visibility === 'System Only') {
        systemArtifactList.push(lazyInfo);
      } else {
        artifactList.push(lazyInfo);
      }
    }

    if (artifactList.length > 0) {
      this.ArtifactsByDetailId.set(detailId, artifactList);
    }
    if (systemArtifactList.length > 0) {
      this.SystemArtifactsByDetailId.set(detailId, systemArtifactList);
    }
  }

  /**
   * Extends the display maps with JUST the rows a prepend added.
   *
   * The counterpart to {@link loadPeripheralData}, which clears and rebuilds all four maps
   * over the whole accumulated window, re-queries attachments for every loaded id, and
   * re-allocates every `LazyArtifactInfo`. Paying that per page makes ordinary scroll-up
   * paging quadratic — ten pages back re-queries attachments for roughly fifty-five pages'
   * worth of ids — which, stacked on the per-page round trips documented on
   * `LoadDetailWindow`, ends up costing more than the single full load this feature replaced.
   *
   * Everything here is scoped to `newDetails`, so the cost is proportional to the PAGE. The
   * store already accumulates peripherals correctly across pages, so the snapshot's maps are
   * read only at the new ids.
   *
   * @param newDetails - Rows present in the snapshot that were not already rendered
   */
  private async mergePeripheralsForNewRows(
    conversationId: string,
    snapshot: ConversationDetailWindowSnapshot,
    newDetails: MJConversationDetailEntity[]
  ): Promise<void> {
    const newIds = newDetails.map(d => d.ID).filter((id): id is string => !!id);

    // Merge, never clear — the rows already on screen keep the peripherals they were
    // rendered with.
    for (const detailId of newIds) {
      const agentRun = snapshot.AgentRunsByDetailId.get(detailId);
      if (agentRun) {
        this.AgentRunsByDetailId.set(detailId, agentRun as MJAIAgentRunEntityExtended);
      }
      const artifacts = snapshot.ArtifactsByDetailId.get(detailId);
      if (artifacts) {
        this.applyArtifactsForDetail(detailId, artifacts);
      }
      const ratings = snapshot.RatingsByDetailId.get(detailId);
      if (ratings) {
        this.RatingsByDetailId.set(detailId, ratings);
      }
    }

    if (newIds.length > 0) {
      const attachmentsMap = await this.attachmentService.loadAttachmentsForMessages(newIds, this.CurrentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }
      for (const [detailId, attachments] of attachmentsMap) {
        this.AttachmentsByDetailId.set(detailId, attachments);
      }
    }

    // Session meta MERGES here rather than replacing: an older page's sessions are additional
    // cards, and replacing would strip the status chips off the ones already rendered.
    const sessionMeta = await this.fetchRealtimeSessionMeta(newDetails, conversationId);
    if (sessionMeta === null) {
      return;
    }
    if (sessionMeta.size > 0) {
      this.RealtimeSessionMetaMap = new Map([...this.RealtimeSessionMetaMap, ...sessionMeta]);
    }

    // A page of OLDER artifacts just entered the map. Any artifact-panel baseline taken before
    // this point can no longer be diffed against the map for creations — these arrived from
    // history, not from a run. See snapshotArtifactPanelBaseline.
    this.artifactMapGeneration++;

    // New references so the message list's ngOnChanges sees the extended maps.
    this.AgentRunsByDetailId = new Map(this.AgentRunsByDetailId);
    this.ArtifactsByDetailId = new Map(this.ArtifactsByDetailId);
    this.RatingsByDetailId = new Map(this.RatingsByDetailId);
    this.SystemArtifactsByDetailId = new Map(this.SystemArtifactsByDetailId);
    this.AttachmentsByDetailId = new Map(this.AttachmentsByDetailId);

    this._combinedArtifactsMap = null;
    this.ArtifactCount = this.calculateUniqueArtifactCount();
    this.updateArtifactCountDisplay();
  }

  /**
   * Builds the display maps (agent runs, artifacts, ratings) for the LOADED WINDOW.
   *
   * The peripherals arrive with the window itself — `ConversationEngine.LoadDetailWindow`
   * batches them in one `RunViews` scoped to the window's detail IDs — so this method only
   * reshapes them for the UI and issues no queries of its own.
   *
   * @param snapshot - The loaded window, from `windowStore.GetSnapshot()`. Passed in rather
   *   than read from the engine's `_detailCache`, which the windowed path never populates.
   */
  private async loadPeripheralData(
    conversationId: string,
    snapshot: ConversationDetailWindowSnapshot,
    loadToken?: number
  ): Promise<void> {
    if (!this.isCurrentConversationContext(conversationId, loadToken)) {
      return;
    }

    // Skip if we've already processed peripheral data for this conversation.
    // NOTE (Phase 5): paging up loads OLDER rows with their own peripherals — this guard
    // must not block that refresh once the sentinel lands.
    if (this.lastLoadedConversationId === conversationId) {
      return;
    }

    try {
      const cacheEntry = snapshot;

      // Clear and rebuild component maps from the window's peripherals
      this.AgentRunsByDetailId.clear();
      this.ArtifactsByDetailId.clear();
      this.SystemArtifactsByDetailId.clear();
      this.RatingsByDetailId.clear();

      // Copy agent runs from engine (cast to extended type for UI compatibility)
      for (const [detailId, agentRun] of cacheEntry.AgentRunsByDetailId) {
        this.AgentRunsByDetailId.set(detailId, agentRun as MJAIAgentRunEntityExtended);
      }

      // Convert ArtifactJSON[] from engine cache into LazyArtifactInfo[] for UI
      for (const [detailId, artifacts] of cacheEntry.ArtifactsByDetailId) {
        this.applyArtifactsForDetail(detailId, artifacts);
      }

      // Copy ratings from engine cache
      for (const [detailId, ratings] of cacheEntry.RatingsByDetailId) {
        this.RatingsByDetailId.set(detailId, ratings);
      }

      // Load attachments (still separate — not part of GetConversationComplete query)
      this.AttachmentsByDetailId.clear();
      const messageIds = cacheEntry.Details.map(d => d.ID).filter((id): id is string => !!id);
      if (messageIds.length > 0) {
        const attachmentsMap = await this.attachmentService.loadAttachmentsForMessages(messageIds, this.CurrentUser);
        if (!this.isCurrentConversationContext(conversationId, loadToken)) {
          return;
        }
        for (const [detailId, attachments] of attachmentsMap) {
          this.AttachmentsByDetailId.set(detailId, attachments);
        }
      }

      // Load session-row meta for any realtime SESSION BLOCKS in the timeline
      // (agent name + status/close-reason chip on the collapsed session cards)
      await this.loadRealtimeSessionMeta(cacheEntry.Details, conversationId, loadToken);
      if (!this.isCurrentConversationContext(conversationId, loadToken)) {
        return;
      }

      // Create new Map references to trigger Angular change detection
      this.AgentRunsByDetailId = new Map(this.AgentRunsByDetailId);
      this.ArtifactsByDetailId = new Map(this.ArtifactsByDetailId);
      this.RatingsByDetailId = new Map(this.RatingsByDetailId);
      this.SystemArtifactsByDetailId = new Map(this.SystemArtifactsByDetailId);
      this.AttachmentsByDetailId = new Map(this.AttachmentsByDetailId);

      // Clear combined cache since we loaded new artifacts
      this._combinedArtifactsMap = null;

      // Update artifact count for header display
      this.ArtifactCount = this.calculateUniqueArtifactCount();
      this.updateArtifactCountDisplay();

      this.lastLoadedConversationId = conversationId;

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
    const metaMap = await this.fetchRealtimeSessionMeta(details, conversationId, loadToken);
    if (metaMap === null) {
      return;                 // stale load — the conversation changed underneath
    }
    // New reference so the message list's ngOnChanges sees the update
    this.RealtimeSessionMetaMap = metaMap;
  }

  /**
   * Reads the session rows for `details` and returns them, WITHOUT deciding what happens to
   * the component's map.
   *
   * Split from {@link loadRealtimeSessionMeta} because the two callers want opposite
   * policies: a full (re)load replaces the map, while prepending an older page must merge —
   * replacing there would strip the status chips off every session card already on screen.
   *
   * @returns The fetched meta, or null when the conversation changed mid-read.
   */
  private async fetchRealtimeSessionMeta(
    details: MJConversationDetailEntity[],
    conversationId?: string,
    loadToken?: number
  ): Promise<Map<string, RealtimeSessionTimelineMeta> | null> {
    // Collecting the ids and mapping the rows both live in the runtime, so the React Native thread
    // keys its map the same way (NormalizeUUID) and parses ClosedAt the same way. The query itself
    // stays here — it is the one part that is genuinely host-specific.
    const sessionIds = CollectRealtimeSessionIDs(details);

    let metaMap = new Map<string, RealtimeSessionTimelineMeta>();
    if (sessionIds.length > 0) {
      try {
        const idList = sessionIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<RealtimeSessionMetaRow>({
          EntityName: 'MJ: AI Agent Sessions',
          ExtraFilter: `ID IN (${idList})`,
          Fields: [...REALTIME_SESSION_META_FIELDS],
          ResultType: 'simple'
        });
        if (result.Success) {
          metaMap = MapRealtimeSessionMeta(result.Results);
        }
      } catch (error) {
        console.warn('Failed to load realtime session meta — session cards render without status chips:', error);
      }
    }
    if (conversationId && !this.isCurrentConversationContext(conversationId, loadToken)) {
      return null;
    }
    return metaMap;
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

  async OnMessageSent(message: MJConversationDetailEntity): Promise<void> {
    // The draft became a message — remove it from the persisted map + snapshot.
    const sentKey = (message.ConversationID ?? this.ConversationId ?? '').trim().toLowerCase();
    this.draftStore.ClearDraft(message.ConversationID ?? this.ConversationId);
    if (sentKey) {
      this.initialDraftSnapshots.delete(sentKey);
    }
    if (this.PendingMessage && this.isPendingMessageTarget(message.ConversationID)) {
      this._pendingMessageReservedTargetId = null;
      this.PendingMessageConsumed.emit();
    }

    // Guard: ignore events from hidden message-input instances belonging to other conversations.
    // Multiple inputs are kept alive in the DOM cache (one per visited conversation) and all
    // emit events to this single parent. Without this check, a background agent's response
    // for conversation A would pollute conversation B's message list.
    if (!UUIDsEqual(message.ConversationID, this.ConversationId)) {
      // Invalidate that conversation's cache so fresh data loads when the user switches back
      if (message.ConversationID) {
        this.resetComponentState(message.ConversationID);
      }
      return;
    }

    // Mirror the row into the loaded window so its NewestSequence tracks live appends.
    // Local path only — the entity is already in hand, so this issues no query.
    this.windowStore.ApplyLocalDetail(message);

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
      if (this.ConversationId) {
        this.resetComponentState(this.ConversationId);
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
      if (message.Status === 'In-Progress' && message.ID && !this.InProgressMessageIds.includes(message.ID)) {
        this.InProgressMessageIds = [...this.InProgressMessageIds, message.ID];
      }
    }

    // Where the viewport goes: a fresh send follows — an in-place update of a message that
    // is already on screen must not re-run the send path's scroll.
    this.followTranscript(existingIndex >= 0 ? 'update' : 'new', message);

    // Force change detection — zone.js 0.15 no longer patches graphql-ws WebSocket callbacks,
    // so progress updates that arrive via PubSub run outside Angular's zone. Without this,
    // the UI does not update when the messages array is modified from a streaming callback.
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnMessageSent}. */
  async onMessageSent(message: MJConversationDetailEntity): Promise<void> {
    return this.OnMessageSent(message);
  }

  OnInitialMessageAutoSendStarted(event: {conversationId: string}): void {
    if (this.PendingMessage && this.isPendingMessageTarget(event.conversationId)) {
      this._pendingMessageReservedTargetId = event.conversationId;
    }
  }

  /** @deprecated Use {@link OnInitialMessageAutoSendStarted}. */
  onInitialMessageAutoSendStarted(event: {conversationId: string}): void {
    return this.OnInitialMessageAutoSendStarted(event);
  }

  OnInitialMessageAutoSendFailed(event: {conversationId: string}): void {
    if (UUIDsEqual(event.conversationId, this._pendingMessageReservedTargetId)) {
      this._pendingMessageReservedTargetId = null;
    }
  }

  /** @deprecated Use {@link OnInitialMessageAutoSendFailed}. */
  onInitialMessageAutoSendFailed(event: {conversationId: string}): void {
    return this.OnInitialMessageAutoSendFailed(event);
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
      const attachments = await this.attachmentService.loadAttachmentsForMessage(messageId, this.CurrentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }
      if (attachments.length > 0) {
        this.AttachmentsByDetailId.set(messageId, attachments);
        // Create new map reference to trigger Angular change detection
        this.AttachmentsByDetailId = new Map(this.AttachmentsByDetailId);
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
    const userId = this.CurrentUser.ID;

    // If user already in map, skip
    if (this.UserAvatarMap.has(userId)) {
      return;
    }

    // Load the current user's avatar data
    const md = this.ProviderToUse;
    const userEntity = await md.GetEntityObject<any>('MJ: Users');
    await userEntity.Load(userId);

    this.UserAvatarMap.set(userId, {
      imageUrl: userEntity.UserImageURL || null,
      iconClass: userEntity.UserImageIconClass || null
    });

    LogStatusEx({message: `👤 Added current user to avatar map`, verboseOnly: true});
  }

  /**
   * Handle agent run detected event from progress updates
   * This is called when the first progress update arrives with an agent run ID
   */
  async OnAgentRunDetected(event: {conversationId: string; conversationDetailId: string; agentRunId: string}): Promise<void> {
    // Guard: ignore events from a background conversation's (hidden, still-streaming) input
    // after a conversation swap. Without this, a background run would be written into the
    // active conversation's agent-run map and engine cache. See onMessageSent() for context.
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    await this.addAgentRunToMap(event.conversationId, event.conversationDetailId, event.agentRunId);
  }

  /** @deprecated Use {@link OnAgentRunDetected}. */
  async onAgentRunDetected(event: {conversationId: string; conversationDetailId: string; agentRunId: string}): Promise<void> {
    return this.OnAgentRunDetected(event);
  }

  /**
   * Handle message completion event from message-input
   * Refreshes the agent run data in-place to get final status and timestamps
   * Also reloads attachments created during agent execution (e.g., generated images)
   */
  async OnMessageComplete(event: {conversationId: string; conversationDetailId: string; agentId?: string}): Promise<void> {
    // Guard: ignore completion of a background conversation's run after a conversation swap.
    // Without this, a background run is refreshed into the active conversation's engine cache
    // (keyed by this.conversationId) and its attachments loaded into the active map.
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }

    // Get existing agent run from map
    const existingAgentRun = this.AgentRunsByDetailId.get(event.conversationDetailId);

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
        this.AgentRunsByDetailId.set(event.conversationDetailId, newEntity);

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

  /** @deprecated Use {@link OnMessageComplete}. */
  async onMessageComplete(event: {conversationId: string; conversationDetailId: string; agentId?: string}): Promise<void> {
    return this.OnMessageComplete(event);
  }

  /**
   * Handle agent run update event from progress updates
   * This is called on EVERY progress update with the full, live agent run object
   * Provides real-time updates of status, timestamps, tokens, cost during execution
   */
  async OnAgentRunUpdate(event: {conversationId: string; conversationDetailId: string; agentRun?: MJAIAgentRunEntityExtended, agentRunId?: string}): Promise<void> {
    // Guard: ignore live progress updates from a background conversation's run after a swap.
    // Without this, a background run is written into the active conversation's agent-run map
    // and into ConversationEngine's cache keyed by this.conversationId. See onMessageSent().
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    if (event.agentRun) {
      // Directly update map with fresh data from progress (no database query needed)
      // Don't create new Map - message-list component needs to keep the same reference
      this.AgentRunsByDetailId.set(event.conversationDetailId, event.agentRun);

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

  /** @deprecated Use {@link OnAgentRunUpdate}. */
  async onAgentRunUpdate(event: {conversationId: string; conversationDetailId: string; agentRun?: MJAIAgentRunEntityExtended, agentRunId?: string}): Promise<void> {
    return this.OnAgentRunUpdate(event);
  }

  /**
   * Public entry point to reload messages in the active conversation.
   * Called by the parent resource wrapper when the user clicks the Refresh button,
   * so that new agent responses are visible without a full page reload.
   */
  public async ReloadMessages(): Promise<void> {
    await this.reloadMessagesForActiveConversation();
  }

  /** @deprecated Use {@link ReloadMessages}. */
  public async reloadMessages(): Promise<void> {
    return this.ReloadMessages();
  }

  /**
   * Reload messages from the ConversationEngine cache (no DB round-trip).
   * The engine cache is kept warm by entity event handlers that auto-sync on save/delete.
   * Called when agent completion is detected to discover newly delegated agent messages.
   */
  private async reloadMessagesForActiveConversation(): Promise<void> {
    const conversationId = this.ConversationId;
    if (!conversationId) {
      return;
    }

    try {
      // Refresh the newest window page rather than reading the engine's full-history cache,
      // which the windowed path never populates — reading it here returned undefined and
      // silently skipped everything below, so delegated-agent messages never appeared.
      await this.windowStore.RefreshLatest(this.CurrentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }

      const engineDetails = this.windowStore.GetSnapshot().Details;
      if (engineDetails.length === 0) {
        return;
      }

      // Track existing message IDs before reload to identify new messages
      const existingMessageIds = new Set(this.messages.map(m => m.ID));

      // Merge the refreshed window with existing client-side messages.
      // Preserves messages added client-side (e.g., by handleSubAgentInvocation)
      // that haven't been picked up by entity events yet due to timing.
      const merged = new Map<string, MJConversationDetailEntity>();

      for (const msg of engineDetails) {
        merged.set(msg.ID, msg);
      }

      // Preserve client-side messages not yet in the window
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
            this.AgentRunsByDetailId.set(message.ID, agentRun as MJAIAgentRunEntityExtended);
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

      // Snapshot the artifact population before the reloads below so we can tell a NEW artifact
      // from a new VERSION of one already on screen (#529).
      const artifactBaseline = this.snapshotArtifactPanelBaseline();

      // Reload message from database to get final content and status
      await message.Load(message.ID);
      if (!isCurrent()) {
        return;
      }

      // Reload agent run to get final status, timestamps, and cost
      const agentRun = this.AgentRunsByDetailId.get(message.ID);
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
      this.InProgressMessageIds = [...this.messages
        .filter(m => m.Status === 'In-Progress')
        .map(m => m.ID)];

      // Open/refresh the artifact panel from the version diff (not just the triggering message).
      // When Sage delegates to a sub-agent (e.g., Skip), the artifact is on the sub-agent's
      // message, not Sage's. Checking only the triggering message would miss delegated artifacts.
      // #529: a delegated build discovered here must surface even with the panel already open on
      // another artifact, so this is NOT gated on `!this.showArtifactPanel`.
      await this.decideAndApplyArtifactPanel(artifactBaseline, expectedConversationId);

      // Remove task from ActiveTasksService (clears spinner in conversation list)
      const task = this.activeTasks.getByConversationDetailId(message.ID);
      if (task) {
        this.activeTasks.remove(task.id);
      }

      // The completed message was mutated in place — refresh the window's copy too.
      this.windowStore.ApplyLocalDetail(message);

      // Force re-render with updated agent run and artifacts
      this.messages = [...this.messages];
      this.cdr.detectChanges();

      LogStatusEx({message: `✅ Completion handled for message ${message.ID}`, verboseOnly: true});
    } catch (error) {
      console.error(`Error handling message completion for ${message.ID}:`, error);
      this.cdr.detectChanges();
    }
  }

  async OnAgentResponse(event: {message: MJConversationDetailEntity, agentResult: any}): Promise<void> {
    // Guard: ignore agent responses from background inputs for other conversations.
    // See onMessageSent() for the full explanation.
    if (!UUIDsEqual(event.message.ConversationID, this.ConversationId)) {
      if (event.message.ConversationID) {
        this.resetComponentState(event.message.ConversationID);
      }
      return;
    }

    // Add the agent's response message to the conversation
    this.windowStore.ApplyLocalDetail(event.message);
    this.messages = [...this.messages, event.message];

    // Invalidate cache for this conversation since we have new messages
    if (this.ConversationId) {
      this.resetComponentState(this.ConversationId);
    }

    // Where the viewport goes when the agent responds
    this.followTranscript('new', event.message);

    // CRITICAL FIX: Always refresh the agent run data when agent completes
    // This ensures we get the final status and timestamps, replacing any stale data from when agent started
    // agentResult is ExecuteAgentResult which contains agentRun property
    if (event.agentResult?.agentRun?.ID) {
      await this.addAgentRunToMap(event.message.ConversationID, event.message.ID, event.agentResult.agentRun.ID, true);  // forceRefresh = true
      if (!this.isActiveConversation(event.message.ConversationID)) {
        return;
      }
    }

    // Snapshot the artifact population before reload so we can tell a NEW artifact from a new
    // VERSION of one already on screen (#529).
    const artifactBaseline = this.snapshotArtifactPanelBaseline();

    // Reload artifact mapping for this message to pick up newly created artifacts
    await this.reloadArtifactsForMessage(event.message.ID, event.message.ConversationID);
    if (!this.isActiveConversation(event.message.ConversationID)) {
      return;
    }

    // #529: open a newly created artifact even with the panel already open on another one, refresh
    // the shown artifact when it gained a version, and switch to a retargeted one.
    await this.decideAndApplyArtifactPanel(artifactBaseline, event.message.ConversationID);

    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnAgentResponse}. */
  async onAgentResponse(event: {message: MJConversationDetailEntity, agentResult: any}): Promise<void> {
    return this.OnAgentResponse(event);
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
      if (forceRefresh || !this.AgentRunsByDetailId.has(conversationDetailId)) {
        const md = this.ProviderToUse;
        const agentRun = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', this.CurrentUser);
        if (await agentRun.Load(agentRunId)) {
          if (!this.isActiveConversation(conversationId)) {
            return agentRun;
          }
          this.AgentRunsByDetailId.set(conversationDetailId, agentRun);

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
        return this.AgentRunsByDetailId.get(conversationDetailId)!;
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
      const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.CurrentUser);
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

      // Refresh the newest window page — picks up artifacts written by the just-finished run
      // without re-querying the whole conversation.
      await this.windowStore.RefreshLatest(this.CurrentUser);
      if (!isCurrent()) {
        return;
      }

      // Reprocess peripheral data from the refreshed window
      this.lastLoadedConversationId = null;
      await this.loadPeripheralData(detailConversationId, this.windowStore.GetSnapshot(), loadToken);
    } catch (error) {
      console.error('Failed to reload artifacts for message:', error);
    }
  }

  OpenProjectSelector(): void {
    this.ShowProjectSelector = true;
  }

  /** @deprecated Use {@link OpenProjectSelector}. */
  openProjectSelector(): void {
    return this.OpenProjectSelector();
  }

  ToggleMembersModal(): void {
    this.ShowMembersModal = !this.ShowMembersModal;
  }

  /** @deprecated Use {@link ToggleMembersModal}. */
  toggleMembersModal(): void {
    return this.ToggleMembersModal();
  }

  ViewArtifacts(): void {
    this.ShowArtifactsModal = true;
  }

  /** @deprecated Use {@link ViewArtifacts}. */
  viewArtifacts(): void {
    return this.ViewArtifacts();
  }

  /**
   * Recompute the cached artifactCountDisplay from the effective artifacts map.
   * Must be called whenever artifactsByDetailId, systemArtifactsByDetailId,
   * or showSystemArtifacts changes, instead of using a getter that can produce
   * different values between Angular change-detection passes (NG0100).
   */
  private updateArtifactCountDisplay(): void {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.EffectiveArtifactsMap.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifactId);
      }
    }
    this.ArtifactCountDisplay = uniqueArtifactIds.size;
  }

  /**
   * Calculate count of unique artifacts (not versions) - user-visible only
   * Used for initial artifact count (doesn't change with toggle)
   */
  private calculateUniqueArtifactCount(): number {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.ArtifactsByDetailId.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifactId);
      }
    }
    return uniqueArtifactIds.size;
  }

  /**
   * Every (artifactId, versionNumber) pair currently known across all messages, with the version's
   * creation time so candidates can be ordered by recency rather than by whichever conversation
   * detail the map happened to iterate last.
   */
  private allArtifactRefs(): ArtifactVersionRef[] {
    const refs: ArtifactVersionRef[] = [];
    for (const artifactList of this.ArtifactsByDetailId.values()) {
      for (const info of artifactList) {
        refs.push({
          artifactId: info.artifactId,
          versionNumber: info.versionNumber,
          versionCreatedAt: info.versionCreatedAt,
        });
      }
    }
    return refs;
  }

  /**
   * Captures everything {@link decideAndApplyArtifactPanel} needs to judge, at the START of a turn,
   * whether the artifact population changed BECAUSE of that turn.
   *
   * The version map alone is not enough. `artifactsByDetailId` is rebuilt for reasons unrelated to
   * any run — `resetConversationScopedViewState` does not clear it on a conversation switch, so it
   * still holds the previous conversation's artifacts until `loadPeripheralData` lands, and the
   * missed-completion path in `loadMessages` runs BEFORE that rebuild. A snapshot taken there
   * describes a different conversation entirely, and every artifact of the conversation being
   * opened would read as newly created. So the baseline also records which conversation the map
   * was holding, the paging generation, and the user's selection epoch.
   */
  private snapshotArtifactPanelBaseline(): ArtifactPanelBaseline {
    return {
      Versions: SnapshotArtifactVersions(this.allArtifactRefs()),
      conversationId: this.ConversationId,
      MapConversationId: this.lastLoadedConversationId,
      MapGeneration: this.artifactMapGeneration,
      SelectionEpoch: this.artifactSelectionEpoch,
    };
  }

  /**
   * Diffs the current artifact population against a baseline and carries out the resulting panel
   * action. The single entry point for all three completion paths, which previously each carried
   * their own copy of the snapshot/decide/apply sequence.
   *
   * @param baseline - From {@link snapshotArtifactPanelBaseline}, taken before the turn's reloads.
   * @param conversationId - The conversation this turn belongs to.
   */
  private async decideAndApplyArtifactPanel(
    baseline: ArtifactPanelBaseline,
    conversationId: string | null | undefined
  ): Promise<void> {
    // The baseline is comparable only if the map was holding THIS conversation's artifacts when it
    // was taken, and nothing merged an older page in since.
    const baselineComparable =
      baseline.MapConversationId != null &&
      UUIDsEqual(baseline.MapConversationId, baseline.conversationId) &&
      this.artifactMapGeneration === baseline.MapGeneration;

    const action = DecideArtifactPanelAction({
      panelOpen: this.ShowArtifactPanel,
      selectedArtifactId: this.SelectedArtifactId,
      before: baseline.Versions,
      after: this.allArtifactRefs(),
      baselineComparable,
      userChangedSelection: this.artifactSelectionEpoch !== baseline.SelectionEpoch,
    });

    if (!baselineComparable && action.kind === 'none') {
      LogStatusEx({
        message: `🎨 Skipping artifact panel decision: the before/after snapshots describe different artifact populations (map held ${baseline.MapConversationId ?? 'nothing'}, conversation was ${baseline.conversationId})`,
        verboseOnly: true
      });
    }
    await this.applyArtifactPanelAction(action, conversationId);
  }

  /**
   * Carry out the decision from {@link decideArtifactPanelAction}: open the panel on an artifact
   * version, refresh the already-open viewer, or do nothing.
   */
  private async applyArtifactPanelAction(action: ArtifactPanelAction, conversationId: string | null | undefined): Promise<void> {
    switch (action.kind) {
      case 'open':
        this.SelectedArtifactId = action.artifactId;
        this.SelectedVersionNumber = action.versionNumber;
        this.ShowArtifactPanel = true;
        await this.loadArtifactPermissions(action.artifactId, conversationId, action.artifactId);
        // The permission load is async: the user may have switched conversations or picked a
        // different artifact while it was in flight, so only narrate what is still on screen.
        if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.SelectedArtifactId, action.artifactId)) {
          return;
        }
        LogStatusEx({
          message: `🎨 Opening artifact ${action.artifactId} v${action.versionNumber} after agent run (decided from the conversation-wide version diff, so no single detail id applies)`,
          verboseOnly: true
        });
        return;
      case 'refresh':
        // ONE channel, deliberately. Writing `selectedVersionNumber` as well would change the
        // viewer's `[versionNumber]` input in the same change-detection pass, and its `ngOnChanges`
        // would load the version a second time on top of the load this emission already starts —
        // and that second load runs without a cancellation token, so it can also land after a newer
        // one. The subject path is the one to keep: it reloads the version list too, which a
        // brand-new version needs, and it carries a load token.
        this.ArtifactViewerRefresh$.next({ artifactId: action.artifactId, versionNumber: action.versionNumber });
        return;
      case 'none':
        return;
    }
  }

  /**
   * Get the effective artifacts map based on showSystemArtifacts toggle
   * Combines user-visible and system artifacts when toggle is on
   * Uses caching to prevent infinite change detection loops
   */
  public get EffectiveArtifactsMap(): Map<string, LazyArtifactInfo[]> {
    if (!this.ShowSystemArtifacts) {
      // Only user-visible artifacts - no need to cache
      return this.ArtifactsByDetailId;
    }

    // Return cached combined map if available
    if (this._combinedArtifactsMap) {
      return this._combinedArtifactsMap;
    }

    // Combine both maps when showing system artifacts
    const combined = new Map<string, LazyArtifactInfo[]>();

    // Add all user-visible artifacts
    for (const [key, value] of this.ArtifactsByDetailId) {
      combined.set(key, [...value]);
    }

    // Add system artifacts
    for (const [key, value] of this.SystemArtifactsByDetailId) {
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

  /** @deprecated Use {@link EffectiveArtifactsMap}. */
  public get effectiveArtifactsMap(): Map<string, LazyArtifactInfo[]> {
    return this.EffectiveArtifactsMap;
  }

  /**
   * Toggles system artifacts visibility
   * Clears the cache so the map will be rebuilt on next access
   */
  public ToggleSystemArtifacts(): void {
    this.ShowSystemArtifacts = !this.ShowSystemArtifacts;
    this._combinedArtifactsMap = null; // Clear cache
    this.updateArtifactCountDisplay();
    this.cdr.detectChanges(); // Force update
  }

  /** @deprecated Use {@link ToggleSystemArtifacts}. */
  public toggleSystemArtifacts(): void {
    return this.ToggleSystemArtifacts();
  }

  /**
   * Check if there are any system artifacts in this conversation
   * Used to conditionally show/hide the "Show System" toggle button
   */
  public get HasSystemArtifacts(): boolean {
    return this.SystemArtifactsByDetailId.size > 0;
  }

  /** @deprecated Use {@link HasSystemArtifacts}. */
  public get hasSystemArtifacts(): boolean {
    return this.HasSystemArtifacts;
  }

  /**
   * Get unique artifacts grouped by artifact ID (not by conversation detail)
   * Returns the latest version info for each unique artifact with all versions
   * Works with LazyArtifactInfo - uses display data without loading full entities
   * Respects showSystemArtifacts toggle
   */
  GetArtifactsArray(): Array<{
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
    for (const artifactList of this.EffectiveArtifactsMap.values()) {
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

  /** @deprecated Use {@link GetArtifactsArray}. */
  getArtifactsArray(): Array<{
    artifactId: string;
    versionId: string;
    name: string;
    versionCount: number;
    visibility: string;
    versions: Array<{versionId: string; versionNumber: number}>
  }> {
    return this.GetArtifactsArray();
  }

  ToggleArtifactExpansion(artifactId: string, event: Event): void {
    event.stopPropagation(); // Prevent opening artifact when clicking expand button
    this.ExpandedArtifactId = this.ExpandedArtifactId === artifactId ? null : artifactId;
  }

  /** @deprecated Use {@link ToggleArtifactExpansion}. */
  toggleArtifactExpansion(artifactId: string, event: Event): void {
    return this.ToggleArtifactExpansion(artifactId, event);
  }

  async OpenArtifactFromModal(artifactId: string, versionNumber?: number): Promise<void> {
    const conversationId = this.ConversationId;
    this.artifactSelectionEpoch++;
    this.SelectedArtifactId = artifactId;
    this.SelectedVersionNumber = versionNumber;
    this.ShowArtifactPanel = true;
    this.ShowArtifactsModal = false;

    // Load permissions for the selected artifact
    await this.loadArtifactPermissions(artifactId, conversationId, artifactId);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.SelectedArtifactId, artifactId)) {
      return;
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OpenArtifactFromModal}. */
  async openArtifactFromModal(artifactId: string, versionNumber?: number): Promise<void> {
    return this.OpenArtifactFromModal(artifactId, versionNumber);
  }

  ExportConversation(): void {
    if (this.Conversation) {
      this.ShowExportModal = true;
    }
  }

  /** @deprecated Use {@link ExportConversation}. */
  exportConversation(): void {
    return this.ExportConversation();
  }

  OnExportModalCancelled(): void {
    this.ShowExportModal = false;
  }

  /** @deprecated Use {@link OnExportModalCancelled}. */
  onExportModalCancelled(): void {
    return this.OnExportModalCancelled();
  }

  OnExportModalComplete(): void {
    this.ShowExportModal = false;
  }

  /** @deprecated Use {@link OnExportModalComplete}. */
  onExportModalComplete(): void {
    return this.OnExportModalComplete();
  }

  async OnProjectSelected(project: any): Promise<void> {
    if (this.Conversation && project) {
      try {
        await this.engine.SaveConversation(
          this.Conversation.ID,
          { ProjectID: project.ID },
          this.CurrentUser
        );
        this.ShowProjectSelector = false;
      } catch (error) {
        console.error('Failed to assign project:', error);
      }
    } else if (this.Conversation && !project) {
      // Remove project assignment
      try {
        await this.engine.SaveConversation(
          this.Conversation.ID,
          { ProjectID: null },
          this.CurrentUser
        );
        this.ShowProjectSelector = false;
      } catch (error) {
        console.error('Failed to remove project:', error);
      }
    }
  }

  /** @deprecated Use {@link OnProjectSelected}. */
  async onProjectSelected(project: any): Promise<void> {
    return this.OnProjectSelected(project);
  }

  ShareConversation(): void {
    if (!this.Conversation) return;
    this.ShareContext = {
      ResourceID: this.Conversation.ID,
      ResourceName: this.Conversation.Name ?? 'Conversation',
      OwnerUserID: this.Conversation.UserID ?? null,
      OwnerDisplayName: this.Conversation.User ?? 'You',
      CurrentUserID: this.CurrentUser?.ID ?? null
    };
    this.ShowShareModal = true;
  }

  /** @deprecated Use {@link ShareConversation}. */
  shareConversation(): void {
    return this.ShareConversation();
  }

  OnShareDialogResult(_result: { Action: 'save' | 'cancel' }): void {
    this.ShowShareModal = false;
  }

  /** @deprecated Use {@link OnShareDialogResult}. */
  onShareDialogResult(_result: { Action: 'save' | 'cancel' }): void {
    return this.OnShareDialogResult(_result);
  }

  /**
   * Display info for the header "Shared by {email}" badge. Returns `null`
   * when the current user owns the conversation or when the share has no
   * recorded grantor (legacy share pre-dating `SharedByUserID`).
   */
  public get SharedByBadge(): { display: string; fullTooltip: string } | null {
    if (!this.Conversation) return null;
    const info = this.engine.GetSharedByInfo(this.Conversation.ID);
    if (!info || !info.UserID) return null;
    const display = info.Email ?? info.Name ?? 'another user';
    const tooltip = info.Email && info.Name ? `${info.Name} <${info.Email}>` : display;
    return { display, fullTooltip: `Shared by ${tooltip}` };
  }

  /** @deprecated Use {@link SharedByBadge}. */
  public get sharedByBadge(): { display: string; fullTooltip: string } | null {
    return this.SharedByBadge;
  }

  /**
   * `true` when the current user only has `View` access to this conversation
   * (i.e., it was shared with them read-only). Gates the message input and
   * any other write-capable UI.
   */
  public get IsReadOnlyView(): boolean {
    if (!this.Conversation) return false;
    const info = this.engine.GetSharedByInfo(this.Conversation.ID);
    return info?.Level === 'View';
  }

  /** @deprecated Use {@link IsReadOnlyView}. */
  public get isReadOnlyView(): boolean {
    return this.IsReadOnlyView;
  }

  /**
   * `true` when the current user is allowed to create new shares on this
   * conversation. Only the conversation's owner — or a user with an existing
   * Owner-level grant — may do so. Matches the server-side gate in
   * {@link MJResourcePermissionEntityExtended.callerMayGrantShare}, so the UI
   * doesn't offer an action the save would refuse.
   */
  public get CanShareConversation(): boolean {
    if (!this.Conversation || !this.CurrentUser) return false;
    if (this.Conversation.UserID && this.Conversation.UserID.toLowerCase() === this.CurrentUser.ID.toLowerCase()) {
      return true;
    }
    const info = this.engine.GetSharedByInfo(this.Conversation.ID);
    return info?.Level === 'Owner';
  }

  /** @deprecated Use {@link CanShareConversation}. */
  public get canShareConversation(): boolean {
    return this.CanShareConversation;
  }

  OnReplyInThread(message: MJConversationDetailEntity): void {
    // Open thread panel for this message - emit to parent
    this.ThreadOpened.emit(message.ID);
  }

  /** @deprecated Use {@link OnReplyInThread}. */
  onReplyInThread(message: MJConversationDetailEntity): void {
    return this.OnReplyInThread(message);
  }

  OnViewThread(message: MJConversationDetailEntity): void {
    // Open thread panel for this message - emit to parent
    this.ThreadOpened.emit(message.ID);
  }

  /** @deprecated Use {@link OnViewThread}. */
  onViewThread(message: MJConversationDetailEntity): void {
    return this.OnViewThread(message);
  }

  OnLocalThreadClosed(): void {
    // Close the thread panel - emit to parent
    this.ThreadClosed.emit();
  }

  /** @deprecated Use {@link OnLocalThreadClosed}. */
  onLocalThreadClosed(): void {
    return this.OnLocalThreadClosed();
  }

  OnThreadReplyAdded(reply: MJConversationDetailEntity): void {
    // Optionally refresh the message list to update thread counts
    // For now, we'll just log it
    LogStatusEx({message: 'Thread reply added', verboseOnly: true, additionalArgs: [reply]});

    // Reload messages to get updated thread counts
    if (this.ConversationId) {
      const conversationId = this.ConversationId;
      const loadToken = ++this.conversationLoadToken;
      void this.loadMessages(conversationId, loadToken);
    }
  }

  /** @deprecated Use {@link OnThreadReplyAdded}. */
  onThreadReplyAdded(reply: MJConversationDetailEntity): void {
    return this.OnThreadReplyAdded(reply);
  }

  OnToggleAgentPanel(): void {
    this.ShowAgentPanel = !this.ShowAgentPanel;
    // The agent panel component handles its own visibility
    // This could be used to toggle a modal or different view
  }

  /** @deprecated Use {@link OnToggleAgentPanel}. */
  onToggleAgentPanel(): void {
    return this.OnToggleAgentPanel();
  }

  OnAgentSelected(agentRun: MJAIAgentRunEntity): void {
    // When an agent is clicked in the indicator, could show details
    LogStatusEx({message: 'Agent selected', verboseOnly: true, additionalArgs: [agentRun.ID]});
    // Could open a modal or navigate to agent details
  }

  /** @deprecated Use {@link OnAgentSelected}. */
  onAgentSelected(agentRun: MJAIAgentRunEntity): void {
    return this.OnAgentSelected(agentRun);
  }

  OnMessageEdited(message: MJConversationDetailEntity): void {
    // Message was edited and saved, trigger change detection
    LogStatusEx({message: 'Message edited', verboseOnly: true, additionalArgs: [message.ID]});
    // The entity was mutated in place, so the transcript already shows the new text. Replace
    // it in the window explicitly anyway: the store dedupes by ID on merge, and without this
    // a later RefreshLatest could fold a server copy over the edited one.
    this.windowStore.ApplyLocalDetail(message);
  }

  /** @deprecated Use {@link OnMessageEdited}. */
  onMessageEdited(message: MJConversationDetailEntity): void {
    return this.OnMessageEdited(message);
  }

  OnMessagePinToggled(message: MJConversationDetailEntity): void {
    // The entity object is already mutated by .Save(), and the window holds that same object
    // reference, so the transcript reflects the change with no cache write.
    //
    // The engine's RawData row-sync that used to live here is gone: the windowed path never
    // populates `_detailCache`, and a window carries no RawData (those JSON columns only
    // exist on the GetConversationComplete stored query).
    this.windowStore.ApplyLocalDetail(message);
    // The pins panel reads a separate set (it must show pins older than the window), so it
    // needs the toggle applied explicitly — but only once that set is REAL. Applying a pin
    // to a not-yet-hydrated (empty) set would leave one entry that looks like the whole set,
    // and opening the panel would show a single pin on a conversation with many.
    if (this.pinsHydrated) {
      this.windowStore.ApplyLocalPin(message);
    } else {
      this.windowStore.SetPinnedCount(this.PinnedMessageCount + (message.IsPinned ? 1 : -1));
    }

    // Auto-close the panel when the last pin is removed
    if (this.ShowPinsPanel && this.PinnedMessageCount === 0) {
      setTimeout(() => { this.ShowPinsPanel = false; this.cdr.detectChanges(); }, 600);
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnMessagePinToggled}. */
  onMessagePinToggled(message: MJConversationDetailEntity): void {
    return this.OnMessagePinToggled(message);
  }

  /**
   * Scrolls the message list to the target message and plays the beacon animation.
   * Called when the user clicks "Jump to message" in the pins panel.
   */
  async OnJumpToMessage(messageId: string): Promise<void> {
    // Delegated to the list rather than queried here. A `[data-message-id]` lookup only finds
    // MOUNTED messages, and a pin is by definition often far above the viewport — exactly the
    // region the list unmounts into spacers — so this button silently did nothing for any pin
    // that wasn't already on screen. The list resolves through the timeline key, which a
    // spacer shares with the item it stands in for.
    if (this.messageListComponent?.ScrollToMessage(messageId)) {
      this.beaconMessage(messageId);
      return;
    }

    // Not in the loaded window. Pins are fetched by their own query precisely so the panel can
    // list pins older than the transcript, so this is the EXPECTED case for an old pin, not an
    // error — page back until it is loaded, the same way a date jump does.
    const reached = await this.loadUntilMessageIsWindowed(messageId);
    if (!reached) {
      MJNotificationService.Instance.CreateSimpleNotification(
        'Could not reach that message — it is further back than this jump loads.', 'info', 3000
      );
      return;
    }

    // The paging loop deliberately skipped the per-page peripheral rebuild — pay it once,
    // here, before asking the list for element positions.
    await this.refreshAfterPaging(this.ConversationId!);
    if (this.messageListComponent?.ScrollToMessage(messageId)) {
      this.beaconMessage(messageId);
    }
  }

  /** @deprecated Use {@link OnJumpToMessage}. */
  async onJumpToMessage(messageId: string): Promise<void> {
    return this.OnJumpToMessage(messageId);
  }

  /**
   * Pages older history until `messageId` falls inside the loaded window.
   *
   * Deterministic rather than heuristic: a pin carries its own `Sequence`, so the stop
   * condition is simply "the window now reaches at least that far back" — no equivalent of
   * the date jump's `NeedsOlder` probing is needed. Bounded by the same page cap, for the same
   * reason: an unbounded walk back is the thing windowing exists to avoid.
   */
  private async loadUntilMessageIsWindowed(messageId: string): Promise<boolean> {
    const target = this.PinnedMessages.find(p => UUIDsEqual(p.ID, messageId));
    if (!target) {
      return false;   // not a loaded pin — nothing tells us how far back to page
    }

    const conversationId = this.ConversationId;
    for (let page = 0; page < DATE_JUMP_MAX_PAGES; page++) {
      const snapshot = this.windowStore.GetSnapshot();
      const oldest = snapshot.Cursor.OldestSequence;
      if (oldest !== null && oldest <= target.Sequence) {
        return true;                        // the window now covers it
      }
      if (!snapshot.Cursor.HasMoreAbove) {
        return false;                       // ran out of conversation
      }

      // Store-level paging for the same reason as the date jump — the caller refreshes once.
      await this.windowStore.LoadOlder(this.CurrentUser);
      if (!this.isActiveConversation(conversationId)) {
        return false;                       // user switched away mid-jump
      }
    }
    return false;                           // hit the page cap
  }

  /** Flashes the beacon on a message once its scroll has settled. */
  private beaconMessage(messageId: string): void {
    // Re-queried rather than captured: the target may have been a spacer when the scroll
    // started and been remounted as a real bubble by the time it lands.
    setTimeout(() => {
      const el = this.scrollContainer?.nativeElement?.querySelector(`[data-message-id="${messageId}"]`);
      if (!el) {
        return;
      }
      el.classList.add('pin-beacon');
      setTimeout(() => el.classList.remove('pin-beacon'), 1500);
    }, 350);
  }


  /**
   * Unpins a message from the pins panel — saves to DB and patches the cache.
   */
  async OnUnpinFromPanel(message: MJConversationDetailEntity): Promise<void> {
    const previous = message.IsPinned;
    message.IsPinned = false;
    this.cdr.detectChanges();
    try {
      await message.Save();
      this.OnMessagePinToggled(message);
    } catch (err) {
      console.error('Failed to unpin message from panel:', err);
      message.IsPinned = previous;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OnUnpinFromPanel}. */
  async onUnpinFromPanel(message: MJConversationDetailEntity): Promise<void> {
    return this.OnUnpinFromPanel(message);
  }

  /**
   * Handle suggested response selection from user
   * Sends the selected response as a new user message WITHOUT modifying the visible input
   */
  async OnSuggestedResponseSelected(event: {text: string; customInput?: string}): Promise<void> {
    const messageText = event.customInput || event.text;

    // Get the active message input for the current conversation
    // (we cache multiple instances, one per visited conversation)
    const activeInput = this.getActiveMessageInputComponent();

    // If we have an active conversation with message input available, use it
    if (activeInput && !this.IsNewConversation) {
      await activeInput.sendMessageWithText(messageText);
    } else if (!this.Conversation || this.IsNewConversation) {
      // If no conversation or in new unsaved state, route through empty state handler
      // This will create the conversation and send the message
      await this.OnEmptyStateMessageSent({ text: messageText, attachments: [] });
    } else {
      console.error('MessageInputComponent not available and not in a valid state to create conversation');
    }
  }

  /** @deprecated Use {@link OnSuggestedResponseSelected}. */
  async onSuggestedResponseSelected(event: {text: string; customInput?: string}): Promise<void> {
    return this.OnSuggestedResponseSelected(event);
  }

  async OnDeleteMessage(message: MJConversationDetailEntity): Promise<void> {
    if (!UUIDsEqual(this.Conversation?.UserID, this.CurrentUser?.ID)) return;

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
        const entity = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.CurrentUser);
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
    // Drop them from the window too, or the next RefreshLatest merge reinstates them.
    for (const id of hideIds) {
      this.windowStore.RemoveDetail(id);
    }
    this.messages = this.messages.filter(m => !hideIds.has(m.ID));
    this.resetComponentState(this.ConversationId!);
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnDeleteMessage}. */
  async onDeleteMessage(message: MJConversationDetailEntity): Promise<void> {
    return this.OnDeleteMessage(message);
  }

  OnRetryMessage(message: MJConversationDetailEntity): void {
    // TODO: Implement retry logic
    // This should find the parent user message and re-trigger the agent invocation
    LogStatusEx({message: 'Retry requested for message', verboseOnly: true, additionalArgs: [message.ID]});
    // For now, just log it - full implementation would require refactoring agent invocation
  }

  /** @deprecated Use {@link OnRetryMessage}. */
  onRetryMessage(message: MJConversationDetailEntity): void {
    return this.OnRetryMessage(message);
  }

  /**
   * Handle attachment click - opens the image viewer for images
   */
  OnAttachmentClicked(attachment: MessageAttachment): void {
    if (attachment.type === 'Image' && attachment.contentUrl) {
      this.SelectedImageUrl = attachment.contentUrl;
      this.SelectedImageAlt = attachment.fileName || 'Image attachment';
      this.SelectedImageFileName = attachment.fileName || 'image';
      this.ShowImageViewer = true;
      return;
    }

    // Artifact-backed attachments open in the artifact viewer panel.
    if (attachment.source === 'artifact' && attachment.artifactId) {
      this.OnArtifactClicked({
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

  /** @deprecated Use {@link OnAttachmentClicked}. */
  onAttachmentClicked(attachment: MessageAttachment): void {
    return this.OnAttachmentClicked(attachment);
  }

  /**
   * Handle image viewer close
   */
  OnImageViewerClosed(): void {
    this.ShowImageViewer = false;
    this.SelectedImageUrl = '';
    this.SelectedImageAlt = '';
    this.SelectedImageFileName = '';
  }

  /** @deprecated Use {@link OnImageViewerClosed}. */
  onImageViewerClosed(): void {
    return this.OnImageViewerClosed();
  }

  /**
   * Handle upload state changes from message input component
   */
  OnUploadStateChanged(event: {isUploading: boolean; message: string}): void {
    this.IsUploadingAttachments = event.isUploading;
    this.UploadingMessage = event.message;
  }

  /** @deprecated Use {@link OnUploadStateChanged}. */
  onUploadStateChanged(event: {isUploading: boolean; message: string}): void {
    return this.OnUploadStateChanged(event);
  }

  async OnArtifactClicked(data: {artifactId: string; versionId?: string}): Promise<void> {
    const conversationId = this.ConversationId;
    this.artifactSelectionEpoch++;
    this.SelectedArtifactId = data.artifactId;

    // If versionId is provided, find the version number from display data (no lazy load needed)
    if (data.versionId) {
      for (const artifactList of this.ArtifactsByDetailId.values()) {
        for (const artifactInfo of artifactList) {
          if (artifactInfo.artifactVersionId === data.versionId) {
            this.SelectedVersionNumber = artifactInfo.versionNumber;
            LogStatusEx({message: `📦 Opening artifact viewer for v${this.SelectedVersionNumber}`, verboseOnly: true});
            break;
          }
        }
      }
    } else {
      // No specific version, let viewer default to latest
      this.SelectedVersionNumber = undefined;
    }

    this.ShowArtifactPanel = true;

    // Load permissions for the selected artifact
    await this.loadArtifactPermissions(data.artifactId, conversationId, data.artifactId);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.SelectedArtifactId, data.artifactId)) {
      return;
    }

    // Trigger detectChanges after all state is settled (showArtifactPanel, permissions)
    // to prevent ExpressionChangedAfterItHasBeenCheckedError from zone-triggered CD
    // seeing partial state between the await boundaries
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnArtifactClicked}. */
  async onArtifactClicked(data: {artifactId: string; versionId?: string}): Promise<void> {
    return this.OnArtifactClicked(data);
  }

  async OnArtifactCreated(data: {conversationId: string, conversationDetailId: string, artifactId: string; versionId: string; versionNumber: number; name: string}): Promise<void> {
    // Guard: ignore artifacts created by a background conversation's agent after a swap.
    // Without this, reloadArtifactsForMessage -> loadPeripheralData would CLEAR the active
    // conversation's artifact/agent-run/rating/attachment maps and rebuild them from the
    // background conversation's cache — wiping the displayed conversation's artifacts.
    // The background conversation's artifacts persist server-side and reload when the user
    // navigates back to it. See onMessageSent() for the broader pattern.
    if (!this.isActiveConversation(data.conversationId)) {
      return;
    }

    // Snapshot the artifact population across the conversation before reload so we can tell a NEW
    // artifact from a new VERSION of an existing one (the event itself carries placeholder ids).
    const artifactBaseline = this.snapshotArtifactPanelBaseline();

    // Reload artifacts to get full entities (processes ALL messages in the conversation)
    await this.reloadArtifactsForMessage(data.conversationDetailId, data.conversationId);
    if (!this.isActiveConversation(data.conversationId)) {
      return;
    }

    // #529: a new artifact opens even over an open panel (build); a bumped version of the shown
    // artifact refreshes; a bumped version of another artifact switches to it (retargeting).
    await this.decideAndApplyArtifactPanel(artifactBaseline, data.conversationId);

    // Force change detection to update the UI immediately
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnArtifactCreated}. */
  async onArtifactCreated(data: {conversationId: string, conversationDetailId: string, artifactId: string; versionId: string; versionNumber: number; name: string}): Promise<void> {
    return this.OnArtifactCreated(data);
  }

  OnCloseArtifactPanel(): void {
    this.artifactSelectionEpoch++;
    this.ShowArtifactPanel = false;
    this.SelectedArtifactId = null;
    // Clear permissions
    this.CanShareSelectedArtifact = false;
    this.CanEditSelectedArtifact = false;
    // Reset maximize state and width when closing so the next artifact opens at default size
    this.resetArtifactPaneSizing();
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnCloseArtifactPanel}. */
  onCloseArtifactPanel(): void {
    return this.OnCloseArtifactPanel();
  }

  ToggleMaximizeArtifactPane(): void {
    if (this.IsArtifactPaneMaximized) {
      // Restore to previous width
      this.ArtifactPaneWidth = this.artifactPaneWidthBeforeMaximize;
      this.IsArtifactPaneMaximized = false;
    } else {
      // Maximize - store current width and set to 100%
      this.artifactPaneWidthBeforeMaximize = this.ArtifactPaneWidth;
      this.ArtifactPaneWidth = 100;
      this.IsArtifactPaneMaximized = true;
    }
  }

  /** @deprecated Use {@link ToggleMaximizeArtifactPane}. */
  toggleMaximizeArtifactPane(): void {
    return this.ToggleMaximizeArtifactPane();
  }

  OnSaveToCollectionRequested(event: {artifactId: string; excludedCollectionIds: string[]}): void {
    this.CollectionPickerArtifactId = event.artifactId;
    this.CollectionPickerExcludedIds = event.excludedCollectionIds;
    // Snapshot version + name from the viewer so the picker's preview pane has real context
    const viewer = this.artifactViewerComponent;
    this.CollectionPickerVersionId = viewer?.artifactVersion?.ID ?? null;
    this.CollectionPickerArtifactName = viewer?.displayName ?? '';
    this.CollectionPickerVersionNumber = viewer?.selectedVersionNumber ?? null;
    this.ShowCollectionPicker = true;
  }

  /** @deprecated Use {@link OnSaveToCollectionRequested}. */
  onSaveToCollectionRequested(event: {artifactId: string; excludedCollectionIds: string[]}): void {
    return this.OnSaveToCollectionRequested(event);
  }

  async OnCollectionPickerCompleted(event: { successIds: string[]; failedIds: string[] }): Promise<void> {
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

  /** @deprecated Use {@link OnCollectionPickerCompleted}. */
  async onCollectionPickerCompleted(event: { successIds: string[]; failedIds: string[] }): Promise<void> {
    return this.OnCollectionPickerCompleted(event);
  }

  OnCollectionPickerCancelled(): void {
    this.closeCollectionPicker();
  }

  /** @deprecated Use {@link OnCollectionPickerCancelled}. */
  onCollectionPickerCancelled(): void {
    return this.OnCollectionPickerCancelled();
  }

  private closeCollectionPicker(): void {
    this.ShowCollectionPicker = false;
    this.CollectionPickerArtifactId = null;
    this.CollectionPickerExcludedIds = [];
    this.CollectionPickerVersionId = null;
    this.CollectionPickerArtifactName = '';
    this.CollectionPickerVersionNumber = null;
    this.cdr.detectChanges();
  }

  /**
   * Helper method to check if a conversation detail has an artifact
   * Used by message components to determine whether to show artifact card
   */
  public ConversationDetailHasArtifact(conversationDetailId: string): boolean {
    return this.ArtifactsByDetailId.has(conversationDetailId);
  }

  /** @deprecated Use {@link ConversationDetailHasArtifact}. */
  public conversationDetailHasArtifact(conversationDetailId: string): boolean {
    return this.ConversationDetailHasArtifact(conversationDetailId);
  }

  /**
   * Get artifact info for a conversation detail
   * Returns the LAST (most recent) artifact if multiple exist
   * Returns LazyArtifactInfo - caller can trigger lazy load if full entities needed
   */
  public GetArtifactInfo(conversationDetailId: string): LazyArtifactInfo | undefined {
    const artifactList = this.ArtifactsByDetailId.get(conversationDetailId);
    return artifactList && artifactList.length > 0
      ? artifactList[artifactList.length - 1]
      : undefined;
  }

  /** @deprecated Use {@link GetArtifactInfo}. */
  public getArtifactInfo(conversationDetailId: string): LazyArtifactInfo | undefined {
    return this.GetArtifactInfo(conversationDetailId);
  }

  /**
   * Get ALL artifacts for a conversation detail
   * Use this when you need to display all artifacts (e.g., in a list)
   * Returns LazyArtifactInfo array - caller can trigger lazy load if full entities needed
   */
  public GetAllArtifactsForDetail(conversationDetailId: string): LazyArtifactInfo[] {
    return this.ArtifactsByDetailId.get(conversationDetailId) || [];
  }

  /** @deprecated Use {@link GetAllArtifactsForDetail}. */
  public getAllArtifactsForDetail(conversationDetailId: string): LazyArtifactInfo[] {
    return this.GetAllArtifactsForDetail(conversationDetailId);
  }

  /**
   * Resize handle methods for artifact pane
   */
  OnResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.ArtifactPaneWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /** @deprecated Use {@link OnResizeStart}. */
  onResizeStart(event: MouseEvent): void {
    return this.OnResizeStart(event);
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const containerWidth = (event.currentTarget as Window).innerWidth;
    const deltaX = this.startX - event.clientX; // Reversed: drag left = wider artifact pane
    const deltaPercent = (deltaX / containerWidth) * 100;
    let newWidth = this.startWidth + deltaPercent;

    // Constrain between 20% and 70%
    newWidth = Math.max(20, Math.min(70, newWidth));
    this.ArtifactPaneWidth = newWidth;
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
  OnResizeTouchStart(event: TouchEvent): void {
    this.isResizing = true;
    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startWidth = this.ArtifactPaneWidth;
    event.preventDefault();
  }

  /** @deprecated Use {@link OnResizeTouchStart}. */
  onResizeTouchStart(event: TouchEvent): void {
    return this.OnResizeTouchStart(event);
  }

  private onResizeTouchMove(event: TouchEvent): void {
    if (!this.isResizing) return;

    const touch = event.touches[0];
    const containerWidth = window.innerWidth;
    const deltaX = this.startX - touch.clientX;
    const deltaPercent = (deltaX / containerWidth) * 100;
    let newWidth = this.startWidth + deltaPercent;

    newWidth = Math.max(20, Math.min(70, newWidth));
    this.ArtifactPaneWidth = newWidth;
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
          this.ArtifactPaneWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load artifact pane width from localStorage:', error);
    }
  }

  private saveArtifactPaneWidth(): void {
    try {
      localStorage.setItem(this.ARTIFACT_PANE_WIDTH_KEY, this.ArtifactPaneWidth.toString());
    } catch (error) {
      console.warn('Failed to save artifact pane width to localStorage:', error);
    }
  }

  OnConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    LogStatusEx({message: '🎉 Conversation renamed', verboseOnly: true, additionalArgs: [event]});
    // Pass the event up to workspace component for animation
    this.ConversationRenamed.emit(event);
  }

  /** @deprecated Use {@link OnConversationRenamed}. */
  onConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    return this.OnConversationRenamed(event);
  }

  /**
   * Handle message sent from empty state component
   * Creates a new conversation and emits to parent to update selection
   */
  async OnEmptyStateMessageSent(event: {text: string; attachments: PendingAttachment[]}): Promise<void> {
    // The new-conversation draft became a message — remove the 'new' entry and
    // reset its restore snapshot so the NEXT new-conversation composer starts clean.
    this.draftStore.ClearDraft(null);
    this.initialDraftSnapshots.delete('new');
    const { text, attachments } = event;
    if (!text?.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    LogStatusEx({message: '📨 Empty state message received', verboseOnly: true, additionalArgs: [text, `${attachments?.length || 0} attachments`]});

    try {
      this.IsProcessing = true;

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
        (this.ApplicationScope !== 'Global' && !this.ApplicationId)
          ? 'Global'
          : this.ApplicationScope;
      // Linked-record stamping — both columns must be populated together
      // or both null (DB CHECK constraint CK_Conversation_LinkBinding).
      // We only forward the pair when BOTH inputs are supplied; if the
      // host bound one but not the other, treat as misconfiguration and
      // skip the linkage rather than failing the save.
      const hasLink = !!this.LinkedEntityId && !!this.LinkedRecordId;
      const newConversation = await this.engine.CreateConversation(
        'New Conversation', // Temporary name - will be auto-named after first message
        this.EnvironmentId,
        this.CurrentUser,
        undefined,
        undefined,
        {
          applicationScope: effectiveScope,
          applicationId: effectiveScope === 'Global' ? null : this.ApplicationId,
          defaultAgentId: this.DefaultAgentId,
          linkedEntityId: hasLink ? this.LinkedEntityId : null,
          linkedRecordId: hasLink ? this.LinkedRecordId : null,
        }
      );

      if (!newConversation) {
        console.error('Failed to create new conversation');
        this.IsProcessing = false;
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
      this.ConversationCreated.emit({
        conversation: newConversation,
        pendingMessage,
        pendingAttachments
      });

    } catch (error) {
      console.error('Error creating conversation from empty state:', error);
    } finally {
      this.IsProcessing = false;
    }
  }

  /** @deprecated Use {@link OnEmptyStateMessageSent}. */
  async onEmptyStateMessageSent(event: {text: string; attachments: PendingAttachment[]}): Promise<void> {
    return this.OnEmptyStateMessageSent(event);
  }

  OnOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    // Pass the event up to the parent component (workspace or explorer wrapper)
    this.OpenEntityRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    return this.OnOpenEntityRecord(event);
  }

  /** Record `open:resource` buttons → same openEntityRecord chain as agent-run links. */
  private emitOpenResourceRecord(command: OpenResourceCommand): void {
    if (!command.entityName) return;
    const entity = this.ProviderToUse.EntityByName(command.entityName);
    if (!entity) {
      console.warn('open:resource: unknown entity', command.entityName);
      return;
    }
    const compositeKey = ConversationUtility.CompositeKeyFromOpenResource(
      command,
      entity.PrimaryKeys.map(pk => pk.Name)
    );
    if (!compositeKey) {
      console.warn('open:resource: incomplete primary key', command.entityName, command);
      return;
    }
    this.OpenEntityRecord.emit({ entityName: command.entityName, compositeKey });
  }

  OnNavigationRequest(event: NavigationRequest): void {
    // Pass the event up to the parent component for app-level navigation
    this.navigationRequest.emit(event);
  }

  /** @deprecated Use {@link OnNavigationRequest}. */
  onNavigationRequest(event: NavigationRequest): void {
    return this.OnNavigationRequest(event);
  }

  ViewTestRun(testRunId: string): void {
    // Open the test run record in the entity viewer
    this.OpenEntityRecord.emit({
      entityName: 'MJ: Test Runs',
      compositeKey: CompositeKey.FromID(testRunId)
    });
  }

  /** @deprecated Use {@link ViewTestRun}. */
  viewTestRun(testRunId: string): void {
    return this.ViewTestRun(testRunId);
  }

  /**
   * A gear-gated developer link in the live call overlay asked to open a record
   * (delegated agent run / agent session). The overlay has already minimized itself
   * (the call stays live behind the floating "on call" pill); re-emit on the SAME
   * `openEntityRecord` chain every other chat record-open uses, so the Explorer
   * wrapper routes it through `NavigationService.OpenEntityRecord`.
   */
  OnRealtimeNavigateRequest(event: RealtimeNavigateRequest): void {
    // The overlay can name any entity — resolve its key column(s) from metadata, not a hardcoded ID.
    this.OpenEntityRecord.emit({
      entityName: event.EntityName,
      compositeKey: CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(event.EntityName), event.RecordID)
    });
  }

  /** @deprecated Use {@link OnRealtimeNavigateRequest}. */
  onRealtimeNavigateRequest(event: RealtimeNavigateRequest): void {
    return this.OnRealtimeNavigateRequest(event);
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
    void this.engine.EnsureConversationLoaded(created, this.CurrentUser);
    this.RealtimeConversationReady.emit({ conversationId: created, select: false });
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
    this.RealtimeConversationReady.emit({ conversationId, select: true });
  }

  /**
   * Surgically reloads the CURRENTLY-OPEN conversation's details so newly-persisted rows
   * (e.g. a just-ended realtime session's session-stamped caption turns) appear in the
   * timeline — and therefore in the "review past sessions" affordances — without a manual
   * browser refresh. Re-queries ONLY the active conversation (no broad reload), mirrors the
   * agent-completion refresh path, and no-ops when no conversation is open.
   */
  private async reloadActiveConversationTimeline(): Promise<void> {
    const conversationId = this.ConversationId;
    if (!conversationId) {
      return;
    }
    try {
      await this.windowStore.RefreshLatest(this.CurrentUser);
      if (!this.isActiveConversation(conversationId)) {
        return;
      }

      // Re-read the refreshed window
      const refreshed = this.windowStore.GetSnapshot();
      this.messages = refreshed.Details;

      // Reprocess peripheral data + realtime session meta (drives the timeline's session cards)
      this.lastLoadedConversationId = null;
      await this.loadPeripheralData(conversationId, refreshed);
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
  public async OnReviewStartLive(request: RealtimeStartLiveRequest): Promise<void> {
    const agentName = this.RealtimeReview?.AgentName ?? null;
    try {
      const start = this.RealtimeSession.StartRealtimeSession(
        request.TargetAgentId,
        request.ConversationId ?? this.ConversationId,
        request.LastSessionId,
        agentName,
        null, // preferredModelId
        null, // clientTools
        null, // coAgentId
        null, // configOverridesJson
        null, // recordingConsent
        null, // mediaCollectionId
        // App awareness — see message-input.startVoiceSession for the rationale.
        this.ApplicationId,
        this.AppContext as AppContextSnapshot | null
      );
      this.RealtimeReview = null;
      await start;
    } catch (error) {
      console.error('Failed to resume the reviewed session as a live call:', error);
      MJNotificationService.Instance.CreateSimpleNotification('Could not start the live session.', 'error', 3000);
    }
  }

  /** @deprecated Use {@link OnReviewStartLive}. */
  public async onReviewStartLive(request: RealtimeStartLiveRequest): Promise<void> {
    return this.OnReviewStartLive(request);
  }

  /** Review mode's Close: drop the review state (the overlay unhosts itself). */
  public OnReviewClosed(): void {
    this.ClearRealtimeSessionReview();
  }

  /** @deprecated Use {@link OnReviewClosed}. */
  public onReviewClosed(): void {
    return this.OnReviewClosed();
  }

  /**
   * A message reports that its run has gone quiet (MJ #4222).
   *
   * The reconciliation triggers all fire on transport events — a socket retry, a tab regaining
   * focus. This one fires on the symptom itself: a run that simply stopped reporting, with no event
   * anywhere to notice it. The message throttles its own requests, so this costs one narrow query
   * per quiet message per window.
   */
  OnLivenessCheckRequested(messageId: string): void {
    LogStatusEx({ message: `🫀 Message ${messageId} reports no recent progress — reconciling`, verboseOnly: true });
    void this.ReconcileNow('message-liveness');
  }

  /**
   * Handles Shift+Click on an AI message bubble.
   * Dumps a live snapshot of in-memory streaming and agent-run state to the browser
   * console so engineers can debug stuck/forever-spinning conversations without
   * needing to add any temporary code.
   *
   * Usage: Hold Shift and click any AI message bubble. Open DevTools Console to see the dump.
   */
  OnDiagnosticRequested(messageId: string): void {
    const streaming = this.streamingService.getDiagnosticSnapshot(messageId);
    const agentRun = this.AgentRunsByDetailId.get(messageId);
    const isInProgress = this.InProgressMessageIds.includes(messageId);

    console.group(`%c[MJ Diagnostic Dump] Message ${messageId}`, 'color: #0076b6; font-weight: bold');
    console.log('Timestamp:', new Date().toISOString());
    console.log('ConversationID:', this.ConversationId);
    console.log('isInProgress (UI):', isInProgress);
    console.log('All inProgressMessageIds:', [...this.InProgressMessageIds]);
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

  /** @deprecated Use {@link OnDiagnosticRequested}. */
  onDiagnosticRequested(messageId: string): void {
    return this.OnDiagnosticRequested(messageId);
  }

  OnTestFeedbackMessage(message: MJConversationDetailEntity): void {
    if (!message.TestRunID) {
      console.error('Cannot provide test feedback: message has no TestRunID');
      return;
    }

    this.TestFeedbackDialogData = {
      testRunId: message.TestRunID,
      conversationDetailId: message.ID,
      currentUser: this.CurrentUser
    };
    this.ShowTestFeedbackDialog = true;
  }

  /** @deprecated Use {@link OnTestFeedbackMessage}. */
  onTestFeedbackMessage(message: MJConversationDetailEntity): void {
    return this.OnTestFeedbackMessage(message);
  }

  OnTestFeedbackDialogClosed(result: TestFeedbackDialogResult): void {
    this.ShowTestFeedbackDialog = false;
    this.TestFeedbackDialogData = null;
    if (result.success) {
      console.log('Test feedback saved successfully:', result.feedbackId);
    }
  }

  /** @deprecated Use {@link OnTestFeedbackDialogClosed}. */
  onTestFeedbackDialogClosed(result: TestFeedbackDialogResult): void {
    return this.OnTestFeedbackDialogClosed(result);
  }

  OnTaskClicked(task: MJTaskEntity): void {
    // Pass task click up to workspace to navigate to Tasks tab
    this.TaskClicked.emit(task);
  }

  /** @deprecated Use {@link OnTaskClicked}. */
  onTaskClicked(task: MJTaskEntity): void {
    return this.OnTaskClicked(task);
  }

  OnNavigateToConversation(event: {conversationId: string; taskId: string}): void {
    // Navigate to the conversation with the active task - emit to parent
    // Parent will update its selection state
    // For now, we can't navigate to a different conversation from within chat area
    // This would require emitting an event to the parent
    console.log('Navigate to conversation requested:', event.conversationId);
  }

  /** @deprecated Use {@link OnNavigateToConversation}. */
  onNavigateToConversation(event: {conversationId: string; taskId: string}): void {
    return this.OnNavigateToConversation(event);
  }

  /**
   * Handle navigation request from artifact viewer Links tab
   */
  OnArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string}): void {
    LogStatusEx({message: '🔗 Chat area: Artifact link clicked', verboseOnly: true, additionalArgs: [event]});
    this.ArtifactLinkClicked.emit(event);
  }

  /** @deprecated Use {@link OnArtifactLinkNavigation}. */
  onArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string}): void {
    return this.OnArtifactLinkNavigation(event);
  }

  /**
   * Load permissions for the given artifact
   */
  private async loadArtifactPermissions(artifactId: string, expectedConversationId?: string | null, expectedSelectedArtifactId?: string | null): Promise<boolean> {
    const canApply = () => {
      const conversationOk = expectedConversationId === undefined || this.isActiveConversation(expectedConversationId);
      const artifactOk = !expectedSelectedArtifactId || UUIDsEqual(this.SelectedArtifactId, expectedSelectedArtifactId);
      return conversationOk && artifactOk;
    };

    // Guard against null/undefined
    if (!artifactId) {
      if (canApply()) {
        this.CanShareSelectedArtifact = false;
        this.CanEditSelectedArtifact = false;
      }
      return false;
    }

    try {
      const permissions = await this.artifactPermissionService.getUserPermissions(artifactId, this.CurrentUser);
      if (!canApply()) {
        return false;
      }
      this.CanShareSelectedArtifact = permissions.canShare;
      this.CanEditSelectedArtifact = permissions.canEdit;
      return true;
    } catch (error) {
      console.error('Failed to load artifact permissions:', error);
      if (canApply()) {
        this.CanShareSelectedArtifact = false;
        this.CanEditSelectedArtifact = false;
      }
      return false;
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
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OnArtifactShareRequested}. */
  async onArtifactShareRequested(artifactId: string): Promise<void> {
    return this.OnArtifactShareRequested(artifactId);
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
    const conversationId = this.ConversationId;
    if (!conversationId || !this.CurrentUser) return null;

    const messageInput = this.getActiveMessageInputComponent();
    const snapshotTitle = event.snapshot.title || 'Untitled Snapshot';

    try {
      const result = await this.analyzeArtifactService.CreateSnapshotArtifact({
        snapshot: event.snapshot,
        currentUser: this.CurrentUser,
        environmentId: this.EnvironmentId,
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
    const conversationId = this.ConversationId;
    console.log('[client:capture-data-snapshot] Handler invoked', { command, conversationId });
    if (!conversationId || !this.CurrentUser) {
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

    const panelAlreadyOpen = this.SelectedArtifactId === artifactId && this.ShowArtifactPanel;
    console.log(
      '[client:capture-data-snapshot] Panel state — currentSelectedId=' +
        this.SelectedArtifactId +
        ' showPanel=' +
        this.ShowArtifactPanel +
        ' panelAlreadyOpen=' +
        panelAlreadyOpen,
    );

    // Open the artifact panel so the viewer mounts (if it isn't already).
    if (!panelAlreadyOpen) {
      this.artifactSelectionEpoch++;
      this.SelectedArtifactId = artifactId;
      this.SelectedVersionNumber = undefined;
      this.ShowArtifactPanel = true;
      try {
        await this.loadArtifactPermissions(artifactId, conversationId, artifactId);
      } catch {
        // Non-fatal — permissions are for UI affordances, not capture
      }
      if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.SelectedArtifactId, artifactId)) {
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
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.SelectedArtifactId, artifactId)) {
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
    if (!this.ConversationId || !this.CurrentUser) return null;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Get all conversation detail IDs for this conversation, newest first.
      const detailsResult = await rv.RunView<MJConversationDetailEntity>(
        {
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ConversationID='${this.ConversationId}'`,
          Fields: ['ID'],
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'simple',
        },
        this.CurrentUser,
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
        this.CurrentUser,
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
        this.CurrentUser,
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
        this.CurrentUser,
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
  OnArtifactShareModalClose(): void {
    this.IsArtifactShareModalOpen = false;
    this.ArtifactToShare = null;
    this.cdr.detectChanges();
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
    if (this.SelectedArtifactId) {
      await this.loadArtifactPermissions(this.SelectedArtifactId);
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnArtifactShared}. */
  async onArtifactShared(): Promise<void> {
    return this.OnArtifactShared();
  }

  // Scroll functionality (pattern from skip-chat)
  CheckScroll(): void {
    if (!this.scrollContainer) return;

    const element = this.scrollContainer.nativeElement;
    const buffer = 15; // Tolerance in pixels
    const scrollDifference = element.scrollHeight - (element.scrollTop + element.clientHeight);
    const hasScrollableContent = element.scrollHeight > element.clientHeight + 50;
    const atBottom = scrollDifference <= buffer;
    this.readerAtBottom = atBottom;

    const newValue = !atBottom && hasScrollableContent;

    // Only update if value changed to prevent unnecessary change detection
    if (this.ShowScrollToBottomIcon !== newValue) {
      this.ShowScrollToBottomIcon = newValue;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link CheckScroll}. */
  checkScroll(): void {
    return this.CheckScroll();
  }

  ScrollToBottomNow(retryCount: number = 0): void {
    try {
      if (!this.scrollContainer) {
        if (retryCount < 10) {
          setTimeout(() => this.ScrollToBottomNow(retryCount + 1), 50);
        }
        return;
      }

      const element = this.scrollContainer.nativeElement;
      if (element.scrollHeight === 0 && retryCount < 10) {
        setTimeout(() => this.ScrollToBottomNow(retryCount + 1), 50);
      } else if (element.scrollHeight > 0) {
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  /** @deprecated Use {@link ScrollToBottomNow}. */
  scrollToBottomNow(retryCount: number = 0): void {
    return this.ScrollToBottomNow(retryCount);
  }

  ScrollToBottomAnimate(): void {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scroll({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }

  /** @deprecated Use {@link ScrollToBottomAnimate}. */
  scrollToBottomAnimate(): void {
    return this.ScrollToBottomAnimate();
  }

  /**
   * Decides where the viewport goes after the transcript changed.
   *
   * - `load`   — a conversation was opened: the bottom.
   * - `new`    — a message was appended: follow the tail, as before.
   * - `update` — a message already on screen changed in place (progress, status, streamed
   *              text). Never moves a reader who has scrolled away; keeps a reader who is
   *              at the bottom there as the bubble grows. (Before this, every progress
   *              update re-ran the send path's scroll — message-input re-emits
   *              `messageSent` per update — and yanked the reader to the bottom.)
   *
   * With `readReplyFromTop`, the reader's own message opens a turn — whether it arrives as
   * `new` or, on the auto-send path where the chat area already holds it, as `update` — and
   * every settled AI message of that turn (Complete or Error) lands the turn instead of
   * following, for a reader who was still following. EVERY settled message, not the first:
   * the refinement path emits a settled status line ("Continuing with X…") before the reply,
   * and a turn that landed on the status line alone must land again when the reply arrives
   * (re-landing is idempotent — the same target, or nothing once the reader has been moved
   * off the bottom). Completion is also emitted more than once for one message; none of those
   * emits may fall through to the bottom follow. A `load` does not forget the turn: creating
   * a conversation from the composer sends the first message while the initial load is still
   * in flight.
   */
  private followTranscript(change: 'load' | 'new' | 'update', message?: MJConversationDetailEntity): void {
    if (change === 'load') {
      this.scrollToBottom = true;
      return;
    }
    if (this.ReadReplyFromTop) {
      if (message?.Role === 'User' && message.ID && message.ID !== this.currentTurnStartMessageId) {
        this.currentTurnStartMessageId = message.ID;
      } else if (this.currentTurnStartMessageId && message?.Role === 'AI' && this.isSettled(message)) {
        if (this.readerAtBottom) {
          this.pendingTurnStartMessageId = this.currentTurnStartMessageId;
          this.scrollToBottom = false;
          this.bottomFollowSuppressedUntil = Date.now() + 1500;
        }
        return;
      }
    }
    if (change === 'new' || this.readerAtBottom) {
      if (change === 'new' && message?.Role === 'User') {
        // The reader sending again right after a reply landed must not be swallowed by the
        // landing's suppression. Only THEIR message lifts it: an AI message arriving new
        // inside the window belongs to the turn that just landed and must not cancel it.
        this.bottomFollowSuppressedUntil = 0;
      }
      this.scrollToBottom = true;
    }
  }

  private isSettled(message: MJConversationDetailEntity): boolean {
    return message.Status === 'Complete' || message.Status === 'Error';
  }

  /**
   * readReplyFromTop: once the reply has rendered, scrolls the turn so its first message
   * sits at the top of the pane — but only if the turn is taller than the pane. A turn that
   * fits is already fully on screen at the bottom, and moving it would be motion for nothing.
   */
  private scrollTurnToTop(messageId: string, attempt: number = 0): void {
    if (!this.ReadReplyFromTop) {
      return;
    }
    const container = this.scrollContainer?.nativeElement as HTMLElement | undefined;
    // Resolved through the list's timeline, not a `[data-message-id]` query: a far-off item
    // is unmounted into a spacer and a session-stamped row folds into its session card, and
    // the list answers with the node that stands for the message in either case.
    const target = this.messageListComponent?.FindTimelineElement(messageId) ?? null;
    if (!container || !target) {
      // The reply's final render lands a tick or two after the array changes — the same
      // latency the bottom-follow path absorbs with its 100 ms timer.
      if (attempt < 20) {
        this.turnStartRetryHandle = setTimeout(() => this.scrollTurnToTop(messageId, attempt + 1), 50);
      }
      return;
    }
    this.turnStartRetryHandle = null;
    const turnTop = this.offsetWithinScroller(target) - this.turnTopClearance(container);
    const turnHeight = container.scrollHeight - turnTop; // the turn is the newest content
    if (turnHeight > container.clientHeight) {
      container.scroll({ top: turnTop, behavior: 'smooth' });
    } else {
      this.ScrollToBottomNow();
    }
    this.CheckScroll();
  }

  /**
   * How far below the pane's top edge the turn's first message lands: the standard gap, plus
   * room for the list's sticky date header when it is showing — it pins to this scroller's
   * top and would otherwise sit on the message's first line.
   */
  private turnTopClearance(container: HTMLElement): number {
    const stickyHeader = container.querySelector<HTMLElement>('.sticky-date-header');
    if (!stickyHeader || !stickyHeader.offsetParent) {
      return ConversationChatAreaComponent.TURN_TOP_GAP_PX;
    }
    // The header's CSS inset (`top: 12px`), NOT `offsetTop`: on a pinned sticky element
    // `offsetTop` reports the used position, which tracks the scroll offset.
    const inset = parseFloat(getComputedStyle(stickyHeader).top) || 0;
    return ConversationChatAreaComponent.TURN_TOP_GAP_PX + stickyHeader.offsetHeight + inset;
  }

  /** An element's top edge in the scroller's content coordinates — what scrollTop counts in. */
  private offsetWithinScroller(el: HTMLElement): number {
    const container = this.scrollContainer.nativeElement as HTMLElement;
    return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  }

  private clearTurnTracking(): void {
    this.currentTurnStartMessageId = null;
    this.pendingTurnStartMessageId = null;
    this.bottomFollowSuppressedUntil = 0;
    if (this.turnStartRetryHandle) {
      clearTimeout(this.turnStartRetryHandle);
      this.turnStartRetryHandle = null;
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
  /**
   * Re-read the agent-run rows backing this conversation's in-progress messages, refreshing
   * {@link agentRunsByDetailId} in place.
   *
   * REQUIRED BEFORE ANY ON-DEMAND RECONCILE. {@link reconnectInProgressRuns} compares against
   * the in-memory map and never reloads it; on the conversation-load path that is safe only
   * because `loadPeripheralData` ran moments earlier off a fresh fetch. Invoked from a socket
   * reconnect or a tab regaining focus there has been no such fetch, so the map still holds the
   * stale `Running` status the outage froze it at — and the reconcile silently finds nothing to
   * do, which is indistinguishable from working (MJ #4222).
   *
   * Deliberately narrow: only the in-progress details, only the three fields the comparison
   * needs, `BypassCache` because the server wrote these rows through a different provider.
   * Cheaper than `windowStore.RefreshLatest()`, and cheap enough to run on every trigger.
   */
  private async refreshAgentRunsForInProgress(conversationId: string, loadToken: number): Promise<void> {
    const inProgressIds = this.messages
      .filter(m => m.Status === 'In-Progress' && m.Role === 'AI' && m.ID)
      .map(m => m.ID);

    if (inProgressIds.length === 0) {
      return;
    }

    const quoted = inProgressIds.map(id => `'${id}'`).join(',');
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJAIAgentRunEntityExtended>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `ConversationDetailID IN (${quoted})`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object',
      BypassCache: true
    }, this.currentUser);

    if (!result.Success || !this.isActiveConversationLoad(conversationId, loadToken)) {
      return;
    }

    // `OrderBy __mj_CreatedAt DESC` puts the newest run first, so the first row seen for a detail
    // in THIS pass wins — a retried message must reconcile against its latest run, not its first.
    // Tracked per pass rather than by consulting the map, which usually already holds a run from
    // an earlier pass and is cleared only on conversation load.
    const seenDetailIds = new Set<string>();
    for (const run of result.Results || []) {
      const detailId = run.ConversationDetailID;
      if (!detailId || seenDetailIds.has(detailId)) {
        continue;
      }
      seenDetailIds.add(detailId);
      this.agentRunsByDetailId.set(detailId, run);
    }
    // New map reference so OnPush children re-read it.
    this.agentRunsByDetailId = new Map(this.agentRunsByDetailId);
  }

  /**
   * Reconcile in-progress messages against durable server state, on demand.
   *
   * This is the recovery path for the case the five close-event-driven mechanisms all miss: a
   * completion published while the client's transport was silently dead. Tier 0 makes the socket
   * close; this is what recovers the event that was dropped while it was down.
   *
   * @param reason What prompted it — carried only for logging.
   */
  public async ReconcileNow(reason: string): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId || !this.currentUser) {
      return;
    }

    // READ the token, never `++` it. `conversationLoadToken` is a CANCELLATION token: every
    // in-flight conversation load checks it and bails when it changes, so incrementing here
    // would abort a load already running rather than merely tagging this work.
    const loadToken = this.conversationLoadToken;

    LogStatusEx({ message: `🔁 Reconciling in-progress runs (${reason})`, verboseOnly: true });
    try {
      await this.refreshAgentRunsForInProgress(conversationId, loadToken);
      if (!this.isActiveConversationLoad(conversationId, loadToken)) {
        return;
      }
      await this.detectAndReconcileAgentRuns(conversationId, loadToken);
    } catch (error) {
      // Recovery is best-effort: a failed reconcile must never surface as a user-facing error,
      // and the next trigger will try again.
      console.error('[ConversationChatArea] Reconciliation failed:', error);
    }
  }

  /**
   * Ask the durable read model whether a message we still show as in-progress has in fact finished.
   *
   * The last gap in the recovery chain. Everything else here reads `MJ: AI Agent Runs` through the
   * client's own provider; when that returns nothing the message simply waits. The tail query reads
   * the same truth server-side from a cursor, reports the conversation detail's own status, and runs
   * over HTTP — so it answers while the WebSocket is still down, which is the whole point.
   *
   * Completion is routed through the existing {@link handleMessageCompletion}, never written here:
   * four writers already move a message out of In-Progress and a fifth would race them.
   *
   * @returns true when the message was completed from durable state.
   */
  private async tryRecoverFromTail(
    message: MJConversationDetailEntity,
    conversationId: string,
    loadToken: number
  ): Promise<boolean> {
    const tail = ConversationsRuntime.Instance.Tail;
    const result = await tail.Tail(message.ID);

    if (!result.Success || !this.isActiveConversationLoad(conversationId, loadToken)) {
      return false;
    }

    // `IsInFlight` false means the server considers the run finished. A terminal `DetailStatus`
    // with no run at all covers the case where the detail was completed by something other than an
    // agent run. Either way the message must stop spinning.
    const detailIsTerminal = result.DetailStatus === 'Complete' || result.DetailStatus === 'Error';
    const runIsTerminal = result.RunID != null && !result.IsInFlight;

    if (!runIsTerminal && !detailIsTerminal) {
      return false;
    }

    // A terminal run beside a detail the server still reports as open is the orphan window, which
    // the server-side reconciler closes after its grace period. `handleMessageCompletion` re-reads
    // the detail rather than writing it, so completing here cannot settle the message; it would
    // reload the whole conversation on every trigger and leave it spinning regardless. Keep the
    // cursor and wait for the row to close.
    if (!detailIsTerminal && result.DetailStatus === 'In-Progress') {
      LogStatusEx({
        message: `📼 Tail reports run ${result.RunID} finished but detail ${message.ID} is still open — leaving it to the reconciler`,
        verboseOnly: true
      });
      return false;
    }

    LogStatusEx({
      message: `📼 Tail reports message ${message.ID} finished (run ${result.RunID ?? 'none'}, status ${result.RunStatus ?? result.DetailStatus}) — completing`,
      verboseOnly: true
    });
    await this.handleMessageCompletion(message, result.RunID ?? '', conversationId, loadToken);
    // The message is terminal, so its cursor will never advance again.
    tail.Forget(message.ID);
    return true;
  }

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
      const agentRun = this.AgentRunsByDetailId.get(message.ID);

      if (agentRun && completedStatuses.includes(agentRun.Status)) {
        // Fast path: the run we just refreshed already proves the work is over.
        LogStatusEx({message: `🔄 Agent run ${agentRun.ID} already completed (${agentRun.Status}) for message ${message.ID}, handling catch-up...`, verboseOnly: true});
        await this.handleMessageCompletion(message, agentRun.ID, conversationId, loadToken);
        ConversationsRuntime.Instance.Tail.Forget(message.ID);
        continue;
      }

      // Otherwise ask durable state. Reached when there is no run row yet — fire-and-forget
      // acknowledges before the INSERT — and ALSO when the run row still reads non-terminal,
      // because the run is not the only thing that can finish a message: the tail reports the
      // conversation detail's own status, which the run map does not carry at all. Consulting it
      // here rather than only on a missing run is what keeps the cursor meaningful and stops a
      // detail that was completed by anything other than its run from spinning forever.
      const recovered = await this.tryRecoverFromTail(message, conversationId, loadToken);
      if (!recovered) {
        LogStatusEx({
          message: agentRun
            ? `🔌 Agent run ${agentRun.ID} still ${agentRun.Status} for message ${message.ID}; durable state agrees it is running`
            : `⏳ No agent run found for in-progress message ${message.ID}, waiting for server...`,
          verboseOnly: true
        });
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
      const agentRun = this.AgentRunsByDetailId.get(message.ID);
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
    if (!this.PendingArtifactId) {
      return; // No pending navigation
    }
    const pendingTargetConversationId = this.PendingArtifactConversationId ?? this.ConversationId;
    if (!this.PendingArtifactId || !this.isActiveConversation(pendingTargetConversationId)) {
      return;
    }

    console.log('📦 Processing pending artifact navigation:', this.PendingArtifactId, 'v' + this.PendingArtifactVersionNumber);

    // Capture values before emitting consumed event
    const artifactIdToOpen = this.PendingArtifactId;
    const versionNumberToOpen = this.PendingArtifactVersionNumber;
    const conversationId = this.ConversationId;

    // Notify parent that we consumed the pending artifact
    this.PendingArtifactConsumed.emit();

    // Find the message containing this artifact version
    let messageIdWithArtifact: string | null = null;

    for (const [detailId, artifactList] of this.ArtifactsByDetailId.entries()) {
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
    this.artifactSelectionEpoch++;
    this.SelectedArtifactId = artifactIdToOpen;
    this.SelectedVersionNumber = versionNumberToOpen ?? undefined;
    this.ShowArtifactPanel = true;

    // Load permissions for the artifact
    await this.loadArtifactPermissions(artifactIdToOpen, conversationId, artifactIdToOpen);
    if (!this.isActiveConversation(conversationId) || !UUIDsEqual(this.SelectedArtifactId, artifactIdToOpen)) {
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
  async OnIntentCheckStarted(event: {conversationId: string}): Promise<void> {
    // Guard: ignore intent-check UI from a background conversation's input after a swap,
    // so the "Analyzing..." placeholder isn't injected into the displayed conversation.
    if (!this.isActiveConversation(event.conversationId)) {
      return;
    }
    const md = this.ProviderToUse;
    const tempMessage = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.CurrentUser);

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
    this.followTranscript('new', tempMessage);
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnIntentCheckStarted}. */
  async onIntentCheckStarted(event: {conversationId: string}): Promise<void> {
    return this.OnIntentCheckStarted(event);
  }

  /**
   * Handle intent check completed - remove temporary message
   */
  OnIntentCheckCompleted(event: {conversationId: string}): void {
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

  /** @deprecated Use {@link OnIntentCheckCompleted}. */
  onIntentCheckCompleted(event: {conversationId: string}): void {
    return this.OnIntentCheckCompleted(event);
  }
}
