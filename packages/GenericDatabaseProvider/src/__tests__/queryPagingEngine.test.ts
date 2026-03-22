import { describe, it, expect } from 'vitest';
import { QueryPagingEngine, PagingWrappedSQL } from '../queryPagingEngine';
import { DatabasePlatform } from '@memberjunction/core';

// ─── ShouldPage ────────────────────────────────────────────────────────────────

describe('QueryPagingEngine.ShouldPage', () => {
    it('returns true when both StartRow and MaxRows are valid', () => {
        expect(QueryPagingEngine.ShouldPage(0, 50)).toBe(true);
        expect(QueryPagingEngine.ShouldPage(100, 25)).toBe(true);
    });

    it('returns false when MaxRows is undefined or 0', () => {
        expect(QueryPagingEngine.ShouldPage(0, undefined)).toBe(false);
        expect(QueryPagingEngine.ShouldPage(0, 0)).toBe(false);
    });

    it('returns false when StartRow is undefined', () => {
        expect(QueryPagingEngine.ShouldPage(undefined, 50)).toBe(false);
    });

    it('returns false when both are undefined', () => {
        expect(QueryPagingEngine.ShouldPage(undefined, undefined)).toBe(false);
    });
});

// ─── splitCTEAndSelect ─────────────────────────────────────────────────────────

describe('QueryPagingEngine.splitCTEAndSelect', () => {
    it('returns empty ctePrefix for simple SELECT', () => {
        const sql = 'SELECT ID, Name FROM Users WHERE Active = 1';
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(sql);
        expect(ctePrefix).toBe('');
        expect(mainSelect).toBe(sql);
    });

    it('splits a single CTE from the main SELECT', () => {
        const sql = `WITH cte AS (
SELECT ID FROM Users
)
SELECT * FROM cte`;
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(sql);
        expect(ctePrefix).toContain('WITH cte AS');
        expect(mainSelect.trim()).toBe('SELECT * FROM cte');
    });

    it('splits multiple CTEs from the main SELECT', () => {
        const sql = `WITH a AS (
SELECT 1 AS x
),
b AS (
SELECT 2 AS y
)
SELECT * FROM a JOIN b ON 1=1`;
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(sql);
        expect(ctePrefix).toContain('WITH a AS');
        expect(ctePrefix).toContain('b AS');
        expect(mainSelect.trim()).toMatch(/^SELECT \* FROM a JOIN b/);
    });

    it('handles nested parentheses inside CTEs', () => {
        const sql = `WITH cte AS (
SELECT ID FROM Users WHERE Name IN ('a', 'b')
)
SELECT * FROM cte`;
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(sql);
        expect(ctePrefix).toContain('WITH cte AS');
        expect(mainSelect.trim()).toBe('SELECT * FROM cte');
    });
});

// ─── extractOrderBy ────────────────────────────────────────────────────────────

describe('QueryPagingEngine.extractOrderBy', () => {
    it('extracts a top-level ORDER BY clause', () => {
        const sql = 'SELECT * FROM Users ORDER BY Name ASC';
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(sql);
        expect(sqlWithoutOrder).toBe('SELECT * FROM Users');
        expect(orderByClause).toBe('Name ASC');
    });

    it('returns null when no ORDER BY exists', () => {
        const sql = 'SELECT * FROM Users';
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(sql);
        expect(sqlWithoutOrder).toBe(sql);
        expect(orderByClause).toBeNull();
    });

    it('ignores ORDER BY inside subqueries', () => {
        const sql = 'SELECT * FROM (SELECT * FROM Users ORDER BY ID) sub ORDER BY Name';
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(sql);
        expect(orderByClause).toBe('Name');
        // The inner ORDER BY should remain in the sqlWithoutOrder
        expect(sqlWithoutOrder).toContain('ORDER BY ID');
    });
});

// ─── stripTopClause ────────────────────────────────────────────────────────────

describe('QueryPagingEngine.stripTopClause', () => {
    it('strips TOP N from a SELECT', () => {
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause('SELECT TOP 100 ID, Name FROM Users');
        expect(topRemoved).toBe(true);
        expect(sql).toBe('SELECT ID, Name FROM Users');
    });

    it('strips TOP (N) from a SELECT', () => {
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause('SELECT TOP (50) ID FROM Users');
        expect(topRemoved).toBe(true);
        expect(sql).toBe('SELECT ID FROM Users');
    });

    it('strips TOP from SELECT DISTINCT', () => {
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause('SELECT DISTINCT TOP 10 Name FROM Users');
        expect(topRemoved).toBe(true);
        expect(sql).toBe('SELECT DISTINCT Name FROM Users');
    });

    it('returns unchanged SQL when no TOP clause', () => {
        const original = 'SELECT ID, Name FROM Users';
        const { sql, topRemoved } = QueryPagingEngine.stripTopClause(original);
        expect(topRemoved).toBe(false);
        expect(sql).toBe(original);
    });
});

