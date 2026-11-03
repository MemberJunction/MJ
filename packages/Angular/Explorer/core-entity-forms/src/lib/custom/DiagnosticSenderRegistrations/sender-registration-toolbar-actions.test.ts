import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FormToolbarActionLifecycleContext } from '@memberjunction/ng-base-forms';
import type { MJConfirmOptions } from '@memberjunction/ng-ui-components';

const mocks = vi.hoisted(() => ({
    revokeExecute: vi.fn(),
    reactivateExecute: vi.fn(),
    notify: vi.fn(),
}));

vi.mock('@memberjunction/ng-base-forms', () => {
    abstract class BaseFormToolbarAction {
        public IsLoading = false;
        public abstract OnExecute(ctx: unknown): void | Promise<void>;
    }
    return {
        BaseFormToolbarAction,
        RegisterFormToolbarAction: () => (_ctor: Function) => undefined,
    };
});

vi.mock('@memberjunction/ng-notifications', () => ({
    MJNotificationService: { Instance: { CreateSimpleNotification: mocks.notify } },
}));

vi.mock('@memberjunction/core-entities', () => ({
    DiagnosticsRevokeSenderOperation: class {
        public Execute = mocks.revokeExecute;
    },
    DiagnosticsReactivateSenderOperation: class {
        public Execute = mocks.reactivateExecute;
    },
}));

import {
    DiagnosticsReactivateSenderToolbarAction,
    DiagnosticsRevokeSenderToolbarAction,
} from './sender-registration-toolbar-actions';

const REG_ID = '5F0C2D7E-3B1A-4C59-9E2B-7A1D3C4B5E6F';

interface FakeRecord {
    ID: string;
    InstallID: string;
    IsSaved: boolean;
    Status: 'Active' | 'Pending' | 'Revoked';
    KeyID: string | null;
    PublicKeyBase64: string | null;
    Refresh: ReturnType<typeof vi.fn>;
}

interface FakeContext {
    ctx: FormToolbarActionLifecycleContext;
    record: FakeRecord;
    provider: object;
    refreshRecord: ReturnType<typeof vi.fn>;
    setLoading: ReturnType<typeof vi.fn>;
}

