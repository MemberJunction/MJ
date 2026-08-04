/**
 * Shared helpers for the `mj baseline ...` oclif commands.
 *
 * - Resolve a DbConnectionParams from the merged MJ config (env + mj.config.cjs)
 *   with optional flag overrides (db name, host, etc).
 * - Detect TTY for spinner vs. plain log output.
 */

import { getValidatedConfig } from '../config';
import type { DbConnectionParams, DbConnectionOverrides } from './connection';
import type { Dialect } from './types';

export function resolveConnection(overrides: DbConnectionOverrides = {}, dialectFlag?: Dialect): DbConnectionParams {
  const config = getValidatedConfig();
  const dialect: Dialect = dialectFlag
    ?? (config.dbPlatform === 'postgresql' ? 'postgres' : 'mssql');

  const host = overrides.host ?? config.dbHost;
  const port = overrides.port ?? (config.dbPort ? Number(config.dbPort) : undefined);
  const database = overrides.database ?? config.dbDatabase;
  const user = overrides.user ?? (config as { codeGenLogin?: string }).codeGenLogin;
  const password = overrides.password ?? (config as { codeGenPassword?: string }).codeGenPassword;
  if (!host) throw new Error('No DB host configured (set DB_HOST or dbHost in mj.config.cjs).');
  if (!database) throw new Error('No DB database configured (set DB_DATABASE or dbDatabase, or pass --database).');
  if (!user) throw new Error('No DB user configured (set CODEGEN_DB_USERNAME).');
  if (!password) throw new Error('No DB password configured (set CODEGEN_DB_PASSWORD).');
  return {
    dialect,
    host,
    port,
    database,
    user,
    password,
    encrypt: overrides.encrypt ?? Boolean(config.dbEncrypt),
    trustServerCertificate: overrides.trustServerCertificate ?? Boolean(config.dbTrustServerCertificate),
  };
}

export function isTty(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.CI !== 'true';
}
