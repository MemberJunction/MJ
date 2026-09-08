/**
 * Script store — the driver's read/write path for replay scripts.
 *
 * A script lives in the test row it belongs to, as `TestJSONScript` inside the
 * `Configuration` column of `MJ: Tests`. That column is a JSONType, so the
 * generated `MJTestEntity.ConfigurationObject` accessor parses and caches it and
 * the shape is checked by the compiler rather than at runtime.
 *
 * Three consequences worth knowing:
 *
 *  - **Reads are free.** The TestingEngine already caches `MJ: Tests` locally, so
 *    by the time a driver runs, the script is in memory. There is no second store
 *    to mount, no file to find, and no way for a script to drift away from the
 *    test it describes.
 *  - **Writes are a `Save()`.** A passing agent-driven run overwrites the script
 *    in place. Nothing is promoted, reviewed, or committed; drift shows up as
 *    healed/diverged counts in the run report instead of as a diff.
 *  - **`mj sync push` resets scripts.** The test metadata files own the
 *    `Configuration` column, and push writes it wholesale. That is deliberate: a
 *    script is a regenerable cache, so a push simply costs the next run one
 *    agent-driven pass per test to re-record.
 *
 * @see plans/regression-testing/dom-selection-and-replay-design.md
 */
import { MJTestEntity, MJTestEntity_ITestConfiguration, MJTestEntity_ITestJSONScript } from '@memberjunction/core-entities';
import { ComputerUseTrace } from '@memberjunction/computer-use';

/**
 * `MJTestEntity_ITestJSONScript` (the entity's JSONType, defined in
 * `metadata/entities/JSONType-interfaces/ITestConfiguration.ts`) and
 * `ComputerUseTrace` (the engine's own type) describe the same object in two
 * packages that cannot import each other: the JSONType definition is emitted
 * verbatim into `@memberjunction/core-entities`, which sits below
 * `@memberjunction/computer-use` and can name nothing from it.
 *
 * This package depends on both, so it is the one place the two can be compared.
 * These assertions do that in both directions, making the shapes structurally
 * identical. Add or rename a field on either side and this file fails to compile
 * — which is the point. `tsc` keeps the two in step so nobody has to remember to.
 */
const _scriptSatisfiesTrace: ComputerUseTrace = {} as MJTestEntity_ITestJSONScript;
const _traceSatisfiesScript: MJTestEntity_ITestJSONScript = {} as ComputerUseTrace;
void _scriptSatisfiesTrace;
void _traceSatisfiesScript;

/**
 * Read this test's replay script. Null when the test has never recorded one, or
 * when what is stored is not a script — either sends the run to the agent tier,
 * the correct default for a test with nothing to replay.
 *
 * No cast is needed: the assertions above make the two types interchangeable.
 */
export function loadScript(test: MJTestEntity): ComputerUseTrace | null {
    const script = readConfiguration(test)?.TestJSONScript;
    if (!script || typeof script.TestId !== 'string' || !Array.isArray(script.Steps)) {
        return null;
    }
    return script;
}

/**
 * Whether this test permits the agent fallback: re-deriving the goal with the
 * model when replay fails, and overwriting its script with the result.
 *
 * Defaults to **true**, so a test that says nothing behaves as it always has. A
 * test pinned to `false` fails on divergence instead, which is what you want when
 * a re-derivation could mask the regression the test exists to catch.
 */
export function allowsLLMFallback(test: MJTestEntity): boolean {
    return readConfiguration(test)?.AllowLLMFallback !== false;
}

/**
 * Write a freshly recorded script onto the test row, preserving every other key
 * in `Configuration`. The entity already carries the run's context user, so this
 * saves as whoever loaded the test.
 *
 * Reports the failure rather than throwing it: a script that fails to save costs
 * the next run a re-record, which is not worth failing a green test over. The
 * caller logs `error` and carries on.
 */
export async function saveScript(test: MJTestEntity, script: ComputerUseTrace): Promise<ScriptSaveResult> {
    try {
        const current: MJTestEntity_ITestConfiguration = readConfiguration(test) ?? {};
        test.ConfigurationObject = { ...current, TestJSONScript: script };
        if (await test.Save()) {
            return { saved: true };
        }
        return { saved: false, error: test.LatestResult?.CompleteMessage ?? 'Save() returned false with no result detail' };
    } catch (e) {
        return { saved: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/** Outcome of a {@link saveScript} call. */
export interface ScriptSaveResult {
    saved: boolean;
    /** Why the save failed, when it did — from `LatestResult.CompleteMessage`. */
    error?: string;
}

/**
 * The test's parsed configuration, or null. The generated accessor throws on
 * malformed JSON, and a hand-edited `Configuration` is exactly where malformed
 * JSON comes from — so treat that as "no configuration" and let the run proceed
 * on the agent tier rather than failing the test on a parse error.
 */
function readConfiguration(test: MJTestEntity): MJTestEntity_ITestConfiguration | null {
    try {
        return test.ConfigurationObject ?? null;
    } catch {
        return null;
    }
}
