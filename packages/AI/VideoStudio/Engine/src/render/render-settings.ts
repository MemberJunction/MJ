import { cosmiconfigSync } from 'cosmiconfig';
import { LogWarning } from '@memberjunction/core';

/** Default `VideoRenderDriverBase` registration key when `videoStudio.render.driver` is unset or invalid. */
export const DEFAULT_VIDEO_RENDER_DRIVER = 'LocalWorker';

/** Default worker startup timeout in milliseconds (60 seconds). */
export const DEFAULT_RENDER_STARTUP_TIMEOUT_MS = 60_000;

/** Default full MP4 render timeout in milliseconds (35 minutes). */
export const DEFAULT_RENDER_TIMEOUT_MS = 35 * 60 * 1_000;

/** Default non-render request timeout in milliseconds (10 minutes). */
export const DEFAULT_RENDER_REQUEST_TIMEOUT_MS = 10 * 60 * 1_000;

/** Default hard maximum MP4 output size in bytes (512 MiB = 536,870,912 bytes). */
export const DEFAULT_RENDER_MAX_OUTPUT_BYTES = 512 * 1024 * 1024;

/** Default Docker image tag for `DockerRenderDriver` (`VS-RND-4`). */
export const DEFAULT_DOCKER_RENDER_IMAGE = 'mj-video-render-worker:local';

/** Default CPU core limit (`--cpus`) for `DockerRenderDriver` containers (`VS-RND-4`). */
export const DEFAULT_DOCKER_CPUS = 2;

/** Default memory limit in megabytes (`--memory <n>m`) for `DockerRenderDriver` containers (`VS-RND-4`). */
export const DEFAULT_DOCKER_MEMORY_MB = 4096;

/** Default process/thread ceiling (`--pids-limit`) for `DockerRenderDriver` containers (`VS-RND-4`). */
export const DEFAULT_DOCKER_PIDS_LIMIT = 512;

/** Default `/dev/shm` size in megabytes (`--shm-size <n>m`) for `DockerRenderDriver` containers (`VS-RND-4`). */
export const DEFAULT_DOCKER_SHM_SIZE_MB = 1024;

/**
 * Shared timeout settings across all `VideoRenderDriverBase` implementations.
 */
export interface VideoRenderTimeoutsSettings {
    /** Maximum time in milliseconds to wait for a managed worker to start and pass `/health` (default: 60,000). */
    StartupMs: number;
    /** Maximum time in milliseconds for a `Render` request (default: 2,100,000 / 35 min). */
    RenderMs: number;
    /** Maximum time in milliseconds for non-render requests (`Check`, `CaptureStills`, `BuildContactSheet`, `ExtractKeyframes`, `Health`; default: 600,000 / 10 min). */
    RequestMs: number;
}

/**
 * Local child-process worker settings used by `LocalWorkerRenderDriver`.
 */
export interface VideoRenderLocalSettings {
    /** Optional explicit path to the render worker CLI entry script. */
    WorkerEntry?: string;
    /** Optional V8 `--max-old-space-size` limit in megabytes for the spawned worker process. */
    MaxOldSpaceMb?: number;
}

/**
 * Remote HTTP/HTTPS worker settings used by `RemoteRenderDriver` (`VS-RND-3`).
 */
export interface VideoRenderRemoteSettings {
    /** Base `http:` or `https:` URL of the remote render worker (or `VIDEO_STUDIO_RENDER_URL`). */
    Url?: string;
    /** Optional list of remote render worker base URLs for per-job round-robin pool routing (`videoStudio.render.remote.urls`). */
    Urls?: readonly string[];
    /** Optional bearer token for the remote render worker (or `VIDEO_STUDIO_RENDER_TOKEN`). */
    Token?: string;
}

/**
 * Hardened Docker container settings used by `DockerRenderDriver` (`VS-RND-4`).
 */
