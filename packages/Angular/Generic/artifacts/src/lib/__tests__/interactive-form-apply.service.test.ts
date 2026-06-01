/**
 * End-to-end-ish coverage for the Apply-to-my-form flow.
 *
 * The service is the join point that closes the chat-artifact → action loop:
 *   form-aware artifact viewer → applyFormRequested →
 *   conversation-chat-area / artifact-resource → ConfirmAndApply →
 *   Get Active Form For Entity (action) → Create or Modify (action)
 *
 * These tests mock the dialog, notifications, and the GraphQL action
 * client so we can drive both branches (no-existing → Create; existing →
 * Modify) and the cancellation path, plus the failure surfaces. Without
 * this suite the original "Apply button is wired to nothing" bug would
 * regress silently — the unit tests on the actions wouldn't notice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';

// ─── Hoisted state buckets the mocks read/write ──────────────────────────

const hoisted = vi.hoisted(() => ({
    dialogResult: 'apply' as 'apply' | 'cancel',
    actionResponses: new Map<string, { Success: boolean; Message?: string; ResultCode?: string }>(),
    actionCalls: [] as Array<{ id: string; params: unknown }>,
    runViewResponses: [] as Array<{ Success: boolean; Results: Array<{ ID: string }>; ErrorMessage?: string }>,
    notifications: [] as Array<{ message: string; type: string }>,
}));

// ─── Module mocks ────────────────────────────────────────────────────────

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
    inject: (token: { Instance?: unknown } | typeof Object) => {
        // Return the mock singletons by class identity.
        const name = (token as { name?: string }).name ?? '';
        if (name === 'MJDialogService') return mockDialog;
        if (name === 'MJNotificationService') return mockNotifications;
        return {};
    },
}));

const mockDialog = {
    Open: () => ({
        Result: {
            subscribe: (cb: (r: { result: string }) => void) => {
                cb({ result: hoisted.dialogResult });
            },
        },
    }),
};

const mockNotifications = {
    CreateSimpleNotification: (message: string, type: string) => {
        hoisted.notifications.push({ message, type });
    },
};

vi.mock('@memberjunction/ng-ui-components', () => ({ MJDialogService: class MJDialogService {} }));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: class MJNotificationService {} }));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLActionClient: class {
        async RunAction(actionId: string, params: unknown) {
            hoisted.actionCalls.push({ id: actionId, params });
            return hoisted.actionResponses.get(actionId) ?? { Success: false, Message: 'mock: no response set' };
        }
    },
    GraphQLDataProvider: class {},
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return {
        ...actual,
        Metadata: { Provider: null },
        LogError: vi.fn(),
        RunView: class {
            async RunView() {
                return hoisted.runViewResponses.shift() ?? { Success: true, Results: [] };
            }
        },
    };
});

// ─── Test setup ──────────────────────────────────────────────────────────

import { InteractiveFormApplyService } from '../services/interactive-form-apply.service';

function mockProvider(overrides: Partial<{ EntityByName: () => unknown; CurrentUser: unknown }> = {}) {
    return {
        EntityByName: () => ({ ID: 'ENT-1', Name: 'MJ: Apps' }),
        CurrentUser: { ID: 'U1', Name: 'Test' },
        ExecuteGQL: () => Promise.resolve({}),    // marks it as a GraphQL provider
        ...overrides,
    } as unknown as Parameters<InteractiveFormApplyService['ConfirmAndApply']>[2];
}

function spec(over: Partial<ComponentSpec> = {}): ComponentSpec {
    return { name: 'Form', componentRole: 'form', location: 'embedded', code: '() => null', ...over } as ComponentSpec;
}

beforeEach(() => {
    hoisted.dialogResult = 'apply';
    hoisted.actionResponses.clear();
    hoisted.actionCalls.length = 0;
    hoisted.runViewResponses.length = 0;
    hoisted.notifications.length = 0;
});

describe('InteractiveFormApplyService', () => {

    it('returns failure when no metadata provider is available', async () => {
        const svc = new InteractiveFormApplyService();
        // No provider — neither passed nor on Metadata.Provider.
        const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps');
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/No metadata provider/);
    });

    it('returns failure when the declared entity is not registered', async () => {
        const svc = new InteractiveFormApplyService();
        const provider = mockProvider({ EntityByName: () => undefined });
        const result = await svc.ConfirmAndApply(spec(), 'MJ: NotAnEntity', provider);
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/not registered/);
    });

    it('cancellation by user yields a friendly failure result, no action invoked', async () => {
        hoisted.dialogResult = 'cancel';
        // Seed action-id lookup so the path past dialog is reachable in case the
        // implementation order changes; with dialog returning 'cancel' the
        // Create action should never be called.
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({ Active: null, Variants: [] }),
        });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/Cancelled/);
        // Only Get Active Form should have been called (to populate dialog text);
        // Create / Modify should NOT have been called.
        const calls = hoisted.actionCalls.map(c => c.id);
        expect(calls.filter(id => id !== 'ACT-GET-ACTIVE')).toEqual([]);
    });

    it('no existing override → calls Create Interactive Form', async () => {
        // RunView lookups: each call resolves the next action ID.
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-CREATE' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({ Active: null, Variants: [] }),
        });
        hoisted.actionResponses.set('ACT-CREATE', {
            Success: true,
            Message: JSON.stringify({ ComponentID: 'NEW-COMP', OverrideID: 'NEW-OVER', Version: '1.0.0' }),
        });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec({ name: 'CompactForm' }), 'MJ: Apps', mockProvider());

        expect(result.Success).toBe(true);
        expect(result.Mode).toBe('create');
        expect(result.OverrideID).toBe('NEW-OVER');
        expect(result.Version).toBe('1.0.0');
        const calls = hoisted.actionCalls.map(c => c.id);
        expect(calls).toEqual(['ACT-GET-ACTIVE', 'ACT-CREATE']);
        // Success notification surfaced.
        expect(hoisted.notifications.some(n => n.type === 'success')).toBe(true);
    });

    it('existing Active override → calls Modify Interactive Form (Pending sibling produced)', async () => {
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-MODIFY' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({
                Active: { OverrideID: 'OVER-EXISTING', ComponentID: 'COMP-EXISTING', ComponentVersion: '1.0.0' },
                Variants: [],
            }),
        });
        hoisted.actionResponses.set('ACT-MODIFY', {
            Success: true,
            Message: JSON.stringify({ Mode: 'new-version', ComponentID: 'NEW-COMP', OverrideID: 'NEW-OVER', Version: '1.1.0' }),
        });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());

        expect(result.Success).toBe(true);
        expect(result.Mode).toBe('modify-new-version');
        expect(result.Version).toBe('1.1.0');
        const calls = hoisted.actionCalls.map(c => c.id);
        expect(calls).toEqual(['ACT-GET-ACTIVE', 'ACT-MODIFY']);
    });

    it('Get Active failure short-circuits with an error', async () => {
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: false,
            Message: 'DB unavailable',
        });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/Could not check for existing override/);
    });

    it('failure on the Create action surfaces the error notification', async () => {
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-CREATE' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({ Active: null, Variants: [] }),
        });
        hoisted.actionResponses.set('ACT-CREATE', {
            Success: false,
            ResultCode: 'LINT_FAILED',
            Message: 'Spec failed linting.',
        });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
        expect(result.Success).toBe(false);
        expect(hoisted.notifications.some(n => n.type === 'error')).toBe(true);
    });
});
