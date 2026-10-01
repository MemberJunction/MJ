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
import type { CompositeKey } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type {
    FieldGroupsInDetails, FormCompositionRegistry, FormCompositionSnapshot, HumanizeEntityTitle, ResolveContributionKey,
    ResolveFormContributionWinners,
} from '@memberjunction/ng-base-forms';

// ─── Hoisted state buckets the mocks read/write ──────────────────────────

const hoisted = vi.hoisted(() => ({
    dialogResult: 'apply' as 'apply' | 'cancel',
    /** The yes/no confirm's answer when it differs from the placement dialog's. */
    confirmResult: null as 'apply' | 'cancel' | null,
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
    /** The record the dialog's preview was told to show. */
    placementRecordKey: null as CompositeKey | null,
    /** Registrations the collector reports. */
    registrations: [] as Array<{ Priority: number; Source: 'class' | 'metadata'; Title?: string; Metadata: Record<string, unknown> }>,
    /** Registrations the collector reports only when asked for the ones the user hid. */
    hiddenRegistrations: [] as Array<{ Priority: number; Source: 'class' | 'metadata'; Title?: string; Metadata: Record<string, unknown> }>,
    /** What happened, in order: the forms engine loading and the collector being read. */
    events: [] as string[],
    /** The text of each yes/no confirm the service showed. */
    confirmTexts: [] as string[],
    /** Entities whose probed form shape the service dropped. */
    forgotten: [] as string[],
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
    // What the compiled FormCompositionRegistry calls when its module loads.
    ɵɵdefineInjectable: () => undefined,
    ɵsetClassMetadata: () => undefined,
    inject: (token: { Instance?: unknown } | typeof Object) => {
        // Return the mock singletons by class identity.
        const name = (token as { name?: string }).name ?? '';
        if (name === 'MJDialogService') return mockDialog;
        if (name === 'MJNotificationService') return mockNotifications;
        if (name === 'FormSlotProbeService') return mockProbe;
        if (name === 'FormCompositionRegistry') return registry.current;
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
                set RecordKey(value: CompositeKey | null) { hoisted.placementRecordKey = value; },
                get RecordKey(): CompositeKey | null { return hoisted.placementRecordKey; },
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
        if (typeof settings?.content === 'string') hoisted.confirmTexts.push(settings.content);
        return {
        // The real MJDialogRef.Result emits the clicked MJDialogAction object
        // ({ text, primary }) — the service detects intent via `action.primary`.
        // Map the test's 'apply'/'cancel' intent onto that shape.
            Result: {
                subscribe: (cb: (r: { text: string; primary?: boolean }) => void) => {
                    cb(
                        (hoisted.confirmResult ?? hoisted.dialogResult) === 'apply'
                            ? { text: 'Apply', primary: true }
                            : { text: 'Cancel' },
                    );
                },
            },
        };
    },
};

/**
 * The placement dialog is an Angular component; importing the package root here would drag
 * the framework into a node-preset suite. `ApplyDecisionToSpec` is reproduced exactly so the
 * test still asserts the real merge. The chrome and key helpers are pure and framework-free,
 * so the built ones run. The collector reads the ClassFactory, so it reports what a test sets.
 */
vi.mock('@memberjunction/ng-base-forms', async () => {
    // Loads from ng-base-forms' dist, so that package must be built first.
    const chrome = await vi.importActual<{
        FieldGroupsInDetails: typeof FieldGroupsInDetails;
        HumanizeEntityTitle: typeof HumanizeEntityTitle;
    }>('@memberjunction/ng-base-forms/dist/lib/chrome/form-chrome.js');
    const keys = await vi.importActual<{
        ResolveContributionKey: typeof ResolveContributionKey;
        ResolveFormContributionWinners: typeof ResolveFormContributionWinners;
    }>('@memberjunction/ng-base-forms/dist/lib/panel-slot/form-contribution.js');
    const compositions = await vi.importActual<{ FormCompositionRegistry: typeof FormCompositionRegistry }>(
        '@memberjunction/ng-base-forms/dist/lib/chrome/form-composition-registry.js');
    return {
        FormCompositionRegistry: compositions.FormCompositionRegistry,
        MjFormPlacementDialogComponent: class MjFormPlacementDialogComponent {},
        ApplyDecisionToSpec: (spec: Record<string, unknown>, decision: { Contribution: unknown }) =>
            ({ ...spec, formContribution: decision.Contribution }),
        FieldGroupsInDetails: chrome.FieldGroupsInDetails,
        HumanizeEntityTitle: chrome.HumanizeEntityTitle,
        ResolveContributionKey: keys.ResolveContributionKey,
        ResolveFormContributionWinners: keys.ResolveFormContributionWinners,
        CollectFormContributionRegistrations: (_entity: unknown, _provider: unknown, options?: { IncludeHidden?: boolean }) => {
            hoisted.events.push('collect');
            return options?.IncludeHidden ? [...hoisted.registrations, ...hoisted.hiddenRegistrations] : hoisted.registrations;
        },
        FormSlotProbeService: class FormSlotProbeService {},
    };
});

/** The rows the collector reads come from the forms engine, which has to be loaded first. */
vi.mock('@memberjunction/core-entities', async () => ({
    // The same-key tie-break the collapse uses; pure, so the real one decides. Loads from
    // core-entities' dist, so that package must be built first.
    FormContributionOutranks: (await vi.importActual<{ FormContributionOutranks: unknown }>(
        '@memberjunction/core-entities/dist/custom/FormScope/FormScopeRules.js')).FormContributionOutranks,
    InteractiveFormsEngine: {
        Instance: {
            Config: async () => { hoisted.events.push('engine'); },
        },
    },
}));

/**
 * The open forms' snapshots, as the record form containers publish them. A test opens a form by
 * publishing its snapshot here; the service reads it by the entity and record a reference names.
 */
const registry = vi.hoisted(() => ({ current: null as FormCompositionRegistry | null }));

/** Records which entities' probed form shapes the service dropped. */
const mockProbe = {
    Forget: (entityName: string) => { hoisted.forgotten.push(entityName); },
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
import { FormCompositionRegistry as RealFormCompositionRegistry } from '@memberjunction/ng-base-forms';

function mockProvider(overrides: Partial<{ EntityByName: (name: string) => unknown; CurrentUser: unknown }> = {}) {
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
    registry.current = new RealFormCompositionRegistry();
    hoisted.dialogResult = 'apply';
    hoisted.confirmResult = null;
    hoisted.resolveActionIdsByName = false;
    hoisted.placementRecordKey = null;
    hoisted.registrations = [];
    hoisted.hiddenRegistrations = [];
    hoisted.events = [];
    hoisted.confirmTexts = [];
    hoisted.forgotten = [];
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

    /**
     * Modify refuses a Role or Global form, so a form shared with the user is never modified: the
     * user gets a form of their own, which outranks the shared one for them alone.
     */
    describe('a form shared with the user', () => {
        const sharedForm = { OverrideID: 'OVER-G', ComponentID: 'COMP-G', ComponentName: 'Form', ComponentVersion: '2.0.0', Status: 'Active', Scope: 'Global' };

        beforeEach(() => {
            hoisted.resolveActionIdsByName = true;
            hoisted.actionResponses.set('Create Interactive Form', {
                Success: true, Message: JSON.stringify({ ComponentID: 'NEW-COMP', OverrideID: 'NEW-OVER', Version: '1.0.0' }),
            });
            hoisted.actionResponses.set('Activate Interactive Form Version', { Success: true, Message: '{}' });
            hoisted.actionResponses.set('Modify Interactive Form', {
                Success: true, Message: JSON.stringify({ Mode: 'in-place', ComponentID: 'COMP-MINE', OverrideID: 'OVER-MINE', Version: '1.0.0' }),
            });
        });

        it('creates the user\'s own form, even under the shared form\'s name, and never modifies the shared one', async () => {
            hoisted.actionResponses.set('Get Active Form For Entity', {
                Success: true, Message: JSON.stringify({ Active: sharedForm, Variants: [sharedForm] }),
            });
            const svc = new InteractiveFormApplyService();
            const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
            expect(result).toMatchObject({ Success: true, Mode: 'create', OverrideID: 'NEW-OVER' });
            expect(hoisted.actionCalls.map(c => c.id)).toEqual([
                'Get Active Form For Entity', 'Create Interactive Form', 'Activate Interactive Form Version',
            ]);
            expect(hoisted.confirmTexts[0]).toContain('shared with you');
        });

        it('versions the user\'s own draft in place while the shared form is live', async () => {
            const myDraft = { OverrideID: 'OVER-MINE', ComponentID: 'COMP-MINE', ComponentName: 'Form', Status: 'Pending', Scope: 'User' };
            hoisted.actionResponses.set('Get Active Form For Entity', {
                Success: true, Message: JSON.stringify({ Active: sharedForm, Variants: [myDraft, sharedForm] }),
            });
            const svc = new InteractiveFormApplyService();
            const result = await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
            expect(result.Mode).toBe('modify-in-place');
            const modify = hoisted.actionCalls.find(c => c.id === 'Modify Interactive Form')!;
            expect((modify.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'OverrideID')?.Value).toBe('OVER-MINE');
        });

        it('never modifies a shared draft', async () => {
            const sharedDraft = { ...sharedForm, OverrideID: 'OVER-GD', Status: 'Pending' };
            hoisted.actionResponses.set('Get Active Form For Entity', {
                Success: true, Message: JSON.stringify({ Active: null, Variants: [sharedDraft] }),
            });
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
            expect(hoisted.actionCalls.map(c => c.id)).not.toContain('Modify Interactive Form');
            expect(hoisted.actionCalls.map(c => c.id)).toContain('Create Interactive Form');
        });

        it('drops the placement dialog\'s reading of the form once the form is written', async () => {
            hoisted.actionResponses.set('Get Active Form For Entity', {
                Success: true, Message: JSON.stringify({ Active: sharedForm, Variants: [sharedForm] }),
            });
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(spec(), 'MJ: Apps', mockProvider());
            expect(hoisted.forgotten).toEqual(['MJ: Apps']);
        });
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

    /** Opens a form: its snapshot goes into the registry, and the snapshot names it. */
    function snapshot(over: Record<string, unknown> = {}) {
        const opened = {
            Entity: ENTITY, Layout: 'accordion',
            Sections: [{ Key: 'details', Title: 'Details', Variant: 'default', Group: null, Hidden: false }],
            Related: [], Contributions: [], SlotsPresent: ['before-fields'], ChromeRuleCount: 0,
            ...over,
        } as unknown as FormCompositionSnapshot;
        registry.current!.Publish({}, opened);
        return opened as never;
    }

    /** Resolves the form's entity and any related entity a claim names, in registered casing. */
    const provider = () => mockProvider({
        EntityByName: (name: string) => (name.toLowerCase() === ENTITY.toLowerCase()
            ? { ID: 'ENT-PEOPLE', Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }] }
            : { ID: `ENT-${name}`, Name: name, PrimaryKeys: [{ Name: 'ID' }] }),
    });

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

    it('reads the open form\'s snapshot by the entity and record the agent context names', async () => {
        snapshot({ RecordPrimaryKey: 'ID|person-7', Sections: [{ Key: 'notes', Title: 'Notes', Variant: 'default', Group: null, Hidden: false, Fields: [] }] });
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), { Entity: ENTITY, RecordPrimaryKey: 'ID|person-7' });
        expect(hoisted.actionCalls.some(c => c.id === 'Get Form Composition For Entity')).toBe(false);
        expect((hoisted.placementContext?.Sections as Array<{ Key: string }>).map(s => s.Key)).toEqual(['notes']);
    });

    it('asks the server when no open form matches the record the agent context names', async () => {
        snapshot({ RecordPrimaryKey: 'ID|person-7' });
        const svc = new InteractiveFormApplyService();
        await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), { Entity: ENTITY, RecordPrimaryKey: 'ID|someone-else' });
        expect(hoisted.actionCalls.some(c => c.id === 'Get Form Composition For Entity')).toBe(true);
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

        /** An installed row, shaped the way Create writes it: a keyless panel carries `panel:<name>`. */
        function installed(over: Record<string, unknown>) {
            return {
                Success: true,
                Message: JSON.stringify({
                    EntityName: ENTITY,
                    Contributions: [{
                        ContributionID: 'ROW-EXISTING', ContributionKey: 'panel:PersonLtvStrip', Status: 'Active',
                        Scope: 'User', Name: 'Lifetime value', ComponentName: 'PersonLtvStrip', ...over,
                    }],
                }),
            };
        }

        const ids = () => hoisted.actionCalls.map(c => c.id);

        it('versions the installed row instead of adding a second copy when no key is declared', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity', installed({}));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            expect(ids()).toContain('Modify Form Contribution');
            expect(ids()).not.toContain('Create Form Contribution');
            const modify = hoisted.actionCalls.find(c => c.id === 'Modify Form Contribution')!;
            expect((modify.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'ContributionID')?.Value)
                .toBe('ROW-EXISTING');
        });

        it('still creates when the installed row is a different component', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity',
                installed({ ContributionKey: 'panel:SomeOtherStrip', ComponentName: 'SomeOtherStrip' }));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            expect(ids()).toContain('Create Form Contribution');
        });

        it('does not take over a row of the same component that claims something else', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity',
                installed({ ContributionKey: 'skip:something-else' }));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            expect(ids()).toContain('Create Form Contribution');
        });

        // Modify keeps a panel's key when it renames the component, so the row's key names the old one.
        it('finds a row whose key predates a rename of its component', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity',
                installed({ ContributionKey: 'panel:PersonLifetimeValue' }));
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(keylessSpec(), ENTITY, provider(), snapshot());

            expect(ids()).toContain('Modify Form Contribution');
            expect(ids()).not.toContain('Create Form Contribution');
        });

        it('treats a spec under another component name as a new panel', async () => {
            hoisted.actionResponses.set('Get Form Contributions For Entity', installed({}));
            const renamed = { ...keylessSpec(), name: 'PersonValueStrip' } as ComponentSpec;
            const svc = new InteractiveFormApplyService();

            await svc.ConfirmAndApply(renamed, ENTITY, provider(), snapshot());

            expect(ids()).toContain('Create Form Contribution');
        });
    });

    describe('what the dialog is offered from the open form', () => {
        const openForm = () => snapshot({
            RecordPrimaryKey: 'ID|person-7',
            Sections: [
                { Key: 'details', Title: 'Details', Variant: 'default', Group: '__mj_form_details', Hidden: false,
                  Fields: [{ Name: 'FirstName', Label: 'First name' }] },
                { Key: 'eventOrderLines', Title: 'MJ_BizApps_Orders: Event Order Lines', Variant: 'related-entity',
                  Group: 'eventOrderLines', Hidden: false, Fields: [] },
                { Key: 'panel:PersonLtvStrip', Title: 'Lifetime value', Variant: 'contribution', Group: null, Hidden: false, Fields: [] },
                { Key: 'systemMetadata', Title: 'System Metadata', Variant: 'default', Group: null, Hidden: false, Fields: [] },
            ],
            Related: [{ Entity: 'MJ_BizApps_Orders: Event Order Lines', JoinField: 'PersonID', SectionKey: 'eventOrderLines', Inclusion: 'Auto', Source: 'baked' }],
            Rail: [
                { Key: '__mj_form_details', Title: 'Details', Icon: 'fa fa-id-card', SectionKeys: ['details'], IsMore: false },
                { Key: 'eventOrderLines', Title: 'Event Order Lines', Icon: 'fa fa-table', SectionKeys: ['eventOrderLines'], IsMore: false },
                { Key: '__mj_form_more', Title: 'More', Icon: 'fa fa-folder', SectionKeys: ['systemMetadata'], IsMore: true },
            ],
        });

        it('offers only the field groups, not grids, panels or system metadata', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), openForm());
            expect((hoisted.placementContext?.Sections as Array<{ Key: string }>).map(s => s.Key)).toEqual(['details']);
        });

        it('names a grid the way its rail item is titled', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), openForm());
            expect(hoisted.placementContext?.Related).toEqual([
                { Entity: 'MJ_BizApps_Orders: Event Order Lines', JoinField: 'PersonID', DisplayName: 'Event Order Lines' },
            ]);
        });

        it('previews the record the user has open', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), openForm());
            expect(hoisted.placementRecordKey?.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'person-7' }]);
        });

        it('previews a sample record when the snapshot names none', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({ RecordPrimaryKey: '' }));
            expect(hoisted.placementRecordKey).toBeNull();
        });

        it('previews a sample record for a record not saved yet', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({ RecordPrimaryKey: null }));
            expect(hoisted.placementRecordKey).toBeNull();
        });

        it('previews a sample record when the key names fields that are not the entity\'s key', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot({ RecordPrimaryKey: 'Email|a@b.c' }));
            expect(hoisted.placementRecordKey).toBeNull();
        });
    });

    describe('replacing an installed panel with no open form', () => {
        const header = (priority: number, source: 'class' | 'metadata', entity = ENTITY) =>
            ({ Priority: priority, Source: source, Title: 'Header', Metadata: { entity, slot: 'before-fields', contributionKey: 'header' } });
        const precedenceSent = () => {
            const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
            return (create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Precedence')?.Value;
        };

        beforeEach(() => {
            hoisted.placement.contribution = {
                slot: 'after-fields', presentation: 'panel', title: 'Lifetime value', contributionKey: 'header',
            };
            hoisted.registrations = [header(3, 'class'), header(9, 'class', 'Some Other Entity')];
        });

        it('ranks the new row one above the compiled panel holding its key', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(precedenceSent()).toBe('4');
        });

        it('ranks it above the compiled override that wins the key, not the one it overrides', async () => {
            hoisted.registrations = [header(3, 'class'), header(7, 'class')];
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(precedenceSent()).toBe('8');
        });

        it('does not ask about a panel registered for another entity, whatever its rank', async () => {
            hoisted.registrations = [header(9, 'class', 'Some Other Entity')];
            hoisted.confirmResult = 'cancel';
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(precedenceSent()).toBe('0');
        });

        it('counts a compiled panel registered for every entity that holds the key', async () => {
            hoisted.registrations = [header(5, 'class', '*')];
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(precedenceSent()).toBe('6');
        });

        it('counts a compiled panel the user has hidden, which still holds its key', async () => {
            hoisted.registrations = [];
            hoisted.hiddenRegistrations = [header(3, 'class')];
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(precedenceSent()).toBe('4');
        });

        it('does not ask again when the user\'s own row already wins the key', async () => {
            hoisted.registrations = [header(3, 'class'), header(4, 'metadata')];
            hoisted.actionResponses.set('Get Form Contributions For Entity', {
                Success: true,
                Message: JSON.stringify({ EntityName: ENTITY, Contributions: [
                    { ContributionID: 'ROW-MINE', ContributionKey: 'header', Status: 'Active', Scope: 'User', ComponentName: 'PersonLtvStrip' },
                ] }),
            });
            hoisted.actionResponses.set('Modify Form Contribution', {
                Success: true, Message: JSON.stringify({ ContributionID: 'ROW-NEXT', ComponentID: 'C', Version: '1.1.0', Mode: 'new-version' }),
            });
            // A replace confirm would cancel, so reaching Modify shows it was not asked.
            hoisted.confirmResult = 'cancel';
            const svc = new InteractiveFormApplyService();
            const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(result.Success).toBe(true);
            expect(hoisted.actionCalls.map(c => c.id)).toContain('Modify Form Contribution');
        });

        it('cancels without writing when the user declines', async () => {
            hoisted.confirmResult = 'cancel';
            const svc = new InteractiveFormApplyService();
            const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(result).toMatchObject({ Success: false, Message: 'Cancelled by user.' });
            expect(hoisted.actionCalls.map(c => c.id)).not.toContain('Create Form Contribution');
        });

        it('loads the forms engine before it looks for the incumbent', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), null);
            expect(hoisted.events.slice(0, 2)).toEqual(['engine', 'collect']);
        });

        it('reads the open form instead, with no need for the engine', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(hoisted.events).toEqual([]);
        });
    });

    /**
     * Modify refuses a Role or Global row, so a panel shared with the user is never modified. The
     * user's own row is created above it instead, and outranks it for them alone.
     */
    describe('a panel shared with the user holds the key', () => {
        const params = (id: string) => (hoisted.actionCalls.find(c => c.id === id)?.params ?? []) as Array<{ Name: string; Value: string }>;
        const rows = (contributions: Array<Record<string, unknown>>) => hoisted.actionResponses.set('Get Form Contributions For Entity', {
            Success: true, Message: JSON.stringify({ EntityName: ENTITY, Contributions: contributions }),
        });

        beforeEach(() => {
            hoisted.placement.contribution = {
                slot: 'after-fields', presentation: 'panel', title: 'Lifetime value', contributionKey: 'header',
            };
            hoisted.actionResponses.set('Modify Form Contribution', {
                Success: true, Message: JSON.stringify({ ContributionID: 'ROW-NEXT', ComponentID: 'C', Version: '1.1.0', Mode: 'new-version' }),
            });
        });

        it('creates the user\'s own row one above the shared row, rather than modifying it', async () => {
            rows([{ ContributionID: 'ROW-G', ContributionKey: 'header', Status: 'Active', Scope: 'Global', Precedence: 3, ComponentName: 'PersonLtvStrip' }]);
            const svc = new InteractiveFormApplyService();
            const result = await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(result.Success).toBe(true);
            const ids = hoisted.actionCalls.map(c => c.id);
            expect(ids).toContain('Create Form Contribution');
            expect(ids).not.toContain('Modify Form Contribution');
            expect(params('Create Form Contribution').find(p => p.Name === 'Precedence')?.Value).toBe('4');
        });

        it('ranks above the highest of several shared rows', async () => {
            rows([
                { ContributionID: 'ROW-R', ContributionKey: 'header', Status: 'Active', Scope: 'Role', Precedence: 6 },
                { ContributionID: 'ROW-G', ContributionKey: 'header', Status: 'Active', Scope: 'Global', Precedence: 2 },
                { ContributionID: 'ROW-OFF', ContributionKey: 'header', Status: 'Inactive', Scope: 'Global', Precedence: 50 },
            ]);
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(params('Create Form Contribution').find(p => p.Name === 'Precedence')?.Value).toBe('7');
        });

        it('lifts the user\'s own row above a shared row that outranks it', async () => {
            rows([
                { ContributionID: 'ROW-MINE', ContributionKey: 'header', Status: 'Active', Scope: 'User', Precedence: 0, ComponentName: 'PersonLtvStrip' },
                { ContributionID: 'ROW-G', ContributionKey: 'header', Status: 'Active', Scope: 'Global', Precedence: 3 },
            ]);
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(params('Modify Form Contribution').find(p => p.Name === 'ContributionID')?.Value).toBe('ROW-MINE');
            expect(params('Modify Form Contribution').find(p => p.Name === 'Precedence')?.Value).toBe('4');
        });

        it('leaves the user\'s own row\'s rank alone when nothing outranks it', async () => {
            rows([{ ContributionID: 'ROW-MINE', ContributionKey: 'header', Status: 'Active', Scope: 'User', Precedence: 5, ComponentName: 'PersonLtvStrip' }]);
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(params('Modify Form Contribution').find(p => p.Name === 'Precedence')).toBeUndefined();
        });
    });

    /** The placement dialog reads the form once per entity, so a write drops that reading. */
    describe('the placement dialog\'s reading of the form', () => {
        it('is dropped after the panel is written', async () => {
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(hoisted.forgotten).toEqual([ENTITY]);
        });

        it('is kept when the write fails', async () => {
            hoisted.actionResponses.set('Create Form Contribution', { Success: false, Message: 'boom' });
            const svc = new InteractiveFormApplyService();
            await svc.ConfirmAndApply(panelSpec(), ENTITY, provider(), snapshot());
            expect(hoisted.forgotten).toEqual([]);
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
        registry.current!.Publish({}, snapshot);
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
