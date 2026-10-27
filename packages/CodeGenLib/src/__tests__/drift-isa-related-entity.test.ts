/**
 * #4569 — an IS-A inherited field must carry its parent field's foreign-key relationship.
 *
 * The inherited column reaches the child through its view, so there is no FK constraint on the
 * child table to derive RelatedEntityID from. Without it the generated form renders a plain text
 * input that writes '' into a uniqueidentifier column. The parent-field sync now copies
 * RelatedEntityID, RelatedEntityFieldName and RelatedEntityDisplayType from the parent field,
 * forces IncludeRelatedEntityNameFieldInBaseView off, leaves RelatedEntityNameFieldMap NULL, and
 * does not overwrite a row pinned with AutoUpdateRelatedEntityInfo = 0.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { EntityInfo } from '@memberjunction/core';

const CHILD_ID = '11111111-1111-1111-1111-111111111111';
const ORG_TYPE_ENTITY_ID = '99999999-9999-9999-9999-999999999999';

type ParentFieldStub = {
   Name: string; Type: string; Length: number; Precision: number; Scale: number; AllowsNull: boolean;
   RelatedEntityID: string | null; RelatedEntityFieldName: string | null; RelatedEntityDisplayType: 'Search' | 'Dropdown';
};

const FK_PARENT_FIELD: ParentFieldStub = {
   Name: 'OrganizationTypeID', Type: 'uniqueidentifier', Length: 16, Precision: 0, Scale: 0, AllowsNull: true,
   RelatedEntityID: ORG_TYPE_ENTITY_ID, RelatedEntityFieldName: 'ID', RelatedEntityDisplayType: 'Dropdown',
};

function makeChild(parentField: ParentFieldStub): EntityInfo {
   return { ID: CHILD_ID, Name: 'Sales Accounts', Fields: [], AllParentFields: [parentField] } as unknown as EntityInfo;
}

class ParentFieldSync extends ManageMetadataBase {
   public run(pool: CodeGenConnection, child: EntityInfo) {
      return this.manageSingleEntityParentFields(pool, child);
   }
}

function createMockConnection(existingRows: Record<string, unknown>[], executed: string[]): CodeGenConnection {
   const run = async (sql: string): Promise<CodeGenQueryResult> => {
      executed.push(sql);
      const isExistsProbe = sql.includes('SELECT') && sql.includes('AutoUpdateRelatedEntityInfo') && sql.includes('@FieldName');
      const isSequenceProbe = sql.includes('MAX') && sql.includes('Sequence');
      const rows = isExistsProbe ? existingRows : isSequenceProbe ? [{ MaxSeq: 0, Hit: 0 }] : [];
      return { recordset: rows } as unknown as CodeGenQueryResult;
   };
   return {
      query: run,
      queryWithParams: run,
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   } as unknown as CodeGenConnection;
}

/** An existing inherited row that matches the parent field in every column the sync compares. */
const IN_SYNC_ROW = {
   ID: 'F0000000-0000-0000-0000-000000000001',
   IsVirtual: true, Type: 'uniqueidentifier', Length: 16, Precision: 0, Scale: 0, AllowsNull: true, AllowUpdateAPI: true,
   RelatedEntityID: ORG_TYPE_ENTITY_ID, RelatedEntityFieldName: 'ID', RelatedEntityDisplayType: 'Dropdown',
   IncludeRelatedEntityNameFieldInBaseView: false, AutoUpdateRelatedEntityInfo: true,
};

const flat = (sql: string) => sql.replace(/\s+/g, ' ');
const updates = (executed: string[]) => executed.filter(s => s.trim().startsWith('UPDATE') && s.includes('[EntityField]')).map(flat);

