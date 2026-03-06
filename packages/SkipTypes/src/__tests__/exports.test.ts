import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  EntityFieldInfo: class {},
  EntityFieldValueInfo: class {},
  EntityInfo: class {},
  EntityRelationshipInfo: class {},
}));

vi.mock('@memberjunction/interactive-component-types', () => ({
  SimpleEntityInfo: class {
    constructor() {}
  },
  SimpleEntityFieldInfo: class {
    constructor() {}
  },
}));

import * as index from '../index';

describe('SkipTypes exports', () => {
  it('should export utility functions', () => {
    expect(typeof index.MapEntityFieldInfoToSkipEntityFieldInfo).toBe('function');
    expect(typeof index.MapEntityFieldValueInfoToSkipEntityFieldValueInfo).toBe('function');
    expect(typeof index.MapEntityRelationshipInfoToSkipEntityRelationshipInfo).toBe('function');
    expect(typeof index.skipEntityHasField).toBe('function');
    expect(typeof index.skipEntityGetField).toBe('function');
    expect(typeof index.skipEntityGetFieldNameSet).toBe('function');
    expect(typeof index.MapEntityInfoToSkipEntityInfo).toBe('function');
    expect(typeof index.MapEntityInfoArrayToSkipEntityInfoArray).toBe('function');
    expect(typeof index.MapSkipEntityInfoToEntityInfo).toBe('function');
    expect(typeof index.MapSkipEntityFieldInfoToEntityFieldInfo).toBe('function');
    expect(typeof index.MapSimpleEntityInfoToSkipEntityInfo).toBe('function');
    expect(typeof index.MapSimpleEntityInfoArrayToSkipEntityInfoArray).toBe('function');
    expect(typeof index.MapSkipEntityInfoToSimpleEntityInfo).toBe('function');
    expect(typeof index.MapSimpleEntityFieldInfoToSkipEntityFieldInfo).toBe('function');
    expect(typeof index.MapSkipEntityFieldInfoToSimpleEntityFieldInfo).toBe('function');
  });
});
