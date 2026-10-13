/**
 * @fileoverview The video conformance kit's runners. {@link RunRealtimeVideoConformance} runs every check against a
 * provider and reports each outcome; {@link ListRealtimeVideoConformanceChecks} hands a test runner the same checks
 * bound to the provider, one test each. Neither needs a test framework.
 *
 * ```ts
 * for (const check of ListRealtimeVideoConformanceChecks(() => new MyProviderHarness())) {
 *     it.skipIf(check.SkipReason !== null)(`${check.Id} ${check.Title}`, () => check.Run());
 * }
 * ```
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import { RealtimeVideoConformanceError } from './conformanceAssertions';
import { REALTIME_VIDEO_SESSION_CHECKS } from './realtimeVideoConformanceChecks';
import { REALTIME_VIDEO_FRAME_CHECKS } from './realtimeVideoConformanceFrameChecks';
import { REALTIME_VIDEO_TURN_CHECKS } from './realtimeVideoConformanceTurnChecks';
import type {
    IRealtimeVideoConformanceHarness,
    RealtimeVideoConformanceCheck,
    RealtimeVideoConformanceCheckRun,
    RealtimeVideoConformanceDriverFactory,
    RealtimeVideoConformanceResult,
} from './realtimeVideoConformanceTypes';

/** Every check of the kit, VC01-VC15 then VF01-VF02, in the order they run. */
export const REALTIME_VIDEO_CONFORMANCE_CHECKS: readonly RealtimeVideoConformanceCheck[] = [
    ...REALTIME_VIDEO_SESSION_CHECKS,
    ...REALTIME_VIDEO_TURN_CHECKS,
    ...REALTIME_VIDEO_FRAME_CHECKS,
];

/**
 * Runs every check against a provider, one at a time, each on a new harness from `driverFactory`, and resolves to one
 * result per check, in order. Never rejects: a check that can't run is Skipped with the reason, and any error makes its
 * check Failed with the rule it broke. Each harness is disposed after its check.
 *
 * @param driverFactory Makes the provider's harness; called once per check.
 */
export async function RunRealtimeVideoConformance(driverFactory: RealtimeVideoConformanceDriverFactory): Promise<RealtimeVideoConformanceResult[]> {
    const results: RealtimeVideoConformanceResult[] = [];
    for (const check of REALTIME_VIDEO_CONFORMANCE_CHECKS) {
        results.push(await runForResult(check, driverFactory));
    }
    return results;
}

/**
 * The checks bound to a provider, for a test runner to register one test each. A check whose `SkipReason` is set has a
 * `Run` that does nothing; register it as a conditional skip (vitest: `it.skipIf(check.SkipReason !== null)`), since the
 * harness's traits and methods decide it, not as a disabled test. `Run` makes a new harness, runs the check, disposes
 * the harness, and rejects with a {@link RealtimeVideoConformanceError} when the provider breaks a rule.
 *
 * `driverFactory` is called once here, to read the harness's traits and methods, and that harness is disposed.
 *
 * @param driverFactory Makes the provider's harness.
 */
export function ListRealtimeVideoConformanceChecks(driverFactory: RealtimeVideoConformanceDriverFactory): RealtimeVideoConformanceCheckRun[] {
    const probe = driverFactory();
    try {
        return REALTIME_VIDEO_CONFORMANCE_CHECKS.map((check) => {
            const skipReason = skipReasonFor(check, probe);
            return {
                Id: check.Id,
                Title: check.Title,
                SkipReason: skipReason,
                Run: () => (skipReason === null ? runCheck(check, driverFactory) : Promise.resolve()),
            };
        });
    } finally {
        void disposeHarness(probe);
    }
}

/**
 * Why a check doesn't run against a harness: the environment's skip for it, else its gate's reason; `null` when it runs.
 * A harness whose traits can't be read skips with the error.
 */
function skipReasonFor(check: RealtimeVideoConformanceCheck, harness: IRealtimeVideoConformanceHarness): string | null {
    try {
        const environment = harness.Traits.EnvironmentSkips?.[check.Id];
        return environment !== undefined ? `environment: ${environment}` : check.Gate(harness);
    } catch (error) {
        return `the gate failed: ${describeError(error)}`;
    }
}

/** Runs one check on a new harness and disposes the harness, whatever happens. */
async function runCheck(check: RealtimeVideoConformanceCheck, driverFactory: RealtimeVideoConformanceDriverFactory): Promise<void> {
    const harness = driverFactory();
    try {
        await runOn(check, harness);
    } finally {
        await disposeHarness(harness);
    }
}

/** Runs one check on a harness. Rejects with a {@link RealtimeVideoConformanceError} whose message starts with the check's id. */
async function runOn(check: RealtimeVideoConformanceCheck, harness: IRealtimeVideoConformanceHarness): Promise<void> {
    try {
        await check.Run(harness);
    } catch (error) {
        throw new RealtimeVideoConformanceError(`${check.Id} (${harness.Name}): ${describeError(error)}`);
    }
}

/** One check's outcome for {@link RunRealtimeVideoConformance}: gated and run on one new harness, then disposed. */
async function runForResult(check: RealtimeVideoConformanceCheck, driverFactory: RealtimeVideoConformanceDriverFactory): Promise<RealtimeVideoConformanceResult> {
    const base = { Id: check.Id, Title: check.Title };
    let harness: IRealtimeVideoConformanceHarness;
    try {
        harness = driverFactory();
    } catch (error) {
        return { ...base, Status: 'Failed', Detail: `the driver factory failed: ${describeError(error)}`, DurationMs: 0 };
    }
    const startedAt = Date.now();
    try {
        const skipReason = skipReasonFor(check, harness);
        if (skipReason !== null) {
            return { ...base, Status: 'Skipped', Detail: skipReason, DurationMs: 0 };
        }
        await runOn(check, harness);
        return { ...base, Status: 'Passed', Detail: null, DurationMs: Date.now() - startedAt };
    } catch (error) {
        return { ...base, Status: 'Failed', Detail: describeError(error), DurationMs: Date.now() - startedAt };
    } finally {
        await disposeHarness(harness);
    }
}

/** Disposes a harness; an error in its Dispose is logged, never thrown over the check's outcome. */
async function disposeHarness(harness: IRealtimeVideoConformanceHarness): Promise<void> {
    try {
        await harness.Dispose?.();
    } catch (error) {
        console.warn(`[RealtimeVideoConformance] ${harness.Name}'s Dispose failed: ${describeError(error)}`);
    }
}

/** A thrown value as text: a conformance failure's message as it is, anything else with its name. */
function describeError(error: unknown): string {
    if (error instanceof RealtimeVideoConformanceError) {
        return error.message;
    }
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
