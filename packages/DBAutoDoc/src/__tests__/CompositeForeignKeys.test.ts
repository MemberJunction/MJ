import { describe, it, expect } from 'vitest';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';
import { Introspector } from '../database/Database.js';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { AutoDocIndex, AutoDocSchema } from '../types/driver.js';
import { ColumnDefinition, DatabaseDocumentation, ForeignKeyReference, TableDefinition } from '../types/state.js';
import { FKCandidate, RelationshipDiscoveryPhase } from '../types/discovery.js';

/**
 * #4534: MJ models a foreign key as one column, so a composite FK was written to
 * additionalSchemaInfo.json as one soft FK per column pair. For
 * FOREIGN KEY (a_key, a_prd_key, a_ptp_key) REFERENCES price (prc_key, prc_prd_key, prc_prd_ptp_key)
 * only prc_key is unique on its own; the other two repeat in price, so a join on them alone
 * multiplies rows. A pair is now written only when its target is unique on its own.
 */

function col(name: string, isPrimaryKey = false): ColumnDefinition {
  return { name, dataType: 'int', isNullable: false, isPrimaryKey, isForeignKey: false, descriptionIterations: [] };
}

function table(name: string, columns: ColumnDefinition[], dependsOn: ForeignKeyReference[] = [], indexes?: AutoDocIndex[]): TableDefinition {
  return { name, rowCount: 100, columns, dependsOn, dependents: [], descriptionIterations: [], indexes };
}

function compositeFK(constraintName = 'fk_line_price'): ForeignKeyReference[] {
  return [
    { schema: 'app', table: 'price', column: 'a_key', referencedColumn: 'prc_key', constraintName },
    { schema: 'app', table: 'price', column: 'a_prd_key', referencedColumn: 'prc_prd_key', constraintName },
    { schema: 'app', table: 'price', column: 'a_ptp_key', referencedColumn: 'prc_prd_ptp_key', constraintName },
  ];
}

function emittedFKs(tables: TableDefinition[], discoveredFKs: FKCandidate[] = []): string[] {
  const keyDetection = { discovered: { primaryKeys: [], foreignKeys: discoveredFKs } } as Partial<RelationshipDiscoveryPhase> as RelationshipDiscoveryPhase;
  const state: DatabaseDocumentation = {
    version: '1.0.0',
    summary: { createdAt: '', lastModified: '', totalIterations: 0, totalPromptsRun: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, totalSchemas: 1, totalTables: tables.length, totalColumns: 0 },
    database: { name: 'T', server: 'x', analyzedAt: '' },
    phases: { descriptionGeneration: [], keyDetection },
    schemas: [{ name: 'app', tables, descriptionIterations: [] }],
  };
  const out = JSON.parse(new AdditionalSchemaInfoGenerator().Generate(state)) as Record<string, Array<{ TableName: string; ForeignKeys?: Array<{ FieldName: string; RelatedTable: string; RelatedField: string }> }>>;
  const line = out.app.find(t => t.TableName === 'line');
  return (line?.ForeignKeys ?? []).map(fk => `${fk.FieldName}->${fk.RelatedTable}.${fk.RelatedField}`);
}

const lineColumns = [col('id', true), col('a_key'), col('a_prd_key'), col('a_ptp_key')];

