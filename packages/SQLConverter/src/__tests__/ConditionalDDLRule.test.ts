import { describe, it, expect } from 'vitest';
import { ConditionalDDLRule } from '../rules/ConditionalDDLRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new ConditionalDDLRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('ConditionalDDLRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('ConditionalDDLRule');
      expect(rule.Priority).toBe(55);
      expect(rule.AppliesTo).toEqual(['CONDITIONAL_DDL']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('DO $$ block conversion', () => {
    it('should convert IF NOT EXISTS with ALTER TABLE ADD COLUMN to a DO $$ block', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'Entity' AND COLUMN_NAME = 'AllowMultipleSubtypes')
BEGIN
    ALTER TABLE [__mj].[Entity] ADD [AllowMultipleSubtypes] BIT NOT NULL DEFAULT 0;
END`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain('BEGIN');
      expect(result).toContain('IF NOT EXISTS (');
      expect(result).toContain(') THEN');
      expect(result).toContain('END IF;');
      expect(result).toContain('END $$;');
    });

    it('should convert IF NOT EXISTS INSERT INTO to a DO $$ block', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.EntityRelationship WHERE ID = '12345')
BEGIN
    INSERT INTO __mj.EntityRelationship (ID, EntityID, RelatedEntityID) VALUES ('12345', 'AAA', 'BBB');
END`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain('IF NOT EXISTS (');
      expect(result).toContain(') THEN');
      expect(result).toContain('INSERT INTO');
      expect(result).toContain('END IF;');
      expect(result).toContain('END $$;');
    });

    it('should indent condition and body lines within the DO block', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.Foo WHERE ID = '123')
BEGIN
    INSERT INTO __mj.Foo (ID, Name) VALUES ('123', 'Test');
END`;
      const result = convert(sql);
      // The condition and body should be indented
      expect(result).toContain('    IF NOT EXISTS (');
      expect(result).toContain('    ) THEN');
      expect(result).toContain('    END IF;');
    });
  });

  describe('guarded constraint drop', () => {
    it('should convert IF EXISTS(check_constraints) DROP CONSTRAINT to DROP CONSTRAINT IF EXISTS', () => {
      // Without this the DROP is lost entirely and the paired ADD CONSTRAINT later in the
      // same migration fails with `constraint "CK_Task_Assignment" ... already exists`.
      const sql = `IF EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    INNER JOIN sys.schemas s ON s.schema_id = cc.schema_id
    INNER JOIN sys.tables t ON t.object_id = cc.parent_object_id
    WHERE cc.name = N'CK_Task_Assignment'
      AND s.name = N'__mj'
      AND t.name = N'Task'
)
BEGIN
    ALTER TABLE [__mj].[Task] DROP CONSTRAINT [CK_Task_Assignment];
END`;
      const result = convert(sql);
      expect(result).toContain('ALTER TABLE __mj."Task" DROP CONSTRAINT IF EXISTS "CK_Task_Assignment";');
      // the redundant T-SQL catalog guard must not survive
      expect(result).not.toMatch(/sys\./i);
      expect(result).not.toMatch(/\bIF\s+EXISTS\s*\(/i);
    });

    it('should leave a non-drop IF EXISTS body to the generic DO-block path', () => {
      const sql = `IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Task')
BEGIN
    UPDATE [__mj].[Task] SET [Status] = 'X';
END`;
      const result = convert(sql);
      expect(result).not.toContain('DROP CONSTRAINT IF EXISTS');
    });

    it('should NOT discard a guard that is a data condition rather than a catalog probe', () => {
      // The rewrite throws the guard away, which is only legitimate when the guard is asking
      // "does this constraint exist" — the question SQL Server has no native form for. A guard
      // on DATA is a real condition: discarding it drops the constraint unconditionally on
      // PostgreSQL while SQL Server still drops it only for a database that has legacy rows,
      // diverging the two schemas with no error on either side.
      const sql = `IF EXISTS (SELECT 1 FROM [__mj].[Payment] WHERE [Status] = 'Legacy')
