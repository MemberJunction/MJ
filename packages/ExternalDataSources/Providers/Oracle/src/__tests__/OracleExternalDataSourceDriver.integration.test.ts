import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import oracledb from 'oracledb';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { OracleExternalDataSourceDriver } from '../OracleExternalDataSourceDriver';

/**
 * Integration test for the Oracle driver against a REAL Oracle (Thin mode — no Instant Client).
 *
 * Opt-in: only runs when RUN_ORACLE_INTEGRATION=1, so the normal unit-test gate (no DB) stays green.
 *
 * Self-seeding: the suite creates customers/orders (with a FK) + a view in its own schema, so it's
 * deterministic against any Oracle — a CI service container or a local throwaway
 * `docker run gvenzl/oracle-free` (the defaults below match `-p 1522:1521`, APP_USER=eds_it).
 * Identifiers are UPPERCASE because Oracle folds unquoted names — that's the natural Oracle convention.
 *
 *   RUN_ORACLE_INTEGRATION=1 ORA_HOST=localhost ORA_PORT=1522 ORA_SERVICE=FREEPDB1 ORA_USER=eds_it ORA_PASSWORD=... npm run test
 */
const RUN = process.env.RUN_ORACLE_INTEGRATION === '1';

const CONN = {
  host: process.env.ORA_HOST ?? 'localhost',
  port: Number(process.env.ORA_PORT ?? 1522),
  service: process.env.ORA_SERVICE ?? 'FREEPDB1',
  user: process.env.ORA_USER ?? 'eds_it',
  password: process.env.ORA_PASSWORD ?? 'Claude2Ora99',
};

/** Idempotent seed, statement-by-statement (Oracle has no multi-statement batch). */
const SEED = [
  `BEGIN EXECUTE IMMEDIATE 'DROP VIEW customer_order_totals'; EXCEPTION WHEN OTHERS THEN NULL; END;`,
  `BEGIN EXECUTE IMMEDIATE 'DROP TABLE orders'; EXCEPTION WHEN OTHERS THEN NULL; END;`,
  `BEGIN EXECUTE IMMEDIATE 'DROP TABLE customers'; EXCEPTION WHEN OTHERS THEN NULL; END;`,
  `CREATE TABLE customers (id NUMBER PRIMARY KEY, name VARCHAR2(200) NOT NULL, email VARCHAR2(200))`,
  `CREATE TABLE orders (id NUMBER PRIMARY KEY, customer_id NUMBER NOT NULL CONSTRAINT fk_orders_customer REFERENCES customers(id), amount NUMBER(10,2) NOT NULL, status VARCHAR2(50) NOT NULL)`,
  `INSERT INTO customers (id, name, email) VALUES (1, 'Acme Corp', 'acme@example.com')`,
  `INSERT INTO customers (id, name, email) VALUES (2, 'Globex', NULL)`,
  `INSERT INTO customers (id, name, email) VALUES (3, 'Initech', 'initech@example.com')`,
  `INSERT INTO orders (id, customer_id, amount, status) VALUES (1, 1, 200.50, 'paid')`,
  `INSERT INTO orders (id, customer_id, amount, status) VALUES (2, 1, 150.00, 'paid')`,
  `INSERT INTO orders (id, customer_id, amount, status) VALUES (3, 2, 99.00, 'pending')`,
  `CREATE VIEW customer_order_totals AS SELECT c.id AS customer_id, c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.amount),0) AS total_amount FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name`,
];

// Test subclass: inject connection credentials so we exercise the real SQL / execution path
// without standing up the Credential Engine (separately tested).
class TestableOracleDriver extends OracleExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { username: CONN.user, password: CONN.password } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    const pool = await this.getConnection(ds);
    await pool.close(0);
  }
}

