import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationProgressEmitter } from '../IntegrationProgressEmitter.js';
import type {
    IntegrationProgressEvent,
    IntegrationRunManifest,
    IntegrationRunResult,
} from '../types.js';

/**
 * Emitter unit tests — exercise the append-only progress stream, monotonic
 * sequencing, the new `warning()` emission shape, counts aggregation, and the
 * warnings rollup written into result.json. All file I/O targets a fresh temp
 * dir per test; no shared state, no DB.
 */
describe('IntegrationProgressEmitter', () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await fs.mkdtemp(join(tmpdir(), 'mj-progress-emitter-'));
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

    function makeEmitter(runID = 'run-1'): IntegrationProgressEmitter {
        return new IntegrationProgressEmitter(makeManifest(runID), { rootDir });
    }

    async function readEvents(runID: string): Promise<IntegrationProgressEvent[]> {
        const raw = await fs.readFile(join(rootDir, runID, 'progress.jsonl'), 'utf-8');
        return raw
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line) as IntegrationProgressEvent);
    }

    async function readResult(runID: string): Promise<IntegrationRunResult> {
        const raw = await fs.readFile(join(rootDir, runID, 'result.json'), 'utf-8');
        return JSON.parse(raw) as IntegrationRunResult;
    }

    describe('append-ordering + monotonic seq', () => {
        it('appends events in emission order with strictly increasing seq starting at 1', async () => {
            const emitter = makeEmitter();
            emitter.runStart('starting');
            emitter.stageStart('stage-a');
            emitter.heartbeat('stage-a', 'tick');
            emitter.stageComplete('stage-a');
            await emitter.flush();

            const events = await readEvents('run-1');
            expect(events.map(e => e.eventType)).toEqual([
                'run.start',
                'stage.start',
                'progress.heartbeat',
                'stage.complete',
            ]);
            expect(events.map(e => e.seq)).toEqual([1, 2, 3, 4]);
        });

        it('keeps seq monotonic across many interleaved emits', async () => {
            const emitter = makeEmitter();
            for (let i = 0; i < 25; i++) {
                emitter.heartbeat('stage', `tick ${i}`);
            }
            await emitter.flush();

            const events = await readEvents('run-1');
            expect(events).toHaveLength(25);
            for (let i = 0; i < events.length; i++) {
                expect(events[i].seq).toBe(i + 1);
                if (i > 0) {
                    expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
                }
            }
        });

        it('drops emits after terminate (no events past run.complete)', async () => {
            const emitter = makeEmitter();
            emitter.runStart();
            await emitter.complete('done');
            emitter.heartbeat('stage', 'should be ignored');
            await emitter.flush();

            const events = await readEvents('run-1');
            const types = events.map(e => e.eventType);
            expect(types).toContain('run.complete');
            expect(types).not.toContain('progress.heartbeat');
        });
    });

    describe('warning() emission shape', () => {
        it('emits a warning event carrying {stage, code, message} with warn level', async () => {
            const emitter = makeEmitter();
            emitter.warning('mapping', 'FIELD_TRUNCATED', 'Value exceeded column width');
            await emitter.flush();

            const events = await readEvents('run-1');
            expect(events).toHaveLength(1);
            const ev = events[0];
            expect(ev.eventType).toBe('warning');
            expect(ev.level).toBe('warn');
            expect(ev.stage).toBe('mapping');
            expect(ev.message).toBe('Value exceeded column width');
            expect(ev.data?.code).toBe('FIELD_TRUNCATED');
        });

        it('merges optional data into the event payload alongside code', async () => {
            const emitter = makeEmitter();
            emitter.warning('mapping', 'FIELD_TRUNCATED', 'truncated', { field: 'Notes', maxLen: 255 });
            await emitter.flush();

            const events = await readEvents('run-1');
            expect(events[0].data).toEqual({ code: 'FIELD_TRUNCATED', field: 'Notes', maxLen: 255 });
        });

        it('does NOT push warnings into the errors rollup', async () => {
            const emitter = makeEmitter();
            emitter.warning('mapping', 'W1', 'a warning');
            await emitter.complete();

            const result = await readResult('run-1');
            expect(result.errors).toBeUndefined();
            expect(result.success).toBe(true);
        });
    });

    describe('counts aggregation', () => {
        it('aggregates per-event counts into result.aggregateCounts', async () => {
            const emitter = makeEmitter();
            emitter.stageComplete('s1', { processed: 10, succeeded: 8, failed: 2, skipped: 0 });
            emitter.stageComplete('s2', { processed: 5, succeeded: 5, failed: 0, skipped: 1 });
            await emitter.complete();

            const result = await readResult('run-1');
            expect(result.aggregateCounts).toEqual({
                processed: 15,
                succeeded: 13,
                failed: 2,
                skipped: 1,
            });
        });

        it('does NOT double-count: a fetched batch.complete + applied stage.complete yields the applied total once', async () => {
            // Regression for the GQL double-count bug: records.batch.complete carries a FETCHED
            // processed count for live progress, stage.complete carries the APPLIED quartet. Only
            // the applied rollup must feed aggregateCounts — summing both reported processed:112
            // for a 56-record sync.
            const emitter = makeEmitter();
            emitter.emit('records.batch.complete', { stage: 'contacts', counts: { processed: 56 } });
            emitter.stageComplete('contacts', { processed: 56, succeeded: 56, failed: 0, skipped: 0 });
            await emitter.complete();

            const result = await readResult('run-1');
            expect(result.aggregateCounts).toEqual({
                processed: 56,
                succeeded: 56,
                failed: 0,
                skipped: 0,
            });
        });

        it('still emits the fetched batch.complete event into the stream (for progress bars)', async () => {
            // The per-batch progress event must remain in the stream with its fetched processed —
            // only the run-level aggregate excludes it.
            const emitter = makeEmitter();
            emitter.emit('records.batch.complete', { stage: 'contacts', counts: { processed: 56 } });
            await emitter.flush();

            const events = await readEvents('run-1');
            const batch = events.find(e => e.eventType === 'records.batch.complete');
            expect(batch).toBeDefined();
            expect(batch?.counts?.processed).toBe(56);
        });

        it('ignores heartbeat counts in the aggregate (in-flight progress, not applied)', async () => {
            const emitter = makeEmitter();
            emitter.heartbeat('contacts', 'fetching', { processed: 30 });
            emitter.heartbeat('contacts', 'fetching', { processed: 56 });
            emitter.stageComplete('contacts', { processed: 56, succeeded: 56, failed: 0, skipped: 0 });
            await emitter.complete();

            const result = await readResult('run-1');
            expect(result.aggregateCounts?.processed).toBe(56);
        });
    });

    describe('warnings rollup + warningCount in result.json', () => {
        it('rolls up emitted warnings with a matching warningCount', async () => {
            const emitter = makeEmitter();
            emitter.warning('s1', 'W1', 'first', { a: 1 });
            emitter.warning('s2', 'W2', 'second');
            await emitter.complete();

            const result = await readResult('run-1');
            expect(result.warningCount).toBe(2);
            expect(result.warnings).toEqual([
                { code: 'W1', stage: 's1', message: 'first', data: { a: 1 } },
                { code: 'W2', stage: 's2', message: 'second', data: undefined },
            ]);
        });

        it('omits the warnings array but reports warningCount 0 when none emitted', async () => {
            const emitter = makeEmitter();
            emitter.runStart();
            await emitter.complete();

            const result = await readResult('run-1');
            expect(result.warnings).toBeUndefined();
            expect(result.warningCount).toBe(0);
        });

        it('records warnings even on a failed run', async () => {
            const emitter = makeEmitter();
            emitter.warning('s1', 'W1', 'heads up');
            await emitter.fail('boom', 'E_BOOM');

            const result = await readResult('run-1');
            expect(result.success).toBe(false);
            expect(result.warningCount).toBe(1);
            expect(result.warnings?.[0].code).toBe('W1');
            // the failure itself lands in errors, not warnings
            expect(result.errors?.some(e => e.message === 'boom')).toBe(true);
        });
    });

    describe('terminal exitReason', () => {
        it('complete() writes success=true / exitReason=completed', async () => {
            const emitter = makeEmitter();
            await emitter.complete('done');
            const result = await readResult('run-1');
            expect(result.success).toBe(true);
            expect(result.exitReason).toBe('completed');
        });

        it('fail() writes success=false / exitReason=failed', async () => {
            const emitter = makeEmitter();
            await emitter.fail('boom');
            const result = await readResult('run-1');
            expect(result.success).toBe(false);
            expect(result.exitReason).toBe('failed');
        });

        it('fail() with the budget-exhausted code writes exitReason=budget-exhausted', async () => {
            const emitter = makeEmitter();
            await emitter.fail('out of budget', 'budget-exhausted');
            const result = await readResult('run-1');
            expect(result.exitReason).toBe('budget-exhausted');
        });

        it('cancel() writes success=false / exitReason=aborted and emits a run.cancel event', async () => {
            const emitter = makeEmitter();
            await emitter.cancel('Sync cancelled by user');

            const result = await readResult('run-1');
            expect(result.success).toBe(false);
            expect(result.exitReason).toBe('aborted');

            const events = await readEvents('run-1');
            expect(events.some(e => e.eventType === 'run.cancel')).toBe(true);
            // a cancel is a warning, not an error — it must NOT land in the errors rollup
            expect(result.errors).toBeUndefined();
        });

        it('cancel() is a no-op after the run already terminated', async () => {
            const emitter = makeEmitter();
            await emitter.complete('done');
            await emitter.cancel('too late');

            const result = await readResult('run-1');
            // the first terminal write wins — still completed, not overwritten by the late cancel
            expect(result.exitReason).toBe('completed');
        });
    });

    describe('run-dir retention', () => {
        async function listDirs(): Promise<string[]> {
            const entries = await fs.readdir(rootDir, { withFileTypes: true });
            return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
        }

        it('prunes oldest run dirs beyond maxRunDirs, always keeping the newest', async () => {
            // Create old-1 and force its mtime to the epoch so it is deterministically the oldest.
            const e1 = new IntegrationProgressEmitter(makeManifest('old-1'), { rootDir, maxRunDirs: 2 });
            await e1.flush();
            await fs.utimes(join(rootDir, 'old-1'), new Date(0), new Date(0));

            const e2 = new IntegrationProgressEmitter(makeManifest('old-2'), { rootDir, maxRunDirs: 2 });
            await e2.flush();
            // Third run: 3 dirs > cap of 2 → bootstrap prunes the single oldest (old-1).
            const e3 = new IntegrationProgressEmitter(makeManifest('new-3'), { rootDir, maxRunDirs: 2 });
            await e3.flush();

            const remaining = await listDirs();
            expect(remaining.length).toBe(2);
            expect(remaining).toContain('new-3');     // newest always kept
            expect(remaining).not.toContain('old-1');  // oldest pruned
        });

        it('disables pruning when maxRunDirs is 0', async () => {
            for (const id of ['a', 'b', 'c']) {
                const e = new IntegrationProgressEmitter(makeManifest(id), { rootDir, maxRunDirs: 0 });
                await e.flush();
            }
            expect((await listDirs()).length).toBe(3); // nothing pruned
        });
    });
});
