import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationProgressEmitter } from '../IntegrationProgressEmitter.js';
import { IntegrationProgressReader } from '../IntegrationProgressReader.js';
import { RUN_ARTIFACT_ROOT_ENV_VAR } from '../RunArtifactRoot.js';
import type { IntegrationRunManifest, IntegrationRunResult } from '../types.js';

/**
 * What a run listing is allowed to COST.
 *
 * `IntegrationListRuns` with `limit:1` once took 73 seconds on ACR dev and then timed out, while
 * every database-backed query on the same box stayed fast (MJ-RUN-5 / MJ-RUN-21). The cause was
 * structural, not incidental: `ListRuns` hydrated every run directory before applying the limit, and
 * each hydration read the whole journal four separate times — latest event, aggregate counts,
 * warnings, line count — over journals holding 12–13 k events with multi-KB payloads on SMB storage.
 * A heap risk as much as an I/O one.
 *
 * These tests assert the READ COUNT, with a spy on the one place the reader touches a file. A timing
 * assertion would flake on CI and would not say what went wrong; a read count names the defect.
 */

/** Counts only journal opens — manifest/result reads are O(1) in the size of a run and always allowed. */
function journalReads(spy: { mock: { calls: unknown[][] } }): number {
    return spy.mock.calls.filter(c => String(c[0]).endsWith('progress.jsonl')).length;
}

/** Spy that keeps the real implementation — the reader must still work while being counted. */
function spyOnFileReads(reader: IntegrationProgressReader) {
    return vi.spyOn(reader as unknown as { safeReadFile(p: string): Promise<string | undefined> }, 'safeReadFile');
}

function manifest(runID: string, over: Partial<IntegrationRunManifest> = {}): IntegrationRunManifest {
    return { runID, runKind: 'SyncRun', startedAt: new Date().toISOString(), ...over };
}

