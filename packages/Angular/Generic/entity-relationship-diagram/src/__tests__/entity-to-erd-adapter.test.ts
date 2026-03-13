import { describe, it, expect } from 'vitest';
import {
  entityFieldToERDField,
  entityInfoToERDNode,
  entitiesToERDNodes,
  getOriginalEntityFromERDNode,
  findEntityByNodeId,
  buildERDDataFromEntities
} from '../lib/utils/entity-to-erd-adapter';
import type { ERDNode } from '../lib/interfaces/erd-types';

// Minimal mock of EntityFieldInfo for testing
function createMockField(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 'field-1',
    Name: 'TestField',
    Type: 'nvarchar',
    IsPrimaryKey: false,
    Description: 'A test field',
    AllowsNull: true,
    DefaultValue: null,
    Length: 100,
    Precision: 0,
    Scale: 0,
    IsVirtual: false,
    AutoIncrement: false,
    RelatedEntityID: null,
    RelatedEntity: null,
    RelatedEntityFieldName: null,
    EntityFieldValues: [],
    ...overrides
  };
}

function createMockEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: 'entity-1',
    Name: 'MJTestEntity',
    SchemaName: 'dbo',
    Description: 'A test entity',
    Status: 'Active',
    BaseTable: 'TestTable',
    Fields: [],
    RelatedEntities: [],
    ...overrides
  };
}

describe('entityFieldToERDField', () => {
  it('should convert basic field properties', () => {
    const field = createMockField();
    const erdField = entityFieldToERDField(field as never);

    expect(erdField.id).toBe('field-1');
    expect(erdField.name).toBe('TestField');
    expect(erdField.type).toBe('nvarchar');
    expect(erdField.isPrimaryKey).toBe(false);
    expect(erdField.description).toBe('A test field');
    expect(erdField.allowsNull).toBe(true);
    expect(erdField.length).toBe(100);
    expect(erdField.isVirtual).toBe(false);
    expect(erdField.autoIncrement).toBe(false);
  });

  it('should set related entity info for foreign keys', () => {
    const field = createMockField({
      RelatedEntityID: 'rel-entity-1',
      RelatedEntity: 'ParentEntity',
      RelatedEntityFieldName: 'ID'
    });
    const erdField = entityFieldToERDField(field as never);

    expect(erdField.relatedNodeId).toBe('rel-entity-1');
    expect(erdField.relatedNodeName).toBe('ParentEntity');
    expect(erdField.relatedFieldName).toBe('ID');
  });

  it('should not set related info for non-FK fields', () => {
    const field = createMockField({ RelatedEntityID: null });
    const erdField = entityFieldToERDField(field as never);

    expect(erdField.relatedNodeId).toBeUndefined();
    expect(erdField.relatedNodeName).toBeUndefined();
  });

  it('should convert EntityFieldValues to possibleValues', () => {
    const field = createMockField({
      EntityFieldValues: [
        { ID: 'v1', Value: 'Active', Code: 'A', Description: 'Active status', Sequence: 1 },
        { ID: 'v2', Value: 'Inactive', Code: 'I', Description: 'Inactive status', Sequence: 2 }
      ]
    });
    const erdField = entityFieldToERDField(field as never);

    expect(erdField.possibleValues).toHaveLength(2);
    expect(erdField.possibleValues![0].value).toBe('Active');
    expect(erdField.possibleValues![0].code).toBe('A');
    expect(erdField.possibleValues![1].sequence).toBe(2);
  });
});

describe('entityInfoToERDNode', () => {
  it('should convert entity to ERD node', () => {
    const entity = createMockEntity({
      Fields: [createMockField()]
    });
    const node = entityInfoToERDNode(entity as never);

    expect(node.id).toBe('entity-1');
    expect(node.name).toBe('MJTestEntity');
    expect(node.schemaName).toBe('dbo');
    expect(node.description).toBe('A test entity');
    expect(node.status).toBe('Active');
    expect(node.baseTable).toBe('TestTable');
    expect(node.fields).toHaveLength(1);
    expect(node.customData).toBeDefined();
    expect(node.customData!['originalEntity']).toBe(entity);
  });

  it('should convert all fields', () => {
    const entity = createMockEntity({
      Fields: [
        createMockField({ ID: 'f1', Name: 'ID', IsPrimaryKey: true }),
        createMockField({ ID: 'f2', Name: 'Name' }),
        createMockField({ ID: 'f3', Name: 'Status' })
      ]
    });
    const node = entityInfoToERDNode(entity as never);
    expect(node.fields).toHaveLength(3);
    expect(node.fields[0].isPrimaryKey).toBe(true);
  });
});

