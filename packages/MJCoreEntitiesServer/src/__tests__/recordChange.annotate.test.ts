import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityPermissionType } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

let mockAuthorizations: Array<{ Name: string; UserCanExecute: (u: unknown) => boolean }> = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public get Authorizations() {
            return mockAuthorizations;
        }
    }
    class MockAuthorizationEvaluator {
        public UserCanExecuteWithAncestors(auth: { UserCanExecute: (u: unknown) => boolean }, user: unknown) {
            return auth.UserCanExecute(user);
        }
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        AuthorizationEvaluator: MockAuthorizationEvaluator,
    };
});

vi.mock('@memberjunction/core-entities', () => {
    class StubRecordChangeEntity {
        public ContextCurrentUser: unknown = null;
        public Fields: Array<{ Name: string; Dirty: boolean }> = [];
        public EntityInfo = {
            Name: 'Record Changes',
            AllowUpdateAPI: true,
        };

        protected get ActiveUser(): unknown {
            return this.ContextCurrentUser;
        }

        public ThrowPermissionError(user: unknown, type: unknown, reason: unknown): void {
            throw new Error(`Permission denied for ${type}`);
        }

        /** The role-based Update check the subclass must still pass. */
        public static RoleAllowsUpdate = true;
        public CheckPermissions(type: unknown, throwError: boolean): boolean {
            if (!StubRecordChangeEntity.RoleAllowsUpdate && throwError) throw new Error('Role may not update');
            return StubRecordChangeEntity.RoleAllowsUpdate;
        }
    }

    return {
        MJRecordChangeEntity: StubRecordChangeEntity,
    };
});

import { MJRecordChangeEntityServer } from '../custom/MJRecordChangeEntityServer.server';

describe('MJRecordChangeEntityServer.CheckPermissions', () => {
    let entity: MJRecordChangeEntityServer;
    let mockUser: { ID: string; Name: string };
    let annotateAuthAllowed: boolean;

    beforeEach(() => {
        mockUser = { ID: 'u-1', Name: 'Annotator' };
        annotateAuthAllowed = true;

        mockAuthorizations = [
            {
                Name: 'Record Changes: Annotate',
                UserCanExecute: () => annotateAuthAllowed,
            },
        ];

        entity = new MJRecordChangeEntityServer();
        (entity as unknown as { ContextCurrentUser: unknown }).ContextCurrentUser = mockUser;
    });

    it('allows update when only Comments is dirty and user holds Record Changes: Annotate', () => {
        entity.Fields = [
            { Name: 'Comments', Dirty: true },
            { Name: 'Source', Dirty: false },
            { Name: 'Status', Dirty: false },
        ];
        annotateAuthAllowed = true;

        const allowed = entity.CheckPermissions(EntityPermissionType.Update, false);
        expect(allowed).toBe(true);
    });

    it('still requires the role\'s Update permission from an Annotate holder', async () => {
        entity.Fields = [{ Name: 'Comments', Dirty: true }];
        annotateAuthAllowed = true;
        const { MJRecordChangeEntity } = await import('@memberjunction/core-entities');
        const stub = MJRecordChangeEntity as unknown as { RoleAllowsUpdate: boolean };
        stub.RoleAllowsUpdate = false;
        try {
            expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        } finally {
            stub.RoleAllowsUpdate = true;
        }
    });

    it('refuses update when Comments is dirty but user lacks Record Changes: Annotate', () => {
        entity.Fields = [
            { Name: 'Comments', Dirty: true },
            { Name: 'Source', Dirty: false },
        ];
        annotateAuthAllowed = false;

        expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        expect(() => entity.CheckPermissions(EntityPermissionType.Update, true)).toThrow(/Permission denied/i);
    });

    it('refuses update when a non-Comments field is also dirty', () => {
        entity.Fields = [
            { Name: 'Comments', Dirty: true },
            { Name: 'Source', Dirty: true },
        ];
        annotateAuthAllowed = true;

        expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        expect(() => entity.CheckPermissions(EntityPermissionType.Update, true)).toThrow(/cannot be modified/i);
    });

    it('refuses update when Comments is not dirty but other fields are dirty', () => {
        entity.Fields = [
            { Name: 'Comments', Dirty: false },
            { Name: 'FullRecordJSON', Dirty: true },
        ];
        annotateAuthAllowed = true;

        expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        expect(() => entity.CheckPermissions(EntityPermissionType.Update, true)).toThrow(/cannot be modified/i);
    });

    it('refuses update when no fields are dirty', () => {
        entity.Fields = [
            { Name: 'Comments', Dirty: false },
            { Name: 'Source', Dirty: false },
        ];
        annotateAuthAllowed = true;

        expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        expect(() => entity.CheckPermissions(EntityPermissionType.Update, true)).toThrow(/cannot be modified/i);
    });

    it('refuses update when AllowUpdateAPI is false', () => {
        entity.Fields = [{ Name: 'Comments', Dirty: true }];
        entity.EntityInfo.AllowUpdateAPI = false;

        expect(entity.CheckPermissions(EntityPermissionType.Update, false)).toBe(false);
        expect(() => entity.CheckPermissions(EntityPermissionType.Update, true)).toThrow(/Update API is disabled/i);
    });

    it('throws if no active user is set', () => {
        (entity as unknown as { ContextCurrentUser: unknown }).ContextCurrentUser = null;
        entity.Fields = [{ Name: 'Comments', Dirty: true }];

        expect(() => entity.CheckPermissions(EntityPermissionType.Update, false)).toThrow(/No user set/i);
    });

    it('delegates other permission types (Read, Delete, Create) to super.CheckPermissions', () => {
        expect(entity.CheckPermissions(EntityPermissionType.Read, false)).toBe(true);
        expect(entity.CheckPermissions(EntityPermissionType.Create, false)).toBe(true);
        expect(entity.CheckPermissions(EntityPermissionType.Delete, false)).toBe(true);
    });
});

