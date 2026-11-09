/**
 * CredentialEngine — per-user delegated (3LO) credential isolation.
 *
 * Drives the real engine against an in-memory credential store: the engine's cache and
 * loaded flag are seeded directly, the metadata provider hands out fake `MJ: Credentials`
 * entities backed by the store, and the audit logger / cache refresh are stubbed so each
 * test observes only the engine's own ownership and serialization logic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJCredentialEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '../CredentialEngine';
import { CredentialOwnerMismatchError } from '../expiration';

const ALICE_ID = '00000000-0000-0000-0000-00000000A11C';
const BOB_ID = '00000000-0000-0000-0000-00000000B0B2';
const OAUTH_TYPE_ID = '00000000-0000-0000-0000-0000000007E1';
const alice = { ID: ALICE_ID, Name: 'Alice', Email: 'alice@company.com', IsActive: true, UserRoles: [] } as unknown as UserInfo;

interface CredentialRow {
    ID: string;
    Name: string;
    CredentialTypeID: string;
    Values: string;
    IsActive: boolean;
    IsDefault: boolean;
    ExpiresAt: Date | null;
    Description: string | null;
    CategoryID: string | null;
}

interface EngineInternals {
    /** Real BaseEngine flag and the package's `__mocks__/core.ts` flag — set both so either implementation reports loaded. */
    _loaded: boolean;
    _isLoaded: boolean;
    _provider: IMetadataProvider | undefined;
    _credentials: MJCredentialEntity[];
    _credentialTypes: MJCredentialTypeEntity[];
    RefreshItem: (propertyName: string) => Promise<void>;
    logAccess: () => Promise<void>;
    updateLastUsedAt: () => Promise<void>;
}

function asRowEntity(row: CredentialRow): MJCredentialEntity {
    return { ...row } as unknown as MJCredentialEntity;
}

/** An in-memory stand-in for the MJ: Credentials table plus the entity objects the engine asks the provider for. */
function createStore(seed: CredentialRow[]) {
    const rows: CredentialRow[] = seed.map((r) => ({ ...r }));
    let seq = 0;
    const saveCalls: string[] = [];

    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName !== 'MJ: Credentials') {
                throw new Error(`unexpected entity ${entityName}`);
            }
            const entity: Partial<CredentialRow> & { NewRecord: () => void; Load: (id: string) => Promise<boolean>; Save: () => Promise<boolean> } = {
                NewRecord: () => {
                    entity.ID = `cred-${++seq}`;
                },
                Load: async (id: string) => {
                    const found = rows.find((r) => r.ID === id);
                    if (!found) return false;
                    Object.assign(entity, found);
                    return true;
                },
                Save: async () => {
                    // Yield once so concurrent callers interleave the way a real round trip would.
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    const row: CredentialRow = {
                        ID: entity.ID!,
                        Name: entity.Name!,
                        CredentialTypeID: entity.CredentialTypeID!,
                        Values: entity.Values!,
                        IsActive: entity.IsActive ?? true,
                        IsDefault: entity.IsDefault ?? false,
                        ExpiresAt: entity.ExpiresAt ?? null,
                        Description: entity.Description ?? null,
                        CategoryID: entity.CategoryID ?? null,
                    };
                    const idx = rows.findIndex((r) => r.ID === row.ID);
                    if (idx >= 0) rows[idx] = row; else rows.push(row);
                    saveCalls.push(row.Name);
                    return true;
                },
            };
            return entity;
        }),
    } as unknown as IMetadataProvider;

    return { rows, provider, saveCalls };
}

function seedEngine(store: ReturnType<typeof createStore>): CredentialEngine {
    const engine = CredentialEngine.Instance;
    const internals = engine as unknown as EngineInternals;
    internals._loaded = true;
    internals._isLoaded = true;
    internals._provider = store.provider;
    // The mocked BaseEngine has no ProviderToUse accessor; the real one reads `_provider`. Cover both.
    Object.defineProperty(engine, 'ProviderToUse', { configurable: true, get: () => store.provider });
    internals._credentialTypes = [
        { ID: OAUTH_TYPE_ID, Name: 'OAuth2 Client Credentials' } as unknown as MJCredentialTypeEntity,
    ];
    internals._credentials = store.rows.map(asRowEntity);
    internals.RefreshItem = async () => {
        internals._credentials = store.rows.map(asRowEntity);
    };
    internals.logAccess = async () => undefined;
    internals.updateLastUsedAt = async () => undefined;
    return engine;
}

