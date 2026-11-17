import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
    BaseRemotableOperation,
    DispatchRemoteOperationInProcess,
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
    ARTIFACT_EVALUATE_AI_FORMULA_KEY,
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
import { Base64ToBytes, BytesToBase64, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    LoadArtifactFileStorageBytes,
    RegisterServerArtifactFileBytesLoader,
} from '../resolvers/ArtifactFileResolver.js';
import {
    ArtifactEvaluateAiFormulaServerOperation,
} from '../operations/ArtifactEvaluateAiFormulaServerOperation.js';
import {
    ArtifactComplianceAuditServerOperation,
} from '../operations/ArtifactComplianceAuditHelper.js';
import {
    CreateGuestShareLinkServerOperation,
    ListArtifactGuestShareLinksForOwner,
    RevokeGuestShareLinkServerOperation,
} from '../operations/ArtifactGuestShareServerOperations.js';
import {
    SynthesizeArtifactFromSourcesServerOperation,
} from '../operations/SynthesizeArtifactFromSourcesServerOperation.js';
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
    type CollaborationClientConnection,
    type CollaborationControlFrame,
    type CollaborationRoom,
    YJS_MESSAGE_CONTROL,
    YJS_MESSAGE_SYNC,
} from '../collaboration/ArtifactCollaborationServer.js';
import { DocumentCollaborationResolver } from '../resolvers/DocumentCollaborationResolver.js';
import { InMemoryYjsRelayBus, InMemoryYjsRoomRelay, type YjsRelayMessage } from '../collaboration/YjsRoomRelay.js';
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

        await expect(resolver.VerifyFrozenBlockSnapshot('{}', '', unauthorizedCtx)).rejects.toThrow(/artifact:read|scope/i);
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

    it('N1, N2, N5, S2, S3, S6, S9b: enforces per-op Magic Link flags, cross-replica API key ticket fidelity, pendingStructs delta check, AI formula prompt-model allowlist + per-cell rate quota, S3 binding check, Consumed guest invite continuity, and S9b fast-path + room cap', async () => {
        // 1. N1: All 5 artifact remote operations opt into DisallowMagicLinkScope === true
        for (const Cls of [
            ArtifactComplianceAuditServerOperation,
            ArtifactEvaluateAiFormulaServerOperation,
            SynthesizeArtifactFromSourcesServerOperation,
            CreateGuestShareLinkServerOperation,
            RevokeGuestShareLinkServerOperation,
        ]) {
            const inst = new Cls();
            expect(inst.DisallowMagicLinkScope).toBe(true);
        }

        // 2. N2: Cross-replica ticket replay via RedisTicketReplayStore-compatible store preserves ApiKeyHash and fails closed when missing
        const prevSecret = process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
        process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = '0123456789abcdef0123456789abcdef';
        try {
            const nonceSet = new Set<string>();
            const metaMap = new Map<string, string>();
            const sharedStore = {
                ConsumeNonce: (n: string) => {
                    if (nonceSet.has(n)) return false;
                    nonceSet.add(n);
                    return true;
                },
                SetTicketData: (n: string, dataJson: string) => {
                    metaMap.set(n, dataJson);
                },
                GetAndDeleteTicketData: (n: string) => {
                    const v = metaMap.get(n) ?? null;
                    metaMap.delete(n);
                    return v;
                },
            };
            const nodeA = new ArtifactCollaborationServer();
            const nodeB = new ArtifactCollaborationServer();
            nodeA.SetTicketReplayStore(sharedStore);
            nodeB.SetTicketReplayStore(sharedStore);

            const ticketUser = {
                ID: '11111111-1111-4111-8111-111111111111',
                Name: 'API Key User',
                Email: 'apikey@example.com',
                IsActive: true,
            } as UserInfo;
            vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([ticketUser]);

            const sharedArtId = 'abab1111-2222-4333-8444-555566668888';
            const issued = nodeA.IssueTicket({
                ArtifactID: sharedArtId,
                User: ticketUser,
                ApiKeyHash: 'cross-replica-key-hash-abc',
            });
            // Simulate cross-replica consumption where Node B did not mint the ticket locally
            (nodeA as unknown as { _tickets: Map<string, object> })._tickets.clear();
            const nodeBConsumed = await nodeB.ConsumeTicket(issued.Ticket, sharedArtId);
            expect(nodeBConsumed).not.toBeNull();
            expect(nodeBConsumed?.ApiKeyHash).toBe('cross-replica-key-hash-abc');

            // If metadata store lacks SetTicketData/GetAndDeleteTicketData on cross-replica, fail closed!
            const legacyStore = { ConsumeNonce: () => true };
            const nodeC = new ArtifactCollaborationServer();
            nodeC.SetTicketReplayStore(legacyStore);
            const issuedNoMeta = nodeA.IssueTicket({
                ArtifactID: sharedArtId,
                User: ticketUser,
                ApiKeyHash: 'must-not-downgrade',
            });
            (nodeA as unknown as { _tickets: Map<string, object> })._tickets.clear();
            const downgradedRes = await nodeC.ConsumeTicket(issuedNoMeta.Ticket, sharedArtId);
            expect(downgradedRes).toBeNull();

            // 3. N5 + S9b: Unlocked room fast-path allows normal edits; room.Doc with pre-existing pendingStructs accepts normal updates while rejecting new out-of-order frames
            const collab = new ArtifactCollaborationServer();
            const roomDoc = new Y.Doc();
            roomDoc.getText('content').insert(0, 'Hello unlocked world');
            const fakeRoom = {
                ArtifactID: sharedArtId,
                RoomKey: sharedArtId,
                ProviderKey: 'default',
                Provider: {} as IMetadataProvider,
                HasActiveLocks: false,
                DelegateEntityID: null,
                DelegateRecordID: null,
                Doc: roomDoc,
                Awareness: { setLocalState: () => undefined } as never,
                Connections: new Set(),
                DirtyWorkingState: false,
                DirtyVersion: false,
                CompactionRetryCount: 0,
                LastModifiedByUser: ticketUser,
                BaseVersionID: null,
                BaseVersionNumber: 1,
                BaseVersionText: 'Hello unlocked world',
                BaseConfiguration: null,
                LastAppliedRestoreVersionID: null,
                LastAppliedRestoreVersionNumber: 0,
                LastReconciledOobVersionID: null,
                LastReconciledOobContent: null,
                LastReconciledOobMergeResult: null,
                RoomEpoch: 'e1',
                FlushQueue: Promise.resolve(true),
                CompactionQueue: Promise.resolve({ Saved: false }),
                WorkingStateTimer: null,
                IdleDisposeTimer: null,
                UnsubscribeRelay: null,
                DocUpdateListener: () => undefined,
                AwarenessUpdateListener: () => undefined,
                ProtectedAgentClientIDs: new Set<number>(),
                AgentPresenceEntries: new Map(),
                RelayedAgentPresenceTimers: new Map(),
            };
            const fakeConn = {
                User: ticketUser,
                CanEdit: true,
                IsOwner: false,
                ControlledClientIDs: new Set<number>(),
                Alive: true,
            };

            // Fast-path write on unlocked doc
            const peerDoc = new Y.Doc();
            Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(roomDoc));
            const svBefore = Y.encodeStateVector(peerDoc);
            peerDoc.getText('content').insert(0, 'Prefix ');
            const normalUpdate = Y.encodeStateAsUpdate(peerDoc, svBefore);
            const isBlockedFn = collab as unknown as {
                isIncomingUpdateBlockedByLocks: (r: typeof fakeRoom, c: typeof fakeConn, u: Uint8Array) => { Allowed: boolean; Reason?: string };
            };
            expect(isBlockedFn.isIncomingUpdateBlockedByLocks(fakeRoom, fakeConn, normalUpdate).Allowed).toBe(true);

            // Inject pre-existing pendingStructs into roomDoc (simulating out-of-order relay arrival)
            const missingClientDoc = new Y.Doc();
            missingClientDoc.getText('content').insert(0, 'A');
            const missingSv1 = Y.encodeStateVector(missingClientDoc);
            missingClientDoc.getText('content').insert(1, 'B');
            const gappedUpdate = Y.encodeStateAsUpdate(missingClientDoc, missingSv1);
            Y.applyUpdate(roomDoc, gappedUpdate);
            fakeRoom.HasActiveLocks = true; // Force full probeDoc verification path
            // Normal in-order frame from peerDoc MUST STILL SUCCEED despite roomDoc having pendingStructs!
            expect(isBlockedFn.isIncomingUpdateBlockedByLocks(fakeRoom, fakeConn, normalUpdate).Allowed).toBe(true);
            // A second gapped frame adding NEW pendingStructs MUST BE REJECTED!
            const anotherMissingDoc = new Y.Doc();
            anotherMissingDoc.getText('content').insert(0, 'X');
            const anotherSv1 = Y.encodeStateVector(anotherMissingDoc);
            anotherMissingDoc.getText('content').insert(1, 'Y');
            const secondGappedUpdate = Y.encodeStateAsUpdate(anotherMissingDoc, anotherSv1);
            const gappedRes = isBlockedFn.isIncomingUpdateBlockedByLocks(fakeRoom, fakeConn, secondGappedUpdate);
            expect(gappedRes.Allowed).toBe(false);
            expect(gappedRes.Reason).toMatch(/out-of-order/i);
        } finally {
            if (prevSecret === undefined) {
                delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            } else {
                process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = prevSecret;
            }
        }

        // 4. S2: ArtifactEvaluateAiFormulaServerOperation via real AIPromptRunner (no SetCompletionRunnerForTest):
        // rejects unlinked ModelOverride, allows linked PromptModels override, and enforces per-cell quota (>200 cells)
        ArtifactEvaluateAiFormulaServerOperation.ResetRateLimitForTest();
        ArtifactEvaluateAiFormulaServerOperation.SetCompletionRunnerForTest(null);
        const promptId = 'aaaa1111-1111-4111-8111-111111111111';
        const allowedModelId = 'bbbb1111-1111-4111-8111-111111111111';
        const unlinkedModelId = 'cccc1111-1111-4111-8111-111111111111';
        const s2ArtId = 'dddd1111-1111-4111-8111-111111111111';
        const s2User = { ID: 'eeee1111-1111-4111-8111-111111111111', Name: 'S2 Tester', Email: 's2@example.com', IsActive: true } as UserInfo;
        const mockS2Provider = {
            Entities: [],
            RouteOperation: async () => ({ Success: false }),
        } as unknown as IMetadataProvider;

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: s2ArtId,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Owner',
            Reason: 'Test',
        });
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([
            { ID: promptId, Name: 'Spreadsheet MJ.AI Formula Evaluator' } as never,
        ]);
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([
            { ID: allowedModelId, Name: 'Allowed-Mini', APIName: 'allowed-mini', IsActive: true, AIModelType: 'LLM' } as never,
            { ID: unlinkedModelId, Name: 'Expensive-Opus', APIName: 'expensive-opus', IsActive: true, AIModelType: 'LLM' } as never,
        ]);
        vi.spyOn(AIEngine.Instance, 'PromptModels', 'get').mockReturnValue([
            { ID: 'pm-1', PromptID: promptId, ModelID: allowedModelId, Status: 'Active' } as never,
        ]);
        const promptExecSpy = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue({
            success: true,
            rawResult: '42',
        } as never);

        // Unlinked ModelOverride fails per-cell error while linked PromptModels override succeeds
        const badOverrideOut = await DispatchRemoteOperationInProcess<
            { ArtifactID: string; ModelOverride?: string; Cells: Array<{ SheetID: string; Address: string; Prompt: string; ContextValuesJSON: string; InputHash: string }> },
            { Results: Array<{ Value: string; ErrorMessage?: string | null }> }
        >(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            {
                ArtifactID: s2ArtId,
                ModelOverride: 'Expensive-Opus',
                Cells: [{ SheetID: 's1', Address: 'A1', Prompt: 'Sum', ContextValuesJSON: '[1]', InputHash: 'h1' }],
            },
            {},
            mockS2Provider,
            s2User,
        );
        expect(badOverrideOut.ErrorMessage).toBeUndefined();
        expect(badOverrideOut.Success).toBe(true);
        expect(badOverrideOut.Output?.Results[0]?.ErrorMessage).toContain('not configured for prompt');
        expect(promptExecSpy).not.toHaveBeenCalled();

        const goodOverrideOut = await DispatchRemoteOperationInProcess<
            { ArtifactID: string; ModelOverride?: string; Cells: Array<{ SheetID: string; Address: string; Prompt: string; ContextValuesJSON: string; InputHash: string }> },
            { Results: Array<{ Value: string; ErrorMessage?: string | null }> }
        >(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            {
                ArtifactID: s2ArtId,
                ModelOverride: 'Allowed-Mini',
                Cells: [{ SheetID: 's1', Address: 'A1', Prompt: 'Sum', ContextValuesJSON: '[1]', InputHash: 'h2' }],
            },
            {},
            mockS2Provider,
            s2User,
        );
        expect(goodOverrideOut.ErrorMessage).toBeUndefined();
        expect(goodOverrideOut.Success).toBe(true);
        expect(goodOverrideOut.Output?.Results[0]?.Value).toBe('42');
        expect(promptExecSpy).toHaveBeenCalledTimes(1);

        // Per-cell quota blocks bursts >200 cells/min even with <30 requests!
        for (let b = 0; b < 3; b++) {
            const batch45 = Array.from({ length: 45 }, (_v, i) => ({
                SheetID: 's1',
                Address: `B${i + 1}`,
                Prompt: `Batch ${b}-${i}`,
                ContextValuesJSON: '[]',
                InputHash: `hb-${b}-${i}`,
            }));
            await DispatchRemoteOperationInProcess(
                ARTIFACT_EVALUATE_AI_FORMULA_KEY,
                { ArtifactID: s2ArtId, Cells: batch45 },
                {},
                mockS2Provider,
                s2User,
            );
        }
        const exceededBatch = Array.from({ length: 45 }, (_v, i) => ({
            SheetID: 's1',
            Address: `C${i + 1}`,
            Prompt: `Overflow ${i}`,
            ContextValuesJSON: '[]',
            InputHash: `ho-${i}`,
        }));
        const quotaOut = await DispatchRemoteOperationInProcess(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            { ArtifactID: s2ArtId, Cells: exceededBatch },
            {},
            mockS2Provider,
            s2User,
        );
        expect(quotaOut.Success).toBe(true);
        // After exceeding 200 cells (1 + 1 + 45*3 + 45 = 182; one more 25-cell batch pushes >200)
        const finalBatch = Array.from({ length: 25 }, (_v, i) => ({
            SheetID: 's1',
            Address: `D${i + 1}`,
            Prompt: `Overflow2 ${i}`,
            ContextValuesJSON: '[]',
            InputHash: `ho2-${i}`,
        }));
        const rateRes = await DispatchRemoteOperationInProcess(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            { ArtifactID: s2ArtId, Cells: finalBatch },
            {},
            mockS2Provider,
            s2User,
        );
        expect(rateRes.Success).toBe(false);
        expect(rateRes.ResultCode).toBe('RATE_LIMITED');

        // 5. S3: VerifyFrozenBlockSnapshot binds hostArtifactId cleanly
        const prevFrozenSecret = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = '0123456789abcdef0123456789abcdef';
        try {
            const docResolver = new DocumentCollaborationResolver();
            const hostArtA = '11112222-3333-4444-8555-666677778888';
            const hostArtB = '99992222-3333-4444-8555-666677778888';
            vi.spyOn(docResolver as unknown as { CheckAPIKeyScopeAuthorization: () => Promise<void> }, 'CheckAPIKeyScopeAuthorization').mockResolvedValue(undefined);
            vi.spyOn(docResolver as unknown as { resolveProvider: () => IMetadataProvider }, 'resolveProvider').mockReturnValue(mockS2Provider);
            vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
                ArtifactID: hostArtA,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'Owner',
                Reason: 'Test',
            });
            vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockResolvedValueOnce({
                BlockID: 'b-s3',
                Success: true,
                Columns: ['ID'],
                Rows: [{ ID: '1' }],
                RowCount: 1,
                RenderedMarkdown: '| ID |\n| --- |\n| 1 |',
                RefreshedAt: new Date().toISOString(),
            });
            const snapPayload = await DocumentLiveBlockEngine.Instance.FreezeBlock(
                {
                    BlockID: 'b-s3',
                    Kind: 'Query',
                    Mode: 'Live',
                    Title: 'Test',
                    QueryName: 'Q',
                },
                s2User,
                true,
                undefined,
                undefined,
                hostArtA,
            );
            expect(snapPayload.Success).toBe(true);
            const snapJson = JSON.stringify(snapPayload.UpdatedSpec);
            const verifyCtx = {
                userPayload: { email: s2User.Email, userRecord: s2User, sessionId: 's-s3' },
                providers: [{ type: 'Read-Write', provider: mockS2Provider }],
            } as AppContext;
            const okHostVerify = await docResolver.VerifyFrozenBlockSnapshot(snapJson, hostArtA, verifyCtx);
            expect(okHostVerify.Valid).toBe(true);
            const crossHostVerify = await docResolver.VerifyFrozenBlockSnapshot(snapJson, hostArtB, verifyCtx);
            expect(crossHostVerify.Valid).toBe(false);
            expect(crossHostVerify.ErrorMessage).toMatch(/different artifact|binding/i);
            const missingHostVerify = await docResolver.VerifyFrozenBlockSnapshot(snapJson, '', verifyCtx);
            expect(missingHostVerify.Valid).toBe(false);
            expect(missingHostVerify.SnapshotVerified).toBe(false);

            // Requested Test #6 (S-b): SourceTargetID kind (Artifact) binds both source target and hostArtifactId
            const sourceArtifactId = '77772222-3333-4444-8555-666677778888';
            const sourceSpecBase = {
                BlockID: 'blk-src-art',
                Kind: 'Artifact' as const,
                Mode: 'Frozen' as const,
                Title: 'Embedded Artifact',
                ArtifactID: sourceArtifactId,
            };
            const sourceBinding = BuildBlockIdentityBinding(sourceSpecBase, hostArtA);
            const sourceSnap: FrozenBlockSnapshot = {
                FrozenAt: '2026-11-16T00:00:00.000Z',
                FrozenByUserID: s2User.ID,
                FrozenByUserName: 'Reviewer',
                Columns: [],
                Rows: [],
                TotalRowCount: 0,
                ArtifactContentSnapshot: '{"markdown":"source"}',
                ArtifactTypeSnapshot: 'Markdown Document',
                SecurityWarningAcknowledged: true,
                Binding: sourceBinding,
            };
            const sourceSpec = {
                ...sourceSpecBase,
                FrozenSnapshot: sourceSnap,
            };
            sourceSnap.SnapshotContentHash = ComputeFrozenSnapshotHash(
                sourceSnap,
                undefined,
                sourceBinding,
            );
            const signedSourceJson = JSON.stringify(sourceSpec);
            const okSourceVerify = await docResolver.VerifyFrozenBlockSnapshot(signedSourceJson, hostArtA, verifyCtx);
            expect(okSourceVerify.Valid).toBe(true);
            expect(okSourceVerify.SnapshotVerified).toBe(true);
            const tamperedTargetJson = JSON.stringify({
                ...sourceSpec,
                ArtifactID: '88882222-3333-4444-8555-666677778888',
            });
            const tamperedTargetVerify = await docResolver.VerifyFrozenBlockSnapshot(
                tamperedTargetJson,
                hostArtA,
                verifyCtx,
            );
            expect(tamperedTargetVerify.Valid).toBe(false);
            const crossHostSourceVerify = await docResolver.VerifyFrozenBlockSnapshot(
                signedSourceJson,
                hostArtB,
                verifyCtx,
            );
            expect(crossHostSourceVerify.Valid).toBe(false);
        } finally {
            if (prevFrozenSecret === undefined) {
                delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
            } else {
                process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = prevFrozenSecret;
            }
        }

        // 6. S6: ResolveGuestArtifactSnapshotForSession allows Status === 'Consumed' for already-issued guest session JWTs
        const prevGuestEnabled = configInfo.magicLink.artifactGuestSharing.enabled;
        const prevSecretS6 = process.env.MJ_MAGIC_LINK_JWT_SECRET;
        configInfo.magicLink.artifactGuestSharing.enabled = true;
        process.env.MJ_MAGIC_LINK_JWT_SECRET = 'test-magic-secret-0123456789abcdef0123456789';
        try {
            const guestArtId = 'f1111111-2222-4333-8444-555566667777';
            const guestVerId = 'f2222222-2222-4333-8444-555566667777';
            const inviteId = 'f3333333-2222-4333-8444-555566667777';
            const guestUser = {
                ID: 'f4444444-2222-4333-8444-555566667777',
                Name: 'Guest',
                Email: 'guest@magic-link.local',
                IsActive: true,
                IsMagicLinkAnonymous: true,
                MagicLinkScope: {
                    InviteID: inviteId,
                    ResourceType: 'Artifacts',
                    ResourceID: guestArtId,
                },
            } as UserInfo;
            const consumedProvider = {
                Entities: [],
                RunViews: vi.fn(async (batch: RunViewParams[]) => {
                    if (batch[0]?.EntityName === 'MJ: Artifact Versions') {
                        return [
                            {
                                Success: true,
                                Results: [{ ID: guestVerId, ArtifactID: guestArtId, VersionNumber: 1, Content: '# Frozen Guest Report', Configuration: '{}' }],
                            },
                            {
                                Success: true,
                                Results: [{ ID: guestArtId, Name: 'Report', TypeID: 'type-md' }],
                            },
                        ];
                    }
                    return [
                        {
                            Success: true,
                            Results: [{
                                ID: inviteId,
                                Kind: 'resource-share',
                                IdentityMode: 'anonymous',
                                ResourceID: guestArtId,
                                Status: 'Consumed',
                                ExpiresAt: new Date(Date.now() + 60_000),
                                CreatedByUserID: s2User.ID,
                            }],
                        },
                        {
                            Success: true,
                            Results: [{ ID: 'link-1', MagicLinkInviteID: inviteId, ArtifactID: guestArtId, ArtifactVersionID: guestVerId }],
                        },
                    ];
                }),
            } as unknown as IMetadataProvider;
            vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(s2User);
            vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(s2User);
            vi.spyOn(UserCache.Instance, 'Users', 'get').mockReturnValue([s2User]);
            vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
            vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
                { ID: 'type-md', Name: 'Markdown Document', DriverClass: 'MarkdownArtifactViewerPlugin' } as never,
            ]);
            vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
                ArtifactID: guestArtId,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: true,
                Source: 'Owner',
                Reason: 'Inviter',
            });
            const guestRes = await ResolveGuestArtifactSnapshotForSession(
                {
                    email: 'guest@magic-link.local',
                    userRecord: guestUser,
                    sessionId: 'guest-s1',
                    magicLinkScopes: [{ resourceType: 'Artifacts', resourceId: guestArtId, inviteId }],
                },
                consumedProvider,
            );
            expect(guestRes.ErrorMessage).toBeUndefined();
            expect(guestRes.Valid).toBe(true);
            expect(guestRes.Content).toContain('Frozen Guest Report');
        } finally {
            configInfo.magicLink.artifactGuestSharing.enabled = prevGuestEnabled;
            if (prevSecretS6 === undefined) {
                delete process.env.MJ_MAGIC_LINK_JWT_SECRET;
            } else {
                process.env.MJ_MAGIC_LINK_JWT_SECRET = prevSecretS6;
            }
        }

        // 7. S9b: Per-user active room quota rejects >50 simultaneous non-idle rooms for the same user
        const quotaServer = new ArtifactCollaborationServer();
        const roomsMap = (quotaServer as unknown as { _rooms: Map<string, Record<string, unknown>> })._rooms;
        const quotaUser = {
            ID: '90909090-1111-4111-8111-111111111111',
            Name: 'Quota Tester',
            Email: 'quota@example.com',
            IsActive: true,
        } as UserInfo;
        const createdRoomKeys: string[] = [];
        for (let i = 0; i < 50; i++) {
            const rk = `quota-art-${i}`;
            createdRoomKeys.push(rk);
            roomsMap.set(rk, {
                ArtifactID: rk,
                RoomKey: rk,
                ProviderKey: 'default',
                CreatedByUserID: quotaUser.ID,
                DirtyWorkingState: true,
                DirtyVersion: true,
                Connections: new Set(),
                Doc: new Y.Doc(),
                Awareness: { setLocalState: () => undefined },
            });
        }
        const createAndHydrate = quotaServer as unknown as {
            createAndHydrateRoom: (id: string, user: UserInfo, prov: IMetadataProvider) => Promise<unknown>;
        };
        await expect(
            createAndHydrate.createAndHydrateRoom('quota-art-51', quotaUser, mockS2Provider),
        ).rejects.toThrow(/per-user active collaboration room limit/i);
        for (const rk of createdRoomKeys) {
            const r = roomsMap.get(rk) as { Doc?: Y.Doc } | undefined;
            r?.Doc?.destroy();
            roomsMap.delete(rk);
        }
    });

    it('R3 & R5: routes delete-set Yjs updates off the fast path and refuses non-owner RestoreArtifactVersion over locked content', async () => {
        // 1. R3: Plaintext unlocked room fast-path allows pure in-order text insert, refuses delete-sets targeting meta or future clocks
        class ProbeableCollabServer extends ArtifactCollaborationServer {
            public CheckClientUpdate(
                room: CollaborationRoom,
                conn: CollaborationClientConnection,
                updateBytes: Uint8Array,
            ): { Allowed: boolean; Reason?: string } {
                return this.isIncomingUpdateBlockedByLocks(room, conn, updateBytes);
            }
        }

        const server = new ProbeableCollabServer();
        const doc = new Y.Doc();
        doc.getMap('meta').set('serverProtectedKey', 'locked-value');
        const yContent = doc.getText('content');
        doc.transact(() => {
            yContent.insert(0, 'Hello unlocked doc');
        });
        const baselineUpdate = Y.encodeStateAsUpdate(doc);

        const room: CollaborationRoom = {
            ArtifactID: '12121212-1212-4121-8121-121212121212',
            RoomKey: '12121212-1212-4121-8121-121212121212',
            ProviderKey: 'default',
            ArtifactName: 'Plain Doc',
            ArtifactOwnerUserID: ownerUser.ID,
            DriverClass: 'MarkdownArtifactViewerPlugin',
            CreatedByUserID: ownerUser.ID,
            Doc: doc,
            Awareness: new awarenessProtocol.Awareness(doc),
            Connections: new Set(),
            BaseVersionID: 'ver-base-r3',
            BaseVersionNumber: 1,
            BaseVersionText: 'Hello unlocked doc',
            DirtyVersion: false,
            DirtyWorkingState: false,
            FlushTimer: null,
            IdleDisposeTimer: null,
            WorkingStateID: null,
            LastCompactedStateVector: null,
            HasActiveLocks: false,
            ServerAppliedClientIDs: new Set<number>(),
        };

        const conn: CollaborationClientConnection = {
            ConnectionID: 'conn-r3',
            Socket: {} as CollaborationClientConnection['Socket'],
            User: editorUser,
            CanEdit: true,
            IsOwner: false,
            HandshakeVersion: 1,
            ControlledClientIDs: new Set<number>(),
            Alive: true,
            MessageTimestamps: [],
        };

        // 1a. Pure in-order text insert with ds.clients.size === 0 succeeds on fast path
        const clientA = new Y.Doc();
        Y.applyUpdate(clientA, baselineUpdate);
        const beforeA = Y.encodeStateVector(clientA);
        clientA.getText('content').insert(clientA.getText('content').length, '!');
        const insertOnlyUpdate = Y.encodeStateAsUpdate(clientA, beforeA);
        expect(server.CheckClientUpdate(room, conn, insertOnlyUpdate).Allowed).toBe(true);
        clientA.destroy();

        // 1b. Update deleting `meta` map entry MUST route through slow path and be refused
        const clientMeta = new Y.Doc();
        Y.applyUpdate(clientMeta, baselineUpdate);
        const beforeMeta = Y.encodeStateVector(clientMeta);
        clientMeta.getMap('meta').delete('serverProtectedKey');
        const deleteMetaUpdate = Y.encodeStateAsUpdate(clientMeta, beforeMeta);
        const metaDeleteRes = server.CheckClientUpdate(room, conn, deleteMetaUpdate);
        expect(metaDeleteRes.Allowed).toBe(false);
        expect(metaDeleteRes.Reason).toMatch(/metadata/i);
        clientMeta.destroy();

        // 1c. Out-of-order delete-set (from an unseen future client/clock) MUST route through slow path and be refused
        const futureAuthor = new Y.Doc();
        futureAuthor.getText('content').insert(0, 'Unseen future text');
        const futureBaseline = Y.encodeStateAsUpdate(futureAuthor);
        const futureClone = new Y.Doc();
        Y.applyUpdate(futureClone, futureBaseline);
        const svKnownOnlyByFuture = Y.encodeStateVector(futureClone);
        futureClone.getText('content').delete(0, 6);
        const futureDeleteSetUpdate = Y.encodeStateAsUpdate(futureClone, svKnownOnlyByFuture);
        const futureDeleteRes = server.CheckClientUpdate(room, conn, futureDeleteSetUpdate);
        expect(futureDeleteRes.Allowed).toBe(false);
        expect(futureDeleteRes.Reason).toMatch(/incomplete out-of-order/i);
        futureAuthor.destroy();
        futureClone.destroy();
        room.Awareness.destroy();
        doc.destroy();

        // 2. R5: RestoreArtifactVersion refuses non-owner attempting to restore pre-lock v1 over locked v2, allows owner
        const restoreArtId = '34343434-3434-4343-8343-343434343434';
        const preLockVerId = '35353535-3535-4353-8353-353535353531';
        const preLockContent = '# Title\n\nUnlocked body\n';
        const lockedLatestContent = `# Title\n\n<!-- mj-lock: owner-only user=${ownerUser.ID} -->\n## Protected\nOwner secret\n`;

        const savedRestores: number[] = [];
        const restoreProvider = {
            Entities: [],
            EntityByName: () => null,
            GetEntityObject: async (_name: string, actor?: UserInfo) => {
                if (_name === 'MJ: Artifact Versions') {
                    let loadedId = '';
                    return {
                        ID: preLockVerId,
                        ArtifactID: restoreArtId,
                        VersionNumber: 1,
                        Name: 'Draft',
                        Content: preLockContent,
                        Configuration: null,
                        ContentMode: 'Text',
                        FileID: null,
                        MimeType: 'text/markdown',
                        FileName: null,
                        ContentSizeBytes: preLockContent.length,
                        ContentHash: 'h1',
                        IsSaved: true,
                        UserID: actor?.ID ?? ownerUser.ID,
                        NewRecord: () => undefined,
                        Load: async (id: string) => {
                            loadedId = id;
                            return id === preLockVerId;
                        },
                        Save: async () => {
                            savedRestores.push(loadedId === '' ? 3 : 1);
                            return true;
                        },
                        LatestResult: null,
                    } as unknown as MJArtifactVersionEntity;
                }
                return {} as MJArtifactVersionEntity;
            },
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: restoreArtId, TypeID: 'type-md', UserID: ownerUser.ID, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: [{ VersionNumber: 2, Content: lockedLatestContent, Configuration: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            },
        } as unknown as IMetadataProvider;

        const restoreResolver = new DocumentCollaborationResolver();
        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: restoreArtId,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'Editor',
        });

        const editorCtx: AppContext = {
            userPayload: { email: editorUser.Email, userRecord: editorUser, sessionId: 'sess-editor-r5' },
            providers: [{ type: 'Read-Write', provider: restoreProvider }],
        };
        const blockedRestore = await restoreResolver.RestoreArtifactVersion(restoreArtId, preLockVerId, editorCtx);
        expect(blockedRestore.Success).toBe(false);
        expect(blockedRestore.ErrorMessage).toMatch(/lock/i);
        expect(savedRestores).toHaveLength(0);

        const ownerCtx: AppContext = {
            userPayload: { email: ownerUser.Email, userRecord: ownerUser, sessionId: 'sess-owner-r5' },
            providers: [{ type: 'Read-Write', provider: restoreProvider }],
        };
        const allowedRestore = await restoreResolver.RestoreArtifactVersion(restoreArtId, preLockVerId, ownerCtx);
        expect(allowedRestore.Success).toBe(true);
        expect(savedRestores).toHaveLength(1);
    });

    it('B2: blocks non-owner RestoreArtifactVersion over working-state or live-room locks, fails closed on RunView errors, and enforces locks across peer relay restore', async () => {
        const artId = '45454545-4545-4454-8454-454545454545';
        const v1Id = '46464646-4646-4464-8464-464646464641';
        const v2Id = '46464646-4646-4464-8464-464646464642';
        const unlockedContent = '# Spec\n\nUnlocked baseline.\n';
        const lockedOnlyInWsOrRoom = `# Spec\n\n<!-- mj-lock: owner-only user=${ownerUser.ID} -->\n## Locked Live\nOwner secret\n`;

        let workingStateRow: { Content: string } | null = { Content: lockedOnlyInWsOrRoom };
        let versionQuerySuccess = true;
        let savedCount = 0;

        const b2Provider = {
            Entities: [],
            EntityByName: () => null,
            GetEntityObject: async (_name: string, actor?: UserInfo) => {
                if (_name === 'MJ: Artifact Versions') {
                    let loadedId = '';
                    return {
                        ID: v1Id,
                        ArtifactID: artId,
                        VersionNumber: 1,
                        Name: 'Draft',
                        Content: unlockedContent,
                        Configuration: null,
                        ContentMode: 'Text',
                        FileID: null,
                        MimeType: 'text/markdown',
                        FileName: null,
                        ContentSizeBytes: unlockedContent.length,
                        ContentHash: 'h-v1',
                        IsSaved: true,
                        UserID: actor?.ID ?? ownerUser.ID,
                        NewRecord: () => undefined,
                        Load: async (id: string) => {
                            loadedId = id;
                            return id === v1Id;
                        },
                        Save: async () => {
                            savedCount += loadedId === '' ? 1 : 0;
                            return true;
                        },
                        LatestResult: null,
                    } as unknown as MJArtifactVersionEntity;
                }
                return {} as MJArtifactVersionEntity;
            },
            RunView: async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ID: artId, TypeID: 'type-md', UserID: ownerUser.ID, DelegateEntityID: null, DelegateRecordID: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    if (!versionQuerySuccess) {
                        return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: 'Simulated DB error' };
                    }
                    return {
                        Success: true,
                        Results: [{ VersionNumber: 1, Content: unlockedContent, Configuration: null }],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                if (params.EntityName === 'MJ: Artifact Working States') {
                    return {
                        Success: true,
                        Results: workingStateRow ? [workingStateRow] : [],
                        RowCount: workingStateRow ? 1 : 0,
                        TotalRowCount: workingStateRow ? 1 : 0,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            },
        } as unknown as IMetadataProvider;

        const resolver = new DocumentCollaborationResolver();
        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artId,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'Editor',
        });

        const editorCtx: AppContext = {
            userPayload: { email: editorUser.Email, userRecord: editorUser, sessionId: 'sess-b2-editor' },
            providers: [{ type: 'Read-Write', provider: b2Provider }],
        };

        // 1. Lock present only in persisted working state blocks non-owner restore
        const wsBlocked = await resolver.RestoreArtifactVersion(artId, v1Id, editorCtx);
        expect(wsBlocked.Success).toBe(false);
        expect(wsBlocked.ErrorMessage).toMatch(/lock/i);
        expect(savedCount).toBe(0);

        // 2. Lock present only in active in-memory room blocks non-owner restore even when working state is clear
        workingStateRow = null;
        const roomBaselineSpy = vi
            .spyOn(ArtifactCollaborationServer.Instance, 'GetActiveRoomLockBaseline')
            .mockReturnValue({ Content: lockedOnlyInWsOrRoom, Configuration: null });
        const roomBlocked = await resolver.RestoreArtifactVersion(artId, v1Id, editorCtx);
        expect(roomBlocked.Success).toBe(false);
        expect(roomBlocked.ErrorMessage).toMatch(/lock/i);
        expect(savedCount).toBe(0);
        roomBaselineSpy.mockRestore();

        // 3. RunView failure during lock check fails closed
        versionQuerySuccess = false;
        const dbErrBlocked = await resolver.RestoreArtifactVersion(artId, v1Id, editorCtx);
        expect(dbErrBlocked.Success).toBe(false);
        expect(dbErrBlocked.ErrorMessage).toMatch(/Simulated DB error|unable to verify/i);
        expect(savedCount).toBe(0);
        versionQuerySuccess = true;

        // 4. Peer relay restore over YjsRoomRelay propagates unlocked restore AND preserves live locks on non-owner restore
        class TestRelayNodeA extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class TestRelayNodeB extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const bus = new InMemoryYjsRelayBus();
        const relayA = new InMemoryYjsRoomRelay(bus, 'node-a');
        const relayB = new InMemoryYjsRoomRelay(bus, 'node-b');
        const nodeA = new TestRelayNodeA();
        const nodeB = new TestRelayNodeB();
        try {
            const peerDoc = new Y.Doc();
            peerDoc.getText('content').insert(0, 'Old peer text');
            let currentDbLatest = {
                ID: v2Id,
                VersionNumber: 2,
                Content: unlockedContent,
                Configuration: null,
                UserID: ownerUser.ID,
            };
            const peerProvider = {
                Entities: [],
                EntityByName: () => null,
                RunView: async (params: RunViewParams) => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [{ ID: artId, TypeID: 'type-md', UserID: ownerUser.ID, DelegateEntityID: null, DelegateRecordID: null }],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [currentDbLatest],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        };
                    }
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
                },
            } as unknown as IMetadataProvider;
            const peerRoom: CollaborationRoom = {
                ArtifactID: artId,
                RoomKey: artId,
                ProviderKey: 'default',
                Provider: peerProvider,
                ArtifactOwnerUserID: ownerUser.ID,
                DriverClass: 'MarkdownArtifactViewerPlugin',
                DelegateEntityID: null,
                DelegateRecordID: null,
                Doc: peerDoc,
                Awareness: new awarenessProtocol.Awareness(peerDoc),
                Connections: new Set(),
                BaseVersionID: v1Id,
                BaseVersionNumber: 1,
                BaseVersionText: 'Old peer text',
                BaseConfiguration: null,
                DirtyVersion: false,
                DirtyWorkingState: false,
                CompactionRetryCount: 0,
                LastModifiedByUser: ownerUser,
                LastAppliedRestoreVersionID: null,
                LastAppliedRestoreVersionNumber: 0,
                LastReconciledOobVersionID: null,
                LastReconciledOobContent: null,
                LastReconciledOobMergeResult: null,
                RoomEpoch: 'epoch-b2-peer',
                FlushQueue: Promise.resolve(true),
                CompactionQueue: Promise.resolve({ Saved: false }),
                WorkingStateTimer: null,
                IdleDisposeTimer: null,
                UnsubscribeRelay: null,
                DocUpdateListener: () => undefined,
                AwarenessUpdateListener: () => undefined,
                HasActiveLocks: false,
                ProtectedAgentClientIDs: new Set<number>(),
                AgentPresenceEntries: new Map(),
                RelayedAgentPresenceTimers: new Map(),
            };

            const roomsB = Reflect.get(nodeB, '_rooms') as Map<string, CollaborationRoom>;
            roomsB.set(artId, peerRoom);

            nodeA.SetRoomRelay(relayA);
            nodeB.SetRoomRelay(relayB);
            const onRelayB = Reflect.get(nodeB, 'onRelayMessage') as (
                r: CollaborationRoom,
                m: YjsRelayMessage,
            ) => Promise<void>;
            await relayB.SubscribeRoom(artId, (msg) => {
                void onRelayB.call(nodeB, peerRoom, msg);
            });

            // Publish restore frame from nodeA -> nodeB receives and reconciles unlocked target
            const restoreHash = createHash('sha256').update(unlockedContent, 'utf8').digest('hex');
            await relayA.PublishToRoom({
                ArtifactID: artId,
                ProviderKey: 'default',
                MessageType: 'version-saved',
                PayloadBase64: JSON.stringify({ isRestore: true, savedContentHash: restoreHash }),
                TargetUserID: ownerUser.ID,
                VersionID: v2Id,
                VersionNumber: 2,
            });
            await vi.waitFor(
                () => {
                    expect(peerRoom.Doc.getText('content').toString()).toBe(unlockedContent);
                },
                { timeout: 4_000, interval: 25 },
            );

            // Now add owner lock directly in peerRoom, then receive non-owner restore -> peerRoom retains lock!
            peerRoom.Doc.transact(() => {
                const yt = peerRoom.Doc.getText('content');
                yt.delete(0, yt.length);
                yt.insert(0, lockedOnlyInWsOrRoom);
            });
            peerRoom.HasActiveLocks = true;
            const v3Id = '46464646-4646-4464-8464-464646464643';
            currentDbLatest = {
                ID: v3Id,
                VersionNumber: 3,
                Content: unlockedContent,
                Configuration: null,
                UserID: editorUser.ID,
            };
            await relayA.PublishToRoom({
                ArtifactID: artId,
                ProviderKey: 'default',
                MessageType: 'version-saved',
                PayloadBase64: JSON.stringify({ isRestore: true, savedContentHash: restoreHash }),
                TargetUserID: editorUser.ID,
                VersionID: v3Id,
                VersionNumber: 3,
            });
            await new Promise((r) => setTimeout(r, 1_750));
            expect(peerRoom.Doc.getText('content').toString()).toBe(lockedOnlyInWsOrRoom);
        } finally {
            await nodeA.Shutdown();
            await nodeB.Shutdown();
            delete nodeA.GetGlobalObjectStore()[nodeA.GlobalKey];
            delete nodeB.GetGlobalObjectStore()[nodeB.GlobalKey];
            await relayA.Shutdown();
            await relayB.Shutdown();
        }
    }, 15_000);
});
