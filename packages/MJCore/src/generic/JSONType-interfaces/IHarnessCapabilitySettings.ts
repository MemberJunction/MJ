/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IHarnessCapabilitySettings.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Strongly-typed shape of `AIAgentHarness.CapabilitySettings` (the
 * `MJ: AI Agent Harnesses` entity), bound to the column via JSONType metadata so
 * CodeGen emits a typed accessor.
 *
 * An *agent harness* is an external agent runtime with its own reasoning loop and tool sandbox —
 * Claude Code (Agent SDK or headless CLI), Codex CLI, OpenCode, Pi, Cline, Gemini CLI. MJ runs one
 * as the reasoning substrate for an MJ agent while keeping identity, permissions, governed data
 * access, payload contracts, HITL and cost control on the MJ side. These flags declare what each
 * harness's adapter can actually do, so the runtime knows what it must **emulate** rather than
 * assume.
 *
 * That emulation is the reason these are metadata and not a code constant. Harnesses differ in
 * ways that change token cost and audit granularity, not merely convenience: a harness without
 * {@link IHarnessCapabilitySettings.SessionResume} needs prior context replayed into a fresh
 * invocation on every turn, which the runtime has to budget for against `MaxTokensPerRun`.
 *
 * All properties are optional — an omitted flag means the capability is **not** supported, which
 * is the safe default: the runtime falls back to emulation or refuses the feature rather than
 * calling into an adapter that cannot honour it.
 *
 * Holding these as JSON (rather than dedicated BIT columns) keeps the registry table simple and
 * lets a new harness capability be added without a schema migration — just extend this interface
 * and re-push. Mirrors the `IBridgeProviderFeatures` / `IRemoteBrowserProviderFeatures` model.
 *
 * See `/plans/external-agent-harness.md`.
 */
export interface IHarnessCapabilitySettings {
    // ── Session lifecycle ───────────────────────────────────────────────────────
    /**
     * The harness can resume a prior session by ID, so turn N+1 continues the same reasoning
     * context rather than starting cold. When false the adapter must emulate continuity by
     * replaying accumulated context into a fresh invocation each turn — correct, but the token
     * cost grows with turn count and must be budgeted against the run's guardrails.
     */
    SessionResume?: boolean;
    /**
     * The harness can be cancelled mid-turn and will stop promptly, so a cancellation token
     * reaching the adapter actually interrupts in-sandbox work instead of only being honoured at
     * the next turn boundary.
     */
    MidTurnCancellation?: boolean;

    // ── Turn protocol ───────────────────────────────────────────────────────────
    /**
     * The harness has a native structured-output mode (e.g. Claude Code's `--output-format`) that
     * can be constrained to emit the Loop next-step JSON envelope at turn end. Without it the
     * runtime leans on `BaseAgent`'s malformed-response retry machinery to coax the envelope out,
     * which costs extra turns on a harness prone to conversational drift.
     */
    StructuredOutput?: boolean;
    /**
     * The harness reports token usage and (where available) cost per turn. Required for the
     * per-turn `AIPromptRun` accounting that feeds `MaxCostPerRun` / `MaxTokensPerRun`; without
     * it a run's spend is invisible to MJ's guardrails and only wall-clock and iteration limits
     * can interrupt it.
     */
    UsageReporting?: boolean;

    // ── Sandbox governance ──────────────────────────────────────────────────────
    /**
     * The adapter translates MJ's `HarnessPermissionPolicy` into flags the harness actually honours,
     * so a configured posture and allow/deny list take effect. When false the policy is **inert** —
     * the harness runs on its own defaults regardless of what the agent's metadata says.
     *
     * This is deliberately separate from {@link PermissionHooks}: a harness can enforce a *static*
     * policy at launch (Claude Code's `--allowedTools`, Pi's `--tools`) while having no *interactive*
     * hook to pause on. Conflating the two is what let four adapters silently ignore a `strict`
     * posture while the runtime warned about the wrong thing.
     *
     * The runtime warns when a policy is configured and this is false, because an unenforced policy
     * is worse than no policy: the operator believes something is gated.
     */
    PermissionPolicy?: boolean;
    /**
     * The harness exposes permission hooks the adapter can intercept, so a mutating in-sandbox
     * operation can be paused and surfaced as an `MJ: AI Agent Requests` HITL prompt. This is about
     * *interactive* approval mid-turn; see {@link PermissionPolicy} for static policy enforcement.
     */
    PermissionHooks?: boolean;
    /**
     * The harness can be pointed at an MCP server, enabling the read-only intra-turn loopback into
     * MJ data (entity reads, RunView, queries) under a per-run scoped credential. When false the
     * agent can still act — all authority-transferring operations go through the turn protocol
     * regardless — but it cannot read MJ data mid-turn.
     */
    McpClient?: boolean;
    /**
     * The harness accepts a working directory it will confine file operations to, letting the
     * sandbox provider scope a workspace per run/agent/user. When false the provider must isolate
     * at the process or container boundary instead.
     */
    WorkspaceScoping?: boolean;

    // ── Model selection ─────────────────────────────────────────────────────────
    /**
     * The harness accepts a model override at launch, so `AIAgentHarness.DefaultModel` and any
     * per-agent override are actually honoured. When false the harness runs on whatever model its
     * own configuration selects and MJ's model preference is advisory only.
     */
    ModelSelection?: boolean;
}
