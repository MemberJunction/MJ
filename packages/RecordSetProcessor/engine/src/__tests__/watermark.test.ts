import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { WatermarkService } from '../watermark/WatermarkService';
import { RecordSetProcessor } from '../RecordSetProcessor';
import { ArraySource, IRecordProcessor, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { NoOpTracker } from '../trackers/NoOpTracker';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { UserInfo, RunView, IMetadataProvider, type RunViewResult } from '@memberjunction/core';
import type { MJRecordProcessWatermarkEntity } from '@memberjunction/core-entities';

// Mock RunView so we don't hit a real database in unit tests
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockRunView {
        public static mockResults: unknown[] = [];
        public async RunView() {
            return {
                Success: true,
                Results: MockRunView.mockResults,
            };
        }
    }
    return {
        ...actual,
        RunView: MockRunView,
    };
});

describe('WatermarkService', () => {
    const mockUser = { ID: 'user-1', Email: 'test@example.com' } as unknown as UserInfo;
    const recordProcessID = 'rp-123';
    const entityID = 'entity-456';

    beforeEach(() => {
        (RunView as unknown as { mockResults: unknown[] }).mockResults = [];
    });

    it('returns shouldSkip: false when skipUnchanged is false or strategy is None', async () => {
        const records: RecordRef[] = [
            { EntityID: entityID, RecordID: 'rec-1', Record: { Name: 'Alice' } },
            { EntityID: entityID, RecordID: 'rec-2', Record: { Name: 'Bob' } },
        ];

        const decisionsNone = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID,
            entityID,
            records,
            strategy: 'None',
            skipUnchanged: true,
            contextUser: mockUser,
        });

        expect(decisionsNone.get('rec-1')?.shouldSkip).toBe(false);
        expect(decisionsNone.get('rec-2')?.shouldSkip).toBe(false);

        const decisionsDisabled = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID,
            entityID,
            records,
            strategy: 'Checksum',
            skipUnchanged: false,
            contextUser: mockUser,
        });

        expect(decisionsDisabled.get('rec-1')?.shouldSkip).toBe(false);
        expect(decisionsDisabled.get('rec-2')?.shouldSkip).toBe(false);
    });

    it('evaluates UpdatedAt strategy correctly based on timestamp comparison', async () => {
        const lastRunAt = new Date('2026-09-20T12:00:00Z');
        const records: RecordRef[] = [
            // Older than lastRunAt -> should skip
            {
                EntityID: entityID,
                RecordID: 'rec-old',
                Record: { ID: 'rec-old', __mj_UpdatedAt: new Date('2026-09-20T10:00:00Z') },
            },
            // Equal to lastRunAt -> should NOT skip (conservative boundary so records stamped in same tick are not skipped)
            {
                EntityID: entityID,
                RecordID: 'rec-equal',
                Record: { ID: 'rec-equal', __mj_UpdatedAt: new Date('2026-09-20T12:00:00Z') },
            },
            // Newer than lastRunAt -> should NOT skip
            {
                EntityID: entityID,
                RecordID: 'rec-new',
                Record: { ID: 'rec-new', __mj_UpdatedAt: new Date('2026-09-20T14:00:00Z') },
            },
            // Missing timestamp -> should NOT skip
            {
                EntityID: entityID,
                RecordID: 'rec-no-time',
                Record: { ID: 'rec-no-time' },
            },
        ];

        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID,
            entityID,
            records,
            strategy: 'UpdatedAt',
            skipUnchanged: true,
            lastRunAt,
            contextUser: mockUser,
        });

        expect(decisions.get('rec-old')?.shouldSkip).toBe(true);
        expect(decisions.get('rec-equal')?.shouldSkip).toBe(false);
        expect(decisions.get('rec-new')?.shouldSkip).toBe(false);
        expect(decisions.get('rec-no-time')?.shouldSkip).toBe(false);
    });

    it('evaluates Checksum strategy: skips unchanged row and processes changed row', async () => {
        const recordUnchanged: RecordRef = {
            EntityID: entityID,
            RecordID: 'rec-1',
            Record: { ID: 'rec-1', Title: 'Senior Software Engineer' },
        };
        const recordChanged: RecordRef = {
            EntityID: entityID,
            RecordID: 'rec-2',
            Record: { ID: 'rec-2', Title: 'Staff Engineer' },
        };

        // Compute what hash rec-1 and rec-2 produce
        const expectedHashRec1 = await WatermarkService.Instance.computeRecordBasisHash(
            recordUnchanged,
            undefined,
            { contextUser: mockUser, provider: {} as unknown as IMetadataProvider }
        );
        const expectedHashRec2 = await WatermarkService.Instance.computeRecordBasisHash(
            recordChanged,
            undefined,
            { contextUser: mockUser, provider: {} as unknown as IMetadataProvider }
        );
        expect(expectedHashRec1).toBeDefined();
        expect(expectedHashRec2).toBeDefined();
        expect(expectedHashRec2).not.toBe(expectedHashRec1);

        // Mock RunView returning existing watermark for rec-1 matching hash, and rec-2 with stale hash
        (RunView as unknown as { mockResults: unknown[] }).mockResults = [
            {
                RecordProcessID: recordProcessID,
                EntityID: entityID,
                RecordID: 'rec-1',
                Hash: expectedHashRec1,
            },
            {
                RecordProcessID: recordProcessID,
                EntityID: entityID,
                RecordID: 'rec-2',
                Hash: 'stale-hash-from-old-run',
            },
        ];

        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID,
            entityID,
            records: [recordUnchanged, recordChanged],
            strategy: 'Checksum',
            skipUnchanged: true,
            contextUser: mockUser,
        });

        expect(decisions.get('rec-1')?.shouldSkip).toBe(true);
        expect(decisions.get('rec-1')?.basisHash).toBe(expectedHashRec1);

        expect(decisions.get('rec-2')?.shouldSkip).toBe(false);
        expect(decisions.get('rec-2')?.basisHash).not.toBe('stale-hash-from-old-run');
    });

    it('finds a watermark the database returns with an upper-case UUID for a record scoped with a lower-case one', async () => {
        const scoped: RecordRef = { EntityID: entityID, RecordID: '5a5a0001-0000-4000-8000-000000000015', Record: { ID: '5a5a0001-0000-4000-8000-000000000015', Title: 'x' } };
        const hash = await WatermarkService.Instance.computeRecordBasisHash(scoped, undefined, { contextUser: mockUser, provider: new EntitiesOnlyProvider([]) });
        expect(hash).toBeTruthy();
        const row: Pick<MJRecordProcessWatermarkEntity, 'RecordProcessID' | 'EntityID' | 'RecordID' | 'Hash'> = {
            RecordProcessID: recordProcessID, EntityID: entityID, RecordID: '5A5A0001-0000-4000-8000-000000000015', Hash: hash || '',
        };
        const loaded: RunViewResult<Pick<MJRecordProcessWatermarkEntity, 'RecordProcessID' | 'EntityID' | 'RecordID' | 'Hash'>> = {
            Success: true, Results: [row], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '',
        };
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(loaded);
        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID, entityID, records: [scoped], strategy: 'Checksum', skipUnchanged: true, contextUser: mockUser,
        });
        expect(decisions.get(scoped.RecordID)?.shouldSkip).toBe(true);
    });

    it('delegates basis hash computation to processor.ComputeBasisHash if supported', async () => {
        const customHash = 'custom-rendered-context-hash-12345';
        const mockProcessor = {
            ProcessRecord: vi.fn(),
            ComputeBasisHash: vi.fn().mockResolvedValue(customHash),
        };

        const record: RecordRef = {
            EntityID: entityID,
            RecordID: 'rec-1',
            Record: { Title: 'Nurse' },
        };

        (RunView as unknown as { mockResults: unknown[] }).mockResults = [
            {
                RecordProcessID: recordProcessID,
                EntityID: entityID,
                RecordID: 'rec-1',
                Hash: customHash,
            },
        ];

        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({
            recordProcessID,
            entityID,
            records: [record],
            strategy: 'Checksum',
            skipUnchanged: true,
            processor: mockProcessor,
            contextUser: mockUser,
        });

        expect(mockProcessor.ComputeBasisHash).toHaveBeenCalledWith(
            record,
            expect.objectContaining({ contextUser: mockUser })
        );
        expect(decisions.get('rec-1')?.shouldSkip).toBe(true);
        expect(decisions.get('rec-1')?.basisHash).toBe(customHash);
    });

    it('hands the processor the run\'s pipeline and entity when it computes a basis hash', async () => {
        const mockProcessor = { ProcessRecord: vi.fn(), ComputeBasisHash: vi.fn().mockResolvedValue('h') };
        const record: RecordRef = { EntityID: entityID, RecordID: 'rec-1', Record: { Title: 'Nurse' } };
        const base = { recordProcessID, entityID, records: [record], strategy: 'Checksum' as const, skipUnchanged: true, processor: mockProcessor, contextUser: mockUser };
        await WatermarkService.Instance.CheckBatchWatermarks(base);
        expect(mockProcessor.ComputeBasisHash.mock.calls[0][1]).toMatchObject({ recordProcessID, entityID });
    });

    it('integrates with RecordSetProcessor: skips unchanged records without calling processor', async () => {
        const customHash = 'hash-match-123';
        const mockProcessor: IRecordProcessor = {
            ProcessRecord: vi.fn().mockResolvedValue({ Status: 'Succeeded', ResultPayload: { ok: true } } as RecordResult),
        };
        // Augment with ComputeBasisHash
        (mockProcessor as unknown as { ComputeBasisHash: (r: RecordRef) => Promise<string> }).ComputeBasisHash = vi
            .fn()
            .mockImplementation(async (r: RecordRef) => (r.RecordID === 'rec-skip' ? customHash : 'hash-new'));

        (RunView as unknown as { mockResults: unknown[] }).mockResults = [
            {
                RecordProcessID: recordProcessID,
                EntityID: entityID,
                RecordID: 'rec-skip',
                Hash: customHash,
                Save: vi.fn().mockResolvedValue(true),
            },
        ];

        const records: RecordRef[] = [
            { EntityID: entityID, RecordID: 'rec-skip', Record: { Name: 'Unchanged' } },
            { EntityID: entityID, RecordID: 'rec-run', Record: { Name: 'Changed' } },
        ];

        const source = new ArraySource(records, entityID);
        const result = await RecordSetProcessor.Instance.Process({
            source,
            processor: mockProcessor,
            tracker: new NoOpTracker(),
            contextUser: mockUser,
            recordProcessID,
            entityID,
            skipUnchanged: true,
            watermarkStrategy: 'Checksum',
        });

        expect(result.Status).toBe('Completed');
        expect(result.Processed).toBe(2);
        expect(result.Skipped).toBe(1);
        expect(result.Success).toBe(1);

        // ProcessRecord was called ONLY for rec-run, NEVER for rec-skip!
        expect(mockProcessor.ProcessRecord).toHaveBeenCalledTimes(1);
        expect(mockProcessor.ProcessRecord).toHaveBeenCalledWith(
            expect.objectContaining({ RecordID: 'rec-run' }),
            expect.anything()
        );
    });
});

