import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { UserCache } from '../UserCache.js';

function createFakeUser(id: string, email: string, name: string = 'Test User'): UserInfo {
    return {
        ID: id,
        Email: email,
        Name: name,
        IsActive: true,
        Type: 'User',
        UserRoles: [],
    } as Partial<UserInfo> as UserInfo;
}

describe('UserCache O(1) Email and ID Indices (Wave 4.1b)', () => {
    beforeEach(() => {
        UserCache.Instance.SetUsers([]);
    });

    it('resolves UsersByEmail and UserByEmail case-insensitively with whitespace trimming', () => {
        const u1 = createFakeUser('22222222-2222-2222-2222-222222222222', '  Alice@Example.COM ');
        const u2 = createFakeUser('33333333-3333-3333-3333-333333333333', 'bob@example.com');
        UserCache.Instance.SetUsers([u1, u2]);

        expect(UserCache.Instance.UserByEmail('alice@example.com')).toBe(u1);
        expect(UserCache.Instance.UsersByEmail('  ALICE@example.com  ')).toEqual([u1]);
        expect(UserCache.Instance.UsersByEmail('unknown@example.com')).toEqual([]);
        expect(UserCache.Instance.UsersByEmail('')).toEqual([]);
    });

    it('deterministically sorts duplicate-email users by ID regardless of DB row order', () => {
        const laterId = createFakeUser('ffffffff-0000-0000-0000-000000000002', 'dup@example.com');
        const earlierId = createFakeUser('00000001-0000-0000-0000-000000000001', 'DUP@Example.com');

        // Put laterId first in DB order
        UserCache.Instance.SetUsers([laterId, earlierId]);
        expect(UserCache.Instance.UsersByEmail('dup@example.com')).toEqual([earlierId, laterId]);
        expect(UserCache.Instance.UserByEmail('dup@example.com')).toBe(earlierId);

        // Flip DB order — tie-breaker must stay identical
        UserCache.Instance.SetUsers([earlierId, laterId]);
        expect(UserCache.Instance.UsersByEmail('dup@example.com')).toEqual([earlierId, laterId]);
    });

    it('resolves UserByID with UUID case/brace normalization and tracks BlankEmailUserIDs', () => {
        const u1 = createFakeUser('ABCDEF12-3456-7890-ABCD-EF1234567890', 'valid@example.com');
        const blank = createFakeUser('11111111-1111-1111-1111-111111111111', '   ');
        UserCache.Instance.SetUsers([u1, blank]);

        expect(UserCache.Instance.UserByID('abcdef12-3456-7890-abcd-ef1234567890')).toBe(u1);
        expect(UserCache.Instance.BlankEmailUserIDs).toEqual(['11111111-1111-1111-1111-111111111111']);
    });

    it('invalidates and updates indices on AddOrUpdateUser as well as direct Users.push()', () => {
        const u1 = createFakeUser('10000000-0000-0000-0000-000000000001', 'one@example.com');
        UserCache.Instance.SetUsers([u1]);
        expect(UserCache.Instance.UserByEmail('one@example.com')).toBe(u1);

        // Direct legacy push to Users array must still be detected via length check
        const u2 = createFakeUser('20000000-0000-0000-0000-000000000002', 'two@example.com');
        UserCache.Instance.Users.push(u2);
        expect(UserCache.Instance.UserByEmail('two@example.com')).toBe(u2);

        // In-place update via AddOrUpdateUser
        const u1Updated = createFakeUser('10000000-0000-0000-0000-000000000001', 'one-new@example.com');
        UserCache.Instance.AddOrUpdateUser(u1Updated);
        expect(UserCache.Instance.UserByEmail('one@example.com')).toBeUndefined();
        expect(UserCache.Instance.UserByEmail('one-new@example.com')).toBe(u1Updated);
    });
});
