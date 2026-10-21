import { DatabaseProviderBase, Metadata } from '@memberjunction/core';

/**
 * A fresh Read-Write provider with its OWN transaction state, sharing the server's connection pool.
 *
 * A provider's ambient transaction (`BeginTransaction` / `CommitTransaction` / `RollbackTransaction`)
 * is a field on the provider INSTANCE. Two units of work that open transactions on one instance nest
 * into each other, and every write anyone else makes through that instance while one is open lands
 * inside it (MJ#2140; `entityTransactionScope.ts`). The process-global `Metadata.Provider` is shared
 * by every request, scheduled job and background service, so transactional work must never run on
 * it: one transaction left open there silently swallows every later global-provider write until the
 * process restarts.
 *
 * GraphQL resolvers already get a per-request provider from `AppContext.providers`. Code that runs
 * outside one, such as the auth flow before the context exists, calls this.
 *
 * Cheap: it is the global provider's `CreateIndependentInstance()` (SQL Server and PostgreSQL), which
 * reuses the already-loaded metadata and the shared pool.
 */
export async function CreateIsolatedProvider(): Promise<DatabaseProviderBase> {
  return (Metadata.Provider as DatabaseProviderBase).CreateIndependentInstance(); // global-provider-ok: borrows only its pool and metadata, never its transaction state
}
