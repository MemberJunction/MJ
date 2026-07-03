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
  // Exercise Oracle's UPPERCASE-catalog normalization feeding the shared (lowercase) grouping.
  public groupFks(rows: Parameters<TestableOracleDriver['normalizeForeignKeyRows']>[0]) {
    return this.groupForeignKeys(this.normalizeForeignKeyRows(rows));
  }
  public transport(config: Parameters<OracleExternalDataSourceDriver['resolveTransportForGate']>[0]) {
    return this.resolveTransportForGate(config);
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

  describe('resolveTransportForGate (secure-transport gate honors connectString)', () => {
    it('falls back to host/ssl when no connectString is set', () => {
      expect(d.transport({ host: 'db.example.com', ssl: false })).toEqual({ host: 'db.example.com', tlsEnabled: false });
      expect(d.transport({ host: 'db.example.com', ssl: true })).toEqual({ host: 'db.example.com', tlsEnabled: true });
    });

    it('treats a tcps:// Easy-Connect connectString as encrypted and extracts the host', () => {
      expect(d.transport({ connectString: 'tcps://remote-oracle:1521/svc' })).toEqual({ host: 'remote-oracle', tlsEnabled: true });
    });

    it('extracts a plaintext tcp:// remote host so the gate can reject it (the bypass being fixed)', () => {
      // host:'localhost' is deliberately set but must be IGNORED in favor of the real connectString host.
      expect(d.transport({ connectString: 'tcp://remote-oracle:1521/svc', host: 'localhost' })).toEqual({ host: 'remote-oracle', tlsEnabled: false });
    });

    it('recognizes TNS PROTOCOL=TCPS as encrypted and pulls HOST from the descriptor', () => {
      const cs = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=tns-host)(PORT=1522))(CONNECT_DATA=(SERVICE_NAME=svc)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'tns-host', tlsEnabled: true });
    });

    it('extracts HOST from a plaintext TNS descriptor (PROTOCOL=TCP)', () => {
      const cs = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=tns-plain)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=svc)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'tns-plain', tlsEnabled: false });
    });

    it('treats a bare Easy-Connect (no scheme) as plaintext and extracts the host — Oracle defaults to TCP', () => {
      expect(d.transport({ connectString: 'remote:1521/svc' })).toEqual({ host: 'remote', tlsEnabled: false });
    });

    // --- multi-address / decoy defenses (the round-3 hardening) ---

    it('rejects a RAC/failover descriptor whose FIRST address is plaintext-remote even if a later one is TCPS', () => {
      // Oracle dials in order → the plaintext TCP address goes first → credentials in cleartext to a remote host.
      const cs = '(DESCRIPTION=(ADDRESS_LIST=' +
        '(ADDRESS=(PROTOCOL=TCP)(HOST=evil.remote.com)(PORT=1521))' +
        '(ADDRESS=(PROTOCOL=TCPS)(HOST=evil.remote.com)(PORT=2484)))' +
        '(CONNECT_DATA=(SERVICE_NAME=x)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'evil.remote.com', tlsEnabled: false });
    });

    it('is not fooled by a decoy TCPS token when the real address is plaintext TCP', () => {
      const cs = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=evil.com)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=x))(X=PROTOCOL=TCPS))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'evil.com', tlsEnabled: false });
    });

    it('surfaces the remote plaintext host even when a localhost decoy address is listed first', () => {
      const cs = '(DESCRIPTION=' +
        '(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))' +
        '(ADDRESS=(PROTOCOL=TCP)(HOST=evil.com)(PORT=1521))' +
        '(CONNECT_DATA=(SERVICE_NAME=x)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'evil.com', tlsEnabled: false });
    });

    it('passes a genuine all-TCPS multi-address descriptor', () => {
      const cs = '(DESCRIPTION=(ADDRESS_LIST=' +
        '(ADDRESS=(PROTOCOL=TCPS)(HOST=a.oraclecloud.com)(PORT=2484))' +
        '(ADDRESS=(PROTOCOL=TCPS)(HOST=b.oraclecloud.com)(PORT=2484)))' +
        '(CONNECT_DATA=(SERVICE_NAME=x)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'a.oraclecloud.com', tlsEnabled: true });
    });

    it('passes a local-only plaintext descriptor (dev)', () => {
      const cs = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=x)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'localhost', tlsEnabled: false });
    });

    it('passes a RAC descriptor mixing a LOCAL plaintext node with a REMOTE TCPS node (per-address pairing)', () => {
      // The remote node is TCPS (encrypted); only the plaintext node is local. A global "any TCP" flag
      // would wrongly brand the remote TCPS host as plaintext and block it — per-address pairing must not.
      const cs = '(DESCRIPTION=(ADDRESS_LIST=' +
        '(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))' +
        '(ADDRESS=(PROTOCOL=TCPS)(HOST=rac.oraclecloud.com)(PORT=2484)))' +
        '(CONNECT_DATA=(SERVICE_NAME=x)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'rac.oraclecloud.com', tlsEnabled: true });
    });

    it('still rejects a RAC descriptor mixing a LOCAL TCPS node with a REMOTE plaintext node', () => {
      const cs = '(DESCRIPTION=(ADDRESS_LIST=' +
        '(ADDRESS=(PROTOCOL=TCPS)(HOST=localhost)(PORT=2484))' +
        '(ADDRESS=(PROTOCOL=TCP)(HOST=evil.remote.com)(PORT=1521)))' +
        '(CONNECT_DATA=(SERVICE_NAME=x)))';
      expect(d.transport({ connectString: cs })).toEqual({ host: 'evil.remote.com', tlsEnabled: false });
    });
  });
});
