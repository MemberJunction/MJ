import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

/**
 * `Activate Interactive Form Version` and `Revert Interactive Form` share the
 * same end-state intent: make a specific Component the live form for the
 * (entity, user) pair. Activate is for promoting a Pending; Revert is for
 * re-pointing the Active back to an older row. The tests below cover both
 * happy paths + the no-op / NOT_PENDING / NOT_ACTIVE guards.
 */

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        overrides: new Map<string, { record: Record<string, unknown>; saveOutcome: boolean }>(),
        components: new Map<string, { record: Record<string, unknown>; saveOutcome: boolean }>(),
        runViewResults: [] as Array<Array<Record<string, unknown>>>,
        /** The ExtraFilter of every RunView, in order. */
        filters: [] as string[],
        /** Row IDs whose saves fail. */
        failingSaves: new Set<string>(),
        /** While a transaction is open, saves are pending and reach `committed` only on Commit. */
        tx: { supported: false, open: false, pending: [] as string[], committed: [] as string[], rolledBack: 0 },
    },
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

    function makeHoistedEntity(entityName: string) {
        const state = { record: {} as Record<string, unknown>, saveOutcome: true };
        const inst = {
            ID: '',
            LatestResult: { CompleteMessage: 'mock error' },
            async Load(id: string): Promise<boolean> {
                const existing = entityName === 'MJ: Components'
                    ? hoisted.components.get(id)
                    : hoisted.overrides.get(id);
                if (!existing) return false;
                Object.assign(state.record, existing.record);
                state.record.ID = id;
                this.ID = id;
                if (entityName === 'MJ: Components') hoisted.components.set(id, state);
                else hoisted.overrides.set(id, state);
                return true;
            },
            async Save(): Promise<boolean> {
                const id = String(state.record.ID);
                if (!state.saveOutcome || hoisted.failingSaves.has(id)) return false;
                (hoisted.tx.open ? hoisted.tx.pending : hoisted.tx.committed).push(id);
                return true;
            },
            NewRecord(): void { /* unused */ },
        };
        return new Proxy(inst, {
            get(t, p: string) { return p in t ? (t as unknown as Record<string, unknown>)[p] : state.record[p]; },
            set(t, p: string, v: unknown) {
                if (p in t) (t as unknown as Record<string, unknown>)[p] = v;
                else state.record[p] = v;
                return true;
            },
        });
    }
    class HoistedProvider {
        get SupportsEntityTransactions() { return hoisted.tx.supported; }
        async BeginEntityTransaction() {
            hoisted.tx.open = true;
            return {
                IsNested: false,
                async Commit() { hoisted.tx.committed.push(...hoisted.tx.pending); hoisted.tx.pending = []; hoisted.tx.open = false; },
                async Rollback() { hoisted.tx.pending = []; hoisted.tx.open = false; hoisted.tx.rolledBack++; },
            };
        }
        EntityByName() { return { ID: 'ENT-1' }; }
        async GetEntityObject<T>(name: string): Promise<T> { return makeHoistedEntity(name) as unknown as T; }
    }
    return {
        ...actual,
        Metadata: { Provider: new HoistedProvider() },
        RunView: class {
            static FromMetadataProvider() {
                return new (class {
                    async RunView(p: { ExtraFilter?: string }) {
                        hoisted.filters.push(p?.ExtraFilter ?? '');
                        const next = hoisted.runViewResults.shift() ?? [];
                        return { Success: true, Results: next };
                    }
                })();
            }
        },
        LogError: vi.fn(),
    };
});

import { ActivateInteractiveFormVersionAction } from '../custom/interactive-forms/activate-interactive-form-version.action';
import { RevertInteractiveFormAction } from '../custom/interactive-forms/revert-interactive-form.action';

function mkParams(named: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(named).map(([k, v]) => ({ Name: k, Type: 'Input', Value: v })),
        ContextUser: { ID: 'U1', Name: 'Test' },
    } as unknown as RunActionParams;
}

async function run<T extends ActivateInteractiveFormVersionAction | RevertInteractiveFormAction>(action: T, p: RunActionParams): Promise<ActionResultSimple> {
    return await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> })
        .InternalRunAction(p);
}

