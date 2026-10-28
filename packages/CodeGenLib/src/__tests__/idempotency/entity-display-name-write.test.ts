/**
 * The LLM-proposed entity display name is written the way every other CodeGen metadata write is:
 * through the SQL capture, so it reaches the CodeGen_Run_*.sql file that becomes the migration.
 * A write that only lands in the database of the machine that ran CodeGen is the feature's only
 * output going nowhere.
 *
 * Also pins the three refusals around that write (confidence, no-op, length), the schema-prefix
 * strip, and the three gates that decide whether a name is sent to the model at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { SQLLogging } from '../../Misc/sql_logging';
import { SQLOutputConfig, configInfo } from '../../Config/config';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { AdvancedGeneration, EntityDisplayNameResult } from '../../Misc/advanced_generation';

class TestableManageMetadata extends ManageMetadataBase {
   public callApplyEntityDisplayName(...args: Parameters<ManageMetadataBase['applyEntityDisplayName']>): Promise<void> {
      return this.applyEntityDisplayName(...args);
   }
   public callNeedsEntityDisplayNameGeneration(...args: Parameters<ManageMetadataBase['needsEntityDisplayNameGeneration']>): boolean {
      return this.needsEntityDisplayNameGeneration(...args);
   }
}

function recordingConnection(): { pool: CodeGenConnection; queries: string[] } {
   const queries: string[] = [];
   const pool: CodeGenConnection = {
      query: async (sql: string) => { queries.push(sql); return { recordset: [] } as CodeGenQueryResult; },
      queryWithParams: async (sql: string) => { queries.push(sql); return { recordset: [] } as CodeGenQueryResult; },
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
   return { pool, queries };
}

const entity = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
   ID: 'entity-1', Name: 'ACCT_STAT_CD', SchemaName: 'crm', DisplayName: 'Acct Stat Cd', AutoUpdateDisplayName: true, ...over,
});
const proposal = (DisplayName: string, Confidence: EntityDisplayNameResult['Confidence'] = 'high'): EntityDisplayNameResult =>
   ({ DisplayName, Confidence } as EntityDisplayNameResult);
const agStub = (over: Partial<{ enabled: boolean; alwaysGenerate: boolean }> = {}): AdvancedGeneration =>
   ({
      featureEnabled: () => over.enabled ?? true,
      FeatureOptionBool: (_f: string, option: string, def: boolean) => (option === 'alwaysGenerate' ? (over.alwaysGenerate ?? false) : def),
   } as unknown as AdvancedGeneration);

describe('applyEntityDisplayName — the write goes through the SQL capture', () => {
   let tmpDir: string;
   let origSQLOutput: SQLOutputConfig | undefined;
   let origDefaults: typeof configInfo.newEntityDefaults;
   let mm: TestableManageMetadata;

   const captured = async (): Promise<string> => {
      const p = SQLLogging.SQLLoggingFilePath;
      return p && (await fs.pathExists(p)) ? fs.readFile(p, 'utf8') : '';
   };

   beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-display-name-'));
      origSQLOutput = configInfo.SQLOutput;
      origDefaults = configInfo.newEntityDefaults;
      configInfo.SQLOutput = {
         enabled: true, folderPath: tmpDir, omitRecurringScriptsFromLog: true, appendToFile: false,
         convertCoreSchemaToFlywayMigrationFile: false, fileName: 'CodeGen_Run_Test.sql',
      };
      SQLLogging.resetForTests();
      SQLLogging.sqlOutputDirFlag = tmpDir;
      SQLLogging.initSQLLogging();
      mm = new TestableManageMetadata();
   });

   afterEach(async () => {
      SQLLogging.resetForTests();
      configInfo.SQLOutput = origSQLOutput;
      configInfo.newEntityDefaults = origDefaults;
      await fs.remove(tmpDir);
      vi.restoreAllMocks();
   });

   it('lands the UPDATE in the capture file, named like every other metadata write', async () => {
      const { pool, queries } = recordingConnection();
      await mm.callApplyEntityDisplayName(pool, entity(), proposal('Account Status Codes'));

      expect(queries).toHaveLength(1);
      const content = await captured();
      expect(content).toContain('Update display name for ACCT_STAT_CD');
      expect(content).toContain("= 'Account Status Codes'");
      expect(content).toContain('AutoUpdateDisplayName');
   });

   it('writes only for high or medium confidence — anything else, missing or malformed, is a skip', async () => {
      for (const confidence of ['low', 'Low', 'LOW', 'unsure', '', undefined, null]) {
         const { pool, queries } = recordingConnection();
         await mm.callApplyEntityDisplayName(pool, entity(), { DisplayName: 'Account Status Codes', Confidence: confidence } as unknown as EntityDisplayNameResult);
         expect(queries, `confidence ${JSON.stringify(confidence)} must not write`).toHaveLength(0);
      }
      for (const confidence of ['high', 'medium'] as const) {
         const { pool, queries } = recordingConnection();
         await mm.callApplyEntityDisplayName(pool, entity(), proposal('Account Status Codes', confidence));
         expect(queries, `confidence ${confidence} must write`).toHaveLength(1);
      }
   });

   it('strips the schema prefix a name rule puts on Entity.Name — DisplayName drops it by convention', async () => {
      configInfo.newEntityDefaults = {
         ...(configInfo.newEntityDefaults ?? {}),
         NameRulesBySchema: [{ SchemaName: 'crm', EntityNamePrefix: 'CRM: ', EntityNameSuffix: '' }],
      } as typeof configInfo.newEntityDefaults;
      for (const proposed of ['CRM: Account Status Codes', 'CRM:Account Status Codes']) {
         const { pool, queries } = recordingConnection();
         await mm.callApplyEntityDisplayName(pool, entity({ Name: 'CRM: ACCT_STAT_CD' }), proposal(proposed));
         expect(queries).toHaveLength(1);
         expect(queries[0]).toContain("= 'Account Status Codes'");
         expect(queries[0]).not.toContain('CRM');
      }
      // Once stripped, a proposal that equals the current display name is no change at all.
      const { pool, queries } = recordingConnection();
      await mm.callApplyEntityDisplayName(pool, entity({ Name: 'CRM: ACCT_STAT_CD', DisplayName: 'Account Status Codes' }), proposal('CRM: Account Status Codes'));
      expect(queries).toHaveLength(0);
   });

   it('skips an unchanged, empty or over-long proposal', async () => {
      for (const proposed of ['Acct Stat Cd', '  Acct Stat Cd ', '', '   ', 'x'.repeat(256)]) {
         const { pool, queries } = recordingConnection();
         await mm.callApplyEntityDisplayName(pool, entity(), proposal(proposed));
         expect(queries, `proposal ${JSON.stringify(proposed.slice(0, 12))} must not write`).toHaveLength(0);
      }
   });

   it('a malformed Expansions list does not turn a successful write into an error', async () => {
      const { pool, queries } = recordingConnection();
      const result = { DisplayName: 'Account Status Codes', Confidence: 'high', Expansions: 'ACCT->Account' } as unknown as EntityDisplayNameResult;
      await expect(mm.callApplyEntityDisplayName(pool, entity(), result)).resolves.toBeUndefined();
      const withNull = { DisplayName: 'Account Status Codes', Confidence: 'high', Expansions: [null, { From: 'ACCT', To: 'Account' }] } as unknown as EntityDisplayNameResult;
      await expect(mm.callApplyEntityDisplayName(pool, entity(), withNull)).resolves.toBeUndefined();
      expect(queries).toHaveLength(2);
   });
});

describe('needsEntityDisplayNameGeneration — the three gates', () => {
   const mm = new TestableManageMetadata();

   it('an administrator lock (AutoUpdateDisplayName off, in any driver spelling) wins over everything', () => {
      for (const locked of [false, 0, '0']) {
         expect(mm.callNeedsEntityDisplayNameGeneration(agStub({ alwaysGenerate: true }), entity({ AutoUpdateDisplayName: locked }))).toBe(false);
      }
      for (const open of [true, 1, '1']) {
         expect(mm.callNeedsEntityDisplayNameGeneration(agStub(), entity({ AutoUpdateDisplayName: open }))).toBe(true);
      }
   });

   it('the feature flag gates the opacity assessment, not just the model call', () => {
      expect(mm.callNeedsEntityDisplayNameGeneration(agStub({ enabled: false, alwaysGenerate: true }), entity())).toBe(false);
   });

   it('opacity is a cost filter: a clean name is not sent unless alwaysGenerate is on', () => {
      expect(mm.callNeedsEntityDisplayNameGeneration(agStub(), entity({ Name: 'CustomerOrder' }))).toBe(false);
      expect(mm.callNeedsEntityDisplayNameGeneration(agStub({ alwaysGenerate: true }), entity({ Name: 'CustomerOrder' }))).toBe(true);
      expect(mm.callNeedsEntityDisplayNameGeneration(agStub(), entity({ Name: 'ACCT_STAT_CD' }))).toBe(true);
   });
});
