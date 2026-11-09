/**
 * @fileoverview Floating Chat Overlay Component
 *
 * A collapsible floating panel (bottom-right corner) that wraps the
 * conversation-chat-area component. Provides a persistent, minimizable chat
 * experience across the application.
 *
 * This component is GENERIC -- it does NOT know about NavigationService,
 * Knowledge Hub, or any Explorer-specific concepts. It raises events that
 * the consuming application handles.
 *
 * Coordinates with the full Conversations workspace view through
 * ConversationBridgeService so that switching between overlay and workspace
 * preserves conversation continuity.
 */

import {
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { takeUntil } from 'rxjs/operators';
import { UserInfo, CompositeKey } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    ConversationEngine,
    MJConversationEntity,
    MJTaskEntity,
    MJEnvironmentEntityExtended,
    UserInfoEngine
} from '@memberjunction/core-entities';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { ClientToolResultEvent } from '@memberjunction/ai-agent-client';
import { ConversationBridgeService, ConversationSwitchEvent } from '../../services/conversation-bridge.service';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { PendingAttachment } from '@memberjunction/ng-composer';

/** Visual state of the overlay panel */
export type ChatOverlayState = 'collapsed' | 'expanded' | 'maximized';

/** Event payload when the active conversation changes in the overlay */
export interface OverlayConversationSwitchedEvent {
    PreviousConversationID: string | null;
    NewConversationID: string | null;
}

/** Summary of the active record context extracted from `AppContext.AdditionalContext.Form` */
export interface OverlayActiveRecordContextSummary {
    Entity: string;
    RecordPrimaryKey: string | null;
    RecordDisplayName: string | null;
    EditMode: boolean;
    Dirty: boolean;
    DirtyFieldNames: readonly string[];
    HasExternalUpdateConflict: boolean;
    PreviewingHistoricalChangeID: string | null;
    TotalLinksCount: number;
    OutgoingLinksCount: number;
    IncomingLinksCount: number;
}

/** Persisted overlay size and position preferences */
interface OverlayPrefs {
    width: number;
    height: number;
    /** Pixels the bubble has been dragged up from its default bottom position. Optional for back-compat with older saved prefs. */
    bubbleOffsetY?: number;
    /** When true, the bubble is hidden and only a thin sliver shows on the right edge. */
    bubbleHidden?: boolean;
}

@Component({
    standalone: false,
    selector: 'mj-chat-agents-overlay',
    templateUrl: './chat-overlay.component.html',
    styleUrls: ['./chat-overlay.component.css']
})
export class ChatAgentsOverlayComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy  {
    private cdr = inject(ChangeDetectorRef);
    private bridge = inject(ConversationBridgeService);
    private agentClient = inject(AgentClientService);
    private destroy$ = new Subject<void>();

    // --- Settings persistence ---
    private static readonly SIZE_SETTING_KEY = 'ChatOverlay.Size';
    private static readonly DEFAULT_WIDTH = 420;
    private static readonly DEFAULT_HEIGHT = 600;
    private static readonly MIN_WIDTH = 320;
    private static readonly MIN_HEIGHT = 350;
    private static readonly MAX_WIDTH = 900;
    private static readonly MAX_HEIGHT = 1000;

    // --- Bubble drag constants ---
    /** Default `bottom` for both bubble and panel (matches CSS 1.5rem). */
    private static readonly BASE_BOTTOM_PX = 24;
    /** Floating bubble diameter in pixels (matches CSS 3.5rem). */
    private static readonly BUBBLE_SIZE_PX = 56;
    /** Minimum gap to keep between the overlay and the viewport top edge. */
    private static readonly VIEWPORT_TOP_PADDING_PX = 16;
    /** Mousedown-to-mousemove distance that promotes a click into a drag. */
    private static readonly BUBBLE_DRAG_THRESHOLD_PX = 5;

    // --- Inputs ---

    /** Controls external visibility (e.g., parent hides overlay on chat route) */
    private _isVisible = true;

    @Input()
    set IsVisible(value: boolean) {
        const prev = this._isVisible;
        this._isVisible = value;
        if (!value && prev && this.State !== 'collapsed') {
            this.Collapse();
        }
        this.cdr.detectChanges();
    }
    get IsVisible(): boolean {
        return this._isVisible;
    }