function seedOverride(id: string, attrs: Record<string, unknown>): void {
    // Default Scope='User' / UserID='U1' so the ownership check (added in
    // the security pass) accepts the seeded row by default. Tests for the
    // FORBIDDEN path override Scope / UserID explicitly.
    hoisted.overrides.set(id, {
        record: { ID: id, EntityID: 'ENT-1', UserID: 'U1', RoleID: null, Scope: 'User', Priority: 0, ...attrs },
        saveOutcome: true,
    });
}
function seedComponent(id: string, attrs: Record<string, unknown>): void {
    hoisted.components.set(id, { record: { ID: id, ...attrs }, saveOutcome: true });
}

beforeEach(() => {
    hoisted.overrides.clear();
    hoisted.components.clear();
    hoisted.runViewResults.length = 0;
    hoisted.failingSaves = new Set();
    hoisted.filters = [];
    hoisted.tx = { supported: false, open: false, pending: [], committed: [], rolledBack: 0 };
});

/**
 * Agents change their own personal forms only. A shared form is managed by people, from Form
 * Builder or the Manage drawer, so a Role or Global override is refused for a member of the role
 * and for a grant holder alike.
 */
const SHARED_CASES = [
    ['a Role override, for a member of the role', { Scope: 'Role', UserID: null, RoleID: 'R1' }, { ID: 'U1', Name: 'Test', UserRoles: [{ RoleID: 'R1' }] }],
    ['a Global override, for an Owner', { Scope: 'Global', UserID: null, RoleID: null }, { ID: 'U1', Name: 'Test', Type: 'Owner' }],
] as const;

function asUser(p: RunActionParams, user: unknown): RunActionParams {
    (p as unknown as { ContextUser: unknown }).ContextUser = user;
    return p;
}

