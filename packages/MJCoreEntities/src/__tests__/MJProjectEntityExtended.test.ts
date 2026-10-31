import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    superNewRecord: vi.fn().mockReturnValue(true),
    resetNeverSetFlag: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {},
}));

vi.mock('../generated/entity_subclasses', () => ({
    MJProjectEntity: class {
        constructor(_entityName?: string, _contextUser?: unknown) {
            /* shape-only mock */
        }
        public OwnerUserID: string | null = null;
        public ContextCurrentUser: { ID: string } | null = null;
        public ProviderToUse: unknown = { CurrentUser: null };

        public NewRecord(): boolean {
            this.OwnerUserID = null;
            return mocks.superNewRecord();
        }

        public GetFieldByName(name: string) {
            if (name === 'OwnerUserID') {
                return { ResetNeverSetFlag: mocks.resetNeverSetFlag };
            }
            return null;
        }
    },
}));

import { MJProjectEntityExtended } from '../custom/MJProjectEntityExtended';

interface ProjectHarness {
    OwnerUserID: string | null;
    ContextCurrentUser: { ID: string } | null;
    ProviderToUse: unknown;
    NewRecord: () => boolean;
}

function makeProject(): ProjectHarness {
    const Ctor = MJProjectEntityExtended as unknown as new () => ProjectHarness;
    return new Ctor();
}

describe('MJProjectEntityExtended — private folder by default on NewRecord()', () => {
    beforeEach(() => {
        mocks.superNewRecord.mockReturnValue(true);
        mocks.resetNeverSetFlag.mockClear();
    });

    it('defaults OwnerUserID to ContextCurrentUser.ID when NewRecord() succeeds', () => {
        const project = makeProject();
        project.ContextCurrentUser = { ID: 'user-ctx-1' };

        const ok = project.NewRecord();

        expect(ok).toBe(true);
        expect(project.OwnerUserID).toBe('user-ctx-1');
        expect(mocks.resetNeverSetFlag).toHaveBeenCalledTimes(1);
    });

    it('falls back to ProviderToUse.CurrentUser.ID when ContextCurrentUser is absent', () => {
        const project = makeProject();
        project.ContextCurrentUser = null;
        project.ProviderToUse = { CurrentUser: { ID: 'user-provider-2' } };

        const ok = project.NewRecord();

        expect(ok).toBe(true);
        expect(project.OwnerUserID).toBe('user-provider-2');
        expect(mocks.resetNeverSetFlag).toHaveBeenCalledTimes(1);
    });

    it('allows callers to explicitly clear OwnerUserID = null after NewRecord() to create a shared folder', () => {
        const project = makeProject();
        project.ContextCurrentUser = { ID: 'user-ctx-1' };

        project.NewRecord();
        expect(project.OwnerUserID).toBe('user-ctx-1');

        project.OwnerUserID = null;
        expect(project.OwnerUserID).toBeNull();
    });
});