describe('composite foreign keys in additionalSchemaInfo', () => {
  it('writes only the column pair whose target is the single-column primary key', () => {
    const price = table('price', [col('prc_key', true), col('prc_prd_key'), col('prc_prd_ptp_key')]);
    expect(emittedFKs([table('line', lineColumns, compositeFK()), price])).toEqual(['a_key->price.prc_key']);
  });

  it('writes a pair whose target has a unique single-column index', () => {
    const price = table('price', [col('id', true), col('prc_key'), col('prc_prd_key'), col('prc_prd_ptp_key')], [], [
      { SchemaName: 'app', TableName: 'price', IndexName: 'ux_price_key', Columns: ['prc_key'], IncludeColumns: [], IsUnique: true, IsPrimaryKey: false, Method: 'btree', HasExpressions: false },
    ]);
    expect(emittedFKs([table('line', lineColumns, compositeFK()), price])).toEqual(['a_key->price.prc_key']);
  });

  it('writes no pair when every target is one column of a composite primary key', () => {
    const price = table('price', [col('prc_key', true), col('prc_prd_key', true), col('prc_prd_ptp_key', true)]);
    expect(emittedFKs([table('line', lineColumns, compositeFK()), price])).toEqual([]);
  });

  it('writes no pair of a composite key whose target table was not analysed', () => {
    expect(emittedFKs([table('line', lineColumns, compositeFK())])).toEqual([]);
  });

  it('skips the same pairs when the analysis passes also marked the composite columns as foreign keys', () => {
    // The live run that found this: the LLM pass stamps foreignKeyReferences on each column of the
    // declared composite FK, so the column-level path wrote the non-unique pairs back.
    const price = table('price', [col('prc_key', true), col('prc_prd_key'), col('prc_prd_ptp_key')]);
    const stamped = (name: string, referencedColumn: string, refTable = 'price'): ColumnDefinition =>
      ({ ...col(name), isForeignKey: true, foreignKeyReferences: { schema: 'app', table: refTable, column: name, referencedColumn } });
    const line = table('line', [col('id', true), stamped('a_key', 'prc_key'), stamped('a_prd_key', 'prc_prd_key'), stamped('a_ptp_key', 'prc_prd_ptp_key')], compositeFK());
    expect(emittedFKs([line, price])).toEqual(['a_key->price.prc_key']);
  });

  it('keeps a column-level FK from a composite column to a different, real target', () => {
    const price = table('price', [col('prc_key', true), col('prc_prd_key'), col('prc_prd_ptp_key')]);
    const product = table('product', [col('prd_key', true)]);
    const toProduct: ColumnDefinition = { ...col('a_prd_key'), isForeignKey: true, foreignKeyReferences: { schema: 'app', table: 'product', column: 'a_prd_key', referencedColumn: 'prd_key' } };
    const line = table('line', [col('id', true), col('a_key'), toProduct, col('a_ptp_key')], compositeFK());
    expect(emittedFKs([line, price, product]).sort()).toEqual(['a_key->price.prc_key', 'a_prd_key->product.prd_key']);
  });

  it('drops the same pairs when a discovery or LLM pass confirmed them', () => {
    // The live run that found this: the LLM confirmed every column pair of the declared composite
    // FK, and the discovered-FK path wrote them back.
    const price = table('price', [col('prc_key', true), col('prc_prd_key'), col('prc_prd_ptp_key')]);
    const confirmed = (sourceColumn: string, targetColumn: string): FKCandidate =>
      ({ schemaName: 'app', sourceTable: 'line', sourceColumn, targetSchema: 'app', targetTable: 'price', targetColumn, confidence: 95, status: 'confirmed' } as Partial<FKCandidate> as FKCandidate);
    const discovered = [confirmed('a_key', 'prc_key'), confirmed('a_prd_key', 'prc_prd_key'), confirmed('a_ptp_key', 'prc_prd_ptp_key')];
    expect(emittedFKs([table('line', lineColumns, compositeFK()), price], discovered)).toEqual(['a_key->price.prc_key']);
  });

  it('leaves single-column foreign keys alone', () => {
    const dependsOn: ForeignKeyReference[] = [{ schema: 'app', table: 'price', column: 'a_prd_key', referencedColumn: 'prc_prd_key', constraintName: 'fk_single' }];
    expect(emittedFKs([table('line', lineColumns, dependsOn)])).toEqual(['a_prd_key->price.prc_prd_key']);
  });

  it('keeps the old behaviour for a state file written before constraint names were recorded', () => {
    const dependsOn = compositeFK().map(({ constraintName: _ignored, ...rest }) => rest);
    expect(emittedFKs([table('line', lineColumns, dependsOn)])).toHaveLength(3);
  });
});

describe('Introspector', () => {
  it('keeps the constraint name on each foreign key column', async () => {
    const schemas: AutoDocSchema[] = [{
      name: 'app',
      tables: [{
        schemaName: 'app', tableName: 'line', rowCount: 1, primaryKeys: [],
        columns: [{ name: 'a_key', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true }],
        foreignKeys: [{ columnName: 'a_key', referencedSchema: 'app', referencedTable: 'price', referencedColumn: 'prc_key', constraintName: 'fk_line_price' }],
      }],
    }];
    const driver = { getSchemas: async () => schemas } as Partial<BaseAutoDocDriver> as BaseAutoDocDriver;
    const result = await new Introspector(driver).GetSchemas({}, {});
    expect(result[0].tables[0].dependsOn[0].constraintName).toBe('fk_line_price');
  });
});
