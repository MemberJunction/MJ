/**
 * geo-address-cache-tests.ts — live integration tests for the address-level
 * geocode cache (MJ: Geo Address Caches) added by V202607091200.
 *
 * The table is the persistence layer behind GeoCodeSyncService's layered
 * address lookup (in-run memo → persistent cache → external provider): rows
 * are keyed by a SHA-256 hash of the normalized address string so identical
 * addresses across any records/entities share one provider result, including
 * negative (not_geocodable) results with an ExpiresAt TTL.
 *
 * This suite exercises the schema ↔ CodeGen ↔ entity agreement that unit
 * tests mock away: entity CRUD through the generated procs, the AddressHash
 * unique index (the concurrency backstop for write-through races), point
 * lookup by hash, and value round-trips for the fields the service reads
 * (Status, Latitude/Longitude decimals, ExpiresAt dates). The service's
 * lookup/memo logic itself is covered by geo-core's Vitest suite.
 *
 * SELF-CONTAINED FIXTURES: creates its own MJ: Geo Address Caches rows (all
 * with NormalizedAddress tagged "(mj-integration-test — safe to delete)") and
 * deletes them in teardown, including leftovers from prior aborted runs.
 * Reference-only toward all other records.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/geo-address-cache-tests.ts
 *
 * Exit code: 0 = all passed, 1 = failures, 2 = bootstrap error.
 */
import sql from 'mssql';
import { LoadEnv, LoadDbConfig, TestRunner, Assert, AssertEqual } from './lib/harness';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import type { MJGeoAddressCacheEntity } from '@memberjunction/core-entities';
import { NormalizeAddress, ComputeAddressHash } from '@memberjunction/geo-core';

const TAG = '(mj-integration-test — safe to delete)';

interface Ctx {
    pool: sql.ConnectionPool;
    user: UserInfo;
    createdIds: string[];
}

async function bootstrap(): Promise<Ctx> {
    LoadEnv();
    const db = await LoadDbConfig();
    const pool = await new sql.ConnectionPool({
        server: db.Host, port: db.Port, user: db.User, password: db.Password,
        database: db.Database, options: { encrypt: false, trustServerCertificate: true }
    }).connect();

    await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
    await UserCache.Instance.Refresh(pool);
    const email = process.env.MJ_TEST_USER_EMAIL?.toLowerCase();
    const user =
        (email ? UserCache.Users.find(u => u.Email?.toLowerCase() === email) : undefined)
        ?? UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner')
        ?? UserCache.Users[0];
    if (!user) throw new Error('No context user found in UserCache.');

    return { pool, user, createdIds: [] };
}

