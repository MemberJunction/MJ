import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import nunjucks from 'nunjucks';
import { BuildIndexHints, FormatIndexHint, IsUniquelyIndexed, AttachIndexesToTables } from '../utils/index-hints';
import { Introspector } from '../database/Database';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import { AUTODOC_EXPRESSION_KEY_PART, type AutoDocIndex } from '../types/driver';
import type { SchemaDefinition, TableDefinition } from '../types/state';

function index(tableName: string, name: string, columns: string[], extra: Partial<AutoDocIndex> = {}): AutoDocIndex {
  return {
    SchemaName: 'dbo', TableName: tableName, IndexName: name, Columns: columns, IncludeColumns: [],
    IsUnique: false, IsPrimaryKey: false, Method: 'btree', HasExpressions: false, ...extra
  };
}

function table(name: string, indexes?: AutoDocIndex[]): TableDefinition {
  return { name, rowCount: 100, dependsOn: [], dependents: [], columns: [], descriptionIterations: [], indexes };
}

describe('BuildIndexHints / FormatIndexHint', () => {
  it('lists the primary key first, then unique indexes, then the rest', () => {
    const t = table('Orders', [
      index('Orders', 'ix_cust', ['CustomerID', 'OrderDate'], { IncludeColumns: ['Total'] }),
      index('Orders', 'uq_code', ['Code'], { IsUnique: true, FilterDefinition: '([Code] IS NOT NULL)' }),
      index('Orders', 'pk', ['OrderID'], { IsPrimaryKey: true })
    ]);
    expect(BuildIndexHints(t).map(FormatIndexHint)).toEqual([
      'PRIMARY KEY (OrderID)',
      'UNIQUE (Code) WHERE ([Code] IS NOT NULL)',
      'INDEX (CustomerID, OrderDate) INCLUDE (Total)'
    ]);
  });

  it('shows expression key parts in place, and caps the list', () => {
    const t = table('T', [index('T', 'ix_expr', [AUTODOC_EXPRESSION_KEY_PART, 'CustomerID'], { HasExpressions: true })]);
    expect(BuildIndexHints(t).map(FormatIndexHint)).toEqual(['INDEX ((expression), CustomerID)']);
    const many = table('T', Array.from({ length: 40 }, (_, i) => index('T', `ix_${i}`, [`c${i}`])));
    expect(BuildIndexHints(many)).toHaveLength(25);
    expect(BuildIndexHints(many, 3)).toHaveLength(3);
  });

  it('returns nothing when indexes were not loaded', () => {
    expect(BuildIndexHints(table('T'))).toEqual([]);
    expect(BuildIndexHints(undefined)).toEqual([]);
  });
});

describe('IsUniquelyIndexed', () => {
  const t = table('Customers', [
    index('Customers', 'pk', ['CustomerID'], { IsPrimaryKey: true }),
    index('Customers', 'uq_pair', ['Region', 'Code'], { IsUnique: true }),
    index('Customers', 'uq_partial', ['Email'], { IsUnique: true, FilterDefinition: 'Email IS NOT NULL' }),
    index('Customers', 'ix_name', ['Name'])
  ]);

  it('is true only for a single-column, unfiltered unique or primary-key index (case-insensitive)', () => {
    expect(IsUniquelyIndexed(t, 'customerid')).toBe(true);
    expect(IsUniquelyIndexed(t, 'Code')).toBe(false);   // only unique together with Region
    expect(IsUniquelyIndexed(t, 'Email')).toBe(false);  // partial index
    expect(IsUniquelyIndexed(t, 'Name')).toBe(false);   // not unique
  });

  it('is undefined when the table indexes were not read', () => {
    expect(IsUniquelyIndexed(table('X'), 'ID')).toBeUndefined();
    expect(IsUniquelyIndexed(undefined, 'ID')).toBeUndefined();
  });
});

