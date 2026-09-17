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
    /**
     * Opt-in: resolve an action's ID to its own Name instead of consuming the
     * positional `runViewResponses` queue. The original tests depend on the queue
     * running dry (an unresolvable ID is how they assert an action is never reached),
     * so this stays off unless a test asks for it.
     */
    resolveActionIdsByName: false,
}));

// ─── Module mocks ────────────────────────────────────────────────────────

/**
 * Action-ID lookup. A queued `runViewResponses` entry wins, so the original tests keep
 * their positional control; otherwise the action's own Name becomes its ID, which lets
 * the newer tests key `actionResponses` by name and assert on the call sequence.
 */
function resolveRunView(params: { ExtraFilter?: string }): { Success: boolean; Results: Array<{ ID: string }>; ErrorMessage?: string } {
    if (hoisted.runViewResponses.length > 0) return hoisted.runViewResponses.shift()!;
    if (!hoisted.resolveActionIdsByName) return { Success: true, Results: [] };
    const match = /Name='([^']*)'/.exec(params?.ExtraFilter ?? '');
    return match ? { Success: true, Results: [{ ID: match[1] }] } : { Success: true, Results: [] };
}


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
        // The real MJDialogRef.Result emits the clicked MJDialogAction object
        // ({ text, primary }) — the service detects intent via `action.primary`.
        // Map the test's 'apply'/'cancel' intent onto that shape.
        Result: {
            subscribe: (cb: (r: { text: string; primary?: boolean }) => void) => {
                cb(
                    hoisted.dialogResult === 'apply'
                        ? { text: 'Apply', primary: true }
                        : { text: 'Cancel' },
                );
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
        // The service now resolves action IDs through the caller's provider rather than a
        // globally-constructed RunView, so the mock answers the static factory too.
        RunView: Object.assign(
            class {
                async RunView(p: { ExtraFilter?: string }) { return resolveRunView(p); }
            },
            {
                FromMetadataProvider: () => ({
                    async RunView(p: { ExtraFilter?: string }) { return resolveRunView(p); },
                }),
            },
        ),
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
    hoisted.resolveActionIdsByName = false;
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

    it('existing Pending override (no Active) → calls Modify Interactive Form in-place', async () => {
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-MODIFY' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({
                Active: null,
                Variants: [{ OverrideID: 'OVER-PENDING', ComponentID: 'COMP-PENDING', ComponentVersion: '1.0.0', Status: 'Pending' }],
            }),
        });
        hoisted.actionResponses.set('ACT-MODIFY', {
            Success: true,
            Message: JSON.stringify({ Mode: 'in-place', ComponentID: 'COMP-PENDING', OverrideID: 'OVER-PENDING', Version: '1.0.0' }),
        });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());

        expect(result.Success).toBe(true);
        expect(result.Mode).toBe('modify-in-place');
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

/**
 * Form panels take a different route than whole forms: the contribution action family,
 * plus two confirmations driven by the live composition snapshot — a `replacesSectionKey`
 * that matches no section, and an installed compiled contribution holding the same key.
 */
