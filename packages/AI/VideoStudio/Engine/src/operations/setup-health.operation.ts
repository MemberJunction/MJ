/**
 * @fileoverview Server implementation of `VideoStudio.SetupHealth` (`VideoStudioSetupHealthServerOperation`).
 *
 * Inspects Video Studio setup readiness across three subsystems:
 * 1. `Storage` — resolves the storage account for the `Video Studio` agent via
 *    `AIEngine.Instance.ResolveAgentStorageAccount(agent)` and flags missing or ambiguous fallback accounts.
 * 2. `Render` — probes `VideoRenderEngine.Instance.Driver.Health()` raced against `RenderTimeoutMs`,
 *    surfaces unknown-driver/unhealthy/timeout states with driver-specific remediation actions, and warns
 *    when `Driver.IsNetworkIsolated` is `false`.
 * 3. `Models` — previews model selection for each active Video Studio preset against the
 *    `Video Studio - Orchestrator` prompt via `AIPromptRunner.PreviewModelSelection` without making any
 *    live model calls.
 */
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    FileStorageEngineBase,
    VideoStudioSetupHealthOperation,
    type MJAIAgentConfigurationEntity,
    type MJAIAgentEntity,
    type VideoStudioSetupHealthCheck,
    type VideoStudioSetupHealthCheckKey,
    type VideoStudioSetupHealthInput,
    type VideoStudioSetupHealthOutput,
} from '@memberjunction/core-entities';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, type ModelSelectionPreviewItem } from '@memberjunction/ai-prompts';
import { DOCKER_RENDER_IMAGE_BUILD_COMMAND, DockerRenderDriver } from '../render/docker-render-driver.js';
import { LocalWorkerRenderDriver } from '../render/local-worker-render-driver.js';
import { RemoteRenderDriver } from '../render/remote-render-driver.js';
import { ReadVideoRenderSettings } from '../render/render-settings.js';
import { VideoRenderDriverBase, VideoRenderError } from '../render/video-render-driver-base.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';

/** Canonical name of the top-level Video Studio orchestrator agent. */
export const VIDEO_STUDIO_AGENT_NAME = 'Video Studio' as const;

/** Canonical name of the Video Studio orchestrator prompt used to preview preset model credentials. */
export const VIDEO_STUDIO_ORCHESTRATOR_PROMPT_NAME = 'Video Studio - Orchestrator' as const;

/** Default render worker health probe timeout in milliseconds (10 s). */
export const DEFAULT_SETUP_HEALTH_RENDER_TIMEOUT_MS = 10_000;

/** Minimum clamped render worker health probe timeout in milliseconds (1 s). */
export const MIN_SETUP_HEALTH_RENDER_TIMEOUT_MS = 1_000;

/** Maximum clamped render worker health probe timeout in milliseconds (30 s). */
export const MAX_SETUP_HEALTH_RENDER_TIMEOUT_MS = 30_000;

/** Exact error message when no file storage account is configured for Video Studio. */
export const SETUP_HEALTH_NO_STORAGE_MESSAGE =
    'No file storage account. Pre-Production, contact sheets and delivery need one; only a failed MP4 upload falls back to inline storage, capped at 2 MB.' as const;

/** Exact remediation action when no explicit storage account is configured for Video Studio. */
export const SETUP_HEALTH_STORAGE_ACTION =
    "Set Default Storage Account on the 'Content Creation' agent category (or on the Video Studio agent)." as const;

/** Warning message shown when the active render driver is not network-isolated. */
export const SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE =
    'Renders can reach the network. Use the Docker driver for untrusted content.' as const;

/** Remediation action shown when the active render driver is not network-isolated. */
export const SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION =
    "Switch videoStudio.render.driver to 'Docker' when rendering untrusted content." as const;

/** Minimal interface used by `VideoStudioSetupHealthServerOperation` to preview model selection. */
export interface SetupHealthPromptPreviewRunner {
    PreviewModelSelection(
        prompt: MJAIPromptEntityExtended,
        configurationId?: string,
    ): ModelSelectionPreviewItem[] | Promise<ModelSelectionPreviewItem[]>;
}

/**
 * Server-side implementation of the `VideoStudio.SetupHealth` Remote Operation.
 */
@RegisterClass(BaseRemotableOperation, 'VideoStudio.SetupHealth')
export class VideoStudioSetupHealthServerOperation extends VideoStudioSetupHealthOperation {
    /**
     * Authorizes the caller by verifying `run` permission on the `Video Studio` agent.
     * Any thrown exception denies access (`false`).
     */
    protected override async Authorize(_input: VideoStudioSetupHealthInput, user: UserInfo): Promise<boolean> {
        try {
            if (!user) {
                return false;
            }
            await this.ensureAIEngineLoaded(user);
            const agent = this.findVideoStudioAgent();
            if (!agent?.ID) {
                return false;
            }
            const allowed = await AIAgentPermissionHelper.HasPermission(agent.ID, user, 'run');
            return Boolean(allowed);
        } catch {
            return false;
        }
    }

