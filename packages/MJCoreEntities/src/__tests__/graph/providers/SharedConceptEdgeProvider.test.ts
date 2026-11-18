import { describe, expect, it } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJGraphEntity } from '../../../generated/entity_subclasses';
import type { GraphProviderContext } from '../../../graph/BaseGraphEdgeProvider';
import { SharedConceptEdgeProvider, type SharedConceptEdgeProviderConfig } from '../../../graph/providers/SharedConceptEdgeProvider';

const E = {
    Artifacts: 'e0000000-0000-4000-8000-000000000001',
    Tasks: 'e0000000-0000-4000-8000-000000000002',
    Concepts: 'e0000000-0000-4000-8000-000000000003',
    Chunks: 'e0000000-0000-4000-8000-000000000004',
};
const caller = { ID: 'u-caller', Name: 'Caller', UserRoles: [] } as unknown as UserInfo;

type Row = Record<string, string | null>;

/**
 * Three documents and a task. doc-a and doc-b were both sources of concepts k1 and k2; doc-c of k2
 * only; the task of k1 only. doc-d's item is being deleted, so it shares nothing.
 */
function rows(): Record<string, Row[]> {
    return {
        'MJ: Entity Record Documents': [
            { ID: 'erd-a', EntityID: E.Artifacts, RecordID: 'doc-a' },
            { ID: 'erd-b', EntityID: E.Artifacts, RecordID: 'doc-b' },
            { ID: 'erd-c', EntityID: E.Artifacts, RecordID: 'doc-c' },
            { ID: 'erd-t', EntityID: E.Tasks, RecordID: 'task-1' },
            { ID: 'erd-d', EntityID: E.Artifacts, RecordID: 'doc-d' },
        ],
        'MJ: Content Items': [
            { ID: 'item-a', EntityRecordDocumentID: 'erd-a', DeleteStatus: null },
            { ID: 'item-b', EntityRecordDocumentID: 'erd-b', DeleteStatus: null },
            { ID: 'item-c', EntityRecordDocumentID: 'erd-c', DeleteStatus: null },
            { ID: 'item-t', EntityRecordDocumentID: 'erd-t', DeleteStatus: null },
            { ID: 'item-d', EntityRecordDocumentID: 'erd-d', DeleteStatus: 'Pending' },
        ],
        'MJ: Content Item Chunks': [
            { ID: 'ch-a1', ContentItemID: 'item-a' },
            { ID: 'ch-a2', ContentItemID: 'item-a' },
            { ID: 'ch-b1', ContentItemID: 'item-b' },
            { ID: 'ch-c1', ContentItemID: 'item-c' },
            { ID: 'ch-t1', ContentItemID: 'item-t' },
            { ID: 'ch-d1', ContentItemID: 'item-d' },
        ],
        'MJ: Graph Edges': [
            sourced('k1', 'ch-a1'),
            sourced('k2', 'ch-a2'),
            sourced('k1', 'ch-b1'),
            sourced('k2', 'ch-b1'),
            sourced('k2', 'ch-c1'),
            sourced('k1', 'ch-t1'),
            sourced('k1', 'ch-d1'),
            { ID: 'mention', EdgeType: 'Mentions', SourceEntityID: E.Chunks, SourceRecordID: 'ch-c1', TargetEntityID: E.Concepts, TargetRecordID: 'k1' },
        ],
    };
}

function sourced(concept: string, chunk: string): Row {
    return { ID: `sf-${concept}-${chunk}`, EdgeType: 'SourcedFrom', SourceEntityID: E.Concepts, SourceRecordID: concept, TargetEntityID: E.Chunks, TargetRecordID: chunk };
}

/** Evaluates the filter shapes the provider emits: ANDs of `=`, `IN`, `IS [NOT] NULL`, plus the per-entity OR groups. */
function matches(row: Row, filter: string): boolean {
    const groups = Array.from(filter.matchAll(/\(\[EntityID\] = '([^']+)' AND \[RecordID\] IN \(([^)]*)\)\)/g));
    if (groups.length > 0) {
        return groups.some((g) => row['EntityID'] === g[1] && values(g[2]).includes(String(row['RecordID'])));
    }
    return filter.split(' AND ').every((clause) => {
        const eq = /^\[(\w+)\] = '([^']*)'$/.exec(clause.trim());
        if (eq) return row[eq[1]] === eq[2];
        const inList = /^\[(\w+)\] IN \((.*)\)$/.exec(clause.trim());
        if (inList) return values(inList[2]).includes(String(row[inList[1]]));
        const isNull = /^\[(\w+)\] IS (NOT )?NULL$/.exec(clause.trim());
        if (isNull) return isNull[2] ? row[isNull[1]] != null : row[isNull[1]] == null;
        throw new Error(`unexpected clause: ${clause}`);
    });
}

function values(list: string): string[] {
    return Array.from(list.matchAll(/'([^']*)'/g)).map((m) => m[1]);
}

