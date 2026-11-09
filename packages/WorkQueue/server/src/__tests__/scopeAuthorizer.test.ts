import { describe, it, expect, vi, beforeEach } from 'vitest';

const authorize = vi.fn();
vi.mock('@memberjunction/api-keys', () => ({ GetAPIKeyEngine: () => ({ Authorize: authorize }) }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => null } } }));

import type { APIKeyActingContext, UserInfo } from '@memberjunction/core';
import { APIKeyScopeAuthorizer } from '../scopeAuthorizer';

const SYSTEM_USER = { ID: 'AAAAAAAA-1111-4111-8111-0000000000ff', Email: 'system@example.org' } as UserInfo;
const ACTING = { ActingUserID: 'AAAAAAAA-1111-4111-8111-000000000009' } as unknown as APIKeyActingContext;
const SESSION_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', APIKeyActingContext: ACTING } as unknown as UserInfo;
const REQUEST = { Endpoint: '/work-queue/topics/email.events/messages', Method: 'POST' };
const HTTP = { endpoint: REQUEST.Endpoint, method: 'POST' };

beforeEach(() => {
    authorize.mockReset();
});

describe('APIKeyScopeAuthorizer', () => {
    it('takes the full_access fast path without logging and skips the specific check', async () => {
        authorize.mockResolvedValueOnce({ Allowed: true, Reason: 'full access' });
        const decision = await new APIKeyScopeAuthorizer(() => SYSTEM_USER).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST);
        expect(decision).toEqual({ Allowed: true, Reason: 'full_access' });
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(authorize).toHaveBeenCalledWith('hash-1', 'MJAPI', 'full_access', '*', SYSTEM_USER, HTTP, { skipLogging: true });
    });

    it('checks the specific scope as the system user, with the session acting context', async () => {
        authorize
            .mockResolvedValueOnce({ Allowed: false, Reason: 'no full access' })
            .mockResolvedValueOnce({ Allowed: false, Reason: 'no matching rule' });
        const decision = await new APIKeyScopeAuthorizer(() => SYSTEM_USER).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST);
        expect(decision).toEqual({ Allowed: false, Reason: 'no matching rule' });
        expect(authorize).toHaveBeenLastCalledWith('hash-1', 'MJAPI', 'workqueue:publish', 'email.events', SYSTEM_USER, HTTP, { actingContext: ACTING });
    });

    it('allows when the specific scope is granted', async () => {
        authorize
            .mockResolvedValueOnce({ Allowed: false, Reason: 'no full access' })
            .mockResolvedValueOnce({ Allowed: true, Reason: 'rule 7' });
        expect(await new APIKeyScopeAuthorizer(() => SYSTEM_USER).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST))
            .toEqual({ Allowed: true, Reason: 'rule 7' });
    });

    it('throws when there is no system user to evaluate as', async () => {
        await expect(new APIKeyScopeAuthorizer(() => null).Authorize('hash-1', 'workqueue:publish', 'email.events', SESSION_USER, REQUEST))
            .rejects.toThrow('System user not found');
        expect(authorize).not.toHaveBeenCalled();
    });
});
