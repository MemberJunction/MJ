/**
 * RemoteOperationEngineBase tests — the metadata gate the ExecuteRemoteOperation resolver consults.
 * Covers GetOperationByKey (case-insensitive) and IsInvokable (no-row pass-through, Status gate, AI approval gate).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    // Minimal BaseEngine: a process-wide singleton with a no-op Load (we inject the cache directly).
    BaseEngine: class MockBaseEngine {
        private static _inst: unknown;
        static getInstance<T>(): T {
            const ctor = this as unknown as { _inst?: T; new (): T };
            if (!ctor._inst) ctor._inst = new ctor();
            return ctor._inst;
        }
        async Load(): Promise<void> {
            /* no-op for unit tests */
        }
    },
    RegisterForStartup: () => (target: unknown) => target,
}));
vi.mock('../generated/entity_subclasses', () => ({ MJRemoteOperationEntity: class {} }));

import { RemoteOperationEngineBase } from '../engines/RemoteOperationEngineBase';

interface Row {
    OperationKey: string;
    Status: string;
    GenerationType: string;
    CodeApprovalStatus: string;
}

function setRows(rows: Row[]): void {
    const inst = RemoteOperationEngineBase.Instance as unknown as { _remoteOperations: Row[]; _byKey: unknown };
    inst._remoteOperations = rows;
    inst._byKey = null; // force the key index to rebuild
}

const manualActive: Row = { OperationKey: 'Template.Run', Status: 'Active', GenerationType: 'Manual', CodeApprovalStatus: 'Approved' };

describe('RemoteOperationEngineBase', () => {
    beforeEach(() => setRows([]));

    describe('GetOperationByKey', () => {
        it('finds a row case-insensitively', () => {
            setRows([manualActive]);
            expect(RemoteOperationEngineBase.Instance.GetOperationByKey('template.run')?.OperationKey).toBe('Template.Run');
            expect(RemoteOperationEngineBase.Instance.GetOperationByKey('  TEMPLATE.RUN  ')?.OperationKey).toBe('Template.Run');
        });
        it('returns undefined for an unknown / empty key', () => {
            setRows([manualActive]);
            expect(RemoteOperationEngineBase.Instance.GetOperationByKey('Nope.Op')).toBeUndefined();
            expect(RemoteOperationEngineBase.Instance.GetOperationByKey('')).toBeUndefined();
        });
    });

    describe('IsInvokable', () => {
        it('passes a code-only op with no metadata row (governed by code registration)', () => {
            const r = RemoteOperationEngineBase.Instance.IsInvokable('Some.CodeOnlyOp');
            expect(r.Invokable).toBe(true);
        });
        it('passes an Active Manual op', () => {
            setRows([manualActive]);
            expect(RemoteOperationEngineBase.Instance.IsInvokable('Template.Run').Invokable).toBe(true);
        });
        it('rejects a Disabled op with OPERATION_DISABLED', () => {
            setRows([{ ...manualActive, Status: 'Disabled' }]);
            const r = RemoteOperationEngineBase.Instance.IsInvokable('Template.Run');
            expect(r.Invokable).toBe(false);
            expect(r.ResultCode).toBe('OPERATION_DISABLED');
        });
        it('rejects a Pending op with OPERATION_DISABLED (only Active dispatches)', () => {
            setRows([{ ...manualActive, Status: 'Pending' }]);
            expect(RemoteOperationEngineBase.Instance.IsInvokable('Template.Run').ResultCode).toBe('OPERATION_DISABLED');
        });
        it('passes an Active + Approved AI op', () => {
            setRows([{ OperationKey: 'My.AIOp', Status: 'Active', GenerationType: 'AI', CodeApprovalStatus: 'Approved' }]);
            expect(RemoteOperationEngineBase.Instance.IsInvokable('My.AIOp').Invokable).toBe(true);
        });
        it('rejects an Active but unapproved AI op with OPERATION_NOT_APPROVED', () => {
            setRows([{ OperationKey: 'My.AIOp', Status: 'Active', GenerationType: 'AI', CodeApprovalStatus: 'Pending' }]);
            const r = RemoteOperationEngineBase.Instance.IsInvokable('My.AIOp');
            expect(r.Invokable).toBe(false);
            expect(r.ResultCode).toBe('OPERATION_NOT_APPROVED');
        });
    });
});
