import { describe, it, expect } from 'vitest';
import {
  FindSchemaOutputOverride,
  PartitionEntitiesByOutputDirectory,
  ResolveSchemaOutputDirectory,
} from '../Config/schema-output';

const overrides = [
  { schema: 'bsd_%', EntitySubClasses: '/demo/entities', skip: ['Angular' as const] },
  { schema: 'legacy', skip: ['EntitySubClasses' as const] },
];

describe('schema-output', () => {
  it('finds the first matching override, including wildcards', () => {
    expect(FindSchemaOutputOverride('bsd_crm', overrides)?.EntitySubClasses).toBe('/demo/entities');
    expect(FindSchemaOutputOverride('legacy', overrides)?.skip).toEqual(['EntitySubClasses']);
    expect(FindSchemaOutputOverride('dbo', overrides)).toBeUndefined();
  });

  it('resolves skip as null and a missing kind as undefined (use default)', () => {
    expect(ResolveSchemaOutputDirectory('bsd_crm', 'Angular', overrides)).toBeNull();
    expect(ResolveSchemaOutputDirectory('bsd_crm', 'GraphQLServer', overrides)).toBeUndefined();
    expect(ResolveSchemaOutputDirectory('legacy', 'EntitySubClasses', overrides)).toBeNull();
  });

  it('partitions entities into destination directories and drops skipped schemas', () => {
    const groups = PartitionEntitiesByOutputDirectory(
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
    expect(ResolveSchemaOutputDirectory('bsd_crm', 'EntitySubClasses', overlapping)).toBe('/exact');
    expect(ResolveSchemaOutputDirectory('bsd_billing', 'EntitySubClasses', overlapping)).toBe('/wildcard');
  });
});
