import { describe, it, expect, beforeEach } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { ManageMetadataBase } from '../../Database/manage-metadata';
import { AdvancedGeneration, FormLayoutResult, SmartFieldIdentificationResult } from '../../Misc/advanced_generation';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { CodeGenReporter } from '../../Misc/codegen-reporter';
import { CodeGenConnection, CodeGenQueryResult } from '../../Database/codeGenDatabaseProvider';

class StubAdvancedGeneration extends AdvancedGeneration {
   public identifyFieldsCalls: Array<{ entity: unknown }> = [];
   public generateFormLayoutCalls: Array<{ entity: unknown; isNewEntity: boolean }> = [];
   public circuitOpen = false;

   public override get AICircuitOpen(): boolean {
      return this.circuitOpen;
   }

   public override async identifyFields(entity: unknown, _currentUser: UserInfo): Promise<SmartFieldIdentificationResult | null> {
      this.identifyFieldsCalls.push({ entity });
      return {
         nameFields: ['Name'],
         nameFieldsReason: 'Test',
         defaultInView: ['Name'],
         defaultInViewReason: 'Test',
         searchableFields: ['Name'],
         searchableFieldsReason: 'Test',
         confidence: 'high',
         reasoning: 'Test',
      };
   }

   public override async generateFormLayout(
      entity: unknown,
      _currentUser: UserInfo,
      isNewEntity: boolean
   ): Promise<FormLayoutResult | null> {
      this.generateFormLayoutCalls.push({ entity, isNewEntity });
      return {
         fieldCategories: [],
      };
   }
}

class TestableManageMetadataForGates extends ManageMetadataBase {
   public sfiCalls: Array<{ ctx?: { isNewEntity: boolean; newFieldNames: ReadonlySet<string>; typeReopenedNames: ReadonlySet<string> } }> = [];
   public formLayoutCalls: Array<{ isNewEntity: boolean }> = [];

   public async callProcessEntityAdvancedGeneration(
      pool: CodeGenConnection,
      entity: EntityInfo,
      fieldsByEntity: Map<string, any[]>,
      ag: AdvancedGeneration,
      currentUser: UserInfo
   ): Promise<void> {
      return this.processEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, currentUser);
   }

   protected override async applySmartFieldIdentification(
      _pool: CodeGenConnection,
      _entity: any,
      _fields: any[],
      _result: SmartFieldIdentificationResult,
      ctx?: { isNewEntity: boolean; newFieldNames: ReadonlySet<string>; typeReopenedNames: ReadonlySet<string> }
   ): Promise<void> {
      this.sfiCalls.push({ ctx });
   }

   protected override async applyFormLayout(
      _pool: CodeGenConnection,
      _entity: EntityInfo,
      _fields: any[],
      _result: FormLayoutResult,
      isNewEntity: boolean = false
   ): Promise<void> {
      this.formLayoutCalls.push({ isNewEntity });
   }
}

function createDummyConnection(): CodeGenConnection {
   return {
      query: async () => ({ recordset: [] } as CodeGenQueryResult),
      queryWithParams: async () => ({ recordset: [] } as CodeGenQueryResult),
      beginTransaction: async () => ({ commit: async () => {}, rollback: async () => {} }),
   };
}