    /** Current user info, passed through to conversation-chat-area. Auto-resolved from Metadata if not provided. */
    @Input() CurrentUser!: UserInfo;

    /** Environment ID, passed through to conversation-chat-area. Auto-resolved from default if not provided. */
    @Input() EnvironmentId!: string;

    /** Application context snapshot for AI agent awareness. Updated by the host app on navigation transitions. */
    @Input() AppContext: Record<string, unknown> | null = null;

    /** Greeting message shown in the empty state when no conversation is active */
    @Input() EmptyStateGreeting: string = 'How can I help you?';

    /**
     * Pixels reserved at the top of the viewport that the bubble and panel must not
     * cross. Set this from the host app to the height of any fixed top chrome (e.g.
     * Explorer's shell-header). Defaults to 0 — generic apps without top chrome
     * keep the full viewport available.
     */
    @Input() TopBoundaryPx: number = 0;

    // --- Outputs ---

    /** Emitted when the overlay visibility changes */
    @Output() VisibilityChanged = new EventEmitter<ChatOverlayState>();

    /** Emitted when a tool finishes executing in the agent client */
    @Output() ToolExecuted = new EventEmitter<ClientToolResultEvent>();

    /** Emitted when the active conversation changes in the overlay */
    @Output() ConversationSwitched = new EventEmitter<OverlayConversationSwitchedEvent>();

    /** Emitted when the user requests opening the full chat workspace */
    @Output() OpenFullChatWorkspace = new EventEmitter<string | null>();

    /** Emitted when navigation is requested (entity record, etc.) */
    @Output() NavigationRequested = new EventEmitter<NavigationRequest>();

    /** Emitted when an entity record open is requested */
    @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

    /** Emitted when a task is clicked */
    @Output() TaskClicked = new EventEmitter<MJTaskEntity>();

    // --- Component State ---

    public State: ChatOverlayState = 'collapsed';
    public UnreadCount = 0;

    /** Panel dimensions (persisted via UserInfoEngine) */
    public PanelWidth = ChatAgentsOverlayComponent.DEFAULT_WIDTH;
    public PanelHeight = ChatAgentsOverlayComponent.DEFAULT_HEIGHT;

    /**
     * Pixels the floating bubble has been dragged up from its default
     * bottom-right corner position. Always >= 0; clamping at render time
     * keeps the bubble on-screen even after a viewport resize.
     */
    public BubbleOffsetY = 0;

    /** True while the user is actively dragging the bubble; used to swap cursor + suppress click. */
    public IsBubbleDragging = false;

    /**
     * True from mousedown until mouseup on the bubble, regardless of whether the
     * gesture became a drag. Used to give immediate "I'm being held" feedback so
     * the user can see drag is possible even before crossing the move threshold.
     */
    public IsBubblePressed = false;

    /**
     * When true, the floating bubble is hidden and replaced by a thin sliver
     * flush with the right edge of the viewport. Persisted across sessions via
     * OverlayPrefs.bubbleHidden. Clicking the sliver restores the bubble.
     */
    public IsHidden = false;

    /** Active conversation ID managed locally */
    private _conversationId: string | null = null;
    public get ConversationId(): string | null {
        return this._conversationId;
    }

    /** Active conversation entity */
    public Conversation: MJConversationEntity | null = null;

    /** Whether a new unsaved conversation is in progress */
    public IsNewConversation = true;

    /** Pending message to send after conversation creation */
    public PendingMessage: string | null = null;
    /** The conversation {@link PendingMessage} is destined for — pins the auto-send to that
     *  conversation's input so a fast conversation-swap can't redirect it elsewhere. */
    public PendingMessageConversationId: string | null = null;

    /** Pending attachments to send after conversation creation */
    public PendingAttachments: PendingAttachment[] | null = null;

    /** Non-anchored AI conversations bound to the currently open record form */
    public RecordConversations: MJConversationEntity[] = [];

    /** Tracks the `(entityId:recordId)` currently bound to the overlay */
    private currentBoundRecordKey: string | null = null;
    private recordBindingGeneration = 0;
    private stashedGeneralConversationId: string | null = null;

    /** Resize drag state */
    private isResizing = false;
    private resizeEdge: 'left' | 'top' | 'top-left' | null = null;
    private resizeStartX = 0;
    private resizeStartY = 0;
    private resizeStartWidth = 0;
    private resizeStartHeight = 0;

