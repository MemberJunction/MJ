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

describe('RecordProcess.RunNow: a dry run that a real run would be refused (F16)', () => {
    it('returns why the real run would be refused, from the run\'s Feature Pipeline result', async () => {
        const refusal = 'Feature Pipeline version v6 is not activated';
        const dry: ProcessRunResult = {
            ProcessRunID: 'run-2', Status: 'Completed', Total: 1, Processed: 1, Success: 1, Error: 0, Skipped: 0,
            FeaturePipeline: { RecordProcessID: 'rp-1', Pin: null, ParameterFidelity: null, Attempted: 1, Upserted: 0, Unchanged: 0, Previewed: 1,
                RejectedInvalid: 0, BelowConfidence: 0, Failed: 0, Skipped: 0, HumanValuesPreserved: 0, Status: 'completed', WouldRefuse: refusal },
        };
        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockResolvedValue(dry);
        const out = await new RecordProcessRunNowServerOperation().ExecuteServer({ recordProcessID: 'rp-1', dryRun: true }, new StubContext());
        expect(out.Output?.wouldRefuse).toBe(refusal);
    });

    it('returns no refusal for a run that is not a refused dry run', async () => {
        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockResolvedValue({ ProcessRunID: 'run-3', Status: 'Completed', Total: 0, Processed: 0, Success: 0, Error: 0, Skipped: 0 });
        const out = await new RecordProcessRunNowServerOperation().ExecuteServer({ recordProcessID: 'rp-1' }, new StubContext());
        expect(out.Output?.wouldRefuse).toBeUndefined();
    });
});