BEGIN
    ALTER TABLE [__mj].[Payment] DROP CONSTRAINT [CK_Payment_Status];
END`;
      const result = convert(sql);
      expect(result).not.toContain('DROP CONSTRAINT IF EXISTS');
      // Falls through to the generic path, which comments out what it cannot express — visible
      // to whoever reads the migration, rather than silently wrong.
      expect(result).toContain('-- SKIPPED');
    });

    it('should still discard a sys.objects guard that restricts to a constraint type', () => {
      // The guard is commonly written as sys.objects WHERE type IN ('C','F','UQ') rather than
      // against the constraint-specific view, and that is the same question.
      const sql = `IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'CK_Payment_Status' AND type = 'C')
BEGIN
    ALTER TABLE [__mj].[Payment] DROP CONSTRAINT [CK_Payment_Status];
END`;
      const result = convert(sql);
      expect(result).toContain('DROP CONSTRAINT IF EXISTS "CK_Payment_Status"');
      expect(result).not.toContain('sys.objects');
    });

    it('should NOT discard a sys.objects guard that is a TABLE-existence test', () => {
      // sys.objects is the GENERIC object catalog, so naming it proves nothing. This guard means
      // "if the legacy table is still here, drop the FK that points at it" — a real condition.
      // Discarding it drops the constraint unconditionally on PostgreSQL while SQL Server keeps
      // it, and `DROP CONSTRAINT IF EXISTS` means neither side errors.
      const sql = `IF EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[__mj].[LegacyPayment]') AND type in (N'U'))
BEGIN
    ALTER TABLE [__mj].[Payment] DROP CONSTRAINT [FK_Payment_LegacyPayment];
END`;
      const result = convert(sql);
      expect(result).not.toContain('DROP CONSTRAINT IF EXISTS');
      expect(result).toContain('-- SKIPPED');
    });

    it('should discard a sys.objects guard that joins on parent_object_id', () => {
      // Only constraint rows carry parent_object_id meaningfully, so this shape is unambiguous.
      const sql = `IF EXISTS (SELECT 1 FROM sys.objects o WHERE o.name = 'CK_X' AND o.parent_object_id = OBJECT_ID(N'[__mj].[T]'))
BEGIN
    ALTER TABLE [__mj].[T] DROP CONSTRAINT [CK_X];
