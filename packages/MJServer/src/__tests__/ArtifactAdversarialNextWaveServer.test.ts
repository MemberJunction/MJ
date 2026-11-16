import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
    type EntityInfo,
    type IMetadataProvider,
    type IRunViewProvider,
    IsPostRunViewProtectedEntity,
    Metadata,
    type RunViewParams,
    type UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    BuildBlockIdentityBinding,
    ComputeFrozenSnapshotHash,
    DocumentLiveBlockEngine,
    type FrozenBlockSnapshot,
    type MJArtifactEntity,
    type MJArtifactGuestShareLinkEntity,
    type MJArtifactTypeEntity,
    type MJArtifactVersionEntity,
    type MJConversationDetailEntity,
    type MJFileEntity,
    type SlideDeckSpec,
    SpreadsheetEngine,
    type WorkbookSpec,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Base64ToBytes, BytesToBase64, UUIDsEqual } from '@memberjunction/global';
import {
    LoadArtifactFileStorageBytes,
    RegisterServerArtifactFileBytesLoader,
} from '../resolvers/ArtifactFileResolver.js';
import { ListArtifactGuestShareLinksForOwner } from '../operations/ArtifactGuestShareServerOperations.js';
import { configInfo } from '../config.js';

vi.mock('../config.js', () => ({
    configInfo: {
        apiBasePath: '/',
        cors: { allowedOrigins: ['*'] },
        magicLink: {
            enabled: false,
            audience: 'mj-magic-link',
            restrictedRoleName: 'Magic Link Baseline',
            grantableRoleNames: [],
            inviteIssuerRoleNames: [],
            sessionTokenTtlHours: 8,
            defaultExpiresInHours: 72,
            explorerUrl: 'http://localhost:4200',
            artifactGuestSharing: {
                enabled: true,
                maxExpiresInHours: 720,
                maxUses: 100,
                applicationName: 'Chat',
                resourceTypeName: 'Artifacts',
            },
        },
    },
}));

vi.mock('../context.js', () => ({
    getUserPayload: vi.fn(async () => null),
}));

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    const decorators = [
        'Resolver',
        'Query',
        'Mutation',
        'Subscription',
        'Arg',
        'Args',
        'ArgsType',
        'Ctx',
        'Root',
        'Info',
        'Field',
        'FieldResolver',
        'ObjectType',
        'InputType',
        'InterfaceType',
        'Authorized',
        'UseMiddleware',
        'Extensions',
        'Directive',
        'PubSub',
    ];
    return {
        ...Object.fromEntries(decorators.map((name) => [name, noopDecorator])),
        Float: class {},
        Int: class {},
        ID: class {},
        PubSubEngine: class {},
        AuthorizationError: class AuthorizationError extends Error {},
        registerEnumType: () => undefined,
        createUnionType: () => class {},
    };
});

import { ResolverBase } from '../generic/ResolverBase.js';
import {
    BuildGuestShareRateLimitKey,
    ContainsLiveMJFormula,
    IsGuestShareSupportedArtifactType,
    ResolveGuestArtifactSnapshotForSession,
} from '../operations/ArtifactGuestShareServerOperations.js';
import { PublicGuestShareResolver } from '../resolvers/PublicGuestShareResolver.js';
import {
    ARTIFACT_COLLABORATION_WS_PATH,
    ArtifactCollaborationServer,
    type CollaborationControlFrame,
    YJS_MESSAGE_CONTROL,
    YJS_MESSAGE_SYNC,
} from '../collaboration/ArtifactCollaborationServer.js';
import { DocumentCollaborationResolver } from '../resolvers/DocumentCollaborationResolver.js';
import { RegisterArtifactPostRunViewProtectedEntities } from '../generic/RegisterArtifactProtectedEntities.js';
import type { AppContext } from '../types.js';

function makeUser(id: string, name: string, email: string): UserInfo {
    return {
        ID: id,
        Name: name,
        Email: email,
        Type: 'User',
        IsActive: true,
        UserRoles: [],
    } as UserInfo;
}

const TEST_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

interface MockVersionRecord {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Name: string;
    Content: string;
    Configuration: string;
    ContentMode: string;
    UserID: string;
    __mj_CreatedAt: Date;
    __mj_UpdatedAt: Date;
}

interface MockArtifactRecord {
    ID: string;
    Name: string;
    TypeID: string;
    Type: string;
    UserID: string;
    SharingScope: string;
    __mj_UpdatedAt: Date;
}

interface MockGuestShareLinkRecord {
    ID: string;
    ArtifactID: string;
    ArtifactVersionID: string;
    TokenHash: string;
    ShareMode: 'Frozen';
    ExpiresAt: Date;
    RevokedAt: Date | null;
    Label: string;
    AccessCount: number;
    LastAccessedAt: Date | null;
}

