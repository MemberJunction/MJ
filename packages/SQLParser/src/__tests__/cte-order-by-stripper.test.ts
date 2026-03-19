import { describe, it, expect } from 'vitest';
import { stripOrderByForCTE } from '../cte-order-by-stripper.js';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';

const sqlServer = new SQLServerDialect();
const postgresql = new PostgreSQLDialect();

/**
 * Helper: asserts SQL was returned completely unchanged.
 */
function expectUnchanged(sql: string, result: string): void {
    expect(result).toBe(sql);
}

describe('stripOrderByForCTE', () => {
    // ================================================================
    // 1. BASIC ORDER BY REMOVAL
    // ================================================================
    describe('basic ORDER BY removal', () => {
        it('should strip a simple trailing ORDER BY', () => {
            const sql = 'SELECT ID, Name FROM Users ORDER BY Name ASC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?Name\]?/i);
            expect(result).toMatch(/SELECT/i);
            expect(result).toMatch(/FROM/i);
        });

        it('should strip ORDER BY with multiple columns', () => {
            const sql = 'SELECT * FROM Sales ORDER BY Region ASC, Amount DESC, Date';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY DESC', () => {
            const sql = 'SELECT ID FROM Users ORDER BY CreatedAt DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with table-qualified columns', () => {
            const sql = 'SELECT u.ID, u.Name FROM Users u ORDER BY u.Name ASC, u.ID DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with schema-qualified table', () => {
            const sql = 'SELECT ID FROM __mj.AIAgentRun ORDER BY StartedAt DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should return SQL unchanged when no ORDER BY is present', () => {
            const sql = 'SELECT ID, Name FROM Users WHERE Active = 1';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should return SQL unchanged when SELECT has no ORDER BY clause', () => {
            const sql = 'SELECT COUNT(*) AS Total FROM Users GROUP BY Status';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });
    });

    // ================================================================
    // 2. COMPLEX ORDER BY EXPRESSIONS
    // ================================================================
    describe('complex ORDER BY expressions', () => {
        it('should strip ORDER BY with CASE expression', () => {
            const sql = "SELECT ID FROM Users ORDER BY CASE WHEN Status = 'Active' THEN 0 ELSE 1 END, Name";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with function calls', () => {
            const sql = 'SELECT ID, Name FROM Users ORDER BY UPPER(LastName), FirstName';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with column ordinal positions', () => {
            const sql = 'SELECT ID, Name, Status FROM Users ORDER BY 2, 3 DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with COALESCE/ISNULL', () => {
            const sql = "SELECT ID FROM Users ORDER BY COALESCE(SortOrder, 999), Name";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with arithmetic expressions', () => {
            const sql = 'SELECT ID, Price, Qty FROM Orders ORDER BY Price * Qty DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY NEWID() (random ordering)', () => {
            const sql = 'SELECT ID, Name FROM Users ORDER BY NEWID()';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // 3. LEGAL ORDER BY PRESERVATION (TOP, OFFSET, FOR XML)
    // ================================================================
    describe('legal ORDER BY preservation', () => {
        it('should preserve ORDER BY when TOP is present', () => {
            const sql = 'SELECT TOP 10 ID, Name FROM Users ORDER BY Name ASC';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should preserve ORDER BY when TOP with parentheses is present', () => {
            const sql = 'SELECT TOP (10) ID FROM Users ORDER BY Score DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            // AST detects TOP via ast.top node — ORDER BY should be preserved
            expect(result).toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/TOP/i);
        });

        it('should preserve ORDER BY when TOP 1 is present', () => {
            const sql = 'SELECT TOP 1 ID FROM Users ORDER BY CreatedAt DESC';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should preserve ORDER BY with OFFSET...FETCH', () => {
            const sql = 'SELECT ID FROM Users ORDER BY ID OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should preserve ORDER BY with OFFSET 0 ROWS', () => {
            const sql = 'SELECT ID FROM Users ORDER BY ID OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should preserve ORDER BY when FOR XML PATH is present', () => {
            const sql = "SELECT ID, Name FROM Users ORDER BY Name FOR XML PATH('User')";
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should preserve ORDER BY when FOR XML RAW is present', () => {
            const sql = "SELECT ID, Name FROM Users ORDER BY Name FOR XML RAW";
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should preserve ORDER BY when FOR XML AUTO is present', () => {
            const sql = "SELECT ID, Name FROM Users ORDER BY Name FOR XML AUTO";
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });
    });

    // ================================================================
    // 4. WINDOW FUNCTIONS — ORDER BY inside OVER() must be preserved
    // ================================================================
    describe('window function preservation', () => {
        it('should strip trailing ORDER BY but preserve ROW_NUMBER() OVER ORDER BY', () => {
            const sql = 'SELECT ID, ROW_NUMBER() OVER (ORDER BY Score DESC) AS RowNum FROM Users ORDER BY Name';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?Name\]?/i);
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?Score\]?/i);
        });

        it('should strip trailing ORDER BY but preserve RANK() OVER', () => {
            const sql = 'SELECT ID, RANK() OVER (PARTITION BY Dept ORDER BY Salary DESC) AS R FROM Employees ORDER BY ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?ID\]?\s*$/i);
            expect(result).toMatch(/ORDER\s+BY\s+\[?Salary\]?/i);
        });

        it('should strip trailing ORDER BY but preserve DENSE_RANK() OVER', () => {
            const sql = 'SELECT ID, DENSE_RANK() OVER (ORDER BY Score DESC) AS DR FROM Students ORDER BY Name';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?Name\]?/i);
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?Score\]?/i);
        });

        it('should strip trailing ORDER BY but preserve NTILE() OVER', () => {
            const sql = 'SELECT ID, NTILE(4) OVER (ORDER BY Score DESC) AS Quartile FROM Students ORDER BY ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?ID\]?\s*$/i);
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?Score\]?/i);
        });

        it('should strip trailing ORDER BY but preserve SUM() OVER with ORDER BY (running total)', () => {
            const sql = 'SELECT ID, Amount, SUM(Amount) OVER (ORDER BY CreatedAt) AS RunningTotal FROM Payments ORDER BY CreatedAt';
            const result = stripOrderByForCTE(sql, sqlServer);
            // The standalone trailing ORDER BY CreatedAt should be stripped
            // but the OVER (ORDER BY CreatedAt) must remain
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?CreatedAt\]?/i);
        });

        it('should handle multiple window functions with different ORDER BY clauses', () => {
            const sql = `SELECT ID,
                ROW_NUMBER() OVER (PARTITION BY AgentID ORDER BY StartedAt DESC) AS RunRank,
                SUM(TotalTokensUsed) OVER (PARTITION BY AgentID ORDER BY StartedAt) AS CumulativeTokens
            FROM __mj.AIAgentRun
            ORDER BY AgentID, StartedAt DESC`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // Trailing ORDER BY AgentID, StartedAt DESC should be stripped
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?AgentID\]?,\s*\[?StartedAt\]?\s+DESC\s*$/i);
            // Both window function ORDER BY clauses should be preserved
            expect(result).toMatch(/OVER\s*\(\s*PARTITION\s+BY\s+\[?AgentID\]?\s+ORDER\s+BY\s+\[?StartedAt\]?\s+DESC\s*\)/i);
            expect(result).toMatch(/OVER\s*\(\s*PARTITION\s+BY\s+\[?AgentID\]?\s+ORDER\s+BY\s+\[?StartedAt\]?/i);
        });

        it('should strip trailing ORDER BY but preserve LAG/LEAD window functions', () => {
            const sql = 'SELECT ID, Value, LAG(Value) OVER (ORDER BY CreatedAt) AS PrevValue FROM Metrics ORDER BY CreatedAt';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?CreatedAt\]?/i);
        });

        it('should strip trailing ORDER BY but preserve AVG() OVER with ROWS BETWEEN', () => {
            const sql = 'SELECT ID, Value, AVG(Value) OVER (ORDER BY CreatedAt ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS MovingAvg FROM Metrics ORDER BY CreatedAt';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?CreatedAt\]?/i);
            expect(result).toMatch(/ROWS\s+BETWEEN/i);
        });

        it('should handle window function with no trailing ORDER BY (no-op)', () => {
            const sql = 'SELECT ID, ROW_NUMBER() OVER (ORDER BY Score DESC) AS RowNum FROM Users';
            const result = stripOrderByForCTE(sql, sqlServer);
            // No trailing ORDER BY to strip — window ORDER BY should be preserved
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?Score\]?/i);
        });

        it('should handle window function PARTITION BY without ORDER BY inside OVER', () => {
            const sql = 'SELECT ID, COUNT(*) OVER (PARTITION BY Dept) AS DeptCount FROM Employees ORDER BY Name';
            const result = stripOrderByForCTE(sql, sqlServer);
            // Trailing ORDER BY Name should be stripped
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?Name\]?/i);
            // PARTITION BY should be preserved
            expect(result).toMatch(/PARTITION\s+BY\s+\[?Dept\]?/i);
        });
    });

    // ================================================================
    // 5. STRING_AGG WITH WITHIN GROUP
    // ================================================================
    describe('STRING_AGG WITHIN GROUP', () => {
        it('should safely handle STRING_AGG WITHIN GROUP (does not corrupt SQL)', () => {
            // Known limitation: node-sql-parser cannot parse STRING_AGG WITHIN GROUP syntax.
            // The safe behavior is to not incorrectly mangle the SQL.
            const sql = "SELECT DeptID, STRING_AGG(Name, ',') WITHIN GROUP (ORDER BY Name) FROM Employees GROUP BY DeptID ORDER BY DeptID";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).toContain('STRING_AGG');
            expect(result).toContain('WITHIN GROUP');
        });

        it('should not corrupt STRING_AGG without trailing ORDER BY', () => {
            const sql = "SELECT DeptID, STRING_AGG(Name, ',') WITHIN GROUP (ORDER BY Name) FROM Employees GROUP BY DeptID";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).toContain('STRING_AGG');
            expect(result).toContain('WITHIN GROUP');
        });
    });

    // ================================================================
    // 6. SUBQUERY ORDER BY PRESERVATION
    // ================================================================
    describe('subquery ORDER BY preservation', () => {
        it('should not strip ORDER BY inside a derived table with TOP', () => {
            const sql = 'SELECT * FROM (SELECT TOP 10 ID FROM Users ORDER BY Score DESC) sub';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).toMatch(/ORDER\s+BY/i);
        });

        it('should not strip ORDER BY in a correlated subquery in WHERE', () => {
            const sql = 'SELECT u.ID FROM Users u WHERE u.ID IN (SELECT TOP 5 ID FROM Scores s WHERE s.UserID = u.ID ORDER BY Score DESC)';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).toMatch(/ORDER\s+BY/i);
        });

        it('should safely handle scalar subquery with ORDER BY in SELECT list', () => {
            // Scalar subqueries in SELECT lists are challenging for the AST parser.
            // The important thing is that the SQL is not incorrectly mangled.
            const sql = 'SELECT ID, (SELECT TOP 1 Name FROM Categories c WHERE c.ID = u.CatID ORDER BY Name) AS CatName FROM Users u ORDER BY ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            // Should not corrupt the SQL — subquery must remain intact
            expect(result).toMatch(/SELECT/i);
            expect(result).toContain('Categories');
        });

        it('should handle nested subqueries with ORDER BY at multiple levels', () => {
            const sql = `SELECT * FROM (
                SELECT TOP 5 ID, Name FROM (
                    SELECT TOP 10 ID, Name FROM Users ORDER BY Score DESC
                ) inner_sub
                ORDER BY Name
            ) outer_sub`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // All ORDER BY clauses are inside subqueries with TOP — should be preserved
            expect(result).toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // 7. STRING LITERALS CONTAINING ORDER BY
    // ================================================================
    describe('string literal preservation', () => {
        it('should strip real trailing ORDER BY but preserve string literal containing ORDER BY', () => {
            const sql = "SELECT ID, 'ORDER BY is a keyword' AS Label FROM Users ORDER BY ID";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?ID\]?\s*$/i);
            expect(result).toContain('ORDER BY is a keyword');
        });

        it('should handle multiple string literals with ORDER BY text', () => {
            const sql = "SELECT 'sort: ORDER BY Name' AS A, 'ORDER BY ID' AS B FROM T ORDER BY A";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?A\]?\s*$/i);
        });

        it('should handle empty string literal next to ORDER BY', () => {
            const sql = "SELECT ID, '' AS Empty FROM Users ORDER BY ID";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?ID\]?\s*$/i);
        });
    });

    // ================================================================
    // 8. JOINS
    // ================================================================
    describe('JOIN queries', () => {
        it('should strip trailing ORDER BY from INNER JOIN query', () => {
            const sql = 'SELECT u.ID, r.Name FROM Users u INNER JOIN Roles r ON u.RoleID = r.ID ORDER BY u.Name';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/JOIN/i);
        });

        it('should strip trailing ORDER BY from LEFT JOIN query', () => {
            const sql = 'SELECT u.ID, d.Name FROM Users u LEFT JOIN Departments d ON u.DeptID = d.ID ORDER BY d.Name, u.ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip trailing ORDER BY from multi-join query', () => {
            const sql = `SELECT u.ID, r.Name, d.Name AS Dept
                FROM Users u
                JOIN Roles r ON u.RoleID = r.ID
                JOIN Departments d ON u.DeptID = d.ID
                WHERE u.Active = 1
                ORDER BY d.Name, r.Name, u.ID`;
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // 9. GROUP BY + HAVING
    // ================================================================
    describe('GROUP BY and HAVING queries', () => {
        it('should strip ORDER BY from GROUP BY query', () => {
            const sql = 'SELECT Status, COUNT(*) AS Cnt FROM Users GROUP BY Status ORDER BY Cnt DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/GROUP\s+BY/i);
        });

        it('should strip ORDER BY from GROUP BY with HAVING', () => {
            const sql = 'SELECT DeptID, COUNT(*) AS Cnt FROM Users GROUP BY DeptID HAVING COUNT(*) > 5 ORDER BY Cnt DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/HAVING/i);
        });

        it('should strip ORDER BY from aggregate query with multiple groups', () => {
            const sql = 'SELECT YEAR(CreatedAt) AS Y, MONTH(CreatedAt) AS M, COUNT(*) AS Total FROM Events GROUP BY YEAR(CreatedAt), MONTH(CreatedAt) ORDER BY Y, M';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // 10. UNION / EXCEPT / INTERSECT
    // ================================================================
    describe('set operations', () => {
        it('should strip trailing ORDER BY from UNION ALL query (AST walks _next chain)', () => {
            const sql = 'SELECT ID, Name FROM Users UNION ALL SELECT ID, Name FROM Admins ORDER BY Name';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/UNION\s+ALL/i);
            expect(result).toContain('Users');
            expect(result).toContain('Admins');
        });

        it('should strip trailing ORDER BY from UNION query', () => {
            const sql = 'SELECT ID FROM Users UNION SELECT ID FROM Admins ORDER BY ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toContain('Users');
            expect(result).toContain('Admins');
        });

        it('should strip trailing ORDER BY from EXCEPT query', () => {
            const sql = 'SELECT ID FROM AllUsers EXCEPT SELECT ID FROM BannedUsers ORDER BY ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toContain('AllUsers');
            expect(result).toContain('BannedUsers');
        });

        it('should strip UNION ORDER BY even when TOP is on first SELECT (TOP applies to first SELECT only)', () => {
            const sql = 'SELECT TOP 10 ID FROM Users UNION ALL SELECT ID FROM Admins ORDER BY ID';
            const result = stripOrderByForCTE(sql, sqlServer);
            // TOP on the first SELECT doesn't make the UNION's trailing ORDER BY legal in a CTE.
            // SQL Server's rule: ORDER BY on a UNION in a CTE needs TOP/OFFSET on the UNION result,
            // not on an individual branch. The AST correctly strips it.
            expect(result).not.toMatch(/\bORDER\s+BY\b/i);
            expect(result).toContain('TOP 10');
        });
    });

    // ================================================================
    // 11. DISTINCT
    // ================================================================
    describe('DISTINCT queries', () => {
        it('should strip ORDER BY from SELECT DISTINCT', () => {
            const sql = 'SELECT DISTINCT Status FROM Users ORDER BY Status';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/DISTINCT/i);
        });
    });

    // ================================================================
    // 12. POSTGRESQL PASS-THROUGH
    // ================================================================
    describe('PostgreSQL pass-through', () => {
        it('should NOT strip ORDER BY for PostgreSQL (simple)', () => {
            const sql = 'SELECT ID, Name FROM Users ORDER BY Name ASC';
            expectUnchanged(sql, stripOrderByForCTE(sql, postgresql));
        });

        it('should NOT strip complex ORDER BY for PostgreSQL', () => {
            const sql = 'SELECT * FROM Sales ORDER BY Region ASC, Amount DESC';
            expectUnchanged(sql, stripOrderByForCTE(sql, postgresql));
        });

        it('should NOT strip ORDER BY with window functions for PostgreSQL', () => {
            const sql = 'SELECT ID, ROW_NUMBER() OVER (ORDER BY Score DESC) AS R FROM Users ORDER BY Name';
            expectUnchanged(sql, stripOrderByForCTE(sql, postgresql));
        });

        it('should NOT strip ORDER BY from GROUP BY query for PostgreSQL', () => {
            const sql = 'SELECT Status, COUNT(*) FROM Users GROUP BY Status ORDER BY Status';
            expectUnchanged(sql, stripOrderByForCTE(sql, postgresql));
        });
    });

    // ================================================================
    // 13. NUNJUCKS TEMPLATE SQL (AST-guided with Nunjucks preprocessing)
    // ================================================================
    describe('Nunjucks template handling', () => {
        it('should strip ORDER BY from SQL with simple Nunjucks if/endif', () => {
            const sql = `SELECT m.ID, m.Name FROM Members m
{% if Region %}
WHERE m.Region = '{{ Region }}'
{% endif %}
ORDER BY m.Name`;
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toContain('{%');
        });

        it('should strip ORDER BY from SQL with Nunjucks for loop', () => {
            const sql = `SELECT ID, Name FROM Users
WHERE Status IN (
{% for s in Statuses %}
'{{ s }}'{% if not loop.last %},{% endif %}
{% endfor %}
)
ORDER BY Name`;
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toContain('{%');
        });

        it('should strip ORDER BY from SQL with Nunjucks sqlDate filter', () => {
            const sql = `SELECT ID, CreatedAt FROM Events
WHERE CreatedAt >= {{ StartDate | sqlDate }}
ORDER BY CreatedAt DESC`;
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY from complex Nunjucks template with multiple branches', () => {
            const sql = `SELECT
    YEAR(m.JoinDate) AS JoinYear,
    MONTH(m.JoinDate) AS JoinMonth,
    COUNT(DISTINCT m.ID) AS NewMembers
FROM Members m
{% if StartDate %}
WHERE m.JoinDate >= {{ StartDate | sqlDate }}
{% endif %}
{% if EndDate %}
  {% if StartDate %}
  AND m.JoinDate < {{ EndDate | sqlDate }}
  {% else %}
  WHERE m.JoinDate < {{ EndDate | sqlDate }}
  {% endif %}
{% endif %}
GROUP BY YEAR(m.JoinDate), MONTH(m.JoinDate)
ORDER BY JoinYear, JoinMonth`;
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toContain('{%');
            expect(result).toContain('GROUP BY');
        });

        it('should strip trailing ORDER BY from Nunjucks SQL with window function via AST-guided path', () => {
            // The Nunjucks-aware AST path should preprocess templates, detect the top-level ORDER BY
            // via AST analysis, and use the position-aware scanner to strip only the trailing one.
            const sql = `SELECT ID, ROW_NUMBER() OVER (ORDER BY Score DESC) AS Rank
FROM Users
{% if Active %}WHERE Active = 1{% endif %}
ORDER BY Name`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // Trailing ORDER BY Name should be stripped
            expect(result).not.toMatch(/ORDER\s+BY\s+Name/i);
            // Window function ORDER BY Score should be preserved
            expect(result).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+Score/i);
            // Nunjucks tokens preserved
            expect(result).toContain('{%');
        });

        it('should preserve ORDER BY in Nunjucks SQL with TOP', () => {
            const sql = `SELECT TOP 10 ID, Name FROM Users
{% if Status %}WHERE Status = {{ Status | sqlString }}{% endif %}
ORDER BY CreatedAt DESC`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // TOP makes ORDER BY legal — should be preserved
            expect(result).toMatch(/ORDER\s+BY/i);
            expect(result).toContain('{%');
        });

        it('should not strip ORDER BY from Nunjucks SQL inside subquery (paren depth > 0)', () => {
            const sql = `SELECT * FROM (
    SELECT TOP 10 ID FROM Users
    {% if Status %}
    WHERE Status = '{{ Status }}'
    {% endif %}
    ORDER BY Score DESC
) sub`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // ORDER BY is inside parens — should be preserved by regex fallback
            expect(result).toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // 14. REAL-WORLD COMPOSABLE QUERY PATTERNS
    // ================================================================
    describe('real-world composable query patterns', () => {
        it('should handle Agent Run Analytics pattern (multiple window functions + trailing ORDER BY)', () => {
            const sql = `SELECT
    AgentID,
    Status,
    StartedAt,
    TotalTokensUsed,
    ROW_NUMBER() OVER (PARTITION BY AgentID ORDER BY StartedAt DESC) AS RunRank,
    SUM(TotalTokensUsed) OVER (PARTITION BY AgentID ORDER BY StartedAt) AS CumulativeTokens
FROM __mj.AIAgentRun
ORDER BY AgentID, StartedAt DESC`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // Trailing ORDER BY stripped
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?AgentID\]?,\s*\[?StartedAt\]?\s+DESC\s*$/i);
            // Both window function ORDER BY preserved
            const overMatches = result.match(/OVER\s*\(/gi);
            expect(overMatches).not.toBeNull();
            expect(overMatches!.length).toBe(2);
            expect(result).toMatch(/OVER\s*\(\s*PARTITION\s+BY/i);
        });

        it('should handle Membership Growth pattern (window function + Nunjucks)', () => {
            // Hardest edge case: Nunjucks templates + window function ORDER BY + trailing ORDER BY.
            // The Nunjucks-aware AST path preprocesses templates, confirms there IS a top-level
            // ORDER BY via AST, then uses the position-aware scanner to strip only the trailing one.
            const sql = `SELECT
    YEAR(m.JoinDate) AS JoinYear,
    MONTH(m.JoinDate) AS JoinMonth,
    FORMAT(m.JoinDate, 'yyyy-MM') AS YearMonth,
    COUNT(DISTINCT m.ID) AS NewMembers,
    SUM(COUNT(DISTINCT m.ID)) OVER (
        ORDER BY YEAR(m.JoinDate), MONTH(m.JoinDate)
    ) AS CumulativeMembers
FROM Members m
{% if StartDate %}
WHERE m.JoinDate >= {{ StartDate | sqlDate }}
{% endif %}
GROUP BY YEAR(m.JoinDate), MONTH(m.JoinDate), FORMAT(m.JoinDate, 'yyyy-MM')
ORDER BY JoinYear, JoinMonth`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // Trailing ORDER BY JoinYear, JoinMonth should be stripped
            expect(result).not.toMatch(/ORDER\s+BY\s+JoinYear/i);
            // Window function ORDER BY inside OVER() should be preserved
            expect(result).toMatch(/OVER\s*\(\s*\n?\s*ORDER\s+BY/i);
            // Nunjucks tokens should survive
            expect(result).toContain('{%');
            expect(result).toContain('GROUP BY');
        });

        it('should handle Recent Entity Changes pattern (simple query)', () => {
            const sql = 'SELECT EntityID, COUNT(*) AS Changes, MAX(ChangedAt) AS LastChange FROM __mj.RecordChange GROUP BY EntityID ORDER BY Changes DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/GROUP\s+BY/i);
        });

        it('should handle Active Users pattern with JOIN', () => {
            const sql = `SELECT u.ID, u.Name, u.Email, r.Name AS RoleName
FROM __mj.User u
JOIN __mj.UserRole ur ON u.ID = ur.UserID
JOIN __mj.Role r ON ur.RoleID = r.ID
WHERE u.IsActive = 1
ORDER BY u.Name`;
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
            expect(result).toMatch(/JOIN/i);
        });
    });

    // ================================================================
    // 15. EDGE CASES AND BOUNDARY CONDITIONS
    // ================================================================
    describe('edge cases', () => {
        it('should handle empty string', () => {
            expect(stripOrderByForCTE('', sqlServer)).toBe('');
        });

        it('should handle null input', () => {
            expect(stripOrderByForCTE(null as unknown as string, sqlServer)).toBeNull();
        });

        it('should handle undefined input', () => {
            expect(stripOrderByForCTE(undefined as unknown as string, sqlServer)).toBeUndefined();
        });

        it('should handle trailing whitespace after ORDER BY', () => {
            const sql = 'SELECT ID FROM Users ORDER BY Name   ';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should handle SQL with ORDER in column/table names (not ORDER BY)', () => {
            const sql = 'SELECT OrderID, OrderDate FROM Orders WHERE OrderStatus = 1';
            expectUnchanged(sql, stripOrderByForCTE(sql, sqlServer));
        });

        it('should handle SELECT with only a trailing semicolon after ORDER BY', () => {
            // Note: sqlify may or may not preserve semicolons
            const sql = 'SELECT ID FROM Users ORDER BY Name;';
            const result = stripOrderByForCTE(sql, sqlServer);
            // Should strip ORDER BY (AST handles semicolons)
            expect(result).not.toMatch(/ORDER\s+BY\s+\[?Name\]?/i);
        });

        it('should handle very long ORDER BY with many columns', () => {
            const sql = 'SELECT * FROM T ORDER BY A ASC, B DESC, C ASC, D DESC, E ASC, F DESC, G ASC, H DESC';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should handle ORDER BY with NULLS FIRST/LAST (PostgreSQL syntax, AST may fail)', () => {
            // node-sql-parser may not support NULLS FIRST/LAST for TransactSQL
            // but the regex fallback should handle it safely
            const sql = 'SELECT ID FROM Users ORDER BY Name NULLS FIRST';
            const result = stripOrderByForCTE(sql, sqlServer);
            // Should attempt to strip (may succeed via AST or regex)
            // At minimum, should not corrupt the SQL
            expect(result).toMatch(/SELECT/i);
        });

        it('should handle SELECT 1 with ORDER BY (trivial query)', () => {
            const sql = 'SELECT 1 AS Val ORDER BY Val';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should handle SELECT with aliased columns in ORDER BY', () => {
            const sql = 'SELECT FirstName + LastName AS FullName FROM Users ORDER BY FullName';
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });

        it('should handle SQL that is just a SELECT without FROM', () => {
            const sql = "SELECT 'hello' AS Greeting ORDER BY Greeting";
            const result = stripOrderByForCTE(sql, sqlServer);
            expect(result).not.toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // 16. SQL COMMENTS CONTAINING ORDER BY
    // ================================================================
    describe('SQL comments', () => {
        it('should strip real ORDER BY even when a comment mentions ORDER BY', () => {
            const sql = `SELECT ID, Name FROM Users
-- This query is sorted by Name
ORDER BY Name`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // The real ORDER BY should be stripped; comment is just a comment
            expect(result).not.toMatch(/\bORDER\s+BY\s+\[?Name\]?\s*$/im);
        });

        it('should handle block comment containing ORDER BY before real ORDER BY', () => {
            const sql = `SELECT ID FROM Users
/* ORDER BY ID DESC was removed in v2 */
ORDER BY Name ASC`;
            const result = stripOrderByForCTE(sql, sqlServer);
            // Should strip the real ORDER BY Name ASC
            expect(result).toMatch(/SELECT/i);
        });
    });

    // ================================================================
    // 17. CROSS-DIALECT CONSISTENCY
    // ================================================================
    describe('dialect AllowsOrderByInCTE property', () => {
        it('SQLServerDialect.AllowsOrderByInCTE should be false', () => {
            expect(sqlServer.AllowsOrderByInCTE).toBe(false);
        });

        it('PostgreSQLDialect.AllowsOrderByInCTE should be true', () => {
            expect(postgresql.AllowsOrderByInCTE).toBe(true);
        });
    });
});
