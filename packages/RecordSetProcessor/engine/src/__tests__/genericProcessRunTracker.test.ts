import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJProcessRunDetailEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import type { RecordRef, RunHandle } from '@memberjunction/record-set-processor-base';
import { GenericProcessRunTracker } from '../trackers/GenericProcessRunTracker';

/** The detail fields the tracker writes, on a plain object standing in for the entity. */
type DetailDouble = Partial<Pick<MJProcessRunDetailEntity, 'ProcessRunID' | 'Status' | 'ErrorMessage' | 'Warnings' | 'ResultPayload'>> & {
    NewRecord: () => void;
    Save: () => Promise<boolean>;
};

/** A provider whose GetEntityObject hands out one detail double. */
function providerFor(detail: DetailDouble): IMetadataProvider {
    // a Pick double of the provider: the tracker only calls GetEntityObject
    const provider: Pick<IMetadataProvider, 'GetEntityObject'> = { GetEntityObject: vi.fn().mockResolvedValue(detail) };
    return provider as IMetadataProvider;
}

const user = { ID: 'u1' } as UserInfo; // only the ID is read
const record: RecordRef = { EntityID: 'ent-1', RecordID: 'r1' };
// a run handle carrying the run entity the tracker reads its ID from; only ID is read here
const handle: RunHandle = { ProcessRunID: 'run-1', run: { ID: 'run-1' } as MJProcessRunEntity };

describe('GenericProcessRunTracker.RecordResult', () => {
    it('writes a succeeded record\'s warnings to the Warnings column as JSON, never to ErrorMessage', async () => {
        const detail: DetailDouble = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) };
        await new GenericProcessRunTracker().RecordResult(handle, record,
            { Status: 'Succeeded', Warnings: ['failed storing cache entry: deadlock', 'second'] }, user, providerFor(detail));
        expect(detail.ErrorMessage).toBeNull();
        expect(detail.Warnings).toBe(JSON.stringify(['failed storing cache entry: deadlock', 'second']));
    });

    it('keeps a failure in ErrorMessage and leaves Warnings empty when there are none', async () => {
        const detail: DetailDouble = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true) };
        await new GenericProcessRunTracker().RecordResult(handle, record,
            { Status: 'Failed', ErrorMessage: 'Feature Value write failed' }, user, providerFor(detail));
        expect(detail.ErrorMessage).toBe('Feature Value write failed');
        expect(detail.Warnings).toBeNull();
    });
});

describe('GenericProcessRunTracker.CompleteRun', () => {
    /** The run-header fields CompleteRun writes, on a plain object standing in for the entity. */
    type RunDouble = Partial<Pick<MJProcessRunEntity, 'ID' | 'Status' | 'ResultSummary' | 'ErrorMessage'>> & { Save: () => Promise<boolean> };
    const counts = { Processed: 1, Success: 1, Error: 0, Skipped: 0, Total: 1 };
    const result = {
        RecordProcessID: 'RP-1', Pin: null, Attempted: 1, Upserted: 1, Unchanged: 0, Previewed: 0,
        RejectedInvalid: 0, BelowConfidence: 0, Failed: 0, Skipped: 0, HumanValuesPreserved: 0, Status: 'completed' as const,
    };
    const complete = async (run: RunDouble, summary: Parameters<GenericProcessRunTracker['CompleteRun']>[1]): Promise<void> => {
        // a handle carrying the run double; the tracker writes header fields and calls Save
        const runHandle: RunHandle = { ProcessRunID: 'run-1', run };
        await new GenericProcessRunTracker().CompleteRun(runHandle, summary, user);
    };

    it('persists a processor run result summary as the run\'s ResultSummary JSON', async () => {
        const run: RunDouble = { ID: 'run-1', ResultSummary: null, Save: vi.fn().mockResolvedValue(true) };
        await complete(run, { ...counts, Status: 'Completed', ResultSummary: result });
        expect(JSON.parse(run.ResultSummary || '{}')).toEqual(result);
    });

    it('leaves ResultSummary alone for a run without one', async () => {
        const run: RunDouble = { ID: 'run-1', ResultSummary: null, Save: vi.fn().mockResolvedValue(true) };
        await complete(run, { ...counts, Status: 'Completed' });
        expect(run.ResultSummary).toBeNull();
    });
});

describe('GenericProcessRunTracker — the detail row waits for its Action log row (#6045)', () => {
    const summary = { Status: 'Completed' as const, Processed: 1, Success: 1, Error: 0, Skipped: 0, Total: 1 };

    /** A run double whose Save records when the run header was written, next to the detail writes. */
    function runDouble(order: string[]) {
        return { ID: 'run-1', Save: vi.fn(async () => { order.push('run-header'); return true; }) };
    }

    it('does not save the detail before ActionExecutionLogPersisted resolves, and RecordResult does not wait for it', async () => {
        const order: string[] = [];
        let landLogRow!: () => void;
        const ActionExecutionLogPersisted = new Promise<void>((r) => { landLogRow = r; });
        const detail: DetailDouble = { NewRecord: vi.fn(), Save: vi.fn(async () => { order.push('detail'); return true; }) };
        const runHandle: RunHandle = { ProcessRunID: 'run-1', run: runDouble(order) };
        const tracker = new GenericProcessRunTracker();

        // RecordResult returns while the log row is still in flight: the loop never waits on it
        await tracker.RecordResult(runHandle, record,
            { Status: 'Succeeded', ActionExecutionLogID: 'log-1', ActionExecutionLogPersisted }, user, providerFor(detail));
        await new Promise((r) => setTimeout(r, 10));
        expect(detail.Save).not.toHaveBeenCalled();

        let completed = false;
        const complete = tracker.CompleteRun(runHandle, summary, user).then(() => { completed = true; });
        await new Promise((r) => setTimeout(r, 10));
        expect(completed).toBe(false); // CompleteRun's flush covers the gated detail

        landLogRow();
        await complete;
        expect(order).toEqual(['detail', 'run-header']);
    });

    it('saves a detail with no ActionExecutionLogPersisted at once, as before', async () => {
        const order: string[] = [];
        const detail: DetailDouble = { NewRecord: vi.fn(), Save: vi.fn(async () => { order.push('detail'); return true; }) };
        const runHandle: RunHandle = { ProcessRunID: 'run-1', run: runDouble(order) };
        const tracker = new GenericProcessRunTracker();

        await tracker.RecordResult(runHandle, record, { Status: 'Succeeded', AIAgentRunID: 'agent-run-1' }, user, providerFor(detail));
        await new Promise((r) => setTimeout(r, 0));
        expect(detail.Save).toHaveBeenCalledTimes(1);

        await tracker.CompleteRun(runHandle, summary, user);
        expect(order).toEqual(['detail', 'run-header']);
    });
});
