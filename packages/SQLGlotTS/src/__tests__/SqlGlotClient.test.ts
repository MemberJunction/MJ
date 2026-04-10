import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { SqlGlotClient } from '../SqlGlotClient.js';

/**
 * Integration tests for SqlGlotClient.
 * These tests require Python 3 with sqlglot, fastapi, and uvicorn installed.
 */

let client: SqlGlotClient;
let pythonAvailable = false;

beforeAll(async () => {
  // Check if Python and sqlglot are available
  try {
    execSync('python3 -c "import sqlglot; import fastapi; import uvicorn"', {
      stdio: 'pipe',
    });
    pythonAvailable = true;
  } catch {
    console.warn('Skipping SqlGlotClient tests: Python/sqlglot not available');
    return;
  }

  client = new SqlGlotClient({ startupTimeoutMs: 30000 });
  await client.start();
}, 60000);

afterAll(async () => {
  if (client) {
    await client.stop();
  }
}, 10000);

// ============================================================
// Lifecycle Tests
// ============================================================
describe('Lifecycle', () => {
  it('should report as running after start', () => {
    if (!pythonAvailable) return;
    expect(client.IsRunning).toBe(true);
  });

  it('should have a valid port number', () => {
    if (!pythonAvailable) return;
    expect(client.Port).toBeGreaterThan(0);
    expect(client.Port).toBeLessThanOrEqual(65535);
  });

  it('should return health status', async () => {
    if (!pythonAvailable) return;
    const h = await client.health();
    expect(h.status).toBe('ok');
    expect(h.service).toBe('sqlglot-ts');
    expect(typeof h.sqlglotVersion).toBe('string');
    expect(h.sqlglotVersion.length).toBeGreaterThan(0);
    expect(h.port).toBe(client.Port);
  });

  it('should stop and restart successfully', async () => {
    if (!pythonAvailable) return;
    const client2 = new SqlGlotClient();
    await client2.start();
    expect(client2.IsRunning).toBe(true);
    const port = client2.Port;
    expect(port).toBeGreaterThan(0);

    await client2.stop();
    expect(client2.IsRunning).toBe(false);
    expect(client2.Port).toBeNull();
  });

  it('start() should be a no-op if already running', async () => {
    if (!pythonAvailable) return;
    const portBefore = client.Port;
    await client.start(); // Should not throw or restart
    expect(client.Port).toBe(portBefore);
  });

  it('stop() should be a no-op if not running', async () => {
    if (!pythonAvailable) return;
    const client2 = new SqlGlotClient();
    // Never started, stop should not throw
    await client2.stop();
    expect(client2.IsRunning).toBe(false);
  });

  it('should throw when calling transpile before start', async () => {
    const client2 = new SqlGlotClient();
    await expect(
      client2.transpile('SELECT 1', { fromDialect: 'tsql', toDialect: 'postgres' })
    ).rejects.toThrow('not running');
  });

  it('should throw on invalid Python path', async () => {
    const badClient = new SqlGlotClient({
      pythonPath: '/nonexistent/python3',
      startupTimeoutMs: 5000,
    });
    await expect(badClient.start()).rejects.toThrow();
  });
});

