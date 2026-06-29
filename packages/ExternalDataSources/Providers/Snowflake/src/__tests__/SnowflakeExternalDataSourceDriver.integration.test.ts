import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { SnowflakeExternalDataSourceDriver } from '../SnowflakeExternalDataSourceDriver';

/**
 * Integration test for the Snowflake driver against a REAL Snowflake account.
 *
 * Opt-in: only runs when RUN_SNOWFLAKE_INTEGRATION=1, so the normal unit-test gate (no account)
 * stays green. Unlike Postgres/MongoDB, Snowflake has no local service container — so this is NOT
 * part of the default CI matrix; run it against your own account.
 *
 * NO seeding and NO committed credentials: the fixture is `SNOWFLAKE_SAMPLE_DATA.TPCH_SF1`
 * (REGION / NATION) — read-only sample data Snowflake provisions in EVERY account — so the suite
 * is deterministic against any account. All connection details come from env; nothing about a
 * specific account is hardcoded or committed:
 *   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PAT (or SNOWFLAKE_PASSWORD)   [required, secret]
 *   SNOWFLAKE_WAREHOUSE (COMPUTE_WH) · SNOWFLAKE_DATABASE (SNOWFLAKE_SAMPLE_DATA)
 *   SNOWFLAKE_SCHEMA (TPCH_SF1) · SNOWFLAKE_ROLE (optional)
 *
 *   RUN_SNOWFLAKE_INTEGRATION=1 npm run test   # with SNOWFLAKE_* set in the environment
 */
const RUN = process.env.RUN_SNOWFLAKE_INTEGRATION === '1';

// snowflake-sdk is an OPTIONAL peer dependency (the driver loads it via dynamic import). A fresh
// `npm ci` does not install it, so detect its absence and skip with a clear message instead of
// failing the run with a cryptic "Cannot find package 'snowflake-sdk'".
let sdkAvailable = false;
try {
  createRequire(import.meta.url).resolve('snowflake-sdk');
  sdkAvailable = true;
} catch {
  /* optional peer not installed */
}

const CONN = {
  account: process.env.SNOWFLAKE_ACCOUNT ?? '',
  user: process.env.SNOWFLAKE_USER ?? '',
  // PAT (bypasses MFA) preferred; a password works too. Either is the secret.
  secret: process.env.SNOWFLAKE_PAT ?? process.env.SNOWFLAKE_PASSWORD ?? '',
  warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? 'COMPUTE_WH',
  database: process.env.SNOWFLAKE_DATABASE ?? 'SNOWFLAKE_SAMPLE_DATA',
  schema: process.env.SNOWFLAKE_SCHEMA ?? 'TPCH_SF1',
  role: process.env.SNOWFLAKE_ROLE || undefined,
};
const hasCreds = !!(CONN.account && CONN.user && CONN.secret);

if (RUN && !sdkAvailable) {
  console.warn(
    '[snowflake integration] RUN_SNOWFLAKE_INTEGRATION=1 but snowflake-sdk is not installed (optional peer). Run `npm install snowflake-sdk` to enable these tests. Skipping.',
  );
}
if (RUN && sdkAvailable && !hasCreds) {
  console.warn(
    '[snowflake integration] RUN_SNOWFLAKE_INTEGRATION=1 but SNOWFLAKE_ACCOUNT / SNOWFLAKE_USER / SNOWFLAKE_PAT (or _PASSWORD) are not all set. Skipping.',
  );
}

// Test subclass: inject the connection credentials so we exercise the real SQL / execution /
// marshalling path without standing up the Credential Engine (separately tested).
class TestableSnowflakeDriver extends SnowflakeExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    // token covers PAT/OAuth; password covers basic — set both so either authenticator works.
    const values = { username: CONN.user, password: CONN.secret, token: CONN.secret } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
  public async closeAll(ds: MJExternalDataSourceEntity): Promise<void> {
    await this.invalidateConnection(ds.ID);
  }
}

const dataSource = {
  ID: 'dddddddd-0000-0000-0000-000000000004',
  Name: 'Demo Snowflake',
  TypeID: 'eeeeeeee-0000-0000-0000-000000000005',
  CredentialID: 'ffffffff-0000-0000-0000-000000000006',
  DefaultDatabase: CONN.database,
  DefaultSchema: CONN.schema,
  ConnectionConfig: JSON.stringify({ account: CONN.account, warehouse: CONN.warehouse, role: CONN.role, authenticator: 'PROGRAMMATIC_ACCESS_TOKEN' }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN && sdkAvailable && hasCreds)('SnowflakeExternalDataSourceDriver (integration)', () => {
  const driver = new TestableSnowflakeDriver();

  afterAll(async () => {
    await driver.closeAll(dataSource);
  });

  it('TestConnection succeeds against the live account', async () => {
    const res = await driver.TestConnection(dataSource);
    expect(res.success).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('RunView returns rows from REGION (TPCH sample) with field projection', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'REGION', fields: ['R_REGIONKEY', 'R_NAME'], orderBy: 'R_REGIONKEY' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(5);
    expect(Number(res.rows[0].R_REGIONKEY)).toBe(0);
    expect(res.rows[0].R_NAME).toBe('AFRICA');
  });

  it('RunView applies a filter', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'REGION', filter: "R_NAME = 'EUROPE'", orderBy: 'R_REGIONKEY' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(Number(res.rows[0].R_REGIONKEY)).toBe(3);
  });

  it('LoadSingle fetches one record by key', async () => {
    const row = await driver.LoadSingle(dataSource, 'REGION', { name: 'R_REGIONKEY', value: 0 });
    expect(row).not.toBeNull();
    expect(row?.R_NAME).toBe('AFRICA');
  });

  it('RunNativeQuery executes a cross-table join (nations per region)', async () => {
    const res = await driver.RunNativeQuery(
      dataSource,
      `SELECT r.R_NAME AS REGION, COUNT(n.N_NATIONKEY) AS NATIONS
         FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.REGION r
         JOIN SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.NATION n ON n.N_REGIONKEY = r.R_REGIONKEY
        GROUP BY r.R_NAME ORDER BY r.R_NAME`,
      undefined,
    );
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(5); // 5 regions
    expect(res.rows.every((r) => Number(r.NATIONS) === 5)).toBe(true); // 25 nations / 5 regions
  });

  it('IntrospectSchema discovers TPCH tables and columns', async () => {
    const schema = await driver.IntrospectSchema(dataSource, CONN.schema);
    const names = schema.Objects.map((o) => o.Name);
    expect(names).toContain('REGION');
    expect(names).toContain('NATION');
    const region = schema.Objects.find((o) => o.Name === 'REGION');
    expect(region?.Columns.some((c) => c.Name === 'R_REGIONKEY')).toBe(true);
  });

  it('surfaces a clean failure (not a crash) on a bad object name', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'NO_SUCH_TABLE_XYZ' });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
    expect(res.rows).toEqual([]);
  });
});
