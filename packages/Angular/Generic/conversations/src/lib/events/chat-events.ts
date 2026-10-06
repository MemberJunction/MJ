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
import type { AgentTurnInfo, AgentTurnRoute } from '../models/agent-turn.model';

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
 * Fired once per agent turn, BEFORE any reply row exists: the person's message is saved and the
 * chat area has picked the agent that will answer it, on whichever route chose it (a tagged
 * agent, the last agent that answered, a pinned or host default agent, or the conversation
 * manager). A message that starts no turn (see `AgentReplyMode`) fires nothing.
 *
 * A listener can:
 * - cancel the turn (`Cancel = true`). Nothing more is written: no placeholder, no reply row,
 *   and `AfterAgentTurn` does not fire. `CancelReason` is logged, not shown.
 * - send the turn to a different agent by setting {@link RedirectAgentId}. The agent must be
 *   one the chat allows (`AllowedAgentIDs`); otherwise the turn is refused with a notice.
 *
 * Listeners run synchronously: the chat area reads `Cancel` and `RedirectAgentId` as soon as
 * `emit()` returns.
 *
 * Earlier releases fired this event only on the conversation-manager route, after that route's
 * placeholder row was saved, so a cancel left the row behind marked "Turn canceled".
 */
export class BeforeAgentTurnEventArgs extends CancellableChatEventArgs {
    /** The agent the turn resolved to. Null only when the args were built without turn details. */
    public readonly AgentId: string | null;
    /** The agent's name, when known. */
    public readonly AgentName: string | null;
    /** How the agent was chosen. */
    public readonly Route: AgentTurnRoute | null;
    /** The person's saved message the turn answers. */
    public readonly UserMessageId: string | null;
    /**
     * Set to send the turn to a different agent instead. Null (the default) keeps
     * {@link AgentId}. The turn then runs with `Route` `'Redirect'`.
     */
    public RedirectAgentId: string | null = null;

    constructor(
        public readonly ConversationId: string,
        public readonly MessageText: string,
        public readonly ApplicationId: string | null = null,
        turn: AgentTurnInfo | null = null
    ) {
        super();
        this.AgentId = turn?.AgentId ?? null;
        this.AgentName = turn?.AgentName ?? null;
        this.Route = turn?.Route ?? null;
        this.UserMessageId = turn?.UserMessageId ?? null;
    }
}

/**
 * Fired AFTER a successful agent turn, on every route. Carries the agent run id and the
 * underlying `ExecuteAgentResult`. NOT fired when the corresponding `BeforeAgentTurnEventArgs`
 * was canceled, when the turn failed, or when a host `AgentTurnHandler` reported no `Result`.
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
// Stopping an in-progress agent run
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an in-progress agent run is stopped, when the person clicks Stop on the reply
 * the run is writing. Listeners can cancel (`Cancel = true`): nothing is written, the control
 * stays available, and `AfterStopClicked` does not fire. `AgentRunId` is null when the run
 * row has not been seen by the chat yet (the first moment after the reply placeholder appears);
 * the stop is then resolved by the reply's detail id.
 *
 * Listeners run synchronously: the message item reads `Cancel` as soon as `emit()` returns.
 */
export class BeforeStopClickedEventArgs extends CancellableChatEventArgs {
    constructor(
        public readonly ConversationDetailId: string,
        public readonly AgentRunId: string | null
    ) {
        super();
    }
}

/**
 * Fired AFTER a stop was attempted. `Stopped` is whether the run's row was marked Cancelled;
 * false means the run had already finished or the write was refused. NOT fired when the
 * corresponding `BeforeStopClickedEventArgs` was canceled.
 */
export class AfterStopClickedEventArgs {
    constructor(
        public readonly ConversationDetailId: string,
        public readonly AgentRunId: string | null,
        public readonly Stopped: boolean
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// Session lifecycle (informational — no Before-pair)
// ────────────────────────────────────────────────────────────────────
//
// These re-broadcast the `SessionLifecycleEvent` variants from
// `@memberjunction/conversations-runtime`'s `SessionsObserver`. State/Reason
// union types are intentionally narrowed to what's distinguishable client-side
// today — see the `ISessionsAdapter` JSDoc in the runtime package for the full
// rationale (no per-channel `opening`/`closing` observable, server-only
// `Janitor`/`Shutdown` reasons that never reach the browser).

/**
 * Informational event — fired when a realtime session has fully started
 * (server-issued `sessionId` is set AND the realtime client is connected).
 * Cancellation of voice/realtime activity lives at the Sessions layer
 * (PR #2787), not here.
 */
export class SessionStartedEventArgs {
    constructor(
        public readonly SessionId: string,
        public readonly ChannelKinds: readonly string[]
    ) {}
}

/**
 * Informational. A channel inside a session opened or closed. Narrowed to
 * `open | closed` — see {@link SessionStartedEventArgs} module comment.
 */
export class SessionChannelStateChangedEventArgs {
    constructor(
        public readonly SessionId: string,
        public readonly ChannelKind: string,
        public readonly State: 'open' | 'closed'
    ) {}
}

/**
 * Informational. A session ended client-side. Narrowed to
 * `explicit | error | unknown` — see {@link SessionStartedEventArgs} module comment.
 */
export class SessionEndedEventArgs {
    constructor(
        public readonly SessionId: string,
        public readonly Reason: 'explicit' | 'error' | 'unknown'
    ) {}
}