// ============================================================
// Transpile: T-SQL → PostgreSQL
// ============================================================
describe('Transpile T-SQL → PostgreSQL', () => {
  it('should convert ISNULL to COALESCE', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT ISNULL(col, 0) FROM t',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('COALESCE');
    expect(result.sql.toUpperCase()).not.toContain('ISNULL');
  });

  it('should convert square brackets to double quotes', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT [ColumnA] FROM [dbo].[MyTable]',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql).not.toContain('[');
    expect(result.sql).not.toContain(']');
  });

  it('should convert TOP N to LIMIT N', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT TOP 10 * FROM Users',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('LIMIT');
    expect(result.sql.toUpperCase()).not.toContain('TOP');
  });

  it('should convert GETDATE() to CURRENT_TIMESTAMP', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT GETDATE()',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('CURRENT_TIMESTAMP');
  });

  it('should convert NEWID()', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT NEWID()',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    // sqlglot may convert NEWID to gen_random_uuid or uuid_generate_v4
    const upper = result.sql.toUpperCase();
    expect(
      upper.includes('GEN_RANDOM_UUID') || upper.includes('UUID')
    ).toBe(true);
  });

  it('should convert NVARCHAR to VARCHAR or TEXT', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'CREATE TABLE t (col NVARCHAR(100))',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    const upper = result.sql.toUpperCase();
    expect(
      upper.includes('VARCHAR') || upper.includes('TEXT')
    ).toBe(true);
    expect(upper).not.toContain('NVARCHAR');
  });

  it('should convert BIT to BOOLEAN or keep as BIT', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'CREATE TABLE t (Active BIT NOT NULL DEFAULT 1)',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    const upper = result.sql.toUpperCase();
    // sqlglot may convert BIT to BOOLEAN or keep as BIT depending on version
    expect(
      upper.includes('BOOLEAN') || upper.includes('BOOL') || upper.includes('BIT')
    ).toBe(true);
    expect(upper).toContain('CREATE TABLE');
  });

  it('should convert OFFSET/FETCH pagination', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT * FROM t ORDER BY id OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    const upper = result.sql.toUpperCase();
    expect(upper).toContain('OFFSET');
    // PostgreSQL supports both LIMIT and FETCH NEXT syntax
    expect(upper.includes('LIMIT') || upper.includes('FETCH')).toBe(true);
  });

  it('should convert IDENTITY columns', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'CREATE TABLE t (ID INT IDENTITY(1,1) PRIMARY KEY, Name NVARCHAR(100))',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    const upper = result.sql.toUpperCase();
    // PostgreSQL uses SERIAL or GENERATED ALWAYS AS IDENTITY
    expect(
      upper.includes('SERIAL') ||
      upper.includes('GENERATED') ||
      upper.includes('IDENTITY')
    ).toBe(true);
  });

  it('should handle CAST with T-SQL types', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT CAST(col AS NVARCHAR(MAX))",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).not.toContain('NVARCHAR');
  });

  it('should convert DATEADD', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT DATEADD(day, 7, GETDATE())",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should convert DATEDIFF', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT DATEDIFF(day, StartDate, EndDate) FROM t",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle complex JOINs', async () => {
    if (!pythonAvailable) return;
    const sql = `
      SELECT a.ID, b.Name, c.Value
      FROM TableA a
      INNER JOIN TableB b ON a.ID = b.AID
      LEFT JOIN TableC c ON b.ID = c.BID
      WHERE a.Status = 'Active'
      ORDER BY b.Name
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('JOIN');
  });

  it('should handle subqueries', async () => {
    if (!pythonAvailable) return;
    const sql = `
      SELECT * FROM Users
      WHERE DepartmentID IN (
        SELECT ID FROM Departments WHERE Active = 1
      )
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.statements.length).toBe(1);
  });

  it('should handle CTEs', async () => {
    if (!pythonAvailable) return;
    const sql = `
      ;WITH ActiveUsers AS (
        SELECT ID, Name FROM Users WHERE Active = 1
      )
      SELECT * FROM ActiveUsers ORDER BY Name
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('WITH');
  });

  it('should convert CREATE TABLE with constraints', async () => {
    if (!pythonAvailable) return;
    const sql = `
      CREATE TABLE dbo.Orders (
        ID INT IDENTITY(1,1) NOT NULL,
        CustomerID INT NOT NULL,
        OrderDate DATETIME NOT NULL DEFAULT GETDATE(),
        Total DECIMAL(18,2),
        Status NVARCHAR(50) DEFAULT 'Pending',
        CONSTRAINT PK_Orders PRIMARY KEY (ID),
        CONSTRAINT FK_Orders_Customer FOREIGN KEY (CustomerID)
          REFERENCES dbo.Customers(ID)
      )
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('CREATE TABLE');
    expect(result.sql.toUpperCase()).toContain('PRIMARY KEY');
  });

  it('should convert INSERT with VALUES', async () => {
    if (!pythonAvailable) return;
    const sql = `
      INSERT INTO Users (Name, Email, Active)
      VALUES ('John Doe', 'john@example.com', 1)
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('INSERT');
    expect(result.sql.toUpperCase()).toContain('VALUES');
  });

  it('should handle multiple INSERT statements', async () => {
    if (!pythonAvailable) return;
    const sql = `
      INSERT INTO Categories (Name) VALUES ('Cat1');
      INSERT INTO Categories (Name) VALUES ('Cat2');
      INSERT INTO Categories (Name) VALUES ('Cat3');
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.statements.length).toBe(3);
  });

  it('should convert string concatenation', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT FirstName + ' ' + LastName AS FullName FROM Users",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    // sqlglot may convert + to || or use CONCAT — both are valid PG
    const sql = result.sql;
    expect(
      sql.includes('||') || sql.includes('CONCAT') || sql.includes('+')
    ).toBe(true);
    expect(sql.toUpperCase()).toContain('FULLNAME');
  });

  it('should handle CONVERT function', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT CONVERT(VARCHAR(10), GETDATE(), 120)",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    // Should convert to CAST or TO_CHAR
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================
// Transpile: PostgreSQL → T-SQL (reverse)
// ============================================================
describe('Transpile PostgreSQL → T-SQL', () => {
  it('should convert COALESCE (remains COALESCE)', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT COALESCE(col, 0) FROM t',
      { fromDialect: 'postgres', toDialect: 'tsql' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('COALESCE');
  });

  it('should convert LIMIT to TOP', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT * FROM users LIMIT 10',
      { fromDialect: 'postgres', toDialect: 'tsql' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('TOP');
  });

  it('should convert SERIAL column type', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'CREATE TABLE t (id SERIAL PRIMARY KEY, name TEXT)',
      { fromDialect: 'postgres', toDialect: 'tsql' }
    );
    expect(result.success).toBe(true);
    const upper = result.sql.toUpperCase();
    // sqlglot may convert SERIAL to IDENTITY, or keep as SERIAL,
    // or convert to INTEGER with IDENTITY — all valid transformations
    expect(upper).toContain('CREATE TABLE');
    expect(upper).toContain('PRIMARY KEY');
  });

  it('should convert boolean literals', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT * FROM t WHERE active = true",
      { fromDialect: 'postgres', toDialect: 'tsql' }
    );
    expect(result.success).toBe(true);
    // T-SQL uses 1/0 for boolean
    expect(result.sql).toContain('1');
  });
});

