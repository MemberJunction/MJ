/**
 * Relationship metadata in manage-metadata.ts.
 *   - #4053: the EntityRelationship INSERT guard is keyed on the natural key (parent, child, join
 *     field) as well as the freshly minted id, so the captured SQL is safe to replay elsewhere.
 *   - #2071 / #3384: FindStaleOneToManyRelationships only picks rows whose join field no longer
 *     backs them, never touches out-of-scope or operator-owned rows, and compares ids and names
 *     tolerantly; CleanupStaleEntityRelationships reports by default and deletes only on request.
 *   - #3160: an LLM-identified soft FK is not written to a field whose relationship is pinned
 *     (AutoUpdateRelatedEntityInfo = 0), and the UPDATE repeats that guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executed = vi.hoisted(() => ({ statements: [] as string[] }));
const logs = vi.hoisted(() => ({ warnings: [] as string[] }));
const relatedEntities = vi.hoisted(() => ({ byName: new Map<string, { ID: string; Name: string }>() }));

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: { excludeSchemas: [], baseViewExcludedFields: [] },
   currentWorkingDirectory: '/tmp',
   GetSettingValue: vi.fn(),
   MjCoreSchema: () => '__mj',
   DbPlatform: () => 'sqlserver',
   OutputDir: '/tmp',
   ResolveAdditionalSchemaInfoPath: () => null,
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   class FakeMetadata {
      EntityByName(name: string) { return relatedEntities.byName.get(name) ?? null; }
      get Entities() { return []; }
   }
   return { ...actual, Metadata: FakeMetadata, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   LogMessage: vi.fn(),
   logStatus: vi.fn(),
   LogWarning: vi.fn((m: string) => { logs.warnings.push(m); }),
   StartSpinner: vi.fn(),
   UpdateSpinner: vi.fn(),
   SucceedSpinner: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('../Misc/sql_logging', () => ({
   SQLLogging: { LogSQLAndExecute: vi.fn(async (_pool: unknown, sql: string) => { executed.statements.push(sql); return {}; }) },
}));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase, StaleRelationshipCandidate, StaleRelationshipField } from '../Database/manage-metadata';
import { EntityInfo, Metadata } from '@memberjunction/core';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { VirtualEntityDecorationResult } from '../Misc/advanced_generation';

const PARENT_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const CHILD_ID = 'BBBBBBBB-0000-0000-0000-000000000002';
const OTHER_ID = 'CCCCCCCC-0000-0000-0000-000000000003';
const CORE_ID = 'DDDDDDDD-0000-0000-0000-000000000004';

function entity(ID: string, Name: string): EntityInfo {
   return new EntityInfo({
      ID, Name, SchemaName: 'app', BaseTable: Name, BaseTableCodeName: Name, BaseView: `vw${Name}`,
      EntityFields: [{ ID: `${Name}-id`, Name: 'ID', Type: 'uniqueidentifier', Sequence: 1, IsPrimaryKey: true, IsVirtual: false }],
   });
}

class TestableRelationships extends ManageMetadataBase {
   public Tables: { Entity: Record<string, unknown>[]; EntityField: Record<string, unknown>[]; EntityRelationship: Record<string, unknown>[] } =
      { Entity: [], EntityField: [], EntityRelationship: [] };
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   protected qsql(sql: string): string { return sql; }
   protected get dbProvider() {
      return {
         conditionalInsertSQL: (checkQuery: string, insertSQL: string) => `IF NOT EXISTS (${checkQuery}) BEGIN ${insertSQL} END`,
      } as unknown as ReturnType<() => never>;
   }
   protected createNewUUID(): string { return 'NEW-REL-UUID'; }
   protected async runQuery(_pool: CodeGenConnection, sql: string): Promise<CodeGenQueryResult> {
      if (sql.includes('[EntityRelationship]')) return { recordset: this.Tables.EntityRelationship };
      if (sql.includes('[EntityField]')) return { recordset: this.Tables.EntityField };
      if (sql.includes('[Entity]')) return { recordset: this.Tables.Entity };
      throw new Error(`unexpected query: ${sql}`);
   }

   public InsertSQL(fieldName: string, md: Metadata): string {
      return this.buildInsertRelationshipSQL({ EntityID: CHILD_ID, RelatedEntityID: PARENT_ID, Name: fieldName, RelatedEntityFieldName: 'ID' }, md, new Map());
   }
   public async ApplyLLMFKs(e: EntityInfo, fks: VirtualEntityDecorationResult['foreignKeys']): Promise<boolean> {
      return this.applyLLMForeignKeys({} as CodeGenConnection, e, fks, '__mj');
   }
}

beforeEach(() => {
   executed.statements = [];
   logs.warnings = [];
   relatedEntities.byName.clear();
});

describe('EntityRelationship INSERT guard is replay-safe (#4053)', () => {
   const md = { Entities: [entity(PARENT_ID, 'Customers'), entity(CHILD_ID, 'Orders')] } as unknown as Metadata;

   it('checks the natural key with the columns inverted from the FK field', () => {
      const sql = new TestableRelationships().InsertSQL('CustomerID', md).replace(/\s+/g, ' ');
      expect(sql).toContain(
         `IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityRelationship] WHERE [ID] = 'NEW-REL-UUID' ` +
         `OR ([EntityID] = '${PARENT_ID}' AND [RelatedEntityID] = '${CHILD_ID}' AND [RelatedEntityJoinField] = 'CustomerID'))`);
      // the INSERT itself is unchanged: parent in EntityID, child in RelatedEntityID
      expect(sql).toContain(`VALUES ('NEW-REL-UUID', '${PARENT_ID}', '${CHILD_ID}', 'CustomerID'`);
   });

   it('escapes a quote in the join field name inside the guard', () => {
      const sql = new TestableRelationships().InsertSQL("Odd'Name", md);
      expect(sql).toContain(`[RelatedEntityJoinField] = 'Odd''Name'`);
   });
});

describe('FindStaleOneToManyRelationships (#2071)', () => {
   const inScope = new Set([PARENT_ID, CHILD_ID, OTHER_ID].map(id => id.toLowerCase()));
   const rel = (over: Partial<StaleRelationshipCandidate> = {}): StaleRelationshipCandidate => ({
      ID: 'rel-1', EntityID: PARENT_ID, RelatedEntityID: CHILD_ID, RelatedEntityJoinField: 'CustomerID',
      Type: 'One To Many', AutoUpdateFromSchema: true, ...over,
   });
   const fld = (Name: string, RelatedEntityID: string | null, EntityID = CHILD_ID): StaleRelationshipField => ({ EntityID, Name, RelatedEntityID });
   const find = (rels: StaleRelationshipCandidate[], fields: StaleRelationshipField[], scope: ReadonlySet<string> = inScope) =>
      ManageMetadataBase.FindStaleOneToManyRelationships(rels, fields, scope).map(r => r.ID);

   it('picks a relationship whose join column was dropped', () => {
      expect(find([rel()], [fld('ID', null), fld('Total', null)])).toEqual(['rel-1']);
   });

   it('picks a relationship whose join field now points at a different entity', () => {
      expect(find([rel()], [fld('CustomerID', OTHER_ID)])).toEqual(['rel-1']);
   });

   it('keeps a relationship still backed by its FK (and by a soft FK, which looks the same)', () => {
      expect(find([rel()], [fld('CustomerID', PARENT_ID)])).toEqual([]);
   });

   it('keeps a join field that exists with no relationship (a hand-made relationship over a non-FK column)', () => {
      expect(find([rel()], [fld('CustomerID', null)])).toEqual([]);
   });

   it('compares ids case-insensitively and trims nchar padding and name case', () => {
      const r = rel({ EntityID: PARENT_ID.toLowerCase(), RelatedEntityID: CHILD_ID.toLowerCase(), RelatedEntityJoinField: 'CustomerID   ', Type: 'One To Many  ' });
      expect(find([r], [fld('customerid', PARENT_ID.toUpperCase(), CHILD_ID.toUpperCase())])).toEqual([]);
   });

   it('never touches operator-owned rows or other relationship types', () => {
      expect(find([rel({ AutoUpdateFromSchema: false }), rel({ ID: 'rel-2', AutoUpdateFromSchema: 0 }), rel({ ID: 'rel-3', Type: 'Many To Many' })], [fld('ID', null)])).toEqual([]);
   });

   it('accepts the bit as a number or string', () => {
      expect(find([rel({ AutoUpdateFromSchema: 1 }), rel({ ID: 'rel-2', AutoUpdateFromSchema: '1' })], [fld('ID', null)])).toEqual(['rel-1', 'rel-2']);
   });

   it('treats out of scope as untouched: neither an out-of-scope child nor an out-of-scope parent is pruned (#3384)', () => {
      const scope = new Set([CHILD_ID.toLowerCase()]);
      expect(find([rel({ EntityID: CORE_ID })], [fld('ID', null)], scope)).toEqual([]);
      expect(find([rel()], [fld('ID', null)], new Set([PARENT_ID.toLowerCase()]))).toEqual([]);
   });

   it('keeps every relationship of a child with no field rows at all', () => {
      expect(find([rel()], [fld('ID', null, OTHER_ID)])).toEqual([]);
   });
});

describe('CleanupStaleEntityRelationships', () => {
   function seeded(): TestableRelationships {
      const mm = new TestableRelationships();
      mm.Tables.Entity = [
         { ID: PARENT_ID, SchemaName: 'app' }, { ID: CHILD_ID, SchemaName: 'app' }, { ID: CORE_ID, SchemaName: '__mj' },
      ];
      mm.Tables.EntityField = [{ EntityID: CHILD_ID, Name: 'ID', RelatedEntityID: null }];
      mm.Tables.EntityRelationship = [
         { ID: 'rel-stale', EntityID: PARENT_ID, RelatedEntityID: CHILD_ID, RelatedEntityJoinField: 'CustomerID', Type: 'One To Many', AutoUpdateFromSchema: true },
         { ID: 'rel-core', EntityID: CORE_ID, RelatedEntityID: CHILD_ID, RelatedEntityJoinField: 'GoneID', Type: 'One To Many', AutoUpdateFromSchema: true },
      ];
      return mm;
   }

   it('reports and deletes nothing by default (dry run)', async () => {
      const mm = seeded();
      expect(await mm.CleanupStaleEntityRelationships({} as CodeGenConnection, ['__mj'])).toBe(true);
      expect(mm.StaleRelationshipsRemoved).toBe(0);
      expect(executed.statements).toHaveLength(0);
      expect(logs.warnings).toHaveLength(1);
      expect(logs.warnings[0]).toContain('rel-stale');
   });

   it('deletes only the in-scope stale row, by id, when DryRun is false', async () => {
      const mm = seeded();
      await mm.CleanupStaleEntityRelationships({} as CodeGenConnection, ['__mj'], { DryRun: false });
      expect(mm.StaleRelationshipsRemoved).toBe(1);
      expect(executed.statements).toHaveLength(1);
      expect(executed.statements[0]).toContain(`DELETE FROM [__mj].[EntityRelationship] WHERE [ID] = 'rel-stale'`);
      expect(executed.statements[0]).not.toContain('rel-core');
   });

   it('handles an empty exclude list (no SQL IN () clause)', async () => {
      await seeded().CleanupStaleEntityRelationships({} as CodeGenConnection, [], { DryRun: false });
      expect(executed.statements[0]).toContain('rel-stale');
      expect(executed.statements[0]).toContain('rel-core');
   });
});

describe('LLM soft FKs respect AutoUpdateRelatedEntityInfo (#3160)', () => {
   it('LLMForeignKeyMayApply refuses a pinned field or one that already has a relationship', () => {
      expect(ManageMetadataBase.LLMForeignKeyMayApply({ RelatedEntityID: null, AutoUpdateRelatedEntityInfo: true })).toBe(true);
      expect(ManageMetadataBase.LLMForeignKeyMayApply({ RelatedEntityID: null, AutoUpdateRelatedEntityInfo: false })).toBe(false);
      expect(ManageMetadataBase.LLMForeignKeyMayApply({ RelatedEntityID: null, AutoUpdateRelatedEntityInfo: 0 })).toBe(false);
      expect(ManageMetadataBase.LLMForeignKeyMayApply({ RelatedEntityID: null, AutoUpdateRelatedEntityInfo: '0' })).toBe(false);
      expect(ManageMetadataBase.LLMForeignKeyMayApply({ RelatedEntityID: PARENT_ID, AutoUpdateRelatedEntityInfo: true })).toBe(false);
   });

   function virtualEntity(): EntityInfo {
      return new EntityInfo({
         ID: CHILD_ID, Name: 'Member Report', SchemaName: 'app', BaseView: 'vwMemberReport', VirtualEntity: true,
         EntityFields: [
            { ID: 'f1', Name: 'MemberID', Type: 'uniqueidentifier', Sequence: 1, AutoUpdateRelatedEntityInfo: true },
            { ID: 'f2', Name: 'GLCode', Type: 'nvarchar', Sequence: 2, AutoUpdateRelatedEntityInfo: false },
         ],
      });
   }
   const fks: VirtualEntityDecorationResult['foreignKeys'] = [
      { fieldName: 'MemberID', relatedEntityName: 'Members', relatedFieldName: 'ID', confidence: 'high' },
      { fieldName: 'GLCode', relatedEntityName: 'GL Codes', relatedFieldName: 'Code', confidence: 'high' },
   ] as VirtualEntityDecorationResult['foreignKeys'];

   it('writes the unpinned field only, with the pin repeated in the UPDATE', async () => {
      relatedEntities.byName.set('Members', { ID: PARENT_ID, Name: 'Members' });
      relatedEntities.byName.set('GL Codes', { ID: OTHER_ID, Name: 'GL Codes' });
      const mm = new TestableRelationships();
      expect(await mm.ApplyLLMFKs(virtualEntity(), fks)).toBe(true);
      const sql = executed.statements.join('\n');
      expect(sql).toContain("Name='MemberID'");
      expect(sql).toContain('[AutoUpdateRelatedEntityInfo] = 1');
      expect(sql).not.toContain('GLCode');
   });

   it('writes nothing when every proposed field is pinned', async () => {
      relatedEntities.byName.set('GL Codes', { ID: OTHER_ID, Name: 'GL Codes' });
      const mm = new TestableRelationships();
      expect(await mm.ApplyLLMFKs(virtualEntity(), [fks[1]])).toBe(false);
      expect(executed.statements).toHaveLength(0);
   });
});
