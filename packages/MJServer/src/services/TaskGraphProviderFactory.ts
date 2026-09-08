/**
 * @fileoverview MJServer's implementation of the task-graph `ProviderFactory` seam.
 *
 * The durable dispatcher runs outside any HTTP request and executes tasks concurrently, so it must
 * never share one provider — and therefore one transaction scope and one set of entity instances —
 * across parallel work. It needs a way to mint providers on demand.
 *
 * Rather than have `@memberjunction/task-graph` import MJServer to get at that machinery (which
 * would invert the dependency: MJServer depends on task-graph, not the reverse), the package
 * declares a `ProviderFactory` interface and the host supplies an implementation. This is that
 * implementation.
 *
 * It mints exactly what the per-request path already mints — a fresh provider over the **shared
 * connection pool**, with metadata reuse — which is proven cheap at request scale and is why the
 * plan chose this mechanism rather than inventing a dispatcher-specific one. The pool remains the
 * real concurrency governor; the dispatcher's own `MaxConcurrentTasks` sits below it.
 *
 * @module @memberjunction/server
 */
import { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';
import type { ProviderFactory } from '@memberjunction/task-graph';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import { mj_core_schema } from '../config.js';

/**
 * Creates providers for the dispatcher, one per task execution.
 *
 * SQL Server path only for now, matching where the dispatcher is hosted. The PostgreSQL branch of
 * `createPerRequestProviders` is deliberately not duplicated here — when PG hosting is needed, the
 * right move is to lift the shared branch out of `context.ts` rather than fork it a second time.
 */
export class TaskGraphProviderFactory implements ProviderFactory {
    constructor(private readonly pool: sql.ConnectionPool) {}

    public async CreateProvider(): Promise<IMetadataProvider> {
        // `loadIfNeeded = false` (the trailing false) reuses already-loaded metadata rather than
        // re-reading it per provider — the difference between "cheap enough to do per task" and
        // "prohibitively expensive".
        const config = new SQLServerProviderConfigData(this.pool, mj_core_schema, 0, undefined, undefined, false);
        const provider = new SQLServerDataProvider();
        await provider.Config(config);
        return provider as unknown as IMetadataProvider;
    }
}

/** Convenience for hosts that already hold a pool. */
export function CreateTaskGraphProviderFactory(pool: sql.ConnectionPool): ProviderFactory {
    return new TaskGraphProviderFactory(pool);
}

/** Re-exported for hosts that need the concrete type. */
export type { DatabaseProviderBase };
