import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideFieldMapReconcile } from '../integration/EntityMapLifecycle.js';

/**
 * A REFRESH REPORTS the source's current shape; it does not adopt it. New objects and new columns
 * are created but arrive DISABLED, and the user turns them on.
 *
 * everything.txt: "we create entity maps for all objects that are determined as things that should
 * be now added but arent, we enable nothing (because the user needs to, after the refresh, then go
 * turn them on)". plan.md says the same for a schema refresh: "New tables are default deselected
 * during schema refresh, and same with columns."
 *
 * This file previously asserted the OPPOSITE, and that is how the regression survived: the flip to
 * auto-adopt was pinned by a test whose own premise contradicted the spec. Its stated reason was
 * that a disabled new object never reached a migration, which is false — CreateDisabled governs
 * only the entity/field MAP status, the IntegrationObject row is written Active regardless, and
 * phase 4 evolves over continuing + new objects either way. The table is always created; the flag
 * only decides whether it starts SYNCING unasked.
 *
 * The asymmetry with SYNC-discovered columns still holds and is sharper now: a sync never creates
 * anything, it only captures a candidate for acceptance.
 */
const fm = (SourceFieldName: string, Status: string) => ({ SourceFieldName, Status });

describe('decideFieldMapReconcile — a refresh reports new columns, disabled', () => {
    it('creates a new column DISABLED on an enabled map, by default', () => {
        const plan = decideFieldMapReconcile(['id', 'brand_new_col'], [fm('id', 'Active')], true);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Inactive' }]);
        expect(plan.Enable).toEqual([]);
        expect(plan.Disable).toEqual([]);
    });

    it('autoEnableNewColumns:true is the explicit opt-in for a connection that wants adoption', () => {
        const plan = decideFieldMapReconcile(['id', 'brand_new_col'], [fm('id', 'Active')], true, true);
        expect(plan.Create).toEqual([{ SourceFieldName: 'brand_new_col', Status: 'Active' }]);
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

    it('a REFRESH creates new objects DISABLED', () => {
        expect(resolver).toMatch(/@Arg\("autoEnableNewObjects",\s*\{\s*defaultValue:\s*false/);
    });

    it('a REFRESH creates new columns DISABLED', () => {
        expect(resolver).toMatch(/@Arg\("autoEnableNewColumns",\s*\{\s*defaultValue:\s*false/);
    });

    it('a SYNC never auto-creates a column — it captures a candidate and waits for acceptance', () => {
        // A column first seen mid-sync is the one case that must NOT reshape the schema on its own:
        // a sync is not a deliberate act. Promotion reads an explicit opt-in that defaults to false.
        expect(promoter).toMatch(/autoPromoteCustomColumns\s*===\s*true/);
        expect(promoter).not.toMatch(/autoPromoteCustomColumns\s*!==\s*false/);
    });
});
