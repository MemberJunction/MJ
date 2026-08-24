import {
  Component,
  Input,
  Output,
  HostBinding,
  EventEmitter,
  ViewChild,
  ViewContainerRef,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ElementRef,
  AfterViewInit,
  AfterViewChecked,
  ComponentRef,
  EmbeddedViewRef,
  TemplateRef
} from '@angular/core';
import { MJConversationDetailEntity, MJConversationEntity, RatingJSON } from '@memberjunction/core-entities';
import { UserInfo, CompositeKey } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MessageItemComponent, MessageAttachment } from './message-item.component';
import {
  BeforeResponseFormSubmittedEventArgs,
  AfterResponseFormSubmittedEventArgs,
} from '../../events/chat-events';
import { RealtimeSessionTimelineCardComponent } from '../realtime/realtime-session-timeline-card.component';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { selectDistinctLatestArtifacts } from '../../utils/distinct-artifacts';
import {
  BuildConversationTimeline,
  ConversationTimelineItem,
  RealtimeSessionTimelineGroup,
  RealtimeSessionTimelineMeta
} from '../../utils/realtime-session-timeline';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { DEFAULT_TRANSCRIPT_PAGE_SIZE } from '../../utils/conversation-detail-window';
import {
    ResolveDateJumpTarget,
    type DateJumpPeriod,
    type DateJumpOutcome
} from '../../utils/date-jump';

/** Context handed to the `messageRenderer` slot template per message. */
interface MessageRendererContext {
  $implicit: MJConversationDetailEntity;
  message: MJConversationDetailEntity;
}

/**
 * One per rendered message in the list. Three paths can produce an entry:
 *   - `component`        — the default `MessageItemComponent` (single message).
 *   - `embedded`         — an `EmbeddedViewRef` from the consumer's
 *                          `messageRenderer` slot template (full per-message
 *                          replacement, PR 2c slot system).
 *   - `realtime-session` — a `RealtimeSessionTimelineCardComponent` collapsing
 *                          an entire past realtime session into one timeline
 *                          card (PR #2787 co-agent timeline). The grouping pass
 *                          (`BuildConversationTimeline`) emits these alongside
 *                          normal messages — see the timeline utility for the
 *                          rules.
 *
 * Discriminated by the `kind` tag for ergonomic narrowing.
 */
type RenderedMessageEntry =
  | { kind: 'component'; ref: ComponentRef<MessageItemComponent> }
  | { kind: 'embedded'; ref: EmbeddedViewRef<MessageRendererContext> }
  | { kind: 'realtime-session'; ref: ComponentRef<RealtimeSessionTimelineCardComponent> }
  /**
   * A timeline item that has been UNMOUNTED to keep the DOM bounded — replaced by a
   * fixed-height div so the scroll range is unchanged. Stored under the item's own
   * timeline key so it can be swapped back for the real view on scroll-back.
   */
  | { kind: 'spacer'; ref: EmbeddedViewRef<SpacerContext> };

/** Context for the spacer template — the height the unmounted item occupied. */
interface SpacerContext {
  height: number;
}

/**
 * Container component for displaying a list of messages
 * Uses dynamic component creation (like skip-chat) to avoid Angular binding overhead
 * This dramatically improves performance when messages are added/removed
 */
/** Dropdown label per period. Kept beside the guard so a new period cannot render blank. */
const DATE_JUMP_LABELS: Record<DateJumpPeriod, string> = {
    'today': 'Today',
    'yesterday': 'Yesterday',
    'last-week': 'Last week',
    'last-month': 'Last month'
};

/** Narrows the template's string to the period union — the template cannot type its own literals. */
function isDateJumpPeriod(value: string): value is DateJumpPeriod {
    return Object.prototype.hasOwnProperty.call(DATE_JUMP_LABELS, value);
}

@Component({
  standalone: false,
  selector: 'mj-conversation-message-list',
  templateUrl: './message-list.component.html',
  styleUrls: ['./message-list.component.css']
})
export class MessageListComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit, AfterViewChecked {
  @Input() public messages: MJConversationDetailEntity[] = [];
  @Input() public conversation!: MJConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public isProcessing: boolean = false;
  /** Whether the built-in "No messages yet" filler renders for empty conversations. Hosts with their own empty-state chrome set false. */
  @Input() public showEmptyFill: boolean = true;
  /** Whether the sticky date header + jump-to-date dropdown render. */
  @Input() public showDateNavigation: boolean = true;
  // Per-message feature gates — forwarded onto each MessageItemComponent instance
  // (see applyMessageItemFeatureFlags). All default true.
  @Input() public showAgentRunDetails: boolean = true;
  @Input() public showReactions: boolean = true;
  @Input() public showMessageRating: boolean = true;
  @Input() public allowPinning: boolean = true;
  @Input() public allowMessageEdit: boolean = true;
  @Input() public allowMessageDelete: boolean = true;

  // ── Windowed-transcript paging state ────────────────────────────────────────
  // The list renders only the LOADED window, not the whole conversation. These two
  // describe what lies above it. Unused until the Phase 5 sentinel lands; wired now so
  // the host binding is in place and the component's contract is stable.

  /**
   * True when older pages remain above the loaded window.
   *
   * Setter rather than a plain input: flipping this creates or destroys the sentinel via
   * `@if`, and the observer has to be re-pointed at the new element. Relying on an ambient
   * `ngAfterViewChecked` tick to notice is fragile — once the list settles there may not be
   * another one.
   */
  @Input()
  public set HasMoreAbove(value: boolean) {
    if (value === this._hasMoreAbove) {
      return;
    }
    this._hasMoreAbove = value;
    // Gates the date navigator too — see updateDateFilterVisibility. Without this the button
    // would only re-evaluate on a `messages` change, so exhausting history would leave it up.
    this.updateDateFilterVisibility();
    // Deferred: the `@if` has not rendered the sentinel yet at set time.
    Promise.resolve().then(() => this.syncOlderObserver());
  }
  public get HasMoreAbove(): boolean {
    return this._hasMoreAbove;
  }
  private _hasMoreAbove = false;

  /** True while an older page is in flight. */
  @Input() public IsLoadingOlder: boolean = false;

  /**
   * The host's scrolling element, used as the sentinel observer's root.
   *
   * This component's own container does NOT scroll — hosts wrap it in their own scroller
   * (in the chat area, `.chat-messages-container`, which carries the `min-height: 0` a flex
   * child needs). Passing it in is deterministic; discovering it by walking the DOM depends
   * on layout having settled, which is not knowable from in here.
   *
   * Optional: when omitted the component falls back to walking its ancestors.
   */
  @Input()
  public set ScrollRoot(value: HTMLElement | null | undefined) {
    const next = value ?? null;
    if (next === this._scrollRoot) {
      return;
    }
    this._scrollRoot = next;
    this._scrollParent = next;
    // The root changed, so any live observer is pointed at the wrong element.
    Promise.resolve().then(() => this.syncOlderObserver());
  }
  public get ScrollRoot(): HTMLElement | null {
    return this._scrollRoot;
  }
  private _scrollRoot: HTMLElement | null = null;

  /**
   * Marks the host as "someone else owns the scrolling", which drops `overflow-y` on this
   * component's own container.
   *
   * `position: sticky` pins to the nearest ancestor with `overflow-y: auto|scroll`. When a
   * host supplies a scroller, this component's container still declared `overflow-y: auto`
   * but never actually scrolled (its content grows to fit), so the sticky date header bound
   * to a container whose `scrollTop` is permanently 0 — it rendered, then rode out of view
   * with the messages and could not be clicked.
   *
   * Driven off `_scrollRoot` rather than `resolveScrollParent()` on purpose: the DOM walk is
   * lazy and layout-dependent, and dropping `overflow-y` for a consumer that turned out to
   * have NO scrolling ancestor would leave the transcript unable to scroll or page at all.
   * The explicit input is the only signal that is safe here — a host that passes it has, by
   * definition, a scroller of its own.
   */
  @HostBinding('class.mj-list-host-scrolled')
  public get HostSuppliesScroller(): boolean {
    return this._scrollRoot !== null;
  }

