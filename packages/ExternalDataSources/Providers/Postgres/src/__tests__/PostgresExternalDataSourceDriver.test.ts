import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import { PostgresExternalDataSourceDriver } from '../PostgresExternalDataSourceDriver';

// Unit-test the pure SQL-building helpers (identifier quoting, qualification,
// SELECT assembly, object-type mapping) — no database connection required.
class TestablePostgresDriver extends PostgresExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ DefaultSchema: 'sales', ...over } as unknown as MJExternalDataSourceEntity);

describe('PostgresExternalDataSourceDriver — SQL building', () => {
  const d = new TestablePostgresDriver();

  describe('qualifyObject', () => {
    it('quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'orders')).toBe('"sales"."orders"');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'raw.events')).toBe('"raw"."events"');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'orders')).toBe('"orders"');
    });
    it('escapes embedded double-quotes in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we"ird')).toBe('"we""ird"');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('"s"."t"', { objectName: 't' })).toBe('SELECT * FROM "s"."t"');
    });
    it('builds projection + filter + order + LIMIT/OFFSET', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', fields: ['id', 'name'], filter: "status = 'a'", orderBy: 'id DESC', maxRows: 10, offset: 20 });
      expect(sql).toBe('SELECT "id", "name" FROM "s"."t" WHERE status = \'a\' ORDER BY id DESC LIMIT 10 OFFSET 20');
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('"s"."t"', { objectName: 't', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
      expect(sql).not.toContain('DROP');
    });
  });

  describe('mapObjectType', () => {
    it('maps VIEW -> view and everything else -> table', () => {
      expect(d.mapType('VIEW')).toBe('view');
      expect(d.mapType('BASE TABLE')).toBe('table');
    });
  });
});
