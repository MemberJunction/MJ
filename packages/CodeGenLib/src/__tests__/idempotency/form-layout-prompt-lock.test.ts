import { describe, it, expect, beforeEach } from 'vitest';
import '../../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { AdvancedGeneration, FormLayoutResult } from '../../Misc/advanced_generation';
import { UserInfo, FieldCategoryInfo } from '@memberjunction/core';
import { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

class TestableAdvancedGeneration extends AdvancedGeneration {
   public lastParams: AIPromptParams | null = null;
   public mockResult: Partial<FormLayoutResult> | null = null;

   public override featureEnabled(_featureName: string): boolean {
      return true;
   }

   protected override async getPromptEntity(_promptName: string, _contextUser: UserInfo): Promise<MJAIPromptEntityExtended> {
      return { Name: 'CodeGen: Form Layout Generation' } as MJAIPromptEntityExtended;
   }

   protected override async executePrompt<T>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
      this.lastParams = params;
      return {
         success: true,
         result: (this.mockResult ?? {}) as T,
      } as AIPromptRunResult<T>;
   }
}

describe('T3 — Form Layout Prompt Lock & Incremental Context (C3, FM2)', () => {
   const dummyUser = new UserInfo();

   it('sets HasExistingCategory and IsNewField correctly across existing vs new entities and fields', async () => {
      const ag = new TestableAdvancedGeneration();
      ag.mockResult = {
         fieldCategories: [],
      };

      const entityData = {
         Name: 'Customer',
         Description: 'Customer entity',
         SchemaName: 'dbo',
         Settings: [
            {
               Name: 'FieldCategoryInfo',
               Value: JSON.stringify({
                  General: { icon: 'fa fa-user', description: 'General info' },
               }),
            },
         ],
         Fields: [
            {
               Name: 'ID',
               Category: 'General',
               AutoUpdateCategory: true,
               IsNew: false,
               DescriptionReopened: false,
               TypeReopened: false,
            },
            {
               Name: 'Notes',
               Category: null,
               AutoUpdateCategory: true,
               IsNew: false,
               DescriptionReopened: false,
               TypeReopened: false,
            },
            {
               Name: 'CustomField',
               Category: 'Custom',
               AutoUpdateCategory: false,
               IsNew: false,
               DescriptionReopened: false,
               TypeReopened: false,
            },
            {
               Name: 'NewlyAddedField',
               Category: null,
               AutoUpdateCategory: true,
               IsNew: true,
               DescriptionReopened: false,
               TypeReopened: false,
            },
         ],
      };

      // 1. Existing entity call (isNewEntity = false)
      await ag.generateFormLayout(entityData, dummyUser, false);

      expect(ag.lastParams).not.toBeNull();
      const fields = ag.lastParams!.data.fields as Array<{
         Name: string;
         HasExistingCategory: boolean;
         IsNewField: boolean;
         ReviewDisplayName: boolean;
         ReviewExtendedType: boolean;
      }>;

      const idField = fields.find(f => f.Name === 'ID')!;
      expect(idField.HasExistingCategory).toBe(true);
      expect(idField.IsNewField).toBe(false);

      const notesField = fields.find(f => f.Name === 'Notes')!;
      expect(notesField.HasExistingCategory).toBe(false);
      expect(notesField.IsNewField).toBe(false);

      const customField = fields.find(f => f.Name === 'CustomField')!;
      expect(customField.HasExistingCategory).toBe(true);
      expect(customField.IsNewField).toBe(false);

      const newField = fields.find(f => f.Name === 'NewlyAddedField')!;
      expect(newField.HasExistingCategory).toBe(false);
      expect(newField.IsNewField).toBe(true);

      // 2. New entity call (isNewEntity = true)
      await ag.generateFormLayout(entityData, dummyUser, true);
      const newEntityFields = ag.lastParams!.data.fields as Array<{
         Name: string;
         HasExistingCategory: boolean;
         IsNewField: boolean;
      }>;

      for (const f of newEntityFields) {
         expect(f.IsNewField).toBe(true);
      }
      const newEntityCustomField = newEntityFields.find(f => f.Name === 'CustomField')!;
      expect(newEntityCustomField.HasExistingCategory).toBe(true); // AutoUpdateCategory=false still locks
      const newEntityIdField = newEntityFields.find(f => f.Name === 'ID')!;
      expect(newEntityIdField.HasExistingCategory).toBe(false); // On new entity, non-blank is unlocked
   });

   it('passes both existingCategoryInfo and existingFieldCategoryInfo and they are equal', async () => {
      const ag = new TestableAdvancedGeneration();
      ag.mockResult = { fieldCategories: [] };

      const categorySettings: Record<string, FieldCategoryInfo> = {
         General: { icon: 'fa fa-user', description: 'General customer info' },
         Finance: { icon: 'fa fa-dollar', description: 'Billing and invoicing' },
      };

      const entityData = {
         Name: 'Invoice',
         Description: 'Invoice entity',
         SchemaName: 'dbo',
         FieldCategories: categorySettings,
         Settings: [
            {
               Name: 'FieldCategoryInfo',
               Value: JSON.stringify(categorySettings),
            },
         ],
         Fields: [
            { Name: 'ID', Category: 'General', AutoUpdateCategory: true },
         ],
      };

      await ag.generateFormLayout(entityData, dummyUser, false);

      const data = ag.lastParams!.data;
      expect(data.existingCategoryInfo).toBeDefined();
      expect(data.existingFieldCategoryInfo).toBeDefined();
      expect(data.existingCategoryInfo).toEqual(data.existingFieldCategoryInfo);
      expect(data.existingCategoryInfo).toEqual(categorySettings);
   });

   it('preserves existing categoryInfo entries verbatim and adds only new ones', async () => {
      const ag = new TestableAdvancedGeneration();

      const existingCategorySettings: Record<string, FieldCategoryInfo> = {
         General: { icon: 'fa-user-original', description: 'Original general description' },
      };

      ag.mockResult = {
         fieldCategories: [],
         categoryInfo: {
            General: { icon: 'fa-user-overwritten', description: 'LLM attempted overwrite' },
            Audit: { icon: 'fa-history', description: 'Audit trail' },
         },
      };

      const entityData = {
         Name: 'TestEntity',
         Description: 'Test',
         SchemaName: 'dbo',
         FieldCategories: existingCategorySettings,
         Settings: [
            {
               Name: 'FieldCategoryInfo',
               Value: JSON.stringify(existingCategorySettings),
            },
         ],
         Fields: [
            { Name: 'ID', Category: 'General', AutoUpdateCategory: true },
         ],
      };

      const layout = await ag.generateFormLayout(entityData, dummyUser, false);
      expect(layout).not.toBeNull();
      expect(layout!.categoryInfo).toBeDefined();

      // Original General must be preserved verbatim
      expect(layout!.categoryInfo!.General).toEqual({
         icon: 'fa-user-original',
         description: 'Original general description',
      });
      // New Audit category added
      expect(layout!.categoryInfo!.Audit).toEqual({
         icon: 'fa-history',
         description: 'Audit trail',
      });
   });

   it('defaults fieldCategories to [] when runner returns no fieldCategories', async () => {
      const ag = new TestableAdvancedGeneration();
      ag.mockResult = {
         // fieldCategories omitted / undefined
         entityIcon: 'fa fa-cube',
      };

      const entityData = {
         Name: 'Widget',
         Description: 'Widget entity',
         SchemaName: 'dbo',
         Settings: [],
         Fields: [
            { Name: 'ID', Category: null, AutoUpdateCategory: true },
         ],
      };

      const layout = await ag.generateFormLayout(entityData, dummyUser, false);
      expect(layout).not.toBeNull();
      expect(Array.isArray(layout!.fieldCategories)).toBe(true);
      expect(layout!.fieldCategories).toEqual([]);
   });
});
