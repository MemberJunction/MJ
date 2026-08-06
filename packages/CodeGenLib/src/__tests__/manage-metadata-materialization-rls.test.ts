import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import type { Metadata, EntityInfo } from '@memberjunction/core';

/**
 * Tests for the query-materialization RLS-safety decision (`assessQuerySourceRLSSafety`), the guard shared by
 * the mint-time gate and the per-CodeGen-run drift re-check (plan §6.2 / §10). It decides whether a query is
 * safe to materialize as an UNSCOPED snapshot: safe only when every source entity resolves and none carries a
 * read RLS filter. It must FAIL CLOSED — a query it cannot fully prove RLS-free must be refused (or an existing
 * materialization held), because serving a protected source's rows unscoped is the exact leak the guard exists
 * to prevent. The method reads only `md.EntityByID(id)` → `{ Name, Permissions[] }`, so a light structural stub
 * is a faithful test seam (no DB / provider / config needed) — the same seam the sibling guard tests use.
 */

/** Minimal source-entity shape the guard actually inspects. The P1 under-linking gate additionally reads
 *  ID / SchemaName / BaseView / BaseTable when mapping a parsed table ref back to an entity. */
type FakePermission = { ReadRLSFilterID?: string | null };
type FakeEntity = { Name: string; Permissions: FakePermission[]; ID?: string; SchemaName?: string; BaseView?: string; BaseTable?: string };

class TestableRLS extends ManageMetadataBase {
    /** Override the platform dialect so the P1 SQL-parsing branch works on a bare instance (no DB provider). */
    protected get dialect(): SQLDialect {
        return new SQLServerDialect();
    }

    /** Exposes the protected guard, taking a structural stub for the entity-by-id lookup. The optional `sql`
     *  drives the P1 under-linking gate; when given, the stub also exposes `md.Entities` (the P1 mapper scans it). */
    public assess(entities: Record<string, FakeEntity>, ids: string[], sql?: string): { safe: boolean; reason?: string } {
        // Ensure each stub entity carries its own map-key as ID (the P1 gate compares entity.ID to the linked set).
        const withIds: Record<string, FakeEntity> = {};
        for (const [id, e] of Object.entries(entities)) withIds[id] = { ID: id, ...e };
        // Structural stub of the only Metadata surfaces the guard touches. Cast once at the test seam.
        const md = {
            EntityByID: (id: string): FakeEntity | undefined => withIds[id],
            Entities: Object.values(withIds),
        } as unknown as Metadata;
        return this.assessQuerySourceRLSSafety(md, ids, sql);
    }

    /** Exposes the RLS detector the base-view leak gate (Leak 1) uses to refuse external RLS mirrors. */
    public hasRLS(entity: FakeEntity): boolean {
        return this.entityHasRowLevelSecurity(entity as unknown as EntityInfo);
    }
}

describe('assessQuerySourceRLSSafety — query materialization RLS gate', () => {
    let mm: TestableRLS;
    beforeEach(() => {
        mm = new TestableRLS();
    });

    const noRls: FakeEntity = { Name: 'Orders', Permissions: [{ ReadRLSFilterID: null }, { ReadRLSFilterID: '' }] };
    const rlsProtected: FakeEntity = { Name: 'Salaries', Permissions: [{ ReadRLSFilterID: '11111111-1111-1111-1111-111111111111' }] };

    it('fails closed with NO source provenance (empty id list) — cannot prove RLS-free', () => {
        const v = mm.assess({}, []);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/no source-entity provenance/i);
    });

    it('fails closed on an UNRESOLVABLE link (id not in metadata) — its RLS status is unknowable', () => {
        const v = mm.assess({ e1: noRls }, ['e1', 'ghost']);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/do not resolve/i);
        expect(v.reason).toContain('ghost');
    });

    it('fails closed when ANY resolved source carries a read RLS filter (names the entity)', () => {
        const v = mm.assess({ e1: noRls, e2: rlsProtected }, ['e1', 'e2']);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/read-RLS-protected/i);
        expect(v.reason).toContain('"Salaries"');
    });

    it('is SAFE when every source resolves and none is RLS-protected', () => {
        const v = mm.assess({ e1: noRls, e2: { Name: 'Products', Permissions: [] } }, ['e1', 'e2']);
        expect(v.safe).toBe(true);
        expect(v.reason).toBeUndefined();
    });

    it('treats a whitespace-only ReadRLSFilterID as NOT protected (trim guard) — stays safe', () => {
        const v = mm.assess({ e1: { Name: 'Orders', Permissions: [{ ReadRLSFilterID: '   ' }] } }, ['e1']);
        expect(v.safe).toBe(true);
    });
});

