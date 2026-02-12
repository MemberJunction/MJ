/**
 * Migration runner for MJ Open Apps.
 *
 * Wraps the Skyway migration engine to execute app migrations against
 * the app's own schema, using a per-app flyway_schema_history table.
 */
import { execSync } from 'node:child_process';

/**
 * Options for running migrations.
 */
export interface MigrationRunOptions {
    /** Path to the directory containing migration SQL files */
    MigrationsDir: string;
    /** The app's database schema name (used as defaultSchema) */
    SchemaName: string;
    /** Database connection string or config for Skyway */
    DatabaseConfig: SkywayDatabaseConfig;
    /** Enable verbose Skyway output */
    Verbose?: boolean;
}

/**
 * Database configuration for Skyway.
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
 * This executes the Skyway CLI with the app's schema as the defaultSchema,
 * so ${flyway:defaultSchema} placeholders in migration files resolve to
 * the app's schema. The flyway_schema_history table lives in the app's
 * schema, ensuring per-app migration tracking.
 *
 * @param options - Migration run configuration
 * @returns Migration result with applied file count
 */
export async function RunAppMigrations(options: MigrationRunOptions): Promise<MigrationRunResult> {
    const { MigrationsDir, SchemaName, DatabaseConfig, Verbose } = options;

    try {
        const connectionUrl = BuildConnectionUrl(DatabaseConfig);
        const args = BuildSkywayArgs(MigrationsDir, SchemaName, connectionUrl);

        if (Verbose) {
            console.log(`Running Skyway migrations for schema '${SchemaName}'`);
            console.log(`  Migrations dir: ${MigrationsDir}`);
            console.log(`  Command: npx skyway ${args.join(' ')}`);
        }

        const output = execSync(`npx skyway ${args.join(' ')}`, {
            encoding: 'utf-8',
            cwd: process.cwd(),
            timeout: 300000 // 5 minute timeout
        });

        const applied = ParseSkywayOutput(output);

        return {
            Success: true,
            MigrationsApplied: applied.length,
            AppliedFiles: applied
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
}

/**
 * Builds the JDBC-style connection URL for Skyway.
 */
function BuildConnectionUrl(config: SkywayDatabaseConfig): string {
    if (config.TrustedConnection) {
        return `jdbc:sqlserver://${config.Host}:${config.Port};databaseName=${config.Database};integratedSecurity=true;trustServerCertificate=true`;
    }
    return `jdbc:sqlserver://${config.Host}:${config.Port};databaseName=${config.Database};user=${config.User};password=${config.Password};trustServerCertificate=true`;
}

/**
 * Builds the CLI arguments for the Skyway command.
 */
function BuildSkywayArgs(
    migrationsDir: string,
    schemaName: string,
    connectionUrl: string
): string[] {
    return [
        'migrate',
        `-locations=filesystem:${migrationsDir}`,
        `-url=${connectionUrl}`,
        `-defaultSchema=${schemaName}`,
        `-table=flyway_schema_history`,
        `-placeholders.flyway:defaultSchema=${schemaName}`
    ];
}

/**
 * Parses the Skyway output to extract which migrations were applied.
 *
 * @param output - Raw stdout from the Skyway process
 * @returns List of applied migration file names
 */
function ParseSkywayOutput(output: string): string[] {
    const applied: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
        // Skyway logs lines like: "Migrating schema `acme_crm` to version V001__create_tables.sql"
        const match = line.match(/Migrating.*to version\s+(V\S+)/i);
        if (match) {
            applied.push(match[1]);
        }
    }

    return applied;
}