describe('InteractiveFormApplyService — form-panel specs', () => {
    const ENTITY = 'MJ_BizApps_Common: People';

    function panelSpec(formContribution: Record<string, unknown> = {}): ComponentSpec {
        return {
            name: 'PersonLtvStrip', title: 'Lifetime value', componentRole: 'form-panel',
            location: 'embedded', code: 'function PersonLtvStrip(){return null;}',
            formContribution: {
                slot: 'before-fields', presentation: 'bare', title: 'Lifetime value',
                contributionKey: 'header', replacesSectionKey: 'details', ...formContribution,
            },
        } as unknown as ComponentSpec;
    }

    function snapshot(over: Record<string, unknown> = {}) {
        return {
            Entity: ENTITY, Layout: 'accordion',
            Sections: [{ Key: 'details', Title: 'Details', Variant: 'default', Group: null, Hidden: false }],
            Related: [], Contributions: [], SlotsPresent: ['before-fields'], ChromeRuleCount: 0,
            ...over,
        } as never;
    }

    const provider = () => mockProvider({ EntityByName: () => ({ ID: 'ENT-PEOPLE', Name: ENTITY }) });

    beforeEach(() => {
        hoisted.resolveActionIdsByName = true;
        hoisted.actionResponses.set('Get Form Contributions For Entity', {
            Success: true, Message: JSON.stringify({ EntityName: ENTITY, Contributions: [] }),
        });
        hoisted.actionResponses.set('Create Form Contribution', {
            Success: true, Message: JSON.stringify({ ContributionID: 'ROW-1', ComponentID: 'COMP-1', Version: '1.0.0' }),
        });
        hoisted.actionResponses.set('Activate Form Contribution Version', {
            Success: true, Message: JSON.stringify({ ContributionID: 'ROW-1' }),
        });
    });

    it('routes to Create then Activate, and reports Kind contribution', async () => {
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(result.Success).toBe(true);
        expect(result.Kind).toBe('contribution');
        expect(result.ContributionID).toBe('ROW-1');
        expect(hoisted.actionCalls.map(c => c.id)).toEqual([
            'Get Form Contributions For Entity', 'Create Form Contribution', 'Activate Form Contribution Version',
        ]);
    });

    it('never runs the whole-form actions for a panel spec', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        const ids = hoisted.actionCalls.map(c => c.id);
        expect(ids).not.toContain('Get Active Form For Entity');
        expect(ids).not.toContain('Create Interactive Form');
    });

    it('passes incumbent + 1 as Precedence when a compiled contribution holds the same key', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({
            Contributions: [{ Key: 'header', Slot: 'before-fields', Source: 'class', Title: 'Header', Presentation: 'bare', Hidden: false, Precedence: 3 }],
        }));
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const precedence = (create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Precedence');
        expect(precedence?.Value).toBe('4');
    });

    it('cancels without writing when the user declines to replace a compiled contribution', async () => {
        hoisted.dialogResult = 'cancel';
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({
            Contributions: [{ Key: 'header', Slot: 'before-fields', Source: 'class', Title: 'Header', Presentation: 'bare', Hidden: false, Precedence: 3 }],
        }));
        expect(result).toMatchObject({ Success: false, Kind: 'contribution' });
        expect(hoisted.actionCalls).toHaveLength(0);
    });

    it('drops replacesSectionKey when the snapshot has no such section', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({
            Sections: [{ Key: 'summary', Title: 'Summary', Variant: 'default', Group: null, Hidden: false }],
        }));
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const sent = JSON.parse((create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Spec')!.Value) as
            { formContribution: { replacesSectionKey?: string } };
        expect(sent.formContribution.replacesSectionKey).toBeUndefined();
    });

    it('keeps replacesSectionKey when the section exists', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const sent = JSON.parse((create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Spec')!.Value) as
            { formContribution: { replacesSectionKey?: string } };
        expect(sent.formContribution.replacesSectionKey).toBe('details');
    });

    it('leaves replacesSectionKey alone when no snapshot is supplied', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const sent = JSON.parse((create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Spec')!.Value) as
            { formContribution: { replacesSectionKey?: string } };
        expect(sent.formContribution.replacesSectionKey).toBe('details');
    });

    it('ignores a snapshot taken on a different entity', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({ Entity: 'MJ: Something Else', Sections: [] }));
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const sent = JSON.parse((create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Spec')!.Value) as
            { formContribution: { replacesSectionKey?: string } };
        expect(sent.formContribution.replacesSectionKey).toBe('details');
    });

    it('routes to Modify when the caller already has a Pending row with the same key', async () => {
        hoisted.actionResponses.set('Get Form Contributions For Entity', {
            Success: true,
            Message: JSON.stringify({ EntityName: ENTITY, Contributions: [
                { ContributionID: 'ROW-9', ContributionKey: 'header', Status: 'Pending', Scope: 'User', ComponentName: 'OldName' },
            ] }),
        });
        hoisted.actionResponses.set('Modify Form Contribution', {
            Success: true, Message: JSON.stringify({ ContributionID: 'ROW-9', ComponentID: 'COMP-9', Version: '1.0.0', Mode: 'in-place' }),
        });
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        const ids = hoisted.actionCalls.map(c => c.id);
        expect(ids).toContain('Modify Form Contribution');
        expect(ids).not.toContain('Create Form Contribution');
        expect(result.Mode).toBe('modify-in-place');
        const modify = hoisted.actionCalls.find(c => c.id === 'Modify Form Contribution')!;
        const bump = (modify.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'VersionBumpKind');
        expect(bump?.Value).toBe('in-place');
    });

    it('bumps a minor version when the existing row is Active', async () => {
        hoisted.actionResponses.set('Get Form Contributions For Entity', {
            Success: true,
            Message: JSON.stringify({ EntityName: ENTITY, Contributions: [
                { ContributionID: 'ROW-9', ContributionKey: 'header', Status: 'Active', Scope: 'User', ComponentName: 'OldName' },
            ] }),
        });
        hoisted.actionResponses.set('Modify Form Contribution', {
            Success: true, Message: JSON.stringify({ ContributionID: 'ROW-10', ComponentID: 'COMP-10', Version: '1.1.0', Mode: 'new-version' }),
        });
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(result.Mode).toBe('modify-new-version');
        const modify = hoisted.actionCalls.find(c => c.id === 'Modify Form Contribution')!;
        const bump = (modify.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'VersionBumpKind');
        expect(bump?.Value).toBe('minor');
    });

    it('derives the same related-grid key the write path persists', async () => {
        const spec = panelSpec({
            contributionKey: undefined, replacesSectionKey: undefined,
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: '[PersonID]',
        });
        hoisted.actionResponses.set('Get Form Contributions For Entity', {
            Success: true,
            Message: JSON.stringify({ EntityName: ENTITY, Contributions: [
                { ContributionID: 'ROW-7', ContributionKey: 'related:MJ_BizApps_Orders: Event Order Lines:PersonID', Status: 'Active', Scope: 'User' },
            ] }),
        });
        hoisted.actionResponses.set('Modify Form Contribution', {
            Success: true, Message: JSON.stringify({ ContributionID: 'ROW-7', ComponentID: 'C', Version: '1.1.0' }),
        });
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(spec, ENTITY, provider(), snapshot());
        expect(hoisted.actionCalls.map(c => c.id)).toContain('Modify Form Contribution');
    });

    it('reports success as a Pending draft when activation fails', async () => {
        hoisted.actionResponses.set('Activate Form Contribution Version', { Success: false, Message: 'nope' });
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(result.Success).toBe(true);
        expect(hoisted.notifications.at(-1)?.message).toMatch(/Pending draft/);
    });

    it('surfaces a Create failure', async () => {
        hoisted.actionResponses.set('Create Form Contribution', { Success: false, Message: 'LINT_FAILED' });
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(result).toMatchObject({ Success: false, Kind: 'contribution' });
        expect(hoisted.notifications.at(-1)?.type).toBe('error');
    });
});