export interface VideoRenderDockerSettings {
    /** Docker image reference (default: `'mj-video-render-worker:local'`). */
    Image: string;
    /**
     * Optional host workspace root directory bind-mounted into per-job containers.
     * When omitted, `DockerRenderDriver` creates and reuses one per-process `0o700` directory
     * via `fs.mkdtemp(path.join(os.tmpdir(), 'mj-video-render-'))`.
     */
    WorkspaceRoot?: string;
    /** CPU core limit (`--cpus`, default: `2`). */
    Cpus: number;
    /** Container memory limit in megabytes (`--memory <n>m`, default: `4096`). */
    MemoryMb: number;
    /** Container PID ceiling (`--pids-limit`, default: `512`). */
    PidsLimit: number;
    /** Container `/dev/shm` size in megabytes (`--shm-size <n>m`, default: `1024`). */
    ShmSizeMb: number;
}

/**
 * Normalized PascalCase settings for `VideoRenderEngine` and its drivers (§7.2).
 */
export interface VideoRenderSettings {
    /** Registered `VideoRenderDriverBase` key (`'LocalWorker'`, `'Remote'`, or `'Docker'`). */
    Driver: string;
    /** Hard maximum allowed MP4 output size in bytes (default: `536_870_912` / 512 MiB). */
    MaxOutputBytes?: number;
    /** Shared timeout thresholds in milliseconds. */
    Timeouts: VideoRenderTimeoutsSettings;
    /** Configuration specific to the `LocalWorker` driver. */
    Local: VideoRenderLocalSettings;
    /** Configuration specific to the `Remote` driver (`VS-RND-3`). */
    Remote: VideoRenderRemoteSettings;
    /** Configuration specific to the `Docker` driver (`VS-RND-4`). */
    Docker: VideoRenderDockerSettings;
}

/**
 * Non-exported raw camelCase shape of `videoStudio.render` in `mj.config.cjs`.
 */
interface RawVideoRenderConfig {
    driver?: unknown;
    maxOutputBytes?: unknown;
    timeouts?: unknown;
    local?: unknown;
    remote?: unknown;
    docker?: unknown;
}

interface RawVideoStudioConfig {
    render?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function readPositiveNumber(
    rawValue: unknown,
    fieldPath: string,
    defaultValue: number,
): number {
    if (rawValue === undefined || rawValue === null) {
        return defaultValue;
    }
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
        return rawValue;
    }
    LogWarning(
        `${fieldPath} '${String(rawValue)}' is not a positive finite number; using default ${defaultValue}.`,
    );
    return defaultValue;
}

function readOptionalPositiveInteger(
    rawValue: unknown,
    fieldPath: string,
): number | undefined {
    if (rawValue === undefined || rawValue === null) {
        return undefined;
    }
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
        return Math.round(rawValue);
    }
    LogWarning(
        `${fieldPath} '${String(rawValue)}' is not a positive finite number; ignoring setting.`,
    );
    return undefined;
}

function readNonEmptyString(
    rawValue: unknown,
    fieldPath: string,
    defaultValue: string,
): string {
    if (rawValue === undefined || rawValue === null) {
        return defaultValue;
    }
    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
        return rawValue.trim();
    }
    LogWarning(
        `${fieldPath} '${String(rawValue)}' is not a non-empty string; using '${defaultValue}'.`,
    );
    return defaultValue;
}

function readOptionalNonEmptyString(
    rawValue: unknown,
    fieldPath: string,
    redactValue: boolean = false,
): string | undefined {
    if (rawValue === undefined || rawValue === null) {
        return undefined;
    }
    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
        return rawValue.trim();
    }
    LogWarning(
        redactValue
            ? `${fieldPath} is not a non-empty string; ignoring setting.`
            : `${fieldPath} '${String(rawValue)}' is not a non-empty string; ignoring setting.`,
    );
    return undefined;
}

function readOptionalNonEmptyStringArray(
    rawValue: unknown,
    fieldPath: string,
): string[] | undefined {
    if (rawValue === undefined || rawValue === null) {
        return undefined;
    }
    if (!Array.isArray(rawValue)) {
        LogWarning(`${fieldPath} is not an array; ignoring setting.`);
        return undefined;
    }
    const items: string[] = [];
    for (let i = 0; i < rawValue.length; i++) {
        const entry = rawValue[i];
        if (typeof entry === 'string' && entry.trim().length > 0) {
            items.push(entry.trim());
        } else {
            LogWarning(`${fieldPath}[${i}] '${String(entry)}' is not a non-empty string; ignoring entry.`);
        }
    }
    if (items.length === 0) {
        LogWarning(`${fieldPath} contains no non-empty strings; ignoring setting.`);
        return undefined;
    }
    return items;
}

