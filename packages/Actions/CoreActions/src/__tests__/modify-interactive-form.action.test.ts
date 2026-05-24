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

function validSpec(): Record<string, unknown> {
    return {
        name: 'F',
        componentRole: 'form',
        location: 'embedded',
        code: 'function F() { return null; }',
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

    it('returns LINT_FAILED when the new spec has no componentRole', async () => {
        hoisted.overrides.set('OVER-1', {
            record: {
                ID: 'OVER-1', EntityID: 'ENT-1', ComponentID: 'COMP-1',
                Name: 'F', Scope: 'User', UserID: 'U1', RoleID: null,
                Priority: 0, Status: 'Active',
            },
            saveOutcome: true, loaded: false,
        });
        hoisted.components.set('COMP-1', {
            record: {
                ID: 'COMP-1', Name: 'F', Status: 'Published',
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
});
