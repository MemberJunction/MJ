import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';
import type { RSUPipelineInput, RSUPipelineStep } from '../RuntimeSchemaManager.js';

/**
 * The RSU compile has to be stoppable, and a failed one has to stop the pipeline.
 *
 * Sandbox 2026-09-12: `CompileTypeScript` ran for 40 minutes against a 300-second timeout, the
 * customer's whole workspace answered nothing for the duration, and the step only ended when a deploy
 * replaced the release directory underneath it (MJ-RUN-33). Three defects, all pinned here:
 *
 *  1. `promisify(exec)`'s `timeout` signals the `/bin/sh` it spawned, not the process tree below it —
 *     so `turbo`/`tsc` kept running — and the promise does not settle until the pipes close, so the
 *     pipeline waited forever. `detached`, `process.kill`, `SIGKILL` and `killSignal` had ZERO hits in
 *     the whole file.
 *  2. `turbo build` ran with no `--concurrency`, fanning out one `tsc` per package on 2 vCPU / 4 GB.
 *  3. A failed compile did not stop the run: only `ClearOutOfSync()` was gated on it, the git block's
 *     sole guard was `SkipGitCommit`, and the restart brought the API back on an uncompiled tree.
 */

/** The privates under test. Reaching in deliberately: none of this has (or should have) a public surface. */
interface ManagerInternals {
    compileTypeScript(): Promise<boolean>;
    defaultCompileCommand(): string;
    runCodeGen(): Promise<boolean>;
    writeAdditionalSchemaInfo(inputs: RSUPipelineInput[]): Promise<number>;
    gitCommitAndPRForCycle(files: string[], tables: string[], description: string): Promise<string>;
    restartMJAPI(): Promise<boolean>;
    writePostRestartFiles(inputs: RSUPipelineInput[]): Promise<void>;
    registerPendingWork(inputs: RSUPipelineInput[]): Promise<{ IDs: Map<RSUPipelineInput, string[]>; Errors: Map<RSUPipelineInput, string[]> }>;
    runPostMigrationPipeline(
        inputs: RSUPipelineInput[],
        successfulItems: Array<{ Input: RSUPipelineInput; FilePath?: string; Success: boolean; Steps: RSUPipelineStep[]; Error?: string }>,
        sharedSteps: RSUPipelineStep[],
    ): Promise<{ CompileSucceeded?: boolean; CompileError?: string; ApiRestarted: boolean; GitCommitSuccess: boolean }>;
    buildPerCallerResults(
        itemResults: Array<{ Input: RSUPipelineInput; FilePath?: string; Success: boolean; Steps: RSUPipelineStep[]; Error?: string }>,
        successfulItems: Array<{ Input: RSUPipelineInput; FilePath?: string; Success: boolean; Steps: RSUPipelineStep[]; Error?: string }>,
        sharedSteps: RSUPipelineStep[],
        postResult: { ApiRestarted: boolean; GitCommitSuccess: boolean; CodeGenSucceeded?: boolean; CompileSucceeded?: boolean; CompileError?: string },
    ): { Results: Array<{ Success: boolean; ErrorStep?: string; ErrorMessage?: string }> };
    rsuLog(message: string): void;
}

const internals = (): ManagerInternals => RuntimeSchemaManager.Instance as unknown as ManagerInternals;

const input = (over: Partial<RSUPipelineInput> = {}): RSUPipelineInput => ({
    MigrationSQL: 'CREATE TABLE [x].[y] (ID INT NOT NULL);',
    Description: 'd',
    AffectedTables: ['x.y'],
    ...over,
});

/** Whether a pid is still alive. Signal 0 tests for existence without delivering anything. */
function alive(pid: number): boolean {
    try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitUntilGone(pid: number, budgetMs: number): Promise<boolean> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
        if (!alive(pid)) return true;
        await new Promise(r => setTimeout(r, 25));
    }
    return !alive(pid);
}

describe('a compile that exceeds its timeout', () => {
    const originalEnv = { ...process.env };
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(join(tmpdir(), 'rsu-compile-'));
        process.env.RSU_CODEGEN_DIR = dir;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        process.env = { ...originalEnv };
        await fs.rm(dir, { recursive: true, force: true });
    });

    /**
     * Stands in for `tsc`: a GRANDCHILD of the spawned shell that deliberately IGNORES SIGTERM, so
     * only a kill aimed at the whole process group — escalated to SIGKILL — can end it. Signalling
     * just the direct child (what `exec`'s timeout effectively does) leaves this alive, which is the
     * defect: three `tsc` processes still holding a 2-vCPU box after the timeout "fired".
     */
    async function writeStubbornCompileScript(pidFile: string): Promise<string> {
        const script = join(dir, 'fake-compile.sh');
        await fs.writeFile(
            script,
            [
                '#!/bin/sh',
                '# $1 = pid file. The inner shell ignores TERM and writes its own pid.',
                `sh -c 'trap "" TERM; echo $$ > "$0"; while :; do sleep 0.2; done' "$1" &`,
                'wait',
            ].join('\n'),
            { mode: 0o755 },
        );
        return `sh "${script}" "${pidFile}"`;
    }

    it('kills the whole process group, leaves no surviving child, and SETTLES', async () => {
        const pidFile = join(dir, 'child.pid');
        process.env.RSU_COMPILE_COMMAND = await writeStubbornCompileScript(pidFile);
        process.env.RSU_COMPILE_TIMEOUT_MS = '400';
        process.env.RSU_COMMAND_KILL_GRACE_MS = '100';

        const started = Date.now();
        // Settling at all is half the fix: the old promise never resolved, so the pipeline hung
        // rather than failing. `rejects` proves it settled; the elapsed bound proves it settled on
        // the timeout rather than on the command finishing on its own (it would run for ever).
        await expect(internals().compileTypeScript()).rejects.toThrow(/timeout/i);
        expect(Date.now() - started).toBeLessThan(10_000);

        const pid = Number((await fs.readFile(pidFile, 'utf-8')).trim());
        expect(Number.isInteger(pid)).toBe(true);
        expect(await waitUntilGone(pid, 5_000)).toBe(true);
    });

    it('reports a heartbeat with the elapsed compile time', async () => {
        process.env.RSU_COMPILE_COMMAND = 'sleep 0.5';
        process.env.RSU_COMPILE_TIMEOUT_MS = '10000';
        process.env.RSU_COMPILE_HEARTBEAT_MS = '100';
        const logs: string[] = [];
        vi.spyOn(internals(), 'rsuLog').mockImplementation((m: string) => { logs.push(m); });

        await expect(internals().compileTypeScript()).resolves.toBe(true);

        expect(logs.filter(l => /CompileTypeScript still running — \d+s elapsed/.test(l)).length).toBeGreaterThan(0);
        expect(logs.some(l => /CompileTypeScript completed in \d+s/.test(l))).toBe(true);
    });

    it('bounds turbo parallelism in the default command', async () => {
        delete process.env.RSU_COMPILE_COMMAND;
        delete process.env.RSU_COMPILE_CONCURRENCY;
        expect(internals().defaultCompileCommand()).toContain('--concurrency=1');

        process.env.RSU_COMPILE_CONCURRENCY = '2';
        expect(internals().defaultCompileCommand()).toContain('--concurrency=2');
        expect(internals().defaultCompileCommand()).toContain('npx turbo build');
    });
});

