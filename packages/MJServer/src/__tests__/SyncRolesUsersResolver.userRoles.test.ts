// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runViewResults } = vi.hoisted(() => ({
    runViewResults: new Map<string, unknown[]>(),
}));

// vitest's esbuild transform does not apply `emitDecoratorMetadata`, so the decorators are no-ops
// and the resolver runs as a plain class.
vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, ObjectType: noopDecorator,
        InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator, Ctx: noopDecorator,
        Directive: noopDecorator, registerEnumType: () => undefined,
    };
});

vi.mock('../directives/RequireSystemUser.js', () => ({ RequireSystemUser: () => () => undefined }));
vi.mock('../util.js', () => ({ GetReadWriteProvider: () => undefined }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: {} } }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string }) {
                return { Success: true, Results: runViewResults.get(params.EntityName) ?? [] };
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SyncRolesAndUsersResolver, type UserInputType } from '../resolvers/SyncRolesUsersResolver.js';
import type { UserPayload } from '../types.js';

/** Exposes the protected step under test. */
class TestResolver extends SyncRolesAndUsersResolver {
    public Sync(users: UserInputType[], provider: IMetadataProvider) {
        return this.SyncUserRoles(users, {} as UserInfo, {} as UserPayload, provider);
    }
}

const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const BOB = 'bbbbbbbb-0000-0000-0000-000000000002';
const ADMIN = 'cccccccc-0000-0000-0000-000000000003';
const EDITOR = 'dddddddd-0000-0000-0000-000000000004';
const UI = 'eeeeeeee-0000-0000-0000-000000000005';

const deleted: string[] = [];
const created: Array<{ UserID: string; RoleID: string }> = [];

function userRole(ID: string, UserID: string, RoleID: string, Role: string) {
    return { ID, UserID, RoleID, Role, Delete: vi.fn(async () => { deleted.push(ID); return true; }) };
}

const provider = {
    GetEntityObject: async () => {
        const row = { UserID: '', RoleID: '', Save: async () => { created.push({ UserID: row.UserID, RoleID: row.RoleID }); return true; } };
        return row;
    },
} as unknown as IMetadataProvider;

const input = (Email: string, roles: string[]) => ({ Email, Roles: roles.map(Name => ({ Name })) }) as unknown as UserInputType;

beforeEach(() => {
    deleted.length = 0;
    created.length = 0;
    runViewResults.set('MJ: Users', [{ ID: ALICE, Email: 'Alice@Example.com' }, { ID: BOB, Email: 'bob@example.com' }]);
    runViewResults.set('MJ: Roles', [{ ID: ADMIN.toUpperCase(), Name: 'Admin' }, { ID: EDITOR, Name: 'Editor' }, { ID: UI, Name: 'UI' }]);
    runViewResults.set('MJ: User Roles', [
        userRole('alice-editor', ALICE.toUpperCase(), EDITOR.toUpperCase(), 'Editor'),
        userRole('alice-ui', ALICE, UI, 'UI'),
        userRole('bob-admin', BOB, ADMIN, 'Admin'),
    ]);
});

describe('SyncRolesAndUsersResolver.SyncUserRoles', () => {
    it('adds missing assignments and removes dropped ones, matching IDs in any case', async () => {
        await new TestResolver().Sync([
            input(' alice@example.com ', ['Admin', ' editor ', 'Ghost']),
            input('bob@example.com', []),
            input('carol@example.com', ['Admin']),
        ], provider);

        // Alice gains Admin; Editor already exists under an upper-case UserID/RoleID; Ghost is not a role.
        expect(created).toEqual([{ UserID: ALICE, RoleID: ADMIN.toUpperCase() }]);
        // Bob loses Admin. Alice keeps Editor (still requested) and UI (a standard role is never removed).
        // Carol is not a database user, so nothing happens for her.
        expect(deleted).toEqual(['bob-admin']);
    });
});
