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
