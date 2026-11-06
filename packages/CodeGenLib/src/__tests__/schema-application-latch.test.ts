/**
 * #4034: a new entity's schema application is looked up, and created when absent, on every new
 * entity. createNewEntity used to attempt the create only for the first entity of a schema (a
 * live-database "no entities in this schema yet" check), so one failed create left the schema with
 * no application for good. When the application is created late, the schema's earlier entities
 * that are in no application are linked to it.
 *
 * A small in-memory model stands in for the database: runQuery answers the application lookup and
 * the unassigned-entity count, and the logged SQL (SQLLogging is mocked) updates the model.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
   executed: [] as string[],
   apps: [] as Array<{ ID: string; Name: string; SchemaAutoAddNewEntities: string }>,
   entities: [] as Array<{ ID: string; SchemaName: string }>,
   links: [] as Array<{ ApplicationID: string; EntityID: string }>,
}));

vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: {
      LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => {
         db.executed.push(sql);
         if (sql.includes('INSERT INTO') && sql.includes('ApplicationEntity')) {
            const appID = /'([0-9A-F-]{36})'/i.exec(sql)?.[1] ?? '';
            if (sql.includes('NOT EXISTS')) {
               const schema = /SchemaName\]? = '([^']+)'/.exec(sql)?.[1];
               for (const e of db.entities.filter(x => x.SchemaName === schema && !db.links.some(l => l.EntityID === x.ID))) {
                  db.links.push({ ApplicationID: appID, EntityID: e.ID });
               }
            } else {
               const entityID = [...sql.matchAll(/'([0-9A-F-]{36})'/gi)][1][1];
               db.links.push({ ApplicationID: appID, EntityID: entityID });
            }
         }
         return undefined;
      }),
   },
}));

vi.mock('../Misc/status_logging', async (importOriginal) => {
   const actual = await importOriginal<typeof import('../Misc/status_logging')>();
   return { ...actual, LogWarning: vi.fn(), logStatus: vi.fn() };
});

import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { Metadata, type UserInfo } from '@memberjunction/core';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { configInfo } from '../Config/config';
import { LogWarning } from '../Misc/status_logging';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';

const USER = { ID: 'u' } as unknown as UserInfo;
const MD = { Entities: [], Roles: [] } as unknown as Metadata;
const POOL = {} as CodeGenConnection;
const APP_ID = 'A0000000-0000-0000-0000-00000000000A';

/** Real createNewEntity and application helper; naming, entity INSERT and the app create are scripted. */
class TestableLatch extends ManageMetadataBase {
   public AppCreateResults: Array<string | null> = [];
   public AppCreateCalls = 0;
   private nextID = 1;

   protected override createNewUUID(): string {
      return `E0000000-0000-0000-0000-${String(this.nextID++).padStart(12, '0')}`;
   }
   protected override async shouldCreateNewEntity(): Promise<{ shouldCreate: boolean; validationMessage: string }> {
      return { shouldCreate: true, validationMessage: '' };
   }
   protected override async createNewEntityName(newEntity: { TableName: string }): Promise<string> {
      return newEntity.TableName;
   }
   protected override createNewEntityInsertSQL(id: string, _name: string, newEntity: { SchemaName: string }): string {
      db.entities.push({ ID: id, SchemaName: newEntity.SchemaName });
      return `INSERT INTO [__mj].[Entity] (ID) VALUES ('${id}')`;
   }
   protected override async createNewApplication(_pool: CodeGenConnection, appID: string, appName: string, schemaName: string): Promise<string | null> {
      this.AppCreateCalls++;
      const result = this.AppCreateResults.length > 0 ? this.AppCreateResults.shift() ?? null : appID;
      if (result) {
         db.apps.push({ ID: result, Name: appName, SchemaAutoAddNewEntities: schemaName });
      }
      return result;
   }
   protected override async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      if (sql.includes('vwApplications')) {
         return { recordset: [...db.apps] } as unknown as CodeGenQueryResult;
      }
      if (sql.includes('COUNT(*)')) {
         const schema = /SchemaName\]? = '([^']+)'/.exec(sql)?.[1];
         const count = db.entities.filter(e => e.SchemaName === schema && !db.links.some(l => l.EntityID === e.ID)).length;
         return { recordset: [{ Count: count }] } as unknown as CodeGenQueryResult;
      }
      throw new Error(`unexpected query: ${sql}`);
   }

   public Create(schemaName: string, tableName: string): Promise<void> {
      return this.createNewEntity(POOL, { SchemaName: schemaName, TableName: tableName }, MD, USER);
   }
}