function ctx(data: Record<string, Row[]>, config: SharedConceptEdgeProviderConfig = {}, unreadable: string[] = []) {
    const reads: Array<{ EntityName: string; UserID?: string }> = [];
    const names: Record<string, string> = { [E.Artifacts]: 'MJ: Artifacts', [E.Tasks]: 'MJ: Tasks', [E.Concepts]: 'MJ: Graph Concepts', [E.Chunks]: 'MJ: Content Item Chunks' };
    const provider = {
        EntityByName: (name: string) => {
            const id = Object.keys(names).find((k) => names[k].toLowerCase() === name.toLowerCase());
            return id ? { ID: id, Name: names[id] } : undefined;
        },
        EntityByID: (id: string) => (names[id] ? { ID: id, Name: names[id] } : undefined),
        RunView: async (params: RunViewParams, user?: UserInfo) => {
            const entity = params.EntityName ?? '';
            reads.push({ EntityName: entity, UserID: user?.ID });
            if (unreadable.includes(entity)) {
                return { Success: false, Results: [], ErrorMessage: 'denied' };
            }
            const out = (data[entity] ?? []).filter((r) => matches(r, String(params.ExtraFilter ?? '')));
            return { Success: true, Results: out.slice(0, params.MaxRows ?? out.length) };
        },
    };
    const context = {
        Graph: { ID: 'g', Name: 'Library Knowledge' } as MJGraphEntity,
        Config: config,
        User: caller,
        Provider: provider as unknown as GraphProviderContext<SharedConceptEdgeProviderConfig>['Provider'],
    } as GraphProviderContext<SharedConceptEdgeProviderConfig>;
    return { context, reads };
}

const docA = { EntityName: 'MJ: Artifacts', RecordID: 'doc-a' };

describe('SharedConceptEdgeProvider', () => {
    it('connects a record to every other record that was a source of a concept it was a source of', async () => {
        const { context } = ctx(rows());
        const edges = await new SharedConceptEdgeProvider().GetEdges({ Nodes: [docA], Direction: 'Both' }, context);
        const byTarget = new Map(edges.map((e) => [e.Target.RecordID, e]));
        expect([...byTarget.keys()].sort()).toEqual(['doc-b', 'doc-c', 'task-1']);
        expect(byTarget.get('doc-b')?.Attributes).toEqual({ SharedConceptIDs: ['k1', 'k2'] });
        expect(byTarget.get('doc-b')?.Weight).toBeCloseTo(0.75);
        expect(byTarget.get('doc-c')?.Attributes).toEqual({ SharedConceptIDs: ['k2'] });
        expect(byTarget.get('task-1')?.Target.EntityName).toBe('MJ: Tasks');
        for (const edge of edges) {
            expect(edge).toMatchObject({ TypeName: 'SharesConceptWith', Origin: 'Derived', IsDirected: false, Source: { RecordID: 'doc-a', EntityName: 'MJ: Artifacts' } });
        }
    });

    it('skips a record whose content item is being deleted, and honours MinSharedConcepts and EntityNames', async () => {
        const { context } = ctx(rows(), { MinSharedConcepts: 2 });
        const strong = await new SharedConceptEdgeProvider().GetEdges({ Nodes: [docA], Direction: 'Both' }, context);
        expect(strong.map((e) => e.Target.RecordID)).toEqual(['doc-b']);

        const { context: docsOnly } = ctx(rows(), { EntityNames: ['MJ: Artifacts'] });
        const edges = await new SharedConceptEdgeProvider().GetEdges({ Nodes: [docA], Direction: 'Both' }, docsOnly);
        expect(edges.map((e) => e.Target.RecordID).sort()).toEqual(['doc-b', 'doc-c']);
        expect(edges.some((e) => e.Target.RecordID === 'doc-d')).toBe(false);
    });

    it('emits one edge per pair even when both ends are in the frontier', async () => {
        const { context } = ctx(rows());
        const edges = await new SharedConceptEdgeProvider().GetEdges({ Nodes: [docA, { EntityName: 'MJ: Artifacts', RecordID: 'doc-b' }], Direction: 'Both' }, context);
        expect(edges.filter((e) => [e.Source.RecordID, e.Target.RecordID].sort().join() === 'doc-a,doc-b')).toHaveLength(1);
    });

    it('reads everything as the viewer and yields nothing when a hop is unreadable', async () => {
        const { context, reads } = ctx(rows(), {}, ['MJ: Graph Edges']);
        expect(await new SharedConceptEdgeProvider().GetEdges({ Nodes: [docA], Direction: 'Both' }, context)).toEqual([]);
        expect(reads.length).toBeGreaterThan(0);
        expect(reads.every((r) => r.UserID === caller.ID)).toBe(true);
    });

    it('does nothing when the edge type is filtered out', async () => {
        const { context, reads } = ctx(rows());
        expect(await new SharedConceptEdgeProvider().GetEdges({ Nodes: [docA], Direction: 'Both', EdgeTypes: ['LinksTo'] }, context)).toEqual([]);
        expect(reads).toHaveLength(0);
    });
});
