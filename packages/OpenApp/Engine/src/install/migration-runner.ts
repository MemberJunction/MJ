/**
 * Migration runner for MJ Open Apps.
 *
 * Uses Skyway — a TypeScript-native, Flyway-compatible migration engine —
 * to execute app migrations against the app's own schema, using a per-app
 * flyway_schema_history table.
 *
 * The skyway packages (`@memberjunction/skyway-core` + the platform providers) are
 * declared as optionalDependencies of this package and loaded dynamically at RUNTIME, so
 * this module loads — and fails with actionable guidance only when migrations are actually
 * run — even when they are not installed (an install run with --no-optional).
 *
 * Their TYPES are imported with `import type`, which TypeScript erases entirely: no runtime
 * dependency is added. That replaced a hand-maintained structural copy of skyway's shapes,
 * which could drift silently — a skyway change to its result shape would compile clean here
 * and just stop reporting the fields that moved. It does mean building THIS package needs
 * the optional packages present, which a normal workspace install always provides (no MJ CI
 * job installs with --no-optional), and MJCLI already imports the same types this way.
 */
import path from 'node:path';
import type { DatabasePlatform } from '@memberjunction/core';
import { GetDialect } from '@memberjunction/sql-dialect';
import type {
    DatabaseProvider,
    MigrateResult,
    MigrationExecutionError,
    MigrationExecutionResult,
    Skyway,
    SkywayConfig,
} from '@memberjunction/skyway-core';

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
 * True when skyway's per-migration error carries its script + batch detail. `import type`
 * cannot be used with `instanceof`, so this checks for the field skyway always sets.
 */
function IsMigrationExecutionError(error: Error): error is MigrationExecutionError {
    return 'Script' in error;
}

/**
 * Reads the `cause` chain off an error, outermost first, keeping only messages that add
 * information.
 *
 * Skyway wraps the driver's error: a SQL Server failure arrives as a `MigrationExecutionError`
 * (`Failed at batch 1/1 (lines 1-8): <driver text>`) whose `cause` is the `mssql` error carrying
 * the same driver text. Reporting both prints every database message twice, so a message that
 * merely wraps the next one in the chain is dropped — the batch and line range it adds are
 * reported on their own line.
 */
function DatabaseMessages(error: Error | undefined): string[] {
    const chain: string[] = [];
    const seen = new Set<Error>();
    let current: unknown = error;
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current);
        const message = current.message.trim();
        if (message.length > 0 && !chain.includes(message)) {
            chain.push(message);
        }
        current = current.cause;
    }
    return chain.filter((message, i) => i === chain.length - 1 || !message.includes(chain[i + 1]));
}

/**
 * Recovers the FIRST database error behind a driver error that reports only its last one.
 *
 * A batch-aborting SQL Server failure raises a chain — `Msg 1767, Foreign key 'FK_…' references
 * invalid table '…'` then `Msg 1750, Could not create constraint or index. See previous errors.` —
 * and `mssql` rejects with the LAST, parking the earlier ones on `precedingErrors`. Reporting the
 * rejection alone therefore says "see previous errors" without the previous errors: a pointer to
 * output nobody was shown. This walks the cause chain for that array and returns its first entry,
 * which is the error that names the actual problem. mssql-specific; other drivers have no such
 * array and this returns undefined.
 */
export function FirstDatabaseError(error: Error | undefined): string | undefined {
    const seen = new Set<Error>();
    let current: unknown = error;
    while (current instanceof Error && !seen.has(current)) {
        seen.add(current);
        const preceding = (current as Error & { precedingErrors?: unknown }).precedingErrors;
        if (Array.isArray(preceding) && preceding[0] instanceof Error && preceding[0].message.trim().length > 0) {
            return preceding[0].message.trim();
        }
        current = current.cause;
    }
    return undefined;
}

/** `at batch 2 of 253, lines 50-71 (1 batch(es) succeeded first)`, or undefined without batch info. */
function BatchLocation(error: Error | undefined): string | undefined {
    const batch = error && IsMigrationExecutionError(error) ? error.BatchInfo : undefined;
    if (batch?.BatchNumber === undefined) {
        return undefined;
    }
    const ofTotal = batch.TotalBatches !== undefined ? ` of ${batch.TotalBatches}` : '';
    const lines = batch.StartLine !== undefined && batch.EndLine !== undefined ? `, lines ${batch.StartLine}-${batch.EndLine}` : '';
    // How many batches committed first is the difference between "nothing ran" and "the schema is
    // half-built", which decides whether a retry is safe.
    const succeeded = batch.SucceededBatches !== undefined ? ` (${batch.SucceededBatches} batch(es) succeeded first)` : '';
    return `at batch ${batch.BatchNumber}${ofTotal}${lines}${succeeded}`;
}

