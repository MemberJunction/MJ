import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIAPIKey, AICredentialScope } from '@memberjunction/ai';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    AIImageGenerationRunner,
    AIVideoRunner,
    type AIImageGenerationRunParams,
    type AIImageRunResult,
    type AIVideoGenerationRunParams,
    type AIVideoGenerationRunResult,
} from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { RunView, type UserInfo } from '@memberjunction/core';
import {
    BrandKitEngine,
    type MJAIModelCostEntity,
    type MJAIModelPriceUnitTypeEntity,
    type MJAIPromptModelEntity,
    type MJBrandKitAssetEntity,
    type MJBrandKitEntity,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    ValidateVideoGenerationSpec,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    GenerateRequestedAssets,
    type GenerateRequestedAssetsContext,
} from '../generation/generate-assets.js';
import { SumRecordedGenerationCost } from '../generation/generation-screen.js';
import { DEFAULT_VIDEO_STUDIO_SETTINGS } from '../settings.js';
import * as storageModule from '../storage.js';

const mockUser = {
    ID: '00000000-0000-0000-0000-000000000001',
    Name: 'System',
} as unknown as UserInfo;

const BRAND_KIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FILE_ID_BRAND_HERO = '11111111-1111-4111-8111-111111111101';
const FILE_ID_LOGO_MAIN = '22222222-2222-4222-8222-222222222202';
const FILE_ID_UNFLAGGED_KIT = '33333333-3333-4333-8333-333333333303';
const UNIT_TYPE_PER_SECOND_ID = '00000000-0000-4000-8000-000000000501';
const UNIT_TYPE_PER_IMAGE_ID = '00000000-0000-4000-8000-000000000502';
const PROMPT_VIDEO_ID = '00000000-0000-4000-8000-000000000601';
const PROMPT_IMAGE_ID = '00000000-0000-4000-8000-000000000602';

const PNG_MAGIC_BYTES = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
]);
const MP4_FAKE_BYTES = Buffer.from('00000018667479706d703432c2pa-manifest', 'utf8');

let promptRunCosts: Record<string, number> = {};

function makeFixtureSpec(): VideoGenerationSpec {
    return {
        SpecVersion: '1.0',
        Status: 'Approved',
        BrandKitID: BRAND_KIT_ID,
        Archetype: {
            Name: 'Topic Explainer',
        },
        Film: {
            OneSentence: 'Explain annual recurring revenue momentum.',
            Audience: 'Executive leadership',
            Purpose: 'Summarize annual recurring revenue growth.',
            DurationSeconds: 8,
            Formats: ['16:9'],
        },
        Style: {
            Palette: [{ Name: 'bg.primary', Value: '#0F172A', Usage: 'Primary background' }],
            Typography: [
                {
                    Role: 'Headline',
                    FontFamily: 'Inter',
                    Weight: 700,
                    SizeByFormat: { '16:9': '64px' },
                },
            ],
            Composition: 'Clean split layout',
            Pacing: {
                AvgSecondsBetweenChanges: 4,
                HoldRules: 'Hold 2s on numbers',
            },
            MotionRules: [
                {
                    ObjectClass: 'Headline',
                    DurationMs: 400,
                    Easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    Notes: 'Upward fade-in',
                },
            ],
            Keep: ['High contrast'],
            Avoid: ['Clutter'],
            References: [],
        },
        Assets: {
            Approved: [
                {
                    Key: 'brand:Hero',
                    Kind: 'Image',
                    FileID: FILE_ID_BRAND_HERO,
                    Source: 'BrandKit:Hero',
                    Provenance: 'BrandKit',
                    Usage: 'Brand style reference',
                    MustUse: false,
                },
                {
                    Key: 'logo-main',
                    Kind: 'Image',
                    FileID: FILE_ID_LOGO_MAIN,
                    Source: 'Caller upload',
                    Provenance: 'Supplied',
                    Usage: 'Approved style reference card',
                    MustUse: false,
                },
                {
                    Key: 'brand:UnflaggedSecret',
                    Kind: 'Image',
                    FileID: FILE_ID_UNFLAGGED_KIT,
                    Source: 'BrandKit:UnflaggedSecret',
                    Provenance: 'BrandKit',
                    Usage: 'Internal brand element not flagged for generation',
                    MustUse: false,
                },
            ],
            Required: [],
            Generate: [
                {
                    Key: 'ambient-bg',
                    Kind: 'Video',
                    Purpose: 'Ambient geometric background loop behind Beat 1.',
                    Prompt: 'Soft geometric slate ribbons drifting slowly in warm studio light',
                    ReferenceKeys: [],
                    DurationSeconds: 6,
                },
                {
                    Key: 'chapter-card',
                    Kind: 'Image',
                    Purpose: 'Illustrative chapter divider card for Beat 2.',
                    Prompt: 'Minimalist architectural glass prism on dark slate surface',
                    ReferenceKeys: ['brand:Hero', 'logo-main'],
                },
            ],
            NeverInvent: ['product UI', 'customer logo'],
        },
        DataBindings: [
            {
                Key: 'arr_total',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
                Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
            },
        ],
        DataSnapshot: {
            AsOf: '2026-04-17T00:00:00.000Z',
            Sources: ['Inline:arr_total'],
            Inline: {
                arr_total: 'SECRET_SNAPSHOT_VALUE_999888777',
            },
        },
        Beats: [
            {
                Key: 'beat-1',
                Label: 'Intro',
                StartSeconds: 0,
                EndSeconds: 4,
                EntryState: 'Dark slate canvas',
                ExitState: 'KPI headline visible',
                Purpose: 'Introduce ARR total',
                OnScreenText: ['{arr_total} ARR'],
                AssetRefs: ['ambient-bg'],
                DataRefs: ['arr_total'],
                NarrationKey: 'nar-1',
                LayoutNotes: { '16:9': 'Centered hero number over ambient-bg' },
            },
            {
                Key: 'beat-2',
                Label: 'Divider',
                StartSeconds: 4,
                EndSeconds: 8,
                EntryState: 'KPI headline visible',
                ExitState: 'Chapter divider visible',
                Purpose: 'Transition to regional view',
                OnScreenText: ['Regional Overview'],
                AssetRefs: ['chapter-card'],
                DataRefs: [],
                NarrationKey: 'nar-2',
                LayoutNotes: { '16:9': 'Full bleed chapter-card' },
            },
        ],
        Audio: {
            Narration: {
                VoiceID: 'voice-1',
                Provider: 'ElevenLabs',
                Script: [
                    {
                        Key: 'nar-1',
                        BeatKey: 'beat-1',
                        Text: 'ARR reached {arr_total}.',
                        AudioFileID: '44444444-4444-4444-8444-444444444401',
                        DurationSeconds: 3.5,
                        StartSeconds: 0,
                    },
                    {
                        Key: 'nar-2',
                        BeatKey: 'beat-2',
                        Text: 'Here is the regional overview.',
                        AudioFileID: '44444444-4444-4444-8444-444444444402',
                        DurationSeconds: 3.5,
                        StartSeconds: 4,
                    },
                ],
            },
            Cues: [],
            Captions: 'Burned',
        },
        Render: {
            Renderer: 'HyperFrames',
            Fps: 30,
            Quality: 'standard',
            Seed: 42,
            RendererVersion: '0.9.0',
        },
        Interaction: {
            Mode: 'Autonomous',
            MaxRepairRounds: 1,
        },
        Deliverables: {
            Formats: ['16:9'],
            Poster: true,
            ContactSheets: true,
            Source: true,
            Captions: true,
        },
        Review: {
            Gates: [],
            Rounds: [],
        },
    };
}

