import { describe, it, expect, vi, beforeEach } from 'vitest';

// Silence + observe LogError, and make the engine-registry cache controllable per test;
// keep everything else (types are erased anyway).
const { mockLogError, mockTryGetCachedRecords } = vi.hoisted(() => ({
    mockLogError: vi.fn(),
    mockTryGetCachedRecords: vi.fn(),
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: mockLogError,
        BaseEngineRegistry: { Instance: { TryGetCachedRecords: mockTryGetCachedRecords } },
    };
});

import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { FieldPathResolver } from '../Engine/generic/FieldPathResolver';

/* ------------------------------------------------------------------ */
/*  Fixture: 'MJ: Content Items' --ContentSourceID--> 'MJ: Content     */
/*  Sources', which has one IS-A child ('Client Content Sources')      */
/*  carrying the OrganizationID extension field.                       */
/* ------------------------------------------------------------------ */

const mockRunView = vi.fn();

interface StubRow { [key: string]: unknown }

function makeProvider(overrides?: {
    childEntities?: StubRow[];
    rootFields?: StubRow[];
}): IMetadataProvider {
    const childEntity = {
        ID: 'ent-src-child',
        Name: 'Client Content Sources',
        FirstPrimaryKey: { Name: 'ID' },
        ChildEntities: [],
    };
    const sourceEntity = {
        ID: 'ent-src',
        Name: 'MJ: Content Sources',
        FirstPrimaryKey: { Name: 'ID' },
        ChildEntities: overrides?.childEntities ?? [childEntity],
    };
    const rootEntity = {
        ID: 'ent-item',
        Name: 'MJ: Content Items',
        FirstPrimaryKey: { Name: 'ID' },
        Fields: overrides?.rootFields ?? [
            { Name: 'ID', RelatedEntityID: null },
            { Name: 'ContentSourceID', RelatedEntityID: 'ent-src' },
            { Name: 'Name', RelatedEntityID: null },
        ],
        ChildEntities: [],
    };
    return {
        EntityByName: (name: string) => (name === 'MJ: Content Items' ? rootEntity : undefined),
        Entities: [rootEntity, sourceEntity, childEntity],
        RunView: mockRunView,
    } as unknown as IMetadataProvider;
}

function makeItem(id: string, sourceId: string | null, extra?: StubRow): BaseEntity {
    return {
        ID: id,
        FirstPrimaryKey: { Value: id },
        GetAll: () => ({ ID: id, ContentSourceID: sourceId, ...extra }),
    } as unknown as BaseEntity;
}

/** Configure RunView to answer per entity name. */
function stubRows(rowsByEntity: Record<string, StubRow[] | 'FAIL'>): void {
    mockRunView.mockImplementation(async (params: { EntityName: string }) => {
        const rows = rowsByEntity[params.EntityName];
        if (rows === 'FAIL') {
            return { Success: false, Results: [], ErrorMessage: 'boom' };
        }
        return { Success: true, Results: rows ?? [] };
    });
}

const contextUser = {} as UserInfo;