// ─── WrapWithPaging (SQL Server) ───────────────────────────────────────────────

describe('QueryPagingEngine.WrapWithPaging — SQL Server', () => {
    const platform: DatabasePlatform = 'sqlserver';

    it('wraps a simple SELECT with CTE-based paging', () => {
        const sql = 'SELECT ID, Name FROM Users WHERE Active = 1 ORDER BY Name';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

        expect(result.Offset).toBe(0);
        expect(result.PageSize).toBe(25);
        expect(result.DataSQL).toContain('[__paged]');
        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
        // AST path quotes identifiers: ORDER BY `Name`, [Name], or Name
        expect(result.DataSQL).toMatch(/ORDER BY [`[\s]?Name[`\]]?/);
        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount FROM [__paged]');
    });

    it('preserves existing CTEs and appends __paged', () => {
        const sql = `WITH active_users AS (
SELECT ID, Name FROM Users WHERE Active = 1
)
SELECT * FROM active_users ORDER BY Name`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 10, 50, platform);

        // AST path bracket-quotes CTE names: [active_users] AS (...)
        expect(result.DataSQL).toMatch(/\[?active_users\]?\s+AS/);
        expect(result.DataSQL).toContain('[__paged] AS');
        expect(result.DataSQL).toContain('OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY');
    });

    it('adds default ORDER BY when none exists', () => {
        const sql = 'SELECT ID FROM Users';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, platform);

        // SQL Server uses (SELECT NULL) as neutral ORDER BY
        expect(result.DataSQL).toContain('ORDER BY (SELECT NULL)');
    });

    it('strips TOP clause before wrapping', () => {
        const sql = 'SELECT TOP 100 ID, Name FROM Users ORDER BY Name';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

        // TOP should not appear in the CTE definition
        expect(result.DataSQL).not.toMatch(/TOP\s+100/i);
        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
    });
});

// ─── WrapWithPaging (PostgreSQL) ───────────────────────────────────────────────

describe('QueryPagingEngine.WrapWithPaging — PostgreSQL', () => {
    const platform: DatabasePlatform = 'postgresql';

    it('wraps with LIMIT/OFFSET syntax', () => {
        const sql = 'SELECT ID, Name FROM Users WHERE Active = true ORDER BY Name';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, platform);

        expect(result.DataSQL).toContain('"__paged"');
        expect(result.DataSQL).toContain('LIMIT 25 OFFSET 0');
        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount FROM "__paged"');
    });

    it('adds default ORDER BY 1 when none exists', () => {
        const sql = 'SELECT ID FROM Users';
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 10, platform);

        expect(result.DataSQL).toContain('ORDER BY 1');
    });

    it('handles page 2 offset correctly', () => {
        const sql = 'SELECT * FROM Users ORDER BY ID';
        const result = QueryPagingEngine.WrapWithPaging(sql, 50, 25, platform);

        expect(result.Offset).toBe(50);
        expect(result.PageSize).toBe(25);
        expect(result.DataSQL).toContain('LIMIT 25 OFFSET 50');
    });
});

// ─── WrapWithPaging — CTE composition integration ──────────────────────────────

