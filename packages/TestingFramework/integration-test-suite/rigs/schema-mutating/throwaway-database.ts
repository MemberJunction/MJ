/**
 * throwaway-database.ts — a private database for tests that change the schema and run CodeGen.
 *
 * The deterministic tier is read-only-or-self-cleaning against a shared database, and its checks
 * run in-process against a live provider. A test that adds or drops columns, swaps a base view and
 * then runs `mj codegen` fits neither rule: the schema change is not safely reversible on a shared
 * database, and CodeGen needs its own process and connection (interleaved runs corrupt metadata).
 *
 * This class owns one database for the length of a rig run:
 *
 *   create → `mj migrate` → `mj sync push --dir=metadata` → `mj codegen --skipfiles` → … → drop
 *
 * `mj sync push` runs BEFORE CodeGen. CodeGen reads JSONType definitions from the database, so a
 * CodeGen run ahead of the push regenerates from stale definitions (migrations/CLAUDE.md). This is
 * the order the CI `codegen-drift` job uses.
 *
 * CodeGen always runs with `--skipfiles` and a scratch `--sql-output-dir`: the rig changes the
 * database only, so no generated source file in the working tree is rewritten and no
 * `CodeGen_Run_*.sql` lands in `migrations/`. CodeGen still writes its generated SQL scripts to
 * the configured (git-ignored) `SQL Scripts/generated/` folder of the checkout, so run one rig per
 * checkout at a time: two concurrent runs delete each other's script files.
 *
 * Server credentials come from the same variables MJAPI and the CLI use (`DB_HOST`, `DB_PORT`,
 * `DB_USERNAME`, `DB_PASSWORD`, `CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD`,
 * `DB_TRUST_SERVER_CERTIFICATE`). `DB_DATABASE` is ignored: the rig always works on the database
 * it created. The login needs `CREATE DATABASE` (sa in CI and in a local container).
 */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

/** Connection settings for the SQL Server that hosts the throwaway database. */
export interface ServerConfig {
    Host: string;
    Port: number;
    User: string;
    Password: string;
    CodeGenUser: string;
    CodeGenPassword: string;
    TrustServerCertificate: boolean;
}

/** The outcome of one CLI step, with the path of its full log. */
export interface CliRunResult {
    ExitCode: number;
    LogPath: string;
}

const SAFE_DATABASE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const LOG_TAIL_CHARS = 6000;

/**
 * True when `name` can be put inside `[...]` in DDL without quoting concerns. Database names are
 * interpolated into `CREATE DATABASE` / `DROP DATABASE`, which take no parameters.
 */
export function IsSafeDatabaseName(name: string): boolean {
    return SAFE_DATABASE_NAME.test(name);
}

/**
 * A database name that says who owns it and when it was made, so a leftover from a crashed run is
 * recognisable on a shared server: `mj_rig_<prefix>_<yyyymmddhhmmss>_<4 hex>`.
 */
export function NewThrowawayDatabaseName(prefix: string, now: Date = new Date(), random: () => number = Math.random): string {
    const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (cleanPrefix.length === 0) {
        throw new Error(`Database name prefix '${prefix}' has no letters or digits`);
    }
    const pad = (n: number): string => String(n).padStart(2, '0');
    const stamp =
        `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
        `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    const suffix = Math.floor(random() * 0x10000).toString(16).padStart(4, '0');
    return `mj_rig_${cleanPrefix}_${stamp}_${suffix}`;
}

/** Reads the server settings from the environment; throws naming every missing variable. */
export function ReadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
    const missing = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD'].filter(key => !env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing environment variable(s): ${missing.join(', ')}`);
    }
    const port = env.DB_PORT ? Number.parseInt(env.DB_PORT, 10) : 1433;
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`DB_PORT '${env.DB_PORT}' is not a port number`);
    }
    const user = env.DB_USERNAME as string;
    const password = env.DB_PASSWORD as string;
    return {
        Host: env.DB_HOST as string,
        Port: port,
        User: user,
        Password: password,
        CodeGenUser: env.CODEGEN_DB_USERNAME || user,
        CodeGenPassword: env.CODEGEN_DB_PASSWORD || password,
        TrustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE !== 'false' && env.DB_TRUST_SERVER_CERTIFICATE !== '0',
    };
}

