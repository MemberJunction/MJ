import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { SQLServerExternalDataSourceDriver } from '../SQLServerExternalDataSourceDriver';

/**
 * Live integration test for Microsoft Fabric via the SQL Server driver + Entra service-principal auth.
 *
 * Opt-in: only runs when RUN_FABRIC_INTEGRATION=1 (no service container exists for Fabric — needs a
 * live trial + a provisioned service principal). Mirrors the Snowflake opt-in model.
 *
 *   RUN_FABRIC_INTEGRATION=1 FABRIC_HOST=xxxx.datawarehouse.fabric.microsoft.com FABRIC_DATABASE=WWI_Sample \
 *   FABRIC_TENANT_ID=... FABRIC_CLIENT_ID=... FABRIC_CLIENT_SECRET=... npm run test -- fabric.integration
 *
 * No fixture seeding — reads Fabric's built-in Wide World Importers sample. The test introspects the
 * warehouse and reads whatever table it finds, so it's robust to which sample objects are present.
 */
const RUN = process.env.RUN_FABRIC_INTEGRATION === '1';
const CONN = {
  host: process.env.FABRIC_HOST ?? '',
  database: process.env.FABRIC_DATABASE ?? '',
  schema: process.env.FABRIC_SCHEMA ?? 'dbo',
  tenantId: process.env.FABRIC_TENANT_ID ?? '',
  clientId: process.env.FABRIC_CLIENT_ID ?? '',
  clientSecret: process.env.FABRIC_CLIENT_SECRET ?? '',
  table: process.env.FABRIC_TABLE, // optional; falls back to the first introspected table
};

// Inject the Entra service-principal credential without standing up the Credential Engine.
class FabricTestDriver extends SQLServerExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { tenantId: CONN.tenantId, clientId: CONN.clientId, clientSecret: CONN.clientSecret } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    const pool = await this.getConnection(ds);
    await pool.close();
  }
}

// authMode 'entra-service-principal' is explicit here; the driver would also infer it from the clientId.
const dataSource = {
  ID: 'fab00000-0000-0000-0000-000000000001',
  Name: 'Fabric Sample Warehouse',
  DefaultSchema: CONN.schema,
  DefaultDatabase: CONN.database,
  ConnectionConfig: JSON.stringify({ host: CONN.host, ssl: true, authMode: 'entra-service-principal' }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN)('SQLServerExternalDataSourceDriver — Microsoft Fabric (live integration)', () => {
  const driver = new FabricTestDriver();

  afterAll(async () => {
    await driver.closeAll(dataSource).catch(() => { /* best-effort */ });
  });

  it('TestConnection succeeds against the Fabric SQL endpoint (Entra service principal)', async () => {
    const res = await driver.TestConnection(dataSource);
    if (!res.success) console.error(`[FABRIC] TestConnection failed: ${res.message}`);
    expect(res.success).toBe(true);
  });

  it('IntrospectSchema discovers tables in the warehouse', async () => {
    const schema = await driver.IntrospectSchema(dataSource, CONN.schema);
    expect(schema.Objects.length).toBeGreaterThan(0);
    console.log(`[FABRIC] discovered ${schema.Objects.length} objects:`, schema.Objects.map((o) => o.Name).slice(0, 15).join(', '));
  });

  it('RunView reads rows from a warehouse table (projected + capped)', async () => {
    let table = CONN.table;
    if (!table) {
      const schema = await driver.IntrospectSchema(dataSource, CONN.schema);
      table = (schema.Objects.find((o) => o.ObjectType === 'table') ?? schema.Objects[0])?.Name;
    }
    expect(table).toBeTruthy();
    const res = await driver.RunView(dataSource, { objectName: table!, maxRows: 5 });
    console.log(`[FABRIC] read ${res.rows.length} row(s) from ${CONN.schema}.${table}`);
    expect(res.rows.length).toBeLessThanOrEqual(5);
  });
});

/**
 * FK introspection on Fabric. Fabric Warehouse accepts PRIMARY KEY / FOREIGN KEY constraints only
 * as `NOT ENFORCED`, and only via `ALTER TABLE` — inline constraints in `CREATE TABLE` error with
 * "PRIMARY KEY keyword is not supported ... in this edition". Once created, they surface through the
 * same `sys.foreign_keys` path the driver uses for SQL Server. We self-seed a tiny customers/orders
 * fixture (raw mssql, since the driver is read-only) and confirm the FK is introspected into
 * `Relationships`, then drop the fixture.
 */
describe.runIf(RUN)('SQLServerExternalDataSourceDriver — Fabric FK introspection (live)', () => {
  const FK_SCHEMA = 'eds_fk_it';
  const driver = new FabricTestDriver();
  let raw: sql.ConnectionPool;
  const drops = [
    `DROP TABLE IF EXISTS ${FK_SCHEMA}.orders`,
    `DROP TABLE IF EXISTS ${FK_SCHEMA}.customers`,
    `DROP SCHEMA IF EXISTS ${FK_SCHEMA}`,
  ];

  beforeAll(async () => {
    raw = await new sql.ConnectionPool({
      server: CONN.host,
      database: CONN.database,
      options: { encrypt: true, trustServerCertificate: false, abortTransactionOnError: null },
      authentication: {
        type: 'azure-active-directory-service-principal-secret',
        options: { clientId: CONN.clientId, clientSecret: CONN.clientSecret, tenantId: CONN.tenantId },
      },
    }).connect();
    const run = (q: string) => raw.request().query(q);
    for (const q of drops) { await run(q).catch(() => { /* no prior fixture */ }); }
    await run(`CREATE SCHEMA ${FK_SCHEMA}`);
    await run(`CREATE TABLE ${FK_SCHEMA}.customers (id INT NOT NULL, name VARCHAR(100))`);
    await run(`CREATE TABLE ${FK_SCHEMA}.orders (id INT NOT NULL, customer_id INT)`);
    await run(`ALTER TABLE ${FK_SCHEMA}.customers ADD CONSTRAINT pk_eds_it_cust PRIMARY KEY NONCLUSTERED (id) NOT ENFORCED`);
    await run(`ALTER TABLE ${FK_SCHEMA}.orders ADD CONSTRAINT fk_eds_it_ord_cust FOREIGN KEY (customer_id) REFERENCES ${FK_SCHEMA}.customers(id) NOT ENFORCED`);
  }, 60000);

  afterAll(async () => {
    if (raw) {
      const run = (q: string) => raw.request().query(q);
      for (const q of drops) { await run(q).catch(() => { /* best-effort */ }); }
      await raw.close().catch(() => { /* best-effort */ });
    }
    await driver.closeAll(dataSource).catch(() => { /* best-effort */ });
  });

  it('introspects a NOT ENFORCED foreign key into Relationships', async () => {
    const schema = await driver.IntrospectSchema(dataSource, FK_SCHEMA);
    const orders = schema.Objects.find((o) => o.Name === 'orders');
    expect(orders).toBeTruthy();
    const fk = orders?.Relationships?.find((r) => r.ReferencedObject === 'customers');
    expect(fk).toBeTruthy();
    expect(fk?.Columns).toEqual([{ Column: 'customer_id', ReferencedColumn: 'id' }]);
  }, 30000);
});
