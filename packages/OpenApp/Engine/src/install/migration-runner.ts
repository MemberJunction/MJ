/**
 * Migration runner for MJ Open Apps.
 *
 * Uses Skyway — a TypeScript-native, Flyway-compatible migration engine —
 * to execute app migrations against the app's own schema, using a per-app
 * flyway_schema_history table.
 *
 * The skyway packages (`@memberjunction/skyway-core` + the platform providers) are
 * declared as optionalDependencies of this package but loaded dynamically at runtime,
 * so this module compiles and loads even when they are not installed (e.g. in CI
 * builds that don't need them, or installs run with --no-optional).
 */
import path from 'node:path';
import type { DatabasePlatform } from '@memberjunction/core';
import { GetDialect } from '@memberjunction/sql-dialect';

/**
 * Minimal type definition for Skyway config so we don't need
 * `@memberjunction/skyway-core` at compile time.
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

/**
 * Details about the SQL batch Skyway was executing when a migration failed
 * (`FailedBatchInfo` in `@memberjunction/skyway-core`). Structural, so this module
 * still compiles without the optional skyway packages installed.
 */
interface SkywayFailedBatchInfo {
    BatchNumber?: number;
    TotalBatches?: number;
    StartLine?: number;
    EndLine?: number;
    SucceededBatches?: number;
}

/**
 * The fields of skyway's `MigrationExecutionError` we surface. Skyway attaches the
 * script name, the failed batch's position, and the driver error as `cause` — none of
 * which are present on the run-level `ErrorMessage`.
 */
interface SkywayMigrationExecutionError extends Error {
    Script?: string;
    Version?: string | null;
    BatchInfo?: SkywayFailedBatchInfo;
}

/** One migration's execution result (`MigrationExecutionResult` in skyway-core). */
interface SkywayMigrationDetail {
    Success: boolean;
    Migration: { Filename: string };
    /** Populated only on failure; typically a `MigrationExecutionError`. */
    Error?: unknown;
}

/** The run-level result of `Skyway.Migrate()`. */
interface SkywayMigrateResult {
    Success: boolean;
    MigrationsApplied: number;
    ErrorMessage?: string;
    Details: SkywayMigrationDetail[];
}

/** Minimal interface for the Skyway instance returned at runtime. */
interface SkywayInstance {
    Migrate(): Promise<SkywayMigrateResult>;
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
 * Reads the `cause` chain off an error, innermost last.
 *
 * Skyway wraps the driver's error: a SQL Server failure arrives as a
 * `MigrationExecutionError` whose `cause` is the `mssql`/`tedious` error carrying the
 * actual `Msg NNNN` text. Reporting only the outer message is how a foreign-key
 * failure reaches the operator as `Transaction has been aborted.`
 */
function CauseChainMessages(error: unknown): string[] {
    const messages: string[] = [];
    const seen = new Set<unknown>();
    let current: unknown = error;
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current);
        const message = current.message.trim();
        if (message.length > 0 && !messages.includes(message)) {
            messages.push(message);
        }
        current = (current as { cause?: unknown }).cause;
    }
    return messages;
}

/**
 * Builds the operator-facing message for a failed migration run.
 *
 * WHY THIS EXISTS. Skyway already knows everything useful about a failure — which
 * script, which batch of how many, the line range, how many batches committed first,
 * and the driver error underneath — and hands it over on the failing
 * `Details[]` entry. The run-level `ErrorMessage` carries none of that, and under
 * `per-run` transaction mode it is frequently just `Transaction has been aborted.`
 * Reporting only the run-level string is why an Open App migration failure could
 * arrive as one context-free sentence: no filename, no SQL error, no object name
 * (MJ#3975). Everything below is information Skyway supplied and this module used to
 * discard.
 *
 * Degrades in steps rather than all at once: with no failing detail it falls back to
 * the run-level message, and with neither it says so explicitly instead of emitting
 * `undefined`.
 *
 * Pure — no I/O, so it is unit-testable without a database.
 *
 * @param schemaName the app schema the run targeted, for the message prefix
 * @param result     the run-level result, whose `Details` locate the failure
 * @param thrown     an error thrown out of `Migrate()` instead of returned, if any
 */