    /** Bubble drag state */
    private bubbleDragStartMouseY = 0;
    private bubbleDragStartOffset = 0;
    /** True once the pointer has moved past BUBBLE_DRAG_THRESHOLD_PX; suppresses the implicit click. */
    private bubbleDragMoved = false;
    /** ID of the pointer currently driving the drag — guards against multi-touch confusion. */
    private activeBubblePointerId: number | null = null;
    /** Element that captured the pointer; needed to release capture on end/cancel. */
    private bubbleCaptureTarget: HTMLElement | null = null;

    // --- Lifecycle ---

    ngOnInit(): void {
        this.resolveDefaults();
        this.loadPreferences();
        this.subscribeToBridgeEvents();
        this.subscribeToToolEvents();
        this.wireBrowserExtensionEmbedAndContext();
        void this.syncActiveRecordBinding();
    }

    /**
     * When hosted inside the MJ Browser Extension Side Panel (`?mj_ext_agent_embed=1`)
     * or receiving active browser tab context events (`mj-ext-active-tab-context`),
     * automatically maximizes the overlay and injects the active tab's DOM & braided
     * MemberJunction context into `AppContext`.
     */
    private wireBrowserExtensionEmbedAndContext(): void {
        if (typeof window !== 'undefined' && window.location?.search?.includes('mj_ext_agent_embed=1')) {
            this._isVisible = true;
            this.IsHidden = false;
            this.Expand();
            this.State = 'maximized';
            this.cdr.detectChanges();
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('mj-ext-active-tab-context', (ev: Event) => {
                const customEv = ev as CustomEvent<Record<string, unknown>>;
                if (customEv.detail) {
                    this.AppContext = {
                        ...(this.AppContext ?? {}),
                        BrowserExtensionActiveTab: customEv.detail,
                    };
                    this.cdr.detectChanges();
                }
            });
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['AppContext']) {
            void this.syncActiveRecordBinding();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.removeResizeListeners();
        this.removeBubbleDragListeners();
    }

    // --- Public Methods ---

    /** Toggle between collapsed and expanded states */
    public Toggle(): void {
        if (this.State === 'collapsed') {
            this.Expand();
        } else {
            this.Collapse();
        }
    }

    /** Expand the overlay to show the chat panel */
    public Expand(): void {
        // Expanding implies the user wants the chat visible — clear any hidden
        // state so collapse returns to the bubble, not back to the sliver.
        if (this.IsHidden) {
            this.IsHidden = false;
            this.savePreferences();
        }
        void this.syncActiveRecordBinding();
        this.State = 'expanded';
        this.UnreadCount = 0;
        this.bridge.NotifyOverlayActive(true);
        this.VisibilityChanged.emit(this.State);
        this.cdr.detectChanges();
    }

    /** Collapse the overlay to the floating button */
    public Collapse(): void {
        this.State = 'collapsed';
        this.bridge.NotifyOverlayActive(false);
        this.VisibilityChanged.emit(this.State);
        this.cdr.detectChanges();
    }

    /** Toggle between expanded and maximized states */
    public ToggleMaximize(): void {
        if (this.State === 'maximized') {
            this.State = 'expanded';
        } else {
            this.State = 'maximized';
        }
        this.bridge.NotifyOverlayActive(true);
        this.VisibilityChanged.emit(this.State);
        this.cdr.detectChanges();
    }

    /** Handle the user requesting to open full chat workspace */
    public OnOpenFullChatWorkspace(): void {
        this.OpenFullChatWorkspace.emit(this._conversationId);
        this.bridge.SwitchToWorkspace(this._conversationId);
        this.Collapse();
    }

    /** Handle conversation creation from the chat area */
    public OnConversationCreated(event: {
        conversation: MJConversationEntity;
        pendingMessage?: string;
        pendingAttachments?: PendingAttachment[];
    }): void {
        // Set ALL state atomically before Angular change detection runs
        this.PendingMessage = event.pendingMessage || null;
        this.PendingAttachments = event.pendingAttachments || null;
        this.PendingMessageConversationId = event.conversation.ID;
        const prevId = this._conversationId;
        this._conversationId = event.conversation.ID;
        this.Conversation = event.conversation;
        this.IsNewConversation = false;

        const isRecordBound = Boolean(
            event.conversation.LinkedEntityID ||
            (this.ActiveRecordEntityId && this.ActiveLinkedRecordId)
        );
        if (isRecordBound) {
            if (!this.RecordConversations.some((c) => UUIDsEqual(c.ID, event.conversation.ID))) {
                this.RecordConversations = [event.conversation, ...this.RecordConversations];
            }
            // Keep record-bound conversations off the global workspace bridge so navigating
            // to the general-purpose Chat app does not hijack the workspace with a record chat.
            this.bridge.SetActiveFromOverlay(null);
        } else {
            this.bridge.SetActiveFromOverlay(event.conversation.ID);
        }
        this.emitConversationSwitched(prevId, event.conversation.ID);
    }

    /** Switch between existing AI conversations bound to the currently open record */
    public OnSelectRecordConversation(conversationId: string): void {
        if (!conversationId || UUIDsEqual(conversationId, this._conversationId)) {
            return;
        }
        const match = this.RecordConversations.find((c) => UUIDsEqual(c.ID, conversationId)) ?? null;
        const prevId = this._conversationId;
        this._conversationId = conversationId;
        this.Conversation = match;
        this.IsNewConversation = false;
        this.bridge.SetActiveFromOverlay(null);
        this.emitConversationSwitched(prevId, conversationId);
        this.cdr.detectChanges();
    }

    public OnSelectRecordConversationChange(event: Event): void {
        const selectEl = event.target as HTMLSelectElement | null;
        if (selectEl?.value) {
            this.OnSelectRecordConversation(selectEl.value);
        }
    }

    /** Handle pending message consumed by chat area */
    public OnPendingMessageConsumed(): void {
        this.PendingMessage = null;
        this.PendingAttachments = null;
        this.PendingMessageConversationId = null;
    }

    /** Handle conversation rename from chat area */
    public OnConversationRenamed(_event: {conversationId: string; name: string; description: string}): void {
        // The overlay doesn't need to do anything specific here;
        // the conversation entity is updated in-place by the chat area.
    }

    /** Handle entity record open requests */
    public OnOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
        this.OpenEntityRecord.emit(event);
    }

