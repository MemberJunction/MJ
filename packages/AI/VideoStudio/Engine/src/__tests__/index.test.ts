import { describe, it, expect } from 'vitest';
import {
    BuildProduceVideoRequest,
    CreateAbortError,
    DEFAULT_GENERATED_VIDEO_DURATION_SECONDS,
    DEFAULT_SETUP_HEALTH_RENDER_TIMEOUT_MS,
    EstimateGenerationCallCost,
    EstimateLoadedGenerationCallCost,
    FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
    FILE_VALIDATION_BATCH_SIZE,
    FindBrandKitForSpec,
    FindIntegrityOrGateCriterionFailure,
    FormatCheckIssue,
    LoadProduceVideoAction,
    LoadVideoStudioCriticAgent,
    LoadVideoStudioSetupHealthOperation,
    MAX_CAPTION_CHARS_PER_CUE,
    MAX_CAPTION_WORDS_PER_CUE,
    MAX_GENERATION_REFERENCES,
    MAX_KEYFRAME_IMAGES,
    MAX_RENDER_JSON_RESPONSE_BYTES,
    MAX_RENDER_NDJSON_LINE_BYTES,
    MAX_SETUP_HEALTH_RENDER_TIMEOUT_MS,
    MIN_SETUP_HEALTH_RENDER_TIMEOUT_MS,
    NARRATION_OUTPUT_FORMAT,
    PACKAGE_NAME,
    PRODUCE_VIDEO_DRIVER_CLASS,
    ProduceVideoAction,
    ResolveDeliverableFormats,
    ResolveGenerationReferenceAssets,
    ResolveRequestedVideoSeconds,
    SCREEN_RULE_STOP_WORDS,
    SETUP_HEALTH_NO_STORAGE_MESSAGE,
    SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION,
    SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE,
    SETUP_HEALTH_STORAGE_ACTION,
    SYNTHETIC_PERSON_TERMS,
    SanitizeStageKey,
    SumAlreadyGeneratedVideoSeconds,
    ThrowIfSignalAborted,
    VIDEO_STUDIO_AGENT_NAME,
    VIDEO_STUDIO_ORCHESTRATOR_PROMPT_NAME,
    VideoStudioAgentBase,
    VideoStudioSetupHealthServerOperation,
} from '../index.js';

describe('@memberjunction/video-studio', () => {
    it('exports the canonical package identifier and constants', () => {
        expect(PACKAGE_NAME).toBe('@memberjunction/video-studio');
        expect(PRODUCE_VIDEO_DRIVER_CLASS).toBe('Produce Video');
        expect(ProduceVideoAction).toBeTypeOf('function');
        expect(VideoStudioAgentBase).toBeTypeOf('function');
        expect(VideoStudioSetupHealthServerOperation).toBeTypeOf('function');
        expect(DEFAULT_GENERATED_VIDEO_DURATION_SECONDS).toBe(5);
        expect(DEFAULT_SETUP_HEALTH_RENDER_TIMEOUT_MS).toBeGreaterThan(0);
        expect(MIN_SETUP_HEALTH_RENDER_TIMEOUT_MS).toBeGreaterThan(0);
        expect(MAX_SETUP_HEALTH_RENDER_TIMEOUT_MS).toBeGreaterThan(MIN_SETUP_HEALTH_RENDER_TIMEOUT_MS);
        expect(SETUP_HEALTH_NO_STORAGE_MESSAGE.length).toBeGreaterThan(0);
        expect(SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION.length).toBeGreaterThan(0);
        expect(SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE.length).toBeGreaterThan(0);
        expect(SETUP_HEALTH_STORAGE_ACTION.length).toBeGreaterThan(0);
        expect(VIDEO_STUDIO_AGENT_NAME).toBe('Video Studio');
        expect(VIDEO_STUDIO_ORCHESTRATOR_PROMPT_NAME).toBe('Video Studio - Orchestrator');
        expect(FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64.length).toBeGreaterThan(10);
        expect(FILE_VALIDATION_BATCH_SIZE).toBe(500);
        expect(MAX_CAPTION_CHARS_PER_CUE).toBe(42);
        expect(MAX_CAPTION_WORDS_PER_CUE).toBeGreaterThan(0);
        expect(MAX_GENERATION_REFERENCES).toBeGreaterThan(0);
        expect(MAX_KEYFRAME_IMAGES).toBeGreaterThan(0);
        expect(MAX_RENDER_JSON_RESPONSE_BYTES).toBeGreaterThan(0);
        expect(MAX_RENDER_NDJSON_LINE_BYTES).toBeGreaterThan(0);
        expect(NARRATION_OUTPUT_FORMAT).toBe('mp3_44100_128');
        expect(SCREEN_RULE_STOP_WORDS.size).toBeGreaterThan(0);
        expect(SYNTHETIC_PERSON_TERMS.length).toBeGreaterThan(0);
    });

    it('exports working registration and helper functions from root index', () => {
        expect(() => LoadProduceVideoAction()).not.toThrow();
        expect(() => LoadVideoStudioCriticAgent()).not.toThrow();
        expect(() => LoadVideoStudioSetupHealthOperation()).not.toThrow();

        const abortCtrl = new AbortController();
        abortCtrl.abort('cancelled');
        const abortErr = CreateAbortError(abortCtrl.signal);
        expect(abortErr.name).toBe('AbortError');
        expect(() => ThrowIfSignalAborted(undefined)).not.toThrow();

        expect(FindBrandKitForSpec({})).toBeNull();
        expect(ResolveGenerationReferenceAssets({})).toEqual([]);
        expect(
            FindIntegrityOrGateCriterionFailure({}, {} as never),
        ).toBeNull();
        expect(
            FormatCheckIssue({
                Code: 'mj-safe-area',
                Category: 'SafeArea',
                Severity: 'Error',
                Message: 'clipped',
                File: 'index.html',
                Line: 10,
            }),
        ).toContain('mj-safe-area: clipped');
        expect(ResolveDeliverableFormats({ Format: '16:9', DeliverableFormats: [] } as never)).toEqual(['16:9']);
        expect(SanitizeStageKey('hero image #1')).toBe('hero-image-1');
        expect(ResolveRequestedVideoSeconds({ Kind: 'video', Prompt: 'bg', DurationSeconds: 6 } as never)).toBe(6);
        expect(SumAlreadyGeneratedVideoSeconds({})).toBe(0);
        expect(EstimateGenerationCallCost).toBeTypeOf('function');
        expect(() => EstimateLoadedGenerationCallCost('Image', 0)).toThrow(/Carrier prompt/);

        const mapped = BuildProduceVideoRequest({ Topic: 'Explain Q3', DurationSeconds: 30 });
        expect('Payload' in mapped).toBe(true);
    });
});
