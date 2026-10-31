/**
 * Retraction of what CodeGen wrote from additionalSchemaInfo once the file stops declaring it (#4535).
 *
 * The planners are pure and tested directly. The ManageMetadataBase tests drive the real methods with
 * a canned connection and the migration logger stubbed: `SQLLogging.LogSQLAndExecute` receives exactly
 * what is executed and written to the migration file, so it is the observation point.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../Misc/status_logging', async (importOriginal) => ({
   ...(await importOriginal<typeof import('../Misc/status_logging')>()),
   logError: vi.fn(),
   logStatus: vi.fn(),
   LogWarning: vi.fn(),
}));

import {
   DecideConfigValueListAction,
   FieldKey,
   NormalizeObjectName,
   OrganicKeyStateRow,
   ParseObjectName,
   PlanOrganicKeyRetraction,
   ResolveConfigEntity,
   SelectUndeclaredFields,
} from '../Database/config-retraction';
import { ExistingEntityFieldValueRow, ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { configInfo } from '../Config/config';
import { LogWarning, logError } from '../Misc/status_logging';

// ─── Pure planners ──────────────────────────────────────────────────────────────────────────────

describe('object names', () => {
   it('normalizes brackets, quotes and case so the same view compares equal however it was written', () => {
      expect(NormalizeObjectName('[NetSuite].[vwCustomer_bridge]')).toBe('netsuite.vwcustomer_bridge');
      expect(NormalizeObjectName('"netsuite"."vwCustomer_Bridge"')).toBe('netsuite.vwcustomer_bridge');
   });

   it('splits schema and object, and refuses a name with no schema', () => {
      expect(ParseObjectName('[ns].[vwBridge]')).toEqual({ SchemaName: 'ns', ObjectName: 'vwBridge' });
      expect(ParseObjectName('vwBridge')).toBeNull();
   });
});

describe('ResolveConfigEntity', () => {
   const entities = [
      { ID: 'E1', Name: 'Customers', SchemaName: 'ns', BaseTable: 'customer' },
      { ID: 'E2', Name: 'Orders', SchemaName: 'ns', BaseTable: 'transaction' },
   ];

   it('matches schema + table case-insensitively', () => {
      expect(ResolveConfigEntity(entities, 'NS', 'Customer', false)?.ID).toBe('E1');
   });

   it('falls back to the entity name only when asked to, as the organic-key writer does', () => {
      expect(ResolveConfigEntity(entities, 'ns', 'Orders', false)).toBeNull();
      expect(ResolveConfigEntity(entities, 'ns', 'Orders', true)?.ID).toBe('E2');
   });
});

describe('DecideConfigValueListAction', () => {
   const row = (Value: string, Source: string) => ({ Value, Source });

   it('lets a CHECK constraint own the list, whatever else is there', () => {
      expect(DecideConfigValueListAction([row('A', 'Check'), row('B', 'Config')], ['A', 'B'])).toBe('SkipCheck');
   });

   it('writes an empty list and a list the file already owns', () => {
      expect(DecideConfigValueListAction([], ['A'])).toBe('Sync');
      expect(DecideConfigValueListAction([row('A', 'Config'), row('Old', 'Config')], ['A'])).toBe('Sync');
   });

   it('adopts rows of another origin only when they hold exactly the declared values', () => {
      expect(DecideConfigValueListAction([row('B', 'Manual'), row('A', 'Manual')], ['A', 'B'])).toBe('Adopt');
   });

   it('leaves a different hand-entered list alone', () => {
      expect(DecideConfigValueListAction([row('A', 'Manual')], ['A', 'B'])).toBe('SkipManual');
      expect(DecideConfigValueListAction([row('A', 'Manual'), row('X', 'Config')], ['A'])).toBe('SkipManual');
   });
});

describe('SelectUndeclaredFields', () => {
   const fields = [
      { EntityID: 'E1', FieldName: 'subsidiary' },
      { EntityID: 'E1', FieldName: 'entity' },
      { EntityID: 'E9', FieldName: 'owner' },
   ];

   it('returns only fields on listed entities that the file no longer declares, comparing case-insensitively', () => {
      const result = SelectUndeclaredFields(fields, new Set(['e1']), new Set([FieldKey('e1', 'ENTITY')]));
      expect(result).toEqual([{ EntityID: 'E1', FieldName: 'subsidiary' }]);
   });

   it('touches nothing on a table the file does not list, so a truncated file cannot wipe a schema', () => {
      expect(SelectUndeclaredFields(fields, new Set(), new Set())).toEqual([]);
   });
});

function keyRow(overrides: Partial<OrganicKeyStateRow>): OrganicKeyStateRow {
   return {
      KeyID: 'K1',
      KeyName: 'Record Id Match',
      KeySource: 'Config',
      EntityID: 'E1',
      EntityName: 'Customers',
      SchemaName: 'ns',
      BaseTable: 'customer',
      RelatedRowID: 'R1',
      RelatedEntityID: 'E2',
      RelatedEntityName: 'Orders',
      RelatedSchemaName: 'ns',
      RelatedBaseTable: 'transaction',
      TransitiveObjectName: null,
      ...overrides,
   };
}

describe('PlanOrganicKeyRetraction', () => {
   const listed = new Set(['e1']);

   it('removes a Config key the file no longer names, and the bridge view only it used', () => {
      const rows = [keyRow({ TransitiveObjectName: 'ns.vwCustomer_bridge' })];
      const plan = PlanOrganicKeyRetraction({ Before: rows, After: rows, ListedEntityIDs: listed, Declared: [], DeclaredTransitiveObjects: new Set() });
      expect(plan.Keys.map(k => k.KeyName)).toEqual(['Record Id Match']);
      expect(plan.RelatedRows).toEqual([]);
      expect(plan.BridgeObjects).toEqual(['ns.vwCustomer_bridge']);
   });

   it('never removes a Manual key, or a key on a table the file does not list', () => {
      const manual = [keyRow({ KeySource: 'Manual' })];
      const unlisted = [keyRow({ EntityID: 'E7' })];
      for (const rows of [manual, unlisted]) {
         const plan = PlanOrganicKeyRetraction({ Before: rows, After: rows, ListedEntityIDs: listed, Declared: [], DeclaredTransitiveObjects: new Set() });
         expect(plan.Keys).toEqual([]);
      }
   });

   it('removes the old name of a renamed key and keeps the new one', () => {
      const rows = [
         keyRow({ KeyID: 'K-old', KeyName: 'Record Id Match', RelatedRowID: 'R-old' }),
         keyRow({ KeyID: 'K-new', KeyName: 'Customlist Record Id Match', RelatedRowID: 'R-new' }),
      ];
      const plan = PlanOrganicKeyRetraction({
         Before: rows,
         After: rows,
         ListedEntityIDs: listed,
         Declared: [{ EntityID: 'E1', Name: 'customlist record id match', RelatedEntityIDs: new Set(['e2']) }],
         DeclaredTransitiveObjects: new Set(),
      });
      expect(plan.Keys.map(k => k.KeyID)).toEqual(['K-old']);
   });

   it('removes a related entity the file no longer lists under a key it still declares', () => {
      const rows = [keyRow({}), keyRow({ RelatedRowID: 'R2', RelatedEntityID: 'E3', RelatedEntityName: 'Vendors' })];
      const plan = PlanOrganicKeyRetraction({
         Before: rows,
         After: rows,
         ListedEntityIDs: listed,
         Declared: [{ EntityID: 'E1', Name: 'Record Id Match', RelatedEntityIDs: new Set(['e2']) }],
         DeclaredTransitiveObjects: new Set(),
      });
      expect(plan.Keys).toEqual([]);
      expect(plan.RelatedRows.map(r => r.RelatedRowID)).toEqual(['R2']);
   });

   it('leaves the related rows of a key whose related entities did not all resolve this run', () => {
      const rows = [keyRow({ RelatedEntityID: 'E3' })];
      const plan = PlanOrganicKeyRetraction({
         Before: rows,
         After: rows,
         ListedEntityIDs: listed,
         Declared: [{ EntityID: 'E1', Name: 'Record Id Match', RelatedEntityIDs: null }],
         DeclaredTransitiveObjects: new Set(),
      });
      expect(plan.RelatedRows).toEqual([]);
   });

   it('drops the bridge view of a related row that changed from transitive to direct', () => {
      // The config pass updates the (key, related entity) row in place, so only Before still names the view.
      const before = [keyRow({ TransitiveObjectName: '[ns].[vwCustomer_bridge]' })];
      const after = [keyRow({ TransitiveObjectName: null })];
      const plan = PlanOrganicKeyRetraction({
         Before: before,
         After: after,
         ListedEntityIDs: listed,
         Declared: [{ EntityID: 'E1', Name: 'Record Id Match', RelatedEntityIDs: new Set(['e2']) }],
         DeclaredTransitiveObjects: new Set(),
      });
      expect(plan.Keys).toEqual([]);
      expect(plan.RelatedRows).toEqual([]);
      expect(plan.BridgeObjects).toEqual(['[ns].[vwCustomer_bridge]']);
   });

   it('keeps a bridge view another row still uses, even a Manual key on an unlisted table', () => {
      const rows = [
         keyRow({ TransitiveObjectName: 'ns.vwShared' }),
         keyRow({ KeyID: 'K9', KeySource: 'Manual', EntityID: 'E9', RelatedRowID: 'R9', TransitiveObjectName: 'NS.VWSHARED' }),
      ];
      const plan = PlanOrganicKeyRetraction({ Before: rows, After: rows, ListedEntityIDs: listed, Declared: [], DeclaredTransitiveObjects: new Set() });
      expect(plan.Keys.map(k => k.KeyID)).toEqual(['K1']);
      expect(plan.BridgeObjects).toEqual([]);
   });

   it('keeps a bridge view the file still declares', () => {
      const rows = [keyRow({ TransitiveObjectName: 'ns.vwBridge' })];
      const plan = PlanOrganicKeyRetraction({
         Before: rows,
         After: rows,
         ListedEntityIDs: listed,
         Declared: [],
         DeclaredTransitiveObjects: new Set([NormalizeObjectName('ns.vwBridge')]),
      });
      expect(plan.BridgeObjects).toEqual([]);
   });

   it('considers the old view of a key the config pass claimed this run (Manual before, Config after)', () => {
      const before = [keyRow({ KeySource: 'Manual', TransitiveObjectName: 'ns.vwOld' })];
      const after = [keyRow({ KeySource: 'Config', TransitiveObjectName: 'ns.vwNew' })];
      const plan = PlanOrganicKeyRetraction({
         Before: before,
         After: after,
         ListedEntityIDs: listed,
         Declared: [{ EntityID: 'E1', Name: 'Record Id Match', RelatedEntityIDs: new Set(['e2']) }],
         DeclaredTransitiveObjects: new Set([NormalizeObjectName('ns.vwNew')]),
      });
      expect(plan.BridgeObjects).toEqual(['ns.vwOld']);
   });
});

// ─── ManageMetadataBase ─────────────────────────────────────────────────────────────────────────

type LoggedCall = Parameters<typeof SQLLogging.LogSQLAndExecute>;

class TestableRetraction extends ManageMetadataBase {
   constructor(private readonly testProvider: CodeGenDatabaseProvider) {
      super();
   }
   protected get dbProvider(): CodeGenDatabaseProvider {
      return this.testProvider;
   }
   protected async refreshMetadataAfterRetraction(): Promise<void> {
      // no metadata provider in a unit test
   }
   public Sync(pool: CodeGenConnection, fieldID: string, values: string[], rows: ExistingEntityFieldValueRow[], source: 'Check' | 'Config'): Promise<boolean> {
      return this.syncEntityFieldValues(pool, fieldID, values, rows, source);
   }
   public Retract(pool: CodeGenConnection, before: OrganicKeyStateRow[] | null): Promise<boolean> {
      return this.retractRemovedConfigDeclarations(pool, before);
   }
   public OrganicKeys(pool: CodeGenConnection): Promise<{ success: boolean }> {
      return this.processOrganicKeyConfig(pool);
   }
}

function connection(answer: (sql: string) => CodeGenQueryResult['recordset']): CodeGenConnection {
   const run = async (sql: string): Promise<CodeGenQueryResult> => ({ recordset: answer(sql) });
   return {
      Dialect: new SQLServerCodeGenProvider().Dialect,
      query: run,
      queryWithParams: run,
      executeStoredProcedure: async () => ({ recordset: [] }),
      beginTransaction: async () => ({
         query: run,
         queryWithParams: run,
         commit: async () => undefined,
         rollback: async () => undefined,
      }) as unknown as Awaited<ReturnType<CodeGenConnection['beginTransaction']>>,
   };
}

describe('ManageMetadataBase — Source stamping', () => {
   let logged: LoggedCall[];

   beforeEach(() => {
      logged = [];
      vi.spyOn(SQLLogging, 'LogSQLAndExecute').mockImplementation(async (...args: LoggedCall) => {
         logged.push(args);
         return [];
      });
   });

   afterEach(() => {
      vi.restoreAllMocks();
   });

   it('inserts new values with the writer as Source', async () => {
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      await mm.Sync(connection(() => []), 'F1', ['Active'], [], 'Check');
      const insert = logged.map(c => c[1]).find(q => q.includes('INSERT INTO'));
      expect(insert).toMatch(/\[Source\]/);
      expect(insert).toContain(`'Active', 'Active', 'Check'`);
   });

   it('claims a kept row recorded under another origin, and writes nothing when the row is already right', async () => {
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      const rows: ExistingEntityFieldValueRow[] = [
         { ID: 'V1', EntityFieldID: 'F1', Value: 'A', Sequence: 1, Source: 'Manual' },
         { ID: 'V2', EntityFieldID: 'F1', Value: 'B', Sequence: 2, Source: 'Config' },
      ];
      await mm.Sync(connection(() => []), 'F1', ['A', 'B'], rows, 'Config');
      expect(logged).toHaveLength(1);
      expect(logged[0][1]).toBe(`UPDATE [__mj].[EntityFieldValue] SET [Source]='Config' WHERE ID='V1'`);
   });

   it('stamps organic keys written from the file as Config, on insert and on update', async () => {
      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue({
         ns: [{ TableName: 'customer', OrganicKeys: [{ Name: 'Email Match', MatchFieldNames: ['email'], RelatedEntities: [{ SchemaName: 'ns', TableName: 'contact', RelatedFieldNames: ['email'] }] }] }],
      });
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      let keyExists = false;
      const answer = (sql: string) => {
         if (sql.includes('vwEntities')) return [{ ID: 'E1', Name: 'Customers' }];
         if (sql.includes('EntityOrganicKeyRelatedEntity')) return [];
         if (sql.includes('EntityOrganicKey')) return keyExists ? [{ ID: 'K1' }] : [];
         return [];
      };
      await mm.OrganicKeys(connection(answer));
      expect(logged.map(c => c[1]).find(q => q.includes('INSERT INTO [__mj].[EntityOrganicKey]'))).toMatch(/Status, Source\)[\s\S]*'Active', 'Config'\)/);

      logged = [];
      keyExists = true;
      await mm.OrganicKeys(connection(answer));
      expect(logged.map(c => c[1]).find(q => q.startsWith('UPDATE [__mj].[EntityOrganicKey]'))).toMatch(/Source = 'Config'/);
   });
});

describe('ManageMetadataBase — retractRemovedConfigDeclarations', () => {
   let logged: LoggedCall[];
   const original = configInfo.retractRemovedSoftKeys;

   // The file still lists ns.customer and declares one soft FK (entity) and one value list (status) on it.
   const config = {
      ns: [
         {
            TableName: 'customer',
            ForeignKeys: [{ FieldName: 'entity', RelatedTable: 'entity', RelatedField: 'id' }],
            Fields: [{ FieldName: 'status', PossibleValues: ['Open'] }],
         },
      ],
   };

   const entities = [
      { ID: 'E1', Name: 'Customers', SchemaName: 'ns', BaseTable: 'customer', BaseView: 'vwCustomers' },
      { ID: 'E2', Name: 'Subsidiaries', SchemaName: 'ns', BaseTable: 'subsidiary', BaseView: 'vwSubsidiaries' },
      { ID: 'E7', Name: 'Vendors', SchemaName: 'ns', BaseTable: 'vendor', BaseView: 'vwVendors' },
   ];
   const softFKs = [
      { EntityID: 'E1', EntityName: 'Customers', SchemaName: 'ns', BaseTable: 'customer', FieldName: 'entity', RelatedEntityName: 'Entities', RelatedSchemaName: 'ns', RelatedBaseTable: 'entity' },
      { EntityID: 'E1', EntityName: 'Customers', SchemaName: 'ns', BaseTable: 'customer', FieldName: 'subsidiary', RelatedEntityName: 'Subsidiaries', RelatedSchemaName: 'ns', RelatedBaseTable: 'subsidiary' },
      // not listed in the file: never touched
      { EntityID: 'E7', EntityName: 'Vendors', SchemaName: 'ns', BaseTable: 'vendor', FieldName: 'subsidiary', RelatedEntityName: 'Subsidiaries', RelatedSchemaName: 'ns', RelatedBaseTable: 'subsidiary' },
   ];
   const valueLists = [
      { EntityID: 'E1', EntityName: 'Customers', SchemaName: 'ns', BaseTable: 'customer', FieldName: 'status', ConfigValueCount: 1 },
      { EntityID: 'E1', EntityName: 'Customers', SchemaName: 'ns', BaseTable: 'customer', FieldName: 'tier', ConfigValueCount: 2 },
   ];
   const organicKeys = [keyRow({ KeyName: 'Record Id Match', TransitiveObjectName: 'ns.vwCustomer_bridge' })];

   function answer(sql: string): CodeGenQueryResult['recordset'] {
      if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [{ ColExists: 0 }];
      if (sql.includes('INFORMATION_SCHEMA.VIEWS')) return [{ Exists: 1 }];
      if (sql.includes('[EntityOrganicKey] k')) return organicKeys;
      if (sql.includes('[EntityFieldValue] efv')) return valueLists;
      if (sql.includes('[IsSoftForeignKey]')) return softFKs;
      if (sql.includes('[BaseView]')) return entities;
      return [];
   }

   beforeEach(() => {
      logged = [];
      vi.spyOn(SQLLogging, 'LogSQLAndExecute').mockImplementation(async (...args: LoggedCall) => {
         logged.push(args);
         return [];
      });
      vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);
      vi.mocked(LogWarning).mockClear();
      vi.mocked(logError).mockClear();
   });

   afterEach(() => {
      configInfo.retractRemovedSoftKeys = original;
      vi.restoreAllMocks();
   });

   it('by default only reports what it would remove, and writes nothing', async () => {
      configInfo.retractRemovedSoftKeys = false;
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      expect(await mm.Retract(connection(answer), organicKeys)).toBe(true);
      expect(logged).toEqual([]);
      expect(LogWarning).toHaveBeenCalledWith(expect.stringContaining('1 soft FK(s), 1 value list(s), 1 organic key(s), 0 organic-key related entit(ies) and 1 bridge view(s)'));
      expect(LogWarning).toHaveBeenCalledWith(expect.stringContaining('retractRemovedSoftKeys: true'));
   });

   it('removes the undeclared soft FK, value list, organic key and bridge view when turned on', async () => {
      configInfo.retractRemovedSoftKeys = true;
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      expect(await mm.Retract(connection(answer), organicKeys)).toBe(true);
      expect(logError).not.toHaveBeenCalled();
      const queries = logged.map(c => c[1]);

      const softFK = queries.find(q => q.includes('[IsSoftForeignKey] = 0'));
      expect(softFK).toContain(`[Name] = 'subsidiary'`);
      expect(softFK).toContain(`DELETE FROM [__mj].[EntityRelationship]`);
      expect(softFK).toContain(`[AutoUpdateFromSchema] = 1`);
      // Identified by schema + table, so the logged migration applies to any database.
      expect(softFK).toContain(`BaseTable = 'customer' AND SchemaName = 'ns'`);
      expect(queries.some(q => q.includes(`[Name] = 'entity'`))).toBe(false);
      expect(queries.some(q => q.includes(`'vendor'`))).toBe(false);

      const valueList = queries.find(q => q.includes('DELETE FROM [__mj].[EntityFieldValue]'));
      expect(valueList).toContain(`[Name] = 'tier'`);
      expect(valueList).toContain(`[Source] = 'Config'`);
      expect(valueList).toContain(`[ValueListType] = 'None'`);
      expect(queries.some(q => q.includes(`[Name] = 'status'`))).toBe(false);

      const key = queries.find(q => q.includes('DELETE FROM [__mj].[EntityOrganicKey]'));
      expect(key).toContain(`[Name] = 'Record Id Match' AND [Source] = 'Config'`);
      expect(key!.indexOf('EntityOrganicKeyRelatedEntity')).toBeLessThan(key!.indexOf('DELETE FROM [__mj].[EntityOrganicKey]\n'));

      const drop = queries.findIndex(q => q.includes('DROP VIEW [ns].[vwCustomer_bridge]'));
      expect(drop).toBe(queries.length - 1);
   });

   it('does nothing when no additionalSchemaInfo is loaded', async () => {
      configInfo.retractRemovedSoftKeys = true;
      vi.mocked(ManageMetadataBase.GetSoftPKFKConfig).mockReturnValue(null);
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      expect(await mm.Retract(connection(answer), organicKeys)).toBe(true);
      expect(logged).toEqual([]);
      expect(LogWarning).not.toHaveBeenCalled();
   });

   it('leaves a no-longer-used bridge object in place when it backs an entity', async () => {
      configInfo.retractRemovedSoftKeys = true;
      const mm = new TestableRetraction(new SQLServerCodeGenProvider());
      const keyOnEntityView = [keyRow({ TransitiveObjectName: 'ns.vwVendors' })];
      const backed = (sql: string) => (sql.includes('[EntityOrganicKey] k') ? keyOnEntityView : answer(sql));
      expect(await mm.Retract(connection(backed), keyOnEntityView)).toBe(true);
      expect(logged.some(c => c[1].includes('DROP VIEW'))).toBe(false);
   });
});
