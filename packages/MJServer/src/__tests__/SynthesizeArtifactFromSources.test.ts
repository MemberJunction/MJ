import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PubSubEngine } from 'type-graphql';

const { agentRunSpy, getAIApiKeySpy } = vi.hoisted(() => ({
    agentRunSpy: vi.fn(),
    getAIApiKeySpy: vi.fn<(driverClass: string) => string>(() => ''),
}));

vi.mock('../config.js', () => ({
    configInfo: {},
}));

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ...actual,
        GetAIAPIKey: getAIApiKeySpy,
    };
});

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        public async RunAgent(params: Record<string, unknown>): Promise<Record<string, unknown>> {
            return agentRunSpy(params);
        }
    },
}));

import { BaseLLM, ChatResult } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import {
    BaseEntity,
    DispatchRemoteOperationInProcess,
    IMetadataProvider,
    RemoteOpInvokeOptions,
    RemoteOpProgress,
    RemoteOpResult,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import {
    ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    MJArtifactEntity,
    MJArtifactTypeEntity,
    MJArtifactVersionEntity,
    MJCollectionArtifactEntity,
    RemoteOperationEngineBase,
    SynthesizeArtifactFromSourcesInput,
    SynthesizeArtifactFromSourcesOutput,
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { ExecuteRemoteOperationResolver } from '../resolvers/ExecuteRemoteOperationResolver.js';
import { LoadSynthesizeArtifactFromSourcesOperation } from '../operations/SynthesizeArtifactFromSourcesServerOperation.js';
import type { AppContext } from '../types.js';

LoadSynthesizeArtifactFromSourcesOperation();

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ART_DOC_ID = '22222222-2222-4222-8222-222222222222';
const ART_SHEET_ID = '33333333-3333-4333-8333-333333333333';
const ART_SECRET_ID = '44444444-4444-4444-8444-444444444444';
const COL_EDIT_ID = '55555555-5555-4555-8555-555555555555';
const COL_DENIED_ID = '66666666-6666-4666-8666-666666666666';
const ENV_ID = '77777777-7777-4777-8777-777777777777';
const TYPE_PRES_ID = '88888888-8888-4888-8888-888888888888';
const TYPE_DOC_ID = '99999999-9999-4999-8999-999999999999';
const AGENT_SAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface SavedRecordCapture {
    EntityName: string;
    Record: Record<string, unknown>;
}

function createFakeEntityProxy<T extends BaseEntity>(
    entityName: string,
    id: string,
    savedList: SavedRecordCapture[],
): T {
    const store: Record<string, unknown> = {
        ID: id,
        LatestResult: { Success: true, CompleteMessage: '' },
        NewRecord: vi.fn(),
        Save: vi.fn(async () => {
            savedList.push({ EntityName: entityName, Record: { ...store } });
            return true;
        }),
        Delete: vi.fn(async () => true),
    };
    return new Proxy(store, {
        get(target, prop) {
            return target[prop as string];
        },
        set(target, prop, value) {
            target[prop as string] = value;
            return true;
        },
    }) as unknown as T;
}

describe('SynthesizeArtifactFromSourcesServerOperation', () => {
    const fakeUser = { ID: USER_ID, Email: 'analyst@example.com', Name: 'Analyst' } as UserInfo;
    let savedRecords: SavedRecordCapture[];

    function buildMockProvider(): IMetadataProvider {
        const providerObj: {
            RunView: (params: RunViewParams, user?: UserInfo) => Promise<{ Success: boolean; Results: Record<string, unknown>[] }>;
            GetEntityObject: <T extends BaseEntity>(entityName: string, user?: UserInfo) => Promise<T>;
            RouteOperation: <TIn, TOut>(
                key: string,
                opInput: TIn,
                options?: RemoteOpInvokeOptions,
            ) => Promise<RemoteOpResult<TOut>>;
        } = {
            RunView: vi.fn(async (params: RunViewParams) => {
                const filter = params.ExtraFilter ?? '';
                if (params.EntityName === 'MJ: Collections') {
                    if (filter.includes(COL_EDIT_ID)) {
                        return { Success: true, Results: [{ ID: COL_EDIT_ID, OwnerID: USER_ID, EnvironmentID: ENV_ID }] };
                    }
                    if (filter.includes(COL_DENIED_ID)) {
                        return {
                            Success: true,
                            Results: [{ ID: COL_DENIED_ID, OwnerID: 'ffffffff-ffff-4fff-8fff-ffffffffffff', EnvironmentID: ENV_ID }],
                        };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Collection Permissions') {
                    return { Success: true, Results: [{ CanEdit: false }] };
                }
                if (params.EntityName === 'MJ: Collection Artifacts') {
                    return {
                        Success: true,
                        Results: [{ ArtifactVersionID: 'ver-doc-1' }, { ArtifactVersionID: 'ver-sheet-1' }],
                    };
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    if (filter.includes(ART_DOC_ID)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: ART_DOC_ID,
                                    Name: 'Q3 Market Strategy',
                                    Description: 'Market analysis',
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
                                    Name: 'Q3 Revenue Workbook',
                                    Description: 'Financial workbook',
                                    EnvironmentID: ENV_ID,
                                    Type: 'Spreadsheet',
                                },
                            ],
                        };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    if (filter.includes('IN (')) {
                        return {
                            Success: true,
                            Results: [
                                ...(filter.includes('ver-doc-1') ? [{ ArtifactID: ART_DOC_ID }] : []),
                                ...(filter.includes('ver-sheet-1') ? [{ ArtifactID: ART_SHEET_ID }] : []),
                            ],
                        };
                    }
                    if (filter.includes('ver-doc-1')) {
                        return { Success: true, Results: [{ ArtifactID: ART_DOC_ID }] };
                    }
                    if (filter.includes('ver-sheet-1')) {
                        return { Success: true, Results: [{ ArtifactID: ART_SHEET_ID }] };
                    }
                    if (filter.includes(ART_DOC_ID)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: 'ver-doc-1',
                                    VersionNumber: 2,
                                    ContentMode: 'Text',
                                    Content: '# Strategy\nEnterprise ARR grew 38% YoY in Q3.',
                                    Configuration: null,
                                    MimeType: 'text/markdown',
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
                                    VersionNumber: 1,
                                    ContentMode: 'Text',
                                    Content: JSON.stringify({
                                        Worksheets: [
                                            {
                                                Name: 'Summary',
                                                Cells: {
                                                    A1: { RawValue: 'Segment' },
                                                    B1: { RawValue: 'ARR' },
                                                },
                                                Charts: [
                                                    {
                                                        ChartID: 'chart-arr',
                                                        Title: 'ARR by Segment',
                                                        ChartType: 'bar',
                                                        SourceRange: 'A1:B4',
                                                    },
                                                ],
                                            },
                                        ],
                                    }),
                                    Configuration: null,
                                    MimeType: 'application/json',
                                },
                            ],
                        };
                    }
                }
                return { Success: true, Results: [] };
            }),
            GetEntityObject: vi.fn(async <T extends BaseEntity>(entityName: string): Promise<T> => {
                if (entityName === 'MJ: Artifacts') {
                    return createFakeEntityProxy<MJArtifactEntity>(
                        entityName,
                        'abababab-abab-4bab-8bab-abababababab',
                        savedRecords,
                    ) as unknown as T;
                }
                if (entityName === 'MJ: Artifact Versions') {
                    return createFakeEntityProxy<MJArtifactVersionEntity>(
                        entityName,
                        'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
                        savedRecords,
                    ) as unknown as T;
                }
                if (entityName === 'MJ: Collection Artifacts') {
                    return createFakeEntityProxy<MJCollectionArtifactEntity>(
                        entityName,
                        'efefefef-efef-4fef-8fef-efefefefefef',
                        savedRecords,
                    ) as unknown as T;
                }
                return createFakeEntityProxy<BaseEntity>(
                    entityName,
                    '12121212-1212-4121-8121-121212121212',
                    savedRecords,
                ) as unknown as T;
            }),
            RouteOperation: async <TIn, TOut>(
                key: string,
                opInput: TIn,
                options: RemoteOpInvokeOptions = {},
            ): Promise<RemoteOpResult<TOut>> => {
                return DispatchRemoteOperationInProcess<TIn, TOut>(
                    key,
                    opInput,
                    options,
                    providerObj as unknown as IMetadataProvider,
                    fakeUser,
                );
            },
        };
        return providerObj as unknown as IMetadataProvider;
    }

    beforeEach(() => {
        savedRecords = [];
        agentRunSpy.mockReset();
        getAIApiKeySpy.mockReset();
        getAIApiKeySpy.mockReturnValue('');

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_provider, artifactId) => {
                if (artifactId === ART_SECRET_ID) {
                    return { CanRead: false, CanEdit: false, CanShare: false, IsOwner: false };
                }
                return { CanRead: true, CanEdit: true, CanShare: false, IsOwner: true };
            },
        );

        const presType = {
            ID: TYPE_PRES_ID,
            Name: 'Presentation',
            DriverClass: 'PresentationArtifactPlugin',
            IsEnabled: true,
        } as MJArtifactTypeEntity;
        const docType = {
            ID: TYPE_DOC_ID,
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactPlugin',
            IsEnabled: true,
        } as MJArtifactTypeEntity;

        vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([presType, docType]);
        vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockImplementation((name: string) => {
            if (name === 'Presentation') return presType;
            if (name === 'Markdown Document') return docType;
            return undefined;
        });

        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([]);

        vi.spyOn(RemoteOperationEngineBase.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(RemoteOperationEngineBase.Instance, 'IsInvokable').mockReturnValue({ Invokable: true });
        vi.spyOn(RemoteOperationEngineBase.Instance, 'GetContractFingerprint').mockReturnValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects source artifact when user lacks CanRead permission (ACCESS_DENIED)', async () => {
        const provider = buildMockProvider();
        const res = await DispatchRemoteOperationInProcess<
            SynthesizeArtifactFromSourcesInput,
            SynthesizeArtifactFromSourcesOutput
        >(
            ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            {
                SourceArtifactIds: [ART_DOC_ID, ART_SECRET_ID],
                TargetKind: 'presentation',
                Goal: 'Combine strategy with confidential doc',
            },
            {},
            provider,
            fakeUser,
        );

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('ACCESS_DENIED');
        expect(res.ErrorMessage).toContain('CanRead');
        expect(savedRecords).toHaveLength(0);
    });

    it('rejects target collection when user lacks CanEdit permission (ACCESS_DENIED)', async () => {
        const provider = buildMockProvider();
        const res = await DispatchRemoteOperationInProcess<
            SynthesizeArtifactFromSourcesInput,
            SynthesizeArtifactFromSourcesOutput
        >(
            ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            {
                SourceArtifactIds: [ART_DOC_ID],
                CollectionId: COL_DENIED_ID,
                TargetKind: 'document',
                Goal: 'Publish summary into restricted folder',
            },
            {},
            provider,
            fakeUser,
        );

        expect(res.Success).toBe(false);
        expect(res.ResultCode).toBe('ACCESS_DENIED');
        expect(res.ErrorMessage).toContain('CanEdit');
        expect(savedRecords).toHaveLength(0);
    });

    it('synthesizes via direct LLM, emits progress stages, preserves chart embeds, and saves artifact + collection link', async () => {
        const provider = buildMockProvider();
        getAIApiKeySpy.mockReturnValue('test-openai-key');
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockReturnValue([
            {
                ID: 'mod-1',
                AIModelType: 'LLM',
                IsActive: true,
                DriverClass: 'OpenAILLM',
                APIName: 'gpt-4o',
            } as unknown as (typeof AIEngine.Instance.Models)[number],
        ]);

        const fakeLlm: Pick<BaseLLM, 'ChatCompletion'> = {
            ChatCompletion: vi.fn(async () => ({
                success: true,
                data: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    title: 'Q3 Board Executive Deck',
                                    description: 'Synthesized from strategy & ARR model',
                                    slides: [
                                        {
                                            Title: 'Executive Summary',
                                            Subtitle: 'ARR +38% YoY',
                                            Layout: 'ChartAndText',
                                            Regions: [
                                                {
                                                    RegionID: 'notes',
                                                    Label: 'Highlights',
                                                    Kind: 'rich-text',
                                                    MarkdownContent: '- Enterprise ARR grew 38% YoY',
                                                },
                                                {
                                                    RegionID: 'chart',
                                                    Label: 'Chart',
                                                    Kind: 'mj-block',
                                                    MarkdownContent: '',
                                                    BlockSpec: {
                                                        BlockID: 'chart-blk-1',
                                                        Kind: 'Artifact',
                                                        Mode: 'Live',
                                                        EmbedMode: 'Inline',
                                                        ArtifactID: ART_SHEET_ID,
                                                        ArtifactType: 'Excel Spreadsheet',
                                                        SheetID: 'Summary',
                                                        SheetChartID: 'chart-arr',
                                                        SheetRange: 'A1:B4',
                                                        Title: 'ARR by Segment',
                                                    },
                                                },
                                            ],
                                            SpeakerNotes: 'ARR overview',
                                        },
                                    ],
                                }),
                            },
                        },
                    ],
                },
            })) as unknown as BaseLLM['ChatCompletion'],
        };
        const origCreateInstance = MJGlobal.Instance.ClassFactory.CreateInstance.bind(
            MJGlobal.Instance.ClassFactory,
        );
        vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
            (baseClass, key, ...rest) => {
                if (baseClass === BaseLLM) {
                    return fakeLlm as BaseLLM;
                }
                return origCreateInstance(baseClass, key, ...rest);
            },
        );

        const progressEvents: RemoteOpProgress[] = [];
        const res = await DispatchRemoteOperationInProcess<
            SynthesizeArtifactFromSourcesInput,
            SynthesizeArtifactFromSourcesOutput
        >(
            ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            {
                SourceArtifactIds: [ART_DOC_ID, ART_SHEET_ID],
                CollectionId: COL_EDIT_ID,
                TargetKind: 'presentation',
                Title: 'Q3 Board Executive Deck',
                Goal: 'Executive review deck with live ARR chart',
                LinkChartsAndRanges: true,
            },
            {
                onProgress: (ev) => progressEvents.push(ev),
            },
            provider,
            fakeUser,
        );

        expect(res.Success).toBe(true);
        expect(res.Output?.UsedFallback).toBe(false);
        expect(res.Output?.Title).toBe('Q3 Board Executive Deck');
        expect(res.Output?.ArtifactTypeName).toBe('Presentation');
        expect(res.Output?.LinkedChartCount).toBe(1);
        expect(res.Output?.SourceCount).toBe(2);
        expect(res.Output?.AgentRunID).toBeNull();
        expect(progressEvents.map((p) => p.Status)).toEqual(['Reading', 'Synthesizing', 'Saving', 'Completed']);

        const entityNames = savedRecords.map((s) => s.EntityName);
        expect(entityNames).toEqual(['MJ: Artifacts', 'MJ: Artifact Versions', 'MJ: Collection Artifacts']);

        const savedVersion = savedRecords[1].Record;
        const parsedConfig = JSON.parse(String(savedVersion.Configuration ?? '{}')) as Record<string, unknown>;
        expect(parsedConfig.synthesizedFromArtifactIds).toEqual([ART_DOC_ID, ART_SHEET_ID]);
    });

    it('falls back deterministically when no LLM API key is configured', async () => {
        const provider = buildMockProvider();
        getAIApiKeySpy.mockReturnValue('');

        const res = await DispatchRemoteOperationInProcess<
            SynthesizeArtifactFromSourcesInput,
            SynthesizeArtifactFromSourcesOutput
        >(
            ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            {
                CollectionId: COL_EDIT_ID,
                TargetKind: 'document',
                Goal: 'Executive memo summarizing collection artifacts',
            },
            {},
            provider,
            fakeUser,
        );

        expect(res.Success).toBe(true);
        expect(res.Output?.UsedFallback).toBe(true);
        expect(res.Output?.ArtifactTypeName).toBe('Markdown Document');
        expect(res.Output?.SourceCount).toBe(2);
    });

    it('routes synthesis through a named AI agent when AgentHandle is specified', async () => {
        const provider = buildMockProvider();
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([
            {
                ID: AGENT_SAGE_ID,
                Name: 'Sage',
                Status: 'Active',
            } as unknown as (typeof AIEngine.Instance.Agents)[number],
        ]);
        vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockResolvedValue(true);

        agentRunSpy.mockResolvedValue({
            success: true,
            agentRun: { ID: 'run-sage-99' },
            payload: '# Sage Synthesis\nSynthesized insights across Q3 Strategy & Revenue Workbook.',
        });

        const res = await DispatchRemoteOperationInProcess<
            SynthesizeArtifactFromSourcesInput,
            SynthesizeArtifactFromSourcesOutput
        >(
            ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
            {
                SourceArtifactIds: [ART_DOC_ID],
                TargetKind: 'document',
                Goal: 'Write an executive summary',
                AgentHandle: '@Sage',
            },
            {},
            provider,
            fakeUser,
        );

        expect(res.Success).toBe(true);
        expect(res.Output?.UsedFallback).toBe(false);
        expect(res.Output?.AgentName).toBe('Sage');
        expect(res.Output?.AgentRunID).toBe('run-sage-99');
        expect(agentRunSpy).toHaveBeenCalledTimes(1);
    });

    it('executes end-to-end via ExecuteRemoteOperationResolver and publishes RemoteOperationProgress events', async () => {
        const provider = buildMockProvider();
        const resolver = new ExecuteRemoteOperationResolver();
        const pubSub: PubSubEngine = {
            publish: vi.fn(async () => undefined),
            subscribe: vi.fn(async () => 1),
            unsubscribe: vi.fn(),
            asyncIterator: vi.fn(),
        } as unknown as PubSubEngine;

        const ctx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: provider as unknown as AppContext['providers'][number]['provider'], type: 'Read-Write' }],
            userPayload: {
                email: 'analyst@example.com',
                userRecord: fakeUser,
            },
        };

        const res = await resolver.ExecuteRemoteOperation(
            {
                operationKey: ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY,
                inputJSON: JSON.stringify({
                    SourceArtifactIds: [ART_DOC_ID],
                    TargetKind: 'document',
                    Goal: 'Resolver E2E check',
                } satisfies SynthesizeArtifactFromSourcesInput),
                invokeMode: 'attached',
                progressChannelId: 'chan-synth-1',
            },
            ctx,
            pubSub,
        );

        expect(res.success).toBe(true);
        expect(res.resultCode).toBe('SUCCESS');
        const parsed = JSON.parse(res.outputJSON ?? '{}') as SynthesizeArtifactFromSourcesOutput;
        expect(parsed.ArtifactTypeName).toBe('Markdown Document');
        expect(parsed.SourceCount).toBe(1);
        expect(parsed.UsedFallback).toBe(true);
        expect((pubSub.publish as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
    });
});
