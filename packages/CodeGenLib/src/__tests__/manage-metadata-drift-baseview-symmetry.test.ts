import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { evaluateMaterializationDrift } from '../Database/materializationDrift';
import type { EntityInfo, Metadata } from '@memberjunction/core';
import type { CodeGenConnection, CodeGenQueryRow } from '../Database/codeGenDatabaseProvider';

/**
 * MINT/DRIFT COLUMN-SET SYMMETRY for base-view materializations.
 *
 * The mint builds an EXTERNAL entity's snapshot from its NON-VIRTUAL fields only (virtual fields are
 * MJ-computed and absent from the remote source, so the refresh mirror cannot populate them). Drift then
 * compares "what the entity has now" against "what the snapshot actually holds" — and it used to build the
 * first half from the entity's UNFILTERED field list.
 *
 * The result was self-inflicted and terminal: every external base-view materialization of an entity holding
 * even one virtual field looked drifted on its VERY FIRST drift scan after minting, with the virtual fields
 * reported as `added`. That set Status='DriftHold' — and held rows are excluded from the drift sweep's
 * `WHERE Status NOT IN ('DriftHold', ...)`, so the materialization could never be re-examined and never
 * recovered. It silently fell back to live forever, having never actually drifted.
 *
 * Both halves of the comparison now come from the one predicate (`materializedEntityFields`). These tests
 * pin that: they drive the REAL `gatherDriftFacts` and feed its output to the REAL
 * `evaluateMaterializationDrift`, so a regression in either the predicate or the site that calls it fails
 * here rather than in a codegen run against a live external data source.
 */

/** The only `EntityInfo` surface the predicate and the fact-gatherer read. */
type FieldStub = { Name: string; IsVirtual: boolean };
const entity = (opts: { external: boolean; fields: FieldStub[] }): EntityInfo =>
    ({
        Name: 'Ext',
        ID: 'e1',
        ExternalDataSourceID: opts.external ? 'eds-1' : null,
        Fields: opts.fields,
    }) as unknown as EntityInfo;

/** Metadata stub — `gatherDriftFacts`' base-view branch reads nothing but `EntityByID`. */
const metadataWith = (e: EntityInfo | undefined): Metadata => ({ EntityByID: () => e }) as unknown as Metadata;

const FAKE_POOL = {} as unknown as CodeGenConnection;

class TestableDriftSymmetry extends ManageMetadataBase {
    /** The snapshot table's ACTUAL columns, as INFORMATION_SCHEMA would report them. */
    public snapshotColumns: string[] = [];

    /** Stubbed so no DB is needed; this is the "what was actually built" half of the comparison. */
    protected async getMaterializedTableColumns(): Promise<string[]> {
        return this.snapshotColumns;
    }

    /** Exposes the protected single-rule predicate. */
    public fieldsFor(e: EntityInfo): string[] {
        return this.materializedEntityFields(e).map((f) => f.Name);
    }

    /** Drives the REAL base-view fact-gatherer for a resolved source entity. */
    public gather(e: EntityInfo | undefined): Promise<ReturnType<ManageMetadataBase['gatherDriftFacts']>> {
        const row = { SourceType: 'EntityBaseView', SourceEntityID: 'e1', SchemaName: '__mj', TableName: 'materialized_Ext' } as unknown as CodeGenQueryRow;
        return this.gatherDriftFacts(FAKE_POOL, metadataWith(e), row, '__mj');
    }
}

describe('materializedEntityFields — the single mint/drift/refresh column rule', () => {
    const mm = new TestableDriftSymmetry();

    it('DROPS virtual fields for an EXTERNAL entity (the remote source cannot supply them)', () => {
        const e = entity({ external: true, fields: [{ Name: 'ID', IsVirtual: false }, { Name: 'Total', IsVirtual: false }, { Name: 'OwnerName', IsVirtual: true }] });
        expect(mm.fieldsFor(e)).toEqual(['ID', 'Total']);
    });

    it('KEEPS virtual fields for a LOCAL entity (its base view computes them, so SELECT * includes them)', () => {
        const e = entity({ external: false, fields: [{ Name: 'ID', IsVirtual: false }, { Name: 'OwnerName', IsVirtual: true }] });
        expect(mm.fieldsFor(e)).toEqual(['ID', 'OwnerName']);
    });
});

