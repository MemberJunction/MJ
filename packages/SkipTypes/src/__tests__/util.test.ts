import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  EntityFieldInfo: class {},
  EntityFieldValueInfo: class {},
  EntityInfo: class {},
  EntityRelationshipInfo: class {},
}));

vi.mock('@memberjunction/interactive-component-types', () => ({
  SimpleEntityInfo: class {
    name: string;
    description: string;
    fields: unknown[];
    constructor(init?: Record<string, unknown>) {
      this.name = (init?.name as string) ?? '';
      this.description = (init?.description as string) ?? '';
      this.fields = (init?.fields as unknown[]) ?? [];
    }
  },
  SimpleEntityFieldInfo: class {
    name: string;
    sequence?: number;
    type?: string;
    allowsNull?: boolean;
    isPrimaryKey?: boolean;
    description?: string;
    defaultInView?: boolean;
    possibleValues?: unknown[];
    constructor(init?: Record<string, unknown>) {
      this.name = (init?.name as string) ?? '';
      this.sequence = init?.sequence as number;
      this.type = init?.type as string;
      this.allowsNull = init?.allowsNull as boolean;
      this.isPrimaryKey = init?.isPrimaryKey as boolean;
      this.description = init?.description as string;
      this.defaultInView = init?.defaultInView as boolean;
      this.possibleValues = init?.possibleValues as unknown[];
    }
  },
}));

import {
  MapEntityFieldInfoToSkipEntityFieldInfo,
  MapEntityFieldValueInfoToSkipEntityFieldValueInfo,
  MapEntityRelationshipInfoToSkipEntityRelationshipInfo,
  skipEntityHasField,
  skipEntityGetField,
  skipEntityGetFieldNameSet,
  MapSimpleEntityFieldInfoToSkipEntityFieldInfo,
  MapSkipEntityFieldInfoToSimpleEntityFieldInfo,
} from '../util';

import type { SkipEntityInfo, SkipEntityFieldInfo } from '../entity-metadata-types';