  // ── Assistant identity overrides — static host config forwarded to every message
  //    item (null = engine identity). Setters (not ngOnChanges) so an imperative
  //    host — `@ViewChild(MessageListComponent).assistantDisplayName = …` — restamps
  //    too, and so identity changes don't pay a check on every other input's cycle.
  //    Identity can land AFTER first render (branding resolves async) or change
  //    mid-session (per-conversation persona), and message items are created
  //    dynamically with the overrides stamped as static config — so a change has to
  //    restamp the ALREADY-rendered items or existing bubbles keep the old identity
  //    until the next messages-array mutation. ──
  /** Display name shown on AI messages. Null = the engine-resolved agent name. */
  @Input()
  public set assistantDisplayName(value: string | null) {
    if (value !== this._assistantDisplayName) {
      this._assistantDisplayName = value;
      this.restampAssistantIdentity();
    }
  }
  public get assistantDisplayName(): string | null {
    return this._assistantDisplayName;
  }
  private _assistantDisplayName: string | null = null;

  /** Image URL for the AI message avatar. Null = the agent's Font Awesome icon. */
  @Input()
  public set assistantAvatarUrl(value: string | null) {
    if (value !== this._assistantAvatarUrl) {
      this._assistantAvatarUrl = value;
      this.restampAssistantIdentity();
    }
  }
  public get assistantAvatarUrl(): string | null {
    return this._assistantAvatarUrl;
  }
  private _assistantAvatarUrl: string | null = null;
  @Input() public artifactMap: Map<string, LazyArtifactInfo[]> = new Map();
  @Input() public agentRunMap: Map<string, MJAIAgentRunEntityExtended> = new Map();
  @Input() public ratingsMap: Map<string, RatingJSON[]> = new Map();
  @Input() public userAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();
  @Input() public attachmentsMap: Map<string, MessageAttachment[]> = new Map();
  /**
   * Optional session-row enrichment for realtime SESSION BLOCKS, keyed by
   * `NormalizeUUID(sessionId)` (agent name / status / close reason). Details stamped
   * with an `AgentSessionID` collapse into one timeline card per session — see
   * `BuildConversationTimeline` — and this map dresses those cards up when present.
   */
  @Input() public sessionMetaMap: Map<string, RealtimeSessionTimelineMeta> = new Map();

  /**
   * Optional per-iteration custom message renderer. When set, the list renders each
   * message via this template (full replacement) instead of the default
   * `MessageItemComponent`. Forwarded by chat-area when a consumer projects
   * `mjChatSlot="messageRenderer"`. The template receives the message as
   * `$implicit` and as a named `message` context binding.
   *
   * Consumers opting into a custom renderer take full responsibility for displaying
   * the message — edit/delete/retry affordances, artifacts, ratings, attachments,
   * etc. The minimal `MJChatMessageBubbleDefaultComponent` ships as a ready-to-use
   * bubble renderer.
   */
  @Input() public messageRendererTemplate: TemplateRef<unknown> | null = null;

  /**
   * Optional per-message additive decoration template, projected INSIDE the default
   * `MessageItemComponent` (after the message text). Forwarded by chat-area when a
   * consumer projects `mjChatSlot="messageExtra"`. Ignored when
   * `messageRendererTemplate` is set (custom renderers own all per-message content).
   */
  @Input() public messageExtraTemplate: TemplateRef<unknown> | null = null;

  @Output() public editMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public deleteMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public retryMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public testFeedbackMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public replyInThread = new EventEmitter<MJConversationDetailEntity>();
  @Output() public viewThread = new EventEmitter<MJConversationDetailEntity>();
  @Output() public messageEdited = new EventEmitter<MJConversationDetailEntity>();
  @Output() public openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() public suggestedResponseSelected = new EventEmitter<{text: string; customInput?: string}>();
  @Output() public attachmentClicked = new EventEmitter<MessageAttachment>();
  @Output() public diagnosticRequested = new EventEmitter<string>(); // emits messageId
  @Output() public messagePinToggled = new EventEmitter<MJConversationDetailEntity>();
  /** Emitted with the `MJ: AI Agent Sessions.ID` when a realtime session block's Open affordance is clicked. */
  @Output() public realtimeSessionOpenRequested = new EventEmitter<string>();

  /** Forwarded from MessageItemComponent — see its docs. */
  @Output() public beforeResponseFormSubmitted = new EventEmitter<BeforeResponseFormSubmittedEventArgs>();
  /** Forwarded from MessageItemComponent — see its docs. */
  @Output() public afterResponseFormSubmitted = new EventEmitter<AfterResponseFormSubmittedEventArgs>();

  /**
   * Asks the host to load the next older page. Fired when the "earlier messages"
   * sentinel scrolls into view — never on a raw scroll event, so a fast scroll costs
   * one emit rather than one per pixel.
   */
  @Output() public OlderRequested = new EventEmitter<void>();

  /**
   * Asks the host to page older history far enough back to satisfy a date jump, then scroll.
   * Emitted instead of handled locally because paging belongs to the window store.
   */
  @Output() public DateJumpRequested = new EventEmitter<DateJumpPeriod>();

  @ViewChild('messageContainer', { read: ViewContainerRef }) messageContainerRef!: ViewContainerRef;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  /** Only present while `HasMoreAbove` is true — the `@if` creates and destroys it. */
  @ViewChild('olderSentinel') olderSentinel?: ElementRef<HTMLElement>;
  /** Template rendered in place of an unmounted timeline item. */
  @ViewChild('spacerTemplate') private spacerTemplate?: TemplateRef<SpacerContext>;

  /**
   * Per-message rendered entries — see `RenderedMessageEntry` for the 3-way
   * union (default MessageItemComponent / consumer messageRenderer slot
   * embedded view / collapsed realtime session timeline card).
   */
  private _renderedMessages = new Map<string, RenderedMessageEntry>();
  private _shouldScrollToBottom = false;
  private _previousMessageCount = 0; // Track previous count to detect new messages

  /** Watches the "earlier messages" sentinel. Rebuilt whenever the sentinel comes or goes. */
  private _olderObserver?: IntersectionObserver;
  /**
   * Set when the newest render PREPENDED older content, so `ngAfterViewChecked` can hold
   * the user's reading position instead of letting the browser's pixel-based `scrollTop`
   * slide them to unfamiliar content.
   */
  private _restoreScrollAfterPrepend = false;
  /** `scrollHeight` captured immediately before a prepend render. */
  private _heightBeforePrepend = 0;
  /** Memoized result of {@link resolveScrollParent} — the host's scroller, not ours. */
  private _scrollParent: HTMLElement | null = null;
  /** What the live observer is currently watching, so a stale pairing can be detected. */
  private _observedSentinel: HTMLElement | null = null;
  private _observedRoot: HTMLElement | null = null;
  /** Guards the no-scroll-parent warning so it fires once, not every checked cycle. */
  private _warnedNoScrollParent = false;
  /** Guards the missing-spacer-template warning the same way. */
  private _warnedNoSpacerTemplate = false;

  // ── DOM unmount (bounded transcript) ────────────────────────────────────────
  // Paging up 20 times would otherwise leave 200 live MessageItemComponents mounted.
  // Items far from the viewport are destroyed and replaced by a height-holding spacer,
  // then remounted from `messages` (already in memory — no network) on scroll-back.

  /** Rendered pixel height per timeline key, captured just before an item is unmounted. */
  private _measuredHeights = new Map<string, number>();
  /** Watches spacers so an item remounts as the user scrolls back toward it. */
  private _spacerObserver?: IntersectionObserver;
  /** Which spacers the live observer is watching, so it is only rebuilt when the set changes. */
  private _observedSpacerKeys = '';
  /** Scroller the window listener is attached to, and its coalescing frame handle. */
  private _scrollListenerTarget: HTMLElement | null = null;
  private _onScroll: (() => void) | null = null;
  private _scrollFrame: number | null = null;