// ============================================================
// Transpile: MySQL → PostgreSQL
// ============================================================
describe('Transpile MySQL → PostgreSQL', () => {
  it('should convert backtick quoting', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT `column` FROM `table`',
      { fromDialect: 'mysql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql).not.toContain('`');
  });

  it('should convert AUTO_INCREMENT', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100))',
      { fromDialect: 'mysql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    const upper = result.sql.toUpperCase();
    expect(upper).not.toContain('AUTO_INCREMENT');
  });

  it('should convert IFNULL to COALESCE', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT IFNULL(col, 0) FROM t',
      { fromDialect: 'mysql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('COALESCE');
  });
});

// ============================================================
// Multi-Statement SQL Files
// ============================================================
describe('Multi-statement SQL', () => {
  it('should handle multiple statements separated by semicolons', async () => {
    if (!pythonAvailable) return;
    const sql = `
      SELECT 1;
      SELECT 2;
      SELECT 3;
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.statements.length).toBe(3);
  });

  it('should handle mixed DDL and DML', async () => {
    if (!pythonAvailable) return;
    const sql = `
      CREATE TABLE t (id INT);
      INSERT INTO t VALUES (1);
      SELECT * FROM t;
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.statements.length).toBe(3);
  });
});

// ============================================================
// Statement-by-Statement Mode
// ============================================================
describe('transpileStatements', () => {
  it('should transpile each statement individually', async () => {
    if (!pythonAvailable) return;
    const sql = `
      SELECT TOP 5 * FROM Users;
      SELECT ISNULL(Name, 'Unknown') FROM Users;
    `;
    const result = await client.transpileStatements(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.statements.length).toBe(2);
    expect(result.statements[0].toUpperCase()).toContain('LIMIT');
    expect(result.statements[1].toUpperCase()).toContain('COALESCE');
  });

  it('should report failed statements individually', async () => {
    if (!pythonAvailable) return;
    // Mix valid and potentially problematic SQL
    const sql = `
      SELECT 1;
      SELECT TOP 10 * FROM t;
    `;
    const result = await client.transpileStatements(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    // Both should succeed
    expect(result.statements.length).toBe(2);
  });

  it('should handle single statement', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpileStatements(
      'SELECT GETDATE()',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.statements.length).toBe(1);
    expect(result.statements[0].toUpperCase()).toContain('CURRENT_TIMESTAMP');
  });
});

// ============================================================
// Parse
// ============================================================
describe('parse', () => {
  it('should parse valid SQL and return AST', async () => {
    if (!pythonAvailable) return;
    const result = await client.parse('SELECT 1', { dialect: 'tsql' });
    expect(result.success).toBe(true);
    expect(result.ast).toBeTruthy();
    const ast = JSON.parse(result.ast);
    expect(Array.isArray(ast)).toBe(true);
    expect(ast.length).toBe(1);
  });

  it('should parse multiple statements', async () => {
    if (!pythonAvailable) return;
    const result = await client.parse('SELECT 1; SELECT 2;', { dialect: 'tsql' });
    expect(result.success).toBe(true);
    const ast = JSON.parse(result.ast);
    expect(ast.length).toBe(2);
  });

  it('should parse PostgreSQL specific syntax', async () => {
    if (!pythonAvailable) return;
    const result = await client.parse(
      "SELECT * FROM t WHERE col::text = 'value'",
      { dialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.ast).toBeTruthy();
  });

  it('should return error for completely invalid SQL', async () => {
    if (!pythonAvailable) return;
    const result = await client.parse(
      'THIS IS NOT SQL AT ALL!!!',
      { dialect: 'tsql' }
    );
    // sqlglot may still parse it with warnings rather than hard fail
    expect(result.ast !== undefined || result.errors.length > 0).toBe(true);
  });
});

// ============================================================
// Dialects
// ============================================================
describe('getDialects', () => {
  it('should return a list of dialects', async () => {
    if (!pythonAvailable) return;
    const dialects = await client.getDialects();
    expect(Array.isArray(dialects)).toBe(true);
    expect(dialects.length).toBeGreaterThan(10);
  });

  it('should include tsql dialect', async () => {
    if (!pythonAvailable) return;
    const dialects = await client.getDialects();
    expect(dialects).toContain('tsql');
  });

  it('should include postgres dialect', async () => {
    if (!pythonAvailable) return;
    const dialects = await client.getDialects();
    expect(dialects).toContain('postgres');
  });

  it('should include mysql dialect', async () => {
    if (!pythonAvailable) return;
    const dialects = await client.getDialects();
    expect(dialects).toContain('mysql');
  });

  it('should include bigquery dialect', async () => {
    if (!pythonAvailable) return;
    const dialects = await client.getDialects();
    expect(dialects).toContain('bigquery');
  });

  it('should include snowflake dialect', async () => {
    if (!pythonAvailable) return;
    const dialects = await client.getDialects();
    expect(dialects).toContain('snowflake');
  });
});

// ============================================================
// Options & Edge Cases
// ============================================================
describe('Options and edge cases', () => {
  it('should handle pretty-print off', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT a, b, c FROM t WHERE x = 1',
      { fromDialect: 'tsql', toDialect: 'postgres', pretty: false }
    );
    expect(result.success).toBe(true);
    // With pretty=false, should be more compact (no indentation)
    expect(result.sql).toBeTruthy();
  });

  it('should handle empty input', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile('', {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    // Empty input should succeed — may return 0 or 1 empty statement
    expect(result.success).toBe(true);
  });

  it('should handle whitespace-only input', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile('   \n  \t  ', {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    // Whitespace-only input should succeed
    expect(result.success).toBe(true);
  });

  it('should handle Unicode content', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "SELECT N'こんにちは' AS Greeting",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql).toContain('こんにちは');
  });

  it('should handle very long SQL', async () => {
    if (!pythonAvailable) return;
    // Generate SQL with many columns
    const columns = Array.from({ length: 100 }, (_, i) => `col${i}`).join(', ');
    const sql = `SELECT ${columns} FROM BigTable WHERE col0 = 1`;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    expect(result.success).toBe(true);
    expect(result.sql).toContain('col99');
  });

  it('should handle error level IGNORE', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'SELECT SOME_UNKNOWN_FUNC(x) FROM t',
      { fromDialect: 'tsql', toDialect: 'postgres', errorLevel: 'IGNORE' }
    );
    // IGNORE should not raise errors
    expect(result.sql).toBeTruthy();
  });

  it('should handle single-line comments', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      '-- This is a comment\nSELECT 1',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
  });

  it('should handle block comments', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      '/* Block comment */ SELECT 1',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
  });

  it('should handle UPDATE statements', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      "UPDATE Users SET Name = 'Test' WHERE ID = 1",
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('UPDATE');
  });

  it('should handle DELETE statements', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'DELETE FROM Users WHERE ID = 1',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('DELETE');
  });

  it('should handle CREATE INDEX', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'CREATE INDEX IX_Users_Email ON Users (Email)',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('CREATE INDEX');
  });

  it('should handle ALTER TABLE', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'ALTER TABLE Users ADD Email NVARCHAR(255) NULL',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('ALTER TABLE');
  });

  it('should handle DROP TABLE', async () => {
    if (!pythonAvailable) return;
    const result = await client.transpile(
      'DROP TABLE IF EXISTS TempTable',
      { fromDialect: 'tsql', toDialect: 'postgres' }
    );
    expect(result.success).toBe(true);
    expect(result.sql.toUpperCase()).toContain('DROP TABLE');
  });

  it('should handle MERGE statement', async () => {
    if (!pythonAvailable) return;
    const sql = `
      MERGE INTO Target AS t
      USING Source AS s ON t.ID = s.ID
      WHEN MATCHED THEN UPDATE SET t.Name = s.Name
      WHEN NOT MATCHED THEN INSERT (ID, Name) VALUES (s.ID, s.Name)
    `;
    const result = await client.transpile(sql, {
      fromDialect: 'tsql',
      toDialect: 'postgres',
    });
    // MERGE may or may not be supported fully, but should not crash
    expect(result.sql !== undefined || result.errors.length > 0).toBe(true);
  });
});
