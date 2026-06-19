import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { PostgresExternalDataSourceDriver } from '../PostgresExternalDataSourceDriver';

/**
 * Integration test for the PostgreSQL reference driver against a REAL PostgreSQL.
 *
 * Opt-in: only runs when RUN_PG_INTEGRATION=1, so the normal unit-test gate (no DB) stays green.
 *
 * Self-seeding: the suite creates its own `demo` schema (customers/orders + a view) idempotently
 * in beforeAll, so it's deterministic and reproducible against ANY blank PostgreSQL — a CI service
 * container or the local workbench `postgres-claude` (the defaults below match the workbench).
 *
 * Connection is parameterized via env so CI can point it at its own database:
 *   PG_HOST (localhost) · PG_PORT (5433) · PG_DATABASE (MJ_Workbench_PG) · PG_USER (mj_admin) · PG_PASSWORD (Claude2Pg99)
 *
 *   RUN_PG_INTEGRATION=1 npm run test
 *   # CI: RUN_PG_INTEGRATION=1 PG_HOST=localhost PG_PORT=5432 PG_DATABASE=eds_it PG_USER=postgres PG_PASSWORD=postgres npm run test
 */
const RUN = process.env.RUN_PG_INTEGRATION === '1';

const CONN = {
  host: process.env.PG_HOST ?? 'localhost',
  port: Number(process.env.PG_PORT ?? 5433),
  database: process.env.PG_DATABASE ?? 'MJ_Workbench_PG',
  user: process.env.PG_USER ?? 'mj_admin',
  password: process.env.PG_PASSWORD ?? 'Claude2Pg99',
};

/** Idempotent seed: the deterministic `demo` schema the assertions below rely on. */
const SEED_SQL = `
CREATE SCHEMA IF NOT EXISTS demo;
DROP VIEW IF EXISTS demo.customer_order_totals;
DROP TABLE IF EXISTS demo.orders;
DROP TABLE IF EXISTS demo.customers;
CREATE TABLE demo.customers (id integer PRIMARY KEY, name text NOT NULL, email text);
CREATE TABLE demo.orders (
  id integer PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES demo.customers(id),
  amount numeric NOT NULL,
  status text NOT NULL
);
INSERT INTO demo.customers (id, name, email) VALUES
  (1, 'Acme Corp', 'acme@example.com'),
  (2, 'Globex', NULL),
  (3, 'Initech', 'initech@example.com');
INSERT INTO demo.orders (id, customer_id, amount, status) VALUES
  (1, 1, 200.50, 'paid'),
  (2, 1, 150.00, 'paid'),
  (3, 2, 99.00, 'pending');
CREATE VIEW demo.customer_order_totals AS
  SELECT c.id AS customer_id, c.name,
         COUNT(o.id) AS order_count,
         COALESCE(SUM(o.amount), 0) AS total_amount
    FROM demo.customers c
    LEFT JOIN demo.orders o ON o.customer_id = c.id
   GROUP BY c.id, c.name;
`;

// Test subclass: inject the connection credentials so we exercise the real SQL /
// execution / marshalling path without standing up the Credential Engine (separately tested).
class TestablePostgresDriver extends PostgresExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { username: CONN.user, password: CONN.password } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
  // Expose pool cleanup for afterAll.
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    const pool = await this.getConnection(ds);
    await pool.end();
  }
}

const dataSource = {
  ID: '11111111-1111-1111-1111-111111111111',
  Name: 'Demo Postgres',
  TypeID: '22222222-2222-2222-2222-222222222222',
  CredentialID: '33333333-3333-3333-3333-333333333333',
  DefaultSchema: 'demo',
  DefaultDatabase: CONN.database,
  ConnectionConfig: JSON.stringify({ host: CONN.host, port: CONN.port }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN)('PostgresExternalDataSourceDriver (integration)', () => {
  const driver = new TestablePostgresDriver();

  beforeAll(async () => {
    const seedPool = new pg.Pool({ ...CONN });
    try {
      await seedPool.query(SEED_SQL);
    } finally {
      await seedPool.end();
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
    expect(res.rows).toHaveLength(1); // limited
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
      `SELECT c.name, COUNT(o.id)::int AS orders
         FROM demo.customers c JOIN demo.orders o ON o.customer_id = c.id
        WHERE o.status = $1 GROUP BY c.name ORDER BY c.name`,
      [{ name: 'status', value: 'paid' }],
    );
    expect(res.success).toBe(true);
    expect(res.rows).toEqual([{ name: 'Acme Corp', orders: 2 }]);
  });

  it('IntrospectSchema discovers tables, the view, columns, and primary keys', async () => {
    const schema = await driver.IntrospectSchema(dataSource, 'demo');
    const names = schema.objects.map((o) => o.name).sort();
    expect(names).toEqual(['customer_order_totals', 'customers', 'orders']);

    const customers = schema.objects.find((o) => o.name === 'customers');
    expect(customers?.objectType).toBe('table');
    const idCol = customers?.columns.find((c) => c.name === 'id');
    expect(idCol?.isPrimaryKey).toBe(true);
    const emailCol = customers?.columns.find((c) => c.name === 'email');
    expect(emailCol?.nullable).toBe(true);

    const view = schema.objects.find((o) => o.name === 'customer_order_totals');
    expect(view?.objectType).toBe('view');
  });

  it('surfaces a clean failure (not a crash) on a bad object name', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'no_such_table' });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
    expect(res.rows).toEqual([]);
  });
});
