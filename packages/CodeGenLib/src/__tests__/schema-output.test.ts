import { describe, it, expect } from 'vitest';
import {
  findSchemaOutputOverride,
  partitionEntitiesByOutputDirectory,
  resolveSchemaOutputDirectory,
} from '../Config/schema-output';

const overrides = [
  { schema: 'bsd_%', EntitySubClasses: '/demo/entities', skip: ['Angular' as const] },
  { schema: 'legacy', skip: ['EntitySubClasses' as const] },
];

describe('schema-output', () => {
  it('finds the first matching override, including wildcards', () => {
    expect(findSchemaOutputOverride('bsd_crm', overrides)?.EntitySubClasses).toBe('/demo/entities');
    expect(findSchemaOutputOverride('legacy', overrides)?.skip).toEqual(['EntitySubClasses']);
    expect(findSchemaOutputOverride('dbo', overrides)).toBeUndefined();
  });

  it('resolves skip as null and a missing kind as undefined (use default)', () => {
    expect(resolveSchemaOutputDirectory('bsd_crm', 'Angular', overrides)).toBeNull();
    expect(resolveSchemaOutputDirectory('bsd_crm', 'GraphQLServer', overrides)).toBeUndefined();
    expect(resolveSchemaOutputDirectory('legacy', 'EntitySubClasses', overrides)).toBeNull();
  });

  it('partitions entities into destination directories and drops skipped schemas', () => {
    const groups = partitionEntitiesByOutputDirectory(
      [
        { SchemaName: 'bsd_crm', Name: 'Customers' },
        { SchemaName: 'legacy', Name: 'OldThing' },
        { SchemaName: 'dbo', Name: 'Orders' },
      ],
      'EntitySubClasses',
      '/default',
      overrides,
    );
    expect([...groups.keys()].sort()).toEqual(['/default', '/demo/entities']);
    expect(groups.get('/demo/entities')?.map((e) => e.Name)).toEqual(['Customers']);
    expect(groups.get('/default')?.map((e) => e.Name)).toEqual(['Orders']);
  });

  it('first matching override wins when two patterns overlap', () => {
    const overlapping = [
      { schema: 'bsd_crm', EntitySubClasses: '/exact' },
      { schema: 'bsd_%', EntitySubClasses: '/wildcard' },
    ];
    expect(resolveSchemaOutputDirectory('bsd_crm', 'EntitySubClasses', overlapping)).toBe('/exact');
    expect(resolveSchemaOutputDirectory('bsd_billing', 'EntitySubClasses', overlapping)).toBe('/wildcard');
  });
});