describe('schema application on new entities (#4034)', () => {
   const saved = {
      createApp: configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName,
      addToApp: configInfo.newEntityDefaults.AddToApplicationWithSchemaName,
      permissions: configInfo.newEntityDefaults.PermissionDefaults,
   };
   let refresh: ReturnType<typeof vi.spyOn>;

   beforeEach(() => {
      db.executed.length = 0;
      db.apps.length = 0;
      db.entities.length = 0;
      db.links.length = 0;
      vi.mocked(LogWarning).mockClear();
      configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName = true;
      configInfo.newEntityDefaults.AddToApplicationWithSchemaName = true;
      configInfo.newEntityDefaults.PermissionDefaults = { ...saved.permissions, AutoAddPermissionsForNewEntities: false };
      refresh = vi.spyOn(Metadata.prototype, 'Refresh').mockResolvedValue(true);
   });

   afterEach(() => {
      configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName = saved.createApp;
      configInfo.newEntityDefaults.AddToApplicationWithSchemaName = saved.addToApp;
      configInfo.newEntityDefaults.PermissionDefaults = saved.permissions;
      refresh.mockRestore();
   });

   it('retries a failed application create on the next entity of the schema', async () => {
      const mm = new TestableLatch();
      mm.AppCreateResults = [null, APP_ID];

      await mm.Create('crm', 'Account');
      expect(db.apps).toHaveLength(0);

      await mm.Create('crm', 'Contact');
      expect(mm.AppCreateCalls).toBe(2);
      expect(db.apps.map(a => a.ID)).toEqual([APP_ID]);
   });

   it('links the schema\'s earlier unlinked entities when the application is created late', async () => {
      const mm = new TestableLatch();
      mm.AppCreateResults = [null, APP_ID];

      await mm.Create('crm', 'Account');
      await mm.Create('crm', 'Contact');

      expect(db.links).toHaveLength(2);
      expect(db.links.every(l => l.ApplicationID === APP_ID)).toBe(true);
      expect(new Set(db.links.map(l => l.EntityID))).toEqual(new Set(db.entities.map(e => e.ID)));
      const linkAll = db.executed.filter(s => s.includes('NOT EXISTS'));
      expect(linkAll).toHaveLength(1);
      expect(linkAll[0]).toContain('ROW_NUMBER() OVER');
   });

   it('creates an application for a schema whose entities exist but which no application claims', async () => {
      db.entities.push({ ID: 'E9999999-0000-0000-0000-000000000001', SchemaName: 'crm' });
      const mm = new TestableLatch();

      await mm.Create('crm', 'Contact');

      expect(mm.AppCreateCalls).toBe(1);
      expect(db.apps).toHaveLength(1);
      expect(db.links.map(l => l.EntityID).sort()).toEqual(db.entities.map(e => e.ID).sort());
   });

   it('does not emit the bulk link when the schema has no other unlinked entities', async () => {
      const mm = new TestableLatch();

      await mm.Create('crm', 'Account');
      await mm.Create('crm', 'Contact');

      expect(mm.AppCreateCalls).toBe(1);
      expect(db.links).toHaveLength(2);
      expect(db.executed.some(s => s.includes('NOT EXISTS'))).toBe(false);
   });

   it('creates nothing and warns when CreateNewApplicationWithSchemaName is off', async () => {
      configInfo.newSchemaDefaults.CreateNewApplicationWithSchemaName = false;
      const mm = new TestableLatch();

      await mm.Create('crm', 'Account');

      expect(mm.AppCreateCalls).toBe(0);
      expect(db.links).toHaveLength(0);
      expect(LogWarning).toHaveBeenCalledWith(expect.stringContaining(`no Application has SchemaAutoAddNewEntities='crm'`));
   });
});
