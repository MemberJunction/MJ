import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for `EntityFormOverrideService.activateVersion` and
 * `revertToComponent`. These are the cockpit-internal Version-rail
 * mutations — they mirror the server-side Activate / Revert actions but
 * run client-side for snappier UX. The contract must match the action's
 * behaviour exactly: Component statuses flip together with Override
 * statuses; nothing else moves.
 */

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        overrides: new Map<string, { record: Record<string, unknown>; saveOutcome: boolean }>(),
        components: new Map<string, { record: Record<string, unknown>; saveOutcome: boolean }>(),
        runViewResults: [] as Array<Array<Record<string, unknown>>>,
    },
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        MJEntityFormOverrideEntity: actual.MJEntityFormOverrideEntity ?? class {},
        MJComponentEntity: actual.MJComponentEntity ?? class {},
    };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');

    function makeMockEntity(entityName: string) {
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
            async Save(): Promise<boolean> { return state.saveOutcome; },
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
        EntityByName() { return { ID: 'ENT-1' }; }
        async GetEntityObject<T>(name: string): Promise<T> { return makeMockEntity(name) as unknown as T; }
    }
    return {
        ...actual,
        Metadata: { Provider: new HoistedProvider() },
        RunView: class {
            static FromMetadataProvider() {
                return new (class {
                    async RunView() {
                        const next = hoisted.runViewResults.shift() ?? [];
                        return { Success: true, Results: next };
                    }
                })();
            }
        },
        LogError: vi.fn(),
    };
});

// Stub Angular's Injectable decorator so the @Injectable class loads cleanly
vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
}));

import { EntityFormOverrideService } from '../ComponentStudio/services/entity-form-override.service';

const fakeUser = { ID: 'U1', Name: 'Test' } as unknown as import('@memberjunction/core').UserInfo;

function seedOverride(id: string, attrs: Record<string, unknown>): void {
    hoisted.overrides.set(id, {
        record: { ID: id, EntityID: 'ENT-1', UserID: 'U1', RoleID: null, Priority: 0, ...attrs },
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
});

describe('EntityFormOverrideService.activateVersion', () => {

    it('returns Error when the override ID is unknown', async () => {
        const svc = new EntityFormOverrideService();
        const r = await svc.activateVersion('nope', fakeUser);
        expect(r.Success).toBe(false);
        expect(r.Error).toMatch(/not found/);
    });

    it('promotes Pending → Active + Draft → Published; demotes prior Active', async () => {
        seedOverride('OVER-PEN', { ComponentID: 'COMP-NEW', Scope: 'User', Status: 'Pending' });
        seedComponent('COMP-NEW', { Status: 'Draft' });
        seedOverride('OVER-OLD', { ComponentID: 'COMP-OLD', Scope: 'User', Status: 'Active' });
        seedComponent('COMP-OLD', { Status: 'Published' });
        // Sibling lookup returns the prior Active.
        hoisted.runViewResults.push([{ ID: 'OVER-OLD', ComponentID: 'COMP-OLD' }]);

        const svc = new EntityFormOverrideService();
        const r = await svc.activateVersion('OVER-PEN', fakeUser);

        expect(r.Success).toBe(true);
        // Target promoted
        expect(hoisted.overrides.get('OVER-PEN')!.record.Status).toBe('Active');
        expect(hoisted.components.get('COMP-NEW')!.record.Status).toBe('Published');
        // Prior demoted in lock-step
        expect(hoisted.overrides.get('OVER-OLD')!.record.Status).toBe('Inactive');
        expect(hoisted.components.get('COMP-OLD')!.record.Status).toBe('Deprecated');
    });

    it('handles "no prior Active" cleanly (e.g. first-ever activation)', async () => {
        seedOverride('OVER-PEN', { ComponentID: 'COMP-NEW', Scope: 'User', Status: 'Pending' });
        seedComponent('COMP-NEW', { Status: 'Draft' });
        // No prior Active to demote — RunView returns empty.
        hoisted.runViewResults.push([]);

        const svc = new EntityFormOverrideService();
        const r = await svc.activateVersion('OVER-PEN', fakeUser);
        expect(r.Success).toBe(true);
        expect(hoisted.overrides.get('OVER-PEN')!.record.Status).toBe('Active');
        expect(hoisted.components.get('COMP-NEW')!.record.Status).toBe('Published');
    });
});

describe('EntityFormOverrideService.revertToComponent', () => {

    it('returns Error when the active override is unknown', async () => {
        const svc = new EntityFormOverrideService();
        const r = await svc.revertToComponent('nope', 'COMP-OLD', fakeUser);
        expect(r.Success).toBe(false);
    });

    it('re-points the override + flips Component statuses', async () => {
        seedOverride('OVER-ACT', { ComponentID: 'COMP-CURRENT', Scope: 'User', Status: 'Active' });
        seedComponent('COMP-CURRENT', { Status: 'Published' });
        seedComponent('COMP-OLD', { Status: 'Deprecated' });

        const svc = new EntityFormOverrideService();
        const r = await svc.revertToComponent('OVER-ACT', 'COMP-OLD', fakeUser);

        expect(r.Success).toBe(true);
        expect(hoisted.overrides.get('OVER-ACT')!.record.ComponentID).toBe('COMP-OLD');
        expect(hoisted.components.get('COMP-OLD')!.record.Status).toBe('Published');
        expect(hoisted.components.get('COMP-CURRENT')!.record.Status).toBe('Deprecated');
    });
});
