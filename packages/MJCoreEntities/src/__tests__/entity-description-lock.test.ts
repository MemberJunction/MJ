import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/global';

// Mock RegisterClass before importing custom extended entities
vi.mock('@memberjunction/global', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/global')>();
   return {
      ...actual,
      RegisterClass: () => (target: unknown) => target,
   };
});

vi.mock('../generated/entity_subclasses', () => {
   class MockEntityFieldEntityBase {
      public NewRecord = false;
      public Name = 'TestField';
      public AutoUpdateDescription = true;
      protected _fields = new Map<string, { Value: unknown; Dirty: boolean }>();

      constructor() {
         this._fields.set('Description', { Value: 'Initial Field Description', Dirty: false });
         this._fields.set('AutoUpdateDescription', { Value: true, Dirty: false });

         const reflected = [
            'Name', 'Type', 'Length', 'Precision', 'Scale', 'IsPrimaryKey',
            'IsUnique', 'AllowsNull', 'IsVirtual', 'DefaultValue',
            'AutoIncrement', 'RelatedEntityID', 'RelatedEntityFieldName'
         ];
         for (const p of reflected) {
            this._fields.set(p, { Value: `val_${p}`, Dirty: false });
         }
      }

      public GetFieldByName(name: string): { Value: unknown; Dirty: boolean } | null {
         return this._fields.get(name) ?? null;
      }

      public Set(FieldName: string, Value: unknown): void {
         let field = this._fields.get(FieldName);
         if (!field) {
            field = { Value, Dirty: true };
            this._fields.set(FieldName, field);
         } else {
            field.Value = Value;
            field.Dirty = true;
         }
         if (FieldName.toLowerCase() === 'autoupdatedescription') {
            this.AutoUpdateDescription = Boolean(Value);
         }
      }

      public Validate(): ValidationResult {
         const res = new ValidationResult();
         res.Success = true;
         res.Errors = [];
         return res;
      }
   }

   class MockEntityEntityBase {
      public NewRecord = false;
      public Name = 'TestEntity';
      public AutoUpdateDescription = true;
      protected _fields = new Map<string, { Value: unknown; Dirty: boolean }>();

      constructor() {
         this._fields.set('Description', { Value: 'Initial Entity Description', Dirty: false });
         this._fields.set('AutoUpdateDescription', { Value: true, Dirty: false });
      }

      public GetFieldByName(name: string): { Value: unknown; Dirty: boolean } | null {
         return this._fields.get(name) ?? null;
      }

      public Set(FieldName: string, Value: unknown): void {
         let field = this._fields.get(FieldName);
         if (!field) {
            field = { Value, Dirty: true };
            this._fields.set(FieldName, field);
         } else {
            field.Value = Value;
            field.Dirty = true;
         }
         if (FieldName.toLowerCase() === 'autoupdatedescription') {
            this.AutoUpdateDescription = Boolean(Value);
         }
      }
   }

   return {
      MJEntityFieldEntity: MockEntityFieldEntityBase,
      MJEntityEntity: MockEntityEntityBase,
   };
});

import { MJEntityFieldEntityExtended } from '../custom/MJEntityFieldEntityExtended';
import { MJEntityEntityExtended } from '../custom/MJEntityEntityExtended';

interface TestableEntityFieldRecord {
   NewRecord: boolean;
   AutoUpdateDescription: boolean;
   Set(FieldName: string, Value: unknown): void;
   GetFieldByName(name: string): { Value: unknown; Dirty: boolean } | null;
   Validate(): ValidationResult;
}

interface TestableEntityRecord {
   NewRecord: boolean;
   AutoUpdateDescription: boolean;
   Set(FieldName: string, Value: unknown): void;
   GetFieldByName(name: string): { Value: unknown; Dirty: boolean } | null;
}

function createEntityField(isNew: boolean = false): TestableEntityFieldRecord {
   const Ctor = MJEntityFieldEntityExtended as unknown as new () => TestableEntityFieldRecord;
   const inst = new Ctor();
   inst.NewRecord = isNew;
   return inst;
}

function createEntity(isNew: boolean = false): TestableEntityRecord {
   const Ctor = MJEntityEntityExtended as unknown as new () => TestableEntityRecord;
   const inst = new Ctor();
   inst.NewRecord = isNew;
   return inst;
}

describe('T21 — AutoUpdateDescription Inversion Fix and Reflected Property Locks (C10)', () => {
   describe('MJEntityFieldEntityExtended', () => {
      it('Set("Description", different) on an existing record sets AutoUpdateDescription to false', () => {
         const entityField = createEntityField(false);
         entityField.AutoUpdateDescription = true;

         entityField.Set('Description', 'User Modified Description');

         expect(entityField.AutoUpdateDescription).toBe(false);
         expect(entityField.GetFieldByName('Description')?.Value).toBe('User Modified Description');
      });

      it('Set("Description", sameValue) leaves AutoUpdateDescription untouched', () => {
         const entityField = createEntityField(false);
         entityField.AutoUpdateDescription = true;

         entityField.Set('Description', 'Initial Field Description');

         expect(entityField.AutoUpdateDescription).toBe(true);
      });

      it('Set("Description", different) on a NewRecord leaves AutoUpdateDescription untouched', () => {
         const entityField = createEntityField(true);
         entityField.AutoUpdateDescription = true;

         entityField.Set('Description', 'Brand New Field Description');

         expect(entityField.AutoUpdateDescription).toBe(true);
      });

      it('Validate() passes when all reflected properties are clean', () => {
         const entityField = createEntityField(false);

         const result = entityField.Validate();
         expect(result.Success).toBe(true);
         expect(result.Errors.length).toBe(0);
      });

      const reflectedProperties = [
         'Name', 'Type', 'Length', 'Precision', 'Scale', 'IsPrimaryKey',
         'IsUnique', 'AllowsNull', 'IsVirtual', 'DefaultValue',
         'AutoIncrement', 'RelatedEntityID', 'RelatedEntityFieldName'
      ];

      it.each(reflectedProperties)('Validate() rejects a dirty value for reflected property: %s', (prop) => {
         const entityField = createEntityField(false);

         // Mark property dirty
         entityField.Set(prop, 'NewRestrictedValue');

         const result = entityField.Validate();
         expect(result.Success).toBe(false);
         const matchingError = result.Errors.find((e) => e.Source === prop);
         expect(matchingError).toBeDefined();
         expect(matchingError?.Message).toContain(`Cannot modify ${prop}`);
      });
   });

   describe('MJEntityEntityExtended', () => {
      it('Set("Description", different) on an existing record sets AutoUpdateDescription to false', () => {
         const entity = createEntity(false);
         entity.AutoUpdateDescription = true;

         entity.Set('Description', 'User Modified Entity Description');

         expect(entity.AutoUpdateDescription).toBe(false);
         expect(entity.GetFieldByName('Description')?.Value).toBe('User Modified Entity Description');
      });

      it('Set("Description", sameValue) leaves AutoUpdateDescription untouched', () => {
         const entity = createEntity(false);
         entity.AutoUpdateDescription = true;

         entity.Set('Description', 'Initial Entity Description');

         expect(entity.AutoUpdateDescription).toBe(true);
      });

      it('Set("Description", different) on a NewRecord leaves AutoUpdateDescription untouched', () => {
         const entity = createEntity(true);
         entity.AutoUpdateDescription = true;

         entity.Set('Description', 'Brand New Entity Description');

         expect(entity.AutoUpdateDescription).toBe(true);
      });
   });
});
