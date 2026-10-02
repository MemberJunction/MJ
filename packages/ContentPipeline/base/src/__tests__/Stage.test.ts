import { describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BasePipelineStage } from '../BasePipelineStage.js';
import { FatalStageError, IsFinalAttempt, Outcome, StageContext, TransientStageError } from '../Stage.types.js';
import { WorkingRecord } from '../WorkingRecord.js';
import { WorkingRecordEntity } from '../WorkingRecord.types.js';

@RegisterClass(BasePipelineStage, 'TestNoOp')
class TestNoOpStage extends BasePipelineStage {
    public readonly Name = 'TestNoOp';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';
    public async Run(): Promise<ReturnType<typeof Outcome.Complete>> {
        return Outcome.Complete();
    }
}

function contextWith(partial: Partial<StageContext>): StageContext {
    return {
        Scope: 'Filter',
        Attempt: 1,
        MaxAttempts: 1,
        IsReplay: false,
        ...partial,
    } as StageContext;
}

describe('Outcome builders', () => {
    it('marks a fatal failure as non-transient', () => {
        const outcome = Outcome.Fatal('permanent 404');
        expect(outcome.Status).toBe('Failed');
        expect(outcome.IsTransient).toBe(false);
    });

    it('marks a retry as transient', () => {
        const outcome = Outcome.Retry('rate limited');
        expect(outcome.Status).toBe('Retry');
        expect(outcome.IsTransient).toBe(true);
    });

    it('distinguishes Skipped from Failed — a genuine decline is not a failure', () => {
        expect(Outcome.Skipped('no text to segment').Status).toBe('Skipped');
    });
});

describe('IsFinalAttempt', () => {
    it('is always final in filter scope, which does not retry', () => {
        expect(IsFinalAttempt(contextWith({ Scope: 'Filter', Attempt: 1, MaxAttempts: 5 }))).toBe(true);
    });

    it('is not final mid-way through a queue-scoped record', () => {
        expect(IsFinalAttempt(contextWith({ Scope: 'Queue', Attempt: 2, MaxAttempts: 5 }))).toBe(false);
    });

    it('is final on the last queue attempt', () => {
        expect(IsFinalAttempt(contextWith({ Scope: 'Queue', Attempt: 5, MaxAttempts: 5 }))).toBe(true);
    });
});

describe('Stage error kinds', () => {
    it('are distinguishable by instanceof so the processor can route them', () => {
        expect(new TransientStageError('x')).toBeInstanceOf(TransientStageError);
        expect(new FatalStageError('x')).toBeInstanceOf(FatalStageError);
        expect(new TransientStageError('x')).not.toBeInstanceOf(FatalStageError);
    });

    it('preserve a cause', () => {
        const cause = new Error('socket hang up');
        expect(new TransientStageError('fetch failed', { cause }).cause).toBe(cause);
    });
});

describe('BasePipelineStage.Resolve', () => {
    it('resolves a registered stage by name, with no compiled-in list', () => {
        const stage = BasePipelineStage.Resolve('TestNoOp');
        expect(stage).toBeInstanceOf(TestNoOpStage);
        expect(stage?.Name).toBe('TestNoOp');
    });

    it('returns null for a name nothing registered', () => {
        expect(BasePipelineStage.Resolve('NotRegisteredAnywhere')).toBeNull();
    });

    it('declares nothing by default, so a stage opts in to its declaration', () => {
        const declaration = BasePipelineStage.Resolve('TestNoOp')!.Declaration;
        expect(declaration).toEqual({ Reads: [], Writes: [], ReadsExtensions: [], WritesExtensions: [] });
    });

    it('leaves Finalize undefined unless a stage implements it', () => {
        expect(BasePipelineStage.Resolve('TestNoOp')!.Finalize).toBeUndefined();
    });
});
