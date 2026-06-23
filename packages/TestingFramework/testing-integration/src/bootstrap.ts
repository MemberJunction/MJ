/**
 * bootstrap.ts — the dedicated-process bootstrap for integration runs.
 *
 * The load-bearing invariant (D1): the InstrumentedLocalStorageProvider MUST be
 * installed as the FIRST caller of `LocalCacheManager.Instance.Initialize(...)` —
 * before any provider setup (`setupSQLServerClient` / `setupGraphQLClient`) — or
 * instrumentation is a silent no-op (`Initialize` is first-caller-wins). Every
 * function here therefore guards against a cache that was already claimed by some
 * other component (e.g. a serving MJAPI whose StartupManager initialized it).
 *
 * Two install paths share one process-global instrumented storage:
 *   1. `bootstrapIntegrationServer()` / `bootstrapIntegrationClient()` — own the
 *      connection + provider (used by the standalone tsx scripts, the smoke test,
 *      and as the driver's self-bootstrap fallback).
 *   2. `installInstrumentedCacheFirst()` — installs ONLY the instrumented cache,
 *      letting the testing-CLI's own `initializeMJProvider()` set up the
 *      connection afterwards (its StartupManager `Initialize` then no-ops).
 *
 * The driver reads the active storage via `getActiveIntegrationStorage()` and only
 * self-bootstraps when nothing has installed one yet. All accessors are process-
 * scoped, matching the "one integration run owns its process" model (CANONICAL D).
 */
import sql from 'mssql';
import { LocalCacheManager, InMemoryLocalStorageProvider, Metadata } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { setupGraphQLClient, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { InstrumentedLocalStorageProvider } from './instrumented-cache';
import { LoadEnv, LoadDbConfig, LoadClientConfig } from './config';
import type { DbConfig, ClientConfig } from './config';
// Side-effect import: registers generated entity subclasses on the ClassFactory so
// entity_object results materialize as real BaseEntity instances.
import '@memberjunction/server-bootstrap-lite';

/** Everything a server-side check/driver needs about the owned process. */
export interface IntegrationBootstrapContext {
    Pool: sql.ConnectionPool;
    User: UserInfo;
    /** The instrumented cache wrapper installed as LocalCacheManager's storage provider. */
    Storage: InstrumentedLocalStorageProvider;
    /** The run-scoped provider (the global SQLServerDataProvider this bootstrap set up). */
    Provider: IMetadataProvider;
    Db: DbConfig;
}

/** Result of the client (GraphQL) bootstrap. */
export interface IntegrationClientContext {
    Storage: InstrumentedLocalStorageProvider;
    Client: ClientConfig;
}

export interface BootstrapServerOptions {
    /** Optional context-user override (else Owner-type, else Users[0]). Mirrors MJ_TEST_USER_EMAIL. */
    ContextUserEmail?: string;
    /** Verbose cache logging (default false). */
    VerboseCacheLogging?: boolean;
}

// Process-global handoff state — one integration run owns its process (CANONICAL D).
let activeStorage: InstrumentedLocalStorageProvider | null = null;
let currentServerBootstrap: IntegrationBootstrapContext | null = null;
let currentClientBootstrap: IntegrationClientContext | null = null;

/**
 * The instrumented storage installed in this process (by any path), or null if none.
 * The IntegrationTestDriver reads this to get the cache counters without re-bootstrapping.
 */
export function getActiveIntegrationStorage(): InstrumentedLocalStorageProvider | null {
    return activeStorage;
}

/** The full server bootstrap context (with owned Pool), or null if not server-bootstrapped. */
export function getActiveIntegrationBootstrap(): IntegrationBootstrapContext | null {
    return currentServerBootstrap;
}

/** The client (GraphQL) bootstrap context, or null if not client-bootstrapped in this process. */
export function getActiveIntegrationClientBootstrap(): IntegrationClientContext | null {
    return currentClientBootstrap;
}

/**
 * Fail fast with a clear message when MJAPI isn't reachable, before any cache or
 * provider state is mutated. Lifted from client-cache-tests.ts so both the driver
 * (via bootstrapIntegrationClient) and the tsx script preflight identically.
 */
export async function preflightMJAPI(url: string, apiKey: string): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
            body: JSON.stringify({ query: '{ __typename }' }),
            signal: AbortSignal.timeout(5000)
        });
    } catch (error) {
        throw new Error(
            `MJAPI is not reachable at ${url} (${error instanceof Error ? error.message : String(error)}). ` +
            `Start it first: cd packages/MJAPI && npm run start`
        );
    }
    if (!response.ok) {
        throw new Error(`MJAPI at ${url} answered HTTP ${response.status} — check MJ_API_KEY and server logs.`);
    }
}

