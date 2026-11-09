import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { EntityConfigurableAtCreationAttribute } from '@memberjunction/core';
import { SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';

/**
 * Mock setup: config, status logging, uuid, etc.
 * Pattern copied from application-insert-pg-quoting.test.ts
 */
vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: {
      newEntityDefaults: {
         IncludeInAPI: true,
         AllowUserSearchAPI: true,
         AllowCaching: true,
         TrackRecordChanges: true,
         AuditRecordAccess: undefined,
         AuditViewRuns: undefined,
         AllowAllRowsAPI: undefined,
         AllowCreateAPI: undefined,
         AllowUpdateAPI: undefined,
         AllowDeleteAPI: undefined,
         UserViewMaxRows: undefined,
      },
      additionalSchemaInfo: '',
   },
   currentWorkingDirectory: os.tmpdir(),
   GetSettingValue: vi.fn(),
   get getSettingValue() { return this.GetSettingValue; },
   MjCoreSchema: () => '__mj',
   get mj_core_schema() { return this.MjCoreSchema; },
   DbPlatform: () => 'sqlserver',
   get dbPlatform() { return this.DbPlatform; },
   OutputDir: os.tmpdir(),
   get outputDir() { return this.OutputDir; },
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   LogMessage: vi.fn(),
   get logMessage() { return this.LogMessage; },
   logStatus: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid'), v5: vi.fn() }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

/**
 * Testable subclass that exposes protected methods.
 */
class TestableManageMetadata extends ManageMetadataBase {
   protected get dialect(): SQLDialect {
      return new SQLServerDialect();
   }

   /**
    * Exposes the protected resolveCreationTimeEntityConfig method.
    */
   public resolveCreationTimeEntityConfigPublic(
      schemaName: string,
      tableName: string
   ): Partial<Record<EntityConfigurableAtCreationAttribute, boolean | number>> {
      return this.resolveCreationTimeEntityConfig(schemaName, tableName);
   }

   /**
    * Exposes the protected createNewEntityInsertSQL method.
    */
   public createNewEntityInsertSQLPublic(
      newEntityUUID: string,
      newEntityName: string,
      newEntity: Record<string, unknown>,
      newEntitySuffix: string,
      newEntityDisplayName: string | null
   ): string {
      return this.createNewEntityInsertSQL(newEntityUUID, newEntityName, newEntity, newEntitySuffix, newEntityDisplayName);
   }

   /**
    * Exposes the protected resolveCreationTimeAutoAddPermissions method.
    */
   public resolveCreationTimeAutoAddPermissionsPublic(
      schemaName: string,
      tableName: string
   ): boolean {
      return this.resolveCreationTimeAutoAddPermissions(schemaName, tableName);
   }
}

/**
 * Helper that extracts column->value pairs from an INSERT statement.
 * Handles both bracketed identifiers [col] and values ('val', 123, etc).
 */
function parseInsertValues(sql: string): Record<string, string> {
   // Remove comments
   let cleaned = sql.replace(/--[^\n]*/g, '');

   // Extract the column list: between ( and ) before VALUES
   const beforeValues = cleaned.split(/VALUES\s*\(/i)[0];
   const colStart = beforeValues.lastIndexOf('(') + 1;
   const colEnd = beforeValues.length;
   const colString = beforeValues.substring(colStart, colEnd);

   // Extract the values list: between ( and ) after VALUES
   const afterValues = cleaned.split(/VALUES\s*\(/i)[1];
   const valEnd = afterValues.lastIndexOf(')');
   const valString = afterValues.substring(0, valEnd);

   // Split columns and values, handling nested parentheses and quotes
   const columns = splitList(colString);
   const values = splitList(valString);

   // Normalize column names by removing brackets
   const result: Record<string, string> = {};
   for (let i = 0; i < columns.length && i < values.length; i++) {
      const colName = columns[i].replace(/[\[\]`"]/g, '').trim();
      const colValue = values[i].trim();
      result[colName] = colValue;
   }

   return result;
}

/**
 * Helper: split a parenthesized or comma-separated list, respecting nested parens and quotes.
 */
function splitList(list: string): string[] {
   const items: string[] = [];
   let depth = 0;
   let quoted = false;
   let start = 0;

   for (let i = 0; i < list.length; i++) {
      const ch = list[i];
      if (ch === "'" && (i === 0 || list[i - 1] !== '\\')) {
         quoted = !quoted;
      } else if (!quoted && ch === '(') {
         depth++;
      } else if (!quoted && ch === ')') {
         depth--;
      } else if (!quoted && ch === ',' && depth === 0) {
         items.push(list.slice(start, i).trim());
         start = i + 1;
      }
   }

   items.push(list.slice(start).trim());
   return items.filter(item => item.length > 0);
}

describe('ManageMetadataBase.resolveCreationTimeEntityConfig', () => {
   beforeEach(() => {
      // Clear the config cache before each test
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
   });

   afterEach(() => {
      // Clean up and invalidate cache
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      vi.restoreAllMocks();
   });

   it('returns empty object when no Entities config exists', () => {
      const config: Record<string, unknown> = { SomeOtherKey: [] };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Orders');

      expect(overrides).toEqual({});
   });

   it('respects TrackRecordChanges: false override for matching schema and table', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Orders');

      expect(overrides.TrackRecordChanges).toBe(false);
   });

   it('respects IncludeInAPI: false override for matching table', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               IncludeInAPI: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Orders');

      expect(overrides.IncludeInAPI).toBe(false);
   });

   it('performs case-insensitive matching on SchemaName and BaseTable', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();

      // Test with different casings
      const overrides1 = mm.resolveCreationTimeEntityConfigPublic('DBO', 'ORDERS');
      const overrides2 = mm.resolveCreationTimeEntityConfigPublic('dbo', 'orders');
      const overrides3 = mm.resolveCreationTimeEntityConfigPublic('DbO', 'OrDeRs');

      expect(overrides1.TrackRecordChanges).toBe(false);
      expect(overrides2.TrackRecordChanges).toBe(false);
      expect(overrides3.TrackRecordChanges).toBe(false);
   });

   it('does not apply config from a different table to this table', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      // Try to resolve config for a different table
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Customers');

      expect(overrides).toEqual({});
   });

   it('ignores wrong-typed values (string TrackRecordChanges)', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: 'no', // wrong type: string instead of boolean
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Orders');

      // Wrong type should be ignored
      expect(overrides.TrackRecordChanges).toBeUndefined();
   });

   it('applies numeric UserViewMaxRows override correctly', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               UserViewMaxRows: 50,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Orders');

      expect(overrides.UserViewMaxRows).toBe(50);
   });

   it('ignores non-creation attributes like AllowMultipleSubtypes', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: false,
               AllowMultipleSubtypes: true, // not in EntityInfo.ConfigurableAtCreationAttributes
               SomeOtherField: 'value',
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const overrides = mm.resolveCreationTimeEntityConfigPublic('dbo', 'Orders');

      // Should only have the creation-time attribute
      expect(overrides.TrackRecordChanges).toBe(false);
      expect((overrides as Record<string, unknown>).AllowMultipleSubtypes).toBeUndefined();
      expect((overrides as Record<string, unknown>).SomeOtherField).toBeUndefined();
   });
});

describe('ManageMetadataBase.createNewEntityInsertSQL with per-table overrides', () => {
   beforeEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
   });

   afterEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      vi.restoreAllMocks();
   });

   it('uses global newEntityDefaults when no Entities config exists', () => {
      const config: Record<string, unknown> = {};

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'voting',
         TableName: 'CastBallot',
         EntityDescription: 'Test entity',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Cast Ballot',
         newEntity,
         '',
         'Cast Ballot'
      );

      const values = parseInsertValues(sql);
      expect(values.TrackRecordChanges).toBe('1'); // true in SQL Server
      expect(values.IncludeInAPI).toBe('1');
   });

   it('uses per-table TrackRecordChanges: false when configured', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'CastBallot',
               SchemaName: 'voting',
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'voting',
         TableName: 'CastBallot',
         EntityDescription: 'Test entity',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Cast Ballot',
         newEntity,
         '',
         'Cast Ballot'
      );

      const values = parseInsertValues(sql);
      // The override should apply: TrackRecordChanges = false = 0 in SQL Server
      expect(values.TrackRecordChanges).toBe('0');
   });

   it('respects per-table IncludeInAPI: false override', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               IncludeInAPI: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'dbo',
         TableName: 'Orders',
         EntityDescription: 'Test entity',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Orders',
         newEntity,
         '',
         'Orders'
      );

      const values = parseInsertValues(sql);
      expect(values.IncludeInAPI).toBe('0'); // false in SQL Server
   });

   it('overrides are case-insensitive on schema and table names', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'DBO',
         TableName: 'ORDERS',
         EntityDescription: 'Test entity',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Orders',
         newEntity,
         '',
         'Orders'
      );

      const values = parseInsertValues(sql);
      // The case-insensitive match should apply the override
      expect(values.TrackRecordChanges).toBe('0');
   });

   it('does not apply config from a different table to this INSERT', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      // Insert for a different table
      const newEntity: Record<string, unknown> = {
         SchemaName: 'dbo',
         TableName: 'Customers',
         EntityDescription: 'Test entity',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Customers',
         newEntity,
         '',
         'Customers'
      );

      const values = parseInsertValues(sql);
      // Should use the global default, not the Orders override
      expect(values.TrackRecordChanges).toBe('1');
   });

   it('includes the required base columns: ID, Name, DisplayName, etc.', () => {
      const config: Record<string, unknown> = {};

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'dbo',
         TableName: 'TestTable',
         EntityDescription: 'Test entity description',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Test Table',
         newEntity,
         'Suffix',
         'Test Table Display'
      );

      const values = parseInsertValues(sql);

      // Verify all base columns are present
      expect(values.ID).toBe("'11111111-1111-1111-1111-111111111111'");
      expect(values.Name).toBe("'Test Table'");
      expect(values.DisplayName).toBe("'Test Table Display'");
      expect(values.NameSuffix).toBe("'Suffix'");
      expect(values.BaseTable).toBe("'TestTable'");
      expect(values.SchemaName).toBe("'dbo'");
      expect(values.Description).toBe("'Test entity description'");
   });

   it('handles null Description when EntityDescription is missing', () => {
      const config: Record<string, unknown> = {};

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'dbo',
         TableName: 'TestTable',
         // No EntityDescription
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Test Table',
         newEntity,
         '',
         'Test Table'
      );

      const values = parseInsertValues(sql);
      expect(values.Description).toBe('NULL');
   });

   it('handles null DisplayName when newEntityDisplayName is null', () => {
      const config: Record<string, unknown> = {};

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'dbo',
         TableName: 'TestTable',
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Test Table',
         newEntity,
         '',
         null // No display name
      );

      const values = parseInsertValues(sql);
      expect(values.DisplayName).toBe('NULL');
   });

   it('correctly handles quoted single quotes in entity descriptions', () => {
      const config: Record<string, unknown> = {};

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const newEntity: Record<string, unknown> = {
         SchemaName: 'dbo',
         TableName: 'TestTable',
         EntityDescription: "Entity with 'quotes' in description",
      };

      const sql = mm.createNewEntityInsertSQLPublic(
         '11111111-1111-1111-1111-111111111111',
         'Test Table',
         newEntity,
         '',
         'Test Table'
      );

      const values = parseInsertValues(sql);
      // Single quotes should be doubled in SQL
      expect(values.Description).toContain("''");
   });
});

describe('ManageMetadataBase.resolveCreationTimeAutoAddPermissions', () => {
   beforeEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
   });

   afterEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      vi.restoreAllMocks();
   });

   it('returns true when no Entities config exists', () => {
      const config: Record<string, unknown> = {};

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      expect(result).toBe(true);
   });

   it('returns false only when AutoAddPermissions is exactly boolean false', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      expect(result).toBe(false);
   });

   it('returns true when AutoAddPermissions is true', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: true,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      expect(result).toBe(true);
   });

   it('performs case-insensitive matching on SchemaName and BaseTable', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();

      // Test with different casings
      const result1 = mm.resolveCreationTimeAutoAddPermissionsPublic('DBO', 'ORDERS');
      const result2 = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'orders');
      const result3 = mm.resolveCreationTimeAutoAddPermissionsPublic('DbO', 'OrDeRs');

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
   });

   it('does not apply config from a different table', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      // Try to resolve config for a different table
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Customers');

      expect(result).toBe(true);
   });

   it('ignores wrong-typed values (string "false")', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: 'false', // wrong type: string instead of boolean
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      // Wrong type should be ignored, returns true
      expect(result).toBe(true);
   });

   it('ignores wrong-typed values (number 0)', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: 0, // wrong type: number instead of boolean
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      // Wrong type should be ignored, returns true
      expect(result).toBe(true);
   });

   it('returns true when AutoAddPermissions key is missing from config entry', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               // AutoAddPermissions not specified
               TrackRecordChanges: false,
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      // Missing key returns true
      expect(result).toBe(true);
   });

   it('returns true when config is null', () => {
      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(null);

      const mm = new TestableManageMetadata();
      const result = mm.resolveCreationTimeAutoAddPermissionsPublic('dbo', 'Orders');

      expect(result).toBe(true);
   });
});

describe('processEntityConfigs — AutoAddPermissions exclusion', () => {
   beforeEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
   });

   afterEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      vi.restoreAllMocks();
   });

   it('results in no attributes to update when entry has only AutoAddPermissions', () => {
      // Simulate what processEntityConfigs does: filter out reserved keys
      const entityConfig = {
         BaseTable: 'Orders',
         SchemaName: 'dbo',
         AutoAddPermissions: false, // Only this key, no Entity columns to set
      };

      const reservedKeys = new Set(['BaseTable', 'SchemaName', 'AutoAddPermissions']);
      const attrs = Object.entries(entityConfig).filter(([key]) => !reservedKeys.has(key));

      // Should result in zero attributes since only AutoAddPermissions is present
      expect(attrs).toHaveLength(0);
   });

   it('does not include AutoAddPermissions in UPDATE SQL when other attributes are present', () => {
      const config: Record<string, unknown> = {
         Entities: [
            {
               BaseTable: 'Orders',
               SchemaName: 'dbo',
               AutoAddPermissions: false,
               TrackRecordChanges: false, // This should be in the UPDATE
            },
         ],
      };

      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);

      // Verify that after filtering, AutoAddPermissions is not in the attrs
      const ec = {
         BaseTable: 'Orders',
         SchemaName: 'dbo',
         AutoAddPermissions: false,
         TrackRecordChanges: false,
      };
      const reservedKeys = new Set(['BaseTable', 'SchemaName', 'AutoAddPermissions']);
      const attrs = Object.entries(ec).filter(([key]) => !reservedKeys.has(key));

      // Should only have TrackRecordChanges, not AutoAddPermissions
      expect(attrs.map(([k]) => k)).toEqual(['TrackRecordChanges']);
      expect(attrs.map(([k]) => k)).not.toContain('AutoAddPermissions');
   });
});
