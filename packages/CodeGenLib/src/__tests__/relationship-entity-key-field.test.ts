/**
 * A RELATIONSHIP OVER A NON-PRIMARY-KEY JOIN COLUMN has to be expressible, or it silently
 * returns zero rows.
 *
 * `EntityRelationship.EntityKeyField` names the column on the PARENT that carries the join value.
 * All three consumers fall back to the parent's first primary key when it is blank
 * (`entityInfo.ts` BuildRelationshipViewParams, `entity-helpers.ts`, `DependencyGraphWalker.ts`) —
 * which is correct for an ordinary FK and wrong for a foreign key that points at a non-PK column,
 * the normal shape on an imported schema whose real keys are external ids. CodeGen knew the
 * referenced column all along (`EntityField.RelatedEntityFieldName`) and never carried it across:
 * the INSERT column list omitted `EntityKeyField` and neither UPDATE path set it.
 *
 * Two properties are pinned here, and the second is the one that repairs a live database:
 *   1. a non-PK join round-trips into the INSERT;
 *   2. an EXISTING relationship whose join field is already correct — and which therefore takes the
 *      "exact match, skip" path — still gets its EntityKeyField healed.
 *
 * Plus the negative that keeps this change invisible where it should be: an FK pointing at the
 * parent's primary key emits NO EntityKeyField at all, so every relationship in core MJ generates
 * byte-identically to before.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
   configInfo: { excludeSchemas: [], baseViewExcludedFields: [] },
   currentWorkingDirectory: '/tmp',
   getSettingValue: vi.fn(),
   mj_core_schema: () => '__mj',
   dbPlatform: () => 'sqlserver',
   outputDir: '/tmp',
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('../Misc/status_logging', () => ({
   logError: vi.fn(),
   logMessage: vi.fn(),
   logStatus: vi.fn(),
   logWarning: vi.fn(),
   startSpinner: vi.fn(),
   updateSpinner: vi.fn(),
   succeedSpinner: vi.fn(),
}));
vi.mock('../Database/sql', () => ({ SQLUtilityBase: class {} }));
vi.mock('../Misc/advanced_generation', () => ({ AdvancedGeneration: class {} }));
vi.mock('../Misc/sql_logging', () => ({ SQLLogging: { LogSQLAndExecute: vi.fn(async () => undefined) } }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: class {} }));

import { ManageMetadataBase } from '../Database/manage-metadata';
import { EntityInfo, Metadata } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';

function field(name: string, sequence: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
   return {
      ID: `f-${name}`,
      Name: name,
      Type: 'nvarchar',
      Length: 100,
      Sequence: sequence,
      IsPrimaryKey: false,
      IsVirtual: false,
      AllowsNull: true,
      AutoIncrement: false,
      RelatedEntityID: null,
      ...extra,
   };
}

/** Customers: an integer surrogate PK plus the external id everything actually joins on. */
function customers(opts: { compositeKey?: boolean; withExternalKey?: boolean } = {}): EntityInfo {
   const fields = [
      field('ID', 1, { IsPrimaryKey: true, Type: 'uniqueidentifier' }),
      ...(opts.withExternalKey === false ? [] : [field('Customer_Key', 2)]),
      field('Name', 3),
   ];
   if (opts.compositeKey) {
      fields.push(field('TenantID', 4, { IsPrimaryKey: true }));
   }
   return new EntityInfo({
      ID: CUSTOMER_ID, Name: 'Customers', SchemaName: 'acgi', BaseTable: 'Customer',
      BaseTableCodeName: 'Customer', BaseView: 'vwCustomers', EntityFields: fields,
   });
}

function orders(): EntityInfo {
   return new EntityInfo({
      ID: ORDER_ID, Name: 'Orders', SchemaName: 'acgi', BaseTable: 'Order',
      BaseTableCodeName: 'Order', BaseView: 'vwOrders',
      EntityFields: [field('ID', 1, { IsPrimaryKey: true, Type: 'uniqueidentifier' }), field('Customer_Key', 2)],
   });
}

const metadataWith = (entities: EntityInfo[]): Metadata => ({ Entities: entities }) as unknown as Metadata;

/** One row as `SELECT * FROM vwEntityFields` delivers it for an FK field on Orders. */
function fkFieldRow(referencedColumn: string | null): Record<string, unknown> {
   return {
      ID: 'ef-1',
      EntityID: ORDER_ID,             // the child / FK-owning side
      Name: 'Customer_Key',
      RelatedEntityID: CUSTOMER_ID,   // the parent / "one" side
      RelatedEntityFieldName: referencedColumn,
   };
}

class TestableRelationships extends ManageMetadataBase {
   protected get dialect(): SQLDialect { return new SQLServerDialect(); }
   /** The real conditionalInsertSQL, inlined so the test needs no provider wiring. */
   protected get dbProvider() {
      return {
         conditionalInsertSQL: (checkQuery: string, insertSQL: string) =>
            `IF NOT EXISTS (\n      ${checkQuery}\n   )\n   BEGIN\n      ${insertSQL}\n   END`,
      } as unknown as ReturnType<() => never>;
   }
   protected createNewUUID(): string { return 'NEW-REL-UUID'; }

