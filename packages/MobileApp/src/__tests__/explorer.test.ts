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
    }
    return { Metadata, RunView, RunQuery, CompositeKey };
});

import { loadEntities, entityCount, loadQueries, queryCount, loadDashboard } from '@/data/services/explorer';

beforeEach(() => {
    state.entities = [];
    state.queries = [];
    state.dashboard = undefined;
    state.runView = () => ({ Success: true, Results: [] });
});

describe('loadEntities', () => {
    beforeEach(() => {
        state.entities = [
            { Name: 'Zebra', DisplayName: 'Zebra', SchemaName: 'app', Description: 'z', AllowUserSearchAPI: true },
            { Name: 'Apple', DisplayName: 'Apple', SchemaName: 'app', Description: null, AllowUserSearchAPI: true },
            { Name: 'Hidden', DisplayName: 'Hidden', SchemaName: 'app', AllowUserSearchAPI: false },
            { Name: '__System', DisplayName: 'Sys', SchemaName: '__mj', AllowUserSearchAPI: true },
        ];
    });

    it('excludes non-searchable and internal entities, sorted by display name', () => {
        const list = loadEntities();
        expect(list.map((e) => e.name)).toEqual(['Apple', 'Zebra']);
    });

    it('falls back displayName to the entity name and normalizes description to null', () => {
        const apple = loadEntities().find((e) => e.name === 'Apple');
        expect(apple?.displayName).toBe('Apple');
        expect(apple?.description).toBeNull();
    });

    it('entityCount counts all entities (unfiltered)', () => {
        expect(entityCount()).toBe(4);
    });
});

describe('loadQueries', () => {
    beforeEach(() => {
        state.queries = [
            { ID: 'q1', Name: 'Beta', Description: null, Status: 'Approved', CategoryInfo: { Name: 'Cat' } },
            { ID: 'q2', Name: 'Alpha', Description: 'a', Status: 'Approved', CategoryInfo: null },
            { ID: 'q3', Name: 'Draft', Description: null, Status: 'Pending' },
        ];
    });

    it('returns only Approved queries, sorted by name', () => {
        const list = loadQueries();
        expect(list.map((q) => q.name)).toEqual(['Alpha', 'Beta']);
    });

    it('resolves category name from CategoryInfo (or null)', () => {
        const byName = new Map(loadQueries().map((q) => [q.name, q]));
        expect(byName.get('Beta')?.category).toBe('Cat');
        expect(byName.get('Alpha')?.category).toBeNull();
    });

    it('queryCount counts only Approved queries', () => {
        expect(queryCount()).toBe(2);
    });
});

describe('loadDashboard', () => {
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

        const dash = await loadDashboard('d1');
        expect(dash?.parts).toHaveLength(2);
        expect(dash?.parts.map((p) => p.kind)).toEqual(['view', 'query']);
        // Title comes from the panel, else the resolved type name.
        expect(dash?.parts[0].title).toBe('My View');
        expect(dash?.parts[1].title).toBe('Query');
        // 'view' is not natively mobile-renderable -> counted as desktop-only.
        expect(dash?.desktopOnlyCount).toBe(1);
    });

    it('returns empty parts for malformed UIConfigDetails JSON', async () => {
        state.dashboard = dashboardEntity('{ this is not json');
        const dash = await loadDashboard('d1');
        expect(dash?.parts).toEqual([]);
        expect(dash?.desktopOnlyCount).toBe(0);
    });

    it('returns empty parts for empty UIConfigDetails', async () => {
        state.dashboard = dashboardEntity('');
        const dash = await loadDashboard('d1');
        expect(dash?.parts).toEqual([]);
    });

    it('returns null when the dashboard fails to load', async () => {
        state.dashboard = { ID: 'd1', Name: 'x', Description: null, UIConfigDetails: '', Load: async () => false };
        expect(await loadDashboard('d1')).toBeNull();
    });
});
