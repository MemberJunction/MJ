/**
 * The materialized graph saved for real (BaseEntity's own graph save, not a mocked Save): a flow
 * agent whose step path points at a step saved after the path's origin. The provider refuses an
 * insert whose foreign key target doesn't exist yet, as SQL Server's FK constraints do.
 */
import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityFieldInfo, EntityInfo, IEntityDataProvider, IMetadataProvider, UserInfo, ValidationResult } from '@memberjunction/core';
import { CloneMaterializer } from '../CloneMaterializer';
import type { ClonePlan } from '@memberjunction/record-cloning-base';

class TestEntity extends BaseEntity {
    protected override CheckPermissions(): boolean {
        return true;
    }
    // Save order is what's under test; the field metadata here is too thin for validation.
    public override Validate(): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }
}

const field = (Name: string, extra: Partial<EntityFieldInfo> = {}) =>
    ({ Name, CodeName: Name, IsPrimaryKey: Name === 'ID', PrimaryKey: Name === 'ID', Type: Name.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', AllowsNull: true, IsVirtual: false, ...extra }) as unknown as EntityFieldInfo;
const entity = (ID: string, Name: string, fields: string[]) =>
    ({ ID, Name, PrimaryKeys: [field('ID')], FirstPrimaryKey: field('ID'), Fields: ['ID', ...fields].map((f) => field(f)), RelatedEntities: [], TrackRecordChanges: false }) as unknown as EntityInfo;

const AGENT = entity('e-agent', 'Agents', ['Name', 'ParentID']);
const STEP = entity('e-step', 'Steps', ['AgentID', 'Name', 'SubAgentID']);
const PATH = entity('e-path', 'Paths', ['OriginStepID', 'DestinationStepID']);
const INFOS = [AGENT, STEP, PATH];
/** Foreign keys the fake database enforces: column -> entity it must already hold. */
const FKS: Record<string, Record<string, string>> = {
    Agents: { ParentID: 'Agents' },
    Steps: { AgentID: 'Agents', SubAgentID: 'Agents' },
    Paths: { OriginStepID: 'Steps', DestinationStepID: 'Steps' },
};

function database() {
    const inserted = new Map<string, Set<string>>(INFOS.map((e) => [e.Name, new Set<string>()]));
    const order: string[] = [];
    const provider = {
        CurrentUser: { ID: 'u-1' } as UserInfo,
        // The executor always runs the clone in a transaction, and a graph save needs one locally.
        SupportsEntityTransactions: true,
        IsInTransaction: false,
        BeginEntityTransaction: async () => ({ Commit: async () => {}, Rollback: async () => {} }),
        Save: async (row: BaseEntity) => {
            for (const [column, target] of Object.entries(FKS[row.EntityInfo.Name] ?? {})) {
                const value = row.Get(column) as string | null;
                if (value && !inserted.get(target)!.has(value)) {
                    throw new Error(`FK violation: ${row.EntityInfo.Name}.${column} -> ${target} '${value}' does not exist yet`);
                }
            }
            inserted.get(row.EntityInfo.Name)!.add(row.Get('ID') as string);
            order.push(`${row.EntityInfo.Name}:${row.Get('ID')}`);
            return row.GetAll();
        },
        Delete: async () => true,
        SetCachedRecordName: () => {},
        GetCachedRecordName: () => undefined,
        GetEntityObject: async <T extends BaseEntity>(n: string): Promise<T> => new TestEntity(INFOS.find((e) => e.Name === n)!, provider) as unknown as T,
    } as unknown as IEntityDataProvider;
    const md = {
        Entities: INFOS,
        EntityByName: (n: string) => INFOS.find((e) => e.Name === n) ?? null,
        EntityByID: (id: string) => INFOS.find((e) => e.ID === id),
        GetEntityObject: async <T extends BaseEntity>(n: string): Promise<T> => new TestEntity(INFOS.find((e) => e.Name === n)!, provider) as unknown as T,
    } as unknown as IMetadataProvider;
    return { md, order };
}

const node = (key: string, entityName: string, depth: number, target: string, fields: Array<[string, string, string, 'Copy' | 'Remap']>) => ({
    NodeKey: key, Key: key, EntityName: entityName, SourceKey: key, TargetKey: target, Action: 'Create' as const, Depth: depth, Route: 'Collection' as const,
    FieldChanges: fields.map(([Field, OldValue, NewValue, Kind]) => ({ Field, OldValue, NewValue, Kind, Reason: '' })),
});

/** Agent A with steps S1, S2 and a path S1 -> S2 discovered under S1, as the walker finds it. */
const flowPlan = (): ClonePlan => ({
    RootEntityName: 'Agents', RootSourceKey: 'a', RootTargetKey: 'a2', Blocked: false, Warnings: [], Excluded: [],
    Nodes: [
        node('agent', 'Agents', 0, 'a2', [['Name', 'Flow', 'Flow (copy)', 'Copy']]),
        node('s1', 'Steps', 1, 's1-new', [['AgentID', 'a', 'a2', 'Remap'], ['Name', 'one', 'one', 'Copy']]),
        node('p12', 'Paths', 2, 'p12-new', [['OriginStepID', 's1', 's1-new', 'Remap'], ['DestinationStepID', 's2', 's2-new', 'Remap']]),
        node('s2', 'Steps', 1, 's2-new', [['AgentID', 'a', 'a2', 'Remap'], ['Name', 'two', 'two', 'Copy']]),
    ],
    Edges: [
        { FromKey: 'agent', ToKey: 's1', JoinField: 'AgentID', Policy: 'Deep', Kind: 'Collection' },
        { FromKey: 's1', ToKey: 'p12', JoinField: 'OriginStepID', Policy: 'Deep', Kind: 'Collection' },
        { FromKey: 'agent', ToKey: 's2', JoinField: 'AgentID', Policy: 'Deep', Kind: 'Collection' },
    ],
} as unknown as ClonePlan);

describe('CloneMaterializer save order against a database that enforces foreign keys', () => {
    it('saves a step path after the new step it points at, whatever order the steps come in', async () => {
        const { md, order } = database();
        const graph = await new CloneMaterializer(md).Materialize(flowPlan(), { ID: 'u-1' } as UserInfo);

        // What CloneExecutor does: the root's graph save, then the sidecars in the order given.
        expect(await graph.RootEntity.Save(), graph.RootEntity.LatestResult?.CompleteMessage).toBe(true);
        for (const sidecar of graph.SidecarEntities) {
            expect(await sidecar.Save()).toBe(true);
        }

        expect(order).toEqual(['Agents:a2', 'Steps:s1-new', 'Steps:s2-new', 'Paths:p12-new']);
    });

    it('saves a step that runs a copied sub-agent after that sub-agent', async () => {
        const { md, order } = database();
        const plan = {
            RootEntityName: 'Agents', RootSourceKey: 'a', RootTargetKey: 'a2', Blocked: false, Warnings: [], Excluded: [],
            // The Steps relationship comes before ParentID, as on the generated AI Agent form.
            Nodes: [
                node('agent', 'Agents', 0, 'a2', [['Name', 'Parent', 'Parent (copy)', 'Copy']]),
                node('s1', 'Steps', 1, 's1-new', [['AgentID', 'a', 'a2', 'Remap'], ['SubAgentID', 'sub', 'sub-new', 'Remap']]),
                node('sub', 'Agents', 1, 'sub-new', [['ParentID', 'a', 'a2', 'Remap'], ['Name', 'Child', 'Child', 'Copy']]),
            ],
            Edges: [
                { FromKey: 'agent', ToKey: 's1', JoinField: 'AgentID', Policy: 'Deep', Kind: 'Collection' },
                { FromKey: 'agent', ToKey: 'sub', JoinField: 'ParentID', Policy: 'Deep', Kind: 'Hierarchy' },
            ],
        } as unknown as ClonePlan;
        const graph = await new CloneMaterializer(md).Materialize(plan, { ID: 'u-1' } as UserInfo);

        expect(await graph.RootEntity.Save(), graph.RootEntity.LatestResult?.CompleteMessage).toBe(true);
        for (const sidecar of graph.SidecarEntities) {
            expect(await sidecar.Save(), sidecar.LatestResult?.CompleteMessage).toBe(true);
        }
        expect(order.indexOf('Agents:sub-new')).toBeLessThan(order.indexOf('Steps:s1-new'));
    });

    it('keeps a row that only points at its parent inside the graph save', async () => {
        const { md } = database();
        const plan = flowPlan();
        plan.Nodes = plan.Nodes.filter((n) => n.NodeKey !== 'p12');
        plan.Edges = plan.Edges.filter((e) => e.ToKey !== 'p12');
        const graph = await new CloneMaterializer(md).Materialize(plan, { ID: 'u-1' } as UserInfo);
        expect(graph.SidecarEntities).toEqual([]);
    });
});
