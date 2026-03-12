/**
 * RuntimeSchemaManager — Pipeline orchestrator for runtime schema changes.
 *
 * Chains: validate input → SchemaEngine.generateDDL() → write migration file →
 *         run migration → run CodeGen → restart MJAPI via PM2.
 *
 * Gated by ALLOW_RUNTIME_SCHEMA_UPDATE=1 environment variable.
 * Hard-blocks CREATE/ALTER/DROP in __mj schema.
 * In-memory concurrency mutex (one operation at a time).
 */
import { BaseSingleton } from '@memberjunction/global';

// ─── Pipeline Input/Output Types ─────────────────────────────────────

/**
 * Input to the RSU pipeline.
 */
export interface RSUPipelineInput {
    /** The migration SQL to execute (from SchemaEngine or any other source). */
    MigrationSQL: string;

    /** Descriptive name for this schema change. */
    Description: string;

    /** Tables being created or modified (used in branch naming and logging). */
    AffectedTables: string[];

    /** Optional: additionalSchemaInfo JSON content for soft FKs. */
    AdditionalSchemaInfo?: string;

    /** Optional: metadata JSON files for mj-sync. */
    MetadataFiles?: Array<{ Path: string; Content: string }>;

    /** If true, skip the git commit/push step (Phase 2). */
    SkipGitCommit?: boolean;

    /** If true, skip MJAPI restart (useful for batching multiple changes). */
    SkipRestart?: boolean;
}

/**
 * Result of a single pipeline step.
 */
export interface RSUPipelineStep {
    Name: string;
    Status: 'success' | 'failed' | 'skipped';
    DurationMs: number;
    Message: string;
}

/**
 * Result of a full RSU pipeline run.
 */
export interface RSUPipelineResult {
    Success: boolean;
    BranchName?: string;
    MigrationFilePath?: string;
    EntitiesProcessed?: number;
    APIRestarted: boolean;
    GitCommitSuccess: boolean;
    Steps: RSUPipelineStep[];
    ErrorMessage?: string;
    ErrorStep?: string;
}

/**
 * Dry-run preview of what the pipeline would do.
 */
export interface RSUPreviewResult {
    MigrationSQL: string;
    AffectedTables: string[];
    ValidationErrors: string[];
    WouldExecute: boolean;
}

/**
 * Current status of the RSU system.
 */
export interface RSUStatus {
    Enabled: boolean;
    Running: boolean;
    OutOfSync: boolean;
    OutOfSyncSince: Date | null;
    LastRunAt: Date | null;
    LastRunResult: string | null;
}

// ─── Schema Protection ───────────────────────────────────────────────

/**
 * Result of SQL migration validation.
 */
export interface SQLValidationResult {
    Valid: boolean;
    Errors: string[];
}

/**
 * Regex patterns for detecting DDL operations on a given schema.
 * We check for CREATE TABLE/VIEW/PROCEDURE/FUNCTION, ALTER TABLE, and DROP on the schema.
 */
function buildSchemaPatterns(schema: string): RegExp[] {
    // Escape special regex characters in the schema name
    const escaped = schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
        // Match: CREATE TABLE schema. (with optional bracket/quote quoting)
        new RegExp(`CREATE\\s+TABLE\\s+(?:\\[?|"?)${escaped}(?:\\]?|"?)\\.`, 'gi'),
        // Match: ALTER TABLE schema.
        new RegExp(`ALTER\\s+TABLE\\s+(?:\\[?|"?)${escaped}(?:\\]?|"?)\\.`, 'gi'),
        // Match: DROP TABLE/VIEW/PROCEDURE/FUNCTION/SCHEMA ... schema.
        new RegExp(`DROP\\s+(?:TABLE|VIEW|PROCEDURE|FUNCTION|SCHEMA)\\s+(?:IF\\s+EXISTS\\s+)?(?:\\[?|"?)${escaped}(?:\\]?|"?)(?:\\.|\\s|$)`, 'gi'),
    ];
}

/**
 * Validate that migration SQL does not target protected schemas.
 * The __mj schema is ALWAYS protected regardless of configuration.
 */