    /** Handle navigation requests from the chat area */
    public OnNavigationRequest(event: NavigationRequest): void {
        this.NavigationRequested.emit(event);
    }

    /** Handle task clicks from the chat area */
    public OnTaskClicked(task: MJTaskEntity): void {
        this.TaskClicked.emit(task);
    }

    /** Start a new conversation in the overlay */
    public StartNewConversation(): void {
        const prevId = this._conversationId;
        this._conversationId = null;
        this.Conversation = null;
        // Force Angular change detection by toggling off then on
        // so the setter fires even if already in new-conversation state
        this.IsNewConversation = false;
        this.cdr.detectChanges();
        this.IsNewConversation = true;
        this.bridge.SetActiveFromOverlay(null);
        this.emitConversationSwitched(prevId, null);
        this.cdr.detectChanges();
    }

    /**
     * Hide the floating bubble — leaves a thin sliver on the right edge as the
     * only affordance to bring it back. Invoked from the small "×" pill that
     * appears on hover. Stops propagation so the bubble's own click handler
     * doesn't fire and toggle the panel open.
     */
    public Hide(event: Event): void {
        event.stopPropagation();
        event.preventDefault();
        if (this.IsHidden) return;
        this.IsHidden = true;
        this.savePreferences();
        this.cdr.detectChanges();
    }

    /** Restore the floating bubble after it was hidden. Triggered by clicking the sliver. */
    public Show(): void {
        if (!this.IsHidden) return;
        this.IsHidden = false;
        this.savePreferences();
        this.cdr.detectChanges();
    }

    /** Increment unread badge (called externally when messages arrive while collapsed) */
    public IncrementUnread(): void {
        if (this.State === 'collapsed') {
            this.UnreadCount++;
            this.cdr.detectChanges();
        }
    }

    // --- Resize Methods ---

    /** Start resizing from an edge or corner */
    public OnResizeStart(event: MouseEvent, edge: 'left' | 'top' | 'top-left'): void {
        event.preventDefault();
        event.stopPropagation();
        this.isResizing = true;
        this.resizeEdge = edge;
        this.resizeStartX = event.clientX;
        this.resizeStartY = event.clientY;
        this.resizeStartWidth = this.PanelWidth;
        this.resizeStartHeight = this.PanelHeight;

        document.addEventListener('mousemove', this.onResizeMove);
        document.addEventListener('mouseup', this.onResizeEnd);
    }