describe('ActivateInteractiveFormVersionAction', () => {

    it('returns MISSING_PARAMETER without OverrideID', async () => {
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({}));
        expect(r.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('FORBIDDEN when the target Override is User-scope to a different user', async () => {
        seedOverride('OVER-X', { ComponentID: 'COMP-X', Scope: 'User', UserID: 'OTHER-USER', Status: 'Pending' });
        seedComponent('COMP-X', { Status: 'Draft' });
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-X' }));
        expect(r.ResultCode).toBe('FORBIDDEN');
    });

    for (const [label, scope, user] of SHARED_CASES) {
        it(`FORBIDDEN on ${label}, before any write`, async () => {
            seedOverride('OVER-S', { ComponentID: 'COMP-S', ...scope, Status: 'Pending' });
            seedComponent('COMP-S', { Status: 'Draft' });
            const r = await run(new ActivateInteractiveFormVersionAction(), asUser(mkParams({ OverrideID: 'OVER-S' }), user));
            expect(r.ResultCode).toBe('FORBIDDEN');
            expect(r.Message).toMatch(/Form Builder|Manage drawer/);
            expect(hoisted.components.get('COMP-S')!.record.Status).toBe('Draft');
            expect(hoisted.tx.committed).toEqual([]);
        });
    }

    /** The component and the override flip together or not at all. */
    it('rolls back the component when the override cannot be flipped to Active', async () => {
        hoisted.tx.supported = true;
        seedOverride('OVER-PENDING', { ComponentID: 'COMP-NEW', Status: 'Pending' });
        seedComponent('COMP-NEW', { Status: 'Draft' });
        hoisted.failingSaves.add('OVER-PENDING');
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-PENDING' }));
        expect(r.ResultCode).toBe('PERSIST_FAILED');
        expect(hoisted.tx.rolledBack).toBe(1);
        expect(hoisted.tx.committed).toEqual([]);
    });

    it('commits the component and the override together', async () => {
        hoisted.tx.supported = true;
        seedOverride('OVER-PENDING', { ComponentID: 'COMP-NEW', Status: 'Pending' });
        seedComponent('COMP-NEW', { Status: 'Draft' });
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-PENDING' }));
        expect(r.Success).toBe(true);
        expect(hoisted.tx.committed).toEqual(['COMP-NEW', 'OVER-PENDING']);
    });

    it('looks for prior Active siblings among the caller\'s own overrides only', async () => {
        seedOverride('OVER-PENDING', { ComponentID: 'COMP-NEW', Status: 'Pending' });
        seedComponent('COMP-NEW', { Status: 'Draft' });
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-PENDING' }));
        expect(r.Success).toBe(true);
        expect(hoisted.filters[0]).toContain("Scope='User' AND UserID='U1'");
        expect(hoisted.filters[0]).toContain("ID <> 'OVER-PENDING'");
    });

    it('returns OVERRIDE_NOT_FOUND for an unknown ID', async () => {
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'nope' }));
        expect(r.ResultCode).toBe('OVERRIDE_NOT_FOUND');
    });

    it('is idempotent: already-Active override returns SUCCESS as a no-op', async () => {
        seedOverride('OVER-A', { ComponentID: 'COMP-A', Scope: 'User', Status: 'Active' });
        seedComponent('COMP-A', { Status: 'Published' });
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-A' }));
        expect(r.Success).toBe(true);
        expect(r.Message).toMatch(/noop/);
    });

    it('NOT_PENDING when the target Override is Inactive', async () => {
        seedOverride('OVER-INACTIVE', { ComponentID: 'COMP-1', Scope: 'User', Status: 'Inactive' });
        seedComponent('COMP-1', { Status: 'Deprecated' });
        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-INACTIVE' }));
        expect(r.ResultCode).toBe('NOT_PENDING');
    });

    /**
     * The prior version is set aside after the promotion's transaction. A save that fails there
     * fails the action, so the caller learns that two forms are now Active.
     */
    it.each([['its override', 'OVER-PRIOR'], ['its component', 'COMP-OLD']])(
        'fails when the prior Active version cannot be set aside (%s)',
        async (_label, failingID) => {
            seedOverride('OVER-PENDING', { ComponentID: 'COMP-NEW', Scope: 'User', Status: 'Pending' });
            seedComponent('COMP-NEW', { Status: 'Draft' });
            seedOverride('OVER-PRIOR', { ComponentID: 'COMP-OLD', Scope: 'User', Status: 'Active' });
            seedComponent('COMP-OLD', { Status: 'Published' });
            hoisted.runViewResults.push([{ ID: 'OVER-PRIOR', ComponentID: 'COMP-OLD' }]);
            hoisted.failingSaves.add(failingID);

            const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-PENDING' }));
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('PERSIST_FAILED');
            expect(r.Message).toContain(failingID);
            expect(r.Message).toContain('OVER-PENDING');
        },
    );

    it('promotes Pending → Active and demotes the prior sibling Active', async () => {
        seedOverride('OVER-PENDING', { ComponentID: 'COMP-NEW', Scope: 'User', Status: 'Pending' });
        seedComponent('COMP-NEW', { Status: 'Draft' });
        // Prior Active sibling — will be discovered via the RunView mock
        seedOverride('OVER-PRIOR', { ComponentID: 'COMP-OLD', Scope: 'User', Status: 'Active' });
        seedComponent('COMP-OLD', { Status: 'Published' });
        hoisted.runViewResults.push([{ ID: 'OVER-PRIOR', ComponentID: 'COMP-OLD' }]);

        const r = await run(new ActivateInteractiveFormVersionAction(), mkParams({ OverrideID: 'OVER-PENDING' }));
        expect(r.Success).toBe(true);
        // Target is now Active
        expect(hoisted.overrides.get('OVER-PENDING')!.record.Status).toBe('Active');
        expect(hoisted.components.get('COMP-NEW')!.record.Status).toBe('Published');
        // Prior demoted to Inactive
        expect(hoisted.overrides.get('OVER-PRIOR')!.record.Status).toBe('Inactive');
        expect(hoisted.components.get('COMP-OLD')!.record.Status).toBe('Deprecated');
    });
});

