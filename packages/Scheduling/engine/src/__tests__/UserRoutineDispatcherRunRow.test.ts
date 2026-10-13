/**
 * The run row's terminal status — the only part of `UserRoutineDispatcherDriver` where a mistake
 * writes a durable lie rather than an error.
 *
 * All three behaviours here were found by execution, not by reading, and each one reported success
 * while the database said otherwise:
 *
 *   · `finalizeRunRow` set `Status = 'Success'` in memory, `Save()` failed on the
 *     `FK_UserRoutineRun_ActionExecutionLog` foreign key, the code logged and carried on, and
 *     `executeRoutine` returned that IN-MEMORY status. The sweep reported success; the row stayed
 *     `Running` forever with nothing to reconcile it.
 *   · The FK rejection is a RACE, not a bad id: action-execution logging is fire-and-forget, so
 *     `LogEntry.ID` is a valid identifier for a row whose INSERT has not landed yet.
 *   · The catch added to fix the first item then overwrote an ALREADY-COMMITTED `Success` with
 *     `Failed` whenever the bookkeeping after `finalizeRunRow` threw — inventing the same
 *     status/disk disagreement one layer up.
 *
 * These drive the real driver with stubbed collaborators, because the failures live in the
 * ordering of saves, which is exactly what a mock of the driver itself would erase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Partial mocks: keep the real modules (the driver's import graph is wide) and override only the
// few things that would reach a database or a class registry.
vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    Metadata: vi.fn().mockImplementation(() => ({ GetEntityObject: vi.fn(), Provider: {} })),
}));
vi.mock('@memberjunction/ai-agents', () => ({ AgentRunner: class {} }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } } }));

import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

/**
 * A run row that records every save, and can be told to reject specific ones.
 *
 * The double models `OldValue` because the production code reads it: `BaseEntity.finalizeSave`
 * runs only on a save that returned a row and calls `SetMany(…, replaceOldValues = true)`, so
 * `OldValue` advances ONLY when a write lands. A double that ignored this would let a test set
 * `Status` in memory and call it "committed" — which is exactly the confusion that let the seam
 * bug through, so the double has to be able to tell the two apart.
 */
function makeRun(reject: (attempt: number, row: Record<string, unknown>) => boolean = () => false) {
    const saves: Array<{ Status: unknown; ErrorMessage: unknown; Link: unknown }> = [];
    let attempt = 0;
    let persistedStatus: unknown = 'Running';
    const run: Record<string, unknown> = {
        ID: 'RUN-1', Status: 'Running', ErrorMessage: null, CompletedAt: null,
        ResultSummary: null, ResultHash: null,
        AgentRunID: null, PromptRunID: null, ActionExecutionLogID: null,
        LatestResult: { CompleteMessage: 'FK violation: FK_UserRoutineRun_ActionExecutionLog' },
        GetFieldByName: (name: string) =>
            name === 'Status' ? { get OldValue() { return persistedStatus; } } : undefined,
        Save: async () => {
            attempt++;
            if (reject(attempt, run)) return false;
            persistedStatus = run.Status;   // the write landed — disk now agrees with memory
            saves.push({ Status: run.Status, ErrorMessage: run.ErrorMessage, Link: run.ActionExecutionLogID });
            return true;
        },
    };
    /** Mark the row as already committed on disk, the way a prior successful save would have. */
    const commit = (status: string) => { run.Status = status; persistedStatus = status; };
    return { run, saves, commit, attempts: () => attempt, persisted: () => persistedStatus };
}

type Driver = UserRoutineDispatcherDriver & {
    finalizeRunRow(run: unknown, outcome: unknown, summary: string, hash: string): Promise<void>;
    executeRoutine(routine: unknown, context: unknown): Promise<{ RunStatus: string }>;
    runAndRecord(routine: unknown, run: unknown, context: unknown): Promise<unknown>;
    createRunRow(routine: unknown, user: unknown): Promise<unknown>;
    logError(...args: unknown[]): void;
    log(...args: unknown[]): void;
};

const OUTCOME = {
    Success: true, ResultContent: 'ok', ErrorMessage: null,
    AgentRunID: null, PromptRunID: null, ActionExecutionLogID: 'LOG-1',
};

