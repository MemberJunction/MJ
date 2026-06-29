import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { MySQLExternalDataSourceDriver } from '../MySQLExternalDataSourceDriver';

/**
 * Integration test for the MySQL driver against a REAL MySQL.
 *
 * Opt-in: only runs when RUN_MYSQL_INTEGRATION=1, so the normal unit-test gate (no DB) stays green.
 *
 * Self-seeding: the suite creates its own `eds_it` database (customers/orders + a view, with a FK)
 * idempotently in beforeAll, so it's deterministic against any MySQL — a CI service container or a
 * local throwaway `docker run mysql:8` (the defaults below match `-p 3307:3306`).
 *
 *   RUN_MYSQL_INTEGRATION=1 MYSQL_HOST=localhost MYSQL_PORT=3307 MYSQL_USER=root MYSQL_PASSWORD=... npm run test
 */
const RUN = process.env.RUN_MYSQL_INTEGRATION === '1';

const CONN = {
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3307),
  database: process.env.MYSQL_DATABASE ?? 'eds_it',
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? 'Claude2My99',
};

/** Idempotent seed: the deterministic `eds_it` database the assertions below rely on. */
const SEED_SQL = `
DROP DATABASE IF EXISTS eds_it;
CREATE DATABASE eds_it;
USE eds_it;
CREATE TABLE customers (id int PRIMARY KEY, name varchar(200) NOT NULL, email varchar(200) NULL);
CREATE TABLE orders (
  id int PRIMARY KEY,
  customer_id int NOT NULL,
  amount decimal(10,2) NOT NULL,
  status varchar(50) NOT NULL,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
INSERT INTO customers (id, name, email) VALUES (1,'Acme Corp','acme@example.com'),(2,'Globex',NULL),(3,'Initech','initech@example.com');
INSERT INTO orders (id, customer_id, amount, status) VALUES (1,1,200.50,'paid'),(2,1,150.00,'paid'),(3,2,99.00,'pending');
CREATE VIEW customer_order_totals AS SELECT c.id AS customer_id, c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.amount),0) AS total_amount FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name;
`;

// Test subclass: inject the connection credentials so we exercise the real SQL / execution /
// marshalling path without standing up the Credential Engine (separately tested).
class TestableMySQLDriver extends MySQLExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { username: CONN.user, password: CONN.password } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    const pool = await this.getConnection(ds);
    await pool.end();
  }
}

const dataSource = {
  ID: '11111111-1111-1111-1111-111111111111',
  Name: 'Demo MySQL',
  DefaultSchema: 'eds_it',
  DefaultDatabase: 'eds_it',
  ConnectionConfig: JSON.stringify({ host: CONN.host, port: CONN.port }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN)('MySQLExternalDataSourceDriver (integration)', () => {
  const driver = new TestableMySQLDriver();

  beforeAll(async () => {
    const seed = await mysql.createConnection({
      host: CONN.host, port: CONN.port, user: CONN.user, password: CONN.password, multipleStatements: true,
    });
    try {
      await seed.query(SEED_SQL);
    } finally {
      await seed.end();
    }
  });

  afterAll(async () => {
    await driver.closeAll(dataSource);
  });

  it('TestConnection succeeds against the live database', async () => {
    const res = await driver.TestConnection(dataSource);
    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('RunView returns rows from a table (schema-qualified) with field projection', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'customers', fields: ['id', 'name', 'email'], orderBy: 'id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ id: 1, name: 'Acme Corp' });
    expect(Object.keys(res.rows[0])).toEqual(['id', 'name', 'email']); // projection respected
  });

  it('RunView applies a filter and reports totalRowCount when paginating', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'orders', filter: "status = 'paid'", maxRows: 1, orderBy: 'id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1); // limited via LIMIT
    expect(res.totalRowCount).toBe(2); // 2 paid orders total
  });

  it('RunView works against a view', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'customer_order_totals', orderBy: 'customer_id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(3);
    const acme = res.rows.find((r) => r.customer_id === 1);
    expect(Number(acme?.total_amount)).toBeCloseTo(350.5);
  });

  it('LoadSingle fetches one record by primary key', async () => {
    const row = await driver.LoadSingle(dataSource, 'customers', { name: 'id', value: 2 });
    expect(row).not.toBeNull();
    expect(row?.name).toBe('Globex');
  });

  it('RunNativeQuery executes a parameterized cross-table join', async () => {
    const res = await driver.RunNativeQuery(
      dataSource,
      `SELECT c.name, COUNT(o.id) AS orders
         FROM customers c JOIN orders o ON o.customer_id = c.id
        WHERE o.status = ? GROUP BY c.name ORDER BY c.name`,
      [{ name: 'status', value: 'paid' }],
    );
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].name).toBe('Acme Corp');
    expect(Number(res.rows[0].orders)).toBe(2);
  });

  it('IntrospectSchema discovers tables, the view, columns, primary keys, and foreign keys', async () => {
    const schema = await driver.IntrospectSchema(dataSource, 'eds_it');
    const names = schema.Objects.map((o) => o.Name).sort();
    expect(names).toEqual(['customer_order_totals', 'customers', 'orders']);

    const customers = schema.Objects.find((o) => o.Name === 'customers');
    expect(customers?.ObjectType).toBe('table');
    expect(customers?.Columns.find((c) => c.Name === 'id')?.IsPrimaryKey).toBe(true);
    expect(customers?.Columns.find((c) => c.Name === 'email')?.Nullable).toBe(true);

    const view = schema.Objects.find((o) => o.Name === 'customer_order_totals');
    expect(view?.ObjectType).toBe('view');

    // orders.customer_id is a foreign key referencing customers(id) — introspected into Relationships.
    const orders = schema.Objects.find((o) => o.Name === 'orders');
    const fk = orders?.Relationships?.find((r) => r.ReferencedObject === 'customers');
    expect(fk?.Columns).toEqual([{ Column: 'customer_id', ReferencedColumn: 'id' }]);
  });

  it('surfaces a clean failure (not a crash) on a bad object name', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'no_such_table' });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
    expect(res.rows).toEqual([]);
  });
});
