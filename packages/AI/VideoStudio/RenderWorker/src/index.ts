/**
 * `@memberjunction/video-studio-render-worker`
 *
 * Stateless sandboxed composition render worker for MemberJunction Video Studio.
 * Note: `hyperframes-backend.ts` is intentionally NOT imported here so unit tests and
 * consumers importing `@memberjunction/video-studio-render-worker` never load `@hyperframes/*`
 * unless running the CLI (`dist/main.js`) or explicitly importing `hyperframes-backend.js`.
 */
export const PACKAGE_NAME = '@memberjunction/video-studio-render-worker';

export {
    FAKE_MP4_BYTES,
    FAKE_ONE_BY_ONE_PNG,
    FakeRenderBackend,
    PINNED_HYPERFRAMES_VERSION,
    RenderWorkerError,
    type BackendAudioJob,
    type BackendAudioResult,
    type BackendCheckJob,
    type BackendProbeResult,
    type BackendRenderJob,
    type BackendStillsJob,
    type FakeRenderBackendOptions,
    type MeasuredText,
    type RenderBackend,
} from './backend.js';

export {
    ApplyPreambleToStagedBundle,
    EnsureIndexHtmlForServer,
    MAX_ASPECT_RATIO_TOLERANCE,
    MAX_BUNDLE_ENTRIES,
    MAX_DURATION_SECONDS,
    MAX_FPS,
    MAX_FRAME_DIMENSION,
    MIN_FPS,
    MIN_FRAME_DIMENSION,
    ResolveCompositionDuration,
    ResolveInsideBundleRoot,
    ResolveCompositionFps,
    StageRenderBundle,
    ValidateBundleRelativePath,
    ValidateCompositionGeometryMatch,
    ValidateRenderBundle,
    ValidateRenderGeometry,
    ValidateStrictBase64,
    type CompositionGeometryMatchParams,
    type RenderGeometryParams,
    type StageBundleOptions,
    type StagedBundle,
} from './bundle.js';

export {
    BUNDLED_DEFAULT_FONTS,
    BuildCspMetaTag,
    BuildDefaultFontsStyleTag,
    BuildPreambleOptionsFromBundle,
    BuildPreambleScript,
    COMPOSITION_CSP,
    EscapeJsonForInlineScript,
    InjectPreambleIntoHtml,
    type PreambleRuntimeOptions,
} from './preamble.js';

export {
    MJ_NETWORK_API_CODE,
    MJ_NON_BUNDLE_URL_CODE,
    RunLintGate,
    ScanAuthoredFilesForLintIssues,
    SortCheckIssues,
} from './lint-gate.js';

export {
    HYPERFRAMES_LINT_NONDETERMINISTIC_CODES,
    IsAllowedNumericLiteral,
    MJ_MISSING_ASSET_CODE,
    MJ_NONDETERMINISTIC_API_CODE,
    MJ_UNBOUND_LITERAL_SOURCE_CODE,
    RunStaticChecks,
    type StaticCheckOptions,
} from './checks/static-checks.js';

export {
    EvaluateDomRules,
    MIN_TEXT_SIZE_SHORT_EDGE_RATIO,
    MJ_ASOF_CARD_MISSING_CODE,
    MJ_BOUND_KEY_UNKNOWN_CODE,
    MJ_BOUND_VALUE_MISMATCH_CODE,
    MJ_MIN_TEXT_SIZE_CODE,
    MJ_SAFE_AREA_CODE,
    MJ_UNBOUND_LITERAL_RENDERED_CODE,
    MJ_UNBUNDLED_FONT_CODE,
    SAFE_AREA_INSETS,
    type DomRulesOptions,
    type SafeAreaInsets,
} from './checks/dom-rules.js';

export {
    BuildCheckCliFailedIssue,
    BuildCheckCliUnreadableIssue,
    BuildReducedCheckCliEnv,
    MJ_CHECK_CLI_FAILED_CODE,
    MJ_CHECK_CLI_UNREADABLE_CODE,
    MapHyperFramesCheckOutput,
} from './checks/hyperframes-check.js';

