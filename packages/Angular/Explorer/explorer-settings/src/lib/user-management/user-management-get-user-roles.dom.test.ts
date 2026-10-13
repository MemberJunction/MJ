/**
 * `getUserRoles` must return exactly the user's assigned roles, in `this.roles` order, matching
 * role IDs case-insensitively.
 *
 * WHY THIS EXISTS. The method is called TWICE per user row from the template (the `@if` and the
 * `@for`), so it re-runs on every change-detection pass. It was written as
 * `roles.filter(role => roleIds.some(id => UUIDsEqual(id, role.ID)))` — a nested scan whose inner
 * `UUIDsEqual` allocates two lowercased strings on every MISS (its `===` fast path only fires on an
 * exact hit), making the per-row cost roles x userRoles string allocations per frame. Rewriting it
 * over a normalized `Set` turns that into roles + userRoles, but only if the observable contract is
 * unchanged — and nothing covered it. These tests pin that contract:
 *
 *   - which roles come back (assigned only),
 *   - the ORDER they come back in (driven by `this.roles`, NOT by assignment order),
 *   - case-insensitive ID matching (SQL Server returns upper-case UUIDs, PostgreSQL lower-case —
 *     see guides/UUID_COMPARISON_GUIDE.md), and
 *   - the empty cases.
 *
 * The component is exercised through its prototype rather than TestBed, following the in-file
 * convention of `user-management-toggle-status.dom.test.ts`: the behaviour under test is one
 * method's own logic over two plain fields, and an Angular harness would add setup without adding
 * coverage.
 */
import { describe, it, expect } from 'vitest';
import { UserManagementComponent } from './user-management.component';

interface RolesHost {
    getUserRoles(userId: string): Array<{ ID: string; Name: string }>;
}

/** Minimal MJRoleEntity stand-in: `getUserRoles` touches only `ID` (and we read `Name` to assert). */
function makeComponent(roles: Array<{ ID: string; Name: string }>, userRoleMap: Map<string, string[]>): RolesHost {
    const c = Object.create(UserManagementComponent.prototype) as RolesHost & Record<string, unknown>;
    c['roles'] = roles;
    c['userRoleMap'] = userRoleMap;
    return c;
}

const ADMIN = '11111111-1111-1111-1111-111111111111';
const DEVELOPER = '22222222-2222-2222-2222-222222222222';
const VIEWER = '33333333-3333-3333-3333-333333333333';

const ALL_ROLES = [
    { ID: ADMIN, Name: 'Admin' },
    { ID: DEVELOPER, Name: 'Developer' },
    { ID: VIEWER, Name: 'Viewer' },
];

describe('UserManagementComponent.getUserRoles', () => {
    it('returns ONLY the roles assigned to that user', () => {
        const c = makeComponent(ALL_ROLES, new Map([['u1', [DEVELOPER]]]));
        expect(c.getUserRoles('u1').map(r => r.Name)).toEqual(['Developer']);
    });

    it('orders the result by `this.roles`, NOT by assignment order', () => {
        // Assigned viewer-then-admin; rendered admin-then-viewer, because the roster drives order.
        const c = makeComponent(ALL_ROLES, new Map([['u1', [VIEWER, ADMIN]]]));
        expect(c.getUserRoles('u1').map(r => r.Name)).toEqual(['Admin', 'Viewer']);
    });

    it('matches IDs case-insensitively (SQL Server upper vs PostgreSQL lower)', () => {
        const c = makeComponent(ALL_ROLES, new Map([['u1', [ADMIN.toUpperCase(), VIEWER.toUpperCase()]]]));
        expect(c.getUserRoles('u1').map(r => r.Name)).toEqual(['Admin', 'Viewer']);
    });

    it('tolerates surrounding whitespace on either side of the comparison', () => {
        const c = makeComponent([{ ID: `  ${ADMIN}  `, Name: 'Admin' }], new Map([['u1', [ADMIN]]]));
        expect(c.getUserRoles('u1').map(r => r.Name)).toEqual(['Admin']);
    });

    it('returns an empty array for a user with no entry in the map', () => {
        const c = makeComponent(ALL_ROLES, new Map());
        expect(c.getUserRoles('nobody')).toEqual([]);
    });

    it('returns an empty array for a user whose role list is empty', () => {
        const c = makeComponent(ALL_ROLES, new Map([['u1', []]]));
        expect(c.getUserRoles('u1')).toEqual([]);
    });

    it('ignores an assigned role ID that is not in the loaded roster', () => {
        const c = makeComponent(ALL_ROLES, new Map([['u1', ['44444444-4444-4444-4444-444444444444', ADMIN]]]));
        expect(c.getUserRoles('u1').map(r => r.Name)).toEqual(['Admin']);
    });
});