describe('RevertInteractiveFormAction', () => {

    it('returns MISSING_PARAMETER without ActiveOverrideID', async () => {
        const r = await run(new RevertInteractiveFormAction(), mkParams({}));
        expect(r.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('requires either TargetComponentID or TargetVersionSequence', async () => {
        seedOverride('OVER-1', { ComponentID: 'COMP-1', Status: 'Active' });
        seedComponent('COMP-1', { Name: 'F' });
        const r = await run(new RevertInteractiveFormAction(), mkParams({ ActiveOverrideID: 'OVER-1' }));
        expect(r.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('FORBIDDEN on another user\'s override', async () => {
        seedOverride('OVER-1', { ComponentID: 'COMP-NEW', Status: 'Active', UserID: 'OTHER-USER' });
        seedComponent('COMP-NEW', { Name: 'F', Version: '1.1.0', Status: 'Published' });
        const r = await run(new RevertInteractiveFormAction(), mkParams({ ActiveOverrideID: 'OVER-1', TargetComponentID: 'COMP-NEW' }));
        expect(r.ResultCode).toBe('FORBIDDEN');
    });

    for (const [label, scope, user] of SHARED_CASES) {
        it(`FORBIDDEN on ${label}, before any write`, async () => {
            seedOverride('OVER-S', { ComponentID: 'COMP-NEW', ...scope, Status: 'Active' });
            seedComponent('COMP-NEW', { Name: 'F', Version: '1.1.0', Status: 'Published' });
            seedComponent('COMP-OLD', { Name: 'F', Version: '1.0.0', Status: 'Deprecated' });
            const r = await run(new RevertInteractiveFormAction(),
                asUser(mkParams({ ActiveOverrideID: 'OVER-S', TargetComponentID: 'COMP-OLD' }), user));
            expect(r.ResultCode).toBe('FORBIDDEN');
            expect(hoisted.overrides.get('OVER-S')!.record.ComponentID).toBe('COMP-NEW');
            expect(hoisted.tx.committed).toEqual([]);
        });
    }

    it('NOT_ACTIVE when the override is not currently Active', async () => {
        seedOverride('OVER-PENDING', { ComponentID: 'COMP-1', Status: 'Pending' });
        seedComponent('COMP-1', { Name: 'F' });
        const r = await run(new RevertInteractiveFormAction(), mkParams({
            ActiveOverrideID: 'OVER-PENDING', TargetComponentID: 'COMP-OLD',
        }));
        expect(r.ResultCode).toBe('NOT_ACTIVE');
    });

    it('LINEAGE_MISMATCH when target Component has a different Name', async () => {
        seedOverride('OVER-1', { ComponentID: 'COMP-NEW', Status: 'Active' });
        seedComponent('COMP-NEW', { Name: 'FormA', Version: '1.1.0' });
        seedComponent('COMP-OTHER', { Name: 'FormB', Version: '1.0.0' });
        const r = await run(new RevertInteractiveFormAction(), mkParams({
            ActiveOverrideID: 'OVER-1', TargetComponentID: 'COMP-OTHER',
        }));
        expect(r.ResultCode).toBe('LINEAGE_MISMATCH');
    });

    it('re-points the Active override + flips Component statuses', async () => {
        seedOverride('OVER-1', { ComponentID: 'COMP-NEW', Status: 'Active' });
        seedComponent('COMP-NEW', { Name: 'F', Version: '1.1.0', Status: 'Published' });
        seedComponent('COMP-OLD', { Name: 'F', Version: '1.0.0', Status: 'Deprecated' });
        const r = await run(new RevertInteractiveFormAction(), mkParams({
            ActiveOverrideID: 'OVER-1', TargetComponentID: 'COMP-OLD',
        }));
        expect(r.Success).toBe(true);
        // Override now points at the target
        expect(hoisted.overrides.get('OVER-1')!.record.ComponentID).toBe('COMP-OLD');
        // Target Component is now Published, previous now Deprecated
        expect(hoisted.components.get('COMP-OLD')!.record.Status).toBe('Published');
        expect(hoisted.components.get('COMP-NEW')!.record.Status).toBe('Deprecated');
    });

    it('is a no-op when target Component is already the Active component', async () => {
        seedOverride('OVER-1', { ComponentID: 'COMP-CURRENT', Status: 'Active' });
        seedComponent('COMP-CURRENT', { Name: 'F', Version: '1.0.0', Status: 'Published' });
        const r = await run(new RevertInteractiveFormAction(), mkParams({
            ActiveOverrideID: 'OVER-1', TargetComponentID: 'COMP-CURRENT',
        }));
        expect(r.Success).toBe(true);
        expect(r.Message).toMatch(/noop|already/);
    });
});
