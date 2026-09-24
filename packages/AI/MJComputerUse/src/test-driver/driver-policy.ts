/**
 * The decisions `ComputerUseTestDriver` makes, as pure functions.
 *
 * Nothing here does I/O or touches the engine. The driver gathers the signals and
 * executes the outcome; this module only decides — which is what makes every
 * policy below unit-testable without standing up a driver, a browser, or a model.
 */
import type { OracleResult } from '@memberjunction/testing-engine';
import type { ComputerUseStatus, ComputerUseFailureReason, BrowserDiagnosticEvent, ReplayHealPolicy } from '@memberjunction/computer-use';
import { ComputerUseTestConfig } from './types';

// ─── Replay-script policy ──────────────────────────────────

/**
 * Whether the run perceives by element grounding. On unless a test opts out: a
 * coordinate click records a target with no selector and no role/name to heal
 * from, so grounding is the precondition for the replay tier existing at all.
 */
export function UsesElementGrounding(config: ComputerUseTestConfig): boolean {
    return config.elementGrounding ?? true;
}

/** @deprecated Use {@link UsesElementGrounding}. */
export function usesElementGrounding(config: ComputerUseTestConfig): boolean {
    return UsesElementGrounding(config);
}

/**
 * How far a diverged replay step may be repaired. `'llm'` unless a test says
 * otherwise, which is the behaviour a script gets while it is still earning
 * trust. `'off'` makes the recorded step a contract — pair it with
 * `AllowLLMFallback: false` for a run with no model in it at all.
 */
export function ResolveReplayHeal(config: ComputerUseTestConfig): ReplayHealPolicy {
    return config.replayHeal ?? 'llm';
}

/** @deprecated Use {@link ResolveReplayHeal}. */
export function resolveReplayHeal(config: ComputerUseTestConfig): ReplayHealPolicy {
    return ResolveReplayHeal(config);
}

/**
 * Whether a green, recordable LLM run may store its replay script. On unless a
 * test opts out — the opt-out is for a test still being authored, or one whose
 * trajectory should not become the baseline later runs replay.
 */
export function RecordsReplayScript(config: ComputerUseTestConfig): boolean {
    return config.recordReplayScript ?? true;
}

/** @deprecated Use {@link RecordsReplayScript}. */
export function recordsReplayScript(config: ComputerUseTestConfig): boolean {
    return RecordsReplayScript(config);
}

// ─── Oracle gating ─────────────────────────────────────────

/**
 * Oracle types that are advisory by default. `step-count` is one because the
 * engine already caps steps at the same limit, so gating on it is a tautology.
 */
const DEFAULT_ADVISORY_TYPES = new Set<string>(['step-count']);

/** An explicit per-oracle `advisory` value wins; otherwise the type's default applies. */
export function IsOracleAdvisory(type: string, explicitAdvisory?: boolean): boolean {
    return explicitAdvisory ?? DEFAULT_ADVISORY_TYPES.has(type);
}

/** @deprecated Use {@link IsOracleAdvisory}. */
export function isOracleAdvisory(type: string, explicitAdvisory?: boolean): boolean {
    return IsOracleAdvisory(type, explicitAdvisory);
}

/**
 * The gating subset of oracle results — the ones that decide Passed/Failed.
 * Advisory results are still reported and scored, just not gating, so an
 * efficiency signal can inform the score without failing a successful run.
 */
export function PartitionGatingOracles(results: OracleResult[]): OracleResult[] {
    return results.filter(r => r.advisory !== true);
}

/** @deprecated Use {@link PartitionGatingOracles}. */
export function partitionGatingOracles(results: OracleResult[]): OracleResult[] {
    return PartitionGatingOracles(results);
}

// ─── Failure-artifact retention ────────────────────────────

/**
 * Forensic-trace retention. Tracing costs ~5–15% per run, hence the `off` default.
 * - `off`               — never trace.
 * - `retain-on-failure` — trace every run; keep the artifact only on failure.
 * - `on`                — trace every run; always keep it.
 */
export type ArtifactRetentionPolicy = 'off' | 'retain-on-failure' | 'on';

/** Both keeping policies must trace during the run — you cannot retain what you never captured. */
export function ShouldCaptureArtifact(policy: ArtifactRetentionPolicy): boolean {
    return policy !== 'off';
}

/** @deprecated Use {@link ShouldCaptureArtifact}. */
export function shouldCaptureArtifact(policy: ArtifactRetentionPolicy): boolean {
    return ShouldCaptureArtifact(policy);
}

/** Whether to keep a captured artifact. An unkept one is deleted rather than emitted. */
export function ShouldRetainArtifact(policy: ArtifactRetentionPolicy, passed: boolean): boolean {
    if (policy === 'on') {
        return true;
    }
    if (policy === 'retain-on-failure') {
        return !passed;
    }
    return false;
}

