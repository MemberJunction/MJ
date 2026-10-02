import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    Outcome,
    StageContext,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { PipelineProcessor, PipelineProcessorConfig } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

/** A stage that runs until its stop signal fires, like a real long walk. */
@RegisterClass(BasePipelineStage, 'BudgetTestSlow')
class SlowStage extends BasePipelineStage {
    public readonly Name = 'BudgetTestSlow';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';
    public Iterations = 0;
    public async Run(_record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        while (!context.Signal.aborted) {
            this.Iterations++;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        // Honours its signal and reports what it found, rather than hanging.
        return Outcome.Complete(`stopped after ${this.Iterations} iteration(s)`);
    }
}

/** A stage that produces a child, to show what a test run does with one. */
@RegisterClass(BasePipelineStage, 'BudgetTestProducer')
class ProducerStage extends BasePipelineStage {
    public readonly Name = 'BudgetTestProducer';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';
    public async Run(record: WorkingRecord): Promise<StageOutcome> {
        record.AddChild(new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/found')));
        return Outcome.Complete();
    }
}

const commit = vi.fn(async () => ({ RecordID: 'ID-1', ColumnsWritten: [], Created: false }));
const commitChild = vi.fn(async () => ({ RecordID: 'CHILD-1', ColumnsWritten: [], Created: true }));
const hydrate = vi.fn(async () => new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x/a', 'ID-1')));
const childOutcomes: { Key: string; Status: string }[] = [];

const storage = {
    Hydrator: () => ({ Hydrate: hydrate }) as unknown as WorkingRecordHydrator,
    Committer: () => ({ Commit: commit, CommitChild: commitChild }) as unknown as WorkingRecordCommitter,
};
const progress = {
    OpenRecord: async () => {},
    ReportProgress: () => {},
    RecordChildOutcome: async (_p: unknown, key: string, result: { Status: string }) => {
        childOutcomes.push({ Key: key, Status: result.Status });
    },
};

function build(config: Partial<PipelineProcessorConfig>): PipelineProcessor {
    return new PipelineProcessor(
        { Stages: ['BudgetTestProducer'], IsTest: false, Scope: 'Filter', Configuration: {}, ...config },
        storage,
        progress,
    );
}
const rsContext = { contextUser: {}, provider: {} } as never;
const ref = { EntityID: 'E1', RecordID: 'ID-1' } as never;

beforeEach(() => {
    commit.mockClear();
    commitChild.mockClear();
    childOutcomes.length = 0;
});

describe('test mode', () => {
    it('commits nothing at all — neither the record nor its children', async () => {
        await build({ Stages: ['BudgetTestProducer'], IsTest: true }).ProcessRecord(ref, rsContext);
        expect(commit).not.toHaveBeenCalled();
        expect(commitChild).not.toHaveBeenCalled();
    });

    it('still reports a detail row per produced child, under its EPHEMERAL identity', async () => {
        await build({ Stages: ['BudgetTestProducer'], IsTest: true }).ProcessRecord(ref, rsContext);
        expect(childOutcomes).toEqual([{ Key: 'https://x.test/found', Status: 'Succeeded' }]);
    });

    it('commits children on a live run', async () => {
        await build({ Stages: ['BudgetTestProducer'], IsTest: false }).ProcessRecord(ref, rsContext);
        expect(commitChild).toHaveBeenCalledTimes(1);
    });
});

describe('the per-stage wall-clock budget', () => {
    it('stops a long-running stage and reports it as incomplete', async () => {
        const result = await build({ Stages: ['BudgetTestSlow'], StageBudgetMs: 30 }).ProcessRecord(ref, rsContext);
        // Partial work must not look like a completed pass, or the record would never be revisited.
        expect(result.Status).toBe('Failed');
        expect((result.ResultPayload as { Outcome: string }).Outcome).toBe('Retry');
        expect(result.ErrorMessage).toContain('budget');
    });

    it('does not commit a status for a budget-expired record', async () => {
        await build({ Stages: ['BudgetTestSlow'], StageBudgetMs: 30, Scope: 'Queue' }).ProcessRecord(
            { ...(ref as object), Hints: { Attempt: 1, MaxAttempts: 3 } } as never,
            rsContext,
        );
        expect(commit).not.toHaveBeenCalled();
    });

    it('leaves a stage that finishes within budget alone', async () => {
        const result = await build({ Stages: ['BudgetTestProducer'], StageBudgetMs: 5000 }).ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Succeeded');
    });

    it('applies no budget when none is configured', async () => {
        const result = await build({ Stages: ['BudgetTestProducer'] }).ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Succeeded');
    });
});
