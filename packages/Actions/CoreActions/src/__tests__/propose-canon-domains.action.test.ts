/**
 * ProposeCanonDomainsAction wraps CanonGraphEngine.ProposeDomainConcepts (read) and
 * SaveDomainProposals (write). The engine is stubbed; the writer is checked through what it is
 * asked to save, by spying on the engine-backed lookups it uses.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RunActionParams } from '@memberjunction/actions-base';
import { CanonGraphEngine, GraphEngine, type DomainProposal, type MJGraphConceptTypeEntity, type MJGraphEdgeTypeEntity, type MJGraphEntity } from '@memberjunction/core-entities';
import { ProposeCanonDomainsAction, type ProposeCanonDomainsActionResult } from '../custom/data/propose-canon-domains.action';

const caller = { ID: 'u-1', Name: 'User 1', UserRoles: [{ UserID: 'u-1', RoleID: 'r-1', Role: 'Curator' }] } as unknown as UserInfo;
const canon = { ID: 'g-canon', Name: 'MJ Canon', Status: 'Active' } as unknown as MJGraphEntity;
const proposal: DomainProposal = {
    Name: 'Deals domain',
    Description: 'Proposed by community detection',
    Cohesion: 0.8,
    Members: [
        { EntityID: 'e-1', EntityName: 'Sales: Deals', Confidence: 0.9 },
        { EntityID: 'e-2', EntityName: 'Sales: Deal Lines', Confidence: 1 },
        { EntityID: 'e-3', EntityName: 'Sales: Products', Confidence: 0.7 },
    ],
};

class TestableProposeCanonDomainsAction extends ProposeCanonDomainsAction {
    public async RunForTest(params: RunActionParams): Promise<ProposeCanonDomainsActionResult> {
        return this.InternalRunAction(params);
    }
}

/** A fake provider: entity lookups and entity objects that record their saves. */
function fakeProvider(saved: Array<Record<string, unknown>>, failOn?: string): RunActionParams['Provider'] {
    let seq = 0;
    return {
        EntityByName: (name: string) => ({ ID: `entity:${name}` }),
        GetEntityObject: async (entityName: string) => {
            const row: Record<string, unknown> = { entityName };
            return Object.assign(row, {
                NewRecord: () => true,
                Save: async () => {
                    if (failOn && row['Name'] === failOn) {
                        return false;
                    }
                    row['ID'] = `id-${++seq}`;
                    saved.push({ ...row });
                    return true;
                },
                LatestResult: { CompleteMessage: 'permission denied' },
            });
        },
    } as unknown as RunActionParams['Provider'];
}

function run(params: Array<{ Name: string; Value: unknown }>, provider?: RunActionParams['Provider']): Promise<ProposeCanonDomainsActionResult> {
    return new TestableProposeCanonDomainsAction().RunForTest({
        ContextUser: caller,
        Provider: provider,
        Params: params.map((p) => ({ ...p, Type: 'Input' as const })),
    } as unknown as RunActionParams);
}

describe('ProposeCanonDomainsAction', () => {
    let proposeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(CanonGraphEngine.Instance, 'EnsureConfigured').mockResolvedValue(undefined);
        vi.spyOn(GraphEngine.Instance, 'GetGraph').mockImplementation((name: string) => (name.toLowerCase() === 'mj canon' ? canon : undefined));
        proposeSpy = vi.spyOn(CanonGraphEngine.Instance, 'ProposeDomainConcepts').mockResolvedValue([proposal]);
        vi.spyOn(GraphEngine.Instance, 'ConceptTypes', 'get').mockReturnValue([{ ID: 'ct-domain', Name: 'Domain' }] as unknown as MJGraphConceptTypeEntity[]);
        vi.spyOn(GraphEngine.Instance, 'EdgeTypes', 'get').mockReturnValue([{ ID: 'et-describes', Name: 'Describes', GraphID: null, DefaultWeight: 0.7 }] as unknown as MJGraphEdgeTypeEntity[]);
    });

    it('only returns proposals by default (dry run), passing the parsed options to the engine', async () => {
        const saved: Array<Record<string, unknown>> = [];
        const result = await run([{ Name: 'SchemaNames', Value: 'sales, support' }, { Name: 'MinClusterSize', Value: '4' }], fakeProvider(saved));
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Message).toContain('Would propose 1 domain');
        expect(saved).toEqual([]);
        expect(proposeSpy.mock.calls[0][2]).toEqual({ SchemaNames: ['sales', 'support'], MinClusterSize: 4 });
    });

    it('writes a Proposed Domain concept and an Inferred, Proposed Describes edge per member when DryRun is false', async () => {
        const saved: Array<Record<string, unknown>> = [];
        const result = await run([{ Name: 'DryRun', Value: false }], fakeProvider(saved));
        expect(result.ConceptsCreated).toBe(1);
        expect(result.EdgesCreated).toBe(3);
        const [conceptRow, ...edges] = saved;
        expect(conceptRow).toMatchObject({ entityName: 'MJ: Graph Concepts', Name: 'Deals domain', ConceptTypeID: 'ct-domain', Status: 'Proposed', GraphID: 'g-canon' });
        expect(edges).toHaveLength(3);
        expect(edges[0]).toMatchObject({
            entityName: 'MJ: Graph Edges',
            EdgeTypeID: 'et-describes',
            SourceEntityID: 'entity:MJ: Entities',
            SourceRecordID: 'e-1',
            TargetEntityID: 'entity:MJ: Graph Concepts',
            TargetRecordID: conceptRow['ID'],
            Origin: 'Inferred',
            Status: 'Proposed',
            Confidence: 0.9,
            Weight: 0.7,
        });
    });

    it('surfaces a failed save with its message instead of reporting success', async () => {
        const result = await run([{ Name: 'DryRun', Value: false }], fakeProvider([], 'Deals domain'));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
        expect(result.Message).toContain('permission denied');
    });

    it('answers NO_PROPOSALS when there is nothing new, and GRAPH_NOT_FOUND for an unknown graph', async () => {
        proposeSpy.mockResolvedValue([]);
        expect((await run([], fakeProvider([]))).ResultCode).toBe('NO_PROPOSALS');
        expect((await run([{ Name: 'GraphName', Value: 'Nope' }], fakeProvider([]))).ResultCode).toBe('GRAPH_NOT_FOUND');
    });
});
