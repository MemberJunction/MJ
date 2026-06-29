import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { ResolvedCredential } from '@memberjunction/credentials';
import { MongoExternalDataSourceDriver } from '../MongoExternalDataSourceDriver';

/**
 * Integration test for the MongoDB driver against a REAL MongoDB.
 *
 * Opt-in: only runs when RUN_MONGO_INTEGRATION=1, so the normal unit-test gate (no DB) stays green.
 *
 * Self-seeding: the suite (re)populates its own `demo` database (customers/orders collections) in
 * beforeAll, so it's deterministic and reproducible against ANY MongoDB — a CI service container or
 * the local `mj-eds-mongo` container (the defaults below match it).
 *
 * Connection is parameterized via env so CI can point it at its own database:
 *   MONGO_HOST (localhost) · MONGO_PORT (27018) · MONGO_DATABASE (demo)
 *   MONGO_USER (mj_admin) · MONGO_PASSWORD (Claude2Mongo99) · MONGO_AUTH_SOURCE (admin)
 *
 *   RUN_MONGO_INTEGRATION=1 npm run test
 *   # CI: RUN_MONGO_INTEGRATION=1 MONGO_HOST=localhost MONGO_PORT=27017 MONGO_USER=root MONGO_PASSWORD=root npm run test
 */
const RUN = process.env.RUN_MONGO_INTEGRATION === '1';

const CONN = {
  host: process.env.MONGO_HOST ?? 'localhost',
  port: Number(process.env.MONGO_PORT ?? 27018),
  database: process.env.MONGO_DATABASE ?? 'demo',
  user: process.env.MONGO_USER ?? 'mj_admin',
  password: process.env.MONGO_PASSWORD ?? 'Claude2Mongo99',
  authSource: process.env.MONGO_AUTH_SOURCE ?? 'admin',
};

const CUSTOMERS = [
  { _id: 1, name: 'Acme Corp', email: 'acme@example.com', tier: 'gold' },
  { _id: 2, name: 'Globex', email: null, tier: 'silver' },
  { _id: 3, name: 'Initech', email: 'initech@example.com', tier: 'silver' },
];
const ORDERS = [
  { _id: 1, customer_id: 1, amount: 200.5, status: 'paid' },
  { _id: 2, customer_id: 1, amount: 150.0, status: 'paid' },
  { _id: 3, customer_id: 2, amount: 99.0, status: 'pending' },
];

// Test subclass: inject the connection credentials so we exercise the real query /
// translation / marshalling path without standing up the Credential Engine (separately tested).
class TestableMongoDriver extends MongoExternalDataSourceDriver {
  protected override async resolveCredential<TCred extends Record<string, string> = Record<string, string>>(): Promise<ResolvedCredential<TCred> | null> {
    const values = { username: CONN.user, password: CONN.password } as unknown as TCred;
    return { credential: null, values, source: 'request', expiresAt: null };
  }
}

const dataSource = {
  ID: 'aaaaaaaa-0000-0000-0000-000000000001',
  Name: 'Demo Mongo',
  TypeID: 'bbbbbbbb-0000-0000-0000-000000000002',
  CredentialID: 'cccccccc-0000-0000-0000-000000000003',
  DefaultDatabase: CONN.database,
  ConnectionConfig: JSON.stringify({ host: CONN.host, port: CONN.port, authSource: CONN.authSource }),
  Status: 'Active',
} as unknown as MJExternalDataSourceEntity;

describe.runIf(RUN)('MongoExternalDataSourceDriver (integration)', () => {
  const driver = new TestableMongoDriver();

  beforeAll(async () => {
    const url = `mongodb://${CONN.host}:${CONN.port}`;
    const client = new MongoClient(url, { auth: { username: CONN.user, password: CONN.password }, authSource: CONN.authSource });
    try {
      await client.connect();
      const db = client.db(CONN.database);
      // Idempotent: clear then insert so the assertions below are deterministic.
      await db.collection('customers').deleteMany({});
      await db.collection('orders').deleteMany({});
      await db.collection('customers').insertMany(CUSTOMERS);
      await db.collection('orders').insertMany(ORDERS);
    } finally {
      await client.close();
    }
  });

  afterAll(async () => {
    await driver.Close(); // close Mongo sockets so vitest exits cleanly
  });

  it('TestConnection succeeds', async () => {
    const res = await driver.TestConnection(dataSource);
    expect(res.success).toBe(true);
  });

  it('RunView returns all documents from a collection', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'customers', orderBy: '_id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ _id: 1, name: 'Acme Corp' });
  });

  it('RunView applies a translated SQL filter + projection', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'customers', fields: ['_id', 'name'], filter: "tier = 'gold'", orderBy: '_id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toEqual({ _id: 1, name: 'Acme Corp' }); // projection dropped email/tier
  });

  it('RunView paginates and reports totalRowCount', async () => {
    const res = await driver.RunView(dataSource, { objectName: 'orders', filter: "status = 'paid'", maxRows: 1, orderBy: '_id' });
    expect(res.success).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.totalRowCount).toBe(2);
  });

  it('LoadSingle fetches one document by _id', async () => {
    const row = await driver.LoadSingle(dataSource, 'customers', { name: '_id', value: 2 });
    expect(row?.name).toBe('Globex');
  });

  it('RunNativeQuery runs an aggregation pipeline', async () => {
    const queryText = JSON.stringify({
      collection: 'orders',
      pipeline: [
        { $match: { status: 'paid' } },
        { $group: { _id: '$customer_id', total: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ],
    });
    const res = await driver.RunNativeQuery(dataSource, queryText, undefined);
    expect(res.success).toBe(true);
    expect(res.rows).toEqual([{ _id: 1, total: 350.5 }]);
  });

  it('IntrospectSchema samples collections and infers _id as primary key', async () => {
    const schema = await driver.IntrospectSchema(dataSource, undefined);
    const names = schema.Objects.map((o) => o.Name).sort();
    expect(names).toEqual(['customers', 'orders']);
    const customers = schema.Objects.find((o) => o.Name === 'customers');
    expect(customers?.ObjectType).toBe('collection');
    expect(customers?.Columns.find((c) => c.Name === '_id')?.IsPrimaryKey).toBe(true);
    expect(customers?.Columns.find((c) => c.Name === 'name')?.NativeType).toBe('string');
  });

  it('surfaces a clean failure (not a crash) on a malformed native query', async () => {
    const res = await driver.RunNativeQuery(dataSource, 'not-valid-json', undefined);
    expect(res.success).toBe(false);
    expect(res.errorMessage).toBeTruthy();
  });
});
