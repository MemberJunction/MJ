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
    OnDestroy,
    OnInit,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UserInfo, Metadata, CompositeKey } from '@memberjunction/core';
import { MJConversationEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { ClientToolResultEvent } from '@memberjunction/ai-agent-client';
import { ConversationBridgeService, ConversationSwitchEvent } from '../../services/conversation-bridge.service';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { PendingAttachment } from '../mention/mention-editor.component';

/** Visual state of the overlay panel */
export type ChatOverlayState = 'collapsed' | 'expanded';

/** Event payload when the active conversation changes in the overlay */
export interface OverlayConversationSwitchedEvent {
    PreviousConversationID: string | null;
    NewConversationID: string | null;
}

@Component({
    standalone: false,
    selector: 'mj-chat-agents-overlay',
    templateUrl: './chat-overlay.component.html',
    styleUrls: ['./chat-overlay.component.css']
})
export class ChatAgentsOverlayComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private bridge = inject(ConversationBridgeService);
    private agentClient = inject(AgentClientService);
    private destroy$ = new Subject<void>();

    // --- Inputs ---

    /** Controls external visibility (e.g., parent hides overlay on chat route) */
    private _IsVisible = true;

    @Input()
    set IsVisible(value: boolean) {
        const prev = this._IsVisible;
        this._IsVisible = value;
        if (!value && prev && this.State === 'expanded') {
            this.Collapse();
        }
        this.cdr.detectChanges();
    }
    get IsVisible(): boolean {
        return this._IsVisible;
    }

    /** Current user info, passed through to conversation-chat-area */
    @Input() CurrentUser!: UserInfo;

    /** Environment ID, passed through to conversation-chat-area */
    @Input() EnvironmentId!: string;

    // --- Outputs ---

    /** Emitted when the overlay visibility changes (collapsed/expanded) */
    @Output() VisibilityChanged = new EventEmitter<ChatOverlayState>();

    /** Emitted when a tool finishes executing in the agent client */
    @Output() ToolExecuted = new EventEmitter<ClientToolResultEvent>();

    /** Emitted when the active conversation changes in the overlay */
    @Output() ConversationSwitched = new EventEmitter<OverlayConversationSwitchedEvent>();

    /** Emitted when the user requests opening the full workspace */
    @Output() OpenFullWorkspace = new EventEmitter<string | null>();

    /** Emitted when navigation is requested (entity record, etc.) */
    @Output() NavigationRequested = new EventEmitter<NavigationRequest>();

    /** Emitted when an entity record open is requested */
    @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

    /** Emitted when a task is clicked */
    @Output() TaskClicked = new EventEmitter<MJTaskEntity>();

    // --- Component State ---

    public State: ChatOverlayState = 'collapsed';
    public UnreadCount = 0;

    /** Active conversation ID managed locally */
    private _conversationId: string | null = null;
    public get ConversationId(): string | null {
        return this._conversationId;
    }

    /** Active conversation entity */
    public Conversation: MJConversationEntity | null = null;

    /** Whether a new unsaved conversation is in progress */
    public IsNewConversation = true;

    // --- Lifecycle ---

    ngOnInit(): void {
        this.subscribeToBridgeEvents();
        this.subscribeToToolEvents();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
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

    /** Handle the user requesting to open full workspace */
    public OnOpenFullWorkspace(): void {
        this.OpenFullWorkspace.emit(this._conversationId);
        this.bridge.SwitchToWorkspace(this._conversationId);
        this.Collapse();
    }

    /** Handle conversation creation from the chat area */
    public OnConversationCreated(event: {
        conversation: MJConversationEntity;
        pendingMessage?: string;
        pendingAttachments?: PendingAttachment[];
    }): void {
        const prevId = this._conversationId;
        this._conversationId = event.conversation.ID;
        this.Conversation = event.conversation;
        this.IsNewConversation = false;
        this.bridge.SetActiveFromOverlay(event.conversation.ID);
        this.emitConversationSwitched(prevId, event.conversation.ID);
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
        this.IsNewConversation = true;
        this.bridge.SetActiveFromOverlay(null);
        this.emitConversationSwitched(prevId, null);
        this.cdr.detectChanges();
    }

    /** Increment unread badge (called externally when messages arrive while collapsed) */
    public IncrementUnread(): void {
        if (this.State === 'collapsed') {
            this.UnreadCount++;
            this.cdr.detectChanges();
        }
    }

    // --- Private Methods ---

    /** Subscribe to bridge events for cross-view coordination */
    private subscribeToBridgeEvents(): void {
        this.bridge.SwitchEvent$
            .pipe(takeUntil(this.destroy$))
            .subscribe((event: ConversationSwitchEvent) => {
                if (event.Target === 'overlay') {
                    this.handleSwitchToOverlay(event);
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