  /** Items kept mounted beyond the visible page, above and below. */
  private static readonly MOUNT_BUFFER = 5;
  /**
   * Height used for an item unmounted before it was ever measured. Only a first-render
   * fallback — a real measurement replaces it and is preferred forever after.
   */
  private static readonly ESTIMATED_MESSAGE_HEIGHT = 72;
  private static readonly ESTIMATED_SESSION_HEIGHT = 88;
  /** Frames spent waiting for a scroller to appear, and the pending rAF handle. */
  private _scrollParentRetries = 0;
  private _scrollParentRetryHandle: number | null = null;
  /** ~1s at 60fps — long enough for layout to settle, short enough to report a real fault. */
  private static readonly MAX_SCROLL_PARENT_RETRIES = 60;
  /**
   * Render key of the FIRST timeline item last time we rendered. A change here means older
   * content arrived at the head — the only reliable way to tell a prepend from an append,
   * since both grow `messages.length`.
   */
  private _previousFirstKey: string | null = null;

  public currentDateDisplay: string = 'Today';
  public showDateNav: boolean = false;
  public shouldShowDateFilter: boolean = false;

  constructor(private cdRef: ChangeDetectorRef, private hostRef: ElementRef<HTMLElement>) {
    super();
  }

  public toggleDateNav(): void {
    this.showDateNav = !this.showDateNav;
  }

  /**
   * Handles a date-navigator selection.
   *
   * The list cannot page history itself — it is a Generic widget with no store — so it asks
   * the host, which owns the window and runs the older-page loop, then calls back into
   * {@link ScrollToDateTarget}. The label updates immediately so the dropdown feels responsive
   * while paging runs.
   */
  public jumpToDate(period: string): void {
    this.showDateNav = false;
    if (!isDateJumpPeriod(period)) {
      return;
    }
    this.currentDateDisplay = DATE_JUMP_LABELS[period];
    this.DateJumpRequested.emit(period);
  }

  /**
   * Scrolls to the start of `period` within the currently loaded messages.
   *
   * Called by the host AFTER it has paged as far back as it intends to, so whatever is loaded
   * now is the best answer available. Returns the outcome rather than failing silently — the
   * plan's explicit requirement for this path.
   */
  public ScrollToDateTarget(period: DateJumpPeriod): DateJumpOutcome {
    if (!this.messages || this.messages.length === 0) {
      return 'empty';
    }

    const { Detail } = ResolveDateJumpTarget(this.messages, period, new Date());
    // A miss lands the user on the oldest loaded message — where paging left them — rather
    // than leaving the viewport wherever it happened to be.
    const target = Detail ?? this.messages[0];
    const scrolled = this.scrollToDetail(target);
    if (!scrolled) {
      return 'empty';
    }
    return Detail ? 'reached' : 'oldest';
  }

  /**
   * Scrolls a loaded detail into view, mounted or not.
   *
   * Resolves through the TIMELINE KEY rather than querying `[data-message-id]`, because the
   * jump target is by definition far above the viewport — exactly the region this component
   * unmounts and replaces with height-holding spacers. A DOM query for the message id misses
   * every unmounted target, which made a legitimate jump report "nothing loaded to jump to".
   *
   * Spacers carry the same timeline key as the item they stand in for, so scrolling to the
   * key lands on the right place either way; the spacer observer then remounts the real item
   * as it enters the viewport.
   */
  private scrollToDetail(detail: MJConversationDetailEntity): boolean {
    return this.scrollToTimelineEntry(detail.ID, detail.AgentSessionID, 'start');
  }

  /**
   * Scrolls a LOADED message into view by id, mounted or not, and returns whether it landed.
   *
   * Public because the pins panel's "Jump to message" lives on the host: a pin can be far
   * above the viewport, which is exactly the region this component unmounts into spacers, so
   * the host's own `[data-message-id]` query found nothing and the button silently did
   * nothing. Resolution goes through the timeline key instead — see
   * {@link scrollToTimelineEntry}.
   *
   * Returns false when the message is not in the loaded window at all; the host decides
   * whether to page back for it or tell the user.
   */
  public ScrollToMessage(messageId: string): boolean {
    const detail = this.messages?.find(m => UUIDsEqual(m.ID, messageId));
    if (!detail) {
      return false;
    }
    return this.scrollToTimelineEntry(detail.ID, detail.AgentSessionID, 'center');
  }

  /**
   * Shared resolution for both jump paths: timeline key -> rendered node.
   *
   * Two things a `[data-message-id]` query cannot do, and both matter here:
   *   - A session-stamped row folds into its session CARD, so the row itself never has a
   *     node of its own; the card is what is on screen.
   *   - An item far from the viewport is unmounted and replaced by a height-holding spacer,
   *     which carries the SAME timeline key — so scrolling to the key lands in the right
   *     place either way, and the spacer observer remounts the real item on arrival.
   */
  private scrollToTimelineEntry(
    detailId: string,
    agentSessionId: string | null,
    block: ScrollLogicalPosition
  ): boolean {
    const stampedSessionId = agentSessionId?.trim() || null;
    const timeline = BuildConversationTimeline(this.messages);
    const item = timeline.find(entry =>
      entry.Kind === 'session'
        ? stampedSessionId !== null && UUIDsEqual(entry.Group.SessionID, stampedSessionId)
        : UUIDsEqual(entry.Detail.ID, detailId)
    );
    if (!item) {
      return false;
    }

    const node = this.nodeForKey(this.getTimelineKey(item));
    if (!node) {
      return false;
    }
    node.scrollIntoView({ behavior: 'smooth', block });
    return true;
  }

  // Track whether initial render has happened
  private _initialRenderComplete = false;

  ngOnInit() {
    // Initial render will happen in ngAfterViewInit when ViewContainerRef is available
  }

  ngAfterViewInit() {
    // ViewContainerRef is now available - perform initial render if we have messages
    if (this.messages && this.messages.length > 0 && this.messageContainerRef && !this._initialRenderComplete) {
      this._initialRenderComplete = true;
      this.updateMessages(this.messages);
      this.updateDateFilterVisibility();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // React to messages array changes
    // Note: On initial load, messageContainerRef may not be available yet (ngOnChanges runs before ngAfterViewInit)
    // In that case, ngAfterViewInit will handle the initial render
    if (changes['messages'] && this.messages && this.messageContainerRef) {
      this._initialRenderComplete = true;
      // Capture the pre-render height so a prepend can be corrected for. Must happen
      // BEFORE updateMessages — afterwards the new rows are already in the layout — and
      // must read the HOST's scroller, which is the element whose height actually changes.
      this._heightBeforePrepend = this.resolveScrollParent()?.scrollHeight ?? 0;
      this.updateMessages(this.messages);
      this.updateDateFilterVisibility();
    }

    // Watch for artifactMap changes to handle newly created artifacts
    // While artifacts are pre-loaded during initial peripheral data load,
    // new artifacts can be created mid-conversation (e.g., by agent runs)
    // This ensures artifact cards appear in messages immediately without requiring a refresh
    if (changes['artifactMap'] && this.messages && this.messageContainerRef) {
      this.updateMessages(this.messages);
    }

    // Watch for attachmentsMap changes to handle newly created attachments
    // This ensures media attachments (e.g., images generated by agents) appear
    // immediately without requiring a page refresh
    if (changes['attachmentsMap'] && this.messages && this.messageContainerRef) {
      this.updateMessages(this.messages);
    }

    // Watch for session-meta changes so realtime session blocks pick up their
    // agent name / status chip once the (async, batched) session lookup lands
    if (changes['sessionMetaMap'] && this.messages && this.messageContainerRef) {
      this.updateMessages(this.messages);
    }

  }

  /**
   * Re-stamp the assistant-identity overrides onto every already-rendered message
   * item. Called from the identity setters (see the inputs above) — items are created
   * dynamically with these values stamped as static config, so without this a change
   * that arrives after first render wouldn't reach existing bubbles.
   *
   * No-op before the first render (the map is empty), so it's safe to fire during
   * Angular's initial input binding.
   */
  private restampAssistantIdentity(): void {
    for (const entry of this._renderedMessages.values()) {
      if (entry.kind === 'component') {
        this.applyMessageItemFeatureFlags(entry.ref.instance);
        entry.ref.changeDetectorRef.markForCheck();
      }
    }
  }

  ngAfterViewChecked() {
    // Mutually exclusive on purpose: scrolling to the bottom would undo a prepend restore.
    if (this._restoreScrollAfterPrepend) {
      this.restoreScrollAfterPrepend();
      this._restoreScrollAfterPrepend = false;
    } else if (this._shouldScrollToBottom) {
      this.scrollToBottom();
      this._shouldScrollToBottom = false;
    }
    // Measure while things are on screen, so an item has a real height recorded before it
    // ever needs a spacer — the plan's "measure offsetHeight the first time an item is
    // mounted and remember it by key".
    this.measureMountedItems();
    this.syncScrollListener();
    this.syncOlderObserver();
    this.syncSpacerObserver();
  }

  /** The rendered sentinel, read from the DOM so it does not depend on view-query timing. */
  private findSentinelElement(): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector('.transcript-older-sentinel');
  }

