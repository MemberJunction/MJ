import { describe, it, expect, vi, beforeEach } from 'vitest';

type RunViewParams = { EntityName: string };
type RunViewResult = { Success: boolean; Results?: unknown[] };

const state = vi.hoisted(() => ({
    entities: [] as Array<Record<string, unknown>>,
    queries: [] as Array<Record<string, unknown>>,
    dashboard: undefined as unknown,
    runView: (_p: { EntityName: string }): { Success: boolean; Results?: unknown[] } => ({ Success: true, Results: [] }),
}));

vi.mock('@memberjunction/core', () => {
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        get Entities() {
            return state.entities;
        }
        get Queries() {
            return state.queries;
        }
        EntityByName(name: string) {
            return state.entities.find((e) => String(e.Name).toLowerCase() === name.toLowerCase());
        }
        async GetEntityObject() {
            return state.dashboard;
        }
    }
    class RunView {
        async RunView(params: RunViewParams): Promise<RunViewResult> {
            return state.runView(params);
        }
    }
    class RunQuery {}
    class CompositeKey {
        static FromID(id: string) {
            return { id };
        }
        static FromURLSegment(_entity: unknown, id: string) {
            return { id };
        }
        /** Mirrors the real contract: a bare value for a single-column key, `F1|v1||F2|v2` otherwise. */
        static FromEntityRecord(entity: { PrimaryKeys: Array<{ Name: string }> }, record: Record<string, unknown>) {
            const pairs = entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: String(record[pk.Name] ?? '') }));
            return {
                ToCompactURLSegment: () =>
                    pairs.length === 1 ? pairs[0].Value : pairs.map((p) => `${p.FieldName}|${p.Value}`).join('||'),
            };
        }
    }
    return { Metadata, RunView, RunQuery, CompositeKey };
});

import {
    LoadEntities,
    EntityCount,
    LoadQueries,
    QueryCount,
    LoadDashboard,
    LoadDashboards,
    LoadEntityRecords,
} from '@/data/services/explorer';

beforeEach(() => {
    state.entities = [];
    state.queries = [];
    state.dashboard = undefined;
    state.runView = () => ({ Success: true, Results: [] });
});

describe('LoadEntities', () => {
    beforeEach(() => {
        state.entities = [
            { Name: 'Zebra', DisplayName: 'Zebra', SchemaName: 'app', Description: 'z', AllowUserSearchAPI: true },
            { Name: 'Apple', DisplayName: 'Apple', SchemaName: 'app', Description: null, AllowUserSearchAPI: true },
            { Name: 'Hidden', DisplayName: 'Hidden', SchemaName: 'app', AllowUserSearchAPI: false },
            { Name: '__System', DisplayName: 'Sys', SchemaName: '__mj', AllowUserSearchAPI: true },
        ];
    });

    it('excludes non-searchable and internal entities, sorted by display name', () => {
        const list = LoadEntities();
        expect(list.map((e) => e.name)).toEqual(['Apple', 'Zebra']);
    });

    it('falls back displayName to the entity name and normalizes description to null', () => {
        const apple = LoadEntities().find((e) => e.name === 'Apple');
        expect(apple?.displayName).toBe('Apple');
        expect(apple?.description).toBeNull();
    });

    it('EntityCount counts all entities (unfiltered)', () => {
        expect(EntityCount()).toBe(4);
    });
});

describe('LoadQueries', () => {
    beforeEach(() => {
        state.queries = [
            { ID: 'q1', Name: 'Beta', Description: null, Status: 'Approved', CategoryInfo: { Name: 'Cat' } },
            { ID: 'q2', Name: 'Alpha', Description: 'a', Status: 'Approved', CategoryInfo: null },
            { ID: 'q3', Name: 'Draft', Description: null, Status: 'Pending' },
        ];
    });

    it('returns only Approved queries, sorted by name', () => {
        const list = LoadQueries();
        expect(list.map((q) => q.name)).toEqual(['Alpha', 'Beta']);
    });

    it('resolves category name from CategoryInfo (or null)', () => {
        const byName = new Map(LoadQueries().map((q) => [q.name, q]));
        expect(byName.get('Beta')?.category).toBe('Cat');
        expect(byName.get('Alpha')?.category).toBeNull();
    });

    it('QueryCount counts only Approved queries', () => {
        expect(QueryCount()).toBe(2);
    });
});

