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
    /**
     * What the placement dialog returns. Placement is the user's answer now, so a panel test
     * states it here rather than hiding it in the spec it applies.
     */
    placement: {
        contribution: { slot: 'after-fields', presentation: 'panel', title: 'Lifetime value' } as Record<string, unknown>,
        activateNow: true,
    },
    /** The context the dialog was handed — what the user was actually offered. */
    placementContext: null as Record<string, unknown> | null,
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

/**
 * The real service opens two kinds of dialog: a yes/no confirm (a string message plus
 * actions) and the placement dialog (a component class). They are told apart the same way
 * MJDialogService tells them apart — by whether `content` is a component.
 */
const mockDialog = {
    Open: (settings?: { content?: unknown }) => {
        if (typeof settings?.content === 'function') {
            const instance = {
                ComponentName: '',
                Proposal: null as unknown,
                set Context(value: Record<string, unknown>) { hoisted.placementContext = value; },
                get Context(): Record<string, unknown> { return hoisted.placementContext ?? {}; },
                Applied: {
                    subscribe: (cb: (d: unknown) => void) => {
                        if (hoisted.dialogResult === 'apply') {
                            cb({ Contribution: { ...hoisted.placement.contribution }, ActivateNow: hoisted.placement.activateNow });
                        }
                    },
                },
                Cancelled: {
                    subscribe: (cb: () => void) => { if (hoisted.dialogResult !== 'apply') cb(); },
                },
            };
            return { Content: { instance }, Result: { subscribe: () => { /* closed via the outputs */ } }, Close: () => { /* no DOM */ } };
        }
        return {
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
        };
    },
};

/**
 * The placement dialog is an Angular component; importing it here would drag the framework
 * into a node-preset suite. Only the two symbols the service uses are needed, and
 * `ApplyDecisionToSpec` is reproduced exactly so the test still asserts the real merge.
 */
