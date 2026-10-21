import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class {},
    RegisterForStartup: () => (target: unknown) => target,
    UserInfo: class {},
}));
vi.mock('../generated/entity_subclasses', () => ({}));

import type { UserInfo } from '@memberjunction/core';
import type { MJResourcePermissionEntity } from '../generated/entity_subclasses';
import { ResourcePermissionEngine } from '../custom/ResourcePermissions/ResourcePermissionEngine';

const USER = 'aaaaaaaa-0000-0000-0000-000000000001';
const ROLE = 'bbbbbbbb-0000-0000-0000-000000000002';
const TYPE = 'cccccccc-0000-0000-0000-000000000003';
const OTHER_TYPE = 'dddddddd-0000-0000-0000-000000000004';
const R1 = 'eeeeeeee-0000-0000-0000-000000000005';
const R2 = 'ffffffff-0000-0000-0000-000000000006';

type Row = Pick<MJResourcePermissionEntity, 'ID' | 'Type' | 'UserID' | 'RoleID' | 'ResourceTypeID' | 'ResourceRecordID' | 'PermissionLevel' | 'Status'>;

function row(ID: string, fields: Partial<Row>): Row {
    return { ID, Type: 'User', UserID: USER, RoleID: null, ResourceTypeID: TYPE, ResourceRecordID: R1, PermissionLevel: 'View', Status: 'Approved', ...fields };
}

function engineWith(rows: Row[]): ResourcePermissionEngine {
    const engine = Object.create(ResourcePermissionEngine.prototype) as ResourcePermissionEngine;
    Object.defineProperty(engine, 'Permissions', { get: () => rows as unknown as MJResourcePermissionEntity[] });
    return engine;
}

const user = { ID: USER, UserRoles: [{ RoleID: ROLE }] } as unknown as UserInfo;
const ids = (perms: MJResourcePermissionEntity[]) => perms.map(p => p.ID);

describe('ResourcePermissionEngine.GetUserAvailableResources', () => {
    it('keeps one permission per resource, the highest level, matching IDs in any case', () => {
        const engine = engineWith([
            row('view-r1', { PermissionLevel: 'View' }),
            row('edit-r2', { ResourceRecordID: R2, PermissionLevel: 'Edit' }),
            row('role-edit-r1', { Type: 'Role', UserID: null, RoleID: ROLE.toUpperCase(), ResourceRecordID: R1.toUpperCase(), ResourceTypeID: TYPE.toUpperCase(), PermissionLevel: 'Edit' }),
            row('view-r2', { ResourceRecordID: R2.toUpperCase(), PermissionLevel: 'View' }),
        ]);

        // The Edit for R1 replaces its View and moves to the end; the View for R2 loses to its Edit.
        expect(ids(engine.GetUserAvailableResources(user))).toEqual(['edit-r2', 'role-edit-r1']);
    });

    it('lets Owner replace Edit, and keeps the first of two equal levels', () => {
        const engine = engineWith([
            row('edit', { PermissionLevel: 'Edit' }),
            row('owner', { PermissionLevel: 'Owner' }),
            row('owner-2', { PermissionLevel: 'Owner' }),
        ]);

        expect(ids(engine.GetUserAvailableResources(user))).toEqual(['owner']);
    });

    it('drops unapproved permissions, other users, and other resource types when one is given', () => {
        const engine = engineWith([
            row('requested', { Status: 'Requested', PermissionLevel: 'Owner' }),
            row('other-user', { UserID: 'abababab-0000-0000-0000-000000000009', ResourceRecordID: R2 }),
            row('other-type', { ResourceTypeID: OTHER_TYPE }),
            row('kept', { PermissionLevel: 'View' }),
        ]);

        expect(ids(engine.GetUserAvailableResources(user, TYPE.toUpperCase()))).toEqual(['kept']);
        expect(ids(engine.GetUserAvailableResources(user))).toEqual(['other-type', 'kept']);
    });
});
