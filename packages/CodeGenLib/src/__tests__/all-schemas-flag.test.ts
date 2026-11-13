/**
 * #5163: `mj codegen --all-schemas` re-emits every schema's generated files on a database run,
 * as `fileEmit.dirtySchemaOnly: false` does from config.
 */
import { describe, it, expect } from 'vitest';
import { ApplyAllSchemasFlag, CodeGenPlugin } from '../plugins/index';
import { ResolveDirtySchemasForEmit } from '../Misc/schema-emit';

const entities = [{ SchemaName: '__mj' }, { SchemaName: 'acme' }];

describe('mj codegen --all-schemas (#5163)', () => {
  it('a database run with no dirty entity emits nothing by default', () => {
    const fileEmit = { dirtySchemaOnly: true };
    const dirty = ResolveDirtySchemasForEmit(entities, [], false, fileEmit.dirtySchemaOnly !== false);
    expect(dirty).not.toBe('all');
    expect(dirty instanceof Set ? dirty.size : -1).toBe(0);
  });

  it('with the flag applied, the same run emits every schema', () => {
    const fileEmit = { dirtySchemaOnly: true };
    ApplyAllSchemasFlag(fileEmit);
    expect(fileEmit.dirtySchemaOnly).toBe(false);
    expect(ResolveDirtySchemasForEmit(entities, [], false, fileEmit.dirtySchemaOnly !== false)).toBe('all');
  });

  it('is declared as a flag and listed in the usage block', () => {
    expect(Object.keys(CodeGenPlugin.flags)).toContain('all-schemas');
    expect(CodeGenPlugin.Usage.flags?.map((f) => f.name)).toContain('--all-schemas');
  });
});
