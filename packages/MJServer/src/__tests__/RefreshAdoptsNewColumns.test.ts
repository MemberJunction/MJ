import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideFieldMapReconcile } from '../integration/EntityMapLifecycle.js';

/**
 * A REFRESH adopts the source's current shape: new objects and new columns both arrive ENABLED.
 *
 * That is the deliberate asymmetry with SYNC-discovered columns, which are only ever *suggested* —
 * captured as candidates with their statistics and requiring acceptance before any DDL runs. A
 * refresh is an explicit act; a sync is not, and must not reshape the schema on its own.
 *
 * `autoEnableNewColumns: false` (and `autoEnableNewObjects: false`) exist for a connection that
 * wants to review a refresh's additions before they sync.
 */
const fm = (SourceFieldName: string, Status: string) => ({ SourceFieldName, Status });

describe('decideFieldMapReconcile — a refresh adopts new columns', () => {
    it('creates a new column ENABLED on an enabled map, by default', () => {
        const plan = decideFieldMapReconcile(['id', 'brand_new_col'], [fm('id', 'Active')], true);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Active' }]);
        expect(plan.Enable).toEqual([]);
        expect(plan.Disable).toEqual([]);
    });

    it('autoEnableNewColumns:false gates it for a connection that wants to review first', () => {
        const plan = decideFieldMapReconcile(['id', 'brand_new_col'], [fm('id', 'Active')], true, false);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Inactive' }]);
    });

    it('a DISABLED map never gets an Active column — the map always bounds the column', () => {
        // Adopting new columns must not resurrect a map the user switched off.
        const plan = decideFieldMapReconcile(['brand_new_col'], [], false, true);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Inactive' }]);
    });
});

describe('decideFieldMapReconcile — retiring and restoring are both non-destructive', () => {
    it('a RE-ADDED column returns to Active even when new columns are gated', () => {
        // That row is not new — it was disabled because the source stopped reporting the column, so
        // it returns to the state it had. Gating it would silently demote a column the user chose to
        // sync whenever the source flickered.
        const plan = decideFieldMapReconcile(['came_back'], [fm('came_back', 'Inactive')], true, false);
        expect(plan.Enable).toEqual(['came_back']);
        expect(plan.Create).toEqual([]);   // reuses the row, never mints a second one
    });

    it('a column absent from the resolution is DISABLED, never deleted', () => {
        const plan = decideFieldMapReconcile(['kept'], [fm('kept', 'Active'), fm('vanished', 'Active')], true);
        expect(plan.Disable).toEqual(['vanished']);
        expect(plan.Enable).toEqual([]);   // survivor untouched
    });

    it('does not re-enable anything while the map itself is disabled', () => {
        const plan = decideFieldMapReconcile(['came_back'], [fm('came_back', 'Inactive')], false);
        expect(plan.Enable).toEqual([]);
    });

    it('matches source field names case-insensitively on both sides', () => {
        const plan = decideFieldMapReconcile(['ID', 'Name'], [fm('id', 'Active'), fm('name', 'Active')], true);
        expect(plan.Create).toEqual([]);
        expect(plan.Disable).toEqual([]);
    });
});

describe('refresh adopts, sync only suggests — the defaults that encode it', () => {
    // The asymmetry is the whole design and it lives in three default values across two files, so
    // nothing else would catch a drift. Source-level because these are decorator/GraphQL argument
    // defaults and the resolver cannot be imported in a unit test (it pulls in schema-builder and
    // schema-engine, which are not built here).
    const resolver = readFileSync(
        join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf8');
    const promoter = readFileSync(
        join(__dirname, '..', 'integration', 'CustomColumnPromoter.ts'), 'utf8');

    it('a REFRESH auto-enables new objects', () => {
        expect(resolver).toMatch(/@Arg\("autoEnableNewObjects",\s*\{\s*defaultValue:\s*true/);
    });

    it('a REFRESH auto-enables new columns', () => {
        expect(resolver).toMatch(/@Arg\("autoEnableNewColumns",\s*\{\s*defaultValue:\s*true/);
    });

    it('a SYNC never auto-creates a column — it captures a candidate and waits for acceptance', () => {
        // A column first seen mid-sync is the one case that must NOT reshape the schema on its own:
        // a sync is not a deliberate act. Promotion reads an explicit opt-in that defaults to false.
        expect(promoter).toMatch(/autoPromoteCustomColumns\s*===\s*true/);
        expect(promoter).not.toMatch(/autoPromoteCustomColumns\s*!==\s*false/);
    });
});
