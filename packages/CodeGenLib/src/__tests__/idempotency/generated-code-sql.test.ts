import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { EntitySubClassGeneratorBase } from '../../Misc/entity_subclasses_codegen';
import { ManageMetadataBase, ValidatorResult } from '../../Database/manage-metadata';
import { Metadata, EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { CodeGenReporter } from '../../Misc/codegen-reporter';
import { configInfo, ConfigInfo } from '../../Config/config';

describe('T22 — GeneratedCode SQL: Literal UUID and Idempotent Emission (C11)', () => {
   let executedStatements: string[];
   let dialect: SQLServerDialect;
   let pool: CodeGenConnection;
   let origSQLOutput: ConfigInfo['SQLOutput'];

   beforeEach(() => {
      executedStatements = [];
      dialect = new SQLServerDialect();

      origSQLOutput = configInfo.SQLOutput;
      configInfo.SQLOutput = {
         enabled: false,
         folderPath: '',
         omitRecurringScriptsFromLog: true,
         appendToFile: false,
         convertCoreSchemaToFlywayMigrationFile: false,
         fileName: '',
      };

      pool = {
         Dialect: dialect,
         query: async (sql: string): Promise<CodeGenQueryResult> => {
            executedStatements.push(sql);
            return { recordset: [] };
         },
         queryWithParams: async (sql: string): Promise<CodeGenQueryResult> => {
            executedStatements.push(sql);
            return { recordset: [] };
         },
         beginTransaction: async () => ({
            commit: async () => {},
            rollback: async () => {},
         }),
      };

      // Mock Metadata.EntityByName
      vi.spyOn(Metadata.prototype, 'EntityByName').mockImplementation((name: string) => {
         if (name === 'MJ: Entity Fields') {
            return { ID: '11111111-1111-1111-1111-111111111111' } as EntityInfo;
         }
         if (name === 'MJ: Entities') {
            return { ID: '22222222-2222-2222-2222-222222222222' } as EntityInfo;
         }
         return null as unknown as EntityInfo;
      });

      // Clear any validators in ManageMetadataBase
      ManageMetadataBase.generatedValidators.length = 0;
   });

   afterEach(() => {
      configInfo.SQLOutput = origSQLOutput;
      ManageMetadataBase.generatedValidators.length = 0;
      vi.restoreAllMocks();
   });

   it('emits INSERT with literal UUID inside IF NOT EXISTS when generatedCodeId is empty', async () => {
      const generator = new EntitySubClassGeneratorBase();

      const entity = {
         ID: 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',
         Name: 'Customer',
         Fields: [
            {
               ID: 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
               Name: 'Age',
               IsVirtual: false,
            } as unknown as EntityFieldInfo,
         ],
      } as unknown as EntityInfo;

      const v = new ValidatorResult();
      v.entityName = 'Customer';
      v.fieldName = 'Age';
      v.functionName = 'ValidateAge';
      v.functionText = 'return value >= 0;';
      v.functionDescription = 'Validates that Age is non-negative';
      v.sourceCheckConstraint = 'Age >= 0';
      v.aiModelID = 'MMMMMMMM-MMMM-MMMM-MMMM-MMMMMMMMMMMM';
      v.generatedCodeId = ''; // No existing ID -> must mint a literal UUID
      v.wasGenerated = true;
      v.success = true;

      ManageMetadataBase.generatedValidators.push(v);

      const code = await generator.LogAndGenerateValidateFunction(pool, entity, false);
      expect(code).toBeTruthy();
      expect(executedStatements.length).toBe(1);

      const sql = executedStatements[0];

      // Must be wrapped in IF NOT EXISTS guard
      expect(sql).toContain('IF NOT EXISTS');
      expect(sql).toContain('[CategoryID] =');
      expect(sql).toContain('[LinkedEntityID] =');
      expect(sql).toContain('[LinkedRecordPrimaryKey] =');
      expect(sql).toContain("'11111111-1111-1111-1111-111111111111'"); // MJ: Entity Fields
      expect(sql).toContain("'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'"); // Field ID

      // Must have INSERT with literal UUID
      expect(sql).toContain('INSERT INTO [__mj].[GeneratedCode]');
      const uuidMatch = /VALUES \('([0-9a-f-]{36})'/i.exec(sql);
      expect(uuidMatch).not.toBeNull();
      const mintedId = uuidMatch![1];
      expect(mintedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // The in-memory validator record must receive the minted ID
      expect(v.generatedCodeId).toBe(mintedId);
   });

   it('emits UPDATE targeting the existing ID for a regenerated validator', async () => {
      const generator = new EntitySubClassGeneratorBase();

      const entity = {
         ID: 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',
         Name: 'Customer',
         Fields: [
            {
               ID: 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
               Name: 'Age',
               IsVirtual: false,
            } as unknown as EntityFieldInfo,
         ],
      } as unknown as EntityInfo;

      const existingId = '99999999-9999-9999-9999-999999999999';

      const v = new ValidatorResult();
      v.entityName = 'Customer';
      v.fieldName = 'Age';
      v.functionName = 'ValidateAge';
      v.functionText = 'return value >= 18;'; // regenerated constraint!
      v.functionDescription = 'Validates that Age is adult';
      v.sourceCheckConstraint = 'Age >= 18';
      v.aiModelID = 'MMMMMMMM-MMMM-MMMM-MMMM-MMMMMMMMMMMM';
      v.generatedCodeId = existingId;
      v.wasGenerated = true;
      v.success = true;

      ManageMetadataBase.generatedValidators.push(v);

      const code = await generator.LogAndGenerateValidateFunction(pool, entity, false);
      expect(code).toBeTruthy();
      expect(executedStatements.length).toBe(1);

      const sql = executedStatements[0];

      // Must be an UPDATE targeting the exact same existing ID
      expect(sql).toContain('UPDATE [__mj].[GeneratedCode] SET');
      expect(sql).toContain(`[ID]='${existingId}'`);
      expect(sql).toContain('[Source]=\'Age >= 18\'');
      expect(sql).not.toContain('INSERT');
   });

   it('emits nothing when wasGenerated is false for every validator', async () => {
      const generator = new EntitySubClassGeneratorBase();

      const entity = {
         ID: 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE',
         Name: 'Customer',
         Fields: [
            {
               ID: 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
               Name: 'Age',
               IsVirtual: false,
            } as unknown as EntityFieldInfo,
         ],
      } as unknown as EntityInfo;

      const v = new ValidatorResult();
      v.entityName = 'Customer';
      v.fieldName = 'Age';
      v.functionName = 'ValidateAge';
      v.functionText = 'return value >= 0;';
      v.functionDescription = 'Validates that Age is non-negative';
      v.sourceCheckConstraint = 'Age >= 0';
      v.aiModelID = 'MMMMMMMM-MMMM-MMMM-MMMM-MMMMMMMMMMMM';
      v.generatedCodeId = '99999999-9999-9999-9999-999999999999';
      v.wasGenerated = false; // Not regenerated this run!
      v.success = true;

      ManageMetadataBase.generatedValidators.push(v);

      const code = await generator.LogAndGenerateValidateFunction(pool, entity, false);
      // Code is still generated for the class
      expect(code).toBeTruthy();
      // But ZERO statements were executed against the database or logged
      expect(executedStatements.length).toBe(0);
   });
});
