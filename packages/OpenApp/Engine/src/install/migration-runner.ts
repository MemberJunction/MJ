/**
 * Migration runner for MJ Open Apps.
 *
 * Uses Skyway — a TypeScript-native, Flyway-compatible migration engine —
 * to execute app migrations against the app's own schema, using a per-app
 * flyway_schema_history table.
 *
 * Skyway is loaded dynamically at runtime so this module compiles even when
 * `@skyway/core` is not installed (e.g. in CI builds that don't need it).
 */
import path from 'node:path';
import type { DatabasePlatform } from '@memberjunction/core';

/**
 * Minimal type definition for Skyway config so we don't need
 * `@skyway/core` at compile time.
 *
 * `Provider` is typed as `unknown` because it's constructed from a dynamically
 * imported provider package (e.g. `@memberjunction/skyway-sqlserver`). Skyway
 * 0.6.x requires a provider; the field is optional here purely because it's
 * filled in inside `RunAppMigrations` after the dynamic import resolves.
 */
interface SkywayConfig {
    Database: {
        Server: string;
        Port: number;
        Database: string;
        User: string;
        Password: string;
        Options?: { Encrypt?: boolean; TrustServerCertificate?: boolean; RequestTimeout?: number };
    };
    Migrations: {
        Locations: string[];
        DefaultSchema: string;
        BaselineVersion: string;
        BaselineOnMigrate: boolean;
    };
    Placeholders?: Record<string, string>;
    TransactionMode?: 'per-run' | 'per-migration';
    Provider?: unknown;
}

/** Minimal interface for the Skyway instance returned at runtime. */
interface SkywayInstance {
    Migrate(): Promise<{
        Success: boolean;
        MigrationsApplied: number;
        ErrorMessage?: string;
        Details: { Success: boolean; Migration: { Filename: string } }[];
    }>;
    Close(): Promise<void>;
}

/**
 * Options for running migrations.
 */
export interface MigrationRunOptions {
    /** Path to the directory containing migration SQL files */
    MigrationsDir: string;
    /** The app's database schema name (used as defaultSchema) */
    SchemaName: string;
    /** Database connection config */
    DatabaseConfig: SkywayDatabaseConfig;
    /** Enable verbose output */
    Verbose?: boolean;
    /** MJ core schema (used to resolve ${mjSchema} placeholder in migrations). Defaults to '__mj'. */
    MJCoreSchema?: string;
    /** Extra user placeholders merged into Skyway's Placeholders map. Overrides built-ins on key collision. */
    ExtraPlaceholders?: Record<string, string>;
    /**
     * Target database platform. Selects the Skyway provider
     * (`@memberjunction/skyway-sqlserver` vs `@memberjunction/skyway-postgres`).
     * Defaults to `'sqlserver'` for backward compatibility.
     */
    Platform?: DatabasePlatform;
}

/**
 * Database configuration for the migration runner.
 */
export interface SkywayDatabaseConfig {
    /** Database host */
    Host: string;
    /** Database port */
    Port: number;
    /** Database name */
    Database: string;
    /** Database user */
    User: string;
    /** Database password */
    Password: string;
    /** Whether to use Windows integrated auth */
    TrustedConnection?: boolean;
    /** Whether to encrypt the connection (required for Azure SQL, auto-detected if omitted) */
    Encrypt?: boolean;
    /** Whether to trust the server certificate (default: true for local, false for Azure SQL) */
    TrustServerCertificate?: boolean;
    /** Request timeout in milliseconds */
    RequestTimeout?: number;
}

/**
 * @deprecated Use SkywayDatabaseConfig instead
 */
export type FlywayDatabaseConfig = SkywayDatabaseConfig;

/**
 * Result of running migrations.
 */
export interface MigrationRunResult {
    /** Whether all migrations applied successfully */
    Success: boolean;
    /** Number of migrations applied */
    MigrationsApplied: number;
    /** List of migration file names that were applied */
    AppliedFiles: string[];
    /** Error message if migrations failed */
    ErrorMessage?: string;
}

/**
 * Runs Skyway migrations for an Open App.
 *
 * This executes Skyway with the app's schema as the defaultSchema,
 * so ${flyway:defaultSchema} placeholders in migration files resolve to
 * the app's schema. The flyway_schema_history table lives in the app's
 * schema, ensuring per-app migration tracking.
 *
 * @param options - Migration run configuration
 * @returns Migration result with applied file count
 */
