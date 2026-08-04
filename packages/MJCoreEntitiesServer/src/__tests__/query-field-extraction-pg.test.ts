/**
 * Unit tests for deterministic QueryField extraction from PostgreSQL SELECT columns.
 *
 * PostgreSQL differs from SQL Server in key ways that affect AST parsing:
 *   - Double-quoted identifiers: "Name" → AST node { type: 'double_quote_string', value: 'Name' }
 *   - Unquoted identifiers fold to lowercase: membershiptype (no quotes)
 *   - CTE output aliases are unquoted lowercase: AS memberid
 *   - Type casts use :: syntax: EXTRACT(...)::INTEGER, value::numeric
 *   - Boolean comparisons: = true / = false (not = 1 / = 0)
 *   - ROUND requires explicit ::numeric cast for 2-argument calls
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '@memberjunction/sql-parser';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { BuildFieldsFromSelectColumns } from '../custom/query-extraction/resolve';

const pgDialect = new PostgreSQLDialect();
const tsqlDialect = new SQLServerDialect();
const extractPG = (sql: string) => SQLParser.ExtractSelectColumns(sql, pgDialect);
const extractTSQL = (sql: string) => SQLParser.ExtractSelectColumns(sql, tsqlDialect);

// ═══════════════════════════════════════════════════
// PostgreSQL-specific identifier handling
// ═══════════════════════════════════════════════════

describe('PostgreSQL: double-quoted identifiers', () => {
    it('should unwrap double-quoted column names', () => {
        const sql = 'SELECT t."Name", t."Email" FROM "CRM"."vwUsers" t';
        const cols = extractPG(sql);

        expect(cols).toHaveLength(2);
        expect(cols[0].SourceColumn).toBe('Name');
        expect(cols[0].TableQualifier).toBe('t');
        expect(cols[1].SourceColumn).toBe('Email');
    });

    it('should unwrap double-quoted columns with aliases', () => {
        const sql = 'SELECT mt."Name" AS membershiptype, mt."AnnualDues" AS annualdues FROM "CRM"."vwMembershipTypes" mt';
        const cols = extractPG(sql);

        expect(cols).toHaveLength(2);
        expect(cols[0].OutputName).toBe('membershiptype');
        expect(cols[0].SourceColumn).toBe('Name');
        expect(cols[1].OutputName).toBe('annualdues');
        expect(cols[1].SourceColumn).toBe('AnnualDues');
    });

    it('should handle mixed quoted and unquoted identifiers', () => {
        const sql = 'SELECT m."ID" AS memberid, cm.membershiptype FROM "CRM"."vwMembers" m LEFT JOIN cte cm ON m."ID" = cm.memberid';
        const cols = extractPG(sql);

        expect(cols).toHaveLength(2);
        expect(cols[0].OutputName).toBe('memberid');
        expect(cols[0].SourceColumn).toBe('ID');
        expect(cols[1].OutputName).toBe('membershiptype');
        expect(cols[1].SourceColumn).toBe('membershiptype');
        expect(cols[1].TableQualifier).toBe('cm');
    });
});

describe('PostgreSQL: aggregate functions', () => {
    it('should extract COUNT(DISTINCT) as computed', () => {
        const sql = 'SELECT COUNT(DISTINCT m."ID") AS activemembercount FROM "CRM"."vwMembers" m';
        const cols = extractPG(sql);

        expect(cols).toHaveLength(1);
        expect(cols[0].OutputName).toBe('activemembercount');
        expect(cols[0].IsExpression).toBe(true);
    });

    it('should extract MIN/MAX of quoted columns as computed', () => {
        const sql = 'SELECT MIN(ms."StartDate") AS earliestmembership, MAX(ms."StartDate") AS latestmembership FROM "CRM"."vwMemberships" ms';
        const cols = extractPG(sql);

        expect(cols).toHaveLength(2);
        expect(cols[0].OutputName).toBe('earliestmembership');
        expect(cols[0].IsExpression).toBe(true);
        expect(cols[1].OutputName).toBe('latestmembership');
        expect(cols[1].IsExpression).toBe(true);
    });
});

describe('PostgreSQL: CTE queries', () => {
    it('should extract fields from outermost SELECT of CTE query', () => {
        const sql = `WITH CurrentMembership AS (
            SELECT ms."MemberID" AS memberid, mt."Name" AS membershiptype
            FROM associationdemo."vwMemberships" ms
            INNER JOIN associationdemo."vwMembershipTypes" mt ON ms."MembershipTypeID" = mt."ID"
        )
        SELECT m."ID" AS memberid, m."FirstName" AS firstname, cm.membershiptype
        FROM associationdemo."vwMembers" m
        LEFT JOIN CurrentMembership cm ON m."ID" = cm.memberid`;

        const cols = extractPG(sql);

        expect(cols).toHaveLength(3);
        expect(cols[0]).toMatchObject({ OutputName: 'memberid', SourceColumn: 'ID', IsExpression: false });
        expect(cols[1]).toMatchObject({ OutputName: 'firstname', SourceColumn: 'FirstName', IsExpression: false });
        expect(cols[2]).toMatchObject({ OutputName: 'membershiptype', SourceColumn: 'membershiptype', IsExpression: false });
    });

    it('should handle multi-CTE queries with revenue aggregation', () => {
        const sql = `WITH MemberRevenue AS (
            SELECT i."MemberID" AS memberid,
                   SUM(li."Amount") AS totalrevenue
            FROM associationdemo."vwInvoices" i
            INNER JOIN associationdemo."vwInvoiceLineItems" li ON i."ID" = li."InvoiceID"
            GROUP BY i."MemberID"
        )
        SELECT m."ID" AS memberid, m."FirstName" AS firstname,
               COALESCE(rev.totalrevenue, 0) AS totalrevenue
        FROM associationdemo."vwMembers" m
        LEFT JOIN MemberRevenue rev ON m."ID" = rev.memberid`;

        const cols = extractPG(sql);

        expect(cols).toHaveLength(3);
        expect(cols[0]).toMatchObject({ OutputName: 'memberid', SourceColumn: 'ID' });
        expect(cols[1]).toMatchObject({ OutputName: 'firstname', SourceColumn: 'FirstName' });
        // COALESCE is an expression
        expect(cols[2].OutputName).toBe('totalrevenue');
        expect(cols[2].IsExpression).toBe(true);
    });
});

describe('PostgreSQL: Nunjucks templates', () => {
    it('should extract fields when SQL contains Nunjucks conditionals', () => {
        const sql = `SELECT m."ID" AS memberid, m."FirstName" AS firstname, m."JoinDate" AS joindate
FROM associationdemo."vwMembers" m
WHERE 1=1
{% if JoinYear %}
  AND EXTRACT(YEAR FROM m."JoinDate")::INTEGER = {{ JoinYear | sqlNumber }}
{% endif %}
ORDER BY m."FirstName"`;

        const cols = extractPG(sql);

        expect(cols).toHaveLength(3);
        expect(cols[0]).toMatchObject({ OutputName: 'memberid', SourceColumn: 'ID' });
        expect(cols[1]).toMatchObject({ OutputName: 'firstname', SourceColumn: 'FirstName' });
        expect(cols[2]).toMatchObject({ OutputName: 'joindate', SourceColumn: 'JoinDate' });
    });
});

// ═══════════════════════════════════════════════════
// BuildFieldsFromSelectColumns with PG columns
// ═══════════════════════════════════════════════════

describe('BuildFieldsFromSelectColumns (PostgreSQL)', () => {
    it('should build fields from PG double-quoted columns', () => {
        const sql = 'SELECT mt."Name" AS membershiptype, mt."AnnualDues" AS annualdues FROM associationdemo."vwMembershipTypes" mt';
        const selectColumns = extractPG(sql);
        const fields = BuildFieldsFromSelectColumns(selectColumns);

        expect(fields).not.toBeNull();
        expect(fields).toHaveLength(2);
        expect(fields![0].name).toBe('membershiptype');
        expect(fields![0].sourceFieldName).toBe('Name');
        expect(fields![0].isComputed).toBe(false);
        expect(fields![1].name).toBe('annualdues');
        expect(fields![1].sourceFieldName).toBe('AnnualDues');
    });

    it('should classify aggregates as computed from PG SQL', () => {
        const sql = `SELECT
            COUNT(DISTINCT m."ID") AS activemembercount,
            MIN(ms."StartDate") AS earliestmembership,
            MAX(ms."StartDate") AS latestmembership
        FROM associationdemo."vwMembers" m
        JOIN associationdemo."vwMemberships" ms ON m."ID" = ms."MemberID"`;
        const selectColumns = extractPG(sql);
        const fields = BuildFieldsFromSelectColumns(selectColumns);

        expect(fields).not.toBeNull();
        expect(fields).toHaveLength(3);
        expect(fields!.every(f => f.isComputed)).toBe(true);
        expect(fields!.every(f => f.sourceFieldName === null)).toBe(true);
    });

    it('should handle the full Active Members By Membership Type PG query', () => {
        const sql = `SELECT
    mt."Name" AS membershiptype,
    mt."AnnualDues" AS annualdues,
    COUNT(DISTINCT m."ID") AS activemembercount,
    ROUND(
        (COUNT(DISTINCT m."ID") * 100.0 / SUM(COUNT(DISTINCT m."ID")) OVER ())::numeric,
        1
    ) AS percentageoftotal,
    MIN(ms."StartDate") AS earliestmembership,
    MAX(ms."StartDate") AS latestmembership
FROM associationdemo."vwMemberships" ms
INNER JOIN associationdemo."vwMembershipTypes" mt ON ms."MembershipTypeID" = mt."ID"
INNER JOIN associationdemo."vwMembers" m ON ms."MemberID" = m."ID"
WHERE ms."Status" = 'Active'
GROUP BY mt."Name", mt."AnnualDues"
ORDER BY activemembercount DESC`;

        const selectColumns = extractPG(sql);
        const fields = BuildFieldsFromSelectColumns(selectColumns);

        expect(fields).not.toBeNull();
        expect(fields).toHaveLength(6);

        const membershipType = fields!.find(f => f.name === 'membershiptype')!;
        expect(membershipType.sourceFieldName).toBe('Name');
        expect(membershipType.isComputed).toBe(false);

        const annualDues = fields!.find(f => f.name === 'annualdues')!;
        expect(annualDues.sourceFieldName).toBe('AnnualDues');
        expect(annualDues.isComputed).toBe(false);

        const activeMemberCount = fields!.find(f => f.name === 'activemembercount')!;
        expect(activeMemberCount.isComputed).toBe(true);
        expect(activeMemberCount.sourceFieldName).toBeNull();

        const percentageOfTotal = fields!.find(f => f.name === 'percentageoftotal')!;
        expect(percentageOfTotal.isComputed).toBe(true);
    });
});

// ═══════════════════════════════════════════════════
// Cross-dialect parity: same query in T-SQL vs PG
// ═══════════════════════════════════════════════════

describe('Cross-dialect parity', () => {
    it('should extract the same field count from equivalent T-SQL and PG queries', () => {
        const tsql = `SELECT
    mt.Name AS MembershipType,
    mt.AnnualDues,
    COUNT(DISTINCT m.ID) AS ActiveMemberCount
FROM [AssociationDemo].[vwMemberships] ms
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON ms.MemberID = m.ID
WHERE ms.Status = 'Active'
GROUP BY mt.Name, mt.AnnualDues`;

        const pg = `SELECT
    mt."Name" AS membershiptype,
    mt."AnnualDues" AS annualdues,
    COUNT(DISTINCT m."ID") AS activemembercount
FROM associationdemo."vwMemberships" ms
INNER JOIN associationdemo."vwMembershipTypes" mt ON ms."MembershipTypeID" = mt."ID"
INNER JOIN associationdemo."vwMembers" m ON ms."MemberID" = m."ID"
WHERE ms."Status" = 'Active'
GROUP BY mt."Name", mt."AnnualDues"`;

        const tsqlFields = BuildFieldsFromSelectColumns(extractTSQL(tsql));
        const pgFields = BuildFieldsFromSelectColumns(extractPG(pg));

        expect(tsqlFields).not.toBeNull();
        expect(pgFields).not.toBeNull();
        expect(tsqlFields!.length).toBe(pgFields!.length);

        // Both should have 2 direct columns and 1 computed
        expect(tsqlFields!.filter(f => !f.isComputed).length).toBe(2);
        expect(pgFields!.filter(f => !f.isComputed).length).toBe(2);
        expect(tsqlFields!.filter(f => f.isComputed).length).toBe(1);
        expect(pgFields!.filter(f => f.isComputed).length).toBe(1);
    });

    it('should extract same source column names (pre-alias) across dialects', () => {
        const tsql = 'SELECT t.FirstName AS Name, t.Email FROM [__mj].[vwUsers] t';
        const pg = 'SELECT t."FirstName" AS name, t."Email" AS email FROM __mj."vwUsers" t';

        const tsqlCols = extractTSQL(tsql);
        const pgCols = extractPG(pg);

        // Source column should be the original column name in both
        expect(tsqlCols[0].SourceColumn).toBe('FirstName');
        expect(pgCols[0].SourceColumn).toBe('FirstName');
        expect(tsqlCols[1].SourceColumn).toBe('Email');
        expect(pgCols[1].SourceColumn).toBe('Email');
    });
});