describe('WatermarkService: a run that overwrites human values', () => {
    const user = new UserInfo();
    const recordProcessID = 'rp-out';
    const entityID = 'entity-out';
    const kept: RecordRef = { EntityID: entityID, RecordID: 'rec-kept', Record: { Title: 'Nurse' } };
    const other: RecordRef = { EntityID: entityID, RecordID: 'rec-other', Record: { Title: 'Surgeon' } };
    /** The stored watermarks: both records match their hash. */
    const watermarks = (): Array<{ RecordID: string; Hash: string; Save: () => Promise<boolean> }> => [
        { RecordID: 'rec-kept', Hash: 'hash-rec-kept', Save: vi.fn(async () => true) },
        { RecordID: 'rec-other', Hash: 'hash-rec-other', Save: vi.fn(async () => true) },
    ];

    /** A processor whose basis hash is `hash-<RecordID>`. */
    function hashingProcessor() {
        return {
            ProcessRecord: vi.fn(async (_r: RecordRef): Promise<RecordResult> => ({ Status: 'Succeeded' })),
            ComputeBasisHash: vi.fn(async (r: RecordRef) => `hash-${r.RecordID}`),
        };
    }

    /** Serves the stored watermarks to the service's watermark read (the mocked RunView). */
    function serve(rows: ReturnType<typeof watermarks>): void {
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' });
    }

    beforeEach(() => serve(watermarks()));
    afterEach(() => vi.restoreAllMocks());

    it('processes every unchanged record, keeping each hash so its watermark is refreshed', async () => {
        const processor = hashingProcessor();
        const params = { recordProcessID, entityID, records: [kept, other], strategy: 'Checksum' as const, skipUnchanged: true, processor, contextUser: user };
        expect((await WatermarkService.Instance.CheckBatchWatermarks(params)).get('rec-kept')?.shouldSkip).toBe(true);
        const decisions = await WatermarkService.Instance.CheckBatchWatermarks({ ...params, OverwriteHumanValues: true });
        expect(decisions.get('rec-kept')).toMatchObject({ shouldSkip: false, basisHash: 'hash-rec-kept' });
        expect(decisions.get('rec-other')).toMatchObject({ shouldSkip: false, basisHash: 'hash-rec-other' });
    });

    it('integrates with RecordSetProcessor: the unchanged record is processed and its watermark refreshed', async () => {
        const stored = watermarks();
        serve(stored);
        const processor = hashingProcessor();
        const result = await RecordSetProcessor.Instance.Process({
            source: new ArraySource([kept], entityID), processor, tracker: new NoOpTracker(), contextUser: user,
            recordProcessID, entityID, skipUnchanged: true, watermarkStrategy: 'Checksum', overwriteHumanValues: true,
        });
        expect(result.Skipped).toBe(0);
        expect(result.Success).toBe(1);
        expect(processor.ProcessRecord).toHaveBeenCalledTimes(1);
        expect(stored[0].Save).toHaveBeenCalledTimes(1);
        expect(stored[0].Hash).toBe('hash-rec-kept');
    });
});