describe('AttachIndexesToTables', () => {
  it('attaches by exact name, falls back to case-insensitive, and gives unindexed tables an empty list', () => {
    const tables = [table('Orders'), table('customers'), table('Empty')];
    AttachIndexesToTables(tables, [index('Orders', 'pk', ['ID']), index('Customers', 'pk2', ['ID']), index('NotInState', 'x', ['a'])]);
    expect(tables.map((t) => t.indexes?.map((i) => i.IndexName))).toEqual([['pk'], ['pk2'], []]);
  });
});

describe('Introspector.LoadIndexes', () => {
  it('stores indexes per schema and reports schemas whose catalog read failed, leaving them unloaded', async () => {
    const driver = {
      GetIndexes: async (schemaName: string) => {
        if (schemaName === 'locked') throw new Error('permission denied');
        return [index('Orders', 'pk', ['OrderID'], { IsPrimaryKey: true, SchemaName: schemaName })];
      }
    } as unknown as BaseAutoDocDriver;
    const schemas: SchemaDefinition[] = [
      { name: 'dbo', tables: [table('Orders')], descriptionIterations: [] },
      { name: 'locked', tables: [table('Secret')], descriptionIterations: [] }
    ];
    const failed = await new Introspector(driver).LoadIndexes(schemas);
    expect(failed).toEqual([{ SchemaName: 'locked', Error: 'permission denied' }]);
    expect(schemas[0].tables[0].indexes?.map((i) => i.IndexName)).toEqual(['pk']);
    expect(schemas[1].tables[0].indexes).toBeUndefined();
  });
});

// ─── prompt templates ────────────────────────────────────────────────────────

function render(templateName: string, ctx: object): string {
  const env = new nunjucks.Environment(null, { autoescape: false }); // as PromptEngine configures it
  env.addFilter('jsoninline', (obj: object) => JSON.stringify(obj));
  env.addFilter('join', (arr: string[], sep = ', ') => (Array.isArray(arr) ? arr.join(sep) : ''));
  const template = fs.readFileSync(new URL(`../../prompts/${templateName}`, import.meta.url), 'utf-8');
  return env.renderString(template, ctx);
}

describe('prompt templates show existing indexes', () => {
  const lines = ['PRIMARY KEY (OrderID)', 'INDEX (CustomerID)'];

  it('table-analysis renders the section only when there are indexes', () => {
    const base = { schema: 'dbo', table: 'Orders', rowCount: 10, columns: [], dependsOn: [], dependents: [], allTables: [] };
    const out = render('table-analysis.md', { ...base, existingIndexes: lines });
    expect(out).toContain('## Existing Indexes');
    expect(out).toContain('- PRIMARY KEY (OrderID)');
    expect(out).toContain('- INDEX (CustomerID)');
    expect(render('table-analysis.md', base)).not.toContain('## Existing Indexes');
  });

  it('pk-pruning-table renders the section', () => {
    const out = render('pk-pruning-table.md', { sourceSchema: 'dbo', sourceTable: 'Orders', candidates: [], allTables: [], existingIndexes: lines });
    expect(out).toContain('## Existing Indexes');
    expect(out).toContain('- INDEX (CustomerID)');
  });

  it('fk-pruning-table renders the section and whether each target column is uniquely indexed', () => {
    const fk = (targetUniquelyIndexed?: boolean) => ({
      sourceColumn: 'CustomerID', targetSchema: 'dbo', targetTable: 'Customers', targetColumn: 'ID', confidence: 80, locked: false, targetUniquelyIndexed
    });
    const out = render('fk-pruning-table.md', {
      sourceSchema: 'dbo', sourceTable: 'Orders', allTables: [], existingIndexes: lines, candidates: [fk(true), fk(false), fk(undefined)]
    });
    expect(out).toContain('## Existing Indexes');
    expect(out).toContain('(confidence: 80%; target column has a unique index)');
    expect(out).toContain('(confidence: 80%; target column has no unique index)');
    expect(out).toContain('(confidence: 80%)');
  });
});
