import type { IMetadataProvider } from '@memberjunction/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordCloneService } from './record-clone.service';
import {
    RecordCloneDescribeOperation,
    RecordClonePlanOperation,
    RecordCloneExecuteOperation,
    RecordCloneGetLineageOperation,
    type RecordCloneDescribeOutput,
    type RecordClonePlanOutput,
    type RecordCloneExecuteOutput,
    type RecordCloneGetLineageOutput,
} from '@memberjunction/core-entities';

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        RecordCloneDescribeOperation: vi.fn(),
        RecordClonePlanOperation: vi.fn(),
        RecordCloneExecuteOperation: vi.fn(),
        RecordCloneGetLineageOperation: vi.fn(),
    };
});

describe('RecordCloneService', () => {
    let service: RecordCloneService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new RecordCloneService();
    });

    it('caches Describe results for generic entity queries', async () => {
        const mockDescribeOutput: RecordCloneDescribeOutput = {
            CanClone: true,
            Relationships: [],
            Presets: ['minimal', 'full'],
        };

        const mockExecute = vi.fn().mockResolvedValue({
            Success: true,
            Output: mockDescribeOutput,
        });

        vi.mocked(RecordCloneDescribeOperation).mockImplementation(function() {
            return {
                Execute: mockExecute,
            } as unknown as RecordCloneDescribeOperation;
        });

        // First call - invokes operation
        const result1 = await service.DescribeRecord({ EntityName: 'Users' });
        expect(result1).toEqual(mockDescribeOutput);
        expect(mockExecute).toHaveBeenCalledTimes(1);

        // Second call - served from cache
        const result2 = await service.DescribeRecord({ EntityName: 'users' }); // case-insensitive check
        expect(result2).toEqual(mockDescribeOutput);
        expect(mockExecute).toHaveBeenCalledTimes(1); // not called again

        // Force refresh call - calls operation again
        const result3 = await service.DescribeRecord({ EntityName: 'Users' }, null, true);
        expect(result3).toEqual(mockDescribeOutput);
        expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('does not cache Describe when specific record key is provided', async () => {
        const mockDescribeOutput: RecordCloneDescribeOutput = {
            CanClone: true,
            Relationships: [],
        };

        const mockExecute = vi.fn().mockResolvedValue({
            Success: true,
            Output: mockDescribeOutput,
        });

        vi.mocked(RecordCloneDescribeOperation).mockImplementation(function() {
            return {
                Execute: mockExecute,
            } as unknown as RecordCloneDescribeOperation;
        });

        await service.DescribeRecord({
            EntityName: 'Users',
            Key: { KeyValuePairs: [{ FieldName: 'ID', Value: 'u-1' }] },
        });

        await service.DescribeRecord({
            EntityName: 'Users',
            Key: { KeyValuePairs: [{ FieldName: 'ID', Value: 'u-1' }] },
        });

        expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('delegates PlanClone to RecordClonePlanOperation', async () => {
        const mockPlanOutput: RecordClonePlanOutput = {
            Plan: {
                PlanVersion: 1,
                Hash: 'hash-123',
                Roots: ['root-1'],
                Nodes: [],
                Edges: [],
                Counts: { ByEntity: {}, Create: 1, Total: 1 },
                Warnings: [],
                Blocked: false,
                EffectiveOptions: {
                    MaxDepth: 3,
                    MaxRecords: 500,
                    Subtypes: 'include',
                    Hierarchy: 'subtree',
                    SoftLinks: 'skip',
                    EntityActions: 'suppress',
                    AIActions: 'suppress',
                    Embeddings: 'copy',
                },
            },
        };

        const mockExecute = vi.fn().mockResolvedValue({
            Success: true,
            Output: mockPlanOutput,
        });

        vi.mocked(RecordClonePlanOperation).mockImplementation(function() {
            return {
                Execute: mockExecute,
            } as unknown as RecordClonePlanOperation;
        });

        const result = await service.PlanClone({ EntityName: 'Users' });
        expect(result).toEqual(mockPlanOutput);
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('delegates ExecuteClone to RecordCloneExecuteOperation', async () => {
        const mockExecuteOutput: RecordCloneExecuteOutput = {
            Success: true,
            ResultCode: 'SUCCESS',
            CloneLogID: 'log-123',
            Roots: [{ EntityName: 'Users', SourceKey: 'src-1', TargetKey: 'tgt-1' }],
            Created: [],
            Skipped: [],
            Counts: { ByEntity: {}, Create: 1, Total: 1 },
            Warnings: [],
        };

        const mockExecute = vi.fn().mockResolvedValue({
            Success: true,
            Output: mockExecuteOutput,
        });

        vi.mocked(RecordCloneExecuteOperation).mockImplementation(function() {
            return {
                Execute: mockExecute,
            } as unknown as RecordCloneExecuteOperation;
        });

        const result = await service.ExecuteClone({ EntityName: 'Users' });
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('delegates GetLineage to RecordCloneGetLineageOperation', async () => {
        const mockLineageOutput: RecordCloneGetLineageOutput = {
            Ancestors: [{ EntityName: 'Users', RecordID: 'src-0', DisplayName: 'Original User' }],
            Clones: [{ EntityName: 'Users', RecordID: 'src-2', DisplayName: 'Clone User' }],
            TotalClones: 1,
        };

        const mockExecute = vi.fn().mockResolvedValue({
            Success: true,
            Output: mockLineageOutput,
        });

        vi.mocked(RecordCloneGetLineageOperation).mockImplementation(function() {
            return {
                Execute: mockExecute,
            } as unknown as RecordCloneGetLineageOperation;
        });

        const result = await service.GetLineage({
            EntityName: 'Users',
            Key: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] },
        });

        expect(result.Ancestors.length).toBe(1);
        expect(result.Clones.length).toBe(1);
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('clears Describe cache selectively and fully', async () => {
        const mockExecute = vi.fn().mockResolvedValue({
            Success: true,
            Output: { CanClone: true, Relationships: [] },
        });

        vi.mocked(RecordCloneDescribeOperation).mockImplementation(function() {
            return {
                Execute: mockExecute,
            } as unknown as RecordCloneDescribeOperation;
        });

        await service.DescribeRecord({ EntityName: 'Users' });
        await service.DescribeRecord({ EntityName: 'Roles' });
        expect(mockExecute).toHaveBeenCalledTimes(2);

        // Clear only Users
        service.ClearDescribeCache('Users');
        await service.DescribeRecord({ EntityName: 'Roles' });
        expect(mockExecute).toHaveBeenCalledTimes(2); // Roles still cached

        await service.DescribeRecord({ EntityName: 'Users' });
        expect(mockExecute).toHaveBeenCalledTimes(3); // Users refetched

        // Clear all
        service.ClearDescribeCache();
        await service.DescribeRecord({ EntityName: 'Roles' });
        expect(mockExecute).toHaveBeenCalledTimes(4); // Roles refetched
    });

    it('keeps a separate Describe cache per provider and shares one request between concurrent callers', async () => {
        const mockExecute = vi.fn().mockResolvedValue({ Success: true, Output: { CanClone: true, Relationships: [] } });
        vi.mocked(RecordCloneDescribeOperation).mockImplementation(function() {
            return { Execute: mockExecute } as unknown as RecordCloneDescribeOperation;
        });
        const providerA = {} as IMetadataProvider;
        const providerB = {} as IMetadataProvider;

        await Promise.all([
            service.DescribeRecord({ EntityName: 'Users' }, providerA),
            service.DescribeRecord({ EntityName: 'Users' }, providerA),
        ]);
        expect(mockExecute).toHaveBeenCalledTimes(1);

        await service.DescribeRecord({ EntityName: 'Users' }, providerB);
        expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed Describe', async () => {
        const mockExecute = vi.fn()
            .mockResolvedValueOnce({ Success: false, ErrorMessage: 'offline' })
            .mockResolvedValueOnce({ Success: true, Output: { CanClone: true, Relationships: [] } });
        vi.mocked(RecordCloneDescribeOperation).mockImplementation(function() {
            return { Execute: mockExecute } as unknown as RecordCloneDescribeOperation;
        });

        await expect(service.DescribeRecord({ EntityName: 'Users' })).rejects.toThrow('offline');
        await expect(service.DescribeRecord({ EntityName: 'Users' })).resolves.toMatchObject({ CanClone: true });
        expect(mockExecute).toHaveBeenCalledTimes(2);
    });
});
