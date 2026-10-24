import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationProgressEmitter, IntegrationRunResumeError } from '../IntegrationProgressEmitter.js';
import { IntegrationProgressReader } from '../IntegrationProgressReader.js';
import type { IntegrationProgressEvent, IntegrationRunManifest, IntegrationRunResult } from '../types.js';

/**
 * Resumption is what makes a run that kills its own process finishable.
 *
 * The failure it prevents is specific and silent: a fresh emitter restarts its sequence at 1, and
 * the tail API returns strictly `seq > cursor`, so a client that was already tailing at seq 40
 * would never see events 1..N from the new process — while the resolver echoed its unchanged cursor
 * back and it polled forever receiving nothing. Every test here reads the real artifacts on disk,
 * because the artifacts ARE the contract.
 */
describe('IntegrationProgressEmitter.Resume', () => {
    let rootDir: string;

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'pa-resume-'));
    });

    afterEach(() => {
        rmSync(rootDir, { recursive: true, force: true });
    });

    const RUN_ID = 'rsu-resume-test';

    function manifest(over: Partial<IntegrationRunManifest> = {}): IntegrationRunManifest {
        return {
            runID: RUN_ID,
            runKind: 'RSU',
            triggerType: 'Pipeline',
            startedAt: new Date(Date.now() - 60_000).toISOString(),
            companyIntegrationID: 'CI-1',
            companyIntegrationIDs: ['CI-1'],
            context: { itemCount: 1 },
            ...over,
        };
    }

    /** Writes the pre-restart half of a run and abandons it, exactly as a killed process leaves it. */
    async function writeKilledRun(over: Partial<IntegrationRunManifest> = {}): Promise<number> {
        const first = new IntegrationProgressEmitter(manifest(over), { rootDir });
        first.runStart('RSU pipeline started');
        first.stageStart('ValidateSQL');
        first.stageComplete('ValidateSQL');
        first.stageStart('RestartMJAPI', 'step 8 of 10');
        first.stageComplete('RestartMJAPI');
        first.checkpoint('RestartMJAPI', { stepIndex: 8, stepTotal: 10 });
        await first.flush();
        return first.LatestSeq;
    }

    /** Parses the journal the way the reader does — tolerating a line the kill tore in half. */
    function readEvents(): IntegrationProgressEvent[] {
        const out: IntegrationProgressEvent[] = [];
        for (const line of readFileSync(join(rootDir, RUN_ID, 'progress.jsonl'), 'utf-8').split('\n')) {
            if (!line.trim()) continue;
            try { out.push(JSON.parse(line) as IntegrationProgressEvent); } catch { /* torn line */ }
        }
        return out;
    }

    it('continues the sequence, so a client tailing from PAST the restart still sees the new events', async () => {
        // THE test. A client's cursor sits at the last pre-restart sequence; everything the resumed
        // process writes must land above it.
        const cursor = await writeKilledRun();
        expect(cursor).toBeGreaterThan(0);

        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        resumed.runResumed('back after the restart');
        resumed.stageStart('CreateEntityMaps', 'step 9 of 10');
        resumed.stageComplete('CreateEntityMaps', { processed: 3, succeeded: 3, failed: 0 });
        await resumed.flush();

        const reader = new IntegrationProgressReader(rootDir);
        const tail = await reader.Tail(RUN_ID, cursor);

        expect(tail.length).toBe(3);
        expect(tail.map(e => e.eventType)).toEqual(['run.resumed', 'stage.start', 'stage.complete']);
        // Strictly increasing above the client's cursor — the whole point.
        expect(tail[0].seq).toBe(cursor + 1);
        for (const ev of tail) expect(ev.seq).toBeGreaterThan(cursor);
        // And the resumed announcement says where it picked up from.
        expect(tail[0].data).toMatchObject({ triggerType: 'Restart', resumedFromSeq: cursor });
    });

    it('uses the already-declared resumed/restart vocabulary rather than a new event type', async () => {
        await writeKilledRun();
        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        resumed.runResumed('back');
        await resumed.flush();

        const ev = readEvents().find(e => e.eventType === 'run.resumed');
        expect(ev).toBeDefined();
        expect(ev?.data?.triggerType).toBe('Restart');
    });

    it('PRESERVES the manifest — a resumed run is never rewritten, so a concurrent read cannot see it vanish', async () => {
        await writeKilledRun();
        const manifestPath = join(rootDir, RUN_ID, 'manifest.json');
        const before = readFileSync(manifestPath, 'utf-8');

        // Enforced by the filesystem, not by inspection: a read-only manifest makes any write attempt
        // throw, which surfaces through the emitter's write chain and fails flush(). If this test
        // passes, nothing tried to rewrite it.
        chmodSync(manifestPath, 0o444);
        try {
            const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
            resumed.stageStart('CreateEntityMaps');
            await expect(resumed.flush()).resolves.toBeUndefined();

            expect(readFileSync(manifestPath, 'utf-8')).toBe(before);
        } finally {
            chmodSync(manifestPath, 0o644);
        }
    });

    it('keeps the run readable throughout resumption — GetRun never reports it as missing', async () => {
        await writeKilledRun();
        const reader = new IntegrationProgressReader(rootDir);

        // Hammer the reader while the resumed emitter bootstraps and writes. A truncate-or-create
        // manifest write would open a window where GetRun returns undefined — i.e. "run does not
        // exist" — and this loop is sized to land inside it.
        let missing = 0;
        const polling = (async () => {
            for (let i = 0; i < 300; i++) {
                if (!await reader.GetRun(RUN_ID)) missing++;
            }
        })();

        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        for (let i = 0; i < 50; i++) resumed.heartbeat('CreateEntityMaps', `object ${i}`);
        await resumed.flush();
        await polling;

        expect(missing).toBe(0);
    });

    it('writes the terminal result EXACTLY once, and refuses to resume a run that already has one', async () => {
        await writeKilledRun();
        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        await resumed.complete('done');

        const resultPath = join(rootDir, RUN_ID, 'result.json');
        const firstResult = readFileSync(resultPath, 'utf-8');

        // Second terminal call on the same emitter: no-op.
        await resumed.fail('should not overwrite');
        expect(readFileSync(resultPath, 'utf-8')).toBe(firstResult);

        // A second process trying to resume the now-terminal run is refused rather than reopening it.
        await expect(IntegrationProgressEmitter.Resume(RUN_ID, { rootDir })).rejects.toBeInstanceOf(IntegrationRunResumeError);
        await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir }).catch((e: IntegrationRunResumeError) => {
            expect(e.Reason).toBe('already-terminal');
        });
        expect(readFileSync(resultPath, 'utf-8')).toBe(firstResult);
    });

    it('carries the pre-restart aggregate, errors and checkpoint into the terminal result', async () => {
        // The result must describe the WHOLE run, not just the tail after the restart — otherwise a
        // resumed run reports zero for work that demonstrably happened.
        const first = new IntegrationProgressEmitter(manifest(), { rootDir });
        first.runStart();
        first.stageComplete('ExecuteMigration', { processed: 2, succeeded: 2, failed: 0 });
        first.stageError('WriteMigrationFile', 'disk full', { code: 'EIO' });
        first.warning('RunCodeGen', 'SLOW', 'codegen took 4m');
        first.checkpoint('RestartMJAPI', { stepIndex: 8, stepTotal: 10 });
        await first.flush();

        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        resumed.stageComplete('CreateEntityMaps', { processed: 3, succeeded: 3, failed: 0 });
        await resumed.complete('done');

        const result = JSON.parse(readFileSync(join(rootDir, RUN_ID, 'result.json'), 'utf-8')) as IntegrationRunResult;
        expect(result.aggregateCounts).toMatchObject({ processed: 5, succeeded: 5, failed: 0 });
        expect(result.errors?.some(e => e.message === 'disk full' && e.code === 'EIO')).toBe(true);
        expect(result.warningCount).toBe(1);
        expect(result.resumableFromSeq).toBeDefined();
        // Duration spans from the ORIGINAL start, not from the moment of resumption.
        expect(result.durationMs).toBeGreaterThanOrEqual(60_000);
    });

    it('refuses to resume a run that does not exist', async () => {
        await expect(IntegrationProgressEmitter.Resume('no-such-run', { rootDir })).rejects.toMatchObject({ Reason: 'not-found' });
    });

    it('survives a torn journal line and still continues above the highest surviving sequence', async () => {
        // A process killed mid-append can leave a half-written last line. Resumption must not restart
        // the sequence because of it.
        await writeKilledRun();
        const path = join(rootDir, RUN_ID, 'progress.jsonl');
        const events = readEvents();
        const highest = Math.max(...events.map(e => e.seq));
        const { appendFileSync } = await import('node:fs');
        appendFileSync(path, '{"ts":"2026-01-01T00:00:00.000Z","seq":99,"eventTy', 'utf-8');

        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        resumed.stageStart('CreateEntityMaps');
        await resumed.flush();

        // The torn fragment is confined to its own line, and the resumed event is intact and above
        // the highest surviving sequence — NOT spliced onto the broken line and lost with it.
        const after = readEvents();
        expect(after.some(e => e.stage === 'CreateEntityMaps' && e.eventType === 'stage.start')).toBe(true);
        expect(Math.max(...after.map(e => e.seq))).toBe(highest + 1);
    });

    it('does NOT prune other runs when resuming — a resumed run is an old dir, not a new one', async () => {
        // pruneOldRuns deletes the oldest dirs by mtime. Running it on resume could evict live runs,
        // or the resumed run itself.
        const other = new IntegrationProgressEmitter(
            { runID: 'other-run', runKind: 'SyncRun', startedAt: new Date().toISOString() },
            { rootDir, maxRunDirs: 1 }
        );
        other.runStart();
        await other.flush();
        await writeKilledRun();

        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir, maxRunDirs: 1 });
        resumed.stageStart('CreateEntityMaps');
        await resumed.flush();

        expect(existsSync(join(rootDir, 'other-run', 'manifest.json'))).toBe(true);
        expect(existsSync(join(rootDir, RUN_ID, 'manifest.json'))).toBe(true);
        // And the resumed run's own dir is intact.
        expect(statSync(join(rootDir, RUN_ID)).isDirectory()).toBe(true);
    });

    it('reports itself as resumed, and a fresh emitter as not', async () => {
        await writeKilledRun();
        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID, { rootDir });
        expect(resumed.IsResumed).toBe(true);
        expect(resumed.RunID).toBe(RUN_ID);
        await resumed.flush();

        const fresh = new IntegrationProgressEmitter(
            { runID: 'fresh', runKind: 'RSU', startedAt: new Date().toISOString() },
            { rootDir }
        );
        expect(fresh.IsResumed).toBe(false);
        await fresh.flush();
    });
});