describe('FieldPathResolver', () => {
    beforeEach(() => {
        mockRunView.mockReset();
        mockLogError.mockReset();
        mockTryGetCachedRecords.mockReset();
        mockTryGetCachedRecords.mockReturnValue(null); // default: no engine caches the entity
    });

    describe('plain (non-dotted) field path', () => {
        it('resolves the value from the item record itself, no queries', async () => {
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const items = [makeItem('item-1', 'src-1', { OrganizationID: 'org-9' })];
            const values = await resolver.ResolveForItems(items, 'OrganizationID');
            expect(values.get('item-1')).toBe('org-9');
            expect(mockRunView).not.toHaveBeenCalled();
        });

        it('returns undefined for an item missing the field', async () => {
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'OrganizationID');
            expect(values.get('item-1')).toBeUndefined();
        });
    });

    describe('single-hop path (FK field → related entity field)', () => {
        it('resolves a field on the related base entity', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'org-a' }],
                'Client Content Sources': [],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-1')],
                'ContentSourceID.OrganizationID'
            );
            expect(values.get('item-1')).toBe('org-a');
        });

        it('resolves a field that only exists on an IS-A child entity (shared-PK downcast)', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', Name: 'Source One' }], // no OrganizationID here
                'Client Content Sources': [{ ID: 'src-1', OrganizationID: 'org-b' }],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-1')],
                'ContentSourceID.OrganizationID'
            );
            expect(values.get('item-1')).toBe('org-b');
        });

        it('lets an IS-A child field win over the same-named parent field', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'parent-org' }],
                'Client Content Sources': [{ ID: 'src-1', OrganizationID: 'child-org' }],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-1')],
                'ContentSourceID.OrganizationID'
            );
            expect(values.get('item-1')).toBe('child-org');
        });

        it('resolves per item — different sources map to different namespaces', async () => {
            stubRows({
                'MJ: Content Sources': [
                    { ID: 'src-1', OrganizationID: 'org-a' },
                    { ID: 'src-2', OrganizationID: 'org-b' },
                ],
                'Client Content Sources': [],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-1'), makeItem('item-2', 'src-2'), makeItem('item-3', 'src-1')],
                'ContentSourceID.OrganizationID'
            );
            expect(values.get('item-1')).toBe('org-a');
            expect(values.get('item-2')).toBe('org-b');
            expect(values.get('item-3')).toBe('org-a');
        });

        it('reads path segments and record fields case-insensitively', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'org-a' }],
                'Client Content Sources': [],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-1')],
                'contentsourceid.organizationid'
            );
            expect(values.get('item-1')).toBe('org-a');
        });

        it('returns undefined for an item whose FK value is null', async () => {
            stubRows({ 'MJ: Content Sources': [], 'Client Content Sources': [] });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', null)],
                'ContentSourceID.OrganizationID'
            );
            expect(values.get('item-1')).toBeUndefined();
        });

        it('returns undefined when the related record does not exist', async () => {
            stubRows({ 'MJ: Content Sources': [], 'Client Content Sources': [] });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-missing')],
                'ContentSourceID.OrganizationID'
            );
            expect(values.get('item-1')).toBeUndefined();
        });
    });

    describe('engine-registry cache reuse', () => {
        function makeCachedRow(id: string, fields: StubRow) {
            return {
                FirstPrimaryKey: { Value: id },
                GetAll: () => ({ ID: id, ...fields }),
            };
        }

        it('serves related records from a loaded engine cache without querying', async () => {
            mockTryGetCachedRecords.mockImplementation((entityName: string) =>
                entityName === 'MJ: Content Sources'
                    ? [makeCachedRow('src-1', { OrganizationID: 'org-cached' }), makeCachedRow('src-2', { OrganizationID: 'org-other' })]
                    : null // IS-A child entity not cached → RunView fallback for it
            );
            stubRows({ 'Client Content Sources': [] });

            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'ContentSourceID.OrganizationID');

            expect(values.get('item-1')).toBe('org-cached');
            // Only the (uncached) child entity was queried; the base entity came from the registry.
            expect(mockRunView).toHaveBeenCalledTimes(1);
            expect(mockRunView.mock.calls[0][0].EntityName).toBe('Client Content Sources');
        });

        it('falls back to RunView when the cached rows are not entity objects', async () => {
            mockTryGetCachedRecords.mockReturnValue([{ ID: 'src-1', OrganizationID: 'simple-row' }]); // no GetAll
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'org-queried' }],
                'Client Content Sources': [],
            });

            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'ContentSourceID.OrganizationID');
            expect(values.get('item-1')).toBe('org-queried');
        });
    });

    describe('batching and per-pass caching', () => {
        it('loads distinct FK values with one query per entity (base + each IS-A child)', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'org-a' }],
                'Client Content Sources': [],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const items = Array.from({ length: 50 }, (_, i) => makeItem(`item-${i}`, 'src-1'));
            await resolver.ResolveForItems(items, 'ContentSourceID.OrganizationID');
            // 50 items, 1 distinct source → exactly 2 queries: base entity + one child entity
            expect(mockRunView).toHaveBeenCalledTimes(2);
        });

        it('serves repeat calls from the per-pass cache without re-querying', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'org-a' }],
                'Client Content Sources': [],
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'ContentSourceID.OrganizationID');
            expect(mockRunView).toHaveBeenCalledTimes(2);

            const second = await resolver.ResolveForItems([makeItem('item-2', 'src-1')], 'ContentSourceID.OrganizationID');
            expect(second.get('item-2')).toBe('org-a');
            expect(mockRunView).toHaveBeenCalledTimes(2); // no new queries
        });

        it('caches a failed load as unresolved instead of retrying within the pass', async () => {
            stubRows({ 'MJ: Content Sources': 'FAIL', 'Client Content Sources': [] });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const first = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'ContentSourceID.OrganizationID');
            expect(first.get('item-1')).toBeUndefined();
            const callsAfterFirst = mockRunView.mock.calls.length;

            const second = await resolver.ResolveForItems([makeItem('item-2', 'src-1')], 'ContentSourceID.OrganizationID');
            expect(second.get('item-2')).toBeUndefined();
            expect(mockRunView.mock.calls.length).toBe(callsAfterFirst);
        });
    });

    describe('misconfiguration — resolves nothing so callers fail closed', () => {
        it('rejects paths deeper than one hop', async () => {
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems(
                [makeItem('item-1', 'src-1')],
                'ContentSourceID.OrganizationID.BillingRegion'
            );
            expect(values.size).toBe(0);
            expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('single-hop'));
        });

        it('rejects a first segment that is not a field on the root entity', async () => {
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'NoSuchField.OrganizationID');
            expect(values.size).toBe(0);
            expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
        });

        it('rejects a first segment that is not a foreign key', async () => {
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'Name.OrganizationID');
            expect(values.size).toBe(0);
            expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('not a foreign key'));
        });

        it('degrades to parent fields when only the IS-A child load fails', async () => {
            stubRows({
                'MJ: Content Sources': [{ ID: 'src-1', OrganizationID: 'org-parent' }],
                'Client Content Sources': 'FAIL',
            });
            const resolver = new FieldPathResolver(makeProvider(), contextUser, 'MJ: Content Items');
            const values = await resolver.ResolveForItems([makeItem('item-1', 'src-1')], 'ContentSourceID.OrganizationID');
            expect(values.get('item-1')).toBe('org-parent');
        });
    });
});
