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
    DEFAULT_DOCKER_WORKSPACE_ROOT,
    DEFAULT_RENDER_MAX_OUTPUT_BYTES,
    DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
    DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
    DEFAULT_RENDER_TIMEOUT_MS,
    DEFAULT_VIDEO_RENDER_DRIVER,
    ReadVideoRenderSettings,
    type VideoRenderDockerSettings,
    type VideoRenderLocalSettings,
    type VideoRenderRemoteSettings,
    type VideoRenderSettings,
    type VideoRenderTimeoutsSettings,
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

