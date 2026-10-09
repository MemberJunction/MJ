/**
 * The policy that decides who may run an action through a public entry point. It reads the
 * `MJ: Action Authorizations` rows for the action and the caller's roles, and fails closed: an
 * action no authorization grants runs for Owners only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, Metadata, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { EvaluateActionRunAuthorization } from '../auth/actionAuthorization.js';

const ANALYST_ROLE = 'A11C0000-0000-4000-8000-0000000000F1';
const AUDITOR_ROLE = 'A11C0000-0000-4000-8000-0000000000F2';
const BLOCKED_ROLE = 'A11C0000-0000-4000-8000-0000000000F3';

const DATA_TOOLS = new AuthorizationInfo({ ID: 'auth-data-tools', Name: 'Data Tools', IsActive: true });
const RUN_QUERIES = new AuthorizationInfo({ ID: 'auth-run-queries', Name: 'Run Queries', IsActive: true, ParentID: DATA_TOOLS.ID });
const SWITCHED_OFF = new AuthorizationInfo({ ID: 'auth-switched-off', Name: 'Switched Off', IsActive: false });
const AUTHORIZATIONS = [DATA_TOOLS, RUN_QUERIES, SWITCHED_OFF];

const user = (type: string, roleIDs: string[]): UserInfo =>
    new UserInfo(null, { ID: `user-${type}-${roleIDs.join('-')}`, Type: type, UserRoles: roleIDs.map((RoleID) => new UserRoleInfo({ RoleID })) });

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        AuthorizationRoles: [
            new AuthorizationRoleInfo({ ID: 'ar-1', AuthorizationID: RUN_QUERIES.ID, RoleID: ANALYST_ROLE, Type: 'Allow' }),
            new AuthorizationRoleInfo({ ID: 'ar-2', AuthorizationID: DATA_TOOLS.ID, RoleID: AUDITOR_ROLE, Type: 'Allow' }),
            new AuthorizationRoleInfo({ ID: 'ar-3', AuthorizationID: RUN_QUERIES.ID, RoleID: BLOCKED_ROLE, Type: 'Deny' }),
            new AuthorizationRoleInfo({ ID: 'ar-4', AuthorizationID: SWITCHED_OFF.ID, RoleID: ANALYST_ROLE, Type: 'Allow' }),
        ],
    } as unknown as ReturnType<typeof Metadata.Provider>);
});

describe('EvaluateActionRunAuthorization', () => {
    it('lets an Owner run an action no authorization grants', () => {
        expect(EvaluateActionRunAuthorization(user('Owner     ', []), [], AUTHORIZATIONS).Allowed).toBe(true);
    });

    it('refuses any other user an action no authorization grants', () => {
        const decision = EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE]), [], AUTHORIZATIONS);

        expect(decision.Allowed).toBe(false);
        expect(decision.Reason).toMatch(/no action authorization/i);
    });

    it('allows a user whose role holds a linked authorization', () => {
        expect(EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE]), [RUN_QUERIES.ID], AUTHORIZATIONS).Allowed).toBe(true);
    });

    it('allows a user whose role holds an ancestor of a linked authorization', () => {
        expect(EvaluateActionRunAuthorization(user('User', [AUDITOR_ROLE]), [RUN_QUERIES.ID], AUTHORIZATIONS).Allowed).toBe(true);
    });

    it('refuses a user one of whose roles is denied the linked authorization', () => {
        expect(EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE, BLOCKED_ROLE]), [RUN_QUERIES.ID], AUTHORIZATIONS).Allowed).toBe(false);
    });

    it('refuses a user whose roles hold none of the linked authorizations', () => {
        const decision = EvaluateActionRunAuthorization(user('User', ['some-other-role']), [RUN_QUERIES.ID], AUTHORIZATIONS);

        expect(decision.Allowed).toBe(false);
    });

    it('treats an inactive authorization as granting nothing', () => {
        expect(EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE]), [SWITCHED_OFF.ID], AUTHORIZATIONS).Allowed).toBe(false);
    });

    it('ignores a linked authorization that no longer exists in metadata', () => {
        expect(EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE]), ['auth-deleted'], AUTHORIZATIONS).Allowed).toBe(false);
    });

    it('matches authorization IDs regardless of case', () => {
        expect(EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE]), [RUN_QUERIES.ID.toUpperCase()], AUTHORIZATIONS).Allowed).toBe(true);
    });
});
