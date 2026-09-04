import { describe, it, expect } from 'vitest';
import { CodeGenDatabaseProvider, type FieldResolutionGap } from '../Database/codeGenDatabaseProvider';
import type { EntityInfo } from '@memberjunction/core';
import type { CodeGenConnection } from '../Database/codeGenDatabaseProvider';

/**
 * Unit tests for `validateEntityFieldsResolve` — the check that reports entity
 * fields the metadata promises but the base view does not produce.
 *
 * Why these exist at all: when this validator is wrong it reports NOTHING, which
 * is indistinguishable from a healthy install. A silently-passing validator is
 * worse than no validator, because it manufactures confidence in the exact
 * condition it was written to catch. So the cases below pin the two parts that
 * can fail silently — the case normalisation and the map keying — rather than
 * the parts that would fail loudly.
 *
 * The provider is driven through its own prototype rather than a subclass: the
 * class is abstract with 60+ dialect members, and stubbing all of them to reach
 * two would test the stubs. `Object.create` runs the REAL methods, and the base
 * `getViewColumnsBySchemaSQL` serves both dialects, so this is the shipping code
 * path for SQL Server and PostgreSQL alike.
 */

/** Minimal EntityInfo shape this validator actually reads. */
function entity(
  name: string,
  schema: string,
  baseView: string,
  fields: string[],
  opts: { virtual?: boolean; virtualFields?: string[] } = {}
): EntityInfo {
  const virtualFields = new Set(opts.virtualFields ?? []);
  return {
    Name: name,
    SchemaName: schema,
    BaseView: baseView,
    VirtualEntity: opts.virtual ?? false,
    Fields: fields.map(f => ({ Name: f, IsVirtual: virtualFields.has(f) })),
  } as unknown as EntityInfo;
}

/**
 * A stand-in catalog that APPLIES THE QUERY'S OWN SCHEMA FILTER.
 *
 * It would be easier to return the rows unconditionally, and that is what this
 * did first — but then every behavioural test passed with the schema filter
 * broken, because nothing in the fake could tell a matching filter from a
 * non-matching one. It reproduced the exact fault under test (a validator that
 * reports nothing) inside the test that was supposed to catch it.
 *
 * So the fake parses the `IN (...)` list it was handed, honours `LOWER(...)` on
 * the column when present, and filters its rows the way a real catalog would.
 * Rows carry the spelling the catalog stores; the query has to match it.
 */
function pool(rows: Array<{ schema_name: string; view_name: string; column_name: string }>): {
  conn: CodeGenConnection;
  sql: () => string;
} {
  let seen = '';
  const conn = {
    query: async (text: string) => {
      seen = text;
      const inList = /IN\s*\(([^)]*)\)/i.exec(text);
      if (!inList) {
        return { recordset: [] };
      }
      const wanted = inList[1]
        .split(',')
        .map(s => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean);
      const caseInsensitive = /LOWER\(\s*c\.table_schema\s*\)/i.test(text);
      const matches = (schema: string) =>
        caseInsensitive
          ? wanted.some(w => w.toLowerCase() === schema.toLowerCase())
          : wanted.some(w => w === schema);
      return { recordset: rows.filter(r => matches(r.schema_name)) };
    },
  } as unknown as CodeGenConnection;
  return { conn, sql: () => seen };
}

function provider(): CodeGenDatabaseProvider {
  return Object.create(CodeGenDatabaseProvider.prototype) as CodeGenDatabaseProvider;
}

const cols = (schema: string, view: string, ...names: string[]) =>
  names.map(column_name => ({ schema_name: schema, view_name: view, column_name }));

describe('validateEntityFieldsResolve', () => {
  it('reports a field the base view does not produce, with the full gap shape', async () => {
    const p = pool(cols('__mj', 'vwentities', 'id', 'name'));
    const gaps = await provider().validateEntityFieldsResolve(p.conn, [
      entity('MJ: Entities', '__mj', 'vwEntities', ['ID', 'Name', 'DisplayName'], {
        virtualFields: ['DisplayName'],
      }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual<FieldResolutionGap>({
      entity: 'MJ: Entities',
      schema: '__mj',
      baseView: 'vwEntities',
      field: 'DisplayName',
      isVirtual: true,
    });
  });

  it('reports nothing when every field resolves', async () => {
    const p = pool(cols('__mj', 'vwentities', 'id', 'name', 'displayname'));
    const gaps = await provider().validateEntityFieldsResolve(p.conn, [
      entity('MJ: Entities', '__mj', 'vwEntities', ['ID', 'Name', 'DisplayName']),
    ]);
    expect(gaps).toEqual([]);
  });

  it('matches regardless of how the catalog spells the schema (the silent-skip trap)', async () => {
    // Metadata says "MyApp"; PostgreSQL folded the unquoted schema to "myapp".
    // Comparing verbatim found no rows, took the missing-view skip, and dropped
    // the entity from validation without a word.
    const p = pool(cols('myapp', 'vwcustomers', 'id'));
    const gaps = await provider().validateEntityFieldsResolve(p.conn, [
      entity('Customers', 'MyApp', 'vwCustomers', ['ID', 'Region']),
    ]);

    expect(gaps.map(g => g.field)).toEqual(['Region']);
  });

  it('asks the catalog case-insensitively on both sides', async () => {
    const p = pool([]);
    await provider().validateEntityFieldsResolve(p.conn, [
      entity('Customers', 'MyApp', 'vwCustomers', ['ID']),
    ]);

    // Both halves lowered: the column via LOWER(), the list when it is built.
    expect(p.sql()).toMatch(/LOWER\(c\.table_schema\)\s+IN\s*\(/i);
    expect(p.sql()).toContain("'myapp'");
    expect(p.sql()).not.toContain("'MyApp'");
  });

  it('skips an entity whose view is absent rather than reporting every field', async () => {
    // A missing view is a different fault with its own diagnostics. Reporting all
    // of its fields here would bury the real signal.
    const p = pool(cols('__mj', 'vwother', 'id'));
    const gaps = await provider().validateEntityFieldsResolve(p.conn, [
      entity('MJ: Entities', '__mj', 'vwEntities', ['ID', 'Name']),
    ]);
    expect(gaps).toEqual([]);
  });

  it('ignores virtual entities and entities with no base view', async () => {
    const p = pool(cols('__mj', 'vwentities', 'id'));
    const gaps = await provider().validateEntityFieldsResolve(p.conn, [
      entity('Virtual', '__mj', 'vwEntities', ['Missing'], { virtual: true }),
      entity('NoView', '__mj', '', ['Missing']),
    ]);
    expect(gaps).toEqual([]);
  });

  it('does not query at all when there is nothing to validate', async () => {
    const p = pool(cols('__mj', 'vwentities', 'id'));
    const gaps = await provider().validateEntityFieldsResolve(p.conn, []);
    expect(gaps).toEqual([]);
    expect(p.sql()).toBe('');
  });

  it('separates views of the same name in different schemas', async () => {
    // Keyed on schema.view, so a same-named view elsewhere must not satisfy this one.
    const p = pool([...cols('app_a', 'vwthings', 'id', 'label'), ...cols('app_b', 'vwthings', 'id')]);
    const gaps = await provider().validateEntityFieldsResolve(p.conn, [
      entity('A Things', 'app_a', 'vwThings', ['ID', 'Label']),
      entity('B Things', 'app_b', 'vwThings', ['ID', 'Label']),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].entity).toBe('B Things');
    expect(gaps[0].field).toBe('Label');
  });
});
