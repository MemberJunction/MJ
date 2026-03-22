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
import { LogError, Metadata, type DatabaseProviderBase } from '@memberjunction/core';
import { Octokit } from '@octokit/rest';
import { RSUMetrics } from './RSUMetrics.js';
import { GetDialect } from './DDLGenerator.js';
import type { DatabasePlatform } from './interfaces.js';
import * as nodePath from 'node:path';
import { appendFileSync } from 'node:fs';
import * as childProcess from 'node:child_process';

/** Signal string used to detect lock-held condition in database messages. */
const RSU_LOCK_HELD_SIGNAL = 'RSU_LOCK_HELD';

// ─── Typed RSU Configuration ─────────────────────────────────────────

/** Centralized, typed access to all RSU environment variables with defaults. */
class RSUConfig {
    get MigrationsPath(): string { return process.env.RSU_MIGRATIONS_PATH || 'migrations/v5'; }
    get AdditionalSchemaInfoPath(): string { return process.env.RSU_ADDITIONAL_SCHEMA_INFO_PATH || 'additionalSchemaInfo.json'; }
    get DefaultSchema(): string { return process.env.RSU_DEFAULT_SCHEMA || '__mj'; }
    get WorkDir(): string { return process.env.RSU_WORK_DIR || process.cwd(); }
    /** Directory where CodeGen runs (needs node_modules). Defaults to WorkDir. */
    get CodeGenDir(): string { return process.env.RSU_CODEGEN_DIR || this.WorkDir; }
    get CodeGenTimeoutMs(): number { return parseInt(process.env.RSU_CODEGEN_TIMEOUT_MS || '600000', 10); }
    get CodeGenCommand(): string | undefined { return process.env.RSU_CODEGEN_COMMAND; }
    get CompileTimeoutMs(): number { return parseInt(process.env.RSU_COMPILE_TIMEOUT_MS || '300000', 10); }
    get CompileCommand(): string | undefined { return process.env.RSU_COMPILE_COMMAND; }
    get CompilePackages(): string | undefined { return process.env.RSU_COMPILE_PACKAGES; }
    get PM2ProcessName(): string { return process.env.RSU_PM2_PROCESS_NAME || 'mjapi'; }
    get GitTargetBranch(): string { return process.env.RSU_GIT_TARGET_BRANCH || 'next'; }
    get GitRemote(): string { return process.env.RSU_GIT_REMOTE || 'origin'; }
    get GitUserName(): string | undefined { return process.env.RSU_GIT_USER_NAME; }
    get GitUserEmail(): string | undefined { return process.env.RSU_GIT_USER_EMAIL; }
    /** GitHub repo in "owner/repo" format for Octokit-only mode (no local .git). */
    get GitHubRepo(): string | undefined { return process.env.RSU_GITHUB_REPO; }
    get IsDBLockEnabled(): boolean { return process.env.RSU_DB_LOCK_ENABLED === '1'; }
    get IsAuditLogEnabled(): boolean { return process.env.RSU_AUDIT_LOG_ENABLED !== '0'; }
    get ProtectedSchemas(): string[] {
        const envSchemas = process.env.RSU_PROTECTED_SCHEMAS;
        return envSchemas ? envSchemas.split(',').map(s => s.trim()) : [];
    }
}

const rsuConfig = new RSUConfig();

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

    /**
     * Optional files to write to disk before restart. RSU does not read or
     * interpret these — it simply persists them so they survive the process
     * restart. The caller is responsible for reading them on the other side.
     */
    PostRestartFiles?: Array<{ Path: string; Content: string }>;
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
 * Batch result wrapping per-item results with summary counts.
 */
export interface RSUPipelineBatchResult {
    /** Per-item results in the same order as the inputs. */
    Results: RSUPipelineResult[];
    /** Number of migrations that succeeded. */
    SuccessCount: number;
    /** Number of migrations that failed. */
    FailureCount: number;
    /** Total number of inputs in the batch. */
    TotalCount: number;
}

/** Per-item result from the migration execution phase. */
interface MigrationItemResult {
    Input: RSUPipelineInput;
    FilePath?: string;
    Success: boolean;
    Error?: string;
    Steps: RSUPipelineStep[];
}

/** Aggregate result from the post-migration pipeline (CodeGen, compile, restart, git). */
interface PostMigrationResult {
    ApiRestarted: boolean;
    GitCommitSuccess: boolean;
    BranchName?: string;
}

/**
 * @deprecated Use RSUPipelineInput.PostRestartFiles instead. This type is
 * retained temporarily for backward compatibility with existing callers.
 */
export interface RSUPendingWork {
    CompanyIntegrationID: string;
    SourceObjectNames: string[];
    SchemaName: string;
    CreatedAt: string;
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

/**
 * Interface for in-process CodeGen execution.
 * Injected by the server at startup so SchemaEngine doesn't depend on CodeGenLib directly.
 */
export interface IRSUCodeGenRunner {
    /** Run CodeGen in-process. Returns true on success. */
    RunInProcess(skipDatabaseGeneration?: boolean): Promise<boolean>;
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
    private _ddlProvider: DatabaseProviderBase | null = null;
    private _codeGenRunner: IRSUCodeGenRunner | null = null;
    private _codeGenOutputPaths: string[] = [];
    private _outOfSync = false;
    private _outOfSyncSince: Date | null = null;
    private _lastRunAt: Date | null = null;
    private _lastRunResult: string | null = null;

    // ─── Public Properties ───────────────────────────────────────────

    /**
     * Set a dedicated provider for DDL operations (CREATE TABLE, CREATE SCHEMA, etc.).
     * Should be configured with elevated credentials (e.g. MJ_CodeGen with db_owner).
     * If not set, falls back to the default Metadata.Provider.
     */
    public SetDDLProvider(provider: DatabaseProviderBase): void {
        this._ddlProvider = provider;
    }

    /**
     * Set the in-process CodeGen runner.
     * Injected by the server at startup so RSU can run CodeGen without shelling out.
     */
    public SetCodeGenRunner(runner: IRSUCodeGenRunner): void {
        this._codeGenRunner = runner;
    }

    /**
     * Set the CodeGen output directory paths (from mj.config.cjs output[].directory).
     * Used by the git step to stage only CodeGen-produced source files.
     */
    public SetCodeGenOutputPaths(paths: string[]): void {
        this._codeGenOutputPaths = paths;
    }

    // ─── Pending Work (post-restart tasks) ─────────────────────────

