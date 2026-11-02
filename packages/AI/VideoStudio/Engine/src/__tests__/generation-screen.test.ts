import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandKitEngine } from '@memberjunction/core-entities';
import type {
    VideoAssetGenerationRequest,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    ResolveGenerationPolicy,
    type ResolvedGenerationPolicy,
} from '../generation/generation-policy.js';
import {
    ComposeGenerationPrompt,
    GENERATION_BLOCK_CODES,
    MatchesScreenEntry,
    PERSON_TERMS,
    ScreenGenerationRequest,
} from '../generation/generation-screen.js';
import { DEFAULT_VIDEO_STUDIO_SETTINGS } from '../settings.js';

function makeBasePolicy(overrides: Partial<ResolvedGenerationPolicy> = {}): ResolvedGenerationPolicy {
    return {
        AllowGeneratedImages: true,
        AllowGeneratedVideo: true,
        AllowSyntheticPeople: false,
        AvoidSubjects: [],
        MaxGenerationCostPerRun: 5,
        NeverInvent: ['product UI', 'logo', 'metrics'],
        ReferenceAssets: [],
        ...overrides,
    };
}

function makeBaseSpec(): Partial<VideoGenerationSpec> {
    return {
        SpecVersion: '1.0',
        Assets: {
            Approved: [],
            Required: [],
            Generate: [],
            NeverInvent: ['product UI'],
        },
    };
}

function makeVideoRequest(
    overrides: Partial<VideoAssetGenerationRequest> = {},
): VideoAssetGenerationRequest {
    return {
        Key: 'bg-loop',
        Kind: 'Video',
        Purpose: 'Abstract ambient background behind title card',
        Prompt: 'Soft geometric gradient ribbons drifting across a dark slate canvas',
        ReferenceKeys: [],
        DurationSeconds: 6,
        ...overrides,
    };
}

