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

/**
 * Minimal type definition for Skyway config so we don't need
 * `@skyway/core` at compile time.
 */
interface SkywayConfig {
    Database: {
        Server: string;
        Port: number;
        Database: string;
        User: string;
        Password: string;
        Options?: { TrustServerCertificate?: boolean };
    };
    Migrations: {
        Locations: string[];
        DefaultSchema: string;
        BaselineVersion: string;
        BaselineOnMigrate: boolean;
    };
    Placeholders?: Record<string, string>;
}

/** Minimal interface for the Skyway instance returned at runtime. */
interface SkywayInstance {
    Migrate(): Promise<{ MigrationsApplied: number; Details: { Success: boolean; Migration: { Filename: string } }[] }>;
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
    const { MigrationsDir, SchemaName, DatabaseConfig, Verbose } = options;

    let skyway: SkywayInstance | undefined;

    try {
        // Use a variable to prevent TypeScript from resolving the module at compile time.
        // @skyway/core is not yet published to npm; it will be resolved at runtime once available.
        const skywayModuleId = '@skyway/core';
        const { Skyway } = await import(skywayModuleId);
        const config = BuildSkywayConfig(MigrationsDir, SchemaName, DatabaseConfig);

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
            Success: true,
            MigrationsApplied: result.MigrationsApplied,
            AppliedFiles: appliedFiles,
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
 * Builds the SkywayConfig for running app migrations.
 */
function BuildSkywayConfig(
    migrationsDir: string,
    schemaName: string,
    dbConfig: SkywayDatabaseConfig
): SkywayConfig {
    const absoluteDir = path.isAbsolute(migrationsDir)
        ? migrationsDir
        : path.resolve(migrationsDir);

    return {
        Database: {
            Server: dbConfig.Host,
            Port: dbConfig.Port,
            Database: dbConfig.Database,
            User: dbConfig.User,
            Password: dbConfig.Password,
            Options: {
                TrustServerCertificate: true,
            },
        },
        Migrations: {
            Locations: [absoluteDir],
            DefaultSchema: schemaName,
            BaselineVersion: '0',
            BaselineOnMigrate: true,
        },
        Placeholders: {
            'flyway:defaultSchema': schemaName,
        },
    };
}
