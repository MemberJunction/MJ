import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RSUProgressBridge } from '../integration/RSUProgressBridge.js';
import type { RSUObserverEvent } from '@memberjunction/schema-engine';
import type { IntegrationProgressEvent, IntegrationRunManifest, IntegrationRunResult } from '@memberjunction/integration-progress-artifacts';

/**
 * The bridge is what makes an RSU run tailable: `IntegrationRunKind` has always had an 'RSU' kind
 * and the resolver has always mapped it to an 'RSU' subscription channel, but nothing published to
 * it. These tests drive the observer with the events the pipeline emits and assert the durable
 * artifact that comes out — reading the real JSONL, not a mocked emitter, because the artifact IS
 * the deliverable.
 */
describe('RSUProgressBridge', () => {
    let rootDir: string;
    let bridge: RSUProgressBridge;

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'rsu-bridge-'));
        bridge = new RSUProgressBridge({ rootDir });
    });

    afterEach(() => {
        rmSync(rootDir, { recursive: true, force: true });
    });

    const RUN_START: RSUObserverEvent = {
        Kind: 'run.start',
        ItemCount: 2,
        Descriptions: ['add Orders', 'add OrderItems'],
        AffectedTables: ['Orders', 'OrderItems'],
        StepTotal: 12,
    };

    /** The emitter's writes are chained promises; let them drain before reading from disk. */
    async function settle(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    function runDir(): string {
        return join(rootDir, bridge.CurrentRunID ?? '');
    }

    function readEvents(dir: string): IntegrationProgressEvent[] {
        return readFileSync(join(dir, 'progress.jsonl'), 'utf-8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line) as IntegrationProgressEvent);
    }

    it('opens a run tagged RSU carrying the batch context, and exposes its ID to tail', async () => {
        bridge.Observe(RUN_START);
        const dir = runDir();
        expect(bridge.CurrentRunID).toMatch(/^rsu-/);
        await settle();

        const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as IntegrationRunManifest;
        // The run kind is what routes this onto the 'RSU' subscription channel.
        expect(manifest.runKind).toBe('RSU');
        expect(manifest.triggerType).toBe('Pipeline');
        expect(manifest.context).toMatchObject({
            itemCount: 2,
            affectedTables: ['Orders', 'OrderItems'],
            stepTotal: 12,
        });

        const events = readEvents(dir);
        expect(events[0].eventType).toBe('run.start');
        expect(events[0].message).toContain('2 migration(s)');
    });

    it('records each step as a stage, with its position in the determinate sequence', async () => {
        bridge.Observe(RUN_START);
        const dir = runDir();
        bridge.Observe({ Kind: 'step.start', Name: 'RunCodeGen', StepIndex: 4, StepTotal: 12 });
        bridge.Observe({ Kind: 'step.end', Name: 'RunCodeGen', Status: 'success', DurationMs: 91_000, Message: 'ok' });
        await settle();

        const events = readEvents(dir);
        const start = events.find(e => e.eventType === 'stage.start' && e.stage === 'RunCodeGen');
        const done = events.find(e => e.eventType === 'stage.complete' && e.stage === 'RunCodeGen');

        expect(start?.message).toBe('step 4 of 12');
        expect(done).toBeDefined();
        // Steps are not a countable unit — counts belong to migrations, emitted once at run end.
        expect(done?.counts).toBeUndefined();
    });

    it('records a failed step as a stage error without terminating the run', async () => {
        bridge.Observe(RUN_START);
        const dir = runDir();
        bridge.Observe({
            Kind: 'step.end',
            Name: 'ExecuteMigration',
            Status: 'failed',
            DurationMs: 120,
            Message: 'FK violation on Orders',
        });
        await settle();

        const err = readEvents(dir).find(e => e.eventType === 'stage.error');
        expect(err?.stage).toBe('ExecuteMigration');
        expect(err?.message).toBe('FK violation on Orders');
        expect(err?.data).toMatchObject({ code: 'RSU_STEP_FAILED' });
        // A per-item failure does not abort the batch, so the run must still be open.
        expect(existsSync(join(dir, 'result.json'))).toBe(false);
        expect(bridge.CurrentRunID).not.toBeNull();
    });

    it('completes the run with the migration quartet as the authoritative counts', async () => {
        bridge.Observe(RUN_START);
        const dir = runDir();
        bridge.Observe({ Kind: 'run.end', Success: true, SuccessCount: 2, FailureCount: 0, TotalCount: 2 });
        await settle();

        const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf-8')) as IntegrationRunResult;
        expect(result.success).toBe(true);
        expect(result.exitReason).toBe('completed');
        // Counts are in MIGRATIONS (2), not steps.
        expect(result.aggregateCounts).toMatchObject({ processed: 2, succeeded: 2, failed: 0 });
        // Idle again — nothing to tail.
        expect(bridge.CurrentRunID).toBeNull();
    });

    it('fails the run naming the step that broke it', async () => {
        bridge.Observe(RUN_START);
        const dir = runDir();
        bridge.Observe({
            Kind: 'run.end',
            Success: false,
            SuccessCount: 1,
            FailureCount: 1,
            TotalCount: 2,
            ErrorMessage: 'FK violation on Orders',
            ErrorStep: 'ExecuteMigration',
        });
        await settle();

        const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf-8')) as IntegrationRunResult;
        expect(result.success).toBe(false);
        expect(result.exitReason).toBe('failed');
        expect(result.errors?.[0].message).toContain('ExecuteMigration');
        expect(result.errors?.[0].message).toContain('FK violation on Orders');
        expect(result.errors?.[0].code).toBe('rsu-pipeline-failed');
    });

    it('treats a second run.start as a NEW run and closes the abandoned one', async () => {
        // RunPipelineBatchWithRetry re-enters the pipeline, so a retry legitimately starts a fresh
        // run. What must not happen is the previous run staying in-flight forever.
        bridge.Observe(RUN_START);
        const firstDir = runDir();
        bridge.Observe(RUN_START);
        const secondDir = runDir();
        await settle();

        expect(secondDir).not.toBe(firstDir);
        const abandoned = JSON.parse(readFileSync(join(firstDir, 'result.json'), 'utf-8')) as IntegrationRunResult;
        expect(abandoned.success).toBe(false);
        expect(abandoned.errors?.[0].code).toBe('rsu-run-abandoned');
        // The new run is open and untouched by the abandonment.
        expect(existsSync(join(secondDir, 'result.json'))).toBe(false);
    });

    it('ignores step and run.end events that arrive with no run open', async () => {
        // Defensive: an observer registered mid-run would see a trailing run.end for a run it never
        // saw start. That must be a no-op, not a crash.
        expect(() => {
            bridge.Observe({ Kind: 'step.start', Name: 'AcquireLock' });
            bridge.Observe({ Kind: 'step.end', Name: 'AcquireLock', Status: 'success', DurationMs: 1, Message: 'ok' });
            bridge.Observe({ Kind: 'run.end', Success: true, SuccessCount: 1, FailureCount: 0, TotalCount: 1 });
        }).not.toThrow();
        expect(bridge.CurrentRunID).toBeNull();
    });
});
