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
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render });
        expect(r.perParam[0].verdict.role).toBe('RowFilter');
        expect(r.qualification.qualifies).toBe(true);
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['Status']);
    });

    it('numeric row-filter → RowFilterBroad on that column', () => {
        const params: QueryParamDef[] = [{ Name: 'chapterId', Type: 'number' }];
        const render: VariantRenderer = (v) => `SELECT ID, ChapterID FROM Orders WHERE ChapterID = ${lit(v['chapterId'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'ChapterID'], dialect: tsql, render });
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['ChapterID']);
    });

    it('array param in an IN list (varying length) → RowFilterBroad', () => {
        const params: QueryParamDef[] = [{ Name: 'statuses', Type: 'array' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Status IN (${lit(v['statuses'])})`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render });
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
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status', 'Score'], dialect: tsql, render });
        expect(r.perParam.every((p) => p.verdict.role === 'RowFilter')).toBe(true);
        expect(r.qualification.paramMode).toBe('RowFilterBroad');
        expect(r.qualification.rowFilterColumns).toEqual(['Status', 'Score']);
    });

    it('row-filter on a column NOT in the output → refused by the qualifier', () => {
        const params: QueryParamDef[] = [{ Name: 'region', Type: 'string' }];
        const render: VariantRenderer = (v) => `SELECT ID, Status FROM Orders WHERE Region = ${lit(v['region'])}`;
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render });
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
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render });
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
        const r = classifyQueryParameters({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], dialect: tsql, render });
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
