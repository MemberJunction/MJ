import sql from 'mssql';
import { DatabaseProviderBase, Metadata } from '@memberjunction/core';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { resolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import { mj_core_schema, configInfo } from './config.js';
import { BuildPostgreSQLConnectionConfig, ResolvePostgreSQLEndpoint } from './postgresqlPoolSettings.js';

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
 * GraphQL resolvers already get a per-request provider from `AppContext.providers` (built by this
 * same function). Code that runs outside one, such as the auth flow before the context exists,
 * calls this directly.
 *
 * Cheap: the provider reuses the already-loaded metadata and the shared pool, so creating one makes
 * no database round trip.
 *
 * @param dataSource - SQL Server pool to use. Defaults to the global provider's pool. Ignored on
 *   PostgreSQL, which always shares the global provider's pool.
 */
export async function CreateIsolatedProvider(dataSource?: sql.ConnectionPool): Promise<DatabaseProviderBase> {
  if (resolveDbPlatformFromEnv() === 'postgresql') {
    return createPostgresProvider();
  }
  const pool = dataSource ?? (Metadata.Provider as unknown as SQLServerDataProvider).DatabaseConnection; // global-provider-ok: borrows only the shared pool, never its transaction state
  const provider = new SQLServerDataProvider();
  await provider.Config(new SQLServerProviderConfigData(pool, mj_core_schema, 0, undefined, undefined, false));
  return provider as unknown as DatabaseProviderBase;
}

/**
 * Creates a PostgreSQL provider, sharing the connection pool from the primary provider to avoid
 * pool exhaustion.
 */
async function createPostgresProvider(): Promise<DatabaseProviderBase> {
  const { PostgreSQLDataProvider, PostgreSQLProviderConfigData } = await import('@memberjunction/postgresql-dataprovider');

  const pgProvider = new PostgreSQLDataProvider();
  const pgConfig = new PostgreSQLProviderConfigData(
    BuildPostgreSQLConnectionConfig(ResolvePostgreSQLEndpoint(), configInfo.databaseSettings, 'api'),
    mj_core_schema,
    0,
    undefined,
    undefined,
    false, // use existing metadata from global provider
  );

  // Share the connection pool from the primary provider to avoid pool exhaustion
  const primaryProvider = Metadata.Provider as unknown as { DatabaseConnection?: import('pg').Pool }; // global-provider-ok: bootstrap (per-connection PG pool sharing)
  if (primaryProvider?.DatabaseConnection) {
    await pgProvider.ConfigWithSharedPool(pgConfig, primaryProvider.DatabaseConnection);
  } else {
    await pgProvider.Config(pgConfig);
  }

  return pgProvider;
}