describe('IntegrationProgressReader connection identity', () => {
    it('reads the full set for a batch run, and falls back to the singular field for a single-connection run', () => {
        const batch: IntegrationRunManifest = {
            runID: 'r1', runKind: 'RSU', startedAt: 'x',
            companyIntegrationIDs: ['A', 'B'],
        };
        const single: IntegrationRunManifest = {
            runID: 'r2', runKind: 'SyncRun', startedAt: 'x',
            companyIntegrationID: 'A',
        };
        const none: IntegrationRunManifest = { runID: 'r3', runKind: 'Other', startedAt: 'x' };

        expect(IntegrationProgressReader.CompanyIntegrationIDsFor(batch)).toEqual(['A', 'B']);
        expect(IntegrationProgressReader.CompanyIntegrationIDsFor(single)).toEqual(['A']);
        expect(IntegrationProgressReader.CompanyIntegrationIDsFor(none)).toEqual([]);

        expect(IntegrationProgressReader.RunCoversCompanyIntegration(batch, 'B')).toBe(true);
        expect(IntegrationProgressReader.RunCoversCompanyIntegration(batch, 'C')).toBe(false);
        expect(IntegrationProgressReader.RunCoversCompanyIntegration(none, 'A')).toBe(false);
    });

    it('lists a batch run when scoped to ANY of its connections', async () => {
        const rootDir = mkdtempSync(join(tmpdir(), 'pa-list-'));
        try {
            const e = new IntegrationProgressEmitter(
                {
                    runID: 'batch-run', runKind: 'RSU', startedAt: new Date().toISOString(),
                    companyIntegrationIDs: ['A', 'B'],
                },
                { rootDir }
            );
            e.runStart();
            await e.flush();

            const reader = new IntegrationProgressReader(rootDir);
            expect((await reader.ListRuns({ companyIntegrationID: 'A' })).map(s => s.manifest.runID)).toEqual(['batch-run']);
            expect((await reader.ListRuns({ companyIntegrationID: 'B' })).map(s => s.manifest.runID)).toEqual(['batch-run']);
            expect(await reader.ListRuns({ companyIntegrationID: 'C' })).toEqual([]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});