function createFakeRunners(options?: {
    imageCost?: number;
    videoCost?: number;
    omitImageCost?: boolean;
    omitVideoCost?: boolean;
    failImage?: boolean;
    failVideo?: boolean;
}): {
    imageCalls: AIImageGenerationRunParams[];
    videoCalls: AIVideoGenerationRunParams[];
    imageRunner: { RunImageGeneration: (p: AIImageGenerationRunParams) => Promise<AIImageRunResult> };
    videoRunner: { RunGenerateVideo: (p: AIVideoGenerationRunParams) => Promise<AIVideoGenerationRunResult> };
} {
    const imageCalls: AIImageGenerationRunParams[] = [];
    const videoCalls: AIVideoGenerationRunParams[] = [];

    const imageRunner = {
        RunImageGeneration: vi.fn(async (params: AIImageGenerationRunParams): Promise<AIImageRunResult> => {
            imageCalls.push(params);
            if (options?.failImage) {
                return {
                    Success: false,
                    ErrorMessage: 'Vendor image service 503',
                    ExecutionTimeMS: 0,
                };
            }
            const promptRunId = `prompt-run-img-${imageCalls.length}`;
            if (options?.omitImageCost) {
                delete promptRunCosts[promptRunId];
            } else {
                promptRunCosts[promptRunId] =
                    options?.imageCost !== undefined ? options.imageCost : 0.08;
            }
            return {
                Success: true,
                ExecutionTimeMS: 0,
                PromptRunID: promptRunId,
                ModelID: 'model-imagen-4',
                ModelName: 'Imagen 4',
                ImageResult: {
                    success: true,
                    startTime: new Date(0),
                    endTime: new Date(0),
                    timeElapsed: 0,
                    errorMessage: undefined,
                    exception: undefined,
                    images: [
                        {
                            data: Buffer.from(PNG_MAGIC_BYTES),
                            format: 'png',
                            width: 1920,
                            height: 1080,
                        },
                    ],
                },
            };
        }),
    };

    const videoRunner = {
        RunGenerateVideo: vi.fn(async (params: AIVideoGenerationRunParams): Promise<AIVideoGenerationRunResult> => {
            videoCalls.push(params);
            if (options?.failVideo) {
                return {
                    Success: false,
                    ErrorMessage: 'Vendor video service timed out',
                    ExecutionTimeMS: 0,
                };
            }
            return {
                Success: true,
                ExecutionTimeMS: 0,
                PromptRunID: `prompt-run-vid-${videoCalls.length}`,
                ModelID: 'model-veo-3-1',
                ModelName: 'Veo 3.1',
                JobID: `job-vid-${videoCalls.length}`,
                Cost: options?.omitVideoCost
                    ? undefined
                    : options?.videoCost !== undefined
                      ? options.videoCost
                      : 0.42,
                C2PA: true,
                Video: {
                    Data: Buffer.from(MP4_FAKE_BYTES),
                    MimeType: 'video/mp4',
                    DurationSeconds: params.DurationSeconds ?? 6,
                    Width: 1920,
                    Height: 1080,
                },
            };
        }),
    };

    return {
        imageCalls,
        videoCalls,
        imageRunner,
        videoRunner,
    };
}

