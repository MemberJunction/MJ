/**
 * Regression tests for #4879 — the IS-A parent-field sync must honour the compiled schema scope
 * and must emit a guarded INSERT.
 *
 * In an Open App publisher repo scoped with `includeSchemas`, the sync used to process every IS-A
 * child in the database, so a sibling app's child got an unguarded `INSERT INTO __mj.EntityField`
 * written into THIS app's migration capture. Replayed on a host where the row already existed (a
 * second app captured on the same chain, or the owning app shipping the field itself) it failed on
 * UQ_EntityField_EntityID_Name and stopped the install.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { Metadata, EntityInfo } from '@memberjunction/core';

type ParentFieldStub = { Name: string; Type: string; Length: number; Precision: number; Scale: number; AllowsNull: boolean };
type ChildEntityStub = { ID: string; Name: string; SchemaName: string; IsChildType: boolean; Fields: unknown[]; AllParentFields: ParentFieldStub[] };

const PARENT_FIELD: ParentFieldStub = { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', Length: 16, Precision: 0, Scale: 0, AllowsNull: true };

function makeChild(name: string, schema: string, id: string): ChildEntityStub {
   return { ID: id, Name: name, SchemaName: schema, IsChildType: true, Fields: [], AllParentFields: [PARENT_FIELD] };
}

/** Records which children the per-child sync was asked to process. */
class RecordingManageMetadata extends ManageMetadataBase {
   public readonly processed: string[] = [];

   public callManageParentEntityFields(pool: CodeGenConnection, excludeSchemas?: string[]) {
      return excludeSchemas === undefined
         ? this.manageParentEntityFields(pool)
         : this.manageParentEntityFields(pool, excludeSchemas);
   }

   public callIsSchemaExcluded(schemaName: string | null | undefined, excludeSchemas: string[]) {
      return this.isSchemaExcluded(schemaName, excludeSchemas);
   }

   protected override async manageSingleEntityParentFields(_pool: CodeGenConnection, childEntity: EntityInfo) {
      this.processed.push(childEntity.Name);
      return { success: true, updated: false };
   }
}

/** Runs the real per-child sync so the emitted SQL can be inspected. */
class RealSyncManageMetadata extends ManageMetadataBase {
   public callManageParentEntityFields(pool: CodeGenConnection, excludeSchemas: string[]) {
      return this.manageParentEntityFields(pool, excludeSchemas);
   }
}

function createMockConnection(queryHandler: (sql: string) => Record<string, unknown>[], executed: string[] = []): CodeGenConnection {
   const run = async (sql: string): Promise<CodeGenQueryResult> => {
      executed.push(sql);
      return { recordset: queryHandler(sql) } as unknown as CodeGenQueryResult;
   };
   return {
      query: run,
      queryWithParams: run,
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   } as unknown as CodeGenConnection;
}

function stubEntities(children: ChildEntityStub[]) {
   vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(children as unknown as EntityInfo[]);
}

const BC_PEOPLE = makeChild('BC: People', '__BCSaaS', '11111111-1111-1111-1111-111111111111');
const SALES_CONTACTS = makeChild('MJ_BizApps_Sales: Sales Contacts', '__mj_BizAppsSales', '22222222-2222-2222-2222-222222222222');
const MARKETING_LEADS = makeChild('MJ_BizApps_Marketing: Leads', '__mj_BizAppsMarketing', '33333333-3333-3333-3333-333333333333');

