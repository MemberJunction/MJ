// The resolvers carry type-graphql decorators, which need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
    DatabaseProviderBase,
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    EntityInfo,
    UserInfo,
} from '@memberjunction/core';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import { DatasetResolverExtended, DatasetStatusResolver } from '../resolvers/DatasetResolver.js';
import type { AppContext, UserPayload } from '../types.js';

// The encrypted-field policy configures the encryption engine before it inspects a value; there is
// no key store in a unit test.
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        Instance: {
            Config: async () => undefined,
            GetKeyByID: () => ({ Marker: '$ENC$' }),
            Encrypt: async (value: string) => `$ENC$${value}`,
        },
    },
}));

/**
 * The GraphQL dataset queries are the network edge of security finding C6.
 *
 * `GetDatasetByName` / `GetDatasetStatusByName` took `ItemFilters[].Filter` from any authenticated
 * principal and handed it to the provider unscreened, and passed no context user, so the provider
 * could neither refuse an unreadable item nor apply row-level security. These tests pin that the
 * resolvers screen every ItemFilter with the same AST screen as ExtraFilter before the provider is
 * reached, pass the session user down, and apply the API encryption policy to the rows they return.
 */

const ROLE_ID = 'R0000000-0000-0000-0000-00000000000A';
const OTHER_ROLE_ID = 'R0000000-0000-0000-0000-00000000000C';

function entity(name: string, baseView: string, fields: Record<string, unknown>[] = []): EntityInfo {
    const id = `E-${name}`;
    return new EntityInfo({
        ID: id, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: baseView,
        Permissions: [{ ID: `p-${name}`, EntityID: id, RoleID: ROLE_ID, CanRead: true, Type: 'Allow' }],
        Fields: fields.map((f, i) => ({ ID: `${id}-f${i}`, EntityID: id, Entity: name, Sequence: i + 1, Type: 'nvarchar', ...f })),
    });
}

const THINGS = entity('Things', 'vwThings', [{ Name: 'ID', IsPrimaryKey: true }, { Name: 'Name' }]);
const SECRETS = entity('Secrets', 'vwSecrets', [
    { Name: 'ID', IsPrimaryKey: true },
    { Name: 'Token', Encrypt: true, EncryptionKeyID: 'K1', AllowDecryptInAPI: false, SendEncryptedValue: false },
]);

const USER = new UserInfo(undefined, {
    ID: 'U1', Name: 'Reader', Email: 'reader@example.com', IsActive: true,
    UserRoles: [{ UserID: 'U1', RoleID: ROLE_ID, Role: 'Reader' }],
});

type ProviderCall = {
    Method: 'GetDatasetByName' | 'GetDatasetStatusByName';
    DatasetName: string;
    ItemFilters: DatasetItemFilterType[] | undefined;
    ContextUser: UserInfo | undefined;
};

/** A provider double that records what reached it and answers with fixed rows. */
function fakeProvider(itemEntity: EntityInfo = THINGS, rows: Record<string, unknown>[] = []) {
    const calls: ProviderCall[] = [];
    const provider = {
        Entities: [THINGS, SECRETS],
        EntityByName: (name: string) => [THINGS, SECRETS].find(e => e.Name.toLowerCase() === name?.trim().toLowerCase()),
        GetDatasetByName: async (DatasetName: string, ItemFilters?: DatasetItemFilterType[], ContextUser?: UserInfo): Promise<DatasetResultType> => {
            calls.push({ Method: 'GetDatasetByName', DatasetName, ItemFilters, ContextUser });
            return {
                DatasetID: 'DS1', DatasetName, Success: true, Status: '', LatestUpdateDate: new Date(0),
                Results: [{ Code: itemEntity.Name, EntityName: itemEntity.Name, EntityID: itemEntity.ID, Results: rows, Success: true }],
            };
        },
        GetDatasetStatusByName: async (DatasetName: string, ItemFilters?: DatasetItemFilterType[], ContextUser?: UserInfo): Promise<DatasetStatusResultType> => {
            calls.push({ Method: 'GetDatasetStatusByName', DatasetName, ItemFilters, ContextUser });
            return { DatasetID: 'DS1', DatasetName, Success: true, Status: '', LatestUpdateDate: new Date(0), EntityUpdateDates: [] };
        },
    };
    return { provider: provider as unknown as DatabaseProviderBase, calls };
}

function context(provider: DatabaseProviderBase, userPayload: Partial<UserPayload> = { email: USER.Email, userRecord: USER }): AppContext {
    return {
        providers: [{ provider, type: 'Read-Write' }],
        userPayload: { sessionId: 'S1', ...userPayload } as UserPayload,
    } as AppContext;
}

const STACKED = [{ ItemCode: 'Things', Filter: '1=0; SELECT 1' }];
// A quote inside a bracket identifier opens a fake literal for the string-literal stripper that
// guards the provider denylist; the AST screen tokenizes brackets and still sees the second statement.
const STACKED_BEHIND_BRACKET = [{ ItemCode: 'Things', Filter: "[a'] = 1; SELECT 1 --'" }];

