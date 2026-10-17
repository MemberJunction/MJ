import { LogWarning } from '@memberjunction/core';
import {
    BaseSingleton,
    MJGlobal,
    ShutdownRegistry,
    type IShutdownable,
} from '@memberjunction/global';
import { LocalWorkerRenderDriver } from './local-worker-render-driver.js';
import { ReadVideoRenderSettings } from './render-settings.js';
import {
    VideoRenderDriverBase,
    VideoRenderError,
} from './video-render-driver-base.js';

// Ensure side-effect registration of built-in drivers with MJGlobal.ClassFactory.
void LocalWorkerRenderDriver;

/**
 * Warning message logged once per process when `VideoRenderEngine` selects the `LocalWorker` driver.
 */
export const LOCAL_WORKER_NETWORK_WARNING =
    'LocalWorker renders can reach the network; use the Docker driver for untrusted content';

let hasLoggedLocalWorkerWarning = false;

/**
 * Resets the once-per-process `LocalWorker` warning flag (for unit tests only).
 */
export function ResetLocalWorkerWarningState(): void {
    hasLoggedLocalWorkerWarning = false;
}

/**
 * Process-wide singleton that resolves, owns, and shuts down the active `VideoRenderDriverBase`
 * implementation (§7.1, §7.2).
 *
 * Note: `VideoRenderEngine` is a driver selector and lifecycle owner (`BaseSingleton` +
 * `IShutdownable`), not a metadata `BaseEngine`.
 */
export class VideoRenderEngine extends BaseSingleton<VideoRenderEngine> implements IShutdownable {
    private driver: VideoRenderDriverBase | null = null;
    private settingsSearchFrom?: string;

    public readonly ShutdownName = 'VideoRenderEngine';

    protected constructor() {
        super();
        ShutdownRegistry.Instance.Register(this);
    }

    /**
     * Returns the process-wide `VideoRenderEngine` singleton instance.
     */
    public static get Instance(): VideoRenderEngine {
        return super.getInstance<VideoRenderEngine>();
    }

    /**
     * Resolves and returns the active `VideoRenderDriverBase` instance.
     *
     * On first access (when no driver has been injected via `UseDriver`), reads `videoStudio.render`
     * from `mj.config.cjs` and instantiates the configured driver via
     * `MJGlobal.Instance.ClassFactory.TryCreateInstance`. Throws `VideoRenderError` with
     * `Code === 'UnknownDriver'` when the configured driver name is not registered.
     */
    public get Driver(): VideoRenderDriverBase {
        if (!this.driver) {
            const settings = ReadVideoRenderSettings(this.settingsSearchFrom);
            const lookup = MJGlobal.Instance.ClassFactory.TryCreateInstance<VideoRenderDriverBase>(
                VideoRenderDriverBase,
                settings.Driver,
                settings,
            );
            if (!lookup.Resolved || !lookup.Instance) {
                throw new VideoRenderError(
                    'UnknownDriver',
                    `Unknown video render driver '${settings.Driver}' configured in videoStudio.render.driver. ` +
                        `Registered drivers: 'LocalWorker', 'Remote', 'Docker'.`,
                );
            }
            if (settings.Driver === 'LocalWorker' && !hasLoggedLocalWorkerWarning) {
                hasLoggedLocalWorkerWarning = true;
                LogWarning(LOCAL_WORKER_NETWORK_WARNING);
            }
            this.driver = lookup.Instance;
        }
        return this.driver;
    }

    /**
     * Overrides the active `VideoRenderDriverBase` instance (used by tests with `FakeRenderDriver`
     * or custom host applications). Passing `null` clears the current driver so the next `Driver`
     * access re-resolves from settings.
     */
    public UseDriver(driver: VideoRenderDriverBase | null): void {
        this.driver = driver;
    }

    /**
     * Sets an optional directory from which `ReadVideoRenderSettings` searches for `mj.config.cjs`
     * when resolving a driver on demand.
     */
    public SetSettingsSearchDir(searchFrom?: string): void {
        this.settingsSearchFrom = searchFrom;
    }

    /**
     * Shuts down the active render driver once and clears the cached reference.
     * Safe to call multiple times.
     */
    public async Shutdown(): Promise<void> {
        const current = this.driver;
        this.driver = null;
        if (current) {
            await current.Shutdown();
        }
    }
}
