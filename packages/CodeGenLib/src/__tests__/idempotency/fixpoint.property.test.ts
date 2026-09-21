import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import {
   computeFieldMetadataUpdate,
   FieldLockContext,
   FieldMetadataProposal,
   FieldMetadataState,
} from '../../Database/field-metadata-lock';
import { SmartFieldIdentificationResult, SearchPredicate } from '../../Misc/advanced_generation';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';
import { EntityInfo, EntityFieldExtendedTypes, EntityFieldExtendedType } from '@memberjunction/core';
import { SQLLogging } from '../../Misc/sql_logging';

/**
 * Seeded PRNG using Mulberry32 algorithm.
 * Guarantees 100% deterministic pseudo-random sequences across runs.
 */
function createPrng(seed: number): () => number {
   let s = seed | 0;
   return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   };
}

function pickRandomOne<T>(arr: readonly T[], rng: () => number): T {
   const index = Math.floor(rng() * arr.length);
   return arr[index];
}

function pickRandomSubset<T>(arr: readonly T[], rng: () => number, minCount = 0, maxCount?: number): T[] {
   const max = maxCount ?? arr.length;
   const targetCount = minCount + Math.floor(rng() * (max - minCount + 1));
   const shuffled = [...arr].sort(() => rng() - 0.5);
   return shuffled.slice(0, targetCount);
}

interface TestFieldRecord {
   ID: string;
   Name: string;
   Type: string;
   Length: number;
   IsPrimaryKey: boolean;
   DefaultInView: boolean;
   IncludeInUserSearchAPI: boolean;
   AutoUpdateDefaultInView: boolean;
   AutoUpdateIncludeInUserSearchAPI: boolean;
   IsNameField: boolean;
   AutoUpdateIsNameField: boolean;
   UserSearchPredicateAPI: string | null;
   AutoUpdateUserSearchPredicate: boolean;
   Category: string | null;
   GeneratedFormSection: string | null;
   DisplayName: string;
   ExtendedType: string | null;
   CodeType: string | null;
   AutoUpdateCategory: boolean;
   AutoUpdateDisplayName: boolean;
   AutoUpdateExtendedType: boolean;
}

interface TestEntityRecord {
   ID: string;
   Name: string;
   SchemaName: string;
   AllowUserSearchAPI: boolean;
   AutoUpdateAllowUserSearchAPI: boolean;
   FullTextSearchEnabled: boolean;
   AutoUpdateFullTextSearch: boolean;
}

class TestableManageMetadataForFixpoint extends ManageMetadataBase {
   public executedSql: string[] = [];

   protected override async LogSQLBatchAndExecute(
      _pool: CodeGenConnection,
      sqlBatch: string[],
      _description: string,
      _throwError: boolean = false
   ): Promise<void> {
      this.executedSql.push(...sqlBatch);
   }

   public resetExecutedSql(): void {
      this.executedSql = [];
   }

   public async testApplyFieldCategories(
      pool: CodeGenConnection,
      entity: EntityInfo,
      fields: Array<{
         ID: string;
         Name: string;
         Category: string | null;
         AutoUpdateCategory: boolean;
         AutoUpdateDisplayName: boolean;
         AutoUpdateExtendedType: boolean;
         GeneratedFormSection: string;
         DisplayName: string;
         ExtendedType: string | null;
         CodeType: string | null;
      }>,
      fieldCategories: Array<{
         fieldName: string;
         category: string;
         displayName?: string;
         extendedType?: string | null;
         codeType?: string | null;
         reason?: string;
      }>,
      existingCategories: Set<string>,
      ctx: { isNewEntity: boolean }
   ): Promise<void> {
      return this.applyFieldCategories(pool, entity, fields, fieldCategories, existingCategories, ctx);
   }

   public async testApplySmartFieldIdentification(
      pool: CodeGenConnection,
      entity: TestEntityRecord,
      fields: Array<Record<string, unknown>>,
      result: SmartFieldIdentificationResult,
      ctx?: { isNewEntity: boolean; newFieldNames: ReadonlySet<string>; typeReopenedNames: ReadonlySet<string> }
   ): Promise<void> {
      return this.applySmartFieldIdentification(pool, entity, fields, result, ctx);
   }

   public testValidateExtendedType(suggested: string): EntityFieldExtendedType | null {
      return this.validateExtendedType(suggested);
   }

   public testSanitizeCodeType(
      codeType: string | null | undefined,
      fieldName: string,
      entityName: string
   ): string | null | undefined {
      return this.sanitizeCodeType(codeType, fieldName, entityName);
   }
}

