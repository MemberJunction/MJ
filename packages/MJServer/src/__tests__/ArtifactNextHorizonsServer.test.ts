import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    DatabaseProviderBase,
    DispatchRemoteOperationInProcess,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import {
    ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
    ARTIFACT_EVALUATE_AI_FORMULA_KEY,
    ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY,
    ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY,
    ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY,
    type ArtifactComplianceAuditInput,
    type ArtifactComplianceAuditOutput,
    type ArtifactEvaluateAiFormulaInput,
    type ArtifactEvaluateAiFormulaOutput,
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    ComputeFrozenSnapshotHash,
    DocumentLiveBlockEngine,
    type CreateGuestShareLinkInput,
    type CreateGuestShareLinkOutput,
    type FrozenBlockSnapshot,
    MAX_AI_FORMULA_BATCH_CELLS,
    type ResolveGuestShareLinkInput,
    type ResolveGuestShareLinkOutput,
    type RevokeGuestShareLinkInput,
    type RevokeGuestShareLinkOutput,
    SlideDeckEngine,
    SpreadsheetEngine,
    MJArtifactTypeEntity,
    type MJArtifactVersionEntity,
    type MJAuditLogEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { ArtifactCollaborationServer } from '../collaboration/ArtifactCollaborationServer.js';
import {
    LoadArtifactComplianceAuditOperation,
    WriteArtifactComplianceAudit,
} from '../operations/ArtifactComplianceAuditHelper.js';
import {
    ArtifactEvaluateAiFormulaServerOperation,
    LoadArtifactEvaluateAiFormulaOperation,
} from '../operations/ArtifactEvaluateAiFormulaServerOperation.js';
import { type Request, type Response, type Router } from 'express';
import type sql from 'mssql';
import {
    LoadArtifactGuestShareOperations,
    SetGuestShareSigningSecret,
} from '../operations/ArtifactGuestShareServerOperations.js';
import { PublicGuestShareResolver } from '../resolvers/PublicGuestShareResolver.js';
import { CreatePublicGuestShareRouter } from '../rest/PublicGuestShareHandler.js';
import { RedisTicketReplayStore, RedisYjsRoomRelay } from '../collaboration/YjsRoomRelay.js';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import type { AppContext } from '../types.js';

LoadArtifactComplianceAuditOperation();
LoadArtifactEvaluateAiFormulaOperation();
LoadArtifactGuestShareOperations();

vi.mock('../config.js', () => ({
    configInfo: {
        apiBasePath: '/',
        cors: { allowedOrigins: ['*'] },
    },
}));

vi.mock('../context.js', () => ({
    getUserPayload: vi.fn(async () => null),
}));

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const EDITOR_ID = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const ART_TYPE_ID = '55555555-5555-4555-8555-555555555555';

const OWNER_USER = { ID: OWNER_ID, Name: 'Owner User', Email: 'owner@example.com', IsActive: true } as UserInfo;
const EDITOR_USER = { ID: EDITOR_ID, Name: 'Editor User', Email: 'editor@example.com', IsActive: true } as UserInfo;

type MockScalar = string | number | boolean | Date | null | undefined;
type MockEntityRecord = Record<string, MockScalar>;
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
    [key: string]: JsonValue;
}

