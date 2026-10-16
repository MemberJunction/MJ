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