    /** Write pending work to disk so it can be processed after restart. */
    public async WritePendingWork(data: RSUPendingWork): Promise<string> {
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const { join } = await import('node:path');
        const dir = join(rsuConfig.WorkDir, '.rsu_pending');
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, `${Date.now()}.json`);
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        this.rsuLog(`Wrote pending work to ${filePath}`);
        return filePath;
    }

    /** Read all pending work files, return them, and delete them. */
    public async ReadAndClearPendingWork(): Promise<RSUPendingWork[]> {
        const { readdirSync, readFileSync, unlinkSync, existsSync } = await import('node:fs');
        const { join } = await import('node:path');
        const dir = join(rsuConfig.WorkDir, '.rsu_pending');
        if (!existsSync(dir)) return [];
        const files = readdirSync(dir).filter(f => f.endsWith('.json'));
        const results: RSUPendingWork[] = [];
        for (const file of files) {
            const filePath = join(dir, file);
            try {
                const data = JSON.parse(readFileSync(filePath, 'utf-8')) as RSUPendingWork;
                results.push(data);
                unlinkSync(filePath);
            } catch { /* skip corrupt files */ }
        }
        if (results.length > 0) {
            this.rsuLog(`Found ${results.length} pending work item(s)`);
        }
        return results;
    }

    // ─── Generic Post-Restart File Injection ──────────────────────

    /**
     * Write PostRestartFiles from all pipeline inputs to disk.
     * RSU does not interpret these — callers provide arbitrary files
     * that need to survive the process restart.
     */
    private async writePostRestartFiles(inputs: RSUPipelineInput[]): Promise<void> {
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const { dirname } = await import('node:path');

        let count = 0;
        for (const input of inputs) {
            for (const file of input.PostRestartFiles ?? []) {
                mkdirSync(dirname(file.Path), { recursive: true });
                writeFileSync(file.Path, file.Content, 'utf-8');
                count++;
            }
        }
        if (count > 0) {
            this.rsuLog(`Wrote ${count} post-restart file(s) to disk`);
        }
    }

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
     * Execute the RSU pipeline for a single input. Convenience wrapper
     * around RunPipelineBatch — a batch of 1.
     */
    public async RunPipeline(input: RSUPipelineInput): Promise<RSUPipelineResult> {
        const batchResult = await this.RunPipelineBatch([input]);
        return batchResult.Results[0];
    }

    /**
     * Execute the RSU pipeline for a batch of inputs.
     *
     * Correctness guarantee: migrations and CodeGen never overlap.
     * All migrations execute under one lock, then CodeGen runs once
     * against the fully-committed schema.
     *
     * Flow:
     *   1. Validate all inputs (fail fast — reject entire batch on validation error)
     *   2. Lock
     *   3. For each input: write migration file → execute SQL (independent success/failure)
     *   4. Unlock
     *   5. ONE CodeGen run (covers all successful migrations)
     *   6. ONE compile
     *   7. ONE restart
     *   8. ONE git commit (all migration files)
     *   9. Resolve each caller with per-item migration result + shared post-migration result
     */
    public async RunPipelineBatch(inputs: RSUPipelineInput[]): Promise<RSUPipelineBatchResult> {
        if (inputs.length === 0) return { Results: [], SuccessCount: 0, FailureCount: 0, TotalCount: 0 };

        this.rsuLog(`═══════════════════════════════════════════════════`);
        this.rsuLog(`Pipeline batch started — ${inputs.length} input(s)`);
        for (const input of inputs) {
            this.rsuLog(`  • ${input.Description} [tables: ${input.AffectedTables.join(', ')}]`);
        }

        const sharedSteps: RSUPipelineStep[] = [];

        // Phase 1: Validate
        const validationFailure = await this.validateBatch(inputs, sharedSteps);
        if (validationFailure) return validationFailure;

        // Phase 2: Execute migrations under lock
        const itemResults = await this.executeMigrations(inputs, sharedSteps);

        // Phase 3: Post-migration pipeline (CodeGen, compile, restart, git)
        const successfulItems = itemResults.filter(r => r.Success);
        const postResult = await this.runPostMigrationPipeline(inputs, successfulItems, sharedSteps);

        // Phase 4: Build per-caller results
        return this.buildPerCallerResults(itemResults, successfulItems, sharedSteps, postResult);
    }

    /** Phase 1: Validate environment and all migration SQL. Returns a batch failure result if validation fails, null on success. */
    private async validateBatch(inputs: RSUPipelineInput[], sharedSteps: RSUPipelineStep[]): Promise<RSUPipelineBatchResult | null> {
        const envStep = await this.runStep('ValidateEnvironment', () => this.validateEnvironment(), sharedSteps);
        if (!envStep) {
            return this.buildBatchResult(inputs.map(input => this.buildFailedResult(input, 'ValidateEnvironment', sharedSteps)));
        }

        for (const input of inputs) {
            const validation = ValidateMigrationSQL(input.MigrationSQL, this.getProtectedSchemas());
            if (!validation.Valid) {
                sharedSteps.push({ Name: 'ValidateSQL', Status: 'failed', DurationMs: 0, Message: validation.Errors.join('; ') });
                return this.buildBatchResult(inputs.map(i => this.buildFailedResult(i, 'ValidateSQL', sharedSteps)));
            }
        }
        sharedSteps.push({ Name: 'ValidateSQL', Status: 'success', DurationMs: 0, Message: `Validated ${inputs.length} migration(s)` });
        return null;
    }

    /** Phase 2: Acquire lock, write and execute each migration, release lock. */
    private async executeMigrations(inputs: RSUPipelineInput[], sharedSteps: RSUPipelineStep[]): Promise<MigrationItemResult[]> {
        const lockStep = await this.runStep('AcquireLock', () => this.acquireLock(), sharedSteps);
        if (!lockStep) {
            return inputs.map(input => ({ Input: input, Success: false, Error: 'Failed to acquire lock', Steps: [] }));
        }

        const itemResults: MigrationItemResult[] = [];
        try {
            for (let i = 0; i < inputs.length; i++) {
                const input = inputs[i];
                this.rsuLog(`── Migration ${i + 1}/${inputs.length}: ${input.Description} [${input.AffectedTables.join(', ')}]`);
                const itemSteps: RSUPipelineStep[] = [];

                const writeStep = await this.runStep('WriteMigrationFile', () => this.writeMigrationFile(input), itemSteps);
                if (!writeStep) {
                    itemResults.push({ Input: input, Success: false, Error: itemSteps.find(s => s.Status === 'failed')?.Message, Steps: itemSteps });
                    continue;
                }
                const filePath = writeStep as string;

                const execStep = await this.runStep('ExecuteMigration', () => this.executeMigration(input.MigrationSQL), itemSteps);
                if (!execStep) {
                    itemResults.push({ Input: input, FilePath: filePath, Success: false, Error: itemSteps.find(s => s.Status === 'failed')?.Message, Steps: itemSteps });
                    continue;
                }

                itemResults.push({ Input: input, FilePath: filePath, Success: true, Steps: itemSteps });
            }

            if (itemResults.some(r => r.Success)) {
                this.MarkOutOfSync();
                sharedSteps.push({ Name: 'MarkOutOfSync', Status: 'success', DurationMs: 0, Message: 'DB changed, API out-of-sync until CodeGen completes' });
            }
        } finally {
            await this.releaseLock();
        }

        return itemResults;
    }

