import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJActionEntityExtended } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { AIRerankerRunner } from '@memberjunction/ai-reranker';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    SlideDeckEngine,
    SpreadsheetEngine,
} from '@memberjunction/core-entities';
import { GovernedArtifactService, LoadedGovernedArtifactState } from '../GovernedArtifactService';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { RealtimeClientSessionService } from '../realtime/realtime-client-session-service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ART_ID = '22222222-2222-4222-8222-222222222222';
const VER_ID = '33333333-3333-4333-8333-333333333333';
const COL_ID = '44444444-4444-4444-8444-444444444444';
const ENV_ID = '55555555-5555-4555-8555-555555555555';
const TYPE_SHEET_ID = '66666666-6666-4666-8666-666666666666';

function makeUser(id = USER_ID, name = 'Audit Tester'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@example.com`;
    u.IsActive = true;
    return u;
}

class TestableRealtimeClientSessionService extends RealtimeClientSessionService {
    public ExposeMapActionToToolDefinition(action: MJActionEntityExtended, wireName?: string) {
        return this.mapActionToToolDefinition(action, wireName);
    }
}

describe('Audit 178 & Live Voice Bug Regressions', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('[P0-16] GovernedArtifactService.RefreshAndSnapshotArtifact digest stability', () => {
        it('returns changed: false (NO_CHANGES) after >= 15ms delay for Spreadsheet, SlideDeck, and Markdown Document', async () => {
            const service = GovernedArtifactService.Instance;
            const user = makeUser();
            const provider = { Entities: [], EntityByName: () => null } as never as IMetadataProvider;

            vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
            vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
                ArtifactID: ART_ID,
                UserID: USER_ID,
                IsOwner: false,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                HasDirectPermissions: false,
                GrantedBy: 'role',
            });
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async () => ({
                    Success: true,
                    ErrorMessage: '',
                    Results: [],
                    TotalRowCount: 0,
                    RowCount: 0,
                    ExecutionTime: 1,
                    UserViewID: '',
                })),
            } as never);

            const fullEditPerms = {
                ArtifactID: ART_ID,
                UserID: USER_ID,
                IsOwner: true,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                HasDirectPermissions: true,
                GrantedBy: 'owner' as const,
            };

            // 1. Spreadsheet with cells across >= 20ms delay (PreserveTimestamps + UpdatedAt canonicalization)
            const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('RevenueSheet', ['Summary']);
            const ws = wb.Worksheets[0];
            SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A1', { Value: 'Region' }, false);
            SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B1', { Value: 1200 }, false);
            SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
            const sheetJson = SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });

            await new Promise((resolve) => setTimeout(resolve, 20));

            const loadSpy = vi.spyOn(service, 'LoadReadableArtifactState');
            const makeState = (
                typeName: string,
                driverClass: string,
                content: string,
                name: string,
            ): LoadedGovernedArtifactState => ({
                artifactId: ART_ID,
                ownerUserId: USER_ID,
                name,
                typeName,
                driverClass,
                versionId: VER_ID,
                versionNumber: 1,
                dbVersionNumber: 1,
                contentMode: 'Text',
                content,
                mimeType: 'application/json',
                permissions: fullEditPerms,
                liveRoomHydrated: false,
            });

            loadSpy.mockResolvedValueOnce({
                state: makeState('Excel Spreadsheet', 'SpreadsheetArtifactViewerPlugin', sheetJson, 'Revenue.xlsx'),
            });
            const sheetRes = await service.RefreshAndSnapshotArtifact({
                provider,
                contextUser: user,
                artifactId: ART_ID,
            });
            expect(sheetRes.errorMessage).toBeUndefined();
            expect(sheetRes.success).toBe(true);
            expect(sheetRes.changed).toBe(false);
            expect(sheetRes.resultCode).toBe('NO_CHANGES');

            // 2. SlideDeck with UpdatedAt advancing across >= 20ms delay (no live blocks -> matches baseline directly;
            //    with live blocks -> matches stored livingReportDigest from prior snapshot)
            const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Q4 Review', 'deck-1');
            deck.Slides = deck.Slides.slice(0, 2);
            const deckJson = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
            await new Promise((resolve) => setTimeout(resolve, 20));

            loadSpy.mockResolvedValueOnce({
                state: makeState('Presentation', 'SlideDeckArtifactViewerPlugin', deckJson, 'Q4 Review'),
            });
            const deckRes = await service.RefreshAndSnapshotArtifact({
                provider,
                contextUser: user,
                artifactId: ART_ID,
            });
            expect(deckRes.errorMessage).toBeUndefined();
            expect(deckRes.success).toBe(true);
            expect(deckRes.changed).toBe(false);
            expect(deckRes.resultCode).toBe('NO_CHANGES');

            // Also verify RefreshArtifactPayloadInMemory -> stored livingReportDigest -> RefreshAndSnapshotArtifact stays NO_CHANGES across >= 20ms for full deck with live block
            const liveDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Live Portfolio', 'deck-live');
            const liveDeckJson = SlideDeckEngine.Instance.SerializeDeckSpec(liveDeck);
            const inMem = await service.RefreshArtifactPayloadInMemory({
                artifactId: ART_ID,
                content: liveDeckJson,
                driverClass: 'SlideDeckArtifactViewerPlugin',
                artifactTypeName: 'Presentation',
                contextUser: user,
                provider,
                title: 'Live Portfolio',
            });
            await new Promise((resolve) => setTimeout(resolve, 20));
            loadSpy.mockResolvedValueOnce({
                state: {
                    ...makeState('Presentation', 'SlideDeckArtifactViewerPlugin', inMem.updatedContent, 'Live Portfolio'),
                    configuration: inMem.updatedConfiguration,
                },
            });
            const liveDeckRes = await service.RefreshAndSnapshotArtifact({
                provider,
                contextUser: user,
                artifactId: ART_ID,
            });
            expect(liveDeckRes.errorMessage).toBeUndefined();
            expect(liveDeckRes.success).toBe(true);
            expect(liveDeckRes.changed).toBe(false);
            expect(liveDeckRes.resultCode).toBe('NO_CHANGES');

            // 3. Markdown Document across >= 15ms delay
            const md = '# Executive Brief\n\nAll quarterly KPIs met.\n';
            await new Promise((resolve) => setTimeout(resolve, 20));

            loadSpy.mockResolvedValueOnce({
                state: makeState('Markdown Document', 'MarkdownArtifactViewerPlugin', md, 'Brief.md'),
            });
            const mdRes = await service.RefreshAndSnapshotArtifact({
                provider,
                contextUser: user,
                artifactId: ART_ID,
            });
            expect(mdRes.errorMessage).toBeUndefined();
            expect(mdRes.success).toBe(true);
            expect(mdRes.changed).toBe(false);
            expect(mdRes.resultCode).toBe('NO_CHANGES');
        });
    });

    describe('[NW-6] GovernedArtifactService.CreateGovernedArtifact InitialOperations', () => {
        it('applies InitialOperations atomically before saving v1 and aborts with zero saves on op failure', async () => {
            const service = GovernedArtifactService.Instance;
            const user = makeUser();

            vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
            vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockImplementation((name: string) => {
                if (name === 'Excel Spreadsheet') {
                    return {
                        ID: TYPE_SHEET_ID,
                        Name: 'Excel Spreadsheet',
                        DriverClass: 'SpreadsheetArtifactViewerPlugin',
                        ContentType: 'application/json',
                        IsEnabled: true,
                    } as never;
                }
                return undefined;
            });

            const savedEntities: Array<{ entityName: string; fields: Record<string, string | number | boolean | null | object> }> = [];
            let seq = 1;
            const provider = {
                Entities: [],
                GetEntityObject: vi.fn(async (entityName: string) => {
                    const backing: Record<string, string | number | boolean | null | object> = {};
                    const id = `99999999-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
                    return new Proxy(
                        {
                            NewRecord: () => {
                                backing['ID'] = id;
                            },
                            Save: async () => {
                                savedEntities.push({ entityName, fields: { ...backing } });
                                return true;
                            },
                        } as Record<string, object | (() => void) | (() => Promise<boolean>)>,
                        {
                            get(target, prop: string) {
                                if (prop in target) return target[prop];
                                return backing[prop];
                            },
                            set(_target, prop: string, val: string | number | boolean | null | object) {
                                backing[prop] = val;
                                return true;
                            },
                        },
                    ) as never;
                }),
            } as IMetadataProvider;

            const okRes = await service.CreateGovernedArtifact({
                provider,
                contextUser: user,
                environmentId: ENV_ID,
                title: 'Atomic Budget',
                artifactType: 'Excel Spreadsheet',
                initialOperations: [
                    {
                        tool: 'write_cells',
                        input: {
                            cells: [
                                { r: 0, c: 0, v: 'Department' },
                                { r: 0, c: 1, v: 42000 },
                            ],
                        },
                    },
                ],
            });

            expect(okRes.success).toBe(true);
            expect(okRes.versionNumber).toBe(1);
            expect(okRes.results).toHaveLength(1);
            expect(okRes.results?.[0].tool).toBe('write_cells');
            expect(okRes.results?.[0].data).toBeTruthy();

            const versionSaves = savedEntities.filter((s) => s.entityName === 'MJ: Artifact Versions');
            expect(versionSaves).toHaveLength(1);
            expect(versionSaves[0].fields['VersionNumber']).toBe(1);
            const savedContent = String(versionSaves[0].fields['Content'] ?? '');
            const parsedWb = SpreadsheetEngine.Instance.ParseWorkbook(savedContent);
            expect(parsedWb.Worksheets[0].Cells['A1']?.RawValue).toBe('Department');
            expect(parsedWb.Worksheets[0].Cells['B1']?.RawValue).toBe(42000);

            // Failed operation in InitialOperations must abort BEFORE saving MJ: Artifacts or Version 1
            savedEntities.length = 0;
            const failRes = await service.CreateGovernedArtifact({
                provider,
                contextUser: user,
                environmentId: ENV_ID,
                title: 'Aborted Budget',
                artifactType: 'Excel Spreadsheet',
                initialOperations: [
                    {
                        tool: 'write_cells',
                        input: { cells: [{ r: 0, c: 0, v: 'Good' }] },
                    },
                    {
                        tool: 'write_cells',
                        input: { cells: [{ r: -5, c: 0, v: 'Bad' }] },
                    },
                ],
            });
            expect(failRes.success).toBe(false);
            expect(failRes.errorMessage).toContain('Invalid cell coordinates');
            expect(savedEntities).toHaveLength(0);
        });
    });

    describe('[NW-2] GovernedArtifactService Permissions', () => {
        it('delegates CheckCollectionPermission to ResolveCollectionAncestryPermissions and ListWorkspaceArtifacts to BuildReadableArtifactIdSet', async () => {
            const service = GovernedArtifactService.Instance;
            const user = makeUser();
            const provider = { Entities: [], EntityByName: () => null } as never as IMetadataProvider;

            vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
            vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
                ArtifactID: ART_ID,
                UserID: USER_ID,
                IsOwner: false,
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                HasDirectPermissions: false,
                GrantedBy: 'role',
            });

            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async (params: { EntityName?: string }) => {
                    if (params.EntityName === 'MJ: Collections') {
                        return {
                            Success: true,
                            ErrorMessage: '',
                            Results: [{ ID: COL_ID, EnvironmentID: ENV_ID }],
                            TotalRowCount: 1,
                            RowCount: 1,
                            ExecutionTime: 1,
                            UserViewID: '',
                        };
                    }
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            ErrorMessage: '',
                            Results: [
                                {
                                    ID: ART_ID,
                                    Name: 'Shared Role Artifact',
                                    TypeID: TYPE_SHEET_ID,
                                    Type: 'Excel Spreadsheet',
                                    UserID: '99999999-9999-4999-8999-999999999999',
                                    EnvironmentID: ENV_ID,
                                    __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
                                },
                            ],
                            TotalRowCount: 1,
                            RowCount: 1,
                            ExecutionTime: 1,
                            UserViewID: '',
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            ErrorMessage: '',
                            Results: [{ ID: VER_ID, ArtifactID: ART_ID, VersionNumber: 2, Name: 'v2' }],
                            TotalRowCount: 1,
                            RowCount: 1,
                            ExecutionTime: 1,
                            UserViewID: '',
                        };
                    }
                    return { Success: true, ErrorMessage: '', Results: [], TotalRowCount: 0, RowCount: 0, ExecutionTime: 1, UserViewID: '' };
                }),
            } as never);

            const ancestrySpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolveCollectionAncestryPermissions');
            ancestrySpy.mockResolvedValueOnce({
                CanRead: true,
                CanEdit: true,
                CanDelete: false,
                CanShare: false,
                Source: 'Ancestor',
            } as never);

            const allowed = await service.CheckCollectionPermission(provider, user, COL_ID, 'edit');
            expect(allowed.allowed).toBe(true);
            expect(ancestrySpy).toHaveBeenCalledWith(provider, COL_ID, user);

            ancestrySpy.mockResolvedValueOnce({
                CanRead: true,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'Viewer',
            } as never);
            const denied = await service.CheckCollectionPermission(provider, user, COL_ID, 'edit');
            expect(denied.allowed).toBe(false);
            expect(denied.reason).toContain('Permission denied');

            const readableSpy = vi
                .spyOn(ArtifactPermissionEngine.Instance, 'TryBuildReadableArtifactIdSet')
                .mockResolvedValue(new Set([ART_ID.toLowerCase()]));

            const listRes = await service.ListWorkspaceArtifacts({
                provider,
                contextUser: user,
                environmentId: ENV_ID,
                limit: 10,
            });
            expect(listRes.success).toBe(true);
            expect(readableSpy).toHaveBeenCalledWith(provider, user);
            expect(listRes.artifacts).toHaveLength(1);
            expect(listRes.artifacts[0].artifactId).toBe(ART_ID);

            // R7-4 + S7-5: Failed TryBuildReadableArtifactIdSet returns { success: false } cleanly
            readableSpy.mockResolvedValueOnce(null);
            const failedListRes = await service.ListWorkspaceArtifacts({
                provider,
                contextUser: user,
                environmentId: ENV_ID,
                limit: 10,
            });
            expect(failedListRes.success).toBe(false);
            expect(failedListRes.artifacts).toHaveLength(0);
        });
    });

    describe('RealtimeClientSessionService Array Schema & Session Artifact Version Guard', () => {
        it('emits array items schema on IsArray action params and preserves newer LatestVersionNumber in RecordSessionArtifacts', () => {
            const svc = new TestableRealtimeClientSessionService();
            const fakeAction = {
                Name: 'Mutate Governed Artifact',
                Description: 'Mutate an artifact',
                Params: {
                    Items: [
                        { Name: 'ArtifactID', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: true, Description: 'Artifact UUID' },
                        { Name: 'Operations', Type: 'Input', ValueType: 'Simple Object', IsArray: true, IsRequired: false, Description: 'Operations list' },
                        { Name: 'Tags', Type: 'Input', ValueType: 'Scalar', IsArray: true, IsRequired: false, Description: 'String tags' },
                    ],
                },
            } as never;

            const def = svc.ExposeMapActionToToolDefinition(fakeAction);
            const props = def.ParametersSchema.properties as Record<string, { type?: string; items?: Record<string, object | string | string[]> }>;
            expect(props['Operations'].type).toBe('array');
            expect(props['Operations'].items).toBeDefined();
            expect(props['Operations'].items?.type).toBe('object');
            expect(props['Operations'].items?.required).toEqual(['tool']);
            expect(props['Tags'].type).toBe('array');
            expect(props['Tags'].items).toEqual({ type: 'string' });

            // Version monotonicity guard in RecordSessionArtifacts
            svc.RecordSessionArtifacts('session-voice-1', [
                {
                    ArtifactID: ART_ID,
                    Name: 'Sales Model',
                    ArtifactType: 'Excel Spreadsheet',
                    LatestVersionID: 'ver-v3-uuid',
                    LatestVersionNumber: 3,
                },
            ]);
            // Stale follow-up turn passes v1 from initial conversation snapshot -> must NOT overwrite v3
            svc.RecordSessionArtifacts('session-voice-1', [
                {
                    ArtifactID: ART_ID,
                    Name: 'Sales Model',
                    ArtifactType: 'Excel Spreadsheet',
                    LatestVersionID: 'ver-v1-uuid',
                    LatestVersionNumber: 1,
                },
            ]);
            const recorded = svc.GetSessionArtifacts('session-voice-1');
            expect(recorded).toHaveLength(1);
            expect(recorded[0].LatestVersionID).toBe('ver-v3-uuid');
            expect(recorded[0].LatestVersionNumber).toBe(3);
        });
    });

    describe('ArtifactToolManager follow_source_link custom PK & rerankerName passthrough', () => {
        it('uses FirstPrimaryKey.Name on follow_source_link and forwards rerankerName to AIRerankerRunner.RunRerank', async () => {
            const user = makeUser();
            vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
                ArtifactID: ART_ID,
                UserID: USER_ID,
                IsOwner: true,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                HasDirectPermissions: true,
                GrantedBy: 'owner',
            });
            const ordersFilterCalls: string[] = [];
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async (params: { EntityName?: string; ExtraFilter?: string }) => {
                    if (params.EntityName === 'Orders' && params.ExtraFilter) {
                        ordersFilterCalls.push(params.ExtraFilter);
                    }
                    return {
                        Success: true,
                        ErrorMessage: '',
                        Results: [{ OrderKey: 'ord-42', TotalAmount: 1500 }],
                        TotalRowCount: 1,
                        RowCount: 1,
                        ExecutionTime: 1,
                        UserViewID: '',
                    };
                }),
            } as never);

            vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue();
            Object.defineProperty(AIEngine.Instance, 'Models', {
                configurable: true,
                get: () => [{ ID: 'model-rerank-1', Name: 'Cohere Rerank v3' }],
            });
            Object.defineProperty(AIEngine.Instance, 'Prompts', {
                configurable: true,
                get: () => [],
            });
            const rerankSpy = vi.spyOn(AIRerankerRunner.prototype, 'RunRerank').mockResolvedValue({
                Success: true,
                Response: { results: [{ id: 'A1', relevanceScore: 0.99 }] },
            } as never);

            const mockProvider = {
                Entities: [
                    {
                        Name: 'Orders',
                        FirstPrimaryKey: { Name: 'OrderKey' },
                    },
                ],
                EntityByName: (name: string) =>
                    name === 'Orders'
                        ? { Name: 'Orders', FirstPrimaryKey: { Name: 'OrderKey' } }
                        : null,
            } as IMetadataProvider;

            const searchSpec = JSON.stringify({
                SchemaVersion: 1,
                Query: 'high value orders',
                Results: [
                    {
                        AlphaID: 'A1',
                        Title: 'Order #42',
                        Score: 0.72,
                        EntityName: 'Orders',
                        RecordID: 'ord-42',
                        Snippet: 'Enterprise renewal',
                    },
                ],
            });

            const manager = new ArtifactToolManager();
            manager.Initialize(
                [
                    {
                        name: 'Search Results',
                        typeName: 'Search Result Set',
                        toolLibraryClass: 'SearchResultSetToolLibrary',
                        artifactId: ART_ID,
                        versionId: VER_ID,
                        versionNumber: 1,
                        content: searchSpec,
                    },
                ],
                { contextUser: user, provider: mockProvider },
            );

            // 1. follow_source_link uses OrderKey instead of hardcoded ID
            const followRes = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'follow_source_link',
                input: { rowId: 'A1' },
            });
            expect(followRes.result.errorMessage).toBeUndefined();
            expect(followRes.result.success).toBe(true);
            expect(ordersFilterCalls).toContain("OrderKey='ord-42'");
            expect(ordersFilterCalls.some((f) => f.startsWith("ID='"))).toBe(false);

            // 2. rerankInline forwards rerankerName + resolved ModelID to AIRerankerRunner.RunRerank
            const rerankRes = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'rerankInline',
                input: { rerankerName: 'Cohere Rerank v3' },
            });
            expect(rerankRes.result.errorMessage).toBeUndefined();
            expect(rerankRes.result.success).toBe(true);
            expect(rerankSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    ModelID: 'model-rerank-1',
                    options: expect.objectContaining({ rerankerName: 'Cohere Rerank v3' }),
                }),
            );
        });
    });

    describe('[B7b + Mutate cap] GovernedArtifactService highlightLines sanitization & op cap', () => {
        it('scrubs =MJ.* spill children and transitive formula outputs from RefreshArtifactPayloadInMemory highlightLines (B7b)', async () => {
            const service = GovernedArtifactService.Instance;
            const user = makeUser();
            const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('SensitiveSheet', ['Data']);
            const ws = wb.Worksheets[0];
            // Static non-MJ cell MUST stay visible
            SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A1', { Value: 'PublicQuarter' }, false);
            // Dynamic =MJ.QUERY cell, its spilled output row A3/B3, and transitive dependent C1 MUST be scrubbed
            SpreadsheetEngine.Instance.SetCell(
                wb,
                ws.SheetID,
                'A2',
                { Formula: '=MJ.QUERY("SensitiveSalaries", A1)', CachedResult: [['Alice'], ['195000']] },
                false,
            );
            SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A3', { Value: 'SecretSalarySpill' }, false);
            SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B3', { Value: 195000 }, false);
            SpreadsheetEngine.Instance.SetCell(
                wb,
                ws.SheetID,
                'C1',
                { Formula: '=B3*2', Value: 390000, CachedResult: 390000 },
                false,
            );

            // Wire SpillRange onto A2 via Cells map so CloneWorkbookWithoutViewerScopedData sees its spill origin
            ws.Cells['A2'] = {
                ...ws.Cells['A2'],
                SpillRange: { Rows: 2, Cols: 2, EndAddress: 'B3' },
            };
            ws.Cells['A3'] = {
                ...ws.Cells['A3'],
                SpilledFrom: 'A2',
            };
            ws.Cells['B3'] = {
                ...ws.Cells['B3'],
                SpilledFrom: 'A2',
            };

            const content = SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
            const provider = { Entities: [], EntityByName: () => null } as never as IMetadataProvider;
            const refreshed = await service.RefreshArtifactPayloadInMemory({
                provider,
                contextUser: user,
                artifactId: ART_ID,
                typeName: 'Excel Spreadsheet',
                content,
            });
            const joinedHighlights = refreshed.highlightLines.join('\n');
            expect(joinedHighlights).toContain('PublicQuarter');
            expect(joinedHighlights).not.toContain('SecretSalarySpill');
            expect(joinedHighlights).not.toContain('195000');
            expect(joinedHighlights).not.toContain('390000');
        });

        it('rejects MutateGovernedArtifact when operations array exceeds 100 items', async () => {
            const service = GovernedArtifactService.Instance;
            const user = makeUser();
            const provider = { Entities: [], EntityByName: () => null } as never as IMetadataProvider;
            vi.spyOn(service, 'LoadReadableArtifactState').mockResolvedValueOnce({
                state: {
                    artifactId: ART_ID,
                    ownerUserId: USER_ID,
                    name: 'Test',
                    typeName: 'Markdown Document',
                    driverClass: 'MarkdownArtifactViewerPlugin',
                    versionId: VER_ID,
                    versionNumber: 1,
                    dbVersionNumber: 1,
                    contentMode: 'Text',
                    content: '# Hello',
                    mimeType: 'text/markdown',
                    permissions: {
                        ArtifactID: ART_ID,
                        UserID: USER_ID,
                        IsOwner: true,
                        CanRead: true,
                        CanEdit: true,
                        CanDelete: true,
                        CanShare: true,
                        HasDirectPermissions: true,
                        GrantedBy: 'owner',
                    },
                    liveRoomHydrated: false,
                },
            });
            const tooManyOps = Array.from({ length: 101 }, () => ({
                tool: 'append_markdown',
                input: { markdown: 'x' },
            }));
            const res = await service.MutateGovernedArtifact({
                provider,
                contextUser: user,
                artifactId: ART_ID,
                operations: tooManyOps,
            });
            expect(res.success).toBe(false);
            expect(res.errorMessage).toContain('100');
        });

        it('fails closed in DocumentToolLibrary embed_artifact_block when contextUser is missing', async () => {
            const docLib = new DocumentToolLibrary();
            const res = await docLib.InvokeTool(
                'embed_artifact_block',
                {
                    artifactId: ART_ID,
                    title: 'Unauthenticated Embed',
                },
                '# Header',
                {},
            );
            expect(res.success).toBe(false);
            expect(res.errorMessage).toMatch(/authenticated user context/i);
        });
    });
});