describe('SkipTypes util', () => {
  describe('MapEntityFieldInfoToSkipEntityFieldInfo', () => {
    it('should map EntityFieldInfo properties to SkipEntityFieldInfo', () => {
      const field = {
        EntityID: 'ent-1',
        Sequence: 1,
        Name: 'FirstName',
        DisplayName: 'First Name',
        Description: 'First name of the user',
        IsPrimaryKey: false,
        IsUnique: false,
        Category: null,
        Type: 'nvarchar',
        Length: 100,
        Precision: 0,
        Scale: 0,
        SQLFullType: 'nvarchar(100)',
        AllowsNull: true,
        DefaultValue: '',
        AutoIncrement: false,
        ValueListType: null,
        ExtendedType: null,
        DefaultInView: true,
        DefaultColumnWidth: 150,
        IsVirtual: false,
        IsNameField: true,
        RelatedEntityID: null,
        RelatedEntityFieldName: null,
        RelatedEntity: null,
        RelatedEntitySchemaName: null,
        RelatedEntityBaseView: null,
        EntityFieldValues: [{ Value: 'Active', Code: 'Active' }],
      };

      const result = MapEntityFieldInfoToSkipEntityFieldInfo(field as never);
      expect(result.name).toBe('FirstName');
      expect(result.displayName).toBe('First Name');
      expect(result.type).toBe('nvarchar');
      expect(result.isNameField).toBe(true);
      expect(result.possibleValues).toHaveLength(1);
    });
  });

  describe('MapEntityFieldValueInfoToSkipEntityFieldValueInfo', () => {
    it('should map value info', () => {
      const pv = { Value: 'Active' };
      const result = MapEntityFieldValueInfoToSkipEntityFieldValueInfo(pv as never);
      expect(result.value).toBe('Active');
      expect(result.displayValue).toBe('Active');
    });
  });

  describe('MapEntityRelationshipInfoToSkipEntityRelationshipInfo', () => {
    it('should map relationship properties', () => {
      const re = {
        EntityID: 'ent-1',
        Entity: 'MJ: Users',
        EntityBaseView: 'vwUsers',
        EntityKeyField: 'ID',
        RelatedEntityID: 'ent-2',
        RelatedEntityJoinField: 'UserID',
        RelatedEntityBaseView: 'vwOrders',
        RelatedEntity: 'Orders',
        Type: 'OneToMany',
        JoinEntityInverseJoinField: '',
        JoinView: '',
        JoinEntityJoinField: '',
      };

      const result = MapEntityRelationshipInfoToSkipEntityRelationshipInfo(re as never);
      expect(result.entity).toBe('Users');
      expect(result.relatedEntity).toBe('Orders');
      expect(result.type).toBe('OneToMany');
    });
  });

  describe('skipEntityHasField', () => {
    it('should return true when field exists', () => {
      const entity: SkipEntityInfo = {
        id: 'e1',
        name: 'Test',
        description: '',
        schemaName: 'dbo',
        baseView: 'vwTest',
        fields: [
          { name: 'ID', entityID: 'e1', type: 'uniqueidentifier' } as SkipEntityFieldInfo,
        ],
        relatedEntities: [],
      };
      expect(skipEntityHasField(entity, 'ID')).toBe(true);
    });

    it('should return false when field does not exist', () => {
      const entity: SkipEntityInfo = {
        id: 'e1',
        name: 'Test',
        description: '',
        schemaName: 'dbo',
        baseView: 'vwTest',
        fields: [],
        relatedEntities: [],
      };
      expect(skipEntityHasField(entity, 'Name')).toBe(false);
    });
  });

  describe('skipEntityGetField', () => {
    it('should return the field when it exists', () => {
      const field = { name: 'ID', entityID: 'e1', type: 'uniqueidentifier' } as SkipEntityFieldInfo;
      const entity: SkipEntityInfo = {
        id: 'e1',
        name: 'Test',
        description: '',
        schemaName: 'dbo',
        baseView: 'vwTest',
        fields: [field],
        relatedEntities: [],
      };
      expect(skipEntityGetField(entity, 'ID')).toBe(field);
    });

    it('should return undefined when field does not exist', () => {
      const entity: SkipEntityInfo = {
        id: 'e1',
        name: 'Test',
        description: '',
        schemaName: 'dbo',
        baseView: 'vwTest',
        fields: [],
        relatedEntities: [],
      };
      expect(skipEntityGetField(entity, 'Missing')).toBeUndefined();
    });
  });

  describe('skipEntityGetFieldNameSet', () => {
    it('should return a Set of field names', () => {
      const entity: SkipEntityInfo = {
        id: 'e1',
        name: 'Test',
        description: '',
        schemaName: 'dbo',
        baseView: 'vwTest',
        fields: [
          { name: 'ID' } as SkipEntityFieldInfo,
          { name: 'Name' } as SkipEntityFieldInfo,
        ],
        relatedEntities: [],
      };
      const set = skipEntityGetFieldNameSet(entity);
      expect(set).toBeInstanceOf(Set);
      expect(set.has('ID')).toBe(true);
      expect(set.has('Name')).toBe(true);
      expect(set.has('Missing')).toBe(false);
    });
  });

  describe('MapSimpleEntityFieldInfoToSkipEntityFieldInfo', () => {
    it('should map simple field info to skip field info', () => {
      const simple = {
        name: 'Email',
        sequence: 3,
        type: 'nvarchar',
        allowsNull: false,
        isPrimaryKey: false,
        description: 'Email address',
        defaultInView: true,
        possibleValues: ['a@b.com'],
      };
      const result = MapSimpleEntityFieldInfoToSkipEntityFieldInfo(simple as never);
      expect(result.name).toBe('Email');
      expect(result.sequence).toBe(3);
      expect(result.possibleValues).toHaveLength(1);
    });
  });

  describe('MapSkipEntityFieldInfoToSimpleEntityFieldInfo', () => {
    it('should map skip field info back to simple field info', () => {
      const skipField: SkipEntityFieldInfo = {
        entityID: 'e1',
        sequence: 1,
        name: 'ID',
        displayName: 'ID',
        description: 'Primary key',
        isPrimaryKey: true,
        isUnique: true,
        type: 'uniqueidentifier',
        length: 16,
        precision: 0,
        scale: 0,
        allowsNull: false,
        defaultValue: '',
        autoIncrement: false,
        defaultInView: true,
        defaultColumnWidth: 100,
        isVirtual: false,
        isNameField: false,
        possibleValues: [{ value: 'val1' }],
      };
      const result = MapSkipEntityFieldInfoToSimpleEntityFieldInfo(skipField);
      expect(result.name).toBe('ID');
      expect(result.isPrimaryKey).toBe(true);
    });
  });
});