/** @deprecated Use {@link ShouldRetainArtifact}. */
export function shouldRetainArtifact(policy: ArtifactRetentionPolicy, passed: boolean): boolean {
    return ShouldRetainArtifact(policy, passed);
}

// ─── Signal divergence ─────────────────────────────────────

/**
 * The three independent "did the goal succeed?" signals for a run.
 *
 * They are kept separate rather than merged into one status because their
 * *divergence* is the measurement: the field's replication trouble (browser-use
 * 89%→60% on re-run, 20–50% self-report inflation) shows up as agreement drift
 * long before it shows up as a pass-rate change. A prompt change that inflates
 * judge↔self-report agreement is a regression even when pass rates improve.
 */
export interface DivergenceSignals {
    /** The controller believed it was done (asked for judgement, no further actions). */
    SelfReportDone: boolean;
    /** The judge's final verdict was Done. */
    JudgeDone: boolean;
    /** Every gating oracle passed. */
    OraclesPassed: boolean;
}

/** The signals plus their pairwise agreement — stamped on the run's `actualOutput`. */
export interface DivergenceReport extends DivergenceSignals {
    SelfVsJudgeAgree: boolean;
    JudgeVsOracleAgree: boolean;
    SelfVsOracleAgree: boolean;
    /** All three agree — the healthy case. */
    Unanimous: boolean;
}

export function ComputeDivergence(s: DivergenceSignals): DivergenceReport {
    const selfVsJudgeAgree = s.SelfReportDone === s.JudgeDone;
    const judgeVsOracleAgree = s.JudgeDone === s.OraclesPassed;
    const selfVsOracleAgree = s.SelfReportDone === s.OraclesPassed;
    return {
        ...s,
        SelfVsJudgeAgree: selfVsJudgeAgree,
        JudgeVsOracleAgree: judgeVsOracleAgree,
        SelfVsOracleAgree: selfVsOracleAgree,
        Unanimous: selfVsJudgeAgree && judgeVsOracleAgree,
    };
}

/** @deprecated Use {@link ComputeDivergence}. */
export function computeDivergence(s: DivergenceSignals): DivergenceReport {
    return ComputeDivergence(s);
}

// ─── Console log filtering ─────────────────────────────────

/**
 * How much per-step chatter reaches the console. Two rules keep this honest:
 * filtering is console-only — every message still reaches the test-run log record
 * at its true level — and suppression is an explicit deny-list, so an
 * unrecognized message is always shown and a novel error can never be filtered
 * out silently.
 *
 * A 155-test run emitted a 4.5MB console log in which the signal was buried;
 * 1.7MB of it was the raw model response, logged once per step.
 */
export type ConsoleLogLevel = 'quiet' | 'normal' | 'verbose';

const LEVELS: ConsoleLogLevel[] = ['quiet', 'normal', 'verbose'];
export const DEFAULT_CONSOLE_LOG_LEVEL: ConsoleLogLevel = 'normal';

/** Resolve `CU_LOG_LEVEL`. A bad value must never make a run noisier or crash it. */
export function ResolveConsoleLogLevel(raw: string | undefined): ConsoleLogLevel {
    const v = (raw ?? '').trim().toLowerCase();
    return (LEVELS as string[]).includes(v) ? (v as ConsoleLogLevel) : DEFAULT_CONSOLE_LOG_LEVEL;
}

/** @deprecated Use {@link ResolveConsoleLogLevel}. */
export function resolveConsoleLogLevel(raw: string | undefined): ConsoleLogLevel {
    return ResolveConsoleLogLevel(raw);
}