vi.mock('@memberjunction/ng-base-forms', () => ({
    MjFormPlacementDialogComponent: class MjFormPlacementDialogComponent {},
    ApplyDecisionToSpec: (spec: Record<string, unknown>, decision: { Contribution: unknown }) =>
        ({ ...spec, formContribution: decision.Contribution }),
}));

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

    it('a new version of the SAME form → calls Modify Interactive Form (Pending sibling produced)', async () => {
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-MODIFY' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({
                // Same component name as the incoming spec, so this IS that form's next version.
                Active: { OverrideID: 'OVER-EXISTING', ComponentID: 'COMP-EXISTING', ComponentName: 'Form', ComponentVersion: '1.0.0' },
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
                Variants: [{ OverrideID: 'OVER-PENDING', ComponentID: 'COMP-PENDING', ComponentName: 'Form', ComponentVersion: '1.0.0', Status: 'Pending' }],
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

    /**
     * Two custom forms for one entity are alternatives, not revisions of each other.
     * Forcing a differently-named form into the incumbent's version history was a merge:
     * it renamed the new form and buried the old one inside the new one's lineage. Now
     * each keeps its own lineage and activation decides which one is live.
     */
    it('a DIFFERENT form → creates its own override and swaps, rather than merging', async () => {
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-GET-ACTIVE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-CREATE' }] });
        hoisted.runViewResponses.push({ Success: true, Results: [{ ID: 'ACT-ACTIVATE' }] });
        hoisted.actionResponses.set('ACT-GET-ACTIVE', {
            Success: true,
            Message: JSON.stringify({
                Active: { OverrideID: 'OVER-EXISTING', ComponentID: 'COMP-EXISTING', ComponentName: 'OpsForm', ComponentVersion: '1.0.0' },
                Variants: [],
            }),
        });
        hoisted.actionResponses.set('ACT-CREATE', {
            Success: true,
            Message: JSON.stringify({ ComponentID: 'NEW-COMP', OverrideID: 'NEW-OVER', Version: '1.0.0' }),
        });
        hoisted.actionResponses.set('ACT-ACTIVATE', { Success: true, Message: '{}' });

        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(spec({ name: 'FinanceForm' }), 'MJ: Apps', mockProvider());

        expect(result.Success).toBe(true);
        expect(result.Mode).toBe('create');
        expect(result.OverrideID).toBe('NEW-OVER');
        // The incoming spec keeps its own name — nothing was aligned onto the incumbent.
        expect(hoisted.actionCalls.map(c => c.id)).not.toContain('ACT-MODIFY');
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

    /** The spec the Create action actually received, which is the spec that gets persisted. */
    function sentSpec(): { formContribution: Record<string, string | undefined> } {
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const raw = (create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Spec')!.Value;
        return JSON.parse(raw) as { formContribution: Record<string, string | undefined> };
    }

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
        hoisted.actionResponses.set('Get Form Composition For Entity', {
            Success: true, Message: JSON.stringify({
                Entity: ENTITY,
                Sections: [{ Key: 'details', Title: 'Details' }],
                Related: [],
                Contributions: [],
                SlotsPresent: ['before-fields', 'after-fields', 'after-related'],
                FullCustomForm: false,
            }),
        });
        hoisted.placement = {
            contribution: { slot: 'after-fields', presentation: 'panel', title: 'Lifetime value' },
            activateNow: true,
        };
        hoisted.placementContext = null;
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

    it('passes incumbent + 1 as Precedence when the user stands in for a compiled contribution', async () => {
        hoisted.placement.contribution = {
            slot: 'after-fields', presentation: 'panel', title: 'Lifetime value', contributionKey: 'header',
        };
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

    it('writes the placement the user chose, not the one the spec proposed', async () => {
        hoisted.placement.contribution = { slot: 'top-area', presentation: 'bare', title: 'Lifetime value' };
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        const sent = sentSpec();
        expect(sent.formContribution.slot).toBe('top-area');
        expect(sent.formContribution.presentation).toBe('bare');
        expect(sent.formContribution.replacesSectionKey).toBeUndefined();
        expect(sent.formContribution.contributionKey).toBeUndefined();
    });

    it('offers the sections the live form actually has', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(hoisted.placementContext).toMatchObject({
            EntityName: ENTITY,
            Sections: [{ Key: 'details', Title: 'Details' }],
        });
        expect(hoisted.actionCalls.map(c => c.id)).not.toContain('Get Form Composition For Entity');
    });

    it('asks the server for the composition when there is no snapshot', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
        expect(hoisted.actionCalls.map(c => c.id)).toContain('Get Form Composition For Entity');
        expect(hoisted.placementContext).toMatchObject({ Sections: [{ Key: 'details', Title: 'Details' }] });
    });

    it('ignores a snapshot taken on a different entity and asks the server instead', async () => {
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({ Entity: 'MJ: Something Else', Sections: [] }));
        expect(hoisted.actionCalls.map(c => c.id)).toContain('Get Form Composition For Entity');
    });

    it('tells the user when a full custom form would swallow the panel', async () => {
        hoisted.actionResponses.set('Get Form Composition For Entity', {
            Success: true, Message: JSON.stringify({
                Sections: [], Related: [], Contributions: [], SlotsPresent: [], FullCustomForm: true,
            }),
        });
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
        expect(hoisted.placementContext).toMatchObject({ FullCustomForm: true });
    });

    it('saves a draft without activating when the user did not turn it on', async () => {
        hoisted.placement.activateNow = false;
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(result.Success).toBe(true);
        expect(hoisted.actionCalls.map(c => c.id)).not.toContain('Activate Form Contribution Version');
        expect(hoisted.notifications.at(-1)?.message).toContain('draft');
    });

    it('routes to Modify when the caller already has a Pending row with the same key', async () => {
        hoisted.placement.contribution = {
            slot: 'after-fields', presentation: 'panel', title: 'Lifetime value', contributionKey: 'header',
        };
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
        hoisted.placement.contribution = {
            slot: 'after-fields', presentation: 'panel', title: 'Lifetime value', contributionKey: 'header',
        };
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
        const spec = panelSpec();
        hoisted.placement.contribution = {
            slot: 'after-fields', presentation: 'panel', title: 'Lifetime value',
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: '[PersonID]',
        };
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
        expect(hoisted.notifications.at(-1)?.message).toMatch(/saved as a draft/);
    });

    it('surfaces a Create failure', async () => {
        hoisted.actionResponses.set('Create Form Contribution', { Success: false, Message: 'LINT_FAILED' });
        const svc = new InteractiveFormApplyService();
        const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
        expect(result).toMatchObject({ Success: false, Kind: 'contribution' });
        expect(hoisted.notifications.at(-1)?.type).toBe('error');
    });

    describe('re-applying the same panel', () => {
        /** A spec that declares no identity — the shape a generator emits when it skips the key. */
        function keylessSpec(): ComponentSpec {
            const spec = panelSpec() as unknown as { formContribution: Record<string, unknown> };
            delete spec.formContribution.contributionKey;
            delete spec.formContribution.replacesSectionKey;
            return spec as unknown as ComponentSpec;
        }

        function installed(over: Record<string, unknown>) {
            return {
                Success: true,
                Message: JSON.stringify({
                    EntityName: ENTITY,
                    Contributions: [{
                        ContributionID: 'ROW-EXISTING', ContributionKey: null, Status: 'Active',
                        Scope: 'User', Name: 'Lifetime value', ComponentName: 'PersonLtvStrip', ...over,
                    }],
                }),
            };
        }

        it('versions the installed row instead of adding a second copy when no key is declared', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity', installed({}));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            const ids = hoisted.actionCalls.map(c => c.id);
            expect(ids).toContain('Modify Form Contribution');
            expect(ids).not.toContain('Create Form Contribution');
        });

        it('still creates when the installed row is a different component', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity',
                installed({ ComponentName: 'SomeOtherStrip' }));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            expect(hoisted.actionCalls.map(c => c.id)).toContain('Create Form Contribution');
        });

        it('does not match a row that carries a key against a keyless spec', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity',
                installed({ ContributionKey: 'skip:something-else' }));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            expect(hoisted.actionCalls.map(c => c.id)).toContain('Create Form Contribution');
        });
    });
});