/** The repository root: the nearest ancestor of this file holding `pnpm-workspace.yaml`. */
export function FindRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
    let current = start;
    while (!existsSync(join(current, 'pnpm-workspace.yaml'))) {
        const parent = dirname(current);
        if (parent === current) {
            throw new Error(`No pnpm-workspace.yaml above ${start}`);
        }
        current = parent;
    }
    return current;
}

function tail(text: string): string {
    return text.length > LOG_TAIL_CHARS ? `…${text.slice(-LOG_TAIL_CHARS)}` : text;
}

/** One private database, its connection pool, and the `mj` CLI steps that run against it. */
export class ThrowawayDatabase {
    private pool: sql.ConnectionPool | null = null;
    private readonly logDir: string;
    private readonly sqlOutputDir: string;
    private stepCounter = 0;

    constructor(
        public readonly Name: string,
        private readonly server: ServerConfig,
        private readonly repoRoot: string = FindRepoRoot()
    ) {
        if (!IsSafeDatabaseName(Name)) {
            throw new Error(`'${Name}' is not a safe database name`);
        }
        this.logDir = mkdtempSync(join(tmpdir(), `${Name}-logs-`));
        this.sqlOutputDir = join(this.logDir, 'codegen-sql');
    }

    /** Where every CLI step's full output is written. */
    public get LogDirectory(): string {
        return this.logDir;
    }

    /** Creates the empty database. Fails if the name is already taken. */
    public async Create(): Promise<void> {
        await this.withMaster(async master => {
            const exists = await master.request().input('name', sql.NVarChar, this.Name).query<{ n: number }>('SELECT COUNT(*) AS n FROM sys.databases WHERE name = @name');
            if (exists.recordset[0].n > 0) {
                throw new Error(`Database '${this.Name}' already exists; refusing to reuse it`);
            }
            await master.request().batch(`CREATE DATABASE [${this.Name}]`);
        });
    }

    /** Drops the database, disconnecting anyone still attached. Safe to call when it never existed. */
    public async Drop(): Promise<void> {
        await this.Close();
        await this.withMaster(async master => {
            await master.request().batch(
                `IF DB_ID(N'${this.Name}') IS NOT NULL
                 BEGIN
                     ALTER DATABASE [${this.Name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE [${this.Name}];
                 END`
            );
        });
    }

    /** `mj migrate`, `mj sync push --dir=metadata`, then one CodeGen run — the state CI tests against. */
    public async Bootstrap(): Promise<void> {
        this.RequireSuccess(this.RunCli('migrate', ['migrate']));
        this.RequireSuccess(this.RunCli('sync-push', ['sync', 'push', '--dir=metadata', '--ci']));
        this.restoreSyncWriteBack();
        this.RequireSuccess(this.RunCodeGen('bootstrap'));
    }

    /**
     * `mj sync push` writes `sync` blocks back into the metadata files it pushes, which would leave
     * a developer's working tree dirty after a local run. The CI drift gate's restore script undoes
     * exactly that and nothing else; anything it leaves dirty is reported, not failed on — it is
     * not what this rig tests.
     */
    private restoreSyncWriteBack(): void {
        const script = join(this.repoRoot, 'scripts/ci-restore-sync-only-metadata.mjs');
        if (!existsSync(script)) {
            return;
        }
        const result = spawnSync(process.execPath, [script], { cwd: this.repoRoot, encoding: 'utf8' });
        if (result.status !== 0) {
            console.warn(`    [rig] metadata write-back not fully restored:\n${result.stdout}${result.stderr}`);
        }
    }

    /**
     * One DB-side CodeGen run. Returns the exit code rather than throwing: whether CodeGen
     * succeeded is something scenarios assert on.
     */
    public RunCodeGen(label: string): CliRunResult {
        return this.RunCli(`codegen-${label}`, [
            'codegen',
            '--skipfiles',
            '--no-ai',
            '--skip-commands',
            '--skip-cache-clear',
            `--sql-output-dir=${this.sqlOutputDir}`,
        ]);
    }

