/**
 * `MJQueryEntityExtended.NewRecord`: a new query defaults its owner to the current user, so a
 * client can read the owner before the save. (The server sets the owner on every create anyway.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    superNewRecord: vi.fn().mockReturnValue(true),
    resetNeverSetFlag: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJQueryEntity: class MockQueryEntity {
        public OwnerUserID: string | null = null;
        /** What the real base's `ActiveUser` resolves to: the context user, else the provider's. */
        public CurrentUserForTest: { ID: string } | null = null;
        protected get ActiveUser(): { ID: string } | null {
            return this.CurrentUserForTest;
        }
        /** The extended class declares its child collections at construction; none is used here. */
        protected DeclareRelatedRecords(): { Items: never[] } {
            return { Items: [] };
        }
        public NewRecord(): boolean {
            this.OwnerUserID = null;
            return mocks.superNewRecord();
        }
        public GetFieldByName(name: string) {
            return name === 'OwnerUserID' ? { ResetNeverSetFlag: mocks.resetNeverSetFlag } : null;
        }
    },
}));

import { MJQueryEntityExtended } from '../custom/MJQueryEntityExtended';

interface QueryHarness {
    OwnerUserID: string | null;
    CurrentUserForTest: { ID: string } | null;
    NewRecord: () => boolean;
}

function makeQuery(): QueryHarness {
    const Ctor = MJQueryEntityExtended as unknown as new () => QueryHarness;
    return new Ctor();
}

describe('MJQueryEntityExtended.NewRecord', () => {
    beforeEach(() => {
        mocks.superNewRecord.mockReturnValue(true);
        mocks.resetNeverSetFlag.mockClear();
    });

    it('defaults the owner to the current user', () => {
        const query = makeQuery();
        query.CurrentUserForTest = { ID: 'user-1' };

        expect(query.NewRecord()).toBe(true);
        expect(query.OwnerUserID).toBe('user-1');
        expect(mocks.resetNeverSetFlag).toHaveBeenCalledTimes(1);
    });

    it('leaves the owner unset when there is no current user', () => {
        const query = makeQuery();

        expect(query.NewRecord()).toBe(true);
        expect(query.OwnerUserID).toBeNull();
        expect(mocks.resetNeverSetFlag).not.toHaveBeenCalled();
    });

    it('sets nothing when the base NewRecord fails', () => {
        mocks.superNewRecord.mockReturnValue(false);
        const query = makeQuery();
        query.CurrentUserForTest = { ID: 'user-1' };

        expect(query.NewRecord()).toBe(false);
        expect(query.OwnerUserID).toBeNull();
    });
});
