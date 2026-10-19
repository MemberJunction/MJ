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

    it('QueueUpdate(applyMutation) applies the mutation AFTER the INSERT, so an in-flight INSERT reload cannot revert it (race fix)', async () => {
        const q = new AgentRunStepSaveQueue();
        const persisted: string[] = [];
        let releaseInsert!: () => void;
        const insertGate = new Promise<void>((resolve) => { releaseInsert = resolve; });

        // Models the real BaseEntity behavior: the INSERT's post-save finalizeSave (init()+SetMany) reverts
        // any field mutated while the INSERT was in flight back to the inserted value. A forced UPDATE
        // (IgnoreDirtyState) records whatever the field holds when IT runs.
        const step = {
            ID: 'step-1',
            Status: 'Running',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Save: vi.fn(async (saveOptions?: any) => {
                if (!saveOptions?.IgnoreDirtyState) {
                    await insertGate;            // hold the INSERT "in flight"
                    (step as { Status: string }).Status = 'Running'; // reload reverts the in-flight mutation
                }
                persisted.push((step as { Status: string }).Status);
                return true;
            }),
        } as unknown as MJAIAgentRunStepEntity & { Status: string };

        q.Insert(step);
        // Caller mutates the shared entity while the INSERT is still in flight — this in-memory change is
        // what the INSERT's reload clobbers.
        step.Status = 'Completed';
        // ...but the SAME terminal state is queued as a post-INSERT mutation, so it is re-asserted after the
        // reload and before the UPDATE save.
        q.QueueUpdate(step, (s) => { (s as unknown as { Status: string }).Status = 'Completed'; });

        releaseInsert();
        await q.Flush();

        // INSERT persisted the reverted value; the UPDATE persisted the re-applied terminal value.
        expect(persisted).toEqual(['Running', 'Completed']);
        expect(step.Status).toBe('Completed');
    });

    it('without applyMutation, an in-flight INSERT reload clobbers the caller mutation (documents the bug the param fixes)', async () => {
        const q = new AgentRunStepSaveQueue();
        const persisted: string[] = [];
        let releaseInsert!: () => void;
        const insertGate = new Promise<void>((resolve) => { releaseInsert = resolve; });
        const step = {
            ID: 'step-1',
            Status: 'Running',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Save: vi.fn(async (saveOptions?: any) => {
                if (!saveOptions?.IgnoreDirtyState) {
                    await insertGate;
                    (step as { Status: string }).Status = 'Running';
                }
                persisted.push((step as { Status: string }).Status);
                return true;
            }),
        } as unknown as MJAIAgentRunStepEntity & { Status: string };

        q.Insert(step);
        step.Status = 'Completed';
        q.QueueUpdate(step); // legacy path: mutate-then-queue, no re-apply
        releaseInsert();
        await q.Flush();

        // The UPDATE force-persists the reverted 'Running' — the exact "stuck at Running" symptom.
        expect(persisted).toEqual(['Running', 'Running']);
    });

    it('Insert(step, [prereqA, prereqB]) waits for ALL prerequisites to settle and calls step.Save exactly once', async () => {
        const q = new AgentRunStepSaveQueue();
        const order: string[] = [];
        let releaseA!: () => void;
        let releaseB!: () => void;
        const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
        const gateB = new Promise<void>((resolve) => { releaseB = resolve; });

        const prereqA = {
            ID: 'parent-step',
            Save: vi.fn(async () => {
                await gateA;
                order.push('prereqA');
                return true;
            }),
        } as unknown as MJAIAgentRunStepEntity;

        const prereqB = {
            ID: 'source-step',
            Save: vi.fn(async () => {
                await gateB;
                order.push('prereqB');
                return true;
            }),
        } as unknown as MJAIAgentRunStepEntity;

        const child = {
            ID: 'child-step',
            Save: vi.fn(async () => {
                order.push('child');
                return true;
            }),
        } as unknown as MJAIAgentRunStepEntity;

        q.Insert(prereqA);
        q.Insert(prereqB);
        q.Insert(child, [prereqA, prereqB]);

        // Release A first; child must still wait for B.
        releaseA();
        await new Promise((r) => setTimeout(r, 10));
        expect(order).toEqual(['prereqA']);
        expect(child.Save).not.toHaveBeenCalled();

        // Release B; child now runs once.
        releaseB();
        const result = await q.Flush();
        expect(result.failures).toBe(0);
        expect(order).toEqual(['prereqA', 'prereqB', 'child']);
        expect(child.Save).toHaveBeenCalledTimes(1);
    });

    it('Insert(step, prereqs, beforeInsert) invokes beforeInsert after prerequisite settlement so a failed source step falls back cleanly', async () => {
        const q = new AgentRunStepSaveQueue();
        let releaseSource!: () => void;
        const sourceGate = new Promise<void>((resolve) => { releaseSource = resolve; });

        const sourceStep = {
            ID: 'source-step',
            IsSaved: false,
            LatestResult: { CompleteMessage: 'source insert failed' },
            Save: vi.fn(async () => {
                await sourceGate;
                // Simulate failed DB INSERT: IsSaved remains false
                return false;
            }),
        } as unknown as MJAIAgentRunStepEntity & { IsSaved: boolean };

        let persistedPayloadAtStart: string | null = null;
        let persistedSourceStepId: string | null = null;
        const dependentStep = {
            ID: 'dependent-step',
            PayloadAtStart: null as string | null,
            PayloadAtStartSourceStepID: 'source-step' as string | null,
            Save: vi.fn(async () => {
                persistedPayloadAtStart = dependentStep.PayloadAtStart;
                persistedSourceStepId = dependentStep.PayloadAtStartSourceStepID;
                return true;
            }),
        } as unknown as MJAIAgentRunStepEntity & {
            PayloadAtStart: string | null;
            PayloadAtStartSourceStepID: string | null;
        };

        q.Insert(sourceStep);
        q.Insert(dependentStep, [sourceStep], (s) => {
            if (!sourceStep.IsSaved) {
                s.PayloadAtStart = '{"fallback":true}';
                s.PayloadAtStartSourceStepID = null;
            }
        });

        releaseSource();
        const flushResult = await q.Flush();

        expect(flushResult.failures).toBe(1); // sourceStep failed, dependentStep succeeded
        expect(persistedPayloadAtStart).toBe('{"fallback":true}');
        expect(persistedSourceStepId).toBeNull();
        expect(dependentStep.Save).toHaveBeenCalledTimes(1);
    });
});