/** Fires every step of every test and says nothing about progress. Shown only at `verbose`. */
const CHATTER = [
    /^Step \d+\/\d+$/,
    /screenshot captured/i,
    /page settled in/i,
    /settle budget expired/i,
    /element grounding: \d+ interactive elements/i,
    /controller response: \d+ actions/i,
    /^Step \d+ — reasoning:/i,
    /actions \(1000x1000 space\)/i,
    /completed in \d+ms \(settle/i,
    /Executing controller prompt via AIPromptRunner/i,
    /AIPromptRunner response: \d+ chars/i,
    /AIPromptRunner raw response/i,             // 1.7MB of the old log on its own
    /Executing judge prompt via AIPromptRunner/i,
    /skipping judge: visible state unchanged/i,
    /Browser closed/i,
    /judge verdict served from the cross-attempt cache/i,
    // Per-test config echo: constant across the run and already in the report.
    /^MaxSteps: \d+, Headless:/i,
    /^(ControllerModel|JudgeModel|Tools): /i,
    /^Browser launched$/i,
    /^Navigated to start URL/i,
    /^StartUrl: /i,
    /^Run starting — Goal:/i,
];

/** The run's story — tier decisions, checkpoints, verdicts, terminals. Shown even at `quiet`. */
const MILESTONE = [
    /checkpoint/i,
    /judge verdict:/i,
    /^Replay /i,
    /\bTier:/i,
    /diverged|healed/i,
    /goal postconditions/i,
    /time budget|wall-clock|budget exceeded/i,
    /loop trip|loop persisted/i,
    /impossible/i,
    /exhausted all \d+ steps/i,
    /auth detour|identity provider/i,
    /Failure class:/i,
    /Starting Computer Use test|Executing Computer Use:|Computer Use test (completed|failed)/i,
    /browser diagnostics/i,
    /Divergence:/i,
    /timed out|cancelled/i,
    /Not recording|Recorded replay script|Could not save replay script/i,
];

/**
 * `warn`/`error` always pass; `verbose` passes everything; `quiet` passes only
 * milestones; `normal` passes everything except recognized chatter.
 */
export function ShouldLogToConsole(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    consoleLevel: ConsoleLogLevel
): boolean {
    if (level === 'warn' || level === 'error') {
        return true;
    }
    if (consoleLevel === 'verbose') {
        return true;
    }
    if (level === 'debug') {
        return false;
    }
    const text = message ?? '';
    if (consoleLevel === 'quiet') {
        return MILESTONE.some(re => re.test(text));
    }
    return !CHATTER.some(re => re.test(text));
}

/** @deprecated Use {@link ShouldLogToConsole}. */
export function shouldLogToConsole(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    consoleLevel: ConsoleLogLevel
): boolean {
    return ShouldLogToConsole(level, message, consoleLevel);
}

/**
 * Short, stable tag for a test — `T045` from "T045 - Query Left-Panel Navigation".
 * Parallel workers interleave output, so without it you cannot tell which test a
 * line belongs to.
 */
export function TestTag(testName: string | undefined): string {
    const name = (testName ?? '').trim();
    const m = name.match(/^(T\d+)\b/);
    if (m) {
        return m[1];
    }
    return name ? name.slice(0, 12).trim() : '?';
}

/** @deprecated Use {@link TestTag}. */
export function testTag(testName: string | undefined): string {
    return TestTag(testName);
}

export function FormatConsoleLine(testName: string | undefined, message: string): string {
    return `[${TestTag(testName)}] ${message}`;
}

/** @deprecated Use {@link FormatConsoleLine}. */
export function formatConsoleLine(testName: string | undefined, message: string): string {
    return FormatConsoleLine(testName, message);
}

// ─── Failure classification ────────────────────────────────

/** The failure taxonomy. Success is `null`, not a member. */
export type ComputerUseFailureClass =
    | 'infra'
    | 'auth-detour'
    | 'app-error'
    | 'loop-detected'
    | 'cancelled'
    | 'impossible'
    | 'timeout-stuck'
    | 'timeout-progressing'
    | 'stuck-page'
    | 'env-stall'
    | 'judge-disagreement'
    | 'assertion'
    | 'unknown';

/** Signals extracted from a finished run, consumed by {@link classifyFailure}. */
export interface FailureSignals {
    status: ComputerUseStatus;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Engine-named failure reason, when set (e.g. 'LoopDetected'). */
    FailureReason?: ComputerUseFailureReason;
    HasCrash: boolean;
    /** A severe, likely-deterministic browser fault — see {@link isSevereBrowserFault}. */
    HasAppError: boolean;
    /** The settle loop gave up on the final step(s) — the page never settled. */
    SettleBudgetExhausted: boolean;
    /** The last few frames were perceptually stable (stuck) rather than changing. */
    TailHashStable: boolean;
    BeaconConfigured: boolean;
    BeaconEverReady: boolean;
    /** At least one gating oracle failed. */
    OraclesFailed: boolean;
}

/** Requests cancelled by navigation — routine in an SPA the agent drives, not app faults. */
const BENIGN_ABORT_RE = /ERR_ABORTED|NS_BINDING_ABORTED|ERR_CANCELL?ED/i;

/**
 * Whether a diagnostic is severe enough for the zero-retry `app-error` class.
 * Console errors don't qualify — a live SPA emits them constantly during normal
 * navigation — and neither do navigation-aborted requests. `crash` is handled
 * upstream as `infra`.
 */
export function IsSevereBrowserFault(d: BrowserDiagnosticEvent): boolean {
    if (d.type === 'pageerror') {
        return true;
    }
    if (d.type === 'requestfailed') {
        return !BENIGN_ABORT_RE.test(d.message ?? '');
    }
    return false;
}

/** @deprecated Use {@link IsSevereBrowserFault}. */
export function isSevereBrowserFault(d: BrowserDiagnosticEvent): boolean {
    return IsSevereBrowserFault(d);
}

/**
 * Classify a finished run, or return `null` when it succeeded. First match wins,
 * so the order below *is* the precedence.
 *
 * The one ordering that was learned the hard way: the engine's explicit terminal
 * verdicts must outrank `hasAppError`, which is only a passive observation that
 * the app logged something. `hasAppError` used to come third and masked those
 * verdicts as `app-error` — and because `app-error` gets zero retries, that turned
 * flaky agent loops and timeouts into hard failures and cratered the pass rate.
 */
export function ClassifyFailure(s: FailureSignals): ComputerUseFailureClass | null {
    if (s.status === 'Completed') {
        return null;
    }
    // A crashed renderer or engine-level error is the authoritative root cause.
    if (s.HasCrash || s.status === 'Error') {
        return 'infra';
    }
    // Likewise an auth detour past the watchdog's cap: its own 401/403s are the
    // symptom, so this must outrank the `app-error` they would register as.
    if (s.FailureReason === 'AuthDetour') {
        return 'auth-detour';
    }
    // An explicit engine verdict, and a retryable one, so it beats incidental app noise.
    if (s.FailureReason === 'LoopDetected') {
        return 'loop-detected';
    }
    if (s.status === 'Cancelled') {
        return 'cancelled';
    }
    if (s.status === 'Impossible') {
        return 'impossible';
    }
    // Split by whether the page was still changing when the budget expired.
    if (s.status === 'TimeBudgetExceeded') {
        return s.TailHashStable ? 'timeout-stuck' : 'timeout-progressing';
    }
    // No more-specific verdict above, and still the likelier root cause than the
    // soft symptom heuristics below.
    if (s.HasAppError) {
        return 'app-error';
    }
    if (s.SettleBudgetExhausted && s.TailHashStable) {
        return 'stuck-page';
    }
    // A declared beacon that never fired, with no app errors: the app never became
    // ready, which is distinct from the agent getting lost.
    if (s.BeaconConfigured && !s.BeaconEverReady) {
        return 'env-stall';
    }
    // The engine terminated the run Failed — e.g. the controller declared completion
    // and the judge kept disagreeing.
    if (s.status === 'Failed') {
        return 'judge-disagreement';
    }
    if (s.OraclesFailed) {
        return 'assertion';
    }
    return 'unknown';
}

/** @deprecated Use {@link ClassifyFailure}. */
export function classifyFailure(s: FailureSignals): ComputerUseFailureClass | null {
    return ClassifyFailure(s);
}

// ─── Suite-level configuration ─────────────────────────────

/**
 * The `TestSuite.Configuration.computerUse` block: any subset of the per-test
 * config, applied suite-wide. It rides the `suiteContext` bag that already
 * carries `applicationContext`, so suite-wide policy — the regression profile is
 * just `{ elementGrounding: true, generation: { temperature: 0 } }` — has a home
 * that isn't "edit every test file".
 */
export type ComputerUseSuiteConfig = Partial<ComputerUseTestConfig>;

/**
 * Read the suite-level block. Undefined when there is no suite, no block, or the
 * block isn't a plain object — a malformed value is ignored rather than thrown,
 * so the run proceeds on per-test config plus baked defaults.
 */
export function ReadSuiteComputerUseConfig(
    suiteContext: { [key: string]: unknown } | undefined
): ComputerUseSuiteConfig | undefined {
    const raw = suiteContext?.computerUse;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as ComputerUseSuiteConfig;
    }
    return undefined;
}

