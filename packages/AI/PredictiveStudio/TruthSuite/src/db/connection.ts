import sql from 'mssql';
import { LoadDbConfig, type DbConfig } from '@memberjunction/testing-integration';

/** Database connection pool factory for the pstruth schema. */
export class TruthConnection {
  /** Build the `mssql` pool config from `LoadDbConfig()` (`mj.config.cjs` `databaseSettings` takes precedence over `DB_*`). */
  public static async ResolvePoolConfig(
    loadDbConfig: () => Promise<DbConfig> = LoadDbConfig,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<sql.config> {
    const db = await loadDbConfig();
    if (db.Platform !== 'sqlserver') {
      throw new Error(`TruthConnection.OpenPool: the pstruth schema requires SQL Server (got platform '${db.Platform}')`);
    }
    const trustCert =
      env.DB_TRUST_SERVER_CERTIFICATE === undefined
        ? true
        : env.DB_TRUST_SERVER_CERTIFICATE === '1' || env.DB_TRUST_SERVER_CERTIFICATE.toLowerCase() === 'true';
    return {
      server: db.Host,
      port: db.Port,
      database: db.Database,
      user: db.User,
      password: db.Password,
      requestTimeout: 120_000,
      options: {
        encrypt: false,
        trustServerCertificate: trustCert,
      },
    };
  }

  /** Open a connection pool resolved via `LoadDbConfig()` (`mj.config.cjs` `databaseSettings` with `DB_*` fallback). */
  public static async OpenPool(
    loadDbConfig: () => Promise<DbConfig> = LoadDbConfig,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<sql.ConnectionPool> {
    const cfg = await TruthConnection.ResolvePoolConfig(loadDbConfig, env);
    const pool = new sql.ConnectionPool(cfg);
    return pool.connect();
  }
}