/**
 * Refuse to run an owning bootstrap when the cache is already initialized by some
 * other component. SetStorageProvider is a destructive global mutation with no
 * restore, so we never wedge instrumentation into a live host — we fail loudly.
 */
function assertOwnsProcess(): void {
    if (LocalCacheManager.Instance.IsInitialized) {
        throw new Error(
            'Integration bootstrap must own its process — LocalCacheManager is already initialized by another component. ' +
            'When running via `mj test run`/`mj test suite`, set MJ_INTEGRATION_TEST=1 so the CLI installs the instrumented ' +
            'cache as the first caller (before its own provider setup). Otherwise run in a dedicated process and never ' +
            'co-host the integration test inside a serving MJAPI.'
        );
    }
}

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
 * Install the instrumented cache as the first caller WITHOUT owning the connection.
 * For the testing-CLI path: call this BEFORE initializeMJProvider() so the CLI's
 * own provider setup finds the cache already claimed (its StartupManager Initialize
 * no-ops) and every cache read/write flows through the instrumented wrapper.
 *
 * Returns the instrumented storage, or null when the cache was ALREADY initialized
 * by something else (can't instrument retroactively — the caller decides whether to
 * proceed uninstrumented or abort).
 */
export async function installInstrumentedCacheFirst(opts: { VerboseCacheLogging?: boolean } = {}): Promise<InstrumentedLocalStorageProvider | null> {
    if (activeStorage) {
        return activeStorage;
    }
    if (LocalCacheManager.Instance.IsInitialized) {
        return null;
    }
    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: opts.VerboseCacheLogging ?? false });
    activeStorage = storage;
    return storage;
}

/**
 * Own the process: install the instrumented cache as FIRST caller, then connect a
 * dedicated mssql pool and the SQLServerDataProvider, and refresh the user cache.
 * Idempotent within a process. THROWS if the cache is already initialized by a
 * different component (see assertOwnsProcess).
 */
export async function bootstrapIntegrationServer(opts: BootstrapServerOptions = {}): Promise<IntegrationBootstrapContext> {
    if (currentServerBootstrap) {
        return currentServerBootstrap;
    }
    LoadEnv();
    // Fail fast on mis-host BEFORE reading config — never wedge instrumentation into a live cache.
    assertOwnsProcess();
    const db = await LoadDbConfig();

    // 1) FIRST-CALLER cache init — MUST precede setupSQLServerClient.
    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: opts.VerboseCacheLogging ?? false });
    activeStorage = storage;

    // 2) Dedicated mssql pool (encrypt:false, trustServerCertificate:true — harness parity).
    const pool = await new sql.ConnectionPool({
        server: db.Host,
        port: db.Port,
        user: db.User,
        password: db.Password,
        database: db.Database,
        options: { encrypt: false, trustServerCertificate: true }
    }).connect();

    // 3) Provider + user cache.
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
    await UserCache.Instance.Refresh(pool);

    const user = resolveContextUser(opts.ContextUserEmail);
    currentServerBootstrap = { Pool: pool, User: user, Storage: storage, Provider: Metadata.Provider, Db: db };
    return currentServerBootstrap;
}

/**
 * Client (GraphQL) variant — same first-caller cache discipline; requires a
 * separately-running MJAPI reachable via MJ_API_KEY + the resolved URL. Idempotent.
 */
export async function bootstrapIntegrationClient(): Promise<IntegrationClientContext> {
    if (currentClientBootstrap) {
        return currentClientBootstrap;
    }
    LoadEnv();
    assertOwnsProcess();
    const client = LoadClientConfig();
    // Preflight BEFORE mutating cache/provider state — a dead MJAPI fails fast and clearly.
    await preflightMJAPI(client.Url, client.MJAPIKey);

    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: false });
    activeStorage = storage;

    const config = new GraphQLProviderConfigData(
        '',                 // JWT token — unused; the system API key authenticates us
        client.Url,
        '',                 // wsurl — no subscriptions needed
        async () => '',     // refreshTokenFunction — stub; API key auth never refreshes
        '__mj',
        undefined,
        undefined,
        client.MJAPIKey     // mjAPIKey → sent as x-mj-api-key on every request
    );
    await setupGraphQLClient(config);

    currentClientBootstrap = { Storage: storage, Client: client };
    return currentClientBootstrap;
}
