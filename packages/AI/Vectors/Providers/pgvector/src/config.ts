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
export const pgVectorHost: string = process.env.PG_VECTOR_HOST || 'localhost';
export const pgVectorPort: number = Number(process.env.PG_VECTOR_PORT) || 5432;
export const pgVectorDatabase: string = process.env.PG_VECTOR_DATABASE || 'vectors';
export const pgVectorUser: string = process.env.PG_VECTOR_USER || 'postgres';
export const pgVectorPassword: string = process.env.PG_VECTOR_PASSWORD || '';
export const pgVectorSchema: string = process.env.PG_VECTOR_SCHEMA || 'public';
export const pgVectorSSL: boolean = process.env.PG_VECTOR_SSL === 'true';

/**
 * Build a connection config from environment variables.
 */
export function GetDefaultConfig(): PgVectorConnectionConfig {
    return {
        Host: pgVectorHost,
        Port: pgVectorPort,
        Database: pgVectorDatabase,
        User: pgVectorUser,
        Password: pgVectorPassword,
        Schema: pgVectorSchema,
        SSL: pgVectorSSL,
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
