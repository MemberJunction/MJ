import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, RemoteOpProgress, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import type { ProcessRunResult } from '@memberjunction/record-set-processor-base';
import { RecordProcessExecutor } from '../RecordProcessExecutor';
import { RecordProcessRunNowServerOperation } from '../operations/RecordProcessControlOperations';

/** A server context that records nothing but the provider and user the operation runs with. */
class StubContext implements RemoteOpServerContext {
    public readonly provider = {} as IMetadataProvider;
    public readonly user = {} as UserInfo;
    public handle?: string;
    public emitProgress = (_progress: RemoteOpProgress): void => undefined;
}

describe('RecordProcess.RunNow: the human-value switch', () => {
    const done: ProcessRunResult = { ProcessRunID: 'run-1', Status: 'Completed', Total: 1, Processed: 1, Success: 1, Error: 0, Skipped: 0 };

    it('keeps human values by default, and overwrites them only when the input asks', async () => {
        const runByID = vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockResolvedValue(done);
        const op = new RecordProcessRunNowServerOperation();
        const ctx = new StubContext();
        await op.ExecuteServer({ recordProcessID: 'rp-1' }, ctx);
        expect(runByID.mock.calls[0][1].overwriteHumanValues).toBe(false);
        expect(runByID.mock.calls[0][1].provider).toBe(ctx.provider);
        await op.ExecuteServer({ recordProcessID: 'rp-1', overwriteHumanValues: true }, ctx);
        expect(runByID.mock.calls[1][1].overwriteHumanValues).toBe(true);
    });
});
