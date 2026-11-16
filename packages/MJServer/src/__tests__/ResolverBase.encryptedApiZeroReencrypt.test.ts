/**
 * Unit tests verifying GraphQL read paths for encrypted fields (1.5):
 * 1. ResolverBase.RunViewGenericInternal forwards PreserveRestrictedApiCiphertext: true and
 *    invokes Encrypt() 0 times when AllowDecryptInAPI === false (both SendEncryptedValue: true
 *    and SendEncryptedValue: false).
 * 2. RunViewResolver.RunViewsWithCacheCheck applies ArrayFilterEncryptedFieldsForAPI to both
 *    `stale` (full refresh) and `differential` (`updatedRows`) responses without mutating
 *    provider-cached row objects in place, and without invoking Encrypt() when rows already
 *    hold ciphertext.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { encryptMock, decryptMock } = vi.hoisted(() => ({
    encryptMock: vi.fn(),
    decryptMock: vi.fn(),
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn().mockResolvedValue(undefined),
                Encrypt: encryptMock,
                Decrypt: decryptMock,
                IsEncrypted: (v: string | null | undefined) => typeof v === 'string' && v.startsWith('$ENC$'),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
    IsEncryptionKeyUnavailable: () => false,
    ReportEncryptionKeyUnavailable: vi.fn(),
}));

import {
    DatabaseProviderBase,
    EntityInfo,
    RunViewParams,
    RunViewResult,
    RunViewsWithCacheCheckResponse,
    RunViewWithCacheCheckParams,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunDynamicViewInput, RunViewResolver } from '../generic/RunViewResolver.js';
import type { AppContext, RunViewGenericParams, UserPayload } from '../types.js';

const ENTITY_ID = 'ent-vault-001';
const KEY_ID = '11111111-2222-3333-4444-555555555555';
const CIPHERTEXT_PASSTHROUGH = `$ENC$${KEY_ID}$AES-256-GCM$iv1$cipher1$tag1`;
const CIPHERTEXT_REDACTED = `$ENC$${KEY_ID}$AES-256-GCM$iv2$cipher2$tag2`;

type RowScalar = string | number | boolean | null | undefined;
type VaultRow = Record<string, RowScalar>;

function buildVaultEntity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Vault Items',
        SchemaName: '__mj',
        BaseTable: 'VaultItem',
        BaseView: 'vwVaultItems',
        Status: 'Active',
        EntityPermissions: [
            {
                ID: 'p-1',
                EntityID: ENTITY_ID,
                RoleID: 'r-1',
                CanRead: true,
                CanCreate: false,
                CanUpdate: false,
                CanDelete: false,
            },
        ],
        EntityFields: [
            {
                ID: 'f-id',
                EntityID: ENTITY_ID,
                Sequence: 1,
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Status: 'Active',
            },
            {
                ID: 'f-cipher',
                EntityID: ENTITY_ID,
                Sequence: 2,
                Name: 'SealedSecret',
                Type: 'nvarchar',
                Length: -1,
                AllowsNull: true,
                Encrypt: true,
                EncryptionKeyID: KEY_ID,
                AllowDecryptInAPI: false,
                SendEncryptedValue: true,
                Status: 'Active',
            },
            {
                ID: 'f-sentinel',
                EntityID: ENTITY_ID,
                Sequence: 3,
                Name: 'RedactedSecret',
                Type: 'nvarchar',
                Length: -1,
                AllowsNull: true,
                Encrypt: true,
                EncryptionKeyID: KEY_ID,
                AllowDecryptInAPI: false,
                SendEncryptedValue: false,
                Status: 'Active',
            },
            {
                ID: 'f-plain',
                EntityID: ENTITY_ID,
                Sequence: 4,
                Name: 'PublicLabel',
                Type: 'nvarchar',
                Length: 100,
                AllowsNull: true,
                Encrypt: false,
                Status: 'Active',
            },
        ],
    });
}

function buildUserPayload(): UserPayload {
    const role = new UserRoleInfo({ UserID: 'u-1', RoleID: 'r-1', Role: 'Reader' });
    const userRecord = new UserInfo(null, {
        ID: 'u-1',
        Name: 'Reader',
        Email: 'reader@example.test',
        IsActive: true,
        UserRoles: [role],
    });
    return {
        userRecord,
        email: 'reader@example.test',
        sessionId: 'sess-1',
    };
}

class EncryptedReadProbeResolver extends ResolverBase {
    public async ExecuteDynamicView(
        viewInput: RunDynamicViewInput,
        provider: DatabaseProviderBase,
        userPayload: UserPayload
    ): Promise<RunViewResult<VaultRow>> {
        return (await this.RunDynamicViewGeneric(viewInput, provider, userPayload, {} as PubSubEngine)) as RunViewResult<VaultRow>;
    }

    public async ExecuteBatchViews(params: RunViewGenericParams[]): Promise<RunViewResult<VaultRow>[]> {
        return (await this.RunViewsGenericInternal(params)) as RunViewResult<VaultRow>[];
    }
}

describe('Zero decrypt-then-re-encrypt on GraphQL reads (1.5)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('passes PreserveRestrictedApiCiphertext: true in RunViewGenericInternal and calls Encrypt() 0 times', async () => {
        const entity = buildVaultEntity();
        const userPayload = buildUserPayload();
        let capturedRunViewParams: RunViewParams | undefined;

        const frozenProviderRow: VaultRow = Object.freeze({
            ID: 'v-1',
            SealedSecret: CIPHERTEXT_PASSTHROUGH,
            RedactedSecret: CIPHERTEXT_REDACTED,
            PublicLabel: 'Prod Key',
        });

        const fakeProvider = {
            Entities: [entity],
            EntityByName: (name: string) => (name === entity.Name ? entity : undefined),
            EntityByID: (id: string) => (id === entity.ID ? entity : undefined),
            DatabaseType: 'mssql',
            RunView: async (params: RunViewParams): Promise<RunViewResult<VaultRow>> => {
                capturedRunViewParams = params;
                return {
                    Success: true,
                    Results: [frozenProviderRow],
                    UserViewRunID: '',
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                };
            },
        } as object as DatabaseProviderBase;

        const resolver = new EncryptedReadProbeResolver();
        const out = await resolver.ExecuteDynamicView(
            {
                EntityName: entity.Name,
                ExtraFilter: '',
                OrderBy: '',
                UserSearchString: '',
                ExcludeUserViewRunID: '',
                OverrideExcludeFilter: '',
                IgnoreMaxRows: false,
                MaxRows: 100,
                ForceAuditLog: false,
                AuditLogDescription: '',
                ResultType: 'simple',
                StartRow: 0,
            },
            fakeProvider,
            userPayload
        );

        expect(capturedRunViewParams?.PreserveRestrictedApiCiphertext).toBe(true);
        expect(out.Success).toBe(true);
        expect(out.Results[0].SealedSecret).toBe(CIPHERTEXT_PASSTHROUGH);
        expect(out.Results[0].RedactedSecret).toBe(ENCRYPTED_SENTINEL);
        expect(out.Results[0].PublicLabel).toBe('Prod Key');
        expect(encryptMock).not.toHaveBeenCalled();
        expect(decryptMock).not.toHaveBeenCalled();
    });

    it('applies API encryption filtering on RunViewsWithCacheCheck stale and differential rows with 0 Encrypt() calls', async () => {
        const entity = buildVaultEntity();
        const userPayload = buildUserPayload();

        const frozenStaleRow: VaultRow = Object.freeze({
            ID: 'v-stale',
            SealedSecret: CIPHERTEXT_PASSTHROUGH,
            RedactedSecret: CIPHERTEXT_REDACTED,
            PublicLabel: 'Stale Row',
        });
        const frozenDiffRow: VaultRow = Object.freeze({
            ID: 'v-diff',
            SealedSecret: CIPHERTEXT_PASSTHROUGH,
            RedactedSecret: CIPHERTEXT_REDACTED,
            PublicLabel: 'Diff Row',
        });

        const fakeProvider = {
            Entities: [entity],
            EntityByName: (name: string) => (name === entity.Name ? entity : undefined),
            EntityByID: (id: string) => (id === entity.ID ? entity : undefined),
            DatabaseType: 'mssql',
            RunViewsWithCacheCheck: async (
                _params: RunViewWithCacheCheckParams[]
            ): Promise<RunViewsWithCacheCheckResponse> => ({
                success: true,
                results: [
                    {
                        viewIndex: 0,
                        status: 'stale',
                        results: [frozenStaleRow],
                        maxUpdatedAt: '2026-04-01T00:00:00.000Z',
                        rowCount: 1,
                    },
                    {
                        viewIndex: 1,
                        status: 'differential',
                        differentialData: {
                            updatedRows: [frozenDiffRow],
                            deletedRecordIDs: [],
                        },
                        maxUpdatedAt: '2026-04-02T00:00:00.000Z',
                        rowCount: 1,
                    },
                ],
            }),
        } as object as DatabaseProviderBase;

        const resolver = new RunViewResolver();
        const ctx: AppContext = {
            userPayload,
            providers: [{ provider: fakeProvider, type: 'Read-Only' }],
            dataSources: [],
        };

        const response = await resolver.RunViewsWithCacheCheck(
            [
                { params: { EntityName: 'Vault Items' } },
                {
                    params: { EntityName: 'Vault Items' },
                    cacheStatus: { maxUpdatedAt: '2026-04-01T00:00:00.000Z', rowCount: 1 },
                },
            ],
            ctx
        );

        expect(response.success).toBe(true);
        const staleParsed = JSON.parse(response.results[0].Results![0].Data) as VaultRow;
        expect(staleParsed.SealedSecret).toBe(CIPHERTEXT_PASSTHROUGH);
        expect(staleParsed.RedactedSecret).toBe(ENCRYPTED_SENTINEL);
        expect(staleParsed.PublicLabel).toBe('Stale Row');

        const diffParsed = JSON.parse(response.results[1].differentialData!.updatedRows[0].Data) as VaultRow;
        expect(diffParsed.SealedSecret).toBe(CIPHERTEXT_PASSTHROUGH);
        expect(diffParsed.RedactedSecret).toBe(ENCRYPTED_SENTINEL);
        expect(diffParsed.PublicLabel).toBe('Diff Row');

        expect(encryptMock).not.toHaveBeenCalled();
        expect(decryptMock).not.toHaveBeenCalled();
    });
});
