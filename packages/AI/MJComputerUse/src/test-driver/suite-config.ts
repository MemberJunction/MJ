/**
 * Suite-level Computer Use configuration channel (RI-E3 / Decision D7).
 *
 * The driver has always read per-test `Configuration`; suite-wide policy — the
 * "regression profile" (element grounding on, temperature 0, trace policy) — had
 * no home short of editing every test file. `TestSuite.Configuration` is already
 * JSON-parsed into the open-ended `DriverExecutionContext.suiteContext` bag (the
 * same channel that carries `applicationContext`), so a suite author can drop a
 * `computerUse` block there and it flows to every test in the suite for free.
 *
 * The merge is three-level, most-specific-wins (D7):
 *   driver-baked MJ defaults  ←  suite `computerUse` block  ←  per-test `Configuration`
 * The baked defaults are already applied downstream as `?? default` fallbacks in
 * `buildRunParams`; this module supplies only the middle layer, always UNDER the
 * per-test config so a test can still override any suite-wide default.
 *
 * Pure + dependency-free so the merge precedence is unit-testable without a driver.
 */
import { ComputerUseTestConfig } from './types';

/**
 * The `TestSuite.Configuration.computerUse` block: any subset of the per-test
 * config, applied suite-wide as a default under each test's own config. The
 * regression profile is just `{ elementGrounding: true, generation: { temperature: 0 },
 * trace: 'retain-on-failure' }` (RI-C5).
 */
export type ComputerUseSuiteConfig = Partial<ComputerUseTestConfig>;

/**
 * Extract + validate the suite-level `computerUse` block from the suiteContext
 * bag. Returns undefined when there is no suite, no block, or the block isn't a
 * plain object (a malformed value is ignored, never thrown — the run proceeds on
 * per-test config + baked defaults).
 */
export function readSuiteComputerUseConfig(
    suiteContext: { [key: string]: unknown } | undefined
): ComputerUseSuiteConfig | undefined {
    const raw = suiteContext?.computerUse;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as ComputerUseSuiteConfig;
    }
    return undefined;
}

/**
 * Merge a suite-level block UNDER a per-test config (per-test always wins). The
 * two nested policy objects — `generation` and `appProfile` — are deep-merged one
 * level so a suite-set leaf (e.g. `generation.temperature`) survives when a test
 * sets a DIFFERENT leaf (e.g. `generation.effortLevel`); deeper nesting inside
 * `appProfile` (`settle`, `auth`) replaces wholesale ("most specific wins" for the
 * whole sub-block).
 */
export function mergeComputerUseConfig(
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