describe('UserRoutineDispatcherDriver run-row status', () => {
    let driver: Driver;

    beforeEach(() => {
        driver = new UserRoutineDispatcherDriver() as Driver;
        driver.logError = vi.fn();
        driver.log = vi.fn();
    });

    it('records a terminal status even when the linkage FK rejects the first save', async () => {
        // The FK points at a row the action engine INSERTs fire-and-forget, so it may not exist
        // yet. The run's own status must not be hostage to that: losing a diagnostic link is an
        // observability loss, losing the status is a correctness one.
        const { run, saves } = makeRun((n) => n === 1); // first save (with linkage) rejected

        await driver.finalizeRunRow(run, OUTCOME, 'summary', 'hash');

        expect(run.Status, 'the row must reach a terminal status').toBe('Success');
        expect(saves.length, 'the status write must have landed').toBeGreaterThan(0);
        expect(saves[0].Status).toBe('Success');
        expect(saves[0].Link, 'the first successful write drops the unresolvable linkage').toBeNull();
    });

    it('re-attaches the linkage once the fire-and-forget INSERT lands', async () => {
        const { run, saves } = makeRun((n) => n === 1); // only the first attempt races

        await driver.finalizeRunRow(run, OUTCOME, 'summary', 'hash');

        expect(run.ActionExecutionLogID, 'linkage must be restored on retry').toBe('LOG-1');
        expect(saves.some((s) => s.Link === 'LOG-1')).toBe(true);
    });

    it('never reports Success from memory when the status was never written', async () => {
        // The original defect: Status set in memory, every Save rejected, caller returns the
        // in-memory value. The row says Running; the sweep says Success.
        const { run } = makeRun(() => true); // nothing can be written

        await expect(driver.finalizeRunRow(run, OUTCOME, 'summary', 'hash')).rejects.toThrow(/stuck at 'Running'/);
    });

    it('does NOT overwrite an already-committed outcome when later bookkeeping throws', async () => {
        // `updateRoutineAfterRun` and the notification save run after the outcome is committed. A
        // throw from there must not rewrite a run that genuinely succeeded — that would put the run
        // and its routine's LastRunStatus into disagreement.
        const { run, saves, commit } = makeRun();
        commit('Success');   // genuinely on disk, not merely set in memory
        run.ErrorMessage = null;
        driver.createRunRow = async () => run;
        driver.runAndRecord = async () => { throw new Error('routine row update blew up'); };

        const summary = await driver.executeRoutine({ ID: 'R-1', Name: 'R' }, { ContextUser: { ID: 'u' } });

        expect(run.Status, 'the committed outcome must survive').toBe('Success');
        expect(summary.RunStatus, 'and the summary must report what is on disk').toBe('Success');
        expect(saves.every((s) => s.Status !== 'Failed'), 'no Failed write may be issued').toBe(true);
    });

    it('does NOT mistake finalizeRunRow\'s in-memory Success for a committed one', async () => {
        // THE SEAM. Every other test here proves one layer in isolation: the "never reports Success
        // from memory" case calls `finalizeRunRow` directly and never reaches the catch, and the two
        // `executeRoutine` cases stub `runAndRecord` so `finalizeRunRow` never runs. Composed, they
        // reintroduce the defect both were written to fix — `finalizeRunRow` sets Status='Success',
        // every save is rejected, it throws, and the catch reading the IN-MEMORY value concludes the
        // outcome was already committed and leaves the row at 'Running' forever while reporting
        // Success to the sweep.
        const { run, saves, persisted } = makeRun(() => true);   // nothing can ever be written
        driver.createRunRow = async () => run;
        driver.runAndRecord = async (_r, runRow) => driver.finalizeRunRow(runRow, OUTCOME, 'summary', 'hash');

        const summary = await driver.executeRoutine({ ID: 'R-1', Name: 'R' }, { ContextUser: { ID: 'u' } });

        expect(saves.length, 'nothing reached the database').toBe(0);
        expect(persisted(), 'so the row is still Running on disk').toBe('Running');
        expect(summary.RunStatus, 'and the sweep must not claim Success for it').not.toBe('Success');
    });

    it('DOES drive a still-Running row to Failed when the bookkeeping throws', async () => {
        // The other half — the case the catch exists for.
        const { run, saves } = makeRun();
        driver.createRunRow = async () => run;
        driver.runAndRecord = async () => { throw new Error('exploded before finalize'); };

        const summary = await driver.executeRoutine({ ID: 'R-1', Name: 'R' }, { ContextUser: { ID: 'u' } });

        expect(run.Status).toBe('Failed');
        expect(summary.RunStatus).toBe('Failed');
        expect(String(saves.at(-1)?.ErrorMessage)).toMatch(/exploded before finalize/);
    });
});
