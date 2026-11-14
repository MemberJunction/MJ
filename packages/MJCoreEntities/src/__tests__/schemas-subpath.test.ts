import { describe, it, expect } from 'vitest';
import * as RootExports from '../index';
import * as SchemaExports from '../schemas';

describe('@memberjunction/core-entities/schemas subpath', () => {
  it('exports entity Zod schemas and validates correctly', () => {
    expect(SchemaExports.MJUserSchema).toBeDefined();
    expect(SchemaExports.MJFileSchema).toBeDefined();
    expect(SchemaExports.MJAIActionSchema).toBeDefined();

    // Verify schema shape validation
    const sampleAction = {
      ID: '00000000-0000-0000-0000-000000000001',
      Name: 'Test Action',
      Description: null,
      DefaultPrompt: null,
      DefaultModelID: null,
      IsActive: true,
      __mj_CreatedAt: new Date(),
      __mj_UpdatedAt: new Date(),
      DefaultModel: null,
    };
    const parseResult = SchemaExports.MJAIActionSchema.safeParse(sampleAction);
    expect(parseResult.success).toBe(true);
  });

  it('maintains 100% backwards compatibility in root export', () => {
    // Root export must still export the schemas
    expect(RootExports.MJUserSchema).toBeDefined();
    expect(RootExports.MJFileSchema).toBeDefined();
    expect(RootExports.MJAIActionSchema).toBeDefined();
    expect(RootExports.MJUserSchema).toBe(SchemaExports.MJUserSchema);
    expect(RootExports.MJFileSchema).toBe(SchemaExports.MJFileSchema);
  });

  it('schemas entry point does not export entity classes', () => {
    const schemaKeys = Object.keys(SchemaExports);
    expect(schemaKeys).not.toContain('MJUserEntity');
    expect(schemaKeys).not.toContain('MJFileEntity');
    expect(schemaKeys).not.toContain('MJAIActionEntity');
    expect(schemaKeys).not.toContain('BaseEntity');
  });
});
