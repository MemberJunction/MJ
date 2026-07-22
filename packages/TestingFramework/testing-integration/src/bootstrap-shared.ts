/**
 * bootstrap-shared.ts — the server-FREE core shared by both integration bootstrap paths.
 *
 * This module deliberately imports ONLY client-safe packages (`@memberjunction/core`,
 * local config/cache). It must NOT import `@memberjunction/sqlserver-dataprovider`,
 * `@memberjunction/server-bootstrap-lite`, or any other server package — so that the
 * CLIENT bootstrap (`bootstrap-client.ts`) can be imported by a client dispatcher WITHOUT
 * dragging server-only entity subclasses into the process. A real browser client never
 * loads those; loading them here would make a "client" test a server/client hybrid whose
 * ClassFactory resolves server-only `*EntityServer` subclasses (which throw on the client).
 *
 * The process-global handoff state lives here (one integration run owns its process,
 * CANONICAL D) so BOTH the server bootstrap and the client bootstrap — and the driver's
 * `getActiveIntegrationStorage()` reader — observe the same install.
 */
import type * as sql from 'mssql';
import { LocalCacheManager, InMemoryLocalStorageProvider } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { InstrumentedLocalStorageProvider } from './instrumented-cache';
import type { DbConfig, ClientConfig } from './config';

/** Everything a server-side check/driver needs about the owned process. */
export interface IntegrationBootstrapContext {
    /**
     * The mssql connection pool — present on SQL Server, undefined on PostgreSQL.
     * Checks that issue raw `sql.Request(pool)` queries are SQL-Server-only; use
     * ClosePool() to release the underlying connection on either backend.
     */
    Pool?: sql.ConnectionPool;
    User: UserInfo;
    /** The instrumented cache wrapper installed as LocalCacheManager's storage provider. */
    Storage: InstrumentedLocalStorageProvider;
    /** The run-scoped provider (the SQLServerDataProvider / PostgreSQLDataProvider this bootstrap set up). */
    Provider: IMetadataProvider;
    Db: DbConfig;
    /** Releases the underlying DB connection platform-agnostically (mssql pool.close() / pg pool.end()). */
    ClosePool(): Promise<void>;
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

/** @internal Setters used by the server/client bootstrap modules to publish process state. */
export function _setActiveStorage(s: InstrumentedLocalStorageProvider): void { activeStorage = s; }
export function _setCurrentServerBootstrap(c: IntegrationBootstrapContext): void { currentServerBootstrap = c; }
export function _setCurrentClientBootstrap(c: IntegrationClientContext): void { currentClientBootstrap = c; }

/**
 * The instrumented storage installed in this process (by any path), or null if none.
 * The IntegrationTestDriver reads this to get the cache counters without re-bootstrapping.
 */
export function getActiveIntegrationStorage(): InstrumentedLocalStorageProvider | null {
    return activeStorage;
}

/**
 * True when a server-transport integration run cannot own this process: no instrumented
 * cache was installed first AND the cache is already initialized by another component
 * (e.g. a serving MJAPI whose StartupManager claimed it). This is exactly the condition
 * under which `bootstrapIntegrationServer()` would throw `assertOwnsProcess` — exposed so
 * the driver can fail fast with a dashboard-friendly message instead of a bootstrap stack.
 */
export function serverProcessAlreadyClaimed(): boolean {
    return !activeStorage && LocalCacheManager.Instance.IsInitialized;
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
 * provider state is mutated. Used by both the driver (via bootstrapIntegrationClient)
 * and the tsx scripts so they preflight identically.
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
export function assertOwnsProcess(): void {
    if (LocalCacheManager.Instance.IsInitialized) {
        throw new Error(
            'Integration bootstrap must own its process — LocalCacheManager is already initialized by another component. ' +
            'When running via `mj test run`/`mj test suite`, set MJ_INTEGRATION_TEST=1 so the CLI installs the instrumented ' +
            'cache as the first caller (before its own provider setup). Otherwise run in a dedicated process and never ' +
            'co-host the integration test inside a serving MJAPI.'
        );
    }
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
