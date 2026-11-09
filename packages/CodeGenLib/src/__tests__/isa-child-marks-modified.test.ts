/**
 * Regression test for #5961 — the IS-A parent-field sync must mark a child entity MODIFIED when it
 * inserts, updates or removes one of the child's virtual EntityField rows.
 *
 * Why it matters: a full CodeGen run emits TypeScript only for schemas that hold an entity on
 * newEntityList / modifiedEntityList (fileEmit.dirtySchemaOnly, the default). The IS-A step writes
 * EntityField rows directly, so before this fix nothing marked the child; the run ended "complete"
 * with the SQL and metadata written but the entity subclass, zod schema and GraphQL types stale
 * until an operator happened to run `mj codegen --skipdb`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { Metadata, EntityInfo } from '@memberjunction/core';

type ParentFieldStub = { Name: string; Type: string; Length: number; Precision: number; Scale: number; AllowsNull: boolean };
type ChildEntityStub = { ID: string; Name: string; IsChildType: boolean; Fields: unknown[]; AllParentFields: ParentFieldStub[] };

const PARENT_FIELD: ParentFieldStub = { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', Length: 16, Precision: 0, Scale: 0, AllowsNull: true };

function makeChild(name: string, id: string): ChildEntityStub {
   return { ID: id, Name: name, IsChildType: true, Fields: [], AllParentFields: [PARENT_FIELD] };
}

/** Runs the real manageSingleEntityParentFields against a scripted connection. */
class RealSyncManageMetadata extends ManageMetadataBase {
   public callManageParentEntityFields(pool: CodeGenConnection) {
      return this.manageParentEntityFields(pool);
   }
}

/** Replaces the per-child sync with a scripted outcome so the aggregation can be tested alone. */
class ScriptedSyncManageMetadata extends ManageMetadataBase {
   constructor(private readonly outcomes: Record<string, { success: boolean; updated: boolean } | Error>) { super(); }

   public callManageParentEntityFields(pool: CodeGenConnection) {
      return this.manageParentEntityFields(pool);
   }

   protected override async manageSingleEntityParentFields(_pool: CodeGenConnection, childEntity: EntityInfo) {
      const outcome = this.outcomes[childEntity.Name];
      if (outcome instanceof Error) throw outcome;
      return outcome;
   }
}

function createMockConnection(queryHandler: (sql: string) => Record<string, unknown>[]): CodeGenConnection {
   const run = async (sql: string): Promise<CodeGenQueryResult> =>
      ({ recordset: queryHandler(sql) } as unknown as CodeGenQueryResult);
   return {
      query: run,
      queryWithParams: run,
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   } as unknown as CodeGenConnection;
}

function stubEntities(children: ChildEntityStub[]) {
   vi.spyOn(Metadata.prototype, 'Entities', 'get').mockReturnValue(children as unknown as EntityInfo[]);
}

/** The scripted EntityField row that makes the sync a no-op for PARENT_FIELD. */
const MATCHING_ROW = {
   ID: 'F0000000-0000-0000-0000-000000000001',
   IsVirtual: true,
   Type: PARENT_FIELD.Type,
   Length: PARENT_FIELD.Length,
   Precision: PARENT_FIELD.Precision,
   Scale: PARENT_FIELD.Scale,
   AllowsNull: PARENT_FIELD.AllowsNull,
   AllowUpdateAPI: true,
};