describe('IS-A parent-field sync honours the compiled schema scope (#4879)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   afterEach(() => {
      vi.restoreAllMocks();
      SQLLogging.resetForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   it('skips children whose schema is on the exclude list and processes the rest', async () => {
      stubEntities([BC_PEOPLE, SALES_CONTACTS, MARKETING_LEADS]);
      const mm = new RecordingManageMetadata();

      const result = await mm.callManageParentEntityFields(createMockConnection(() => []), ['sys', 'dbo', '__BCSaaS', '__mj_BizAppsSales']);

      expect(result).toEqual({ success: true, anyUpdates: false });
      expect(mm.processed).toEqual(['MJ_BizApps_Marketing: Leads']);
   });

   it('compares schema names case-insensitively (SQL Server resolves them that way, PostgreSQL folds them)', async () => {
      stubEntities([BC_PEOPLE, SALES_CONTACTS]);
      const mm = new RecordingManageMetadata();

      await mm.callManageParentEntityFields(createMockConnection(() => []), ['__MJ_BIZAPPSSALES']);

      expect(mm.processed).toEqual(['BC: People']);
   });

   it('processes every child when no exclude list is given (classic single-repo behaviour)', async () => {
      stubEntities([BC_PEOPLE, SALES_CONTACTS, MARKETING_LEADS]);
      const mm = new RecordingManageMetadata();

      await mm.callManageParentEntityFields(createMockConnection(() => []));

      expect(mm.processed).toEqual(['BC: People', 'MJ_BizApps_Sales: Sales Contacts', 'MJ_BizApps_Marketing: Leads']);
   });

   it('reports success with nothing to do when every child is out of scope', async () => {
      stubEntities([SALES_CONTACTS, MARKETING_LEADS]);
      const mm = new RecordingManageMetadata();

      const result = await mm.callManageParentEntityFields(createMockConnection(() => []), ['__mj_BizAppsSales', '__mj_BizAppsMarketing']);

      expect(result).toEqual({ success: true, anyUpdates: false });
      expect(mm.processed).toEqual([]);
   });

   it('isSchemaExcluded: null, empty and whitespace-only inputs are never excluded; matches trim + case', () => {
      const mm = new RecordingManageMetadata();
      expect(mm.callIsSchemaExcluded(null, ['__BCSaaS'])).toBe(false);
      expect(mm.callIsSchemaExcluded(undefined, ['__BCSaaS'])).toBe(false);
      expect(mm.callIsSchemaExcluded('__BCSaaS', [])).toBe(false);
      expect(mm.callIsSchemaExcluded(' __bcsaas ', ['__BCSaaS'])).toBe(true);
      expect(mm.callIsSchemaExcluded('__BCSaaS', [' __BCSAAS'])).toBe(true);
      expect(mm.callIsSchemaExcluded('__BCSaaS2', ['__BCSaaS'])).toBe(false);
   });
});

describe('IS-A parent-field INSERT is guarded so a replayed capture is idempotent (#4879)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   afterEach(() => {
      vi.restoreAllMocks();
      SQLLogging.resetForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   it('wraps the EntityField INSERT in IF NOT EXISTS on the row ID or the (EntityID, Name) key', async () => {
      stubEntities([BC_PEOPLE]);
      const executed: string[] = [];
      const pool = createMockConnection((sql) => (sql.includes('MAX') && sql.includes('Sequence') ? [{ MaxSeq: 0, Hit: 0 }] : []), executed);

      const result = await new RealSyncManageMetadata().callManageParentEntityFields(pool, []);

      expect(result).toEqual({ success: true, anyUpdates: true });
      const insert = executed.find(s => s.includes('INSERT INTO') && s.includes('SeniorityLevelID'));
      expect(insert).toBeDefined();
      const flat = insert!.replace(/\s+/g, ' ').trim();
      expect(flat).toMatch(
         /^IF NOT EXISTS \(SELECT 1 FROM \[__mj\]\.\[EntityField\] WHERE \[ID\] = '[0-9A-Fa-f-]{36}' OR \(\[EntityID\] = '11111111-1111-1111-1111-111111111111' AND \[Name\] = 'SeniorityLevelID'\)\) BEGIN INSERT INTO \[__mj\]\.\[EntityField\] /
      );
      expect(flat.endsWith(' END')).toBe(true);
      // The guarded row ID is the one the INSERT writes, so the ID arm of the check is meaningful.
      const guardedID = /\[ID\] = '([0-9A-Fa-f-]{36})'/.exec(flat)![1];
      expect(flat).toContain(`VALUES ( '${guardedID}', '11111111-1111-1111-1111-111111111111', 'SeniorityLevelID'`);
   });

   it('does not guard (or emit) anything when the parent field already exists on the child', async () => {
      stubEntities([BC_PEOPLE]);
      const executed: string[] = [];
      const existing = { ID: 'F0000000-0000-0000-0000-000000000001', IsVirtual: true, Type: PARENT_FIELD.Type, Length: PARENT_FIELD.Length, Precision: PARENT_FIELD.Precision, Scale: PARENT_FIELD.Scale, AllowsNull: PARENT_FIELD.AllowsNull, AllowUpdateAPI: true };
      const pool = createMockConnection((sql) => (sql.includes('IsVirtual') && sql.includes('FROM') ? [existing] : []), executed);

      const result = await new RealSyncManageMetadata().callManageParentEntityFields(pool, []);

      expect(result).toEqual({ success: true, anyUpdates: false });
      expect(executed.some(s => s.includes('INSERT INTO'))).toBe(false);
   });
});
