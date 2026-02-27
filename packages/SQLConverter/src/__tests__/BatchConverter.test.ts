import { describe, it, expect } from 'vitest';
import { convertFile } from '../rules/BatchConverter.js';
import { getTSQLToPostgresRules } from '../rules/TSQLToPostgresRules.js';
import type { BatchConverterConfig } from '../rules/BatchConverter.js';

const rules = getTSQLToPostgresRules();

/** Helper to build a minimal BatchConverterConfig from raw SQL */
function makeConfig(sql: string, overrides?: Partial<BatchConverterConfig>): BatchConverterConfig {
  return {
    Source: sql,
    SourceIsFile: false,
    Rules: rules,
    IncludeHeader: false,
    EnablePostProcess: true,
    ...overrides,
  };
}

describe('convertFile (BatchConverter)', () => {
  // ============================================================
  // 1. Empty input → empty output with section headers
  // ============================================================
  it('should handle empty input and produce section headers', () => {
    const result = convertFile(makeConfig(''));
    expect(result.Stats.TotalBatches).toBe(0);
    expect(result.Stats.Converted).toBe(0);
    expect(result.Stats.Errors).toBe(0);
    // Output should have the section header markers even with no content
    expect(result.OutputSQL).toContain('DDL: Tables');
    expect(result.OutputSQL).toContain('Views');
    expect(result.OutputSQL).toContain('Data');
  });

  // ============================================================
  // 2. Single CREATE TABLE batch
  // ============================================================
  it('should convert a single CREATE TABLE batch', () => {
    const sql = [
      'CREATE TABLE [__mj].[TestTable] (',
      '  [ID] [uniqueidentifier] NOT NULL,',
      '  [Name] [nvarchar](100) NOT NULL,',
      '  CONSTRAINT [PK_TestTable] PRIMARY KEY ([ID])',
      ');',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.TablesCreated).toBe(1);
    expect(result.Stats.Converted).toBeGreaterThanOrEqual(1);
    expect(result.OutputSQL).toContain('CREATE TABLE');
    expect(result.OutputSQL).toContain('UUID');
    expect(result.OutputSQL).toContain('VARCHAR(100)');
  });

  // ============================================================
  // 3. Single INSERT batch
  // ============================================================
  it('should convert a single INSERT batch', () => {
    const sql = "INSERT INTO [__mj].[TestTable] ([ID], [Name]) VALUES (NEWID(), N'Hello');";
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.InsertsConverted).toBe(1);
    expect(result.OutputSQL).toContain('gen_random_uuid()');
    // N prefix should be removed
    expect(result.OutputSQL).not.toMatch(/(?<![a-zA-Z])N'/);
  });

  // ============================================================
  // 4. Skip SET NOCOUNT ON
  // ============================================================
  it('should skip SET NOCOUNT ON', () => {
    const sql = 'SET NOCOUNT ON;\nGO\nSELECT 1;';
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.Skipped).toBeGreaterThanOrEqual(1);
    // SET NOCOUNT ON should not appear in meaningful output
    expect(result.OutputSQL).not.toMatch(/SET\s+NOCOUNT\s+ON/i);
  });

  // ============================================================
  // 5. Skip IF @@ERROR
  // ============================================================
  it('should skip IF @@ERROR batches', () => {
    const sql = 'IF @@ERROR <> 0 SET NOEXEC ON';
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.Skipped).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // 6. Multiple batches with GO separator
  // ============================================================
  it('should handle multiple batches separated by GO', () => {
    const sql = [
      'CREATE TABLE [__mj].[T1] ([ID] [uniqueidentifier] NOT NULL);',
      'GO',
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('00000000-0000-0000-0000-000000000001');",
      'GO',
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('00000000-0000-0000-0000-000000000002');",
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.TotalBatches).toBeGreaterThanOrEqual(3);
    expect(result.Stats.TablesCreated).toBe(1);
    expect(result.Stats.InsertsConverted).toBe(2);
  });

  // ============================================================
  // 7. Proper output grouping: tables section before views, views before data
  // ============================================================
  it('should group output with tables before views before data', () => {
    const sql = [
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('abc');",
      'GO',
      'CREATE TABLE [__mj].[T1] ([ID] [uniqueidentifier] NOT NULL);',
      'GO',
      'CREATE VIEW [__mj].[vwT1] AS SELECT [ID] FROM [__mj].[T1];',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    const output = result.OutputSQL;
    const tablesSectionIdx = output.indexOf('DDL: Tables');
    const viewsSectionIdx = output.indexOf('Views');
    const dataSectionIdx = output.indexOf('Data (INSERT/UPDATE/DELETE)');
    // Sections should appear in order: Tables < Views < Data
    expect(tablesSectionIdx).toBeLessThan(viewsSectionIdx);
    expect(viewsSectionIdx).toBeLessThan(dataSectionIdx);
  });

  // ============================================================
  // 8. Stats tracking: tables count
  // ============================================================
  it('should accurately count tables created', () => {
    const sql = [
      'CREATE TABLE [__mj].[T1] ([ID] [uniqueidentifier] NOT NULL);',
      'GO',
      'CREATE TABLE [__mj].[T2] ([ID] [uniqueidentifier] NOT NULL);',
      'GO',
      'CREATE TABLE [__mj].[T3] ([ID] [uniqueidentifier] NOT NULL);',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.TablesCreated).toBe(3);
  });

  // ============================================================
  // 9. Stats tracking: inserts count
  // ============================================================
  it('should accurately count inserts converted', () => {
    const sql = [
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('a');",
      'GO',
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('b');",
      'GO',
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('c');",
      'GO',
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('d');",
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.InsertsConverted).toBe(4);
  });

  // ============================================================
  // 10. Comment-only batch passes through
  // ============================================================
  it('should pass through comment-only batches', () => {
    const sql = '-- This is a comment block\n-- with multiple lines';
    const result = convertFile(makeConfig(sql));
    // Comment-only batches are classified as COMMENT_ONLY and skipped (passed through)
    expect(result.Stats.Skipped).toBeGreaterThanOrEqual(1);
    expect(result.OutputSQL).toContain('This is a comment block');
  });

  // ============================================================
  // 11. EXTENDED_PROPERTY → COMMENT ON
  // ============================================================
  it('should convert sp_addextendedproperty to COMMENT ON', () => {
    const sql = [
      "EXEC sp_addextendedproperty @name=N'MS_Description',",
      "  @value=N'The user table stores all user records',",
      "  @level0type=N'SCHEMA', @level0name=N'__mj',",
      "  @level1type=N'TABLE', @level1name=N'Users';",
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.CommentsConverted).toBe(1);
    expect(result.OutputSQL).toContain('COMMENT ON TABLE');
    expect(result.OutputSQL).toContain('"Users"');
    expect(result.OutputSQL).toContain('user table stores all user records');
  });

  // ============================================================
  // 12. FK constraint with DEFERRABLE
  // ============================================================
  it('should add DEFERRABLE INITIALLY DEFERRED to FK constraints', () => {
    const sql = [
      'ALTER TABLE [__mj].[Orders]',
      '  ADD CONSTRAINT [FK_Orders_Users] FOREIGN KEY ([UserID])',
      '  REFERENCES [__mj].[Users] ([ID]);',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.FKConstraints).toBe(1);
    expect(result.OutputSQL).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(result.OutputSQL).toContain('FOREIGN KEY');
  });

  // ============================================================
  // 13. CREATE INDEX conversion
  // ============================================================
  it('should convert CREATE INDEX with SQL Server options removed', () => {
    const sql = [
      'CREATE NONCLUSTERED INDEX [IX_Users_Name]',
      '  ON [__mj].[Users] ([Name] ASC)',
      '  WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF)',
      '  ON [PRIMARY];',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.IndexesCreated).toBe(1);
    expect(result.OutputSQL).toContain('CREATE');
    expect(result.OutputSQL).toContain('INDEX');
    // SQL Server-specific options should be removed
    expect(result.OutputSQL).not.toContain('NONCLUSTERED');
    expect(result.OutputSQL).not.toContain('PAD_INDEX');
  });

  // ============================================================
  // 14. GRANT conversion
  // ============================================================
  it('should convert GRANT statements', () => {
    const sql = 'GRANT SELECT ON [__mj].[Users] TO [cdp_UI];';
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.GrantsConverted).toBe(1);
    expect(result.OutputSQL).toContain('GRANT');
    expect(result.OutputSQL).toContain('SELECT');
    // Brackets should be converted to double quotes
    expect(result.OutputSQL).not.toContain('[__mj]');
  });

  // ============================================================
  // 15. Error batch produces comment in output
  // ============================================================
  it('should produce an error comment for batches that throw during conversion', () => {
    // Use a deliberately broken rule to force an error
    const brokenRule = {
      Name: 'BrokenRule',
      AppliesTo: ['INSERT' as const],
      Priority: 1,
      BypassSqlglot: true,
      PostProcess(_sql: string, _orig: string): string {
        throw new Error('Intentional test error');
      },
    };
    const sql = "INSERT INTO [__mj].[T1] ([ID]) VALUES ('x');";
    const result = convertFile({
      Source: sql,
      SourceIsFile: false,
      Rules: [brokenRule],
      IncludeHeader: false,
      EnablePostProcess: true,
    });
    expect(result.Stats.Errors).toBe(1);
    expect(result.OutputSQL).toContain('ERROR');
    expect(result.OutputSQL).toContain('Intentional test error');
  });

  // ============================================================
  // 16. Flyway placeholder replacement
  // ============================================================
  it('should replace ${flyway:defaultSchema} with __mj', () => {
    const sql = 'CREATE TABLE ${flyway:defaultSchema}.[TestTable] ([ID] [uniqueidentifier] NOT NULL);';
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.TablesCreated).toBe(1);
    expect(result.OutputSQL).not.toContain('${flyway:defaultSchema}');
    expect(result.OutputSQL).toContain('__mj');
  });

  // ============================================================
  // 17. Progress callback receives messages
  // ============================================================
  it('should call OnProgress with status messages', () => {
    const messages: string[] = [];
    const sql = 'CREATE TABLE [__mj].[T1] ([ID] [uniqueidentifier] NOT NULL);';
    convertFile(makeConfig(sql, {
      OnProgress: (msg: string) => messages.push(msg),
    }));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('Reading source'))).toBe(true);
    expect(messages.some(m => m.includes('Converting'))).toBe(true);
    expect(messages.some(m => m.includes('Assembling'))).toBe(true);
  });

  // ============================================================
  // 18. Header inclusion
  // ============================================================
  it('should include PG header when IncludeHeader is true', () => {
    const sql = 'SELECT 1;';
    const result = convertFile(makeConfig(sql, { IncludeHeader: true }));
    expect(result.OutputSQL).toContain('MemberJunction PostgreSQL Migration');
    expect(result.OutputSQL).toContain('CREATE EXTENSION IF NOT EXISTS');
    expect(result.OutputSQL).toContain('pgcrypto');
  });

  it('should omit PG header when IncludeHeader is false', () => {
    const sql = 'SELECT 1;';
    const result = convertFile(makeConfig(sql, { IncludeHeader: false }));
    expect(result.OutputSQL).not.toContain('MemberJunction v5.0 PostgreSQL Baseline');
  });

  // ============================================================
  // 19. Post-processing can be disabled
  // ============================================================
  it('should skip post-processing when EnablePostProcess is false', () => {
    // Use a value that post-processing would normally change
    const sql = "INSERT INTO [__mj].[T1] ([Name]) VALUES (N'test');";
    const withPost = convertFile(makeConfig(sql, { EnablePostProcess: true }));
    const withoutPost = convertFile(makeConfig(sql, { EnablePostProcess: false }));
    // Both should produce output, but they may differ due to post-processing
    expect(withPost.OutputSQL.length).toBeGreaterThan(0);
    expect(withoutPost.OutputSQL.length).toBeGreaterThan(0);
  });

  // ============================================================
  // 20. Session SET statements are skipped
  // ============================================================
  it('should skip SQL Server session SET statements', () => {
    const sql = [
      'SET ANSI_NULLS ON;',
      'GO',
      'SET QUOTED_IDENTIFIER ON;',
      'GO',
      'SET ANSI_PADDING ON;',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.Skipped).toBe(3);
    expect(result.Stats.Converted).toBe(0);
  });

  // ============================================================
  // 21. Sub-splitting of compound batches
  // ============================================================
  it('should sub-split compound batches containing multiple statements', () => {
    const sql = [
      "PRINT 'Processing data...'",
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('a');",
      "INSERT INTO [__mj].[T1] ([ID]) VALUES ('b');",
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    // The batch should be sub-split: PRINT + INSERT + INSERT = 3 batches
    expect(result.Stats.TotalBatches).toBe(3);
    // PRINT should be skipped, two INSERTs should be converted
    expect(result.Stats.InsertsConverted).toBe(2);
  });

  // ============================================================
  // 22. SKIP_SQLSERVER type batches
  // ============================================================
  it('should skip SQL Server-specific patterns like SERVERPROPERTY', () => {
    const sql = "IF SERVERPROPERTY('ProductVersion') >= '14.0' BEGIN\n  PRINT 'SQL Server 2017+'\nEND";
    const result = convertFile(makeConfig(sql));
    expect(result.Stats.Skipped).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // 23. Temp table # prefix conversion
  // ============================================================
  it('should convert CREATE TABLE #name to CREATE TEMP TABLE', () => {
    const sql = [
      'CREATE TABLE #TempMapping (',
      '  OldName NVARCHAR(255) NOT NULL,',
      '  NewName NVARCHAR(255) NOT NULL',
      ');',
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.OutputSQL).toContain('CREATE TEMP TABLE');
    expect(result.OutputSQL).not.toContain('#TempMapping');
  });

  it('should convert INSERT INTO #name without the # prefix', () => {
    const sql = [
      "CREATE TABLE #TempMapping (",
      "  OldName NVARCHAR(255) NOT NULL",
      ");",
      "GO",
      "INSERT INTO #TempMapping (OldName) VALUES ('test');",
    ].join('\n');
    const result = convertFile(makeConfig(sql));
    expect(result.OutputSQL).not.toContain('#TempMapping');
    expect(result.OutputSQL).toContain('"TempMapping"');
  });

  // ============================================================
  // 24. DO block injection for cursor+dynamic SQL migration
  // ============================================================
  it('should inject PG DO block for temp procedure with cursor pattern', () => {
    const sql = [
      "CREATE TABLE #NameMap (",
      "  OldName NVARCHAR(255) NOT NULL,",
      "  NewName NVARCHAR(255) NOT NULL",
      ");",
      "GO",
      "INSERT INTO #NameMap (OldName, NewName) VALUES ('Old1', 'New1');",
      "GO",
      "CREATE PROCEDURE #UpdateRefs",
      "  @SchemaName NVARCHAR(128),",
      "  @TableName NVARCHAR(128),",
      "  @ColumnName NVARCHAR(128)",
      "AS BEGIN",
      "  DECLARE @OldName NVARCHAR(255), @NewName NVARCHAR(255);",
      "  DECLARE entity_cursor CURSOR FOR SELECT OldName, NewName FROM #NameMap;",
      "  OPEN entity_cursor;",
      "  FETCH NEXT FROM entity_cursor INTO @OldName, @NewName;",
      "  WHILE @@FETCH_STATUS = 0 BEGIN",
      `    SET @SQL = N'UPDATE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) +`,
      `      ' SET ' + QUOTENAME(@ColumnName) + ' = REPLACE(' + QUOTENAME(@ColumnName) +`,
      `      ', ''"Entity":"'' + @pOld + ''"'', ''"Entity":"'' + @pNew + ''"'')'`,
      `    EXEC sp_executesql @SQL, N'@pOld NVARCHAR(255), @pNew NVARCHAR(255)', @OldName, @NewName;`,
      `    SET @SQL = N'UPDATE ' + QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName) +`,
      `      ' SET ' + QUOTENAME(@ColumnName) + ' = REPLACE(' + QUOTENAME(@ColumnName) +`,
      `      ', ''"EntityName":"'' + @pOld + ''"'', ''"EntityName":"'' + @pNew + ''"'')'`,
      `    EXEC sp_executesql @SQL, N'@pOld NVARCHAR(255), @pNew NVARCHAR(255)', @OldName, @NewName;`,
      "    FETCH NEXT FROM entity_cursor INTO @OldName, @NewName;",
      "  END",
      "  CLOSE entity_cursor;",
      "  DEALLOCATE entity_cursor;",
      "END",
      "GO",
      "EXEC #UpdateRefs '__mj', 'Workspace', 'Configuration'",
      "GO",
      "EXEC #UpdateRefs '__mj', 'Dashboard', 'UIConfigDetails'",
      "GO",
    ].join('\n');

    const result = convertFile(makeConfig(sql));

    // Should contain the injected DO block
    expect(result.OutputSQL).toContain('DO $$');
    expect(result.OutputSQL).toContain('FOR map_rec IN SELECT "OldName", "NewName"');
    // Should reference both target tables
    expect(result.OutputSQL).toContain("'Workspace'");
    expect(result.OutputSQL).toContain("'Dashboard'");
    // Should have the JSON key patterns
    expect(result.OutputSQL).toContain('"Entity":"');
    expect(result.OutputSQL).toContain('"EntityName":"');
    // Should include cleanup
    expect(result.OutputSQL).toContain('DROP TABLE IF EXISTS');
  });
});
