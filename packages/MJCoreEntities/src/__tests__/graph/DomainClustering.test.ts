/**
 * Domain discovery is pure and deterministic, so these tests drive it with plain EntityInfo-shaped
 * fixtures: two tight groups of entities joined by one stray link, plus an infrastructure hub that
 * every entity references.
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import {
    BuildEntityDomainGraph,
    DetectCommunities,
    DisplayEntityLabel,
    ProposeEntityDomains,
    type DomainGraphEdge,
} from '../../graph/DomainClustering';

interface FakeEntitySpec {
    id: string;
    name: string;
    schema?: string;
    refs?: string[];
    parent?: string;
}

function entity(spec: FakeEntitySpec): EntityInfo {
    return {
        ID: spec.id,
        Name: spec.name,
        SchemaName: spec.schema ?? 'sales',
        ParentID: spec.parent ?? null,
        Fields: (spec.refs ?? []).map((r) => ({ RelatedEntityID: r })),
    } as unknown as EntityInfo;
}

const USERS = 'AAAAAAAA-0000-0000-0000-000000000099';

/** Sales (Deals, Deal Lines, Quotes, Pipelines) and Support (Tickets, Ticket Notes, Queues), each referencing Users. */
function salesAndSupport(extraUsersRefs = 0): EntityInfo[] {
    const id = (n: number): string => `AAAAAAAA-0000-0000-0000-${String(n).padStart(12, '0')}`;
    const list: EntityInfo[] = [
        entity({ id: id(1), name: 'Sales: Deals', refs: [id(4), USERS] }),
        entity({ id: id(2), name: 'Sales: Deal Lines', refs: [id(1), id(3), USERS] }),
        entity({ id: id(3), name: 'Sales: Quotes', refs: [id(1), USERS] }),
        entity({ id: id(4), name: 'Sales: Pipelines', refs: [USERS] }),
        entity({ id: id(5), name: 'Support: Tickets', schema: 'support', refs: [id(7), USERS, id(1)] }),
        entity({ id: id(6), name: 'Support: Ticket Notes', schema: 'support', refs: [id(5), USERS] }),
        entity({ id: id(7), name: 'Support: Queues', schema: 'support', refs: [USERS] }),
        entity({ id: id(8), name: 'Support: Ticket Escalations', schema: 'support', parent: id(5), refs: [id(7)] }),
        entity({ id: USERS, name: 'MJ: Users', schema: '__mj' }),
    ];
    for (let i = 0; i < extraUsersRefs; i++) {
        list.push(entity({ id: id(100 + i), name: `Misc: Thing ${i}`, schema: 'misc', refs: [USERS] }));
    }
    return list;
}

describe('DetectCommunities', () => {
    const triangles: DomainGraphEdge[] = [
        { A: 'a', B: 'b', Weight: 1 },
        { A: 'b', B: 'c', Weight: 1 },
        { A: 'a', B: 'c', Weight: 1 },
        { A: 'x', B: 'y', Weight: 1 },
        { A: 'y', B: 'z', Weight: 1 },
        { A: 'x', B: 'z', Weight: 1 },
        { A: 'c', B: 'x', Weight: 0.1 },
    ];

    it('splits two triangles joined by a weak link into two communities', () => {
        const c = DetectCommunities(['a', 'b', 'c', 'x', 'y', 'z'], triangles);
        expect(c.get('a')).toBe(c.get('b'));
        expect(c.get('a')).toBe(c.get('c'));
        expect(c.get('x')).toBe(c.get('z'));
        expect(c.get('a')).not.toBe(c.get('x'));
    });

    it('gives the same answer whatever order the nodes and edges arrive in', () => {
        const a = DetectCommunities(['a', 'b', 'c', 'x', 'y', 'z'], triangles);
        const b = DetectCommunities(['z', 'y', 'x', 'c', 'b', 'a'], [...triangles].reverse());
        expect(Array.from(b.entries()).sort()).toEqual(Array.from(a.entries()).sort());
    });

    it('leaves isolated nodes and an edgeless graph in communities of their own', () => {
        const c = DetectCommunities(['a', 'b', 'lonely'], [{ A: 'a', B: 'b', Weight: 1 }]);
        expect(c.get('lonely')).not.toBe(c.get('a'));
        const none = DetectCommunities(['p', 'q'], []);
        expect(none.get('p')).not.toBe(none.get('q'));
    });
});

