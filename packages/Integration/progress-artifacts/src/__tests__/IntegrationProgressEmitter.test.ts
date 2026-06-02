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
});
