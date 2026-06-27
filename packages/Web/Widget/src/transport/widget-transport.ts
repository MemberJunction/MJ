/**
 * @fileoverview The transport seam between the widget UI and the agent pathway.
 *
 * The UI element depends only on this interface, so it is unit-testable with a mock
 * and decoupled from the heavy ConversationsRuntime + GraphQL wiring. The real
 * implementation (`RuntimeWidgetTransport`) reuses `ConversationsRuntime` +
 * `@memberjunction/graphql-dataprovider` against MJAPI with the guest token — it does
 * NOT reimplement chat or agent dispatch (anti-drift checklist).
 *
 * @module @memberjunction/web-widget
 */

import type { WidgetSession } from '../types.js';

/** Streaming progress callback while an agent turn runs. */
export type WidgetProgressCallback = (message: string, percentage?: number) => void;

/** Result of one user turn → agent reply. */
export interface WidgetTurnResult {
    /** The agent's reply text (empty string if the agent produced no textual output). */
    reply: string;
    /** True when the turn completed successfully. */
    success: boolean;
    error?: string;
}

/**
 * Abstraction over "start a conversation and exchange turns with the pinned agent."
 * One transport instance per mounted widget session.
 */
export interface IWidgetTransport {
    /** Initializes the transport with the freshly-minted guest session. */
    Initialize(session: WidgetSession): Promise<void>;

    /** Updates the held token after a refresh (no reconnection of the conversation). */
    UpdateToken(token: string): void;

    /**
     * Sends a user message and resolves with the agent's reply. The pinned agent id
     * from the session is ALWAYS passed as explicitAgentId (D5) — the transport never
     * lets the caller pick an arbitrary agent.
     */
    SendMessage(text: string, onProgress?: WidgetProgressCallback): Promise<WidgetTurnResult>;

    /** Tears down the conversation/session resources. */
    Dispose(): Promise<void>;
}
