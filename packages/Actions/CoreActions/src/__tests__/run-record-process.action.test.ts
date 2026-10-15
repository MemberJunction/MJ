import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { RunRecordProcessOptions } from '@memberjunction/record-set-processor';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/core', () => ({ Metadata: class Metadata { public static Provider = undefined; } }));

const { runByID } = vi.hoisted(() => ({
    runByID: vi.fn(async (_id: string, _options: RunRecordProcessOptions) =>
        ({ ProcessRunID: 'run-1', Status: 'Completed', Total: 1, Processed: 1, Success: 1, Error: 0, Skipped: 0 })),
}));
vi.mock('@memberjunction/record-set-processor', () => ({ RecordProcessExecutor: class { public RunByID = runByID; } }));

import { RunRecordProcessAction } from '../custom/data/run-record-process.action';

/** Exposes the protected entry point. */
class TestableRunRecordProcess extends RunRecordProcessAction {
    public Run(params: RunActionParams) { return this.InternalRunAction(params); }
}

const paramsWith = (extra: ActionParam[]): RunActionParams => {
    const params: Pick<RunActionParams, 'Params' | 'ContextUser' | 'Provider'> = {
        Params: [{ Name: 'RecordProcessID', Type: 'Input', Value: 'rp-1' }, ...extra],
        ContextUser: {} as UserInfo,
        Provider: {} as IMetadataProvider,
    };
    return params as RunActionParams;
};

describe('RunRecordProcessAction: OverwriteHumanValues', () => {
    beforeEach(() => runByID.mockClear());

    it('keeps human values when the param is absent', async () => {
        const result = await new TestableRunRecordProcess().Run(paramsWith([]));
        expect(result.Success).toBe(true);
        expect(runByID.mock.calls[0][1].overwriteHumanValues).toBe(false);
    });

    it('overwrites them when the param is true (any case, as a string or a boolean)', async () => {
        await new TestableRunRecordProcess().Run(paramsWith([{ Name: 'OverwriteHumanValues', Type: 'Input', Value: 'true' }]));
        await new TestableRunRecordProcess().Run(paramsWith([{ Name: 'overwritehumanvalues', Type: 'Input', Value: true }]));
        expect(runByID.mock.calls.map((c) => c[1].overwriteHumanValues)).toEqual([true, true]);
    });

    it('passes the caller\'s provider', async () => {
        const params = paramsWith([]);
        await new TestableRunRecordProcess().Run(params);
        expect(runByID.mock.calls[0][1].provider).toBe(params.Provider);
    });
});

describe('RunRecordProcessAction: output params', () => {
    beforeEach(() => runByID.mockClear());

    it('returns the merged param set (inputs + the run summary outputs) on the result', async () => {
        const params = paramsWith([]);
        const result = await new TestableRunRecordProcess().Run(params);
        expect(result.Params).toBe(params.Params);
        const outputs = (result.Params || []).filter((p) => p.Type === 'Output');
        expect(outputs.map((p) => [p.Name, p.Value])).toEqual([
            ['ProcessRunID', 'run-1'], ['Processed', 1], ['Succeeded', 1], ['Errored', 0], ['Skipped', 0],
        ]);
    });

    it('replaces a same-name output already on the param list instead of appending a duplicate', async () => {
        const params = paramsWith([{ Name: 'Processed', Type: 'Output', Value: null }]);
        await new TestableRunRecordProcess().Run(params);
        const processed = params.Params.filter((p) => p.Name === 'Processed');
        expect(processed).toEqual([{ Name: 'Processed', Type: 'Output', Value: 1 }]);
    });
});
