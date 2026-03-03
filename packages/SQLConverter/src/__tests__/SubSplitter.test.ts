import { describe, it, expect } from 'vitest';
import { subSplitCompoundBatch } from '../rules/SubSplitter.js';

describe('subSplitCompoundBatch', () => {
  // ============================================================
  // 1. Single CREATE TABLE → not split
  // ============================================================
  it('should not split a single CREATE TABLE statement', () => {
    const batch = 'CREATE TABLE __mj.Users (\n  ID UUID NOT NULL,\n  Name VARCHAR(100)\n);';
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 2. Single INSERT → not split
  // ============================================================
  it('should not split a single INSERT statement', () => {
    const batch = "INSERT INTO __mj.Users (ID, Name) VALUES ('abc', 'Test');";
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 3. PRINT + INSERT + INSERT → 3 statements
  // ============================================================
  it('should split PRINT + INSERT + INSERT into 3 statements', () => {
    const batch = [
      "PRINT 'Adding data...'",
      "INSERT INTO __mj.Users (ID, Name) VALUES ('a1', 'Alice');",
      "INSERT INTO __mj.Users (ID, Name) VALUES ('b2', 'Bob');",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatch(/^PRINT/);
    expect(result[1]).toMatch(/^INSERT/);
    expect(result[2]).toMatch(/^INSERT/);
  });

  // ============================================================
  // 4. ALTER TABLE + INSERT → 2 statements
  // ============================================================
  it('should not split a batch starting with ALTER TABLE (returned as single)', () => {
    // ALTER TABLE at the start triggers the early return — it's treated as a single block
    const batch = [
      'ALTER TABLE __mj.Users ADD COLUMN Age INTEGER;',
      "INSERT INTO __mj.Users (ID, Name) VALUES ('c3', 'Carol');",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    // ALTER TABLE is in the early-return list, so it stays as one block
    expect(result).toHaveLength(1);
  });

  // ============================================================
  // 5. CREATE PROCEDURE → not split (multi-line block)
  // ============================================================
  it('should not split a CREATE PROCEDURE block', () => {
    const batch = [
      'CREATE PROCEDURE __mj.spGetUser',
      '  @UserID UNIQUEIDENTIFIER',
      'AS',
      'BEGIN',
      '  SELECT * FROM __mj.Users WHERE ID = @UserID;',
      '  INSERT INTO __mj.AuditLog (Action) VALUES (\'Get User\');',
      'END;',
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 6. Keyword inside string literal → not treated as boundary
  // ============================================================
  it('should not split on keywords inside single-quoted string literals', () => {
    const batch = [
      "INSERT INTO __mj.Templates (ID, Body) VALUES ('t1', 'This template contains",
      "INSERT INTO instructions for users and",
      "DELETE FROM old data references",
      "that should not cause splitting');",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    // The INSERT/DELETE inside the string should NOT cause splitting
    expect(result).toHaveLength(1);
  });

  // ============================================================
  // 7. DECLARE block → not split
  // ============================================================
  it('should not split a DECLARE block', () => {
    const batch = [
      'DECLARE @Counter INT = 0;',
      'SET @Counter = @Counter + 1;',
      "INSERT INTO __mj.Log (Val) VALUES (@Counter);",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 8. BEGIN TRY block → not split
  // ============================================================
  it('should not split a BEGIN TRY block', () => {
    const batch = [
      'BEGIN TRY',
      "  INSERT INTO __mj.Users (ID, Name) VALUES ('d4', 'Dave');",
      "  INSERT INTO __mj.Users (ID, Name) VALUES ('e5', 'Eve');",
      'END TRY',
      'BEGIN CATCH',
      "  PRINT 'Error occurred';",
      'END CATCH',
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 9. Empty batch → unchanged
  // ============================================================
  it('should return an empty batch unchanged', () => {
    const batch = '';
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('');
  });

  // ============================================================
  // 10. CREATE VIEW → not split
  // ============================================================
  it('should not split a CREATE VIEW statement', () => {
    const batch = [
      'CREATE VIEW __mj.vwActiveUsers AS',
      'SELECT ID, Name FROM __mj.Users',
      'WHERE Active = 1;',
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 11. CREATE FUNCTION → not split
  // ============================================================
  it('should not split a CREATE FUNCTION block', () => {
    const batch = [
      'CREATE FUNCTION __mj.fnGetCount()',
      'RETURNS INT',
      'AS',
      'BEGIN',
      '  RETURN (SELECT COUNT(*) FROM __mj.Users);',
      'END;',
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 12. CREATE TRIGGER → not split
  // ============================================================
  it('should not split a CREATE TRIGGER block', () => {
    const batch = [
      'CREATE TRIGGER __mj.trg_Users_Update',
      'ON __mj.Users',
      'AFTER UPDATE',
      'AS',
      'BEGIN',
      "  INSERT INTO __mj.AuditLog (Action) VALUES ('Update');",
      'END;',
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(batch);
  });

  // ============================================================
  // 13. Multiple GRANT statements → split
  // ============================================================
  it('should split multiple GRANT statements', () => {
    const batch = [
      'GRANT SELECT ON __mj.Users TO cdp_UI;',
      'GRANT INSERT ON __mj.Users TO cdp_UI;',
      'GRANT UPDATE ON __mj.Users TO cdp_UI;',
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatch(/^GRANT SELECT/);
    expect(result[1]).toMatch(/^GRANT INSERT/);
    expect(result[2]).toMatch(/^GRANT UPDATE/);
  });

  // ============================================================
  // 14. IF NOT EXISTS (...) CREATE INDEX (no BEGIN/END) → not split
  // ============================================================
  it('should not split IF NOT EXISTS condition from its CREATE INDEX body', () => {
    const batch = [
      "IF NOT EXISTS (",
      "    SELECT 1",
      "    FROM sys.indexes",
      "    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID'",
      "    AND object_id = OBJECT_ID('[__mj].[Entity]')",
      ")",
      "CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [__mj].[Entity] ([ParentID]);",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('IF NOT EXISTS');
    expect(result[0]).toContain('CREATE INDEX');
  });

  // ============================================================
  // 15. IF OBJECT_ID (...) DROP TABLE → not split
  // ============================================================
  it('should not split IF OBJECT_ID condition from its DROP body', () => {
    const batch = [
      "IF OBJECT_ID('tempdb..#EntityNameMapping') IS NOT NULL",
      "    DROP TABLE #EntityNameMapping;",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('IF OBJECT_ID');
    expect(result[0]).toContain('DROP TABLE');
  });

  // ============================================================
  // 16. IF NOT EXISTS with BEGIN/END still handled correctly
  // ============================================================
  it('should not split IF NOT EXISTS with BEGIN/END body (existing behavior)', () => {
    const batch = [
      "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo')",
      "BEGIN",
      "    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);",
      "END",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(1);
  });

  // ============================================================
  // 17. Multiple IF NOT EXISTS blocks → correctly split
  // ============================================================
  it('should split multiple IF NOT EXISTS blocks into separate statements', () => {
    const batch = [
      "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_A')",
      "CREATE INDEX IX_A ON __mj.Foo (Col1);",
      "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_B')",
      "CREATE INDEX IX_B ON __mj.Foo (Col2);",
    ].join('\n');
    const result = subSplitCompoundBatch(batch);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('IX_A');
    expect(result[1]).toContain('IX_B');
  });
});
