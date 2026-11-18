/**
 * MJ-RUN-37 — the schema-evolution path DETECTED a watermark-field change and then ignored it.
 *
 * `UpsertObject` has always overlaid `IntegrationObject.IncrementalWatermarkField` from the
 * connector and pushed the literal `'IncrementalWatermarkField'` onto a local `changes` array. That
 * array was logged and discarded. The evolution's `changedObjects` — the thing that drives
 * `ResetPullWatermarks` — was built from a physical column diff and a field-map add/disable, and a
 * cursor swap produces NEITHER: no column moves, no field map changes. So the object read as
 * unchanged, its Pull watermark survived, and the next incremental sync applied the OLD column's
 * stored value as a lower bound on the NEW column.
 *
 * Where the new column sorts later than the old one, every row below that value is filtered out at
 * the SOURCE and never fetched again. That is worse than a duplicate-row defect, because it
 * produces absence and absence leaves no artifact: on an incremental the source reports a total
 * consistent with the filter it was handed, so fetched equals expected and the run closes clean.
 *
 * These pin the decision the evolution now consumes. The counterpart matters as much as the
 * defect — a watermark reset costs a full re-fetch, so a rule that fires when nothing relevant
 * changed turns every refresh into a fleet-wide full sync.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ObjectChangedAttributes,
    ObjectsWithWatermarkFieldChange,
    WATERMARK_INVALIDATING_ATTRIBUTES,
    decideSemanticOverlay,
    type ObjectMergeLog,
} from '../IntegrationSchemaSync';

const entry = (over: Partial<ObjectMergeLog> & { ObjectName: string }): ObjectMergeLog => ({
    EffectiveSource: 'Declared',
    Created: false,
    Updated: false,
    ChangedAttributes: [],
    ...over,
});

describe('the detection the persist layer already performs', () => {
    // The evidence that detection was never the missing half: this is the exact call UpsertObject
    // makes, and it has always reported the swap.
    it('a connector that moves the cursor to a different column reports a change', () => {
        const r = decideSemanticOverlay('modified_at', 'last_updated');
        expect(r.changed).toBe(true);
        expect(r.value).toBe('last_updated');
    });

    it('a silent connector does not — the curated cursor stands', () => {
        expect(decideSemanticOverlay('modified_at', undefined).changed).toBe(false);
        expect(decideSemanticOverlay('modified_at', '').changed).toBe(false);
    });
});

describe('ObjectsWithWatermarkFieldChange', () => {
    it('names the object whose watermark FIELD was rewritten', () => {
        expect(ObjectsWithWatermarkFieldChange([
            entry({ ObjectName: 'Attendees', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] }),
        ])).toEqual(['Attendees']);
    });

    it('finds it alongside other rewritten attributes, not only on its own', () => {
        expect(ObjectsWithWatermarkFieldChange([
            entry({
                ObjectName: 'Sessions',
                Updated: true,
                ChangedAttributes: ['Description', 'IncrementalWatermarkField', 'DisplayName'],
            }),
        ])).toEqual(['Sessions']);
    });

    // ── the over-fire guard. Each of these would re-full-sync an object for no reason. ──

    it('an object whose OTHER attributes moved is NOT a watermark change', () => {
        expect(ObjectsWithWatermarkFieldChange([
            entry({ ObjectName: 'Deals', Updated: true, ChangedAttributes: ['Description', 'DisplayName'] }),
            entry({ ObjectName: 'Tickets', Updated: true, ChangedAttributes: ['Status:reactivated'] }),
        ])).toEqual([]);
    });

    it('`Updated` alone is not enough — it says THAT something moved, not WHAT', () => {
        expect(ObjectsWithWatermarkFieldChange([
            entry({ ObjectName: 'Contacts', Updated: true, ChangedAttributes: [] }),
        ])).toEqual([]);
    });

    it('an unchanged run resets nothing', () => {
        expect(ObjectsWithWatermarkFieldChange([
            entry({ ObjectName: 'Contacts' }),
            entry({ ObjectName: 'Companies' }),
        ])).toEqual([]);
        expect(ObjectsWithWatermarkFieldChange([])).toEqual([]);
    });

    it('a CREATED object is never a change — there is no watermark to invalidate yet', () => {
        expect(ObjectsWithWatermarkFieldChange([
            entry({ ObjectName: 'NewThing', Created: true, ChangedAttributes: ['IncrementalWatermarkField'] }),
        ])).toEqual([]);
    });

    it('tolerates a log entry built before ChangedAttributes existed rather than throwing', () => {
        const legacy = { ObjectName: 'Old', EffectiveSource: 'Declared', Created: false, Updated: true } as ObjectMergeLog;
        expect(ObjectsWithWatermarkFieldChange([legacy])).toEqual([]);
    });
});

describe('ObjectsWithWatermarkFieldChange — restrictTo (the evolution passes its CONTINUING maps)', () => {
    it('drops an object that has no continuing entity map — nothing this run can reset', () => {
        expect(ObjectsWithWatermarkFieldChange(
            [entry({ ObjectName: 'Removed', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] })],
            ['Attendees', 'Sessions'],
        )).toEqual([]);
    });

    it('keeps the ones that do', () => {
        expect(ObjectsWithWatermarkFieldChange(
            [
                entry({ ObjectName: 'Attendees', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] }),
                entry({ ObjectName: 'Removed', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] }),
            ],
            ['Attendees'],
        )).toEqual(['Attendees']);
    });

    it('matches case-insensitively, as every catalog-to-map reconciliation does', () => {
        expect(ObjectsWithWatermarkFieldChange(
            [entry({ ObjectName: 'Attendees', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] })],
            ['attendees'],
        )).toEqual(['Attendees']);
    });

    it('an EMPTY restriction is an empty answer, not "no restriction"', () => {
        // The distinction that stops a connection with zero continuing maps from resetting the
        // watermark of every object in the catalog.
        expect(ObjectsWithWatermarkFieldChange(
            [entry({ ObjectName: 'Attendees', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] })],
            [],
        )).toEqual([]);
    });

    it('an omitted restriction still answers, so the helper is usable outside the evolution', () => {
        expect(ObjectsWithWatermarkFieldChange(
            [entry({ ObjectName: 'Attendees', Updated: true, ChangedAttributes: ['IncrementalWatermarkField'] })],
        )).toEqual(['Attendees']);
    });
});

describe('WATERMARK_INVALIDATING_ATTRIBUTES', () => {
    it('is the cursor field, spelled exactly as UpsertObject records it', () => {
        // A typo here is silent: the helper would simply never match and the defect would return
        // with a green suite. Pinned against the literal the persist layer pushes.
        expect([...WATERMARK_INVALIDATING_ATTRIBUTES]).toEqual(['IncrementalWatermarkField']);
    });
});

/**
 * `UpsertObject` is a private static that needs a metadata provider, a context user and a live
 * IntegrationEngine cache to invoke, and the property under test is one assignment. Read from
 * source instead — the point is only that the array the overlay builds is the array that LEAVES the
 * function, which is the single join the defect was missing.
 */