export {
    CONTACT_SHEET_WIDTH,
    DedupeCheckIssues,
    DEFAULT_TILES_PER_SHEET,
    EscapeHtmlForLabel,
    GetWorkerHealth,
    MAX_CONTACT_SHEET_GRIDS,
    MAX_STILL_POINTS,
    MJ_MEASURE_TEXT_FAILED_CODE,
    RunCheckJob,
    RunContactSheetJob,
    RunKeyframesJob,
    ResolveRenderCaptureWorkers,
    RunRenderJob,
    RunStillsJob,
    type RunJobCommonOptions,
    type RunRenderJobOptions,
} from './jobs.js';

export {
    CreateRenderWorkerServer,
    DEFAULT_CONCURRENCY,
    DEFAULT_HEARTBEAT_MS,
    DEFAULT_HOST,
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_MAX_BODY_MB,
    DEFAULT_MAX_TIMEOUT_MS,
    DEFAULT_NON_RENDER_TIMEOUT_MS,
    DEFAULT_PORT,
    DEFAULT_VIDEO_TTL_MS,
    IsLoopbackHost,
    type RenderWorkerServer,
    type RenderWorkerServerOptions,
} from './server.js';

export {
    ONE_SHOT_OPERATIONS,
    ONE_SHOT_USAGE,
    RunOneShot,
    type OneShotOperation,
    type RunOneShotOptions,
} from './one-shot.js';


export {
    CountExpectedPauses,
    EvaluateAudioChecks,
    FindUnexpectedLinePauses,
    MJ_AUDIO_CLIPPING_CODE,
    MJ_AUDIO_LINE_PAUSE_CODE,
    MJ_AUDIO_LOUDNESS_CODE,
    MJ_AUDIO_MISSING_CODE,
    MJ_AUDIO_NARRATION_MASKED_CODE,
    MJ_AUDIO_SOURCE_MISSING_CODE,
    MJ_AUDIO_TRUE_PEAK_CODE,
    ParseAstatsOverall,
    ParseEbur128Summary,
    ParseLoudnormJson,
    ParseSilenceDetect,
    SILENT_MIX_LUFS,
    type AstatsSummary,
    type AudioCheckInput,
    type Ebur128Summary,
    type LineMaskingMeasurement,
    type LoudnormMeasurement,
    type UnexpectedLinePause,
} from './checks/audio-checks.js';

export {
    Biquad,
    BuildChordProgression,
    CreatePrng,
    CreateStereoBuffer,
    DeriveSeed,
    MidiToHz,
    MIX_SAMPLE_RATE,
    MUSIC_BED_TARGET_RMS,
    NormalizePeak,
    ParseMusicKey,
    SFX_PEAK,
    SynthesizeMusicBed,
    SynthesizeSfx,
    type BiquadType,
    type StereoBuffer,
} from './audio/synth.js';

export {
    ApplyMusicGainEnvelope,
    BuildMusicGainSegments,
    BuildSpeechIntervals,
    ENVELOPE_CONTROL_SAMPLES,
    MusicGainDbAt,
    SegmentAmountAt,
    SWELL_ATTACK_SECONDS,
    SWELL_RELEASE_SECONDS,
    type GainSegment,
    type MusicGainSegments,
    type TimeInterval,
} from './audio/ducking.js';

export {
    BuildMixStems,
    MeasureLineMasking,
    MixStemsToStereo,
    MUSIC_END_FADE_SECONDS,
    type DecodedMixSources,
    type MixStems,
} from './audio/mixer.js';

export {
    BuildLoudnormFilter,
    CreateFfmpegRunner,
    DecodeAudioToPcm,
    DeinterleaveFloat32,
    DetectSilences,
    EncodeWavFloat32,
    MeasureDeliveredAudio,
    MeasureLoudnorm,
    MuxFinalAudio,
    type DeliveredAudioMeasurement,
    type FfmpegRunner,
    type FfmpegRunResult,
    type MuxFinalAudioParams,
} from './audio/ffmpeg-audio.js';

export {
    BuildAudioMeasurements,
    FinalizeRenderAudio,
    MIX_TAIL_PAD_SECONDS,
    type FinalizeRenderAudioParams,
    type FinalizeRenderAudioResult,
} from './audio/audio-pipeline.js';
