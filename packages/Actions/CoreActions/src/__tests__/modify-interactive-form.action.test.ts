import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

/**
 * Modify Interactive Form is the centerpiece of the refinement lifecycle.
 * Two paths to test:
 *   - Pending Component → modify *in place* (same row, no version bump)
 *   - Active Component → insert a new Pending Component v(N+1) + sibling
 *     Pending Override, leave the live Active untouched.
 */

interface MockEntityState {
    record: Record<string, unknown>;
    saveOutcome: boolean;
    loaded: boolean;
}

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        // Overrides keyed by ID
        overrides: new Map<string, MockEntityState>(),
        // Components keyed by ID
        components: new Map<string, MockEntityState>(),
        // Captures created (new) entities so tests can inspect them
        newComponents: [] as MockEntityState[],
        newOverrides: [] as MockEntityState[],
        // Next IDs handed out by NewRecord
        nextOverrideID: 0,
        nextComponentID: 0,
        // Lint result
        lintResult: { violations: [] } as unknown,
    },
}));

class MockEntity {
    public NewRecordCalled = false;
    public ID = '';
    public LatestResult = { CompleteMessage: 'mock error' };

    constructor(public entityName: string, private state: MockEntityState) {}

    NewRecord(): void {
        this.NewRecordCalled = true;
        if (this.entityName === 'MJ: Components') {
            this.ID = `comp-new-${++hoisted.nextComponentID}`;
            hoisted.components.set(this.ID, this.state);
            hoisted.newComponents.push(this.state);
        } else {
            this.ID = `over-new-${++hoisted.nextOverrideID}`;
            hoisted.overrides.set(this.ID, this.state);
            hoisted.newOverrides.push(this.state);
        }
        this.state.record.ID = this.ID;
    }

    async Load(id: string): Promise<boolean> {
        const existing = this.entityName === 'MJ: Components'
            ? hoisted.components.get(id)
            : hoisted.overrides.get(id);
        if (!existing) return false;
        // Copy existing into this.state so the action's setters mutate the canonical row.
        Object.assign(this.state.record, existing.record);
        this.state.record.ID = id;
        this.ID = id;
        this.state.loaded = true;
        // Replace map entry with the live state so writes propagate.
        if (this.entityName === 'MJ: Components') hoisted.components.set(id, this.state);
        else hoisted.overrides.set(id, this.state);
        return true;
    }

    async Save(): Promise<boolean> {
        return this.state.saveOutcome;
    }
}

function makeEntity(entityName: string): MockEntity {
    const state: MockEntityState = {
        record: {},
        saveOutcome: true,
        loaded: false,
    };
    // Proxy the public surface so the action's `entity.Status = 'Pending'` style
    // setters land in `state.record`.
    const inst = new MockEntity(entityName, state);
    return new Proxy(inst, {
        get(t, prop: string) {
            if (prop in t) return (t as unknown as Record<string, unknown>)[prop];
            return state.record[prop];
        },
        set(t, prop: string, value: unknown) {
            if (prop in t) (t as unknown as Record<string, unknown>)[prop] = value;
            else state.record[prop] = value;
            return true;
        },
    }) as MockEntity;
}

class MockProvider {
    EntityByName(_name: string) { return { ID: 'ENT-1', Name: 'MJ: Apps' }; }
    async GetEntityObject<T>(entityName: string): Promise<T> {
        return makeEntity(entityName) as unknown as T;
    }
}

