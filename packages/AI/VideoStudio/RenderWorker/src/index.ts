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
    type BackendProbeResult,
    type BackendRenderJob,
    type BackendStillsJob,
    type FakeRenderBackendOptions,
    type RenderBackend,
} from './backend.js';

export {
    ApplyPreambleToStagedBundle,
    MAX_ASPECT_RATIO_TOLERANCE,
    MAX_BUNDLE_ENTRIES,
    MAX_DURATION_SECONDS,
    MAX_FPS,
    MAX_FRAME_DIMENSION,
    MIN_FPS,
    MIN_FRAME_DIMENSION,
    StageRenderBundle,
    ValidateBundleRelativePath,
    ValidateRenderBundle,
    ValidateRenderGeometry,
    type RenderGeometryParams,
    type StageBundleOptions,
    type StagedBundle,
} from './bundle.js';

export {
    BuildCspMetaTag,
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
    CONTACT_SHEET_WIDTH,
    DEFAULT_TILES_PER_SHEET,
    EscapeHtmlForLabel,
    GetWorkerHealth,
    MAX_CONTACT_SHEET_GRIDS,
    MAX_STILL_POINTS,
    RunCheckJob,
    RunContactSheetJob,
    RunKeyframesJob,
    RunRenderJob,
    RunStillsJob,
    type RunRenderJobOptions,
} from './jobs.js';

export {
    CreateRenderWorkerServer,
    DEFAULT_CONCURRENCY,
    DEFAULT_HEARTBEAT_MS,
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_MAX_TIMEOUT_MS,
    DEFAULT_VIDEO_TTL_MS,
    type RenderWorkerServer,
    type RenderWorkerServerOptions,
} from './server.js';
