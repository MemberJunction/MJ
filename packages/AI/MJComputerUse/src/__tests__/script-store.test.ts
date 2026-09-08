import { describe, it, expect, vi } from 'vitest';
import { MJTestEntity, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import { ComputerUseTrace, TraceStep } from '@memberjunction/computer-use';
import { allowsLLMFallback, loadScript, saveScript } from '../test-driver/script-store.js';

/**
 * A stand-in for the generated `MJTestEntity`, reproducing the three behaviours
 * the store depends on: the lazy-parsing `ConfigurationObject` accessor, `Save()`
 * returning a boolean rather than throwing, and `LatestResult.CompleteMessage`
 * carrying the reason when it returns false.
 */
function fakeTest(configuration: string | null, save?: { ok: boolean; message?: string }): MJTestEntity {
    const entity = {
        ID: 'test-1',
        Configuration: configuration,
        LatestResult: save?.message ? { CompleteMessage: save.message } : undefined,
        get ConfigurationObject(): MJTestEntity_ITestConfiguration | null {
            return this.Configuration ? JSON.parse(this.Configuration) : null;
        },
        set ConfigurationObject(value: MJTestEntity_ITestConfiguration | null) {
            this.Configuration = value ? JSON.stringify(value) : null;
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
