/**
 * The policy that decides who may run an action through a public entry point. It reads the
 * `MJ: Action Authorizations` rows for the action, the caller's roles, and whether the action's
 * class authorizes its caller itself. It fails closed: an action that no authorization grants, and
 * whose class does not authorize its caller, runs for Owners only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, Metadata, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { EvaluateActionRunAuthorization, IsOwner } from '../auth/actionAuthorization.js';

const ANALYST_ROLE = 'A11C0000-0000-4000-8000-0000000000F1';
const AUDITOR_ROLE = 'A11C0000-0000-4000-8000-0000000000F2';
const BLOCKED_ROLE = 'A11C0000-0000-4000-8000-0000000000F3';

const DATA_TOOLS = new AuthorizationInfo({ ID: 'auth-data-tools', Name: 'Data Tools', IsActive: true });
const RUN_QUERIES = new AuthorizationInfo({ ID: 'auth-run-queries', Name: 'Run Queries', IsActive: true, ParentID: DATA_TOOLS.ID });
const RETIRED_TOOL = new AuthorizationInfo({ ID: 'auth-retired-tool', Name: 'Retired Tool', IsActive: false, ParentID: DATA_TOOLS.ID });
const SWITCHED_OFF = new AuthorizationInfo({ ID: 'auth-switched-off', Name: 'Switched Off', IsActive: false });
const AUTHORIZATIONS = [DATA_TOOLS, RUN_QUERIES, RETIRED_TOOL, SWITCHED_OFF];

const user = (type: string, roleIDs: string[]): UserInfo =>
    new UserInfo(null, { ID: `user-${type}-${roleIDs.join('-')}`, Type: type, UserRoles: roleIDs.map((RoleID) => new UserRoleInfo({ RoleID })) });

/** Decides for an action whose class does not authorize its caller. */
const decide = (caller: UserInfo, linkedAuthorizationIDs: string[]) =>
    EvaluateActionRunAuthorization(caller, linkedAuthorizationIDs, AUTHORIZATIONS, false);

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

describe('IsOwner', () => {
    it('recognises the Owner type, padded as the nchar column stores it', () => {
        expect(IsOwner(user('Owner     ', []))).toBe(true);
        expect(IsOwner(user('User', [ANALYST_ROLE]))).toBe(false);
    });
});

describe('EvaluateActionRunAuthorization', () => {
    describe('Owners', () => {
        it('lets an Owner run any action, linked or not', () => {
            expect(decide(user('Owner     ', []), []).Allowed).toBe(true);
            expect(decide(user('Owner     ', []), [RUN_QUERIES.ID]).Allowed).toBe(true);
        });
    });

    describe('an action with no Action Authorization rows', () => {
        it('is refused to any other user when its class does not authorize its caller', () => {
            const decision = decide(user('User', [ANALYST_ROLE]), []);

            expect(decision.Allowed).toBe(false);
            expect(decision.Reason).toMatch(/no action authorization/i);
        });

        it('runs for any user when its class authorizes its caller, so the action\'s own check decides', () => {
            expect(EvaluateActionRunAuthorization(user('User', [ANALYST_ROLE]), [], AUTHORIZATIONS, true).Allowed).toBe(true);
        });
    });

    describe('an action with Action Authorization rows', () => {
        it('is decided by its links, even when its class authorizes its caller', () => {
            expect(EvaluateActionRunAuthorization(user('User', ['some-other-role']), [RUN_QUERIES.ID], AUTHORIZATIONS, true).Allowed).toBe(false);
        });

        it('runs for a user whose role holds a linked authorization', () => {
            expect(decide(user('User', [ANALYST_ROLE]), [RUN_QUERIES.ID]).Allowed).toBe(true);
        });

        it('runs for a user whose role holds an ancestor of a linked authorization', () => {
            expect(decide(user('User', [AUDITOR_ROLE]), [RUN_QUERIES.ID]).Allowed).toBe(true);
        });

        it('is refused to a user whose roles hold none of the linked authorizations', () => {
            expect(decide(user('User', ['some-other-role']), [RUN_QUERIES.ID]).Allowed).toBe(false);
        });

        it('is refused when the linked authorization is inactive', () => {
            expect(decide(user('User', [ANALYST_ROLE]), [SWITCHED_OFF.ID]).Allowed).toBe(false);
        });

        it('is refused when the linked authorization is inactive, even to a holder of its parent', () => {
            expect(decide(user('User', [AUDITOR_ROLE]), [RETIRED_TOOL.ID]).Allowed).toBe(false);
        });

        it('is refused when one of the user\'s roles is denied the linked authorization', () => {
            expect(decide(user('User', [ANALYST_ROLE, BLOCKED_ROLE]), [RUN_QUERIES.ID]).Allowed).toBe(false);
        });

        it('is refused when a role is denied the linked authorization, even if another role holds its parent', () => {
            expect(decide(user('User', [AUDITOR_ROLE, BLOCKED_ROLE]), [RUN_QUERIES.ID]).Allowed).toBe(false);
        });

        it('ignores a linked authorization that no longer exists in metadata', () => {
            expect(decide(user('User', [ANALYST_ROLE]), ['auth-deleted']).Allowed).toBe(false);
        });

        it('matches authorization IDs regardless of case', () => {
            expect(decide(user('User', [ANALYST_ROLE]), [RUN_QUERIES.ID.toUpperCase()]).Allowed).toBe(true);
        });
    });
});
