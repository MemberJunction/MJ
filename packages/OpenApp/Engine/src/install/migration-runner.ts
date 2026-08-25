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
 * One migration's execution result, as skyway reports it to `OnProgress`.
 *
 * `Error.message` is skyway's rich per-batch message
 * (`Failed at batch 2/253 (lines 50-71): <the database error>`) — the thing an operator
 * actually needs, and the thing `Migrate()`'s return value can lose. See
 * {@link CaptureFirstMigrationFailure}.
 */
interface SkywayMigrationExecutionResult {
    Success: boolean;
    Migration: { Filename: string };
    Error?: { message?: string; cause?: unknown };
}

/** Minimal interface for the Skyway instance returned at runtime. */
interface SkywayInstance {
    Migrate(): Promise<{
        Success: boolean;
        MigrationsApplied: number;
        ErrorMessage?: string;
        Details: SkywayMigrationExecutionResult[];
    }>;
    /**
     * Registers progress callbacks. Present since skyway 0.6; optional here because the
     * interface is structural over a dynamically imported class, so an older skyway simply
     * does not have it and the diagnostics degrade to `Migrate()`'s return value.
     */
    OnProgress?(callbacks: {
        OnMigrationEnd?: (result: SkywayMigrationExecutionResult) => void;
        OnLog?: (message: string) => void;
    }): SkywayInstance;
    Close(): Promise<void>;
}

/**
 * Recovers the FIRST database error behind a driver error that reports only its last one.
 *
 * A batch-aborting SQL Server failure emits a chain — `Msg 1767, Foreign key
 * 'FK_ContractLine_Product' references invalid table '__mj_BizAppsOrders.Product'` followed by
 * `Msg 1750, Could not create constraint or index. See previous errors.` — and `mssql` rejects
 * with the LAST one while parking the earlier ones on `precedingErrors`. Reporting only the
 * rejection therefore reports "see previous errors" without the previous errors: literally a
 * pointer to output the operator was never shown. This walks back to the first one, which is
 * the error that names the actual problem.
 *
 * Defensive by construction: the value comes from a dynamically imported driver via an
 * `unknown` cause, so every access is guarded and an unrecognised shape yields undefined.
 */
export function FirstDatabaseError(cause: unknown): string | undefined {
    if (typeof cause !== 'object' || cause === null) {
        return undefined;
    }
    const preceding = (cause as { precedingErrors?: unknown }).precedingErrors;
    if (!Array.isArray(preceding) || preceding.length === 0) {
        return undefined;
    }
    const first = preceding[0] as { message?: unknown } | undefined;
    return typeof first?.message === 'string' && first.message.length > 0 ? first.message : undefined;
}

/**
 * A migration failure observed through `OnProgress`, kept so it can be reported even when
 * `Migrate()`'s return value no longer carries it.
 */
interface CapturedMigrationFailure {
    /** The migration file that failed. */
    File: string;
    /** Skyway's per-batch message, including the underlying database error. */
    Message: string;
    /** The first error of the database's error chain, when the driver kept it. */
    FirstDatabaseError?: string;
}

/**
 * Builds the operator-facing error message for a failed migration run, preferring whichever
 * source still has the migration file and the real database error.
 *
 * **Why this exists (MJ#3975 §3).** A failed app migration was reported, in its entirety, as
 * `Migration failed for schema 'X': Transaction has been aborted.` — no filename, no error
 * number, no object name. The cause is a masking chain inside skyway, and it is worth stating
 * because the fix looks redundant otherwise: a batch fails with the real error (e.g.
 * `Msg 1767, Foreign key 'FK_ContractLine_Product' references invalid table
 * '__mj_BizAppsOrders.Product'`), skyway builds a rich `MigrationExecutionError` for it and
 * heads for `txn.Rollback()` — but the transaction is already doomed, so the rollback itself
 * throws `TransactionError: Transaction has been aborted.`, that throw escapes
 * `executeMigrationsWithHistory`, and `Migrate()`'s outer catch returns
 * `{ Details: [], ErrorMessage: 'Transaction has been aborted.' }`. The good diagnosis is
 * discarded by the compensation path that ran because of it.
 *
 * `OnProgress.OnMigrationEnd` fires with the rich result BEFORE that rollback is attempted,
 * so capturing it there survives the masking. Priority: captured callback failure → the first
 * failed `Details` entry (present when the rollback succeeded) → skyway's own `ErrorMessage`.
 * When a transport-level message masked a captured one, both are reported: the underlying
 * error is what to fix, and the abort explains why the run stopped where it did.
 */
export function BuildMigrationFailureMessage(
    schemaName: string,
    skywayErrorMessage: string | undefined,
    details: SkywayMigrationExecutionResult[],
    captured: CapturedMigrationFailure | undefined,
): string {
    const prefix = `Migration failed for schema '${schemaName}'`;
    const fromDetails = details.find((d) => !d.Success);
    const best: CapturedMigrationFailure | undefined = captured ?? (fromDetails
        ? {
            File: fromDetails.Migration.Filename,
            Message: fromDetails.Error?.message ?? skywayErrorMessage ?? 'unknown error',
            FirstDatabaseError: FirstDatabaseError(fromDetails.Error?.cause),
        }
        : undefined);

    if (!best) {
        // Nothing named the migration — all we have is skyway's message. Say plainly that the
        // file is unknown rather than leaving the operator to wonder whether one exists.
        return `${prefix}: ${skywayErrorMessage ?? 'unknown error'} (no migration file was identified — the run failed before or between migrations)`;
    }

    const masked = skywayErrorMessage && skywayErrorMessage !== best.Message
        ? ` [run terminated with: ${skywayErrorMessage}]`
        : '';
    const root = best.FirstDatabaseError && !best.Message.includes(best.FirstDatabaseError)
        ? ` [first database error: ${best.FirstDatabaseError}]`
        : '';
    return `${prefix}: ${best.File} — ${best.Message}${root}${masked}`;
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

        // Capture the FIRST migration failure as skyway reports it, before its own rollback
        // can mask it. See BuildMigrationFailureMessage for the masking chain.
        let capturedFailure: CapturedMigrationFailure | undefined;
        skyway.OnProgress?.({
            OnMigrationEnd: (r) => {
                if (!r.Success && !capturedFailure) {
                    const first = FirstDatabaseError(r.Error?.cause);
                    capturedFailure = {
                        File: r.Migration.Filename,
                        Message: r.Error?.message ?? 'unknown error',
                        // `Could not create constraint or index. See previous errors.` is a
                        // pointer to output nobody sees; this is the error it points at.
                        FirstDatabaseError: first,
                    };
                }
            },
            OnLog: Verbose ? (m) => console.log(`  ${m}`) : undefined,
        });

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
                : BuildMigrationFailureMessage(SchemaName, result.ErrorMessage, result.Details, capturedFailure),
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