vi.mock('@memberjunction/react-linter', () => ({
    ComponentLinter: { async lintComponent() { return hoisted.lintResult; } },
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        MJComponentEntity: actual.MJComponentEntity ?? class {},
        MJEntityFormOverrideEntity: actual.MJEntityFormOverrideEntity ?? class {},
    };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    // Self-contained inline provider — vi.mock factories are hoisted above
    // local declarations, so we can't reference outer makeEntity / MockProvider.
    // Build a parallel minimal entity factory here that writes through to the
    // same hoisted state buckets.
    function makeHoistedEntity(entityName: string) {
        const state = {
            record: {} as Record<string, unknown>,
            saveOutcome: true,
            loaded: false,
        };
        const inst = {
            NewRecordCalled: false,
            ID: '',
            LatestResult: { CompleteMessage: 'mock error' },
            entityName,
            NewRecord() {
                this.NewRecordCalled = true;
                if (entityName === 'MJ: Components') {
                    this.ID = `comp-new-${++hoisted.nextComponentID}`;
                    hoisted.components.set(this.ID, state);
                    hoisted.newComponents.push(state);
                } else {
                    this.ID = `over-new-${++hoisted.nextOverrideID}`;
                    hoisted.overrides.set(this.ID, state);
                    hoisted.newOverrides.push(state);
                }
                state.record.ID = this.ID;
            },
            async Load(id: string): Promise<boolean> {
                const existing = entityName === 'MJ: Components'
                    ? hoisted.components.get(id)
                    : hoisted.overrides.get(id);
                if (!existing) return false;
                Object.assign(state.record, existing.record);
                state.record.ID = id;
                this.ID = id;
                state.loaded = true;
                if (entityName === 'MJ: Components') hoisted.components.set(id, state);
                else hoisted.overrides.set(id, state);
                return true;
            },
            async Save(): Promise<boolean> { return state.saveOutcome; },
        };
        return new Proxy(inst, {
            get(t, prop: string) {
                if (prop in t) return (t as unknown as Record<string, unknown>)[prop];
                return state.record[prop];
            },
            set(t, prop: string, value: unknown) {
                if (prop in t) (t as unknown as Record<string, unknown>)[prop] = value;
                else state.record[prop] = value;
                return true;
            },
        });
    }
    class HoistedProvider {
        EntityByName() { return { ID: 'ENT-1', Name: 'MJ: Apps' }; }
        async GetEntityObject<T>(entityName: string): Promise<T> {
            return makeHoistedEntity(entityName) as unknown as T;
        }
    }
    return {
        ...actual,
        Metadata: { Provider: new HoistedProvider() },
        RunView: class {
            static FromMetadataProvider() {
                return new (class {
                    async RunView() { return { Success: true, Results: [] }; }
                })();
            }
        },
        LogError: vi.fn(),
    };
});

import { ModifyInteractiveFormAction } from '../custom/interactive-forms/modify-interactive-form.action';

function validSpec(name: string = 'CompactForm'): Record<string, unknown> {
    return {
        name,
        componentRole: 'form',
        location: 'embedded',
        code: `function ${name}() { return null; }`,
    };
}

function mkParams(overrideID: string, spec: unknown = validSpec()): RunActionParams {
    return {
        Params: [
            { Name: 'OverrideID', Type: 'Input', Value: overrideID },
            { Name: 'Spec', Type: 'Input', Value: spec },
        ],
        // Leave Provider unset so the action falls back to the mocked
        // Metadata.Provider (which is the hoisted one inside vi.mock).
        ContextUser: { ID: 'U1', Name: 'Test' },
    } as unknown as RunActionParams;
}

async function run(action: ModifyInteractiveFormAction, p: RunActionParams): Promise<ActionResultSimple> {
    return await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> })
        .InternalRunAction(p);
}

