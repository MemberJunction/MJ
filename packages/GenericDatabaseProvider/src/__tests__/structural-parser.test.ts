/**
 * Tests for the structural parser, symbol table, and IR renderer.
 *
 * These test the infrastructure that the composition engine uses
 * internally for CTE hoisting, ORDER BY stripping, and token
 * replacement via typed IR.
 */
import { describe, it, expect } from 'vitest';
import { ParseToIR, RenderIR } from '@memberjunction/sql-parser';
import { SymbolTable } from '../symbolTable';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

const tsqlDialect = new SQLServerDialect();
const pgDialect = new PostgreSQLDialect();

// ════════════════════════════════════════════════════════════════════
// SymbolTable
// ════════════════════════════════════════════════════════════════════

describe('SymbolTable', () => {
    it('registers unique names without suffix', () => {
        const st = new SymbolTable(tsqlDialect);
        expect(st.Register('MyTable')).toBe('MyTable');
        expect(st.Has('MyTable')).toBe(true);
        expect(st.Size).toBe(1);
    });

    it('adds __2 suffix on first collision', () => {
        const st = new SymbolTable(tsqlDialect);
        st.Register('Bridge');
        expect(st.Register('Bridge')).toBe('Bridge__2');
        expect(st.Size).toBe(2);
    });

    it('increments suffix on repeated collisions', () => {
        const st = new SymbolTable(tsqlDialect);
        st.Register('CTE');
        st.Register('CTE');
        expect(st.Register('CTE')).toBe('CTE__3');
        expect(st.Size).toBe(3);
    });

    it('is case-insensitive', () => {
        const st = new SymbolTable(tsqlDialect);
        st.Register('bridge');
        expect(st.Register('Bridge')).toBe('Bridge__2');
        expect(st.Register('BRIDGE')).toBe('BRIDGE__3');
    });

    it('seeds without suffix', () => {
        const st = new SymbolTable(tsqlDialect);
        st.Seed('PreExisting');
        expect(st.Has('preexisting')).toBe(true);
        expect(st.Register('PreExisting')).toBe('PreExisting__2');
    });

    it('quotes identifiers for SQL Server', () => {
        const st = new SymbolTable(tsqlDialect);
        expect(st.Quote('MyTable')).toBe('[MyTable]');
    });

    it('quotes identifiers for PostgreSQL', () => {
        const st = new SymbolTable(pgDialect);
        expect(st.Quote('MyTable')).toBe('"MyTable"');
    });

    it('generates composition CTE names', () => {
        const st = new SymbolTable(tsqlDialect);
        const name = st.RegisterCompositionCTE('Active Users', 'some-hash-input');
        expect(name).toMatch(/^\[__cte_Active_Users_[a-z0-9]+\]$/);
        expect(st.Size).toBe(1);
    });
});

// ════════════════════════════════════════════════════════════════════
// ParseToIR
// ════════════════════════════════════════════════════════════════════

