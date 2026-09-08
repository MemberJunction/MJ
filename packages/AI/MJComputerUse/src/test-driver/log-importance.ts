/**
 * Console log filtering for Computer Use test runs.
 *
 * A full 155-test suite run emitted a ~4.5MB / 63k-line console log in which the
 * signal (which test, which tier, which checkpoint, why it failed) was buried
 * under per-step chatter — 1.7MB of it was the verbatim raw LLM response logged
 * once per step. This module decides what reaches the CONSOLE.
 *
 * Two rules keep the filter honest:
 *  1. **Nothing is lost.** Filtering applies to the console only; every message
 *     still goes to the test-run log record (the testing UI / report / diagnostics
 *     read that), at its true level.
 *  2. **Only KNOWN chatter is hidden.** Suppression is an explicit deny-list of
 *     high-frequency per-step patterns. An unrecognized message is always shown,
 *     so a novel error can never be silently filtered out.
 *
 * Pure (no engine/console coupling) so the policy is unit-testable.
 */

/** How much of the engine's per-test chatter reaches the console. */
export type ConsoleLogLevel = 'quiet' | 'normal' | 'verbose';

const LEVELS: ConsoleLogLevel[] = ['quiet', 'normal', 'verbose'];
export const DEFAULT_CONSOLE_LOG_LEVEL: ConsoleLogLevel = 'normal';

/**
 * Resolve the console level from `CU_LOG_LEVEL` (quiet | normal | verbose).
 * An unset/invalid value falls back to {@link DEFAULT_CONSOLE_LOG_LEVEL} — a bad
 * env value must never make a run noisier or crash it.
 */
export function resolveConsoleLogLevel(raw: string | undefined): ConsoleLogLevel {
    const v = (raw ?? '').trim().toLowerCase();
    return (LEVELS as string[]).includes(v) ? (v as ConsoleLogLevel) : DEFAULT_CONSOLE_LOG_LEVEL;
}

/**
 * High-frequency per-step chatter. These are the volume drivers — each fires
 * every step of every test, and none of them tells you whether the test is
 * progressing or why it failed. Shown only at `verbose`.
 */
const CHATTER = [
    /^Step \d+\/\d+$/,                          // bare step-progress ticker
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
    /AIPromptRunner raw response/i,             // ~1.7MB of the old log on its own
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
    /^Run starting — Goal:/i,                   // duplicate of the driver's goal echo
];

/**
 * Milestones — the run's story. Always shown (including at `quiet`): tier
 * decisions, checkpoint progress, verdicts, budget/loop/auth terminals, and the
 * per-test lifecycle.
 */
const MILESTONE = [
    /checkpoint/i,                              // reached / all-N-reached / unmet / misconfig
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
    /Not recording trace|Recorded trace/i,
];

/**
 * Whether a message should reach the console at the given level.
 *
 * - `warn`/`error` always pass (at every level).
 * - `verbose` passes everything.
 * - `quiet` passes only milestones.
 * - `normal` passes everything EXCEPT recognized chatter.
 */
export function shouldLogToConsole(
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
    // `debug` keeps its existing contract: console only under verbose.
    if (level === 'debug') {
        return false;
    }
    const text = message ?? '';
    if (consoleLevel === 'quiet') {
        return MILESTONE.some(re => re.test(text));
    }
    // normal: hide only known chatter; anything unrecognized is still shown, so a
    // novel message can't be silently dropped.
    return !CHATTER.some(re => re.test(text));
}

/**
 * Short, stable tag for a test — `T045` from "T045 - Query Left-Panel Navigation".
 * Parallel workers interleave their output, so without this you cannot tell which
 * test a line belongs to. Falls back to a trimmed name, then `?`.
 */
export function testTag(testName: string | undefined): string {
    const name = (testName ?? '').trim();
    const m = name.match(/^(T\d+)\b/);
    if (m) {
        return m[1];
    }
    return name ? name.slice(0, 12).trim() : '?';
}

/** Prefix a console line with its test tag so interleaved worker output is readable. */
export function formatConsoleLine(testName: string | undefined, message: string): string {
    return `[${testTag(testName)}] ${message}`;
}