/** @deprecated Use {@link ReadSuiteComputerUseConfig}. */
export function readSuiteComputerUseConfig(
    suiteContext: { [key: string]: unknown } | undefined
): ComputerUseSuiteConfig | undefined {
    return ReadSuiteComputerUseConfig(suiteContext);
}

/**
 * Merge a suite block UNDER a per-test config, so a test can always override a
 * suite-wide default. `generation` and `appProfile` deep-merge one level, so a
 * suite-set leaf survives when a test sets a different leaf; anything deeper
 * inside `appProfile` replaces wholesale.
 */
export function MergeComputerUseConfig(
    suite: ComputerUseSuiteConfig,
    perTest: ComputerUseTestConfig
): ComputerUseTestConfig {
    const merged: ComputerUseTestConfig = { ...suite, ...perTest };
    if (suite.generation || perTest.generation) {
        merged.generation = { ...suite.generation, ...perTest.generation };
    }
    if (suite.appProfile || perTest.appProfile) {
        merged.appProfile = { ...suite.appProfile, ...perTest.appProfile };
    }
    return merged;
}

/** @deprecated Use {@link MergeComputerUseConfig}. */
export function mergeComputerUseConfig(
    suite: ComputerUseSuiteConfig,
    perTest: ComputerUseTestConfig
): ComputerUseTestConfig {
    return MergeComputerUseConfig(suite, perTest);
}
