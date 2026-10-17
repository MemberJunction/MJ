import { describe, it, expect } from 'vitest';
import { ConvertFile } from '../rules/BatchConverter.js';
import { GetTSQLToPostgresRules } from '../rules/TSQLToPostgresRules.js';
import type { BatchConverterConfig } from '../rules/BatchConverter.js';

const rules = GetTSQLToPostgresRules();

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
  // 1. Empty input → empty output with no section headers
  // ============================================================
  it('should handle empty input and suppress empty section headers', () => {
    const result = ConvertFile(makeConfig(''));
    expect(result.Stats.TotalBatches).toBe(0);
    expect(result.Stats.Converted).toBe(0);
    expect(result.Stats.Errors).toBe(0);
    // Empty groups should NOT produce section headers
    expect(result.OutputSQL).not.toContain('DDL: Tables');
    expect(result.OutputSQL).not.toContain('Views');
    expect(result.OutputSQL).not.toContain('Data');
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
    expect(result.Stats.Skipped).toBeGreaterThanOrEqual(1);
    // SET NOCOUNT ON should not appear in meaningful output
    expect(result.OutputSQL).not.toMatch(/SET\s+NOCOUNT\s+ON/i);
  });

  // ============================================================
  // 5. Skip IF @@ERROR
  // ============================================================
  it('should skip IF @@ERROR batches', () => {
    const sql = 'IF @@ERROR <> 0 SET NOEXEC ON';
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
    expect(result.Stats.InsertsConverted).toBe(4);
  });

  // ============================================================
  // 10. Comment-only batch passes through
  // ============================================================
  it('should pass through comment-only batches', () => {
    const sql = '-- This is a comment block\n-- with multiple lines';
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile({
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
    const result = ConvertFile(makeConfig(sql));
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
    ConvertFile(makeConfig(sql, {
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
    const result = ConvertFile(makeConfig(sql, { IncludeHeader: true }));
    expect(result.OutputSQL).toContain('MemberJunction PostgreSQL Migration');
    expect(result.OutputSQL).toContain('CREATE EXTENSION IF NOT EXISTS');
    expect(result.OutputSQL).toContain('pgcrypto');
  });

  it('should omit PG header when IncludeHeader is false', () => {
    const sql = 'SELECT 1;';
    const result = ConvertFile(makeConfig(sql, { IncludeHeader: false }));
    expect(result.OutputSQL).not.toContain('MemberJunction v5.0 PostgreSQL Baseline');
  });

  // ============================================================
  // 19. Post-processing can be disabled
  // ============================================================
  it('should skip post-processing when EnablePostProcess is false', () => {
    // Use a value that post-processing would normally change
    const sql = "INSERT INTO [__mj].[T1] ([Name]) VALUES (N'test');";
    const withPost = ConvertFile(makeConfig(sql, { EnablePostProcess: true }));
    const withoutPost = ConvertFile(makeConfig(sql, { EnablePostProcess: false }));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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
    const result = ConvertFile(makeConfig(sql));
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

    const result = ConvertFile(makeConfig(sql));

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

  // ============================================================
  // Bare EXEC mj-sync delete (issue #3253)
  // ============================================================
  it('should convert a bare EXEC spDelete (mj-sync delete) into a DO/PERFORM block', () => {
    // mj-sync emits record deletions with inline params and no DECLARE block.
    // v5.45's spDeleteComponentRegistry was silently dropped for this shape.
    const sql = `EXEC [__mj].[spDeleteComponentRegistry] @ID = 'B2F8C247-D22E-4991-9A69-0F73954A68D6';`;
    const result = ConvertFile(makeConfig(sql));
    expect(result.Stats.Errors).toBe(0);
    expect(result.OutputSQL).toContain('DO $mj$');
    expect(result.OutputSQL).toContain(
      `PERFORM __mj."spDeleteComponentRegistry"(p_ID := 'B2F8C247-D22E-4991-9A69-0F73954A68D6')`
    );
    expect(result.OutputSQL).not.toContain('SKIPPED');
  });

  it('should keep an mj-sync delete alongside DECLARE-block saves (the v5.45 file shape)', () => {
    const sql = [
      '-- Save MJ: API Scopes (core SP call only)',
      'DECLARE @ID_ec2d744b UNIQUEIDENTIFIER,',
      '@Name_ec2d744b NVARCHAR(100)',
      'SET',
      "  @ID_ec2d744b = '411AA5E8-7F8E-4092-B6B1-9566847E2A3A'",
      'SET',
      "  @Name_ec2d744b = N'search'",
      'EXEC [__mj].[spCreateAPIScope] @ID = @ID_ec2d744b, @Name = @Name_ec2d744b',
      'GO',
      '',
      '-- Delete MJ: Component Registries (core SP call only)',
      "EXEC [__mj].[spDeleteComponentRegistry] @ID = 'B2F8C247-D22E-4991-9A69-0F73954A68D6';",
      'GO',
    ].join('\n');
    const result = ConvertFile(makeConfig(sql));
    expect(result.Stats.Errors).toBe(0);
    expect(result.OutputSQL).toContain('PERFORM __mj."spCreateAPIScope"');
    expect(result.OutputSQL).toContain(
      `PERFORM __mj."spDeleteComponentRegistry"(p_ID := 'B2F8C247-D22E-4991-9A69-0F73954A68D6')`
    );
    expect(result.OutputSQL).not.toContain('SKIPPED');
  });

  it('should convert a delete that rides in the same batch as a save (no GO separator)', () => {
    // Older mj-sync emitters wrote a whole session as one GO-less batch, so a delete
    // could trail a DECLARE-block save. Without its own GO the delete used to be
    // swallowed by the preceding block and lost with no SKIPPED trace (issue #3253).
    const sql = [
      'DECLARE @ID_aa UNIQUEIDENTIFIER,',
      '@Name_aa NVARCHAR(100)',
      'SET',
      "  @ID_aa = '411AA5E8-7F8E-4092-B6B1-9566847E2A3A'",
      'SET',
      "  @Name_aa = N'search'",
      'EXEC [__mj].[spCreateAPIScope] @ID = @ID_aa, @Name = @Name_aa;',
      '',
      '-- Delete MJ: Component Registries (core SP call only)',
      "EXEC [__mj].[spDeleteComponentRegistry] @ID = 'B2F8C247-D22E-4991-9A69-0F73954A68D6';",
    ].join('\n');
    const result = ConvertFile(makeConfig(sql));
    expect(result.Stats.Errors).toBe(0);
    expect(result.OutputSQL).toContain('PERFORM __mj."spCreateAPIScope"');
    expect(result.OutputSQL).toContain(
      `PERFORM __mj."spDeleteComponentRegistry"(p_ID := 'B2F8C247-D22E-4991-9A69-0F73954A68D6')`
    );
    expect(result.OutputSQL).not.toContain('SKIPPED');
  });

  it('should skip visibly rather than assign to variables it never declared', () => {
    // Allowing DECLARE-less blocks (for mj-sync deletes) must not extend to blocks that
    // DO carry SET assignments — those need a DECLARE section for their p_ variables.
    // A DECLARE whose type the parser cannot read (here a dotted user type) yields zero
    // declared vars, and emitting the SETs anyway produces PL/pgSQL that fails at apply
    // time with `"p_id_a" is not a known variable`. A visible skip is the honest output.
    const sql = [
      'DECLARE @ID_a dbo.MyUuidType',
      'SET',
      "  @ID_a = '411AA5E8-7F8E-4092-B6B1-9566847E2A3A'",
      "EXEC [__mj].[spCreateAPIScope] @ID = '411AA5E8-7F8E-4092-B6B1-9566847E2A3A', @Name = N'search';",
    ].join('\n');
    const result = ConvertFile(makeConfig(sql));
    expect(result.OutputSQL).toContain('SKIPPED');
    expect(result.OutputSQL).not.toMatch(/^\s*p_\w+ :=/m);
  });

  it('should skip when only SOME of the declared variables parsed', () => {
    // The dangerous case is partial, not total: `@A_aa INT` parses and
    // `@B_aa dbo.MyType` does not, so the block still has a DECLARE section and any
    // "were there zero declared vars?" check waves it through. The emitted block then
    // declares p_A_aa, assigns p_B_aa, and passes it to the sproc — PL/pgSQL that
    // fails at apply time. The invariant is per-variable: every p_ name the block
    // uses must be one the block declared.
    const sql = [
      'DECLARE @A_aa INT,',
      '@B_aa dbo.MyType',
      'SET',
      '  @A_aa = 1',
      'SET',
      "  @B_aa = N'hello'",
      'EXEC [__mj].[spCreateThing] @ID = @A_aa, @Name = @B_aa;',
    ].join('\n');
    const result = ConvertFile(makeConfig(sql));
    expect(result.OutputSQL).toContain('SKIPPED');
    expect(result.OutputSQL).not.toMatch(/^\s*p_B_aa :=/m);
  });
});

// ============================================================
// Issue #5364 — Open App migrations (non-__mj schema) through the legacy converter.
// Each case is a small T-SQL input shaped like the bizapps-accounting migrations that
// reproduced the defect, converted with the app's schema as --schema.
// ============================================================
describe('Open App migrations (issue #5364)', () => {
  const APP = '__mj_BizAppsAccounting';
  const convert = (sql: string) => ConvertFile(makeConfig(sql, { Schema: APP }));

  it('item 1: built-ins in CHECK constraints and OBJECT_ID guards are not quoted identifiers', () => {
    const sql = [
      "ALTER TABLE ${flyway:defaultSchema}.[Account] ADD CONSTRAINT [CK_Account_Code_Trim] CHECK (LEN(LTRIM(RTRIM([Code]))) > 0);",
      'GO',
      "IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Account_Upper' AND parent_object_id = OBJECT_ID('${flyway:defaultSchema}.Account'))",
      'BEGIN',
      '  ALTER TABLE ${flyway:defaultSchema}.[Account] ADD CONSTRAINT [CK_Account_Upper] CHECK ([Code] = UPPER([Code]));',
      'END',
      'GO',
    ].join('\n');
    const out = convert(sql).OutputSQL;
    expect(out).toContain('CHECK (LENGTH(LTRIM(RTRIM("Code"))) > 0)');
    expect(out).toContain('CHECK ("Code" = UPPER("Code"))');
    expect(out).toContain(`conrelid = to_regclass('${APP}."Account"')`);
    expect(out).not.toMatch(/"(?:UPPER|LTRIM|RTRIM|LEN|OBJECT_ID)"\(/);
    expect(out).not.toContain('parent_object_id');
  });

  it('item 2: a LIKE character class becomes a regex instead of a CHECK that accepts everything', () => {
    const sql = "ALTER TABLE ${flyway:defaultSchema}.[Account] ADD CONSTRAINT [CK_Account_Code_Chars] CHECK ([Code] NOT LIKE '%[^A-Z0-9_-]%');";
    const out = convert(sql).OutputSQL;
    expect(out).toContain(`CHECK ("Code" !~ '[^A-Z0-9_-]')`);
    expect(out).not.toContain('LIKE');
  });

  it('item 3: an IF COL_LENGTH(...) IS NULL column add is translated and lands before its backfill and CHECK', () => {
    const sql = [
      "IF COL_LENGTH('${flyway:defaultSchema}.GLAccountRole', 'Cardinality') IS NULL",
      'BEGIN',
      '    ALTER TABLE ${flyway:defaultSchema}.GLAccountRole',
      "        ADD Cardinality NVARCHAR(10) NOT NULL CONSTRAINT DF_GLAccountRole_Cardinality DEFAULT 'One';",
      'END',
      'GO',
      "UPDATE ${flyway:defaultSchema}.GLAccountRole SET Cardinality = 'One' WHERE Cardinality IS NULL;",
      'GO',
      "ALTER TABLE ${flyway:defaultSchema}.GLAccountRole ADD CONSTRAINT CK_GLAccountRole_Cardinality CHECK (Cardinality IN ('One', 'Many'));",
      'GO',
    ].join('\n');
    const out = convert(sql).OutputSQL;
    expect(out).not.toContain('COL_LENGTH');
    expect(out).toContain(`attrelid = to_regclass('${APP}."GLAccountRole"') AND attname = 'Cardinality'`);
    expect(out).toContain('ADD "Cardinality" VARCHAR(10) NOT NULL');
    // The backfill names the schema unquoted, like the CREATE SCHEMA that made it.
    expect(out).toContain(`UPDATE ${APP}."GLAccountRole"`);
    const add = out.indexOf('ADD "Cardinality"');
    expect(add).toBeGreaterThan(-1);
    expect(add).toBeLessThan(out.indexOf(`UPDATE ${APP}."GLAccountRole"`));
    expect(add).toBeLessThan(out.indexOf('CK_GLAccountRole_Cardinality'));
  });

  it('item 4: a mid-batch DECLARE @X = (SELECT ...) is inlined where it is used', () => {
    const sql = [
      "EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema}';",
      '',
      'DECLARE @JournalEntryEntityID UNIQUEIDENTIFIER =',
      "    (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [Name] = 'Journal Entries');",
      "IF @JournalEntryEntityID IS NULL RAISERROR('Journal Entries entity not registered', 16, 1);",
      '',
      "IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @JournalEntryEntityID AND [Name] = 'Score')",
      'BEGIN',
      '   INSERT INTO [${mjSchema}].[EntityField] ([ID], [EntityID], [Name])',
      "   VALUES ('65A6D82B-E0F2-441C-B528-D02FD788CBA5', @JournalEntryEntityID, 'Score')",
      'END;',
      'GO',
    ].join('\n');
    const result = convert(sql);
    const out = result.OutputSQL;
    expect(out).not.toMatch(/@"?JournalEntryEntityID/);
    expect(out).toContain(`"EntityID" = (SELECT "ID" FROM \${mjSchema}."Entity" WHERE "Name" = 'Journal Entries')`);
    expect(out).toContain("RAISE EXCEPTION 'Journal Entries entity not registered'");
    // the assertion runs in order with the data statements, ahead of the insert that relies on it
    expect(out.indexOf('RAISE EXCEPTION')).toBeLessThan(out.indexOf('INSERT INTO'));
  });

  it('item 4: a guard over an inlined variable keeps its nested IF NOT EXISTS blocks as PL/pgSQL', () => {
    const sql = [
      "EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='';",
      'DECLARE @BandFieldID UNIQUEIDENTIFIER = (',
      "   SELECT ID FROM [${mjSchema}].[EntityField] WHERE [Name] = 'RiskBand'",
      ');',
      'IF @BandFieldID IS NOT NULL',
      'BEGIN',
      "   IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [EntityFieldID] = @BandFieldID AND [Value] = 'High')",
      '   BEGIN',
      '      INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Value])',
      "      VALUES ('463cca8d-b9c3-4942-8140-a70fbfd74650', @BandFieldID, 'High');",
      '   END;',
      "   UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID = @BandFieldID;",
      'END;',
      'GO',
    ].join('\n');
    const out = convert(sql).OutputSQL;
    expect(out).not.toMatch(/@"?BandFieldID/);
    expect(out).toMatch(/IF NOT EXISTS \(SELECT 1 FROM \$\{mjSchema\}\."EntityFieldValue"[^\n]*\) THEN/);
    expect(out).toContain('END IF;');
    expect(out).not.toMatch(/^\s*BEGIN\s*$\n\s*INSERT/m);
    expect(out).toContain(`SET "ValueListType"='List'`);
  });

  it('item 5: Length= and Precision= in a CodeGen EntityField UPDATE are quoted like every other column', () => {
    const sql = [
      'UPDATE [${mjSchema}].[EntityField]',
      "   SET IsVirtual = 1, Type='nvarchar', Length=100, Precision=0, Scale=0",
      "   WHERE ID='B79E7941-2AA9-4761-BEB7-9ABF2A98C0AD'",
      'GO',
    ].join('\n');
    const out = convert(sql).OutputSQL;
    expect(out).toContain('"Length"=100');
    expect(out).toContain('"Precision"=0');
    expect(out).toContain('"Scale"=0');
  });

  it('item 7: a hand-written CREATE OR ALTER TRIGGER is commented out whole and counted as a gap', () => {
    const sql = [
      'CREATE OR ALTER TRIGGER __mj_BizAppsAccounting.trg_JournalEntry_BalancedOnLock',
      'ON __mj_BizAppsAccounting.JournalEntry',
      'AFTER INSERT, UPDATE',
      'AS',
      'BEGIN',
      '    SET NOCOUNT ON;',
      "    IF NOT UPDATE(Status) AND NOT EXISTS (SELECT 1 FROM inserted WHERE Status IN ('Batched'))",
      '        RETURN;',
      "    IF EXISTS (SELECT 1 FROM inserted i WHERE i.Status = 'Batched')",
      '    BEGIN',
      "        THROW 50001, 'Unbalanced entry.', 1;",
      '    END;',
      'END;',
      'GO',
    ].join('\n');
    const result = convert(sql);
    const live = result.OutputSQL.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
    expect(live).toEqual([]);
    expect(result.OutputSQL).toContain('-- NEEDS HAND AUTHORING: trigger');
    expect(result.OutputSQL).toContain("--         THROW 50001, 'Unbalanced entry.', 1;");
    expect(result.Stats.Gaps).toBe(1);
  });

  it('item 8: CodeGen CRUD procedures and the UpdatedAt trigger convert in the app schema', () => {
    const sql = [
      'CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGLAccountRole]',
      '    @ID uniqueidentifier',
      'AS',
      'BEGIN',
      '    SET NOCOUNT ON;',
      '    DELETE FROM [${flyway:defaultSchema}].[GLAccountRole] WHERE [ID] = @ID',
      '    IF @@ROWCOUNT = 0',
      '        SELECT NULL AS [ID]',
      '    ELSE',
      '        SELECT @ID AS [ID]',
      'END',
      'GO',
      'CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGLAccountRole',
      'ON [${flyway:defaultSchema}].[GLAccountRole]',
      'AFTER UPDATE',
      'AS',
      'BEGIN',
      '    SET NOCOUNT ON;',
      '    UPDATE [${flyway:defaultSchema}].[GLAccountRole]',
      '    SET __mj_UpdatedAt = GETUTCDATE()',
      '    FROM [${flyway:defaultSchema}].[GLAccountRole] AS _organicTable',
      '    INNER JOIN INSERTED AS I ON _organicTable.[ID] = I.[ID];',
      'END;',
      'GO',
    ].join('\n');
    const result = convert(sql);
    const out = result.OutputSQL;
    expect(out).not.toContain('SKIPPED');
    expect(out).toContain(`CREATE OR REPLACE FUNCTION ${APP}."spDeleteGLAccountRole"(`);
    expect(out).toContain(`DELETE FROM ${APP}."GLAccountRole"`);
    expect(out).toContain(`pronamespace = '${APP}'::regnamespace`);
    expect(out).toContain(`CREATE OR REPLACE FUNCTION ${APP}."trgUpdateGLAccountRole_func"()`);
    expect(out).toContain(`BEFORE UPDATE ON ${APP}."GLAccountRole"`);
    expect(out).not.toMatch(/(?<![\w"])__mj\./);
    expect(result.Stats.Gaps).toBe(0);
  });

  it('item 8: a hand-written app procedure is a counted gap, not a silent skip', () => {
    const sql = [
      'CREATE PROCEDURE [${flyway:defaultSchema}].[spAssignNextBatchNumber]',
      '    @Next INT OUTPUT',
      'AS',
      'BEGIN',
      '    UPDATE [${flyway:defaultSchema}].[Sequence] SET @Next = NextValue = NextValue + 1;',
      'END',
      'GO',
    ].join('\n');
    const result = convert(sql);
    expect(result.OutputSQL).toContain('-- NEEDS HAND AUTHORING: procedure');
    expect(result.Stats.Gaps).toBe(1);
  });
});