export function DescribeMigrationFailure(schemaName: string, result?: SkywayMigrateResult, thrown?: unknown): string {
    const prefix = `Migration failed for schema '${schemaName}'`;
    const failed = result?.Details?.find((detail) => !detail.Success);
    const detailError = (failed?.Error ?? thrown) as SkywayMigrationExecutionError | undefined;

    // Prefer the script skyway names on the error, then the failing detail's filename:
    // a migration can fail before it becomes a Details entry (resolution, checksum).
    const script = detailError?.Script ?? failed?.Migration?.Filename;

    const parts: string[] = [];
    if (script) {
        parts.push(`in ${script}`);
    }

    const batch = detailError?.BatchInfo;
    if (batch?.BatchNumber !== undefined) {
        const ofTotal = batch.TotalBatches !== undefined ? ` of ${batch.TotalBatches}` : '';
        const lines =
            batch.StartLine !== undefined && batch.EndLine !== undefined
                ? `, lines ${batch.StartLine}-${batch.EndLine}`
                : '';
        parts.push(`at batch ${batch.BatchNumber}${ofTotal}${lines}`);
    }

    // The count of batches that committed before the failure is the difference between
    // "nothing ran" and "the schema is half-built", which decides whether a retry is safe.
    if (batch?.SucceededBatches !== undefined) {
        parts.push(`${batch.SucceededBatches} batch(es) succeeded first`);
    }

    // The driver error last, so the innermost `Msg NNNN` is what the eye lands on. The
    // run-level message is a fallback, not an addition — it is usually the vaguest of them.
    const causes = CauseChainMessages(detailError);
    const detailText = causes.length > 0 ? causes.join(' — caused by: ') : result?.ErrorMessage?.trim();

    const located = parts.length > 0 ? ` ${parts.join(', ')}` : '';
    return `${prefix}${located}: ${detailText && detailText.length > 0 ? detailText : 'no error detail was reported by the migration engine'}`;
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

    let skyway: SkywayInstance | undefined;

    try {
        // The skyway packages are declared as optionalDependencies of THIS package (and as
        // regular dependencies of hosts like MJCLI), so a bare specifier resolves under both
        // npm's hoisted layout and pnpm's strict per-package layout — a bare dynamic import
        // resolves from the importing module, not the host entrypoint, so a host-provides
        // contract alone cannot work under pnpm (MJ#3677). The import stays dynamic (via
        // ImportSkywayClass) so this module compiles and loads even when the optional
        // packages are not installed — and a genuinely-missing package gets the actionable
        // optionalDependencies guidance instead of a raw resolver error.
        const Skyway = await ImportSkywayClass('@memberjunction/skyway-core', 'Skyway', 'the Skyway migration engine');
        const config = BuildSkywayConfig(MigrationsDir, SchemaName, DatabaseConfig, MJCoreSchema, ExtraPlaceholders, platform, TransactionMode);
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

        if (result.Success) {
            const { executeOpenAppMetadataRefresh, isOpenAppSchema } = await import('./open-app-metadata-refresh.js');
            const coreSchema = MJCoreSchema ?? '__mj';
            if (isOpenAppSchema(SchemaName, coreSchema)) {
                if (Verbose) {
                    console.log(`Refreshing metadata for Open App schema '${SchemaName}'`);
                }
                try {
                    await executeOpenAppMetadataRefresh({
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
            ErrorMessage: result.Success ? undefined : DescribeMigrationFailure(SchemaName, result),
        };
    }
    catch (error: unknown) {
        // A throw out of Migrate() can still be a MigrationExecutionError carrying the
        // script and batch, so it goes through the same describer rather than being
        // flattened to `error.message`.
        return {
            Success: false,
            MigrationsApplied: 0,
            AppliedFiles: [],
            ErrorMessage:
                error instanceof Error
                    ? DescribeMigrationFailure(SchemaName, undefined, error)
                    : `Migration failed for schema '${SchemaName}': ${String(error)}`,
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
async function CreateSkywayProvider(platform: DatabasePlatform, dbConfig: SkywayConfig['Database']): Promise<unknown> {
    if (platform === 'postgresql') {
        const PostgresProvider = await ImportSkywayClass('@memberjunction/skyway-postgres', 'PostgresProvider', 'the PostgreSQL provider');
        return new PostgresProvider(dbConfig);
    }
    const SqlServerProvider = await ImportSkywayClass('@memberjunction/skyway-sqlserver', 'SqlServerProvider', 'the SQL Server provider');
    return new SqlServerProvider(dbConfig);
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
