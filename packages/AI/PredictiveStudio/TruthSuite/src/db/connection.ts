import sql from 'mssql';

/** Database connection pool factory for the pstruth schema. */
export class TruthConnection {
  /** Open a connection pool from the standard DB_* environment variables; refuses missing host/database/credentials. */
  public static async OpenPool(env: NodeJS.ProcessEnv = process.env): Promise<sql.ConnectionPool> {
    for (const key of ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'] as const) {
      if (!env[key]) {
        throw new Error(`TruthConnection.OpenPool: missing required environment variable ${key}`);
      }
    }
    const pool = new sql.ConnectionPool({
      server: env.DB_HOST!,
      port: env.DB_PORT ? Number(env.DB_PORT) : 1433,
      database: env.DB_DATABASE!,
      user: env.DB_USERNAME!,
      password: env.DB_PASSWORD!,
      requestTimeout: 120_000,
      options: {
        trustServerCertificate:
          env.DB_TRUST_SERVER_CERTIFICATE === '1' ||
          env.DB_TRUST_SERVER_CERTIFICATE?.toLowerCase() === 'true',
      },
    });
    return pool.connect();
  }
}