describe('T4 — Advanced Generation Gates (C3, FM4, §3.4)', () => {
   const dummyUser = new UserInfo();
   const pool = createDummyConnection();
   let mm: TestableManageMetadataForGates;
   let ag: StubAdvancedGeneration;

   const baseFields = [
      {
         ID: 'f-1',
         EntityID: 'entity-1',
         Name: 'ID',
         Category: 'General',
         AutoUpdateCategory: true,
         AutoUpdateIsNameField: true,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         AutoUpdateUserSearchPredicate: true,
         AutoUpdateFullTextSearch: true,
      },
      {
         ID: 'f-2',
         EntityID: 'entity-1',
         Name: 'Name',
         Category: 'General',
         AutoUpdateCategory: true,
         AutoUpdateIsNameField: true,
         AutoUpdateDefaultInView: true,
         AutoUpdateIncludeInUserSearchAPI: true,
         AutoUpdateUserSearchPredicate: true,
         AutoUpdateFullTextSearch: true,
      },
   ];

   beforeEach(() => {
      ManageMetadataBase.clearFieldTracking();
      ManageMetadataBase.newEntityList = [];
      CodeGenReporter.Instance.startRun();
      mm = new TestableManageMetadataForGates();
      ag = new StubAdvancedGeneration();
   });

   it('existing entity, no new/re-opened fields, all categorized → neither LLM path invoked', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', baseFields.map(f => ({ ...f }))],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(0);
      expect(ag.generateFormLayoutCalls.length).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls'] ?? 0).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls'] ?? 0).toBe(0);
   });

   it('existing entity + one new field → SFI invoked with newFieldNames, Form Layout with isNewEntity=false', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      ManageMetadataBase.registerNewField('entity-1', 'Notes');

      const fields = [
         ...baseFields.map(f => ({ ...f })),
         {
            ID: 'f-3',
            EntityID: 'entity-1',
            Name: 'Notes',
            Category: null,
            AutoUpdateCategory: true,
            AutoUpdateIsNameField: false,
            AutoUpdateDefaultInView: true,
            AutoUpdateIncludeInUserSearchAPI: true,
            AutoUpdateUserSearchPredicate: true,
            AutoUpdateFullTextSearch: true,
         },
      ];
      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', fields],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(1);
      expect(ag.generateFormLayoutCalls.length).toBe(1);
      expect(ag.generateFormLayoutCalls[0].isNewEntity).toBe(false);

      expect(mm.sfiCalls.length).toBe(1);
      expect(mm.sfiCalls[0].ctx?.isNewEntity).toBe(false);
      expect(mm.sfiCalls[0].ctx?.newFieldNames.has('Notes')).toBe(true);

      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls']).toBe(1);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls']).toBe(1);
   });

   it('new entity → both invoked with isNewEntity=true', async () => {
      const entity = new EntityInfo({ ID: 'entity-new', Name: 'NewEntity' });
      ManageMetadataBase.newEntityList.push('NewEntity');

      const fieldsByEntity = new Map<string, any[]>([
         ['entity-new', baseFields.map(f => ({ ...f, EntityID: 'entity-new', Category: null }))],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(1);
      expect(ag.generateFormLayoutCalls.length).toBe(1);
      expect(ag.generateFormLayoutCalls[0].isNewEntity).toBe(true);

      expect(mm.sfiCalls[0].ctx?.isNewEntity).toBe(true);
      expect(mm.formLayoutCalls[0].isNewEntity).toBe(true);

      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls']).toBe(1);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls']).toBe(1);
   });

   it('existing entity with a blank old field and no new fields → Form Layout only', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      const fields = [
         { ...baseFields[0] },
         { ...baseFields[1], Category: null }, // Blank Category
      ];
      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', fields],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(0);
      expect(ag.generateFormLayoutCalls.length).toBe(1);
      expect(ag.generateFormLayoutCalls[0].isNewEntity).toBe(false);

      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls'] ?? 0).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls']).toBe(1);
   });

   it('Description-reopened field only → Form Layout only, prompt data marks ReviewDisplayName', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      ManageMetadataBase.registerFieldChange('entity-1', 'Name', ['Description']);

      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', baseFields.map(f => ({ ...f }))],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(0);
      expect(ag.generateFormLayoutCalls.length).toBe(1);

      const passedEntity = ag.generateFormLayoutCalls[0].entity as { Fields: Array<{ Name: string; DescriptionReopened?: boolean; TypeReopened?: boolean }> };
      const nameField = passedEntity.Fields.find(f => f.Name === 'Name')!;
      expect(nameField.DescriptionReopened).toBe(true);
      expect(nameField.TypeReopened).toBe(false);

      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls'] ?? 0).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls']).toBe(1);
   });

   it('Type-reopened field only → both paths, prompt marks ReviewExtendedType', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      ManageMetadataBase.registerFieldChange('entity-1', 'Name', ['Type']);

      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', baseFields.map(f => ({ ...f }))],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(1);
      expect(ag.generateFormLayoutCalls.length).toBe(1);

      const passedEntity = ag.generateFormLayoutCalls[0].entity as { Fields: Array<{ Name: string; DescriptionReopened?: boolean; TypeReopened?: boolean }> };
      const nameField = passedEntity.Fields.find(f => f.Name === 'Name')!;
      expect(nameField.TypeReopened).toBe(true);
      expect(nameField.DescriptionReopened).toBe(false);

      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls']).toBe(1);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls']).toBe(1);
   });

   it('Sequence-only change → neither path invoked', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      ManageMetadataBase.registerFieldChange('entity-1', 'Name', ['Sequence']);

      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', baseFields.map(f => ({ ...f }))],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(0);
      expect(ag.generateFormLayoutCalls.length).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls'] ?? 0).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls'] ?? 0).toBe(0);
   });

   it('AICircuitOpen → nothing invoked', async () => {
      const entity = new EntityInfo({ ID: 'entity-1', Name: 'Customer' });
      ManageMetadataBase.newEntityList.push('Customer');
      ag.circuitOpen = true;

      const fieldsByEntity = new Map<string, any[]>([
         ['entity-1', baseFields.map(f => ({ ...f }))],
      ]);

      await mm.callProcessEntityAdvancedGeneration(pool, entity, fieldsByEntity, ag, dummyUser);

      expect(ag.identifyFieldsCalls.length).toBe(0);
      expect(ag.generateFormLayoutCalls.length).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.smartFieldCalls'] ?? 0).toBe(0);
      expect(CodeGenReporter.Instance.counters['ai.formLayoutCalls'] ?? 0).toBe(0);
   });
});