/**
 * Builds the operator-facing message for a failed migration run: a one-line summary naming the
 * schema and the migration file, then indented detail lines.
 *
 * WHY THIS EXISTS (MJ#3975). A failed Open App migration used to reach the operator as the whole
 * of `Migration failed for schema 'X': Transaction has been aborted.` — no file, no SQL error, no
 * object name. Two separate losses produced that, and both are handled here:
 *
 *  1. **The per-migration `Error` was discarded.** Skyway puts the script, the failed batch and
 *     the driver error on each failing result; this module used to read none of it.
 *  2. **Skyway's own rollback can throw the result away.** In `per-migration` mode — the default
 *     for both `mj app install` and `mj migrate` — a batch-aborting error dooms the transaction,
 *     skyway's rollback then throws `Transaction has been aborted.`, that throw escapes, and
 *     `Migrate()` returns `Details: []`. Verified live against skyway-core 0.6.2. The failing
 *     result is still delivered to `OnMigrationEnd` BEFORE the rollback, which is what
 *     `captured` carries; `Details` alone reports exactly the original bug.
 *
 * Multi-line because the located message is long, and every consumer — the MJCLI stderr line,
 * the install result, the NVARCHAR(MAX) install-history column — already carries multi-line text
 * (the upgrade path appends a paragraph to it). The summary is kept to line one so anything that
 * greps or truncates to one line still gets the schema and the file.
 *
 * Degrades in steps: with no failing result it falls back to the run-level message on one line,
 * and with nothing at all it says so instead of emitting `undefined`. Pure — no I/O.
 *
 * @param schemaName the app schema the run targeted
 * @param result     the run-level result, when `Migrate()` returned
 * @param thrown     an error thrown out of `Migrate()`, when it threw instead
 * @param captured   the first failing result seen by `OnMigrationEnd`, which survives the rollback
 */
export function DescribeMigrationFailure(
    schemaName: string,
    result?: MigrateResult,
    thrown?: unknown,
    captured?: MigrationExecutionResult,
): string {
    const prefix = `Migration failed for schema '${schemaName}'`;
    const failed = captured ?? result?.Details?.find((detail) => !detail.Success);
    const error = failed?.Error ?? (thrown instanceof Error ? thrown : undefined);
    const runMessage = result?.ErrorMessage?.trim() || undefined;

    if (!failed && !error) {
        return `${prefix}: ${runMessage ?? 'no error detail was reported by the migration engine'}`;
    }

    const script = (error && IsMigrationExecutionError(error) ? error.Script : undefined) ?? failed?.Migration?.Filename;
    const lines = [script ? `${prefix} in ${script}` : prefix];
    const location = BatchLocation(error);
    if (location) {
        lines.push(`  ${location}`);
    }
    const messages = DatabaseMessages(error);
    const errorLines = messages.length > 0 ? messages : runMessage ? [runMessage] : ['no error detail was reported by the migration engine'];
    lines.push(`  error: ${errorLines[0]}`, ...errorLines.slice(1).map((m) => `    caused by: ${m}`));

    const first = FirstDatabaseError(error);
    if (first && !errorLines.some((m) => m.includes(first))) {
        lines.push(`  first database error: ${first}`);
    }
    // The run-level message usually describes how the run STOPPED (a rollback that could not
    // complete), not why it failed — keep it, labelled as such, but only when it adds anything.
    // In per-run mode it is just the failing migration's own wrapper message, already covered.
    const reported = [...errorLines, error?.message?.trim()].filter((m): m is string => !!m);
    if (runMessage && !reported.some((m) => m.includes(runMessage) || runMessage.includes(m))) {
        lines.push(`  run ended with: ${runMessage}`);
    }
    return lines.join('\n');
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
    // The first failing result skyway reports, captured before its rollback can discard it.
    // See DescribeMigrationFailure for why `Details` alone is not enough.
    let capturedFailure: MigrationExecutionResult | undefined;

    try {
        // The skyway packages are declared as optionalDependencies of THIS package (and as
        // regular dependencies of hosts like MJCLI), so a bare specifier resolves under both
        // npm's hoisted layout and pnpm's strict per-package layout — a bare dynamic import
        // resolves from the importing module, not the host entrypoint, so a host-provides
        // contract alone cannot work under pnpm (MJ#3677). The import stays dynamic (via
        // ImportSkywayClass) so this module compiles and loads even when the optional
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
        // OnProgress exists from skyway 0.6; checked at runtime so an older skyway degrades to
        // Details-only reporting instead of throwing.
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
            ErrorMessage: result.Success ? undefined : DescribeMigrationFailure(SchemaName, result, undefined, capturedFailure),
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
                error instanceof Error || capturedFailure
                    ? DescribeMigrationFailure(SchemaName, undefined, error, capturedFailure)
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