describe('IS-A inherited fields copy the parent relationship (#4569)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   afterEach(() => {
      vi.restoreAllMocks();
      SQLLogging.resetForTests();
      ManageMetadataBase.clearFieldTracking();
   });

   it('a new inherited field is inserted with the parent relationship and no name-field join', async () => {
      const executed: string[] = [];
      const result = await new ParentFieldSync().run(createMockConnection([], executed), makeChild(FK_PARENT_FIELD));

      expect(result).toEqual({ success: true, updated: true });
      const insert = flat(executed.find(s => s.includes('INSERT INTO'))!);
      expect(insert).toContain('[RelatedEntityID], [RelatedEntityFieldName], [RelatedEntityDisplayType], [IncludeRelatedEntityNameFieldInBaseView]');
      expect(insert).toContain(`'${ORG_TYPE_ENTITY_ID}', 'ID', 'Dropdown', 0`);
      expect(insert).not.toContain('RelatedEntityNameFieldMap');
   });

   it('an existing row with a NULL relationship is updated from the parent', async () => {
      const executed: string[] = [];
      const nulled = { ...IN_SYNC_ROW, RelatedEntityID: null, RelatedEntityFieldName: null, RelatedEntityDisplayType: 'Search' };

      const result = await new ParentFieldSync().run(createMockConnection([nulled], executed), makeChild(FK_PARENT_FIELD));

      expect(result.updated).toBe(true);
      const [update] = updates(executed);
      expect(update).toContain(`[RelatedEntityID]='${ORG_TYPE_ENTITY_ID}'`);
      expect(update).toContain(`[RelatedEntityFieldName]='ID'`);
      expect(update).toContain(`[RelatedEntityDisplayType]='Dropdown'`);
      expect(update).toContain('[IncludeRelatedEntityNameFieldInBaseView]=0');
      expect(update).not.toContain('RelatedEntityNameFieldMap');
   });

   it('a row already in sync is left alone (UUID case does not count as drift)', async () => {
      const executed: string[] = [];
      const lowerCased = { ...IN_SYNC_ROW, RelatedEntityID: ORG_TYPE_ENTITY_ID.toLowerCase() };

      const result = await new ParentFieldSync().run(createMockConnection([lowerCased], executed), makeChild(FK_PARENT_FIELD));

      expect(result).toEqual({ success: true, updated: false });
      expect(updates(executed)).toEqual([]);
   });

   it('a row with the name-field join on is updated to turn it off', async () => {
      const executed: string[] = [];
      const joined = { ...IN_SYNC_ROW, IncludeRelatedEntityNameFieldInBaseView: 1 };

      await new ParentFieldSync().run(createMockConnection([joined], executed), makeChild(FK_PARENT_FIELD));

      expect(updates(executed)[0]).toContain('[IncludeRelatedEntityNameFieldInBaseView]=0');
   });

   it('a pinned row (AutoUpdateRelatedEntityInfo = 0) keeps its hand-set relationship', async () => {
      const executed: string[] = [];
      const pinned = { ...IN_SYNC_ROW, RelatedEntityID: '88888888-8888-8888-8888-888888888888', AutoUpdateRelatedEntityInfo: false };

      const result = await new ParentFieldSync().run(createMockConnection([pinned], executed), makeChild(FK_PARENT_FIELD));

      expect(result).toEqual({ success: true, updated: false });
      expect(updates(executed)).toEqual([]);
   });

   it('a pinned row that drifts elsewhere is updated without touching its relationship', async () => {
      const executed: string[] = [];
      const pinned = { ...IN_SYNC_ROW, RelatedEntityID: '88888888-8888-8888-8888-888888888888', AutoUpdateRelatedEntityInfo: 0, AllowsNull: false };

      await new ParentFieldSync().run(createMockConnection([pinned], executed), makeChild(FK_PARENT_FIELD));

      const [update] = updates(executed);
      expect(update).toContain('[AllowsNull]=1');
      expect(update).not.toContain('[RelatedEntityID]=');
      expect(update).not.toContain('[RelatedEntityFieldName]=');
   });

   it('a parent field with no relationship writes NULL and the default display type', async () => {
      const executed: string[] = [];
      const plain: ParentFieldStub = { ...FK_PARENT_FIELD, Name: 'Notes', Type: 'nvarchar', Length: -1, RelatedEntityID: null, RelatedEntityFieldName: 'ID' };

      await new ParentFieldSync().run(createMockConnection([], executed), makeChild(plain));

      const insert = flat(executed.find(s => s.includes('INSERT INTO'))!);
      expect(insert).toContain(`NULL, NULL, 'Dropdown', 0`);
   });
});
