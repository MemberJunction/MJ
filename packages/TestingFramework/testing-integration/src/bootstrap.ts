/**
 * bootstrap.ts — the SERVER (in-process) integration bootstrap.
 *
 * This module owns the SERVER transport: it connects directly to the database
 * (SQL Server / PostgreSQL) and imports `@memberjunction/server-bootstrap-lite` to
 * register the server generated entity subclasses. It is therefore server-laden by
 * design — a CLIENT dispatcher must NOT import it (import `bootstrapIntegrationClient`
 * from `./bootstrap-client` / the package's `./client` subpath instead, which loads
 * only client packages).
 *
 * The load-bearing invariant (D1): the InstrumentedLocalStorageProvider MUST be
 * installed as the FIRST caller of `LocalCacheManager.Instance.Initialize(...)` —
 * before any provider setup (`setupSQLServerClient`) — or instrumentation is a silent
 * no-op (`Initialize` is first-caller-wins). The process-global handoff state and the
 * shared client-safe helpers (preflightMJAPI, assertOwnsProcess, installInstrumented-
 * CacheFirst, the getActive* accessors, the interfaces) live in `./bootstrap-shared`
 * so both this module and the client bootstrap publish/read the same install.
 */
import sql from 'mssql';
import { LocalCacheManager, InMemoryLocalStorageProvider, SetProvider, StartupManager, LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { InstrumentedLocalStorageProvider } from './instrumented-cache';
import { feedUserCacheFromPG } from './pg-user-cache';
import { LoadEnv, LoadDbConfig } from './config';
import type { DbConfig } from './config';
import {
    assertOwnsProcess,
    getActiveIntegrationBootstrap,
    _setActiveStorage,
    _setCurrentServerBootstrap,
    type IntegrationBootstrapContext,
    type BootstrapServerOptions
} from './bootstrap-shared';
// Side-effect import: registers the SERVER generated entity subclasses on the ClassFactory
// so entity_object results materialize as real (server) BaseEntity instances.
import '@memberjunction/server-bootstrap-lite';

// Re-export the shared surface so existing barrel consumers keep working unchanged.
export * from './bootstrap-shared';

/** Resolve the context user: MJ_TEST_USER_EMAIL override → Owner-type → first user. */
function resolveContextUser(email?: string): UserInfo {
    const wanted = email?.toLowerCase();
    const users = UserCache.Instance.Users;
    const user =
        (wanted ? users.find(u => u.Email?.toLowerCase() === wanted) : undefined)
        ?? users.find(u => u?.Type?.trim().toLowerCase() === 'owner')
        ?? users[0];
    if (!user) {
        throw new Error('No context user found in UserCache. Set MJ_TEST_USER_EMAIL or ensure the Users table is populated.');
    }
    return user;
}

/**
 * Own the process: install the instrumented cache as FIRST caller, then set up the
 * data provider for the configured backend (SQL Server by default, PostgreSQL when
 * DB_PLATFORM=postgresql) and resolve the context user. Idempotent within a process.
 * THROWS if the cache is already initialized by a different component (see assertOwnsProcess).
 *
 * The instrumented-cache-first ordering is identical on both backends — the cache
 * singleton is platform-agnostic. Only the provider setup differs, behind db.Platform.
 */
export async function bootstrapIntegrationServer(opts: BootstrapServerOptions = {}): Promise<IntegrationBootstrapContext> {
    const existing = getActiveIntegrationBootstrap();
    if (existing) {
        return existing;
    }
    LoadEnv();
    // Fail fast on mis-host BEFORE reading config — never wedge instrumentation into a live cache.
    assertOwnsProcess();
    const db = await LoadDbConfig();

    // FIRST-CALLER cache init — MUST precede any provider setup (load-bearing on both backends).
    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: opts.VerboseCacheLogging ?? false });
    _setActiveStorage(storage);

    const ctx = db.Platform === 'postgresql'
        ? await setupPostgreSQLProvider(db, storage, opts)
        : await setupSqlServerProvider(db, storage, opts);
    _setCurrentServerBootstrap(ctx);
    return ctx;
}

/** SQL Server provider setup — the locally-proven path (unchanged behavior). */
async function setupSqlServerProvider(
    db: DbConfig, storage: InstrumentedLocalStorageProvider, opts: BootstrapServerOptions
): Promise<IntegrationBootstrapContext> {
    // Dedicated mssql pool (encrypt:false, trustServerCertificate:true — harness parity).
    const pool = await new sql.ConnectionPool({
        server: db.Host,
        port: db.Port,
        user: db.User,
        password: db.Password,
        database: db.Database,
        options: { encrypt: false, trustServerCertificate: true },
        // Match the CLI harness pool rather than mssql's 15s default — the suite runs
        // catalog-wide sweeps on contended CI runners, where 15s turns a slow query into a
        // spurious "query failed". See mj-provider.ts's resolveRequestTimeoutMs.
        requestTimeout: 120_000
    }).connect();

    // Same ownership boundary as the PostgreSQL path: once the pool is connected, any failure
    // below must close it. `resolveContextUser` in particular THROWS on an empty cache, and that
    // is reachable — Refresh catches-and-logs a RefreshFromRows rejection, so an unreadable
    // vwUsers leaves the cache empty and lands here.
    try {
        const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
        await UserCache.Instance.Refresh(pool);

        const user = resolveContextUser(opts.ContextUserEmail);
        return {
            Pool: pool, User: user, Storage: storage, Provider: provider, Db: db,
            ClosePool: async () => { await pool.close(); }
        };
    } catch (err) {
        await pool.close().catch(closeErr =>
            LogError(`SQL Server bootstrap failed, and closing its pool also failed: ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`));
        throw err;
    }
}

