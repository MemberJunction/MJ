import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { SQLServerExternalDataSourceDriver } from '../SQLServerExternalDataSourceDriver';

/**
 * Integration test for the SQL Server driver against a REAL SQL Server.
 *
 * Opt-in: only runs when RUN_SQLSERVER_INTEGRATION=1, so the normal unit-test gate (no DB) stays green.
 *
 * Self-seeding: the suite creates its own `eds_it` schema (customers/orders + a view, with a FK)
 * idempotently in beforeAll, so it's deterministic against any SQL Server — a CI service container
 * or the local workbench `sql-claude` (the defaults below match the workbench).
 *
 *   RUN_SQLSERVER_INTEGRATION=1 MSSQL_HOST=localhost MSSQL_PORT=1444 MSSQL_DATABASE=MJ_EDS_N MSSQL_USER=sa MSSQL_PASSWORD=... npm run test
 */
const RUN = process.env.RUN_SQLSERVER_INTEGRATION === '1';

const CONN = {
  host: process.env.MSSQL_HOST ?? 'localhost',
  port: Number(process.env.MSSQL_PORT ?? 1444),
  database: process.env.MSSQL_DATABASE ?? 'MJ_EDS_N',
  user: process.env.MSSQL_USER ?? 'sa',
  password: process.env.MSSQL_PASSWORD ?? 'Claude2Sql99',
};

/** Idempotent seed (EXEC() wraps CREATE SCHEMA/VIEW so the whole thing runs as one batch). */
const SEED_SQL = `
IF SCHEMA_ID('eds_it') IS NULL EXEC('CREATE SCHEMA eds_it');
IF OBJECT_ID('eds_it.customer_order_totals') IS NOT NULL DROP VIEW eds_it.customer_order_totals;
IF OBJECT_ID('eds_it.orders') IS NOT NULL DROP TABLE eds_it.orders;
IF OBJECT_ID('eds_it.customers') IS NOT NULL DROP TABLE eds_it.customers;
CREATE TABLE eds_it.customers (id int PRIMARY KEY, name nvarchar(200) NOT NULL, email nvarchar(200) NULL);
CREATE TABLE eds_it.orders (
  id int PRIMARY KEY,
  customer_id int NOT NULL CONSTRAINT FK_orders_customer FOREIGN KEY REFERENCES eds_it.customers(id),
  amount decimal(10,2) NOT NULL,
  status nvarchar(50) NOT NULL
);
INSERT INTO eds_it.customers (id, name, email) VALUES (1,'Acme Corp','acme@example.com'),(2,'Globex',NULL),(3,'Initech','initech@example.com');
INSERT INTO eds_it.orders (id, customer_id, amount, status) VALUES (1,1,200.50,'paid'),(2,1,150.00,'paid'),(3,2,99.00,'pending');
EXEC('CREATE VIEW eds_it.customer_order_totals AS SELECT c.id AS customer_id, c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.amount),0) AS total_amount FROM eds_it.customers c LEFT JOIN eds_it.orders o ON o.customer_id = c.id GROUP BY c.id, c.name');
`;

// Test subclass: inject the connection credentials so we exercise the real SQL / execution /
// marshalling path without standing up the Credential Engine (separately tested).
class TestableSQLServerDriver extends SQLServerExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { username: CONN.user, password: CONN.password } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    const pool = await this.getConnection(ds);
    await pool.close();
  }
}

const dataSource = {
  ID: '11111111-1111-1111-1111-111111111111',
  Name: 'Demo SQL Server',
  DefaultSchema: 'eds_it',
  DefaultDatabase: CONN.database,
  // encrypt + trust self-signed: matches the workbench sql-claude connection.
  ConnectionConfig: JSON.stringify({ host: CONN.host, port: CONN.port, ssl: true, sslRejectUnauthorized: false }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN)('SQLServerExternalDataSourceDriver (integration)', () => {
  const driver = new TestableSQLServerDriver();

  beforeAll(async () => {
    const seedPool = await new sql.ConnectionPool({
      server: CONN.host, port: CONN.port, database: CONN.database, user: CONN.user, password: CONN.password,
      options: { encrypt: true, trustServerCertificate: true },
    }).connect();
    try {
      await seedPool.request().batch(SEED_SQL);
    } finally {
      await seedPool.close();
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
    expect(res.rows).toHaveLength(1); // limited via TOP
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
         FROM eds_it.customers c JOIN eds_it.orders o ON o.customer_id = c.id
        WHERE o.status = @status GROUP BY c.name ORDER BY c.name`,
      [{ name: 'status', value: 'paid' }],
    );
    expect(res.success).toBe(true);
    expect(res.rows).toEqual([{ name: 'Acme Corp', orders: 2 }]);
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
