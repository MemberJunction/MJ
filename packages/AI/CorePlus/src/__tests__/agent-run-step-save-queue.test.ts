import { describe, it, expect, vi } from 'vitest';
import type { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { AgentRunStepSaveQueue } from '../agent-run-steps';

/**
 * A fake step whose Save records each call's options + the order it resolved, optionally returning false /
 * throwing to exercise the failure paths.
 */
function fakeStep(opts: { result?: boolean; throws?: boolean } = {}) {
    const calls: { ignoreDirtyState: boolean | undefined; order: number }[] = [];
    const step = {
        ID: 'step-1',
        calls,
        LatestResult: { CompleteMessage: 'save failed' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Save: vi.fn(async (saveOptions?: any) => {
            calls.push({ ignoreDirtyState: saveOptions?.IgnoreDirtyState, order: calls.length });
            if (opts.throws) {
                throw new Error('db exploded');
            }
            return opts.result ?? true;
        }),
    } as unknown as MJAIAgentRunStepEntity & { calls: { ignoreDirtyState: boolean | undefined }[] };
    return step;
}

describe('AgentRunStepSaveQueue', () => {
    it('Insert fires a normal (non-forced) save, awaited by Flush', async () => {
        const q = new AgentRunStepSaveQueue();
        const step = fakeStep();
        q.Insert(step);
        const result = await q.Flush();

        expect(step.Save).toHaveBeenCalledTimes(1);
        expect((step as unknown as { calls: { ignoreDirtyState: boolean | undefined }[] }).calls[0].ignoreDirtyState).toBeUndefined();
        expect(result.failures).toBe(0);
    });

    it('QueueUpdate force-persists (IgnoreDirtyState) and runs AFTER the INSERT', async () => {
        const q = new AgentRunStepSaveQueue();
        const step = fakeStep();
        q.Insert(step);
        q.QueueUpdate(step);
        await q.Flush();

        const calls = (step as unknown as { calls: { ignoreDirtyState: boolean | undefined }[] }).calls;
        expect(calls).toHaveLength(2);
        expect(calls[0].ignoreDirtyState).toBeUndefined(); // insert first, normal
        expect(calls[1].ignoreDirtyState).toBe(true); // update second, forced
    });

    it('Flush reports failures for saves that resolve false', async () => {
        const q = new AgentRunStepSaveQueue();
        q.Insert(fakeStep({ result: false }));
        const result = await q.Flush();
        expect(result.failures).toBe(1);
        expect(result.rejections).toBe(0);
    });

    it('swallows a throwing Save (logged, never propagated) and counts it as a failure', async () => {
        const q = new AgentRunStepSaveQueue();
        q.Insert(fakeStep({ throws: true }));
        // save() catches internally and returns false, so it surfaces as a failure, not an unhandled rejection.
        const result = await q.Flush();
        expect(result.failures).toBe(1);
        expect(result.rejections).toBe(0);
    });

    it('Flush drains — a second Flush after no new work reports nothing', async () => {
        const q = new AgentRunStepSaveQueue();
        q.Insert(fakeStep());
        await q.Flush();
        const second = await q.Flush();
        expect(second.failures).toBe(0);
    });

    it('serializes successive updates to the same step in order', async () => {
        const q = new AgentRunStepSaveQueue();
        const step = fakeStep();
        q.Insert(step);
        q.QueueUpdate(step);
        q.QueueUpdate(step);
        await q.Flush();
        expect(step.Save).toHaveBeenCalledTimes(3); // insert + 2 updates, all flushed
    });
});