/**
 * An Internal `Create` record change is the platform's own record of who created a record, written
 * in SQL alongside each insert. Code trusts it (the form component guard reads who created a
 * component from one), so a caller may not create one through the API.
 */
describe('MJRecordChangeEntityServer — creating a record change', () => {
    function newChange(caller: unknown, source: string, type: string): MJRecordChangeEntityServer {
        const change = new MJRecordChangeEntityServer();
        Object.assign(change, { ContextCurrentUser: caller, IsSaved: false, Source: source, Type: type });
        return change;
    }

    const uiUser = { ID: 'u-ui', Name: 'Plain user', Type: 'User' };
    const owner = { ID: 'u-owner', Name: 'Owner', Type: 'Owner' };

    it('refuses an Internal Create record change created by a caller, a UI user or an Owner alike', () => {
        for (const caller of [uiUser, owner]) {
            const change = newChange(caller, 'Internal', 'Create');
            expect(change.CheckPermissions(EntityPermissionType.Create, false)).toBe(false);
            expect(() => change.CheckPermissions(EntityPermissionType.Create, true)).toThrow(/Source 'Internal' and Type 'Create'/);
        }
    });

    it('leaves an Internal Snapshot record change, as version labels write, to the role permission', () => {
        expect(newChange(uiUser, 'Internal', 'Snapshot').CheckPermissions(EntityPermissionType.Create, false)).toBe(true);
    });

    it('leaves an External record change to the role permission', () => {
        expect(newChange(uiUser, 'External', 'Create').CheckPermissions(EntityPermissionType.Create, false)).toBe(true);
    });

    it('allows an Internal Create record change with no caller, a trusted server context', () => {
        expect(newChange(null, 'Internal', 'Create').CheckPermissions(EntityPermissionType.Create, false)).toBe(true);
    });
});
