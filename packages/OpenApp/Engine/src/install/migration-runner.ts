/**
 * Migration runner for MJ Open Apps.
 *
 * Uses Skyway — a TypeScript-native, Flyway-compatible migration engine —
 * to execute app migrations against the app's own schema, using a per-app
 * flyway_schema_history table.
 *
 * The skyway packages are optionalDependencies of this package, loaded dynamically at
 * runtime so this module still loads when they are absent (an install run with
 * --no-optional). Their types come in via `import type`, which is erased at compile time.
 */
import path from 'node:path';
import type { DatabasePlatform } from '@memberjunction/core';
import { GetDialect } from '@memberjunction/sql-dialect';
import type { DatabaseProvider, MigrateResult, MigrationExecutionResult, Skyway, SkywayConfig } from '@memberjunction/skyway-core';

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
    /**
     * How migrations are wrapped in transactions:
     *
     * - `'per-migration'` (**default**) — each migration file runs and commits in its own
     *   transaction. Flyway's semantics, and what MJCLI's `transactionMode` already
     *   defaults to for `mj migrate`.
     * - `'per-run'` — one transaction wraps the entire pending set (all or nothing).
     *
     * Defaults to `'per-migration'` because `'per-run'` cannot host every valid migration
     * set. SQL Server cannot create a table type and instantiate a variable of that type
     * in the same transaction: the CREATE TYPE's schema-modification lock is still held
     * while TVP instantiation — which runs in a nested system transaction that does not
     * share the session's lock ownership — requests schema-stability on it, so the session
     * deadlocks against itself (error 1205). On a from-zero install every migration is
     * pending, so under `'per-run'` the whole app is one transaction and no arrangement of
     * migration files avoids it. `'per-run'` remains available opt-in.
     *
     * Callers relying on all-or-nothing must note that under `'per-migration'` a set that
     * fails partway leaves earlier files committed and recorded in the app's history table.
     * Undoing an install is therefore the caller's responsibility (the install orchestrator
     * compensates by removing the app's metadata, running its declared teardown scripts, and
     * dropping its schema) rather than the database's.
     */
    TransactionMode?: 'per-run' | 'per-migration';
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
 * mssql rejects with the LAST error of a chain (`See previous errors.`) and keeps the earlier
 * ones on `precedingErrors`; the first of those is the one that names the actual problem.
 */
export function FirstDatabaseError(error: Error | undefined): string | undefined {
    const seen = new Set<Error>();
    let current: unknown = error;
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current);
        const preceding = (current as Error & { precedingErrors?: unknown }).precedingErrors;
        if (Array.isArray(preceding) && preceding[0] instanceof Error) {
            return preceding[0].message;
        }
        current = current.cause;
    }
    return undefined;
}

/**
 * The caller-facing message for a failed run: Skyway's own message for the failing migration,
 * prefixed with its file, plus the first database error when mssql hid it (MJ#3975).
 *
 * `captured` is the failure reported to `OnMigrationEnd`. In `per-migration` mode Skyway's
 * rollback of the doomed transaction throws, and `Migrate()` then returns empty `Details` with
 * only `Transaction has been aborted.` — so the callback is the only place the failure survives.
 */