function createDummyConnection(): CodeGenConnection {
   return {
      query: async () => ({ recordset: [] } as CodeGenQueryResult),
      queryWithParams: async () => ({ recordset: [] } as CodeGenQueryResult),
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
}

function createFixtureFields(): TestFieldRecord[] {
   return [
      {
         ID: 'f-id',
         Name: 'ID',
         Type: 'int',
         Length: 4,
         IsPrimaryKey: true,
         DefaultInView: false,
         IncludeInUserSearchAPI: false,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         IsNameField: false,
         AutoUpdateIsNameField: true,
         UserSearchPredicateAPI: null,
         AutoUpdateUserSearchPredicate: true,
         Category: null,
         GeneratedFormSection: null,
         DisplayName: 'ID',
         ExtendedType: null,
         CodeType: null,
         AutoUpdateCategory: true,
         AutoUpdateDisplayName: true,
         AutoUpdateExtendedType: true,
      },
      {
         ID: 'f-name',
         Name: 'Name',
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
         Category: null,
         GeneratedFormSection: null,
         DisplayName: 'Name',
         ExtendedType: null,
         CodeType: null,
         AutoUpdateCategory: true,
         AutoUpdateDisplayName: true,
         AutoUpdateExtendedType: true,
      },
      {
         ID: 'f-desc',
         Name: 'Description',
         Type: 'nvarchar',
         Length: -1,
         IsPrimaryKey: false,
         DefaultInView: false,
         IncludeInUserSearchAPI: false,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         IsNameField: false,
         AutoUpdateIsNameField: true,
         UserSearchPredicateAPI: null,
         AutoUpdateUserSearchPredicate: true,
         Category: null,
         GeneratedFormSection: null,
         DisplayName: 'Description',
         ExtendedType: null,
         CodeType: null,
         AutoUpdateCategory: true,
         AutoUpdateDisplayName: true,
         AutoUpdateExtendedType: true,
      },
      {
         ID: 'f-status',
         Name: 'Status',
         Type: 'nvarchar',
         Length: 50,
         IsPrimaryKey: false,
         DefaultInView: false,
         IncludeInUserSearchAPI: false,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         IsNameField: false,
         AutoUpdateIsNameField: true,
         UserSearchPredicateAPI: null,
         AutoUpdateUserSearchPredicate: true,
         Category: null,
         GeneratedFormSection: null,
         DisplayName: 'Status',
         ExtendedType: null,
         CodeType: null,
         AutoUpdateCategory: true,
         AutoUpdateDisplayName: true,
         AutoUpdateExtendedType: true,
      },
      {
         ID: 'f-code',
         Name: 'Code',
         Type: 'varchar',
         Length: 20,
         IsPrimaryKey: false,
         DefaultInView: false,
         IncludeInUserSearchAPI: false,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         IsNameField: false,
         AutoUpdateIsNameField: true,
         UserSearchPredicateAPI: null,
         AutoUpdateUserSearchPredicate: true,
         Category: null,
         GeneratedFormSection: null,
         DisplayName: 'Code',
         ExtendedType: null,
         CodeType: null,
         AutoUpdateCategory: true,
         AutoUpdateDisplayName: true,
         AutoUpdateExtendedType: true,
      },
      {
         ID: 'f-email',
         Name: 'Email',
         Type: 'nvarchar',
         Length: 200,
         IsPrimaryKey: false,
         DefaultInView: false,
         IncludeInUserSearchAPI: false,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         IsNameField: false,
         AutoUpdateIsNameField: true,
         UserSearchPredicateAPI: null,
         AutoUpdateUserSearchPredicate: true,
         Category: null,
         GeneratedFormSection: null,
         DisplayName: 'Email',
         ExtendedType: null,
         CodeType: null,
         AutoUpdateCategory: true,
         AutoUpdateDisplayName: true,
         AutoUpdateExtendedType: true,
      },
   ];
}

function createFixtureEntity(): TestEntityRecord {
   return {
      ID: 'entity-1',
      Name: 'Customer',
      SchemaName: 'dbo',
      AllowUserSearchAPI: false,
      AutoUpdateAllowUserSearchAPI: true,
      FullTextSearchEnabled: false,
      AutoUpdateFullTextSearch: true,
   };
}

/**
 * Parses SQL statements emitted by CodeGen and applies them in-memory to the entity and fields.
 */
function applySqlUpdatesToState(
   executedSql: readonly string[],
   entity: TestEntityRecord,
   fields: TestFieldRecord[]
): void {
   for (const sql of executedSql) {
      const entityAllowMatch = sql.match(/SET\s+AllowUserSearchAPI\s*=\s*([01])/i);
      if (entityAllowMatch) {
         entity.AllowUserSearchAPI = entityAllowMatch[1] === '1';
      }
      const entityFtsMatch = sql.match(/SET\s+FullTextSearchEnabled\s*=\s*([01])/i);
      if (entityFtsMatch) {
         entity.FullTextSearchEnabled = entityFtsMatch[1] === '1';
      }

      const idMatch = sql.match(/WHERE\s+ID\s*=\s*'([^']+)'/i);
      if (!idMatch) continue;
      const fieldId = idMatch[1];
      const field = fields.find(f => f.ID === fieldId);
      if (!field) continue;

      const catMatch = sql.match(/Category\s*=\s*'([^']*)'/i);
      if (catMatch) field.Category = catMatch[1];

      const gfsMatch = sql.match(/GeneratedFormSection\s*=\s*'([^']*)'/i);
      if (gfsMatch) field.GeneratedFormSection = gfsMatch[1];

      const dnMatch = sql.match(/DisplayName\s*=\s*'([^']*)'/i);
      if (dnMatch) field.DisplayName = dnMatch[1];

      const extMatch = sql.match(/ExtendedType\s*=\s*(NULL|'([^']*)')/i);
      if (extMatch) field.ExtendedType = extMatch[1] === 'NULL' ? null : extMatch[2];

      const codeMatch = sql.match(/CodeType\s*=\s*(NULL|'([^']*)')/i);
      if (codeMatch) field.CodeType = codeMatch[1] === 'NULL' ? null : codeMatch[2];

      const nameMatch = sql.match(/IsNameField\s*=\s*([01])/i);
      if (nameMatch) field.IsNameField = nameMatch[1] === '1';

      const divMatch = sql.match(/DefaultInView\s*=\s*([01])/i);
      if (divMatch) field.DefaultInView = divMatch[1] === '1';

      const searchMatch = sql.match(/IncludeInUserSearchAPI\s*=\s*([01])/i);
      if (searchMatch) field.IncludeInUserSearchAPI = searchMatch[1] === '1';

      const predMatch = sql.match(/UserSearchPredicateAPI\s*=\s*'([^']*)'/i);
      if (predMatch) field.UserSearchPredicateAPI = predMatch[1];
   }
}