describe('entitiesToERDNodes', () => {
  it('should convert an array of entities', () => {
    const entities = [
      createMockEntity({ ID: 'e1', Name: 'Entity1' }),
      createMockEntity({ ID: 'e2', Name: 'Entity2' })
    ];
    const nodes = entitiesToERDNodes(entities as never[]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('Entity1');
    expect(nodes[1].name).toBe('Entity2');
  });

  it('should return empty array for empty input', () => {
    expect(entitiesToERDNodes([])).toEqual([]);
  });
});

describe('getOriginalEntityFromERDNode', () => {
  it('should extract entity from customData', () => {
    const entity = createMockEntity();
    const node = entityInfoToERDNode(entity as never);
    const extracted = getOriginalEntityFromERDNode(node);
    expect(extracted).toBe(entity);
  });

  it('should return null when no customData', () => {
    const node: ERDNode = {
      id: '1',
      name: 'Test',
      fields: []
    };
    expect(getOriginalEntityFromERDNode(node)).toBeNull();
  });

  it('should return null when customData has no originalEntity', () => {
    const node: ERDNode = {
      id: '1',
      name: 'Test',
      fields: [],
      customData: { other: 'data' }
    };
    expect(getOriginalEntityFromERDNode(node)).toBeNull();
  });
});

describe('findEntityByNodeId', () => {
  it('should find entity by ID', () => {
    const entities = [
      createMockEntity({ ID: 'e1' }),
      createMockEntity({ ID: 'e2' })
    ];
    const found = findEntityByNodeId('e2', entities as never[]);
    expect(found).toBe(entities[1]);
  });

  it('should return undefined when not found', () => {
    const entities = [createMockEntity({ ID: 'e1' })];
    expect(findEntityByNodeId('e99', entities as never[])).toBeUndefined();
  });
});

describe('buildERDDataFromEntities', () => {
  it('should build nodes from primary entities', () => {
    const entities = [
      createMockEntity({ ID: 'e1', Name: 'Entity1', Fields: [], RelatedEntities: [] })
    ];
    const result = buildERDDataFromEntities(entities as never[]);
    expect(result.nodes).toHaveLength(1);
    expect(result.links).toHaveLength(0);
  });

  it('should discover outgoing relationships', () => {
    const parentEntity = createMockEntity({
      ID: 'parent',
      Name: 'Parent',
      Fields: [createMockField({ ID: 'pk', Name: 'ID', IsPrimaryKey: true })],
      RelatedEntities: []
    });
    const childEntity = createMockEntity({
      ID: 'child',
      Name: 'Child',
      Fields: [
        createMockField({ ID: 'ck', Name: 'ID', IsPrimaryKey: true }),
        createMockField({ ID: 'fk', Name: 'ParentID', RelatedEntityID: 'parent' })
      ],
      RelatedEntities: []
    });

    const result = buildERDDataFromEntities(
      [childEntity as never],
      { allEntities: [parentEntity as never, childEntity as never], includeOutgoing: true, includeIncoming: false }
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].sourceNodeId).toBe('child');
    expect(result.links[0].targetNodeId).toBe('parent');
    expect(result.links[0].relationshipType).toBe('many-to-one');
  });

  it('should discover incoming relationships', () => {
    const parentEntity = createMockEntity({
      ID: 'parent',
      Name: 'Parent',
      Fields: [createMockField({ ID: 'pk', Name: 'ID', IsPrimaryKey: true })],
      RelatedEntities: [
        { RelatedEntity: 'Child', RelatedEntityJoinField: 'ParentID' }
      ]
    });
    const childEntity = createMockEntity({
      ID: 'child',
      Name: 'Child',
      Fields: [
        createMockField({ ID: 'ck', Name: 'ID', IsPrimaryKey: true }),
        createMockField({ ID: 'fk', Name: 'ParentID', RelatedEntityID: 'parent' })
      ],
      RelatedEntities: []
    });

    const result = buildERDDataFromEntities(
      [parentEntity as never],
      { allEntities: [parentEntity as never, childEntity as never], includeOutgoing: false, includeIncoming: true }
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].sourceNodeId).toBe('child');
    expect(result.links[0].targetNodeId).toBe('parent');
  });

  it('should not duplicate nodes or links', () => {
    const entity = createMockEntity({
      ID: 'e1',
      Name: 'Entity1',
      Fields: [createMockField({ ID: 'pk', Name: 'ID', IsPrimaryKey: true })],
      RelatedEntities: []
    });

    const result = buildERDDataFromEntities(
      [entity as never, entity as never],
      { allEntities: [entity as never] }
    );
    expect(result.nodes).toHaveLength(1);
  });

  it('should handle self-referencing entities', () => {
    const entity = createMockEntity({
      ID: 'e1',
      Name: 'Category',
      Fields: [
        createMockField({ ID: 'pk', Name: 'ID', IsPrimaryKey: true }),
        createMockField({ ID: 'fk', Name: 'ParentCategoryID', RelatedEntityID: 'e1' })
      ],
      RelatedEntities: []
    });

    const result = buildERDDataFromEntities(
      [entity as never],
      { allEntities: [entity as never], includeOutgoing: true }
    );
    expect(result.links).toHaveLength(1);
    expect(result.links[0].isSelfReference).toBe(true);
  });

  it('should handle empty entities array', () => {
    const result = buildERDDataFromEntities([]);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });
});