function makeContext(overrides: Partial<FakeRecord> = {}): FakeContext {
    const record: FakeRecord = {
        ID: REG_ID,
        InstallID: 'install-1',
        IsSaved: true,
        Status: 'Active',
        KeyID: 'key-1',
        PublicKeyBase64: 'cHVibGlj',
        Refresh: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
    const provider = { name: 'form-provider' };
    const refreshRecord = vi.fn().mockResolvedValue(true);
    const setLoading = vi.fn();
    const ctx = {
        Record: record,
        EntityInfo: { Name: 'MJ: Diagnostic Sender Registrations' },
        Provider: provider,
        EditMode: false,
        IsDirty: false,
        FormComponent: { RefreshRecord: refreshRecord },
        SetLoading: setLoading,
        RequestChangeDetection: vi.fn(),
    } as unknown as FormToolbarActionLifecycleContext;
    return { ctx, record, provider, refreshRecord, setLoading };
}

describe('DiagnosticsRevokeSenderToolbarAction', () => {
    let confirm: ReturnType<typeof vi.fn<(options: MJConfirmOptions) => Promise<boolean>>>;

    beforeEach(() => {
        mocks.revokeExecute.mockReset();
        mocks.notify.mockReset();
        confirm = vi.fn<(options: MJConfirmOptions) => Promise<boolean>>().mockResolvedValue(true);
        DiagnosticsRevokeSenderToolbarAction.Confirm = confirm;
    });

    afterEach(() => {
        DiagnosticsRevokeSenderToolbarAction.Confirm = null;
    });

    it.each([
        ['Active', true],
        ['Pending', true],
        ['Revoked', false],
    ] as const)('IsApplicable for status %s is %s', (status, expected) => {
        const { ctx } = makeContext({ Status: status });
        expect(new DiagnosticsRevokeSenderToolbarAction().IsApplicable(ctx)).toBe(expected);
    });

    it('is not applicable to an unsaved record', () => {
        const { ctx } = makeContext({ IsSaved: false });
        expect(new DiagnosticsRevokeSenderToolbarAction().IsApplicable(ctx)).toBe(false);
    });

    it('calls the operation with the record ID and ctx.Provider after a confirmed dialog, then reloads', async () => {
        mocks.revokeExecute.mockResolvedValue({ Success: true, Output: { Status: 'Revoked' } });
        const { ctx, provider, refreshRecord } = makeContext();

        await new DiagnosticsRevokeSenderToolbarAction().OnExecute(ctx);

        expect(confirm).toHaveBeenCalledTimes(1);
        expect(mocks.revokeExecute).toHaveBeenCalledWith({ RegistrationID: REG_ID }, { provider });
        expect(refreshRecord).toHaveBeenCalledTimes(1);
        expect(mocks.notify).toHaveBeenCalledWith(expect.any(String), 'success', expect.any(Number));
    });

    it('makes no call when the confirmation is cancelled', async () => {
        confirm.mockResolvedValue(false);
        const { ctx, refreshRecord } = makeContext();

        await new DiagnosticsRevokeSenderToolbarAction().OnExecute(ctx);

        expect(mocks.revokeExecute).not.toHaveBeenCalled();
        expect(refreshRecord).not.toHaveBeenCalled();
    });

    it('makes no call when no confirmation dialog is available', async () => {
        DiagnosticsRevokeSenderToolbarAction.Confirm = null;
        const { ctx } = makeContext();

        await new DiagnosticsRevokeSenderToolbarAction().OnExecute(ctx);

        expect(mocks.revokeExecute).not.toHaveBeenCalled();
        expect(mocks.notify).toHaveBeenCalledWith(expect.any(String), 'error', expect.any(Number));
    });

    it('shows the server error and does not reload when the operation fails', async () => {
        mocks.revokeExecute.mockResolvedValue({ Success: false, ErrorMessage: 'Not authorized to manage intake' });
        const { ctx, refreshRecord, record } = makeContext();

        await new DiagnosticsRevokeSenderToolbarAction().OnExecute(ctx);

        expect(mocks.notify).toHaveBeenCalledWith('Not authorized to manage intake', 'error', expect.any(Number));
        expect(refreshRecord).not.toHaveBeenCalled();
        expect(record.Refresh).not.toHaveBeenCalled();
    });

    it('shows a thrown error and does not reload', async () => {
        mocks.revokeExecute.mockRejectedValue(new Error('Network down'));
        const { ctx, refreshRecord } = makeContext();

        await new DiagnosticsRevokeSenderToolbarAction().OnExecute(ctx);

        expect(mocks.notify).toHaveBeenCalledWith('Network down', 'error', expect.any(Number));
        expect(refreshRecord).not.toHaveBeenCalled();
    });

    it('clears the loading state after success and after failure', async () => {
        const action = new DiagnosticsRevokeSenderToolbarAction();

        mocks.revokeExecute.mockResolvedValue({ Success: true, Output: { Status: 'Revoked' } });
        const ok = makeContext();
        await action.OnExecute(ok.ctx);
        expect(ok.setLoading.mock.calls).toEqual([[true], [false]]);

        mocks.revokeExecute.mockResolvedValue({ Success: false, ErrorMessage: 'refused' });
        const failed = makeContext();
        await action.OnExecute(failed.ctx);
        expect(failed.setLoading.mock.calls).toEqual([[true], [false]]);
    });
});

describe('DiagnosticsReactivateSenderToolbarAction', () => {
    beforeEach(() => {
        mocks.reactivateExecute.mockReset();
        mocks.notify.mockReset();
    });

    it.each([
        ['Active', 'key-1', 'cHVibGlj', false],
        ['Pending', 'key-1', 'cHVibGlj', false],
        ['Revoked', 'key-1', 'cHVibGlj', true],
        ['Revoked', null, 'cHVibGlj', false],
        ['Revoked', 'key-1', null, false],
    ] as const)('IsApplicable for status %s, KeyID %s, PublicKeyBase64 %s is %s', (status, keyId, publicKey, expected) => {
        const { ctx } = makeContext({ Status: status, KeyID: keyId, PublicKeyBase64: publicKey });
        expect(new DiagnosticsReactivateSenderToolbarAction().IsApplicable(ctx)).toBe(expected);
    });

    it('is not applicable to an unsaved record', () => {
        const { ctx } = makeContext({ IsSaved: false, Status: 'Revoked' });
        expect(new DiagnosticsReactivateSenderToolbarAction().IsApplicable(ctx)).toBe(false);
    });

    it('calls its operation without a confirmation and reloads the record', async () => {
        const confirm = vi.fn<(options: MJConfirmOptions) => Promise<boolean>>().mockResolvedValue(true);
        DiagnosticsRevokeSenderToolbarAction.Confirm = confirm;
        mocks.reactivateExecute.mockResolvedValue({ Success: true, Output: { Status: 'Active' } });
        const { ctx, provider, refreshRecord, setLoading } = makeContext({ Status: 'Revoked' });

        await new DiagnosticsReactivateSenderToolbarAction().OnExecute(ctx);

        expect(confirm).not.toHaveBeenCalled();
        expect(mocks.reactivateExecute).toHaveBeenCalledWith({ RegistrationID: REG_ID }, { provider });
        expect(refreshRecord).toHaveBeenCalledTimes(1);
        expect(setLoading.mock.calls).toEqual([[true], [false]]);
        DiagnosticsRevokeSenderToolbarAction.Confirm = null;
    });

    it('reloads through the record when the form has no form component', async () => {
        mocks.reactivateExecute.mockResolvedValue({ Success: true, Output: { Status: 'Active' } });
        const fake = makeContext({ Status: 'Revoked' });
        const ctx = { ...fake.ctx, FormComponent: null } as FormToolbarActionLifecycleContext;

        await new DiagnosticsReactivateSenderToolbarAction().OnExecute(ctx);

        expect(fake.record.Refresh).toHaveBeenCalledTimes(1);
    });

    it('shows the server error, does not reload, and clears the loading state when the operation fails', async () => {
        mocks.reactivateExecute.mockResolvedValue({ Success: false, ErrorMessage: 'This registration has no enrolled key.' });
        const { ctx, refreshRecord, setLoading } = makeContext({ Status: 'Revoked' });

        await new DiagnosticsReactivateSenderToolbarAction().OnExecute(ctx);

        expect(mocks.notify).toHaveBeenCalledWith('This registration has no enrolled key.', 'error', expect.any(Number));
        expect(refreshRecord).not.toHaveBeenCalled();
        expect(setLoading.mock.calls).toEqual([[true], [false]]);
    });
});
