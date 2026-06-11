/**
 * @fileoverview Before/After cancelable event argument classes for the
 * conversations widget.
 *
 * Follows MJ's established Before/After cancelable event pattern (see
 * `packages/Angular/Generic/trees/src/lib/events/tree-events.ts` and
 * `packages/Angular/Generic/base-forms/src/lib/types/form-events.ts`).
 *
 * **Contract:** Action events come as `Before*` / `After*` pairs. The
 * `Before*` event carries an args object extending {@link CancellableChatEventArgs}
 * with a `Cancel: boolean` property the listener can flip. The component
 * checks `if (event.Cancel) return;` before proceeding and emits the
 * corresponding `After*` only on the non-canceled path. Informational
 * events (progress, shown-notifications, session lifecycle) stay as single
 * emitters without a Before-pair.
 *
 * @module @memberjunction/ng-conversations
 */

import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/**
 * Base class for cancelable chat events. Listeners flip `Cancel = true` to
 * halt the default behavior; the matching `After*` event will NOT fire.
 * The optional `CancelReason` is a free-form string for telemetry / debug.
 */
export class CancellableChatEventArgs {
    public Cancel: boolean = false;
    public CancelReason?: string;
}

// ────────────────────────────────────────────────────────────────────
// Agent-turn lifecycle
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE a user message is sent to the agent. Listeners can cancel
 * (e.g., a guardrail that blocks empty messages or messages matching a
 * forbidden pattern).
 */
export class BeforeAgentTurnEventArgs extends CancellableChatEventArgs {
    constructor(
        public readonly ConversationId: string,
        public readonly MessageText: string,
        public readonly ApplicationId: string | null = null
    ) {
        super();
    }
}

/**
 * Fired AFTER a successful agent turn completes. Carries the agent run id
 * and the underlying `ExecuteAgentResult`. NOT fired when the corresponding
 * `BeforeAgentTurnEventArgs` was canceled or the turn errored.
 */
export class AfterAgentTurnEventArgs {
    constructor(
        public readonly ConversationId: string,
        public readonly AgentRunId: string,
        public readonly Result: ExecuteAgentResult
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// Tool invocations
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE the agent invokes a registered client tool. Listeners can veto
 * the dispatch by setting `event.Cancel = true` — `AgentClientSession`
 * short-circuits, the tool handler does NOT run, `afterToolInvoked` does NOT
 * fire, and the server receives a failure response carrying the optional
 * `CancelReason`.
 *
 * @example Confirm before a destructive tool runs
 * ```typescript
 * onBeforeToolInvoked(event: BeforeToolInvokedEventArgs) {
 *   if (event.ToolName === 'deleteRecord') {
 *     if (!confirm('Agent wants to delete a record. Allow?')) {
 *       event.Cancel = true;
 *       event.CancelReason = 'User declined deletion';
 *     }
 *   }
 * }
 * ```
 */
export class BeforeToolInvokedEventArgs extends CancellableChatEventArgs {
    constructor(
        public readonly ToolName: string,
        public readonly Args: unknown
    ) {
        super();
    }
}

/**
 * Fired AFTER a tool invocation completes. Carries the tool name, the
 * arguments it was called with, and the result it produced. NOT fired when
 * the corresponding `BeforeToolInvokedEventArgs` was canceled — the contract
 * is enforced in `AgentClientSession.handleToolRequest`.
 */
export class AfterToolInvokedEventArgs {
    constructor(
        public readonly ToolName: string,
        public readonly Args: unknown,
        public readonly Result: unknown
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// Response forms
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE a response form's submitted values are sent back to the
 * agent. Listeners can cancel (e.g., a validation pass that blocks
 * submission until certain fields are populated).
 */
export class BeforeResponseFormSubmittedEventArgs extends CancellableChatEventArgs {
    constructor(
        public readonly FormId: string,
        public readonly Values: Record<string, unknown>
    ) {
        super();
    }
}

/**
 * Fired AFTER a response form's submitted values have been sent. NOT fired
 * when the corresponding `BeforeResponseFormSubmittedEventArgs` was
 * canceled.
 */
export class AfterResponseFormSubmittedEventArgs {
    constructor(
        public readonly FormId: string,
        public readonly Values: Record<string, unknown>
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// Session lifecycle (informational — no Before-pair)
// ────────────────────────────────────────────────────────────────────

/**
 * Informational event — fired when a Session/Channel lifecycle event arrives
 * from the conversations runtime. Cancellation of voice/realtime activity
 * lives at the Sessions layer (PR #2787), not here.
 */
export class SessionStartedEventArgs {
    constructor(
        public readonly SessionId: string,
        public readonly ChannelKinds: readonly string[]
    ) {}
}

/** Informational. See {@link SessionStartedEventArgs}. */
export class SessionChannelStateChangedEventArgs {
    constructor(
        public readonly SessionId: string,
        public readonly ChannelKind: string,
        public readonly State: 'opening' | 'open' | 'closing' | 'closed'
    ) {}
}

/** Informational. See {@link SessionStartedEventArgs}. */
export class SessionEndedEventArgs {
    constructor(
        public readonly SessionId: string,
        public readonly Reason: string
    ) {}
}