END`;
      const result = convert(sql);
      expect(result).toContain('DROP CONSTRAINT IF EXISTS "CK_X"');
    });
  });

  describe('conditional index conversion', () => {
    it('should convert IF NOT EXISTS sys.indexes CREATE INDEX to CREATE INDEX IF NOT EXISTS', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Email' AND object_id = OBJECT_ID('__mj.Users'))
CREATE INDEX [IX_Users_Email] ON __mj."Users" ("Email")`;
      const result = convert(sql);
      expect(result).toContain('CREATE INDEX IF NOT EXISTS');
      expect(result).toContain('"IX_Users_Email"');
      expect(result).not.toContain('IF NOT EXISTS (SELECT');
      expect(result).not.toContain('sys.indexes');
    });

    it('should handle UNIQUE index in conditional creation', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Foo_Name')
CREATE UNIQUE INDEX [UX_Foo_Name] ON __mj."Foo" ("Name")`;
      const result = convert(sql);
      expect(result).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
      expect(result).toContain('"UX_Foo_Name"');
    });

    it('should preserve WHERE clause on filtered index', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_SchemaInfo_Prefix' AND object_id = OBJECT_ID('__mj.SchemaInfo'))
BEGIN
    CREATE UNIQUE INDEX UQ_SchemaInfo_Prefix
    ON [__mj].SchemaInfo (
        EntityNamePrefix,
        EntityNameSuffix
    )
    WHERE EntityNamePrefix IS NOT NULL;
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
      expect(result).toContain('"UQ_SchemaInfo_Prefix"');
      expect(result).toContain('WHERE "EntityNamePrefix" IS NOT NULL');
      expect(result).toContain('"EntityNamePrefix"');
      expect(result).toContain('"EntityNameSuffix"');
      expect(result).not.toContain('WHERE E;');
      expect(result).not.toContain('sys.indexes');
    });

    it('should strip NONCLUSTERED keyword from conditional index', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bar_Col')
CREATE NONCLUSTERED INDEX [IX_Bar_Col] ON __mj."Bar" ("Col")`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).toContain('CREATE INDEX IF NOT EXISTS');
    });
  });

  describe('type conversions', () => {
    it('should convert NVARCHAR(MAX) to TEXT', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Data')
BEGIN
    ALTER TABLE __mj.Foo ADD Data NVARCHAR(MAX);
END`;
      const result = convert(sql);
      expect(result).toContain('TEXT');
      expect(result).not.toMatch(/NVARCHAR\s*\(\s*MAX\s*\)/i);
    });

    it('should convert NVARCHAR(100) to VARCHAR(100)', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Name')
BEGIN
    ALTER TABLE __mj.Foo ADD Name NVARCHAR(100);
END`;
      const result = convert(sql);
      expect(result).toContain('VARCHAR(100)');
      expect(result).not.toMatch(/NVARCHAR/i);
    });

    it('should convert BIT to BOOLEAN', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'IsActive')
BEGIN
    ALTER TABLE __mj.Foo ADD IsActive BIT NOT NULL DEFAULT 0;
END`;
      const result = convert(sql);
      expect(result).toContain('BOOLEAN');
      expect(result).not.toMatch(/(?<!")BIT\b/i);
    });

    it('should convert UNIQUEIDENTIFIER to UUID', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'RefID')
BEGIN
    ALTER TABLE __mj.Foo ADD RefID UNIQUEIDENTIFIER;
END`;
      const result = convert(sql);
      expect(result).toContain('UUID');
      expect(result).not.toMatch(/UNIQUEIDENTIFIER/i);
    });

    it('should convert DATETIMEOFFSET to TIMESTAMPTZ', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'UpdatedAt')
BEGIN
    ALTER TABLE __mj.Foo ADD UpdatedAt DATETIMEOFFSET(7);
END`;
      const result = convert(sql);
      expect(result).toContain('TIMESTAMPTZ');
      expect(result).not.toMatch(/DATETIMEOFFSET/i);
    });

    it('should convert TINYINT to SMALLINT', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Priority')
BEGIN
    ALTER TABLE __mj.Foo ADD Priority TINYINT;
END`;
      const result = convert(sql);
      expect(result).toContain('SMALLINT');
      expect(result).not.toMatch(/\bTINYINT\b/i);
    });

    it('should convert IMAGE to BYTEA', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Photo')
BEGIN
    ALTER TABLE __mj.Foo ADD Photo IMAGE;
END`;
      const result = convert(sql);
      expect(result).toContain('BYTEA');
      expect(result).not.toMatch(/\bIMAGE\b/i);
    });
  });

  describe('INFORMATION_SCHEMA casing', () => {
    it('should lowercase INFORMATION_SCHEMA to information_schema with bracket syntax', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM [INFORMATION_SCHEMA].[COLUMNS] WHERE [TABLE_NAME] = 'Foo' AND [COLUMN_NAME] = 'Bar')
BEGIN
    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);
END`;
      const result = convert(sql);
      expect(result).toContain('information_schema.columns');
      expect(result).not.toMatch(/INFORMATION_SCHEMA/);
    });

    it('should lowercase INFORMATION_SCHEMA column references with bracket syntax', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM [INFORMATION_SCHEMA].[COLUMNS] WHERE [TABLE_SCHEMA] = '__mj' AND [TABLE_NAME] = 'Users' AND [COLUMN_NAME] = 'Email')
BEGIN
    ALTER TABLE __mj.Users ADD Email VARCHAR(200);
