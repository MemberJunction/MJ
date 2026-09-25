/**
 * A process that is KILLED never writes its run's terminal result, so the run reads as in-flight
 * forever — indistinguishable from one still working. Observed 2026-09-14: an RSU run OOM-killed
 * during CompileTypeScript still read as in-flight hours later, on a healthy idle workspace.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SweepInterruptedRuns } from '../IntegrationRunReconciler.js';
import { IntegrationProgressReader } from '../IntegrationProgressReader.js';
import type { IntegrationRunResult } from '../types.js';

let root: string;

async function makeRun(runID: string, opts: { terminal?: boolean; stage?: string } = {}) {
    const dir = join(root, runID);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'manifest.json'), JSON.stringify({
        runID, runKind: 'RSU', startedAt: new Date(Date.now() - 60_000).toISOString(),
        companyIntegrationIDs: ['CI-1'],
    }), 'utf-8');
    await fs.writeFile(join(dir, 'progress.jsonl'),
        JSON.stringify({ seq: 1, ts: new Date().toISOString(), type: 'stage.start', stage: opts.stage ?? 'CompileTypeScript' }) + '\n',
        'utf-8');
    if (opts.terminal) {
        await fs.writeFile(join(dir, 'result.json'), JSON.stringify({
            runID, completedAt: new Date().toISOString(), success: true, exitReason: 'completed', durationMs: 5,
        } satisfies IntegrationRunResult), 'utf-8');
    }
    return dir;
}

const readResult = async (runID: string): Promise<IntegrationRunResult> =>
    JSON.parse(await fs.readFile(join(root, runID, 'result.json'), 'utf-8'));

describe('SweepInterruptedRuns', () => {
    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), 'runrec-'));
    });
    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('closes an in-flight run so it stops reading as live', async () => {
        await makeRun('rsu-killed');
        expect((await new IntegrationProgressReader(root).GetRun('rsu-killed'))!.isInFlight).toBe(true);

        const { Swept } = await SweepInterruptedRuns(root);

        expect(Swept).toEqual(['rsu-killed']);
        expect((await new IntegrationProgressReader(root).GetRun('rsu-killed'))!.isInFlight).toBe(false);
    });

    it('records it as killed and unsuccessful, not as completed', async () => {
        await makeRun('rsu-killed');
        await SweepInterruptedRuns(root);
        const result = await readResult('rsu-killed');
        expect(result.exitReason).toBe('killed');
        expect(result.success).toBe(false);
    });

    it('names the step it died on — the one fact a killed run cannot report itself', async () => {
        await makeRun('rsu-killed', { stage: 'CompileTypeScript' });
        await SweepInterruptedRuns(root);
        const result = await readResult('rsu-killed');
        expect(result.errors?.[0].stage).toBe('CompileTypeScript');
        expect(result.errors?.[0].code).toBe('RUN_INTERRUPTED');
        expect(result.errors?.[0].message).toContain('CompileTypeScript');
    });

    it('never overwrites a run that already finished', async () => {
        await makeRun('rsu-done', { terminal: true });
        const { Swept } = await SweepInterruptedRuns(root);
        expect(Swept).toEqual([]);
        expect((await readResult('rsu-done')).exitReason).toBe('completed');
    });

    it('is a no-op on an empty artifact directory', async () => {
        const { Swept, Failed } = await SweepInterruptedRuns(root);
        expect(Swept).toEqual([]);
        expect(Failed).toEqual([]);
    });

    it('is idempotent — a second sweep changes nothing', async () => {
        await makeRun('rsu-killed');
        await SweepInterruptedRuns(root);
        const first = await readResult('rsu-killed');
        const { Swept } = await SweepInterruptedRuns(root);
        expect(Swept).toEqual([]);
        expect(await readResult('rsu-killed')).toEqual(first);
    });
});