const dataSource = {
  ID: '11111111-1111-1111-1111-111111111111',
  Name: 'Demo Oracle',
  DefaultSchema: 'EDS_IT', // Oracle folds the unquoted user name to uppercase
  DefaultDatabase: CONN.service,
  ConnectionConfig: JSON.stringify({ host: CONN.host, port: CONN.port, serviceName: CONN.service }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN)('OracleExternalDataSourceDriver (integration)', () => {
  const driver = new TestableOracleDriver();

  beforeAll(async () => {
    const conn = await oracledb.getConnection({
      user: CONN.user, password: CONN.password, connectString: `${CONN.host}:${CONN.port}/${CONN.service}`,
    });
    try {
      for (const stmt of SEED) {
        await conn.execute(stmt);
      }
      await conn.commit();
    } finally {
      await conn.close();
    }
  }, 60000);

  afterAll(async () => {
    await driver.closeAll(dataSource);
  });

  it('TestConnection succeeds against the live database', async () => {
    const res = await driver.TestConnection(dataSource);
    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('RunView returns rows from a table (schema-qualified) with field projection', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'CUSTOMERS', fields: ['ID', 'NAME', 'EMAIL'], orderBy: 'ID' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ ID: 1, NAME: 'Acme Corp' });
    expect(Object.keys(res.rows[0])).toEqual(['ID', 'NAME', 'EMAIL']); // projection respected
  });

  it('RunView applies a filter and reports totalRowCount when paginating', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'ORDERS', filter: "status = 'paid'", maxRows: 1, orderBy: 'id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1); // limited via FETCH NEXT
    expect(res.totalRowCount).toBe(2); // 2 paid orders total
  });

  it('RunView works against a view', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'CUSTOMER_ORDER_TOTALS', orderBy: 'customer_id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(3);
    const acme = res.rows.find((r) => r.CUSTOMER_ID === 1);
    expect(Number(acme?.TOTAL_AMOUNT)).toBeCloseTo(350.5);
  });

  it('LoadSingle fetches one record by primary key', async () => {
    const row = await driver.LoadSingle(dataSource, 'CUSTOMERS', { name: 'ID', value: 2 });
    expect(row).not.toBeNull();
    expect(row?.NAME).toBe('Globex');
  });

  it('RunNativeQuery executes a parameterized cross-table join', async () => {
    const res = await driver.RunNativeQuery(
      dataSource,
      `SELECT c.name AS name, COUNT(o.id) AS orders
         FROM customers c JOIN orders o ON o.customer_id = c.id
        WHERE o.status = :status GROUP BY c.name ORDER BY c.name`,
      [{ name: 'status', value: 'paid' }],
    );
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].NAME).toBe('Acme Corp');
    expect(Number(res.rows[0].ORDERS)).toBe(2);
  });

  it('IntrospectSchema discovers tables, the view, columns, primary keys, and foreign keys', async () => {
    const schema = await driver.IntrospectSchema(dataSource, 'EDS_IT');
    const names = schema.Objects.map((o) => o.Name).sort();
    expect(names).toEqual(['CUSTOMERS', 'CUSTOMER_ORDER_TOTALS', 'ORDERS']);

    const customers = schema.Objects.find((o) => o.Name === 'CUSTOMERS');
    expect(customers?.ObjectType).toBe('table');
    expect(customers?.Columns.find((c) => c.Name === 'ID')?.IsPrimaryKey).toBe(true);
    expect(customers?.Columns.find((c) => c.Name === 'EMAIL')?.Nullable).toBe(true);

    const view = schema.Objects.find((o) => o.Name === 'CUSTOMER_ORDER_TOTALS');
    expect(view?.ObjectType).toBe('view');

    // ORDERS.CUSTOMER_ID is a foreign key referencing CUSTOMERS(ID) — introspected into Relationships.
    const orders = schema.Objects.find((o) => o.Name === 'ORDERS');
    const fk = orders?.Relationships?.find((r) => r.ReferencedObject === 'CUSTOMERS');
    expect(fk?.Columns).toEqual([{ Column: 'CUSTOMER_ID', ReferencedColumn: 'ID' }]);
  });

  it('surfaces a clean failure (not a crash) on a bad object name', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'NO_SUCH_TABLE' });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
    expect(res.rows).toEqual([]);
  });
});