describe('RecordSetProcessor: a real run that does not skip refreshes its watermarks', () => {
    const user = new UserInfo();
    const recordProcessID = 'rp-refresh';
    const entityID = 'entity-refresh';
    const matched: RecordRef = { EntityID: entityID, RecordID: 'rec-matched', Record: { Title: 'Nurse' } };
    const stale: RecordRef = { EntityID: entityID, RecordID: 'rec-stale', Record: { Title: 'Surgeon' } };
    const fresh: RecordRef = { EntityID: entityID, RecordID: 'rec-fresh', Record: { Title: 'Porter' } };
    const failing: RecordRef = { EntityID: entityID, RecordID: 'rec-failing', Record: { Title: 'Clerk' } };
    const records = [matched, stale, fresh, failing];

    /** A stored watermark row, as the service's batch read returns it. */
    type StoredWatermark = { RecordID: string; Hash: string };
    /** The watermark store both runs share: read by the mocked RunView, written by the spied UpdateWatermark. */
    let store: Map<string, StoredWatermark>;
    let reads: MockInstance<RunView['RunView']>;
    let writes: MockInstance<WatermarkService['UpdateWatermark']>;
    /** The record IDs the run handed to its processor, by either path. */
    let handed: string[];

    /** Succeeds every record but the failing one (one `ProcessBatch` call, or one `ProcessRecord` call per record). */
    function outcome(r: RecordRef): RecordResult {
        handed.push(r.RecordID);
        return r.RecordID === failing.RecordID ? { Status: 'Failed', ErrorMessage: 'model refused' } : { Status: 'Succeeded' };
    }
    function batchProcessor() {
        return {
            ProcessRecord: vi.fn(async (r: RecordRef): Promise<RecordResult> => outcome(r)),
            ProcessBatch: vi.fn(async (rs: RecordRef[]): Promise<Map<string, RecordResult>> => new Map(rs.map((r) => [r.RecordID, outcome(r)]))),
            ComputeBasisHash: vi.fn(async (r: RecordRef): Promise<string | undefined> => `hash-${r.RecordID}`),
        };
    }
    function recordProcessor() {
        return {
            ProcessRecord: vi.fn(async (r: RecordRef): Promise<RecordResult> => outcome(r)),
            ComputeBasisHash: vi.fn(async (r: RecordRef): Promise<string | undefined> => `hash-${r.RecordID}`),
        };
    }

    function run(processor: IRecordProcessor, extra: { skipUnchanged?: boolean; dryRun?: boolean; watermarkStrategy?: 'Checksum' | 'UpdatedAt' } = {}) {
        return RecordSetProcessor.Instance.Process({
            source: new ArraySource(records, entityID), processor, tracker: new NoOpTracker(), contextUser: user,
            recordProcessID, entityID, skipUnchanged: extra.skipUnchanged === true, dryRun: extra.dryRun,
            watermarkStrategy: extra.watermarkStrategy || 'Checksum',
        });
    }

    /** The record IDs whose watermark was written, with the hash each was written with. */
    function written(): Array<[string, string]> {
        return writes.mock.calls.map(([p]): [string, string] => [p.recordID, p.basisHash]);
    }

    beforeEach(() => {
        handed = [];
        store = new Map([
            ['rec-matched', { RecordID: 'rec-matched', Hash: 'hash-rec-matched' }],
            ['rec-stale', { RecordID: 'rec-stale', Hash: 'hash-from-the-previous-version' }],
        ]);
        reads = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => {
            const rows = [...store.values()].map((r) => ({ ...r }));
            return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
        });
        writes = vi.spyOn(WatermarkService.Instance, 'UpdateWatermark').mockImplementation(async (p) => {
            store.set(p.recordID, { RecordID: p.recordID, Hash: p.basisHash });
        });
    });
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ['ProcessBatch', batchProcessor],
        ['ProcessRecord', recordProcessor],
    ])('writes the watermark of every succeeded record with its basis hash, through one batch read (%s)', async (_path, make) => {
        const processor = make();
        const result = await run(processor);
        expect(result.Skipped).toBe(0);
        expect(result.Success).toBe(3);
        expect(handed.sort()).toEqual(['rec-failing', 'rec-fresh', 'rec-matched', 'rec-stale']);
        expect(written().sort()).toEqual([
            ['rec-fresh', 'hash-rec-fresh'], ['rec-matched', 'hash-rec-matched'], ['rec-stale', 'hash-rec-stale'],
        ]);
        expect(reads).toHaveBeenCalledTimes(1);
        const stored = writes.mock.calls.find(([p]) => p.recordID === 'rec-stale');
        expect(stored?.[0].existingWatermark).toMatchObject({ RecordID: 'rec-stale' });
    });

    it('still processes a record whose watermark matches: only a SkipUnchanged run decides to skip', async () => {
        await run(batchProcessor());
        expect(handed).toContain('rec-matched');
    });

    it('writes no watermark for a failed record', async () => {
        await run(batchProcessor());
        expect(written().map(([id]) => id)).not.toContain('rec-failing');
    });

    it('writes no watermark on a dry run, and computes no basis hash for it', async () => {
        const processor = batchProcessor();
        await run(processor, { dryRun: true });
        expect(writes).not.toHaveBeenCalled();
        expect(processor.ComputeBasisHash).not.toHaveBeenCalled();
        expect(reads).not.toHaveBeenCalled();
    });

    it('writes no watermark for a processor without a basis hash, not even a record-content one', async () => {
        const { ComputeBasisHash: _none, ...withoutHash } = batchProcessor();
        await run(withoutHash);
        expect(writes).not.toHaveBeenCalled();
        expect(reads).not.toHaveBeenCalled();
    });

    it('lets the following SkipUnchanged run skip every record it wrote', async () => {
        await run(batchProcessor());
        handed = [];
        const result = await run(batchProcessor(), { skipUnchanged: true });
        expect(result.Skipped).toBe(3);
        expect(handed).toEqual(['rec-failing']);
    });
});
