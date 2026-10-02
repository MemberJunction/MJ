import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    FatalStageError,
    Outcome,
    StageContext,
    StageOutcome,
    TransientStageError,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { PipelineProcessor, PipelineProcessorConfig } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

/** Whatever the current test wants the stage to do. Reset per test. */
let behaviour: (record: WorkingRecord, context: StageContext) => Promise<StageOutcome> = async () =>
    Outcome.Complete();

@RegisterClass(BasePipelineStage, 'ProcTestStage')
class ProcTestStage extends BasePipelineStage {
    public readonly Name = 'ProcTestStage';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';
    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        return behaviour(record, context);
    }
}

@RegisterClass(BasePipelineStage, 'ProcTestSecond')
class ProcTestSecondStage extends BasePipelineStage {
    public readonly Name = 'ProcTestSecond';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'SegmentationStatus';
    public async Run(record: WorkingRecord): Promise<StageOutcome> {
        record.Propose('Decorator', 'second ran', 5, 'ProcTestSecond');
        return Outcome.Complete();
    }
}

const commit = vi.fn(async () => ({ RecordID: 'ID-1', ColumnsWritten: ['Text'], Created: false }));
const hydrate = vi.fn(
    async () => new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x/a', 'ID-1')),
);

const storage = {
    Hydrator: () => ({ Hydrate: hydrate }) as unknown as WorkingRecordHydrator,
    Committer: () => ({ Commit: commit }) as unknown as WorkingRecordCommitter,
};

function build(config: Partial<PipelineProcessorConfig> = {}): PipelineProcessor {
    return new PipelineProcessor(
        { Stages: ['ProcTestStage'], IsTest: false, Scope: 'Filter', Configuration: {}, ...config },
        storage,
    );
}

const rsContext = { contextUser: {}, provider: {} } as never;
function ref(hints?: Record<string, unknown>) {
    return { EntityID: 'E1', RecordID: 'ID-1', ...(hints ? { Hints: hints } : {}) } as never;
}

beforeEach(() => {
    behaviour = async () => Outcome.Complete();
    commit.mockClear();
    hydrate.mockClear();
});

describe('PipelineProcessor construction', () => {
    it('refuses an unregistered stage name rather than silently doing nothing', () => {
        expect(() => build({ Stages: ['NoSuchStage'] })).toThrow(/is not registered/);
    });

    it('refuses an empty stage list', () => {
        expect(() => build({ Stages: [] })).toThrow(/at least one stage/);
    });

    it('resolves its stages once, up front', () => {
        expect(build().Stages.map((s) => s.Name)).toEqual(['ProcTestStage']);
    });
});

describe('PipelineProcessor happy path', () => {
    it('hydrates, runs the stage and commits Complete', async () => {
        const result = await build().ProcessRecord(ref(), rsContext);
        expect(hydrate).toHaveBeenCalledWith('Content Item', 'ID-1');
        expect(result.Status).toBe('Succeeded');
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Complete');
    });

    it('commits Skipped when a stage genuinely declines a record', async () => {
        behaviour = async () => Outcome.Skipped('nothing to do');
        const result = await build().ProcessRecord(ref(), rsContext);
        expect(result.Status).toBe('Skipped');
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Skipped');
    });
});

describe('PipelineProcessor test mode', () => {
    it('withholds the commit entirely', async () => {
        const result = await build({ IsTest: true }).ProcessRecord(ref(), rsContext);
        expect(result.Status).toBe('Succeeded');
        expect(commit).not.toHaveBeenCalled();
    });

    it('still tells the stage it is a test, so it can record more detail', async () => {
        let sawTest: boolean | null = null;
        behaviour = async (_r, context) => {
            sawTest = context.IsTest;
            return Outcome.Complete();
        };
        await build({ IsTest: true }).ProcessRecord(ref(), rsContext);
        expect(sawTest).toBe(true);
    });
});

describe('PipelineProcessor failure finality', () => {
    it('commits Failed for a fatal failure', async () => {
        behaviour = async () => Outcome.Fatal('permanent 404');
        const result = await build().ProcessRecord(ref(), rsContext);
        expect(result.Status).toBe('Failed');
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed');
    });

    it('commits Failed for a transient failure in FILTER scope, which never retries', async () => {
        behaviour = async () => Outcome.Retry('timeout');
        await build({ Scope: 'Filter' }).ProcessRecord(ref(), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed');
    });

    it('leaves the status alone for a transient failure before the last queue attempt', async () => {
        behaviour = async () => Outcome.Retry('timeout');
        await build({ Scope: 'Queue' }).ProcessRecord(ref({ Attempt: 2, MaxAttempts: 5 }), rsContext);
        expect(commit).not.toHaveBeenCalled();
    });

    it('commits Failed on the LAST queue attempt, so a dead-lettered record stops looking ready', async () => {
        behaviour = async () => Outcome.Retry('timeout');
        await build({ Scope: 'Queue' }).ProcessRecord(ref({ Attempt: 5, MaxAttempts: 5 }), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed');
    });

    it('treats a thrown TransientStageError as retryable', async () => {
        behaviour = async () => {
            throw new TransientStageError('socket hang up');
        };
        await build({ Scope: 'Queue' }).ProcessRecord(ref({ Attempt: 1, MaxAttempts: 3 }), rsContext);
        expect(commit).not.toHaveBeenCalled();
    });

    it('treats a thrown FatalStageError as final', async () => {
        behaviour = async () => {
            throw new FatalStageError('malformed');
        };
        await build({ Scope: 'Queue' }).ProcessRecord(ref({ Attempt: 1, MaxAttempts: 3 }), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed');
    });

    it('treats a bare Error as fatal rather than retrying on a guess', async () => {
        behaviour = async () => {
            throw new Error('who knows');
        };
        const result = await build({ Scope: 'Queue' }).ProcessRecord(ref({ Attempt: 1, MaxAttempts: 3 }), rsContext);
        expect(result.Status).toBe('Failed');
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed');
    });
});

describe('PipelineProcessor chained stages', () => {
    it('runs them in order on ONE working record, with no reload between', async () => {
        const processor = build({ Stages: ['ProcTestStage', 'ProcTestSecond'] });
        await processor.ProcessRecord(ref(), rsContext);
        expect(hydrate).toHaveBeenCalledTimes(1);
    });

    it('commits against the LAST stage status field', async () => {
        await build({ Stages: ['ProcTestStage', 'ProcTestSecond'] }).ProcessRecord(ref(), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'SegmentationStatus', 'Complete');
    });

    it('stops at the first stage that does not complete', async () => {
        behaviour = async () => Outcome.Fatal('stop here');
        await build({ Stages: ['ProcTestStage', 'ProcTestSecond'] }).ProcessRecord(ref(), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'SegmentationStatus', 'Failed');
    });
});

describe('PipelineProcessor cancellation', () => {
    it('does not start a stage whose signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        let ran = false;
        behaviour = async () => {
            ran = true;
            return Outcome.Complete();
        };
        await build({ Scope: 'Queue' }).ProcessRecord(
            ref({ Signal: controller.signal, Attempt: 1, MaxAttempts: 3 }),
            rsContext,
        );
        expect(ran).toBe(false);
        expect(commit).not.toHaveBeenCalled();
    });
});
