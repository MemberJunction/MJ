import { describe, it, expect } from 'vitest';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { getASTDialectAdapter } from '../ASTDialectAdapter.js';

const tsql = new SQLServerDialect();
const pg = new PostgreSQLDialect();

// ════════════════════════════════════════════════════════════════════
// Registry
// ════════════════════════════════════════════════════════════════════

describe('getASTDialectAdapter', () => {
    it('returns an adapter for the SQL Server dialect', () => {
        expect(getASTDialectAdapter(tsql)).toBeDefined();
    });

    it('returns an adapter for the PostgreSQL dialect', () => {
        expect(getASTDialectAdapter(pg)).toBeDefined();
    });

    it('returns an adapter for the MySQL ParserDialect', () => {
        const mysqlish = { ...tsql, ParserDialect: 'MySQL' } as typeof tsql;
        expect(getASTDialectAdapter(mysqlish)).toBeDefined();
    });

    it('throws an actionable error for an unregistered ParserDialect', () => {
        const unknown = { ...tsql, ParserDialect: 'OracleSQL' } as typeof tsql;
        expect(() => getASTDialectAdapter(unknown)).toThrow(/No ASTDialectAdapter registered/);
    });
});

// ════════════════════════════════════════════════════════════════════
// TransactSQLAdapter (root.top)
// ════════════════════════════════════════════════════════════════════

describe('TransactSQLAdapter', () => {
    const adapter = getASTDialectAdapter(tsql);

    it('reads a numeric TOP', () => {
        expect(adapter.ReadRowCap({ top: { value: 5, percent: null } }))
            .toEqual({ form: 'numeric', value: 5, offset: null });
    });

    it('reads TOP PERCENT as a percent cap', () => {
        expect(adapter.ReadRowCap({ top: { value: 25, percent: 'percent' } }))
            .toEqual({ form: 'percent' });
    });

    it('reads a non-numeric TOP as opaque', () => {
        // node-sql-parser cannot produce this shape from a parse, but the
        // adapter must still classify a non-numeric value defensively.
        expect(adapter.ReadRowCap({ top: { value: { type: 'var', name: 'n' } } }))
            .toEqual({ form: 'opaque' });
    });

    it('returns null when no top field is present', () => {
        expect(adapter.ReadRowCap({})).toBeNull();
    });

    it('writes a numeric TOP onto the root', () => {
        const root: Record<string, unknown> = {};
        adapter.WriteRowCap(root, 42);
        expect(root.top).toEqual({ value: 42, percent: null });
    });

    it('clears the top field', () => {
        const root: Record<string, unknown> = { top: { value: 10, percent: null } };
        adapter.ClearRowCap(root);
        expect(root.top).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// LimitOffsetAdapter (root.limit)
// ════════════════════════════════════════════════════════════════════

describe('LimitOffsetAdapter', () => {
    const adapter = getASTDialectAdapter(pg);

    it('reads a numeric LIMIT', () => {
        expect(adapter.ReadRowCap({ limit: { seperator: '', value: [{ value: 5 }] } }))
            .toEqual({ form: 'numeric', value: 5, offset: null });
    });

    it('reads LIMIT N OFFSET M', () => {
        expect(adapter.ReadRowCap({ limit: { seperator: 'offset', value: [{ value: 5 }, { value: 10 }] } }))
            .toEqual({ form: 'numeric', value: 5, offset: 10 });
    });

    it('reads a non-numeric LIMIT as opaque', () => {
        expect(adapter.ReadRowCap({ limit: { seperator: '', value: [{ value: { type: 'var', name: 1 } }] } }))
            .toEqual({ form: 'opaque' });
    });

    it('returns null when no limit field is present', () => {
        expect(adapter.ReadRowCap({})).toBeNull();
    });

    it('returns null for an empty limit value array', () => {
        expect(adapter.ReadRowCap({ limit: { seperator: '', value: [] } })).toBeNull();
    });

    it('writes a numeric LIMIT onto the root', () => {
        const root: Record<string, unknown> = {};
        adapter.WriteRowCap(root, 42);
        expect(root.limit).toEqual({ seperator: '', value: [{ type: 'number', value: 42 }] });
    });

    it('preserves an existing OFFSET node when writing a new LIMIT', () => {
        const offsetNode = { type: 'number', value: 99 };
        const root: Record<string, unknown> = { limit: { seperator: 'offset', value: [{ value: 500 }, offsetNode] } };
        adapter.WriteRowCap(root, 100);
        expect(root.limit).toEqual({ seperator: 'offset', value: [{ type: 'number', value: 100 }, offsetNode] });
    });

    it('clears the limit field', () => {
        const root: Record<string, unknown> = { limit: { seperator: '', value: [{ value: 10 }] } };
        adapter.ClearRowCap(root);
        expect(root.limit).toBeNull();
    });
});
