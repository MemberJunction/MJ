import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for ScheduledJobService caching, loading, and delegation logic.
 */

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
}));

// Shared mock for RunView.RunView method — we reassign per test
const mockRunViewMethod = vi.fn();
// Shared mock for entity Load
const mockEntityLoad = vi.fn().mockResolvedValue(true);

vi.mock('@memberjunction/core', () => {
    const MockMetadata: any = function Metadata() {
        return {
            GetEntityObject: vi.fn().mockResolvedValue({
                Load: mockEntityLoad,
                ID: 'job-001',
                Name: 'Test Job',
            }),
            Entities: [],
        };
    };
    // Add static Provider for the migration's `?? Metadata.Provider` fallback in services.
    // Use a getter for GetEntityObject so we don't reference top-level let/const variables
    // at vi.mock factory hoist time.
    MockMetadata.Provider = {
        Entities: [],
        GetEntityObject(..._args: unknown[]) {
            return Promise.resolve({
                Load: mockEntityLoad,
                ID: 'job-001',
                Name: 'Test Job',
            });
        },
    };
    const MockRunView: any = function RunView() { return { RunView: mockRunViewMethod }; };
    // Multi-provider migration: services now use RunView.FromMetadataProvider(...) instead of `new RunView()`.
    MockRunView.FromMetadataProvider = (_p: unknown) => ({ RunView: mockRunViewMethod });
    return { Metadata: MockMetadata, RunView: MockRunView };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobTypeEntity: class {},
    MJScheduledJobRunEntity: class {},
}));

import { ScheduledJobService } from '../lib/services/scheduled-job.service';

describe('ScheduledJobService', () => {
    let service: ScheduledJobService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockEntityLoad.mockResolvedValue(true);
        service = new ScheduledJobService();
    });

    describe('initial state', () => {
        it('should have empty JobTypes initially', () => {
            expect(service.JobTypes).toEqual([]);
        });
    });

    describe('LoadJobTypes', () => {
        it('should load job types from RunView on first call', async () => {
            const mockTypes = [{ ID: 't1', Name: 'Type A' }, { ID: 't2', Name: 'Type B' }];
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: mockTypes });

            const result = await service.LoadJobTypes();
            expect(result).toEqual(mockTypes);
            expect(service.JobTypes).toEqual(mockTypes);
            expect(mockRunViewMethod).toHaveBeenCalledTimes(1);
        });

        it('should return cached data on subsequent calls without re-fetching', async () => {
            const mockTypes = [{ ID: 't1', Name: 'Type A' }];
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: mockTypes });

            await service.LoadJobTypes();
            const result2 = await service.LoadJobTypes();
            expect(result2).toEqual(mockTypes);
            expect(mockRunViewMethod).toHaveBeenCalledTimes(1);
        });

        it('should deduplicate concurrent calls (promise sharing)', async () => {
            const mockTypes = [{ ID: 't1', Name: 'Type A' }];
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: mockTypes });

            const [r1, r2] = await Promise.all([service.LoadJobTypes(), service.LoadJobTypes()]);
            expect(r1).toEqual(mockTypes);
            expect(r2).toEqual(mockTypes);
            expect(mockRunViewMethod).toHaveBeenCalledTimes(1);
        });

        it('should return empty array when RunView fails', async () => {
            mockRunViewMethod.mockResolvedValue({ Success: false, Results: [] });
            const result = await service.LoadJobTypes();
            expect(result).toEqual([]);
        });

        it('should call RunView with correct params', async () => {
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: [] });
            await service.LoadJobTypes();
            expect(mockRunViewMethod).toHaveBeenCalledWith(expect.objectContaining({
                EntityName: 'MJ: Scheduled Job Types',
                OrderBy: 'Name',
                ResultType: 'entity_object',
            }));
        });
    });

    describe('ClearCache', () => {
        it('should clear cached job types', async () => {
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: [{ ID: 't1' }] });
            await service.LoadJobTypes();
            expect(service.JobTypes).toHaveLength(1);

            service.ClearCache();
            expect(service.JobTypes).toEqual([]);
        });

        it('should force re-fetch after clear', async () => {
            mockRunViewMethod
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 't1' }] })
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 't1' }, { ID: 't2' }] });

            await service.LoadJobTypes();
            service.ClearCache();
            await service.LoadJobTypes();

            expect(service.JobTypes).toHaveLength(2);
            expect(mockRunViewMethod).toHaveBeenCalledTimes(2);
        });
    });

    describe('LoadJob', () => {
        it('should load a single job by ID', async () => {
            const result = await service.LoadJob('job-001');
            expect(result).not.toBeNull();
        });

        it('should return null when job load fails', async () => {
            mockEntityLoad.mockResolvedValueOnce(false);
            const result = await service.LoadJob('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('LoadJobRuns', () => {
        it('should load runs with correct filter and ordering', async () => {
            const mockRuns = [{ ID: 'run-1' }, { ID: 'run-2' }];
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: mockRuns });

            const result = await service.LoadJobRuns('job-001');
            expect(result).toEqual(mockRuns);
            expect(mockRunViewMethod).toHaveBeenCalledWith(expect.objectContaining({
                EntityName: 'MJ: Scheduled Job Runs',
                ExtraFilter: "ScheduledJobID='job-001'",
                OrderBy: 'StartedAt DESC',
                MaxRows: 10,
            }));
        });

        it('should respect custom maxRows', async () => {
            mockRunViewMethod.mockResolvedValue({ Success: true, Results: [] });
            await service.LoadJobRuns('job-001', 25);
            expect(mockRunViewMethod).toHaveBeenCalledWith(expect.objectContaining({ MaxRows: 25 }));
        });

        it('should return empty array on failure', async () => {
            mockRunViewMethod.mockResolvedValue({ Success: false, Results: [] });
            const result = await service.LoadJobRuns('job-001');
            expect(result).toEqual([]);
        });
    });
});