    /** Phase 3: CodeGen, compile, restart, and git commit for successful migrations. */
    private async runPostMigrationPipeline(
        inputs: RSUPipelineInput[],
        successfulItems: MigrationItemResult[],
        sharedSteps: RSUPipelineStep[]
    ): Promise<PostMigrationResult> {
        const result: PostMigrationResult = { ApiRestarted: false, GitCommitSuccess: false };

        if (successfulItems.length === 0) return result;

        await this.runStep('WriteAdditionalSchemaInfo', () => this.writeAdditionalSchemaInfo(successfulItems.map(r => r.Input)), sharedSteps);

        const codegenOk = await this.runStep('RunCodeGen', () => this.runCodeGen(), sharedSteps);
        if (codegenOk) {
            const compileOk = await this.runStep('CompileTypeScript', () => this.compileTypeScript(), sharedSteps);
            if (compileOk) {
                this.ClearOutOfSync();
            }
        }

        // Git commit + PR before restart — PM2 restart kills this process
        if (!inputs.every(i => i.SkipGitCommit)) {
            const allTables = [...new Set(successfulItems.flatMap(r => r.Input.AffectedTables))];
            const allFiles = successfulItems.map(r => r.FilePath).filter((p): p is string => !!p);
            const description = successfulItems.length === 1
                ? successfulItems[0].Input.Description
                : `Batch of ${successfulItems.length} schema changes`;

            const gitStep = await this.runStep('GitCommitAndPR', () => this.gitCommitAndPRForCycle(allFiles, allTables, description), sharedSteps);
            if (gitStep) {
                result.GitCommitSuccess = true;
                result.BranchName = gitStep as string;
            }
        }

        // Write caller-provided PostRestartFiles to disk before restart.
        // RSU does not interpret these — it just persists them so they survive the restart.
        await this.writePostRestartFiles(inputs);

        // Restart LAST — PM2 restart kills this process, nothing runs after this
        if (!inputs.every(i => i.SkipRestart)) {
            const restartOk = await this.runStep('RestartMJAPI', () => this.restartMJAPI(), sharedSteps);
            if (restartOk) result.ApiRestarted = true;
        }

        return result;
    }

    /** Phase 4: Assemble per-caller RSUPipelineResult entries with audit and metrics. */
    private buildPerCallerResults(
        itemResults: MigrationItemResult[],
        successfulItems: MigrationItemResult[],
        sharedSteps: RSUPipelineStep[],
        postResult: PostMigrationResult
    ): RSUPipelineBatchResult {
        this._lastRunAt = new Date();
        this._lastRunResult = successfulItems.length > 0 ? 'success' : 'failed';

        const results: RSUPipelineResult[] = itemResults.map(item => {
            const allSteps = [...sharedSteps, ...item.Steps];
            const result: RSUPipelineResult = {
                Success: item.Success && (successfulItems.length > 0),
                MigrationFilePath: item.FilePath,
                APIRestarted: postResult.ApiRestarted,
                GitCommitSuccess: postResult.GitCommitSuccess,
                BranchName: postResult.BranchName,
                Steps: allSteps,
                ErrorMessage: item.Error,
                ErrorStep: item.Error ? item.Steps.find(s => s.Status === 'failed')?.Name : undefined,
            };

            this.writeAuditLog(item.Input, result).catch(err => LogError(`[RSU] Audit log failed: ${err instanceof Error ? err.message : String(err)}`));
            this.recordMetrics(item, allSteps, result);

            return result;
        });

        return this.buildBatchResult(results);
    }

    /** Record metrics for a single pipeline item (best-effort, errors are logged). */
    private recordMetrics(item: MigrationItemResult, allSteps: RSUPipelineStep[], result: RSUPipelineResult): void {
        try {
            const stepDurations: Record<string, number> = {};
            for (const step of allSteps) stepDurations[step.Name] = step.DurationMs;
            RSUMetrics.Instance.RecordRun({
                Timestamp: new Date(),
                DurationMs: allSteps.reduce((sum, s) => sum + s.DurationMs, 0),
                Success: result.Success,
                StepDurations: stepDurations,
                ErrorStep: result.ErrorStep,
                Description: item.Input.Description,
                AffectedTables: item.Input.AffectedTables,
                RetryCount: 0,
            });
        } catch (err) { LogError(`[RSU] Metrics recording failed: ${err instanceof Error ? err.message : String(err)}`); }
    }

