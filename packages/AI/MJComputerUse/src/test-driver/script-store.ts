/**
 * Reading and writing a test's replay script, which lives in the test row itself
 * at `Configuration.ReplayScript`.
 *
 * Reads are free — the TestingEngine already caches `MJ: Tests`, and the column is
 * a JSONType, so the generated accessor parses it lazily into a typed object.
 *
 * Writes land in one of two slots. A test's first script goes straight to
 * `ReplayScript`: there is no baseline to diff it against, and the run that
 * produced it already passed the judge and every gating oracle. A script that
 * would *replace* one goes to `PendingReplayScript` and waits for a human to see
 * the diff and promote it (`mj test scripts`), so a UI change never takes effect
 * unnoticed. Replay only ever executes the promoted slot.
 *
 * `mj sync push` resets both slots, which is deliberate — a script is a
 * regenerable cache, and `mj sync pull` is there when you want them in files.
 *
 * @see plans/regression-testing/dom-selection-and-replay-design.md
 */
import { MJTestEntity, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import { ComputerUseTrace } from '@memberjunction/computer-use';

/** Outcome of a {@link saveScript} call. */
export interface ScriptSaveResult {
    saved: boolean;
    /**
     * Which slot the script landed in. `pending` means it is waiting for review
     * and replay is still using the previously promoted script.
     */
    slot?: 'promoted' | 'pending';
    /** Why the save failed, when it did — from `LatestResult.CompleteMessage`. */
    error?: string;
}

/**
 * This test's replay script, or null when it has never recorded one or what is
 * stored is not a script. Either way the run falls to the agent tier.
 *
 * The return needs no cast: `MJTestEntity_IReplayScript` and `ComputerUseTrace`
 * are held to one shape by `__tests__/script-store.test-d.ts`.
 */
export function loadScript(test: MJTestEntity): ComputerUseTrace | null {
    const script = readConfiguration(test)?.ReplayScript;
    if (!script || typeof script.TestId !== 'string' || !Array.isArray(script.Steps)) {
        return null;
    }
    return script;
}

/**
 * Whether this test lets a failed replay re-derive the goal with the model and
 * overwrite its script. Defaults to true, so a test that says nothing behaves as
 * it always has; `false` makes the divergence the result instead.
 */
export function allowsLLMFallback(test: MJTestEntity): boolean {
    return readConfiguration(test)?.AllowLLMFallback !== false;
}

/**
 * Write a freshly recorded script onto the test row, preserving every other key in
 * `Configuration`. Goes to `PendingReplayScript` when the test already has a
 * promoted script, so replacing one is always a reviewed act; straight to
 * `ReplayScript` when there is nothing to replace.
 *
 * Reports the failure rather than throwing it — a script that fails to save costs
 * the next run a re-record, which is not worth failing a green test over.
 */
export async function saveScript(test: MJTestEntity, script: ComputerUseTrace): Promise<ScriptSaveResult> {
    try {
        const current: MJTestEntity_ITestConfiguration = readConfiguration(test) ?? {};
        const slot: 'promoted' | 'pending' = current.ReplayScript ? 'pending' : 'promoted';
        test.ConfigurationObject = slot === 'pending'
            ? { ...current, PendingReplayScript: script }
            : { ...current, ReplayScript: script };
        if (await test.Save()) {
            return { saved: true, slot };
        }
        return { saved: false, error: test.LatestResult?.CompleteMessage ?? 'Save() returned false with no result detail' };
    } catch (e) {
        return { saved: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * The test's parsed configuration, or null. A hand-edited `Configuration` is where
 * malformed JSON comes from and the generated accessor throws on it, so treat that
 * as "no configuration" rather than failing the test on a parse error.
 */
function readConfiguration(test: MJTestEntity): MJTestEntity_ITestConfiguration | null {
    try {
        return test.ConfigurationObject ?? null;
    } catch {
        return null;
    }
}
