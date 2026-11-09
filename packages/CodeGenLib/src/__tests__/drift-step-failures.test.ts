/**
 * Field-sync steps that fail must not report success.
 *
 * - #3546: when spDeleteEntityWithCoreDependencies fails for an entity whose table was dropped,
 *   the step logs that entity's real name, finishes the other entities, and returns false.
 * - #5858: additionalSchemaInfo is read from the path config.ts resolves (mj.config directory or
 *   the RSU env override). A configured file that does not exist yet is skipped with a warning
 *   naming the resolved path (RSU writes it on first use); an unreadable one fails the step.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const resolvePath = vi.hoisted(() => vi.fn<() => string | undefined>(() => undefined));
vi.mock('../Config/config', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Config/config')>();
   return { ...actual, ResolveAdditionalSchemaInfoPath: resolvePath };
});

const logErrorSpy = vi.hoisted(() => vi.fn());
const logWarningSpy = vi.hoisted(() => vi.fn());
vi.mock('../Misc/status_logging', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Misc/status_logging')>();
   return { ...actual, logError: logErrorSpy, LogWarning: logWarningSpy };
});

import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { Metadata } from '@memberjunction/core';

type MissingTableEntity = { ID: string; Name: string; SchemaName: string; BaseTable: string };

class StepHarness extends ManageMetadataBase {
   public appliedTables = 0;
   public removeDeleted(pool: CodeGenConnection) {
      return this.checkAndRemoveMetadataForDeletedTables(pool, ['sys']);
   }
   public applySoftKeys(pool: CodeGenConnection) {
      return this.applySoftPKFKConfig(pool);
   }
   protected override async checkDropSQLObject(): Promise<void> { /* generated objects are out of scope here */ }
   protected override async applySoftKeysToTables(): Promise<number> {
      this.appliedTables++;
      return 0;
   }
}

describe('removing metadata for dropped tables (#3546)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      logErrorSpy.mockClear();
      vi.spyOn(Metadata.prototype, 'Refresh').mockResolvedValue(true);
   });

   afterEach(() => {
      vi.restoreAllMocks();
      SQLLogging.resetForTests();
   });

   function pool(entities: MissingTableEntity[], failingEntityID: string | null, executed: string[]): CodeGenConnection {
      const run = async (sql: string): Promise<CodeGenQueryResult> => {
         executed.push(sql);
         if (sql.includes('vwEntitiesWithMissingBaseTables')) {
            return { recordset: entities } as unknown as CodeGenQueryResult;
         }
         if (failingEntityID && sql.includes('spDeleteEntityWithCoreDependencies') && sql.includes(failingEntityID)) {
            throw new Error('The DELETE statement conflicted with the REFERENCE constraint');
         }
         return { recordset: [] } as unknown as CodeGenQueryResult;
      };
      return { query: run, queryWithParams: run } as unknown as CodeGenConnection;
   }

   const SCHEDULED: MissingTableEntity = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'MJ: Scheduled Actions', SchemaName: '__mj', BaseTable: 'ScheduledAction' };
   const OTHER: MissingTableEntity = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'MJ: Other Things', SchemaName: '__mj', BaseTable: 'OtherThing' };

   it('returns false, names the entity, and still processes the rest', async () => {
      const executed: string[] = [];

      const ok = await new StepHarness().removeDeleted(pool([SCHEDULED, OTHER], SCHEDULED.ID, executed));

      expect(ok).toBe(false);
      expect(executed.some(s => s.includes('spDeleteEntityWithCoreDependencies') && s.includes(OTHER.ID))).toBe(true);
      const messages = logErrorSpy.mock.calls.map(c => String(c[0]));
      expect(messages.some(m => m.includes('MJ: Scheduled Actions') && m.includes('REFERENCE constraint'))).toBe(true);
      expect(messages.some(m => m.includes('undefined'))).toBe(false);
   });

   it('returns true when every removal succeeds', async () => {
      const ok = await new StepHarness().removeDeleted(pool([SCHEDULED, OTHER], null, []));

      expect(ok).toBe(true);
   });
});

describe('additionalSchemaInfo path resolution (#5858)', () => {
   let dir: string;

   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      logErrorSpy.mockClear();
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-asi-'));
   });

   afterEach(() => {
      ManageMetadataBase.InvalidateSoftPKFKConfigCache();
      resolvePath.mockReset();
      resolvePath.mockReturnValue(undefined);
      SQLLogging.resetForTests();
      fs.rmSync(dir, { recursive: true, force: true });
   });

   const noPool = {} as unknown as CodeGenConnection;

   it('is a no-op success when nothing is configured', async () => {
      resolvePath.mockReturnValue(undefined);
      const mm = new StepHarness();

      await expect(mm.applySoftKeys(noPool)).resolves.toBe(true);
      expect(mm.appliedTables).toBe(0);
   });

   it('skips with a warning naming the resolved path when the file does not exist yet', async () => {
      resolvePath.mockReturnValue(path.join(dir, 'missing.json'));
      logWarningSpy.mockClear();
      const mm = new StepHarness();

      await expect(mm.applySoftKeys(noPool)).resolves.toBe(true);
      expect(mm.appliedTables).toBe(0);
      expect(logWarningSpy.mock.calls.some(c => String(c[0]).includes(path.join(dir, 'missing.json')))).toBe(true);
   });

   it('fails when the configured file is not valid JSON', async () => {
      const file = path.join(dir, 'broken.json');
      fs.writeFileSync(file, '{ nope');
      resolvePath.mockReturnValue(file);

      await expect(new StepHarness().applySoftKeys(noPool)).resolves.toBe(false);
   });

   it('reads the file at the resolved path, not relative to the working directory', async () => {
      const file = path.join(dir, 'additionalSchemaInfo.json');
      fs.writeFileSync(file, JSON.stringify({ dbo: [{ TableName: 'Orders', PrimaryKey: [{ FieldName: 'OrderID' }] }] }));
      resolvePath.mockReturnValue(file);
      const mm = new StepHarness();

      await expect(mm.applySoftKeys(noPool)).resolves.toBe(true);
      expect(mm.appliedTables).toBe(1);
      expect(ManageMetadataBase.GetSoftPKFKConfig()).toEqual({ dbo: [{ TableName: 'Orders', PrimaryKey: [{ FieldName: 'OrderID' }] }] });
   });
});
