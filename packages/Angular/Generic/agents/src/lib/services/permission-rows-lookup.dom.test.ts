/**
 * Pins the grantee-name lookup in both permission services' row building. It used to scan the user
 * (or role) list once per permission; it now indexes users and roles once per build.
 */
import { describe, it, expect } from 'vitest';
import { AgentPermissionsService } from './agent-permissions.service';
import { SkillPermissionsService } from './skill-permissions.service';

const U1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const R1 = 'bbbbbbbb-0000-0000-0000-000000000002';
type RowBuilder = { buildRows(): Array<{ GrantedToName: string; GrantType: string }> };

function rows<T extends object>(proto: T) {
    const s = Object.create(proto) as RowBuilder & Record<string, unknown>;
    s['users'] = [{ ID: U1, Name: 'Ada' }];
    s['roles'] = [{ ID: R1, Name: 'Reviewers' }];
    s['permissions'] = [
        { ID: 'p1', UserID: U1.toUpperCase(), RoleID: null },
        { ID: 'p2', UserID: null, RoleID: R1.toUpperCase() },
        { ID: 'p3', UserID: 'missing-user', RoleID: null },
        { ID: 'p4', UserID: null, RoleID: 'missing-role' },
    ];
    return s.buildRows().map(r => [r.GrantType, r.GrantedToName]);
}

const expected = [['user', 'Ada'], ['role', 'Reviewers'], ['user', 'Unknown User'], ['role', 'Unknown Role']];

describe('permission row grantee names', () => {
    it('AgentPermissionsService resolves users and roles case-insensitively, with fallbacks', () => {
        expect(rows(AgentPermissionsService.prototype)).toEqual(expected);
    });
    it('SkillPermissionsService resolves users and roles case-insensitively, with fallbacks', () => {
        expect(rows(SkillPermissionsService.prototype)).toEqual(expected);
    });
});
