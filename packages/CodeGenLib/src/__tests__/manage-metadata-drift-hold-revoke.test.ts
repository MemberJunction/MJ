import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import type { Metadata } from '@memberjunction/core';
import type { CodeGenConnection, CodeGenQueryResult, CodeGenQueryRow } from '../Database/codeGenDatabaseProvider';
import type { MaterializationDriftFacts } from '../Database/materializationDrift';

/**
 * Tests the FAIL-CLOSED read-grant revoke on ANY hold of a QUERY materialization — `evaluateAndHoldDriftRow`
 * (extracted from `detectMaterializationDrift`).
 *
 * Why it exists: once a query mat is held, it drops out of `detectMaterializationDrift`'s
 * `WHERE Status NOT IN ('DriftHold', ...)` scan FOREVER, so the C1 RLS re-check and C2 grant re-narrow never
 * run for it again. A query virtual entity's reads are NOT status-gated (they always read `materialized_vw…`),
 * so a still-readable held snapshot whose source LATER gains RLS (or whose role loses source read) would leak
 * the full unscoped rows. The fix: revoke read on the hold for QUERY mats (base-view mats re-apply source RLS
 * at read time via the status-gated effective base view, so they have no minted grant to flip).
 *
 * Seam: the DB-touching methods are protected/private, so a structural subclass overrides the protected seams
 * and a tiny fake pool satisfies the private `LogSQLAndExecute` (which only calls `ds.query`; the SQL-log append
 * no-ops with no active logging session). No pool/provider/DB needed — same spirit as the sibling RLS tests.
 */

/** One drift-loop row, shaped to what `evaluateAndHoldDriftRow` reads. */
interface DriftRow {
    ID: string;
    SourceType: 'Query' | 'EntityBaseView';
    SourceQueryID?: string | null;
    SourceEntityID?: string | null;
    GeneratedEntityID?: string | null;
    SchemaName?: string;
    TableName: string;
}

const FAKE_POOL = { query: async (): Promise<CodeGenQueryResult> => ({ recordset: [] } as CodeGenQueryResult) } as unknown as CodeGenConnection;

const QUERY_DRIFT: MaterializationDriftFacts = {
    sourceType: 'Query',
    query: { missingSourceEntities: [], missingSourceFields: ['SomeEntity.removedField'], missingComposedQueries: [], currentOutputColumns: [], materializedColumns: [] },
};
const QUERY_NO_DRIFT: MaterializationDriftFacts = {
    sourceType: 'Query',
    query: { missingSourceEntities: [], missingSourceFields: [], missingComposedQueries: [], currentOutputColumns: [], materializedColumns: [] },
};
const BASEVIEW_DRIFT: MaterializationDriftFacts = {
    sourceType: 'EntityBaseView',
    baseView: { sourceEntityExists: true, currentEntityFields: ['a', 'b'], materializedColumns: ['a'] },
};

class TestableDriftHold extends ManageMetadataBase {
    public revokeCalls: Array<{ entityId: string; reason: string }> = [];
    /** Toggle the C1 RLS verdict to drive either the RLS-drift branch or the shape-drift branch. */
    public rlsSafe = true;
    /** Facts the (stubbed) drift-fact gatherer returns → fed to the real `evaluateMaterializationDrift`. */
    public facts: MaterializationDriftFacts = QUERY_NO_DRIFT;

    protected get dialect(): SQLDialect {
        return new SQLServerDialect();
    }

    protected assessQuerySourceRLSSafety(): { safe: boolean; reason?: string } {
        return this.rlsSafe ? { safe: true } : { safe: false, reason: 'forced-unsafe (test)' };
    }
    protected async runQueryWithParams(): Promise<CodeGenQueryResult> {
        return { recordset: [] } as CodeGenQueryResult;
    }
    protected async reconcileMaterializedQueryEntityReadGrants(): Promise<number> {
        return 0;
    }
    protected async gatherDriftFacts(): Promise<MaterializationDriftFacts> {
        return this.facts;
    }
    /** Spy: record the revoke instead of writing to a DB. */
    protected async revokeMaterializedEntityReadAccess(_pool: CodeGenConnection, entityId: string, _label: string, reason: string): Promise<void> {
        this.revokeCalls.push({ entityId, reason });
    }