describe('IS-A parent-field sync marks the child entity modified (#5961)', () => {
   beforeEach(() => {
      SQLLogging.suppressOutputForTests();
      ManageMetadataBase.clearFieldTracking();
      ManageMetadataBase.ModifiedEntityList = [];
   });

   afterEach(() => {
      vi.restoreAllMocks();
      SQLLogging.resetForTests();
      ManageMetadataBase.clearFieldTracking();
      ManageMetadataBase.ModifiedEntityList = [];
   });

   describe('through the real per-child sync', () => {
      it('inserting a missing parent field marks the child modified and reports anyUpdates', async () => {
         const child = makeChild('BC: People', '33333333-3333-3333-3333-333333333333');
         stubEntities([child]);
         const pool = createMockConnection((sql) => (sql.includes('MAX') && sql.includes('Sequence') ? [{ MaxSeq: 0, Hit: 0 }] : []));

         const result = await new RealSyncManageMetadata().callManageParentEntityFields(pool);

         expect(result).toEqual({ success: true, anyUpdates: true });
         expect(ManageMetadataBase.ModifiedEntityList).toEqual(['BC: People']);
         expect(ManageMetadataBase.isFieldNew(child.ID, PARENT_FIELD.Name)).toBe(true);
      });

      it('a child whose parent fields are already in sync is NOT marked (keeps the no-change run idempotent)', async () => {
         const child = makeChild('BC: People', '33333333-3333-3333-3333-333333333333');
         stubEntities([child]);
         const pool = createMockConnection((sql) => (sql.includes('IsVirtual') && sql.includes('FROM') ? [MATCHING_ROW] : []));

         const result = await new RealSyncManageMetadata().callManageParentEntityFields(pool);

         expect(result).toEqual({ success: true, anyUpdates: false });
         expect(ManageMetadataBase.ModifiedEntityList).toEqual([]);
      });

      it('updating an existing but drifted parent field row marks the child modified', async () => {
         const child = makeChild('BC: People', '33333333-3333-3333-3333-333333333333');
         stubEntities([child]);
         const driftedRow = { ...MATCHING_ROW, IsVirtual: false };
         const pool = createMockConnection((sql) => (sql.includes('IsVirtual') && sql.includes('FROM') ? [driftedRow] : []));

         const result = await new RealSyncManageMetadata().callManageParentEntityFields(pool);

         expect(result).toEqual({ success: true, anyUpdates: true });
         expect(ManageMetadataBase.ModifiedEntityList).toEqual(['BC: People']);
      });
   });

   describe('aggregation across children', () => {
      const children = [
         makeChild('Child Updated A', 'A0000000-0000-0000-0000-000000000000'),
         makeChild('Child Unchanged', 'B0000000-0000-0000-0000-000000000000'),
         makeChild('Child Updated B', 'C0000000-0000-0000-0000-000000000000'),
         makeChild('Child Failed', 'D0000000-0000-0000-0000-000000000000'),
         makeChild('Child Threw', 'E0000000-0000-0000-0000-000000000000'),
      ];

      it('marks exactly the children that reported updated=true, keeps going past failures', async () => {
         stubEntities(children);
         const mm = new ScriptedSyncManageMetadata({
            'Child Updated A': { success: true, updated: true },
            'Child Unchanged': { success: true, updated: false },
            'Child Updated B': { success: true, updated: true },
            'Child Failed': { success: false, updated: false },
            'Child Threw': new Error('boom'),
         });

         const result = await mm.callManageParentEntityFields(createMockConnection(() => []));

         expect(result).toEqual({ success: false, anyUpdates: true });
         expect(ManageMetadataBase.ModifiedEntityList).toEqual(['Child Updated A', 'Child Updated B']);
      });

      it('does not duplicate a child that an earlier step already marked modified', async () => {
         stubEntities([children[0]]);
         ManageMetadataBase.ModifiedEntityList = ['Child Updated A', 'Some Other Entity'];
         const mm = new ScriptedSyncManageMetadata({ 'Child Updated A': { success: true, updated: true } });

         await mm.callManageParentEntityFields(createMockConnection(() => []));

         expect(ManageMetadataBase.ModifiedEntityList).toEqual(['Child Updated A', 'Some Other Entity']);
      });

      it('leaves the list untouched when there are no IS-A children', async () => {
         stubEntities([]);
         const mm = new ScriptedSyncManageMetadata({});

         const result = await mm.callManageParentEntityFields(createMockConnection(() => []));

         expect(result).toEqual({ success: true, anyUpdates: false });
         expect(ManageMetadataBase.ModifiedEntityList).toEqual([]);
      });
   });
});