export function DescribeMigrationFailure(schemaName: string, result?: MigrateResult, captured?: MigrationExecutionResult): string {
    const failed = captured ?? result?.Details?.find((detail) => !detail.Success);
    const file = failed ? ` in ${failed.Migration.Filename}` : '';
    const message = failed?.Error?.message || result?.ErrorMessage || 'no error detail was reported by the migration engine';
    const first = FirstDatabaseError(failed?.Error);
    const firstNote = first && !message.includes(first) ? ` [first database error: ${first}]` : '';
    return `Migration failed for schema '${schemaName}'${file}: ${message}${firstNote}`;
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
 * This executes Skyway with the app's schema as the defaultSchema,
 * so ${flyway:defaultSchema} placeholders in migration files resolve to
 * the app's schema. The flyway_schema_history table lives in the app's
 * schema, ensuring per-app migration tracking.
 *
 * @param options - Migration run configuration
 * @returns Migration result with applied file count
 */
export async function RunAppMigrations(options: MigrationRunOptions): Promise<MigrationRunResult> {
    const { MigrationsDir, SchemaName, DatabaseConfig, Verbose, MJCoreSchema, ExtraPlaceholders, TransactionMode } = options;
    // The install path always supplies Platform (from the live provider's dialect), so this
    // fallback is unreachable there. It is reachable by direct programmatic callers of this
    // exported helper — exactly the population that could silently get SQL Server semantics
    // against a PostgreSQL database. Keep the default (removing it would be breaking) but say so.
    if (options.Platform === undefined) {
        console.warn(
            `RunAppMigrations: no Platform supplied for schema '${SchemaName}' — defaulting to 'sqlserver'. ` +
                `Pass Platform explicitly (e.g. from your provider's Dialect.PlatformKey) to avoid running SQL Server semantics against another database.`,
        );
    }
    const platform: DatabasePlatform = options.Platform ?? 'sqlserver';

    let skyway: Skyway | undefined;
    let capturedFailure: MigrationExecutionResult | undefined;

    try {
        // The skyway packages are declared as optionalDependencies of THIS package (and as
        // regular dependencies of hosts like MJCLI), so a bare specifier resolves under both
        // npm's hoisted layout and pnpm's strict per-package layout — a bare dynamic import
        // resolves from the importing module, not the host entrypoint, so a host-provides
        // contract alone cannot work under pnpm (MJ#3677). The import stays dynamic (via
        // ImportSkywayClass) so this module loads even when the optional
        // packages are not installed — and a genuinely-missing package gets the actionable
        // optionalDependencies guidance instead of a raw resolver error.
        const SkywayClass = await ImportSkywayClass('@memberjunction/skyway-core', 'Skyway', 'the Skyway migration engine');
        const config = BuildSkywayConfig(MigrationsDir, SchemaName, DatabaseConfig, MJCoreSchema, ExtraPlaceholders, platform, TransactionMode);
        // Skyway 0.6.x requires an explicit provider, selected by platform.
        config.Provider = await CreateSkywayProvider(platform, config.Database);

        if (Verbose) {
            console.log(`Running Skyway migrations for schema '${SchemaName}'`);
            console.log(`  Migrations dir: ${MigrationsDir}`);
            console.log(`  Server: ${DatabaseConfig.Host}:${DatabaseConfig.Port}`);
        }

        skyway = new SkywayClass(config) as Skyway;
        // See DescribeMigrationFailure. Runtime-checked: an older skyway has no OnProgress.
        if (typeof skyway.OnProgress === 'function') {
            skyway.OnProgress({
                OnMigrationEnd: (migration) => {
                    if (!migration.Success && !capturedFailure) {
                        capturedFailure = migration;
                    }
                },
            });
        }
        const result = await skyway.Migrate();

        const appliedFiles = result.Details
            .filter((d: { Success: boolean }) => d.Success)
            .map((d: { Migration: { Filename: string } }) => d.Migration.Filename);

        if (result.Success) {
            const { ExecuteOpenAppMetadataRefresh, IsOpenAppSchema } = await import('./open-app-metadata-refresh.js');
            const coreSchema = MJCoreSchema ?? '__mj';
            if (IsOpenAppSchema(SchemaName, coreSchema)) {
                if (Verbose) {
                    console.log(`Refreshing metadata for Open App schema '${SchemaName}'`);
                }
                try {
                    await ExecuteOpenAppMetadataRefresh({
                        platform,
                        coreSchema,
                        appSchema: SchemaName,
                        database: DatabaseConfig,
                    });
                } catch (refreshError: unknown) {
                    const refreshMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
                    return {
                        Success: false,
                        MigrationsApplied: result.MigrationsApplied,
                        AppliedFiles: appliedFiles,
                        ErrorMessage: `Migrations applied for schema '${SchemaName}' but metadata refresh failed: ${refreshMessage}`,
                    };
                }
            }
        }

        return {
            Success: result.Success,
            MigrationsApplied: result.MigrationsApplied,
            AppliedFiles: appliedFiles,
            ErrorMessage: result.Success ? undefined : DescribeMigrationFailure(SchemaName, result, capturedFailure),
        };
    }
    catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            Success: false,
            MigrationsApplied: 0,
            AppliedFiles: [],
            ErrorMessage: capturedFailure
                ? DescribeMigrationFailure(SchemaName, undefined, capturedFailure)
                : `Migration failed for schema '${SchemaName}': ${message}`,
        };
    }
    finally {
        if (skyway) {
            await skyway.Close().catch(() => { /* ignore close errors */ });
        }
    }
}

/**
 * Creates the Skyway database provider matching the target platform. The provider
 * packages are optionalDependencies of this package — only the one matching the
 * target database needs to be installed. Mirrors MJCLI's `createSkywayProvider`.
 */
