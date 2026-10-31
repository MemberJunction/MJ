import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationProgressEmitter } from '../IntegrationProgressEmitter.js';
import type { IntegrationRunManifest } from '../types.js';

/**
 * Which run artifacts survive the retention cap.
 *
 * The old rule sorted run dirs newest-first by MTIME and deleted everything past the cap. A run that
 * strands stops being written to, so its mtime freezes at the moment it stranded — which put the
 * evidence for the one failure an operator actually needs to explain at the FRONT of the deletion
 * queue (MJ-RUN-20). The same ordering now also matters to #4414's resume feature: it needs a
 * stranded run dir to still be there, and `IntegrationRunResumeError('not-found')` is what it looks
 * like when another run's start pruned it away.
 *
 * The rules pinned here: order by run START time from the manifest, and sacrifice runs that have a
 * `result.json` before runs that do not.
 */
describe('run-dir retention', () => {
    let rootDir: string;

    beforeEach(async () => { rootDir = await fs.mkdtemp(join(tmpdir(), 'mj-retention-')); });
    afterEach(async () => { await fs.rm(rootDir, { recursive: true, force: true }); });

    function manifest(runID: string, startedAt: Date): IntegrationRunManifest {
        return { runID, runKind: 'SyncRun', startedAt: startedAt.toISOString() };
    }

    const ago = (ms: number) => new Date(Date.now() - ms);

    async function listDirs(): Promise<string[]> {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    }

    /** A run that finished: its outcome is durable in its own result.json. */
    async function finishedRun(runID: string, startedAt: Date, maxRunDirs: number): Promise<void> {
        const e = new IntegrationProgressEmitter(manifest(runID, startedAt), { rootDir, maxRunDirs });
        e.runStart();
        await e.complete();
    }

    /** A run that stopped mid-flight: no result.json, and the journal is the only account of it. */
    async function strandedRun(runID: string, startedAt: Date, maxRunDirs: number): Promise<void> {
        const e = new IntegrationProgressEmitter(manifest(runID, startedAt), { rootDir, maxRunDirs });
        e.runStart();
        e.stageStart('RestartMJAPI');
        await e.flush();
    }

    it('keeps a stranded run with the OLDEST mtime when a new run prunes', async () => {
        await strandedRun('stranded', ago(3 * 3600_000), 2);
        // Freeze its mtime at the epoch: the strongest possible version of the original defect.
        await fs.utimes(join(rootDir, 'stranded'), new Date(0), new Date(0));
        await finishedRun('finished', ago(60_000), 2);

        // The third run's bootstrap prunes: 3 dirs, cap 2 → exactly one goes.
        await finishedRun('fresh', new Date(), 2);

        const remaining = await listDirs();
        expect(remaining).toHaveLength(2);
        expect(remaining).toContain('stranded');  // the evidence survives
        expect(remaining).toContain('fresh');     // the current run is never the casualty
        expect(remaining).not.toContain('finished');
    });

    it('prunes by run START time even when mtime says the opposite', async () => {
        // Both finished, so the result.json exemption cannot be what decides this one.
        await finishedRun('started-first', ago(3 * 3600_000), 2);
        await finishedRun('started-second', ago(60_000), 2);
        // mtime now contradicts start order: the run that started FIRST looks freshest.
        await fs.utimes(join(rootDir, 'started-second'), new Date(0), new Date(0));
        await fs.utimes(join(rootDir, 'started-first'), new Date(), new Date());

        await finishedRun('fresh', new Date(), 2);

        const remaining = await listDirs();
        expect(remaining).toHaveLength(2);
        expect(remaining).not.toContain('started-first');
        expect(remaining).toContain('started-second');
    });

    it('still honours the cap as a hard bound when every run is result-less', async () => {
        // The exemption must not become an unbounded-growth bug: with nothing finished left to give
        // up, the oldest stranded run goes, and the cap holds.
        await strandedRun('s-old', ago(4 * 3600_000), 2);
        await strandedRun('s-mid', ago(2 * 3600_000), 2);
        await strandedRun('s-new', new Date(), 2);

        const remaining = await listDirs();
        expect(remaining).toHaveLength(2);
        expect(remaining).not.toContain('s-old');
        expect(remaining).toContain('s-mid');
        expect(remaining).toContain('s-new');
    });

    it('deletes as many as the cap requires in one pass, oldest finished first', async () => {
        for (const [id, agoMs] of [['f1', 5], ['f2', 4], ['f3', 3], ['f4', 2]] as const) {
            await finishedRun(id, ago(agoMs * 3600_000), 0); // cap 0 while seeding: no pruning
        }
        await finishedRun('current', new Date(), 2); // 5 dirs, cap 2 → three go

        const remaining = await listDirs();
        expect(remaining).toEqual(['current', 'f4'].sort());
    });
});
