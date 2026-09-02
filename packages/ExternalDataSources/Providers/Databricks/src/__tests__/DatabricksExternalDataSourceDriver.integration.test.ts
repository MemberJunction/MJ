import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { DatabricksExternalDataSourceDriver } from '../DatabricksExternalDataSourceDriver';

/**
 * Integration test for the Databricks driver against a REAL Databricks SQL warehouse.
 *
 * Opt-in: only runs when RUN_DATABRICKS_INTEGRATION=1, so the normal unit-test gate (no warehouse)
 * stays green. Like Snowflake, Databricks has no local service container — so this is NOT part of the
 * default CI matrix; run it against your own workspace (Free Edition / trial works with a PAT).
 *
 * NO seeding and NO committed credentials: the fixture is the `samples` catalog's `tpch` schema
 * (region / nation) — read-only sample data Unity Catalog provisions in EVERY workspace — so the
 * suite is deterministic against any workspace. All connection details come from env; nothing about a
 * specific workspace is hardcoded or committed:
 *   DATABRICKS_SERVER_HOSTNAME  e.g. dbc-abc123.cloud.databricks.com        [required]
 *   DATABRICKS_HTTP_PATH        e.g. /sql/1.0/warehouses/abc123             [required]
 *   DATABRICKS_TOKEN            a PAT (access-token auth)                    [secret — OR the pair below]
 *   DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET   OAuth M2M service principal (databricks-oauth)
 *   DATABRICKS_CATALOG (samples) · DATABRICKS_SCHEMA (tpch)                  [optional overrides]
 *
 *   RUN_DATABRICKS_INTEGRATION=1 npm run test   # with DATABRICKS_* set in the environment
 */
const RUN = process.env.RUN_DATABRICKS_INTEGRATION === '1';

// @databricks/sql is an OPTIONAL peer dependency (the driver loads it via dynamic import). A fresh
// `npm ci` does not install it, so detect its absence and skip with a clear message instead of
// failing the run with a cryptic "Cannot find package '@databricks/sql'".
let sdkAvailable = false;
try {
  createRequire(import.meta.url).resolve('@databricks/sql');
  sdkAvailable = true;
} catch {
  /* optional peer not installed */
}

const CONN = {
  serverHostname: process.env.DATABRICKS_SERVER_HOSTNAME ?? '',
  httpPath: process.env.DATABRICKS_HTTP_PATH ?? '',
  token: process.env.DATABRICKS_TOKEN ?? '',
  clientId: process.env.DATABRICKS_CLIENT_ID ?? '',
  clientSecret: process.env.DATABRICKS_CLIENT_SECRET ?? '',
  catalog: process.env.DATABRICKS_CATALOG ?? 'samples',
  schema: process.env.DATABRICKS_SCHEMA ?? 'tpch',
};
// Either a PAT, or a full OAuth M2M pair.
const hasCreds = !!(CONN.serverHostname && CONN.httpPath && (CONN.token || (CONN.clientId && CONN.clientSecret)));

if (RUN && !sdkAvailable) {
  console.warn(
    '[databricks integration] RUN_DATABRICKS_INTEGRATION=1 but @databricks/sql is not installed (optional peer). Run `npm install @databricks/sql` to enable these tests. Skipping.',
  );
}
if (RUN && sdkAvailable && !hasCreds) {
  console.warn(
    '[databricks integration] RUN_DATABRICKS_INTEGRATION=1 but DATABRICKS_SERVER_HOSTNAME / DATABRICKS_HTTP_PATH plus a credential (DATABRICKS_TOKEN, or DATABRICKS_CLIENT_ID+SECRET) are not all set. Skipping.',
  );
}

// Test subclass: inject the connection credentials so we exercise the real SQL / execution / marshalling
// path without standing up the Credential Engine (separately tested).
class TestableDatabricksDriver extends DatabricksExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { token: CONN.token, clientId: CONN.clientId, clientSecret: CONN.clientSecret } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null, expirationStatus: 'valid' };
  }
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    await this.invalidateConnection(ds.ID);
  }
}

