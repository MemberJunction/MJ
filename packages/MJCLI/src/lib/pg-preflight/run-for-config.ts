/**
 * Runs the managed-PostgreSQL preflight for an MJ config: reads the pending migrations,
 * connects as the migrate login, runs the checks, and closes the connection.
 *
 * @module lib/pg-preflight/run-for-config
 */

import type { SkywayConfig } from '@memberjunction/skyway-core';
import { OpenConnection, type QueryRunner } from '../../baseline/connection';
import type { MJConfig } from '../../config';
import { ReadPendingExtensions } from './pending-migrations';
import { RunPgManagedPreflight } from './preflight';
import type { PgPreflightQueryRunner, PgPreflightReport } from './types';

/** The config fields the preflight connection needs. */
export type PgPreflightConnectionConfig = Pick<MJConfig, 'dbHost' | 'dbPort' | 'dbDatabase' | 'codeGenLogin' | 'codeGenPassword'>;

/**
 * Runs the preflight.
 *
 * @param config - The MJ config `mj migrate` runs with (its CodeGen login is the migrate login).
 * @param skywayProbe - A Skyway config for the same schema and migration location, used only
 *   to read pending migrations; its provider is connected and disconnected here.
 */
export async function RunPgPreflightForConfig(config: PgPreflightConnectionConfig, skywayProbe: SkywayConfig): Promise<PgPreflightReport> {
  const requiredExtensions = await ReadPendingExtensions(skywayProbe);
  const connection = await OpenConnection({
    Dialect: 'postgres',
    Host: config.dbHost,
    port: config.dbPort,
    User: config.codeGenLogin,
    Password: config.codeGenPassword,
    Database: config.dbDatabase,
  });
  try {
    return await RunPgManagedPreflight(AdaptQueryRunner(connection), {
      TargetSchema: skywayProbe.Migrations.DefaultSchema ?? '__mj',
      RequiredExtensions: requiredExtensions,
      Host: config.dbHost,
    });
  } finally {
    await connection.close();
  }
}

/** Wraps the baseline connection helper in the preflight's query interface. */
export function AdaptQueryRunner(connection: Pick<QueryRunner, 'query'>): PgPreflightQueryRunner {
  return {
    Query: <T>(sql: string, params?: unknown[]) => connection.query<T>(sql, params),
  };
}
