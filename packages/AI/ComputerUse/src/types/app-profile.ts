/**
 * Application profile — the layering-contract seam for app-specific signals
 * (CU-A1/A2). `@memberjunction/computer-use` stays application-agnostic: it
 * knows only how to *poll what the profile names*, never any specific app's
 * selectors, routes, or marker text. Layer 2 (the driver / suite metadata)
 * supplies the concrete values for the app under test — mirroring how
 * Playwright's storageState / waitForFunction carry app specifics as data.
 *
 * All fields are optional; a run with no profile uses the engine's app-neutral
 * defaults and still works (zero-config).
 */

/** Settle-loop tuning (CU-A1). All values have engine defaults. */
export class SettleConfig {
    /** Hard cap on the whole settle loop before we give up and perceive anyway. */
    public MaxWaitMs: number = 30_000;
    /** Interval between settle polls (marker / beacon / hash checks). */
    public PollMs: number = 750;
    /** Cap on the `networkidle` fast path (it can hang on long-poll/websocket apps). */
    public NetworkIdleCapMs: number = 4_000;
    /**
     * Adaptive floor — always wait at least this long before the first
     * perception, even if the page looks settled. 0 disables the floor.
     */
    public MinWaitMs: number = 0;
}

/**
 * App-specific readiness/busy signals the settle loop consults. The engine
 * merges {@link BusyMarkers} with its own app-neutral defaults
 * (`[aria-busy="true"]`, `[role="progressbar"]`); the profile only *adds* to
 * them. {@link ReadinessBeacon}, when present, is polled first and wins over
 * all heuristics.
 */
export class AppProfile {
    /**
     * Additional CSS selectors that indicate the app is still busy/loading
     * (e.g. an app's own spinner class). Merged with the engine's app-neutral
     * defaults — never replaces them.
     */
    public BusyMarkers: string[] = [];

    /**
     * Optional readiness beacon: a CSS selector the settle loop polls FIRST,
     * before any heuristic (CU-A2). When it matches, the page is declared
     * ready. Apps that can *declare* readiness — e.g. by setting a `data-*`
     * attribute on `<html>` when their active route finishes loading and
     * clearing it on navigation, then naming that attribute's selector here —
     * get deterministic, zero-cost readiness. Apps without a beacon fall back
     * to the heuristics.
     */
    public ReadinessBeacon?: string;

    /** Settle tuning; engine defaults apply when omitted. */
    public Settle?: SettleConfig;
}

/**
 * Why the settle loop stopped waiting — recorded per step so controller/judge
 * (and the CU-F5 classifier) can tell "waited then rendered" from "waited then
 * gave up" (a candidate stall).
 *
 * - `beacon-ready`   — the declared readiness beacon appeared.
 * - `marker-cleared` — all busy markers cleared and the frame was hash-stable.
 * - `stable`         — no markers configured; the frame went hash-stable.
 * - `networkidle`    — settled on the networkidle fast path (no further polling needed).
 * - `budget`         — the settle budget expired while still busy/unstable (candidate stall).
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