describe('ListRuns read cost', () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(join(tmpdir(), 'mj-run-cost-'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    /** A run with a fat journal, terminated (so it has a result.json). */
    async function writeFinishedRun(runID: string, events = 40): Promise<void> {
        const e = new IntegrationProgressEmitter(manifest(runID), { rootDir, maxRunDirs: 0 });
        e.runStart();
        for (let i = 0; i < events; i++) {
            e.emit('records.batch.complete', { stage: 'contacts', counts: { processed: 10 }, data: { filler: 'x'.repeat(200) } });
        }
        e.stageComplete('contacts', { processed: events * 10, succeeded: events * 10, failed: 0, skipped: 0 });
        await e.complete('done');
    }

    /** A run still in flight — no result.json, so its numbers exist nowhere but the journal. */
    async function writeInFlightRun(runID: string, events = 40): Promise<void> {
        const e = new IntegrationProgressEmitter(manifest(runID), { rootDir, maxRunDirs: 0 });
        e.runStart();
        for (let i = 0; i < events; i++) {
            e.emit('records.batch.complete', { stage: 'contacts', counts: { processed: 10 } });
        }
        await e.flush();
    }

    it('opens ZERO journals for a listing of finished runs', async () => {
        for (let i = 0; i < 60; i++) await writeFinishedRun(`fin-${String(i).padStart(3, '0')}`);
        const reader = new IntegrationProgressReader(rootDir);
        const spy = spyOnFileReads(reader);

        const runs = await reader.ListRuns({}, 1);

        expect(runs).toHaveLength(1);
        // Every number a finished run reports is already in its own result.json.
        expect(journalReads(spy)).toBe(0);
    });

    it('opens exactly ONE journal for limit:1 over 60 in-flight runs — the limit precedes hydration', async () => {
        for (let i = 0; i < 60; i++) await writeInFlightRun(`fly-${String(i).padStart(3, '0')}`);
        const reader = new IntegrationProgressReader(rootDir);
        const spy = spyOnFileReads(reader);

        const runs = await reader.ListRuns({}, 1);

        expect(runs).toHaveLength(1);
        // 1, not 60, and not 240: the filters and the limit are answered from the manifests, and the
        // single survivor's journal is read once for all four derived values.
        expect(journalReads(spy)).toBe(1);
    });

    it('opens at most one journal per RETURNED run, and none for the ones the filter dropped', async () => {
        for (let i = 0; i < 20; i++) await writeInFlightRun(`fly-${String(i).padStart(3, '0')}`, 5);
        for (let i = 0; i < 20; i++) await writeFinishedRun(`fin-${String(i).padStart(3, '0')}`, 5);
        const reader = new IntegrationProgressReader(rootDir);
        const spy = spyOnFileReads(reader);

        const runs = await reader.ListRuns({ inFlightOnly: true }, 5);

        expect(runs).toHaveLength(5);
        expect(runs.every(r => r.isInFlight)).toBe(true);
        expect(journalReads(spy)).toBe(5);
    });

    it("takes a finished run's counts from result.json rather than re-deriving them", async () => {
        const e = new IntegrationProgressEmitter(manifest('counts-run'), { rootDir, maxRunDirs: 0 });
        e.emit('records.batch.complete', { stage: 's1', counts: { processed: 30 } }); // FETCHED — must not aggregate
        e.stageComplete('s1', { processed: 30, succeeded: 28, failed: 1, skipped: 1 });
        e.stageComplete('s2', { processed: 6, succeeded: 6, failed: 0, skipped: 0 });
        await e.complete();

        const reader = new IntegrationProgressReader(rootDir);
        const spy = spyOnFileReads(reader);
        const snap = await reader.GetRun('counts-run');

        expect(journalReads(spy)).toBe(0);
        const onDisk = JSON.parse(await fs.readFile(join(rootDir, 'counts-run', 'result.json'), 'utf-8')) as IntegrationRunResult;
        expect(snap?.counts).toEqual(onDisk.aggregateCounts);
        expect(snap?.counts).toEqual({ processed: 36, succeeded: 34, failed: 1, skipped: 1 });
    });

    it('persists an event count and a final event that match the journal on disk', async () => {
        await writeFinishedRun('persisted', 7);
        const lines = (await fs.readFile(join(rootDir, 'persisted', 'progress.jsonl'), 'utf-8'))
            .split('\n').filter(Boolean).length;

        const snap = await new IntegrationProgressReader(rootDir).GetRun('persisted');

        // The persisted numbers have to be RIGHT, not merely cheap.
        expect(snap?.eventCount).toBe(lines);
        expect(snap?.latestEvent?.eventType).toBe('run.complete');
        expect(snap?.latestEvent?.message).toBe('done');
    });

    it('keeps the journal-derived aggregate in lock-step with the terminal record (the applied-vs-fetched rule)', async () => {
        // NOT the tautology "result.json equals itself". The in-flight snapshot is derived from the
        // journal by the reader; the terminal record is accumulated independently by the emitter. If
        // CountsContributeToAggregate ever drifts between the two, these two numbers diverge.
        const e = new IntegrationProgressEmitter(manifest('lockstep'), { rootDir, maxRunDirs: 0 });
        e.emit('records.batch.complete', { stage: 'c', counts: { processed: 30 } });
        e.heartbeat('c', 'tick', { processed: 30 });
        e.stageComplete('c', { processed: 56, succeeded: 50, failed: 4, skipped: 2 });
        await e.flush();

        const reader = new IntegrationProgressReader(rootDir);
        const derived = (await reader.GetRun('lockstep'))?.counts;
        expect(derived).toEqual({ processed: 56, succeeded: 50, failed: 4, skipped: 2 });

        await e.complete();
        const finished = await reader.GetRun('lockstep');
        expect(finished?.result?.aggregateCounts).toEqual(derived);
    });

    it('falls back to a SINGLE journal pass for a result.json written before the counters existed', async () => {
        await writeFinishedRun('legacy', 6);
        const path = join(rootDir, 'legacy', 'result.json');
        const legacy = JSON.parse(await fs.readFile(path, 'utf-8')) as IntegrationRunResult;
        delete legacy.eventCount;
        delete legacy.latestEvent;
        await fs.writeFile(path, JSON.stringify(legacy, null, 2), 'utf-8');

        const reader = new IntegrationProgressReader(rootDir);
        const spy = spyOnFileReads(reader);
        const snap = await reader.GetRun('legacy');

        // One pass, never four — and the run is still reported as finished with its real numbers.
        expect(journalReads(spy)).toBe(1);
        expect(snap?.isInFlight).toBe(false);
        expect(snap?.eventCount).toBeGreaterThan(0);
        expect(snap?.counts).toEqual(legacy.aggregateCounts);
    });

    it('orders the listing by run START time, so a stranded run is not sunk below newer ones', async () => {
        // The stranded run started FIRST but stopped being written to, so its mtime is the oldest of
        // the three. Under mtime ordering it sorted last and vanished behind the limit — which is the
        // run an operator is looking for.
        const stranded = new IntegrationProgressEmitter(
            manifest('stranded', { startedAt: new Date(Date.now() - 3 * 3600_000).toISOString() }),
            { rootDir, maxRunDirs: 0 }
        );
        stranded.runStart();
        await stranded.flush();
        await fs.utimes(join(rootDir, 'stranded'), new Date(0), new Date(0));

        for (const [id, agoMs] of [['older', 5 * 3600_000], ['newer', 60_000]] as const) {
            const e = new IntegrationProgressEmitter(
                manifest(id, { startedAt: new Date(Date.now() - agoMs).toISOString() }),
                { rootDir, maxRunDirs: 0 }
            );
            e.runStart();
            await e.complete();
        }

        const ids = (await new IntegrationProgressReader(rootDir).ListRuns({}, 10)).map(s => s.manifest.runID);
        expect(ids).toEqual(['newer', 'stranded', 'older']);
    });
});

describe('the artifact root has one env override, honoured by every default', () => {
    const RUN_ID = 'env-override-run';
    let rootDir: string;
    let previous: string | undefined;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(join(tmpdir(), 'mj-run-root-'));
        previous = process.env[RUN_ARTIFACT_ROOT_ENV_VAR];
        process.env[RUN_ARTIFACT_ROOT_ENV_VAR] = rootDir;
    });

    afterEach(async () => {
        if (previous === undefined) delete process.env[RUN_ARTIFACT_ROOT_ENV_VAR];
        else process.env[RUN_ARTIFACT_ROOT_ENV_VAR] = previous;
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    /**
     * All THREE cwd-relative defaults in one test, deliberately: the emitter constructor, the static
     * `Resume`, and the reader constructor. They are separate literals in two files, and an override
     * that covers only some of them is worse than none — the resume path would read a different
     * directory than the emitter wrote to, and a run would simply not exist.
     */
    it('writes, lists and RESUMES a run under the override with no rootDir passed anywhere', async () => {
        const emitter = new IntegrationProgressEmitter(manifest(RUN_ID, { runKind: 'RSU' }));
        emitter.runStart();
        emitter.stageStart('RestartMJAPI');
        await emitter.flush();

        // Written under the override, not under cwd/logs.
        await expect(fs.stat(join(rootDir, RUN_ID, 'manifest.json'))).resolves.toBeTruthy();

        const reader = new IntegrationProgressReader();
        expect((await reader.GetRun(RUN_ID))?.manifest.runKind).toBe('RSU');
        expect((await reader.ListRuns({ inFlightOnly: true }, 10)).map(s => s.manifest.runID)).toEqual([RUN_ID]);

        const resumed = await IntegrationProgressEmitter.Resume(RUN_ID);
        expect(resumed.IsResumed).toBe(true);
        resumed.stageStart('CreateEntityMaps');
        await resumed.flush();
        const after = await reader.GetRun(RUN_ID);
        expect(after?.latestEvent?.stage).toBe('CreateEntityMaps');
    });
});