describe('generation-screen (VS-GEN-6)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('exports all 8 ordered block codes and PERSON_TERMS', () => {
        expect(GENERATION_BLOCK_CODES).toEqual([
            'GenerationDisabled',
            'FillsFactRequirement',
            'NeverInventMatch',
            'PolicySubjectMatch',
            'SyntheticPersonDisallowed',
            'ExceedsGeneratedVideoSecondsCap',
            'SpendCapReached',
            'NoStorage',
        ]);
        expect(PERSON_TERMS).toContain('crowd');
        expect(PERSON_TERMS).toContain('people');
        expect(PERSON_TERMS).toContain('ceo');
    });

    describe('each block code in order, with a corresponding pass case', () => {
        it('1. GenerationDisabled blocks Image when AllowGeneratedImages is false and Video when AllowGeneratedVideo is false, and passes when enabled', () => {
            const spec = makeBaseSpec();
            const imgReq = makeVideoRequest({
                Key: 'divider-art',
                Kind: 'Image',
                DurationSeconds: undefined,
            });
            const vidReq = makeVideoRequest({ Key: 'bg-loop', Kind: 'Video', DurationSeconds: 6 });

            const imgBlocked = ScreenGenerationRequest(
                imgReq,
                spec,
                makeBasePolicy({ AllowGeneratedImages: false }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(imgBlocked.Allowed).toBe(false);
            expect(imgBlocked.Code).toBe('GenerationDisabled');

            const vidAllowedWhileImgOff = ScreenGenerationRequest(
                vidReq,
                spec,
                makeBasePolicy({ AllowGeneratedImages: false, AllowGeneratedVideo: true }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(vidAllowedWhileImgOff.Allowed).toBe(true);

            const vidBlocked = ScreenGenerationRequest(
                vidReq,
                spec,
                makeBasePolicy({ AllowGeneratedVideo: false }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(vidBlocked.Allowed).toBe(false);
            expect(vidBlocked.Code).toBe('GenerationDisabled');

            const imgAllowedWhileVidOff = ScreenGenerationRequest(
                imgReq,
                spec,
                makeBasePolicy({ AllowGeneratedImages: true, AllowGeneratedVideo: false }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(imgAllowedWhileVidOff.Allowed).toBe(true);
        });

        it('2. FillsFactRequirement blocks a request matching Assets.Required without AllowGenerated: true, and passes when AllowGenerated: true', () => {
            const req = makeVideoRequest({ Key: 'req-hero' });
            const specWithoutFlag: Partial<VideoGenerationSpec> = {
                ...makeBaseSpec(),
                Assets: {
                    Approved: [],
                    Required: [
                        {
                            Key: 'req-hero',
                            Kind: 'Video',
                            Description: 'Real product demo recording',
                            MustUse: true,
                        },
                    ],
                    Generate: [req],
                    NeverInvent: [],
                },
            };

            const blocked = ScreenGenerationRequest(
                req,
                specWithoutFlag,
                makeBasePolicy({ NeverInvent: [] }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('FillsFactRequirement');

            const specWithFlag: Partial<VideoGenerationSpec> = {
                ...makeBaseSpec(),
                Assets: {
                    Approved: [],
                    Required: [
                        {
                            Key: 'req-hero',
                            Kind: 'Video',
                            Description: 'Illustrative transition loop',
                            MustUse: false,
                            AllowGenerated: true,
                        },
                    ],
                    Generate: [req],
                    NeverInvent: [],
                },
            };
            const allowed = ScreenGenerationRequest(
                req,
                specWithFlag,
                makeBasePolicy({ NeverInvent: [] }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(allowed.Allowed).toBe(true);
        });

        it('3. NeverInventMatch blocks when prompt matches a NeverInvent entry and passes when unrelated', () => {
            const spec = makeBaseSpec();
            const policy = makeBasePolicy({ NeverInvent: ['product UI', 'customer quotes'] });

            const blocked = ScreenGenerationRequest(
                makeVideoRequest({ Prompt: 'Close-up of our product dashboard glowing in neon' }),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('NeverInventMatch');

            const allowed = ScreenGenerationRequest(
                makeVideoRequest({ Prompt: 'Abstract aurora waves over dark slate' }),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(allowed.Allowed).toBe(true);
        });

        it('4. PolicySubjectMatch blocks when prompt matches AvoidSubjects and passes otherwise', () => {
            const spec = makeBaseSpec();
            const policy = makeBasePolicy({
                NeverInvent: [],
                AvoidSubjects: ['neon cyberpunk', 'stock tickers'],
            });

            const blocked = ScreenGenerationRequest(
                makeVideoRequest({ Prompt: 'A glowing neon cityscape at dusk' }),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('PolicySubjectMatch');

            const allowed = ScreenGenerationRequest(
                makeVideoRequest({ Prompt: 'Warm linen paper texture with subtle grain' }),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(allowed.Allowed).toBe(true);
        });

        it('5. SyntheticPersonDisallowed blocks "a crowd at a concert" under default policy and allows it with AllowSyntheticPeople: true', () => {
            const spec = makeBaseSpec();
            const concertReq = makeVideoRequest({
                Prompt: 'a crowd at a concert under stage lights',
            });

            const blocked = ScreenGenerationRequest(
                concertReq,
                spec,
                makeBasePolicy({ NeverInvent: [], AllowSyntheticPeople: false }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('SyntheticPersonDisallowed');

            const allowed = ScreenGenerationRequest(
                concertReq,
                spec,
                makeBasePolicy({ NeverInvent: [], AllowSyntheticPeople: true }),
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(allowed.Allowed).toBe(true);
        });

        it('6. ExceedsGeneratedVideoSecondsCap blocks when already-generated + pass seconds > MaxGeneratedVideoSeconds, and passes at or below cap', () => {
            const specWith15s: Partial<VideoGenerationSpec> = {
                ...makeBaseSpec(),
                Assets: {
                    Approved: [
                        {
                            Key: 'prior-clip',
                            Kind: 'Video',
                            FileID: '11111111-1111-4111-8111-111111111111',
                            Source: 'Generated by Veo',
                            Provenance: 'Generated',
                            Usage: 'Intro loop',
                            MustUse: false,
                            Generation: {
                                ModelID: 'veo-1',
                                PromptRunID: 'pr-1',
                                Prompt: 'Abstract loop',
                                ReferenceKeys: [],
                                DurationSeconds: 15,
                            },
                        },
                    ],
                    Required: [],
                    Generate: [],
                    NeverInvent: [],
                },
            };
            const draftSettings = {
                ...DEFAULT_VIDEO_STUDIO_SETTINGS,
                MaxGeneratedVideoSeconds: 20,
            };

            const blocked = ScreenGenerationRequest(
                makeVideoRequest({ DurationSeconds: 6 }),
                specWith15s,
                makeBasePolicy({ NeverInvent: [] }),
                draftSettings,
                0,
                true,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('ExceedsGeneratedVideoSecondsCap');

            const allowedAtCap = ScreenGenerationRequest(
                makeVideoRequest({ DurationSeconds: 5 }),
                specWith15s,
                makeBasePolicy({ NeverInvent: [] }),
                draftSettings,
                0,
                true,
            );
            expect(allowedAtCap.Allowed).toBe(true);
        });

        it('7. SpendCapReached blocks when spendSoFar >= MaxGenerationCostPerRun and passes when below', () => {
            const spec = makeBaseSpec();
            const policy = makeBasePolicy({ NeverInvent: [], MaxGenerationCostPerRun: 1.0 });

            const blocked = ScreenGenerationRequest(
                makeVideoRequest(),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                1.0,
                true,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('SpendCapReached');

            const allowed = ScreenGenerationRequest(
                makeVideoRequest(),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0.8,
                true,
            );
            expect(allowed.Allowed).toBe(true);
        });

        it('8. NoStorage blocks when hasStorage is false and passes when true', () => {
            const spec = makeBaseSpec();
            const policy = makeBasePolicy({ NeverInvent: [] });

            const blocked = ScreenGenerationRequest(
                makeVideoRequest(),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                false,
            );
            expect(blocked.Allowed).toBe(false);
            expect(blocked.Code).toBe('NoStorage');

            const allowed = ScreenGenerationRequest(
                makeVideoRequest(),
                spec,
                policy,
                DEFAULT_VIDEO_STUDIO_SETTINGS,
                0,
                true,
            );
            expect(allowed.Allowed).toBe(true);
        });
    });

    describe('match-rule table', () => {
        it('matches whole words >= 3 letters after dropping stopwords, allowing a trailing s on either side', () => {
            // "product UI" blocks "our product dashboard" (via "product", since "UI" is 2 letters)
            expect(MatchesScreenEntry('product UI', 'our product dashboard')).toBe(true);
            // "real people" blocks "happy people in a park" (via "people", since "real" is a stopword)
            expect(MatchesScreenEntry('real people', 'happy people in a park')).toBe(true);
            expect(MatchesScreenEntry('real people', 'a real stone arch in the desert')).toBe(false);
            // "logo" blocks "a logo animation"
            expect(MatchesScreenEntry('logo', 'a logo animation')).toBe(true);
            // "metrics" blocks "metric" (trailing s allowed on either side)
            expect(MatchesScreenEntry('metrics', 'abstract metric grid')).toBe(true);
            expect(MatchesScreenEntry('metric', 'abstract metrics grid')).toBe(true);
        });
    });

    describe('null policy defaults & ComposeGenerationPrompt', () => {
        it('ResolveGenerationPolicy returns safe defaults when no brand kit is attached or GenerationPolicy is null', () => {
            vi.spyOn(BrandKitEngine.Instance, 'GetKitsForCompany').mockReturnValue([]);
            vi.spyOn(BrandKitEngine.Instance, 'GetEffectiveGenerationPolicy').mockReturnValue({
                AllowGeneratedImages: true,
                AllowGeneratedVideo: true,
                AllowSyntheticPeople: false,
                AvoidSubjects: [],
                MaxGenerationCostPerRun: 5,
            });

            const resolved = ResolveGenerationPolicy({
                Assets: {
                    Approved: [],
                    Required: [],
                    Generate: [],
                    NeverInvent: ['product UI'],
                },
            });
            expect(resolved.AllowGeneratedImages).toBe(true);
            expect(resolved.AllowGeneratedVideo).toBe(true);
            expect(resolved.AllowSyntheticPeople).toBe(false);
            expect(resolved.AvoidSubjects).toEqual([]);
            expect(resolved.MaxGenerationCostPerRun).toBe(5);
            expect(resolved.NeverInvent).toEqual(['product UI']);
            expect(resolved.ReferenceAssets).toEqual([]);

            expect(
                ComposeGenerationPrompt(
                    makeVideoRequest({ Prompt: 'Soft slate gradient' }),
                    resolved,
                ),
            ).toBe('Soft slate gradient');
            expect(
                ComposeGenerationPrompt(makeVideoRequest({ Prompt: 'Soft slate gradient' }), {
                    ...resolved,
                    StylePrompt: 'Editorial matte finish',
                }),
            ).toBe('Soft slate gradient Style: Editorial matte finish');
        });
    });
});