    public run(r: DriftRow): Promise<boolean> {
        // EntityByID → undefined keeps the base-view external-RLS block a no-op, so a base-view row falls
        // through to the generic shape-drift branch (the branch these tests assert on).
        const md = { EntityByID: () => undefined } as unknown as Metadata;
        return this.evaluateAndHoldDriftRow(FAKE_POOL, md, r as CodeGenQueryRow, '__mj');
    }
}

describe('evaluateAndHoldDriftRow — fail-closed read-grant revoke on hold', () => {
    let mm: TestableDriftHold;
    beforeEach(() => {
        mm = new TestableDriftHold();
    });

    it('REVOKES read on a query mat held for shape/provenance drift (RLS still safe) — closes the leak window', async () => {
        mm.rlsSafe = true;
        mm.facts = QUERY_DRIFT;
        const held = await mm.run({ ID: 'm1', SourceType: 'Query', SourceQueryID: 'q1', GeneratedEntityID: 'gen-1', TableName: 'materialized_Foo' });
        expect(held).toBe(true);
        expect(mm.revokeCalls).toHaveLength(1);
        expect(mm.revokeCalls[0].entityId).toBe('gen-1');
        expect(mm.revokeCalls[0].reason).toMatch(/drift hold/i);
    });

    it('does NOT revoke when a query mat has NO drift (stays Active, grants intact)', async () => {
        mm.rlsSafe = true;
        mm.facts = QUERY_NO_DRIFT;
        const held = await mm.run({ ID: 'm2', SourceType: 'Query', SourceQueryID: 'q1', GeneratedEntityID: 'gen-2', TableName: 'materialized_Bar' });
        expect(held).toBe(false);
        expect(mm.revokeCalls).toHaveLength(0);
    });

    it('cannot revoke a drift-held query mat that has no minted entity id (still holds; no grant row to flip)', async () => {
        mm.rlsSafe = true;
        mm.facts = QUERY_DRIFT;
        const held = await mm.run({ ID: 'm3', SourceType: 'Query', SourceQueryID: 'q1', GeneratedEntityID: null, TableName: 'materialized_Baz' });
        expect(held).toBe(true);
        expect(mm.revokeCalls).toHaveLength(0);
    });

    it('does NOT revoke a base-view mat held for drift (base-view reads re-apply source RLS via the status-gated effective base view)', async () => {
        mm.rlsSafe = true;
        mm.facts = BASEVIEW_DRIFT;
        const held = await mm.run({ ID: 'm4', SourceType: 'EntityBaseView', SourceEntityID: 'be1', GeneratedEntityID: 'gen-4', TableName: 'materialized_Qux' });
        expect(held).toBe(true);
        expect(mm.revokeCalls).toHaveLength(0);
    });

    it('still revokes on the C1 RLS-drift branch (regression guard — the pre-existing revoke path is intact)', async () => {
        mm.rlsSafe = false; // source now RLS-unsafe
        mm.facts = QUERY_NO_DRIFT; // irrelevant — the RLS branch returns before the shape check
        const held = await mm.run({ ID: 'm5', SourceType: 'Query', SourceQueryID: 'q1', GeneratedEntityID: 'gen-5', TableName: 'materialized_Sec' });
        expect(held).toBe(true);
        expect(mm.revokeCalls).toHaveLength(1);
        expect(mm.revokeCalls[0].entityId).toBe('gen-5');
        expect(mm.revokeCalls[0].reason).toMatch(/forced-unsafe/i);
    });
});
