/**
 * An A2A task runs as its authenticated caller and no one else: never the first cached user, the
 * system user, or the API key's own user record without its roles.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { ResolveTaskCaller } from '../TaskCaller.js';

const SYSTEM = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'System', IsActive: true, UserRoles: [{ Role: 'Developer' }] } as unknown as UserInfo;
const CALLER_CACHED = { ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'Caller', IsActive: true, UserRoles: [{ Role: 'Intern' }] } as unknown as UserInfo;
/** The caller as the API key resolves it: same ID, no roles loaded. */
const CALLER_FROM_KEY = { ID: 'bbbbbbbb-0000-0000-0000-000000000002', Name: 'Caller' } as unknown as UserInfo;
const STRANGER = { ID: 'CCCCCCCC-0000-0000-0000-000000000003', Name: 'Stranger' } as unknown as UserInfo;
/** A user the cache still holds after they were deactivated. */
const INACTIVE_CACHED = { ID: 'DDDDDDDD-0000-0000-0000-000000000004', Name: 'Former', IsActive: false, UserRoles: [{ Role: 'Developer' }] } as unknown as UserInfo;
const INACTIVE_FROM_KEY = { ID: 'DDDDDDDD-0000-0000-0000-000000000004', Name: 'Former', IsActive: true } as unknown as UserInfo;

const users = [SYSTEM, CALLER_CACHED, INACTIVE_CACHED];

describe('ResolveTaskCaller', () => {
    it('returns the cached copy of the caller, which carries the roles', () => {
        expect(ResolveTaskCaller(CALLER_FROM_KEY, users)).toBe(CALLER_CACHED);
    });

    it('refuses when there is no authenticated caller, rather than running as another user', () => {
        expect(() => ResolveTaskCaller(undefined, users)).toThrow(/No authenticated caller/);
    });

    it('refuses a caller who is not an active cached user, rather than running as another user or without roles', () => {
        expect(() => ResolveTaskCaller(STRANGER, users)).toThrow(/not an active user/);
    });

    it('refuses a caller whose cached record is inactive, whatever the authenticated record says', () => {
        expect(() => ResolveTaskCaller(INACTIVE_FROM_KEY, users)).toThrow(/not an active user/);
    });
});