    private onResizeMove = (event: MouseEvent): void => {
        if (!this.isResizing || !this.resizeEdge) return;

        const deltaX = this.resizeStartX - event.clientX; // Inverted: dragging left increases width
        const deltaY = this.resizeStartY - event.clientY; // Inverted: dragging up increases height

        if (this.resizeEdge === 'left' || this.resizeEdge === 'top-left') {
            this.PanelWidth = this.clampWidth(this.resizeStartWidth + deltaX);
        }
        if (this.resizeEdge === 'top' || this.resizeEdge === 'top-left') {
            this.PanelHeight = this.clampHeight(this.resizeStartHeight + deltaY);
        }
        this.cdr.detectChanges();
    };

    private onResizeEnd = (): void => {
        if (!this.isResizing) return;
        this.isResizing = false;
        this.resizeEdge = null;
        this.removeResizeListeners();
        this.savePreferences();
    };

    private removeResizeListeners(): void {
        document.removeEventListener('mousemove', this.onResizeMove);
        document.removeEventListener('mouseup', this.onResizeEnd);
    }

    private clampWidth(value: number): number {
        return Math.max(ChatAgentsOverlayComponent.MIN_WIDTH, Math.min(ChatAgentsOverlayComponent.MAX_WIDTH, value));
    }

    private clampHeight(value: number): number {
        return Math.max(ChatAgentsOverlayComponent.MIN_HEIGHT, Math.min(ChatAgentsOverlayComponent.MAX_HEIGHT, value));
    }

    // --- Bubble Drag Methods (Pointer Events — unified mouse / touch / pen) ---

    /**
     * Start tracking a potential bubble drag. We don't enter drag mode until
     * the pointer moves past BUBBLE_DRAG_THRESHOLD_PX — releasing before that
     * threshold is treated as a normal click/tap and opens the chat (via Toggle()).
     *
     * Pointer Events (not mousedown) so the same code path serves desktop mouse,
     * touch on phones/tablets, and pen input. setPointerCapture keeps the gesture
     * tied to this element even if the finger or cursor strays off the bubble.
     */
    public OnBubblePointerDown(event: PointerEvent): void {
        // Mouse: respect primary-button only. Touch/pen: button is always 0, so this passes naturally.
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Don't start a second drag while one is in flight (e.g. second finger on touch).
        if (this.activeBubblePointerId !== null) return;
        event.preventDefault();

        const target = event.currentTarget as HTMLElement;
        target.setPointerCapture(event.pointerId);
        this.bubbleCaptureTarget = target;

        this.activeBubblePointerId = event.pointerId;
        this.bubbleDragStartMouseY = event.clientY;
        this.bubbleDragStartOffset = this.BubbleOffsetY;
        this.bubbleDragMoved = false;
        this.IsBubblePressed = true;
        this.cdr.detectChanges();

        document.addEventListener('pointermove', this.onBubbleDragMove);
        document.addEventListener('pointerup', this.onBubbleDragEnd);
        document.addEventListener('pointercancel', this.onBubbleDragEnd);
    }

    private onBubbleDragMove = (event: PointerEvent): void => {
        if (event.pointerId !== this.activeBubblePointerId) return;
        const deltaY = this.bubbleDragStartMouseY - event.clientY; // dragging up = positive
        if (!this.bubbleDragMoved) {
            if (Math.abs(deltaY) < ChatAgentsOverlayComponent.BUBBLE_DRAG_THRESHOLD_PX) return;
            this.bubbleDragMoved = true;
            this.IsBubbleDragging = true;
        }
        this.BubbleOffsetY = this.clampBubbleOffsetY(this.bubbleDragStartOffset + deltaY);
        this.cdr.detectChanges();
    };