const dataSource = {
  ID: 'dddddddd-0000-0000-0000-000000000014',
  Name: 'Demo Databricks',
  TypeID: 'eeeeeeee-0000-0000-0000-000000000015',
  CredentialID: 'ffffffff-0000-0000-0000-000000000016',
  DefaultDatabase: CONN.catalog,
  DefaultSchema: CONN.schema,
  ConnectionConfig: JSON.stringify({ serverHostname: CONN.serverHostname, httpPath: CONN.httpPath, catalog: CONN.catalog }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

// Fully qualify against the samples catalog so we never depend on the warehouse's session catalog.
const region = `${CONN.catalog}.${CONN.schema}.region`;
const nation = `${CONN.catalog}.${CONN.schema}.nation`;

describe.runIf(RUN && sdkAvailable && hasCreds)('DatabricksExternalDataSourceDriver (integration)', () => {
  const driver = new TestableDatabricksDriver();

  afterAll(async () => {
    await driver.closeAll(dataSource);
  });

  it('TestConnection succeeds against the live warehouse', async () => {
    const res = await driver.TestConnection(dataSource);
    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('RunView returns rows from tpch.region with field projection', async () => {
    const res = await driver.RunView(dataSource, { objectName: region, fields: ['r_regionkey', 'r_name'], orderBy: 'r_regionkey' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(5);
    expect(Number(res.rows[0].r_regionkey)).toBe(0);
    expect(String(res.rows[0].r_name)).toBe('AFRICA');
  });

  it('RunView applies a filter', async () => {
    const res = await driver.RunView(dataSource, { objectName: region, filter: "r_name = 'EUROPE'", orderBy: 'r_regionkey' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(Number(res.rows[0].r_regionkey)).toBe(3);
  });

  // The real CodeGen path: a BARE object name (no catalog) must resolve against the source's DefaultDatabase
  // (catalog) + DefaultSchema via the session's initialCatalog/initialSchema — NOT the warehouse default
  // catalog. Without that, this read fails with TABLE_OR_VIEW_NOT_FOUND.
  it('RunView resolves a bare object name via the session catalog (initialCatalog/initialSchema)', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'region', fields: ['r_regionkey', 'r_name'], orderBy: 'r_regionkey' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(5);
    expect(String(res.rows[0].r_name)).toBe('AFRICA');
  });

  it('RunView paging: LIMIT/OFFSET returns a deterministic window + total count', async () => {
    const res = await driver.RunView(dataSource, { objectName: region, orderBy: 'r_regionkey', maxRows: 2, offset: 1 });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(Number(res.rows[0].r_regionkey)).toBe(1); // AMERICA
    expect(res.totalRowCount).toBe(5);
  });

  it('LoadSingle fetches one record by key', async () => {
    const row = await driver.LoadSingle(dataSource, region, [{ name: 'r_regionkey', value: 0 }]);
    expect(row).not.toBeNull();
    expect(String(row?.r_name)).toBe('AFRICA');
  });

  it('RunNativeQuery executes a cross-table join (nations per region) with a named bind', async () => {
    const res = await driver.RunNativeQuery(
      dataSource,
      `SELECT r.r_name AS region, COUNT(n.n_nationkey) AS nations
         FROM ${region} r
         JOIN ${nation} n ON n.n_regionkey = r.r_regionkey
        WHERE r.r_regionkey >= :minKey
        GROUP BY r.r_name ORDER BY r.r_name`,
      [{ name: 'minKey', value: 0 }],
    );
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(5); // 5 regions
    expect(res.rows.every((r) => Number(r.nations) === 5)).toBe(true); // 25 nations / 5 regions
  });

  it('IntrospectSchema discovers tpch tables and columns via Unity Catalog information_schema', async () => {
    const schema = await driver.IntrospectSchema(dataSource, CONN.schema);
    const names = schema.Objects.map((o) => o.Name);
    expect(names).toContain('region');
    expect(names).toContain('nation');
    const regionObj = schema.Objects.find((o) => o.Name === 'region');
    expect(regionObj?.Columns.some((c) => c.Name === 'r_regionkey')).toBe(true);
  });

  it('surfaces a clean failure (not a crash) on a bad object name', async () => {
    const res = await driver.RunView(dataSource, { objectName: `${CONN.catalog}.${CONN.schema}.no_such_table_xyz` });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
    expect(res.rows).toEqual([]);
  });
});
