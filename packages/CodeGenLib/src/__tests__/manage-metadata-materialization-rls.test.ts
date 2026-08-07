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
 * P1 under-linking guard — the belt-and-suspenders defense inside `assessQuerySourceRLSSafety` that catches a
 * source the QueryEntity LINKER missed (reached via a wrapping view / CTE / function / aliased columns). The
 * linked-only checks above can't see it; this branch parses the query SQL directly, maps each table ref to an
 * entity, and FAILS CLOSED iff a referenced entity maps to a real entity NOT in the linked set — whether it is
 * read-RLS-protected (rows would leak unscoped) OR merely CanRead-restricted (the read-grant intersection,
 * computed over the linked set, would over-grant = privilege escalation). Refs that map to no entity
 * (CTEs/functions/aliases) are skipped, so only genuine under-linking of an entity source trips it.
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

    it('FAILS CLOSED when the SQL references a non-RLS but under-linked entity source (permission-intersection blind spot)', () => {
        // products is referenced but NOT linked. Even with no RLS, the read-grant intersection is computed over
        // the linked set only, so an under-linked (possibly CanRead-restricted) source would let the minted
        // entity's grant exceed "can read every source" — refuse (fail closed).
        const sql = 'SELECT o.total, p.name FROM __mj.orders o JOIN __mj.products p ON o.pid = p.id';
        const v = mm.assess({ e1: orders, e3: products }, ['e1'], sql);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/P1 under-linking guard/i);
        expect(v.reason).toContain('"Products"');
    });

    it('FAILS CLOSED on an UNQUALIFIED ref to an under-linked __mj entity (parser defaults refs to dbo)', () => {
        // No `__mj.` prefix — the SQL parser defaults an unqualified table ref to schema 'dbo', but the entities
        // live in '__mj'. Before the fix, findEntityByBaseObject demanded an exact 'dbo' entity and silently
        // missed the __mj source, leaving the escalation hole open for the common unqualified-ref case.
        const sql = 'SELECT o.total, p.name FROM orders o JOIN products p ON o.pid = p.id';
        const v = mm.assess({ e1: orders, e3: products }, ['e1'], sql);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/P1 under-linking guard/i);
        expect(v.reason).toContain('"Products"');
    });

    it('does NOT over-refuse a CTE whose name shadows an entity base table (CTE self-ref excluded)', () => {
        // `products` here is a CTE, not the Products entity. With the unqualified-ref name fallback, the CTE
        // self-reference must be excluded so it is not misread as an under-linked source. The only real source
        // (orders) is linked → safe.
        const sql = 'WITH products AS (SELECT id, name FROM __mj.orders) SELECT o.total FROM __mj.orders o JOIN products p ON o.pid = p.id';
        const v = mm.assess({ e1: orders, e3: products }, ['e1'], sql);
        expect(v.safe).toBe(true);
    });

    it('does NOT over-refuse a BRACKET-quoted CTE ([name]) that shadows an entity base table', () => {
        // [products] is a T-SQL bracket-quoted CTE, not the Products entity. The CTE-name exclusion must recognize
        // the [bracket] form (SQLParser's regex-fallback emits it) so it isn't misread as an under-linked source.
        const sql = 'WITH [products] AS (SELECT id FROM __mj.orders) SELECT o.total FROM __mj.orders o JOIN [products] p ON o.pid = p.id';
        const v = mm.assess({ e1: orders, e3: products }, ['e1'], sql);
        expect(v.safe).toBe(true);
    });

    it('FAILS CLOSED on an unqualified ref that also matches an under-linked entity in ANOTHER schema (ambiguity → fail closed)', () => {
        // Two entities share base table 'widgets': __mj.widgets (linked, enumerated first) and app.widgets (NOT
        // linked, restricted). The unqualified `FROM widgets` is schema-ambiguous; picking only the first match
        // would pass the linked one and leak the restricted one — the guard must consider ALL candidates and refuse.
        const mjWidgets: FakeEntity = { Name: 'MJ Widgets', SchemaName: '__mj', BaseView: 'vwMJWidgets', BaseTable: 'widgets', Permissions: [] };
        const appWidgets: FakeEntity = { Name: 'App Widgets', SchemaName: 'app', BaseView: 'vwAppWidgets', BaseTable: 'widgets', Permissions: [] };
        const sql = 'SELECT w.id FROM widgets w';
        const v = mm.assess({ e1: orders, e2: mjWidgets, e3: appWidgets }, ['e1', 'e2'], sql);
        expect(v.safe).toBe(false);
        expect(v.reason).toMatch(/P1 under-linking guard/i);
        expect(v.reason).toContain('"App Widgets"');
    });

    it('does NOT refuse a ref that maps to no entity (CTE/function/alias) — only genuine entity under-linking trips it', () => {
        // `agg` is a derived-table alias that maps to no entity; the only real source (orders) is linked → safe.
        const sql = 'SELECT agg.total FROM (SELECT SUM(amount) AS total FROM __mj.orders) agg';
        const v = mm.assess({ e1: orders }, ['e1'], sql);
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
