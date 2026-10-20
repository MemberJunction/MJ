import { describe, it, expect, vi } from 'vitest';
import {
    EntityInfo,
    EntityFieldInfo,
    IMetadataProvider,
    UserInfo,
} from '@memberjunction/core';
import { RecordProcessorRegistry, RecordProcessorContext } from '@memberjunction/record-set-processor-base';
import { CloneRecordProcessor, RegisterCloneRecordProcessor } from '../CloneRecordProcessor';
import { ClonePlanner } from '../ClonePlanner';
import { CloneExecutor } from '../CloneExecutor';
import { RecordCloningStartup } from '../RecordCloningStartup';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

describe('CloneRecordProcessor', () => {
    const mockUser: UserInfo = {
        ID: 'u-1',
        Name: 'Test User',
    } as UserInfo;

    const mockEntity: Partial<EntityInfo> = {
        ID: 'ent-1',
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true } as EntityFieldInfo],
        RelatedEntities: [],
    };

    const mockProvider: IMetadataProvider = {
        Authorizations: GrantedCloneAuthorizations(),
        Entities: [mockEntity as EntityInfo],
        EntityByName: (n: string) => (n === 'TestEntity' ? (mockEntity as EntityInfo) : null),
        EntityByID: (id: string) => (id === 'ent-1' ? (mockEntity as EntityInfo) : null),
    } as unknown as IMetadataProvider;

    it('processes record in dry run mode returning plan summary without executing', async () => {
        const processor = new CloneRecordProcessor({ DryRun: true });

        const mockPlan = {
            RootEntityName: 'TestEntity',
            RootSourceKey: 'rec-1',
            RootTargetKey: 'rec-clone-1',
            PlanHash: 'hash-abc',
            Blocked: false,
            Warnings: [],
            Nodes: [
                {
                    NodeKey: 'n-1',
                    EntityName: 'TestEntity',
                    SourceKey: 'rec-1',
                    TargetKey: 'rec-clone-1',
                    Action: 'Create' as const,
                    Depth: 0,
                    Blocked: false,
                    Route: 'RootSave' as const,
                    FieldChanges: [],
                },
            ],
            Edges: [],
            Excluded: [],
        };

        vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(mockPlan);
        const execSpy = vi.spyOn(CloneExecutor.prototype, 'Execute');

        const result = await processor.ProcessRecord(
            { EntityID: 'ent-1', RecordID: 'rec-1' },
            { provider: mockProvider, contextUser: mockUser } as RecordProcessorContext
        );

        expect(result.Status).toBe('Succeeded');
        expect(result.ResultPayload?.['DryRun']).toBe(true);
        expect(result.ResultPayload?.['NodesCount']).toBe(1);
        expect(execSpy).not.toHaveBeenCalled();
    });

    it('processes record in execute mode calling CloneExecutor', async () => {
        const processor = new CloneRecordProcessor({ DryRun: false });

        const mockPlan = {
            RootEntityName: 'TestEntity',
            RootSourceKey: 'rec-1',
            RootTargetKey: 'rec-clone-1',
            PlanHash: 'hash-abc',
            Blocked: false,
            Warnings: [],
            Nodes: [],
            Edges: [],
            Excluded: [],
        };

        vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(mockPlan);
        vi.spyOn(CloneExecutor.prototype, 'Execute').mockResolvedValue({
            Success: true,
            RootRecordKey: 'rec-clone-1',
            RecordsCloned: 1,
            CloneLogID: 'log-123',
            Warnings: [],
        });

        const result = await processor.ProcessRecord(
            { EntityID: 'ent-1', RecordID: 'rec-1' },
            { provider: mockProvider, contextUser: mockUser } as RecordProcessorContext
        );

        expect(result.Status).toBe('Succeeded');
        expect(result.ResultPayload?.['DryRun']).toBe(false);
        expect(result.ResultPayload?.['NewRecordID']).toBe('rec-clone-1');
        expect(result.ResultPayload?.['RecordsCloned']).toBe(1);
    });

    it('registers into RecordProcessorRegistry under WorkType = Clone', () => {
        RegisterCloneRecordProcessor();
        expect(RecordProcessorRegistry.Instance.Has('Clone')).toBe(true);
        const instance = RecordProcessorRegistry.Instance.Resolve({ WorkType: 'Clone' });
        expect(instance).toBeDefined();
        expect(instance instanceof CloneRecordProcessor).toBe(true);
    });

    it('refuses without the Clone Records: Batch authorization', async () => {
        const plan = vi.spyOn(ClonePlanner.prototype, 'Plan');
        const callsBefore = plan.mock.calls.length;
        const noBatch = { ...mockProvider, Authorizations: GrantedCloneAuthorizations(false) } as unknown as IMetadataProvider;
        const result = await new CloneRecordProcessor().ProcessRecord(
            { EntityID: 'ent-1', RecordID: 'rec-1' } as never,
            { provider: noBatch, contextUser: mockUser } as unknown as RecordProcessorContext
        );
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toContain('Clone Records: Batch');
        expect(plan.mock.calls.length).toBe(callsBefore);
    });

    it('registers the Clone work type at startup', async () => {
        await RecordCloningStartup.Instance.HandleStartup();
        expect(RecordProcessorRegistry.Instance.Has('Clone')).toBe(true);
    });
});