describe('MJServer Next Horizons Operations & Lock Enforcement', () => {
    const auditRows: MockEntityRecord[] = [];
    const versionsById = new Map<string, MockEntityRecord>();
    const workingStatesByArtId = new Map<string, MockEntityRecord>();
    const guestShareLinksById = new Map<string, MockEntityRecord>();
    let resolvePermsSpy: ReturnType<typeof vi.spyOn> | null = null;
    let sysUserSpy: ReturnType<typeof vi.spyOn> | null = null;
    let artConfigSpy: ReturnType<typeof vi.spyOn> | null = null;
    let artTypesSpy: ReturnType<typeof vi.spyOn> | null = null;
    let currentProvider: DatabaseProviderBase & IMetadataProvider & IRunViewProvider;

    function createMockProvider(): DatabaseProviderBase & IMetadataProvider & IRunViewProvider {
        const makeEntityProxy = (entityName: string, initial?: MockEntityRecord): MJAuditLogEntity & MJArtifactVersionEntity => {
            const fields: MockEntityRecord = {
                ID:
                    entityName === 'MJ: Audit Logs'
                        ? `audit-${auditRows.length + 1}`
                        : entityName === 'MJ: Artifact Versions'
                          ? `ver-${versionsById.size + 1}`
                          : entityName === 'MJ: Artifact Guest Share Links'
                            ? `gsl-${guestShareLinksById.size + 1}`
                            : `ws-${workingStatesByArtId.size + 1}`,
                ...(initial ?? {}),
            };
            const base = Object.assign(Object.create(BaseEntity.prototype) as MJAuditLogEntity & MJArtifactVersionEntity, fields);
            return new Proxy(base, {
                get(target, prop) {
                    if (prop === 'NewRecord') return () => true;
                    if (prop === 'Load') {
                        return async (id?: string) => {
                            if (entityName === 'MJ: Artifact Guest Share Links' && id) {
                                const found = Array.from(guestShareLinksById.values()).find(
                                    (r) => String(r['ID'] ?? '').toLowerCase() === id.toLowerCase(),
                                );
                                if (!found) return false;
                                Object.assign(fields, found);
                                return true;
                            }
                            return true;
                        };
                    }
                    if (prop === 'LoadFromData') {
                        return async (data: MockEntityRecord) => {
                            Object.assign(fields, data);
                            return true;
                        };
                    }
                    if (prop === 'Save') {
                        return async () => {
                            if (entityName === 'MJ: Audit Logs') {
                                auditRows.push({ ...fields });
                            } else if (entityName === 'MJ: Artifact Versions') {
                                versionsById.set(String(fields['ID']), { ...fields });
                            } else if (entityName === 'MJ: Artifact Working States') {
                                workingStatesByArtId.set(String(fields['ArtifactID'] ?? ''), { ...fields });
                            } else if (entityName === 'MJ: Artifact Guest Share Links') {
                                guestShareLinksById.set(String(fields['ID']), { ...fields });
                            }
                            return true;
                        };
                    }
                    if (prop === 'GetAll') return () => ({ ...fields });
                    if (typeof prop === 'string' && prop in fields) {
                        return fields[prop];
                    }
                    return Reflect.get(target, prop);
                },
                set(_target, prop, value) {
                    if (typeof prop === 'string') {
                        fields[prop] = value as MockScalar;
                    }
                    return true;
                },
            });
        };

        const runViewFn = async (params: RunViewParams): Promise<RunViewResult<MockEntityRecord>> => {
            if (params.EntityName === 'MJ: Artifact Guest Share Links') {
                const filter = params.ExtraFilter ?? '';
                let rows = Array.from(guestShareLinksById.values());
                const hashMatch = filter.match(/TokenHash='([^']+)'/i);
                if (hashMatch) {
                    rows = rows.filter((r) => String(r['TokenHash'] ?? '') === hashMatch[1]);
                }
                const idMatch = filter.match(/\bID='([^']+)'/i);
                if (idMatch) {
                    rows = rows.filter((r) => String(r['ID'] ?? '').toLowerCase() === idMatch[1].toLowerCase());
                }
                if (params.ResultType === 'entity_object') {
                    return {
                        Success: true,
                        Results: rows.map((r) => makeEntityProxy('MJ: Artifact Guest Share Links', r)),
                        TotalRowCount: rows.length,
                    };
                }
                return { Success: true, Results: rows, TotalRowCount: rows.length };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                const rows = Array.from(versionsById.values()).sort(
                    (a, b) => Number(b['VersionNumber'] ?? 0) - Number(a['VersionNumber'] ?? 0),
                );
                if (params.ResultType === 'entity_object') {
                    return {
                        Success: true,
                        Results: rows.map((r) => makeEntityProxy('MJ: Artifact Versions', r)),
                        TotalRowCount: rows.length,
                    };
                }
                return { Success: true, Results: rows, TotalRowCount: rows.length };
            }
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{ ID: ARTIFACT_ID, Name: 'Board Pack', TypeID: ART_TYPE_ID, Type: 'Markdown Document' }],
                    TotalRowCount: 1,
                };
            }
            if (params.EntityName === 'MJ: Artifact Working States') {
                const existing = workingStatesByArtId.get(ARTIFACT_ID);
                return {
                    Success: true,
                    Results: existing ? [existing] : [],
                    TotalRowCount: existing ? 1 : 0,
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        };

        const mock = Object.defineProperties(
            Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase & IMetadataProvider & IRunViewProvider,
            {
                Entities: { value: [], enumerable: true, configurable: true },
                AuditLogTypes: {
                    value: [
                        { ID: 'alt-1', Name: 'Artifact Block Frozen' },
                        { ID: 'alt-2', Name: 'Artifact Guest Share Link' },
                        { ID: 'alt-3', Name: 'Artifact Connected Drive Sync' },
                        { ID: 'alt-4', Name: 'Artifact Exported' },
                        { ID: 'alt-5', Name: 'Artifact Permission Changed' },
                    ],
                    enumerable: true,
                    configurable: true,
                },
                EntityByName: {
                    value: (name: string) => ({ ID: `entity-${name}`, Name: name }),
                    enumerable: true,
                    configurable: true,
                },
                GetEntityObject: {
                    value: async (entityName: string) => makeEntityProxy(entityName),
                    enumerable: true,
                    configurable: true,
                },
                RunView: {
                    value: runViewFn,
                    enumerable: true,
                    configurable: true,
                },
                RunViews: {
                    value: async (paramsArray: RunViewParams[]) =>
                        Promise.all(paramsArray.map((p) => runViewFn(p))),
                    enumerable: true,
                    configurable: true,
                },
            },
        );

        const rvProxy = Object.assign(new RunView(), {
            RunView: runViewFn,
            RunViews: async (paramsArray: RunViewParams[]) =>
                Promise.all(paramsArray.map((p) => runViewFn(p))),
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvProxy);
        return mock;
    }

    beforeEach(async () => {
        auditRows.length = 0;
        versionsById.clear();
        workingStatesByArtId.clear();
        guestShareLinksById.clear();
        SetGuestShareSigningSecret('unit-test-guest-share-secret-32bytes!!');
        DocumentLiveBlockEngine.Instance.SetSigningSecret('unit-test-frozen-block-secret-32b!!');

        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 1,
            Name: 'Frozen Board Pack',
            Content: '# Executive Summary\n\nFrozen figures verified.',
            Configuration: JSON.stringify({ previewSnapshot: { Kind: 'doc', Heading: 'Executive Summary', Excerpt: 'Frozen' } }),
        });

        sysUserSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(OWNER_USER);
        artConfigSpy = vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
        const mockArtType = Object.defineProperties(
            Object.create(MJArtifactTypeEntity.prototype) as MJArtifactTypeEntity,
            {
                ID: { value: ART_TYPE_ID, enumerable: true },
                Name: { value: 'Markdown Document', enumerable: true },
                DriverClass: { value: 'MarkdownArtifactViewerPlugin', enumerable: true },
            },
        );
        artTypesSpy = vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([mockArtType]);
        resolvePermsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockImplementation(async (_p, _aid, u) => ({
                ArtifactID: ARTIFACT_ID,
                CanRead: true,
                CanEdit: true,
                CanDelete: u.ID === OWNER_ID,
                CanShare: u.ID === OWNER_ID,
                Source: u.ID === OWNER_ID ? 'Owner' : 'ArtifactPermission',
                Reason: 'mocked',
            }));

        currentProvider = createMockProvider();
        const server = ArtifactCollaborationServer.Instance;
        await server.Shutdown();
        Reflect.set(server, '_shuttingDown', false);
        server.SetMetadataProviderOverride(currentProvider);
    });

    afterEach(async () => {
        SetGuestShareSigningSecret(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret(null);
        ArtifactEvaluateAiFormulaServerOperation.SetCompletionRunnerForTest(null);
        resolvePermsSpy?.mockRestore();
        sysUserSpy?.mockRestore();
        artConfigSpy?.mockRestore();
        artTypesSpy?.mockRestore();
        await ArtifactCollaborationServer.Instance.Shutdown();
        ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(null);
        vi.restoreAllMocks();
    });

    it('records compliance audit events and enforces CanRead on Artifact.LogComplianceAudit', async () => {
        const helperRes = await WriteArtifactComplianceAudit(currentProvider, OWNER_USER, {
            AuditLogTypeName: 'Artifact Block Frozen',
            ArtifactID: ARTIFACT_ID,
            Summary: 'Froze KPI block',
            Details: { blockId: 'blk-1' },
        });
        expect(helperRes.Recorded).toBe(true);
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0]?.['AuditLogTypeID']).toBe('alt-1');

        const opRes = await DispatchRemoteOperationInProcess<ArtifactComplianceAuditInput, ArtifactComplianceAuditOutput>(
            ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY,
            {
                AuditLogTypeName: 'Artifact Exported',
                ArtifactID: ARTIFACT_ID,
                Summary: 'Exported PDF',
            },
            {},
            currentProvider,
            OWNER_USER,
        );
        expect(opRes.Success).toBe(true);
        expect(opRes.Output?.Recorded).toBe(true);
        expect(auditRows).toHaveLength(2);

        resolvePermsSpy!.mockResolvedValueOnce({
            ArtifactID: ARTIFACT_ID,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied',
            Reason: 'denied',
        });
        const deniedRes = await DispatchRemoteOperationInProcess<ArtifactComplianceAuditInput, ArtifactComplianceAuditOutput>(
            ARTIFACT_LOG_COMPLIANCE_AUDIT_KEY,
            { AuditLogTypeName: 'Artifact Exported', ArtifactID: ARTIFACT_ID, Summary: 'Denied' },
            {},
            currentProvider,
            EDITOR_USER,
        );
        expect(deniedRes.Success).toBe(false);
        expect(deniedRes.ResultCode).toBe('ACCESS_DENIED');
    });

    it('enforces batch caps, CanEdit permissions, and deduplication in ArtifactEvaluateAiFormulaServerOperation', async () => {
        let llmCalls = 0;
        ArtifactEvaluateAiFormulaServerOperation.SetCompletionRunnerForTest(async (prompt, ctx) => {
            llmCalls++;
            return `summary:${prompt}:${ctx}`;
        });

        const res = await DispatchRemoteOperationInProcess<ArtifactEvaluateAiFormulaInput, ArtifactEvaluateAiFormulaOutput>(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            {
                ArtifactID: ARTIFACT_ID,
                Cells: [
                    { SheetID: 's1', Address: 'C1', Prompt: 'Summarize', ContextValuesJSON: '[10]', InputHash: 'h1' },
                    { SheetID: 's1', Address: 'C2', Prompt: 'Summarize', ContextValuesJSON: '[10]', InputHash: 'h1' },
                ],
            },
            {},
            currentProvider,
            OWNER_USER,
        );
        expect(res.Success).toBe(true);
        expect(llmCalls).toBe(1);
        expect(res.Output?.Results).toHaveLength(2);
        expect(res.Output?.Results[0]?.Value).toBe('summary:Summarize:[10]');
        expect(res.Output?.Results[1]?.Value).toBe('summary:Summarize:[10]');

        const oversized = Array.from({ length: MAX_AI_FORMULA_BATCH_CELLS + 1 }, (_v, idx) => ({
            SheetID: 's1',
            Address: `A${idx + 1}`,
            Prompt: 'Classify',
            ContextValuesJSON: '[]',
            InputHash: `h-${idx}`,
        }));
        const capRes = await DispatchRemoteOperationInProcess<ArtifactEvaluateAiFormulaInput, ArtifactEvaluateAiFormulaOutput>(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            { ArtifactID: ARTIFACT_ID, Cells: oversized },
            {},
            currentProvider,
            OWNER_USER,
        );
        expect(capRes.Success).toBe(false);
        expect(capRes.ResultCode).toBe('BATCH_LIMIT_EXCEEDED');

        resolvePermsSpy!.mockResolvedValueOnce({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'ArtifactPermission',
            Reason: 'read-only',
        });
        const editDenied = await DispatchRemoteOperationInProcess<ArtifactEvaluateAiFormulaInput, ArtifactEvaluateAiFormulaOutput>(
            ARTIFACT_EVALUATE_AI_FORMULA_KEY,
            {
                ArtifactID: ARTIFACT_ID,
                Cells: [{ SheetID: 's1', Address: 'C1', Prompt: 'Summarize', ContextValuesJSON: '[]', InputHash: 'h1' }],
            },
            {},
            currentProvider,
            EDITOR_USER,
        );
        expect(editDenied.Success).toBe(false);
        expect(editDenied.ResultCode).toBe('ACCESS_DENIED');
    });

    it('issues Frozen-only guest share links, rejects Live blocks, resolves valid tokens, and honors revocation', async () => {
        // Editor without CanShare cannot create a guest link
        const shareDenied = await DispatchRemoteOperationInProcess<CreateGuestShareLinkInput, CreateGuestShareLinkOutput>(
            ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
            { ArtifactID: ARTIFACT_ID, ExpiresInHours: 24 },
            {},
            currentProvider,
            EDITOR_USER,
        );
        expect(shareDenied.Success).toBe(false);
        expect(shareDenied.ResultCode).toBe('ACCESS_DENIED');

        // Non-frozen live block is rejected (Frozen-only invariant)
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 1,
            Content: [
                '# Live Report',
                '',
                ':::mj-block',
                '{"BlockID":"b1","Kind":"EntityView","Mode":"Live","EntityName":"MJ: Users"}',
                ':::',
            ].join('\n'),
            Configuration: '{}',
        });
        const liveRejected = await DispatchRemoteOperationInProcess<CreateGuestShareLinkInput, CreateGuestShareLinkOutput>(
            ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
            { ArtifactID: ARTIFACT_ID, ExpiresInHours: 24 },
            {},
            currentProvider,
            OWNER_USER,
        );
        expect(liveRejected.Success).toBe(false);
        expect(liveRejected.ResultCode).toBe('FROZEN_REQUIRED');

        // Frozen block succeeds when snapshot carries valid acknowledgement & HMAC signature
        const snapPayload = {
            FrozenAt: '2026-01-01T00:00:00.000Z',
            FrozenByUserID: OWNER_ID,
            FrozenByUserName: 'Owner User',
            Columns: [{ Name: 'Name', DisplayName: 'Name' }],
            Rows: [{ Name: 'Alice' }],
            TotalRowCount: 1,
            SecurityWarningAcknowledged: true,
        };
        const frozenSnapshot: FrozenBlockSnapshot = {
            ...snapPayload,
            SnapshotContentHash: ComputeFrozenSnapshotHash(snapPayload),
        };
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 2,
            ContentMode: 'Text',
            Content: [
                '# Frozen Report',
                '',
                ':::mj-block',
                JSON.stringify({
                    BlockID: 'b1',
                    Kind: 'EntityView',
                    Mode: 'Frozen',
                    EntityName: 'MJ: Users',
                    FrozenSnapshot: frozenSnapshot,
                }),
                ':::',
            ].join('\n'),
            Configuration: '{}',
        });

        const issuedRes = await DispatchRemoteOperationInProcess<CreateGuestShareLinkInput, CreateGuestShareLinkOutput>(
            ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
            { ArtifactID: ARTIFACT_ID, VersionID: VERSION_ID, ExpiresInHours: 48, Label: 'External Auditors' },
            {},
            currentProvider,
            OWNER_USER,
        );
        expect(issuedRes.Success).toBe(true);
        const issued = issuedRes.Output!;
        expect(issued.ShareMode).toBe('Frozen');
        expect(issued.Token).toContain('.');

        const resolvedRes = await DispatchRemoteOperationInProcess<ResolveGuestShareLinkInput, ResolveGuestShareLinkOutput>(
            ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY,
            { Token: issued.Token },
            {},
            currentProvider,
            EDITOR_USER,
        );
        expect(resolvedRes.Output?.Valid).toBe(true);
        expect(resolvedRes.Output?.ReadOnly).toBe(true);
        expect(resolvedRes.Output?.ShareMode).toBe('Frozen');
        expect(resolvedRes.Output?.Title).toBe('Board Pack');

        // Tampered token fails
        const tamperedRes = await DispatchRemoteOperationInProcess<ResolveGuestShareLinkInput, ResolveGuestShareLinkOutput>(
            ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY,
            { Token: `${issued.Token}tamper` },
            {},
            currentProvider,
            EDITOR_USER,
        );
        expect(tamperedRes.Output?.Valid).toBe(false);

        // Revoking invalidates token
        const revokedRes = await DispatchRemoteOperationInProcess<RevokeGuestShareLinkInput, RevokeGuestShareLinkOutput>(
            ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY,
            { ArtifactID: ARTIFACT_ID, VersionID: VERSION_ID, LinkID: issued.LinkID },
            {},
            currentProvider,
            OWNER_USER,
        );
        expect(revokedRes.Output?.Revoked).toBe(true);

        const afterRevokeRes = await DispatchRemoteOperationInProcess<ResolveGuestShareLinkInput, ResolveGuestShareLinkOutput>(
            ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY,
            { Token: issued.Token },
            {},
            currentProvider,
            EDITOR_USER,
        );
        expect(afterRevokeRes.Output?.Valid).toBe(false);
        expect(afterRevokeRes.Output?.Reason).toMatch(/revoked/i);
    });

    it('enforces Document locks, Slide locks, and Spreadsheet ProtectedRanges in ArtifactCollaborationServer', async () => {
        const resetRoom = async () => {
            workingStatesByArtId.clear();
            await ArtifactCollaborationServer.Instance.Shutdown();
            Reflect.set(ArtifactCollaborationServer.Instance, '_shuttingDown', false);
            ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(currentProvider);
        };

        // 1. Document lock
        const docOrig = ['# Doc', '<!-- mj-lock: owner-only -->', '## Terms', 'Locked terms.', '## Notes', 'Open notes.'].join(
            '\n',
        );
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 1,
            Content: docOrig,
        });
        await resetRoom();
        const docMutateLocked = [
            '# Doc',
            '<!-- mj-lock: owner-only -->',
            '## Terms',
            'Tampered terms!',
            '## Notes',
            'Open notes.',
        ].join('\n');
        const deniedDoc = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            ARTIFACT_ID,
            docMutateLocked,
            EDITOR_USER,
            false,
        );
        expect(deniedDoc.Success).toBe(false);
        expect(deniedDoc.ErrorMessage).toMatch(/owner-only/i);

        const ownerDoc = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            ARTIFACT_ID,
            docMutateLocked,
            OWNER_USER,
            false,
        );
        expect(ownerDoc.Success).toBe(true);

        // 2. Slide lock
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Locked Deck');
        deck.Slides[0]!.Locked = true;
        deck.Slides[0]!.LockedByUserID = OWNER_ID;
        const deckOrigJson = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        deck.Slides[0]!.Title = 'Altered Slide Title';
        const deckMutatedJson = SlideDeckEngine.Instance.SerializeDeckSpec(deck);

        await resetRoom();
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 2,
            Content: deckOrigJson,
        });
        const deniedSlide = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            ARTIFACT_ID,
            deckMutatedJson,
            EDITOR_USER,
            false,
        );
        expect(deniedSlide.Success).toBe(false);
        expect(deniedSlide.ErrorMessage).toMatch(/locked/i);

        // 3. Spreadsheet ProtectedRange
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Protected Budget');
        const sheetId = wb.ActiveSheetID;
        SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'A1', { Value: 100 });
        SpreadsheetEngine.Instance.AddProtectedRange(wb, sheetId, {
            RangeID: 'pr-1',
            Range: 'A1:B2',
            LockedByUserID: OWNER_ID,
        });
        const wbOrigJson = SpreadsheetEngine.Instance.SerializeWorkbook(wb);
        const tamperedWb = JSON.parse(wbOrigJson) as ReturnType<typeof SpreadsheetEngine.Instance.ParseWorkbook>;
        tamperedWb.Worksheets[0]!.Cells['A1'] = { Value: 999, RawValue: '999', DataType: 'number' };
        const wbMutatedJson = SpreadsheetEngine.Instance.SerializeWorkbook(tamperedWb);

        await resetRoom();
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 3,
            Content: wbOrigJson,
        });
        const deniedSheet = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            ARTIFACT_ID,
            wbMutatedJson,
            EDITOR_USER,
            false,
        );
        expect(deniedSheet.Success).toBe(false);
        expect(deniedSheet.ErrorMessage).toMatch(/protected range/i);
    });

    it('NW-1: allows CanShare (without CanEdit) guest share creation/revocation, scrubs secrets, and resolves unauthenticated public guest shares', async () => {
        const shareOnlyId = '66666666-6666-4666-8666-666666666666';
        const shareOnlyUser = {
            ID: shareOnlyId,
            Name: 'Share Only User',
            Email: 'shareonly@example.com',
            IsActive: true,
        } as UserInfo;

        resolvePermsSpy?.mockImplementation(async (_p, _aid, u) => ({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: u.ID === OWNER_ID,
            CanDelete: u.ID === OWNER_ID,
            CanShare: u.ID === OWNER_ID || u.ID === shareOnlyId,
            Source: u.ID === OWNER_ID ? 'Owner' : 'ArtifactPermission',
            Reason: 'mocked',
        }));

        const snapPayload = {
            FrozenAt: '2026-01-01T00:00:00.000Z',
            FrozenByUserID: OWNER_ID,
            FrozenByUserName: 'Owner User',
            Columns: [{ Name: 'Name', DisplayName: 'Name' }],
            Rows: [{ Name: 'Alice' }],
            TotalRowCount: 1,
            SecurityWarningAcknowledged: true,
        };
        const validSnap: FrozenBlockSnapshot = {
            ...snapPayload,
            SnapshotContentHash: ComputeFrozenSnapshotHash(snapPayload),
        };
        const originalConfig = JSON.stringify({
            previewSnapshot: { Kind: 'doc', Heading: 'Executive Summary' },
            guestShareLinks: [{ id: 'legacy-secret-entry' }],
            webhookSecret: 'super-secret-value',
        });
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 7,
            Name: 'Q4 Audit Pack',
            ContentMode: 'Text',
            Content: [
                '# Q4 Audit',
                ':::mj-block',
                JSON.stringify({
                    BlockID: 'b-frozen',
                    Kind: 'EntityView',
                    Mode: 'Frozen',
                    EntityName: 'MJ: Users',
                    FrozenSnapshot: validSnap,
                }),
                ':::',
            ].join('\n'),
            Configuration: originalConfig,
        });

        // Share-only user (CanShare=true, CanEdit=false) issues link without mutating version Configuration
        const issuedRes = await DispatchRemoteOperationInProcess<CreateGuestShareLinkInput, CreateGuestShareLinkOutput>(
            ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
            { ArtifactID: ARTIFACT_ID, VersionID: VERSION_ID, ExpiresInHours: 24, Label: 'Board Review' },
            {},
            currentProvider,
            shareOnlyUser,
        );
        expect(issuedRes.Success).toBe(true);
        const token = issuedRes.Output!.Token;
        expect(versionsById.get(VERSION_ID)?.['Configuration']).toBe(originalConfig);

        // Unauthenticated GraphQL PublicGuestShareResolver resolves the frozen share and scrubs sensitive Configuration keys
        const resolver = new PublicGuestShareResolver();
        const publicCtx: AppContext = {
            dataSource: {} as sql.ConnectionPool,
            dataSources: [],
            userPayload: { email: '', userRecord: null, sessionId: '' },
            providers: [{ type: 'Read-Only', provider: currentProvider }],
        };
        const gqlResolved = await resolver.ResolvePublicArtifactGuestShare(token, publicCtx);
        expect(gqlResolved.Success).toBe(true);
        expect(gqlResolved.Valid).toBe(true);
        expect(gqlResolved.ReadOnly).toBe(true);
        expect(gqlResolved.ShareMode).toBe('Frozen');
        expect(gqlResolved.VersionNumber).toBe(7);
        const scrubbedCfg = JSON.parse(gqlResolved.Configuration ?? '{}') as JsonObject;
        expect(scrubbedCfg['previewSnapshot']).toBeDefined();
        expect(scrubbedCfg['guestShareLinks']).toBeUndefined();
        expect(scrubbedCfg['webhookSecret']).toBeUndefined();

        // Rejects spreadsheet live table with Mode !== 'Frozen'
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 8,
            ContentMode: 'Text',
            Content: JSON.stringify({
                WorkbookID: 'wb-1',
                Worksheets: [
                    {
                        SheetID: 's1',
                        Name: 'Sheet1',
                        LiveTables: [{ TableID: 'lt-1', Title: 'Live Table' }],
                        Cells: {},
                    },
                ],
            }),
            Configuration: '{}',
        });
        const liveTableRejected = await DispatchRemoteOperationInProcess<CreateGuestShareLinkInput, CreateGuestShareLinkOutput>(
            ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
            { ArtifactID: ARTIFACT_ID, VersionID: VERSION_ID },
            {},
            currentProvider,
            shareOnlyUser,
        );
        expect(liveTableRejected.Success).toBe(false);
        expect(liveTableRejected.ResultCode).toBe('FROZEN_REQUIRED');

        // Unauthenticated REST /guest-share/resolve router mounts ONLY POST /resolve (GET ?token= removed for security)
        const router = CreatePublicGuestShareRouter() as Router & {
            stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
        };
        const routePaths = router.stack
            .filter((layer) => layer.route)
            .map((layer) => ({ path: layer.route!.path, methods: layer.route!.methods }));
        expect(routePaths.some((r) => r.path === '/resolve' && r.methods['get'])).toBe(false);
        expect(routePaths.some((r) => r.path === '/resolve' && r.methods['post'])).toBe(true);
        const _dummyReqResCheck: [Request | null, Response | null] = [null, null];
        expect(_dummyReqResCheck).toHaveLength(2);
    });

    it('P0-12 & P1-4 & NW-5: closes Slide/Sheet lock bypasses, preserves workbook timestamps on hydrate, and validates RedisTicketReplayStore + ZSET HasRoomPeers', async () => {
        const resetRoom = async () => {
            workingStatesByArtId.clear();
            await ArtifactCollaborationServer.Instance.Shutdown();
            Reflect.set(ArtifactCollaborationServer.Instance, '_shuttingDown', false);
            ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(currentProvider);
        };

        // 1. P0-12: Unlocked slide containing a locked mj-block region cannot be deleted by non-owner
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck With Locked Region');
        const slideOne = deck.Slides[0]!;
        slideOne.Locked = false;
        slideOne.Regions.push({
            RegionID: 'reg-locked-1',
            Kind: 'mj-block',
            Zone: 'body',
            Locked: true,
            LockedByUserID: OWNER_ID,
            BlockSpec: {
                BlockID: 'blk-1',
                Kind: 'EntityView',
                Mode: 'Live',
                EntityName: 'MJ: Users',
            },
        });
        const deckBefore = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        deck.Slides = []; // non-owner deletes entire slide holding locked region
        const deckAfterDelete = SlideDeckEngine.Instance.SerializeDeckSpec(deck);

        await resetRoom();
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 10,
            Content: deckBefore,
        });
        const deleteBlocked = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            ARTIFACT_ID,
            deckAfterDelete,
            EDITOR_USER,
            false,
        );
        expect(deleteBlocked.Success).toBe(false);
        expect(deleteBlocked.ErrorMessage).toMatch(/locked/i);

        // 2. P1-4: Hydrating a cold-open workbook preserves original ModifiedAt timestamp (no false DirtyVersion)
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Cold Open Sheet');
        wb.ModifiedAt = '2025-05-01T12:00:00.000Z';
        const wbJson = SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
        await resetRoom();
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 11,
            Content: wbJson,
        });
        const room = await ArtifactCollaborationServer.Instance.GetOrCreateRoom(ARTIFACT_ID, OWNER_USER, currentProvider);
        expect(room).not.toBeNull();
        expect(room!.DirtyVersion).toBe(false);

        // 3. NW-5: RedisTicketReplayStore single-use SET PX NX + RedisYjsRoomRelay ZSET peer detection
        const ticketStoreSet = new Set<string>();
        const zsetMembers = new Map<string, number>();
        const mockRedisClient = {
            set: vi.fn(async (key: string, _val: string, _px: string, _ttl: number, _nx: string) => {
                if (ticketStoreSet.has(key)) return null;
                ticketStoreSet.add(key);
                return 'OK';
            }),
            zremrangebyscore: vi.fn(async (_key: string, _min: number, max: number) => {
                for (const [member, score] of Array.from(zsetMembers.entries())) {
                    if (score <= max) zsetMembers.delete(member);
                }
                return 0;
            }),
            zadd: vi.fn(async (_key: string, score: number, member: string) => {
                zsetMembers.set(member, score);
                return 1;
            }),
            pexpire: vi.fn(async () => 1),
            zrange: vi.fn(async () => Array.from(zsetMembers.keys())),
            zrem: vi.fn(async (_key: string, member: string) => {
                zsetMembers.delete(member);
                return 1;
            }),
        };
        const mockRedisProvider = Object.defineProperties(
            Object.create(RedisLocalStorageProvider.prototype) as RedisLocalStorageProvider,
            {
                Client: { value: mockRedisClient, enumerable: true, configurable: true },
                IsPubSubEnabled: { value: false, enumerable: true, configurable: true },
                TryAcquireLease: { value: vi.fn(async () => true), enumerable: true, configurable: true },
                ReleaseLease: { value: vi.fn(async () => undefined), enumerable: true, configurable: true },
            },
        );

        const ticketStore = new RedisTicketReplayStore(mockRedisProvider);
        expect(await ticketStore.ConsumeNonce('nonce-abc', 30_000)).toBe(true);
        expect(await ticketStore.ConsumeNonce('nonce-abc', 30_000)).toBe(false);

        const relaySelf = new RedisYjsRoomRelay(mockRedisProvider, 'node-self');
        zsetMembers.set('node-self', Date.now() + 30_000);
        expect(await relaySelf.HasRoomPeers('room-1')).toBe(false);
        zsetMembers.set('node-peer-expired', Date.now() - 100);
        expect(await relaySelf.HasRoomPeers('room-1')).toBe(false);
        zsetMembers.set('node-peer-live', Date.now() + 30_000);
        expect(await relaySelf.HasRoomPeers('room-1')).toBe(true);
    });
});
