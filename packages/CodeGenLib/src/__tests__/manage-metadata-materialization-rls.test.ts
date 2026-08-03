import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { Metadata } from '@memberjunction/core';

/**
 * Tests for the query-materialization RLS-safety decision (`assessQuerySourceRLSSafety`), the guard shared by
 * the mint-time gate and the per-CodeGen-run drift re-check (plan §6.2 / §10). It decides whether a query is
 * safe to materialize as an UNSCOPED snapshot: safe only when every source entity resolves and none carries a
 * read RLS filter. It must FAIL CLOSED — a query it cannot fully prove RLS-free must be refused (or an existing
 * materialization held), because serving a protected source's rows unscoped is the exact leak the guard exists
 * to prevent. The method reads only `md.EntityByID(id)` → `{ Name, Permissions[] }`, so a light structural stub
 * is a faithful test seam (no DB / provider / config needed) — the same seam the sibling guard tests use.
 */

/** Minimal source-entity shape the guard actually inspects. */
type FakePermission = { ReadRLSFilterID?: string | null };
type FakeEntity = { Name: string; Permissions: FakePermission[] };

class TestableRLS extends ManageMetadataBase {
    /** Exposes the protected guard, taking a structural stub for the entity-by-id lookup. */
    public assess(entities: Record<string, FakeEntity>, ids: string[]): { safe: boolean; reason?: string } {
        // Structural stub of the only Metadata surface the guard touches. Cast once at the test seam
        // (the guard never calls anything else on it).
        const md = { EntityByID: (id: string): FakeEntity | undefined => entities[id] } as unknown as Metadata;
        return this.assessQuerySourceRLSSafety(md, ids);
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
