/**
 * Pending work must be registered BEFORE CodeGen and the compile, not after.
 *
 * The work becomes owed the moment the migrations succeed — the tables exist, and the pending-work
 * rows are the only durable record that they still need entity maps. Registering after the compile
 * put the two longest, most memory-hungry steps inside the window where a crash loses the work
 * silently, which is exactly where crashes land.
 *
 * Observed 2026-09-14: a kernel OOM kill during CompileTypeScript left 364 tables built, zero
 * entity maps, no pending-work row, and no error anywhere — the only process that could have
 * reported it was the one that died.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';

/** Private surface of the pipeline phase under test. */
type PipelineInternals = {
    runPostMigrationPipeline(inputs: unknown[], successfulItems: unknown[], sharedSteps: unknown[]): Promise<unknown>;
    registerPendingWork(inputs: unknown[]): Promise<{ IDs: Map<unknown, string[]>; Errors: Map<unknown, string[]> }>;
    runStep(name: string, fn: () => Promise<unknown>, steps: unknown[]): Promise<unknown>;
    writePostRestartFiles(inputs: unknown[]): Promise<void>;
    notifyObserverDurable?(ev: unknown): Promise<void>;
};

describe('pending work is registered before the build steps', () => {
    let order: string[];
    let rsm: PipelineInternals;

    beforeEach(() => {
        order = [];
        rsm = RuntimeSchemaManager.Instance as unknown as PipelineInternals;

        vi.spyOn(rsm, 'registerPendingWork').mockImplementation(async () => {
            order.push('registerPendingWork');
            return { IDs: new Map(), Errors: new Map() };
        });
        // Record each named step instead of executing it; every step reports success.
        vi.spyOn(rsm, 'runStep').mockImplementation(async (name: string) => {
            order.push(name);
            return true;
        });
        vi.spyOn(rsm, 'writePostRestartFiles').mockImplementation(async () => { order.push('writePostRestartFiles'); });
        // Only present on builds that publish a durable restart boundary. The fixtures below set
        // SkipRestart, so that path never runs either way — stub it only where it exists.
        if (typeof (rsm as Partial<PipelineInternals>).notifyObserverDurable === 'function') {
            vi.spyOn(rsm, 'notifyObserverDurable').mockImplementation(async () => {});
        }
    });

    const run = async () => {
        const input = { Description: 'test', AffectedTables: ['t'], SkipGitCommit: true, SkipRestart: true };
        const successfulItems = [{ Input: input, FilePath: '/tmp/V1__x.sql' }];
        await rsm.runPostMigrationPipeline([input], successfulItems, []);
    };

    it('registers pending work before RunCodeGen', async () => {
        await run();
        expect(order).toContain('registerPendingWork');
        expect(order).toContain('RunCodeGen');
        expect(order.indexOf('registerPendingWork')).toBeLessThan(order.indexOf('RunCodeGen'));
    });

    it('registers pending work before CompileTypeScript — the step that was killed', async () => {
        await run();
        expect(order).toContain('CompileTypeScript');
        expect(order.indexOf('registerPendingWork')).toBeLessThan(order.indexOf('CompileTypeScript'));
    });

    it('still registers nothing when no migration succeeded', async () => {
        await rsm.runPostMigrationPipeline([{}], [], []);
        expect(order).not.toContain('registerPendingWork');
    });
});