describe('GetDatasetByName', () => {
    it('refuses a stacked-statement ItemFilter before the provider is reached', async () => {
        const { provider, calls } = fakeProvider();

        await expect(new DatasetResolverExtended().GetDatasetByName('MJ_Metadata', context(provider), STACKED))
            .rejects.toThrow(/multiple statements are not permitted/);
        expect(calls).toEqual([]);
    });

    it('refuses a stacked statement hidden behind a bracket identifier', async () => {
        const { provider, calls } = fakeProvider();

        await expect(new DatasetResolverExtended().GetDatasetByName('MJ_Metadata', context(provider), STACKED_BEHIND_BRACKET))
            .rejects.toThrow(/multiple statements are not permitted/);
        expect(calls).toEqual([]);
    });

    it('refuses an ItemFilter whose subquery reads a table that is not an entity base view', async () => {
        const { provider, calls } = fakeProvider();
        const filters = [{ ItemCode: 'Things', Filter: 'ID IN (SELECT ID FROM __mj.[User])' }];

        await expect(new DatasetResolverExtended().GetDatasetByName('MJ_Metadata', context(provider), filters))
            .rejects.toThrow(/entity base view/);
        expect(calls).toEqual([]);
    });

    it('passes the session user to the provider, with the screened filters', async () => {
        const { provider, calls } = fakeProvider();
        const filters = [{ ItemCode: 'Things', Filter: "Name = 'x'" }];

        const result = await new DatasetResolverExtended().GetDatasetByName('Things_Dataset', context(provider), filters);

        expect(result.Success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].ContextUser).toBe(USER);
        expect(calls[0].ItemFilters).toEqual(filters);
    });

    it('refuses a session that resolves to no user rather than reading as nobody', async () => {
        const { provider, calls } = fakeProvider();

        await expect(new DatasetResolverExtended().GetDatasetByName('Things_Dataset', context(provider, { email: '', userRecord: null })))
            .rejects.toThrow(/no user/i);
        expect(calls).toEqual([]);
    });

    it('masks an encrypted field the entity does not allow decrypted over the API, without touching the provider rows', async () => {
        // A context user makes the provider decrypt; the API policy decides what leaves the server.
        const providerRow = Object.freeze({ ID: 'S1', Token: 'plain-secret' });
        const { provider } = fakeProvider(SECRETS, [providerRow]);

        const result = await new DatasetResolverExtended().GetDatasetByName('Secrets_Dataset', context(provider));

        const items = JSON.parse(result.Results) as DatasetResultType['Results'];
        expect(items[0].Results[0].Token).toBe(ENCRYPTED_SENTINEL);
        expect(result.Results).not.toContain('plain-secret');
        expect(providerRow.Token).toBe('plain-secret');
    });
});

describe('GetDatasetStatusByName', () => {
    it('refuses a stacked-statement ItemFilter before the provider is reached', async () => {
        const { provider, calls } = fakeProvider();

        await expect(new DatasetStatusResolver().GetDatasetStatusByName('MJ_Metadata', context(provider), STACKED))
            .rejects.toThrow(/multiple statements are not permitted/);
        expect(calls).toEqual([]);
    });

    it('passes the session user to the provider', async () => {
        const { provider, calls } = fakeProvider();

        await new DatasetStatusResolver().GetDatasetStatusByName('Things_Dataset', context(provider), [{ ItemCode: 'Things', Filter: "Name = 'x'" }]);

        expect(calls).toHaveLength(1);
        expect(calls[0].ContextUser).toBe(USER);
    });

    it('refuses an ItemFilter that reads an entity the user has no read permission on', async () => {
        const { provider, calls } = fakeProvider();
        const outsider = new UserInfo(undefined, {
            ID: 'U2', Name: 'Outsider', Email: 'outsider@example.com', IsActive: true,
            UserRoles: [{ UserID: 'U2', RoleID: OTHER_ROLE_ID, Role: 'Other' }],
        });
        const filters = [{ ItemCode: 'Things', Filter: 'ID IN (SELECT ID FROM __mj.vwSecrets)' }];

        await expect(new DatasetStatusResolver().GetDatasetStatusByName('Things_Dataset', context(provider, { email: outsider.Email, userRecord: outsider }), filters))
            .rejects.toThrow(/read permission/);
        expect(calls).toEqual([]);
    });
});

describe('GetMultipleDatasetStatusByName', () => {
    it('passes the session user to the provider for every dataset', async () => {
        const { provider, calls } = fakeProvider();

        await new DatasetStatusResolver().GetMultipleDatasetStatusByName(['A', 'B'], context(provider));

        expect(calls.map(c => c.ContextUser)).toEqual([USER, USER]);
    });
});