export async function RunAppMigrations(options: MigrationRunOptions): Promise<MigrationRunResult> {
    const { MigrationsDir, SchemaName, DatabaseConfig, Verbose, MJCoreSchema, ExtraPlaceholders } = options;
    const platform: DatabasePlatform = options.Platform ?? 'sqlserver';

    let skyway: SkywayInstance | undefined;

    try {
        // Use variables to prevent TypeScript from resolving the modules at compile time.
        // The skyway provider packages are published as (optional) dependencies of the
        // host process (e.g. MJCLI). Install the one matching the target platform.
        const skywayModuleId = '@memberjunction/skyway-core';
        const { Skyway } = await import(skywayModuleId);
        const config = BuildSkywayConfig(MigrationsDir, SchemaName, DatabaseConfig, MJCoreSchema, ExtraPlaceholders, platform);
        // Skyway 0.6.x requires an explicit provider, selected by platform.
        config.Provider = await CreateSkywayProvider(platform, config.Database);

        if (Verbose) {
            console.log(`Running Skyway migrations for schema '${SchemaName}'`);
            console.log(`  Migrations dir: ${MigrationsDir}`);
            console.log(`  Server: ${DatabaseConfig.Host}:${DatabaseConfig.Port}`);
        }

        skyway = new Skyway(config) as SkywayInstance;
        const result = await skyway.Migrate();

        const appliedFiles = result.Details
            .filter((d: { Success: boolean }) => d.Success)
            .map((d: { Migration: { Filename: string } }) => d.Migration.Filename);

        return {
            Success: result.Success,
            MigrationsApplied: result.MigrationsApplied,
            AppliedFiles: appliedFiles,
            ErrorMessage: result.Success
                ? undefined
                : `Migration failed for schema '${SchemaName}': ${result.ErrorMessage ?? 'unknown error'}`,
        };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            Success: false,
            MigrationsApplied: 0,
            AppliedFiles: [],
            ErrorMessage: `Migration failed for schema '${SchemaName}': ${message}`
        };
    }
    finally {
        if (skyway) {
            await skyway.Close().catch(() => { /* ignore close errors */ });
        }
    }
}

/**
 * Creates the Skyway database provider matching the target platform. The
 * provider packages are optional peer dependencies of the host process —
 * install the one matching your database. Mirrors MJCLI's `createSkywayProvider`.
 */
async function CreateSkywayProvider(platform: DatabasePlatform, dbConfig: SkywayConfig['Database']): Promise<unknown> {
    if (platform === 'postgresql') {
        const postgresProviderModuleId = '@memberjunction/skyway-postgres';
        try {
            const { PostgresProvider } = await import(postgresProviderModuleId);
            return new PostgresProvider(dbConfig);
        } catch {
            throw new Error(
                'PostgreSQL provider not found. Install @memberjunction/skyway-postgres to run Open App migrations against PostgreSQL.'
            );
        }
    }
    const sqlServerProviderModuleId = '@memberjunction/skyway-sqlserver';
    try {
        const { SqlServerProvider } = await import(sqlServerProviderModuleId);
        return new SqlServerProvider(dbConfig);
    } catch {
        throw new Error(
            'SQL Server provider not found. Install @memberjunction/skyway-sqlserver to run Open App migrations against SQL Server.'
        );
    }
}

/**
 * Builds the SkywayConfig for running app migrations.
 *
 * Exported for unit testing of the baseline semantics (B19).
 */
export function BuildSkywayConfig(
    migrationsDir: string,
    schemaName: string,
    dbConfig: SkywayDatabaseConfig,
    mjCoreSchema?: string,
    extraPlaceholders?: Record<string, string>,
    platform: DatabasePlatform = 'sqlserver'
): SkywayConfig {
    const absoluteDir = path.isAbsolute(migrationsDir)
        ? migrationsDir
        : path.resolve(migrationsDir);

    // Azure SQL auto-detection is SQL-Server-specific (host ends with
    // .database.windows.net → encryption required). For PostgreSQL the encrypt/
    // trust flags are honored as provided and never Azure-inferred.
    const isAzureSql = platform === 'sqlserver' && dbConfig.Host.includes('.database.windows.net');
    const encrypt = dbConfig.Encrypt ?? isAzureSql;
    const trustCert = dbConfig.TrustServerCertificate ?? !isAzureSql;

    return {
        Database: {
            Server: dbConfig.Host,
            Port: dbConfig.Port,
            Database: dbConfig.Database,
            User: dbConfig.User,
            Password: dbConfig.Password,
            Options: {
                Encrypt: encrypt,
                TrustServerCertificate: trustCert,
                ...(dbConfig.RequestTimeout ? { RequestTimeout: dbConfig.RequestTimeout } : {}),
            },
        },
        Migrations: {
            Locations: [absoluteDir],
            DefaultSchema: schemaName,
            // BaselineVersion '1' is a skyway SENTINEL meaning "auto-select the
            // highest B-prefixed baseline migration and RUN it" — it is NOT a
            // Flyway-style numeric watermark/floor. Open apps ship their initial
            // schema + entity-metadata seed as a B-baseline migration (e.g.
            // bizapps-common's B...__Schema_and_Tables.sql), so on a fresh schema
            // this sentinel is what actually creates everything.
            //
            // Do NOT change this to '0' (or any other number). Any non-'1' value is
            // treated as an EXPLICIT baseline version that skyway exact-matches
            // against the B files; since no app names a baseline "0", skyway then
            // runs NO baseline at all, and the app's later V migrations fail against
            // the un-seeded schema (e.g. "Expected exactly 1 row updated for
            // [<App>: <Entity>] in [__mj].[Entity]; got 0. Aborting migration.").
            //
            // BaselineOnMigrate only fires when there's no history table, so a
            // normal --keep-data reinstall (history intact) is unaffected either way.
            // (See @memberjunction/skyway-core migration/resolver ResolveMigrations.)
            BaselineVersion: '1',
            BaselineOnMigrate: true,
        },
        Placeholders: {
            'flyway:defaultSchema': schemaName,
            mjSchema: mjCoreSchema ?? '__mj',
            ...(extraPlaceholders ?? {}),
        },
    };
}