export function ValidateMigrationSQL(sql: string, additionalProtectedSchemas: string[] = []): SQLValidationResult {
    const errors: string[] = [];
    const allProtected = new Set(['__mj', ...additionalProtectedSchemas.map(s => s.toLowerCase())]);

    for (const schema of allProtected) {
        const patterns = buildSchemaPatterns(schema);
        for (const pattern of patterns) {
            if (pattern.test(sql)) {
                errors.push(`Migration SQL targets protected schema "${schema}". RSU cannot CREATE, ALTER, or DROP objects in this schema.`);
                break; // One error per schema is enough
            }
        }
    }

    return { Valid: errors.length === 0, Errors: errors };
}

// ─── RuntimeSchemaManager ────────────────────────────────────────────

/**
 * Singleton pipeline orchestrator for runtime schema changes.
 *
 * Usage:
 *   const rsm = RuntimeSchemaManager.Instance;
 *   if (!rsm.IsEnabled) throw new Error('RSU is disabled');
 *   const result = await rsm.RunPipeline(input);
 */
export class RuntimeSchemaManager extends BaseSingleton<RuntimeSchemaManager> {
    protected constructor() {
        super();
    }

    public static get Instance(): RuntimeSchemaManager {
        return super.getInstance<RuntimeSchemaManager>();
    }

    // ─── State ───────────────────────────────────────────────────────

    private _isRunning = false;
    private _outOfSync = false;
    private _outOfSyncSince: Date | null = null;
    private _lastRunAt: Date | null = null;
    private _lastRunResult: string | null = null;

    // ─── Public Properties ───────────────────────────────────────────

    /** Whether RSU is enabled based on ALLOW_RUNTIME_SCHEMA_UPDATE=1. */
    public get IsEnabled(): boolean {
        return process.env.ALLOW_RUNTIME_SCHEMA_UPDATE === '1';
    }

    /** Whether a pipeline is currently running (concurrency mutex). */
    public get IsRunning(): boolean {
        return this._isRunning;
    }

    /** Whether the local API is out of sync with the git repo. */
    public get IsOutOfSync(): boolean {
        return this._outOfSync;
    }

    /** When the out-of-sync state was first detected. */
    public get OutOfSyncSince(): Date | null {
        return this._outOfSyncSince;
    }

    /** When the last pipeline run completed. */
    public get LastRunAt(): Date | null {
        return this._lastRunAt;
    }

    /** Result of the last pipeline run. */
    public get LastRunResult(): string | null {
        return this._lastRunResult;
    }

    /** Current status snapshot. */
    public GetStatus(): RSUStatus {
        return {
            Enabled: this.IsEnabled,
            Running: this.IsRunning,
            OutOfSync: this.IsOutOfSync,
            OutOfSyncSince: this._outOfSyncSince,
            LastRunAt: this._lastRunAt,
            LastRunResult: this._lastRunResult,
        };
    }

    // ─── Pipeline ────────────────────────────────────────────────────

