/**
 * Tests for MJSQLParser.WalkAST — the AST annotation walker.
 *
 * Verifies that MJ template expressions and composition references
 * are correctly located within the SQL AST and annotated with their
 * clause context (SELECT, WHERE, FROM, ORDER BY, etc.).
 */
import { describe, it, expect } from 'vitest';
import { MJSQLParser } from '../mj-sql-parser.js';

describe('MJSQLParser.WalkAST', () => {
    describe('Basic functionality', () => {
        it('should return empty result for plain SQL (no MJ extensions)', () => {
            const result = MJSQLParser.Astify('SELECT Name FROM Users WHERE Active = 1');
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.annotations).toHaveLength(0);
            expect(walk.templateExprs).toHaveLength(0);
            expect(walk.compositionRefs).toHaveLength(0);
        });

        it('should return empty result when AST parsing failed', () => {
            const result = MJSQLParser.Astify('SELECT FROM WHERE (((( BROKEN');
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.annotations).toHaveLength(0);
        });
    });

    describe('Template expressions in WHERE clause', () => {
        it('should find sqlString expression in WHERE', () => {
            const result = MJSQLParser.Astify(
                "SELECT Name FROM Users WHERE Region = {{ Region | sqlString }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            expect(walk.templateExprs[0].clauseContext).toBe('where');
            expect(walk.templateExprs[0].templateExpr!.variable).toBe('Region');
            expect(walk.templateExprs[0].templateExpr!.filters[0].name).toBe('sqlString');
        });

        it('should find sqlNumber expression in WHERE', () => {
            const result = MJSQLParser.Astify(
                "SELECT ID FROM Members WHERE Score >= {{ MinScore | sqlNumber }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            expect(walk.templateExprs[0].clauseContext).toBe('where');
            expect(walk.templateExprs[0].templateExpr!.variable).toBe('MinScore');
            expect(walk.templateExprs[0].placeholderContext).toBe('number');
        });

        it('should find multiple expressions in WHERE', () => {
            const result = MJSQLParser.Astify(
                "SELECT ID FROM Members WHERE Region = {{ Region | sqlString }} AND Score >= {{ MinScore | sqlNumber }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(2);
            const variables = walk.templateExprs.map(a => a.templateExpr!.variable).sort();
            expect(variables).toEqual(['MinScore', 'Region']);
            expect(walk.templateExprs.every(a => a.clauseContext === 'where')).toBe(true);
        });
    });

    describe('Template expressions in SELECT clause', () => {
        it('should find sqlIdentifier in SELECT column', () => {
            const result = MJSQLParser.Astify(
                "SELECT {{ DynamicCol | sqlIdentifier }} FROM Users"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            expect(walk.templateExprs[0].clauseContext).toBe('select');
            expect(walk.templateExprs[0].templateExpr!.variable).toBe('DynamicCol');
        });
    });

    describe('Template expressions in ORDER BY', () => {
        it('should find sqlIdentifier in ORDER BY', () => {
            const result = MJSQLParser.Astify(
                "SELECT ID, Name FROM Users ORDER BY {{ SortCol | sqlIdentifier }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            expect(walk.templateExprs[0].clauseContext).toBe('order_by');
            expect(walk.templateExprs[0].templateExpr!.variable).toBe('SortCol');
        });
    });

    describe('Template expressions in GROUP BY', () => {
        it('should find sqlIdentifier in GROUP BY', () => {
            const result = MJSQLParser.Astify(
                "SELECT COUNT(*) FROM Users GROUP BY {{ GroupCol | sqlIdentifier }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            const groupByAnnotations = walk.byClause.get('group_by') || [];
            expect(groupByAnnotations.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Expressions across multiple clauses', () => {
        it('should annotate expressions in different clauses', () => {
            const result = MJSQLParser.Astify(
                "SELECT {{ Col | sqlIdentifier }} FROM Users WHERE Status = {{ Status | sqlString }} ORDER BY {{ Sort | sqlIdentifier }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs.length).toBeGreaterThanOrEqual(3);

            const selectAnnotations = walk.byClause.get('select') || [];
            const whereAnnotations = walk.byClause.get('where') || [];
            const orderAnnotations = walk.byClause.get('order_by') || [];

            expect(selectAnnotations.length).toBeGreaterThanOrEqual(1);
            expect(whereAnnotations.length).toBeGreaterThanOrEqual(1);
            expect(orderAnnotations.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('CTE context', () => {
        it('should annotate expressions inside CTEs', () => {
            const result = MJSQLParser.Astify(
                "WITH Filtered AS (SELECT ID FROM Users WHERE Status = {{ Status | sqlString }}) SELECT * FROM Filtered"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            // The expression is inside the CTE's WHERE clause
            // It should be annotated as 'cte' context (walked under the CTE)
            const annotation = walk.templateExprs[0];
            expect(annotation.path).toContain('with');
        });
    });

    describe('Subquery context', () => {
        it('should annotate expressions inside subqueries in FROM', () => {
            const result = MJSQLParser.Astify(
                "SELECT * FROM (SELECT ID FROM Users WHERE Score > {{ Min | sqlNumber }}) sub"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs.length).toBeGreaterThanOrEqual(1);
            const minAnnotation = walk.templateExprs.find(a => a.templateExpr!.variable === 'Min');
            expect(minAnnotation).toBeDefined();
        });
    });

    describe('byClause index', () => {
        it('should group annotations by clause context', () => {
            const result = MJSQLParser.Astify(
                "SELECT Name FROM Users WHERE Region = {{ Region | sqlString }} AND Year = {{ Year | sqlNumber }} ORDER BY {{ Sort | sqlIdentifier }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            const whereAnnotations = walk.byClause.get('where') || [];
            const orderAnnotations = walk.byClause.get('order_by') || [];

            expect(whereAnnotations).toHaveLength(2);
            expect(orderAnnotations).toHaveLength(1);
        });
    });

    describe('byPlaceholder index', () => {
        it('should index annotations by placeholder string', () => {
            const result = MJSQLParser.Astify(
                "SELECT Name FROM Users WHERE Region = {{ Region | sqlString }}"
            );
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.byPlaceholder.size).toBe(1);
            const entry = Array.from(walk.byPlaceholder.values())[0];
            expect(entry.templateExpr!.variable).toBe('Region');
        });
    });

    describe('Placeholder context types', () => {
        it('should identify string placeholder context', () => {
            const result = MJSQLParser.Astify("SELECT * FROM T WHERE x = {{ v | sqlString }}");
            const walk = MJSQLParser.WalkAST(result);
            expect(walk.templateExprs[0].placeholderContext).toBe('string');
        });

        it('should identify number placeholder context', () => {
            const result = MJSQLParser.Astify("SELECT * FROM T WHERE x = {{ v | sqlNumber }}");
            const walk = MJSQLParser.WalkAST(result);
            expect(walk.templateExprs[0].placeholderContext).toBe('number');
        });

        it('should identify identifier placeholder context', () => {
            const result = MJSQLParser.Astify("SELECT * FROM T ORDER BY {{ v | sqlIdentifier }}");
            const walk = MJSQLParser.WalkAST(result);
            expect(walk.templateExprs[0].placeholderContext).toBe('identifier');
        });
    });

    describe('Real-world queries', () => {
        it('should annotate member-lifetime-revenue pattern', () => {
            const sql = `SELECT m.ID FROM [AssociationDemo].[vwMembers] m
WHERE YEAR(m.JoinDate) = {{ JoinYear | sqlNumber }}
  AND m.Status = {{ MembershipType | sqlString }}
ORDER BY m.Name`;

            const result = MJSQLParser.Astify(sql);
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(2);

            const whereExprs = walk.templateExprs.filter(a => a.clauseContext === 'where');
            expect(whereExprs).toHaveLength(2);

            const joinYearAnn = walk.templateExprs.find(a => a.templateExpr!.variable === 'JoinYear');
            expect(joinYearAnn).toBeDefined();
            expect(joinYearAnn!.placeholderContext).toBe('number');

            const memberTypeAnn = walk.templateExprs.find(a => a.templateExpr!.variable === 'MembershipType');
            expect(memberTypeAnn).toBeDefined();
            expect(memberTypeAnn!.placeholderContext).toBe('string');
        });

        it('should annotate CTA presidents pattern with sqlString in WHERE', () => {
            const sql = `SELECT pres.FirstName FROM nams.vwUserJoiners uj
WHERE uj.Name LIKE {{ StaffMemberName | sqlString }}
ORDER BY inst.Name`;

            const result = MJSQLParser.Astify(sql);
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            expect(walk.templateExprs[0].clauseContext).toBe('where');
            expect(walk.templateExprs[0].templateExpr!.variable).toBe('StaffMemberName');
        });

        it('should annotate query with expressions in multiple places', () => {
            const sql = `SELECT {{ Col1 | sqlIdentifier }}, Name
FROM Users
WHERE Status = {{ Status | sqlString }}
  AND Score > {{ MinScore | sqlNumber }}
ORDER BY {{ SortCol | sqlIdentifier }}`;

            const result = MJSQLParser.Astify(sql);
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs.length).toBeGreaterThanOrEqual(4);

            // Verify each clause has the right annotations
            expect(walk.byClause.get('select')?.length).toBeGreaterThanOrEqual(1);
            expect(walk.byClause.get('where')?.length).toBeGreaterThanOrEqual(2);
            expect(walk.byClause.get('order_by')?.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('JOIN ON context', () => {
        it('should annotate expressions in JOIN ON conditions', () => {
            const sql = `SELECT u.Name, r.Title
FROM Users u
INNER JOIN Roles r ON u.RoleID = r.ID AND r.Level = {{ MinLevel | sqlNumber }}`;

            const result = MJSQLParser.Astify(sql);
            const walk = MJSQLParser.WalkAST(result);

            expect(walk.templateExprs).toHaveLength(1);
            expect(walk.templateExprs[0].clauseContext).toBe('join_on');
            expect(walk.templateExprs[0].templateExpr!.variable).toBe('MinLevel');
        });
    });
});