/**
 * P1 under-linking guard — the belt-and-suspenders defense inside `assessQuerySourceRLSSafety` that catches an
 * RLS source the QueryEntity LINKER missed (reached via a wrapping view / CTE / function / aliased columns).
 * The linked-only checks above can't see it; this branch parses the query SQL directly, maps each table ref to an
 * entity, and FAILS CLOSED iff a referenced entity is read-RLS-protected but NOT in the linked set. It must be
 * PRECISE — an unlinked NON-RLS table is not a leak and must NOT trip it (else legitimate materializations break).
 */
describe('assessQuerySourceRLSSafety — P1 under-linking gate', () => {
    let mm: TestableRLS;
    beforeEach(() => { mm = new TestableRLS(); });

    // orders: linked, no RLS. salaries: RLS-protected, referenced by SQL but NOT linked. products: no RLS, unlinked.
    const orders: FakeEntity = { Name: 'Orders', SchemaName: '__mj', BaseView: 'vwOrders', BaseTable: 'orders', Permissions: [{ ReadRLSFilterID: null }] };
    const salaries: FakeEntity = { Name: 'Salaries', SchemaName: '__mj', BaseView: 'vwSalaries', BaseTable: 'salaries', Permissions: [{ ReadRLSFilterID: 'rls-1' }] };
    const products: FakeEntity = { Name: 'Products', SchemaName: '__mj', BaseView: 'vwProducts', BaseTable: 'products', Permissions: [] };

    it('FAILS CLOSED when the SQL references an RLS source the linker missed (names the entity + the gate)', () => {
        // Linked set is orders ONLY; the SQL also joins __mj.salaries (RLS) — the exact under-linking leak.
        const sql = 'SELECT o.total, s.amount FROM __mj.orders o JOIN __mj.salaries s ON o.id = s.oid';
        const v = mm.assess({ e1: orders, e2: salaries }, ['e1'], sql);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/P1 under-linking guard/i);
        expect(v.reason).toContain('"Salaries"');
    });

    it('stays SAFE when an unlinked referenced table is NOT RLS-protected (no over-refusal)', () => {
        // products is referenced but unlinked — however it has no RLS, so it is not a leak and must not refuse.
        const sql = 'SELECT o.total, p.name FROM __mj.orders o JOIN __mj.products p ON o.pid = p.id';
        const v = mm.assess({ e1: orders, e3: products }, ['e1'], sql);
        expect(v.safe).toBe(true);
    });

    it('stays SAFE when every referenced source is linked and RLS-free (P1 no-op)', () => {
        const sql = 'SELECT o.total FROM __mj.orders o';
        const v = mm.assess({ e1: orders }, ['e1'], sql);
        expect(v.safe).toBe(true);
    });

    it('does NOT throw on unparseable SQL — the linked-only checks still stand (safe here)', () => {
        const v = mm.assess({ e1: orders }, ['e1'], 'this is not valid SQL @@@');
        expect(v.safe).toBe(true);
    });

    it('is a no-op when no SQL is supplied (back-compat with the mint/drift callers that omit it)', () => {
        const v = mm.assess({ e1: orders }, ['e1']);
        expect(v.safe).toBe(true);
    });
});

/**
 * Tests for `entityHasRowLevelSecurity` — the RLS detector the base-view leak gate (Leak 1) uses to refuse
 * materializing an EXTERNAL read-RLS-protected entity (whose local mirror would leak rows the live path refuses
 * under RLS). Same detection as the query gate: RLS present iff any permission carries a non-empty, non-whitespace
 * ReadRLSFilterID.
 */
describe('entityHasRowLevelSecurity — base-view leak-gate RLS detector', () => {
    let mm: TestableRLS;
    beforeEach(() => { mm = new TestableRLS(); });

    it('is FALSE when no permission carries an RLS filter (null / absent)', () => {
        expect(mm.hasRLS({ Name: 'Orders', Permissions: [{ ReadRLSFilterID: null }, {}] })).toBe(false);
    });

    it('is TRUE when ANY permission carries a non-empty ReadRLSFilterID', () => {
        expect(mm.hasRLS({ Name: 'Orders', Permissions: [{}, { ReadRLSFilterID: 'rls-filter-1' }] })).toBe(true);
    });

    it('treats a whitespace-only ReadRLSFilterID as NOT protected (trim guard)', () => {
        expect(mm.hasRLS({ Name: 'Orders', Permissions: [{ ReadRLSFilterID: '   ' }] })).toBe(false);
    });

    it('is FALSE for an entity with no permissions at all', () => {
        expect(mm.hasRLS({ Name: 'Orders', Permissions: [] })).toBe(false);
    });
});