    private onBubbleDragEnd = (event: PointerEvent): void => {
        if (event.pointerId !== this.activeBubblePointerId) return;
        this.removeBubbleDragListeners();

        if (this.bubbleCaptureTarget) {
            // Browser may have implicitly released capture on pointerup already (per the
            // Pointer Events spec). releasePointerCapture throws in that race; safe to ignore.
            try { this.bubbleCaptureTarget.releasePointerCapture(event.pointerId); } catch { /* noop */ }
        }
        this.bubbleCaptureTarget = null;
        this.activeBubblePointerId = null;

        const wasDragged = this.bubbleDragMoved;
        const wasCancelled = event.type === 'pointercancel';
        this.bubbleDragMoved = false;
        this.IsBubbleDragging = false;
        this.IsBubblePressed = false;
        if (wasDragged) {
            this.savePreferences();
            this.cdr.detectChanges();
        } else if (!wasCancelled) {
            this.Toggle();
        } else {
            this.cdr.detectChanges();
        }
    };

    private removeBubbleDragListeners(): void {
        document.removeEventListener('pointermove', this.onBubbleDragMove);
        document.removeEventListener('pointerup', this.onBubbleDragEnd);
        document.removeEventListener('pointercancel', this.onBubbleDragEnd);
    }

    /**
     * Reserved space at the top of the viewport — host-supplied chrome plus
     * the padding gap we always keep above the bubble/panel.
     */
    private get topReservedPx(): number {
        return Math.max(0, this.TopBoundaryPx) + ChatAgentsOverlayComponent.VIEWPORT_TOP_PADDING_PX;
    }

    /** Clamp the offset so the bubble stays fully visible below the top boundary. */
    private clampBubbleOffsetY(value: number): number {
        const maxOffset = window.innerHeight
            - ChatAgentsOverlayComponent.BUBBLE_SIZE_PX
            - ChatAgentsOverlayComponent.BASE_BOTTOM_PX
            - this.topReservedPx;
        return Math.max(0, Math.min(Math.max(0, maxOffset), value));
    }

    // --- Render Position Getters ---

    /** Effective `bottom` (px) for the floating bubble, clamped to the current viewport. */
    public get BubbleBottomPx(): number {
        const ideal = ChatAgentsOverlayComponent.BASE_BOTTOM_PX + this.BubbleOffsetY;
        const max = window.innerHeight
            - ChatAgentsOverlayComponent.BUBBLE_SIZE_PX
            - this.topReservedPx;
        return Math.max(
            ChatAgentsOverlayComponent.BASE_BOTTOM_PX,
            Math.min(ideal, Math.max(ChatAgentsOverlayComponent.BASE_BOTTOM_PX, max))
        );
    }

    /**
     * Effective `bottom` (px) for the expanded panel. Anchors to the bubble's
     * current bottom edge so the panel grows up from where the user parked the
     * bubble, but clamps downward whenever the panel would otherwise extend
     * past the viewport's top boundary — that's the "reposition lower so the
     * chat interface stays visible" behavior.
     */
    public get PanelBottomPx(): number {
        const ideal = ChatAgentsOverlayComponent.BASE_BOTTOM_PX + this.BubbleOffsetY;
        const maxBottomForVisibility = window.innerHeight
            - this.PanelHeight
            - this.topReservedPx;
        return Math.max(
            ChatAgentsOverlayComponent.BASE_BOTTOM_PX,
            Math.min(ideal, maxBottomForVisibility)
        );
    }

    /**
     * Extracts a structured summary of the currently open record form from
     * `AppContext.AdditionalContext.Form` when the user is viewing a record.
     */
    public get ActiveRecordContext(): OverlayActiveRecordContextSummary | null {
        const additional = this.AppContext?.['AdditionalContext'] as Record<string, unknown> | undefined;
        const form = additional?.['Form'] as Record<string, unknown> | undefined;
        if (!form || typeof form['Entity'] !== 'string' || !form['Entity']) {
            return null;
        }
        const recordState = form['RecordState'] as Record<string, unknown> | undefined;
        const links = form['Links'] as Record<string, unknown> | undefined;
        const dirtyFieldNames = Array.isArray(recordState?.['DirtyFieldNames'])
            ? (recordState['DirtyFieldNames'] as unknown[]).filter((f): f is string => typeof f === 'string')
            : [];
        return {
            Entity: form['Entity'] as string,
            RecordPrimaryKey: typeof form['RecordPrimaryKey'] === 'string' ? (form['RecordPrimaryKey'] as string) : null,
            RecordDisplayName: typeof recordState?.['RecordDisplayName'] === 'string' ? (recordState['RecordDisplayName'] as string) : null,
            EditMode: recordState?.['EditMode'] === true,
            Dirty: recordState?.['Dirty'] === true,
            DirtyFieldNames: dirtyFieldNames,
            HasExternalUpdateConflict: recordState?.['HasExternalUpdateConflict'] === true,
            PreviewingHistoricalChangeID: typeof recordState?.['PreviewingHistoricalChangeID'] === 'string'
                ? (recordState['PreviewingHistoricalChangeID'] as string)
                : null,
            TotalLinksCount: typeof links?.['TotalCount'] === 'number' ? (links['TotalCount'] as number) : 0,
            OutgoingLinksCount: typeof links?.['OutgoingCount'] === 'number' ? (links['OutgoingCount'] as number) : 0,
            IncomingLinksCount: typeof links?.['IncomingCount'] === 'number' ? (links['IncomingCount'] as number) : 0,
        };
    }

