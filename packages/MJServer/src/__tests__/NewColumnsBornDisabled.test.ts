import { describe, it, expect } from 'vitest';
import { decideFieldMapReconcile } from '../integration/EntityMapLifecycle.js';

/**
 * A NEW COLUMN is a schema change and waits for the user, exactly as a NEW OBJECT does.
 *
 * New objects were already gated (`autoEnableNewObjects`, default false); new COLUMNS inherited the
 * entity map's enabled state outright, so a column appearing on an object already being synced
 * started syncing immediately with no decision from anyone and no flag to control it.
 */
const fm = (SourceFieldName: string, Status: string) => ({ SourceFieldName, Status });

describe('decideFieldMapReconcile — a new column waits for the user', () => {
    it('creates a new column DISABLED on an ENABLED map by default', () => {
        const plan = decideFieldMapReconcile(['id', 'brand_new_col'], [fm('id', 'Active')], true, false);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Inactive' }]);
        expect(plan.Enable).toEqual([]);
        expect(plan.Disable).toEqual([]);
    });

    it('autoEnableNewColumns opts in, mirroring autoEnableNewObjects', () => {
        const plan = decideFieldMapReconcile(['id', 'brand_new_col'], [fm('id', 'Active')], true, true);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Active' }]);
    });

    it('a DISABLED map never gets an Active column, even with the flag on', () => {
        // The map's own state bounds the column's: enabling new columns must not resurrect a map
        // the user turned off.
        const plan = decideFieldMapReconcile(['brand_new_col'], [], false, true);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Inactive' }]);
    });
});

describe('decideFieldMapReconcile — retiring and restoring are both non-destructive', () => {
    it('a RE-ADDED column returns to Active, ungated by the new-column flag', () => {
        // That row is not new — it was disabled because the source stopped reporting the column.
        // Gating it would silently demote a column the user chose to sync whenever the source
        // flickered.
        const plan = decideFieldMapReconcile(['came_back'], [fm('came_back', 'Inactive')], true, false);
        expect(plan.Enable).toEqual(['came_back']);
        expect(plan.Create).toEqual([]);   // reuses the row, never mints a second one
    });

    it('a column absent from the resolution is DISABLED, never deleted', () => {
        const plan = decideFieldMapReconcile(['kept'], [fm('kept', 'Active'), fm('vanished', 'Active')], true, false);
        expect(plan.Disable).toEqual(['vanished']);
        expect(plan.Enable).toEqual([]);   // survivor untouched
    });

    it('does not re-enable anything while the map itself is disabled', () => {
        const plan = decideFieldMapReconcile(['came_back'], [fm('came_back', 'Inactive')], false, false);
        expect(plan.Enable).toEqual([]);
    });

    it('matches source field names case-insensitively on both sides', () => {
        const plan = decideFieldMapReconcile(['ID', 'Name'], [fm('id', 'Active'), fm('name', 'Active')], true, false);
        expect(plan.Create).toEqual([]);
        expect(plan.Disable).toEqual([]);
    });
});