function delegatedRow(ownerUserId: string, provider = 'Microsoft Graph'): CredentialRow {
    return {
        ID: `seed-${ownerUserId.slice(-4)}`,
        Name: `UserOAuth3LO:${provider}:${ownerUserId.toLowerCase()}`,
        CredentialTypeID: OAUTH_TYPE_ID,
        Values: JSON.stringify({ ownerUserId, principalEmail: 'x@company.com', providerName: provider, accessToken: 'tok' }),
        IsActive: true,
        IsDefault: false,
        ExpiresAt: null,
        Description: null,
        CategoryID: null,
    };
}

function appRow(): CredentialRow {
    return {
        ID: 'seed-app',
        Name: 'Graph App Registration',
        CredentialTypeID: OAUTH_TYPE_ID,
        Values: JSON.stringify({ clientId: 'app', clientSecret: 's3cret' }),
        IsActive: true,
        IsDefault: true,
        ExpiresAt: null,
        Description: null,
        CategoryID: null,
    };
}

describe('CredentialEngine user-delegated (3LO) isolation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps delegated credentials out of the shared synchronous accessors while GetUserDelegatedCredential still resolves them', async () => {
        const store = createStore([appRow(), delegatedRow(ALICE_ID)]);
        const engine = seedEngine(store);
        const delegated = store.rows[1];

        expect(engine.Credentials.map((c) => c.Name)).toEqual(['Graph App Registration']);
        expect(engine.GetCredentialById(delegated.ID)).toBeUndefined();
        expect(engine.GetCredentialByName('OAuth2 Client Credentials', delegated.Name)).toBeUndefined();
        expect(engine.GetDefaultCredentialForType('OAuth2 Client Credentials')?.Name).toBe('Graph App Registration');
        // The app credential is still reachable by id.
        expect(engine.GetCredentialById('seed-app')?.Name).toBe('Graph App Registration');

        const resolved = await engine.GetUserDelegatedCredential('Microsoft Graph', alice);
        expect(resolved?.values.ownerUserId).toBe(ALICE_ID);
        expect(resolved?.credential?.ID).toBe(delegated.ID);
    });

    it('refuses to overwrite an existing delegated row whose stored ownerUserId is another user', async () => {
        // The name says Alice but the stored values say Bob: tampered or mis-keyed row. Must not be overwritten.
        const tampered = { ...delegatedRow(ALICE_ID), Values: JSON.stringify({ ownerUserId: BOB_ID, accessToken: 'bob' }) };
        const store = createStore([tampered]);
        const engine = seedEngine(store);

        await expect(
            engine.StoreUserDelegatedCredential(
                { providerName: 'Microsoft Graph', ownerUserId: ALICE_ID, principalEmail: 'alice@company.com', accessToken: 'new' },
                alice
            )
        ).rejects.toBeInstanceOf(CredentialOwnerMismatchError);
        expect(store.rows[0].Values).toBe(tampered.Values);
    });

    it('serializes concurrent first-time stores for the same provider and user into a single row', async () => {
        const store = createStore([]);
        const engine = seedEngine(store);
        const options = { providerName: 'Microsoft Graph', ownerUserId: ALICE_ID, principalEmail: 'alice@company.com' };

        const [first, second] = await Promise.all([
            engine.StoreUserDelegatedCredential({ ...options, accessToken: 'first' }, alice),
            engine.StoreUserDelegatedCredential({ ...options, accessToken: 'second' }, alice),
        ]);

        expect(store.rows).toHaveLength(1);
        expect(first.ID).toBe(second.ID);
        expect(JSON.parse(store.rows[0].Values).accessToken).toBe('second');
        expect(store.saveCalls).toHaveLength(2);
    });
});
