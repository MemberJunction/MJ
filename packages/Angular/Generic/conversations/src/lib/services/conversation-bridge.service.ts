/**
 * @fileoverview Conversation Bridge Service
 *
 * Provides shared state between the floating chat overlay and the
 * full Conversations workspace. Ensures conversation continuity
 * when switching between the two views.
 *
 * Key responsibilities:
 * - Tracks the active ConversationID across overlay and workspace
 * - Maintains message history reference (no duplication)
 * - Supports deep link navigation to specific conversations
 * - Emits events when the active conversation changes
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

/** Event emitted when switching between overlay and workspace */
export interface ConversationSwitchEvent {
    /** The conversation ID being transferred */
    ConversationID: string | null;
    /** Source of the switch */
    Source: 'overlay' | 'workspace' | 'deep-link';
    /** Target destination */
    Target: 'overlay' | 'workspace';
}

/** Deep link parameters for navigating to a conversation */
export interface ConversationDeepLink {
    ConversationID: string;
    /** Optional: scroll to a specific message */
    MessageID?: string;
    /** Optional: auto-open the overlay or workspace */
    OpenIn?: 'overlay' | 'workspace';
}

@Injectable({ providedIn: 'root' })
export class ConversationBridgeService {
    /** The currently active conversation ID shared between overlay and workspace */
    public ActiveConversationID$ = new BehaviorSubject<string | null>(null);

    /** Whether the overlay is currently active (expanded) */
    public OverlayActive$ = new BehaviorSubject<boolean>(false);

    /** Whether the full workspace is currently active (visible) */
    public WorkspaceActive$ = new BehaviorSubject<boolean>(false);

    /** Events emitted when switching between overlay and workspace */
    public SwitchEvent$ = new Subject<ConversationSwitchEvent>();

    /** Deep link requests */
    public DeepLinkRequest$ = new Subject<ConversationDeepLink>();

    /**
     * "Expand the overlay" requests from anywhere in the app — typically
     * a dashboard's "Refine with AI" button that wants to pop the chat
     * after setting fresh AppContext. The mounted overlay subscribes and
     * calls its own `Expand()` in response. Decoupled this way because the
     * overlay component reference isn't reachable from arbitrary callers,
     * and we don't want everyone to take a hard dep on the overlay class.
     */
    public ExpandOverlayRequested$ = new Subject<void>();

    /**
     * Ask the overlay to expand. Idempotent if already expanded.
     */
    public RequestExpandOverlay(): void {
        this.ExpandOverlayRequested$.next();
    }

    /**
     * Set the active conversation from the overlay.
     * The workspace will pick up the change automatically.
     */
    public SetActiveFromOverlay(conversationId: string | null): void {
        this.ActiveConversationID$.next(conversationId);
    }

    /**
     * Set the active conversation from the workspace.
     * The overlay will pick up the change automatically.
     */
    public SetActiveFromWorkspace(conversationId: string | null): void {
        this.ActiveConversationID$.next(conversationId);
    }

    /**
     * Request switching from overlay to full workspace.
     * The overlay should minimize, and the workspace should open
     * with the same conversation.
     */
    public SwitchToWorkspace(conversationId: string | null): void {
        this.SwitchEvent$.next({
            ConversationID: conversationId,
            Source: 'overlay',
            Target: 'workspace'
        });
    }

    /**
     * Request switching from workspace to overlay.
     * The workspace can stay open, but the overlay resumes
     * the conversation.
     */
    public SwitchToOverlay(conversationId: string | null): void {
        this.SwitchEvent$.next({
            ConversationID: conversationId,
            Source: 'workspace',
            Target: 'overlay'
        });
    }

    /**
     * Navigate to a specific conversation via deep link.
     */
    public NavigateToConversation(deepLink: ConversationDeepLink): void {
        this.ActiveConversationID$.next(deepLink.ConversationID);
        this.DeepLinkRequest$.next(deepLink);
    }

    /**
     * Notify that the overlay is now active.
     */
    public NotifyOverlayActive(active: boolean): void {
        this.OverlayActive$.next(active);
    }

    /**
     * Notify that the workspace is now active.
     */
    public NotifyWorkspaceActive(active: boolean): void {
        this.WorkspaceActive$.next(active);
    }

    /**
     * Check if the conversation should be resumed in the overlay
     * (i.e., workspace is not active but there's an active conversation).
     */
    public ShouldResumeInOverlay(): boolean {
        return !this.WorkspaceActive$.value && this.ActiveConversationID$.value !== null;
    }
}
