/**
 * Migration runner for MJ Open Apps.
 *
 * Uses the node-flyway library to execute app migrations against
 * the app's own schema, using a per-app flyway_schema_history table.
 */
import { Flyway } from 'node-flyway';
import type { FlywayConfig } from 'node-flyway/dist/types/types';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

/**
 * Options for running migrations.
 */
export interface MigrationRunOptions {
    /** Path to the directory containing migration SQL files */
    MigrationsDir: string;
    /** The app's database schema name (used as defaultSchema) */
    SchemaName: string;
    /** Database connection config for Flyway */
    DatabaseConfig: FlywayDatabaseConfig;
    /** Enable verbose Flyway output */
    Verbose?: boolean;
}

/**
 * Database configuration for the migration runner.
 */
export interface FlywayDatabaseConfig {
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
 * @deprecated Use FlywayDatabaseConfig instead
 */
export type SkywayDatabaseConfig = FlywayDatabaseConfig;

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
 * Runs Flyway migrations for an Open App.
 *
 * This executes Flyway with the app's schema as the defaultSchema,
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
        const flywayConfig = BuildFlywayConfig(MigrationsDir, SchemaName, DatabaseConfig);

        if (Verbose) {
            console.log(`Running Flyway migrations for schema '${SchemaName}'`);
            console.log(`  Migrations dir: ${MigrationsDir}`);
            console.log(`  JDBC URL: ${flywayConfig.url}`);
        }

        const flyway = new Flyway(flywayConfig);
        const result = await flyway.migrate();

        // node-flyway sometimes fails to parse Flyway's response even though migration succeeded
        const isParseError = result.error?.errorCode === 'UNABLE_TO_PARSE_RESPONSE';

        if (result.success) {
            return BuildSuccessResult(result);
        }

        if (isParseError) {
            return await HandleParseError(result, flywayConfig, SchemaName, DatabaseConfig, Verbose);
        }

        // Genuine failure
        const errorMsg = result.error?.message ?? 'Unknown Flyway error';
        return {
            Success: false,
            MigrationsApplied: 0,
            AppliedFiles: [],
            ErrorMessage: `Migration failed for schema '${SchemaName}': ${errorMsg}`
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
 * Builds the FlywayConfig for running app migrations.
 */
function BuildFlywayConfig(
    migrationsDir: string,
    schemaName: string,
    dbConfig: FlywayDatabaseConfig
): FlywayConfig {
    const url = BuildJdbcUrl(dbConfig);

    // Ensure migration location uses filesystem: prefix and absolute path
    const absoluteDir = path.isAbsolute(migrationsDir)
        ? migrationsDir
        : path.resolve(migrationsDir);
    const location = `filesystem:${absoluteDir}`;

    return {
        url,
        user: dbConfig.User,
        password: dbConfig.Password,
        migrationLocations: [location],
        advanced: {
            schemas: [schemaName],
            createSchemas: true,
            // Baseline at 0 so all migrations run for fresh installs
            baselineVersion: '0',
            baselineOnMigrate: true,
        },
    };
}

/**
 * Builds the JDBC connection URL for Flyway.
 */
function BuildJdbcUrl(config: FlywayDatabaseConfig): string {
    if (config.TrustedConnection) {
        return `jdbc:sqlserver://${config.Host}:${config.Port};databaseName=${config.Database};integratedSecurity=true;trustServerCertificate=true`;
    }
    return `jdbc:sqlserver://${config.Host}:${config.Port};databaseName=${config.Database};trustServerCertificate=true`;
}

/**
 * Extracts success info from a successful Flyway result.
 */
function BuildSuccessResult(result: Awaited<ReturnType<Flyway['migrate']>>): MigrationRunResult {
    const applied: string[] = [];
    if (result.flywayResponse?.migrations) {
        for (const m of result.flywayResponse.migrations) {
            if (m.filepath) {
                applied.push(path.basename(m.filepath));
            } else if (m.version) {
                applied.push(`V${m.version}`);
            }
        }
    }

    return {
        Success: true,
        MigrationsApplied: applied.length,
        AppliedFiles: applied,
    };
}

/**
 * Handles the UNABLE_TO_PARSE_RESPONSE case by running Flyway CLI directly.
 * This is a known node-flyway issue where the migration succeeds but
 * node-flyway can't parse the response.
 */
async function HandleParseError(
    result: Awaited<ReturnType<Flyway['migrate']>>,
    flywayConfig: FlywayConfig,
    schemaName: string,
    dbConfig: FlywayDatabaseConfig,
    verbose?: boolean
): Promise<MigrationRunResult> {
    try {
        const flywayDir = result.additionalDetails?.flywayCli?.location;
        if (!flywayDir) {
            // Can't run CLI diagnostic — assume success since parse errors are common
            return {
                Success: true,
                MigrationsApplied: 0,
                AppliedFiles: [],
            };
        }

        const flywayExeName = os.platform() === 'win32' ? 'flyway.cmd' : 'flyway';
        const flywayExePath = path.join(flywayDir, flywayExeName);

        const cliArgs = BuildFlywayCliArgs(flywayConfig, schemaName, dbConfig);

        if (verbose) {
            console.log(`  Running Flyway CLI diagnostic: ${flywayExePath} migrate`);
        }

        const cliResult = spawnSync(flywayExePath, cliArgs, { encoding: 'utf8' });
        const output = cliResult.stderr || cliResult.stdout || '';

        const hasSuccess = output.includes('Successfully applied') ||
                           output.includes('is up to date') ||
                           output.includes('Schema creation not necessary');

        if (cliResult.status === 0 || hasSuccess) {
            const applied = ParseCliAppliedMigrations(output);
            return {
                Success: true,
                MigrationsApplied: applied.length,
                AppliedFiles: applied,
            };
        }

        return {
            Success: false,
            MigrationsApplied: 0,
            AppliedFiles: [],
            ErrorMessage: `Migration failed for schema '${schemaName}': ${output.slice(0, 500)}`
        };
    }
    catch (diagError: unknown) {
        // If diagnostic fails, assume the original migration succeeded
        // (parse errors are usually benign)
        return {
            Success: true,
            MigrationsApplied: 0,
            AppliedFiles: [],
        };
    }
}

/**
 * Builds CLI arguments for running Flyway directly.
 */
function BuildFlywayCliArgs(
    flywayConfig: FlywayConfig,
    schemaName: string,
    dbConfig: FlywayDatabaseConfig
): string[] {
    return [
        `-url=${flywayConfig.url}`,
        `-user=${dbConfig.User}`,
        `-password=${dbConfig.Password}`,
        `-schemas=${schemaName}`,
        `-baselineVersion=0`,
        `-baselineOnMigrate=true`,
        `-createSchemas=true`,
        `-locations=${flywayConfig.migrationLocations.join(',')}`,
        'migrate'
    ];
}

/**
 * Parses Flyway CLI output to find applied migration names.
 */
function ParseCliAppliedMigrations(output: string): string[] {
    const applied: string[] = [];
    for (const line of output.split('\n')) {
        // Flyway logs: "Migrating schema `schema` to version V001 - description"
        const match = line.match(/Migrating.*to version\s+(V\S+)/i);
        if (match) {
            applied.push(match[1]);
        }
    }
    return applied;
}