describe('the persist layer RETURNS what it detects', () => {
    const SRC = readFileSync(join(__dirname, '..', 'IntegrationSchemaSync.ts'), 'utf-8');

    it('records the cursor swap on the changes array', () => {
        expect(SRC).toMatch(/changes\.push\('IncrementalWatermarkField'\)/);
    });

    it('and hands it out as ChangedAttributes, instead of only logging it', () => {
        // Built from that same array (and the declaration rebase) by ObjectChangedAttributes, below.
        expect(SRC).toMatch(/ObjectChangedAttributes\(rebased, changes, watermarkBefore, existing\.IncrementalWatermarkField \?\? null\)/);
        expect(SRC).toMatch(/EffectiveSource: 'Declared', ChangedAttributes: changedAttributes/);
    });

    it('carries it onto the per-object merge log the caller reads', () => {
        expect(SRC).toMatch(/ChangedAttributes: r\.ChangedAttributes/);
    });
});

/**
 * On a per-connection row the upsert first REBASES the row from its declaration (which can move the
 * watermark column) and then overlays discovery (which can move it back). Both steps are logged, so
 * the step list can show a watermark "change" that left the row exactly as it was, or record a real
 * one only under its `rebased:` summary. ChangedAttributes nets it instead.
 */
describe('ObjectChangedAttributes — the watermark counts on its NET change', () => {
    it('a declaration that moves the cursor column IS a change, so the stored cursor gets reset', () => {
        const changed = ObjectChangedAttributes(['APIPath', 'IncrementalWatermarkField'], ['rebased:APIPath/IncrementalWatermarkField'], 'created_at', 'updated_at');
        expect(changed).toContain('IncrementalWatermarkField');
        expect(ObjectsWithWatermarkFieldChange([entry({ ObjectName: 'Invoice', Updated: true, ChangedAttributes: changed })])).toEqual(['Invoice']);
    });

    it('a rebase the overlay undoes is NOT a change, so a refresh does not re-fetch the object in full', () => {
        // Declared says created_at, discovery keeps reporting updated_at: the rebase moves it, the overlay moves it back.
        const changed = ObjectChangedAttributes(['IncrementalWatermarkField'], ['rebased:IncrementalWatermarkField', 'IncrementalWatermarkField'], 'updated_at', 'updated_at');
        expect(changed).not.toContain('IncrementalWatermarkField');
        expect(ObjectsWithWatermarkFieldChange([entry({ ObjectName: 'Invoice', Updated: true, ChangedAttributes: changed })])).toEqual([]);
    });

    it('a discovery-only cursor swap is still a change, exactly as on the shared catalog', () => {
        expect(ObjectChangedAttributes([], ['IncrementalWatermarkField'], 'created_at', 'updated_at')).toEqual(['IncrementalWatermarkField']);
    });

    it('names the rebased columns themselves, not the `rebased:` summary', () => {
        expect(ObjectChangedAttributes(['APIPath', 'DefaultPageSize'], ['rebased:APIPath/DefaultPageSize', 'Description'], 'id', 'id'))
            .toEqual(['APIPath', 'DefaultPageSize', 'Description']);
    });
});
