/**
 * @fileoverview Pure-TypeScript bridge between conversation surfaces.
 *
 * Ported from `@memberjunction/ng-conversations/src/lib/services/conversation-bridge.service.ts`.
 * The original was pure RxJS — the `@Injectable()` decorator was the only Angular dep. Stripped
 * that, kept the API identical, renamed `ConversationBridgeService` → `ConversationBridge`
 * (no "Service" suffix since this layer doesn't use Angular DI).
 *
 * Coordinates active-conversation state across multiple surfaces:
 * - the corner overlay (`mj-chat-agents-overlay`)
 * - the full-page Chat workspace (`mj-chat-conversations-resource`)
 * - any future composite surface (e.g., embedded panels in dashboards)
 *
 * @module @memberjunction/conversations-runtime
 */

import { BehaviorSubject, Subject } from 'rxjs';

/** Event emitted when switching between overlay and workspace surfaces. */
export interface ConversationSwitchEvent {
    /** The conversation ID being transferred. */
    ConversationID: string | null;
    /** Surface initiating the switch. */
    Source: 'overlay' | 'workspace' | 'deep-link';
    /** Surface that should pick up the conversation. */
    Target: 'overlay' | 'workspace';
}

/** Deep-link parameters for navigating directly to a conversation. */
export interface ConversationDeepLink {
    ConversationID: string;
    /** Optional: scroll to a specific message after opening. */
    MessageID?: string;
    /** Optional: auto-open the overlay or workspace. */
    OpenIn?: 'overlay' | 'workspace';
}

/**
 * Shared state between conversation surfaces. Pure observable hub — knows nothing about
 * any specific UI framework. Consumers subscribe to the streams they care about.
 *
 * Usually accessed via `ConversationsRuntime.Instance.Bridge`.
 */
export class ConversationBridge {
    /** The currently active conversation ID shared between overlay and workspace. */
    public ActiveConversationID$ = new BehaviorSubject<string | null>(null);

    /** Whether the overlay surface is currently active (expanded). */
    public OverlayActive$ = new BehaviorSubject<boolean>(false);

    /** Whether the full workspace surface is currently active (visible). */
    public WorkspaceActive$ = new BehaviorSubject<boolean>(false);

    /** Events emitted when switching between overlay and workspace. */
    public SwitchEvent$ = new Subject<ConversationSwitchEvent>();

    /** Deep-link navigation requests. */
    public DeepLinkRequest$ = new Subject<ConversationDeepLink>();

    /**
     * "Expand the overlay" requests from anywhere in the app — typically a dashboard's
     * "Refine with AI" button that wants to pop the chat after setting fresh AppContext.
     * The mounted overlay subscribes and calls its own `Expand()` in response. Decoupled
     * this way because the overlay component reference isn't reachable from arbitrary
     * callers, and we don't want everyone to take a hard dep on the overlay class.
     */
    public ExpandOverlayRequested$ = new Subject<void>();

    /** Ask the overlay to expand. Idempotent if already expanded. */
    public RequestExpandOverlay(): void {
        this.ExpandOverlayRequested$.next();
    }

    /**
     * Set the active conversation from the overlay. The workspace picks up the change
     * automatically via the shared `ActiveConversationID$` stream.
     */
    public SetActiveFromOverlay(conversationId: string | null): void {
        this.ActiveConversationID$.next(conversationId);
    }

    /**
     * Set the active conversation from the workspace. The overlay picks up the change
     * automatically via the shared `ActiveConversationID$` stream.
     */
    public SetActiveFromWorkspace(conversationId: string | null): void {
        this.ActiveConversationID$.next(conversationId);
    }

    /**
     * Request switching from overlay to full workspace. The overlay should minimize;
     * the workspace should open with the same conversation.
     */
    public SwitchToWorkspace(conversationId: string | null): void {
        this.SwitchEvent$.next({
            ConversationID: conversationId,
            Source: 'overlay',
            Target: 'workspace',
        });
    }

    /**
     * Request switching from workspace to overlay. The workspace can stay open, but the
     * overlay resumes the conversation.
     */
    public SwitchToOverlay(conversationId: string | null): void {
        this.SwitchEvent$.next({
            ConversationID: conversationId,
            Source: 'workspace',
            Target: 'overlay',
        });
    }

    /** Navigate to a specific conversation via deep link. */
    public NavigateToConversation(deepLink: ConversationDeepLink): void {
        this.ActiveConversationID$.next(deepLink.ConversationID);
        this.DeepLinkRequest$.next(deepLink);
    }

    /** Notify that the overlay is now active (or inactive). */
    public NotifyOverlayActive(active: boolean): void {
        this.OverlayActive$.next(active);
    }

    /** Notify that the workspace is now active (or inactive). */
    public NotifyWorkspaceActive(active: boolean): void {
        this.WorkspaceActive$.next(active);
    }

    /**
     * `true` when the workspace is not active but there's an active conversation —
     * i.e., the overlay should resume that conversation when expanded.
     */
    public ShouldResumeInOverlay(): boolean {
        return !this.WorkspaceActive$.value && this.ActiveConversationID$.value !== null;
    }
}
