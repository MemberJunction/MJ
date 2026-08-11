/**
 * Batched related-record loading for result sets (`RunView.IncludeRelatedRecords`).
 *
 * WHAT THIS PROTECTS
 *
 * The intuitive way to make related records load automatically is to do it in
 * `BaseEntity.LoadFromData()` — which is also how every row of
 * `RunView(ResultType:'entity_object')` is materialised, so the intuitive implementation silently
 * multiplies one view into one query per row. That is not theoretical: a `LoadFromData` override
 * calling `LoadLines()` meant listing 500 journal entries issued 500 line queries plus 500 more for
 * dimensions.
 *
 * These tests pin the properties that make the batched path a genuine fix rather than a relocation
 * of the same problem: **exactly one query per collection regardless of row count**, correct
 * bucketing back to each parent, and empty-but-loaded for parents with no related records (so a
 * later read is known-empty rather than not-yet-loaded).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { LoadRelatedRecordsBatched } from '../generic/relatedRecordBatchLoader';
import { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider, IRunViewProvider, RunViewResult } from '../generic/interfaces';
import type { RunViewParams } from '../views/runView';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

let productEntityInfo: EntityInfo;
/** Every RunView the loader issued — the count IS the N+1 assertion. */
let viewCalls: RunViewParams[] = [];
/** Rows the fake provider returns, keyed by nothing — the loader filters in SQL, so we do it here. */
let childRows: BaseEntity[] = [];
let viewSucceeds = true;

/** A parent entity declaring one related-record collection keyed off the `Name` field. */
class ParentWithLines extends BaseEntity {
    public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Lines',
        RelatedEntity: 'Products',
        RelatedEntityJoinField: 'Name',
        OrderBy: 'Price ASC',
    });
    public override CheckPermissions(): boolean {
        return true;
    }
}

/** A parent that declares nothing, used to prove unknown names degrade rather than throw. */
class ParentWithout extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

function makeProvider() {
    return {
        CurrentUser: MOCK_USER,
        async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
            viewCalls.push(params);
            if (!viewSucceeds) {
                return { Success: false, ErrorMessage: 'boom', Results: [], TotalRowCount: 0 } as unknown as RunViewResult<T>;
            }
            return { Success: true, Results: childRows as unknown as T[], TotalRowCount: childRows.length } as unknown as RunViewResult<T>;
        },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
}

/** Creates a saved parent whose primary key is `id`. */
function makeParent(provider: ReturnType<typeof makeProvider>, id: string, cls = ParentWithLines): BaseEntity {
    const parent = new cls(productEntityInfo, provider as unknown as IEntityDataProvider);
    parent.NewRecord();
    parent.Set('ID', id);
    return parent;
}

/** Creates a related record whose stand-in foreign key (`Name`) points at `parentId`. */
function makeChild(provider: ReturnType<typeof makeProvider>, parentId: string, ordinal: number): BaseEntity {
    const child = new BaseEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
    child.NewRecord();
    child.Set('Name', parentId);
    child.Set('Price', ordinal);
    return child;
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = { Entities: entities, CurrentUser: MOCK_USER } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    viewCalls = [];
    childRows = [];
    viewSucceeds = true;
});

describe('LoadRelatedRecordsBatched — the N+1 guarantee', () => {
    it('issues exactly ONE query for a whole result set, not one per row', async () => {
        const provider = makeProvider();
        const parents = ['p1', 'p2', 'p3', 'p4', 'p5'].map(id => makeParent(provider, id));
        childRows = parents.flatMap((_, i) => [makeChild(provider, `p${i + 1}`, 1)]);

        await LoadRelatedRecordsBatched(parents, ['Lines'], provider as unknown as IRunViewProvider);

        expect(viewCalls).toHaveLength(1);
    });

    it('issues one query PER COLLECTION, so K collections cost 1+K not N*K', async () => {
        const provider = makeProvider();
        class TwoCollections extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines', RelatedEntity: 'Products', RelatedEntityJoinField: 'Name',
            });
            public readonly Charges = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Charges', RelatedEntity: 'Products', RelatedEntityJoinField: 'Name',
            });
        }
        const parents = ['p1', 'p2', 'p3'].map(id => makeParent(provider, id, TwoCollections));

        await LoadRelatedRecordsBatched(parents, ['Lines', 'Charges'], provider as unknown as IRunViewProvider);

        expect(viewCalls).toHaveLength(2);
    });

    it('filters on the declared join field with every parent key in one IN list', async () => {
        const provider = makeProvider();
        const parents = ['p1', 'p2'].map(id => makeParent(provider, id));

        await LoadRelatedRecordsBatched(parents, ['Lines'], provider as unknown as IRunViewProvider);

        expect(viewCalls[0].ExtraFilter).toContain('Name IN (');
        expect(viewCalls[0].ExtraFilter).toContain("'p1'");
        expect(viewCalls[0].ExtraFilter).toContain("'p2'");
    });

    it('requests entity objects and honours the declared OrderBy', async () => {
        const provider = makeProvider();
        await LoadRelatedRecordsBatched([makeParent(provider, 'p1')], ['Lines'], provider as unknown as IRunViewProvider);

        expect(viewCalls[0].ResultType).toBe('entity_object');
        expect(viewCalls[0].OrderBy).toBe('Price ASC');
    });

    it('de-duplicates repeated parent keys in the IN list', async () => {
        const provider = makeProvider();
        const parents = [makeParent(provider, 'p1'), makeParent(provider, 'p1')];

        await LoadRelatedRecordsBatched(parents, ['Lines'], provider as unknown as IRunViewProvider);

        expect(viewCalls[0].ExtraFilter!.match(/'p1'/g)).toHaveLength(1);
    });

    it('escapes single quotes in parent keys', async () => {
        const provider = makeProvider();
        await LoadRelatedRecordsBatched(
            [makeParent(provider, "o'brien")], ['Lines'], provider as unknown as IRunViewProvider,
        );

        expect(viewCalls[0].ExtraFilter).toContain("'o''brien'");
    });
});

