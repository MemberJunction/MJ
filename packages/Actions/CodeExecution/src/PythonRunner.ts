/**
 * Isolated Python Code Execution Runner
 *
 * Executes Python scripts in a dedicated, ephemeral OS process (`python3 -I`)
 * with CPython PEP 578 `sys.addaudithook` sandboxing, stripped environment
 * variables, a restricted ephemeral filesystem (`/data` and `/output`), and
 * built-in `pandas` (`pd`) / `numpy` (`np`) compatibility.
 *
 * @module @memberjunction/code-execution
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodeExecutionParams, CodeExecutionResult, SandboxOutputFile } from './types';
import { PYTHON_SANDBOX_HARNESS_SOURCE } from './PythonSandboxHarness';

const RESULT_START_MARKER = '__MJ_PYTHON_RESULT_START__';
const RESULT_END_MARKER = '__MJ_PYTHON_RESULT_END__';
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MB cap on stdout/stderr

interface PythonRunnerOptions {
    /**
     * Python executable path (default: `process.env.MJ_CODE_EXECUTION_PYTHON || 'python3'`)
     */
    pythonPath?: string;
}

interface RawPythonResultPayload {
    success: boolean;
    output?: unknown;
    logs?: string[];
    error?: string;
    errorType?: CodeExecutionResult['errorType'];
}

function inferMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
        case '.csv':
            return 'text/csv';
        case '.tsv':
            return 'text/tab-separated-values';
        case '.json':
            return 'application/json';
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.html':
        case '.htm':
            return 'text/html';
        case '.md':
            return 'text/markdown';
        case '.txt':
            return 'text/plain';
        default:
            return 'application/octet-stream';
    }
}

export class PythonRunner {
    private readonly pythonPath: string;

    constructor(options: PythonRunnerOptions = {}) {
        this.pythonPath = options.pythonPath || process.env.MJ_CODE_EXECUTION_PYTHON || 'python3';
    }

    /**
     * Execute a Python script in an isolated sandbox process.
     */
    public async Execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
        const startTime = Date.now();
        const timeoutSeconds = params.timeoutSeconds ?? 30;
        const timeoutMs = timeoutSeconds * 1000;
        const memoryLimitMB = params.memoryLimitMB ?? 256;

