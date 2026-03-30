/**
 * @fileoverview Floating Chat Overlay Component (Option B)
 *
 * A floating bubble in the bottom-right that expands to a chat panel.
 * Uses mj-chat internally for rendering.
 * Auto-minimizes when IsHidden input is set to true (controlled by parent).
 * Supports notification badges, agent context awareness, and smooth animations.
 *
 * NOTE: This is a Generic component — it does NOT import Router or any
 * Explorer-specific services. Route-based visibility is controlled by the
 * parent (e.g., MJExplorerAppComponent) via the IsHidden input.
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
import { ChatMessage } from '@memberjunction/ng-chat';

/** State of the overlay */
export type OverlayState = 'minimized' | 'expanded' | 'hidden';

@Component({
    standalone: false,
    selector: 'mj-chat-overlay',
    templateUrl: './chat-overlay.component.html',
    styleUrls: ['./chat-overlay.component.css']
})
export class ChatOverlayComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    // --- Inputs ---

    /** The default agent ID to connect to */
    @Input() DefaultAgentId = '';

    /** The current conversation ID for persistence */
    private _ConversationId: string | null = null;

    @Input()
    set ConversationId(value: string | null) {
        const prev = this._ConversationId;
        this._ConversationId = value;
        if (value !== prev) {
            this.ConversationIdChange.emit(value);
        }
    }
    get ConversationId(): string | null {
        return this._ConversationId;
    }

    /**
     * Whether the overlay should be hidden. Controlled by the parent component
     * based on the current route (e.g., hide when in full Conversations workspace).
     * Generic components do not use Router — the parent passes this value.
     */
    private _IsHidden = false;

    @Input()
    set IsHidden(value: boolean) {
        const prev = this._IsHidden;
        this._IsHidden = value;
        if (value && !prev && this.State === 'expanded') {
            this.Minimize();
        }
        this.cdr.detectChanges();
    }
    get IsHidden(): boolean {
        return this._IsHidden;
    }

    /** Chat messages */
    @Input() Messages: ChatMessage[] = [];

    /** Whether sending is currently allowed */
    @Input() AllowSend = true;

    /** Whether to show the waiting indicator */
    @Input() ShowWaitingIndicator = false;

    /** Placeholder text for the chat input */
    @Input() Placeholder = 'Ask a question...';

    // --- Outputs ---

    @Output() ConversationIdChange = new EventEmitter<string | null>();
    @Output() MessageAdded = new EventEmitter<ChatMessage>();
    @Output() OverlayStateChanged = new EventEmitter<OverlayState>();
    @Output() OpenFullWorkspace = new EventEmitter<string | null>();

    // --- Component State ---

    public State: OverlayState = 'minimized';
    public UnreadCount = 0;

    ngOnInit(): void {
        // No route subscription — visibility controlled via IsHidden input
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Toggle the overlay between minimized and expanded */
    public Toggle(): void {
        if (this.State === 'minimized') {
            this.Expand();
        } else {
            this.Minimize();
        }
    }

    /** Expand the overlay to show the chat panel */
    public Expand(): void {
        this.State = 'expanded';
        this.UnreadCount = 0;
        this.OverlayStateChanged.emit(this.State);
        this.cdr.detectChanges();
    }

    /** Minimize the overlay to the bubble */
    public Minimize(): void {
        this.State = 'minimized';
        this.OverlayStateChanged.emit(this.State);
        this.cdr.detectChanges();
    }

    /** Handle a new message from the chat component */
    public OnMessageAdded(message: ChatMessage): void {
        this.MessageAdded.emit(message);
    }

    /** Handle clicking "Open in workspace" */
    public OnOpenFullWorkspace(): void {
        this.OpenFullWorkspace.emit(this.ConversationId);
        this.Minimize();
    }

    /** Increment the unread badge (called by parent when AI responds while minimized) */
    public IncrementUnread(): void {
        if (this.State === 'minimized') {
            this.UnreadCount++;
            this.cdr.detectChanges();
        }
    }
}
