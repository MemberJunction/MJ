/**
 * Pins the Data Explorer home's RecentEntities / FavoriteEntities. Both getters run on every
 * change-detection pass and used to scan the entity list once per item; they now read a cached
 * index over Entities. Same answers: list order, case-insensitive IDs, unknown IDs dropped, recent
 * capped at 5 — and a replaced Entities list is honoured on the next read.
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { DataExplorerDashboardComponent } from './data-explorer-dashboard.component';

const ids = Array.from({ length: 7 }, (_, i) => `${String(i + 1).repeat(8)}-0000-0000-0000-00000000000${i + 1}`);
const entity = (id: string, name: string): EntityInfo => ({ ID: id, Name: name }) as unknown as EntityInfo;

function dashboard(recent: string[], favorites: string[], entities: EntityInfo[]) {
    const d = Object.create(DataExplorerDashboardComponent.prototype) as DataExplorerDashboardComponent;
    (d as unknown as { State: unknown }).State = {
        recentEntityAccesses: recent.map(entityId => ({ entityId })),
        favoriteEntities: favorites.map(entityId => ({ entityId })),
    };
    d.Entities = entities;
    return d;
}

describe('DataExplorerDashboardComponent entity lookups', () => {
    const all = ids.map((id, i) => entity(id, `E${i + 1}`));

    it('RecentEntities: first five accesses, in access order, case-insensitive, unknown IDs dropped', () => {
        const d = dashboard([ids[2].toUpperCase(), 'missing', ids[0], ids[5], ids[1], ids[6]], [], all);
        expect(d.RecentEntities.map(e => e.Name)).toEqual(['E3', 'E1', 'E6', 'E2']);
    });

    it('FavoriteEntities: every favourite, in favourite order, case-insensitive, unknown IDs dropped', () => {
        const d = dashboard([], [ids[4], 'missing', ids[0].toUpperCase()], all);
        expect(d.FavoriteEntities.map(e => e.Name)).toEqual(['E5', 'E1']);
    });

    it('honours a replaced Entities list on the next read', () => {
        const d = dashboard([], [ids[0]], [entity(ids[0], 'before')]);
        expect(d.FavoriteEntities.map(e => e.Name)).toEqual(['before']);
        d.Entities = [entity(ids[0], 'after')];
        expect(d.FavoriteEntities.map(e => e.Name)).toEqual(['after']);
    });

    it('memoizes AllowedEntityNames, FlatFilteredEntities, and FilteredRecentRecords across CD reads (MJ-NG-4)', () => {
        const d = dashboard([], [], all);
        d.EntityFilterText = '';
        (d as unknown as { State: Record<string, unknown> }).State['homeViewMode'] = 'all';
        d.EntityFilter = { applicationId: 'app-1' };

        const allowed1 = d.AllowedEntityNames;
        const allowed2 = d.AllowedEntityNames;
        expect(allowed1).not.toBeNull();
        expect(allowed2).toBe(allowed1);

        const flat1 = d.FlatFilteredEntities;
        const flat2 = d.FlatFilteredEntities;
        expect(flat2).toBe(flat1);

        d.RecentRecords = [
            { entityId: ids[0], entityName: 'E1', compositeKeyString: 'ID|1', recordName: 'R1', latestAt: new Date(), totalOpens: 1 },
            { entityId: ids[1], entityName: 'E2', compositeKeyString: 'ID|2', recordName: 'R2', latestAt: new Date(), totalOpens: 2 },
        ];
        d.RecentRecordsEntityFilter = ids[0];
        const rec1 = d.FilteredRecentRecords;
        const rec2 = d.FilteredRecentRecords;
        expect(rec2).toBe(rec1);
        expect(rec1).toHaveLength(1);
    });
});