async function teardown(ctx: Ctx): Promise<void> {
    // Best-effort cleanup — everything this suite creates carries TAG in
    // NormalizedAddress, so sweep by tag to also catch prior aborted runs.
    try {
        const rv = new RunView();
        const leftovers = await rv.RunView<MJGeoAddressCacheEntity>({
            EntityName: 'MJ: Geo Address Caches',
            ExtraFilter: `NormalizedAddress LIKE '%mj-integration-test%'`,
            ResultType: 'entity_object',
            BypassCache: true
        }, ctx.user);
        for (const row of leftovers.Results) {
            await row.Delete();
        }
    } catch (e) {
        console.error(`Teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await ctx.pool.close();
    }
}

/** Create a tagged cache row; registers its ID for visibility in failures. */
async function createCacheRow(
    ctx: Ctx,
    normalized: string,
    fill: (row: MJGeoAddressCacheEntity) => void
): Promise<MJGeoAddressCacheEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const row = await md.GetEntityObject<MJGeoAddressCacheEntity>('MJ: Geo Address Caches', ctx.user);
    row.NewRecord();
    row.AddressHash = ComputeAddressHash(normalized);
    row.NormalizedAddress = normalized;
    fill(row);
    Assert(await row.Save(), `cache row save failed: ${row.LatestResult?.CompleteMessage}`);
    ctx.createdIds.push(row.ID);
    return row;
}

async function main(): Promise<void> {
    let ctx: Ctx;
    try {
        ctx = await bootstrap();
    } catch (e) {
        console.error(`SETUP / CONNECTIVITY ERROR: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(2);
    }

    const runner = new TestRunner('Geo Address Cache — schema + entity round-trips');
    const stamp = Date.now();
    const successAddr = NormalizeAddress(`123 Main St, Denver, CO ${stamp} ${TAG}`);
    const negativeAddr = NormalizeAddress(`Conference Room B ${stamp} ${TAG}`);

    runner.Test('GAC1: normalization + hashing are stable across casing/whitespace variants', async () => {
        const a = ComputeAddressHash(NormalizeAddress('123 Main St, Denver, CO'));
        const b = ComputeAddressHash(NormalizeAddress('  123  MAIN st,  denver,   co '));
        AssertEqual(a, b, 'equivalent addresses must hash identically');
        AssertEqual(a.length, 64, 'AddressHash must be a 64-char SHA-256 hex digest (column is NVARCHAR(64))');
    });

    let successRow: MJGeoAddressCacheEntity;
    runner.Test('GAC2: success entry round-trips through the generated entity + procs', async () => {
        successRow = await createCacheRow(ctx, successAddr, r => {
            r.Status = 'success';
            r.Latitude = 39.7392;
            r.Longitude = -104.9903;
            r.Precision = 'exact';
            r.Confidence = 0.9875;
            r.FormattedAddress = '123 Main St, Denver, CO, USA';
            r.GeocodingSource = 'geocodio';
            r.GeocodedAt = new Date();
            r.ExpiresAt = null;
        });

        const md = new Metadata(); // global-provider-ok: integration test script
        const reloaded = await md.GetEntityObject<MJGeoAddressCacheEntity>('MJ: Geo Address Caches', ctx.user);
        Assert(await reloaded.Load(successRow.ID), 'reload by ID failed');
        AssertEqual(reloaded.Status, 'success', 'Status');
        AssertEqual(Number(reloaded.Latitude), 39.7392, 'Latitude decimal round-trip');
        AssertEqual(Number(reloaded.Longitude), -104.9903, 'Longitude decimal round-trip');
        AssertEqual(reloaded.Precision, 'exact', 'Precision');
        AssertEqual(reloaded.GeocodingSource, 'geocodio', 'GeocodingSource');
        Assert(reloaded.ExpiresAt == null, 'success entries must not expire');
    });

    runner.Test('GAC3: point lookup by AddressHash (the service read path) finds the row', async () => {
        const rv = new RunView();
        const result = await rv.RunView<MJGeoAddressCacheEntity>({
            EntityName: 'MJ: Geo Address Caches',
            ExtraFilter: `AddressHash='${ComputeAddressHash(successAddr)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
            BypassCache: true
        }, ctx.user);
        Assert(result.Success, `lookup failed: ${result.ErrorMessage}`);
        AssertEqual(result.Results.length, 1, 'exactly one row per address hash');
        AssertEqual(result.Results[0].ID, successRow.ID, 'lookup returns the created row');
    });

    runner.Test('GAC4: AddressHash unique index rejects a duplicate (write-through race backstop)', async () => {
        const md = new Metadata(); // global-provider-ok: integration test script
        const dupe = await md.GetEntityObject<MJGeoAddressCacheEntity>('MJ: Geo Address Caches', ctx.user);
        dupe.NewRecord();
        dupe.AddressHash = ComputeAddressHash(successAddr); // same hash as GAC2
        dupe.NormalizedAddress = successAddr;
        dupe.Status = 'success';
        dupe.Latitude = 1;
        dupe.Longitude = 1;
        const saved = await dupe.Save();
        Assert(!saved, 'second insert with the same AddressHash must fail (UQ_GeoAddressCache_AddressHash)');
    });

    runner.Test('GAC5: negative (not_geocodable) entry round-trips with its ExpiresAt TTL', async () => {
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const row = await createCacheRow(ctx, negativeAddr, r => {
            r.Status = 'not_geocodable';
            r.Latitude = null;
            r.Longitude = null;
            r.Precision = null;
            r.GeocodingSource = 'geocodio';
            r.GeocodedAt = new Date();
            r.ExpiresAt = expires;
        });

        const md = new Metadata(); // global-provider-ok: integration test script
        const reloaded = await md.GetEntityObject<MJGeoAddressCacheEntity>('MJ: Geo Address Caches', ctx.user);
        Assert(await reloaded.Load(row.ID), 'reload by ID failed');
        AssertEqual(reloaded.Status, 'not_geocodable', 'Status');
        Assert(reloaded.Latitude == null && reloaded.Longitude == null, 'negative entries carry no coordinates');
        Assert(reloaded.ExpiresAt != null, 'negative entries must carry an ExpiresAt TTL');
        // DATETIMEOFFSET round-trip: within a second of what we wrote
        Assert(Math.abs((reloaded.ExpiresAt as Date).getTime() - expires.getTime()) < 1000, 'ExpiresAt round-trips');
    });

    runner.Test('GAC6: an invalid Status value is rejected (client validation or DB CHECK)', async () => {
        const md = new Metadata(); // global-provider-ok: integration test script
        const bad = await md.GetEntityObject<MJGeoAddressCacheEntity>('MJ: Geo Address Caches', ctx.user);
        bad.NewRecord();
        bad.AddressHash = ComputeAddressHash(NormalizeAddress(`bad status ${stamp} ${TAG}`));
        bad.NormalizedAddress = NormalizeAddress(`bad status ${stamp} ${TAG}`);
        // Bypass the generated setter's literal type deliberately to hit the DB CHECK
        (bad as unknown as { Set: (f: string, v: unknown) => void }).Set('Status', 'bogus_status');
        const saved = await bad.Save();
        Assert(!saved, 'Status outside the CHECK list must be rejected');
    });

    const failed = await runner.Run();
    await teardown(ctx);
    process.exit(failed > 0 ? 1 : 0);
}

void main();