describe('QueryPagingEngine.WrapWithPaging — composition engine CTEs', () => {
    it('handles multiple composed CTEs from the composition engine', () => {
        const sql = `WITH __cq_0 AS (
SELECT CustomerID, SUM(Total) AS TotalRevenue
FROM Orders
GROUP BY CustomerID
),
__cq_1 AS (
SELECT ID, Name FROM Customers WHERE Status = 'Active'
)
SELECT c.Name, r.TotalRevenue
FROM __cq_1 c
JOIN __cq_0 r ON c.ID = r.CustomerID
ORDER BY r.TotalRevenue DESC`;

        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 20, 'sqlserver');

        // Should have all three CTEs: __cq_0, __cq_1, and __paged
        // AST path bracket-quotes CTE names
        expect(result.DataSQL).toMatch(/\[?__cq_0\]?\s+AS/);
        expect(result.DataSQL).toMatch(/\[?__cq_1\]?\s+AS/);
        expect(result.DataSQL).toContain('[__paged] AS');
        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY');
        // After remapping, ORDER BY should use projected column names
        // AST exprToSQL preserves table qualifiers with backtick quoting
        // The ORDER BY should reference TotalRevenue (possibly with table qualifier and quoting)
        expect(result.DataSQL).toMatch(/ORDER BY.*TotalRevenue.*DESC/);

        // Count query should also have all CTEs
        expect(result.CountSQL).toMatch(/\[?__cq_0\]?\s+AS/);
        expect(result.CountSQL).toContain('[__paged] AS');
        expect(result.CountSQL).toContain('TotalRowCount');
    });

    it('remaps ORDER BY with COALESCE and aliased columns to projected names', () => {
        // Include SQL comments like the real composition engine produces
        const sql = `WITH [__cte_Active_Users_k1gvl3] AS (
-- Reusable base query: Returns all active users with basic profile info
SELECT u.ID, u.Name, u.Email, u.Type, u.__mj_CreatedAt AS CreatedAt
FROM __mj.vwUsers u
WHERE u.IsActive = 1
),
[__cte_Recent_Entity_Changes_sokwc2] AS (
-- Reusable base query: Returns recent record changes grouped by entity
SELECT e.Name AS EntityName, COUNT(*) AS ChangeCount, MAX(rc.CreatedAt) AS LatestChange
FROM __mj.vwRecordChanges rc
INNER JOIN __mj.vwEntities e ON e.ID = rc.EntityID
WHERE rc.CreatedAt >= DATEADD(DAY, -30, GETUTCDATE())
GROUP BY e.Name
)
-- Composed query: Joins Active Users with Recent Entity Changes
-- Demonstrates composition syntax
SELECT au.Name AS UserName, au.Email, au.Type AS UserType, COALESCE(rc.ChangeCount, 0) AS RecentChanges, rc.LatestChange
FROM [__cte_Active_Users_k1gvl3] au
LEFT JOIN [__cte_Recent_Entity_Changes_sokwc2] rc ON rc.EntityName IN (
    SELECT e.Name FROM __mj.vwEntities e WHERE e.ID IN (
        SELECT DISTINCT EntityID FROM __mj.vwRecordChanges WHERE UserID = au.ID
    )
)
ORDER BY COALESCE(rc.ChangeCount, 0) DESC, au.Name`;

        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        // ORDER BY should use projected names, not table aliases
        expect(result.DataSQL).toContain('ORDER BY RecentChanges DESC, UserName');
        expect(result.DataSQL).not.toContain('ORDER BY COALESCE(rc.ChangeCount');
    });
});

// ═══════════════════════════════════════════════════
// Trailing Semicolon Handling
// ═══════════════════════════════════════════════════

describe('QueryPagingEngine — Trailing Semicolon Handling', () => {
    it('should strip trailing semicolon from simple SQL before wrapping', () => {
        const sql = `SELECT ID, Name FROM Users ORDER BY Name;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        // The OFFSET clause must come right after ORDER BY, not after a semicolon
        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
        expect(result.DataSQL).not.toContain(';\nOFFSET');
        expect(result.DataSQL).not.toContain(';\nSELECT');
    });

    it('should strip trailing semicolon from SQL with CTE', () => {
        const sql = `WITH Active AS (SELECT ID FROM Users WHERE Active = 1)
SELECT * FROM Active ORDER BY ID;`;

        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 50, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY');
        expect(result.DataSQL).not.toContain(';\n');
    });

    it('should strip trailing semicolon with whitespace after it', () => {
        const sql = `SELECT * FROM Users ORDER BY Name;   \n  `;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 25, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY');
        expect(result.DataSQL).not.toContain(';');
    });

    it('should not affect SQL without trailing semicolon', () => {
        const sql = `SELECT * FROM Users ORDER BY Name`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
    });

    it('should preserve semicolons inside string literals', () => {
        const sql = `SELECT ID, 'value; with semicolon' AS Label FROM Users ORDER BY ID`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        // String literal with semicolon should be preserved inside the CTE body
        expect(result.DataSQL).toContain('value; with semicolon');
        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY');
    });

    it('should handle PostgreSQL paging with trailing semicolon', () => {
        const sql = `SELECT * FROM users ORDER BY name;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 10, 20, 'postgresql');

        expect(result.DataSQL).toContain('LIMIT 20 OFFSET 10');
        expect(result.DataSQL).not.toContain(';\n');
    });

    it('should handle SQL with Nunjucks template expression followed by semicolon', () => {
        // This is the exact pattern from the External Change Detection bug
        const sql = `SELECT * FROM Users WHERE Region = 'West' ORDER BY ID;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 5000, 'sqlserver');

        expect(result.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 5000 ROWS ONLY');
        // The semicolon should NOT appear between ORDER BY and OFFSET
        const orderByIdx = result.DataSQL.lastIndexOf('ORDER BY');
        const offsetIdx = result.DataSQL.indexOf('OFFSET');
        const between = result.DataSQL.substring(orderByIdx, offsetIdx);
        expect(between).not.toContain(';');
    });

    it('should produce valid count SQL without semicolon', () => {
        const sql = `SELECT * FROM Users ORDER BY Name;`;
        const result = QueryPagingEngine.WrapWithPaging(sql, 0, 100, 'sqlserver');

        // Count SQL should not have a semicolon in the CTE body
        expect(result.CountSQL).toContain('SELECT COUNT(*) AS TotalRowCount');
        expect(result.CountSQL).not.toContain(';');
    });
});