/**
 * PostgreSQL provider setup — runs the SAME downstream check code against a PG backend
 * (the PG parity lane, D5.5). PG is an OPTIONAL backend: the provider (and its `pg`
 * dependency) is dynamically imported so it stays out of the default dependency graph
 * for SQL-Server-only consumers (CLAUDE.md rule #8 category 2; declared in optionalDependencies).
 *
 * The user cache is fed through {@link feedUserCacheFromPG} on the provider's own pg pool,
 * so the PG path resolves its context user exactly the way the SQL Server path does — the
 * only difference being the dialect each feeder speaks. Both funnel into
 * `UserCache.RefreshFromRows`, and both fail loudly on an empty user table.
 *
 * `StartupManager.Startup` is invoked explicitly because the SQL Server path gets it for free
 * inside `setupSQLServerClient` and `PostgreSQLDataProvider.Config` has no equivalent. Omitting
 * it would run the PG lane through a different engine-initialization sequence than SQL Server,
 * so any engine-dependent PG-only failure would be triaged as a genuine parity bug when it is
 * really a harness gap — the precise confusion this lane exists to remove.
 */
async function setupPostgreSQLProvider(
    db: DbConfig, storage: InstrumentedLocalStorageProvider, opts: BootstrapServerOptions
): Promise<IntegrationBootstrapContext> {
    const { PostgreSQLDataProvider, PostgreSQLProviderConfigData } = await import('@memberjunction/postgresql-dataprovider');
    const provider = new PostgreSQLDataProvider();
    const pgConfig = new PostgreSQLProviderConfigData(
        { Host: db.Host, Port: db.Port, Database: db.Database, User: db.User, Password: db.Password },
        db.Schema,
        1 // checkRefreshIntervalSeconds > 0 → load metadata on Config
    );
    // PostgreSQLDataProvider.Config catches everything and returns FALSE — it does not throw the
    // way SQLServerDataProvider.Config does. Ignoring that boolean lets a half-provisioned
    // database (partly-applied migrations, a role that cannot read __mj) install a metadata-less
    // provider globally and the bootstrap "succeed": every check then dies on
    // "<entity> is not present in metadata" and gets triaged as a PostgreSQL parity bug.
    //
    // This closes the THROWING half only. ProviderBase.Config logs "GetAllMetadata() returned
    // undefined" and still returns true, so a non-throwing metadata fetch failure remains
    // reachable — a narrower gap, tracked separately rather than papered over here.
    const configured = await provider.Config(pgConfig);

    // Config() itself opens the pg pool (`cm.Initialize`) BEFORE the metadata load that decides
    // its return value, so a `false` return leaves a live pool behind just as a later throw would.
    // The failure check therefore lives INSIDE the try whose catch closes it — outside, a
    // half-provisioned database leaked the pool and its open sockets held the event loop open.
    try {
        if (!configured) {
            throw new Error(
                `PostgreSQLDataProvider.Config returned false for database '${db.Database}' (schema '${db.Schema}') — ` +
                `metadata could not be loaded. Verify the database is migrated (migrations-pg/v5) and that ` +
                `'${db.User}' can read the ${db.Schema} metadata tables. The provider logged the underlying error above.`
            );
        }

        SetProvider(provider);
        // The specific provider, not Metadata.Provider — it is in scope here, so there is no reason
        // to route through the global.
        await feedUserCacheFromPG(provider.DatabaseConnection, db.Schema, provider);

        const sysUser = UserCache.Instance.GetSystemUser();
        const backupSysUser = UserCache.Instance.Users.find(u => u.IsActive && u.Type === 'Owner');
        await StartupManager.Instance.Startup(false, sysUser || backupSysUser, provider);

        const user = resolveContextUser(opts.ContextUserEmail);
        return {
            Pool: undefined, User: user, Storage: storage, Provider: provider, Db: db,
            ClosePool: async () => { await provider.DatabaseConnection.end(); }
        };
    } catch (err) {
        // try/catch, not `.catch()`: the `DatabaseConnection` getter THROWS SYNCHRONOUSLY when the
        // pool was never initialized (Config() failing before `cm.Initialize`), and a synchronous
        // throw would escape a promise `.catch` and replace the real bootstrap error with a
        // confusing "pool is null".
        try {
            await provider.DatabaseConnection.end();
        } catch (closeErr) {
            LogError(`PostgreSQL bootstrap failed, and closing its pool also failed: ${closeErr instanceof Error ? closeErr.message : String(closeErr)}`);
        }
        throw err;
    }
}
