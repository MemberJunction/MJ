import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { BaseLLM, ChatResult } from '@memberjunction/ai';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    SpreadsheetEngine,
    type MJArtifactTypeEntity,
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { DocumentCollaborationResolver } from '../resolvers/DocumentCollaborationResolver.js';
import type { AppContext } from '../types.js';

vi.mock('../config.js', () => ({
    configInfo: {
        apiBasePath: '/',
        cors: { allowedOrigins: ['*'] },
    },
}));

vi.mock('../context.js', () => ({
    getUserPayload: vi.fn(async () => null),
}));

const ART_DOC_ID = '11111111-1111-4111-8111-111111111111';
const ART_SHEET_ID = '22222222-2222-4222-8222-222222222222';
const ART_SECRET_ID = '99999999-9999-4999-8999-999999999999';
const COL_EDIT_ID = '33333333-3333-4333-8333-333333333333';
const COL_DENIED_ID = '44444444-4444-4444-8444-444444444444';
const ENV_ID = '55555555-5555-4555-8555-555555555555';
const TYPE_PRES_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';

interface SavedEntityRecord {
    EntityName: string;
    Fields: Record<string, string | number | boolean | null>;
}

describe('DocumentCollaborationResolver.SynthesizeArtifactFromSources', () => {
    let resolver: DocumentCollaborationResolver;
    let savedRecords: SavedEntityRecord[];
    let mockUser: UserInfo;
    let mockProvider: IMetadataProvider;
    let appContext: AppContext;

    function buildWorkbookJson(): string {
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Revenue Workbook');
        const sheet = wb.Worksheets[0];
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A1', { Value: 'Quarter' });
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'B1', { Value: 'Revenue' });
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A2', { Value: 'Q1' });
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'B2', { Value: 910000 });
        sheet.Charts = [
            {
                ChartID: 'chart-q1',
                Title: 'Q1 Revenue Curve',
                ChartType: 'bar',
                SheetID: sheet.SheetID,
                SourceRange: 'A1:B2',
                PositionCell: 'D2',
            },
        ];
        return SpreadsheetEngine.Instance.SerializeWorkbook(wb);
    }

    beforeEach(() => {
        savedRecords = [];
        mockUser = { ID: USER_ID, Name: 'Synthesis Author', Email: 'synth@example.com' } as UserInfo;

        const presTypeStub = {
            ID: TYPE_PRES_ID,
            Name: 'Presentation',
            DriverClass: 'SlideDeckArtifactViewerPlugin',
            IsEnabled: true,
            Configuration: JSON.stringify({ Thumbnail: { Enabled: true, Mode: 'Rendered' } }),
        } as MJArtifactTypeEntity;
        const docTypeStub = {
            ID: '66666666-6666-4666-8666-666666666667',
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            IsEnabled: true,
            Configuration: JSON.stringify({ Thumbnail: { Enabled: true, Mode: 'Rendered' } }),
        } as MJArtifactTypeEntity;

        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockImplementation((name) => {
            if (name === 'Presentation') return presTypeStub;
            if (name === 'Markdown Document') return docTypeStub;
            return undefined;
        });
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
            presTypeStub,
            docTypeStub,
        ]);

        let seq = 1;
        mockProvider = {
            Entities: [],
            GetEntityObject: vi.fn(async (entityName: string) => {
                const store: Record<string, string | number | boolean | null> = {};
                const generatedId = `bbbbbbbb-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
                const proxy = new Proxy(
                    {
                        NewRecord: () => {
                            store['ID'] = generatedId;
                        },
                        Save: async () => {
                            savedRecords.push({ EntityName: entityName, Fields: { ...store } });
                            return true;
                        },
                        Delete: async () => true,
                        LatestResult: null,
                    } as Record<string, unknown>,
                    {
                        get(target, prop: string) {
                            if (prop in target) return target[prop];
                            return store[prop];
                        },
                        set(_target, prop: string, value: unknown) {
                            store[prop] = (value as string | number | boolean | null) ?? null;
                            return true;
                        },
                    },
                );
                return proxy as never;
            }),
        } as unknown as IMetadataProvider;

        appContext = {
            userPayload: {
                userRecord: mockUser,
                email: mockUser.Email,
                userName: mockUser.Name,
                sessionId: 'sess-1',
            },
            providers: [{ type: 'Read-Write', provider: mockProvider }],
        } as unknown as AppContext;

        resolver = new DocumentCollaborationResolver();
        vi.spyOn(resolver as unknown as { CheckAPIKeyScopeAuthorization: () => Promise<void> }, 'CheckAPIKeyScopeAuthorization')
            .mockResolvedValue();

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_provider, artifactId) => ({
                ArtifactID: artifactId ?? '',
                CanRead: artifactId !== ART_SECRET_ID,
                CanEdit: artifactId !== ART_SECRET_ID,
                CanDelete: false,
                CanShare: false,
                Source: artifactId === ART_SECRET_ID ? 'Denied' : 'Owner',
            }),
        );

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => {
                const filter = params.ExtraFilter ?? '';
                if (params.EntityName === 'MJ: Collections') {
                    if (filter.includes(COL_EDIT_ID)) {
                        return {
                            Success: true,
                            Results: [{ ID: COL_EDIT_ID, OwnerID: USER_ID, EnvironmentID: ENV_ID }],
                        };
                    }
                    if (filter.includes(COL_DENIED_ID)) {
                        return {
                            Success: true,
                            Results: [{ ID: COL_DENIED_ID, OwnerID: 'another-owner', EnvironmentID: ENV_ID }],
                        };
                    }
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return { Success: true, Results: [{ CanRead: true, CanEdit: false }] };
                }
                if (params.EntityName === 'MJ: Collection Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ArtifactVersionID: 'ver-doc-1' }, { ArtifactVersionID: 'ver-sheet-1' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    if (filter.includes('ver-doc-1') || filter.includes(ART_DOC_ID)) {
                        if (filter.includes('IN (')) {
                            return {
                                Success: true,
                                Results: [{ ArtifactID: ART_DOC_ID }, { ArtifactID: ART_SHEET_ID }],
                            };
                        }
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'ver-doc-1',
                                    VersionNumber: 1,
                                    ContentMode: 'Text',
                                    Content: '# Strategy\n\nExpand enterprise adoption.',
                                },
                            ],
                        };
                    }
                    if (filter.includes(ART_SHEET_ID)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'ver-sheet-1',
                                    VersionNumber: 2,
                                    ContentMode: 'Text',
                                    Content: buildWorkbookJson(),
                                },
                            ],
                        };
                    }
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    if (filter.includes(ART_DOC_ID)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: ART_DOC_ID,
                                    Name: 'Strategy Memo',
                                    Description: 'Strategic pillars',
                                    EnvironmentID: ENV_ID,
                                    Type: 'Markdown Document',
                                },
                            ],
                        };
                    }
                    if (filter.includes(ART_SHEET_ID)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: ART_SHEET_ID,
                                    Name: 'Revenue Workbook',
                                    Description: 'Revenue sheet',
                                    EnvironmentID: ENV_ID,
                                    Type: 'Excel Spreadsheet',
                                },
                            ],
                        };
                    }
                }
                return { Success: true, Results: [] };
            }),
        } as never);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fails closed when user lacks CanRead on a requested source artifact or CanEdit on collection', async () => {
        const deniedSource = await resolver.SynthesizeArtifactFromSources(
            'presentation',
            'Executive deck',
            appContext,
            [ART_DOC_ID, ART_SECRET_ID],
        );
        expect(deniedSource.Success).toBe(false);
        expect(deniedSource.AccessDenied).toBe(true);
        expect(savedRecords).toHaveLength(0);

        const deniedCollection = await resolver.SynthesizeArtifactFromSources(
            'presentation',
            'Executive deck',
            appContext,
            [ART_DOC_ID],
            COL_DENIED_ID,
        );
        expect(deniedCollection.Success).toBe(false);
        expect(deniedCollection.AccessDenied).toBe(true);
        expect(savedRecords).toHaveLength(0);
    });

    it('synthesizes via direct LLM, strips spoofed Artifact embeds, applies thumbnail policy, and links collection', async () => {
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([
            { AIModelType: 'LLM', IsActive: true, DriverClass: 'OpenAILLM', APIName: 'gpt-4o' } as never,
        ]);
        process.env['AI_VENDOR_API_KEY__OPENAILLM'] = 'test-key-present';

        const mockLlm = {
            ChatCompletion: vi.fn(async () => ({
                success: true,
                data: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    title: 'FY27 Board Synthesis',
                                    description: 'Unified strategy & revenue deck',
                                    slides: [
                                        {
                                            Layout: 'ChartAndText',
                                            Title: 'Revenue Performance',
                                            Regions: [
                                                {
                                                    RegionID: 'chart-ok',
                                                    Label: 'Q1 Revenue',
                                                    Kind: 'mj-block',
                                                    BlockSpec: {
                                                        BlockID: 'blk-1',
                                                        Kind: 'Artifact',
                                                        Mode: 'Live',
                                                        ArtifactID: ART_SHEET_ID,
                                                        SheetChartID: 'chart-q1',
                                                    },
                                                },
                                                {
                                                    RegionID: 'chart-bad',
                                                    Label: 'Restricted',
                                                    Kind: 'mj-block',
                                                    BlockSpec: {
                                                        BlockID: 'blk-2',
                                                        Kind: 'Artifact',
                                                        Mode: 'Live',
                                                        ArtifactID: ART_SECRET_ID,
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                }),
                            },
                        },
                    ],
                },
            })),
        } as unknown as BaseLLM;

        const origCreateInstance = MJGlobal.Instance.ClassFactory.CreateInstance.bind(MJGlobal.Instance.ClassFactory);
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation((base, key, ...rest) => {
            if (base === BaseLLM && key === 'OpenAILLM') {
                return mockLlm as never;
            }
            return origCreateInstance(base, key, ...rest);
        });

        const res = await resolver.SynthesizeArtifactFromSources(
            'presentation',
            'Combine strategy narrative with live revenue chart',
            appContext,
            undefined,
            COL_EDIT_ID,
            'FY27 Board Synthesis',
            null,
            true,
        );

        delete process.env['AI_VENDOR_API_KEY__OPENAILLM'];

        expect(res.Success).toBe(true);
        expect(res.UsedFallback).toBe(false);
        expect(res.Title).toBe('FY27 Board Synthesis');
        expect(res.ArtifactTypeName).toBe('Presentation');
        expect(res.LinkedChartCount).toBe(1);
        expect(res.SourceCount).toBe(2);
        expect(res.Warnings?.some((w) => w.includes(ART_SECRET_ID))).toBe(true);

        const artRec = savedRecords.find((r) => r.EntityName === 'MJ: Artifacts');
        const verRec = savedRecords.find((r) => r.EntityName === 'MJ: Artifact Versions');
        const colLink = savedRecords.find((r) => r.EntityName === 'MJ: Collection Artifacts');
        expect(artRec?.Fields['EnvironmentID']).toBe(ENV_ID);
        expect(String(verRec?.Fields['Configuration'])).toContain('previewSnapshot');
        expect(String(verRec?.Fields['Content'])).not.toContain(ART_SECRET_ID);
        expect(colLink?.Fields['CollectionID']).toBe(COL_EDIT_ID);
    });

    it('falls back deterministically when no LLM model is configured and supports named agent execution', async () => {
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue();
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([]);

        const fallbackRes = await resolver.SynthesizeArtifactFromSources(
            'presentation',
            'Create executive rollup',
            appContext,
            [ART_DOC_ID, ART_SHEET_ID],
        );
        expect(fallbackRes.Success).toBe(true);
        expect(fallbackRes.UsedFallback).toBe(true);
        expect(fallbackRes.LinkedChartCount).toBe(1);

        savedRecords.length = 0;
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([
            { ID: 'agent-1', Name: 'Sage', Status: 'Active' } as never,
        ]);
        vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockResolvedValue(true);
        vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValue({
            success: true,
            payload: JSON.stringify({
                title: 'Agent Synthesized Doc',
                markdown: '# Agent Report\n\n- Revenue hits $910k in Q1.',
            }),
            agentRun: { ID: 'run-agent-1' },
        } as never);

        const agentRes = await resolver.SynthesizeArtifactFromSources(
            'document',
            'Write an executive brief',
            appContext,
            [ART_DOC_ID, ART_SHEET_ID],
            null,
            'Agent Synthesized Doc',
            '@Sage',
            true,
        );
        expect(agentRes.Success).toBe(true);
        expect(agentRes.UsedFallback).toBe(false);
        expect(agentRes.ArtifactTypeName).toBe('Markdown Document');
        const verRec = savedRecords.find((r) => r.EntityName === 'MJ: Artifact Versions');
        expect(String(verRec?.Fields['Content'])).toContain('Revenue hits $910k in Q1.');
        expect(String(verRec?.Fields['Comments'])).toContain('Sage');
    });
});
