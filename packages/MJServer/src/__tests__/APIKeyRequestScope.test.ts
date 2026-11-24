/**
 * AssertAPIKeyScopeForRequest is the one scope check GraphQL and REST both run for a request
 * that authenticated with an API key.
 *
 * The case that matters most: the lookups run as the SYSTEM user. A key's own user often cannot
 * read `MJ: API Keys`, and a check that looked the key up as that user answered "API key not
 * found" (403) for a valid key on every REST route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const { mockAuthorize, mockGetSystemUser } = vi.hoisted(() => ({
    mockAuthorize: vi.fn(),
    mockGetSystemUser: vi.fn(),
}));

vi.mock('@memberjunction/api-keys', () => ({
    GetAPIKeyEngine: () => ({ Authorize: mockAuthorize }),
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: mockGetSystemUser } },
}));

vi.mock('type-graphql', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
}));

import { AssertAPIKeyScopeForRequest } from '../auth/APIKeyRequestScope.js';

const SYSTEM_USER = { ID: 'system', Email: 'system@example.com' } as unknown as UserInfo;
const ACTING_CONTEXT = { UserID: 'acting-user' };
/** A user who holds a key but cannot read the API key tables. */
const KEY_USER = { ID: 'restricted', Email: 'reader@example.com', APIKeyActingContext: ACTING_CONTEXT } as unknown as UserInfo;
const REQUEST = { endpoint: '/api/v1/entities/Users', method: 'POST', ipAddress: '127.0.0.1', userAgent: 'vitest' };

/** Answers the `full_access` probe and the specific scope separately. */
function engineAnswers(fullAccess: boolean, specific: { Allowed: boolean; Reason?: string }): void {
    mockAuthorize.mockImplementation(async (_hash: string, _app: string, scope: string) =>
        scope === 'full_access' ? { Allowed: fullAccess } : specific);
}

describe('AssertAPIKeyScopeForRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSystemUser.mockReturnValue(SYSTEM_USER);
    });

    it('does nothing for a session that did not authenticate with an API key', async () => {
        await AssertAPIKeyScopeForRequest(undefined, 'entity:create', 'Users', KEY_USER, REQUEST);

        expect(mockAuthorize).not.toHaveBeenCalled();
    });

    it('looks the key up as the system user, not as the user the key belongs to', async () => {
        engineAnswers(false, { Allowed: true });

        await AssertAPIKeyScopeForRequest('hash-1', 'view:run', 'Users', KEY_USER, REQUEST);

        expect(mockAuthorize).toHaveBeenCalledTimes(2);
        for (const call of mockAuthorize.mock.calls) {
            expect(call[4]).toBe(SYSTEM_USER);
        }
    });

    it('lets a full_access key through without asking for the specific scope, and does not log the probe', async () => {
        engineAnswers(true, { Allowed: false, Reason: 'No matching key scope rules' });

        await AssertAPIKeyScopeForRequest('hash-1', 'entity:delete', 'Users', KEY_USER, REQUEST);

        expect(mockAuthorize).toHaveBeenCalledTimes(1);
        expect(mockAuthorize).toHaveBeenCalledWith('hash-1', 'MJAPI', 'full_access', '*', SYSTEM_USER, REQUEST, { skipLogging: true });
    });

    it('asks for the specific scope on the resource, with the request details and the session acting context', async () => {
        engineAnswers(false, { Allowed: true });

        await AssertAPIKeyScopeForRequest('hash-1', 'entity:update', 'Users', KEY_USER, REQUEST);

        expect(mockAuthorize).toHaveBeenLastCalledWith(
            'hash-1', 'MJAPI', 'entity:update', 'Users', SYSTEM_USER, REQUEST, { actingContext: ACTING_CONTEXT }
        );
    });

    it('refuses a key that lacks the scope, naming the scope, the resource and the reason', async () => {
        engineAnswers(false, { Allowed: false, Reason: 'No matching key scope rules' });

        await expect(AssertAPIKeyScopeForRequest('hash-1', 'entity:create', 'Users', KEY_USER, REQUEST)).rejects.toThrow(
            "Access denied. This API key requires the 'entity:create' scope for resource 'Users' to perform this operation. " +
            "Please update the API key's scopes or use an API key with appropriate permissions. " +
            'Denial reason: No matching key scope rules'
        );
    });

    it('fails rather than checking as someone else when there is no system user', async () => {
        mockGetSystemUser.mockReturnValue(undefined);

        await expect(AssertAPIKeyScopeForRequest('hash-1', 'view:run', 'Users', KEY_USER, REQUEST)).rejects.toThrow('System user not found');
        expect(mockAuthorize).not.toHaveBeenCalled();
    });
});
