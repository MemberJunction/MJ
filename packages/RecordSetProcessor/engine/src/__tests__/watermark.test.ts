import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WatermarkService } from '../watermark/WatermarkService';
import { RecordSetProcessor } from '../RecordSetProcessor';
import { ArraySource, IRecordProcessor, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { NoOpTracker } from '../trackers/NoOpTracker';
import { UserInfo, RunView, IMetadataProvider } from '@memberjunction/core';

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

describe('WatermarkService (P1-7b)', () => {
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
