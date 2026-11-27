import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Injector } from '@angular/core';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import type { FormToolbarActionLifecycleContext } from '@memberjunction/ng-base-forms';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentPermissionsToolbarAction, AIAgentRunToolbarAction } from './agent-toolbar-actions';

function makeContext(overrides: {
    Record?: Partial<MJAIAgentEntity>;
    OpenPermissionsDialog?: () => void;
    HarnessOpen?: ReturnType<typeof vi.fn>;
} = {}): {
    ctx: FormToolbarActionLifecycleContext;
    setDisabled: ReturnType<typeof vi.fn>;
} {
    const setDisabled = vi.fn();
    const harnessOpen = overrides.HarnessOpen ?? vi.fn();
    const injector = {
        get: vi.fn((token: unknown) => (token === AITestHarnessDialogService ? { openForAgent: harnessOpen } : null)),
    } as unknown as Injector;

    const ctx = {
        Record: {
            ID: 'agent-1',
            IsSaved: true,
            Status: 'Active',
            ...overrides.Record,
        },
        FormComponent: overrides.OpenPermissionsDialog
            ? { OpenPermissionsDialog: overrides.OpenPermissionsDialog }
            : null,
        Injector: injector,
        SetDisabled: setDisabled,
    } as unknown as FormToolbarActionLifecycleContext;

    return { ctx, setDisabled };
}

describe('AIAgentRunToolbarAction', () => {
    afterEach(() => vi.restoreAllMocks());

    it('is applicable only for saved agents with an ID', () => {
        const action = new AIAgentRunToolbarAction();
        expect(action.IsApplicable(makeContext().ctx)).toBe(true);
        expect(action.IsApplicable(makeContext({ Record: { IsSaved: false, ID: '' } }).ctx)).toBe(false);
    });

    it('enables for Active agents and disables with reason for non-Active agents on init and refresh', () => {
        const action = new AIAgentRunToolbarAction();
        const active = makeContext({ Record: { Status: 'Active' } });
        action.OnInit(active.ctx);
        expect(active.setDisabled).toHaveBeenCalledWith(false, undefined);

        const disabled = makeContext({ Record: { Status: 'Disabled' } });
        action.OnRecordRefreshed(disabled.ctx);
        expect(disabled.setDisabled).toHaveBeenCalledWith(true, 'Only Active agents can be executed');
    });

    it('opens the AI Test Harness dialog on execute', async () => {
        const openSpy = vi.fn();
        const { ctx } = makeContext({ HarnessOpen: openSpy });
        const action = new AIAgentRunToolbarAction();
        await action.OnExecute(ctx);
        expect(openSpy).toHaveBeenCalledWith('agent-1');
    });

    it('notifies if record has no ID on execute', async () => {
        const notifySpy = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({
            CreateSimpleNotification: notifySpy,
        } as unknown as MJNotificationService);
        const { ctx } = makeContext({ Record: { ID: '' } });
        const action = new AIAgentRunToolbarAction();
        await action.OnExecute(ctx);
        expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('save'), 'warning', 3500);
    });
});

describe('AIAgentPermissionsToolbarAction', () => {
    it('is applicable for saved agents and delegates execute to host OpenPermissionsDialog', () => {
        const openPerms = vi.fn();
        const { ctx } = makeContext({ OpenPermissionsDialog: openPerms });
        const action = new AIAgentPermissionsToolbarAction();

        expect(action.IsApplicable(ctx)).toBe(true);
        action.OnExecute(ctx);
        expect(openPerms).toHaveBeenCalledTimes(1);
    });
});
