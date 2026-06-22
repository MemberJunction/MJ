import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ExternalViewParams } from '@memberjunction/external-data-sources';
import { OracleExternalDataSourceDriver } from '../OracleExternalDataSourceDriver';

// Unit-test the pure SQL-building helpers + FK grouping — no database connection required.
// (Connection caching is exercised by the live integration test, since oracledb pool creation is async.)
class TestableOracleDriver extends OracleExternalDataSourceDriver {
  public sel(target: string, params: ExternalViewParams) {
    return this.buildSelectSql(target, params);
  }
  public qual(ds: MJExternalDataSourceEntity, name: string) {
    return this.qualifyObject(ds, name);
  }
  public mapType(t: string) {
    return this.mapObjectType(t);
  }
  public groupFks(rows: Parameters<TestableOracleDriver['groupForeignKeys']>[0]) {
    return this.groupForeignKeys(rows);
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ DefaultSchema: 'HR', ...over } as unknown as MJExternalDataSourceEntity);

describe('OracleExternalDataSourceDriver — SQL building', () => {
  const d = new TestableOracleDriver();

  describe('qualifyObject', () => {
    it('double-quotes + schema-qualifies a bare object name with DefaultSchema', () => {
      expect(d.qual(ds({}), 'ORDERS')).toBe('"HR"."ORDERS"');
    });
    it('respects an already schema-qualified name', () => {
      expect(d.qual(ds({}), 'SALES.EVENTS')).toBe('"SALES"."EVENTS"');
    });
    it('quotes the object only when DefaultSchema is null', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'ORDERS')).toBe('"ORDERS"');
    });
    it('escapes embedded double-quotes in identifiers', () => {
      expect(d.qual(ds({ DefaultSchema: null as unknown as string }), 'we"rd')).toBe('"we""rd"');
    });
  });

  describe('buildSelectSql', () => {
    it('builds SELECT * with no clauses', () => {
      expect(d.sel('"S"."T"', { objectName: 't' })).toBe('SELECT * FROM "S"."T"');
    });
    it('uses FETCH NEXT for a row cap', () => {
      expect(d.sel('"S"."T"', { objectName: 't', maxRows: 10 })).toBe('SELECT * FROM "S"."T" FETCH NEXT 10 ROWS ONLY');
    });
    it('uses OFFSET ROWS + FETCH NEXT for a paginated window (with ORDER BY)', () => {
      const sql = d.sel('"S"."T"', { objectName: 't', maxRows: 10, offset: 20, orderBy: 'ID DESC' });
      expect(sql).toBe('SELECT * FROM "S"."T" ORDER BY ID DESC OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
    });
    it('emits OFFSET ROWS alone when only an offset is given', () => {
      expect(d.sel('"S"."T"', { objectName: 't', offset: 5 })).toBe('SELECT * FROM "S"."T" OFFSET 5 ROWS');
    });
    it('builds projection + filter', () => {
      const sql = d.sel('"S"."T"', { objectName: 't', fields: ['ID', 'NAME'], filter: "STATUS = 'a'" });
      expect(sql).toBe('SELECT "ID", "NAME" FROM "S"."T" WHERE STATUS = \'a\'');
    });
    it('coerces paging values to numbers (no injection via maxRows/offset)', () => {
      const sql = d.sel('"S"."T"', { objectName: 't', maxRows: Number('5; DROP'), offset: Number('1; DROP') });
      expect(sql).not.toContain('DROP');
    });
  });

  describe('mapObjectType', () => {
    it('maps VIEW -> view and TABLE -> table', () => {
      expect(d.mapType('VIEW')).toBe('view');
      expect(d.mapType('TABLE')).toBe('table');
    });
  });

  describe('groupForeignKeys (composite-key aware)', () => {
    it('groups a single-column FK into one relationship', () => {
      const byTable = d.groupFks([
        { CONSTRAINT_NAME: 'FK_ORDERS_CUSTOMER', TABLE_NAME: 'ORDERS', COLUMN_NAME: 'CUSTOMER_ID', REFERENCED_TABLE: 'CUSTOMERS', REFERENCED_SCHEMA: 'EDS_IT', REFERENCED_COLUMN: 'ID' },
      ]);
      expect(byTable.get('ORDERS')).toEqual([
        { Name: 'FK_ORDERS_CUSTOMER', ReferencedObject: 'CUSTOMERS', ReferencedSchema: 'EDS_IT', Columns: [{ Column: 'CUSTOMER_ID', ReferencedColumn: 'ID' }] },
      ]);
    });
    it('coalesces a composite FK into one relationship with both column pairings', () => {
      const rels = d.groupFks([
        { CONSTRAINT_NAME: 'FK_LI_ORDER', TABLE_NAME: 'LINE_ITEMS', COLUMN_NAME: 'ORDER_ID', REFERENCED_TABLE: 'ORDERS', REFERENCED_SCHEMA: 'EDS_IT', REFERENCED_COLUMN: 'ID' },
        { CONSTRAINT_NAME: 'FK_LI_ORDER', TABLE_NAME: 'LINE_ITEMS', COLUMN_NAME: 'ORDER_REGION', REFERENCED_TABLE: 'ORDERS', REFERENCED_SCHEMA: 'EDS_IT', REFERENCED_COLUMN: 'REGION' },
      ]).get('LINE_ITEMS')!;
      expect(rels).toHaveLength(1);
      expect(rels[0].Columns).toEqual([
        { Column: 'ORDER_ID', ReferencedColumn: 'ID' },
        { Column: 'ORDER_REGION', ReferencedColumn: 'REGION' },
      ]);
    });
  });
});
