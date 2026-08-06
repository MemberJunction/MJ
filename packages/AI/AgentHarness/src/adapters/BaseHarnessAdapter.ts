import { HarnessCapabilities, HarnessSessionConfig, HarnessTurnEvent } from '../types.js';

/**
 * The contract every external agent harness is driven through.
 *
 * Adapters register with `@RegisterClass(BaseHarnessAdapter, '<DriverClass>')` and are resolved from
 * `AIAgentHarness.DriverClass`, so a customer can ship a proprietary adapter without forking core —
 * the same extension mechanism AI model vendor drivers already use.
 *
 * ## Why this interface is turn-oriented rather than session-oriented
 *
 * A harness turn is protocol-identical to a Loop agent's prompt iteration: the harness reasons, then
 * ends its turn by emitting the Loop next-step JSON envelope. MJ executes any actions, sub-agents or
 * skills that envelope asks for through its OWN validated machinery, then resumes the session with
 * the results. That is the whole reason the harness plugs into `BaseAgent`'s existing loop instead of
 * running beside it — every guardrail, payload ACL, HITL gate and accounting path applies unchanged.
 *
 * So {@link RunTurn} is the unit of work, not `Run`. The first call carries the task prompt; every
 * later call carries formatted step results.
 *
 * ## Capability honesty
 *
 * {@link Capabilities} must describe what the adapter ACTUALLY implements, not what the underlying
 * harness advertises. The runtime gates behaviour on these flags and emulates what is missing —
 * claiming a capability that is not wired up produces a silent behavioural gap rather than an error,
 * which is the failure mode this whole feature is trying to avoid elsewhere.
 */
export abstract class BaseHarnessAdapter {
    /**
     * Launches the harness session. Called once per run, before the first turn.
     *
     * Implementations must not begin reasoning here — only establish the process, workspace and
     * credentials. Any failure should throw, so the run fails visibly rather than proceeding with a
     * half-built session.
     */
    public abstract StartSession(config: HarnessSessionConfig): Promise<void>;

    /**
     * Runs one turn and streams what happens.
     *
     * The first call receives the task prompt; subsequent calls receive formatted results of steps MJ
     * executed on the harness's behalf. Implementations MUST emit exactly one terminal event —
     * `turn-complete` or `session-error` — so the caller's accumulation loop always terminates.
     *
     * Where the harness cannot resume a session natively (`SessionResume` false), the adapter is
     * responsible for replaying prior context into a fresh invocation here, and for reporting the
     * resulting token cost through `usage` so the run's guardrails see the true spend.
     */
    public abstract RunTurn(input: string): AsyncIterable<HarnessTurnEvent>;

    /**
     * Answers a `permission-request` the adapter raised.
     *
     * Only meaningful when {@link Capabilities}.PermissionHooks is true; adapters without hooks
     * should treat this as a no-op rather than throwing, because the posture layer above may still
     * call it defensively.
     */
    public abstract RespondToPermission(requestId: string, approved: boolean, note?: string): Promise<void>;

    /**
     * Tears the session down.
     *
     * MUST be idempotent and MUST be safe to call on every exit path — success, failure,
     * cancellation and crash — because it is what revokes the per-run MCP credential and releases the
     * workspace. A teardown that only runs on the happy path leaks a live credential.
     */
    public abstract EndSession(): Promise<void>;

    /** What this adapter actually supports. See the class doc on capability honesty. */
    public abstract get Capabilities(): HarnessCapabilities;

    /** Vendor session id once known, persisted to `AIAgentRun.ExternalSessionID`. */
    public get SessionId(): string | undefined {
        return undefined;
    }
}
