import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DuplicateDetectionOptions, DuplicateDetectionProgress, PotentialDuplicateRequest } from '@memberjunction/core';

const publishMock = vi.fn();
const globalStore: Record<string, unknown> = {
    ___SINGLETON__PubSubManager: {
        Publish: (...args: unknown[]) => publishMock(...args),
    },
};

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        GetGlobalObjectStore: () => globalStore,
    };
});

const runViewMock = vi.fn();
const logErrorMock = vi.fn();
const logStatusMock = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => logErrorMock(...args),
        LogStatus: (...args: unknown[]) => logStatusMock(...args),
    };
});

const superSaveMock = vi.fn(async () => true);
const loadMock = vi.fn(async () => true);

vi.mock('@memberjunction/core-entities', () => {
    class MockMJDuplicateRunEntity {
        public ID = 'run-1';
        public EntityID = 'entity-1';
        public SourceListID: string | null = null;
        public EndedAt: Date | null = null;
        public ProcessingStatus: 'Complete' | 'Failed' | 'In Progress' | 'Pending' = 'In Progress';
        public ProcessingErrorMessage: string | null = null;
        public ContextCurrentUser: unknown = { ID: 'user-1' };
        public ProviderToUse: unknown = {};
        public get RunViewProviderToUse(): { RunView: (...args: unknown[]) => unknown } {
            return { RunView: (...args: unknown[]) => runViewMock(...args) };
        }
        public async Save(options?: unknown): Promise<boolean> {
            return superSaveMock(options);
        }
        public async Load(id: string): Promise<boolean> {
            return loadMock(id);
        }
    }
    return {
        MJDuplicateRunEntity: MockMJDuplicateRunEntity,
        MJEntityDocumentEntity: class {},
    };
});

const getDuplicateRecordsMock = vi.fn();
vi.mock('@memberjunction/ai-vector-dupe', () => ({
    DuplicateRecordDetector: class {
        public GetDuplicateRecords(req: PotentialDuplicateRequest, user: unknown): Promise<unknown> {
            return getDuplicateRecordsMock(req, user);
        }
    },
}));

import { MJDuplicateRunEntityServer, PickDuplicateDetectionDocument } from '../custom/MJDuplicateRunEntityServer.server';

describe('PickDuplicateDetectionDocument', () => {
    it('prefers a Record Duplicate document over a newer Search document', () => {
        const picked = PickDuplicateDetectionDocument([
            { ID: 'search-doc', Type: 'Search' },
            { ID: 'dupe-doc', Type: 'Record Duplicate' },
        ]);
        expect(picked?.ID).toBe('dupe-doc');
    });

    it('takes the newest of several Record Duplicate documents (the list is newest first)', () => {
        const picked = PickDuplicateDetectionDocument([
            { ID: 'newer', Type: 'Record Duplicate' },
            { ID: 'older', Type: 'Record Duplicate' },
        ]);
        expect(picked?.ID).toBe('newer');
    });

    it('falls back to the newest document of any type when none is Record Duplicate', () => {
        const picked = PickDuplicateDetectionDocument([
            { ID: 'search-newest', Type: 'Search' },
            { ID: 'search-older', Type: 'Search' },
        ]);
        expect(picked?.ID).toBe('search-newest');
    });

    it('returns null when the entity has no active document', () => {
        expect(PickDuplicateDetectionDocument([])).toBeNull();
    });
});

describe('MJDuplicateRunEntityServer', () => {
    beforeEach(() => {
        publishMock.mockReset();
        runViewMock.mockReset();
        logErrorMock.mockReset();
        logStatusMock.mockReset();
        superSaveMock.mockClear();
        loadMock.mockClear();
        getDuplicateRecordsMock.mockReset();
        delete globalStore['___MJDuplicateRunDetectionInFlight'];
    });

    it('marks run as Failed with ProcessingErrorMessage and emits error when detector returns Status === Error', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'doc-1', PotentialMatchThreshold: 0.75, AbsoluteMatchThreshold: 0.92 }],
        });
        getDuplicateRecordsMock.mockResolvedValue({
            Status: 'Error',
            ErrorMessage: 'No active Entity Document found for ID doc-1',
            PotentialDuplicateResult: [],
        });

        const run = new MJDuplicateRunEntityServer();
        await (run as unknown as { runDetectionAsync: () => Promise<void> }).runDetectionAsync();

        expect(run.ProcessingStatus).toBe('Failed');
        expect(run.ProcessingErrorMessage).toBe('No active Entity Document found for ID doc-1');
        expect(run.EndedAt).toBeInstanceOf(Date);
        expect(loadMock).toHaveBeenCalledWith('run-1');
        expect(superSaveMock).toHaveBeenCalledTimes(1);

        const publishedPayloads = publishMock.mock.calls.map(c => c[1] as { Stage: string; CurrentItem?: string });
        expect(publishedPayloads[publishedPayloads.length - 1]).toMatchObject({
            Stage: 'error',
            CurrentItem: 'No active Entity Document found for ID doc-1',
        });
    });

    it('runs on the Record Duplicate document and its thresholds even when a Search document is newer', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [
                { ID: 'search-doc', Type: 'Search', PotentialMatchThreshold: 0.5, AbsoluteMatchThreshold: 0.6 },
                { ID: 'dupe-doc', Type: 'Record Duplicate', PotentialMatchThreshold: 0.94, AbsoluteMatchThreshold: 0.97 },
            ],
        });
        getDuplicateRecordsMock.mockResolvedValue({ Status: 'Success', PotentialDuplicateResult: [] });

        const run = new MJDuplicateRunEntityServer();
        await (run as unknown as { runDetectionAsync: () => Promise<void> }).runDetectionAsync();

        const request = getDuplicateRecordsMock.mock.calls[0][0] as PotentialDuplicateRequest;
        const options = request.Options as DuplicateDetectionOptions;
        expect(request.EntityDocumentID).toBe('dupe-doc');
        expect(options.PotentialMatchThreshold).toBe(0.94);
        expect(options.AbsoluteMatchThreshold).toBe(0.97);
    });

    it('maps Embedding and Querying to extract and Matching/Merging to autotag without premature complete', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [{ ID: 'doc-1', PotentialMatchThreshold: 0.70, AbsoluteMatchThreshold: 0.95 }],
        });

        getDuplicateRecordsMock.mockImplementation(async (req: PotentialDuplicateRequest) => {
            const onProgress = (req.Options as DuplicateDetectionOptions).OnProgress!;
            const phases: Array<DuplicateDetectionProgress['Phase']> = [
                'Loading',
                'Embedding',
                'Querying',
                'Matching',
                'Merging',
            ];
            phases.forEach((phase, idx) => {
                onProgress({
                    Phase: phase,
                    TotalRecords: 10,
                    ProcessedRecords: idx + 1,
                    MatchesFound: 0,
                    ElapsedMs: 100,
                });
            });
            return { Status: 'Success', PotentialDuplicateResult: [] };
        });

        const run = new MJDuplicateRunEntityServer();
        await (run as unknown as { runDetectionAsync: () => Promise<void> }).runDetectionAsync();

        const stages = publishMock.mock.calls.map(c => (c[1] as { Stage: string }).Stage);
        // Initial 'extract', then Loading('extract'), Embedding('extract'), Querying('extract'),
        // Matching('autotag'), Merging('autotag'), and finally terminal 'complete'
        expect(stages).toEqual([
            'extract',
            'extract',
            'extract',
            'extract',
            'autotag',
            'autotag',
            'complete',
        ]);
    });
});
