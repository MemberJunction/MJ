import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';
import type { RSUObserverEvent, RSUPipelineInput } from '../RuntimeSchemaManager.js';

/**
 * The shape of an RSU run: which steps it has, how many, and whose run it is.
 *
 * These three things are not cosmetic. The step total is the denominator of the progress bar the
 * setup journey renders, and it used to STOP at the restart — so the bar reached its end while the
 * connector was still not live, which is exactly the "don't preemptively declare it live" failure.
 * The connection identity is what makes the run readable over the API at all.
 */
describe('RSU expected step sequence', () => {
    it('ends with the two steps that only happen AFTER the restart', () => {
        const steps = RuntimeSchemaManager.ExpectedSteps(1);
        expect(steps.slice(-3)).toEqual(['RestartMJAPI', 'CreateEntityMaps', 'StartSync']);
    });

    it('lists the whole single-migration pipeline in execution order', () => {
        expect(RuntimeSchemaManager.ExpectedSteps(1)).toEqual([
            'ValidateEnvironment',
            'ValidateSQL',
            'AcquireLock',
            'WriteMigrationFile',
            'ExecuteMigration',
            'WriteAdditionalSchemaInfo',
            'RunCodeGen',
            'CompileTypeScript',
            'GitCommitAndPR',
            'RestartMJAPI',
            'CreateEntityMaps',
            'StartSync',
        ]);
    });

    it('repeats only the per-item steps as the batch grows', () => {
        const one = RuntimeSchemaManager.ExpectedSteps(1);
        const three = RuntimeSchemaManager.ExpectedSteps(3);
        expect(three.filter(s => s === 'WriteMigrationFile')).toHaveLength(3);
        expect(three.filter(s => s === 'ExecuteMigration')).toHaveLength(3);
        // Shared steps stay singular no matter the batch size.
        for (const shared of ['ValidateEnvironment', 'RunCodeGen', 'RestartMJAPI', 'CreateEntityMaps', 'StartSync']) {
            expect(three.filter(s => s === shared)).toHaveLength(1);
        }
        expect(three.length - one.length).toBe(4);
    });

    it('totals 3 shared-pre + 2 per item + 5 shared-post + 2 post-restart', () => {
        // Stated as the arithmetic rather than a bare number, so a step added to any group has to be
        // accounted for here deliberately.
        for (const n of [1, 2, 5, 12]) {
            expect(RuntimeSchemaManager.ExpectedStepTotal(n)).toBe(3 + n * 2 + 5 + 2);
        }
        expect(RuntimeSchemaManager.ExpectedStepTotal(1)).toBe(12);
        expect(RuntimeSchemaManager.ExpectedStepTotal(2)).toBe(14);
    });

    it('exposes the post-restart step names so both halves of the restart agree on them', () => {
        expect([...RuntimeSchemaManager.EXPECTED_STEPS_POST_RESTART]).toEqual(['CreateEntityMaps', 'StartSync']);
    });
});

describe('RuntimeSchemaManager.CollectCompanyIntegrationIDs', () => {
    function input(over: Partial<RSUPipelineInput> = {}): RSUPipelineInput {
        return { MigrationSQL: 'CREATE TABLE [x].[y] (ID INT NOT NULL);', Description: 'd', AffectedTables: ['x.y'], ...over };
    }
    function pendingFor(companyIntegrationID: string): NonNullable<RSUPipelineInput['PendingWork']> {
        return [{ CompanyIntegrationID: companyIntegrationID, SourceObjectNames: ['Obj'], SchemaName: 'x', CreatedAt: 'now' }];
    }

    it('prefers the explicit CompanyIntegrationID on the input', () => {
        expect(RuntimeSchemaManager.CollectCompanyIntegrationIDs([input({ CompanyIntegrationID: 'A' })])).toEqual(['A']);
    });

    it('falls back to PendingWork, which is how every caller today supplies identity', () => {
        // This fallback is the reason the change needs no call-site edits: the resolver already
        // registers post-restart work against a connection.
        expect(RuntimeSchemaManager.CollectCompanyIntegrationIDs([input({ PendingWork: pendingFor('B') })])).toEqual(['B']);
    });

    it('returns the de-duplicated set for a batch spanning connections, in input order', () => {
        const ids = RuntimeSchemaManager.CollectCompanyIntegrationIDs([
            input({ CompanyIntegrationID: 'A' }),
            input({ PendingWork: pendingFor('B') }),
            input({ CompanyIntegrationID: 'A' }),
        ]);
        expect(ids).toEqual(['A', 'B']);
    });

    it('returns EMPTY for a batch with no identity at all, rather than inventing one', () => {
        // An empty set makes the run unreadable through the per-connection endpoints. That is the
        // conservative outcome and must not be papered over with a placeholder.
        expect(RuntimeSchemaManager.CollectCompanyIntegrationIDs([input()])).toEqual([]);
    });
});

