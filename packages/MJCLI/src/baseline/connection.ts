/**
 * Thin connection helper. Uses `mssql` (tedious) and `pg` directly via dynamic
 * imports — both packages ship transitively with @memberjunction/skyway-*.
 *
 * Connections are derived from the merged MJ config (`getValidatedConfig`)
 * with optional `--database` override so that compare/roundtrip can target
 * two scratch DBs on the same server with one config.
 */

import type { Dialect } from './types';

export interface DbConnectionOverrides {
  database?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface DbConnectionParams {
  dialect: Dialect;
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface QueryRunner {
  /** Run a query and return all rows as plain JS objects. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Stream rows one at a time. Used for large table dumps + full row compare. */
  stream(sql: string, onRow: (row: Record<string, unknown>) => void | Promise<void>): Promise<void>;
  close(): Promise<void>;
  readonly dialect: Dialect;
  readonly database: string;
}

export async function openConnection(params: DbConnectionParams): Promise<QueryRunner> {
  if (params.dialect === 'mssql') return openMssql(params);
  return openPostgres(params);
}

async function openMssql(params: DbConnectionParams): Promise<QueryRunner> {
  // mssql is a CJS package; under `await import()` its actual exports may live
  // under `.default` depending on Node/TS interop. Mirror the pg branch below.
  const mssqlMod = await import('mssql');
  const mssql = (mssqlMod as { ConnectionPool?: typeof mssqlMod.ConnectionPool }).ConnectionPool
    ? mssqlMod
    : (mssqlMod as unknown as { default: typeof mssqlMod }).default;
  const config = {
    server: params.host,
    port: params.port ?? 1433,
    user: params.user,
    password: params.password,
    database: params.database,
    options: {
      encrypt: params.encrypt ?? false,
      trustServerCertificate: params.trustServerCertificate ?? true,
      enableArithAbort: true,
    },
    requestTimeout: 600000,
  };
  const pool = await new mssql.ConnectionPool(config).connect();

  return {
    dialect: 'mssql',
    database: params.database,
    async query<T>(sql: string): Promise<T[]> {
      const result = await pool.request().query(sql);
      return result.recordset as T[];
    },
    async stream(sql, onRow) {
      const request = pool.request();
      request.stream = true;
      let pending: Promise<unknown> = Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        request.on('row', (row: Record<string, unknown>) => {
          pending = pending.then(() => onRow(row));
        });
        request.on('error', (err: unknown) => reject(err));
        request.on('done', () => {
          pending.then(() => resolve()).catch(reject);
        });
        request.query(sql);
      });
    },
    async close() {
      await pool.close();
    },
  };
}

async function openPostgres(params: DbConnectionParams): Promise<QueryRunner> {
  const pg = await import('pg');
  const Client = pg.Client ?? (pg as unknown as { default: { Client: typeof pg.Client } }).default.Client;
  const client = new Client({
    host: params.host,
    port: params.port ?? 5432,
    user: params.user,
    password: params.password,
    database: params.database,
  });
  await client.connect();

  return {
    dialect: 'postgres',
    database: params.database,
    async query<T>(sql: string, values?: unknown[]): Promise<T[]> {
      const result = await client.query(sql, values as unknown[] | undefined);
      return result.rows as T[];
    },
    async stream(sql, onRow) {
      // Use a cursor for memory-bounded iteration.
      // pg-query-stream is a direct dep but loaded lazily — only the postgres
      // path needs it, and the same QueryRunner is used for mssql callers.
      type QueryStreamCtor = new (sql: string, values: unknown[]) => AsyncIterable<unknown>;
      const QueryStream = await import('pg-query-stream').then(
        (m): QueryStreamCtor | null => {
          const ctor =
            (m as { default?: QueryStreamCtor }).default
            ?? (m as unknown as QueryStreamCtor);
          return ctor ?? null;
        },
      ).catch(() => null);
      if (!QueryStream) {
        // Fallback: load all rows. Acceptable for compare runs where rows
        // are bounded by the baseline data size (shippable metadata).
        const result = await client.query(sql);
        for (const row of result.rows) await onRow(row as Record<string, unknown>);
        return;
      }
      const stream = client.query(new QueryStream(sql, []));
      for await (const row of stream) {
        await onRow(row as Record<string, unknown>);
      }
    },
    async close() {
      await client.end();
    },
  };
}
