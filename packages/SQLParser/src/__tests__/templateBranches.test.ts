/**
 * TEST-INVENTORY P10: `{% if %}…{% else %}…{% endif %}` with structural branches still analyzes.
 *
 * Placeholder substitution strips block tags and keeps every branch body, so two alternative
 * WHERE clauses become one statement with two WHEREs, and two alternative JOINs become two JOINs
 * on one alias. node-sql-parser then rejects the statement or reads one branch over the other.
 * The desired result reads each branch as its own statement and reports the union: every branch's
 * tables and column refs, and the select list the branches share.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

/** Two alternative WHERE clauses. */
const TWO_WHERES_SS = `SELECT a.ID, a.Name FROM Accounts a
{% if region %}
WHERE a.Region = {{ region | sqlString }}
{% else %}
WHERE a.Active = 1
{% endif %}
ORDER BY a.Name`;

const TWO_WHERES_PG = `SELECT a."ID", a."Name" FROM "Accounts" a
{% if region %}
WHERE a."Region" = {{ region | sqlString }}
{% else %}
WHERE a."Active" = true
{% endif %}`;

/** Two alternative JOINs that bind the same alias. */
const TWO_JOINS_SS = `SELECT a.ID, x.Label FROM Accounts a
{% if useRegions %}
INNER JOIN Regions x ON x.ID = a.RegionID
{% else %}
INNER JOIN Territories x ON x.ID = a.TerritoryID
{% endif %}`;

/** An optional CTE, and a FROM that names it or the base table (shape of edge-cases.ts MIXED_CONDITIONAL_WITH_CLAUSE). */
const OPTIONAL_CTE_SS = `{% if NeedsCTE %}
WITH Filtered AS (
    SELECT ID, Status FROM Source WHERE Status = {{ Status | sqlString }}
)
{% endif %}
SELECT ID FROM {% if NeedsCTE %}Filtered{% else %}Source{% endif %}`;

/** An `{% if %}` that only adds a predicate, which analyzes today. */
const OPTIONAL_PREDICATE_SS = 'SELECT a.ID FROM Accounts a WHERE 1=1 {% if region %} AND a.Region = {{ region | sqlString }}{% endif %}';

function selectNames(sql: string, dialect: SQLParserDialect): string[] {
    return SQLParser.ExtractSelectColumns(sql, dialect).map((c) => c.OutputName);
}

function columnRefNames(sql: string, dialect: SQLParserDialect): string[] {
    return SQLParser.ExtractColumnRefs(sql, dialect).map((c) => c.ColumnName);
}

function sortedTableNames(sql: string, dialect: SQLParserDialect): string[] {
    return SQLParser.ExtractTableRefs(sql, dialect).map((t) => t.TableName).sort();
}

describe('P10: structural {% if %} / {% else %} branches', () => {
    it('reads the branches of each template (setup for the pins below)', () => {
        const [block] = SQLParser.ExtractConditionalBlocks(TWO_WHERES_SS);
        expect(block.branches.map((b) => b.condition)).toEqual(['region', null]);
        expect(block.branches[0].body.raw).toContain('WHERE a.Region');
        expect(block.branches[1].body.raw).toContain('WHERE a.Active = 1');
        expect(SQLParser.ExtractParameterInfo(TWO_WHERES_SS).map((p) => [p.name, p.isRequired])).toEqual([['region', false]]);
        expect(SQLParser.ExtractConditionalBlocks(TWO_JOINS_SS)[0].branches).toHaveLength(2);
    });

    it('analyzes an {% if %} that only adds a predicate', () => {
        expect(selectNames(OPTIONAL_PREDICATE_SS, ss)).toEqual(['ID']);
        expect(columnRefNames(OPTIONAL_PREDICATE_SS, ss)).toEqual(expect.arrayContaining(['ID', 'Region']));
        expect(sortedTableNames(OPTIONAL_PREDICATE_SS, ss)).toEqual(['Accounts']);
    });

    it('extracts the shared select list when the branches are alternative JOINs', () => {
        expect(selectNames(TWO_JOINS_SS, ss)).toEqual(['ID', 'Label']);
    });

    it('extracts the select list of a statement whose CTE is optional', () => {
        expect(selectNames(OPTIONAL_CTE_SS, ss)).toEqual(['ID']);
    });

    it('still finds the base table of the two-WHERE statement on SQL Server', () => {
        expect(sortedTableNames(TWO_WHERES_SS, ss)).toEqual(['Accounts']);
    });

    // Decided: MJ's interpreter owns template facts, including branches; branch-dependent output is the union of
    // branch renders (DISCUSSION §6, 2026-10-27). P10. Before the redesign: [] — the two WHEREs fail the parse.
    it('extracts the select list when the branches are alternative WHERE clauses (SQL Server)', () => {
        expect(selectNames(TWO_WHERES_SS, ss)).toEqual(['ID', 'Name']);
    });

    // Decided: as above. P10. Before the redesign: [].
    it('extracts the column refs of every WHERE branch (SQL Server)', () => {
        expect(columnRefNames(TWO_WHERES_SS, ss)).toEqual(expect.arrayContaining(['ID', 'Name', 'Region', 'Active']));
    });

    // Decided: as above. P10. Before the redesign: select [] and tables [] (the fallback cannot read "quoted" names).
    it('extracts the select list and table when the branches are alternative WHERE clauses (PostgreSQL)', () => {
        expect({ select: selectNames(TWO_WHERES_PG, pg), tables: sortedTableNames(TWO_WHERES_PG, pg) })
            .toEqual({ select: ['ID', 'Name'], tables: ['Accounts'] });
    });

    // Decided: as above (the tables read in JOINs are template facts MJ owns). P10.
    // Before the redesign: ['Accounts', 'Territories'] — the else branch's JOIN replaces the if branch's under the shared alias x.
    it('reports the tables of every JOIN branch', () => {
        expect(sortedTableNames(TWO_JOINS_SS, ss)).toEqual(['Accounts', 'Regions', 'Territories']);
    });

    // Decided: as above, and CTE names are not tables (DISCUSSION §6, 2026-10-27). P10 (with P1).
    // Before the redesign: ['FilteredSource', 'Source'] — the two FROM branches are glued into one name.
    it('reports only the base table when the CTE is optional', () => {
        expect(sortedTableNames(OPTIONAL_CTE_SS, ss)).toEqual(['Source']);
    });
});
