import { describe, it, expect } from 'vitest';
import { CatalogViewRule } from '../rules/CatalogViewRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new CatalogViewRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('CatalogViewRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('CatalogViewRule');
      expect(rule.Priority).toBe(15);
      expect(rule.AppliesTo).toEqual(['CREATE_VIEW']);
      expect(rule.BypassSqlglot).toBe(true);
    });

    it('should have priority lower than ViewRule (20)', () => {
      expect(rule.Priority).toBeLessThan(20);
    });
  });

  describe('catalog view recognition', () => {
    it('should recognize and convert vwSQLTablesAndEntities', () => {
      const sql = `CREATE VIEW [__mj].[vwSQLTablesAndEntities] AS SELECT e.ID EntityID FROM sys.all_objects t`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwSQLTablesAndEntities"');
      expect(result).toContain('pg_catalog.pg_class');
      expect(result).toContain('pg_catalog.pg_namespace');
      expect(result).toContain('"EntityID"');
      expect(result).toContain('"EntityName"');
      expect(result).toContain('"TableName"');
      expect(result).toContain('"SchemaName"');
      expect(result).toContain('"ViewName"');
      expect(result).toContain('"TableDescription"');
      expect(result).toContain('"ViewDescription"');
      expect(result).toContain('"EntityDescription"');
      expect(result).not.toContain('sys.');
    });

    it('should recognize and convert vwForeignKeys', () => {
      const sql = `CREATE VIEW [__mj].[vwForeignKeys] AS SELECT obj.name AS FK_NAME FROM sys.foreign_key_columns fkc`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwForeignKeys"');
      expect(result).toContain('pg_catalog.pg_constraint');
      expect(result).toContain('"FK_NAME"');
      expect(result).toContain('"schema_name"');
      expect(result).toContain('"table"');
      expect(result).toContain('"column"');
      expect(result).toContain('"referenced_schema"');
      expect(result).toContain('"referenced_table"');
      expect(result).toContain('"referenced_column"');
      expect(result).toContain("contype = 'f'");
      expect(result).not.toContain('sys.');
    });

    it('should recognize and convert vwTablePrimaryKeys', () => {
      const sql = `CREATE VIEW [__mj].[vwTablePrimaryKeys] AS SELECT s.name AS SchemaName FROM sys.tables t`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwTablePrimaryKeys"');
      expect(result).toContain('pg_catalog.pg_index');
      expect(result).toContain('"SchemaName"');
      expect(result).toContain('"TableName"');
      expect(result).toContain('"ColumnName"');
      expect(result).toContain('indisprimary = true');
      expect(result).not.toContain('sys.');
    });

    it('should recognize and convert vwTableUniqueKeys', () => {
      const sql = `CREATE VIEW [__mj].[vwTableUniqueKeys] AS SELECT s.name AS SchemaName FROM sys.tables t`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwTableUniqueKeys"');
      expect(result).toContain('pg_catalog.pg_index');
      expect(result).toContain('indisunique = true');
      expect(result).toContain('indisprimary = false');
      expect(result).not.toContain('sys.');
    });

    it('should recognize and convert vwSQLSchemas', () => {
      const sql = `CREATE VIEW [__mj].[vwSQLSchemas] AS SELECT s.schema_id AS SchemaID FROM sys.schemas s`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwSQLSchemas"');
      expect(result).toContain('pg_catalog.pg_namespace');
      expect(result).toContain('"SchemaID"');
      expect(result).toContain('"SchemaName"');
      expect(result).toContain('"SchemaDescription"');
      expect(result).toContain('pg_catalog.pg_description');
      expect(result).not.toContain('sys.');
    });

    it('should recognize and convert vwSQLColumnsAndEntityFields', () => {
      const sql = `CREATE VIEW [__mj].[vwSQLColumnsAndEntityFields] AS WITH FilteredColumns AS (SELECT * FROM sys.all_columns)`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwSQLColumnsAndEntityFields"');
      expect(result).toContain('pg_catalog.pg_attribute');
      expect(result).toContain('pg_catalog.pg_type');
      expect(result).toContain('"EntityID"');
      expect(result).toContain('"FieldName"');
      expect(result).toContain('"Type"');
      expect(result).toContain('"Length"');
      expect(result).toContain('"Precision"');
      expect(result).toContain('"Scale"');
      expect(result).toContain('"AllowsNull"');
      expect(result).toContain('"AutoIncrement"');
      expect(result).toContain('"IsVirtual"');
      expect(result).toContain('"DefaultValue"');
      expect(result).toContain('"Description"');
      expect(result).toContain('"EntityField"');
      expect(result).not.toContain('sys.');
    });

    it('should recognize and convert vwEntityFieldsWithCheckConstraints', () => {
      const sql = `CREATE VIEW [__mj].[vwEntityFieldsWithCheckConstraints] AS SELECT e.ID as EntityID FROM sys.check_constraints cc`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE VIEW __mj."vwEntityFieldsWithCheckConstraints"');
      expect(result).toContain('pg_catalog.pg_constraint');
      expect(result).toContain('"EntityID"');
      expect(result).toContain('"EntityName"');
      expect(result).toContain('"ConstraintName"');
      expect(result).toContain('"ConstraintDefinition"');
      expect(result).toContain("contype = 'c'");
      expect(result).not.toContain('sys.');
    });
  });

  describe('vwFlywayVersionHistoryParsed handling', () => {
    it('should skip vwFlywayVersionHistoryParsed with explanation comment', () => {
      const sql = `CREATE VIEW [__mj].[vwFlywayVersionHistoryParsed] AS SELECT f.installed_rank FROM __mj.flyway_schema_history f`;
      const result = convert(sql);
      expect(result).toContain('SKIPPED');
      expect(result).toContain('vwFlywayVersionHistoryParsed');
      expect(result).toContain('flyway');
      expect(result).not.toContain('CREATE OR REPLACE VIEW');
    });
  });

  describe('non-catalog view delegation', () => {
    it('should delegate non-catalog views to ViewRule', () => {
      const sql = `CREATE VIEW [__mj].[vwUsers] AS SELECT [ID], [Name] FROM [__mj].[User]`;
      const result = convert(sql);
      // ViewRule wraps in DO block with exception-based CASCADE fallback
      expect(result).toContain('DO $do$');
      expect(result).toContain('CREATE OR REPLACE VIEW');
      expect(result).toContain('"vwUsers"');
      // Should NOT contain any pg_catalog references (it's not a catalog view)
      expect(result).not.toContain('pg_catalog');
    });

    it('should still skip non-catalog views that reference sys.* (via ViewRule)', () => {
      const sql = `CREATE VIEW [__mj].[vwCustomSysView] AS SELECT name FROM sys.objects`;
      const result = convert(sql);
      // ViewRule skips sys.* views (that aren't in our catalog map)
      expect(result).toContain('SKIPPED');
    });
  });

  describe('PG output quality', () => {
    it('should produce valid PG syntax for vwTablePrimaryKeys (no SQL Server constructs)', () => {
      const sql = `CREATE VIEW [__mj].[vwTablePrimaryKeys] AS SELECT s.name FROM sys.tables t`;
      const result = convert(sql);
      // No SQL Server syntax
      expect(result).not.toMatch(/\[.*\]/); // No square brackets
      expect(result).not.toContain('NVARCHAR');
      expect(result).not.toContain('sys.');
      // Has PG syntax
      expect(result).toContain('pg_catalog');
      expect(result).toContain('CREATE OR REPLACE VIEW');
    });

    it('should reference __mj."Entity" table in vwSQLTablesAndEntities', () => {
      const sql = `CREATE VIEW [__mj].[vwSQLTablesAndEntities] AS SELECT t.name FROM sys.all_objects t`;
      const result = convert(sql);
      expect(result).toContain('__mj."Entity"');
    });

    it('should use unnest for array expansion in vwForeignKeys', () => {
      const sql = `CREATE VIEW [__mj].[vwForeignKeys] AS SELECT obj.name FROM sys.foreign_key_columns`;
      const result = convert(sql);
      expect(result).toContain('unnest');
    });

    it('should reference vwSQLTablesAndEntities in vwSQLColumnsAndEntityFields', () => {
      const sql = `CREATE VIEW [__mj].[vwSQLColumnsAndEntityFields] AS WITH FilteredColumns AS (SELECT * FROM sys.all_columns)`;
      const result = convert(sql);
      expect(result).toContain('"vwSQLTablesAndEntities"');
    });

    it('should use pg_get_constraintdef in vwEntityFieldsWithCheckConstraints', () => {
      const sql = `CREATE VIEW [__mj].[vwEntityFieldsWithCheckConstraints] AS SELECT e.ID FROM sys.check_constraints cc`;
      const result = convert(sql);
      expect(result).toContain('pg_get_constraintdef');
    });
  });
});