async function CreateSkywayProvider(platform: DatabasePlatform, dbConfig: SkywayConfig['Database']): Promise<DatabaseProvider> {
    if (platform === 'postgresql') {
        const PostgresProvider = await ImportSkywayClass('@memberjunction/skyway-postgres', 'PostgresProvider', 'the PostgreSQL provider');
        return new PostgresProvider(dbConfig) as DatabaseProvider;
    }
    const SqlServerProvider = await ImportSkywayClass('@memberjunction/skyway-sqlserver', 'SqlServerProvider', 'the SQL Server provider');
    return new SqlServerProvider(dbConfig) as DatabaseProvider;
}

/**
 * Dynamically imports a skyway package and returns the named class. Only a RESOLUTION
 * failure (the package is not installed) is translated into the optionalDependencies
 * guidance — any other error (including a throw from the package's own module code, or
 * later from the constructor) surfaces as-is, so a bad connection config is never
 * misreported as a missing package. Used for skyway-core and both platform providers,
 * so the common failure mode (all skyway packages absent together under --no-optional)
 * gets the actionable message too.
 */
async function ImportSkywayClass(moduleId: string, exportName: string, label: string): Promise<new (...args: unknown[]) => unknown> {
    let mod: Record<string, unknown>;
    try {
        mod = await import(moduleId);
    } catch (error: unknown) {
        if (IsModuleResolutionFailure(error)) {
            throw new Error(
                `Cannot run Open App migrations: ${label} (${moduleId}) is not installed. It is an ` +
                    `optionalDependency of @memberjunction/open-app-engine — check for --no-optional installs or a registry that does not carry it.`,
                { cause: error },
            );
        }
        throw error;
    }
    const ctor = mod[exportName];
    if (typeof ctor !== 'function') {
        throw new Error(
            `${moduleId} loaded but does not export '${exportName}' — ` +
                `the installed version may not match what @memberjunction/open-app-engine expects.`,
        );
    }
    return ctor as new (...args: unknown[]) => unknown;
}

/**
 * True when the error is a module-resolution failure rather than a module that loaded
 * and threw. ESM raises ERR_MODULE_NOT_FOUND; CJS resolution raises MODULE_NOT_FOUND;
 * some ESM loader shims (e.g. ts-node's) throw plain code-less Errors, recognized by
 * Node's resolver message.
 *
 * ⚠ Under ts-node's shim the coded branch never fires (the shim strips custom error
 * properties crossing the module-hooks thread), so the message branch is LOAD-BEARING
 * there: if a future Node rewords its resolver messages, this predicate must be updated.
 *
 * Keep in sync with `isResolutionFailure` in @memberjunction/server-bootstrap's
 * `src/host-import.ts` (which carries the unit tests for this heuristic) — duplicated
 * because the two packages cannot depend on each other and cross-package re-exports
 * are disallowed.
 */
function IsModuleResolutionFailure(error: unknown): boolean {
    const { code, message } = (error as { code?: string; message?: string }) ?? {};
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        return true;
    }
    return code === undefined && typeof message === 'string' && /^Cannot find (package|module) /.test(message);
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
    platform: DatabasePlatform = 'sqlserver',
    transactionMode: 'per-run' | 'per-migration' = 'per-migration'
): SkywayConfig {
    const absoluteDir = path.isAbsolute(migrationsDir)
        ? migrationsDir
        : path.resolve(migrationsDir);

    // Canonicalize the schema for the platform (PG folds unquoted DDL to lowercase) so Skyway's
    // history table AND the `${flyway:defaultSchema}` the app's migrations resolve to both land in
    // the SAME physical schema the app's (unquoted) DDL creates — no mixed-case/lowercase split.
    const canonicalSchema = GetDialect(platform).CanonicalSchemaName(schemaName);

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
            // Use the dialect's canonical schema casing (#2926) so the seed/baseline
            // resolves on both SQL Server and PostgreSQL.
            DefaultSchema: canonicalSchema,
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
            'flyway:defaultSchema': canonicalSchema,
            mjSchema: mjCoreSchema ?? '__mj',
            ...(extraPlaceholders ?? {}),
        },
        // Always set explicitly rather than left to Skyway's own 'per-run' default, so the
        // app-install path and `mj migrate` agree. See MigrationRunOptions.TransactionMode.
        TransactionMode: transactionMode,
    };
}