/**
 * A generated form emits whichever slots CodeGen knew about when it last ran. The dialog can
 * only warn about a slot the form lacks if the slot list reaches it, so the service is what
 * carries it — from the open form when there is one, from the server derivation otherwise.
 */
describe('InteractiveFormApplyService — slot availability reaches the dialog', () => {
    const ENTITY = 'MJ_BizApps_Common: People';
    const provider = () => mockProvider({ EntityByName: () => ({ ID: 'ENT-PEOPLE', Name: ENTITY }) });

    function panelSpec(): ComponentSpec {
        return {
            name: 'PersonLtvStrip', title: 'Lifetime value', componentRole: 'form-panel',
            location: 'embedded', code: 'function PersonLtvStrip(){return null;}',
            formContribution: { slot: 'before-fields', presentation: 'bare', title: 'Lifetime value' },
        } as unknown as ComponentSpec;
    }

    beforeEach(() => {
        hoisted.resolveActionIdsByName = true;
        hoisted.actionResponses.set('Get Form Contributions For Entity', {
            Success: true, Message: JSON.stringify({ EntityName: ENTITY, Contributions: [] }),
        });
        hoisted.actionResponses.set('Create Form Contribution', {
            Success: true, Message: JSON.stringify({ ContributionID: 'ROW-1', ComponentID: 'COMP-1', Version: '1.0.0' }),
        });
        hoisted.actionResponses.set('Activate Form Contribution Version', { Success: true, Message: '{}' });
        hoisted.placement = {
            contribution: { slot: 'after-fields', presentation: 'panel', title: 'Lifetime value' },
            activateNow: true,
        };
        hoisted.placementContext = null;
    });

    it('carries the slots the open form reported', async () => {
        const snapshot = {
            Entity: ENTITY, Layout: 'accordion', Sections: [], Related: [], Contributions: [],
            SlotsPresent: ['before-fields', 'after-fields', 'after-related'], ChromeRuleCount: 0,
        } as never;
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot);
        expect(hoisted.placementContext).toMatchObject({
            SlotsPresent: ['before-fields', 'after-fields', 'after-related'],
            SlotsVerified: true,
            TargetsVerified: true,
        });
    });

    it('carries the generated slot set when there is no form to read', async () => {
        hoisted.actionResponses.set('Get Form Composition For Entity', {
            Success: true, Message: JSON.stringify({
                Sections: [], Related: [], Contributions: [],
                SlotsPresent: ['before-fields', 'after-fields', 'after-related', 'after-everything'],
                FullCustomForm: false,
            }),
        });
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
        // Known without opening the form, but assumed rather than observed — the dialog
        // marks top-area absent and says where the list came from.
        // Assumed, so the dialog probes the form to replace it.
        expect(hoisted.placementContext).toMatchObject({
            SlotsPresent: ['before-fields', 'after-fields', 'after-related', 'after-everything'],
            SlotsVerified: false,
            TargetsVerified: false,
        });
    });
});
