/**
 * Unit tests for the RecordProcess.GetRunStatus Remote Operation (the RO-1 POC) — exercised through
 * BaseRemotableOperation.ExecuteServer with a fake provider, covering the happy path, not-found,
 * and missing-input cases.
 */

import { describe, it, expect } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
// The hand-authored server subclass now extends the CodeGen-emitted base (which carries OperationKey /
// ExecutionMode / RequiredScope from metadata) and supplies only the InternalExecute body.
import { RecordProcessGetRunStatusServerOperation } from '../operations/RecordProcessGetRunStatusOperation';

const USER = {} as UserInfo;

/** Builds a fake provider whose GetEntityObject returns a stub Process Run. */
function providerReturning(run: Record<string, unknown> & { Load: (id: string) => Promise<boolean> }): IMetadataProvider {
    return { GetEntityObject: async () => run } as unknown as IMetadataProvider;
}

const ctx = (provider: IMetadataProvider) => ({ provider, user: USER, emitProgress: () => { /* no-op */ } });

describe('RecordProcessGetRunStatusOperation', () => {
    it('declares the operation key and required scope', () => {
        const op = new RecordProcessGetRunStatusServerOperation();
        expect(op.OperationKey).toBe('RecordProcess.GetRunStatus');
        expect(op.RequiredScope).toBe('recordprocess:execute');
        expect(op.ExecutionMode).toBe('Sync');
    });

    it('returns the run status and counts on success', async () => {
        const provider = providerReturning({
            Load: async () => true,
            Status: 'Completed',
            ProcessedItems: 5,
            TotalItemCount: 5,
            SuccessCount: 4,
            ErrorCount: 1,
            SkippedCount: 0,
        });
        const result = await new RecordProcessGetRunStatusServerOperation().ExecuteServer({ processRunID: 'RUN-1' }, ctx(provider));
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ status: 'Completed', processed: 5, total: 5, success: 4, error: 1, skipped: 0 });
    });

    it('fails with EXECUTION_ERROR when the run is not found', async () => {
        const provider = providerReturning({ Load: async () => false });
        const result = await new RecordProcessGetRunStatusServerOperation().ExecuteServer({ processRunID: 'missing' }, ctx(provider));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('EXECUTION_ERROR');
        expect(result.ErrorMessage).toContain('not found');
    });

    it('fails when processRunID is missing', async () => {
        const provider = providerReturning({ Load: async () => true });
        const result = await new RecordProcessGetRunStatusServerOperation().ExecuteServer({ processRunID: '' }, ctx(provider));
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('processRunID is required');
    });
});