  /**
   * Whether this instance is actually on screen.
   *
   * `offsetParent` is null for any element in a `display: none` subtree — which is how the
   * chat area parks the message lists of conversations you are not currently looking at.
   */
  private isHostVisible(): boolean {
    const host = this.hostRef.nativeElement;
    return host.offsetParent !== null || getComputedStyle(host).position === 'fixed';
  }

  /**
   * Retries {@link syncOlderObserver} on animation frames until a scroller appears.
   *
   * Bounded: after {@link MAX_SCROLL_PARENT_RETRIES} frames it gives up and logs the DOM
   * chain it walked, so a genuine host-layout problem names itself instead of presenting
   * as "paging silently doesn't work".
   */
  private scheduleScrollParentRetry(): void {
    if (this._scrollParentRetryHandle !== null) {
      return;   // one retry loop at a time
    }
    // A HIDDEN instance can never resolve a scroller: the chat area keeps one message list
    // alive per visited conversation in a DOM cache, and a display:none subtree reports
    // every height as 0, so `scrollHeight > clientHeight` is false all the way up. Keep
    // waiting (it may be shown later) but never burn the retry budget or warn — that noise
    // would point at the wrong instance entirely.
    if (!this.isHostVisible()) {
      this._scrollParentRetryHandle = requestAnimationFrame(() => {
        this._scrollParentRetryHandle = null;
        this.syncOlderObserver();
      });
      return;
    }
    if (this._scrollParentRetries >= MessageListComponent.MAX_SCROLL_PARENT_RETRIES) {
      this.warnNoScrollParentOnce();
      return;
    }
    this._scrollParentRetries++;
    this._scrollParentRetryHandle = requestAnimationFrame(() => {
      this._scrollParentRetryHandle = null;
      this.syncOlderObserver();
    });
  }

  /** One-time diagnostic dump of the ancestor chain, so the failure is self-explaining. */
  private warnNoScrollParentOnce(): void {
    if (this._warnedNoScrollParent) {
      return;
    }
    this._warnedNoScrollParent = true;

    const chain: Array<Record<string, unknown>> = [];
    let el: HTMLElement | null =
      this.findSentinelElement() ?? this.scrollContainer?.nativeElement ?? null;
    while (el && chain.length < 20) {
      const style = getComputedStyle(el);
      chain.push({
        el: el.className || el.tagName,
        overflowY: style.overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight
      });
      el = el.parentElement;
    }

    console.warn(
      '[MessageList] "Earlier messages" is showing but no scrolling ancestor was found, so '
      + 'older pages cannot auto-load. The host must give the transcript a scrollable container '
      + '(overflow-y: auto AND a bounded height, e.g. min-height: 0 on a flex child). '
      + 'Walked from '
      + (this.olderSentinel ? 'the sentinel' : this.scrollContainer ? 'the list container' : 'NOTHING — both view children are undefined')
      + ':',
      chain
    );
  }

