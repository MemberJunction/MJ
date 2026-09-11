import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IntegrationProgressEmitter, IntegrationProgressReader } from '@memberjunction/integration-progress-artifacts';
import type { IntegrationProgressEvent, IntegrationRunManifest, IntegrationRunResult } from '@memberjunction/integration-progress-artifacts';
import { RSUPostRestartProgressSession } from '../integration/RSUPostRestartProgress.js';

/**
 * The half of an RSU run that happens after the pipeline restarts the API on itself.
 *
 * What must hold, in order of how badly it hurts when it doesn't:
 *  1. the post-restart events land in the SAME run, above a tailing client's cursor — otherwise the
 *     client polls forever and never learns the connector went live;
 *  2. the run reaches a terminal state — otherwise it stays flagged in-flight forever;
 *  3. a failure names the objects that were never mapped — otherwise the operator's only signal that
 *     something needs re-applying is a log line nobody reads.
 */
describe('RSUPostRestartProgress', () => {
    let rootDir: string;

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'rsu-post-'));
    });

    afterEach(() => {
        rmSync(rootDir, { recursive: true, force: true });
    });

    /**
     * Leaves behind exactly what a killed pre-restart process leaves: a manifest, a journal ending at
     * the restart boundary, and NO result. Returns the client's cursor at the moment of the kill.
     */
    async function killedRunAt(runID: string, companyIntegrationIDs: string[], opts: { checkpoint?: boolean } = {}): Promise<number> {
        const manifest: IntegrationRunManifest = {
            runID,
            runKind: 'RSU',
            triggerType: 'Pipeline',
            startedAt: new Date().toISOString(),
            companyIntegrationIDs,
            companyIntegrationID: companyIntegrationIDs.length === 1 ? companyIntegrationIDs[0] : undefined,
        };
        const e = new IntegrationProgressEmitter(manifest, { rootDir });
        e.runStart('RSU pipeline started');
        e.stageStart('RunCodeGen', 'step 7 of 12');
        e.stageComplete('RunCodeGen');
        e.stageStart('RestartMJAPI', 'step 10 of 12');
        e.stageComplete('RestartMJAPI');
        if (opts.checkpoint !== false) {
            e.checkpoint('RestartMJAPI', {
                runID,
                remainingSteps: ['CreateEntityMaps', 'StartSync'],
                stepIndex: 10,
                stepTotal: 12,
                companyIntegrationIDs,
                pendingWorkIDs: ['PW-1'],
            });
        }
        await e.flush();
        return e.LatestSeq;
    }

    function events(runID: string): IntegrationProgressEvent[] {
        const out: IntegrationProgressEvent[] = [];
        for (const line of readFileSync(join(rootDir, runID, 'progress.jsonl'), 'utf-8').split('\n')) {
            if (!line.trim()) continue;
            try { out.push(JSON.parse(line) as IntegrationProgressEvent); } catch { /* torn */ }
        }
        return out;
    }

    function result(runID: string): IntegrationRunResult {
        return JSON.parse(readFileSync(join(rootDir, runID, 'result.json'), 'utf-8')) as IntegrationRunResult;
    }

    it('emits both missing steps into the original run, visible to a client tailing past the restart', async () => {
        const cursor = await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });

        const progress = await session.For('CI-1');
        expect(progress).not.toBeNull();
        progress!.BeginEntityMaps(3);
        progress!.ObjectMapped('Contacts', 1, 3);
        progress!.ObjectMapped('Accounts', 2, 3);
        progress!.ObjectMapped('Orders', 3, 3);
        progress!.CompleteEntityMaps(3, 3, 0);
        progress!.BeginStartSync();
        progress!.CompleteStartSync('SYNC-RUN-42');
        await session.FinishAll();

        const reader = new IntegrationProgressReader(rootDir);
        const tail = await reader.Tail('rsu-1', cursor);

        // Everything the second process wrote is ABOVE the cursor the first process left the client on.
        expect(tail.length).toBeGreaterThan(0);
        for (const ev of tail) expect(ev.seq).toBeGreaterThan(cursor);

        const kinds = tail.map(e => `${e.eventType}:${e.stage ?? ''}`);
        expect(kinds).toContain('run.resumed:');
        expect(kinds).toContain('stage.start:CreateEntityMaps');
        expect(kinds).toContain('stage.complete:CreateEntityMaps');
        expect(kinds).toContain('stage.start:StartSync');
        expect(kinds).toContain('stage.complete:StartSync');
        expect(kinds).toContain('run.complete:');
    });

    it('reports per-object heartbeats while mapping, without double-counting the stage rollup', async () => {
        await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await session.For('CI-1'))!;
        progress.BeginEntityMaps(2);
        progress.ObjectMapped('Contacts', 1, 2);
        progress.ObjectMapped('Accounts', 2, 2);
        progress.CompleteEntityMaps(2, 2, 0);
        progress.BeginStartSync();
        progress.CompleteStartSync(null);
        await session.FinishAll();

        const beats = events('rsu-1').filter(e => e.eventType === 'progress.heartbeat' && e.stage === 'CreateEntityMaps');
        expect(beats.length).toBe(3); // one on open + one per object
        expect(beats.at(-1)?.counts).toMatchObject({ processed: 2, totalKnown: 2 });

        // Heartbeat counts must NOT feed the aggregate; only the stage rollup does. 2, not 5.
        expect(result('rsu-1').aggregateCounts).toMatchObject({ processed: 2, succeeded: 2, failed: 0 });
    });

    it('carries the sync run id on StartSync so a client can hop to the sync stream', async () => {
        await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await session.For('CI-1'))!;
        progress.BeginEntityMaps(1);
        progress.CompleteEntityMaps(1, 1, 0);
        progress.BeginStartSync();
        progress.CompleteStartSync('SYNC-RUN-42');
        await session.FinishAll();

        const done = events('rsu-1').find(e => e.eventType === 'stage.complete' && e.stage === 'StartSync');
        expect(done?.data).toMatchObject({ syncRunID: 'SYNC-RUN-42' });
        // No counts on this stage — the records belong to the sync's own run.
        expect(done?.counts).toBeUndefined();
    });

    it('continues the determinate stepper from the checkpoint the killed process left', async () => {
        await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await session.For('CI-1'))!;
        progress.BeginEntityMaps(1);
        progress.CompleteEntityMaps(1, 1, 0);
        progress.BeginStartSync();
        progress.CompleteStartSync(null);
        await session.FinishAll();

        const all = events('rsu-1');
        expect(all.find(e => e.eventType === 'stage.start' && e.stage === 'CreateEntityMaps')?.message).toBe('step 11 of 12');
        expect(all.find(e => e.eventType === 'stage.start' && e.stage === 'StartSync')?.message).toBe('step 12 of 12');
    });

    it('still re-attaches when the checkpoint did NOT survive the kill — it just loses the step numbers', async () => {
        // Re-attachment keys off the manifest, not the checkpoint, precisely so a checkpoint racing
        // the kill signal cannot cost the whole continuation.
        const cursor = await killedRunAt('rsu-1', ['CI-1'], { checkpoint: false });
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = await session.For('CI-1');
        expect(progress).not.toBeNull();
        progress!.BeginEntityMaps(1);
        progress!.CompleteEntityMaps(1, 1, 0);
        progress!.BeginStartSync();
        progress!.CompleteStartSync(null);
        await session.FinishAll();

        const reader = new IntegrationProgressReader(rootDir);
        const tail = await reader.Tail('rsu-1', cursor);
        expect(tail.some(e => e.eventType === 'stage.start' && e.stage === 'CreateEntityMaps')).toBe(true);
        expect(tail.find(e => e.eventType === 'stage.start' && e.stage === 'CreateEntityMaps')?.message).toBeUndefined();
        expect(result('rsu-1').success).toBe(true);
    });

    it('names the objects that were never mapped when the work fails', async () => {
        await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await session.For('CI-1'))!;
        progress.BeginEntityMaps(3);
        progress.ObjectMapped('Contacts', 1, 3);
        progress.FailEntityMaps('provider timed out', ['Accounts', 'Orders']);
        await session.FinishAll();

        const err = events('rsu-1').find(e => e.eventType === 'stage.error' && e.stage === 'CreateEntityMaps');
        expect(err?.message).toContain('provider timed out');
        expect(err?.message).toContain('Accounts');
        expect(err?.message).toContain('Orders');
        expect(err?.data).toMatchObject({ code: 'RSU_POST_RESTART_ENTITY_MAPS_FAILED', unmappedObjects: ['Accounts', 'Orders'] });

        const res = result('rsu-1');
        expect(res.success).toBe(false);
        expect(res.exitReason).toBe('failed');
    });

    it('never leaves a stage open when the run terminates', async () => {
        // A stage left open pins a client's stepper on it forever.
        await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await session.For('CI-1'))!;
        progress.BeginEntityMaps(2); // and then the process gives up mid-stage
        await session.FinishAll();

        const all = events('rsu-1');
        const opened = all.filter(e => e.eventType === 'stage.start' && e.stage === 'CreateEntityMaps').length;
        const closed = all.filter(e => (e.eventType === 'stage.complete' || e.eventType === 'stage.error') && e.stage === 'CreateEntityMaps').length;
        expect(opened).toBe(closed);
        expect(result('rsu-1').success).toBe(false);
    });

    it('terminates the run EXACTLY once even when several pending-work items share it', async () => {
        // One RSU batch registers one pending-work row per input; attaching per row would try to
        // resume and terminate the same run repeatedly, and the second attempt would report nothing.
        const cursor = await killedRunAt('rsu-batch', ['CI-1', 'CI-2']);
        const session = new RSUPostRestartProgressSession({ rootDir });

        const a = await session.For('CI-1');
        const b = await session.For('CI-2');
        expect(a).not.toBeNull();
        expect(b).toBe(a); // the SAME continuation, not a second one

        a!.BeginEntityMaps(1);
        a!.CompleteEntityMaps(1, 1, 0);
        a!.BeginStartSync();
        a!.CompleteStartSync('SYNC-A');
        await session.FinishAll();
        await session.FinishAll(); // idempotent

        const terminals = events('rsu-batch').filter(e => e.eventType === 'run.complete' || e.eventType === 'run.fail');
        expect(terminals).toHaveLength(1);
        expect(result('rsu-batch').success).toBe(true);

        const reader = new IntegrationProgressReader(rootDir);
        expect((await reader.Tail('rsu-batch', cursor)).length).toBeGreaterThan(0);
    });

    it('returns null — and never throws — when there is no run to continue', async () => {
        const session = new RSUPostRestartProgressSession({ rootDir });
        expect(await session.For('CI-UNKNOWN')).toBeNull();
        await expect(session.FinishAll()).resolves.toBeUndefined();
    });

    it('does not adopt a run that was not killed at the restart', async () => {
        // An RSU run still legitimately in flight at an earlier step belongs to another process; the
        // last-stage check is what keeps this one from hijacking and terminating it.
        const e = new IntegrationProgressEmitter(
            { runID: 'rsu-early', runKind: 'RSU', startedAt: new Date().toISOString(), companyIntegrationIDs: ['CI-1'] },
            { rootDir }
        );
        e.runStart();
        e.stageStart('RunCodeGen');
        await e.flush();

        const session = new RSUPostRestartProgressSession({ rootDir });
        expect(await session.For('CI-1')).toBeNull();
        expect(existsSync(join(rootDir, 'rsu-early', 'result.json'))).toBe(false);
    });

    it('does not adopt an already-finished run', async () => {
        await killedRunAt('rsu-1', ['CI-1']);
        const first = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await first.For('CI-1'))!;
        progress.BeginEntityMaps(1);
        progress.CompleteEntityMaps(1, 1, 0);
        progress.BeginStartSync();
        progress.CompleteStartSync(null);
        await first.FinishAll();

        // A later boot re-reading the queue must not reopen the closed run.
        const second = new RSUPostRestartProgressSession({ rootDir });
        expect(await second.For('CI-1')).toBeNull();
        expect(result('rsu-1').success).toBe(true);
    });

    it('records a skipped sync as a completed stage, not a silent gap', async () => {
        await killedRunAt('rsu-1', ['CI-1']);
        const session = new RSUPostRestartProgressSession({ rootDir });
        const progress = (await session.For('CI-1'))!;
        progress.BeginEntityMaps(1);
        progress.CompleteEntityMaps(1, 1, 0);
        progress.BeginStartSync();
        progress.SkipStartSync('the caller asked for no initial sync (StartSync=false)');
        await session.FinishAll();

        const done = events('rsu-1').find(e => e.eventType === 'stage.complete' && e.stage === 'StartSync');
        expect(done?.data).toMatchObject({ skipped: true, syncRunID: null });
        expect(result('rsu-1').success).toBe(true);
    });
});
