import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { AgentRunStepTracker } from '../engine/agent-run-step-tracker.js';

const PROMPT_UUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

/** A mutable fake step entity — captures field assignments + counts Save() calls (resolves true). */
function fakeStep() {
    return {
        saves: 0,
        NewRecord: vi.fn(),
        Save: vi.fn(async function (this: { saves: number }) {
            this.saves++;
            return true;
        }),
        LatestResult: { CompleteMessage: 'boom' },
    } as unknown as MJAIAgentRunStepEntity & { saves: number };
}

/** A fake provider that hands back the given step from GetEntityObject. */
function fakeProvider(step: MJAIAgentRunStepEntity) {
    return { GetEntityObject: vi.fn(async () => step) } as unknown as IMetadataProvider;
}

const prompt = { ID: PROMPT_UUID, Name: 'Controller' } as unknown as MJAIPromptEntityExtended;

describe('AgentRunStepTracker', () => {
    it('BeginPromptStep synchronously sets the child Prompt step fields nested under the parent', async () => {
        const step = fakeStep();
        const tracker = new AgentRunStepTracker(fakeProvider(step), undefined, 'run-1', 'parent-step-1');

        const created = await tracker.BeginPromptStep(prompt);

        expect(created).toBe(step);
        expect(step.AgentRunID).toBe('run-1');
        expect(step.ParentID).toBe('parent-step-1'); // nested under the goal's parent step
        expect(step.StepType).toBe('Prompt');
        expect(step.StepName).toBe('Prompt: Controller');
        expect(step.TargetID).toBe(PROMPT_UUID); // links to the prompt definition
        expect(step.Status).toBe('Running');
        expect(step.StepNumber).toBe(1); // counter starts at 0 (no Init) → first step is 1
    });

    it('fires the INSERT fire-and-forget — not awaited by Begin, flushed by Flush', async () => {
        const step = fakeStep();
        const tracker = new AgentRunStepTracker(fakeProvider(step), undefined, 'run-1', 'parent-step-1');

        await tracker.BeginPromptStep(prompt);
        await tracker.Flush(); // the goal completing flushes pending saves

        expect((step as unknown as { saves: number }).saves).toBeGreaterThanOrEqual(1); // INSERT landed via the queue
    });

    it('EndPromptStep synchronously stamps the prompt-run id (TargetLogID) + Completed status', async () => {
        const step = fakeStep();
        const tracker = new AgentRunStepTracker(fakeProvider(step), undefined, 'run-1', 'parent-step-1');
        await tracker.BeginPromptStep(prompt);

        tracker.EndPromptStep(step, 'promptrun-42', true); // synchronous — fire-and-forget UPDATE
        expect(step.TargetLogID).toBe('promptrun-42');
        expect(step.Status).toBe('Completed');
        expect(step.Success).toBe(true);

        await tracker.Flush();
        expect((step as unknown as { saves: number }).saves).toBe(2); // INSERT + UPDATE both persisted
    });

    it('EndPromptStep records a failure', () => {
        const step = fakeStep();
        const tracker = new AgentRunStepTracker(fakeProvider(step), undefined, 'run-1', 'parent-step-1');
        tracker.EndPromptStep(step, undefined, false, 'vision model offline');
        expect(step.Status).toBe('Failed');
        expect(step.ErrorMessage).toBe('vision model offline');
    });

    it('EndPromptStep is a no-op when the step is null (Begin had failed)', () => {
        const tracker = new AgentRunStepTracker(fakeProvider(fakeStep()), undefined, 'run-1', 'parent-step-1');
        expect(() => tracker.EndPromptStep(null, 'x', true)).not.toThrow();
    });

    it('returns null (best-effort) when entity creation throws — never aborts the goal', async () => {
        const provider = { GetEntityObject: vi.fn(async () => { throw new Error('db down'); }) } as unknown as IMetadataProvider;
        const tracker = new AgentRunStepTracker(provider, undefined, 'run-1', 'parent-step-1');
        expect(await tracker.BeginPromptStep(prompt)).toBeNull();
    });

    it('increments the step number across successive prompts', async () => {
        const first = fakeStep();
        const second = fakeStep();
        const provider = { GetEntityObject: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) } as unknown as IMetadataProvider;
        const tracker = new AgentRunStepTracker(provider, undefined, 'run-1', 'parent-step-1');

        await tracker.BeginPromptStep(prompt);
        await tracker.BeginPromptStep(prompt);

        expect(first.StepNumber).toBe(1);
        expect(second.StepNumber).toBe(2);
    });
});
