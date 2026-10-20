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
        { Stages: ['ProcTestStage'], IsTest: false, Configuration: {}, ...config },
        storage,
    );
}

const rsContext = { contextUser: {}, provider: {} } as never;
function ref() {
    return { EntityID: 'E1', RecordID: 'ID-1' } as never;
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
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Complete', true);
    });

    it('commits Skipped when a stage genuinely declines a record', async () => {
        behaviour = async () => Outcome.Skipped('nothing to do');
        const result = await build().ProcessRecord(ref(), rsContext);
        expect(result.Status).toBe('Skipped');
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Skipped', false);
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
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed', false);
    });

    it('commits Failed for a transient failure — a Record Set Processing run does not retry', async () => {
        behaviour = async () => Outcome.Retry('timeout');
        const result = await build().ProcessRecord(ref(), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed', false);
        expect((result.ResultPayload as { IsTransient: boolean }).IsTransient).toBe(true);
    });

    it('classifies thrown stage errors: transient, fatal, and a bare Error as fatal', async () => {
        for (const [error, transient] of [
            [new TransientStageError('socket hang up'), true],
            [new FatalStageError('malformed'), false],
            [new Error('who knows'), false],
        ] as const) {
            commit.mockClear();
            behaviour = async () => {
                throw error;
            };
            const result = await build().ProcessRecord(ref(), rsContext);
            expect(result.Status).toBe('Failed');
            expect((result.ResultPayload as { IsTransient: boolean }).IsTransient).toBe(transient);
            expect(commit).toHaveBeenCalledWith(expect.anything(), 'ExtractionStatus', 'Failed', false);
        }
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
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'SegmentationStatus', 'Complete', true);
    });

    it('stops at the first stage that does not complete', async () => {
        behaviour = async () => Outcome.Fatal('stop here');
        await build({ Stages: ['ProcTestStage', 'ProcTestSecond'] }).ProcessRecord(ref(), rsContext);
        expect(commit).toHaveBeenCalledWith(expect.anything(), 'SegmentationStatus', 'Failed', false);
    });
});

@RegisterClass(BasePipelineStage, 'ProcTestSourceStage')
class ProcTestSourceStage extends BasePipelineStage {
    public readonly Name = 'ProcTestSourceStage';
    public readonly Entity: WorkingRecordEntity = 'Content Source';
    public readonly StatusField = null;
    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        return behaviour(record, context);
    }
}

describe('PipelineProcessor Sync mode reconciliation and safeguards', () => {
    const commitChild = vi.fn(async () => ({ RecordID: 'C-1', ColumnsWritten: [], Created: false }));
    const syncStorage = {
        Hydrator: () =>
            ({
                Hydrate: async () => new WorkingRecord(new WorkingRecordIdentity('Content Source', 'https://x.test', 'SRC-1')),
            }) as unknown as WorkingRecordHydrator,
        Committer: () => ({ Commit: commit, CommitChild: commitChild }) as unknown as WorkingRecordCommitter,
    };

    function syncContext(liveRows: { ID: string; URL: string; __mj_CreatedAt?: Date }[], markedIDs: string[]) {
        return {
            contextUser: {},
            provider: {
                EntityByName: () => ({ ID: 'E-ITEM' }),
                RunView: async () => ({ Success: true, Results: liveRows }),
                GetEntityObject: async () => ({
                    InnerLoad: async (ck: { KeyValuePairs: { Value: string }[] }) => {
                        markedIDs.push(ck.KeyValuePairs[0].Value);
                        return true;
                    },
                    Set: () => {},
                    Save: async () => true,
                }),
            },
        } as never;
    }

    it('fails the source on a zero-yield Sync walk when live items exist', async () => {
        const marked: string[] = [];
        behaviour = async (r) => {
            r.SetExtension('Discover', 'walkStartedAt', new Date('2026-10-15T12:00:00Z'));
            return Outcome.Complete();
        };
        const proc = new PipelineProcessor(
            { Stages: ['ProcTestSourceStage'], IsTest: false, Configuration: { Mode: 'Sync' } },
            syncStorage,
        );
        const result = await proc.ProcessRecord(
            ref(),
            syncContext([{ ID: 'I1', URL: 'https://x.test/a', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') }], marked),
        );
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toMatch(/0 items/);
        expect(marked).toEqual([]);
    });

    it('fails the source when a Sync walk would remove more than MaxSyncRemovalShare of live items', async () => {
        const marked: string[] = [];
        behaviour = async (r) => {
            r.SetExtension('Discover', 'walkStartedAt', new Date('2026-10-15T12:00:00Z'));
            r.AddChild(new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a')));
            return Outcome.Complete();
        };
        const proc = new PipelineProcessor(
            { Stages: ['ProcTestSourceStage'], IsTest: false, Configuration: { Mode: 'Sync' } },
            syncStorage,
        );
        // 1 of 3 yielded -> 2 of 3 (66.7%) missing > default 50% MaxSyncRemovalShare
        const result = await proc.ProcessRecord(
            ref(),
            syncContext(
                [
                    { ID: 'I1', URL: 'https://x.test/a', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') },
                    { ID: 'I2', URL: 'https://x.test/b', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') },
                    { ID: 'I3', URL: 'https://x.test/c', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') },
                ],
                marked,
            ),
        );
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toMatch(/MaxSyncRemovalShare/);
        expect(marked).toEqual([]);
    });

    it('marks missing pre-walk items for deletion when within MaxSyncRemovalShare and spares items created after walkStartedAt', async () => {
        const marked: string[] = [];
        behaviour = async (r) => {
            r.SetExtension('Discover', 'walkStartedAt', new Date('2026-10-15T12:00:00Z'));
            r.AddChild(new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a')));
            r.AddChild(new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/b')));
            return Outcome.Complete();
        };
        const proc = new PipelineProcessor(
            { Stages: ['ProcTestSourceStage'], IsTest: false, Configuration: { Mode: 'Sync' } },
            syncStorage,
        );
        // 2 of 3 pre-walk items yielded -> 1 of 3 (33.3%) missing <= 50%; I4 was created after walkStartedAt so spared.
        const result = await proc.ProcessRecord(
            ref(),
            syncContext(
                [
                    { ID: 'I1', URL: 'https://x.test/a', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') },
                    { ID: 'I2', URL: 'https://x.test/b', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') },
                    { ID: 'I3', URL: 'https://x.test/c', __mj_CreatedAt: new Date('2026-10-15T10:00:00Z') },
                    { ID: 'I4', URL: 'https://x.test/d', __mj_CreatedAt: new Date('2026-10-15T13:00:00Z') },
                ],
                marked,
            ),
        );
        expect(result.Status).toBe('Succeeded');
        expect(marked).toEqual(['I3']);
    });
});