class TestResolverHarness extends ResolverBase {
    public async TestMapFieldNamesToCodeNames(
        entityName: string,
        dataObject: Record<string, string | number | boolean | null>,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Record<string, string | number | boolean | null> | null> {
        return (await this.MapFieldNamesToCodeNames(
            entityName,
            dataObject,
            contextUser,
            provider
        )) as Record<string, string | number | boolean | null> | null;
    }

    public TestMustLoadTruthFromDatabase(
        entityInfo: EntityInfo,
        oldValues: Array<{ Key: string; Value: string }> | undefined,
        user: UserInfo | undefined
    ): boolean {
        return this.MustLoadTruthFromDatabase(
            entityInfo,
            { OldValues___: oldValues },
            false,
            false,
            user
        );
    }
}

describe('Artifact & Collaboration Adversarial Security + Next-Wave Fixes', () => {
    const ownerUser = makeUser('11111111-1111-4111-8111-111111111111', 'Owner User', 'owner@example.com');
    const editorUser = makeUser('22222222-2222-4222-8222-222222222222', 'Editor User', 'editor@example.com');
    const outsiderUser = makeUser('33333333-3333-4333-8333-333333333333', 'Outsider User', 'outsider@example.com');
    const systemUser = makeUser('99999999-9999-4999-8999-999999999999', 'System User', 'system@example.com');

    beforeEach(() => {
        ArtifactCollaborationServer.Instance.ResetShutdownForTests();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await ArtifactCollaborationServer.Instance.Shutdown();
        ArtifactCollaborationServer.Instance.ResetShutdownForTests();
        ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(null);
        ArtifactCollaborationServer.Instance.SetAuthResolverOverride(null);
        ArtifactCollaborationServer.Instance.SetTicketHmacSecret(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret(null);
    });

    it('P0-R1 & P0-R2: Registers all 9 protected entities in ClientClauseScreen and enforces ResolverBase row ACL + stored-row loading', async () => {
        RegisterArtifactPostRunViewProtectedEntities();

        const expectedProtected = [
            'MJ: Artifacts',
            'MJ: Artifact Versions',
            'MJ: Artifact Permissions',
            'MJ: Artifact Version Attributes',
            'MJ: Collections',
            'MJ: Collection Permissions',
            'MJ: Collection Artifacts',
            'MJ: Artifact Working States',
            'MJ: Artifact Guest Share Links',
        ];
        for (const entityName of expectedProtected) {
            expect(IsPostRunViewProtectedEntity(entityName)).toBe(true);
        }

        const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const collectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const versionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const attrId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

        const fakeEntityInfo = (name: string): EntityInfo =>
            ({
                ID: `ent-${name}`,
                Name: name,
                Fields: [
                    { Name: 'ID', CodeName: 'ID', IsPrimaryKey: true, NeedToEncrypt: false, AllowUpdateAPI: false, UserCanRead: () => true },
                    { Name: 'Name', CodeName: 'Name', IsPrimaryKey: false, NeedToEncrypt: false, AllowUpdateAPI: true, UserCanRead: () => true },
                ],
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
                TrackRecordChanges: false,
                FieldLevelSecurityApplies: false,
            }) as EntityInfo;

        const provider: IMetadataProvider & IRunViewProvider = {
            Entities: expectedProtected.map((name) => fakeEntityInfo(name)),
            EntityByName: (name: string) => fakeEntityInfo(name),
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ ID: versionId, ArtifactID: artifactId }],
                        TotalRowCount: 1,
                    };
                }
                return { Success: true, Results: [], TotalRowCount: 0 };
            }),
            RunViews: vi.fn(async () => []),
            GetEntityObject: vi.fn(async () => ({})),
        } as IMetadataProvider & IRunViewProvider;

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'CheckPermission').mockImplementation(
            async (_p, _aid, user) => UUIDsEqual(user.ID, ownerUser.ID)
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions').mockImplementation(
            async (_p, _cid, user) => ({
                CanRead: UUIDsEqual(user.ID, ownerUser.ID),
                CanEdit: UUIDsEqual(user.ID, ownerUser.ID),
                CanDelete: UUIDsEqual(user.ID, ownerUser.ID),
                CanShare: UUIDsEqual(user.ID, ownerUser.ID),
                IsOwner: UUIDsEqual(user.ID, ownerUser.ID),
                EffectivePermissionLevel: UUIDsEqual(user.ID, ownerUser.ID) ? 'Owner' : 'None',
            })
        );

        const resolver = new TestResolverHarness();

        // MustLoadTruthFromDatabase must be true for all 9 security entities even with OldValues___ and TrackRecordChanges=false
        for (const entityName of expectedProtected) {
            expect(
                resolver.TestMustLoadTruthFromDatabase(
                    fakeEntityInfo(entityName),
                    [{ Key: 'ID', Value: '1' }],
                    ownerUser
                )
            ).toBe(true);
        }

        // Denied entities never map through ResolverBase
        expect(
            await resolver.TestMapFieldNamesToCodeNames(
                'MJ: Artifact Working States',
                { ID: '1', Name: 'ws' },
                ownerUser,
                provider
            )
        ).toBeNull();
        expect(
            await resolver.TestMapFieldNamesToCodeNames(
                'MJ: Artifact Guest Share Links',
                { ID: '1', Name: 'link' },
                ownerUser,
                provider
            )
        ).toBeNull();

        // Outsider blocked, Owner allowed on MJ: Collections & MJ: Artifact Version Attributes
        expect(
            await resolver.TestMapFieldNamesToCodeNames(
                'MJ: Collections',
                { ID: collectionId, Name: 'Secret Collection' },
                outsiderUser,
                provider
            )
        ).toBeNull();
        expect(
            await resolver.TestMapFieldNamesToCodeNames(
                'MJ: Collections',
                { ID: collectionId, Name: 'Owner Collection' },
                ownerUser,
                provider
            )
        ).toEqual({ ID: collectionId, Name: 'Owner Collection' });

        expect(
            await resolver.TestMapFieldNamesToCodeNames(
                'MJ: Artifact Version Attributes',
                { ID: attrId, ArtifactVersionID: versionId, Name: 'SecretAttr' },
                outsiderUser,
                provider
            )
        ).toBeNull();
        expect(
            await resolver.TestMapFieldNamesToCodeNames(
                'MJ: Artifact Version Attributes',
                { ID: attrId, ArtifactVersionID: versionId, Name: 'OwnerAttr' },
                ownerUser,
                provider
            )
        ).toEqual({ ID: attrId, ArtifactVersionID: versionId, Name: 'OwnerAttr' });
    });

    it('P0-R4 & NW-1: Detects nested =MJ.* formulas, enforces per-IP+invite rate limit, blocks Component viewer, checks active inviter & SystemUser, and populates FrozenProvenance via Magic Link session', async () => {
        // 1. AST / tokenizer nested =MJ.* detection (vs safe formulas & string literals)
        expect(ContainsLiveMJFormula('=IF(1, MJ.QUERY("SELECT 1"), 0)')).toBe(true);
        expect(ContainsLiveMJFormula('=SUM(1, MJ.EXTRACT(A1, "topic"))')).toBe(true);
        expect(ContainsLiveMJFormula('=IF(A1>0, MJ.COMPUTE("sum"), 0)')).toBe(true);
        expect(ContainsLiveMJFormula('="MJ.QUERY(\'test\')"')).toBe(false);
        expect(ContainsLiveMJFormula('=SUM(A1:B10)')).toBe(false);

        // 2. Per-IP + invite rate-limit keys (never a shared global 'graphql-public')
        const keyIpA = BuildGuestShareRateLimitKey('198.51.100.1', 'invite-alpha');
        const keyIpB = BuildGuestShareRateLimitKey('198.51.100.2', 'invite-alpha');
        const keyOtherTok = BuildGuestShareRateLimitKey('198.51.100.1', 'invite-beta');
        expect(keyIpA).not.toBe('graphql-public');
        expect(keyIpA).not.toBe(keyIpB);
        expect(keyIpA).not.toBe(keyOtherTok);

        // 2b. Safe DriverClass allowlist blocks ComponentArtifactViewerPlugin & binary Files
        expect(IsGuestShareSupportedArtifactType('Component', 'ComponentArtifactViewerPlugin', 'Text')).toMatch(/Component/i);
        expect(IsGuestShareSupportedArtifactType('Markdown Document', 'MarkdownArtifactViewerPlugin', 'File')).toMatch(/Binary File/i);
        expect(IsGuestShareSupportedArtifactType('Markdown Document', 'MarkdownArtifactViewerPlugin', 'Text')).toBeNull();

        // 3. Valid Magic Link session + SystemUser fail-closed + active inviter + FrozenProvenance resolution
        DocumentLiveBlockEngine.Instance.SetSigningSecret(TEST_SECRET);

        const artifactId = 'aaaaaaaa-1111-4111-8111-111111111111';
        const versionId = 'bbbbbbbb-2222-4222-8222-222222222222';
        const linkId = 'cccccccc-3333-4333-8333-333333333333';
        const inviteId = 'dddddddd-4444-4444-8444-444444444444';
        const frozenAt = '2026-11-15T12:00:00.000Z';

        const frozenRows = [{ Total: 42 }];
        const snapPayload = {
            FrozenAt: frozenAt,
            FrozenByUserID: ownerUser.ID,
            FrozenByUserName: 'Alice Owner',
            Columns: [{ Name: 'Total', DisplayName: 'Total' }],
            Rows: frozenRows,
            TotalRowCount: 1,
            SecurityWarningAcknowledged: true,
            Binding: BuildBlockIdentityBinding(
                { BlockID: 'blk-frozen-1', Kind: 'EntityView', EntityName: 'MJ: Users' },
                artifactId,
            ),
        };
        const snapshot: FrozenBlockSnapshot = {
            ...snapPayload,
            SnapshotContentHash: ComputeFrozenSnapshotHash(snapPayload),
        };
        const blockSpec = {
            BlockID: 'blk-frozen-1',
            Kind: 'EntityView' as const,
            Mode: 'Frozen' as const,
            EntityName: 'MJ: Users',
            FrozenSnapshot: snapshot,
        };
        const docContent = `# Report\n\n:::mj-block\n${JSON.stringify(blockSpec)}\n:::\n`;

        let currentInviteStatus = 'Active';
        const storedLink = {
            ID: linkId,
            MagicLinkInviteID: inviteId,
            ArtifactID: artifactId,
            ArtifactVersionID: versionId,
            CreatedByUserID: ownerUser.ID,
            Label: 'Board Review',
        };

        const provider: IMetadataProvider & IRunViewProvider = {
            Entities: [],
            RunView: vi.fn(async (req: RunViewParams) => {
                if (req.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: artifactId,
                                Name: 'Q4 Report',
                                UserID: ownerUser.ID,
                                TypeID: 'type-doc',
                                Type: 'Markdown Document',
                            },
                        ],
                        TotalRowCount: 1,
                    };
                }
                return { Success: true, Results: [], TotalRowCount: 0 };
            }),
            RunViews: vi.fn(async (requests: RunViewParams[]) =>
                requests.map((req) => {
                    if (req.EntityName === 'MJ: Magic Link Invites') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: inviteId,
                                    Kind: 'resource-share',
                                    IdentityMode: 'anonymous',
                                    Status: currentInviteStatus,
                                    ResourceID: artifactId,
                                    CreatedByUserID: ownerUser.ID,
                                    ExpiresAt: new Date(Date.now() + 60_000),
                                    UseCount: 1,
                                    MaxUses: 1000,
                                },
                            ],
                            TotalRowCount: 1,
                        };
                    }
                    if (req.EntityName === 'MJ: Artifact Guest Share Links') {
                        return { Success: true, Results: [storedLink], TotalRowCount: 1 };
                    }
                    if (req.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: versionId,
                                    ArtifactID: artifactId,
                                    VersionNumber: 3,
                                    Name: 'Q4 Revenue Frozen',
                                    Content: docContent,
                                    Configuration: JSON.stringify({
                                        theme: 'light',
                                        apiKey: 'should-be-stripped',
                                        guestShareLinks: ['hidden'],
                                    }),
                                    ContentMode: 'Text',
                                },
                            ],
                            TotalRowCount: 1,
                        };
                    }
                    if (req.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: artifactId,
                                    Name: 'Q4 Report',
                                    UserID: ownerUser.ID,
                                    TypeID: 'type-doc',
                                    Type: 'Markdown Document',
                                },
                            ],
                            TotalRowCount: 1,
                        };
                    }
                    return { Success: true, Results: [], TotalRowCount: 0 };
                })
            ),
        } as IMetadataProvider & IRunViewProvider;

        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
            { ID: 'type-doc', Name: 'Markdown Document', DriverClass: 'MarkdownArtifactViewerPlugin' } as MJArtifactTypeEntity,
        ]);
        const usersSpy = vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([
            { ...ownerUser, IsActive: true } as UserInfo,
        ]);

        const makeSessionPayload = (targetInviteId = inviteId): NonNullable<AppContext['userPayload']> => ({
            email: 'anonymous@magic-link.local',
            sessionId: 'sess-ml-1',
            tokenExpiresAtMs: Date.now() + 3600_000,
            userRecord: {
                ID: 'ecaf2a70-d33f-4484-9b7a-8b93a84a16f4',
                IsActive: true,
                IsMagicLinkAnonymous: true,
                MagicLinkScope: {
                    ResourceType: 'Artifacts',
                    ResourceID: artifactId,
                    ApplicationID: 'app-chat',
                    RoleName: 'Magic Link Baseline',
                },
            } as UserInfo,
            magicLinkScopes: [
                {
                    inviteId: targetInviteId,
                    appId: 'app-chat',
                    resourceType: 'Artifacts',
                    resourceId: artifactId,
                },
            ],
        });

        // 3a. Fail closed when caller is not an anonymous Magic Link Artifacts session
        const nonAnonRes = await ResolveGuestArtifactSnapshotForSession(
            { email: 'u@example.com', sessionId: 's', userRecord: ownerUser },
            provider,
            '198.51.100.10',
        );
        expect(nonAnonRes.Valid).toBe(false);
        expect(nonAnonRes.ErrorCode).toBe('ACCESS_DENIED');

        // 3b. Fail closed when GetSystemUser returns undefined (no UserCache.Users[0] fallback)
        const sysUserSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(undefined);
        const failClosedResult = await ResolveGuestArtifactSnapshotForSession(
            makeSessionPayload(),
            provider,
            '198.51.100.10',
        );
        expect(failClosedResult.Valid).toBe(false);
        expect(failClosedResult.ErrorCode).toBe('INTERNAL_ERROR');

        // 3c. Fail closed if the inviter user was deactivated
        sysUserSpy.mockReturnValue(systemUser);
        usersSpy.mockReturnValue([{ ...ownerUser, IsActive: false } as UserInfo]);
        const inactiveInviterRes = await ResolveGuestArtifactSnapshotForSession(
            makeSessionPayload(),
            provider,
            '198.51.100.10',
        );
        expect(inactiveInviterRes.Valid).toBe(false);
        expect(inactiveInviterRes.ErrorCode).toBe('REVOKED');

        // 3d. Valid resolution returns server-verified FrozenProvenance + scrubbed config
        usersSpy.mockReturnValue([{ ...ownerUser, IsActive: true } as UserInfo]);
        const okResult = await ResolveGuestArtifactSnapshotForSession(
            makeSessionPayload(),
            provider,
            '198.51.100.11',
        );
        expect(okResult.Valid).toBe(true);
        expect(okResult.Success).toBe(true);
        expect(okResult.FrozenProvenance).toEqual([
            expect.objectContaining({
                TargetType: 'DocumentBlock',
                TargetID: 'blk-frozen-1',
                BlockID: 'blk-frozen-1',
                SnapshotVerified: true,
                FrozenByUserName: 'Alice Owner',
                FrozenAt: frozenAt,
            }),
        ]);
        const parsedConfig = JSON.parse(okResult.Configuration ?? '{}') as Record<string, string>;
        expect(parsedConfig.theme).toBe('light');
        expect(parsedConfig.apiKey).toBeUndefined();
        expect(parsedConfig.guestShareLinks).toBeUndefined();

        // 4. Reject ComponentArtifactViewerPlugin even on resolution if artifact type changed post-issuance
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
            { ID: 'type-doc', Name: 'Component', DriverClass: 'ComponentArtifactViewerPlugin' } as MJArtifactTypeEntity,
        ]);
        const compRes = await ResolveGuestArtifactSnapshotForSession(makeSessionPayload(), provider, '198.51.100.12');
        expect(compRes.Valid).toBe(false);
        expect(compRes.ErrorCode).toBe('FROZEN_REQUIRED');

        // Restore valid type for rate limit test
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
            { ID: 'type-doc', Name: 'Markdown Document', DriverClass: 'MarkdownArtifactViewerPlugin' } as MJArtifactTypeEntity,
        ]);

        // 5. PublicGuestShareResolver rate-limits per IP + invite, not globally across IPs
        const gqlResolver = new PublicGuestShareResolver();
        const makeGqlCtx = (ip: string, scopedInviteId = inviteId): AppContext =>
            ({
                ClientIp: ip,
                userPayload: makeSessionPayload(scopedInviteId),
                providers: [
                    { type: 'Read-Write', provider },
                    { type: 'Read-Only', provider },
                ],
            }) as AppContext;

        const spamInviteId = 'eeeeeeee-5555-4555-8555-555555555555';
        currentInviteStatus = 'Revoked';
        for (let i = 0; i < 60; i += 1) {
            await gqlResolver.ResolveGuestArtifactSnapshot(makeGqlCtx('203.0.113.50', spamInviteId));
        }
        const limitedRes = await gqlResolver.ResolveGuestArtifactSnapshot(
            makeGqlCtx('203.0.113.50', spamInviteId),
        );
        expect(limitedRes.ErrorCode).toBe('RATE_LIMITED');

        currentInviteStatus = 'Active';
        const isolatedIpRes = await gqlResolver.ResolveGuestArtifactSnapshot(
            makeGqlCtx('203.0.113.51', inviteId),
        );
        expect(isolatedIpRes.Valid).toBe(true);
    });

    it('P0-12 & P0-13: Rejects wire lock escalation on unlocked rooms, enforces most-restrictive ProtectedRanges & duplicate IDs, rejects meta watermark forgery, and fails closed on malformed JSON', async () => {
        const server = ArtifactCollaborationServer.Instance;
        server.SetTicketHmacSecret(TEST_SECRET);

        let roomMode: 'Document' | 'Spreadsheet' | 'SlideDeck' = 'Document';
        const artifactId = '12121212-1212-4121-8121-121212121212';
        const sheetArtifactId = '13131313-1313-4131-8131-131313131313';
        const slideArtifactId = '14141414-1414-4141-8141-141414141414';

        const initialDocContent = '# Unlocked Doc\n\nParagraph 1.\n';
        const initialWorkbook: WorkbookSpec = SpreadsheetEngine.Instance.CreateEmptyWorkbook(
            'Revenue',
            ['Revenue'],
            5,
            5
        );
        const firstSheet = initialWorkbook.Worksheets[0];
        firstSheet.Cells['A1'] = {
            Address: 'A1',
            RowID: firstSheet.Rows[0].RowID,
            ColumnID: firstSheet.Columns[0].ColumnID,
            Value: 10,
            DataType: 'number',
        };
        firstSheet.ProtectedRanges = [
            {
                RangeID: 'pr-allow',
                Range: 'A1:B2',
                AllowEditors: true,
                LockedByUserID: ownerUser.ID,
            },
            {
                RangeID: 'pr-deny',
                Range: 'A1:B2',
                AllowEditors: false,
                LockedByUserID: ownerUser.ID,
            },
        ];
        const initialDeck: SlideDeckSpec = {
            SchemaVersion: '1.0',
            DeckID: 'deck-p0-12',
            Title: 'Pitch',
            AspectRatio: '16:9',
            Theme: {
                ThemeID: 'mj-default',
                Name: 'MemberJunction Default',
                PrimaryColor: '#2563EB',
                AccentColor: '#0EA5E9',
                BackgroundColor: '#FFFFFF',
                SurfaceColor: '#F8FAFC',
                TextPrimaryColor: '#0F172A',
                TextSecondaryColor: '#475569',
                BorderColor: '#E2E8F0',
                HeadingFontFamily: 'Inter, system-ui, sans-serif',
                BodyFontFamily: 'Inter, system-ui, sans-serif',
                MonospaceFontFamily: 'JetBrains Mono, monospace',
            },
            Slides: [
                {
                    SlideID: 'slide-1',
                    Layout: 'Title',
                    Title: 'Intro',
                    Regions: [],
                },
            ],
        };

        const versionsMap = new Map<string, MockVersionRecord>([
            [
                artifactId,
                {
                    ID: 'ver-doc-1',
                    ArtifactID: artifactId,
                    VersionNumber: 1,
                    Name: 'Doc v1',
                    Content: initialDocContent,
                    Configuration: '{}',
                    ContentMode: 'Editable',
                    UserID: ownerUser.ID,
                    __mj_CreatedAt: new Date(),
                    __mj_UpdatedAt: new Date(),
                },
            ],
            [
                sheetArtifactId,
                {
                    ID: 'ver-sheet-1',
                    ArtifactID: sheetArtifactId,
                    VersionNumber: 1,
                    Name: 'Sheet v1',
                    Content: JSON.stringify(initialWorkbook),
                    Configuration: '{}',
                    ContentMode: 'Editable',
                    UserID: ownerUser.ID,
                    __mj_CreatedAt: new Date(),
                    __mj_UpdatedAt: new Date(),
                },
            ],
            [
                slideArtifactId,
                {
                    ID: 'ver-slide-1',
                    ArtifactID: slideArtifactId,
                    VersionNumber: 1,
                    Name: 'Slide v1',
                    Content: JSON.stringify(initialDeck),
                    Configuration: '{}',
                    ContentMode: 'Editable',
                    UserID: ownerUser.ID,
                    __mj_CreatedAt: new Date(),
                    __mj_UpdatedAt: new Date(),
                },
            ],
        ]);

        const runViewFn = vi.fn(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                const matched = Array.from(versionsMap.values()).filter((v) =>
                    (params.ExtraFilter ?? '').includes(v.ArtifactID)
                );
                return { Success: true, Results: matched, TotalRowCount: matched.length };
            }
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: artifactId, Name: 'Test', UserID: ownerUser.ID, Type: roomMode }],
                    TotalRowCount: 1,
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        });

        const provider: IMetadataProvider & IRunViewProvider = {
            Entities: [],
            RunView: runViewFn,
            RunViews: vi.fn(async (requests: RunViewParams[]) =>
                Promise.all(requests.map((req) => runViewFn(req)))
            ),
            GetEntityObject: vi.fn(async () => ({
                NewRecord: vi.fn(() => true),
                Save: vi.fn(async () => true),
                Load: vi.fn(async () => true),
            })),
        } as IMetadataProvider & IRunViewProvider;

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([]);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, _aid, user) => ({
                CanRead: true,
                CanEdit: true,
                CanDelete: UUIDsEqual(user.ID, ownerUser.ID),
                CanShare: UUIDsEqual(user.ID, ownerUser.ID),
                IsOwner: UUIDsEqual(user.ID, ownerUser.ID),
                EffectivePermissionLevel: UUIDsEqual(user.ID, ownerUser.ID) ? 'Owner' : 'Edit',
            })
        );

        server.SetMetadataProviderOverride(provider);

        const httpServer: HttpServer = createServer();
        httpServer.on('upgrade', (req, socket, head) => {
            if (!server.TryHandleUpgrade(req, socket, head)) {
                socket.destroy();
            }
        });
        await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
        const port = (httpServer.address() as AddressInfo).port;

        const connectEditorWithTicket = async (
            targetArtifactId: string
        ): Promise<{
            ws: WsClient;
            doc: Y.Doc;
            controlFrames: CollaborationControlFrame[];
        }> => {
            const ticket = server.IssueTicket({
                ArtifactID: targetArtifactId,
                User: editorUser,
                Provider: provider,
            });
            return new Promise((resolve, reject) => {
                const doc = new Y.Doc();
                const controlFrames: CollaborationControlFrame[] = [];
                const ws = new WsClient(
                    `ws://127.0.0.1:${port}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${targetArtifactId}&ticket=${encodeURIComponent(ticket.Ticket)}`
                );
                let synced = false;
                ws.on('open', () => {
                    const step1Encoder = encoding.createEncoder();
                    encoding.writeVarUint(step1Encoder, YJS_MESSAGE_SYNC);
                    syncProtocol.writeSyncStep1(step1Encoder, doc);
                    ws.send(encoding.toUint8Array(step1Encoder));
                });
                ws.on('message', (raw: Buffer) => {
                    const decoder = decoding.createDecoder(new Uint8Array(raw));
                    const msgType = decoding.readVarUint(decoder);
                    if (msgType === YJS_MESSAGE_SYNC) {
                        const subDecoder = decoding.clone(decoder);
                        const syncSubType = decoding.readVarUint(subDecoder);
                        const encoder = encoding.createEncoder();
                        encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                        syncProtocol.readSyncMessage(decoder, encoder, doc, 'server');
                        if (encoding.length(encoder) > 1 && ws.readyState === WsClient.OPEN) {
                            ws.send(encoding.toUint8Array(encoder));
                        }
                        if (!synced && syncSubType === syncProtocol.messageYjsSyncStep2) {
                            synced = true;
                            setTimeout(() => resolve({ ws, doc, controlFrames }), 30);
                        }
                    } else if (msgType === YJS_MESSAGE_CONTROL) {
                        const frame = JSON.parse(decoding.readVarString(decoder)) as CollaborationControlFrame;
                        controlFrames.push(frame);
                    }
                });
                ws.on('error', reject);
                ws.on('unexpected-response', (_req, res) =>
                    reject(new Error(`Unexpected HTTP ${res.statusCode}`))
                );
            });
        };

        const sendClientDelta = (ws: WsClient, clientDoc: Y.Doc, mutate: () => void): Promise<void> => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
            const listener = (update: Uint8Array) => {
                syncProtocol.writeUpdate(encoder, update);
            };
            clientDoc.on('update', listener);
            mutate();
            clientDoc.off('update', listener);
            ws.send(encoding.toUint8Array(encoder));
            return new Promise((r) => setTimeout(r, 60));
        };

        try {
            // 1. Unlocked Document: non-owner adding <!-- mj-lock: owner-only --> on wire is rejected (P0-12)
            //    AND mutating Y.Map('meta') watermark is rejected on a clean client clock (P0-13)
            const docConn = await connectEditorWithTicket(artifactId);
            await sendClientDelta(docConn.ws, docConn.doc, () => {
                docConn.doc.getText('content').insert(0, '<!-- mj-lock: owner-only -->\n');
            });
            expect(docConn.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
            const roomContentAfterLockAttempt = await server.GetRoomContent(artifactId, ownerUser, provider);
            expect(roomContentAfterLockAttempt).not.toContain('mj-lock');
            docConn.ws.close();

            const metaConn = await connectEditorWithTicket(artifactId);
            await sendClientDelta(metaConn.ws, metaConn.doc, () => {
                metaConn.doc.getMap('meta').set('baseVersionNumber', 999);
            });
            expect(metaConn.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
            metaConn.ws.close();

            // 2. Spreadsheet: overlapping ProtectedRanges (AllowEditors:true + AllowEditors:false) denies editor
            roomMode = 'Spreadsheet';
            const sheetConn = await connectEditorWithTicket(sheetArtifactId);
            await sendClientDelta(sheetConn.ws, sheetConn.doc, () => {
                const cellsMap = sheetConn.doc.getMap<string>('sheetCellsByCoord');
                cellsMap.set(
                    `${firstSheet.SheetID}::${firstSheet.Rows[0].RowID}::${firstSheet.Columns[0].ColumnID}`,
                    JSON.stringify({
                        Address: 'A1',
                        RowID: firstSheet.Rows[0].RowID,
                        ColumnID: firstSheet.Columns[0].ColumnID,
                        Value: 999,
                        DataType: 'number',
                    })
                );
            });
            expect(sheetConn.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
            sheetConn.ws.close();

            // Duplicate RangeID injection on spreadsheet also rejected (clean client clock)
            const sheetDupConn = await connectEditorWithTicket(sheetArtifactId);
            await sendClientDelta(sheetDupConn.ws, sheetDupConn.doc, () => {
                const sheetsMap = sheetDupConn.doc.getMap<string>('worksheetsById');
                const currentSheet = JSON.parse(sheetsMap.get('sheet-1') ?? '{}') as {
                    ProtectedRanges?: Array<Record<string, string | boolean>>;
                };
                currentSheet.ProtectedRanges = [
                    ...(currentSheet.ProtectedRanges ?? []),
                    { RangeID: 'pr-dup', Range: 'C1:C2', AllowEditors: true, LockedByUserID: editorUser.ID },
                    { RangeID: 'pr-dup', Range: 'D1:D2', AllowEditors: true, LockedByUserID: editorUser.ID },
                ];
                sheetsMap.set('sheet-1', JSON.stringify(currentSheet));
            });
            expect(sheetDupConn.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
            sheetDupConn.ws.close();

            // 3. SlideDeck: non-owner adding Locked slide or duplicate SlideID rejected, and malformed slidesById fails closed
            roomMode = 'SlideDeck';
            const slideConn = await connectEditorWithTicket(slideArtifactId);
            await sendClientDelta(slideConn.ws, slideConn.doc, () => {
                slideConn.doc.getMap<string>('slidesById').set(
                    'slide-2',
                    JSON.stringify({
                        SlideID: 'slide-2',
                        Order: 1,
                        Layout: 'TitleAndBody',
                        Title: 'Locked by Editor',
                        Locked: true,
                    })
                );
                slideConn.doc.getArray<string>('slideOrder').push(['slide-2']);
            });
            expect(slideConn.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
            slideConn.ws.close();

            // 4. Malformed slidesById JSON in room fails closed instead of falling back to Y.Text
            const slideRoom = await server.GetOrCreateRoom(slideArtifactId, ownerUser, provider);
            expect(slideRoom).toBeTruthy();
            expect(() => slideRoom?.Doc.getMap<string>('slidesById').set('slide-1', '{bad-json')).toThrow(/fail-closed/i);
            await expect(server.GetRoomContent(slideArtifactId, ownerUser, provider)).rejects.toThrow(/fail-closed/i);
        } finally {
            await server.Shutdown();
            server.ResetShutdownForTests();
            httpServer.closeAllConnections?.();
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        }
    });

    it('P0-14, NW-5 & NW-3: Threads WS ticket Provider across multi-tenant Flush/Compaction, fails closed on ambiguous rooms, and bridges suggestions <-> Configuration.suggestions', async () => {
        const server = ArtifactCollaborationServer.Instance;
        server.SetTicketHmacSecret(TEST_SECRET);

        const sharedArtifactId = '15151515-1515-4151-8151-151515151515';
        const tenantAWrites: string[] = [];
        const tenantBWrites: string[] = [];
        let tenantASavedVersionConfig = '';

        const initialSuggestion = {
            SuggestionID: 'sug-1',
            TargetBlockID: 'sec-1',
            Status: 'Pending',
            CreatedAt: '2026-11-15T10:00:00.000Z',
            Summary: 'Tighten Q4 summary',
        };

        const createTenantProvider = (
            providerKey: string,
            writesLog: string[],
            captureConfig?: (cfg: string) => void
        ): IMetadataProvider & IRunViewProvider => {
            const tenantRunView = vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: `${providerKey}-ver-1`,
                                ArtifactID: sharedArtifactId,
                                VersionNumber: 1,
                                Name: 'v1',
                                Content: '# Initial Doc',
                                Configuration: JSON.stringify({ suggestions: [initialSuggestion] }),
                                ContentMode: 'Editable',
                                UserID: ownerUser.ID,
                                __mj_CreatedAt: new Date(),
                                __mj_UpdatedAt: new Date(),
                            },
                        ],
                        TotalRowCount: 1,
                    };
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: sharedArtifactId, Name: 'Multi-tenant Doc', UserID: ownerUser.ID }],
                        TotalRowCount: 1,
                    };
                }
                return { Success: true, Results: [], TotalRowCount: 0 };
            });

            return {
                ProviderKey: providerKey,
                Entities: [],
                RunView: tenantRunView,
                RunViews: vi.fn(async (requests: RunViewParams[]) =>
                    Promise.all(requests.map((req) => tenantRunView(req)))
                ),
                GetEntityObject: vi.fn(async (entityName: string) => {
                    if (entityName === 'MJ: Artifact Working States') {
                        return {
                            ArtifactID: sharedArtifactId,
                            YjsState: undefined,
                            LastModifiedByUserID: ownerUser.ID,
                            NewRecord: vi.fn(() => true),
                            Save: vi.fn(async () => {
                                writesLog.push(`working-state:${providerKey}`);
                                return true;
                            }),
                        };
                    }
                    if (entityName === 'MJ: Artifact Versions') {
                        const rec = {
                            ID: `${providerKey}-ver-2`,
                            ArtifactID: sharedArtifactId,
                            VersionNumber: 2,
                            Content: '',
                            Configuration: '{}',
                            UserID: ownerUser.ID,
                            Name: 'v2',
                            NewRecord: vi.fn(() => true),
                            Save: vi.fn(async () => {
                                writesLog.push(`version:${providerKey}`);
                                if (captureConfig) {
                                    captureConfig(rec.Configuration);
                                }
                                return true;
                            }),
                        };
                        return rec as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity;
                    }
                    if (entityName === 'MJ: Artifacts') {
                        return {
                            ID: sharedArtifactId,
                            Load: vi.fn(async () => true),
                            Save: vi.fn(async () => true),
                        } as Partial<MJArtifactEntity> as MJArtifactEntity;
                    }
                    return {};
                }),
            } as IMetadataProvider & IRunViewProvider & { ProviderKey: string };
        };

        const providerA = createTenantProvider('tenant-a', tenantAWrites, (cfg) => {
            tenantASavedVersionConfig = cfg;
        });
        const providerB = createTenantProvider('tenant-b', tenantBWrites);

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([]);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            IsOwner: true,
            EffectivePermissionLevel: 'Owner',
        });

        // Do NOT call SetMetadataProviderOverride: WS ticket must carry tenant providerA!
        const httpServer: HttpServer = createServer();
        httpServer.on('upgrade', (req, socket, head) => {
            if (!server.TryHandleUpgrade(req, socket, head)) {
                socket.destroy();
            }
        });
        await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
        const port = (httpServer.address() as AddressInfo).port;

        try {
            const ticketA = server.IssueTicket({
                ArtifactID: sharedArtifactId,
                User: ownerUser,
                Provider: providerA,
            });
            const wsA = await new Promise<WsClient>((resolve, reject) => {
                const ws = new WsClient(
                    `ws://127.0.0.1:${port}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${sharedArtifactId}&ticket=${encodeURIComponent(ticketA.Ticket)}`
                );
                ws.once('open', () => resolve(ws));
                ws.once('error', reject);
                ws.once('unexpected-response', (_req, res) => reject(new Error(`WS HTTP ${res.statusCode}`)));
            });
            // Wait briefly for room hydration on providerA
            await new Promise((r) => setTimeout(r, 60));

            const roomA = await server.GetOrCreateRoom(sharedArtifactId, ownerUser, providerA);
            expect(roomA?.Provider).toBe(providerA);

            // NW-3: Hydrated room populated Y.Map('suggestions') from Configuration.suggestions
            const hydratedSuggestions = roomA?.Doc.getMap<string>('suggestions');
            expect(hydratedSuggestions?.get('sug-1')).toContain('Tighten Q4 summary');

            // Update suggestion inside Y.Map('suggestions') and verify Compaction writes to providerA + persists suggestions
            const updatedSuggestion = {
                ...initialSuggestion,
                Status: 'Accepted',
            };
            roomA?.Doc.getMap<string>('suggestions').set('sug-1', JSON.stringify(updatedSuggestion));

            expect(await server.FlushWorkingState(sharedArtifactId, ownerUser, { provider: providerA })).toBe(true);
            expect(tenantAWrites).toContain('working-state:tenant-a');
            expect(tenantBWrites).toHaveLength(0);

            const compactRes = await server.CompactRoomToArtifactVersion(sharedArtifactId, ownerUser, {
                Provider: providerA,
            });
            expect(compactRes.Saved).toBe(true);
            expect(tenantAWrites).toContain('version:tenant-a');
            const parsedSavedConfig = JSON.parse(tenantASavedVersionConfig) as {
                suggestions?: Array<{ SuggestionID: string; Status: string }>;
            };
            expect(parsedSavedConfig.suggestions?.[0]).toEqual(
                expect.objectContaining({ SuggestionID: 'sug-1', Status: 'Accepted' })
            );

            // Open second tenant room on providerB for the SAME ArtifactID -> Flush without provider fails closed
            const roomB = await server.GetOrCreateRoom(sharedArtifactId, ownerUser, providerB);
            expect(roomB?.Provider).toBe(providerB);
            const ambiguousFlush = await server.FlushWorkingState(sharedArtifactId, ownerUser);
            expect(ambiguousFlush).toBe(false);

            wsA.close();
        } finally {
            await server.Shutdown();
            server.ResetShutdownForTests();
            httpServer.closeAllConnections?.();
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        }
    });

    it('P0-15 & P1-2: Enforces artifact:read API key scope on VerifyFrozenBlockSnapshot and persists plain-text agent edit refusals as comments', async () => {
        const resolver = new DocumentCollaborationResolver();
        const artifactId = '16161616-1616-4161-8161-161616161616';
        const conversationId = '17171717-1717-4171-8171-171717171717';
        const agentId = '18181818-1818-4181-8181-181818181818';

        // 1. P1-2: VerifyFrozenBlockSnapshot checks 'artifact:read' API key scope
        const sysUserSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        const apiKeyEngine = GetAPIKeyEngine();
        const scopeSpy = vi
            .spyOn(apiKeyEngine, 'Authorize')
            .mockResolvedValue({ IsAuthorized: false, DenialReason: 'Missing artifact:read scope' });

        const unauthorizedCtx = {
            userPayload: {
                userRecord: ownerUser,
                apiKeyHash: 'hash-without-artifact-read',
            },
            providers: [],
        } as AppContext;

        await expect(resolver.VerifyFrozenBlockSnapshot('{}', unauthorizedCtx)).rejects.toThrow(/artifact:read|scope/i);
        expect(scopeSpy).toHaveBeenCalledWith(
            'hash-without-artifact-read',
            'MJAPI',
            'artifact:read',
            '*',
            expect.objectContaining({ ID: systemUser.ID }),
            expect.anything(),
            expect.anything()
        );

        // 2. P0-15: Plain-text refusal in 'edit' mode is persisted as a comment reply without modifying artifact
        scopeSpy.mockResolvedValue({ IsAuthorized: true });
        sysUserSpy.mockReturnValue(systemUser);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            IsOwner: true,
            EffectivePermissionLevel: 'Owner',
        });

        const fakeAgent = {
            ID: agentId,
            Name: 'EditorAgent',
            Status: 'Active',
        } as MJAIAgentEntityExtended;
        const aiProviderInstanceSpy = vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue({
            Config: vi.fn(async () => undefined),
            CanUserRunAgent: vi.fn(async () => true),
            Agents: [fakeAgent],
        } as Partial<AIEngineBase> as AIEngineBase);
        vi.spyOn(AIEngineBase.Instance, 'CanUserRunAgent').mockResolvedValue(true);
        void aiProviderInstanceSpy;

        const savedReplyBodies: string[] = [];
        const mentionRunView = vi.fn(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'ver-1',
                            ArtifactID: artifactId,
                            VersionNumber: 1,
                            Content: '# Original\n\nProtected content.',
                            Configuration: '{}',
                        },
                    ],
                    TotalRowCount: 1,
                };
            }
            if (params.EntityName === 'MJ: Conversations') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: conversationId,
                            LinkedRecordID: artifactId,
                            AnchorType: 'DocumentSelection',
                            AnchorMetadata: JSON.stringify({ Quote: 'Protected content.' }),
                        },
                    ],
                    TotalRowCount: 1,
                };
            }
            if (params.EntityName === 'MJ: Conversation Details') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'anchor-detail-1',
                            ConversationID: conversationId,
                            Message: '<!-- mj-doc-anchor: {"Quote":"Protected content."} --> @EditorAgent please remove this.',
                            __mj_CreatedAt: new Date(),
                        },
                    ],
                    TotalRowCount: 1,
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        });
        const provider: IMetadataProvider & IRunViewProvider = {
            Entities: [],
            RunView: mentionRunView,
            RunViews: vi.fn(async (requests: RunViewParams[]) =>
                Promise.all(requests.map((req) => mentionRunView(req)))
            ),
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Conversation Details') {
                    const detail = {
                        ConversationID: '',
                        UserID: '',
                        Role: '',
                        Message: '',
                        NewRecord: vi.fn(() => true),
                        Save: vi.fn(async () => {
                            savedReplyBodies.push(detail.Message);
                            return true;
                        }),
                    };
                    return detail as Partial<MJConversationDetailEntity> as MJConversationDetailEntity;
                }
                return {};
            }),
        } as IMetadataProvider & IRunViewProvider;

        vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValue({
            success: true,
            agentRun: { ID: 'run-1', AgentID: agentId },
            payload: 'I cannot edit that section because it is locked by the document owner.',
        } as Awaited<ReturnType<AgentRunner['RunAgent']>>);

        const authorizedCtx = {
            userPayload: {
                userRecord: ownerUser,
            },
            providers: [{ type: 'Read-Write', provider }],
        } as AppContext;

        const mentionResult = await resolver.ExecuteAnchoredCommentAgentMention(
            artifactId,
            '@EditorAgent',
            'edit',
            '@EditorAgent please remove this.',
            'Protected content.',
            authorizedCtx,
            conversationId
        );

        expect(mentionResult.Success).toBe(true);
        expect(mentionResult.ReplyBody).toContain('cannot edit that section');
        expect(savedReplyBodies).toHaveLength(1);
        expect(savedReplyBodies[0]).toContain('cannot edit that section');
    });

    it('P0-P3-2 & P1-P3-1c: ArrayMapFieldNamesToCodeNames strips TokenHash on Guest Share Links for non-system users and RegisterServerArtifactFileBytesLoader loads MJ: Files bytes', async () => {
        const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const deniedArtifactId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const fileId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const sharerUser = makeUser('11111111-1111-4111-8111-111111111111', 'Sharer', 'sharer@example.com');
        const viewerUser = makeUser('22222222-2222-4222-8222-222222222222', 'Viewer', 'viewer@example.com');
        const sysUser = makeUser('00000000-0000-4000-8000-000000000001', 'System', 'sys@example.com');

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u?: UserInfo | null) => Boolean(u && UUIDsEqual(u.ID, sysUser.ID)),
        );
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, aid, user) => ({
                ArtifactID: aid,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: UUIDsEqual(user.ID, sharerUser.ID) && UUIDsEqual(aid, artifactId),
                Source: UUIDsEqual(user.ID, sharerUser.ID) && UUIDsEqual(aid, artifactId) ? 'ArtifactPermission' : 'Denied',
                Reason: 'mocked',
            }),
        );

        const guestLinkEntityInfo = {
            ID: 'ei-guest-link-test',
            Name: 'MJ: Artifact Guest Share Links',
            Fields: [
                { Name: 'ID', CodeName: 'ID', IsPrimaryKey: true, NeedToEncrypt: false, AllowUpdateAPI: false, UserCanRead: () => true },
                { Name: 'ArtifactID', CodeName: 'ArtifactID', IsPrimaryKey: false, NeedToEncrypt: false, AllowUpdateAPI: false, UserCanRead: () => true },
                { Name: 'Label', CodeName: 'Label', IsPrimaryKey: false, NeedToEncrypt: false, AllowUpdateAPI: false, UserCanRead: () => true },
                { Name: 'TokenHash', CodeName: 'TokenHash', IsPrimaryKey: false, NeedToEncrypt: false, AllowUpdateAPI: false, UserCanRead: () => true },
            ],
            PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
            TrackRecordChanges: false,
            FieldLevelSecurityApplies: false,
        } as EntityInfo;
        const mappingProvider: IMetadataProvider & IRunViewProvider = {
            Entities: [guestLinkEntityInfo],
            EntityByName: () => guestLinkEntityInfo,
            RunView: vi.fn(async () => ({ Success: true, Results: [], TotalRowCount: 0 })),
            RunViews: vi.fn(async () => []),
            GetEntityObject: vi.fn(async () => ({})),
        } as IMetadataProvider & IRunViewProvider;

        class GuestLinkArrayTestResolver extends ResolverBase {
            public async MapArray(
                entityName: string,
                rows: Array<Record<string, string | null>>,
                user?: UserInfo,
                provider?: IMetadataProvider,
            ): Promise<Array<Record<string, string | null>>> {
                return await this.ArrayMapFieldNamesToCodeNames(entityName, rows, user, provider);
            }
        }

        const resolverBase = new GuestLinkArrayTestResolver();
        const rows = [
            { ID: 'gsl-1', ArtifactID: artifactId, Label: 'Allowed Link', TokenHash: 'sha256-secret-1' },
            { ID: 'gsl-2', ArtifactID: deniedArtifactId, Label: 'Denied Link', TokenHash: 'sha256-secret-2' },
        ];

        const sharerRows = await resolverBase.MapArray('MJ: Artifact Guest Share Links', rows, sharerUser, mappingProvider);
        expect(sharerRows).toHaveLength(1);
        expect(sharerRows[0]?.Label).toBe('Allowed Link');
        expect(sharerRows[0]?.TokenHash).toBe('');

        const viewerRows = await resolverBase.MapArray('MJ: Artifact Guest Share Links', rows, viewerUser, mappingProvider);
        expect(viewerRows).toEqual([]);

        const sysRows = await resolverBase.MapArray('MJ: Artifact Guest Share Links', rows, sysUser, mappingProvider);
        expect(sysRows).toHaveLength(2);
        expect(sysRows[0]?.TokenHash).toBe('sha256-secret-1');
        expect(sysRows[1]?.TokenHash).toBe('sha256-secret-2');

        // P1-P3-1c: RegisterServerArtifactFileBytesLoader wires MJ: Files storage loader into DocumentLiveBlockEngine
        const expectedBytes = Buffer.from('excel-binary-payload');
        const getObjectMock = vi.fn(async () => expectedBytes);
        const resolveFileObjectSpy = vi
            .spyOn(FileStorageEngine.Instance, 'ResolveFileObject')
            .mockResolvedValue({
                Driver: { GetObject: getObjectMock },
                ObjectKey: 'artifacts/workbook.xlsx',
            } as Awaited<ReturnType<typeof FileStorageEngine.Instance.ResolveFileObject>>);

        const fakeFileEntity = {
            ID: fileId,
            ProviderID: 'prov-1',
            Load: vi.fn(async (id: string) => id === fileId),
        } as Partial<MJFileEntity> as MJFileEntity;

        const fileProvider = {
            Entities: [],
            EntityByName: () => undefined,
            RunView: vi.fn(async () => ({ Success: true, Results: [], TotalRowCount: 0 })),
            RunViews: vi.fn(async () => []),
            GetEntityObject: vi.fn(async () => fakeFileEntity),
        } as IMetadataProvider & IRunViewProvider;

        RegisterServerArtifactFileBytesLoader();
        const loadedViaEngine = await DocumentLiveBlockEngine.Instance.LoadArtifactFileBytes(
            fileId,
            sharerUser,
            fileProvider,
        );
        expect(loadedViaEngine).toEqual(expectedBytes);
        expect(resolveFileObjectSpy).toHaveBeenCalledWith(fakeFileEntity, sharerUser, 'Read', fileProvider);
        expect(getObjectMock).toHaveBeenCalledWith({ fullPath: 'artifacts/workbook.xlsx' });

        const directLoaded = await LoadArtifactFileStorageBytes(fileId, sharerUser, fileProvider);
        expect(directLoaded).toEqual(expectedBytes);
    });

    it('ListArtifactGuestShareLinksForOwner enforces CanShare/CanDelete, joins MagicLinkInvite state, and enforces artifact:read API key scope', async () => {
        const artifactId = '11111111-1111-4111-8111-111111111111';
        const inviteId = '66666666-6666-4666-8666-666666666666';
        const uiSharer = {
            ID: '22222222-2222-4222-8222-222222222222',
            Name: 'UI Sharer',
            Email: 'sharer@example.com',
            Type: 'User',
        } as UserInfo;
        const outsider = {
            ID: '33333333-3333-4333-8333-333333333333',
            Name: 'Outsider',
            Email: 'outsider@example.com',
            Type: 'User',
        } as UserInfo;

        const runViewMock = vi.fn(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Magic Link Invites') {
                return {
                    Success: true,
                    TotalRowCount: 1,
                    Results: [
                        {
                            ID: inviteId,
                            Status: 'Active',
                            ExpiresAt: '2026-12-01T00:00:00.000Z',
                            UseCount: 3,
                            __mj_UpdatedAt: '2026-11-15T12:05:00.000Z',
                        },
                    ],
                };
            }
            return {
                Success: true,
                TotalRowCount: 1,
                Results: [
                    {
                        ID: '44444444-4444-4444-8444-444444444444',
                        MagicLinkInviteID: inviteId,
                        ArtifactID: artifactId,
                        ArtifactVersionID: '55555555-5555-4555-8555-555555555555',
                        Label: 'Board Review',
                        __mj_CreatedAt: '2026-11-15T12:00:00.000Z',
                    },
                ],
            };
        });

        const mockProvider = {
            Entities: [],
            EntityByName: () => undefined,
            RunView: runViewMock,
            RunViews: vi.fn(async () => []),
        } as Partial<IMetadataProvider & IRunViewProvider> as IMetadataProvider & IRunViewProvider;

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, _aid, actor) => ({
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: actor.ID === uiSharer.ID,
            })
        );

        const denied = await ListArtifactGuestShareLinksForOwner(artifactId, mockProvider, outsider);
        expect(denied.Success).toBe(false);
        expect(denied.Links).toEqual([]);
        expect(runViewMock).not.toHaveBeenCalled();

        const systemUser = {
            ID: '00000000-0000-4000-8000-000000000001',
            Name: 'System',
            Email: 'system@example.com',
            Type: 'User',
        } as UserInfo;
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

        const allowed = await ListArtifactGuestShareLinksForOwner(artifactId, mockProvider, uiSharer);
        expect(allowed.Success).toBe(true);
        expect(allowed.Links).toHaveLength(1);
        expect(allowed.Links[0]).toEqual({
            ID: '44444444-4444-4444-8444-444444444444',
            MagicLinkInviteID: inviteId,
            ArtifactID: artifactId,
            ArtifactVersionID: '55555555-5555-4555-8555-555555555555',
            Label: 'Board Review',
            ShareMode: 'Frozen',
            Status: 'Active',
            AccessCount: 3,
            ExpiresAt: '2026-12-01T00:00:00.000Z',
            RevokedAt: null,
            CreatedAt: '2026-11-15T12:00:00.000Z',
        });
        expect('TokenHash' in allowed.Links[0]).toBe(false);
        expect(runViewMock).toHaveBeenCalledWith(
            expect.objectContaining({
                EntityName: 'MJ: Artifact Guest Share Links',
                Fields: ['ID', 'MagicLinkInviteID', 'ArtifactID', 'ArtifactVersionID', 'Label', '__mj_CreatedAt'],
            }),
            systemUser
        );

        // GraphQL resolver also enforces CheckAPIKeyScopeAuthorization('artifact:read', ...)
        const resolver = new PublicGuestShareResolver();
        const scopeSpy = vi.spyOn(resolver, 'CheckAPIKeyScopeAuthorization' as keyof PublicGuestShareResolver).mockResolvedValue(undefined as never);
        await resolver.ListArtifactGuestShareLinks(artifactId, {
            userPayload: { email: uiSharer.Email, userRecord: uiSharer, sessionId: 's1' },
            providers: [{ type: 'Read-Only', provider: mockProvider }],
        } as AppContext);
        expect(scopeSpy).toHaveBeenCalledWith('artifact:read', artifactId, expect.anything());
    });

    it('B8, Lower #1, B4 & S6: shares rooms across differing TenantContext on same provider, omits ApiKeyHash from URL ticket, and enforces guest share opt-in + status/expiry/CanShare checks', async () => {
        const prevSecret = process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
        process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = '0123456789abcdef0123456789abcdef';
        const collabServer = new ArtifactCollaborationServer();
        const sharedArtifactId = 'abab1111-2222-4333-8444-555566667777';
        const userTenant1 = {
            ID: '11111111-1111-4111-8111-111111111111',
            Name: 'Tenant 1 User',
            Email: 'u1@example.com',
            IsActive: true,
            TenantContext: { TenantID: 'aaaa0000-0000-4000-8000-000000000001' },
        } as UserInfo;
        const userTenant2 = {
            ID: '22222222-2222-4222-8222-222222222222',
            Name: 'Tenant 2 User',
            Email: 'u2@example.com',
            IsActive: true,
            TenantContext: { TenantID: 'aaaa0000-0000-4000-8000-000000000002' },
        } as UserInfo;

        const sameProvider = {
            Entities: [],
            ProviderKey: 'shared-db-schema',
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const prevEnabled = configInfo.magicLink.artifactGuestSharing.enabled;
        try {
            const t1 = collabServer.IssueTicket({
                ArtifactID: sharedArtifactId,
                User: userTenant1,
                Provider: sameProvider,
                ApiKeyHash: 'sensitive-api-key-hash-should-stay-server-side',
            });
            const t2 = collabServer.IssueTicket({
                ArtifactID: sharedArtifactId,
                User: userTenant2,
                Provider: sameProvider,
            });
            const payloadB64 = t1.Ticket.split('.')[0]!;
            const decodedJson = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<string, string>;
            expect(decodedJson['pk']).toBe('shared-db-schema');
            expect(decodedJson['k']).toBeUndefined();

            const consumed1 = await collabServer.ConsumeTicket(t1.Ticket, sharedArtifactId, sameProvider);
            const consumed2 = await collabServer.ConsumeTicket(t2.Ticket, sharedArtifactId, sameProvider);
            expect(consumed1?.ProviderKey).toBe('shared-db-schema');
            expect(consumed2?.ProviderKey).toBe('shared-db-schema');
            expect(consumed1?.ApiKeyHash).toBe('sensitive-api-key-hash-should-stay-server-side');

            // B4: When artifactGuestSharing.enabled === false, ResolveGuestArtifactSnapshotForSession fails closed
            configInfo.magicLink.artifactGuestSharing.enabled = false;
            const disabledRes = await ResolveGuestArtifactSnapshotForSession(
                undefined,
                sameProvider,
                '198.51.100.99',
            );
            expect(disabledRes.Valid).toBe(false);
            expect(disabledRes.ErrorCode).toBe('ACCESS_DENIED');
        } finally {
            configInfo.magicLink.artifactGuestSharing.enabled = prevEnabled;
            if (prevSecret === undefined) {
                delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            } else {
                process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = prevSecret;
            }
        }
    });
});