describe('LoadRelatedRecordsBatched — distribution', () => {
    it('gives each parent only its own related records', async () => {
        const provider = makeProvider();
        const p1 = makeParent(provider, 'p1');
        const p2 = makeParent(provider, 'p2');
        childRows = [
            makeChild(provider, 'p1', 10),
            makeChild(provider, 'p2', 20),
            makeChild(provider, 'p1', 11),
        ];

        await LoadRelatedRecordsBatched([p1, p2], ['Lines'], provider as unknown as IRunViewProvider);

        const lines1 = p1.GetCompanion<RelatedRecordCollection>('Lines')!;
        const lines2 = p2.GetCompanion<RelatedRecordCollection>('Lines')!;
        expect(lines1.Items.map(i => i.Get('Price'))).toEqual([10, 11]);
        expect(lines2.Items.map(i => i.Get('Price'))).toEqual([20]);
    });

    it('marks a parent with no related records as LOADED and empty, not unloaded', async () => {
        // Known-empty and not-yet-loaded are different states; conflating them makes a later read
        // silently issue another query or, worse, treat a real empty set as "unknown".
        const provider = makeProvider();
        const p1 = makeParent(provider, 'p1');
        childRows = [];

        await LoadRelatedRecordsBatched([p1], ['Lines'], provider as unknown as IRunViewProvider);

        const lines = p1.GetCompanion<RelatedRecordCollection>('Lines')!;
        expect(lines.IsLoaded).toBe(true);
        expect(lines.Count).toBe(0);
    });

    it('matches parent keys case-insensitively, since UUID casing is not round-trip stable', async () => {
        const provider = makeProvider();
        const parent = makeParent(provider, 'ABC-123');
        childRows = [makeChild(provider, 'abc-123', 7)];

        await LoadRelatedRecordsBatched([parent], ['Lines'], provider as unknown as IRunViewProvider);

        expect(parent.GetCompanion<RelatedRecordCollection>('Lines')!.Count).toBe(1);
    });

    it('leaves the collection unloaded when the parent is unsaved', async () => {
        const provider = makeProvider();
        const unsaved = new ParentWithLines(productEntityInfo, provider as unknown as IEntityDataProvider);
        unsaved.NewRecord();
        unsaved.Set('ID', '');

        await LoadRelatedRecordsBatched([unsaved], ['Lines'], provider as unknown as IRunViewProvider);

        // No key to filter on, so no query at all.
        expect(viewCalls).toHaveLength(0);
    });
});

describe('LoadRelatedRecordsBatched — failure and edge handling', () => {
    it('throws loudly when the batched query fails rather than yielding empty collections', async () => {
        // Quietly handing back empty collections would make populated parents look childless, and
        // anything derived from that is wrong in a way nothing downstream can detect.
        const provider = makeProvider();
        viewSucceeds = false;

        await expect(
            LoadRelatedRecordsBatched([makeParent(provider, 'p1')], ['Lines'], provider as unknown as IRunViewProvider),
        ).rejects.toThrow(/failed to batch-load 'Lines'/);
    });

    it('skips an unknown collection name without throwing', async () => {
        const provider = makeProvider();
        const parent = makeParent(provider, 'p1', ParentWithout);

        await expect(
            LoadRelatedRecordsBatched([parent], ['NotDeclared'], provider as unknown as IRunViewProvider),
        ).resolves.toBeUndefined();
        expect(viewCalls).toHaveLength(0);
    });

    it('no-ops on an empty parent list or empty name list', async () => {
        const provider = makeProvider();
        await LoadRelatedRecordsBatched([], ['Lines'], provider as unknown as IRunViewProvider);
        await LoadRelatedRecordsBatched([makeParent(provider, 'p1')], [], provider as unknown as IRunViewProvider);

        expect(viewCalls).toHaveLength(0);
    });
});
