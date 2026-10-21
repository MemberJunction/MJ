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
});