        const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-py-sandbox-'));
        const dataDir = path.join(sandboxDir, 'data');
        const outputDir = path.join(sandboxDir, 'output');
        fs.mkdirSync(dataDir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });

        try {
            const csvFiles: string[] = [];
            if (Array.isArray(params.files)) {
                for (const file of params.files) {
                    const safeName = path.basename(file.name || 'file.dat');
                    if (!safeName || safeName.startsWith('.')) {
                        continue;
                    }
                    const buf = file.encoding === 'base64'
                        ? Buffer.from(file.content, 'base64')
                        : Buffer.from(file.content, 'utf-8');
                    const targetPath = path.join(dataDir, safeName);
                    fs.writeFileSync(targetPath, buf);
                    // Also write a copy at the sandbox root so both `pd.read_csv('file.csv')`
                    // and `pd.read_csv('/data/file.csv')` work seamlessly.
                    fs.writeFileSync(path.join(sandboxDir, safeName), buf);
                    if (/\.(csv|tsv)$/i.test(safeName)) {
                        csvFiles.push(safeName);
                    }
                }
            }

            if (csvFiles.length > 0 && !csvFiles.includes('dataset.csv')) {
                const firstCsvPath = path.join(dataDir, csvFiles[0]);
                const aliasDataPath = path.join(dataDir, 'dataset.csv');
                const aliasRootPath = path.join(sandboxDir, 'dataset.csv');
                if (!fs.existsSync(aliasDataPath)) {
                    fs.copyFileSync(firstCsvPath, aliasDataPath);
                }
                if (!fs.existsSync(aliasRootPath)) {
                    fs.copyFileSync(firstCsvPath, aliasRootPath);
                }
            }

            const runnerPath = path.join(sandboxDir, '_mj_runner.py');
            const codePath = path.join(sandboxDir, '_mj_user_code.py');
            const configPath = path.join(sandboxDir, '_mj_config.json');

            fs.writeFileSync(runnerPath, PYTHON_SANDBOX_HARNESS_SOURCE, 'utf-8');
            fs.writeFileSync(codePath, params.code, 'utf-8');
            fs.writeFileSync(
                configPath,
                JSON.stringify({
                    sandboxDir,
                    dataDir,
                    outputDir,
                    codePath,
                    inputData: params.inputData ?? null,
                    csvFiles,
                    timeoutSeconds,
                    memoryLimitMB,
                }),
                'utf-8'
            );

            const runResult = await this.spawnIsolatedPython(runnerPath, configPath, sandboxDir, timeoutMs);
            const executionTimeMs = Date.now() - startTime;

            if (runResult.timedOut) {
                return {
                    success: false,
                    error: `Execution timed out after ${timeoutSeconds} seconds`,
                    errorType: 'TIMEOUT',
                    executionTimeMs,
                };
            }

            const parsed = this.extractResultPayload(runResult.stdout);
            if (!parsed) {
                const errDetail = runResult.stderr.trim() || runResult.stdout.trim() || `Python exited with code ${runResult.exitCode}`;
                const isCpuTimeout = errDetail.includes('SIGXCPU') || runResult.signal === 'SIGXCPU' || runResult.signal === 'SIGKILL';
                return {
                    success: false,
                    error: isCpuTimeout ? `Execution timed out after ${timeoutSeconds} seconds` : errDetail,
                    errorType: isCpuTimeout ? 'TIMEOUT' : 'RUNTIME_ERROR',
                    executionTimeMs,
                };
            }

            const generatedFiles = this.collectOutputFiles(outputDir);

            return {
                success: parsed.success,
                output: parsed.output === null ? undefined : parsed.output,
                logs: parsed.logs,
                files: generatedFiles.length > 0 ? generatedFiles : undefined,
                error: parsed.error,
                errorType: parsed.errorType,
                executionTimeMs,
            };
        } finally {
            try {
                fs.rmSync(sandboxDir, { recursive: true, force: true });
            } catch {
                // Ignore temp cleanup errors
            }
        }
    }

    /** @deprecated Use {@link Execute}. */
    public async execute(params: CodeExecutionParams): Promise<CodeExecutionResult> {
        return this.Execute(params);
    }

    private spawnIsolatedPython(
        runnerPath: string,
        configPath: string,
        sandboxDir: string,
        timeoutMs: number
    ): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null; timedOut: boolean }> {
        return new Promise((resolve) => {
            const child = spawn(this.pythonPath, ['-I', runnerPath, configPath], {
                cwd: sandboxDir,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin',
                    LANG: 'en_US.UTF-8',
                    LC_ALL: 'en_US.UTF-8',
                    PYTHONIOENCODING: 'utf-8',
                    TMPDIR: sandboxDir,
                    HOME: sandboxDir,
                    MPLBACKEND: 'Agg',
                },
            });

            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let settled = false;

            const timer = setTimeout(() => {
                timedOut = true;
                try {
                    child.kill('SIGKILL');
                } catch {
                    // Process already exited
                }
            }, timeoutMs);

            child.stdout.on('data', (chunk: Buffer) => {
                if (stdout.length < MAX_OUTPUT_BYTES) {
                    stdout += chunk.toString('utf-8');
                }
            });

            child.stderr.on('data', (chunk: Buffer) => {
                if (stderr.length < MAX_OUTPUT_BYTES) {
                    stderr += chunk.toString('utf-8');
                }
            });

            child.on('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({
                    stdout,
                    stderr: `${stderr}\nFailed to start Python interpreter (${this.pythonPath}): ${err.message}`.trim(),
                    exitCode: -1,
                    signal: null,
                    timedOut: false,
                });
            });

            child.on('close', (code, signal) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({
                    stdout,
                    stderr,
                    exitCode: code,
                    signal,
                    timedOut,
                });
            });
        });
    }

    private extractResultPayload(stdout: string): RawPythonResultPayload | null {
        const startIdx = stdout.lastIndexOf(RESULT_START_MARKER);
        const endIdx = stdout.lastIndexOf(RESULT_END_MARKER);
        if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
            return null;
        }
        const jsonSlice = stdout.slice(startIdx + RESULT_START_MARKER.length, endIdx).trim();
        try {
            return JSON.parse(jsonSlice) as RawPythonResultPayload;
        } catch {
            return null;
        }
    }

    private collectOutputFiles(outputDir: string): SandboxOutputFile[] {
        const results: SandboxOutputFile[] = [];
        if (!fs.existsSync(outputDir)) {
            return results;
        }
        const entries = fs.readdirSync(outputDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || entry.name.startsWith('.')) {
                continue;
            }
            const fullPath = path.join(outputDir, entry.name);
            const stat = fs.statSync(fullPath);
            if (stat.size === 0 || stat.size > 10 * 1024 * 1024) {
                continue;
            }
            const bytes = fs.readFileSync(fullPath);
            results.push({
                name: entry.name,
                mimeType: inferMimeType(entry.name),
                base64Data: bytes.toString('base64'),
            });
        }
        return results;
    }
}
