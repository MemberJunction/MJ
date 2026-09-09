import { describe, it, expect, beforeEach } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { SmartFieldIdentificationResult } from '../../Misc/advanced_generation';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';

class TestableManageMetadataForSFI extends ManageMetadataBase {
   public executedSql: string[] = [];

   protected override async LogSQLBatchAndExecute(
      _pool: CodeGenConnection,
      sqlBatch: string[],
      _description: string,
      _throwError: boolean = false
   ): Promise<void> {
      this.executedSql.push(...sqlBatch);
   }

   public async testApplySmartFieldIdentification(
      pool: CodeGenConnection,
      entity: { ID: string; Name?: string; SchemaName?: string; AllowUserSearchAPI?: boolean; AutoUpdateAllowUserSearchAPI?: boolean; FullTextSearchEnabled?: boolean; AutoUpdateFullTextSearch?: boolean },
      fields: Array<Record<string, unknown>>,
      result: SmartFieldIdentificationResult,
      ctx?: { isNewEntity: boolean; newFieldNames: ReadonlySet<string>; typeReopenedNames: ReadonlySet<string> }
   ): Promise<void> {
      return this.applySmartFieldIdentification(pool, entity, fields, result, ctx);
   }

   public testIsFieldEligibleForUserSearch(field: Record<string, unknown>, ftxEnabled: boolean): boolean {
      return this.isFieldEligibleForUserSearch(field, ftxEnabled);
   }
}