  /**
   * The element that ACTUALLY scrolls the transcript.
   *
   * This component's own `.message-list-container` does not scroll: the chat area wraps it
   * in `.chat-messages-container`, and that outer div is the one carrying `min-height: 0`
   * alongside `overflow-y: auto` — the pair a flex child needs before it will scroll instead
   * of growing to fit its content. Targeting the inner div means writing `scrollTop` on an
   * element whose `scrollHeight === clientHeight`, which silently does nothing, and giving
   * an IntersectionObserver a root that never scrolls.
   *
   * Walking up keeps this component agnostic about the host's markup — any consumer that
   * wraps it in its own scroller works the same way.
   */
  private resolveScrollParent(): HTMLElement | null {
    // Host-supplied root wins — no discovery, no timing dependency.
    if (this._scrollRoot?.isConnected) {
      return this._scrollRoot;
    }
    if (this._scrollParent && this._scrollParent.isConnected) {
      return this._scrollParent;
    }
    // Start from the sentinel when it exists: it is the element being observed, so it is
    // guaranteed present exactly when the walk matters. `@ViewChild('scrollContainer')`
    // resolves on Angular's own schedule and can still be undefined here, which would end
    // the walk before it began.
    let el: HTMLElement | null =
      this.findSentinelElement() ?? this.scrollContainer?.nativeElement ?? null;
    while (el) {
      const overflowY = getComputedStyle(el).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        this._scrollParent = el;
        return el;
      }
      el = el.parentElement;
    }
    return null;   // nothing overflows yet — short conversation, nothing to scroll
  }

  /**
   * Holds the user's reading position after older content is spliced in above.
   *
   * `scrollTop` is a pixel offset from the top, so inserting content above silently shifts
   * everything down — the user ends up looking at messages they never scrolled to. Adding
   * the height delta puts the same message back under their eyes.
   */
  private restoreScrollAfterPrepend(): void {
    const el = this.resolveScrollParent();
    if (!el) {
      return;
    }
    const delta = el.scrollHeight - this._heightBeforePrepend;
    if (delta > 0) {
      el.scrollTop = el.scrollTop + delta;
    }
  }

  /**
   * True when the environment provides `IntersectionObserver`.
   *
   * False under SSR and in the unit-test projects. Both observer syncs are reached a
   * microtask late (see the `HasMoreAbove` setter), so a spec that stubs the global and
   * restores it synchronously has already restored it by the time the sync runs — the
   * constructor call then throws inside a `.then()` with no catch, which surfaces as an
   * unhandled rejection rather than a test failure and fails the run despite every
   * assertion passing.
   */
  private get canObserve(): boolean {
    return typeof IntersectionObserver !== 'undefined';
  }

  /**
   * Keeps the IntersectionObserver attached to the current sentinel element.
   *
   * The sentinel lives inside `@if (HasMoreAbove)`, so it is created and destroyed as the
   * user reaches the top of the loaded window and as older pages arrive. Runs every checked
   * cycle and is a no-op once attached.
   *
   * Observer-on-sentinel rather than a scroll listener: a fast scroll costs one callback,
   * not one per frame.
   */
  private syncOlderObserver(): void {
    if (!this.canObserve) {
      return;
    }
    if (!this.HasMoreAbove) {
      this._olderObserver?.disconnect();
      this._olderObserver = undefined;
      this._observedSentinel = null;
      this._observedRoot = null;
      return;
    }

    // Query the DOM rather than reading `@ViewChild('olderSentinel')`.
    //
    // The sentinel lives inside `@if`, so the view query resolves on Angular's own
    // schedule — and `updateMessages` detaches/reattaches this component's change detector
    // around every render, which makes that schedule hard to reason about. Reading the host
    // element directly is timing-independent: if the div is on the page, we find it.
    const el = this.findSentinelElement();
    if (!el) {
      this.scheduleScrollParentRetry();   // not rendered yet — look again next frame
      return;
    }

    // The scroll parent is not resolvable until something actually overflows, which is not
    // true on the first checked cycle. Bailing (rather than observing with a null root)
    // matters: a viewport-rooted observer never sees a sentinel clipped inside a scrolled
    // container, so it would silently never fire.
    const root = this.resolveScrollParent();
    if (!root) {
      // A scroller only becomes findable once its content overflows, which is not true on
      // the tick the sentinel first renders. Retry on animation frames rather than waiting
      // for another change-detection pass — once the list settles there may not be one.
      this.scheduleScrollParentRetry();
      return;
    }
    this._scrollParentRetries = 0;

    // Rebuild whenever EITHER end of the relationship changes — `@if` swaps the sentinel
    // element as HasMoreAbove toggles, and the root only becomes known once content
    // overflows. Observing a stale element or a stale root is silent, not loud.
    if (this._olderObserver && this._observedSentinel === el && this._observedRoot === root) {
      return;
    }
    this._olderObserver?.disconnect();

    this._olderObserver = new IntersectionObserver(
      entries => {
        // Re-check the flags at fire time: the observer can fire while a load is already
        // running, and LoadOlder's own guard shouldn't be the only thing standing between
        // a fast scroll and a burst of duplicate requests.
        if (entries.some(e => e.isIntersecting) && this.HasMoreAbove && !this.IsLoadingOlder) {
          this.OlderRequested.emit();
        }
      },
      // Root must be the REAL scroller, not this component's own container — an observer
      // rooted on a non-scrolling ancestor reports the sentinel as permanently visible.
      { root, threshold: 0.01 }
    );
    this._olderObserver.observe(el);
    this._observedSentinel = el;
    this._observedRoot = root;
  }

  ngOnDestroy() {
    this._olderObserver?.disconnect();
    this._olderObserver = undefined;
    this._spacerObserver?.disconnect();
    this._spacerObserver = undefined;
    if (this._scrollParentRetryHandle !== null) {
      cancelAnimationFrame(this._scrollParentRetryHandle);
      this._scrollParentRetryHandle = null;
    }

    // Clean up all dynamically created components AND embedded views (both have destroy()).
    this._renderedMessages.forEach((entry) => {
      if (entry) {
        entry.ref.destroy();
      }
    });
    this._renderedMessages.clear();

    if (this.messageContainerRef) {
      this.messageContainerRef.clear();
    }
  }

  /**
   * Called when messages array changes
   * Efficiently updates the DOM without re-rendering everything
   */
  @Input()
  set messagesUpdate(messages: MJConversationDetailEntity[]) {
    if (messages && this.messageContainerRef) {
      this.updateMessages(messages);
    }
  }

  /**
   * Updates the message list using dynamic component creation
   * Only adds/removes changed messages for optimal performance
   *
   * REALTIME SESSIONS: details stamped with an `AgentSessionID` (turns persisted during
   * a live realtime session) do NOT render as normal chat bubbles. The timeline pass
   * (`BuildConversationTimeline`) collapses each session's stamped rows into ONE session
   * block, rendered as a `RealtimeSessionTimelineCardComponent` at the session's
   * chronological position. Everything else renders exactly as before.
   */
  private updateMessages(messages: MJConversationDetailEntity[]): void {
    // Temporarily detach change detection for performance
    this.cdRef.detach();

    try {
      // Build the timeline first — collapses contiguous realtime-session rows
      // into ONE session block per session, leaving normal messages in place.
      // See `BuildConversationTimeline` in `utils/realtime-session-timeline`.
      const timeline = BuildConversationTimeline(messages);

      // Remove rendered items (messages AND session blocks) that no longer exist
      const currentKeys = new Set(timeline.map(item => this.getTimelineKey(item)));
      this._renderedMessages.forEach((entry, key) => {
        if (!currentKeys.has(key)) {
          entry.ref.destroy();
          this._renderedMessages.delete(key);
        }
      });

      // Add or update timeline items in chronological order. `renderMessageItem`
      // internally branches on the slot template (messageRenderer) vs the
      // default MessageItemComponent; `renderSessionBlock` always creates a
      // RealtimeSessionTimelineCardComponent.
      // The timeline index is passed through so newly created views land at the RIGHT
      // position. `createComponent` appends by default, which would put prepended older
      // messages at the bottom of the DOM despite being the oldest content.
      // Items far from the viewport are UNMOUNTED and replaced by a height-holding spacer,
      // so paging a long way up leaves a bounded DOM rather than hundreds of live message
      // components. The tail and any in-progress message are always kept.
      const range = this.computeMountedRange(timeline);
      const lastMessageKey = this.findLastMessageKey(timeline);
      for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        const mounted = (i >= range.start && i <= range.end)
          || this.mustStayMounted(item, i, timeline.length);

        if (!mounted) {
          this.ensureSpacer(this.getTimelineKey(item), item, i);
        } else if (item.Kind === 'session') {
          this.renderSessionBlock(item.Group, i);
        } else {
          this.renderMessageItem(item.Detail, messages, this.getMessageKey(item.Detail) === lastMessageKey, i);
        }
      }

      // Decide where the viewport should end up.
      //
      // A raw `length > previousCount` check cannot tell an append from a prepend — paging
      // older history also grows the array, and treating that as "someone sent a message"
      // would snap the user to the newest message every time they scrolled up. Compare the
      // FIRST timeline key instead: if it changed, older content arrived at the head.
      const previousCount = this._previousMessageCount;
      this._previousMessageCount = messages.length;

      const firstKey = timeline.length > 0 ? this.getTimelineKey(timeline[0]) : null;
      const prepended = this._previousFirstKey !== null
        && firstKey !== null
        && firstKey !== this._previousFirstKey;
      this._previousFirstKey = firstKey;

      if (prepended) {
        this._restoreScrollAfterPrepend = true;
      } else if (messages.length > previousCount) {
        this._shouldScrollToBottom = true;
      }
    } finally {
      // Re-attach change detection
      this.cdRef.reattach();
      this.cdRef.detectChanges();
    }
  }

  /**
   * The span of timeline indices that stay mounted.
   *
   * Follows the tail on first paint and whenever nothing measurable is on screen. Once items
   * are rendered, the span is centred on what the reader is actually looking at — measured
   * from scroll position, plus {@link MessageListComponent.MOUNT_BUFFER} either side — so
   * scrolling back does not collapse the window to the newest messages on the next render.
   *
   * (An earlier design pinned the top of the span with a remembered key instead. It was
   * replaced by the measurement below for the reason that comment explains, and the key no
   * longer exists.)
   */
  private computeMountedRange(
    timeline: ConversationTimelineItem<MJConversationDetailEntity>[]
  ): { start: number; end: number } {
    const lastIndex = timeline.length - 1;
    const span = DEFAULT_TRANSCRIPT_PAGE_SIZE + MessageListComponent.MOUNT_BUFFER * 2;
    const tailRange = { start: Math.max(0, timeline.length - span), end: lastIndex };

    const root = this.resolveScrollParent();
    if (!root || this._renderedMessages.size === 0) {
      return tailRange;   // first paint — follow the tail
    }

    // Derived from SCROLL POSITION, which nothing in the render loop feeds back into.
    //
    // Reacting to spacer intersections instead is circular: a spacer's height is an
    // estimate, so where it sits decides what is visible, which decides which spacers fire,
    // which changes what is mounted, which changes heights. That loop is what made the
    // transcript replay the same region; constraining it to one direction only traded the
    // ping-pong for dead zones that never remounted.
    const rootTop = root.getBoundingClientRect().top;
    const viewportHeight = root.clientHeight;
    let firstVisible = -1;
    let lastVisible = -1;

    for (let i = 0; i < timeline.length; i++) {
      const node = this.nodeForKey(this.getTimelineKey(timeline[i]));
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      const top = rect.top - rootTop;
      const bottom = top + rect.height;
      if (bottom > 0 && firstVisible < 0) {
        firstVisible = i;
      }
      if (top < viewportHeight) {
        lastVisible = i;
      }
    }
    if (firstVisible < 0 || lastVisible < 0) {
      return tailRange;
    }

    return {
      start: Math.max(0, firstVisible - MessageListComponent.MOUNT_BUFFER),
      end: Math.min(lastIndex, lastVisible + MessageListComponent.MOUNT_BUFFER)
    };
  }

  /** The rendered DOM node for a timeline key, whatever kind of entry backs it. */
  private nodeForKey(key: string): HTMLElement | undefined {
    const entry = this._renderedMessages.get(key);
    if (!entry) {
      return undefined;
    }
    return entry.kind === 'embedded' || entry.kind === 'spacer'
      ? (entry.ref.rootNodes[0] as HTMLElement | undefined)
      : (entry.ref.location.nativeElement as HTMLElement | undefined);
  }

  /**
   * Items that must never be unmounted regardless of position.
   *
   * The tail carries streaming output, `isLastMessage` affordances and suggested
   * responses; an in-progress message is mid-stream and would lose its live state.
   */
  private mustStayMounted(
    item: ConversationTimelineItem<MJConversationDetailEntity>,
    index: number,
    timelineLength: number
  ): boolean {
    if (index === timelineLength - 1) {
      return true;
    }
    return item.Kind === 'message' && item.Detail.Status === 'In-Progress';
  }

  /**
   * Records what an entry occupied on screen, so its spacer holds exactly that much space.
   *
   * Called immediately BEFORE destroying — afterwards the node is gone. A wrong height here
   * is the failure mode that makes scrolling jump, which is the whole thing spacers exist
   * to prevent.
   */
  private rememberHeight(key: string, entry: RenderedMessageEntry): void {
    const node = entry.kind === 'embedded' || entry.kind === 'spacer'
      ? (entry.ref.rootNodes[0] as HTMLElement | undefined)
      : (entry.ref.location.nativeElement as HTMLElement | undefined);
    const height = node?.offsetHeight ?? 0;
    if (height > 0) {
      this._measuredHeights.set(key, height);
    }
  }

  /** Measured height when we have one, else a kind-appropriate estimate. */
  private heightFor(key: string, item: ConversationTimelineItem<MJConversationDetailEntity>): number {
    const measured = this._measuredHeights.get(key);
    if (measured !== undefined) {
      return measured;
    }
    return item.Kind === 'session'
      ? MessageListComponent.ESTIMATED_SESSION_HEIGHT
      : MessageListComponent.ESTIMATED_MESSAGE_HEIGHT;
  }

  /**
   * Measures every currently-mounted item.
   *
   * Runs each checked cycle so an item has a real height recorded BEFORE it scrolls far
   * enough to be unmounted — otherwise its first spacer is always a guess.
   */
  private measureMountedItems(): void {
    this._renderedMessages.forEach((entry, key) => {
      if (entry.kind === 'spacer') {
        return;
      }
      const node = entry.kind === 'embedded'
        ? (entry.ref.rootNodes[0] as HTMLElement | undefined)
        : (entry.ref.location.nativeElement as HTMLElement | undefined);
      const height = node?.offsetHeight ?? 0;
      if (height > 0) {
        this._measuredHeights.set(key, height);
      }
    });
  }


  /**
   * Replaces a mounted item with a height-holding spacer, or leaves an existing spacer
   * alone. Stored under the item's own timeline key so {@link updateMessages}'s
   * remove-stale pass and the remount path both find it.
   */
  private ensureSpacer(
    key: string,
    item: ConversationTimelineItem<MJConversationDetailEntity>,
    timelineIndex: number
  ): void {
    const existing = this._renderedMessages.get(key);
    if (existing?.kind === 'spacer') {
      return;
    }
    if (!this.spacerTemplate) {
      // Staying mounted is the safe choice, but silently doing so means the transcript
      // grows without bound and nothing says why. Report it once.
      if (!this._warnedNoSpacerTemplate) {
        this._warnedNoSpacerTemplate = true;
        console.warn(
          '[MessageList] spacerTemplate did not resolve, so off-screen messages cannot be '
          + 'unmounted and the DOM will grow with every page loaded.'
        );
      }
      return;
    }
    if (existing) {
      this.rememberHeight(key, existing);
      existing.ref.destroy();
      this._renderedMessages.delete(key);
    }

    const viewRef = this.messageContainerRef.createEmbeddedView<SpacerContext>(
      this.spacerTemplate,
      { height: this.heightFor(key, item) },
      { index: timelineIndex }
    );
    this._renderedMessages.set(key, { kind: 'spacer', ref: viewRef });
  }

  /**
   * Re-evaluates the mounted window as the user scrolls.
   *
   * Attached once to the host's scroller. Coalesced onto an animation frame so a fast scroll
   * costs one re-render per frame rather than one per event, and skipped entirely when the
   * window has not actually moved.
   */
  private syncScrollListener(): void {
    const root = this.resolveScrollParent();
    if (!root || root === this._scrollListenerTarget) {
      return;
    }
    this.detachScrollListener();
    this._scrollListenerTarget = root;
    this._onScroll = () => {
      if (this._scrollFrame !== null) {
        return;
      }
      this._scrollFrame = requestAnimationFrame(() => {
        this._scrollFrame = null;
        if (this.messages?.length) {
          this.updateMessages(this.messages);
        }
      });
    };
    root.addEventListener('scroll', this._onScroll, { passive: true });
  }

  private detachScrollListener(): void {
    if (this._scrollListenerTarget && this._onScroll) {
      this._scrollListenerTarget.removeEventListener('scroll', this._onScroll);
    }
    this._scrollListenerTarget = null;
    this._onScroll = null;
    if (this._scrollFrame !== null) {
      cancelAnimationFrame(this._scrollFrame);
      this._scrollFrame = null;
    }
  }

  /**
   * Watches the current spacers so scrolling back toward one remounts it.
   *
   * Rebuilt on every render because spacers come and go. Remounting reads from `messages`,
   * which is already in memory — this never triggers a fetch.
   */
  private syncSpacerObserver(): void {
    if (!this.canObserve) {
      return;
    }
    const root = this.resolveScrollParent();
    if (!root) {
      this._spacerObserver?.disconnect();
      this._spacerObserver = undefined;
      this._observedSpacerKeys = '';
      return;
    }
    const spacers: Array<{ key: string; el: HTMLElement }> = [];
    this._renderedMessages.forEach((entry, key) => {
      if (entry.kind === 'spacer') {
        const el = entry.ref.rootNodes[0] as HTMLElement | undefined;
        if (el) {
          spacers.push({ key, el });
        }
      }
    });
    if (spacers.length === 0) {
      this._spacerObserver?.disconnect();
      this._spacerObserver = undefined;
      this._observedSpacerKeys = '';
      return;
    }

    // Rebuild ONLY when the spacer set actually changes.
    //
    // This runs every checked cycle, and a fresh IntersectionObserver delivers an initial
    // callback for everything it observes. Rebuilding unconditionally therefore re-fired
    // remountAround on every change-detection pass, which re-rendered, which triggered
    // another pass — the transcript visibly stuck, replaying the same region.
    const signature = spacers.map(s => s.key).sort().join('|');
    if (this._spacerObserver && signature === this._observedSpacerKeys) {
      return;
    }
    this._spacerObserver?.disconnect();
    this._observedSpacerKeys = signature;

    this._spacerObserver = new IntersectionObserver(
      entries => {
        const hit = entries.find(e => e.isIntersecting);
        if (!hit) {
          return;
        }
        // The range is computed from scroll position; a spacer coming into view just means
        // it is time to recompute. No key is threaded through, so there is no feedback loop.
        if (this.messages?.length) {
          this.updateMessages(this.messages);
        }
      },
      { root, threshold: 0.01 }
    );
    for (const s of spacers) {
      this._spacerObserver.observe(s.el);
    }
  }


  /** Stable render key for a timeline item — message ID, or a prefixed session key for session blocks. */
  private getTimelineKey(item: ConversationTimelineItem<MJConversationDetailEntity>): string {
    return item.Kind === 'session' ? this.getSessionKey(item.Group.SessionID) : this.getMessageKey(item.Detail);
  }

  /** Render key for a session block (case-insensitive on the session id; prefixed so it can't collide with message IDs). */
  private getSessionKey(sessionId: string): string {
    return `session:${NormalizeUUID(sessionId)}`;
  }

  /** The render key of the LAST normal message item in the timeline (drives `isLastMessage`), or null when none. */
  private findLastMessageKey(timeline: ConversationTimelineItem<MJConversationDetailEntity>[]): string | null {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const item = timeline[i];
      if (item.Kind === 'message') {
        return this.getMessageKey(item.Detail);
      }
    }
    return null;
  }

  /**
   * Creates or updates the ONE timeline card a realtime session collapses to.
   * Click/Open on the card bubbles up via {@link realtimeSessionOpenRequested} so the
   * chat area can host the SESSION REVIEW overlay for it.
   */
  private renderSessionBlock(group: RealtimeSessionTimelineGroup, timelineIndex: number): void {
    const key = this.getSessionKey(group.SessionID);
    const meta = this.sessionMetaMap.get(NormalizeUUID(group.SessionID)) ?? null;
    const existing = this._renderedMessages.get(key);

    if (existing && existing.kind === 'realtime-session') {
      // Update existing card in place.
      const instance = existing.ref.instance;
      instance.Group = group;
      instance.Meta = meta;
      existing.ref.changeDetectorRef.markForCheck();
      return;
    }

    // Different kind at this key (e.g. mode changed) — drop the old entry, fall through to create.
    if (existing) {
      existing.ref.destroy();
      this._renderedMessages.delete(key);
    }

    const componentRef = this.messageContainerRef.createComponent(
      RealtimeSessionTimelineCardComponent,
      { index: timelineIndex }
    );
    componentRef.instance.Group = group;
    componentRef.instance.Meta = meta;
    componentRef.instance.UserName = this.currentUser?.Name || 'You';
    componentRef.instance.OpenRequested.subscribe((sessionId: string) => this.realtimeSessionOpenRequested.emit(sessionId));
    this._renderedMessages.set(key, { kind: 'realtime-session', ref: componentRef });
  }

  /**
   * Creates or updates one normal chat message item. Routes to the
   * consumer-projected `messageRenderer` slot template (EmbeddedViewRef path)
   * when present, otherwise falls back to the default `MessageItemComponent`
   * dynamic-component path. Both paths flow through the shared
   * `createRenderedEntry` / `updateMessageItemInstance` helpers.
   */
  private renderMessageItem(
    message: MJConversationDetailEntity,
    messages: MJConversationDetailEntity[],
    isLastMessage: boolean,
    timelineIndex: number
  ): void {
    const key = this.getMessageKey(message);
    // `index` is only used for the `isLastMessage` heuristic inside
    // updateMessageItemInstance — synthesize a value that produces the right
    // boolean (last index when `isLastMessage` is true, else 0 — any non-last
    // index works since it just affects that one comparison).
    const index = isLastMessage ? messages.length - 1 : 0;
    const useCustomRenderer = this.messageRendererTemplate !== null;
    const existing = this._renderedMessages.get(key);

    if (existing && existing.kind === 'embedded' && useCustomRenderer) {
      // Update existing embedded view from messageRenderer slot
      existing.ref.context.$implicit = message;
      existing.ref.context.message = message;
      existing.ref.markForCheck();
      return;
    }
    if (existing && existing.kind === 'component' && !useCustomRenderer) {
      // Update existing MessageItemComponent in place
      this.updateMessageItemInstance(existing.ref, message, messages, index);
      return;
    }
    if (existing) {
      // Rendering kind changed (e.g. component↔embedded, or a session block was
      // overwritten with a message). Destroy + recreate.
      existing.ref.destroy();
      this._renderedMessages.delete(key);
    }

    this.createRenderedEntry(message, messages, index, key, useCustomRenderer, timelineIndex);
  }

  /**
   * Updates an existing `MessageItemComponent` in place — used on the default
   * (non-custom-renderer) path when a message's status / artifacts / agent-run /
   * etc. changes mid-stream.
   */
  private updateMessageItemInstance(
    ref: ComponentRef<MessageItemComponent>,
    message: MJConversationDetailEntity,
    messages: MJConversationDetailEntity[],
    index: number
  ): void {
    const instance = ref.instance;
    const previousMessage = instance.message;

    instance.message = message;
    instance.allMessages = messages;
    instance.isProcessing = this.isProcessing;
    instance.userAvatarMap = this.userAvatarMap;
    instance.isLastMessage = (index === messages.length - 1);
    instance.messageExtraTemplate = this.messageExtraTemplate;
    this.applyMessageItemFeatureFlags(instance);

    this.applyArtifactsToInstance(instance, message.ID, ref.changeDetectorRef);

    instance.agentRun = this.agentRunMap.get(message.ID) || null;
    instance.ratings = this.ratingsMap.get(message.ID);
    instance.attachments = this.attachmentsMap.get(message.ID) || [];

    // Status change requires explicit markForCheck on the OnPush dynamic child.
    if (previousMessage && previousMessage.Status !== message.Status) {
      ref.changeDetectorRef.markForCheck();
    }
  }

  /**
   * Forward the host-level per-message feature gates onto a MessageItemComponent
   * instance. These are static host config (not per-message data), so the same
   * values apply to every message; applied on both the create and in-place-update
   * paths so a mid-session rebind stays consistent.
   */
  private applyMessageItemFeatureFlags(instance: MessageItemComponent): void {
    instance.showAgentRunDetails = this.showAgentRunDetails;
    instance.showReactions = this.showReactions;
    instance.showMessageRating = this.showMessageRating;
    instance.allowPinning = this.allowPinning;
    instance.allowMessageEdit = this.allowMessageEdit;
    instance.allowMessageDelete = this.allowMessageDelete;
    instance.assistantDisplayName = this.assistantDisplayName;
    instance.assistantAvatarUrl = this.assistantAvatarUrl;
  }

  /**
   * Creates a new rendered entry — either a `MessageItemComponent` (default path)
   * or an `EmbeddedViewRef` from the consumer's `messageRenderer` slot template.
   * Stores the entry in `_renderedMessages` and stamps a back-reference on the
   * message entity.
   */
  private createRenderedEntry(
    message: MJConversationDetailEntity,
    messages: MJConversationDetailEntity[],
    index: number,
    key: string,
    useCustomRenderer: boolean,
    timelineIndex: number
  ): void {
    if (useCustomRenderer && this.messageRendererTemplate) {
      // The slot directive carries TemplateRef<unknown>; assert the contract here
      // (consumers' `let-message` bindings consume the message context shape below).
      const template = this.messageRendererTemplate as TemplateRef<MessageRendererContext>;
      const viewRef = this.messageContainerRef.createEmbeddedView<MessageRendererContext>(
        template,
        { $implicit: message, message },
        { index: timelineIndex }
      );
      this._renderedMessages.set(key, { kind: 'embedded', ref: viewRef });
      // Stamp back-ref for parity with the component path.
      (message as unknown as { _viewRef?: EmbeddedViewRef<MessageRendererContext> })._viewRef = viewRef;
      return;
    }

    const componentRef = this.messageContainerRef.createComponent(MessageItemComponent, { index: timelineIndex });
    const instance = componentRef.instance;

    instance.message = message;
    instance.conversation = this.conversation;
    instance.currentUser = this.currentUser;
    instance.allMessages = messages;
    instance.isProcessing = this.isProcessing;
    instance.userAvatarMap = this.userAvatarMap;
    instance.isLastMessage = (index === messages.length - 1);
    instance.messageExtraTemplate = this.messageExtraTemplate;
    this.applyMessageItemFeatureFlags(instance);

    this.applyArtifactsToInstance(instance, message.ID, componentRef.changeDetectorRef);

    instance.agentRun = this.agentRunMap.get(message.ID) || null;
    instance.ratings = this.ratingsMap.get(message.ID);
    instance.attachments = this.attachmentsMap.get(message.ID) || [];

    instance.editClicked.subscribe((msg: MJConversationDetailEntity) => this.editMessage.emit(msg));
    instance.deleteClicked.subscribe((msg: MJConversationDetailEntity) => this.deleteMessage.emit(msg));
    instance.retryClicked.subscribe((msg: MJConversationDetailEntity) => this.retryMessage.emit(msg));
    instance.testFeedbackClicked.subscribe((msg: MJConversationDetailEntity) => this.testFeedbackMessage.emit(msg));
    instance.artifactClicked.subscribe((data: {artifactId: string; versionId?: string}) => this.artifactClicked.emit(data));
    instance.messageEdited.subscribe((msg: MJConversationDetailEntity) => this.messageEdited.emit(msg));
    instance.openEntityRecord.subscribe((data: {entityName: string; compositeKey: CompositeKey}) => this.openEntityRecord.emit(data));
    instance.suggestedResponseSelected.subscribe((data: {text: string; customInput?: string}) => this.suggestedResponseSelected.emit(data));
    instance.attachmentClicked.subscribe((attachment: MessageAttachment) => this.attachmentClicked.emit(attachment));
    instance.diagnosticRequested.subscribe((messageId: string) => this.diagnosticRequested.emit(messageId));
    instance.messagePinToggled.subscribe((msg: MJConversationDetailEntity) => this.messagePinToggled.emit(msg));
    instance.beforeResponseFormSubmitted.subscribe((e: BeforeResponseFormSubmittedEventArgs) => this.beforeResponseFormSubmitted.emit(e));
    instance.afterResponseFormSubmitted.subscribe((e: AfterResponseFormSubmittedEventArgs) => this.afterResponseFormSubmitted.emit(e));

    if (instance.artifactActionPerformed) {
      instance.artifactActionPerformed.subscribe((data: {action: string; artifactId: string}) => {
        // Parent can handle artifact actions (save, fork, history, share)
        console.log('Artifact action:', data);
      });
    }

    this._renderedMessages.set(key, { kind: 'component', ref: componentRef });
    // Preserve the existing back-ref pattern from the skip-chat performance design.
    (message as unknown as { _componentRef?: ComponentRef<MessageItemComponent> })._componentRef = componentRef;
  }

  /**
   * Resolves the DISTINCT artifacts for a message (one entry per artifactId at its
   * latest version), lazy-loads them all, and applies them to the rendered
   * message-item. Loads in the background so the UI never blocks.
   *
   * WHY WE SURFACE THEM ALL (design rationale — see PR discussion w/ Pranav & Ethan):
   * A single message can legitimately carry more than one DISTINCT artifact — e.g. a
   * research report PLUS a *standalone* generated infographic. This is deliberately
   * NOT in conflict with the server-side consolidation in AgentRunner
   * (Pranav, 5664b86: "keep the report's embedded image in the report, not as a
   * duplicate artifact"): that logic only suppresses media that is *embedded inline*
   * (base64) in another artifact's payload — a true duplicate. Genuinely standalone
   * sibling artifacts (the report uses SVG charts; the infographic is a separate JPEG)
   * are correctly kept as separate artifacts, and the UI must show every one of them.
   *
   * The earlier `artifactList[length - 1]` ("show only the most recent") approach
   * (EL-BC, 95492622) assumed consolidation always left exactly one artifact per
   * message; when it legitimately leaves two, that silently hid the report behind the
   * image. Grouping by artifactId (latest version each) shows all distinct artifacts
   * while still collapsing multiple *versions* of the same artifact to one card.
   */
  private applyArtifactsToInstance(
    instance: MessageItemComponent,
    messageId: string,
    childCdRef: ChangeDetectorRef
  ): void {
    const infos = this.resolveDistinctArtifacts(messageId);
    if (infos.length === 0) {
      instance.artifacts = [];
      instance.artifact = undefined;
      instance.artifactVersion = undefined;
      return;
    }

    Promise.all(
      infos.map(info =>
        Promise.all([info.getArtifact(), info.getVersion()]).then(([artifact, version]) => ({ artifact, version }))
      )
    )
      .then(refs => {
        instance.artifacts = refs;
        // Keep the legacy single inputs pointed at the first entry for back-compat.
        instance.artifact = refs[0]?.artifact;
        instance.artifactVersion = refs[0]?.version;
        // zone.js 0.15: parent detectChanges doesn't propagate to dynamically created children
        childCdRef.detectChanges();
        this.cdRef.detectChanges();
      })
      .catch(err => {
        console.error('Failed to lazy-load artifacts:', err);
      });
  }

  /**
   * Groups a message's artifact list by artifactId, keeping the highest version of
   * each. Multiple versions of the SAME artifact collapse to one card (latest wins),
   * while genuinely distinct artifacts are all retained.
   */
  private resolveDistinctArtifacts(messageId: string): LazyArtifactInfo[] {
    const list = this.artifactMap.get(messageId);
    if (!list || list.length === 0) {
      return [];
    }
    return selectDistinctLatestArtifacts(list);
  }

  /**
   * Generates a unique key for a message
   * Uses ID if available, otherwise uses a temporary key
   */
  private getMessageKey(message: MJConversationDetailEntity): string {
    return message.ID && message.ID.length > 0
      ? message.ID
      : `temp_${message.__mj_CreatedAt?.getTime() || Date.now()}`;
  }

  /**
   * Determines whether to show the date filter dropdown
   * Only show if conversation is long and spans multiple days
   */
  private updateDateFilterVisibility(): void {
    // `messages` is the loaded WINDOW, not the conversation. The 20-message / 3-day heuristic
    // below reads it as if it were full history, so under windowing a long multi-week thread
    // opens with ~10 items, fails the length check, and never offers date navigation at all —
    // the one case where it is most useful. `HasMoreAbove` is the only windowing-safe signal
    // that more conversation exists above, so it short-circuits the heuristic.
    if (this.HasMoreAbove) {
      this.shouldShowDateFilter = true;
      return;
    }
    if (!this.messages || this.messages.length < 20) {
      this.shouldShowDateFilter = false;
      return;
    }

    // Check if messages span more than 2 days
    const dates = this.messages
      .map(m => m.__mj_CreatedAt)
      .filter(d => d != null)
      .map(d => new Date(d!).setHours(0, 0, 0, 0));

    if (dates.length === 0) {
      this.shouldShowDateFilter = false;
      return;
    }

    const uniqueDates = new Set(dates);
    const daySpan = uniqueDates.size;

    // Show filter if conversation has 20+ messages and spans 3+ days
    this.shouldShowDateFilter = daySpan >= 3;
  }

  /**
   * Scrolls the message list to the bottom
   */
  private scrollToBottom(): void {
    if (this.scrollContainer && this.scrollContainer.nativeElement) {
      Promise.resolve().then(() => {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      });
    }
  }

  /**
   * Removes a message from the rendered list
   * Called externally when a message is deleted
   */
  public removeMessage(message: MJConversationDetailEntity): void {
    const key = this.getMessageKey(message);
    const entry = this._renderedMessages.get(key);
    if (entry) {
      entry.ref.destroy();
      this._renderedMessages.delete(key);
    }
  }
}