    /**
     * Run the RSU pipeline with automatic retry for transient failures.
     * Only retries steps that are known to be transient (SQL execution, CodeGen, compilation, restart).
     * Validation and git steps are not retried.
     *
     * @param input Pipeline input
     * @param maxRetries Maximum number of retries (default: 2, so 3 total attempts)
     * @param baseDelayMs Base delay for exponential backoff (default: 5000ms)
     */
    public async RunPipelineWithRetry(
        input: RSUPipelineInput,
        maxRetries: number = 2,
        baseDelayMs: number = 5000
    ): Promise<RSUPipelineResult> {
        const RETRYABLE_STEPS = new Set(['ExecuteMigration', 'RunCodeGen', 'CompileTypeScript', 'RestartMJAPI']);

        let lastResult: RSUPipelineResult | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const result = await this.RunPipeline(input);

            if (result.Success) {
                if (attempt > 0) {
                    console.log(`[RSU] Pipeline succeeded on retry attempt ${attempt}`);
                }
                return result;
            }

            lastResult = result;

            // Check if the failed step is retryable
            const failedStep = result.ErrorStep;
            if (!failedStep || !RETRYABLE_STEPS.has(failedStep)) {
                console.log(`[RSU] Step '${failedStep}' is not retryable — aborting`);
                return result;
            }

            if (attempt >= maxRetries) {
                console.log(`[RSU] Max retries (${maxRetries}) exhausted — aborting`);
                return result;
            }

            const delayMs = baseDelayMs * Math.pow(2, attempt);
            console.log(`[RSU] Step '${failedStep}' failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        return lastResult!;
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

    /** Waiters queued behind the current lock holder. */
    private _lockWaiters: Array<() => void> = [];

    /**
     * Acquire the migration lock. If another migration is in progress,
     * the caller awaits (event-driven, no polling) until the lock is free.
     * This ensures concurrent RunPipeline calls serialize safely instead
     * of throwing CONCURRENT errors.
     */
    private async acquireLock(): Promise<boolean> {
        // If lock is held, wait in line (event-driven via promise)
        if (this._isRunning) {
            await new Promise<void>(resolve => {
                this._lockWaiters.push(resolve);
            });
        }

        this._isRunning = true;

        // DB-backed lock for multi-instance safety (if enabled)
        if (this.IsDBLockEnabled) {
            const acquired = await this.acquireDBLock();
            if (!acquired) {
                // Another MJAPI instance holds the lock — release in-memory and reject
                this._isRunning = false;
                this.notifyNextWaiter();
                throw new RSUError(
                    'CONCURRENT',
                    'Another RSU pipeline is running on a different instance. Wait for it to complete.'
                );
            }
        }

        return true;
    }

    /** Wake the next waiter in line (if any). */
    private notifyNextWaiter(): void {
        const next = this._lockWaiters.shift();
        if (next) next();
    }

    private async releaseLock(): Promise<void> {
        // Release DB lock if enabled
        if (this.IsDBLockEnabled) {
            await this.releaseDBLock();
        }

        this._isRunning = false;

        // Wake the next waiter in line
        this.notifyNextWaiter();
    }

    /**
     * Write the migration file to the configured migrations directory.
     * Returns the file path of the written migration.
     *
     * Writes the migration file to the configured migrations directory (RSU_MIGRATIONS_PATH,
     * defaults to 'migrations/v5'). The git commit step then picks up the file.
     */
    private async writeMigrationFile(input: RSUPipelineInput): Promise<string> {
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const { join } = await import('node:path');
        const migrationsPath = join(rsuConfig.WorkDir, rsuConfig.MigrationsPath);
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
     * Write/merge AdditionalSchemaInfo (soft PK/FK config) to disk so CodeGen can find it.
     * Path comes from RSU_ADDITIONAL_SCHEMA_INFO_PATH config, resolved relative to WorkDir.
     */
    private async writeAdditionalSchemaInfo(inputs: RSUPipelineInput[]): Promise<boolean> {
        const contents = inputs
            .map(i => i.AdditionalSchemaInfo)
            .filter((c): c is string => !!c);

        if (contents.length === 0) return true;

        const { readFileSync, writeFileSync, existsSync, mkdirSync } = await import('node:fs');
        const { join, dirname } = await import('node:path');
        const configFilePath = join(rsuConfig.WorkDir, rsuConfig.AdditionalSchemaInfoPath);

        // Load existing config or start fresh
        // Format: { schemaName: [ { TableName, PrimaryKey?, ForeignKeys? }, ... ], ... }
        let existing: Record<string, Array<{ TableName: string }>> = {};
        if (existsSync(configFilePath)) {
            try { existing = JSON.parse(readFileSync(configFilePath, 'utf-8')); } catch { /* start fresh */ }
        }

        // Merge each incoming config (keyed by schema name) into existing
        for (const content of contents) {
            try {
                const incoming: Record<string, Array<{ TableName: string }>> = JSON.parse(content);
                for (const [schemaName, tables] of Object.entries(incoming)) {
                    if (!Array.isArray(tables)) continue;
                    if (!existing[schemaName]) existing[schemaName] = [];
                    for (const table of tables) {
                        const idx = existing[schemaName].findIndex(
                            t => t.TableName.toLowerCase() === table.TableName.toLowerCase()
                        );
                        if (idx >= 0) existing[schemaName][idx] = table;
                        else existing[schemaName].push(table);
                    }
                }
            } catch { /* skip unparseable */ }
        }

        mkdirSync(dirname(configFilePath), { recursive: true });
        writeFileSync(configFilePath, JSON.stringify(existing, null, 2), 'utf-8');
        this.rsuLog(`Wrote additionalSchemaInfo to ${configFilePath}`);
        return true;
    }

    /**
     * Execute the migration SQL against the database.
     * Delegates CLI tool selection to the DBExecProvider abstraction.
     */
    private async executeMigration(sql: string): Promise<boolean> {
        const defaultSchema = rsuConfig.DefaultSchema;
        const resolvedSQL = sql.replace(/\$\{flyway:defaultSchema\}/g, defaultSchema);

        // Split on GO batch separators (SQL Server SSMS convention, not valid T-SQL)
        const batches = resolvedSQL
            .split(/^\s*GO\s*$/gim)
            .map(b => b.trim())
            .filter(b => b.length > 0);

        try {
            for (const batch of batches) {
                this.rsuLog(`  Executing batch (${batch.length} chars)`);
                await this.getDBProvider().ExecuteSQL(batch, undefined, { isMutation: true, description: 'RSU migration' });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new RSUError('SQL_EXEC', msg);
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
        // Prefer in-process CodeGen runner if injected (no child process, no filesystem deps)
        if (this._codeGenRunner) {
            this.rsuLog('Running CodeGen in-process');
            const success = await this._codeGenRunner.RunInProcess(false);
            if (!success) {
                throw new RSUError('CODEGEN', 'In-process CodeGen failed');
            }
            return true;
        }

        // Fallback: shell out to a temp script (legacy approach for environments without injection)
        this.rsuLog('No in-process CodeGen runner — falling back to child process');
        const { execAsync } = await this.getExecAsync();
        const { writeFileSync, unlinkSync } = await import('node:fs');
        const codegenDir = rsuConfig.CodeGenDir;
        const timeoutMs = rsuConfig.CodeGenTimeoutMs;

        const customCmd = rsuConfig.CodeGenCommand;
        if (customCmd) {
            await execAsync(`cd "${codegenDir}" && ${customCmd}`, { timeout: timeoutMs });
            return true;
        }

        // Write a temp .mjs script inside the codegen dir so Node module resolution
        // can find dotenv, codegen-lib, etc. from node_modules
        const tmpScript = `${codegenDir}/.rsu_codegen_${Date.now()}.mjs`;
        const scriptContent = [
            "import 'dotenv/config';",
            "await import('@memberjunction/server-bootstrap-lite/mj-class-registrations');",
            "const { initializeConfig, runMemberJunctionCodeGeneration } = await import('@memberjunction/codegen-lib');",
            'initializeConfig(process.cwd());',
            'await runMemberJunctionCodeGeneration(false);',
        ].join('\n');
        writeFileSync(tmpScript, scriptContent, 'utf-8');

        try {
            // Exit code 0 = success. No stdout string matching needed.
            await execAsync(
                `cd "${codegenDir}" && node "${tmpScript}"`,
                { timeout: timeoutMs }
            );
            return true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('not found') || msg.includes('ENOENT') || msg.includes('MODULE_NOT_FOUND')) {
                throw new RSUError(
                    'CODEGEN_NOT_AVAILABLE',
                    `CodeGen not available. Ensure @memberjunction/codegen-lib and @memberjunction/server-bootstrap-lite are built. Error: ${msg.substring(0, 300)}`
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
        const codegenDir = rsuConfig.CodeGenDir;
        const timeoutMs = rsuConfig.CompileTimeoutMs;

        // Allow full command override
        const compileCmd = rsuConfig.CompileCommand;
        if (compileCmd) {
            await execAsync(`cd "${codegenDir}" && ${compileCmd}`, { timeout: timeoutMs });
            return true;
        }

        // Build using turbo with --filter for each package
        const defaultPackages = '@memberjunction/core-entities,@memberjunction/server,mj_api';
        const envPackages = rsuConfig.CompilePackages;
        const rawPackages = envPackages !== undefined ? envPackages : defaultPackages;
        const packageNames = rawPackages
            .split(',')
            .map(p => p.trim())
            .filter(p => p.length > 0);

        const filterArgs = packageNames.map(p => `--filter="${p}"`).join(' ');
        await execAsync(
            `cd "${codegenDir}" && npx turbo build ${filterArgs}`,
            { timeout: timeoutMs }
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
        const workDir = rsuConfig.WorkDir;
        const processName = rsuConfig.PM2ProcessName;

        // When running inside the MJAPI process that PM2 manages, `pm2 restart`
        // sends SIGINT to THIS process. We will die before execAsync resolves.
        // That's fine — the pending-work file (.rsu_pending/) was already written
        // before this step, and the newly restarted process picks it up on boot.
        //
        // Strategy: fire the restart command, catch the inevitable rejection
        // (our process gets killed mid-flight), and return true. If the process
        // somehow survives (e.g. running outside PM2), poll until MJAPI is ready.
        const isManaged = await this.isPM2ProcessRunning(processName);

        try {
            if (isManaged) {
                await execAsync(`pm2 restart ${processName}`, { timeout: 30_000 });
            } else {
                await execAsync(`cd "${workDir}" && pm2 start ecosystem.config.cjs`, { timeout: 30_000 });
            }
        } catch {
            // Expected: pm2 restart killed us and we caught the signal, OR
            // the command timed out because the process recycled. Either way,
            // the restart was issued — the new process handles the rest.
            this.rsuLog('pm2 restart command completed or process was recycled — treating as success');
            return true;
        }

        // If we're still alive (running outside PM2, or PM2 didn't kill us),
        // poll the endpoint to confirm the server is healthy.
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

    // ─── Phase 2: Git Integration (@octokit/rest — pure HTTP, no shell-outs) ─

    /**
     * Git commit for a CodeGen cycle batch — commits all migration files,
     * CodeGen outputs, and metadata from all requests in the batch.
     * Returns the branch name on success.
     *
     * Uses Octokit GitHub API exclusively — no shell-outs, no git binary dependency.
     * Works in any environment: local dev, Docker, Azure, CI/CD.
     */
    private async gitCommitAndPRForCycle(
        migrationFilePaths: string[],
        affectedTables: string[],
        description: string
    ): Promise<string> {
        return this.gitCommitAndPRViaAPI(migrationFilePaths, affectedTables, description);
    }

    /**
     * Git commit and PR using Octokit GitHub API exclusively.
     * For Docker/CI environments without a local `.git` directory.
     */
    private async gitCommitAndPRViaAPI(
        migrationFilePaths: string[],
        affectedTables: string[],
        description: string
    ): Promise<string> {
        const octokit = this.createOctokit();
        const { owner, repo } = this.resolveGitHubOwnerRepo();
        const branchName = this.generateBranchName(affectedTables);
        const baseBranch = rsuConfig.GitTargetBranch;

        this.rsuLog(`Octokit-only mode: creating branch "${branchName}" from "${baseBranch}"`);

        const baseSha = await this.apiGetBranchSha(octokit, owner, repo, baseBranch);
        await this.apiCreateBranch(octokit, owner, repo, branchName, baseSha);

        const filesToCommit = await this.collectAllRSUFiles(migrationFilePaths);
        this.rsuLog(`Collected ${filesToCommit.length} file(s) to commit via API`);

        const treeSha = await this.apiCreateTreeFromFiles(octokit, owner, repo, baseSha, filesToCommit);
        const tables = affectedTables.join(', ');
        const commitMsg = `RSU: ${description}\n\nTables affected: ${tables}\nGenerated by Runtime Schema Update pipeline`;
        const commitSha = await this.apiCreateCommit(octokit, owner, repo, commitMsg, treeSha, baseSha);
        await this.apiUpdateBranchRef(octokit, owner, repo, branchName, commitSha);

        await this.apiCreatePullRequest(octokit, owner, repo, branchName, baseBranch, migrationFilePaths, tables, description);

        return branchName;
    }

    /**
     * Resolve GitHub owner/repo from RSU_GITHUB_REPO env var or by parsing the git remote URL.
     * In Octokit-only mode, RSU_GITHUB_REPO is required since there's no local git remote.
     */
    private resolveGitHubOwnerRepo(): { owner: string; repo: string } {
        const envRepo = rsuConfig.GitHubRepo;
        if (envRepo) {
            const parts = envRepo.split('/');
            if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
                return { owner: parts[0], repo: parts[1] };
            }
            throw new RSUError('CONFIG', `RSU_GITHUB_REPO must be in "owner/repo" format, got: "${envRepo}"`);
        }
        throw new RSUError('CONFIG', 'No local .git directory and RSU_GITHUB_REPO is not set. Set RSU_GITHUB_REPO=owner/repo for Octokit-only mode.');
    }

    /** Get the SHA of the tip of a branch via Octokit. */
    private async apiGetBranchSha(octokit: Octokit, owner: string, repo: string, branch: string): Promise<string> {
        const { data } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
        return data.object.sha;
    }

    /** Create a new branch ref via Octokit. */
    private async apiCreateBranch(octokit: Octokit, owner: string, repo: string, branch: string, sha: string): Promise<void> {
        await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha });
    }

    /**
     * Build a git tree from files via Octokit using inline content.
     * This sends all files in a single createTree call instead of
     * N+1 individual createBlob calls, avoiding GitHub's secondary rate limit.
     *
     * Files > 1 MB fall back to createBlob (GitHub rejects inline content above that).
     */
    private async apiCreateTreeFromFiles(
        octokit: Octokit,
        owner: string,
        repo: string,
        baseTreeSha: string,
        files: Array<{ repoPath: string; absolutePath: string }>
    ): Promise<string> {
        const { readFileSync } = await import('node:fs');
        const INLINE_LIMIT = 1_000_000; // 1 MB

        type TreeItem = { path: string; mode: '100644'; type: 'blob'; content?: string; sha?: string };
        const treeItems: TreeItem[] = [];
        let blobCount = 0;

        for (const file of files) {
            const buf = readFileSync(file.absolutePath);
            if (buf.length <= INLINE_LIMIT) {
                treeItems.push({ path: file.repoPath, mode: '100644', type: 'blob', content: buf.toString('utf-8') });
            } else {
                // Large file — must create blob separately
                const { data: blob } = await octokit.git.createBlob({
                    owner, repo,
                    content: buf.toString('base64'),
                    encoding: 'base64',
                });
                treeItems.push({ path: file.repoPath, mode: '100644', type: 'blob', sha: blob.sha });
                blobCount++;
            }
        }

        this.rsuLog(`Creating tree: ${treeItems.length} file(s) (${treeItems.length - blobCount} inline, ${blobCount} blob)`);

        const { data: tree } = await octokit.git.createTree({
            owner, repo,
            base_tree: baseTreeSha,
            tree: treeItems,
        });
        return tree.sha;
    }

    /** Create a commit via Octokit. Returns the commit SHA. */
    private async apiCreateCommit(
        octokit: Octokit, owner: string, repo: string,
        message: string, treeSha: string, parentSha: string
    ): Promise<string> {
        const commitParams: Parameters<Octokit['git']['createCommit']>[0] = {
            owner, repo, message, tree: treeSha, parents: [parentSha],
        };

        const userName = rsuConfig.GitUserName;
        const userEmail = rsuConfig.GitUserEmail;
        if (userName && userEmail) {
            commitParams.author = { name: userName, email: userEmail, date: new Date().toISOString() };
        }

        const { data: commit } = await octokit.git.createCommit(commitParams);
        return commit.sha;
    }

    /** Update a branch ref to point to a new commit SHA via Octokit. */
    private async apiUpdateBranchRef(
        octokit: Octokit, owner: string, repo: string, branch: string, sha: string
    ): Promise<void> {
        await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha });
    }

    /** Create a PR via Octokit (API-only mode). */
    private async apiCreatePullRequest(
        octokit: Octokit, owner: string, repo: string,
        head: string, base: string,
        migrationFilePaths: string[], tables: string, description: string
    ): Promise<void> {
        const title = `RSU: ${description}`.substring(0, 70);
        const body = this.buildPRBody(tables, migrationFilePaths.length);
        await octokit.pulls.create({ owner, repo, title, body, base, head });
    }

    // ─── File Collection for API Mode ───────────────────────────────

    /**
     * Collect all RSU-produced files that should be committed.
     * Returns objects with both the absolute path (for reading) and
     * the repo-relative path (for the git tree).
     */
    /** Check if a path is gitignored by asking git. */
    private isGitIgnored(absPath: string, workDir: string): boolean {
        const { execSync } = childProcess;
        try {
            execSync(`git check-ignore -q "${absPath}"`, { cwd: workDir, timeout: 5_000 });
            return true; // exit 0 = ignored
        } catch {
            return false; // exit 1 = not ignored
        }
    }

    private async collectAllRSUFiles(
        migrationFilePaths: string[]
    ): Promise<Array<{ repoPath: string; absolutePath: string }>> {
        const { existsSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const workDir = resolve(rsuConfig.WorkDir);
        const files: Array<{ repoPath: string; absolutePath: string }> = [];

        // Migration files
        for (const filePath of migrationFilePaths) {
            if (filePath && existsSync(filePath)) {
                files.push({ repoPath: this.toRepoRelativePath(filePath, workDir), absolutePath: filePath });
            }
        }

        // AdditionalSchemaInfo
        const schemaInfoPath = resolve(workDir, rsuConfig.AdditionalSchemaInfoPath);
        if (existsSync(schemaInfoPath)) {
            files.push({ repoPath: this.toRepoRelativePath(schemaInfoPath, workDir), absolutePath: schemaInfoPath });
        }

        // CodeGen output directories — skip gitignored dirs (SQL build artifacts, schema dumps)
        for (const outputPath of this._codeGenOutputPaths) {
            const absOutputPath = resolve(workDir, outputPath);
            if (!existsSync(absOutputPath)) continue;

            if (this.isGitIgnored(absOutputPath, workDir)) {
                this.rsuLog(`Skipping gitignored CodeGen output: ${outputPath}`);
                continue;
            }

            const collected = await this.collectFilesRecursively(absOutputPath);
            for (const absFile of collected) {
                files.push({ repoPath: this.toRepoRelativePath(absFile, workDir), absolutePath: absFile });
            }
        }

        this.rsuLog(`Collected ${files.length} file(s) to commit via API`);
        return files;
    }

    /** Convert an absolute path to a repo-relative path (forward slashes). */
    private toRepoRelativePath(absolutePath: string, workDir: string): string {
        const { resolve, relative } = nodePath;
        const resolved = resolve(absolutePath);
        return relative(workDir, resolved).replace(/\\/g, '/');
    }

    /** Recursively collect all files in a directory. */
    private async collectFilesRecursively(dirPath: string): Promise<string[]> {
        const { readdirSync, statSync } = await import('node:fs');
        const { join } = await import('node:path');
        const results: string[] = [];

        const entries = readdirSync(dirPath);
        for (const entry of entries) {
            const fullPath = join(dirPath, entry);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                const nested = await this.collectFilesRecursively(fullPath);
                results.push(...nested);
            } else if (stat.isFile()) {
                results.push(fullPath);
            }
        }

        return results;
    }

    /** Build the PR body markdown. */
    private buildPRBody(tables: string, migrationFileCount: number): string {
        return [
            '## Runtime Schema Update',
            '',
            `**Tables affected:** ${tables}`,
            `**Migration files:** ${migrationFileCount}`,
            '',
            '### What changed',
            '- Migration SQL executed against the database',
            '- CodeGen re-generated entity metadata, TypeScript classes, and SQL objects',
            '- MJAPI restarted with updated schema',
            '',
            '### Generated by',
            'Runtime Schema Update (RSU) pipeline — auto-generated PR.',
        ].join('\n');
    }

    /** Create an authenticated Octokit instance from environment token. */
    private createOctokit(): Octokit {
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) {
            throw new RSUError(
                'GIT',
                'GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable for PR creation.'
            );
        }
        return new Octokit({ auth: token });
    }

    /**
     * Generate a branch name from affected table names.
     * Format: rsu/{YYYYMMDDHHmm}-{table-slugs}
     */
    private generateBranchName(affectedTables: string[]): string {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
        const tableSlug = affectedTables
            .slice(0, 3)
            .map(t => t.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase())
            .join('-');
        return `rsu/${timestamp}-${tableSlug}`;
    }

    // ─── DB-Backed Mutex (Multi-Instance Safety) ──────────────────

    /** Whether the DB-backed lock is enabled via RSU_DB_LOCK_ENABLED=1. */
    private get IsDBLockEnabled(): boolean {
        return rsuConfig.IsDBLockEnabled;
    }

    /**
     * Try to acquire a DB-backed lock by inserting a row into the RSULock table.
     * Uses SQLDialect for DDL generation and DBExecProvider for CLI execution.
     * Returns true if the lock was acquired, false if another instance holds it.
     */
    private async acquireDBLock(): Promise<boolean> {
        try {
            const defaultSchema = rsuConfig.DefaultSchema;
            const lockId = `rsu-${process.pid}-${Date.now()}`;
            this._dbLockId = lockId;

            const sql = this.buildAcquireLockSQL(defaultSchema, lockId);
            await this.getDBProvider().ExecuteSQL(sql, undefined, { isMutation: true, description: 'RSU lock acquire' });
            // If no exception, lock was acquired (signal would have been a RAISERROR that throws)
            return true;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            // Check if the error is our lock-held signal
            if (msg.includes(RSU_LOCK_HELD_SIGNAL)) {
                return false;
            }
            // Other errors — fall through to in-memory only
            return true;
        }
    }

    private _dbLockId: string | null = null;

    /**
     * Release the DB-backed lock by deleting the lock row.
     */
    private async releaseDBLock(): Promise<void> {
        if (!this._dbLockId) return;

        try {
            const d = this.Dialect;
            const defaultSchema = rsuConfig.DefaultSchema;
            const quotedTable = d.QuoteSchema(defaultSchema, 'RSULock');
            const sql = `DELETE FROM ${quotedTable} WHERE LockID = '${this._dbLockId}';`;
            await this.getDBProvider().ExecuteSQL(sql, undefined, { isMutation: true, description: 'RSU lock release' });
            this._dbLockId = null;
        } catch {
            /* best-effort release */
        }
    }

    // ─── Audit Logging ──────────────────────────────────────────────

    /**
     * Write an audit log entry for a pipeline run to the RSUAuditLog table.
     *
     * This is called automatically at the end of RunPipeline() if the DB
     * is available and RSU_AUDIT_LOG_ENABLED is not explicitly '0'.
     */
    private async writeAuditLog(input: RSUPipelineInput, result: RSUPipelineResult): Promise<void> {
        if (!rsuConfig.IsAuditLogEnabled) return;

        try {
            const defaultSchema = rsuConfig.DefaultSchema;
            // Ensure audit table exists (no user input, safe as string DDL)
            const createTableSQL = this.buildAuditTableDDL(defaultSchema);
            await this.getDBProvider().ExecuteSQL(createTableSQL, undefined, { isMutation: true, description: 'RSU audit table DDL' });
            // Parameterized INSERT for all string values
            await this.writeAuditInsert(defaultSchema, input, result);
        } catch {
            /* Audit logging is best-effort — don't fail the pipeline */
        }
    }

    // ─── Platform Abstraction ────────────────────────────────────────

    /** Resolve the database platform from environment configuration. */
    private get Platform(): DatabasePlatform {
        const platform = (process.env.DB_PLATFORM || 'sqlserver').toLowerCase();
        if (platform !== 'sqlserver' && platform !== 'postgresql') {
            throw new RSUError('CONFIG', `Unsupported DB_PLATFORM: "${platform}". Must be "sqlserver" or "postgresql".`);
        }
        return platform as DatabasePlatform;
    }

    /** Get the SQLDialect for the configured platform (SQL generation). */
    private get Dialect() {
        return GetDialect(this.Platform);
    }

    /** Get the database provider for DDL operations. Prefers the dedicated DDL provider if set. */
    private getDBProvider(): DatabaseProviderBase {
        if (this._ddlProvider) {
            return this._ddlProvider;
        }
        const provider = Metadata.Provider;
        if (!provider || !('ExecuteSQL' in provider)) {
            throw new RSUError('CONFIG', 'MJ data provider is not initialized. RSU requires a running MJAPI with a configured database provider.');
        }
        return provider as DatabaseProviderBase;
    }

    // ─── DDL Generation (dialect-driven, zero platform checks) ──────

    /**
     * Generate SQL to create the RSULock table (if not exists), clean expired locks,
     * and attempt to acquire the lock.
     */
    private buildAcquireLockSQL(schema: string, lockId: string): string {
        const d = this.Dialect;
        const quotedTable = d.QuoteSchema(schema, 'RSULock');
        const utcNow = d.CurrentTimestampUTC();
        const varchar200 = d.MapDataTypeToString('NVARCHAR', 200);
        const timestampType = d.MapDataTypeToString('DATETIMEOFFSET');
        const expiryDefault = d.DateAddExpression('MINUTE', 30, utcNow);

        const columnsDDL = [
            `    LockID ${varchar200} NOT NULL,`,
            `    AcquiredAt ${timestampType} NOT NULL DEFAULT ${utcNow},`,
            `    ExpiresAt ${timestampType} NOT NULL DEFAULT ${expiryDefault},`,
            `    CONSTRAINT PK_RSULock PRIMARY KEY (LockID)`,
        ].join('\n');

        const createTable = d.CreateTableIfNotExistsDDL(schema, 'RSULock', columnsDDL);
        const cleanExpired = `DELETE FROM ${quotedTable} WHERE ExpiresAt < ${utcNow};`;
        const acquireLock = d.ConditionalBlock(
            `(SELECT COUNT(*) FROM ${quotedTable}) = 0`,
            `INSERT INTO ${quotedTable} (LockID) VALUES ('${lockId}')`,
            d.RaiseSignalSQL(RSU_LOCK_HELD_SIGNAL)
        );

        return [createTable, '-- Clean up expired locks', cleanExpired, '-- Try to acquire lock', acquireLock].join('\n');
    }

    /** Generate SQL to create the RSUAuditLog table if it doesn't exist. */
    private buildAuditTableDDL(schema: string): string {
        const d = this.Dialect;
        const intType = d.MapDataTypeToString('INT');
        const autoIncrement = d.AutoIncrementPKExpression();
        const varchar500 = d.MapDataTypeToString('NVARCHAR', 500);
        const varchar200 = d.MapDataTypeToString('NVARCHAR', 200);
        const varchar100 = d.MapDataTypeToString('NVARCHAR', 100);
        const textType = d.MapDataTypeToString('NVARCHAR', -1);
        const boolType = d.MapDataTypeToString('BIT');
        const timestampType = d.MapDataTypeToString('DATETIMEOFFSET');
        const utcNow = d.CurrentTimestampUTC();
        const boolDefault0 = d.BooleanLiteral(false);

        const columnsDDL = [
            `    ID ${intType} ${autoIncrement} NOT NULL,`,
            `    Description ${varchar500} NOT NULL,`,
            `    AffectedTables ${textType} NULL,`,
            `    Success ${boolType} NOT NULL,`,
            `    APIRestarted ${boolType} NOT NULL DEFAULT ${boolDefault0},`,
            `    GitCommitSuccess ${boolType} NOT NULL DEFAULT ${boolDefault0},`,
            `    BranchName ${varchar200} NULL,`,
            `    MigrationFilePath ${varchar500} NULL,`,
            `    ErrorMessage ${textType} NULL,`,
            `    ErrorStep ${varchar100} NULL,`,
            `    StepsJSON ${textType} NULL,`,
            `    TotalDurationMs ${intType} NULL,`,
            `    RunAt ${timestampType} NOT NULL DEFAULT ${utcNow},`,
            `    CONSTRAINT PK_RSUAuditLog PRIMARY KEY (ID)`,
        ].join('\n');

        return d.CreateTableIfNotExistsDDL(schema, 'RSUAuditLog', columnsDDL);
    }

    /**
     * Write the audit log INSERT using parameterized query to prevent SQL injection.
     * The CREATE TABLE DDL runs separately (no user input, safe as-is).
     */
    private async writeAuditInsert(schema: string, input: RSUPipelineInput, result: RSUPipelineResult): Promise<void> {
        const d = this.Dialect;
        const quotedTable = d.QuoteSchema(schema, 'RSUAuditLog');
        const totalMs = result.Steps.reduce((sum, s) => sum + s.DurationMs, 0);
        const stepsJson = JSON.stringify(result.Steps).substring(0, 8000);
        const boolTrue = d.BooleanLiteral(true);
        const boolFalse = d.BooleanLiteral(false);

        // Use parameterized query for all string values to prevent injection
        const p = (i: number) => d.ParameterPlaceholder(i);
        const sql = [
            `INSERT INTO ${quotedTable}`,
            `  (Description, AffectedTables, Success, APIRestarted, GitCommitSuccess, BranchName, MigrationFilePath, ErrorMessage, ErrorStep, StepsJSON, TotalDurationMs)`,
            `VALUES (`,
            `  ${p(0)}, ${p(1)},`,
            `  ${result.Success ? boolTrue : boolFalse},`,
            `  ${result.APIRestarted ? boolTrue : boolFalse},`,
            `  ${result.GitCommitSuccess ? boolTrue : boolFalse},`,
            `  ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)},`,
            `  ${totalMs}`,
            `);`,
        ].join('\n');

        const params: Array<string | null> = [
            input.Description,
            input.AffectedTables.join(', '),
            result.BranchName ?? null,
            result.MigrationFilePath ?? null,
            result.ErrorMessage?.substring(0, 4000) ?? null,
            result.ErrorStep ?? null,
            stepsJson,
        ];

        await this.getDBProvider().ExecuteSQL(sql, params, { isMutation: true, description: 'RSU audit log insert' });
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    /** Build a failed RSUPipelineResult for early-exit scenarios (validation, lock). */
    private buildFailedResult(_input: RSUPipelineInput, failedStep: string, steps: RSUPipelineStep[]): RSUPipelineResult {
        const failMsg = steps.find(s => s.Name === failedStep && s.Status === 'failed')?.Message ?? `Failed at ${failedStep}`;
        return {
            Success: false,
            APIRestarted: false,
            GitCommitSuccess: false,
            Steps: [...steps],
            ErrorMessage: failMsg,
            ErrorStep: failedStep,
        };
    }

    private buildBatchResult(results: RSUPipelineResult[]): RSUPipelineBatchResult {
        const successCount = results.filter(r => r.Success).length;
        const failureCount = results.length - successCount;
        this.rsuLog(`Pipeline batch finished — ${successCount} succeeded, ${failureCount} failed, ${results.length} total`);
        for (const r of results) {
            const status = r.Success ? '✓' : '✗';
            this.rsuLog(`  ${status} ${r.MigrationFilePath ?? '(no file)'} — ${r.Steps.map(s => `${s.Name}:${s.Status}`).join(', ')}`);
        }
        this.rsuLog(`═══════════════════════════════════════════════════`);
        return {
            Results: results,
            SuccessCount: successCount,
            FailureCount: failureCount,
            TotalCount: results.length,
        };
    }

    private getProtectedSchemas(): string[] {
        return rsuConfig.ProtectedSchemas;
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
        this.rsuLog(`▶ Starting step: ${name}`);
        try {
            const result = await fn();
            const durationMs = Date.now() - start;
            const msg = `${name} completed successfully`;
            steps.push({ Name: name, Status: 'success', DurationMs: durationMs, Message: msg });
            this.rsuLog(`✓ ${name} — ${durationMs}ms`);
            return result;
        } catch (error: unknown) {
            const durationMs = Date.now() - start;
            const msg = error instanceof Error ? error.message : String(error);
            steps.push({ Name: name, Status: 'failed', DurationMs: durationMs, Message: msg });
            this.rsuLog(`✗ ${name} — FAILED after ${durationMs}ms: ${msg}`);
            return undefined;
        }
    }

    /**
     * Log to both console and file. File path: RSU_WORK_DIR/rsu-pipeline.log.
     */
    private rsuLog(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[RSU] ${timestamp}  ${message}`;
        console.log(line);
        try {
            const logPath = `${rsuConfig.WorkDir}/rsu-pipeline.log`;
            appendFileSync(logPath, `${line}\n`, 'utf-8');
        } catch {
            // Best-effort file logging — don't break the pipeline
        }
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