describe('a failed compile stops the pipeline before it can do damage', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => { process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1'; });
    afterEach(() => { vi.restoreAllMocks(); process.env = { ...originalEnv }; });

    it('does not commit, does not restart, and does not queue post-restart work', async () => {
        const mgr = internals();
        const item = { Input: input({ CompanyIntegrationID: 'CI-A' }), FilePath: '/tmp/V1__x.sql', Success: true, Steps: [] as RSUPipelineStep[] };
        vi.spyOn(mgr, 'writeAdditionalSchemaInfo').mockResolvedValue(0);
        vi.spyOn(mgr, 'runCodeGen').mockResolvedValue(true);
        vi.spyOn(mgr, 'compileTypeScript').mockRejectedValue(new Error('Command exceeded its 300000ms timeout'));
        const git = vi.spyOn(mgr, 'gitCommitAndPRForCycle').mockResolvedValue('rsu/branch');
        const restart = vi.spyOn(mgr, 'restartMJAPI').mockResolvedValue(true);
        const postRestartFiles = vi.spyOn(mgr, 'writePostRestartFiles').mockResolvedValue(undefined);
        const pending = vi.spyOn(mgr, 'registerPendingWork').mockResolvedValue({ IDs: new Map(), Errors: new Map() });

        const result = await mgr.runPostMigrationPipeline([item.Input], [item], []);

        expect(result.CompileSucceeded).toBe(false);
        expect(result.CompileError).toMatch(/timeout|compile/i);
        expect(git).not.toHaveBeenCalled();          // no PR for code that never built
        expect(restart).not.toHaveBeenCalled();      // and above all: no restart onto an uncompiled tree
        expect(postRestartFiles).not.toHaveBeenCalled();
        expect(pending).not.toHaveBeenCalled();      // nothing would consume it — no restart is coming
        expect(result.ApiRestarted).toBe(false);
        expect(result.GitCommitSuccess).toBe(false);
    });

    it('still commits and restarts when the compile succeeds', async () => {
        // The guard has to be the compile result, not the presence of the guard.
        const mgr = internals();
        const item = { Input: input(), FilePath: '/tmp/V1__x.sql', Success: true, Steps: [] as RSUPipelineStep[] };
        vi.spyOn(mgr, 'writeAdditionalSchemaInfo').mockResolvedValue(0);
        vi.spyOn(mgr, 'runCodeGen').mockResolvedValue(true);
        vi.spyOn(mgr, 'compileTypeScript').mockResolvedValue(true);
        const git = vi.spyOn(mgr, 'gitCommitAndPRForCycle').mockResolvedValue('rsu/branch');
        const restart = vi.spyOn(mgr, 'restartMJAPI').mockResolvedValue(true);
        vi.spyOn(mgr, 'writePostRestartFiles').mockResolvedValue(undefined);
        vi.spyOn(mgr, 'registerPendingWork').mockResolvedValue({ IDs: new Map(), Errors: new Map() });

        const result = await mgr.runPostMigrationPipeline([item.Input], [item], []);

        expect(result.CompileSucceeded).toBe(true);
        expect(git).toHaveBeenCalledTimes(1);
        expect(restart).toHaveBeenCalledTimes(1);
    });

    it("names CompileTypeScript as the caller's failing step rather than reporting success", async () => {
        const item = { Input: input(), FilePath: '/tmp/V1__x.sql', Success: true, Steps: [] as RSUPipelineStep[] };
        const batch = internals().buildPerCallerResults([item], [item], [], {
            ApiRestarted: false,
            GitCommitSuccess: false,
            CodeGenSucceeded: true,
            CompileSucceeded: false,
            CompileError: 'Command exceeded its 300000ms timeout and its process group was killed',
        });

        expect(batch.Results[0].Success).toBe(false);
        expect(batch.Results[0].ErrorStep).toBe('CompileTypeScript');
        expect(batch.Results[0].ErrorMessage).toMatch(/process group was killed/);
    });
});
