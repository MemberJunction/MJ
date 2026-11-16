import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DispatchRemoteOperationInProcess,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
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
    type CreateGuestShareLinkInput,
    type CreateGuestShareLinkOutput,
    MAX_AI_FORMULA_BATCH_CELLS,
    type ResolveGuestShareLinkInput,
    type ResolveGuestShareLinkOutput,
    type RevokeGuestShareLinkInput,
    type RevokeGuestShareLinkOutput,
    SlideDeckEngine,
    SpreadsheetEngine,
    type MJArtifactTypeEntity,
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
import {
    LoadArtifactGuestShareOperations,
    SetGuestShareSigningSecret,
} from '../operations/ArtifactGuestShareServerOperations.js';

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

describe('MJServer Next Horizons Operations & Lock Enforcement', () => {
    const auditRows: Array<Record<string, unknown>> = [];
    const versionsById = new Map<string, Record<string, unknown>>();
    const workingStatesByArtId = new Map<string, Record<string, unknown>>();
    let resolvePermsSpy: ReturnType<typeof vi.spyOn> | null = null;
    let sysUserSpy: ReturnType<typeof vi.spyOn> | null = null;
    let artConfigSpy: ReturnType<typeof vi.spyOn> | null = null;
    let artTypesSpy: ReturnType<typeof vi.spyOn> | null = null;
    let currentProvider: IMetadataProvider;

    function createMockProvider(): IMetadataProvider {
        const makeEntityProxy = (entityName: string, initial?: Record<string, unknown>) => {
            const fields: Record<string, unknown> = {
                ID:
                    entityName === 'MJ: Audit Logs'
                        ? `audit-${auditRows.length + 1}`
                        : entityName === 'MJ: Artifact Versions'
                          ? `ver-${versionsById.size + 1}`
                          : `ws-${workingStatesByArtId.size + 1}`,
                ...(initial ?? {}),
            };
            return new Proxy(fields, {
                get(target, prop) {
                    if (prop === 'NewRecord') return () => true;
                    if (prop === 'Load') return async () => true;
                    if (prop === 'LoadFromData') {
                        return async (data: Record<string, unknown>) => {
                            Object.assign(target, data);
                            return true;
                        };
                    }
                    if (prop === 'Save') {
                        return async () => {
                            if (entityName === 'MJ: Audit Logs') {
                                auditRows.push({ ...target });
                            } else if (entityName === 'MJ: Artifact Versions') {
                                versionsById.set(String(target['ID']), { ...target });
                            } else if (entityName === 'MJ: Artifact Working States') {
                                workingStatesByArtId.set(String(target['ArtifactID'] ?? ''), { ...target });
                            }
                            return true;
                        };
                    }
                    if (prop === 'GetAll') return () => ({ ...target });
                    return target[prop as string];
                },
                set(target, prop, value) {
                    target[prop as string] = value;
                    return true;
                },
            }) as unknown as MJAuditLogEntity & MJArtifactVersionEntity;
        };

        const runViewFn = async (params: { EntityName: string; ResultType?: string }) => {
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

        const mock = {
            Entities: [],
            AuditLogTypes: [
                { ID: 'alt-1', Name: 'Artifact Block Frozen' },
                { ID: 'alt-2', Name: 'Artifact Guest Share Link' },
                { ID: 'alt-3', Name: 'Artifact Connected Drive Sync' },
                { ID: 'alt-4', Name: 'Artifact Exported' },
                { ID: 'alt-5', Name: 'Artifact Permission Changed' },
            ],
            EntityByName: (name: string) => ({ ID: `entity-${name}`, Name: name }),
            GetEntityObject: async (entityName: string) => makeEntityProxy(entityName),
            RunView: runViewFn,
            RunViews: async (paramsArray: Array<{ EntityName: string; ResultType?: string }>) =>
                Promise.all(paramsArray.map((p) => runViewFn(p))),
        } as unknown as IMetadataProvider & IRunViewProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(
            mock as unknown as ReturnType<typeof RunView.FromMetadataProvider>,
        );
        return mock;
    }

    beforeEach(async () => {
        auditRows.length = 0;
        versionsById.clear();
        workingStatesByArtId.clear();
        SetGuestShareSigningSecret('unit-test-guest-share-secret-32bytes!!');

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
        artTypesSpy = vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
            {
                ID: ART_TYPE_ID,
                Name: 'Markdown Document',
                DriverClass: 'MarkdownArtifactViewerPlugin',
            } as unknown as MJArtifactTypeEntity,
        ]);
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
        (server as unknown as { _shuttingDown: boolean })._shuttingDown = false;
        server.SetMetadataProviderOverride(currentProvider);
    });

    afterEach(async () => {
        SetGuestShareSigningSecret(null);
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

        // Frozen block succeeds
        versionsById.set(VERSION_ID, {
            ID: VERSION_ID,
            ArtifactID: ARTIFACT_ID,
            VersionNumber: 2,
            Content: [
                '# Frozen Report',
                '',
                ':::mj-block',
                '{"BlockID":"b1","Kind":"EntityView","Mode":"Frozen","EntityName":"MJ: Users"}',
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
            (ArtifactCollaborationServer.Instance as unknown as { _shuttingDown: boolean })._shuttingDown = false;
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
});