function readEnvNonEmptyString(envName: string): string | undefined {
    const rawValue = process.env[envName];
    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
        return rawValue.trim();
    }
    return undefined;
}

function buildDefaultRemoteSettings(): VideoRenderRemoteSettings {
    const remote: VideoRenderRemoteSettings = {};
    const envUrl = readEnvNonEmptyString('VIDEO_STUDIO_RENDER_URL');
    if (envUrl !== undefined) {
        remote.Url = envUrl;
    }
    const envToken = readEnvNonEmptyString('VIDEO_STUDIO_RENDER_TOKEN');
    if (envToken !== undefined) {
        remote.Token = envToken;
    }
    return remote;
}

function buildDefaultDockerSettings(): VideoRenderDockerSettings {
    return {
        Image: DEFAULT_DOCKER_RENDER_IMAGE,
        Cpus: DEFAULT_DOCKER_CPUS,
        MemoryMb: DEFAULT_DOCKER_MEMORY_MB,
        PidsLimit: DEFAULT_DOCKER_PIDS_LIMIT,
        ShmSizeMb: DEFAULT_DOCKER_SHM_SIZE_MB,
    };
}

/**
 * Reads `videoStudio.render` from `mj.config.cjs` (searching upward from `searchFrom`) and returns
 * normalized PascalCase `VideoRenderSettings`.
 *
 * Invalid values log a warning via `LogWarning` and fall back to defaults. Never throws.
 */