END`;
      const result = convert(sql);
      expect(result).toContain('table_schema');
      expect(result).toContain('table_name');
      expect(result).toContain('column_name');
    });
  });

  describe('identifier conversion', () => {
    it('should convert bracket identifiers to quoted identifiers', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Entity' AND COLUMN_NAME = 'NewCol')
BEGIN
    ALTER TABLE [__mj].[Entity] ADD [NewCol] [nvarchar](100);
END`;
      const result = convert(sql);
      expect(result).toContain('__mj."Entity"');
      expect(result).not.toContain('[__mj]');
      expect(result).not.toContain('[Entity]');
    });
  });

  describe('N-prefix removal', () => {
    it('should remove N prefix from string literals', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.Foo WHERE Name = N'Test')
BEGIN
    INSERT INTO __mj.Foo (Name) VALUES (N'Test');
END`;
      const result = convert(sql);
      expect(result).not.toMatch(/(?<![a-zA-Z])N'/);
    });
  });

  describe('COLLATE removal', () => {
    it('should remove COLLATE clauses', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' COLLATE SQL_Latin1_General_CP1_CI_AS AND COLUMN_NAME = 'Bar')
BEGIN
    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);
END`;
      const result = convert(sql);
      expect(result).not.toMatch(/COLLATE/i);
    });
  });

  describe('PascalCase quoting', () => {
    it('should quote PascalCase identifiers in condition', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Entity' AND column_name = 'AllowMultipleSubtypes')
BEGIN
    ALTER TABLE __mj.Entity ADD AllowMultipleSubtypes BOOLEAN NOT NULL DEFAULT FALSE;
END`;
      const result = convert(sql);
      // PascalCase identifiers should be quoted
      expect(result).toContain('"AllowMultipleSubtypes"');
      expect(result).toContain('"Entity"');
    });

    it('should NOT quote SQL keywords', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Foo')
BEGIN
    ALTER TABLE __mj.Foo ADD MyColumn VARCHAR(50) NOT NULL DEFAULT '';
END`;
      const result = convert(sql);
      // SQL keywords should remain unquoted
      expect(result).not.toContain('"SELECT"');
      expect(result).not.toContain('"NOT"');
      expect(result).not.toContain('"NULL"');
      expect(result).not.toContain('"DEFAULT"');
      expect(result).not.toContain('"ALTER"');
      expect(result).not.toContain('"TABLE"');
    });

    it('should NOT corrupt UUID hex segments inside string literals', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM __mj.Foo WHERE ID = 'AF4C1234-5678-9ABC-DEF0-1234567890AB')
BEGIN
    INSERT INTO __mj.Foo (ID) VALUES ('AF4C1234-5678-9ABC-DEF0-1234567890AB');
END`;
      const result = convert(sql);
      // UUIDs inside strings should NOT be quoted
      expect(result).toContain("'AF4C1234-5678-9ABC-DEF0-1234567890AB'");
      expect(result).not.toContain('"AF4C1234"');
    });
  });

  describe('CREATE ROLE conversion', () => {
    it('should convert bare CREATE ROLE to DO block with pg_roles check', () => {
      const sql = 'CREATE ROLE MyRole';
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'MyRole'");
      // Role names are emitted quoted to preserve case (PG folds unquoted
      // identifiers to lowercase). Matches the baseline output `CREATE ROLE "cdp_BI"`.
      expect(result).toContain('CREATE ROLE "MyRole";');
    });

    it('should handle quoted role names from convertIdentifiers', () => {
      const sql = 'CREATE ROLE "InventoryReader"';
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'InventoryReader'");
      expect(result).toContain('CREATE ROLE "InventoryReader";');
    });

    it('should handle IF NOT EXISTS wrapper around CREATE ROLE', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'MyRole')
    CREATE ROLE "MyRole"`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'MyRole'");
      expect(result).toContain('CREATE ROLE "MyRole";');
    });

    it('should convert the DATABASE_PRINCIPAL_ID / EXEC(CREATE ROLE ... AUTHORIZATION) baseline idiom', () => {
      // The introspection baseline emits roles as:
      //   IF DATABASE_PRINCIPAL_ID(N'cdp_BI') IS NULL
      //       EXEC('CREATE ROLE [cdp_BI] AUTHORIZATION [db_securityadmin]');
      // The bracketed name must be captured and the AUTHORIZATION clause dropped.
      const sql = `IF DATABASE_PRINCIPAL_ID(N'cdp_BI') IS NULL
    EXEC('CREATE ROLE [cdp_BI] AUTHORIZATION [db_securityadmin]');`;
      const result = convert(sql);
      expect(result).toContain('DO $$');
      expect(result).toContain("rolname = 'cdp_BI'");
      expect(result).toContain('CREATE ROLE "cdp_BI";');
      expect(result).not.toContain('AUTHORIZATION');
    });
  });

  describe('fallback behavior', () => {
    it('should comment out unparseable conditional DDL', () => {
      // No BEGIN...END block — should fall back to commenting out
      const sql = `IF SOME_RANDOM_CONDITION = 1
SET @var = 'value'`;
      const result = convert(sql);
      expect(result).toContain('-- SKIPPED: conditional DDL (auto-conversion not supported)');
      expect(result).toContain('--');
    });
  });

  describe('output formatting', () => {
    it('should end with newline', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Foo' AND COLUMN_NAME = 'Bar')
BEGIN
    ALTER TABLE __mj.Foo ADD Bar VARCHAR(50);
END`;
      const result = convert(sql);
      expect(result).toMatch(/\n$/);
    });
  });

  describe('CREATE SCHEMA conditional pattern (sys.schemas + EXEC)', () => {
    it('should convert IF NOT EXISTS sys.schemas + EXEC CREATE SCHEMA to PG-native CREATE SCHEMA IF NOT EXISTS', () => {
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj_UDT')
BEGIN
    EXEC('CREATE SCHEMA [__mj_UDT]')
END`;
      const result = convert(sql);
      // `__mj_UDT` stays QUOTED — alone among mixed-case schemas — because it is the one schema
      // with a producer OUTSIDE the migration set. The Database Designer creates it, and every
      // table in it, through `UDT_SCHEMA_NAME`, quoted and case-preserved. Folding it here would
      // leave the runtime writing into a schema no migration made, and would orphan every UDT
      // entity from its table in `vwSQLTablesAndEntities`, which joins schema names
      // case-sensitively. A live database already holds `"__mj_UDT"`; this matches it.
      expect(result).toContain('CREATE SCHEMA IF NOT EXISTS "__mj_UDT";');
      expect(result).not.toContain('__mj_udt');
      // No reconciliation DDL is emitted for it either. A guard at this point lands in the
      // converted output of the migration that CREATES the schema — the one file every affected
      // database has already applied and Flyway will never re-run — so it could only ever fire on
      // a database that does not need it.
      expect(result).not.toContain('ALTER SCHEMA');
      expect(result).not.toContain('pg_namespace');
      // Should NOT fall through to the generic conditional-DDL path
      expect(result).not.toContain('sys.schemas');
      expect(result).not.toContain('EXEC(');
    });

    it('should emit a bare folded CREATE for the already-lowercase core schema', () => {
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj')
BEGIN
    EXEC('CREATE SCHEMA [__mj]')
END`;
      const result = convert(sql);
      expect(result.trim()).toBe('CREATE SCHEMA IF NOT EXISTS __mj;');
    });

    it('should fold a mixed-case schema name to lowercase to match its unquoted references', () => {
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'MyCustomSchema')
BEGIN
    EXEC('CREATE SCHEMA [MyCustomSchema]')
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE SCHEMA IF NOT EXISTS mycustomschema;');
    });

    it('should quote a schema name that would not survive folding', () => {
      // A name containing characters that cannot appear unquoted must keep its quotes —
      // there is no lowercase form for it to fold to.
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'my-custom schema')
BEGIN
    EXEC('CREATE SCHEMA [my-custom schema]')
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE SCHEMA IF NOT EXISTS "my-custom schema";');
    });

    it('should emit a placeholder-built schema unquoted, matching its unquoted references', () => {
      // `[${mjSchema}_BizAppsCommon]` is how an open app names a sibling app's schema.
      // convertIdentifiers leaves placeholder schema REFERENCES unquoted, so quoting here would
      // create a case-preserved schema that none of those references resolve to — the same
      // mismatch the mixed-case fix above closes, for the case the placeholder exists to serve.
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '\${mjSchema}_BizAppsCommon')
BEGIN
    EXEC('CREATE SCHEMA [\${mjSchema}_BizAppsCommon]')
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE SCHEMA IF NOT EXISTS ${mjSchema}_bizappscommon;');
      // The placeholder itself must survive verbatim — its contents name a migration variable
      // that is matched exactly at substitution time.
      expect(result).not.toContain('${mjschema}');
      expect(result).not.toContain('"${mjSchema}');
    });

    it('should still quote a placeholder name that cannot survive folding', () => {
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '\${mjSchema}-common app')
BEGIN
    EXEC('CREATE SCHEMA [\${mjSchema}-common app]')
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE SCHEMA IF NOT EXISTS "${mjSchema}-common app";');
    });

    it('should not create a phantom schema from CREATE SCHEMA mentioned in a comment', () => {
      // The rule used to scan the raw text, so prose in a comment was parsed as SQL: the
      // commented name won the match and the real statement was dropped entirely.
      const sql = `-- This block mirrors CREATE SCHEMA demo_ghost from the baseline script.
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'demo_app')
BEGIN
    EXEC('CREATE SCHEMA [demo_app]')
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE SCHEMA IF NOT EXISTS demo_app;');
      expect(result).not.toContain('demo_ghost;');
    });

    it('should not match if there is no CREATE SCHEMA in the body', () => {
      // sys.schemas reference but body doesn't create a schema → fall through to DO block
      const sql = `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'X')
BEGIN
    PRINT 'Schema X does not exist';
END`;
      const result = convert(sql);
      expect(result).not.toContain('CREATE SCHEMA IF NOT EXISTS');
    });
  });

  describe('Schema-level extended property conditional pattern', () => {
    it('should convert IF NOT EXISTS sys.extended_properties + EXEC sp_addextendedproperty (SCHEMA level) to COMMENT ON SCHEMA', () => {
      const sql = `IF NOT EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE class = 3
      AND major_id = SCHEMA_ID('__mj_UDT')
      AND name = N'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Schema for user-defined tables.',
        @level0type = N'SCHEMA',
        @level0name = N'__mj_UDT'
END`;
      const result = convert(sql);
      expect(result).toContain('COMMENT ON SCHEMA "__mj_UDT" IS');
      expect(result).toContain("'Schema for user-defined tables.'");
      // Should NOT fall through to the DO $$ block path
      expect(result).not.toContain('DO $$');
      expect(result).not.toContain('sp_addextendedproperty');
    });

    it('should escape single quotes in the description value', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 3 AND major_id = SCHEMA_ID('test') AND name = N'MS_Description')
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'It''s a test schema',
        @level0type = N'SCHEMA',
        @level0name = N'test'
END`;
      const result = convert(sql);
      expect(result).toContain("COMMENT ON SCHEMA \"test\" IS 'It''s a test schema'");
    });

    it('should NOT match TABLE-level extended properties (those use the dedicated ExtendedPropertyRule)', () => {
      const sql = `IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 1)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Table description',
        @level0type = N'SCHEMA',
        @level0name = N'__mj',
        @level1type = N'TABLE',
        @level1name = N'MyTable'
END`;
      const result = convert(sql);
      // Has @level1type = TABLE, so this rule should reject and fall through
      expect(result).not.toContain('COMMENT ON SCHEMA');
    });
  });
});
