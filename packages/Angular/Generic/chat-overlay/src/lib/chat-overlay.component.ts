/**
 * @fileoverview Floating Chat Overlay Component (Option B)
 *
 * A floating bubble in the bottom-right that expands to a chat panel.
 * Uses mj-chat internally and ConversationDataService for persistence.
 * Auto-minimizes when the full Conversations workspace is active.
 * Supports notification badges, agent context awareness, and smooth animations.
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
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
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
    private router = inject(Router);
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

    /** Route patterns that should hide the overlay (regex) */
    @Input() HideOnRoutes: string[] = ['/conversations'];

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
    public IsRouteHidden = false;

    ngOnInit(): void {
        this.subscribeToRouteChanges();
        this.checkCurrentRoute();
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

    // --- Private Methods ---

    private subscribeToRouteChanges(): void {
        this.router.events
            .pipe(
                filter(event => event instanceof NavigationEnd),
                takeUntil(this.destroy$)
            )
            .subscribe(() => this.checkCurrentRoute());
    }

    private checkCurrentRoute(): void {
        const url = this.router.url;
        this.IsRouteHidden = this.HideOnRoutes.some(pattern => {
            const regex = new RegExp(pattern);
            return regex.test(url);
        });

        if (this.IsRouteHidden && this.State === 'expanded') {
            this.Minimize();
        }
        this.cdr.detectChanges();
    }
}
