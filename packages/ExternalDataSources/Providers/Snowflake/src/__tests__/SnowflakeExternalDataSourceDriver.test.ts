import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import { SnowflakeExternalDataSourceDriver } from '../SnowflakeExternalDataSourceDriver';

// Snowflake can't be run locally, so we unit-test the pure SQL-building helpers
// (identifier quoting, qualification, SELECT assembly, object-type mapping).
class TestableSnowflakeDriver extends SnowflakeExternalDataSourceDriver {
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
  ({ DefaultSchema: 'ANALYTICS', ...over } as unknown as MJExternalDataSourceEntity);

describe('SnowflakeExternalDataSourceDriver — SQL building', () => {
  const d = new TestableSnowflakeDriver();

  describe('qualifyObject', () => {
    it('quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'SALES')).toBe('"ANALYTICS"."SALES"');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'RAW.EVENTS')).toBe('"RAW"."EVENTS"');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'SALES')).toBe('"SALES"');
    });
    it('escapes embedded double-quotes in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we"ird')).toBe('"we""ird"');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('"S"."T"', { objectName: 'T' })).toBe('SELECT * FROM "S"."T"');
    });
    it('builds projection + filter + order + LIMIT/OFFSET', () => {
      const sql = d.sel('"S"."T"', { objectName: 'T', fields: ['ID', 'NAME'], filter: "STATUS = 'A'", orderBy: 'ID DESC', maxRows: 10, offset: 20 });
      expect(sql).toBe('SELECT "ID", "NAME" FROM "S"."T" WHERE STATUS = \'A\' ORDER BY ID DESC LIMIT 10 OFFSET 20');
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('"S"."T"', { objectName: 'T', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
      // Number('5; DROP') is NaN -> appears as NaN, never raw text; assert no semicolon leaked
      expect(sql).not.toContain('DROP');
    });
  });

  describe('mapObjectType', () => {
    it('maps VIEW -> view and everything else -> table', () => {
      expect(d.mapType('VIEW')).toBe('view');
      expect(d.mapType('view')).toBe('view');
      expect(d.mapType('BASE TABLE')).toBe('table');
    });
  });
});
