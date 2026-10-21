/**
 * Package identifier for the server-side MemberJunction Video Studio engine package.
 */
export const PACKAGE_NAME = '@memberjunction/video-studio' as const;

export * from './storage.js';
export * from './narration/narration-timeline.js';
export * from './narration/captions.js';
export * from './narration/narration-pipeline.js';
export * from './data/data-snapshot.js';
export * from './validate-spec-async.js';
export * from './settings.js';
export * from './gates.js';

export {
    CreateAbortError,
    ThrowIfSignalAborted,
    VideoRenderDriverBase,
    VideoRenderError,
    type VideoRenderErrorCode,
    type VideoRenderErrorOptions,
} from './render/video-render-driver-base.js';

export {
    DEFAULT_DOCKER_CPUS,
    DEFAULT_DOCKER_MEMORY_MB,
    DEFAULT_DOCKER_PIDS_LIMIT,
    DEFAULT_DOCKER_RENDER_IMAGE,
    DEFAULT_DOCKER_SHM_SIZE_MB,
    DEFAULT_RENDER_MAX_OUTPUT_BYTES,
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    DEFAULT_VIDEO_RENDER_DRIVER,
    ReadVideoRenderSettings,
    ReadVideoStudioOutputSettings,
    VIDEO_STUDIO_INLINE_MAX_BYTES,
    type VideoRenderDockerSettings,
    type VideoRenderLocalSettings,
    type VideoRenderRemoteSettings,
    type VideoRenderSettings,
    type VideoRenderTimeoutsSettings,
    type VideoStudioOutputSettings,
} from './render/render-settings.js';

export {
    MAX_RENDER_JSON_RESPONSE_BYTES,
    MAX_RENDER_NDJSON_LINE_BYTES,
    RenderWorkerHttpClient,
    type RenderWorkerHttpClientOptions,
} from './render/worker-http-client.js';

export {
    ALLOWED_WORKER_PARENT_ENV_KEYS,
    BuildWorkerEnv,
    LocalWorkerRenderDriver,
} from './render/local-worker-render-driver.js';

export { RemoteRenderDriver } from './render/remote-render-driver.js';

export {
    DOCKER_RENDER_IMAGE_BUILD_COMMAND,
    DockerRenderDriver,
} from './render/docker-render-driver.js';

export {
    FAKE_DRIVER_MP4_BYTES,
    FAKE_DRIVER_ONE_BY_ONE_PNG_BASE64,
    FakeRenderDriver,
    type FakeRenderDriverOptions,
} from './render/fake-render-driver.js';

export {
    LOCAL_WORKER_NETWORK_WARNING,
    ResetLocalWorkerWarningState,
    VideoRenderEngine,
} from './render/video-render-engine.js';

export {
    LoadVideoStudioAgent,
    VIDEO_STUDIO_STAGES,
    VideoStudioAgent,
    type VideoStudioStageName,
} from './agents/video-studio-agent.js';

export {
    BuildProduceVideoRequest,
    type ProduceVideoArchetypeLookup,
    type ProduceVideoBrandKitLookup,
    type ProduceVideoDataRefInput,
    type ProduceVideoInput,
    type ProduceVideoLookups,
    type ProduceVideoMappingError,
    type ProduceVideoMappingErrorCode,
    type ProduceVideoPresetLookup,
    type ProduceVideoRequestError,
    type ProduceVideoRequestResult,
    type ProduceVideoRequestSuccess,
} from './actions/produce-video.mapping.js';

export {
    LoadProduceVideoAction,
    PRODUCE_VIDEO_DRIVER_CLASS,
    ProduceVideoAction,
} from './actions/produce-video.action.js';

export {
    BuildCheckRequest,
    BuildRenderBundle,
    CheckProductionRules,
    FrameSizeFor,
    MAX_STILL_POINTS,
    ReadAssetBytes,
    ResolveDeliverableFormats,
    SanitizeStageKey,
    StillPointsFor,
    type BuildRenderBundleContext,
} from './render/bundle.js';

export {
    LoadVideoStudioPreProductionAgent,
    VideoStudioPreProductionAgent,
} from './agents/pre-production-agent.js';

export {
    FormatCheckIssue,
    LoadVideoStudioRenderAgent,
    NO_STORAGE_ACCOUNT_ERROR_MESSAGE,
    VideoStudioRenderAgent,
} from './agents/render-agent.js';

export {
    VideoStudioAgentBase,
    type StudioPromptRunOutcome,
} from './agents/video-studio-agent-base.js';

export {
    FormatLintIssue,
    LoadVideoStudioMotionEngineerAgent,
    MAX_LINT_ATTEMPTS,
    MOTION_ENGINEER_LINT_FIX_PROMPT_NAME,
    VideoStudioMotionEngineerAgent,
    type MotionEngineerLintFixOutput,
} from './agents/motion-engineer-agent.js';

export {
    ResolvePromptPrimaryModelId,
} from './review/model-routing.js';

export {
    BuildReferenceBlocks,
    MAX_INLINE_REFERENCE_VIDEO_BYTES,
    MAX_KEYFRAME_IMAGES,
    MAX_REFERENCES,
    PickReferences,
    type BuiltReferenceMedia,
    type ExtractKeyframesFn,
    type ReferenceMediaKind,
} from './review/reference-media.js';

export {
    LoadVideoStudioArtDirectorAgent,
    REFERENCE_ANALYSIS_PROMPT_ID,
    REFERENCE_ANALYSIS_PROMPT_NAME,
    VideoStudioArtDirectorAgent,
} from './agents/art-director-agent.js';

export {
    BuildBeatsTable,
    BuildBoundValuesTable,
    BuildGeneratedAssetsTable,
    BuildRepairBrief,
    BuildRubricCriteriaText,
    BuildTimelineTable,
    PickSheetsForCall,
} from './review/critic-input.js';

export {
    ComposeHumanReviewNotes,
} from './review/human-review-notes.js';

export {
    LoadVideoStudioCriticAgent,
    MISSING_CRITIC_RUBRIC_ERROR_MESSAGE,
    VideoStudioCriticAgent,
    type CriticPromptCriterionScore,
    type CriticPromptOutput,
} from './agents/critic-agent.js';

export * from './generation/generation-policy.js';
export * from './generation/generation-screen.js';
export * from './generation/generate-assets.js';

export {
    DEFAULT_SETUP_HEALTH_RENDER_TIMEOUT_MS,
    LoadVideoStudioSetupHealthOperation,
    MAX_SETUP_HEALTH_RENDER_TIMEOUT_MS,
    MIN_SETUP_HEALTH_RENDER_TIMEOUT_MS,
    SETUP_HEALTH_NO_STORAGE_MESSAGE,
    SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION,
    SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE,
    SETUP_HEALTH_STORAGE_ACTION,
    VIDEO_STUDIO_AGENT_NAME,
    VIDEO_STUDIO_ORCHESTRATOR_PROMPT_NAME,
    VideoStudioSetupHealthServerOperation,
    type SetupHealthPromptPreviewRunner,
} from './operations/setup-health.operation.js';
