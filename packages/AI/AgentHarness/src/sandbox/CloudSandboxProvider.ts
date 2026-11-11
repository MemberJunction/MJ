import { LogError, LogStatus } from '@memberjunction/core';
import {
    CloudNetworkAccess,
    CloudSandboxMetadata,
    CloudSandboxOptions,
    CloudWaitMode,
    HarnessNetworkPolicy,
} from '../types.js';
import { ISandboxProvider, SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { HarnessProcess, HarnessProcessSpec, ISandboxProcessExecutor } from './SandboxExecutor.js';

/** Default turn wait budget (2 minutes) before bounded timeout or adaptive-wake detach. */
export const DEFAULT_CLOUD_TURN_WAIT_BUDGET_MS = 120_000;

/** Default remote session polling interval (2 seconds). */
export const DEFAULT_CLOUD_POLL_INTERVAL_MS = 2_000;

/** Default cloud waiting strategy when omitted in `CloudSandboxOptions`. */
export const DEFAULT_CLOUD_WAIT_MODE: CloudWaitMode = 'bounded-poll';

/**
 * Fail-closed process executor attached to every `CloudSandboxProvider` handle.
 *
 * If a CLI-only adapter (`BaseCliHarnessAdapter`) is accidentally paired with `sandbox.provider === 'cloud'`,
 * attempting to spawn or run a process immediately throws a host-isolation error rather than silently
 * executing on the MJAPI server host.
 */
export class CloudDisallowedProcessExecutor implements ISandboxProcessExecutor {
    public constructor(private readonly workspacePath: string) {}

    /**
     * Throws synchronously to block local host process creation under `sandbox.provider === 'cloud'`.
     */
    public Spawn(spec?: HarnessProcessSpec): HarnessProcess {
        const commandLabel = spec?.Command ? `'${spec.Command}'` : 'process';
        throw new Error(
            `Host-isolation violation: cannot spawn local ${commandLabel} in cloud sandbox '${this.workspacePath}'. ` +
                `When sandbox.provider is 'cloud', harnesses must execute remotely via a BaseCloudHarnessAdapter ` +
                `rather than spawning processes on the MJAPI host.`,
        );
    }

    /** @inheritdoc */
    public Run(spec: HarnessProcessSpec): HarnessProcess {
        return this.Spawn(spec);
    }
}

/**
 * Provisions logical cloud workspace handles (`cloud://<sessionKey>`) and normalized metadata for
 * remote cloud agent platforms (Google Antigravity Cloud, Anthropic Claude Cloud, OpenAI Codex Cloud).
 */
export class CloudSandboxProvider implements ISandboxProvider {
    public readonly Name = 'cloud' as const;
    private readonly defaultCloudOptions: CloudSandboxOptions;
    private readonly activeHandles = new Map<string, CloudSandboxMetadata>();

    public constructor(defaultCloudOptions?: CloudSandboxOptions) {
        this.defaultCloudOptions = defaultCloudOptions ? { ...defaultCloudOptions } : {};
    }

    /** Returns whether `sessionKey` currently has an active (unfinalized) cloud handle tracked locally. */
    public IsSessionActive(sessionKey: string): boolean {
        return this.activeHandles.has(sessionKey);
    }

    /** @inheritdoc */
    public async Provision(
        keyOrSessionKey: WorkspaceKey | string,
        config: SandboxConfig = { NetworkPolicy: 'mcp-only' },
    ): Promise<SandboxHandle> {
        const workspaceKey = this.normalizeWorkspaceKey(keyOrSessionKey);
        const sessionKey =
            typeof keyOrSessionKey === 'string'
                ? this.sanitizeSessionKey(keyOrSessionKey)
                : this.buildSessionKey(workspaceKey);

        const mergedCloud: CloudSandboxOptions = {
            ...this.defaultCloudOptions,
            ...(config.cloud ?? {}),
        };

        const metadata = this.buildMetadata(sessionKey, mergedCloud, config.NetworkPolicy);
        const workspacePath = `cloud://${sessionKey}`;
        const cleanupToken = JSON.stringify({
            provider: 'cloud',
            sessionKey,
            runId: workspaceKey.RunId,
            environmentId: metadata.EnvironmentId ?? null,
            repositoryUrl: metadata.RepositoryUrl ?? null,
            provisionedAt: new Date().toISOString(),
        });

        this.activeHandles.set(sessionKey, metadata);
        LogStatus(`Cloud sandbox handle provisioned: ${workspacePath}`);

        return {
            Provider: 'cloud',
            WorkspacePath: workspacePath,
            Key: workspaceKey,
            Ephemeral: workspaceKey.Scope === 'run',
            CleanupToken: cleanupToken,
            Metadata: metadata,
            Executor: new CloudDisallowedProcessExecutor(workspacePath),
        };
    }

    /** @inheritdoc */
    public async Finalize(
        handle: SandboxHandle,
        outcome: 'success' | 'failure' | 'cancelled',
    ): Promise<void> {
        try {
            const sessionKey =
                handle.Metadata?.SessionKey ??
                (handle.WorkspacePath.startsWith('cloud://')
                    ? handle.WorkspacePath.slice('cloud://'.length)
                    : this.buildSessionKey(handle.Key));
            this.activeHandles.delete(sessionKey);
            LogStatus(`Cloud sandbox handle finalized (${outcome}): ${handle.WorkspacePath}`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            LogError(`Failed to finalize cloud sandbox handle ${handle.WorkspacePath}: ${detail}`);
        }
    }

    private normalizeWorkspaceKey(keyOrSessionKey: WorkspaceKey | string): WorkspaceKey {
        if (typeof keyOrSessionKey === 'string') {
            const cleaned = this.sanitizeSessionKey(keyOrSessionKey);
            return {
                Scope: 'run',
                AgentId: 'cloud-agent',
                RunId: cleaned,
            };
        }
        return keyOrSessionKey;
    }

    private buildSessionKey(key: WorkspaceKey): string {
        switch (key.Scope) {
            case 'run':
                return `run/${this.sanitizeSegment(key.RunId)}`;
            case 'agent':
                return `agent/${this.sanitizeSegment(key.AgentId)}`;
            case 'agent-user':
                return `agent-user/${this.sanitizeSegment(key.AgentId)}/${this.sanitizeSegment(key.UserId ?? 'no-user')}`;
        }
    }

    private sanitizeSessionKey(raw: string): string {
        const trimmed = raw.trim().replace(/^cloud:\/\//i, '');
        return trimmed.length > 0 ? trimmed : 'default-session';
    }

    private sanitizeSegment(raw: string): string {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed.replace(/[^a-zA-Z0-9._-]/g, '-') : 'unspecified';
    }

    private buildMetadata(
        sessionKey: string,
        cloud: CloudSandboxOptions,
        networkPolicy?: HarnessNetworkPolicy,
    ): CloudSandboxMetadata {
        const endpointUrl = normalizeOptionalUrl(cloud.endpointUrl);
        const mcpExternalServerUrl = normalizeOptionalUrl(cloud.mcpExternalServerUrl);
        const turnWaitBudgetMs =
            typeof cloud.turnWaitBudgetMs === 'number' && cloud.turnWaitBudgetMs > 0
                ? Math.floor(cloud.turnWaitBudgetMs)
                : DEFAULT_CLOUD_TURN_WAIT_BUDGET_MS;
        const pollIntervalMs =
            typeof cloud.pollIntervalMs === 'number' && cloud.pollIntervalMs > 0
                ? Math.floor(cloud.pollIntervalMs)
                : DEFAULT_CLOUD_POLL_INTERVAL_MS;

        return {
            Provider: 'cloud',
            SessionKey: sessionKey,
            EndpointUrl: endpointUrl,
            Region: normalizeOptionalString(cloud.region),
            ProjectId: normalizeOptionalString(cloud.projectId),
            EnvironmentId: normalizeOptionalString(cloud.environmentId),
            RepositoryUrl: normalizeOptionalString(cloud.repositoryUrl),
            GitRef: normalizeOptionalString(cloud.gitRef),
            GitBranch: normalizeOptionalString(cloud.gitBranch),
            NetworkAccess: cloud.networkAccess ?? this.mapNetworkPolicy(networkPolicy),
            WaitMode: cloud.waitMode ?? DEFAULT_CLOUD_WAIT_MODE,
            TurnWaitBudgetMs: turnWaitBudgetMs,
            PollIntervalMs: pollIntervalMs,
            McpExternalServerUrl: mcpExternalServerUrl,
            ExtraHeaders: cloud.extraHeaders ? { ...cloud.extraHeaders } : undefined,
        };
    }

    private mapNetworkPolicy(policy?: HarnessNetworkPolicy): CloudNetworkAccess {
        switch (policy) {
            case 'none':
                return 'none';
            case 'open':
                return 'egress';
            case 'mcp-only':
            case 'allowlist':
            default:
                return 'restricted';
        }
    }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    let end = trimmed.length;
    while (end > 0 && trimmed.charCodeAt(end - 1) === 47) {
        end--;
    }
    return end === trimmed.length ? trimmed : trimmed.slice(0, end);
}