describe('T13 — Fixpoint Property Tests (C2–C4, §6 T13)', () => {
   const pool = createDummyConnection();
   let mm: TestableManageMetadataForFixpoint;
   let restoreSQLOutput: () => void;

   beforeAll(() => {
      restoreSQLOutput = SQLLogging.suppressOutputForTests();
   });

   afterAll(() => {
      restoreSQLOutput();
   });

   beforeEach(() => {
      mm = new TestableManageMetadataForFixpoint();
   });

   it('computeFieldMetadataUpdate fixpoint property: 200 seeded iterations emit zero updates on second pass', () => {
      const rng = createPrng(42);
      const categories = ['General', 'Details', 'Audit', 'System Metadata', 'Financial', 'Security', ''];
      const displayNames = ['Custom Display', 'Special Note', 'Primary Code', 'Email Address', ''];
      const extTypes: Array<string | null> = [...EntityFieldExtendedTypes, 'InvalidType', null];
      const codeTypes: Array<string | null> = ['string', 'number', 'SomeEnum', null];

      for (let i = 0; i < 200; i++) {
         const field: FieldMetadataState = {
            ID: `f-${i}`,
            Name: `Field_${i}`,
            Category: rng() > 0.5 ? pickRandomOne(categories, rng) : null,
            GeneratedFormSection: rng() > 0.5 ? 'Category' : null,
            DisplayName: rng() > 0.5 ? pickRandomOne(displayNames, rng) : `Field_${i}`,
            ExtendedType: rng() > 0.5 ? pickRandomOne(extTypes, rng) : null,
            CodeType: rng() > 0.5 ? pickRandomOne(codeTypes, rng) : null,
            AutoUpdateCategory: rng() > 0.1,
            AutoUpdateDisplayName: rng() > 0.1,
            AutoUpdateExtendedType: rng() > 0.1,
         };

         const proposal: FieldMetadataProposal = {
            fieldName: field.Name,
            category: pickRandomOne(categories, rng),
            displayName: pickRandomOne(displayNames, rng),
            extendedType: pickRandomOne(extTypes, rng),
            codeType: pickRandomOne(codeTypes, rng),
            reason: `Iteration ${i}`,
         };

         const lockCtx: FieldLockContext = {
            isNewEntity: rng() > 0.5,
            isNewField: rng() > 0.5,
            descriptionReopened: rng() > 0.8,
            typeReopened: rng() > 0.8,
            existingCategories: new Set(['General', 'Details', 'Audit']),
         };

         // Pass 1
         const update1 = computeFieldMetadataUpdate(
            field,
            proposal,
            lockCtx,
            s => mm.testValidateExtendedType(s),
            (v, fn, en) => mm.testSanitizeCodeType(v, fn, en)
         );

         // Apply update1 to field state (as DB write would)
         if (update1.Category !== undefined) field.Category = update1.Category;
         if (update1.GeneratedFormSection !== undefined) field.GeneratedFormSection = update1.GeneratedFormSection;
         if (update1.DisplayName !== undefined) field.DisplayName = update1.DisplayName;
         if ('ExtendedType' in update1) field.ExtendedType = update1.ExtendedType ?? null;
         if ('CodeType' in update1) field.CodeType = update1.CodeType ?? null;

         // Pass 2: Re-apply exact same proposal to updated state
         const update2 = computeFieldMetadataUpdate(
            field,
            proposal,
            lockCtx,
            s => mm.testValidateExtendedType(s),
            (v, fn, en) => mm.testSanitizeCodeType(v, fn, en)
         );

         expect(update2.Category).toBeUndefined();
         expect(update2.GeneratedFormSection).toBeUndefined();
         expect(update2.DisplayName).toBeUndefined();
         expect('ExtendedType' in update2).toBe(false);
         expect('CodeType' in update2).toBe(false);
      }
   });

   it('applyFieldCategories fixpoint property: 200 seeded iterations emit zero SQL statements on second pass', async () => {
      mm = new TestableManageMetadataForFixpoint();
      const rng = createPrng(1337);
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      const categories = ['General', 'Details', 'Audit', 'System Metadata', 'Financial', 'Security'];
      const displayNames = ['Custom Display', 'Special Note', 'Primary Code', 'Email Address'];
      const extTypes: Array<string | null> = [...EntityFieldExtendedTypes, 'InvalidType', null];
      const codeTypes: Array<string | null> = ['string', 'number', 'SomeEnum', null];

      for (let i = 0; i < 200; i++) {
         const fields = createFixtureFields();
         const isNewEntity = rng() > 0.5;

         const fieldCategories = fields.map(f => ({
            fieldName: f.Name,
            category: pickRandomOne(categories, rng),
            displayName: rng() > 0.3 ? pickRandomOne(displayNames, rng) : undefined,
            extendedType: rng() > 0.3 ? pickRandomOne(extTypes, rng) : undefined,
            codeType: rng() > 0.5 ? pickRandomOne(codeTypes, rng) : undefined,
         }));

         const existingCategories = new Set(['General', 'Details', 'Audit']);

         // Pass 1: apply
         mm.resetExecutedSql();
         await mm.testApplyFieldCategories(pool, entity, fields, fieldCategories, existingCategories, { isNewEntity });

         // Apply emitted SETs to state
         applySqlUpdatesToState(mm.executedSql, createFixtureEntity(), fields);

         // Pass 2: apply same proposal again
         mm.resetExecutedSql();
         await mm.testApplyFieldCategories(pool, entity, fields, fieldCategories, existingCategories, { isNewEntity });

         expect(mm.executedSql).toEqual([]);
      }
   });

   it('applySmartFieldIdentification fixpoint property: 200 seeded iterations emit zero SQL statements on second pass', async () => {
      mm = new TestableManageMetadataForFixpoint();
      const rng = createPrng(9999);
      const fieldNames = ['ID', 'Name', 'Description', 'Status', 'Code', 'Email'];
      const predicates: SearchPredicate[] = ['BeginsWith', 'Contains', 'Exact'];

      for (let i = 0; i < 200; i++) {
         const entity = createFixtureEntity();
         const fields = createFixtureFields();

         const nameCandidates = pickRandomSubset(['Name', 'Code', 'Status', 'Email'], rng, 1, 3);
         const defaultInViewCandidates = pickRandomSubset(fieldNames, rng, 1, 4);
         const searchableCandidates = pickRandomSubset(['Name', 'Status', 'Code', 'Email'], rng, 1, 4);
         const searchPredicates = searchableCandidates.map(fn => ({
            field: fn,
            predicate: pickRandomOne(predicates, rng),
         }));

         const result: SmartFieldIdentificationResult = {
            nameFields: nameCandidates,
            defaultInView: defaultInViewCandidates,
            searchableFields: searchableCandidates,
            searchPredicates,
            allowUserSearch: rng() > 0.3,
            confidence: 0.95,
            enableFullTextSearch: false,
         };

         const ctx = {
            isNewEntity: true,
            newFieldNames: new Set(fieldNames),
            typeReopenedNames: new Set<string>(),
         };

         // Pass 1: apply
         mm.resetExecutedSql();
         await mm.testApplySmartFieldIdentification(
            pool,
            entity,
            fields as unknown as Array<Record<string, unknown>>,
            result,
            ctx
         );

         // Apply emitted SETs to in-memory entity and fields
         applySqlUpdatesToState(mm.executedSql, entity, fields);

         // Pass 2: apply same result again
         mm.resetExecutedSql();
         await mm.testApplySmartFieldIdentification(
            pool,
            entity,
            fields as unknown as Array<Record<string, unknown>>,
            result,
            ctx
         );

         expect(mm.executedSql).toEqual([]);
      }
   });

   it('opinion drift stability: Result A then Result B on existing entity with no new/reopened fields emits zero statements for non-blank columns', async () => {
      mm = new TestableManageMetadataForFixpoint();
      const rng = createPrng(2026);
      const entityInfo = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      const categoriesA = ['General', 'Details', 'Audit'];
      const categoriesB = ['Marketing', 'Finance', 'System Internal'];
      const predicates: SearchPredicate[] = ['BeginsWith', 'Contains', 'Exact'];

      for (let i = 0; i < 100; i++) {
         const entity = createFixtureEntity();
         const fields = createFixtureFields();

         // Pre-populate all fields with non-blank values (Result A)
         for (const f of fields) {
            f.Category = pickRandomOne(categoriesA, rng);
            f.GeneratedFormSection = 'Category';
            f.DisplayName = `Display ${f.Name}`;
            f.ExtendedType = f.Type === 'nvarchar' && f.Length === 100 ? 'JSON' : null;
            f.CodeType = null;
         }
         fields[1].IsNameField = true; // 'Name' is winner
         fields[1].DefaultInView = true;
         fields[3].DefaultInView = true; // 'Status'
         fields[4].IncludeInUserSearchAPI = true; // 'Code'
         fields[4].UserSearchPredicateAPI = 'BeginsWith';
         entity.AllowUserSearchAPI = true;

         // Verify preconditions: Category and DisplayName are non-blank for all fields
         for (const f of fields) {
            expect(f.Category).toBeTruthy();
            expect(f.DisplayName).toBeTruthy();
         }

         // Generate Result B with conflicting LLM opinions
         const fieldCategoriesB = fields.map(f => ({
            fieldName: f.Name,
            category: pickRandomOne(categoriesB, rng),
            displayName: `Conflicting ${f.Name} B`,
            extendedType: 'Code',
            codeType: 'SomeNewType',
         }));

         const smartResultB: SmartFieldIdentificationResult = {
            nameFields: ['Code', 'Email'], // Wants Code or Email to be name field instead
            defaultInView: ['ID', 'Email'], // Wants different default in view
            searchableFields: ['Status', 'Email'], // Wants different search fields
            searchPredicates: [
               { field: 'Status', predicate: 'Exact' },
               { field: 'Email', predicate: 'Contains' },
            ],
            allowUserSearch: false, // Wants to flip allow user search
            confidence: 0.99,
            enableFullTextSearch: false,
         };

         const existingCtx = {
            isNewEntity: false,
            newFieldNames: new Set<string>(),
            typeReopenedNames: new Set<string>(),
         };

         // Apply Result B to field categories on existing entity
         mm.resetExecutedSql();
         await mm.testApplyFieldCategories(
            pool,
            entityInfo,
            fields,
            fieldCategoriesB,
            new Set(categoriesA),
            { isNewEntity: false }
         );

         // Assert: Category, DisplayName, ExtendedType emitted zero statements!
         expect(mm.executedSql).toEqual([]);

         // Apply Result B to smart field identification on existing entity
         mm.resetExecutedSql();
         await mm.testApplySmartFieldIdentification(
            pool,
            entity,
            fields as unknown as Array<Record<string, unknown>>,
            smartResultB,
            existingCtx
         );

         // Assert: Zero statements emitted for existing fields and entity!
         expect(mm.executedSql).toEqual([]);
      }
   });
});