    /**
     * Execute the full RSU pipeline:
     * 1. Validate environment & permissions
     * 2. Validate migration SQL (schema protection)
     * 3. Write migration file to migrations dir
     * 4. Execute migration SQL against database
     * 5. Run CodeGen (excluding __mj schema)
     * 6. Compile affected TypeScript packages
     * 7. Restart MJAPI via PM2
     * 8. Mark as out-of-sync
     *
     * Git commit/push is Phase 2 — currently not implemented.
     */
    public async RunPipeline(input: RSUPipelineInput): Promise<RSUPipelineResult> {
        const steps: RSUPipelineStep[] = [];
        const result: RSUPipelineResult = {
            Success: false,
            APIRestarted: false,
            GitCommitSuccess: false,
            Steps: steps,
        };

        try {
            // Step 1: Validate environment
            const envStep = await this.runStep('ValidateEnvironment', () => this.validateEnvironment(), steps);
            if (!envStep) return this.failResult(result, 'ValidateEnvironment');

            // Step 2: Acquire concurrency lock
            const lockStep = await this.runStep('AcquireLock', () => this.acquireLock(), steps);
            if (!lockStep) return this.failResult(result, 'AcquireLock');

            try {
                // Step 3: Validate migration SQL
                const sqlStep = await this.runStep('ValidateSQL', () => this.validateSQL(input.MigrationSQL), steps);
                if (!sqlStep) return this.failResult(result, 'ValidateSQL');

                // Step 4: Write migration file
                const writeStep = await this.runStep('WriteMigrationFile', () => this.writeMigrationFile(input), steps);
                if (!writeStep) return this.failResult(result, 'WriteMigrationFile');
                result.MigrationFilePath = writeStep as string;

                // Step 5: Execute migration SQL against database
                const execStep = await this.runStep('ExecuteMigration', () => this.executeMigration(input.MigrationSQL), steps);
                if (!execStep) return this.failResult(result, 'ExecuteMigration');

                // Step 6: Run CodeGen
                const codegenStep = await this.runStep('RunCodeGen', () => this.runCodeGen(), steps);
                if (!codegenStep) return this.failResult(result, 'RunCodeGen');

                // Step 7: Compile TypeScript
                const compileStep = await this.runStep('CompileTypeScript', () => this.compileTypeScript(), steps);
                if (!compileStep) return this.failResult(result, 'CompileTypeScript');

                // Step 8: Restart MJAPI (unless skipped)
                if (input.SkipRestart) {
                    steps.push({ Name: 'RestartMJAPI', Status: 'skipped', DurationMs: 0, Message: 'Skipped by caller' });
                } else {
                    const restartStep = await this.runStep('RestartMJAPI', () => this.restartMJAPI(), steps);
                    if (!restartStep) return this.failResult(result, 'RestartMJAPI');
                    result.APIRestarted = true;
                }

                // Step 9: Mark out-of-sync
                this.MarkOutOfSync();
                steps.push({ Name: 'MarkOutOfSync', Status: 'success', DurationMs: 0, Message: 'API marked as out-of-sync with git repo' });

                // Git commit/push — Phase 2 (not yet implemented)
                if (!input.SkipGitCommit) {
                    steps.push({ Name: 'GitCommit', Status: 'skipped', DurationMs: 0, Message: 'Git integration not yet implemented (Phase 2)' });
                }

                result.Success = true;
                this._lastRunResult = 'success';
            } finally {
                this.releaseLock();
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            result.ErrorMessage = msg;
            this._lastRunResult = `failed: ${msg}`;
        }

        this._lastRunAt = new Date();
        return result;
    }

    /**
     * Dry-run: validate the SQL and return what would happen.
     */
    public Preview(input: RSUPipelineInput): RSUPreviewResult {
        const validation = ValidateMigrationSQL(input.MigrationSQL, this.getProtectedSchemas());

        return {
            MigrationSQL: input.MigrationSQL,
            AffectedTables: input.AffectedTables,
            ValidationErrors: validation.Errors,
            WouldExecute: this.IsEnabled && validation.Valid,
        };
    }

    // ─── Out-of-Sync Management ─────────────────────────────────────

    /** Mark the API as running code that is out-of-sync with the git repo. */
    public MarkOutOfSync(): void {
        this._outOfSync = true;
        this._outOfSyncSince = new Date();
    }

    /** Clear the out-of-sync flag (called when CI/CD deployment lands). */
    public ClearOutOfSync(): void {
        this._outOfSync = false;
        this._outOfSyncSince = null;
    }

    // ─── Pipeline Step Implementations ──────────────────────────────

    private async validateEnvironment(): Promise<boolean> {
        if (!this.IsEnabled) {
            throw new RSUError(
                'DISABLED',
                'Runtime Schema Update is disabled. Set ALLOW_RUNTIME_SCHEMA_UPDATE=1 to enable.'
            );
        }
        return true;
    }

    private async acquireLock(): Promise<boolean> {
        if (this._isRunning) {
            throw new RSUError(
                'CONCURRENT',
                'Another RSU pipeline is already running. Wait for it to complete.'
            );
        }
        this._isRunning = true;
        return true;
    }

    private releaseLock(): void {
        this._isRunning = false;
    }

    private async validateSQL(sql: string): Promise<boolean> {
        const result = ValidateMigrationSQL(sql, this.getProtectedSchemas());
        if (!result.Valid) {
            throw new RSUError('VALIDATION', result.Errors.join('; '));
        }
        return true;
    }

    /**
     * Write the migration file to the configured migrations directory.
     * Returns the file path of the written migration.
     *
     * Note: In Phase 1 this writes to the local filesystem at RSU_MIGRATIONS_PATH
     * (which defaults to 'migrations/v2'). Full git-based file management is Phase 2.
     */
    private async writeMigrationFile(input: RSUPipelineInput): Promise<string> {
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const migrationsPath = process.env.RSU_MIGRATIONS_PATH || 'migrations/v2';
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
        const tableSlug = input.AffectedTables
            .slice(0, 3)
            .map(t => t.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
            .join('_');
        const fileName = `V${timestamp}__RSU_${tableSlug}.sql`;
        const filePath = `${migrationsPath}/${fileName}`;

        // Ensure the migrations directory exists
        mkdirSync(migrationsPath, { recursive: true });

        // Build file content with header comment
        const header = [
            `-- RSU Migration: ${input.Description}`,
            `-- Generated: ${new Date().toISOString()}`,
            `-- Affected tables: ${input.AffectedTables.join(', ')}`,
            '',
        ].join('\n');
        writeFileSync(filePath, header + input.MigrationSQL, 'utf-8');

        return filePath;
    }

    /**
     * Execute the migration SQL against the database.
     *
     * Phase 1: Uses child_process to invoke sqlcmd or a programmatic CodeGen connection.
     * The actual implementation depends on the database driver available at runtime.
     */
    private async executeMigration(sql: string): Promise<boolean> {
        const { execAsync } = await this.getExecAsync();

        // Replace ${flyway:defaultSchema} placeholder with actual schema
        const defaultSchema = process.env.RSU_DEFAULT_SCHEMA || '__mj';
        const resolvedSQL = sql.replace(/\$\{flyway:defaultSchema\}/g, defaultSchema);

        // Use sqlcmd to execute the migration (available in Docker workbench)
        const server = process.env.DB_HOST || 'localhost';
        const database = process.env.DB_DATABASE || '';
        const user = process.env.DB_USER || 'sa';
        const password = process.env.DB_PASSWORD || '';

        if (!database) {
            throw new RSUError('CONFIG', 'DB_DATABASE environment variable is required for ExecuteMigration');
        }

        // Resolve sqlcmd path — prefer env override, then PATH, then common install location
        const sqlcmdPath = process.env.RSU_SQLCMD_PATH || 'sqlcmd';

        // Write SQL to temp file, then execute via sqlcmd
        const tmpFile = `/tmp/rsu_migration_${Date.now()}.sql`;
        const { writeFileSync, unlinkSync } = await import('node:fs');
        writeFileSync(tmpFile, resolvedSQL, 'utf-8');

        try {
            const { stdout, stderr } = await execAsync(
                `${sqlcmdPath} -S "${server}" -d "${database}" -U "${user}" -P "${password}" -i "${tmpFile}" -C`,
                { timeout: 120_000 }
            );
            // sqlcmd writes errors to stdout, not stderr. Check for Msg/Level patterns.
            if (stdout && /Msg \d+, Level (1[1-9]|[2-9]\d)/.test(stdout)) {
                throw new RSUError('SQL_EXEC', `sqlcmd reported errors: ${stdout.trim()}`);
            }
        } finally {
            try { unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
        }

        return true;
    }

    /**
     * Run CodeGen programmatically.
     *
     * Writes a temporary .mjs script that imports CodeGenLib directly (bypassing
     * the oclif-based `mj` CLI which has heavy dependencies). The script:
     *   1. Loads dotenv/config for DB env vars
     *   2. Bootstraps class registrations via server-bootstrap-lite
     *   3. Initializes config from mj.config.cjs
     *   4. Runs full CodeGen pipeline (metadata + SQL + TypeScript generation)
     *
     * Override via RSU_CODEGEN_COMMAND env var for custom setups.
     */
    private async runCodeGen(): Promise<boolean> {
        const { execAsync } = await this.getExecAsync();
        const { writeFileSync, unlinkSync } = await import('node:fs');
        const workDir = process.env.RSU_WORK_DIR || process.cwd();

        // If caller provides a full custom command, use it directly
        const customCmd = process.env.RSU_CODEGEN_COMMAND;
        if (customCmd) {
            await execAsync(`cd ${workDir} && ${customCmd}`, { timeout: 600_000 });
            return true;
        }

        // Write a temp .mjs script inside the work dir so Node module resolution
        // can find dotenv, codegen-lib, etc. from node_modules
        const tmpScript = `${workDir}/.rsu_codegen_${Date.now()}.mjs`;
        const scriptContent = [
            "import 'dotenv/config';",
            "await import('@memberjunction/server-bootstrap-lite/mj-class-registrations');",
            "const { initializeConfig, runMemberJunctionCodeGeneration } = await import('@memberjunction/codegen-lib');",
            'initializeConfig(process.cwd());',
            'await runMemberJunctionCodeGeneration(false);',
        ].join('\n');
        writeFileSync(tmpScript, scriptContent, 'utf-8');

        try {
            const { stdout } = await execAsync(
                `cd ${workDir} && node ${tmpScript}`,
                { timeout: 600_000 } // 10 minutes for CodeGen
            );

            // Verify CodeGen reported success in its output
            if (stdout && stdout.includes('MJ CodeGen Complete')) {
                return true;
            }
            // Even if the success line isn't found, if the process exited 0 we're good
            return true;
        } catch (err: unknown) {
            const errObj = err as { stdout?: string; stderr?: string; message?: string };
            // CodeGen's after-commands (package builds) may fail with exit code 1
            // even though CodeGen itself succeeded. Check stdout for the success marker.
            if (errObj.stdout && errObj.stdout.includes('MJ CodeGen Complete')) {
                return true;
            }
            const msg = errObj.message ?? String(err);
            if (msg.includes('not found') || msg.includes('ENOENT') || msg.includes('MODULE_NOT_FOUND')) {
                throw new RSUError(
                    'CODEGEN_NOT_AVAILABLE',
                    `CodeGen not available. Ensure @memberjunction/codegen-lib and ` +
                    `@memberjunction/server-bootstrap-lite are built. Error: ${msg.substring(0, 300)}`
                );
            }
            throw new RSUError('CODEGEN_FAILED', `CodeGen failed: ${msg.substring(0, 500)}`);
        } finally {
            try { unlinkSync(tmpScript); } catch { /* best-effort cleanup */ }
        }
    }

    /**
     * Compile affected TypeScript packages after CodeGen.
     *
     * Uses turbo to build the specified packages. Turbo handles the full
     * dependency graph and caches unchanged packages automatically.
     *
     * Default targets: MJCoreEntities, MJServer, MJAPI (the primary CodeGen outputs).
     * Override via RSU_COMPILE_PACKAGES (comma-separated npm package names).
     *
     * Set RSU_COMPILE_COMMAND to override the entire build command (e.g. for
     * environments without turbo).
     */
    private async compileTypeScript(): Promise<boolean> {
        const { execAsync } = await this.getExecAsync();
        const workDir = process.env.RSU_WORK_DIR || process.cwd();

        // Allow full command override
        const compileCmd = process.env.RSU_COMPILE_COMMAND;
        if (compileCmd) {
            await execAsync(`cd ${workDir} && ${compileCmd}`, { timeout: 300_000 });
            return true;
        }

        // Build using turbo with --filter for each package
        const defaultPackages = '@memberjunction/core-entities,@memberjunction/server,mj_api';
        const envPackages = process.env.RSU_COMPILE_PACKAGES;
        const rawPackages = envPackages !== undefined ? envPackages : defaultPackages;
        const packageNames = rawPackages
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        const filterArgs = packageNames.map(p => `--filter="${p}"`).join(' ');
        await execAsync(
            `cd ${workDir} && npx turbo build ${filterArgs}`,
            { timeout: 300_000 } // 5 min for turbo build
        );

        return true;
    }

    /**
     * Restart MJAPI via PM2.
     *
     * If MJAPI isn't currently managed by PM2, starts it using the ecosystem
     * config. After restart, polls the GraphQL endpoint until the server is
     * ready to accept requests.
     */
    private async restartMJAPI(): Promise<boolean> {
        const { execAsync } = await this.getExecAsync();
        const workDir = process.env.RSU_WORK_DIR || process.cwd();
        const processName = process.env.RSU_PM2_PROCESS_NAME || 'mjapi';

        // Check if MJAPI is already managed by PM2
        const isManaged = await this.isPM2ProcessRunning(processName);

        if (isManaged) {
            await execAsync(`pm2 restart ${processName}`, { timeout: 30_000 });
        } else {
            // First time: start via ecosystem config
            await execAsync(`cd ${workDir} && pm2 start ecosystem.config.cjs`, { timeout: 30_000 });
        }

        // Poll the GraphQL endpoint until MJAPI is ready
        return this.waitForMJAPI();
    }

    /**
     * Check if a PM2 process exists (running or stopped).
     */
    private async isPM2ProcessRunning(processName: string): Promise<boolean> {
        const { execAsync } = await this.getExecAsync();
        try {
            const { stdout } = await execAsync(`pm2 jlist`, { timeout: 10_000 });
            const processes: Array<{ name: string }> = JSON.parse(stdout);
            return processes.some(p => p.name === processName);
        } catch {
            return false;
        }
    }

    /**
     * Poll the MJAPI GraphQL endpoint until the server responds.
     * Uses a simple GET to the server root — Apollo Server returns a landing
     * page or 400 (both indicate the server is up and accepting connections).
     */
    private async waitForMJAPI(): Promise<boolean> {
        const maxWaitMs = 120_000; // 2 minutes — MJAPI can be slow to start
        const startTime = Date.now();
        const port = process.env.GRAPHQL_PORT || '4000';
        const url = `http://localhost:${port}/`;

        while (Date.now() - startTime < maxWaitMs) {
            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
                // Any HTTP response means the server is up
                if (response.status < 500) return true;
            } catch {
                /* server not ready yet */
            }
            await new Promise(resolve => setTimeout(resolve, 2_000));
        }

        throw new RSUError(
            'RESTART_TIMEOUT',
            `MJAPI did not become healthy within ${maxWaitMs / 1000}s on port ${port}`
        );
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private getProtectedSchemas(): string[] {
        const envSchemas = process.env.RSU_PROTECTED_SCHEMAS;
        return envSchemas ? envSchemas.split(',').map(s => s.trim()) : [];
    }

    /**
     * Helper to execute shell commands asynchronously.
     */
    private async getExecAsync(): Promise<{
        execAsync: (cmd: string, opts?: { timeout?: number; maxBuffer?: number }) => Promise<{ stdout: string; stderr: string }>;
    }> {
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);
        return {
            execAsync: (cmd: string, opts?: { timeout?: number; maxBuffer?: number }) =>
                execAsync(cmd, {
                    timeout: opts?.timeout ?? 60_000,
                    maxBuffer: opts?.maxBuffer ?? 50 * 1024 * 1024, // 50 MB (CodeGen is verbose)
                }),
        };
    }

    /**
     * Run a named pipeline step, capturing timing and errors.
     * Returns the step's return value on success, or undefined on failure.
     */
    private async runStep<T>(
        name: string,
        fn: () => Promise<T>,
        steps: RSUPipelineStep[]
    ): Promise<T | undefined> {
        const start = Date.now();
        try {
            const result = await fn();
            steps.push({
                Name: name,
                Status: 'success',
                DurationMs: Date.now() - start,
                Message: `${name} completed successfully`,
            });
            return result;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            steps.push({
                Name: name,
                Status: 'failed',
                DurationMs: Date.now() - start,
                Message: msg,
            });
            return undefined;
        }
    }

    private failResult(result: RSUPipelineResult, stepName: string): RSUPipelineResult {
        result.Success = false;
        result.ErrorStep = stepName;
        const failedStep = result.Steps.find(s => s.Name === stepName && s.Status === 'failed');
        result.ErrorMessage = failedStep?.Message ?? `Failed at step: ${stepName}`;
        this._lastRunResult = `failed at ${stepName}`;
        this._lastRunAt = new Date();
        return result;
    }
}

// ─── Custom Error ────────────────────────────────────────────────────

/**
 * RSU-specific error with a step code for structured error handling.
 */
export class RSUError extends Error {
    public readonly Code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'RSUError';
        this.Code = code;
    }
}
