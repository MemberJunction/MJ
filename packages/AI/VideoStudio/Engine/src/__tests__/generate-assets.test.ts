import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIAPIKey, AICredentialScope } from '@memberjunction/ai';
import type {
    AIImageGenerationRunParams,
    AIImageRunResult,
    AIVideoGenerationRunParams,
    AIVideoGenerationRunResult,
} from '@memberjunction/ai-prompts';
import { RunView, type UserInfo } from '@memberjunction/core';
import {
    BrandKitEngine,
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

const PNG_MAGIC_BYTES = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02,
]);
const MP4_FAKE_BYTES = Buffer.from('00000018667479706d703432c2pa-manifest', 'utf8');

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
                    Entrance: 'fade-up',
                    Hold: 'steady',
                    Exit: 'fade-out',
                    DurationMs: 400,
                    Easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
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
                };
            }
            return {
                Success: true,
                PromptRunID: `prompt-run-img-${imageCalls.length}`,
                ModelID: 'model-imagen-4',
                ModelName: 'Imagen 4',
                ImageResult: {
                    success: true,
                    images: [
                        {
                            data: Buffer.from(PNG_MAGIC_BYTES),
                            format: 'png',
                            width: 1920,
                            height: 1080,
                        },
                    ],
                },
                ...(options?.imageCost !== undefined ? { Cost: options.imageCost } : { Cost: 0.08 }),
                C2PA: true,
            } as AIImageRunResult & { Cost?: number; C2PA?: boolean };
        }),
    };

    const videoRunner = {
        RunGenerateVideo: vi.fn(async (params: AIVideoGenerationRunParams): Promise<AIVideoGenerationRunResult> => {
            videoCalls.push(params);
            if (options?.failVideo) {
                return {
                    Success: false,
                    ErrorMessage: 'Vendor video service timed out',
                };
            }
            return {
                Success: true,
                PromptRunID: `prompt-run-vid-${videoCalls.length}`,
                ModelID: 'model-veo-3-1',
                ModelName: 'Veo 3.1',
                JobID: `job-vid-${videoCalls.length}`,
                Cost: options?.videoCost !== undefined ? options.videoCost : 0.42,
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

        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true,
            Results: [],
        } as never);
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
            C2PA: true,
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
    });

    it('6. Spend cap mid-pass: cap 1.00, first cost 1.00 (or 0.80 with prior 0.20), second is blocked SpendCapReached while first asset is kept', async () => {
        vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
            AllowGeneratedImages: true,
            AllowGeneratedVideo: true,
            AllowSyntheticPeople: false,
            AvoidSubjects: [],
            MaxGenerationCostPerRun: 1.0,
        });

        const spec = makeFixtureSpec();
        // Add a prior generated asset costing 0.20 so after the first request (0.80), spendSoFar reaches 1.00
        spec.Assets.Approved.push({
            Key: 'prior-gen-img',
            Kind: 'Image',
            FileID: '55555555-5555-4555-8555-555555555555',
            Source: 'Generated by Imagen 4',
            Provenance: 'Generated',
            Usage: 'Prior card',
            MustUse: false,
            Generation: {
                ModelID: 'model-imagen-4',
                PromptRunID: 'pr-prior-img',
                Prompt: 'Abstract card',
                ReferenceKeys: [],
                Cost: 0.2,
            },
        });

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
        const credentialScope: AICredentialScope = { CompanyID: 'comp-1' } as AICredentialScope;

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
});