    /**
     * Resolves the `MJ: Entities` ID for the currently active record form (`ActiveRecordContext.Entity`),
     * or `null` when no saved record form is active.
     */
    public get ActiveRecordEntityId(): string | null {
        const ctx = this.ActiveRecordContext;
        if (!ctx?.Entity || !ctx.RecordPrimaryKey) {
            return null;
        }
        const md = this.ProviderToUse;
        const entityNameLower = ctx.Entity.trim().toLowerCase();
        const entityInfo = md?.Entities?.find((e) => e.Name.trim().toLowerCase() === entityNameLower);
        return entityInfo?.ID ?? null;
    }

    /**
     * Normalizes `ActiveRecordContext.RecordPrimaryKey` into the `LinkedRecordID` value stored
     * on `MJ: Conversations` (stripping a single-key `"ID|"` prefix while preserving multi-key segments).
     */
    public get ActiveLinkedRecordId(): string | null {
        const rawKey = this.ActiveRecordContext?.RecordPrimaryKey?.trim();
        if (!rawKey) {
            return null;
        }
        if (!rawKey.includes('||') && rawKey.includes('|')) {
            const pipeIdx = rawKey.indexOf('|');
            const val = rawKey.slice(pipeIdx + 1).trim();
            if (val) {
                return val;
            }
        }
        return rawKey;
    }

    // --- Private Methods ---

    /**
     * Synchronizes the overlay's active conversation when the user opens, switches between,
     * or leaves an entity record form so "Ask AI" chats stay bound to their record.
     */
    private async syncActiveRecordBinding(): Promise<void> {
        const entityId = this.ActiveRecordEntityId;
        const recordId = this.ActiveLinkedRecordId;
        const nextRecordKey = entityId && recordId ? `${NormalizeUUID(entityId)}:${recordId}` : null;

        if (nextRecordKey === this.currentBoundRecordKey) {
            return;
        }
        const previousRecordKey = this.currentBoundRecordKey;
        this.currentBoundRecordKey = nextRecordKey;
        const generation = ++this.recordBindingGeneration;

        if (nextRecordKey && entityId && recordId) {
            // Entering a record from a non-record view: stash any active general conversation ID
            if (!previousRecordKey && !this.Conversation?.LinkedEntityID) {
                this.stashedGeneralConversationId = this._conversationId;
            }
            // Clear the global bridge so record chats never leak into the general Chat workspace on route changes
            this.bridge.SetActiveFromOverlay(null);

            this.resolveDefaults();
            if (!this.CurrentUser) {
                return;
            }

            const recordConvos = await ConversationEngine.Instance.LoadRecordConversations(
                entityId,
                recordId,
                this.CurrentUser,
                this.EnvironmentId,
                this.ProviderToUse
            );
            if (generation !== this.recordBindingGeneration) {
                return;
            }

            this.RecordConversations = recordConvos;
            const prevId = this._conversationId;
            if (recordConvos.length > 0) {
                const latest = recordConvos[0];
                this._conversationId = latest.ID;
                this.Conversation = latest;
                this.IsNewConversation = false;
                this.emitConversationSwitched(prevId, latest.ID);
            } else {
                this._conversationId = null;
                this.Conversation = null;
                this.IsNewConversation = true;
                this.emitConversationSwitched(prevId, null);
            }
            this.cdr.detectChanges();
            return;
        }

        // Leaving a record view back to a non-record screen
        this.RecordConversations = [];
        if (previousRecordKey) {
            const prevId = this._conversationId;
            const restoredId = this.stashedGeneralConversationId;
            this.stashedGeneralConversationId = null;
            this._conversationId = restoredId;
            this.Conversation = restoredId ? (ConversationEngine.Instance.GetConversation(restoredId) ?? null) : null;
            this.IsNewConversation = restoredId === null;
            this.bridge.SetActiveFromOverlay(restoredId);
            this.emitConversationSwitched(prevId, restoredId);
            this.cdr.detectChanges();
        }
    }

