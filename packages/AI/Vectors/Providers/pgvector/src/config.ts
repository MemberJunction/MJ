import dotenv from 'dotenv';
dotenv.config({ quiet: true });

/**
 * PostgreSQL connection configuration for pgvector.
 * Can be supplied via environment variables or by passing a JSON connection
 * string as the `apiKey` constructor parameter.
 */
export interface PgVectorConnectionConfig {
    Host: string;
    Port: number;
    Database: string;
    User: string;
    Password: string;
    /** Optional schema name (defaults to "public") */
    Schema: string;
    /** SSL mode — set to true for cloud-hosted PostgreSQL */
    SSL: boolean;
}

/** Environment-variable-based defaults */
export const PgVectorHost: string = process.env.PG_VECTOR_HOST || 'localhost';

/** @deprecated Use {@link PgVectorHost}. */
export const pgVectorHost = PgVectorHost;
export const PgVectorPort: number = Number(process.env.PG_VECTOR_PORT) || 5432;

/** @deprecated Use {@link PgVectorPort}. */
export const pgVectorPort = PgVectorPort;
// The package's barrel re-exports both this file and ./models/PgVectorDatabase, which exports a
// CLASS of that name. Pascalizing this const collides with it at the barrel (TS2308) even though
// nothing conflicts inside this file.
// case-violation-ok-legacy-back-compat: PascalCase name is the exported class in ./models
export const pgVectorDatabase: string = process.env.PG_VECTOR_DATABASE || 'vectors';
export const PgVectorUser: string = process.env.PG_VECTOR_USER || 'postgres';

/** @deprecated Use {@link PgVectorUser}. */
export const pgVectorUser = PgVectorUser;
export const PgVectorPassword: string = process.env.PG_VECTOR_PASSWORD || '';

/** @deprecated Use {@link PgVectorPassword}. */
export const pgVectorPassword = PgVectorPassword;
export const PgVectorSchema: string = process.env.PG_VECTOR_SCHEMA || 'public';

/** @deprecated Use {@link PgVectorSchema}. */
export const pgVectorSchema = PgVectorSchema;
export const PgVectorSSL: boolean = process.env.PG_VECTOR_SSL === 'true';

/** @deprecated Use {@link PgVectorSSL}. */
export const pgVectorSSL = PgVectorSSL;

/**
 * Build a connection config from environment variables.
 */
export function GetDefaultConfig(): PgVectorConnectionConfig {
    return {
        Host: PgVectorHost,
        Port: PgVectorPort,
        Database: pgVectorDatabase,
        User: PgVectorUser,
        Password: PgVectorPassword,
        Schema: PgVectorSchema,
        SSL: PgVectorSSL,
    };
}

/**
 * Parse a JSON connection string (passed as apiKey) into a config object.
 * Falls back to environment-variable defaults for any missing fields.
 *
 * Accepted JSON shape:
 * ```json
 * {
 *   "host": "localhost",
 *   "port": 5432,
 *   "database": "vectors",
 *   "user": "postgres",
 *   "password": "secret",
 *   "schema": "public",
 *   "ssl": false
 * }
 * ```
 */
export function ParseConnectionString(apiKey: string): PgVectorConnectionConfig {
    try {
        const parsed = JSON.parse(apiKey) as Record<string, unknown>;
        const defaults = GetDefaultConfig();
        return {
            Host: (parsed['host'] as string) ?? defaults.Host,
            Port: parsed['port'] != null ? Number(parsed['port']) : defaults.Port,
            Database: (parsed['database'] as string) ?? defaults.Database,
            User: (parsed['user'] as string) ?? defaults.User,
            Password: (parsed['password'] as string) ?? defaults.Password,
            Schema: (parsed['schema'] as string) ?? defaults.Schema,
            SSL: parsed['ssl'] != null ? Boolean(parsed['ssl']) : defaults.SSL,
        };
    }
    catch {
        // If apiKey is not valid JSON, treat it as a plain password and use env defaults
        const defaults = GetDefaultConfig();
        defaults.Password = apiKey;
        return defaults;
    }
}
