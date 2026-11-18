/**
 * Field-level security on FileResolver's own create path and responses.
 *
 * `CreateFile` applies its input with `NewRecord` rather than through the generated create
 * resolver, so it gates the input itself: a restricted caller's key for a field it may not read,
 * or a key that names no field, is refused with the same message, before any storage work. The
 * `File` it returns (and `UploadStorageFile`'s) is the record just saved or reloaded, which is
 * projected for the caller. The file entity here stands in with the fixture's restricted fields.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createUploadUrl: vi.fn() }));

vi.mock('@memberjunction/server', () => {
    const noopDecorator = () => () => undefined;
    return {
        Arg: noopDecorator, Ctx: noopDecorator, Field: noopDecorator, FieldResolver: noopDecorator, InputType: noopDecorator,
        Mutation: noopDecorator, ObjectType: noopDecorator, PubSub: noopDecorator, Query: noopDecorator, Resolver: noopDecorator,
        Root: noopDecorator, Int: {}, Float: {}, DeleteOptionsInput: class {},
    };
});
vi.mock('../generated/generated.js', () => ({
    CreateMJFileInput: class {},
    UpdateMJFileInput: class {},
    MJFile_: class {},
    MJFileResolver: class {
        protected GetUserFromPayload(userPayload: { userRecord?: object } | undefined) {
            return userPayload?.userRecord;
        }
    },
}));
vi.mock('@memberjunction/ai-agents', () => ({ readRealtimeRecordingFile: vi.fn() }));
vi.mock('@memberjunction/graphql-dataprovider', () => ({ FieldMapper: class { MapFields(o: object) { return o; } } }));
vi.mock('../config.js', () => ({ configInfo: {} }));
vi.mock('../rest/MediaAccessKeys.js', () => ({ MediaAccessKeyManager: { Instance: {} } }));
vi.mock('../rest/UploadTokenManager.js', () => ({ UploadTokenManager: { Instance: { Consume: vi.fn() } } }));
vi.mock('@memberjunction/storage', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/storage')>('@memberjunction/storage');
    return { ...actual, createUploadUrl: mocks.createUploadUrl };
});

import type { PubSubEngine } from '@memberjunction/server';
import { FileResolver } from '../resolvers/FileResolver.js';
import type { AppContext } from '../types.js';
import { EmployeeEntity, FullWidthEmployeeRow, Intern, NoRecordChangesMetadata, RefusalFor, SECRET_SALARY } from './fieldSecurityFixtures.js';

function fileEntity() {
    return { EntityInfo: EmployeeEntity(), CheckPermissions: vi.fn(), NewRecord: vi.fn(() => true), GetAll: () => FullWidthEmployeeRow() };
}

function contextFor(entity: ReturnType<typeof fileEntity>): AppContext {
    const provider = { GetEntityObject: vi.fn(async () => entity), RunView: vi.fn(), RunViews: vi.fn() };
    return { providers: [{ provider, type: 'Read-Write' }], userPayload: { userRecord: Intern() } } as unknown as AppContext;
}

describe('FileResolver.CreateFile: client input is gated for a restricted caller', () => {
    it.each([
        ['a denied field', 'Salary'],
        ['a key that names no field', 'Bogus'],
    ])('REGRESSION: refuses %s with the same message, before any storage work', async (_label, key) => {
        const entity = fileEntity();
        const input = { Name: 'new.pdf', [key]: 1 }; // keys of the stand-in entity
        await expect(new FileResolver().CreateFile(input as never, contextFor(entity), {} as PubSubEngine))
            .rejects.toThrow(RefusalFor(key));
        expect(entity.NewRecord).not.toHaveBeenCalled();
        expect(mocks.createUploadUrl).not.toHaveBeenCalled();
    });
});

describe('FileResolver responses are projected for the caller', () => {
    it('REGRESSION: the File returned never carries a denied value of a full-width record', () => {
        const respond = (FileResolver.prototype as unknown as {
            fileResponse(entity: ReturnType<typeof fileEntity>, user: unknown, provider: unknown): Record<string, unknown>;
        }).fileResponse;

        const file = respond.call(new FileResolver(), fileEntity(), Intern(), NoRecordChangesMetadata);

        expect(JSON.stringify(file)).not.toContain(String(SECRET_SALARY));
        expect(file).toMatchObject({ ID: 'emp-1', Name: 'Ada' });
    });
});