function createDummyConnection(): CodeGenConnection {
   return {
      query: async () => ({ recordset: [] } as CodeGenQueryResult),
      queryWithParams: async () => ({ recordset: [] } as CodeGenQueryResult),
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
}

describe('T5 — Smart Field New-Field Scope (C4, §3.4)', () => {
   const pool = createDummyConnection();
   let mm: TestableManageMetadataForSFI;

   beforeEach(() => {
      mm = new TestableManageMetadataForSFI();
   });

   it('applySmartFieldIdentification only modifies in-scope fields on existing entities', async () => {
      const entity = {
         ID: 'entity-1',
         Name: 'Customer',
         SchemaName: 'dbo',
         AllowUserSearchAPI: true,
         AutoUpdateAllowUserSearchAPI: false,
         FullTextSearchEnabled: false,
      };

      const fields: Array<Record<string, unknown>> = [
         {
            ID: 'f-name',
            Name: 'Name',
            Type: 'nvarchar',
            Length: 100,
            IsPrimaryKey: false,
            DefaultInView: true,
            IncludeInUserSearchAPI: true,
            AutoUpdateDefaultInView: true,
            AutoUpdateIncludeInUserSearchAPI: true,
            IsNameField: true,
            AutoUpdateIsNameField: true,
            UserSearchPredicateAPI: 'StartsWith',
            AutoUpdateUserSearchPredicate: true,
         },
         {
            ID: 'f-status',
            Name: 'Status',
            Type: 'nvarchar',
            Length: 50,
            IsPrimaryKey: false,
            DefaultInView: true,
            IncludeInUserSearchAPI: false,
            AutoUpdateDefaultInView: true,
            AutoUpdateIncludeInUserSearchAPI: true,
            IsNameField: false,
            AutoUpdateIsNameField: true,
            UserSearchPredicateAPI: null,
            AutoUpdateUserSearchPredicate: true,
         },
         {
            ID: 'f-created',
            Name: 'CreatedAt',
            Type: 'datetime',
            Length: 8,
            IsPrimaryKey: false,
            DefaultInView: false,
            IncludeInUserSearchAPI: false,
            AutoUpdateDefaultInView: false,
            AutoUpdateIncludeInUserSearchAPI: false,
            IsNameField: false,
            AutoUpdateIsNameField: false,
            UserSearchPredicateAPI: null,
            AutoUpdateUserSearchPredicate: false,
         },
         {
            ID: 'f-alias',
            Name: 'Alias',
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
         },
      ];

      // LLM recommends:
      // - Alias for DefaultInView (does NOT list Status)
      // - Alias for searchableFields (does NOT list Name)
      // - Alias with predicate 'Contains' (which normalizePredicate rewrites to 'BeginsWith' for non-FTX)
      const sfiResult: SmartFieldIdentificationResult = {
         nameFields: ['Name'],
         defaultInView: ['Alias'],
         searchableFields: ['Alias'],
         searchPredicates: [{ field: 'Alias', predicate: 'Contains' }],
         confidence: 'high',
         reasoning: 'Alias is a great field for search and default view',
      };

      await mm.testApplySmartFieldIdentification(pool, entity, fields, sfiResult, {
         isNewEntity: false,
         newFieldNames: new Set(['Alias']),
         typeReopenedNames: new Set(),
      });

      // Assert: SQL updates are emitted ONLY for Alias (ID = 'f-alias')
      expect(mm.executedSql.length).toBeGreaterThan(0);
      for (const sql of mm.executedSql) {
         expect(sql).toContain("'f-alias'");
         expect(sql).not.toContain("'f-name'");
         expect(sql).not.toContain("'f-status'");
         expect(sql).not.toContain("'f-created'");
      }

      // Check specific updates for Alias
      const combinedSql = mm.executedSql.join('\n');
      expect(combinedSql).toContain('DefaultInView = 1');
      expect(combinedSql).toContain('IncludeInUserSearchAPI = 1');
      expect(combinedSql).toContain("UserSearchPredicateAPI = 'BeginsWith'");
   });

   it('validates MaxLength fix in isFieldEligibleForUserSearch', () => {
      // 1. MaxLength: 50 with Length: undefined -> passes
      const boundedField: Record<string, unknown> = {
         Name: 'Code',
         Type: 'nvarchar',
         MaxLength: 50,
         IsPrimaryKey: false,
      };
      expect(mm.testIsFieldEligibleForUserSearch(boundedField, false)).toBe(true);

      // 2. MaxLength: -1 without FTX -> rejected
      const unboundedNoFtx: Record<string, unknown> = {
         Name: 'Body',
         Type: 'nvarchar',
         MaxLength: -1,
         IsPrimaryKey: false,
      };
      expect(mm.testIsFieldEligibleForUserSearch(unboundedNoFtx, false)).toBe(false);

      // 3. MaxLength: -1 with FTX -> passes
      const unboundedWithFtx: Record<string, unknown> = {
         Name: 'Body',
         Type: 'nvarchar',
         MaxLength: -1,
         IsPrimaryKey: false,
      };
      expect(mm.testIsFieldEligibleForUserSearch(unboundedWithFtx, true)).toBe(true);
   });

   it('satisfies fixpoint property: running SFI a second time against post-run state emits 0 updates', async () => {
      const entity = {
         ID: 'entity-1',
         Name: 'Customer',
         SchemaName: 'dbo',
         AllowUserSearchAPI: true,
         AutoUpdateAllowUserSearchAPI: false,
         FullTextSearchEnabled: false,
      };

      // State of fields after the first run has applied the updates
      const postRunFields: Array<Record<string, unknown>> = [
         {
            ID: 'f-name',
            Name: 'Name',
            Type: 'nvarchar',
            Length: 100,
            IsPrimaryKey: false,
            DefaultInView: true,
            IncludeInUserSearchAPI: true,
            AutoUpdateDefaultInView: true,
            AutoUpdateIncludeInUserSearchAPI: true,
            IsNameField: true,
            AutoUpdateIsNameField: true,
            UserSearchPredicateAPI: 'StartsWith',
            AutoUpdateUserSearchPredicate: true,
         },
         {
            ID: 'f-alias',
            Name: 'Alias',
            Type: 'nvarchar',
            Length: 100,
            IsPrimaryKey: false,
            DefaultInView: true, // Already true
            IncludeInUserSearchAPI: true, // Already true
            AutoUpdateDefaultInView: true,
            AutoUpdateIncludeInUserSearchAPI: true,
            IsNameField: false,
            AutoUpdateIsNameField: true,
            UserSearchPredicateAPI: 'BeginsWith', // Already normalized value
            AutoUpdateUserSearchPredicate: true,
         },
      ];

      const sfiResult: SmartFieldIdentificationResult = {
         nameFields: ['Name'],
         defaultInView: ['Alias'],
         searchableFields: ['Alias'],
         searchPredicates: [{ field: 'Alias', predicate: 'Contains' }],
         confidence: 'high',
         reasoning: 'Alias is a great field for search and default view',
      };

      await mm.testApplySmartFieldIdentification(pool, entity, postRunFields, sfiResult, {
         isNewEntity: false,
         newFieldNames: new Set(['Alias']),
         typeReopenedNames: new Set(),
      });

      // Exactly 0 statements emitted on second pass
      expect(mm.executedSql.length).toBe(0);
   });
});
