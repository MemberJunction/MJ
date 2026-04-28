/**
 * Vitest Setup File — Database Connection (runs in each test worker)
 *
 * Establishes a SQL Server connection and initializes the MJ metadata provider
 * so that component linter tests can access entity metadata, library lint rules,
 * and other database-dependent validation logic.
 *
 * Credentials are loaded from packages/React/test-harness/.env
 */

import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../../.env');

let connectionPool: sql.ConnectionPool | null = null;

// Load .env
dotenv.config({ path: ENV_PATH, override: true });

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '1433', 10);
const dbDatabase = process.env.DB_DATABASE;
const dbUsername = process.env.DB_USERNAME;
const dbPassword = process.env.DB_PASSWORD;
const trustCert = process.env.DB_TRUST_SERVER_CERTIFICATE === '1';

if (dbDatabase && dbUsername && dbPassword) {
  const sqlConfig: sql.config = {
    server: dbHost,
    port: dbPort,
    database: dbDatabase,
    user: dbUsername,
    password: dbPassword,
    options: {
      encrypt: true,
      trustServerCertificate: trustCert,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
    },
  };

  try {
    connectionPool = new sql.ConnectionPool(sqlConfig);
    await connectionPool.connect();

    const { setupSQLServerClient, SQLServerProviderConfigData } = await import(
      '@memberjunction/sqlserver-dataprovider'
    );

    const providerConfig = new SQLServerProviderConfigData(
      connectionPool,
      '__mj',
      180000
    );

    await setupSQLServerClient(providerConfig);

    const { Metadata } = await import('@memberjunction/core');
    const md = new Metadata();
    console.log(`✅ MJ Provider initialized — ${md.Entities.length} entities loaded`);

    process.env.__MJ_DB_AVAILABLE = 'true';
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Database connection failed — DB-dependent tests will be skipped.\n   Error: ${msg}`);
    process.env.__MJ_DB_AVAILABLE = 'false';

    if (connectionPool) {
      try { await connectionPool.close(); } catch { /* ignore */ }
      connectionPool = null;
    }
  }
} else {
  console.warn(
    '⚠️  Database credentials not configured — DB-dependent tests will be skipped.\n' +
    '   Set DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD in .env to enable them.'
  );
}

// Connection pool closes automatically when the process exits.
// Don't use afterAll — vitest may run this setup per-file with tight hook timeouts.