describe('BuildEntityDomainGraph', () => {
    it('drops an entity referenced by more entities than the hub threshold, and its links', () => {
        const graph = BuildEntityDomainGraph(salesAndSupport(), { HubThreshold: 5 });
        expect(graph.HubIDs).toEqual([USERS.toLowerCase()]);
        expect(graph.NodeIDs).not.toContain(USERS.toLowerCase());
        expect(graph.Edges.some((e) => e.A === USERS.toLowerCase() || e.B === USERS.toLowerCase())).toBe(false);
    });

    it('applies the default threshold (8, or 5% of the scope) so a schema-wide hub is excluded', () => {
        expect(BuildEntityDomainGraph(salesAndSupport()).HubIDs).toEqual([]); // referenced by 7
        expect(BuildEntityDomainGraph(salesAndSupport(3)).HubIDs).toEqual([USERS.toLowerCase()]); // referenced by 10
    });

    it('keeps only the requested schemas, ignores links that leave them, and weighs IS-A above a foreign key', () => {
        const graph = BuildEntityDomainGraph(salesAndSupport(), { SchemaNames: ['SUPPORT'] });
        expect(graph.NodeIDs).toHaveLength(4);
        const isA = graph.Edges.find((e) => e.A.endsWith('005') && e.B.endsWith('008'));
        const fk = graph.Edges.find((e) => e.A.endsWith('005') && e.B.endsWith('006'));
        expect(isA?.Weight).toBe(1);
        expect(fk?.Weight).toBe(0.6);
    });
});

describe('ProposeEntityDomains', () => {
    it('proposes one domain per group, named after its most connected member, with per-entity confidence', () => {
        const proposals = ProposeEntityDomains(salesAndSupport(3), { MinClusterSize: 3 });
        expect(proposals).toHaveLength(2);
        const names = proposals.map((p) => p.Name).sort();
        expect(names).toEqual(['Deals domain', 'Tickets domain']);
        const support = proposals.find((p) => p.Name === 'Tickets domain');
        expect(support?.Members.map((m) => m.EntityName).sort()).toEqual([
            'Support: Queues',
            'Support: Ticket Escalations',
            'Support: Ticket Notes',
            'Support: Tickets',
        ]);
        const tickets = support?.Members.find((m) => m.EntityName === 'Support: Tickets');
        expect(tickets?.Confidence).toBeGreaterThan(0);
        expect(tickets?.Confidence).toBeLessThan(1); // its link to Deals leaves the group
        expect(support?.Cohesion).toBeGreaterThan(0.5);
        expect(support?.Description).toContain('4 entities');
    });

    it('drops groups below MinClusterSize and caps the count at MaxDomains', () => {
        expect(ProposeEntityDomains(salesAndSupport(3), { MinClusterSize: 5 })).toHaveLength(0);
        expect(ProposeEntityDomains(salesAndSupport(3), { MaxDomains: 1 })).toHaveLength(1);
    });

    it('is deterministic run to run', () => {
        const a = ProposeEntityDomains(salesAndSupport(3));
        const b = ProposeEntityDomains([...salesAndSupport(3)].reverse());
        expect(b).toEqual(a);
    });

    it('disambiguates colliding domain names across schemas with the lead entity schema', () => {
        const id = (n: number): string => `BBBBBBBB-0000-0000-0000-${String(n).padStart(12, '0')}`;
        const multiSchema: EntityInfo[] = [
            entity({ id: id(1), name: 'CRM: Contacts', schema: 'crm', refs: [id(2), id(3)] }),
            entity({ id: id(2), name: 'CRM: Contact Notes', schema: 'crm', refs: [id(1), id(3)] }),
            entity({ id: id(3), name: 'CRM: Contact Activities', schema: 'crm', refs: [id(1)] }),
            entity({ id: id(4), name: 'Support: Contacts', schema: 'support', refs: [id(5), id(6)] }),
            entity({ id: id(5), name: 'Support: Contact Cases', schema: 'support', refs: [id(4), id(6)] }),
            entity({ id: id(6), name: 'Support: Contact SLAs', schema: 'support', refs: [id(4)] }),
        ];
        const names = ProposeEntityDomains(multiSchema).map((p) => p.Name).sort();
        expect(names).toEqual(['Contacts (crm) domain', 'Contacts (support) domain']);
    });
});

describe('DisplayEntityLabel', () => {
    it('strips a schema prefix and leaves other names alone', () => {
        expect(DisplayEntityLabel('MJ: AI Agents')).toBe('AI Agents');
        expect(DisplayEntityLabel('MJ_BizApps_Sales: Deals')).toBe('Deals');
        expect(DisplayEntityLabel('Invoices')).toBe('Invoices');
    });
});
