import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { SQLLogging } from '../../Misc/sql_logging';
import { SQLOutputConfig, configInfo } from '../../Config/config';
import { EntityInfo } from '@memberjunction/core';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { SmartFieldIdentificationResult } from '../../Misc/advanced_generation';

class TestableManageMetadataForLogging extends ManageMetadataBase {
   public async callApplyFieldCategories(
      ...args: Parameters<ManageMetadataBase['applyFieldCategories']>
   ): Promise<void> {
      return this.applyFieldCategories(...args);
   }

   public async callApplySmartFieldIdentification(
      ...args: Parameters<ManageMetadataBase['applySmartFieldIdentification']>
   ): Promise<void> {
      return this.applySmartFieldIdentification(...args);
   }
}

function createDummyConnection(): CodeGenConnection {
   return {
      query: async () => ({ recordset: [] } as CodeGenQueryResult),
      queryWithParams: async () => ({ recordset: [] } as CodeGenQueryResult),
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
}

describe('T11 — SQL Log Capture of LLM Writes (C2, D13, §1.2)', () => {
   let tmpDir: string;
   let origSQLOutput: SQLOutputConfig | undefined;
   let mm: TestableManageMetadataForLogging;
   const pool = createDummyConnection();

   beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-sql-log-test-'));
      origSQLOutput = configInfo.SQLOutput;

      configInfo.SQLOutput = {
         enabled: true,
         folderPath: tmpDir,
         omitRecurringScriptsFromLog: true,
         appendToFile: false,
         convertCoreSchemaToFlywayMigrationFile: false,
         fileName: 'CodeGen_Run_Test.sql'
      };

      SQLLogging.resetForTests();
      SQLLogging.sqlOutputDirFlag = tmpDir;
      SQLLogging.initSQLLogging();

      mm = new TestableManageMetadataForLogging();
   });

   afterEach(async () => {
      SQLLogging.resetForTests();
      configInfo.SQLOutput = origSQLOutput;
      await fs.remove(tmpDir);
      vi.restoreAllMocks();
   });

   it('applyFieldCategories batch lands in the capture file', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      const fields = [
         {
            ID: 'f-1',
            Name: 'Notes',
            Category: null,
            AutoUpdateCategory: true,
            AutoUpdateDisplayName: true,
            AutoUpdateExtendedType: true,
            GeneratedFormSection: '',
            DisplayName: 'Notes',
            ExtendedType: null,
            CodeType: null,
         }
      ];

      const fieldCategories = [
         {
            fieldName: 'Notes',
            category: 'Details',
            displayName: 'Special Notes',
            extendedType: 'JSON'
         }
      ];

      await mm.callApplyFieldCategories(pool, entity, fields, fieldCategories, new Set(), { isNewEntity: true });

      // Verify capture file exists and contains the expected UPDATE
      const captureFilePath = SQLLogging.SQLLoggingFilePath;
      expect(captureFilePath).toBeTruthy();
      expect(await fs.pathExists(captureFilePath)).toBe(true);

      const capturedContent = await fs.readFile(captureFilePath, 'utf8');
      expect(capturedContent).toContain('-- UPDATE Entity Field Category Info Customer.Notes');
      expect(capturedContent).toContain("Category = 'Details'");
      expect(capturedContent).toContain("DisplayName = 'Special Notes'");
      expect(capturedContent).toContain("ExtendedType = 'JSON'");
      expect(capturedContent).toContain("WHERE \n   ID = 'f-1'");
   });

   it('applySmartFieldIdentification batch lands in the capture file', async () => {
      const entity = {
         ID: 'entity-1',
         Name: 'Customer',
         SchemaName: 'dbo',
         AllowUserSearchAPI: true,
         AutoUpdateAllowUserSearchAPI: false,
         FullTextSearchEnabled: false,
      };

      const fields: Array<Record<string, unknown>> = [
         {
            ID: 'f-alias',
            Name: 'Alias',
            Type: 'nvarchar',
            Length: 100,
            IsPrimaryKey: false,
            DefaultInView: false,
            IncludeInUserSearchAPI: false,
            AutoUpdateDefaultInView: true,
            AutoUpdateIncludeInUserSearchAPI: true,
            IsNameField: false,
            AutoUpdateIsNameField: true,
            UserSearchPredicateAPI: null,
            AutoUpdateUserSearchPredicate: true,
         }
      ];

      const sfiResult: SmartFieldIdentificationResult = {
         nameFields: [],
         defaultInView: ['Alias'],
         searchableFields: ['Alias'],
         searchPredicates: [{ field: 'Alias', predicate: 'BeginsWith' }],
         confidence: 'high',
         reasoning: 'Testing search capture',
      };

      await mm.callApplySmartFieldIdentification(pool, entity, fields, sfiResult, {
         isNewEntity: false,
         newFieldNames: new Set(['Alias']),
         typeReopenedNames: new Set(),
      });

      const captureFilePath = SQLLogging.SQLLoggingFilePath;
      const capturedContent = await fs.readFile(captureFilePath, 'utf8');

      expect(capturedContent).toContain("DefaultInView = 1");
      expect(capturedContent).toContain("IncludeInUserSearchAPI = 1");
      expect(capturedContent).toContain("UserSearchPredicateAPI = 'BeginsWith'");
      expect(capturedContent).toContain("WHERE ID = 'f-alias'");
   });

   it('an empty batch writes nothing to the capture file', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      // All fields locked or unchanged
      const fields = [
         {
            ID: 'f-1',
            Name: 'Name',
            Category: 'General',
            AutoUpdateCategory: false,
            AutoUpdateDisplayName: false,
            AutoUpdateExtendedType: false,
            GeneratedFormSection: 'Category',
            DisplayName: 'Name',
            ExtendedType: null,
            CodeType: null,
         }
      ];

      const fieldCategories = [
         {
            fieldName: 'Name',
            category: 'NewCategory'
         }
      ];

      const captureFilePath = SQLLogging.SQLLoggingFilePath;
      const sizeBefore = (await fs.stat(captureFilePath)).size;

      await mm.callApplyFieldCategories(pool, entity, fields, fieldCategories, new Set(['General']), { isNewEntity: false });

      const sizeAfter = (await fs.stat(captureFilePath)).size;
      expect(sizeAfter).toBe(sizeBefore);
   });

   it('finishSQLLogging deletes an empty capture file', async () => {
      // Create a fresh empty capture file
      const emptyDir = path.join(tmpDir, 'empty-test');
      await fs.ensureDir(emptyDir);
      const emptyFilePath = path.join(emptyDir, 'CodeGen_Run_Empty.sql');
      await fs.writeFile(emptyFilePath, '', 'utf8');

      SQLLogging.setFilePathForTesting(emptyFilePath);

      expect(await fs.pathExists(emptyFilePath)).toBe(true);
      SQLLogging.finishSQLLogging();
      expect(await fs.pathExists(emptyFilePath)).toBe(false);
   });
});
