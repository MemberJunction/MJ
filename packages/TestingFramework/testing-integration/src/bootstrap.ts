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
import { LocalCacheManager, InMemoryLocalStorageProvider, Metadata, SetProvider } from '@memberjunction/core';
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
        options: { encrypt: false, trustServerCertificate: true }
    }).connect();

    await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
    await UserCache.Instance.Refresh(pool);

    const user = resolveContextUser(opts.ContextUserEmail);
    return {
        Pool: pool, User: user, Storage: storage, Provider: Metadata.Provider, Db: db, // global-provider-ok: this dedicated-process bootstrap just installed the one global provider (setupSQLServerClient) — it IS the single provider for this run (D1)
        ClosePool: async () => { await pool.close(); }
    };
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
    await provider.Config(pgConfig);
    SetProvider(provider);

    // The specific provider, not Metadata.Provider — it is in scope here, so there is no reason
    // to route through the global.
    await feedUserCacheFromPG(provider.DatabaseConnection, db.Schema, provider);
    const user = resolveContextUser(opts.ContextUserEmail);
    return {
        Pool: undefined, User: user, Storage: storage, Provider: Metadata.Provider, Db: db, // global-provider-ok: this dedicated-process bootstrap just installed the one global provider (SetProvider above) — it IS the single provider for this run (D1)
        ClosePool: async () => { await provider.DatabaseConnection.end(); }
    };
}
