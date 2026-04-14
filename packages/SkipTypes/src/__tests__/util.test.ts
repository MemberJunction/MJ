import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable Entities array used by the mocked Metadata.Provider so individual tests
// can stage related entities for organic-key resolution.
const mockMetadataEntities: Array<{ ID: string; Name: string; SchemaName: string; BaseView: string }> = [];

vi.mock('@memberjunction/core', () => ({
  EntityFieldInfo: class {},
  EntityFieldValueInfo: class {},
  EntityInfo: class {},
  EntityOrganicKeyInfo: class {},
  EntityOrganicKeyRelatedEntityInfo: class {},
  EntityRelationshipInfo: class {},
  Metadata: class {
    static get Provider() {
      return { Entities: mockMetadataEntities };
    }
  },
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
  MapEntityOrganicKeyInfoToSkipEntityOrganicKeyInfo,
  MapEntityOrganicKeyRelatedEntityInfoToSkipEntityOrganicKeyRelatedEntityInfo,
  MapEntityInfoToSkipEntityInfo,
  MapSimpleEntityInfoToSkipEntityInfo,
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
      expect(result.entity).toBe('MJ: Users');
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

  // ============================================================================
  // Organic key mapping
  // ============================================================================

  /**
   * Build a fake EntityOrganicKeyInfo with the same shape MJ's runtime emits.
   * Includes the *Array getters that the mapper relies on.
   */
  function makeOrganicKey(overrides: Record<string, unknown> = {}) {
    const base = {
      ID: 'ok-1',
      EntityID: 'ent-source',
      Name: 'EmailMatch',
      Description: 'Match members across systems by email address',
      MatchFieldNames: 'EmailAddress',
      NormalizationStrategy: 'LowerCaseTrim' as const,
      CustomNormalizationExpression: null,
      Sequence: 0,
      Status: 'Active' as const,
      RelatedEntities: [] as unknown[],
    };
    const merged = { ...base, ...overrides };
    // Mimic the MatchFieldNamesArray getter
    Object.defineProperty(merged, 'MatchFieldNamesArray', {
      get() {
        return this.MatchFieldNames ? this.MatchFieldNames.split(',').map((f: string) => f.trim()) : [];
      },
    });
    return merged;
  }

  /**
   * Build a fake EntityOrganicKeyRelatedEntityInfo with the runtime getters
   * (IsDirectMatch / IsTransitiveMatch / *Array) the mapper depends on.
   */
  function makeOrganicKeyRelatedEntity(overrides: Record<string, unknown> = {}) {
    const base = {
      ID: 'okre-1',
      EntityOrganicKeyID: 'ok-1',
      RelatedEntityID: 'ent-target',
      RelatedEntityFieldNames: null as string | null,
      TransitiveObjectName: null as string | null,
      TransitiveObjectMatchFieldNames: null as string | null,
      TransitiveObjectOutputFieldName: null as string | null,
      RelatedEntityJoinFieldName: null as string | null,
      DisplayName: null as string | null,
      Sequence: 0,
    };
    const merged = { ...base, ...overrides };
    Object.defineProperty(merged, 'IsDirectMatch', {
      get() { return this.RelatedEntityFieldNames != null; },
    });
    Object.defineProperty(merged, 'IsTransitiveMatch', {
      get() { return this.TransitiveObjectName != null; },
    });
    Object.defineProperty(merged, 'RelatedEntityFieldNamesArray', {
      get() {
        return this.RelatedEntityFieldNames ? this.RelatedEntityFieldNames.split(',').map((f: string) => f.trim()) : [];
      },
    });
    Object.defineProperty(merged, 'TransitiveObjectMatchFieldNamesArray', {
      get() {
        return this.TransitiveObjectMatchFieldNames ? this.TransitiveObjectMatchFieldNames.split(',').map((f: string) => f.trim()) : [];
      },
    });
    return merged;
  }

  describe('MapEntityOrganicKeyRelatedEntityInfoToSkipEntityOrganicKeyRelatedEntityInfo', () => {
    beforeEach(() => {
      mockMetadataEntities.length = 0;
    });

    it('should map a direct-match related entity using the metadata provider for schema/baseView', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const re = makeOrganicKeyRelatedEntity({
        ID: 'okre-direct',
        RelatedEntityID: 'ent-target',
        RelatedEntityFieldNames: 'EmailAddress',
        DisplayName: 'Members by Email',
        Sequence: 1,
      });

      const result = MapEntityOrganicKeyRelatedEntityInfoToSkipEntityOrganicKeyRelatedEntityInfo(re as never);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('okre-direct');
      expect(result!.relatedEntityID).toBe('ent-target');
      expect(result!.relatedEntityName).toBe('Members');
      expect(result!.relatedEntitySchemaName).toBe('ym');
      expect(result!.relatedEntityBaseView).toBe('vwMembers');
      expect(result!.isDirectMatch).toBe(true);
      expect(result!.isTransitiveMatch).toBe(false);
      expect(result!.relatedEntityFieldNames).toEqual(['EmailAddress']);
      expect(result!.transitiveObjectName).toBeUndefined();
      expect(result!.transitiveObjectMatchFieldNames).toBeUndefined();
      expect(result!.displayName).toBe('Members by Email');
      expect(result!.sequence).toBe(1);
    });

    it('should map a transitive-match related entity through a bridge view', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const re = makeOrganicKeyRelatedEntity({
        ID: 'okre-transitive',
        RelatedEntityID: 'ent-target',
        RelatedEntityFieldNames: null,
        TransitiveObjectName: 'ym.vwAcronymToMember',
        TransitiveObjectMatchFieldNames: 'Acronym',
        TransitiveObjectOutputFieldName: 'MemberID',
        RelatedEntityJoinFieldName: 'ID',
        Sequence: 2,
      });

      const result = MapEntityOrganicKeyRelatedEntityInfoToSkipEntityOrganicKeyRelatedEntityInfo(re as never);
      expect(result).not.toBeNull();
      expect(result!.isDirectMatch).toBe(false);
      expect(result!.isTransitiveMatch).toBe(true);
      // For transitive matches, relatedEntityFieldNames must be undefined (not [])
      expect(result!.relatedEntityFieldNames).toBeUndefined();
      expect(result!.transitiveObjectName).toBe('ym.vwAcronymToMember');
      expect(result!.transitiveObjectMatchFieldNames).toEqual(['Acronym']);
      expect(result!.transitiveObjectOutputFieldName).toBe('MemberID');
      expect(result!.relatedEntityJoinFieldName).toBe('ID');
    });

    it('should support compound match field names (comma-separated)', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'People', SchemaName: 'crm', BaseView: 'vwPeople' });
      const re = makeOrganicKeyRelatedEntity({
        RelatedEntityID: 'ent-target',
        RelatedEntityFieldNames: 'FirstName, LastName, DateOfBirth',
      });

      const result = MapEntityOrganicKeyRelatedEntityInfoToSkipEntityOrganicKeyRelatedEntityInfo(re as never);
      expect(result!.relatedEntityFieldNames).toEqual(['FirstName', 'LastName', 'DateOfBirth']);
    });

    it('should return null when the related entity is not in the metadata provider', () => {
      // mockMetadataEntities is empty
      const re = makeOrganicKeyRelatedEntity({
        RelatedEntityID: 'ent-missing',
        RelatedEntityFieldNames: 'Email',
      });

      const result = MapEntityOrganicKeyRelatedEntityInfoToSkipEntityOrganicKeyRelatedEntityInfo(re as never);
      expect(result).toBeNull();
    });
  });

  describe('MapEntityOrganicKeyInfoToSkipEntityOrganicKeyInfo', () => {
    beforeEach(() => {
      mockMetadataEntities.length = 0;
    });

    it('should map basic organic key properties and parse comma-separated match field names', () => {
      const ok = makeOrganicKey({
        ID: 'ok-acronym',
        Name: 'AcronymMatch',
        Description: 'Match MEL rows to a Member by acronym',
        MatchFieldNames: 'MemberOrganization',
        NormalizationStrategy: 'LowerCaseTrim',
        Sequence: 5,
      });

      const result = MapEntityOrganicKeyInfoToSkipEntityOrganicKeyInfo(ok as never);
      expect(result.id).toBe('ok-acronym');
      expect(result.name).toBe('AcronymMatch');
      expect(result.description).toBe('Match MEL rows to a Member by acronym');
      expect(result.matchFieldNames).toEqual(['MemberOrganization']);
      expect(result.normalizationStrategy).toBe('LowerCaseTrim');
      expect(result.customNormalizationExpression).toBeUndefined();
      expect(result.sequence).toBe(5);
      expect(result.relatedEntities).toEqual([]);
    });

    it('should preserve a custom normalization expression', () => {
      const ok = makeOrganicKey({
        NormalizationStrategy: 'Custom',
        CustomNormalizationExpression: 'REPLACE(LOWER({{FieldName}}), \' \', \'\')',
      });

      const result = MapEntityOrganicKeyInfoToSkipEntityOrganicKeyInfo(ok as never);
      expect(result.normalizationStrategy).toBe('Custom');
      expect(result.customNormalizationExpression).toBe('REPLACE(LOWER({{FieldName}}), \' \', \'\')');
    });

    it('should drop related entities whose target entity is not in metadata, keeping resolvable ones', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const ok = makeOrganicKey({
        RelatedEntities: [
          makeOrganicKeyRelatedEntity({ ID: 're-good', RelatedEntityID: 'ent-target', RelatedEntityFieldNames: 'EmailAddress' }),
          makeOrganicKeyRelatedEntity({ ID: 're-bad', RelatedEntityID: 'ent-missing', RelatedEntityFieldNames: 'EmailAddress' }),
        ],
      });

      const result = MapEntityOrganicKeyInfoToSkipEntityOrganicKeyInfo(ok as never);
      expect(result.relatedEntities).toHaveLength(1);
      expect(result.relatedEntities[0].id).toBe('re-good');
    });

    it('should support compound match field names', () => {
      const ok = makeOrganicKey({
        MatchFieldNames: 'FirstName, LastName, DateOfBirth',
      });
      const result = MapEntityOrganicKeyInfoToSkipEntityOrganicKeyInfo(ok as never);
      expect(result.matchFieldNames).toEqual(['FirstName', 'LastName', 'DateOfBirth']);
    });
  });

  describe('MapEntityInfoToSkipEntityInfo organic key handling', () => {
    beforeEach(() => {
      mockMetadataEntities.length = 0;
    });

    function makeEntityInfo(overrides: Record<string, unknown> = {}) {
      return {
        ID: 'ent-source',
        Name: 'MemberEngagementLog',
        Description: 'Member engagement events',
        SchemaName: 'document',
        BaseView: 'vwMemberEngagementLog',
        Fields: [],
        RelatedEntities: [],
        OrganicKeys: [],
        RowsToPackWithSchema: 'None',
        RowsToPackSampleMethod: 'top n',
        ...overrides,
      };
    }

    it('should emit an empty organicKeys array when the entity has no organic keys', () => {
      const result = MapEntityInfoToSkipEntityInfo(makeEntityInfo() as never);
      expect(result.organicKeys).toEqual([]);
    });

    it('should emit an empty organicKeys array when OrganicKeys property is missing entirely', () => {
      const result = MapEntityInfoToSkipEntityInfo(makeEntityInfo({ OrganicKeys: undefined }) as never);
      expect(result.organicKeys).toEqual([]);
    });

    it('should filter out organic keys with Status=Disabled', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const activeKey = makeOrganicKey({
        ID: 'ok-active',
        Status: 'Active',
        RelatedEntities: [makeOrganicKeyRelatedEntity({ RelatedEntityID: 'ent-target', RelatedEntityFieldNames: 'EmailAddress' })],
      });
      const disabledKey = makeOrganicKey({
        ID: 'ok-disabled',
        Status: 'Disabled',
        RelatedEntities: [makeOrganicKeyRelatedEntity({ RelatedEntityID: 'ent-target', RelatedEntityFieldNames: 'EmailAddress' })],
      });

      const result = MapEntityInfoToSkipEntityInfo(makeEntityInfo({ OrganicKeys: [activeKey, disabledKey] }) as never);
      expect(result.organicKeys).toHaveLength(1);
      expect(result.organicKeys[0].id).toBe('ok-active');
    });

    it('should serialize a fully-populated organic key end-to-end', () => {
      mockMetadataEntities.push({ ID: 'ent-target', Name: 'Members', SchemaName: 'ym', BaseView: 'vwMembers' });
      const ok = makeOrganicKey({
        ID: 'ok-1',
        Name: 'AcronymMatch',
        MatchFieldNames: 'MemberOrganization',
        NormalizationStrategy: 'LowerCaseTrim',
        RelatedEntities: [
          makeOrganicKeyRelatedEntity({
            RelatedEntityID: 'ent-target',
            TransitiveObjectName: 'ym.vwAcronymToMember',
            TransitiveObjectMatchFieldNames: 'Acronym',
            TransitiveObjectOutputFieldName: 'MemberID',
            RelatedEntityJoinFieldName: 'ID',
          }),
        ],
      });

      const result = MapEntityInfoToSkipEntityInfo(makeEntityInfo({ OrganicKeys: [ok] }) as never);
      expect(result.organicKeys).toHaveLength(1);
      const skipKey = result.organicKeys[0];
      expect(skipKey.name).toBe('AcronymMatch');
      expect(skipKey.matchFieldNames).toEqual(['MemberOrganization']);
      expect(skipKey.relatedEntities).toHaveLength(1);
      const target = skipKey.relatedEntities[0];
      expect(target.relatedEntityName).toBe('Members');
      expect(target.relatedEntitySchemaName).toBe('ym');
      expect(target.relatedEntityBaseView).toBe('vwMembers');
      expect(target.isTransitiveMatch).toBe(true);
      expect(target.transitiveObjectName).toBe('ym.vwAcronymToMember');
    });
  });

  describe('MapSimpleEntityInfoToSkipEntityInfo', () => {
    it('should emit an empty organicKeys array (SimpleEntityInfo has no organic key concept)', () => {
      const simple = { name: 'Test', description: 'desc', fields: [] };
      const result = MapSimpleEntityInfoToSkipEntityInfo(simple as never);
      expect(result.organicKeys).toEqual([]);
    });
  });
});