export function ReadVideoRenderSettings(searchFrom: string = process.cwd()): VideoRenderSettings {
    const defaults: VideoRenderSettings = {
        Driver: DEFAULT_VIDEO_RENDER_DRIVER,
        MaxOutputBytes: DEFAULT_RENDER_MAX_OUTPUT_BYTES,
        Timeouts: {
            StartupMs: DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
            RenderMs: DEFAULT_RENDER_TIMEOUT_MS,
            RequestMs: DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
        },
        Local: {},
        Remote: buildDefaultRemoteSettings(),
        Docker: buildDefaultDockerSettings(),
    };

    let rawConfig: Record<string, unknown> | undefined;
    try {
        const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
        const result = explorer.search(searchFrom);
        if (result && !result.isEmpty && isPlainObject(result.config)) {
            rawConfig = result.config;
        }
    } catch (error) {
        LogWarning(
            `videoStudio.render: mj.config could not be read (${error instanceof Error ? error.message : String(error)}); using defaults.`,
        );
        return defaults;
    }

    if (!rawConfig || rawConfig.videoStudio === undefined || rawConfig.videoStudio === null) {
        return defaults;
    }
    if (!isPlainObject(rawConfig.videoStudio)) {
        LogWarning('videoStudio in mj.config is not an object; using default render settings.');
        return defaults;
    }

    const videoStudioSection = rawConfig.videoStudio as RawVideoStudioConfig;
    if (videoStudioSection.render === undefined || videoStudioSection.render === null) {
        return defaults;
    }
    if (!isPlainObject(videoStudioSection.render)) {
        LogWarning('videoStudio.render in mj.config is not an object; using default render settings.');
        return defaults;
    }

    const renderSection = videoStudioSection.render as RawVideoRenderConfig;
    const driver = readNonEmptyString(
        renderSection.driver,
        'videoStudio.render.driver',
        DEFAULT_VIDEO_RENDER_DRIVER,
    );
    const maxOutputBytes = readPositiveNumber(
        renderSection.maxOutputBytes,
        'videoStudio.render.maxOutputBytes',
        DEFAULT_RENDER_MAX_OUTPUT_BYTES,
    );

    const timeouts: VideoRenderTimeoutsSettings = { ...defaults.Timeouts };
    if (renderSection.timeouts !== undefined && renderSection.timeouts !== null) {
        if (!isPlainObject(renderSection.timeouts)) {
            LogWarning('videoStudio.render.timeouts in mj.config is not an object; using default timeouts.');
        } else {
            timeouts.StartupMs = readPositiveNumber(
                renderSection.timeouts.startupMs,
                'videoStudio.render.timeouts.startupMs',
                DEFAULT_RENDER_STARTUP_TIMEOUT_MS,
            );
            timeouts.RenderMs = readPositiveNumber(
                renderSection.timeouts.renderMs,
                'videoStudio.render.timeouts.renderMs',
                DEFAULT_RENDER_TIMEOUT_MS,
            );
            timeouts.RequestMs = readPositiveNumber(
                renderSection.timeouts.requestMs,
                'videoStudio.render.timeouts.requestMs',
                DEFAULT_RENDER_REQUEST_TIMEOUT_MS,
            );
        }
    }

    const local: VideoRenderLocalSettings = {};
    if (renderSection.local !== undefined && renderSection.local !== null) {
        if (!isPlainObject(renderSection.local)) {
            LogWarning('videoStudio.render.local in mj.config is not an object; using default local settings.');
        } else {
            const workerEntry = readOptionalNonEmptyString(
                renderSection.local.workerEntry,
                'videoStudio.render.local.workerEntry',
            );
            if (workerEntry !== undefined) {
                local.WorkerEntry = workerEntry;
            }
            const maxOldSpaceMb = readOptionalPositiveInteger(
                renderSection.local.maxOldSpaceMb,
                'videoStudio.render.local.maxOldSpaceMb',
            );
            if (maxOldSpaceMb !== undefined) {
                local.MaxOldSpaceMb = maxOldSpaceMb;
            }
        }
    }

    const remote: VideoRenderRemoteSettings = { ...defaults.Remote };
    if (renderSection.remote !== undefined && renderSection.remote !== null) {
        if (!isPlainObject(renderSection.remote)) {
            LogWarning('videoStudio.render.remote in mj.config is not an object; using default remote settings.');
        } else {
            const url = readOptionalNonEmptyString(
                renderSection.remote.url,
                'videoStudio.render.remote.url',
            );
            if (url !== undefined) {
                remote.Url = url;
            }
            const urls = readOptionalNonEmptyStringArray(
                renderSection.remote.urls,
                'videoStudio.render.remote.urls',
            );
            if (urls !== undefined) {
                remote.Urls = urls;
                if (url === undefined) {
                    delete remote.Url;
                }
            }
            const token = readOptionalNonEmptyString(
                renderSection.remote.token,
                'videoStudio.render.remote.token',
                true,
            );
            if (token !== undefined) {
                remote.Token = token;
            }
        }
    }

    const docker: VideoRenderDockerSettings = { ...defaults.Docker };
    if (renderSection.docker !== undefined && renderSection.docker !== null) {
        if (!isPlainObject(renderSection.docker)) {
            LogWarning('videoStudio.render.docker in mj.config is not an object; using default docker settings.');
        } else {
            docker.Image = readNonEmptyString(
                renderSection.docker.image,
                'videoStudio.render.docker.image',
                DEFAULT_DOCKER_RENDER_IMAGE,
            );
            const workspaceRoot = readOptionalNonEmptyString(
                renderSection.docker.workspaceRoot,
                'videoStudio.render.docker.workspaceRoot',
            );
            if (workspaceRoot !== undefined) {
                docker.WorkspaceRoot = workspaceRoot;
            }
            docker.Cpus = readPositiveNumber(
                renderSection.docker.cpus,
                'videoStudio.render.docker.cpus',
                DEFAULT_DOCKER_CPUS,
            );
            docker.MemoryMb = readPositiveNumber(
                renderSection.docker.memoryMb,
                'videoStudio.render.docker.memoryMb',
                DEFAULT_DOCKER_MEMORY_MB,
            );
            docker.PidsLimit = readPositiveNumber(
                renderSection.docker.pidsLimit,
                'videoStudio.render.docker.pidsLimit',
                DEFAULT_DOCKER_PIDS_LIMIT,
            );
            docker.ShmSizeMb = readPositiveNumber(
                renderSection.docker.shmSizeMb,
                'videoStudio.render.docker.shmSizeMb',
                DEFAULT_DOCKER_SHM_SIZE_MB,
            );
        }
    }

    return {
        Driver: driver,
        MaxOutputBytes: maxOutputBytes,
        Timeouts: timeouts,
        Local: local,
        Remote: remote,
        Docker: docker,
    };
}
