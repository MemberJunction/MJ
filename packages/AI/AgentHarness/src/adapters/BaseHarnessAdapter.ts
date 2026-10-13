import { HarnessCapabilities, HarnessPermissionPolicy, HarnessSessionConfig, HarnessTurnEvent } from '../types.js';

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
     * Supplies MJ's system prompt for the session, where the harness can accept one.
     *
     * Harnesses ship their own system prompt defining their identity, and it dominates anything sent
     * as user text. MJ's turn-end contract delivered as a user message therefore competes with the
     * harness's own instructions and loses — observed directly: a harness given the contract in the
     * user turn still answered "what can you do?" in prose, costing a retry every run.
     *
     * Adapters whose harness accepts a system prompt SHOULD override this. Those that cannot are no
     * worse off than before: the contract still rides in the turn input.
     */
    public SetSystemPrompt(_systemPrompt: string): void {
        // Default: unsupported, and deliberately not an error.
    }

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

    /**
     * Translates MJ's permission policy into whatever this harness understands.
     *
     * Overridable and default no-op, matching the other capability seams. An adapter that cannot
     * enforce permissions should leave this alone AND report `PermissionHooks: false`, so the
     * runtime knows the policy is advisory rather than enforced. Silently accepting a policy you
     * cannot apply is the worst option: the operator believes `strict` is gating something.
     *
     * Called once, before {@link StartSession}, so adapters can fold the result into launch flags.
     */
    public ApplyPermissionPolicy(_policy: HarnessPermissionPolicy): void {
        // Default: unsupported. See the note above on why this is silent but paired with a false
        // PermissionHooks capability rather than throwing.
    }

    /**
     * Whether this session actually continued {@link HarnessSessionConfig.ResumeSessionId}.
     *
     * Default false: a harness that cannot resume, or one offered no prior session, starts cold and
     * must be sent the full conversation. Adapters that DO resume MUST override this and report
     * truthfully — the caller sends only the newest message when it returns true, so a false
     * positive leaves the harness answering a question it never saw the context for.
     *
     * Deliberately separate from `CapabilitySettings.SessionResume`. That flag says the adapter CAN
     * resume in principle; this says it DID, this time. A stale or pruned session id makes the two
     * disagree, and only the second one is safe to branch the turn input on.
     */
    public get DidResumeSession(): boolean {
        return false;
    }

    /**
     * The model the harness actually used, if it reports one.
     *
     * Adapters that can observe this SHOULD override it. Accounting resolves `AIPromptRun.ModelID`
     * from this first and only falls back to the harness row's declared model, because a harness left
     * to choose its own model will — and billing a run against a model it never used is worse than
     * having no attribution at all, since it looks authoritative.
     */
    public get ReportedModel(): string | undefined {
        return undefined;
    }
}
