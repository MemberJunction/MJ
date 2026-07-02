import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** One statement the MJ dialect refused to emit — a reported conversion gap. */
export interface MJUnhandledStatement {
  /** What the dialect saw (e.g. 'Command', 'Declare'). */
  kind: string;
  /** The offending T-SQL (possibly truncated by the dialect). */
  snippet: string;
}

/** Result of transpiling MemberJunction T-SQL to PostgreSQL via the MJ dialect. */
export interface MJPostgresTranspileResult {
  /** The emitted PostgreSQL statements, in order. */
  sql: string[];
  /** Statements the dialect refused to emit — never silently dropped. */
  unhandled: MJUnhandledStatement[];
}

export interface MJPostgresTranspilerOptions {
  /**
   * Python interpreter to run the dialect with. Resolution order:
   * this option → `MJ_SQLGLOT_PYTHON` env var → `python3` on PATH.
   * The interpreter must have `sqlglot` installed (`pip install sqlglot`).
   */
  pythonPath?: string;
  /**
   * BIT/BOOLEAN columns declared OUTSIDE the SQL being transpiled (cross-file
   * registry, e.g. collected from the baselines), so seed INSERTs targeting those
   * tables get their 1/0 values coerced to TRUE/FALSE.
   */
  extraBitColumns?: string[];
  /** Per-invocation timeout in ms (default 120000 — baselines are large). */
  timeoutMs?: number;
}

/**
 * Resolve the MJ dialect script path.
 * When running from dist/ the path is ../src/python/mj_postgres.py
 * When running from src/ (e.g. vitest) the path is ./python/mj_postgres.py
 */
function resolveDialectPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'src', 'python', 'mj_postgres.py'), // from dist/
    path.resolve(__dirname, 'python', 'mj_postgres.py'),              // from src/ (vitest)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]; // fail at spawn time with a clear error
}

/**
 * One-shot transpiler for MemberJunction T-SQL → PostgreSQL via the MJ sqlglot
 * dialect (`mj_postgres.py`). Unlike `SqlGlotClient` (a long-lived FastAPI
 * microservice for generic dialect conversion), this invokes the dialect script
 * directly per call — deterministic, no server lifecycle, suited to CLI batch
 * conversion where each migration is transpiled exactly once.
 *
 * The dialect's contract: every input statement is either emitted as PostgreSQL
 * or reported in `unhandled` — never silently dropped.
 *
 * @example
 * ```ts
 * const transpiler = new MJPostgresTranspiler({ extraBitColumns: bitCols });
 * const result = await transpiler.transpile(keptTsql);
 * // result.sql → PG statements; result.unhandled → gaps to surface
 * ```
 */
export class MJPostgresTranspiler {
  private readonly pythonPath: string;
  private readonly dialectPath: string;
  private readonly extraBitColumns: string[];
  private readonly timeoutMs: number;

  constructor(options?: MJPostgresTranspilerOptions) {
    this.pythonPath = options?.pythonPath ?? process.env.MJ_SQLGLOT_PYTHON ?? 'python3';
    this.dialectPath = resolveDialectPath();
    this.extraBitColumns = options?.extraBitColumns ?? [];
    this.timeoutMs = options?.timeoutMs ?? 120_000;
  }

  /** Transpile T-SQL to PostgreSQL. Statements the dialect can't emit land in `unhandled`. */
  async transpile(tsql: string): Promise<MJPostgresTranspileResult> {
    const stdout = await this.runDialect([], tsql);
    const parsed = JSON.parse(stdout) as MJPostgresTranspileResult;
    if (!Array.isArray(parsed.sql) || !Array.isArray(parsed.unhandled)) {
      throw new Error(`MJPostgresTranspiler: unexpected dialect output shape: ${stdout.slice(0, 200)}`);
    }
    return parsed;
  }

  /**
   * Collect the BIT/BOOLEAN column registry (`Table.Column` pairs) declared in the
   * given SQL — used to build the cross-file registry from baselines before
   * transpiling individual migrations.
   */
  async collectBitColumns(sql: string): Promise<string[]> {
    const stdout = await this.runDialect(['--collect-bitcols'], sql);
    const parsed = JSON.parse(stdout) as string[];
    if (!Array.isArray(parsed)) {
      throw new Error(`MJPostgresTranspiler: unexpected --collect-bitcols output: ${stdout.slice(0, 200)}`);
    }
    return parsed;
  }

  /** Verify the interpreter + sqlglot are available; throws with install guidance if not. */
  async preflight(): Promise<void> {
    await this.runDialect([], 'SELECT 1;');
  }

  private runDialect(args: string[], stdin: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.dialectPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MJ_EXTRA_BIT_COLS: JSON.stringify(this.extraBitColumns),
        },
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.kill('SIGKILL');
          reject(new Error(`MJPostgresTranspiler: dialect invocation timed out after ${this.timeoutMs}ms`));
        }
      }, this.timeoutMs);

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          err.code === 'ENOENT'
            ? new Error(
                `MJPostgresTranspiler: Python interpreter '${this.pythonPath}' not found. ` +
                  'Install Python 3.10+ and set MJ_SQLGLOT_PYTHON to its path (or ensure python3 is on PATH).',
              )
            : new Error(`MJPostgresTranspiler: failed to spawn dialect: ${err.message}`),
        );
      });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(stdout);
          return;
        }
        if (/ModuleNotFoundError.*sqlglot/.test(stderr)) {
          reject(
            new Error(
              `MJPostgresTranspiler: the interpreter '${this.pythonPath}' has no sqlglot module. ` +
                `Install it with: ${this.pythonPath} -m pip install 'sqlglot>=27'`,
            ),
          );
          return;
        }
        reject(
          new Error(
            `MJPostgresTranspiler: dialect exited with code ${code}.` +
              (stderr ? `\nstderr: ${stderr.slice(0, 500)}` : ''),
          ),
        );
      });

      proc.stdin.write(stdin);
      proc.stdin.end();
    });
  }
}