    /** Auto-resolve CurrentUser and EnvironmentId from Metadata when not provided as inputs */
    private resolveDefaults(): void {
        if (!this.CurrentUser) {
            const md = this.ProviderToUse;
            this.CurrentUser = md.CurrentUser;
        }
        if (!this.EnvironmentId) {
            this.EnvironmentId = MJEnvironmentEntityExtended.DefaultEnvironmentID;
        }
    }

    /** Load saved panel size and bubble position from UserInfoEngine */
    private loadPreferences(): void {
        try {
            const engine = UserInfoEngine.Instance;
            const raw = engine.GetSetting(ChatAgentsOverlayComponent.SIZE_SETTING_KEY);
            if (raw) {
                const prefs: OverlayPrefs = JSON.parse(raw);
                this.PanelWidth = this.clampWidth(prefs.width);
                this.PanelHeight = this.clampHeight(prefs.height);
                if (typeof prefs.bubbleOffsetY === 'number') {
                    this.BubbleOffsetY = Math.max(0, prefs.bubbleOffsetY);
                }
                if (typeof prefs.bubbleHidden === 'boolean') {
                    this.IsHidden = prefs.bubbleHidden;
                }
            }
        } catch {
            // Use defaults on error
        }
    }

    /** Persist panel size and bubble position to UserInfoEngine (debounced) */
    private savePreferences(): void {
        const prefs: OverlayPrefs = {
            width: this.PanelWidth,
            height: this.PanelHeight,
            bubbleOffsetY: this.BubbleOffsetY,
            bubbleHidden: this.IsHidden
        };
        UserInfoEngine.Instance.SetSettingDebounced(
            ChatAgentsOverlayComponent.SIZE_SETTING_KEY,
            JSON.stringify(prefs)
        );
    }

    /** Subscribe to bridge events for cross-view coordination */
    private subscribeToBridgeEvents(): void {
        this.bridge.SwitchEvent$
            .pipe(takeUntil(this.destroy$))
            .subscribe((event: ConversationSwitchEvent) => {
                if (event.Target === 'overlay') {
                    this.handleSwitchToOverlay(event);
                }
            });

        // Allow arbitrary callers (Form Builder cockpit, etc.) to ask the
        // overlay to expand. Idempotent if we're already expanded —
        // Expand() is safe to call in any state.
        this.bridge.ExpandOverlayRequested$
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                if (this.State === 'collapsed') {
                    this.Expand();
                }
            });

        this.bridge.ActiveConversationID$
            .pipe(takeUntil(this.destroy$))
            .subscribe((id: string | null) => {
                // Only update if the change came from outside (workspace)
                if (id !== this._conversationId && this.bridge.WorkspaceActive$.value) {
                    const prevId = this._conversationId;
                    this._conversationId = id;
                    this.IsNewConversation = id === null;
                    this.Conversation = null; // Will be loaded by chat area
                    this.emitConversationSwitched(prevId, id);
                    this.cdr.detectChanges();
                }
            });
    }

    /** Subscribe to agent client tool execution events */
    private subscribeToToolEvents(): void {
        this.agentClient.ToolExecuted$
            .pipe(takeUntil(this.destroy$))
            .subscribe((event: ClientToolResultEvent) => {
                this.ToolExecuted.emit(event);
            });
    }

    /** Handle request to switch conversation to the overlay */
    private handleSwitchToOverlay(event: ConversationSwitchEvent): void {
        const prevId = this._conversationId;
        this._conversationId = event.ConversationID;
        this.IsNewConversation = event.ConversationID === null;
        this.Conversation = null; // Will be reloaded by chat area
        this.Expand();
        this.emitConversationSwitched(prevId, event.ConversationID);
    }

    /** Emit a conversation switched event */
    private emitConversationSwitched(prevId: string | null, newId: string | null): void {
        this.ConversationSwitched.emit({
            PreviousConversationID: prevId,
            NewConversationID: newId
        });
    }
}
