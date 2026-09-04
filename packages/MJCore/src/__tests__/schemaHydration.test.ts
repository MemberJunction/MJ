import { describe, it, expect } from 'vitest';
import {
  distinctSchemaNames,
  entitiesInSchemas,
  groupEntitiesBySchema,
  summarizeEntitiesForContext,
} from '../generic/schemaHydration';
import { EntityInfo } from '../generic/entityInfo';

function fakeEntity(over: { Name: string; SchemaName: string; ClassName?: string; BaseTable?: string; Description?: string; Fields?: Array<{ Name: string; Type: string }> }): EntityInfo {
  return {
    Name: over.Name,
    SchemaName: over.SchemaName,
    ClassName: over.ClassName ?? over.Name,
    BaseTable: over.BaseTable ?? over.Name,
    Description: over.Description ?? '',
    Fields: over.Fields ?? [],
  } as EntityInfo;
}

describe('schemaHydration', () => {
  const catalog = [
    fakeEntity({ Name: 'Customers', SchemaName: 'crm', Fields: [{ Name: 'ID', Type: 'uniqueidentifier' }] }),
    fakeEntity({ Name: 'Invoices', SchemaName: 'billing' }),
    fakeEntity({ Name: 'Invoice Lines', SchemaName: 'billing' }),
  ];

  it('groups by schema and lists distinct names in first-seen order', () => {
    const grouped = groupEntitiesBySchema(catalog);
    expect([...grouped.keys()]).toEqual(['crm', 'billing']);
    expect(distinctSchemaNames(catalog)).toEqual(['crm', 'billing']);
  });

  it('filters the catalog to the named schemas without mutating it', () => {
    const billing = entitiesInSchemas(catalog, ['BILLING']);
    expect(billing.map((e) => e.Name)).toEqual(['Invoices', 'Invoice Lines']);
    expect(catalog).toHaveLength(3);
  });

  it('summarizes for agent context and honors maxEntities + includeFields', () => {
    const summary = summarizeEntitiesForContext(catalog, {
      schemas: ['crm'],
      includeFields: true,
      maxEntities: 10,
    });
    expect(summary).toEqual([
      {
        SchemaName: 'crm',
        Name: 'Customers',
        ClassName: 'Customers',
        BaseTable: 'Customers',
        Description: '',
        FieldCount: 1,
        Fields: [{ Name: 'ID', Type: 'uniqueidentifier' }],
      },
    ]);
    const capped = summarizeEntitiesForContext(catalog, { maxEntities: 1 });
    expect(capped).toHaveLength(1);
    expect(capped[0].Fields).toBeUndefined();
  });

  it('returns an empty projection for unknown schemas or an empty include list', () => {
    expect(entitiesInSchemas(catalog, ['does-not-exist'])).toEqual([]);
    expect(entitiesInSchemas(catalog, [])).toEqual([]);
    expect(summarizeEntitiesForContext(catalog, { schemas: ['nope'] })).toEqual([]);
  });

  it('does not mutate the input catalog when grouping', () => {
    const copy = [...catalog];
    groupEntitiesBySchema(catalog);
    expect(catalog).toEqual(copy);
  });
});