describe('RSU run.start observer payload', () => {
    const originalEnv = { ...process.env };
    let events: RSUObserverEvent[];

    beforeEach(() => {
        events = [];
        process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
        RuntimeSchemaManager.Instance.PipelineObserver = (e) => { events.push(e); };
    });

    afterEach(() => {
        RuntimeSchemaManager.Instance.PipelineObserver = null;
        process.env = { ...originalEnv };
    });

    /**
     * Driven through the REAL pipeline (which bails at ValidateSQL, so no database is touched) —
     * run.start fires before validation, so this asserts the identity and the total as the pipeline
     * actually publishes them, not as a helper recomputes them.
     */
    async function runFailingBatch(inputs: Array<Partial<RSUPipelineInput>>): Promise<void> {
        await RuntimeSchemaManager.Instance.RunPipelineBatch(inputs.map(over => ({
            MigrationSQL: 'ALTER TABLE [__mj].[Entity] ADD NewCol INT;', // rejected at ValidateSQL
            Description: 'd',
            AffectedTables: ['__mj.Entity'],
            ...over,
        })));
    }

    it('carries the connections the batch touches, so the run artifact has an identity', async () => {
        await runFailingBatch([
            { CompanyIntegrationID: 'CI-A' },
            { PendingWork: [{ CompanyIntegrationID: 'CI-B', SourceObjectNames: ['O'], SchemaName: 's', CreatedAt: 'now' }] },
        ]);

        const start = events.find((e): e is Extract<RSUObserverEvent, { Kind: 'run.start' }> => e.Kind === 'run.start');
        expect(start?.CompanyIntegrationIDs).toEqual(['CI-A', 'CI-B']);
    });

    it('publishes a step total that INCLUDES the post-restart steps', async () => {
        await runFailingBatch([{ CompanyIntegrationID: 'CI-A' }]);
        const start = events.find((e): e is Extract<RSUObserverEvent, { Kind: 'run.start' }> => e.Kind === 'run.start');
        // 12, not the 10 it used to be — the bar must not fill up before the connector is live.
        expect(start?.StepTotal).toBe(RuntimeSchemaManager.ExpectedStepTotal(1));
        expect(start?.StepTotal).toBe(12);
    });

    it('survives an observer that returns a REJECTED promise', async () => {
        // The observer contract now allows a promise return. A rejection on the fire-and-forget path
        // must be swallowed, not left to surface as an unhandled rejection mid-migration.
        RuntimeSchemaManager.Instance.PipelineObserver = () => Promise.reject(new Error('observer exploded'));
        await expect(runFailingBatch([{ CompanyIntegrationID: 'CI-A' }])).resolves.toBeUndefined();
    });

    it('bounds how long the pipeline will wait on a durable observer', () => {
        // The wait exists so a checkpoint reaches disk before the kill; the bound exists so a hung
        // observer cannot wedge a schema migration.
        expect(RuntimeSchemaManager.OBSERVER_DURABLE_TIMEOUT_MS).toBeGreaterThan(0);
        expect(RuntimeSchemaManager.OBSERVER_DURABLE_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    });
});
