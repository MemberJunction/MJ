import { describe, it, expect } from 'vitest';

// Mock dependencies before importing the module under test. Keep the REAL @memberjunction/global
// (so UUIDsEqual behaves correctly) but neutralize the @RegisterClass side effect; stub the base
// classes since we only exercise the pure static rule.
import { vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class MockBaseEntity {},
}));

vi.mock('../generated/entity_subclasses', () => ({
    MJListEntity: class MockListEntity {},
}));

import { MJListEntityExtended } from '../custom/MJListEntityExtended';

// Minimal UserInfo-shaped stub — the rule only reads `.ID` and `.UserRoles[].Role`.
function user(id: string, roleNames: string[]): any {
    return { ID: id, UserRoles: roleNames.map(Role => ({ Role })) };
}

const OWNER = 'AAAAAAAA-1111-2222-3333-444444444444';
const OTHER = 'BBBBBBBB-5555-6666-7777-888888888888';

describe('MJListEntityExtended.UserCanDelete', () => {
    it('lets the List owner (UI role) delete their own list', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, user(OWNER, ['UI']))).toBe(true);
    });

    it('blocks a UI-role user from deleting a list they do not own', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, user(OTHER, ['UI']))).toBe(false);
    });

    it('lets a Developer-role user delete ANY list', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, user(OTHER, ['Developer']))).toBe(true);
    });

    it('lets an Integration-role user delete ANY list', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, user(OTHER, ['Integration']))).toBe(true);
    });

    it('matches roles case-insensitively (and trims)', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, user(OTHER, ['  developer '])) ).toBe(true);
    });

    it('matches ownership case-insensitively (SQL Server vs PostgreSQL UUID casing)', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER.toLowerCase(), user(OWNER.toUpperCase(), ['UI']))).toBe(true);
    });

    it('returns false for a null/undefined user', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, null)).toBe(false);
        expect(MJListEntityExtended.UserCanDelete(OWNER, undefined)).toBe(false);
    });

    it('returns false when a non-owner has no privileged role and no roles at all', () => {
        expect(MJListEntityExtended.UserCanDelete(OWNER, user(OTHER, []))).toBe(false);
    });
});