    /** Runs `node packages/MJCLI/bin/run.js <args>` from the repo root against this database. */
    public RunCli(label: string, args: string[]): CliRunResult {
        this.stepCounter++;
        const logPath = join(this.logDir, `${String(this.stepCounter).padStart(2, '0')}-${label}.log`);
        const fd = openSync(logPath, 'w');
        const started = Date.now();
        try {
            const result = spawnSync(process.execPath, [join(this.repoRoot, 'packages/MJCLI/bin/run.js'), ...args], {
                cwd: this.repoRoot,
                env: this.childEnv(),
                stdio: ['ignore', fd, fd],
            });
            const exitCode = result.status ?? 1;
            console.log(`    [rig] mj ${args[0]} (${label}) exited ${exitCode} in ${Math.round((Date.now() - started) / 1000)}s — log: ${logPath}`);
            return { ExitCode: exitCode, LogPath: logPath };
        } finally {
            closeSync(fd);
        }
    }

    /** Throws with the log tail when a step failed. */
    public RequireSuccess(result: CliRunResult): void {
        if (result.ExitCode !== 0) {
            throw new Error(`${result.LogPath} exited ${result.ExitCode}:\n${tail(readFileSync(result.LogPath, 'utf8'))}`);
        }
    }

    /** The last part of a step's log, for failure messages. */
    public LogTail(result: CliRunResult): string {
        return tail(readFileSync(result.LogPath, 'utf8'));
    }

    /** A pool connected to this database as the main login. Reused across calls. */
    public async Pool(): Promise<sql.ConnectionPool> {
        if (!this.pool) {
            this.pool = await new sql.ConnectionPool(this.poolConfig(this.Name)).connect();
        }
        return this.pool;
    }

    /** Runs a T-SQL batch (may contain several statements, no `GO`). */
    public async Exec(batch: string): Promise<void> {
        const pool = await this.Pool();
        await pool.request().batch(batch);
    }

    /** Runs a query and returns its rows. */
    public async Query<T>(query: string, params: Record<string, string> = {}): Promise<T[]> {
        const pool = await this.Pool();
        const request = pool.request();
        for (const [name, value] of Object.entries(params)) {
            request.input(name, sql.NVarChar, value);
        }
        const result = await request.query<T>(query);
        return result.recordset;
    }

    public async Close(): Promise<void> {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
        }
    }

    private childEnv(): NodeJS.ProcessEnv {
        return {
            ...process.env,
            DB_HOST: this.server.Host,
            DB_PORT: String(this.server.Port),
            DB_DATABASE: this.Name,
            DB_USERNAME: this.server.User,
            DB_PASSWORD: this.server.Password,
            CODEGEN_DB_USERNAME: this.server.CodeGenUser,
            CODEGEN_DB_PASSWORD: this.server.CodeGenPassword,
            DB_TRUST_SERVER_CERTIFICATE: this.server.TrustServerCertificate ? 'true' : 'false',
            MJ_CODEGEN_NO_AI: '1',
            MJ_CODEGEN_SKIP_COMMANDS: '1',
            MJ_MIGRATION_REQUEST_TIMEOUT: process.env.MJ_MIGRATION_REQUEST_TIMEOUT ?? '120000',
        };
    }

    private poolConfig(database: string): sql.config {
        return {
            server: this.server.Host,
            port: this.server.Port,
            user: this.server.User,
            password: this.server.Password,
            database,
            options: { encrypt: false, trustServerCertificate: this.server.TrustServerCertificate },
            requestTimeout: 120_000,
            pool: { max: 2, min: 0 },
        };
    }

    private async withMaster(fn: (master: sql.ConnectionPool) => Promise<void>): Promise<void> {
        const master = await new sql.ConnectionPool(this.poolConfig('master')).connect();
        try {
            await fn(master);
        } finally {
            await master.close();
        }
    }
}