describe('ParseToIR', () => {
    it('parses simple SELECT into body fragments', () => {
        const ir = ParseToIR('SELECT [ID], [Name] FROM [Users]', tsqlDialect);
        expect(ir.CTEs).toHaveLength(0);
        expect(ir.Body.length).toBeGreaterThan(0);
        expect(ir.HasUserCTEs).toBe(false);
    });

    it('detects user CTEs in WITH clause', () => {
        const sql = `WITH CTE_A AS (
    SELECT [ID] FROM [t1]
)
SELECT * FROM CTE_A`;
        const ir = ParseToIR(sql, tsqlDialect);
        expect(ir.HasUserCTEs).toBe(true);
        expect(ir.CTEs.length).toBeGreaterThanOrEqual(1);
        expect(ir.CTEs[0].CanonicalName).toBe('CTE_A');
    });

    it('detects trailing ORDER BY', () => {
        const sql = 'SELECT [ID] FROM [Users] ORDER BY [ID]';
        const ir = ParseToIR(sql, tsqlDialect);
        expect(ir.TrailingOrderBy).not.toBeNull();
    });

    it('returns null for trailing ORDER BY when none exists', () => {
        const sql = 'SELECT [ID] FROM [Users]';
        const ir = ParseToIR(sql, tsqlDialect);
        expect(ir.TrailingOrderBy).toBeNull();
    });

    it('preserves template expressions as fragments', () => {
        const sql = `SELECT [ID] FROM [t1] WHERE [Name] = {{ Name | sqlString }}`;
        const ir = ParseToIR(sql, tsqlDialect);
        const templateFrags = ir.Body.filter(f => f.Kind === 'template-expr');
        expect(templateFrags.length).toBeGreaterThan(0);
        expect(templateFrags[0].Variable).toBe('Name');
    });

    it('preserves composition refs as fragments', () => {
        const sql = `SELECT * FROM {{query:"Test/MyQuery"}} [q]`;
        const ir = ParseToIR(sql, tsqlDialect);
        const compFrags = ir.Body.filter(f => f.Kind === 'composition-ref');
        expect(compFrags.length).toBe(1);
        expect(compFrags[0].QueryPath).toBe('Test/MyQuery');
    });

    it('preserves block tags as fragments', () => {
        const sql = `SELECT [ID] FROM [t1]
{% if Region %}
WHERE [Region] = {{ Region | sqlString }}
{% endif %}`;
        const ir = ParseToIR(sql, tsqlDialect);
        const blockFrags = ir.Body.filter(f => f.Kind === 'block');
        expect(blockFrags.length).toBeGreaterThanOrEqual(2); // {% if %} and {% endif %}
    });

    it('handles empty SQL', () => {
        const ir = ParseToIR('', tsqlDialect);
        expect(ir.CTEs).toHaveLength(0);
        expect(ir.Body).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════════════
// RenderIR
// ════════════════════════════════════════════════════════════════════

describe('RenderIR', () => {
    it('renders simple body without CTEs', () => {
        const ir = ParseToIR('SELECT [ID] FROM [Users]', tsqlDialect);
        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).toContain('SELECT [ID] FROM [Users]');
    });

    it('renders CTEs in WITH clause', () => {
        const sql = `WITH CTE_A AS (
    SELECT [ID] FROM [t1]
)
SELECT * FROM CTE_A`;
        const ir = ParseToIR(sql, tsqlDialect);
        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).toContain('WITH');
        expect(rendered).toContain('CTE_A');
    });

    it('preserves template tokens in rendered output', () => {
        const sql = `SELECT [ID] FROM [t1] WHERE [Name] = {{ Name | sqlString }}`;
        const ir = ParseToIR(sql, tsqlDialect);
        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).toContain('{{ Name | sqlString }}');
    });

    it('preserves block tags in rendered output', () => {
        const sql = `SELECT [ID] FROM [t1]
{% if Region %}
WHERE [Region] = {{ Region | sqlString }}
{% endif %}`;
        const ir = ParseToIR(sql, tsqlDialect);
        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).toContain('{% if Region %}');
        expect(rendered).toContain('{% endif %}');
    });

    it('round-trips simple SQL through parse → render', () => {
        const sql = 'SELECT [ID], [Name] FROM [Users] WHERE [Active] = 1';
        const ir = ParseToIR(sql, tsqlDialect);
        const rendered = RenderIR(ir, tsqlDialect);
        // Content should be preserved (whitespace may vary slightly)
        expect(rendered).toContain('SELECT [ID], [Name]');
        expect(rendered).toContain('FROM [Users]');
        expect(rendered).toContain('WHERE [Active] = 1');
    });

    it('round-trips templated SQL with composition ref', () => {
        const sql = `SELECT [a].[ID]
FROM {{query:"Test/Users"}} [a]
{% if Region %}
WHERE [a].[Region] = {{ Region | sqlString }}
{% endif %}
ORDER BY [a].[ID]`;
        const ir = ParseToIR(sql, tsqlDialect);
        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).toContain('{{query:"Test/Users"}}');
        expect(rendered).toContain('{% if Region %}');
        expect(rendered).toContain('{{ Region | sqlString }}');
    });
});

// ════════════════════════════════════════════════════════════════════
// IR manipulation (composition operations)
// ════════════════════════════════════════════════════════════════════

describe('IR Manipulation', () => {
    it('can add CTEs to an IR and render them', () => {
        const ir = ParseToIR('SELECT * FROM MyDep [d]', tsqlDialect);

        // Simulate composition: add a CTE
        ir.CTEs.push({
            Id: 'comp_1',
            Name: '[__cte_MyDep_abc123]',
            CanonicalName: '__cte_mydep_abc123',
            Body: [{ Kind: 'sql', Text: 'SELECT [ID], [Name] FROM [Users]' }],
            Origin: { Kind: 'composition', DepName: 'MyDep', CategoryPath: 'Test/MyDep' },
            OrderByStripped: false,
        });

        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).toContain('WITH');
        expect(rendered).toContain('[__cte_MyDep_abc123] AS');
        expect(rendered).toContain('SELECT [ID], [Name] FROM [Users]');
    });

    it('can strip trailing ORDER BY from IR', () => {
        const sql = 'SELECT [ID] FROM [Users] ORDER BY [ID] DESC';
        const ir = ParseToIR(sql, tsqlDialect);

        expect(ir.TrailingOrderBy).not.toBeNull();

        // Strip the ORDER BY
        ir.TrailingOrderBy = null;

        const rendered = RenderIR(ir, tsqlDialect);
        expect(rendered).not.toContain('ORDER BY');
    });
});
