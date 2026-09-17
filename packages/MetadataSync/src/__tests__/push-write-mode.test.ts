import { describe, it, expect } from 'vitest';
import { resolvePushWritePlan, parallelModeWarning, DEFAULT_PARALLEL_BATCH_SIZE } from '../lib/push-write-mode';

describe('resolvePushWritePlan', () => {
    it('is atomic with a batch of 1 when nothing is set', () => {
        expect(resolvePushWritePlan({})).toEqual({ mode: 'atomic', graphBatchSize: 1, source: 'default', warnings: [] });
    });

    it('uses push.atomic from the config when the flag is not passed', () => {
        const plan = resolvePushWritePlan({ configAtomic: false });
        expect(plan.mode).toBe('parallel');
        expect(plan.source).toBe('config');
        expect(plan.graphBatchSize).toBe(DEFAULT_PARALLEL_BATCH_SIZE);
    });

    it('lets --atomic override push.atomic: false', () => {
        const plan = resolvePushWritePlan({ atomicFlag: true, configAtomic: false });
        expect(plan.mode).toBe('atomic');
        expect(plan.source).toBe('flag');
    });

    it('lets --no-atomic override push.atomic: true and honours --parallel-batch-size', () => {
        const plan = resolvePushWritePlan({ atomicFlag: false, configAtomic: true, parallelBatchSize: 4 });
        expect(plan).toEqual({ mode: 'parallel', graphBatchSize: 4, source: 'flag', warnings: [] });
    });

    it('ignores --parallel-batch-size in an atomic push and says so', () => {
        const plan = resolvePushWritePlan({ parallelBatchSize: 20 });
        expect(plan.mode).toBe('atomic');
        expect(plan.graphBatchSize).toBe(1);
        expect(plan.warnings).toHaveLength(1);
        expect(plan.warnings[0]).toMatch(/--parallel-batch-size=20 is ignored/);
        expect(plan.warnings[0]).toMatch(/--no-atomic/);
    });

    it('does not warn about --parallel-batch-size=1 in an atomic push', () => {
        expect(resolvePushWritePlan({ parallelBatchSize: 1 }).warnings).toEqual([]);
    });
});

describe('parallelModeWarning', () => {
    it('says creates and updates are not rolled back', () => {
        const text = parallelModeWarning(10);
        expect(text).toMatch(/10 graphs in parallel/);
        expect(text).toMatch(/stay in the database/);
    });
});
