import { describe, it, expect, vi } from 'vitest';
import { MJTestEntity, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import { ComputerUseTrace, TraceStep } from '@memberjunction/computer-use';
import { allowsLLMFallback, loadScript, saveScript } from '../test-driver/script-store.js';

/**
 * A stand-in for the generated `MJTestEntity`, reproducing the behaviours the store
 * depends on: `Save()` returning a boolean rather than throwing,
 * `LatestResult.CompleteMessage` carrying the reason when it returns false, and —
 * critically — the `ConfigurationObject` accessor's **caching**.
 *
 * The generated accessor parses once and returns the SAME object reference until the
 * raw `Configuration` string changes (`_ConfigurationObject_lastRaw`). An earlier
 * version of this fake re-parsed on every get, handing out a fresh copy each time,
 * which made it impossible to observe a caller mutating the cached script in place.
 * That is exactly the defect this file now guards, so the fake has to cache too.
 */
function fakeTest(configuration: string | null, save?: { ok: boolean; message?: string }): MJTestEntity {
    const entity = {
        ID: 'test-1',
        Configuration: configuration,
        LatestResult: save?.message ? { CompleteMessage: save.message } : undefined,
        _cached: undefined as MJTestEntity_ITestConfiguration | null | undefined,
        _lastRaw: undefined as string | null | undefined,
        get ConfigurationObject(): MJTestEntity_ITestConfiguration | null {
            if (this.Configuration !== this._lastRaw) {
                this._cached = this.Configuration ? JSON.parse(this.Configuration) : null;
                this._lastRaw = this.Configuration;
            }
            return this._cached!;
        },
        set ConfigurationObject(value: MJTestEntity_ITestConfiguration | null) {
            const raw = value ? JSON.stringify(value) : null;
            this.Configuration = raw;
            this._cached = value;
            this._lastRaw = raw;
        },
        Save: vi.fn(async () => save?.ok ?? true),
    };
    return entity as unknown as MJTestEntity;
}

function sampleScript(testId = 'test-1'): ComputerUseTrace {
    const script = new ComputerUseTrace();
    script.TestId = testId;
    script.GoalHash = 'deadbeef';
    script.AppBuildHash = 'sha:gen:snap';
    const step = new TraceStep();
    step.Instruction = 'click Save';
    script.Steps = [step];
    return script;
}

describe('loadScript', () => {
    it('returns the script stored on the test row', () => {
        const test = fakeTest(JSON.stringify({ ReplayScript: sampleScript(), headless: true }));
        const script = loadScript(test);
        expect(script?.TestId).toBe('test-1');
        expect(script?.Steps).toHaveLength(1);
    });

    it('returns null when the test has no configuration at all', () => {
        expect(loadScript(fakeTest(null))).toBeNull();
    });

    it('returns null when the configuration carries no script', () => {
        expect(loadScript(fakeTest(JSON.stringify({ headless: true })))).toBeNull();
    });

    it('returns null rather than throwing on malformed configuration JSON', () => {
        expect(loadScript(fakeTest('{ not json'))).toBeNull();
    });

    it('rejects a stored value that is not shaped like a script', () => {
        expect(loadScript(fakeTest(JSON.stringify({ ReplayScript: { TestId: 'x' } })))).toBeNull();
        expect(loadScript(fakeTest(JSON.stringify({ ReplayScript: 'a string' })))).toBeNull();
    });
});

describe('allowsLLMFallback', () => {
    it('defaults to true when the test says nothing', () => {
        expect(allowsLLMFallback(fakeTest(null))).toBe(true);
        expect(allowsLLMFallback(fakeTest(JSON.stringify({ headless: true })))).toBe(true);
    });

    it('is true when explicitly enabled', () => {
        expect(allowsLLMFallback(fakeTest(JSON.stringify({ AllowLLMFallback: true })))).toBe(true);
    });

    it('is false only when explicitly disabled', () => {
        expect(allowsLLMFallback(fakeTest(JSON.stringify({ AllowLLMFallback: false })))).toBe(false);
    });

    it('defaults to true when the configuration is malformed', () => {
        expect(allowsLLMFallback(fakeTest('{ not json'))).toBe(true);
    });
});

describe('saveScript', () => {
    it('writes the script and preserves every other configuration key', async () => {
        const test = fakeTest(JSON.stringify({ headless: true, maxSteps: 35, AllowLLMFallback: false }));
        const result = await saveScript(test, sampleScript());

        expect(result.saved).toBe(true);
        const written = JSON.parse(test.Configuration!);
        expect(written.headless).toBe(true);
        expect(written.maxSteps).toBe(35);
        expect(written.AllowLLMFallback).toBe(false);
        expect(written.ReplayScript.TestId).toBe('test-1');
    });

    it('reports the promoted slot for a test recording its first script', async () => {
        const test = fakeTest(JSON.stringify({ headless: true }));
        expect((await saveScript(test, sampleScript())).slot).toBe('promoted');
    });

    it('holds a replacement as pending, leaving the promoted script untouched', async () => {
        const test = fakeTest(JSON.stringify({ ReplayScript: sampleScript('promoted') }));
        const result = await saveScript(test, sampleScript('fresh'));

        expect(result.slot).toBe('pending');
        const written = JSON.parse(test.Configuration!);
        expect(written.ReplayScript.TestId).toBe('promoted');
        expect(written.PendingReplayScript.TestId).toBe('fresh');
    });

    it('replaces an earlier pending script rather than stacking them', async () => {
        const test = fakeTest(JSON.stringify({
            ReplayScript: sampleScript('promoted'),
            PendingReplayScript: sampleScript('older-pending'),
        }));
        await saveScript(test, sampleScript('newest'));

        const written = JSON.parse(test.Configuration!);
        expect(written.ReplayScript.TestId).toBe('promoted');
        expect(written.PendingReplayScript.TestId).toBe('newest');
    });

    it('writes a script onto a test that had no configuration', async () => {
        const test = fakeTest(null);
        expect((await saveScript(test, sampleScript())).saved).toBe(true);
        expect(JSON.parse(test.Configuration!).ReplayScript.TestId).toBe('test-1');
    });

    it('never lets a pending script reach the replay path', () => {
        const test = fakeTest(JSON.stringify({
            ReplayScript: sampleScript('promoted'),
            PendingReplayScript: sampleScript('pending'),
        }));
        expect(loadScript(test)?.TestId).toBe('promoted');
    });

    it('reports the save failure instead of throwing', async () => {
        const test = fakeTest(null, { ok: false, message: 'FK violation on TypeID' });
        const result = await saveScript(test, sampleScript());
        expect(result.saved).toBe(false);
        expect(result.error).toBe('FK violation on TypeID');
    });

    it('reports a thrown save as a failure', async () => {
        const test = fakeTest(null);
        (test.Save as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection reset'));
        const result = await saveScript(test, sampleScript());
        expect(result.saved).toBe(false);
        expect(result.error).toBe('connection reset');
    });
});

describe('loadScript isolation (regression: a heal must not rewrite the promoted script)', () => {
    /** Configuration holding one promoted script with a single click step. */
    function promoted(selector: string): string {
        return JSON.stringify({
            maxSteps: 30,
            ReplayScript: {
                TestId: 'test-1',
                GoalHash: 'deadbeef',
                Steps: [{ Instruction: 'click Save', Action: { Method: 'click', Target: { Role: 'button', Name: 'Save', Selector: selector } } }],
            },
        });
    }

    it('hands back a copy, so mutating the loaded script leaves the row untouched', () => {
        const test = fakeTest(promoted('#old'));
        const script = loadScript(test)!;

        // What the engine does when it heals: rewrite the selector in place.
        script.Steps[0].Action.Target!.Selector = '#healed';

        expect(test.ConfigurationObject!.ReplayScript!.Steps[0].Action.Target!.Selector).toBe('#old');
        expect(loadScript(test)!.Steps[0].Action.Target!.Selector).toBe('#old');
    });

    it('two loads do not share a reference', () => {
        const test = fakeTest(promoted('#old'));
        const a = loadScript(test)!;
        const b = loadScript(test)!;
        expect(a).not.toBe(b);
        a.Steps[0].Instruction = 'mutated';
        expect(b.Steps[0].Instruction).toBe('click Save');
    });

    it('a heal-then-fallback run leaves ReplayScript byte-identical', async () => {
        const original = promoted('#old');
        const test = fakeTest(original);

        // 1. Replay loads the promoted script and heals step 0 in place.
        const replayed = loadScript(test)!;
        replayed.Steps[0].Action.Target!.Selector = '#healed';

        // 2. It diverges later; AllowLLMFallback runs the agent, which passes and
        //    records a fresh script. Because one already exists, it must go pending.
        const fresh = sampleScript();
        const result = await saveScript(test, fresh);

        expect(result.saved).toBe(true);
        expect(result.slot).toBe('pending');

        const config = test.ConfigurationObject!;
        expect(config.PendingReplayScript).toBeDefined();
        // The promoted slot must be exactly what it was before the run.
        expect(JSON.stringify(config.ReplayScript)).toBe(JSON.stringify(JSON.parse(original).ReplayScript));
        expect(config.ReplayScript!.Steps[0].Action.Target!.Selector).toBe('#old');
    });

    it('preserves unrelated configuration keys through the pending save', async () => {
        const test = fakeTest(promoted('#old'));
        await saveScript(test, sampleScript());
        expect(test.ConfigurationObject!.maxSteps).toBe(30);
    });
});
