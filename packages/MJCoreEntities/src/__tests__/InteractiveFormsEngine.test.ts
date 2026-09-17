import { describe, it, expect, vi, beforeEach } from 'vitest';

let backing: Record<string, unknown[]> = {};

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) ctor._testInstance = new ctor();
            return ctor._testInstance;
        }
        async Load(): Promise<void> { /* no-op */ }
        GetConfigData<T>(prop: string): T[] { return (backing[prop] ?? []) as T[]; }
        ObserveProperty<T>(prop: string) { return { prop }; }
    },
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    UserInfo: class {},
}));

import { InteractiveFormsEngine } from '../engines/interactive-forms';

const USER = '11111111-1111-1111-1111-111111111111';
const ROLE = '22222222-2222-2222-2222-222222222222';
const ENTITY = '33333333-3333-3333-3333-333333333333';

function row(over: Record<string, unknown>) {
    return {
        ID: 'r', EntityID: ENTITY, Scope: 'Global', UserID: null, RoleID: null,
        Status: 'Active', Precedence: 0, SortKey: 0, ...over,
    };
}

describe('InteractiveFormsEngine.GetApplicableContributions', () => {
    beforeEach(() => { backing = {}; });

    it('returns Active rows whose scope matches, highest Precedence then SortKey first', () => {
        backing._contributions = [
            row({ ID: 'global', Precedence: 0, SortKey: 10 }),
            row({ ID: 'mine', Scope: 'User', UserID: USER, Precedence: 5 }),
            row({ ID: 'other-user', Scope: 'User', UserID: 'someone-else' }),
            row({ ID: 'role', Scope: 'Role', RoleID: ROLE, Precedence: 1 }),
            row({ ID: 'pending', Status: 'Pending', Precedence: 99 }),
            row({ ID: 'other-entity', EntityID: 'zzz', Precedence: 99 }),
        ];
        const ids = InteractiveFormsEngine.Instance
            .GetApplicableContributions(ENTITY, USER, [ROLE]).map(r => r.ID);
        expect(ids).toEqual(['mine', 'role', 'global']);
    });

    it('returns an empty array for a blank entity id', () => {
        backing._contributions = [row({ ID: 'global' })];
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions('', USER, [])).toEqual([]);
    });

    it('compares ids case-insensitively', () => {
        backing._contributions = [row({ ID: 'g', EntityID: ENTITY.toUpperCase() })];
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions(ENTITY.toLowerCase(), USER, [])).toHaveLength(1);
    });
});
