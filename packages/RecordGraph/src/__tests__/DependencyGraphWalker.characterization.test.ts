/**
 * Characterization: the extracted walker's default walk (the options VersionHistory passes) returns
 * the same tree as VersionHistory's walker did before the extraction. Both run over one in-memory
 * database answered by a RunView mock that evaluates the filters they send, so the new walker's
 * batched child loads and the old one's per-parent loads are compared on results, not on queries.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { DependencyNode } from '../types';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
    Projects: [{ ID: 'p-1', Name: 'Apollo', ClientID: 'cl-1' }],
    // Referenced by the root through a foreign key: the forward walk.
    Clients: [{ ID: 'cl-1', Name: 'Ada Ltd' }],
    Tasks: [
        { ID: 't-1', ProjectID: 'p-1', Name: 'Design' },
        { ID: 't-2', ProjectID: 'p-1', Name: 'Build' },
        { ID: 't-9', ProjectID: 'p-other', Name: 'Elsewhere' },
    ],
    Subtasks: [
        { ID: 's-1', TaskID: 't-1', Name: 'Sketch' },
        { ID: 's-2', TaskID: 't-2', Name: 'Wire', __mj_DeletedAt: '2026-01-01' },
        { ID: 's-3', TaskID: 't-2', Name: 'Test', __mj_DeletedAt: null },
    ],
    // Reachable from both Projects and Tasks: the diamond must be visited once.
    Comments: [
        { ID: 'c-1', ProjectID: 'p-1', TaskID: 't-1', Text: 'kickoff' },
    ],
};

/** Evaluates `[Field] = 'v'`, `Field='v'`, `[Field] IN ('a','b')` and `__mj_DeletedAt IS NULL`, joined by AND. */
function matches(row: Row, filter: string): boolean {
    for (const clause of filter.split(/\s+AND\s+/i)) {
        const c = clause.trim().replace(/^\((.*)\)$/, '$1');
        let m = /^\[?(\w+)\]?\s*=\s*'((?:[^']|'')*)'$/.exec(c);
        if (m) {
            if (String(row[m[1]] ?? '') !== m[2].replace(/''/g, "'")) return false;
            continue;
        }
        m = /^\[?(\w+)\]?\s+IN\s*\((.*)\)$/i.exec(c);
        if (m) {
            const values = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((v) => v[1].replace(/''/g, "'"));
            if (!values.includes(String(row[m[1]] ?? ''))) return false;
            continue;
        }
        m = /^\[?(\w+)\]?\s+IS\s+NULL$/i.exec(c);
        if (m) {
            if (row[m[1]] !== null && row[m[1]] !== undefined) return false;
            continue;
        }
        throw new Error(`characterization mock cannot evaluate filter clause: ${c}`);
    }
    return true;
}

const runView = vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => ({
    Success: true,
    Results: (tables[params.EntityName] ?? []).filter((r) => !params.ExtraFilter || matches(r, params.ExtraFilter)),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = runView;
        static FromMetadataProvider = () => new MockRunView();
    }
    return { ...actual, RunView: MockRunView, LogError: vi.fn(), LogStatus: vi.fn() };
});

const { DependencyGraphWalker } = await import('../DependencyGraphWalker');
const { LegacyVersionHistoryWalker } = await import('./fixtures/LegacyVersionHistoryWalker');
const { CompositeKey } = await import('@memberjunction/core');

const id = (name: string) => `ent-${name.toLowerCase()}`;
const field = (Name: string, extra: Record<string, unknown> = {}) => ({ Name, CodeName: Name, IsPrimaryKey: Name === 'ID', ...extra });
const fk = (Name: string, target: string) => field(Name, { RelatedEntityID: id(target), RelatedEntity: target, RelatedEntityFieldName: 'ID' });
const oneToMany = (child: string, joinField: string) => ({
    ID: `rel-${child}-${joinField}`, Type: 'One To Many', RelatedEntity: child, RelatedEntityID: id(child), RelatedEntityJoinField: joinField, EntityKeyField: null,
});
const entity = (Name: string, fields: object[], related: object[] = []) =>
    ({
        ID: id(Name), Name, TrackRecordChanges: true, Fields: fields, RelatedEntities: related,
        PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' },
    }) as unknown as EntityInfo;

const entities = [
    entity('Projects', [field('ID'), field('Name'), fk('ClientID', 'Clients')], [oneToMany('Tasks', 'ProjectID'), oneToMany('Comments', 'ProjectID')]),
    entity('Clients', [field('ID'), field('Name')]),
    entity('Tasks', [field('ID'), fk('ProjectID', 'Projects'), field('Name')], [oneToMany('Subtasks', 'TaskID'), oneToMany('Comments', 'TaskID')]),
    entity('Subtasks', [field('ID'), fk('TaskID', 'Tasks'), field('Name'), field('__mj_DeletedAt')]),
    entity('Comments', [field('ID'), fk('ProjectID', 'Projects'), fk('TaskID', 'Tasks'), field('Text')]),
];
const provider = {
    Entities: entities,
    EntityByName: (n: string) => entities.find((e) => e.Name === n) ?? null,
    EntityByID: (i: string) => entities.find((e) => e.ID === i) ?? null,
} as unknown as IMetadataProvider;
const user = { ID: 'u-1' } as UserInfo;

interface Shape { Entity: string; Record: string; Depth: number; Via: string | null; Children: Shape[] }
/** What the walk found, without the fields only one walker has (DiscoveringEdge) or that vary by instance. */
function shape(node: DependencyNode): Shape {
    return {
        Entity: node.EntityName,
        Record: node.RecordID,
        Depth: node.Depth,
        Via: node.Relationship ? `${node.Relationship.RelatedEntity}.${node.Relationship.RelatedEntityJoinField}` : null,
        Children: node.Children.map(shape).sort((a, b) => `${a.Entity}${a.Record}`.localeCompare(`${b.Entity}${b.Record}`)),
    };
}

describe('DependencyGraphWalker characterization (VersionHistory default walk)', () => {
    const root = () => new CompositeKey([{ FieldName: 'ID', Value: 'p-1' }]);

    it.each([
        ['defaults', {}],
        ['MaxDepth 1', { MaxDepth: 1 }],
        ['IncludeDeleted', { IncludeDeleted: true }],
        ['ExcludeEntities', { ExcludeEntities: ['Comments'] }],
    ] as const)('matches the pre-extraction walker: %s', async (_label, options) => {
        const legacy = new LegacyVersionHistoryWalker();
        (legacy as unknown as { _provider: IMetadataProvider })._provider = provider;

        const before = await legacy.WalkDependents('Projects', root(), { ...options }, user);
        const after = await new DependencyGraphWalker(provider).WalkDependents('Projects', root(), { ...options }, user);

        expect(shape(after)).toEqual(shape(before));
        expect(new DependencyGraphWalker(provider).FlattenTopological(after).map((n) => n.RecordID).sort())
            .toEqual(legacy.FlattenTopological(before).map((n) => n.RecordID).sort());
    });

    it('walks children, grandchildren and the forward reference, visits the diamond once and skips deleted rows', async () => {
        const walked = await new DependencyGraphWalker(provider).WalkDependents('Projects', root(), {}, user);
        const ids = new DependencyGraphWalker(provider).FlattenTopological(walked).map((n) => n.RecordID).sort();
        expect(ids).toEqual(['ID|c-1', 'ID|cl-1', 'ID|p-1', 'ID|s-1', 'ID|s-3', 'ID|t-1', 'ID|t-2']);
    });
});