describe('ModifyInteractiveFormAction', () => {
    beforeEach(() => {
        hoisted.overrides.clear();
        hoisted.components.clear();
        hoisted.newComponents.length = 0;
        hoisted.newOverrides.length = 0;
        hoisted.nextOverrideID = 0;
        hoisted.nextComponentID = 0;
        hoisted.lintResult = { violations: [] };
    });

    it('returns MISSING_PARAMETER when OverrideID is absent', async () => {
        const action = new ModifyInteractiveFormAction();
        const result = await action['InternalRunAction']({
            Params: [{ Name: 'Spec', Type: 'Input', Value: validSpec() }],
            ContextUser: { ID: 'U1', Name: 'T' },
        } as unknown as RunActionParams);
        expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('returns OVERRIDE_NOT_FOUND when the supplied OverrideID is unknown', async () => {
        const result = await run(new ModifyInteractiveFormAction(), mkParams('does-not-exist'));
        expect(result.ResultCode).toBe('OVERRIDE_NOT_FOUND');
    });

    it('Pending Component → modifies in place (no new Component, no new Override)', async () => {
        // Seed: an override pointing at a Pending (Status='Draft') component.
        hoisted.overrides.set('OVER-PENDING', {
            record: {
                ID: 'OVER-PENDING',
                EntityID: 'ENT-1', ComponentID: 'COMP-PENDING',
                Name: 'CompactForm', Description: null,
                Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Pending',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-PENDING', {
            record: {
                ID: 'COMP-PENDING',
                Name: 'CompactForm', Title: 'CompactForm',
                Description: null, Type: 'Form', Status: 'Draft',
                Version: '1.1.0', VersionSequence: 2,
                Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const result = await run(new ModifyInteractiveFormAction(), mkParams('OVER-PENDING'));
        expect(result.Success).toBe(true);
        // No new entities should have been created — in-place mode.
        expect(hoisted.newComponents.length).toBe(0);
        expect(hoisted.newOverrides.length).toBe(0);
        // Mode in the message should be 'in-place'.
        expect(result.Message).toMatch(/in-place/);
    });

    it('Active Component → creates a new Component v(N+1) Pending + new Pending Override', async () => {
        // Seed: an override pointing at an Active (Status='Published') component.
        hoisted.overrides.set('OVER-ACTIVE', {
            record: {
                ID: 'OVER-ACTIVE',
                EntityID: 'ENT-1', ComponentID: 'COMP-ACTIVE',
                Name: 'CompactForm', Description: null,
                Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-ACTIVE', {
            record: {
                ID: 'COMP-ACTIVE',
                Name: 'CompactForm', Title: 'CompactForm',
                Description: null, Type: 'Form', Status: 'Published',
                Version: '1.0.0', VersionSequence: 1,
                Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const result = await run(new ModifyInteractiveFormAction(), mkParams('OVER-ACTIVE'));
        expect(result.Success).toBe(true);
        expect(result.Message).toMatch(/new-version/);
        // A new Component AND a new Override should have been created.
        expect(hoisted.newComponents.length).toBe(1);
        expect(hoisted.newOverrides.length).toBe(1);
        // The new Component should have Status='Draft' (= Pending) and Version 1.1.0.
        const newComp = hoisted.newComponents[0].record;
        expect(newComp.Status).toBe('Draft');
        expect(newComp.Version).toBe('1.1.0');
        expect(newComp.VersionSequence).toBe(2);
        // The new Override should be Status='Pending' (resolver's union).
        const newOver = hoisted.newOverrides[0].record;
        expect(newOver.Status).toBe('Pending');
        // The original Active override should NOT have been mutated.
        const stillActive = hoisted.overrides.get('OVER-ACTIVE')!.record;
        expect(stillActive.Status).toBe('Active');
    });

    it('FORBIDDEN when the override is User-scope to a different user', async () => {
        hoisted.overrides.set('OVER-OTHER', {
            record: {
                ID: 'OVER-OTHER', EntityID: 'ENT-1', ComponentID: 'COMP-OTHER',
                Name: 'CompactForm', Scope: 'User', UserID: 'OTHER-USER', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-OTHER', {
            record: { ID: 'COMP-OTHER', Name: 'CompactForm', Status: 'Published', Version: '1.0.0', VersionSequence: 1, Specification: '{}' },
            saveOutcome: true, loaded: false,
        });
        const result = await run(new ModifyInteractiveFormAction(), mkParams('OVER-OTHER'));
        expect(result.ResultCode).toBe('FORBIDDEN');
        // No mutations should have happened.
        expect(hoisted.newComponents.length).toBe(0);
        expect(hoisted.newOverrides.length).toBe(0);
    });

    it('new-version path clamps the new Pending Override to User scope (security)', async () => {
        // Even when modifying a Role-scope override the caller has access to,
        // the produced Pending sibling MUST be User-scope to the caller.
        // Scope-promotion is a separate human action; the agent path can't widen.
        // Caller has Role 'R1'.
        hoisted.overrides.set('OVER-ROLE', {
            record: {
                ID: 'OVER-ROLE', EntityID: 'ENT-1', ComponentID: 'COMP-ROLE',
                Name: 'CompactForm', Scope: 'Role', UserID: null, RoleID: 'R1',
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-ROLE', {
            record: { ID: 'COMP-ROLE', Name: 'CompactForm', Status: 'Published', Version: '1.0.0', VersionSequence: 1, Specification: '{}' },
            saveOutcome: true, loaded: false,
        });
        const params = mkParams('OVER-ROLE');
        // Override the context user to include role R1.
        (params as unknown as { ContextUser: { UserRoles: { RoleID: string }[]; ID: string; Name: string } }).ContextUser = {
            ID: 'U1', Name: 'Test', UserRoles: [{ RoleID: 'R1' }],
        };
        const result = await run(new ModifyInteractiveFormAction(), params);
        expect(result.Success).toBe(true);
        expect(hoisted.newOverrides.length).toBe(1);
        // Critical: the NEW Pending Override is User scope, not Role.
        const newOver = hoisted.newOverrides[0].record;
        expect(newOver.Scope).toBe('User');
        expect(newOver.UserID).toBe('U1');
        expect(newOver.RoleID).toBeNull();
    });

    it('returns LINT_FAILED when the new spec has no componentRole', async () => {
        hoisted.overrides.set('OVER-1', {
            record: {
                ID: 'OVER-1', EntityID: 'ENT-1', ComponentID: 'COMP-1',
                Name: 'CompactForm', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-1', {
            record: {
                ID: 'COMP-1', Name: 'CompactForm', Status: 'Published',
                Version: '1.0.0', VersionSequence: 1, Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const result = await run(new ModifyInteractiveFormAction(), mkParams('OVER-1', {
            ...validSpec(),
            componentRole: 'dashboard',
        }));
        expect(result.ResultCode).toBe('LINT_FAILED');
        expect(result.Message).toMatch(/componentRole='form'/);
        // Nothing should have been persisted.
        expect(hoisted.newComponents.length).toBe(0);
        expect(hoisted.newOverrides.length).toBe(0);
    });

    it('LINEAGE_NAME_MISMATCH when spec.name differs from existing Component.Name', async () => {
        hoisted.overrides.set('OVER-LINEAGE', {
            record: {
                ID: 'OVER-LINEAGE', EntityID: 'ENT-1', ComponentID: 'COMP-LINEAGE',
                Name: 'CompactForm', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-LINEAGE', {
            record: {
                ID: 'COMP-LINEAGE', Name: 'CompactForm', Title: 'CompactForm',
                Status: 'Published', Version: '1.0.0', VersionSequence: 1, Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        // Agent submits a renamed spec — would silently fork the lineage.
        const result = await run(new ModifyInteractiveFormAction(), mkParams('OVER-LINEAGE', validSpec('RenamedForm')));
        expect(result.ResultCode).toBe('LINEAGE_NAME_MISMATCH');
        expect(result.Message).toMatch(/CompactForm/);
        // Nothing should have been written.
        expect(hoisted.newComponents.length).toBe(0);
        expect(hoisted.newOverrides.length).toBe(0);
    });

    it('routes off Override.Status not Component.Status (drift scenario)', async () => {
        // Setup: Override is Active (live), Component is Draft (Pending lifecycle).
        // The original implementation routed off Component.Status and would have
        // gone into the in-place branch, silently overwriting the live form.
        // The fix routes off Override.Status, so this MUST snapshot to a new
        // Pending version (default 'minor' bump since Active source) and leave
        // the original Active override untouched.
        hoisted.overrides.set('OVER-DRIFT', {
            record: {
                ID: 'OVER-DRIFT', EntityID: 'ENT-1', ComponentID: 'COMP-DRIFT',
                Name: 'CompactForm', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-DRIFT', {
            record: {
                ID: 'COMP-DRIFT', Name: 'CompactForm', Title: 'CompactForm',
                Status: 'Draft', // <- drift: Override is Active but underlying is Draft
                Version: '1.0.0', VersionSequence: 1, Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const result = await run(new ModifyInteractiveFormAction(), mkParams('OVER-DRIFT'));
        expect(result.Success).toBe(true);
        expect(result.Message).toMatch(/new-version/);
        expect(result.Message).toMatch(/"PreviousSourceStatus":"Active"/);
        expect(hoisted.newComponents.length).toBe(1);
        expect(hoisted.newOverrides.length).toBe(1);
    });

    it('Pending Override + VersionBumpKind=patch → snapshot + demote prior Pending', async () => {
        hoisted.overrides.set('OVER-PEND-PATCH', {
            record: {
                ID: 'OVER-PEND-PATCH', EntityID: 'ENT-1', ComponentID: 'COMP-PEND-PATCH',
                Name: 'CompactForm', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Pending',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-PEND-PATCH', {
            record: {
                ID: 'COMP-PEND-PATCH', Name: 'CompactForm', Title: 'CompactForm',
                Status: 'Draft', Version: '1.0.0', VersionSequence: 1, Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const params = mkParams('OVER-PEND-PATCH');
        params.Params.push({ Name: 'VersionBumpKind', Type: 'Input', Value: 'patch' });
        const result = await run(new ModifyInteractiveFormAction(), params);
        expect(result.Success).toBe(true);
        expect(result.Message).toMatch(/new-version/);
        expect(result.Message).toMatch(/"BumpKind":"patch"/);
        expect(result.Message).toMatch(/"Version":"1\.0\.1"/);
        // The prior Pending Override should have been demoted to Inactive.
        expect(result.Message).toMatch(/"DemotedOverrideID":"OVER-PEND-PATCH"/);
        expect(hoisted.newComponents.length).toBe(1);
        expect(hoisted.newOverrides.length).toBe(1);
    });

    it('rejects in-place against Active source', async () => {
        hoisted.overrides.set('OVER-ACTIVE-INPLACE', {
            record: {
                ID: 'OVER-ACTIVE-INPLACE', EntityID: 'ENT-1', ComponentID: 'COMP-ACTIVE-INPLACE',
                Name: 'CompactForm', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-ACTIVE-INPLACE', {
            record: {
                ID: 'COMP-ACTIVE-INPLACE', Name: 'CompactForm', Title: 'CompactForm',
                Status: 'Published', Version: '1.0.0', VersionSequence: 1, Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const params = mkParams('OVER-ACTIVE-INPLACE');
        params.Params.push({ Name: 'VersionBumpKind', Type: 'Input', Value: 'in-place' });
        const result = await run(new ModifyInteractiveFormAction(), params);
        expect(result.ResultCode).toBe('INVALID_BUMP_FOR_STATUS');
        expect(hoisted.newComponents.length).toBe(0);
        expect(hoisted.newOverrides.length).toBe(0);
    });

    it('INVALID_BUMP_KIND for unknown VersionBumpKind value', async () => {
        hoisted.overrides.set('OVER-BAD-KIND', {
            record: {
                ID: 'OVER-BAD-KIND', EntityID: 'ENT-1', ComponentID: 'COMP-BAD-KIND',
                Name: 'CompactForm', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Pending',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-BAD-KIND', {
            record: {
                ID: 'COMP-BAD-KIND', Name: 'CompactForm', Title: 'CompactForm',
                Status: 'Draft', Version: '1.0.0', VersionSequence: 1, Specification: '{}',
            },
            saveOutcome: true, loaded: false,
        });
        const params = mkParams('OVER-BAD-KIND');
        params.Params.push({ Name: 'VersionBumpKind', Type: 'Input', Value: 'bump-it' });
        const result = await run(new ModifyInteractiveFormAction(), params);
        expect(result.ResultCode).toBe('INVALID_BUMP_KIND');
    });
});
