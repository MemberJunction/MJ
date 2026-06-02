import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationProgressEmitter } from '../IntegrationProgressEmitter.js';
import { IntegrationProgressReader } from '../IntegrationProgressReader.js';
import type { IntegrationRunManifest } from '../types.js';

/**
 * Reader unit tests — exercise the file-system read API against artifacts produced
 * by a real emitter: incremental `Tail(sinceSeq)`, counts aggregation, and the new
 * warnings rollup + warningCount surfaced from the `'warning'` event stream.
 */
describe('IntegrationProgressReader', () => {
    let rootDir: string;
    let reader: IntegrationProgressReader;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(join(tmpdir(), 'mj-progress-reader-'));
        reader = new IntegrationProgressReader(rootDir);
    });

    afterEach(async () => {
        await fs.rm(rootDir, { recursive: true, force: true });
    });

    function makeManifest(runID: string): IntegrationRunManifest {
        return {
            runID,
            runKind: 'SyncRun',
            startedAt: new Date().toISOString(),
        };
    }

    function makeEmitter(runID: string): IntegrationProgressEmitter {
        return new IntegrationProgressEmitter(makeManifest(runID), { rootDir });
    }

    describe('GetRun', () => {
        it('returns undefined for an unknown run', async () => {
            expect(await reader.GetRun('nope')).toBeUndefined();
        });

        it('reports in-flight before terminate and not in-flight after', async () => {
            const emitter = makeEmitter('run-flight');
            emitter.runStart();
            await emitter.flush();

            const inFlight = await reader.GetRun('run-flight');
            expect(inFlight?.isInFlight).toBe(true);
            expect(inFlight?.result).toBeUndefined();

            await emitter.complete();
            const done = await reader.GetRun('run-flight');
            expect(done?.isInFlight).toBe(false);
            expect(done?.result?.success).toBe(true);
        });
    });

    describe('Tail sinceSeq incremental', () => {
        it('returns all events for sinceSeq=0 and only newer events for a later seq', async () => {
            const emitter = makeEmitter('run-tail');
            emitter.runStart();
            emitter.stageStart('a');
            emitter.heartbeat('a', 'tick');
            await emitter.flush();

            const all = await reader.Tail('run-tail', 0);
            expect(all.map(e => e.seq)).toEqual([1, 2, 3]);

            const afterFirst = await reader.Tail('run-tail', 1);
            expect(afterFirst.map(e => e.seq)).toEqual([2, 3]);

            const afterAll = await reader.Tail('run-tail', 3);
            expect(afterAll).toEqual([]);
        });

        it('continues correctly across two emission waves (incremental tailing)', async () => {
            const emitter = makeEmitter('run-wave');
            emitter.runStart();
            emitter.stageStart('a');
            await emitter.flush();

            const firstWave = await reader.Tail('run-wave', 0);
            const lastSeq = firstWave[firstWave.length - 1].seq;
            expect(lastSeq).toBe(2);

            emitter.heartbeat('a', 'tick');
            emitter.stageComplete('a');
            await emitter.flush();

            const secondWave = await reader.Tail('run-wave', lastSeq);
            expect(secondWave.map(e => e.seq)).toEqual([3, 4]);
            expect(secondWave.map(e => e.eventType)).toEqual(['progress.heartbeat', 'stage.complete']);
        });
    });

    describe('counts aggregation', () => {
        it('sums per-event counts across the stream', async () => {
            const emitter = makeEmitter('run-counts');
            emitter.stageComplete('s1', { processed: 4, succeeded: 3, failed: 1, skipped: 0 });
            emitter.stageComplete('s2', { processed: 6, succeeded: 6, failed: 0, skipped: 2 });
            await emitter.flush();

            const snap = await reader.GetRun('run-counts');
            expect(snap?.counts).toEqual({ processed: 10, succeeded: 9, failed: 1, skipped: 2 });
        });
    });

    describe('warnings rollup + warningCount', () => {
        it('aggregates warning events into warnings[] with reconstructed shape', async () => {
            const emitter = makeEmitter('run-warn');
            emitter.warning('mapping', 'FIELD_TRUNCATED', 'too long', { field: 'Notes' });
            emitter.warning('mapping', 'NULL_COERCED', 'null coerced to empty');
            await emitter.flush();

            const snap = await reader.GetRun('run-warn');
            expect(snap?.warningCount).toBe(2);
            expect(snap?.warnings).toEqual([
                { code: 'FIELD_TRUNCATED', stage: 'mapping', message: 'too long', data: { field: 'Notes' } },
                { code: 'NULL_COERCED', stage: 'mapping', message: 'null coerced to empty', data: undefined },
            ]);
        });

        it('reports warningCount 0 and no warnings array when none were emitted', async () => {
            const emitter = makeEmitter('run-nowarn');
            emitter.runStart();
            emitter.stageStart('a');
            await emitter.flush();

            const snap = await reader.GetRun('run-nowarn');
            expect(snap?.warningCount).toBe(0);
            expect(snap?.warnings).toBeUndefined();
        });

        it('counts warnings independently of errors', async () => {
            const emitter = makeEmitter('run-mixed');
            emitter.warning('s1', 'W1', 'a warning');
            emitter.stageError('s1', 'a real error', { code: 'E1' });
            await emitter.flush();

            const snap = await reader.GetRun('run-mixed');
            expect(snap?.warningCount).toBe(1);
            expect(snap?.warnings?.[0].code).toBe('W1');
        });
    });

    describe('ListRuns', () => {
        it('lists runs and honors the runKind filter', async () => {
            const sync = makeEmitter('run-list-sync');
            sync.runStart();
            await sync.flush();

            const rsuManifest: IntegrationRunManifest = {
                runID: 'run-list-rsu',
                runKind: 'RSU',
                startedAt: new Date().toISOString(),
            };
            const rsu = new IntegrationProgressEmitter(rsuManifest, { rootDir });
            rsu.runStart();
            await rsu.flush();

            const all = await reader.ListRuns();
            expect(all.map(s => s.manifest.runID).sort()).toEqual(['run-list-rsu', 'run-list-sync']);

            const onlyRsu = await reader.ListRuns({ runKind: 'RSU' });
            expect(onlyRsu.map(s => s.manifest.runID)).toEqual(['run-list-rsu']);
        });
    });
});
