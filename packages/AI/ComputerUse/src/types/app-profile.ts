/**
 * The seam for app-specific signals. `@memberjunction/computer-use` stays
 * application-agnostic — it knows only how to poll what the profile names, never
 * any specific app's selectors, routes, or marker text. Layer 2 (the driver /
 * suite metadata) supplies the concrete values.
 *
 * All fields are optional; a run with no profile uses the engine's app-neutral
 * defaults.
 */

/** Settle-loop tuning. All values have engine defaults. */
export class SettleConfig {
    /** Hard cap on the whole settle loop before we give up and perceive anyway. */
    public MaxWaitMs: number = 30_000;
    /** Interval between settle polls (marker / beacon / hash checks). */
    public PollMs: number = 750;
    /** Cap on the `networkidle` fast path (it can hang on long-poll/websocket apps). */
    public NetworkIdleCapMs: number = 4_000;
    /**
     * Always wait at least this long before the first perception, even if the page
     * looks settled. 0 disables the floor.
     */
    public MinWaitMs: number = 0;
}

/** App-specific readiness/busy signals the settle loop consults. */
export class AppProfile {
    /**
     * Additional CSS selectors indicating the app is still busy. Merged with
     * {@link DEFAULT_BUSY_MARKERS} — never replaces them.
     */
    public BusyMarkers: string[] = [];

    /**
     * A CSS selector polled before any heuristic; when it matches, the page is
     * declared ready. Apps that can declare readiness — e.g. by setting a `data-*`
     * attribute on `<html>` when the active route finishes loading — get
     * deterministic, zero-cost readiness. Omit to use the heuristics.
     */
    public ReadinessBeacon?: string;

    /** Settle tuning; engine defaults apply when omitted. */
    public Settle?: SettleConfig;

    /** Loop-detection tuning; engine defaults apply when omitted. */
    public Loop?: LoopConfig;

    /** Auth-detour watchdog config; omitted → the watchdog is off. */
    public Auth?: AuthDetourConfig;
}

/**
 * Auth-detour watchdog tuning. When a session is invalidated mid-flight the page
 * bounces to an identity provider; the agent would otherwise burn ~10 steps
 * re-consenting and the heuristics would mislabel it a navigation loop. The
 * watchdog recovers generically (re-apply auth + re-navigate) without charging the
 * agent a step, and after {@link MaxDetours} terminates as an infrastructure
 * `AuthDetour` rather than grading the agent on it.
 */
export class AuthDetourConfig {
    /**
     * Case-insensitive substrings identifying an identity-provider bounce, matched
     * against the full current URL (e.g. `'auth0.com'`,
     * `'login.microsoftonline.com'`, `'/u/consent'`). Empty → watchdog disabled.
     */
    public IdentityProviderPatterns: string[] = [];

    /**
     * Terminate as `Failed`/`AuthDetour` once this many detours occur in one run
     * (default 2). Exceeding the cap means recovery isn't holding — an environment
     * fault, not an agent failure.
     */
    public MaxDetours: number = 2;
}

/** Loop-detection tuning. All values have engine defaults. */
export class LoopConfig {
    /**
     * Query-param names that are volatile (per-visit tokens, timestamps) and must
     * be stripped before the URL forms part of a state signature — otherwise every
     * visit looks new and loops hide. The hash fragment is always stripped.
     */
    public VolatileParams: string[] = [];
    /** Terminate the run once a loop has tripped this many times (default 3). */
    public TerminateAfterTrips: number = 3;
    /** A state signature seen this many times counts as a loop trip (default 3). */
    public StateRepeatThreshold: number = 3;
}

/**
 * Why the settle loop stopped waiting — recorded per step so the controller, judge
 * and failure classifier can tell "waited then rendered" from "waited then gave
 * up".
 *
 * - `beacon-ready`   — the declared readiness beacon appeared.
 * - `marker-cleared` — all busy markers cleared and the frame was hash-stable.
 * - `stable`         — no markers configured; the frame went hash-stable.
 * - `networkidle`    — settled on the networkidle fast path.
 * - `budget`         — the settle budget expired while still busy (candidate stall).
 * - `none`           — settle was effectively skipped (no page / disabled).
 */
export type SettleReason =
    | 'beacon-ready'
    | 'marker-cleared'
    | 'stable'
    | 'networkidle'
    | 'budget'
    | 'none';

/** The engine's app-neutral busy markers, always checked regardless of profile. */
export const DEFAULT_BUSY_MARKERS: readonly string[] = ['[aria-busy="true"]', '[role="progressbar"]'];