describe('base-view drift — mint and drift must compare the same column set', () => {
    it('REGRESSION: an external entity with a virtual field does NOT drift against its own snapshot', async () => {
        // Exactly the post-mint steady state: the snapshot holds the non-virtual columns the mint built,
        // the entity still declares its virtual field, and nothing has changed. This must be quiet.
        const mm = new TestableDriftSymmetry();
        mm.snapshotColumns = ['ID', 'Total'];
        const facts = await mm.gather(entity({ external: true, fields: [{ Name: 'ID', IsVirtual: false }, { Name: 'Total', IsVirtual: false }, { Name: 'OwnerName', IsVirtual: true }] }));

        expect(facts.baseView?.currentEntityFields).toEqual(['ID', 'Total']); // virtual excluded — symmetric with the mint
        expect(evaluateMaterializationDrift(facts)).toEqual({ drift: false });
    });

    it('documents the OLD behavior: the unfiltered field list flags the virtual field as added, and holds forever', () => {
        // Not a test of current code — it pins WHY the fix matters, by running the evaluator on the fact
        // shape the pre-fix gatherer produced. DriftHold here is terminal: held rows are excluded from the
        // sweep, so this verdict could never be revisited.
        const verdict = evaluateMaterializationDrift({
            sourceType: 'EntityBaseView',
            baseView: { sourceEntityExists: true, currentEntityFields: ['ID', 'Total', 'OwnerName'], materializedColumns: ['ID', 'Total'] },
        });
        expect(verdict.drift).toBe(true);
        expect(verdict.reason).toMatch(/ownername/i);
    });

    it('a LOCAL base view whose snapshot INCLUDES the virtual column also does not drift', async () => {
        // The mirror image: the fix must not over-filter. A local base view materializes its computed
        // columns, so dropping them here would report them as orphaned and hold the materialization instead.
        const mm = new TestableDriftSymmetry();
        mm.snapshotColumns = ['ID', 'OwnerName'];
        const facts = await mm.gather(entity({ external: false, fields: [{ Name: 'ID', IsVirtual: false }, { Name: 'OwnerName', IsVirtual: true }] }));

        expect(facts.baseView?.currentEntityFields).toEqual(['ID', 'OwnerName']);
        expect(evaluateMaterializationDrift(facts)).toEqual({ drift: false });
    });

    it('STILL detects real drift: a new NON-virtual field on an external entity', async () => {
        // The guard that keeps this fix from being a stealth drift-disable — a genuine schema change on the
        // source must still be caught.
        const mm = new TestableDriftSymmetry();
        mm.snapshotColumns = ['ID', 'Total'];
        const facts = await mm.gather(entity({ external: true, fields: [{ Name: 'ID', IsVirtual: false }, { Name: 'Total', IsVirtual: false }, { Name: 'Currency', IsVirtual: false }, { Name: 'OwnerName', IsVirtual: true }] }));

        const verdict = evaluateMaterializationDrift(facts);
        expect(verdict.drift).toBe(true);
        expect(verdict.reason).toMatch(/currency/i);
        expect(verdict.reason).not.toMatch(/ownername/i); // the virtual field is still not the reason
    });

    it('STILL detects real drift: a column dropped from the source entity leaves the snapshot orphaned', async () => {
        const mm = new TestableDriftSymmetry();
        mm.snapshotColumns = ['ID', 'Total', 'LegacyCode'];
        const facts = await mm.gather(entity({ external: true, fields: [{ Name: 'ID', IsVirtual: false }, { Name: 'Total', IsVirtual: false }] }));

        const verdict = evaluateMaterializationDrift(facts);
        expect(verdict.drift).toBe(true);
        expect(verdict.reason).toMatch(/legacycode/i);
    });

    it('a source entity that no longer resolves is drift, regardless of fields', async () => {
        const mm = new TestableDriftSymmetry();
        const facts = await mm.gather(undefined);
        expect(facts.baseView?.sourceEntityExists).toBe(false);
        expect(evaluateMaterializationDrift(facts)).toEqual({ drift: true, reason: 'source entity no longer exists' });
    });
});