    /**
     * Runs the Storage, Render, and Models checks and returns a consolidated `VideoStudioSetupHealthOutput`.
     * Individual check exceptions are caught and converted into an `Error` check row for that subsystem.
     */
    protected override async InternalExecute(
        input: VideoStudioSetupHealthInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<VideoStudioSetupHealthOutput> {
        await this.ensureEnginesLoaded(user, provider);

        const storageCheck = await this.runCheckSafely('Storage', 'File Storage', () =>
            this.checkStorage(),
        );
        const renderCheck = await this.runCheckSafely('Render', 'Render Worker', () =>
            this.checkRender(input),
        );
        const modelsCheck = await this.runCheckSafely('Models', 'Model Credentials', () =>
            this.checkModels(),
        );

        const checks: VideoStudioSetupHealthCheck[] = [storageCheck, renderCheck, modelsCheck];
        const healthy = checks.every((check) => check.Status !== 'Error');

        return {
            Healthy: healthy,
            Checks: checks,
        };
    }

    /**
     * Factory hook for creating the prompt runner used by the Models check.
     * Overridable in unit tests to inject a deterministic stub.
     */
    protected createPromptRunner(): SetupHealthPromptPreviewRunner {
        return new AIPromptRunner();
    }

    private async ensureAIEngineLoaded(user?: UserInfo): Promise<void> {
        const aiEngine = AIEngine.Instance as unknown as {
            Loaded?: boolean;
            Config?: (forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) => Promise<void>;
        };
        if (!aiEngine.Loaded && typeof aiEngine.Config === 'function') {
            await aiEngine.Config(false, user);
        }
    }

    private async ensureEnginesLoaded(user?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        try {
            await this.ensureAIEngineLoaded(user);
        } catch {
            // Individual checks will surface metadata lookup failures cleanly.
        }
        try {
            const storageEngine = FileStorageEngineBase.Instance as unknown as {
                Loaded?: boolean;
                Config?: (forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) => Promise<void>;
            };
            if (!storageEngine.Loaded && typeof storageEngine.Config === 'function') {
                await storageEngine.Config(false, user, provider);
            }
        } catch {
            // Storage check handles missing/unconfigured storage accounts.
        }
    }

    private async runCheckSafely(
        key: VideoStudioSetupHealthCheckKey,
        title: string,
        fn: () => Promise<VideoStudioSetupHealthCheck>,
    ): Promise<VideoStudioSetupHealthCheck> {
        try {
            return await fn();
        } catch (err) {
            return {
                Key: key,
                Status: 'Error',
                Title: title,
                Message: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private findVideoStudioAgent(): MJAIAgentEntity | undefined {
        const engine = AIEngine.Instance as unknown as {
            GetAgentByName?: (name: string) => MJAIAgentEntity | undefined;
            Agents?: MJAIAgentEntity[];
        };
        if (typeof engine.GetAgentByName === 'function') {
            const found = engine.GetAgentByName(VIDEO_STUDIO_AGENT_NAME);
            if (found) {
                return found;
            }
        }
        return engine.Agents?.find((a) => a.Name?.trim() === VIDEO_STUDIO_AGENT_NAME);
    }

    private resolveStorageAccountName(accountId: string): string {
        const storageEngine = FileStorageEngineBase.Instance as unknown as {
            GetAccountById?: (id: string) => { ID: string; Name?: string } | undefined;
            Accounts?: Array<{ ID: string; Name?: string }>;
        };
        if (typeof storageEngine.GetAccountById === 'function') {
            const account = storageEngine.GetAccountById(accountId);
            if (account?.Name) {
                return account.Name;
            }
        }
        const matched = storageEngine.Accounts?.find((a) => UUIDsEqual(a.ID, accountId));
        return matched?.Name || accountId;
    }

    private async checkStorage(): Promise<VideoStudioSetupHealthCheck> {
        const agent = this.findVideoStudioAgent();
        if (!agent) {
            throw new Error(`Agent '${VIDEO_STUDIO_AGENT_NAME}' was not found in AI metadata.`);
        }

        const resolution = AIEngine.Instance.ResolveAgentStorageAccount(agent);
        if (resolution.Source === 'None' || !resolution.AccountID) {
            return {
                Key: 'Storage',
                Status: 'Error',
                Title: 'File Storage',
                Message: SETUP_HEALTH_NO_STORAGE_MESSAGE,
                Action: SETUP_HEALTH_STORAGE_ACTION,
            };
        }

        const accountName = this.resolveStorageAccountName(resolution.AccountID);
        if (resolution.Source === 'Fallback' && resolution.Ambiguous) {
            return {
                Key: 'Storage',
                Status: 'Warning',
                Title: 'File Storage',
                Message: `Multiple active file storage accounts found; using fallback account '${accountName}'.`,
                Action: SETUP_HEALTH_STORAGE_ACTION,
            };
        }

        return {
            Key: 'Storage',
            Status: 'OK',
            Title: 'File Storage',
            Message: `Using file storage account '${accountName}' (${resolution.Source}).`,
        };
    }

    private clampRenderTimeoutMs(rawTimeoutMs?: number): number {
        if (typeof rawTimeoutMs !== 'number' || !Number.isFinite(rawTimeoutMs)) {
            return DEFAULT_SETUP_HEALTH_RENDER_TIMEOUT_MS;
        }
        return Math.min(
            MAX_SETUP_HEALTH_RENDER_TIMEOUT_MS,
            Math.max(MIN_SETUP_HEALTH_RENDER_TIMEOUT_MS, Math.trunc(rawTimeoutMs)),
        );
    }

    private resolveDriverName(driver: VideoRenderDriverBase): string {
        if (driver instanceof DockerRenderDriver) {
            return 'Docker';
        }
        if (driver instanceof RemoteRenderDriver) {
            return 'Remote';
        }
        if (driver instanceof LocalWorkerRenderDriver) {
            return 'LocalWorker';
        }
        try {
            const configured = ReadVideoRenderSettings().Driver?.trim();
            if (configured) {
                return configured;
            }
        } catch {
            // Fall through to constructor name.
        }
        return driver.constructor?.name || 'LocalWorker';
    }

    private resolveDriverAction(driverName: string): string {
        switch (driverName) {
            case 'Remote':
                return 'Check VIDEO_STUDIO_RENDER_URL and verify the remote render worker is reachable.';
            case 'Docker':
                return `Start Docker and build the render image (${DOCKER_RENDER_IMAGE_BUILD_COMMAND}).`;
            case 'LocalWorker':
            default:
                return 'Install ffmpeg and check @memberjunction/video-studio-render-worker.';
        }
    }

    private async checkRender(input: VideoStudioSetupHealthInput): Promise<VideoStudioSetupHealthCheck> {
        const timeoutMs = this.clampRenderTimeoutMs(input?.RenderTimeoutMs);

        let driver: VideoRenderDriverBase;
        try {
            driver = VideoRenderEngine.Instance.Driver;
        } catch (err) {
            if (err instanceof VideoRenderError && err.Code === 'UnknownDriver') {
                return {
                    Key: 'Render',
                    Status: 'Error',
                    Title: 'Render Worker',
                    Message: err.message,
                    Action: "Set videoStudio.render.driver in mj.config.cjs to 'LocalWorker', 'Remote', or 'Docker'.",
                };
            }
            throw err;
        }

        const driverName = this.resolveDriverName(driver);
        const driverAction = this.resolveDriverAction(driverName);

        // Start Health() without aborting it on timeout so a cold LocalWorker start can finish in the background.
        const healthPromise = driver.Health();
        healthPromise.catch(() => undefined);

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = Symbol('SetupHealthRenderTimeout');
        const raceOutcome = await Promise.race([
            healthPromise,
            new Promise<typeof timedOut>((resolve) => {
                timer = setTimeout(() => resolve(timedOut), timeoutMs);
            }),
        ]).finally(() => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        });

        if (raceOutcome === timedOut) {
            const seconds = Math.round(timeoutMs / 1000);
            return {
                Key: 'Render',
                Status: 'Error',
                Title: 'Render Worker',
                Message: `The render worker didn't answer in ${seconds} s (driver ${driverName}).`,
                Action: driverAction,
            };
        }

        if (!raceOutcome.Healthy) {
            return {
                Key: 'Render',
                Status: 'Error',
                Title: 'Render Worker',
                Message: `Render worker is unhealthy (driver ${driverName}).`,
                Action: driverAction,
                Details: raceOutcome.Errors.length > 0 ? [...raceOutcome.Errors] : undefined,
            };
        }

        const versionDetails: string[] = [
            `Node ${raceOutcome.NodeVersion}`,
            `HyperFrames ${raceOutcome.HyperFramesVersion}`,
        ];
        if (raceOutcome.ChromiumVersion) {
            versionDetails.push(`Chromium ${raceOutcome.ChromiumVersion}`);
        }
        if (raceOutcome.FfmpegVersion) {
            versionDetails.push(`ffmpeg ${raceOutcome.FfmpegVersion}`);
        }

        if (!driver.IsNetworkIsolated) {
            return {
                Key: 'Render',
                Status: 'Warning',
                Title: 'Render Worker',
                Message: SETUP_HEALTH_RENDER_NETWORK_WARNING_MESSAGE,
                Action: SETUP_HEALTH_RENDER_NETWORK_WARNING_ACTION,
                Details: versionDetails,
            };
        }

        return {
            Key: 'Render',
            Status: 'OK',
            Title: 'Render Worker',
            Message: `Render worker ready (driver ${driverName}).`,
            Details: versionDetails,
        };
    }

    private getActivePresets(agentId: string): MJAIAgentConfigurationEntity[] {
        const engine = AIEngine.Instance as unknown as {
            GetAgentConfigurationPresets?: (
                id: string,
                activeOnly?: boolean,
            ) => MJAIAgentConfigurationEntity[];
            AgentConfigurations?: MJAIAgentConfigurationEntity[];
        };
        if (typeof engine.GetAgentConfigurationPresets === 'function') {
            return engine.GetAgentConfigurationPresets(agentId, true);
        }
        return (engine.AgentConfigurations ?? []).filter(
            (c) => UUIDsEqual(c.AgentID, agentId) && c.Status === 'Active',
        );
    }

    private async checkModels(): Promise<VideoStudioSetupHealthCheck> {
        const agent = this.findVideoStudioAgent();
        if (!agent) {
            throw new Error(`Agent '${VIDEO_STUDIO_AGENT_NAME}' was not found in AI metadata.`);
        }

        const orchestratorPrompt = AIEngine.Instance.Prompts?.find(
            (p) => p.Name?.trim() === VIDEO_STUDIO_ORCHESTRATOR_PROMPT_NAME,
        );
        if (!orchestratorPrompt) {
            throw new Error(`Prompt '${VIDEO_STUDIO_ORCHESTRATOR_PROMPT_NAME}' was not found in AI metadata.`);
        }

        const activePresets = this.getActivePresets(agent.ID);
        if (activePresets.length === 0) {
            throw new Error(`No active configuration presets found for agent '${VIDEO_STUDIO_AGENT_NAME}'.`);
        }

        const runner = this.createPromptRunner();
        const errorMessages: string[] = [];
        const warningMessages: string[] = [];
        const missingVendors: string[] = [];
        const details: string[] = [];

        const recordMissingVendor = (vendor: string): void => {
            if (vendor && !missingVendors.includes(vendor)) {
                missingVendors.push(vendor);
            }
        };

        for (const preset of activePresets) {
            const presetName = preset.Name?.trim() || preset.DisplayName?.trim() || 'Default';
            const candidates = await runner.PreviewModelSelection(
                orchestratorPrompt,
                preset.AIConfigurationID ?? undefined,
            );
            const firstWithCreds = candidates.find((c) => c.HasCredentials);

            if (!firstWithCreds) {
                const firstCandidate = candidates[0];
                const firstModel = firstCandidate?.ModelName || 'configured model';
                const vendor = firstCandidate?.VendorName || firstCandidate?.DriverClass || 'configured vendor';
                const msg = `${presetName} can't run: no credentials for ${firstModel} (${vendor})`;
                errorMessages.push(msg);
                details.push(msg);
                recordMissingVendor(vendor);
            } else if (!candidates[0].HasCredentials) {
                const primary = candidates[0];
                const msg = `${presetName} will use ${firstWithCreds.ModelName} instead of ${primary.ModelName}`;
                warningMessages.push(msg);
                details.push(msg);
                if (primary.VendorName) {
                    recordMissingVendor(primary.VendorName);
                }
            } else {
                const primary = candidates[0];
                details.push(
                    primary.VendorName
                        ? `${presetName}: ${primary.ModelName} (${primary.VendorName})`
                        : `${presetName}: ${primary.ModelName}`,
                );
            }
        }

        const action =
            missingVendors.length === 1
                ? `Add a credential for ${missingVendors[0]}`
                : missingVendors.length > 1
                  ? `Add a credential for ${missingVendors.join(', ')}`
                  : undefined;

        if (errorMessages.length > 0) {
            return {
                Key: 'Models',
                Status: 'Error',
                Title: 'Model Credentials',
                Message: errorMessages.join('; '),
                Action: action,
                Details: details,
            };
        }

        if (warningMessages.length > 0) {
            return {
                Key: 'Models',
                Status: 'Warning',
                Title: 'Model Credentials',
                Message: warningMessages.join('; '),
                Action: action,
                Details: details,
            };
        }

        return {
            Key: 'Models',
            Status: 'OK',
            Title: 'Model Credentials',
            Message: `All ${activePresets.length} preset${activePresets.length === 1 ? '' : 's'} have model credentials.`,
            Details: details,
        };
    }
}

/**
 * Loader function that prevents tree-shaking of `VideoStudioSetupHealthServerOperation`.
 */
export function LoadVideoStudioSetupHealthOperation(): void {
    void VideoStudioSetupHealthServerOperation;
}