describe('LoadDashboard', () => {
    function dashboardEntity(uiConfig: string): unknown {
        return {
            ID: 'd1',
            Name: 'My Dashboard',
            Description: 'desc',
            UIConfigDetails: uiConfig,
            Load: async () => true,
        };
    }

    const goldenLayout = JSON.stringify({
        layout: {
            root: {
                type: 'row',
                content: [
                    { type: 'component', componentState: { id: 'p1', title: 'My View', partTypeId: 'pt1', config: { type: 'View' } } },
                    { type: 'component', componentState: { id: 'p2', partTypeId: 'pt2', config: {} } },
                ],
            },
        },
    });

    it('parses layout panels into typed, renderable parts', async () => {
        state.dashboard = dashboardEntity(goldenLayout);
        state.runView = (p) =>
            p.EntityName === 'MJ: Dashboard Part Types'
                ? { Success: true, Results: [{ ID: 'pt1', Name: 'View' }, { ID: 'pt2', Name: 'Query' }] }
                : { Success: true, Results: [] };

        const dash = await LoadDashboard('d1');
        expect(dash?.Parts).toHaveLength(2);
        expect(dash?.Parts.map((p) => p.kind)).toEqual(['view', 'query']);
        // Title comes from the panel, else the resolved type name.
        expect(dash?.Parts[0].title).toBe('My View');
        expect(dash?.Parts[1].title).toBe('Query');
        // 'view' is not natively mobile-renderable -> counted as desktop-only.
        expect(dash?.DesktopOnlyCount).toBe(1);
    });

    it('returns empty parts for malformed UIConfigDetails JSON', async () => {
        state.dashboard = dashboardEntity('{ this is not json');
        const dash = await LoadDashboard('d1');
        expect(dash?.Parts).toEqual([]);
        expect(dash?.DesktopOnlyCount).toBe(0);
    });

    it('returns empty parts for empty UIConfigDetails', async () => {
        state.dashboard = dashboardEntity('');
        const dash = await LoadDashboard('d1');
        expect(dash?.Parts).toEqual([]);
    });

    it('returns null when the dashboard fails to load', async () => {
        state.dashboard = { ID: 'd1', Name: 'x', Description: null, UIConfigDetails: '', Load: async () => false };
        expect(await LoadDashboard('d1')).toBeNull();
    });
});

describe('LoadEntityRecords — card subtitle rendering of normalized date cells', () => {
    // Simple-read date columns arrive as real Date objects (normalized by
    // @memberjunction/core). Subtitles must render them readably instead of
    // falling through to String(v), which prints the verbose Date.toString().
    const orderEntity = {
        Name: 'Test Orders',
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, DefaultInView: false, Type: 'uniqueidentifier' },
            { Name: 'Name', IsPrimaryKey: false, DefaultInView: true, Type: 'nvarchar' },
            { Name: 'OrderDate', IsPrimaryKey: false, DefaultInView: true, Type: 'datetime' },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
        FirstPrimaryKey: { Name: 'ID' },
        NameField: { Name: 'Name' },
    };

    beforeEach(() => {
        state.entities = [orderEntity as unknown as Record<string, unknown>];
    });

    it('renders a Date cell as a locale date, not Date.toString()', async () => {
        const orderDate = new Date('2026-08-01T00:00:00.000Z');
        state.runView = () => ({
            Success: true,
            Results: [{ ID: 'r1', Name: 'Order One', OrderDate: orderDate }],
        });

        const load = await LoadEntityRecords('Test Orders');

        expect(load?.Rows[0].subtitle).toBe(orderDate.toLocaleDateString());
        expect(load?.Rows[0].subtitle).not.toContain('GMT');
    });

    it('renders a string cell unchanged (pre-normalization rows keep working)', async () => {
        state.runView = () => ({
            Success: true,
            Results: [{ ID: 'r1', Name: 'Order One', OrderDate: '2026-08-01T00:00:00.000Z' }],
        });

        const load = await LoadEntityRecords('Test Orders');

        expect(load?.Rows[0].subtitle).toBe('2026-08-01T00:00:00.000Z');
    });

    it('omits null and empty cells from the subtitle', async () => {
        state.runView = () => ({
            Success: true,
            Results: [{ ID: 'r1', Name: 'Order One', OrderDate: null }],
        });

        const load = await LoadEntityRecords('Test Orders');

        expect(load?.Rows[0].subtitle).toBe('');
    });
});

describe('LoadDashboards', () => {
    it('asks for the entity by its real, MJ-prefixed name', async () => {
        // The unprefixed name does not resolve in metadata, and `RunView` reports that by returning
        // `Success: false` rather than throwing — which this function turns into an empty list. The
        // visible symptom was "Dashboards · 0 available" on a deployment that had dashboards, with
        // nothing in the UI to suggest a failure had happened at all.
        const asked: string[] = [];
        state.runView = (p) => {
            asked.push(p.EntityName);
            return { Success: true, Results: [{ ID: 'd1', Name: 'Ops', Description: null }] };
        };
        const dashboards = await LoadDashboards();
        expect(asked).toEqual(['MJ: Dashboards']);
        expect(dashboards).toEqual([{ id: 'd1', name: 'Ops', description: null }]);
    });

    it('returns an empty list rather than throwing when the query fails', async () => {
        state.runView = () => ({ Success: false, Results: [] });
        expect(await LoadDashboards()).toEqual([]);
    });
});
