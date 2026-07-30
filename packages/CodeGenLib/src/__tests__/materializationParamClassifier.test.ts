import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import {
    classifyQueryParameters,
    probeValues,
    type QueryParamDef,
    type VariantRenderer,
} from '../Database/materializationParamClassifier';

/**
 * Phase 2c — deterministic parameter classification (plan §9 / §10).
 * Uses injected fake renderers (templates as functions over the value map) so the orchestration is
 * tested without the Nunjucks engine. SQL-safe quoting is simulated per type.
 */
describe('classifyQueryParameters', () => {
    const tsql = new SQLServerDialect();

    /** Quotes a probe value the way the SQL-safe filters would, by declared type. */
    const lit = (v: unknown): string => {
        if (typeof v === 'number') {
            return String(v);
        }
        if (Array.isArray(v)) {
            return v.map((e) => `'${e}'`).join(',');
        }
        return `'${v}'`;
    };

    it('no parameters → qualifies with mode None', () => {
        const r = classifyQueryParameters({
            queryName: 'Q',
            params: [],
            outputColumns: ['ID'],
            dialect: tsql,
            render: () => 'SELECT ID FROM Orders',
        });
        expect(r.qualification.qualifies).toBe(true);
        expect(r.qualification.paramMode).toBe('None');
        expect(r.perParam).toHaveLength(0);
    });

    it('single string row-filter on a projected column → RowFilterBroad', () => {
        const params: QueryParamDef[] = [{ Name: 'status', Type: 'string' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Status = ${lit(v['status'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.perParam[0].verdict.role).toBe('RowFilter');
        expect(r.qualification.qualifies).toBe(true);
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['Status']);
    });

    it('RowFilterBroad is GATED OFF by default (production entry point) — same query refuses when allowRowFilterBroad is omitted', () => {
        // Identical to the case above, but WITHOUT allowRowFilterBroad. The production caller
        // (processQueryMaterializations) never opts in, so this is the real-world default: a clean
        // row-filter query must be refused (deferred to Phase 2), never silently minted.
        const params: QueryParamDef[] = [{ Name: 'status', Type: 'string' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Status = ${lit(v['status'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render });
        expect(r.perParam[0].verdict.role).toBe('RowFilter'); // classification is unchanged...
        expect(r.qualification.qualifies).toBe(false);         // ...but the gate refuses to qualify it
        expect(r.qualification.paramMode).not.toBe('RowFilterBroad');
    });

    it('value-TRANSFORMING filter (e.g. | upper) is REFUSED — read-time raw binding would diverge from live', () => {
        // The template upper-cases the value before the predicate: the live query filters on UPPER(value),
        // but the read path binds the caller's RAW value → the materialized read would return different rows.
        // The passthrough guard must refuse this (query stays live-only), even though it is structurally a
        // clean top-level WHERE row filter.
        const params: QueryParamDef[] = [{ Name: 'status', Type: 'string' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Status = '${String(v['status']).toUpperCase()}'`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.perParam[0].verdict.role).toBe('Unbounded');                 // guard overrides RowFilter → Unbounded
        expect(r.perParam[0].verdict.reason).toMatch(/does not survive|transforms its value/i);
        expect(r.qualification.qualifies).toBe(false);
        expect(r.qualification.paramMode).not.toBe('RowFilterBroad');
    });

    it('a whitespace-TRIMMING filter (| trim) is also refused — a padded raw value would diverge from live', () => {
        // Live trims (`' active '` → `'active'`); the read path binds the raw padded value → wrong rows.
        // The sentinel carries leading/trailing whitespace so trim changes it → guard refuses.
        const params: QueryParamDef[] = [{ Name: 'status', Type: 'string' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Status = '${String(v['status']).trim()}'`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.perParam[0].verdict.role).toBe('Unbounded');
        expect(r.qualification.paramMode).not.toBe('RowFilterBroad');
    });

    it('a value-PRESERVING filter still qualifies — the passthrough guard does not over-refuse the common case', () => {
        // Both string (quote-only) and numeric (identity) row filters render the value verbatim, so the
        // sentinel survives → still RowFilterBroad. Confirms the guard is targeted, not blanket.
        const strR = classifyQueryParameters({
            queryName: 'Q', params: [{ Name: 's', Type: 'string' }], outputColumns: ['ID', 'Status'], dialect: tsql,
            render: (v) => `SELECT ID, Status FROM Orders WHERE Status = ${lit(v['s'])}`, allowRowFilterBroad: true,
        });
        expect(strR.qualification.paramMode).toBe('RowFilterBroad');
        const numR = classifyQueryParameters({
            queryName: 'Q', params: [{ Name: 'c', Type: 'number' }], outputColumns: ['ID', 'ChapterID'], dialect: tsql,
            render: (v) => `SELECT ID, ChapterID FROM Orders WHERE ChapterID = ${lit(v['c'])}`, allowRowFilterBroad: true,
        });
        expect(numR.qualification.paramMode).toBe('RowFilterBroad');
    });

    it('numeric row-filter → RowFilterBroad on that column', () => {
        const params: QueryParamDef[] = [{ Name: 'chapterId', Type: 'number' }];
        const render: VariantRenderer = (v) => `SELECT ID, ChapterID FROM Orders WHERE ChapterID = ${lit(v['chapterId'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'ChapterID'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['ChapterID']);
    });

    it('array param in an IN list (varying length) → RowFilterBroad', () => {
        const params: QueryParamDef[] = [{ Name: 'statuses', Type: 'array' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Status IN (${lit(v['statuses'])})`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['Status']);
    });

    it('two clean row-filters; varying one holds the other constant → both columns', () => {
        const params: QueryParamDef[] = [
            { Name: 'status', Type: 'string' },
            { Name: 'minScore', Type: 'number' },
        ];
        const render: VariantRenderer = (v) =>
            `SELECT ID, Status, Score FROM Members WHERE Status = ${lit(v['status'])} AND Score >= ${lit(v['minScore'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status', 'Score'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.perParam.every((p) => p.verdict.role === 'RowFilter')).toBe(true);
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['Status', 'Score']);
    });

    it('row-filter on a column NOT in the output → refused by the qualifier', () => {
        const params: QueryParamDef[] = [{ Name: 'region', Type: 'string' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Region = ${lit(v['region'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.perParam[0].verdict.role).toBe('RowFilter');
        expect(r.qualification.qualifies).toBe(false);
        expect(r.qualification.reason).toMatch(/not in the materialized output/i);
    });

    it('a parameter that changes SQL shape → Structural → refused (no per-value cache in v1)', () => {
        const params: QueryParamDef[] = [{ Name: 'mode', Type: 'string' }];
        const render: VariantRenderer = (v) =>
            v['mode'] === '__mj_probe_alpha'
                ? 'SELECT ID FROM Orders'
                : 'SELECT ID, Region FROM Orders';
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Region'], dialect: tsql, render });
        expect(r.perParam[0].verdict.role).toBe('Structural');
        expect(r.qualification.qualifies).toBe(false);
    });

    it('a probe value that breaks the template → Unbounded → refused', () => {
        const params: QueryParamDef[] = [{ Name: 'x', Type: 'string' }];
        const render: VariantRenderer = (v) => {
            if (v['x'] === '__mj_probe_beta') {
                throw new Error('template blew up');
            }
            return `SELECT ID FROM Orders WHERE Status = ${lit(v['x'])}`;
        };
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.perParam[0].verdict.role).toBe('Unbounded');
        expect(r.perParam[0].verdict.reason).toMatch(/template error/i);
        expect(r.qualification.qualifies).toBe(false);
    });

    it('one clean + one structural param → overall refused', () => {
        const params: QueryParamDef[] = [
            { Name: 'status', Type: 'string' },
            { Name: 'mode', Type: 'string' },
        ];
        const render: VariantRenderer = (v) => {
            const tail = v['mode'] === '__mj_probe_alpha' ? '' : ' ORDER BY Name';
            return `SELECT ID, Status FROM Orders WHERE Status = ${lit(v['status'])}${tail}`;
        };
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render, allowRowFilterBroad: true });
        expect(r.qualification.qualifies).toBe(false);
    });

    describe('probeValues', () => {
        it('produces distinct values per type', () => {
            for (const t of ['string', 'number', 'date', 'array'] as const) {
                const vals = probeValues(t);
                expect(vals.length).toBeGreaterThanOrEqual(3);
                expect(new Set(vals.map((v) => JSON.stringify(v))).size).toBe(vals.length);
            }
        });
        it('boolean has exactly the two distinct values', () => {
            expect(probeValues('boolean')).toEqual([true, false]);
        });
    });
});
