/**
 * Reads the SQL of the migrations `mj migrate` would apply, so the preflight checks
 * exactly the extensions those migrations create (and not, say, every extension any
 * historical migration ever created).
 *
 * @module lib/pg-preflight/pending-migrations
 */

import { ResolveMigrations, ScanAndResolveMigrations, type SkywayConfig } from '@memberjunction/skyway-core';
import { ExtractCreatedExtensions } from './extension-scan';

/** Skyway's defaults for the values `mj migrate` leaves unset (`ResolveConfig` in skyway-core). */
const DEFAULT_HISTORY_TABLE = 'flyway_schema_history';
const DEFAULT_BASELINE_VERSION = '1';

/**
 * The SQL of every migration Skyway would run against this database. Out-of-order files
 * are included, because `mj migrate` may enable `outOfOrder` for the run.
 *
 * SIDE EFFECTS: connects with `skywayConfig.Provider` to read the history table, then
 * disconnects. Pass a probe config, not the one the migration will use.
 */
export async function ReadPendingMigrationSql(skywayConfig: SkywayConfig): Promise<string[]> {
  const provider = skywayConfig.Provider;
  if (!provider) throw new Error('The Skyway config has no database provider.');
  const migrations = skywayConfig.Migrations;
  const schema = migrations.DefaultSchema ?? 'public';
  const historyTable = migrations.HistoryTable ?? DEFAULT_HISTORY_TABLE;
  await provider.Connect();
  try {
    const discovered = await ScanAndResolveMigrations(migrations.Locations);
    const applied = (await provider.History.Exists(schema, historyTable)) ? await provider.History.GetAllRecords(schema, historyTable) : [];
    const resolution = ResolveMigrations(discovered, applied, migrations.BaselineVersion ?? DEFAULT_BASELINE_VERSION, migrations.BaselineOnMigrate ?? false, true);
    return resolution.PendingMigrations.map((m) => m.SQL);
  } finally {
    await provider.Disconnect();
  }
}

/** The extensions the pending migrations create. */
export async function ReadPendingExtensions(skywayConfig: SkywayConfig): Promise<string[]> {
  return ExtractCreatedExtensions(await ReadPendingMigrationSql(skywayConfig));
}