   public insertSQL(referencedColumn: string | null, md: Metadata): string {
      return this.buildInsertRelationshipSQL(fkFieldRow(referencedColumn), md, new Map());
   }
   public pairSQL(relationships: Record<string, unknown>[], referencedColumn: string | null, md: Metadata): string {
      return this.buildEntityPairRelationshipSQL(relationships, [fkFieldRow(referencedColumn)], md, new Map());
   }
   public resolveKeyField(referencedColumn: string | null, parent: EntityInfo): string | null {
      return this.resolveRelationshipEntityKeyField(fkFieldRow(referencedColumn), parent);
   }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EntityRelationship.EntityKeyField — a non-PK join is persisted', () => {
   const mm = new TestableRelationships();

   it('INSERTs EntityKeyField when the FK references a NON-primary-key column', () => {
      const sql = mm.insertSQL('Customer_Key', metadataWith([customers(), orders()]));
      expect(sql).toContain('[EntityKeyField]');
      // The value lands in the VALUES list, positionally after the join field.
      expect(sql).toMatch(/'Customer_Key',\s*'Customer_Key',\s*'One To Many'/);
   });

   it('omits EntityKeyField entirely for an ordinary FK-to-primary-key relationship', () => {
      const sql = mm.insertSQL('ID', metadataWith([customers(), orders()]));
      expect(sql).not.toContain('EntityKeyField');
      // The historical shape: join field then Type, nothing between them.
      expect(sql).toMatch(/'Customer_Key',\s*'One To Many'/);
   });

   it('heals an EXISTING relationship whose join field already matches but whose key field is blank', () => {
      const existing = [{
         ID: 'rel-1', EntityID: CUSTOMER_ID, RelatedEntityID: ORDER_ID,
         RelatedEntityJoinField: 'Customer_Key', EntityKeyField: null, AutoUpdateFromSchema: true,
      }];
      const sql = mm.pairSQL(existing, 'Customer_Key', metadataWith([customers(), orders()]));
      expect(sql).toContain('UPDATE [__mj].[EntityRelationship]');
      expect(sql).toContain("[EntityKeyField] = 'Customer_Key'");
      expect(sql).toContain("WHERE [ID] = 'rel-1'");
      // And it must NOT also create a duplicate relationship for the same field.
      expect(sql).not.toContain('INSERT INTO');
   });

   it('emits nothing when the stored key field already agrees (idempotent)', () => {
      const existing = [{
         ID: 'rel-1', EntityID: CUSTOMER_ID, RelatedEntityID: ORDER_ID,
         RelatedEntityJoinField: 'Customer_Key', EntityKeyField: 'Customer_Key', AutoUpdateFromSchema: true,
      }];
      expect(mm.pairSQL(existing, 'Customer_Key', metadataWith([customers(), orders()]))).toBe('');
   });

   it('clears a stale key field back to NULL when the FK now targets the primary key', () => {
      const existing = [{
         ID: 'rel-1', EntityID: CUSTOMER_ID, RelatedEntityID: ORDER_ID,
         RelatedEntityJoinField: 'Customer_Key', EntityKeyField: 'Customer_Key', AutoUpdateFromSchema: true,
      }];
      const sql = mm.pairSQL(existing, 'ID', metadataWith([customers(), orders()]));
      expect(sql).toContain('[EntityKeyField] = NULL');
   });

   it('never touches a row an operator owns (AutoUpdateFromSchema = false)', () => {
      const existing = [{
         ID: 'rel-1', EntityID: CUSTOMER_ID, RelatedEntityID: ORDER_ID,
         RelatedEntityJoinField: 'Customer_Key', EntityKeyField: null, AutoUpdateFromSchema: false,
      }];
      expect(mm.pairSQL(existing, 'Customer_Key', metadataWith([customers(), orders()]))).toBe('');
   });
});

describe('resolveRelationshipEntityKeyField — when NULL is the right answer', () => {
   const mm = new TestableRelationships();

   it('NULL when no referenced column was recorded', () => {
      expect(mm.resolveKeyField(null, customers())).toBeNull();
      expect(mm.resolveKeyField('   ', customers())).toBeNull();
   });

   it('NULL when the referenced column IS the primary key (case-insensitively)', () => {
      expect(mm.resolveKeyField('id', customers())).toBeNull();
   });

   it('NULL for a composite-key parent — one column cannot address a two-column key', () => {
      expect(mm.resolveKeyField('Customer_Key', customers({ compositeKey: true }))).toBeNull();
   });

   it('NULL when the parent has no field of that name, rather than encoding an unreadable column', () => {
      expect(mm.resolveKeyField('Customer_Key', customers({ withExternalKey: false }))).toBeNull();
   });

   it('returns the parent field\'s CANONICAL casing, not the referencing spelling', () => {
      expect(mm.resolveKeyField('customer_key', customers())).toBe('Customer_Key');
   });
});