describe('GenerateRequestedAssets (VS-GEN-6)', () => {
    let storedFiles: Array<{
        FileName: string;
        MimeType: string;
        Description?: string;
        Content: Buffer;
    }>;

    beforeEach(() => {
        vi.restoreAllMocks();
        storedFiles = [];
        promptRunCosts = {};

        const mockKit = {
            ID: BRAND_KIT_ID,
            NeverInventObject: ['competitor badge'],
        } as unknown as MJBrandKitEntity;

        const flaggedHeroAsset = {
            ID: 'kit-asset-hero',
            BrandKitID: BRAND_KIT_ID,
            Name: 'Hero',
            AssetType: 'Image',
            FileID: FILE_ID_BRAND_HERO,
            IsGenerationReference: true,
        } as unknown as MJBrandKitAssetEntity;

        const unflaggedKitAsset = {
            ID: 'kit-asset-secret',
            BrandKitID: BRAND_KIT_ID,
            Name: 'UnflaggedSecret',
            AssetType: 'Image',
            FileID: FILE_ID_UNFLAGGED_KIT,
            IsGenerationReference: false,
        } as unknown as MJBrandKitAssetEntity;

        vi.spyOn(BrandKitEngine.Instance, 'GetKitsForCompany').mockReturnValue([mockKit]);
        vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
            AllowGeneratedImages: true,
            AllowGeneratedVideo: true,
            AllowSyntheticPeople: false,
            StylePrompt: 'Editorial matte dark slate',
            AvoidSubjects: ['neon cyberpunk'],
            MaxGenerationCostPerRun: 5,
        });
        vi.spyOn(BrandKitEngine.Instance, 'GetGenerationReferenceAssets').mockReturnValue([
            flaggedHeroAsset,
        ]);
        vi.spyOn(BrandKitEngine.Instance, 'GetAssets').mockReturnValue([
            flaggedHeroAsset,
            unflaggedKitAsset,
        ]);

        vi.spyOn(AIEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([
            {
                ID: PROMPT_VIDEO_ID,
                Name: AIVideoRunner.GENERATIVE_PROMPT_NAME,
                Status: 'Active',
            } as unknown as MJAIPromptEntityExtended,
            {
                ID: PROMPT_IMAGE_ID,
                Name: AIImageGenerationRunner.DEFAULT_PROMPT_NAME,
                Status: 'Active',
            } as unknown as MJAIPromptEntityExtended,
        ]);
        vi.spyOn(AIEngine.Instance, 'PromptModels', 'get').mockReturnValue([
            {
                ID: 'pm-video-veo',
                PromptID: PROMPT_VIDEO_ID,
                ModelID: 'model-veo-3-1',
                VendorID: 'vendor-google',
                Status: 'Active',
            } as unknown as MJAIPromptModelEntity,
            {
                ID: 'pm-image-imagen',
                PromptID: PROMPT_IMAGE_ID,
                ModelID: 'model-imagen-4',
                VendorID: 'vendor-google',
                Status: 'Active',
            } as unknown as MJAIPromptModelEntity,
        ]);
        vi.spyOn(AIEngine.Instance, 'ModelPriceUnitTypes', 'get').mockReturnValue([
            {
                ID: UNIT_TYPE_PER_SECOND_ID,
                Name: 'Per Second',
                DriverClass: 'Linear',
                UsageType: 'Seconds',
                UnitsPerBillingUnit: 1,
            } as unknown as MJAIModelPriceUnitTypeEntity,
            {
                ID: UNIT_TYPE_PER_IMAGE_ID,
                Name: 'Per Image',
                DriverClass: 'Linear',
                UsageType: 'Images',
                UnitsPerBillingUnit: 1,
            } as unknown as MJAIModelPriceUnitTypeEntity,
        ]);
        vi.spyOn(AIEngine.Instance, 'ModelCosts', 'get').mockReturnValue([
            {
                ID: 'cost-veo-per-sec',
                ModelID: 'model-veo-3-1',
                VendorID: 'vendor-google',
                Status: 'Active',
                ProcessingType: 'Realtime',
                UnitTypeID: UNIT_TYPE_PER_SECOND_ID,
                UnitType: 'Per Second',
                InputPricePerUnit: 0,
                OutputPricePerUnit: 0.1,
                Currency: 'USD',
            } as unknown as MJAIModelCostEntity,
            {
                ID: 'cost-imagen-per-img',
                ModelID: 'model-imagen-4',
                VendorID: 'vendor-google',
                Status: 'Active',
                ProcessingType: 'Realtime',
                UnitTypeID: UNIT_TYPE_PER_IMAGE_ID,
                UnitType: 'Per Image',
                InputPricePerUnit: 0,
                OutputPricePerUnit: 0.25,
                Currency: 'USD',
            } as unknown as MJAIModelCostEntity,
        ]);
        vi.spyOn(AIEngineBase.Instance, 'ModelPriceUnitTypes', 'get').mockImplementation(
            () => AIEngine.Instance.ModelPriceUnitTypes,
        );
        Object.defineProperty(AIEngineBase.Instance, '_modelCosts', {
            get: () => AIEngine.Instance.ModelCosts,
            configurable: true,
        });

        vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(FileStorageEngine.Instance, 'HasStorageAccounts', 'get').mockReturnValue(true);

        vi.spyOn(storageModule, 'ReadStoredFileWithType').mockImplementation(async (fileId) => ({
            Bytes: Buffer.concat([PNG_MAGIC_BYTES, Buffer.from(fileId, 'utf8')]),
            ContentType: 'image/png',
            FileName: `${fileId}.png`,
        }));

        vi.spyOn(storageModule, 'StoreFile').mockImplementation(async (params) => {
            const buf = Buffer.isBuffer(params.Content)
                ? params.Content
                : Buffer.from(params.Content as string);
            storedFiles.push({
                FileName: params.FileName,
                MimeType: params.MimeType,
                Description: params.Description,
                Content: buf,
            });
            const idx = storedFiles.length;
            return `88888888-8888-4888-8888-88888888880${idx}`;
        });

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation((async (params: {
            EntityName?: string;
            ExtraFilter?: string;
        }) => {
            if (params.EntityName === 'MJ: AI Prompt Runs') {
                const match = params.ExtraFilter?.match(/ID\s*=\s*'([^']+)'/i);
                const id = match?.[1];
                if (id && promptRunCosts[id] !== undefined) {
                    return {
                        Success: true,
                        Results: [{ ID: id, Cost: promptRunCosts[id] }],
                    };
                }
            }
            return {
                Success: true,
                Results: [],
            };
        }) as never);
    });

    it('1. Plan AC: two requests give two staged Generated assets with full Generation metadata, TextToVideo with no ReferenceImages and no Seed, and pass ValidateVideoGenerationSpec at PreProduced', async () => {
        const spec = makeFixtureSpec();
        const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();

        const result = await GenerateRequestedAssets(spec, {
            ContextUser: mockUser,
            ImageRunner: imageRunner,
            VideoRunner: videoRunner,
        });

        expect(result.Issues).toEqual([]);
        expect(videoCalls).toHaveLength(1);
        expect(imageCalls).toHaveLength(1);

        // Video call: TextToVideo, no ReferenceImages, no Keyframes, no Seed
        expect(videoCalls[0].Mode).toBe('TextToVideo');
        expect(videoCalls[0].DurationSeconds).toBe(6);
        expect(videoCalls[0].AspectRatio).toBe('16:9');
        expect(videoCalls[0].Quality).toBe(DEFAULT_VIDEO_STUDIO_SETTINGS.GenerationQuality);
        expect(videoCalls[0].WantAudio).toBe(false);
        expect(videoCalls[0].ReferenceImages).toBeUndefined();
        expect(videoCalls[0].Keyframes).toBeUndefined();
        expect((videoCalls[0] as { Seed?: unknown }).Seed).toBeUndefined();

        const genVideo = result.Spec.Assets.Approved.find((a) => a.Key === 'ambient-bg');
        const genImage = result.Spec.Assets.Approved.find((a) => a.Key === 'chapter-card');
        expect(genVideo).toBeDefined();
        expect(genImage).toBeDefined();

        expect(genVideo?.FileID).toBe('88888888-8888-4888-8888-888888888801');
        expect(genVideo?.Provenance).toBe('Generated');
        expect(genVideo?.Source).toBe('Generated by Veo 3.1');
        expect(genVideo?.MustUse).toBe(false);
        expect(genVideo?.Usage).toBe('Ambient geometric background loop behind Beat 1. Play muted.');
        expect(genVideo?.Generation).toEqual({
            ModelID: 'model-veo-3-1',
            PromptRunID: 'prompt-run-vid-1',
            Prompt: 'Soft geometric slate ribbons drifting slowly in warm studio light Style: Editorial matte dark slate',
            ReferenceKeys: [],
            DurationSeconds: 6,
            Cost: 0.42,
            C2PA: true,
        });

        expect(genImage?.FileID).toBe('88888888-8888-4888-8888-888888888802');
        expect(genImage?.Provenance).toBe('Generated');
        expect(genImage?.Source).toBe('Generated by Imagen 4');
        expect(genImage?.MustUse).toBe(false);
        expect(genImage?.Usage).toBe('Illustrative chapter divider card for Beat 2.');
        expect(genImage?.Generation).toEqual({
            ModelID: 'model-imagen-4',
            PromptRunID: 'prompt-run-img-1',
            Prompt: 'Minimalist architectural glass prism on dark slate surface Style: Editorial matte dark slate',
            ReferenceKeys: ['brand:Hero', 'logo-main'],
            Cost: 0.08,
        });

        // Both requests marked Generated
        expect(result.Spec.Assets.Generate?.[0].Status).toBe('Generated');
        expect(result.Spec.Assets.Generate?.[1].Status).toBe('Generated');

        // Unmodified bytes stored with expected filenames and descriptions
        expect(storedFiles[0].FileName).toBe('generated-ambient-bg.mp4');
        expect(storedFiles[0].Content.equals(MP4_FAKE_BYTES)).toBe(true);
        expect(storedFiles[0].Description).toBe(
            'AI-generated by Veo 3.1; AI Prompt Run prompt-run-vid-1; job job-vid-1; C2PA yes',
        );
        expect(storedFiles[1].FileName).toBe('generated-chapter-card.png');
        expect(storedFiles[1].Content.equals(PNG_MAGIC_BYTES)).toBe(true);

        // Spec passes ValidateVideoGenerationSpec at PreProduced with no MissingGeneratedAssetProvenance
        const validation = ValidateVideoGenerationSpec(result.Spec, 'PreProduced');
        expect(validation.Valid).toBe(true);
        expect(
            validation.Errors.filter((e) => e.Code === 'MissingGeneratedAssetProvenance'),
        ).toEqual([]);
    });

    it('2. Plan AC: zero spend when any request fails pre-screen (NeverInvent spec list, NeverInvent kit list, GenerationDisabled, PolicySubjectMatch, SyntheticPersonDisallowed)', async () => {
        const cases: Array<{
            name: string;
            mutate: (s: VideoGenerationSpec) => void;
            expectedCode: string;
        }> = [
            {
                name: 'NeverInvent from spec list',
                mutate: (s) => {
                    s.Assets.Generate![1].Prompt = 'Close-up of our product dashboard widgets';
                },
                expectedCode: 'NeverInventMatch',
            },
            {
                name: 'NeverInvent from brand-kit list',
                mutate: (s) => {
                    s.Assets.Generate![1].Prompt = 'A shiny competitor badge on a podium';
                },
                expectedCode: 'NeverInventMatch',
            },
            {
                name: 'GenerationDisabled',
                mutate: () => {
                    vi.spyOn(
                        BrandKitEngine.Instance,
                        'GetEffectiveGenerationPolicy',
                    ).mockReturnValue({
                        AllowGeneratedImages: false,
                        AllowGeneratedVideo: true,
                        AllowSyntheticPeople: false,
                        AvoidSubjects: [],
                        MaxGenerationCostPerRun: 5,
                    });
                },
                expectedCode: 'GenerationDisabled',
            },
            {
                name: 'PolicySubjectMatch',
                mutate: (s) => {
                    s.Assets.Generate![1].Prompt = 'A glowing neon cyberpunk alleyway';
                },
                expectedCode: 'PolicySubjectMatch',
            },
            {
                name: 'SyntheticPersonDisallowed',
                mutate: (s) => {
                    s.Assets.Generate![1].Prompt = 'A smiling executive standing in a lobby';
                },
                expectedCode: 'SyntheticPersonDisallowed',
            },
        ];

        for (const tc of cases) {
            // Reset policy mock before each sub-case
            vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                StylePrompt: 'Editorial matte dark slate',
                AvoidSubjects: ['neon cyberpunk'],
                MaxGenerationCostPerRun: 5,
            });

            const spec = makeFixtureSpec();
            tc.mutate(spec);
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();

            const result = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(imageCalls, `${tc.name}: imageCalls`).toHaveLength(0);
            expect(videoCalls, `${tc.name}: videoCalls`).toHaveLength(0);

            const req0 = result.Spec.Assets.Generate![0];
            const req1 = result.Spec.Assets.Generate![1];
            expect(req0.Status, `${tc.name}: req0 stays Pending`).toBe('Pending');
            expect(req1.Status, `${tc.name}: req1 is Blocked`).toBe('Blocked');
            expect(req1.BlockedReason, `${tc.name}: BlockedReason`).toContain(tc.expectedCode);
        }
    });

    it('3. Plan AC: footage cap under Draft (cap 20s): 12s + 12s gives 0 calls and ExceedsGeneratedVideoSecondsCap; 12s + 8s generates both; 15s already generated + new 6s is blocked', async () => {
        const draftSettings = {
            ...DEFAULT_VIDEO_STUDIO_SETTINGS,
            MaxGeneratedVideoSeconds: 20,
        };

        // Case A: 12s + 12s -> 0 calls, ExceedsGeneratedVideoSecondsCap on second request
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'clip-1',
                    Kind: 'Video',
                    Purpose: 'Intro clip',
                    Prompt: 'Abstract geometric wave one',
                    ReferenceKeys: [],
                    DurationSeconds: 12,
                },
                {
                    Key: 'clip-2',
                    Kind: 'Video',
                    Purpose: 'Outro clip',
                    Prompt: 'Abstract geometric wave two',
                    ReferenceKeys: [],
                    DurationSeconds: 12,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                Settings: draftSettings,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(0);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Pending');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![1].BlockedReason).toContain(
                'ExceedsGeneratedVideoSecondsCap',
            );
        }

        // Case B: 12s + 8s -> generates both (20s <= 20s)
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'clip-1',
                    Kind: 'Video',
                    Purpose: 'Intro clip',
                    Prompt: 'Abstract geometric wave one',
                    ReferenceKeys: [],
                    DurationSeconds: 12,
                },
                {
                    Key: 'clip-2',
                    Kind: 'Video',
                    Purpose: 'Outro clip',
                    Prompt: 'Abstract geometric wave two',
                    ReferenceKeys: [],
                    DurationSeconds: 8,
                },
            ];
            const { videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                Settings: draftSettings,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(2);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Generated');
        }

        // Case C: 15s already generated + new 6s -> blocked (15 + 6 = 21 > 20)
        {
            const spec = makeFixtureSpec();
            spec.Assets.Approved.push({
                Key: 'existing-clip',
                Kind: 'Video',
                FileID: '77777777-7777-4777-8777-777777777777',
                Source: 'Generated by Veo 3.1',
                Provenance: 'Generated',
                Usage: 'Prior clip. Play muted.',
                MustUse: false,
                Generation: {
                    ModelID: 'model-veo-3-1',
                    PromptRunID: 'pr-prior',
                    Prompt: 'Prior wave',
                    ReferenceKeys: [],
                    DurationSeconds: 15,
                },
            });
            spec.Assets.Generate = [
                {
                    Key: 'new-clip',
                    Kind: 'Video',
                    Purpose: 'New clip',
                    Prompt: 'Abstract geometric wave three',
                    ReferenceKeys: [],
                    DurationSeconds: 6,
                },
            ];
            const { videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                Settings: draftSettings,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain(
                'ExceedsGeneratedVideoSecondsCap',
            );
        }

        // Case D: Five video requests without DurationSeconds (each defaults to 5s -> 5 * 5 = 25 > 20 Draft cap)
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [1, 2, 3, 4, 5].map((idx) => ({
                Key: `undated-clip-${idx}`,
                Kind: 'Video' as const,
                Purpose: `Clip ${idx}`,
                Prompt: `Abstract geometric wave ${idx}`,
                ReferenceKeys: [],
            }));
            const { videoCalls, imageCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                Settings: draftSettings,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(0);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Pending');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Pending');
            expect(res.Spec.Assets.Generate![2].Status).toBe('Pending');
            expect(res.Spec.Assets.Generate![3].Status).toBe('Pending');
            expect(res.Spec.Assets.Generate![4].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![4].BlockedReason).toContain(
                'ExceedsGeneratedVideoSecondsCap',
            );
        }
    });

    it('4. Plan AC: AllowGenerated enforcement in screen and ValidateVideoGenerationSpec', async () => {
        // 4a. Without AllowGenerated -> FillsFactRequirement and 0 calls
        {
            const spec = makeFixtureSpec();
            spec.Assets.Required = [
                {
                    Key: 'ambient-bg',
                    Kind: 'Video',
                    Description: 'Real customer footage',
                    MustUse: true,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(0);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('FillsFactRequirement');
        }

        // 4b. With AllowGenerated: true -> generated and validator raises no GeneratedAssetNotAllowedForRequirement
        {
            const spec = makeFixtureSpec();
            spec.Assets.Required = [
                {
                    Key: 'ambient-bg',
                    Kind: 'Video',
                    Description: 'Illustrative background loop',
                    MustUse: true,
                    AllowGenerated: true,
                },
            ];
            const { videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(1);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Generated');
            const validation = ValidateVideoGenerationSpec(res.Spec, 'PreProduced');
            expect(
                validation.Errors.filter(
                    (e) => e.Code === 'GeneratedAssetNotAllowedForRequirement',
                ),
            ).toEqual([]);
        }

        // 4c. Fixture where a Generated asset fills a requirement without AllowGenerated fails the validator
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [];
            spec.Assets.Required = [
                {
                    Key: 'req-fact',
                    Kind: 'Image',
                    Description: 'Real product screenshot',
                    MustUse: true,
                    SatisfiedByAssetKey: 'fake-gen-shot',
                },
            ];
            spec.Assets.Approved.push({
                Key: 'fake-gen-shot',
                Kind: 'Image',
                FileID: '66666666-6666-4666-8666-666666666666',
                Source: 'Generated by Imagen 4',
                Provenance: 'Generated',
                Usage: 'Screenshot',
                MustUse: false,
                Generation: {
                    ModelID: 'model-imagen-4',
                    PromptRunID: 'pr-fake',
                    Prompt: 'Screenshot',
                    ReferenceKeys: [],
                },
            });
            const validation = ValidateVideoGenerationSpec(spec, 'PreProduced');
            expect(
                validation.Errors.some((e) => e.Code === 'GeneratedAssetNotAllowedForRequirement'),
            ).toBe(true);
        }
    });

    it('5. References: flagged kit asset + approved asset sent; unflagged kit asset never sent; video with references generates <key>-still then ImageToVideo; video with keyframes runs ImageToVideo only; GenerationDisabled is per-kind', async () => {
        // 5a & 5b: Image referencing flagged kit asset, approved asset, and unflagged kit asset -> only flagged + approved sent; no snapshot value in any runner param
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'chapter-card',
                    Kind: 'Image',
                    Purpose: 'Divider card',
                    Prompt: 'Minimalist glass prism',
                    ReferenceKeys: ['brand:Hero', 'logo-main', 'brand:UnflaggedSecret'],
                },
            ];
            const { imageCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(imageCalls).toHaveLength(1);
            expect(imageCalls[0].ReferenceImages).toHaveLength(2);
            const genCard = res.Spec.Assets.Approved.find((a) => a.Key === 'chapter-card');
            expect(genCard?.Generation?.ReferenceKeys).toEqual(['brand:Hero', 'logo-main']);
            expect(JSON.stringify(imageCalls)).not.toContain('SECRET_SNAPSHOT_VALUE_999888777');
            expect(JSON.stringify(imageCalls)).not.toContain(FILE_ID_UNFLAGGED_KIT);
        }

        // 5c: Video with references -> 1 image call (<key>-still with references), then 1 ImageToVideo call with keyframe at 0s and no ReferenceImages
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'ref-video',
                    Kind: 'Video',
                    Purpose: 'Brand-styled motion background',
                    Prompt: 'Abstract ribbons in brand colors',
                    ReferenceKeys: ['brand:Hero', 'logo-main'],
                    DurationSeconds: 6,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(imageCalls).toHaveLength(1);
            expect(imageCalls[0].ReferenceImages).toHaveLength(2);
            expect(videoCalls).toHaveLength(1);
            expect(videoCalls[0].Mode).toBe('ImageToVideo');
            expect(videoCalls[0].ReferenceImages).toBeUndefined();
            expect(videoCalls[0].Keyframes).toHaveLength(1);
            expect(videoCalls[0].Keyframes?.[0].Seconds).toBe(0);

            const stillAsset = res.Spec.Assets.Approved.find((a) => a.Key === 'ref-video-still');
            const videoAsset = res.Spec.Assets.Approved.find((a) => a.Key === 'ref-video');
            expect(stillAsset?.Provenance).toBe('Generated');
            expect(stillAsset?.Generation?.ReferenceKeys).toEqual(['brand:Hero', 'logo-main']);
            expect(videoAsset?.Provenance).toBe('Generated');
            expect(videoAsset?.Generation?.ReferenceKeys).toEqual(['ref-video-still']);
        }

        // 5d: Video with keyframes -> 1 ImageToVideo call and 0 image calls
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'kf-video',
                    Kind: 'Video',
                    Purpose: 'Animated transition from logo-main',
                    Prompt: 'Camera push through geometric glass frame',
                    ReferenceKeys: [],
                    Keyframes: [{ Seconds: 0, AssetKey: 'logo-main' }],
                    DurationSeconds: 5,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(imageCalls).toHaveLength(0);
            expect(videoCalls).toHaveLength(1);
            expect(videoCalls[0].Mode).toBe('ImageToVideo');
            expect(videoCalls[0].Keyframes).toHaveLength(1);
            expect(videoCalls[0].Keyframes?.[0].Seconds).toBe(0);
            const kfAsset = res.Spec.Assets.Approved.find((a) => a.Key === 'kf-video');
            expect(kfAsset?.Generation?.ReferenceKeys).toEqual(['logo-main']);
        }

        // 5e: GenerationDisabled applies per kind (images off lets video through; video off lets image through)
        {
            vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
                AllowGeneratedImages: false,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
                MaxGenerationCostPerRun: 5,
            });
            const videoOnlySpec = makeFixtureSpec();
            videoOnlySpec.Assets.Generate = [videoOnlySpec.Assets.Generate![0]];
            const { videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const vidRes = await GenerateRequestedAssets(videoOnlySpec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(1);
            expect(vidRes.Spec.Assets.Generate![0].Status).toBe('Generated');

            vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: false,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
                MaxGenerationCostPerRun: 5,
            });
            const imageOnlySpec = makeFixtureSpec();
            imageOnlySpec.Assets.Generate = [imageOnlySpec.Assets.Generate![1]];
            const { imageCalls, imageRunner: imgR2, videoRunner: vidR2 } = createFakeRunners();
            const imgRes = await GenerateRequestedAssets(imageOnlySpec, {
                ContextUser: mockUser,
                ImageRunner: imgR2,
                VideoRunner: vidR2,
            });
            expect(imageCalls).toHaveLength(1);
            expect(imgRes.Spec.Assets.Generate![0].Status).toBe('Generated');
        }

        // 5f: Video with Keyframes referencing an unflagged brand-kit asset -> 0 video calls, Blocked with GenerationFailed, and no FILE_ID_UNFLAGGED_KIT bytes sent
        {
            vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
                MaxGenerationCostPerRun: 5,
            });
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'kf-unflagged-video',
                    Kind: 'Video',
                    Purpose: 'Transition that illegally references unflagged brand asset',
                    Prompt: 'Camera glide over geometric background',
                    ReferenceKeys: [],
                    Keyframes: [{ Seconds: 0, AssetKey: 'brand:UnflaggedSecret' }],
                    DurationSeconds: 5,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(imageCalls).toHaveLength(0);
            expect(videoCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('GenerationFailed');
            expect(JSON.stringify(videoCalls)).not.toContain(FILE_ID_UNFLAGGED_KIT);
        }
    });

    it('6. Spend cap mid-pass: pre-call spend estimate blocks second call before runner is invoked, blocks Case 2 video call after anchor still reaches cap, and fails closed when no active ModelCost exists', async () => {
        vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
            AllowGeneratedImages: true,
            AllowGeneratedVideo: true,
            AllowSyntheticPeople: false,
            AvoidSubjects: [],
            MaxGenerationCostPerRun: 1.0,
        });

        // 6a: Cap 1.00; first request (6s video, estimated 0.60 <= 1.00, actual 0.80) succeeds;
        // second request (image, estimated 0.25 -> 0.80 + 0.25 = 1.05 > 1.00) is blocked BEFORE imageRunner is called
        {
            const spec = makeFixtureSpec();
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
                videoCost: 0.8,
                imageCost: 0.5,
            });

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(videoCalls).toHaveLength(1);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
            expect(res.Spec.Assets.Approved.some((a) => a.Key === 'ambient-bg')).toBe(true);
        }

        // 6b: Case 2 video with references where anchor still costs 1.00 -> still kept in Approved, video call blocked before videoRunner is invoked
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'ref-cap-video',
                    Kind: 'Video',
                    Purpose: 'Brand-styled motion background',
                    Prompt: 'Abstract ribbons in brand colors',
                    ReferenceKeys: ['logo-main'],
                    DurationSeconds: 6,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
                imageCost: 1.0,
                videoCost: 0.6,
            });

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(imageCalls).toHaveLength(1);
            expect(videoCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('SpendCapReached');
            expect(res.Spec.Assets.Approved.some((a) => a.Key === 'ref-cap-video-still')).toBe(
                true,
            );
            expect(res.Spec.Assets.Approved.some((a) => a.Key === 'ref-cap-video')).toBe(false);
        }

        // 6c: Fails closed when AIEngine.Instance.ModelCosts has no active price row for the candidate model
        {
            vi.spyOn(AIEngine.Instance, 'ModelCosts', 'get').mockReturnValue([]);
            const spec = makeFixtureSpec();
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(videoCalls).toHaveLength(0);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('GenerationFailed');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![1].BlockedReason).toContain('GenerationFailed');
        }

        // 6d: Multi-model carrier prompt prices the worst-case bound PromptModel candidate ($0.25/s * 6s = $1.50 > $1.00 cap -> SpendCapReached),
        // and fails closed (GenerationFailed) when any bound candidate has no active ModelCost row
        {
            vi.spyOn(AIEngine.Instance, 'PromptModels', 'get').mockReturnValue([
                {
                    ID: 'pm-video-veo-std',
                    PromptID: PROMPT_VIDEO_ID,
                    ModelID: 'model-veo-3-1',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                } as unknown as MJAIPromptModelEntity,
                {
                    ID: 'pm-video-veo-hq',
                    PromptID: PROMPT_VIDEO_ID,
                    ModelID: 'model-veo-3-1-hq',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                } as unknown as MJAIPromptModelEntity,
                {
                    ID: 'pm-image-imagen',
                    PromptID: PROMPT_IMAGE_ID,
                    ModelID: 'model-imagen-4',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                } as unknown as MJAIPromptModelEntity,
            ]);
            vi.spyOn(AIEngine.Instance, 'ModelCosts', 'get').mockReturnValue([
                {
                    ID: 'cost-veo-per-sec',
                    ModelID: 'model-veo-3-1',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                    ProcessingType: 'Realtime',
                    UnitTypeID: UNIT_TYPE_PER_SECOND_ID,
                    UnitType: 'Per Second',
                    InputPricePerUnit: 0,
                    OutputPricePerUnit: 0.1,
                    Currency: 'USD',
                } as unknown as MJAIModelCostEntity,
                {
                    ID: 'cost-veo-hq-per-sec',
                    ModelID: 'model-veo-3-1-hq',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                    ProcessingType: 'Realtime',
                    UnitTypeID: UNIT_TYPE_PER_SECOND_ID,
                    UnitType: 'Per Second',
                    InputPricePerUnit: 0,
                    OutputPricePerUnit: 0.25,
                    Currency: 'USD',
                } as unknown as MJAIModelCostEntity,
                {
                    ID: 'cost-imagen-per-img',
                    ModelID: 'model-imagen-4',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                    ProcessingType: 'Realtime',
                    UnitTypeID: UNIT_TYPE_PER_IMAGE_ID,
                    UnitType: 'Per Image',
                    InputPricePerUnit: 0,
                    OutputPricePerUnit: 0.25,
                    Currency: 'USD',
                } as unknown as MJAIModelCostEntity,
            ]);

            const spec = makeFixtureSpec();
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });
            expect(videoCalls).toHaveLength(0);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('SpendCapReached');

            // Remove the cost row for the second bound candidate -> fails closed with GenerationFailed
            vi.spyOn(AIEngine.Instance, 'ModelCosts', 'get').mockReturnValue([
                {
                    ID: 'cost-veo-per-sec',
                    ModelID: 'model-veo-3-1',
                    VendorID: 'vendor-google',
                    Status: 'Active',
                    ProcessingType: 'Realtime',
                    UnitTypeID: UNIT_TYPE_PER_SECOND_ID,
                    UnitType: 'Per Second',
                    InputPricePerUnit: 0,
                    OutputPricePerUnit: 0.1,
                    Currency: 'USD',
                } as unknown as MJAIModelCostEntity,
            ]);
            const specUnpriced = makeFixtureSpec();
            specUnpriced.Assets.Generate = [specUnpriced.Assets.Generate![0]];
            const unpricedRunners = createFakeRunners();
            const unpricedRes = await GenerateRequestedAssets(specUnpriced, {
                ContextUser: mockUser,
                ImageRunner: unpricedRunners.imageRunner,
                VideoRunner: unpricedRunners.videoRunner,
            });
            expect(unpricedRunners.videoCalls).toHaveLength(0);
            expect(unpricedRes.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(unpricedRes.Spec.Assets.Generate![0].BlockedReason).toContain(
                'GenerationFailed',
            );
        }

        // Restore single-candidate PromptModels and default ModelCosts for 6e and 6f
        vi.spyOn(AIEngine.Instance, 'PromptModels', 'get').mockReturnValue([
            {
                ID: 'pm-video-veo',
                PromptID: PROMPT_VIDEO_ID,
                ModelID: 'model-veo-3-1',
                VendorID: 'vendor-google',
                Status: 'Active',
            } as unknown as MJAIPromptModelEntity,
            {
                ID: 'pm-image-imagen',
                PromptID: PROMPT_IMAGE_ID,
                ModelID: 'model-imagen-4',
                VendorID: 'vendor-google',
                Status: 'Active',
            } as unknown as MJAIPromptModelEntity,
        ]);
        vi.spyOn(AIEngine.Instance, 'ModelCosts', 'get').mockReturnValue([
            {
                ID: 'cost-veo-per-sec',
                ModelID: 'model-veo-3-1',
                VendorID: 'vendor-google',
                Status: 'Active',
                ProcessingType: 'Realtime',
                UnitTypeID: UNIT_TYPE_PER_SECOND_ID,
                UnitType: 'Per Second',
                InputPricePerUnit: 0,
                OutputPricePerUnit: 0.1,
                Currency: 'USD',
            } as unknown as MJAIModelCostEntity,
            {
                ID: 'cost-imagen-per-img',
                ModelID: 'model-imagen-4',
                VendorID: 'vendor-google',
                Status: 'Active',
                ProcessingType: 'Realtime',
                UnitTypeID: UNIT_TYPE_PER_IMAGE_ID,
                UnitType: 'Per Image',
                InputPricePerUnit: 0,
                OutputPricePerUnit: 0.25,
                Currency: 'USD',
            } as unknown as MJAIModelCostEntity,
        ]);

        // 6e: Case 2 styled video clip where combined still + video estimate ($0.25 + 8s * $0.10 = $1.05 > $1.00 cap)
        // exceeds cap blocks BEFORE calling imageRunner (0 image calls, 0 video calls, no orphan <key>-still)
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'ref-combined-cap-video',
                    Kind: 'Video',
                    Purpose: 'Brand-styled motion background',
                    Prompt: 'Abstract ribbons in brand colors',
                    ReferenceKeys: ['logo-main'],
                    DurationSeconds: 8,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(imageCalls).toHaveLength(0);
            expect(videoCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('SpendCapReached');
            expect(
                res.Spec.Assets.Approved.some((a) => a.Key === 'ref-combined-cap-video-still'),
            ).toBe(false);
        }

        // 6f: When a completed call omits actual Cost, spendSoFar still advances by the pre-call estimate
        // (8s video estimated at $0.80), blocking the next image request ($0.25 -> $1.05 > $1.00 cap) without fabricating Generation.Cost
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate![0].DurationSeconds = 8;
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
                omitVideoCost: true,
            });

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(videoCalls).toHaveLength(1);
            expect(imageCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
            const genVid = res.Spec.Assets.Approved.find((a) => a.Key === 'ambient-bg');
            expect(genVid?.Generation?.Cost).toBeUndefined();
            expect(res.TotalCost).toBe(0);
        }

        // 6g: Two-pass cross-pass spend when a Generated asset in Approved has no recorded Cost:
        // two 6s clips (c1, c2) with omitVideoCost under a $1.00 cap ($0.60 estimate each).
        // Pass 1 generates c1 (1 call) and blocks c2 (SpendCapReached), with c1.Generation.Cost === undefined;
        // Pass 2 over pass1.Spec re-estimates c1's $0.60 spend via SumRecordedGenerationCost and generates nothing more
        // (0 video calls, c2 remains Blocked SpendCapReached, c1.Generation.Cost stays undefined, TotalCost === 0).
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'c1',
                    Kind: 'Video',
                    Purpose: 'Clip 1',
                    Prompt: 'Abstract geometric ribbon 1',
                    ReferenceKeys: [],
                    DurationSeconds: 6,
                },
                {
                    Key: 'c2',
                    Kind: 'Video',
                    Purpose: 'Clip 2',
                    Prompt: 'Abstract geometric ribbon 2',
                    ReferenceKeys: [],
                    DurationSeconds: 6,
                },
            ];

            const pass1Runners = createFakeRunners({ omitVideoCost: true });
            const pass1 = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: pass1Runners.imageRunner,
                VideoRunner: pass1Runners.videoRunner,
            });

            expect(pass1Runners.videoCalls).toHaveLength(1);
            expect(pass1.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(pass1.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(pass1.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
            const c1Pass1 = pass1.Spec.Assets.Approved.find((a) => a.Key === 'c1');
            expect(c1Pass1?.Generation?.Cost).toBeUndefined();
            expect(SumRecordedGenerationCost(pass1.Spec)).toBeCloseTo(0.6, 5);
            expect(c1Pass1?.Generation?.Cost).toBeUndefined();

            const pass2Runners = createFakeRunners({ omitVideoCost: true });
            const pass2 = await GenerateRequestedAssets(pass1.Spec, {
                ContextUser: mockUser,
                ImageRunner: pass2Runners.imageRunner,
                VideoRunner: pass2Runners.videoRunner,
            });

            expect(pass2Runners.videoCalls).toHaveLength(0);
            expect(pass2Runners.imageCalls).toHaveLength(0);
            expect(pass2.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(pass2.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(pass2.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
            const c1Pass2 = pass2.Spec.Assets.Approved.find((a) => a.Key === 'c1');
            expect(c1Pass2?.Generation?.Cost).toBeUndefined();
            expect(pass2.TotalCost).toBe(0);
        }

        // 6h: When an Image request omits actual Cost (omitImageCost: true), spendSoFar advances by estimatedImageCost ($0.25),
        // blocking a subsequent 8s Video request ($0.25 + $0.80 = $1.05 > $1.00 cap) before videoRunner is invoked
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'chapter-card',
                    Kind: 'Image',
                    Purpose: 'Illustrative chapter divider card for Beat 2.',
                    Prompt: 'Minimalist architectural glass prism on dark slate surface',
                    ReferenceKeys: ['brand:Hero', 'logo-main'],
                },
                {
                    Key: 'ambient-bg',
                    Kind: 'Video',
                    Purpose: 'Ambient geometric background loop behind Beat 1.',
                    Prompt: 'Soft geometric slate ribbons drifting slowly in warm studio light',
                    ReferenceKeys: [],
                    DurationSeconds: 8,
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
                omitImageCost: true,
            });

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(imageCalls).toHaveLength(1);
            expect(videoCalls).toHaveLength(0);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
            const genImg = res.Spec.Assets.Approved.find((a) => a.Key === 'chapter-card');
            expect(genImg?.Generation?.Cost).toBeUndefined();
            expect(res.TotalCost).toBe(0);
        }

        // 6i: When a Case 2 anchor still (<key>-still) omits actual Cost (omitImageCost: true), spendSoFar advances by
        // estimatedStillCost ($0.25) plus the 6s video cost ($0.60) = $0.85, blocking a subsequent Image request
        // ($0.85 + $0.25 = $1.10 > $1.00 cap) before a second imageRunner call is made
        {
            const spec = makeFixtureSpec();
            spec.Assets.Generate = [
                {
                    Key: 'ref-video-uncosted-still',
                    Kind: 'Video',
                    Purpose: 'Brand-styled motion background',
                    Prompt: 'Abstract ribbons in brand colors',
                    ReferenceKeys: ['logo-main'],
                    DurationSeconds: 6,
                },
                {
                    Key: 'chapter-card',
                    Kind: 'Image',
                    Purpose: 'Illustrative chapter divider card for Beat 2.',
                    Prompt: 'Minimalist architectural glass prism on dark slate surface',
                    ReferenceKeys: [],
                },
            ];
            const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
                omitImageCost: true,
                videoCost: 0.6,
            });

            const res = await GenerateRequestedAssets(spec, {
                ContextUser: mockUser,
                ImageRunner: imageRunner,
                VideoRunner: videoRunner,
            });

            expect(imageCalls).toHaveLength(1);
            expect(videoCalls).toHaveLength(1);
            expect(res.Spec.Assets.Generate![0].Status).toBe('Generated');
            expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
            expect(res.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
            const stillAsset = res.Spec.Assets.Approved.find(
                (a) => a.Key === 'ref-video-uncosted-still-still',
            );
            expect(stillAsset?.Generation?.Cost).toBeUndefined();
            expect(res.TotalCost).toBeCloseTo(0.6, 5);
        }
    });

    it('7. No storage: 0 calls, all requests marked Blocked with NoStorage', async () => {
        vi.spyOn(FileStorageEngine.Instance, 'HasStorageAccounts', 'get').mockReturnValue(false);
        const spec = makeFixtureSpec();
        const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();

        const res = await GenerateRequestedAssets(spec, {
            ContextUser: mockUser,
            HasStorage: false,
            ImageRunner: imageRunner,
            VideoRunner: videoRunner,
        });

        expect(videoCalls).toHaveLength(0);
        expect(imageCalls).toHaveLength(0);
        expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
        expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('NoStorage');
        expect(res.Spec.Assets.Generate![1].Status).toBe('Blocked');
        expect(res.Spec.Assets.Generate![1].BlockedReason).toContain('NoStorage');
    });

    it('8. Runner failure: failing request is marked Blocked with GenerationFailed and the other request still generates', async () => {
        const spec = makeFixtureSpec();
        const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
            failVideo: true,
        });

        const res = await GenerateRequestedAssets(spec, {
            ContextUser: mockUser,
            ImageRunner: imageRunner,
            VideoRunner: videoRunner,
        });

        expect(videoCalls).toHaveLength(1);
        expect(imageCalls).toHaveLength(1);
        expect(res.Spec.Assets.Generate![0].Status).toBe('Blocked');
        expect(res.Spec.Assets.Generate![0].BlockedReason).toContain('GenerationFailed');
        expect(res.Spec.Assets.Generate![1].Status).toBe('Generated');
        expect(res.Spec.Assets.Approved.some((a) => a.Key === 'chapter-card')).toBe(true);
    });

    it('9. Idempotent: a second pass over a fully generated spec makes 0 calls', async () => {
        const spec = makeFixtureSpec();
        const firstRunners = createFakeRunners();
        const firstPass = await GenerateRequestedAssets(spec, {
            ContextUser: mockUser,
            ImageRunner: firstRunners.imageRunner,
            VideoRunner: firstRunners.videoRunner,
        });
        expect(firstRunners.videoCalls).toHaveLength(1);
        expect(firstRunners.imageCalls).toHaveLength(1);

        const secondRunners = createFakeRunners();
        const secondPass = await GenerateRequestedAssets(firstPass.Spec, {
            ContextUser: mockUser,
            ImageRunner: secondRunners.imageRunner,
            VideoRunner: secondRunners.videoRunner,
        });
        expect(secondRunners.videoCalls).toHaveLength(0);
        expect(secondRunners.imageCalls).toHaveLength(0);
        expect(secondPass.Spec.Assets.Generate!.every((r) => r.Status === 'Generated')).toBe(true);
    });

    it('10. WantAudio defaults to false and passes true when set (without "Play muted."); APIKeys and CredentialScope are passed through', async () => {
        const spec = makeFixtureSpec();
        spec.Assets.Generate![0].WantAudio = true;
        const apiKeys: AIAPIKey[] = [{ driverClass: 'GoogleVideoGenerator', apiKey: 'test-key-123' }];
        const credentialScope: AICredentialScope = 'RuntimeOnly';

        const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners();
        const ctx: GenerateRequestedAssetsContext = {
            ContextUser: mockUser,
            APIKeys: apiKeys,
            CredentialScope: credentialScope,
            AgentID: 'agent-preprod',
            AgentRunID: 'run-preprod-99',
            ImageRunner: imageRunner,
            VideoRunner: videoRunner,
        };

        const res = await GenerateRequestedAssets(spec, ctx);

        expect(videoCalls[0].WantAudio).toBe(true);
        expect(videoCalls[0].APIKeys).toBe(apiKeys);
        expect(videoCalls[0].CredentialScope).toBe(credentialScope);
        expect(videoCalls[0].AgentID).toBe('agent-preprod');
        expect(videoCalls[0].AgentRunID).toBe('run-preprod-99');

        expect(imageCalls[0].APIKeys).toBe(apiKeys);
        expect(imageCalls[0].CredentialScope).toBe(credentialScope);

        const videoAsset = res.Spec.Assets.Approved.find((a) => a.Key === 'ambient-bg');
        expect(videoAsset?.Usage).toBe('Ambient geometric background loop behind Beat 1.');
        expect(videoAsset?.Usage).not.toContain('Play muted.');
    });

    it('11. Spend cap counts failed paid calls (cap $10, two $9 estimates: first fails after runner call, second is refused by the cap and stays refused on a second pass)', async () => {
        vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
            AllowGeneratedImages: true,
            AllowGeneratedVideo: true,
            AllowSyntheticPeople: false,
            MaxGenerationCostPerRun: 10,
        });
        vi.spyOn(AIEngine.Instance, 'ModelCosts', 'get').mockReturnValue([
            {
                ID: 'cost-veo-per-sec-9',
                ModelID: 'model-veo-3-1',
                VendorID: 'vendor-google',
                Status: 'Active',
                ProcessingType: 'Realtime',
                UnitTypeID: UNIT_TYPE_PER_SECOND_ID,
                UnitType: 'Per Second',
                InputPricePerUnit: 0,
                OutputPricePerUnit: 1.5, // 6s * $1.50 = $9.00 estimate
                Currency: 'USD',
            } as unknown as MJAIModelCostEntity,
            {
                ID: 'cost-imagen-per-img-9',
                ModelID: 'model-imagen-4',
                VendorID: 'vendor-google',
                Status: 'Active',
                ProcessingType: 'Realtime',
                UnitTypeID: UNIT_TYPE_PER_IMAGE_ID,
                UnitType: 'Per Image',
                InputPricePerUnit: 0,
                OutputPricePerUnit: 9, // $9.00 estimate
                Currency: 'USD',
            } as unknown as MJAIModelCostEntity,
        ]);

        // Video first ($9 estimate) fails after runner call -> second ($9 image estimate) is refused by the $10 cap
        const spec = makeFixtureSpec();
        const { imageCalls, videoCalls, imageRunner, videoRunner } = createFakeRunners({
            failVideo: true,
        });

        const pass1 = await GenerateRequestedAssets(spec, {
            ContextUser: mockUser,
            ImageRunner: imageRunner,
            VideoRunner: videoRunner,
        });

        expect(videoCalls).toHaveLength(1);
        expect(imageCalls).toHaveLength(0);
        expect(pass1.Spec.Assets.Generate![0].Status).toBe('Blocked');
        expect(pass1.Spec.Assets.Generate![0].BlockedReason).toContain('GenerationFailed');
        expect(pass1.Spec.Assets.Generate![0].Cost).toBeCloseTo(9, 5);
        expect(pass1.Spec.Assets.Generate![1].Status).toBe('Blocked');
        expect(pass1.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
        expect(SumRecordedGenerationCost(pass1.Spec)).toBeCloseTo(9, 5);

        // Repair pass over pass1.Spec: SumRecordedGenerationCost counts the $9 on the blocked request so the second request cannot silently pay again
        const pass2Runners = createFakeRunners();
        const pass2 = await GenerateRequestedAssets(pass1.Spec, {
            ContextUser: mockUser,
            ImageRunner: pass2Runners.imageRunner,
            VideoRunner: pass2Runners.videoRunner,
        });
        expect(pass2Runners.videoCalls).toHaveLength(0);
        expect(pass2Runners.imageCalls).toHaveLength(0);
        expect(pass2.Spec.Assets.Generate![1].Status).toBe('Blocked');
        expect(pass2.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');

        // Image first ($9 estimate) fails after runner call -> second ($9 image estimate) is refused by the $10 cap
        const imgSpec = makeFixtureSpec();
        imgSpec.Assets.Generate = [
            {
                Key: 'img-1',
                Kind: 'Image',
                Purpose: 'Card 1',
                Prompt: 'Abstract geometric card 1',
                ReferenceKeys: [],
            },
            {
                Key: 'img-2',
                Kind: 'Image',
                Purpose: 'Card 2',
                Prompt: 'Abstract geometric card 2',
                ReferenceKeys: [],
            },
        ];
        const imgRunners = createFakeRunners({ failImage: true });
        const imgPass = await GenerateRequestedAssets(imgSpec, {
            ContextUser: mockUser,
            ImageRunner: imgRunners.imageRunner,
            VideoRunner: imgRunners.videoRunner,
        });
        expect(imgRunners.imageCalls).toHaveLength(1);
        expect(imgPass.Spec.Assets.Generate![0].Status).toBe('Blocked');
        expect(imgPass.Spec.Assets.Generate![0].BlockedReason).toContain('GenerationFailed');
        expect(imgPass.Spec.Assets.Generate![0].Cost).toBeCloseTo(9, 5);
        expect(imgPass.Spec.Assets.Generate![1].Status).toBe('Blocked');
        expect(imgPass.Spec.Assets.Generate![1].BlockedReason).toContain('SpendCapReached');
    });
});

