/**
 * Unit tests for the QueryGen package.
 * Tests: graph-helpers, entity-helpers, category-builder, error-handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/core', () => ({
  EntityInfo: class {},
  EntityFieldInfo: class {},
  EntityRelationshipInfo: class {},
  UserInfo: class {},
  LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Prompts: [] } },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { generateRelationshipGraph, formatEntitiesForPrompt, generateMermaidDiagram } from '../utils/graph-helpers';
import { extractErrorMessage, requireValue, getPropertyOrDefault } from '../utils/error-handlers';
import { buildQueryCategory, extractUniqueCategories } from '../utils/category-builder';
import type { EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Helper to create mock EntityInfo objects
// ---------------------------------------------------------------------------

function createMockEntity(
  name: string,
  schemaName = 'dbo',
  relatedEntities: Partial<EntityRelationshipInfo>[] = [],
  fieldCount = 5
): EntityInfo {
  return {
    ID: `id-${name}`,
    Name: name,
    SchemaName: schemaName,
    Description: `Description of ${name}`,
    Fields: Array.from({ length: fieldCount }, (_, i) => ({
      Name: `Field${i}`,
      DisplayName: `Field ${i}`,
      Type: 'nvarchar',
      SQLFullType: 'nvarchar(100)',
      Description: '',
      IsPrimaryKey: i === 0,
      IsVirtual: false,
      AllowsNull: i > 0,
      RelatedEntityID: null,
      RelatedEntity: null,
      DefaultValue: null,
      EntityFieldValues: [],
      RelatedEntityFieldName: null,
    })),
    RelatedEntities: relatedEntities as EntityRelationshipInfo[],
    BaseView: `vw${name.replace(/\s/g, '')}`,
    BaseTable: name.replace(/\s/g, ''),
    PrimaryKeys: [{ Name: 'ID' }],
    FirstPrimaryKey: { Name: 'ID' },
    TrackRecordChanges: true,
  } as unknown as EntityInfo;
}

// ---------------------------------------------------------------------------
// 1. graph-helpers
// ---------------------------------------------------------------------------

describe('generateRelationshipGraph', () => {
  it('should produce text lines for entities with relationships', () => {
    const entities = [
      createMockEntity('Customers', 'dbo', [
        { RelatedEntity: 'Orders', Type: 'One To Many' } as Partial<EntityRelationshipInfo>,
      ]),
      createMockEntity('Orders', 'dbo', []),
    ];

    const graph = generateRelationshipGraph(entities as EntityInfo[]);
    expect(graph).toContain('Customers: \u2192 Orders');
    expect(graph).toContain('Orders: (no relationships)');
  });

  it('should handle entities with no relationships', () => {
    const entities = [createMockEntity('Standalone')];
    const graph = generateRelationshipGraph(entities as EntityInfo[]);
    expect(graph).toContain('Standalone: (no relationships)');
  });
});

describe('formatEntitiesForPrompt', () => {
  it('should format entity metadata correctly', () => {
    const entities = [createMockEntity('Users', 'auth')];
    const result = formatEntitiesForPrompt(entities as EntityInfo[]);
    expect(result).toHaveLength(1);
    expect(result[0].Name).toBe('Users');
    expect(result[0].SchemaName).toBe('auth');
    expect(result[0].FieldCount).toBe(5);
  });

  it('should default description for entities without one', () => {
    const entity = createMockEntity('NoDesc');
    (entity as Record<string, unknown>).Description = '';
    const result = formatEntitiesForPrompt([entity as EntityInfo]);
    expect(result[0].Description).toBe('No description available');
  });
});

describe('generateMermaidDiagram', () => {
  it('should produce mermaid graph syntax', () => {
    const entities = [
      createMockEntity('Customers', 'dbo', [
        { RelatedEntity: 'Orders', Type: 'One To Many' } as Partial<EntityRelationshipInfo>,
      ]),
      createMockEntity('Orders'),
    ];

    const diagram = generateMermaidDiagram(entities as EntityInfo[]);
    expect(diagram).toContain('graph LR');
    expect(diagram).toContain('Customers[Customers] --> Orders[Orders]');
  });

  it('should deduplicate bidirectional relationships', () => {
    const entities = [
      createMockEntity('A', 'dbo', [{ RelatedEntity: 'B', Type: 'One To Many' } as Partial<EntityRelationshipInfo>]),
      createMockEntity('B', 'dbo', [{ RelatedEntity: 'A', Type: 'Many To One' } as Partial<EntityRelationshipInfo>]),
    ];
    const diagram = generateMermaidDiagram(entities as EntityInfo[]);
    // Only one edge between A and B
    const edgeCount = (diagram.match(/-->/g) || []).length;
    expect(edgeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. error-handlers
// ---------------------------------------------------------------------------

describe('extractErrorMessage', () => {
  it('should extract from Error instance', () => {
    const msg = extractErrorMessage(new Error('boom'), 'TestContext');
    expect(msg).toBe('TestContext: boom');
  });

  it('should extract from string', () => {
    const msg = extractErrorMessage('string error', 'Ctx');
    expect(msg).toBe('Ctx: string error');
  });

  it('should handle unknown error type', () => {
    const msg = extractErrorMessage(42, 'Ctx');
    expect(msg).toBe('Ctx: Unknown error occurred');
  });
});

describe('requireValue', () => {
  it('should return value when present', () => {
    expect(requireValue('hello', 'field')).toBe('hello');
  });

  it('should throw for null', () => {
    expect(() => requireValue(null, 'myField')).toThrow("Required value 'myField' is missing");
  });

  it('should throw for undefined', () => {
    expect(() => requireValue(undefined, 'myField')).toThrow("Required value 'myField' is missing");
  });
});

describe('getPropertyOrDefault', () => {
  it('should return property value when present', () => {
    expect(getPropertyOrDefault({ x: 10 }, 'x', 0)).toBe(10);
  });

  it('should return default when property missing', () => {
    expect(getPropertyOrDefault({}, 'x', 42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// 3. category-builder
// ---------------------------------------------------------------------------

describe('buildQueryCategory', () => {
  it('should create entity-specific category when autoCreate is true', () => {
    const config = {
      autoCreateEntityQueryCategories: true,
      rootQueryCategory: 'Generated',
      minGroupSize: 1,
      maxGroupSize: 5,
      verbose: false,
    };

    const entityGroup = {
      primaryEntity: createMockEntity('Users'),
      entities: [createMockEntity('Users')],
      relationships: [],
      relationshipType: 'single' as const,
      businessDomain: 'Auth',
      businessRationale: 'User management',
      expectedQuestionTypes: [],
    };

    const cat = buildQueryCategory(config as Parameters<typeof buildQueryCategory>[0], entityGroup);
    expect(cat.name).toBe('Users');
    expect(cat.parentName).toBe('Generated');
    expect(cat.path).toBe('Generated/Users');
  });

  it('should use root-only category when autoCreate is false', () => {
    const config = {
      autoCreateEntityQueryCategories: false,
      rootQueryCategory: 'Auto-Generated',
      minGroupSize: 1,
      maxGroupSize: 5,
      verbose: false,
    };
    const entityGroup = {
      primaryEntity: createMockEntity('Users'),
      entities: [],
      relationships: [],
      relationshipType: 'single' as const,
      businessDomain: '',
      businessRationale: '',
      expectedQuestionTypes: [],
    };

    const cat = buildQueryCategory(config as Parameters<typeof buildQueryCategory>[0], entityGroup);
    expect(cat.name).toBe('Auto-Generated');
    expect(cat.parentName).toBeNull();
  });
});

describe('extractUniqueCategories', () => {
  it('should deduplicate categories by path', () => {
    const cats = [
      { name: 'Root', parentName: null, description: 'Root', path: 'Root' },
      { name: 'Root', parentName: null, description: 'Root', path: 'Root' },
      { name: 'Users', parentName: 'Root', description: 'Users', path: 'Root/Users' },
    ];

    const unique = extractUniqueCategories(cats);
    expect(unique).toHaveLength(2);
  });

  it('should auto-create parent categories', () => {
    const cats = [
      { name: 'Orders', parentName: 'Generated', description: 'Orders', path: 'Generated/Orders' },
    ];

    const unique = extractUniqueCategories(cats);
    // Should have both the parent 'Generated' and child 'Orders'
    expect(unique).toHaveLength(2);
    const parentCat = unique.find(c => c.name === 'Generated');
    expect(parentCat).toBeDefined();
    expect(parentCat!.parentName).toBeNull();
  });

  it('should sort root categories first', () => {
    const cats = [
      { name: 'Zeta', parentName: 'Alpha', description: '', path: 'Alpha/Zeta' },
      { name: 'Alpha', parentName: null, description: '', path: 'Alpha' },
    ];

    const sorted = extractUniqueCategories(cats);
    expect(sorted[0].name).toBe('Alpha');
    expect(sorted[1].name).toBe('Zeta');
  });
});
