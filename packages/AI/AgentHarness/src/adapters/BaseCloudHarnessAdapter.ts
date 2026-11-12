import { BaseSingleton } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import {
    CloudExecutionState,
    CloudNetworkAccess,
    CloudSandboxMetadata,
    CloudSandboxOptions,
    CloudWaitMode,
    HarnessCapabilities,
    HarnessPermissionPolicy,
    HarnessSessionConfig,
    HarnessTurnEvent,
} from '../types.js';
import {
    DEFAULT_CLOUD_POLL_INTERVAL_MS,
    DEFAULT_CLOUD_TURN_WAIT_BUDGET_MS,
    DEFAULT_CLOUD_WAIT_MODE,
} from '../sandbox/CloudSandboxProvider.js';

// ============================================================================
// Recursive JSON Types (Zero `any`, Zero `unknown`)
// ============================================================================

export type CloudJsonPrimitive = string | number | boolean | null;
export type CloudJsonValue = CloudJsonPrimitive | CloudJsonObject | CloudJsonValue[];

export interface CloudJsonObject {
    [key: string]: CloudJsonValue | undefined;
}

export function IsCloudJsonObject(value: CloudJsonValue | undefined): value is CloudJsonObject {
    return value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function ParseCloudJsonObject(rawText: string): CloudJsonObject | null {
    const trimmed = rawText.trim();
    if (!trimmed || !trimmed.startsWith('{')) {
        return null;
    }
    try {
        const parsed: CloudJsonValue = JSON.parse(trimmed);
        return IsCloudJsonObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function ReadCloudString(obj: CloudJsonObject | undefined, key: string): string | undefined {
    const value = obj?.[key];
    return typeof value === 'string' ? value : undefined;
}

export function ReadCloudNumber(obj: CloudJsonObject | undefined, key: string): number | undefined {
    const value = obj?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function ReadCloudBoolean(obj: CloudJsonObject | undefined, key: string): boolean | undefined {
    const value = obj?.[key];
    return typeof value === 'boolean' ? value : undefined;
}

export function ReadCloudObject(obj: CloudJsonObject | undefined, key: string): CloudJsonObject | undefined {
    const value = obj?.[key];
    return IsCloudJsonObject(value) ? value : undefined;
}

export function ReadCloudArray(obj: CloudJsonObject | undefined, key: string): CloudJsonValue[] | undefined {
    const value = obj?.[key];
    return Array.isArray(value) ? value : undefined;
}

// ============================================================================
// Strongly-Typed Cloud HTTP Transport
// ============================================================================

export type CloudHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CloudHttpRequest {
    Url: string;
    Method: CloudHttpMethod;
    Headers: Record<string, string>;
    Body?: string;
    Signal?: AbortSignal;
}

export interface CloudHttpResponse {
    Status: number;
    Ok: boolean;
    StatusText: string;
    Headers: Record<string, string>;
    BodyText: string;
    Json: CloudJsonObject | null;
}

export interface ICloudHttpTransport {
    Send(request: CloudHttpRequest): Promise<CloudHttpResponse>;
}

/**
 * Default `ICloudHttpTransport` wrapping Node 20+ global `fetch`.
 */
export class FetchCloudHttpTransport implements ICloudHttpTransport {
    private readonly fetchImpl: typeof fetch;

    public constructor(fetchImpl?: typeof fetch) {
        this.fetchImpl = fetchImpl ?? fetch;
    }

    public async Send(request: CloudHttpRequest): Promise<CloudHttpResponse> {
        const response = await this.fetchImpl(request.Url, {
            method: request.Method,
            headers: request.Headers,
            body: request.Body,
            signal: request.Signal,
        });

        const bodyText = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((val, key) => {
            headers[key.toLowerCase()] = val;
        });

        return {
            Status: response.status,
            Ok: response.ok,
            StatusText: response.statusText,
            Headers: headers,
            BodyText: bodyText,
            Json: ParseCloudJsonObject(bodyText),
        };
    }
}

// ============================================================================
// Detached Async-Wake Session Registry (BaseSingleton)
// ============================================================================

export interface DetachedSessionState {
    SessionId: string;
    EmittedEventKeys: Set<string>;
    DetachedAtIso: string;
}

/**
 * Process-wide registry of cloud sessions that detached in `adaptive-wake` mode and have not yet
 * been harvested by a subsequent `AgentWake`. Uses `BaseSingleton` for global object store safety.
 */
export class CloudDetachedSessionRegistry extends BaseSingleton<CloudDetachedSessionRegistry> {
    private readonly entries = new Map<string, DetachedSessionState>();

    public constructor() {
        super();
    }

    public static get Instance(): CloudDetachedSessionRegistry {
        return CloudDetachedSessionRegistry.getInstance<CloudDetachedSessionRegistry>();
    }

    public MarkDetached(sessionId: string, emittedEventKeys: ReadonlySet<string>): void {
        this.entries.set(sessionId, {
            SessionId: sessionId,
            EmittedEventKeys: new Set(emittedEventKeys),
            DetachedAtIso: new Date().toISOString(),
        });
    }

    public GetDetached(sessionId: string): DetachedSessionState | undefined {
        return this.entries.get(sessionId);
    }

    public ClearDetached(sessionId: string): void {
        this.entries.delete(sessionId);
    }

    public ClearAll(): void {
        this.entries.clear();
    }
}

// ============================================================================
// Normalized Cloud Snapshot Contracts
// ============================================================================

export interface CloudNormalizedStepEvent {
    /** Deterministic key within the session used to avoid re-emitting already streamed items across polls. */
    Key: string;
    Event: HarnessTurnEvent;
}

export interface CloudNormalizedUsage {
    PromptTokens: number;
    CompletionTokens: number;
    ThinkingTokens?: number;
    CostUsd?: number;
}

export interface CloudNormalizedSnapshot {
    SessionId: string;
    State: CloudExecutionState;
    Model?: string;
    OutputText?: string;
    ErrorMessage?: string;
    StepEvents: CloudNormalizedStepEvent[];
    Usage?: CloudNormalizedUsage;
    PullRequestUrl?: string;
    ArtifactUrls?: string[];
}

export interface ResolvedCloudRuntimeSettings {
    BaseUrl: string;
    Region?: string;
    ProjectId?: string;
    EnvironmentId?: string;
    RepositoryUrl?: string;
    GitRef?: string;
    GitBranch?: string;
    NetworkAccess: CloudNetworkAccess;
    WaitMode: CloudWaitMode;
    TurnWaitBudgetMs: number;
    PollIntervalMs: number;
    McpServerUrl?: string;
    McpCredential?: string;
    ExtraHeaders: Record<string, string>;
}

/**
 * Abstract base class for remote HTTP/cloud agent harness adapters (Antigravity Cloud, Claude Code
 * Cloud, OpenAI Codex Cloud).
 *
 * Implements full session initialization, credential & header assembly, `bounded-poll` and
 * `adaptive-wake` turn waiting modes, mid-turn cancellation, deduplicated incremental event emission,
 * and idempotent session teardown that preserves remote execution when detached for `AgentWake`.
 */
export abstract class BaseCloudHarnessAdapter extends BaseHarnessAdapter {
    protected httpTransport: ICloudHttpTransport;
    protected config: HarnessSessionConfig | null = null;
    protected runtimeSettings: ResolvedCloudRuntimeSettings | null = null;
    protected authHeaders: Record<string, string> = {};
    protected systemPrompt: string | undefined;
    protected permissionPolicy: HarnessPermissionPolicy | undefined;
    protected sessionId: string | undefined;
    protected reportedModel: string | undefined;
    protected didResume = false;
    protected isDetachedForWake = false;
    protected lastExecutionState: CloudExecutionState | undefined;
    protected resumedSnapshot: CloudNormalizedSnapshot | null = null;
    protected resumedWasDetached = false;
    protected emittedEventKeys = new Set<string>();
    private turnCount = 0;
    private sessionEnded = false;
    private sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;

    public constructor(httpTransport?: ICloudHttpTransport) {
        super();
        this.httpTransport = httpTransport ?? new FetchCloudHttpTransport();
    }

    /** Injects a custom HTTP transport (used for deterministic offline unit tests). */
    public SetHttpTransport(transport: ICloudHttpTransport): void {
        this.httpTransport = transport;
    }

    /** Injects a custom sleep implementation for deterministic timer control in tests. */
    public SetSleepImpl(sleepFn: (ms: number, signal?: AbortSignal) => Promise<void>): void {
        this.sleepImpl = sleepFn;
    }

    /** Default base URL when neither `CloudOptions.endpointUrl` nor the provider env var is set. */
    protected abstract get DefaultEndpointUrl(): string;

    /** Environment variable inspected for a custom provider endpoint URL (e.g. `CLAUDE_CLOUD_API_URL`). */
    protected abstract get EndpointEnvVarName(): string;

    /** Human-readable provider label for error and status messages. */
    protected abstract get ProviderDisplayName(): string;

    /** Resolves provider authentication headers from `config` or throws if required credentials are missing. */
    protected abstract resolveAuthHeaders(config: HarnessSessionConfig): Record<string, string>;

    /** Queries an existing remote session (`init.ResumeSessionId`), returning `null` if not found (HTTP 404). */
    protected abstract inspectRemoteSession(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot | null>;

    /** Submits a new turn on the cloud platform and returns its initial normalized snapshot. */
    protected abstract submitTurnRequest(
        input: string,
        isFirstTurn: boolean,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot>;

    /** Polls an in-flight cloud session/interaction and returns its latest normalized snapshot. */
    protected abstract pollRemoteSession(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot>;

    /** Requests remote cancellation of an in-flight cloud session/interaction. */
    protected abstract cancelRemoteSession(sessionId: string): Promise<void>;

    /**
     * Optional hook invoked during `StartSession` when starting a brand-new session (no `ResumeSessionId`).
     * Stateful session-container platforms (e.g. Claude Cloud `/v1/sessions`) override this to allocate
     * the remote session upfront; interaction-per-turn platforms leave the default no-op.
     */
    protected async onStartNewSession(_signal?: AbortSignal): Promise<void> {
        // Default no-op for interaction/response-per-turn cloud platforms.
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            SessionResume: true,
            MidTurnCancellation: true,
            StructuredOutput: false,
            UsageReporting: true,
            PermissionPolicy: true,
            PermissionHooks: false,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
            SupportsCloudExecution: true,
            SupportsAsyncWakeHandoff: true,
        };
    }

    /** @inheritdoc */
    public override get SessionId(): string | undefined {
        return this.sessionId;
    }

    /** @inheritdoc */
    public override get DidResumeSession(): boolean {
        return this.didResume;
    }

    /** @inheritdoc */
    public override get ReportedModel(): string | undefined {
        return this.reportedModel;
    }

    /** True when the session detached in `adaptive-wake` mode while remote work remains running. */
    public get IsDetachedForWake(): boolean {
        return this.isDetachedForWake;
    }

    /** Most recently observed remote cloud execution state. */
    public get LastExecutionState(): CloudExecutionState | undefined {
        return this.lastExecutionState;
    }

    /** @inheritdoc */
    public override SetSystemPrompt(systemPrompt: string): void {
        this.systemPrompt = systemPrompt;
    }

    /** @inheritdoc */
    public override ApplyPermissionPolicy(policy: HarnessPermissionPolicy): void {
        this.permissionPolicy = policy;
    }

    /** @inheritdoc */
    public async StartSession(init: HarnessSessionConfig): Promise<void> {
        this.config = init;
        this.turnCount = 0;
        this.sessionEnded = false;
        this.didResume = false;
        this.isDetachedForWake = false;
        this.lastExecutionState = undefined;
        this.resumedSnapshot = null;
        this.resumedWasDetached = false;
        this.emittedEventKeys.clear();

        if (init.SystemPrompt) {
            this.systemPrompt = init.SystemPrompt;
        }
        if (init.PermissionPolicy) {
            this.ApplyPermissionPolicy(init.PermissionPolicy);
        }

        this.runtimeSettings = this.buildRuntimeSettings(init);
        this.authHeaders = this.resolveAuthHeaders(init);

        if (init.ResumeSessionId && init.ResumeSessionId.trim().length > 0) {
            const candidateId = init.ResumeSessionId.trim();
            const detachedEntry = CloudDetachedSessionRegistry.Instance.GetDetached(candidateId);
            if (detachedEntry) {
                for (const key of detachedEntry.EmittedEventKeys) {
                    this.emittedEventKeys.add(key);
                }
                this.resumedWasDetached = true;
            }
            if (init.ReattachPendingTurn === true) {
                this.resumedWasDetached = true;
            }

            const existing = await this.inspectRemoteSession(candidateId, init.CancellationToken);
            if (existing) {
                this.sessionId = existing.SessionId;
                this.didResume = true;
                this.lastExecutionState = existing.State;
                if (existing.Model) {
                    this.reportedModel = existing.Model;
                }
                this.resumedSnapshot = existing;
                LogStatus(
                    `${this.ProviderDisplayName} resumed session '${this.sessionId}' (state: ${existing.State})`,
                );
                return;
            }

            LogStatus(
                `${this.ProviderDisplayName} session '${candidateId}' was not found remotely; starting fresh session.`,
            );
            this.emittedEventKeys.clear();
            this.resumedWasDetached = false;
        }

        await this.onStartNewSession(init.CancellationToken);
        LogStatus(
            `${this.ProviderDisplayName} cloud session initialized (${this.runtimeSettings.BaseUrl})`,
        );
    }

    /** @inheritdoc */
    public async *RunTurn(input: string): AsyncIterable<HarnessTurnEvent> {
        if (!this.config || !this.runtimeSettings) {
            yield {
                Type: 'session-error',
                Error: 'RunTurn called before StartSession',
                CloudExecutionState: 'failed',
            };
            return;
        }

        const signal = this.config.CancellationToken;
        if (signal?.aborted) {
            yield {
                Type: 'session-error',
                Error: `${this.ProviderDisplayName} turn aborted before execution started`,
                CloudExecutionState: 'cancelled',
            };
            return;
        }

        this.isDetachedForWake = false;
        const isFirstTurn = this.turnCount === 0;
        this.turnCount++;
        const turnStartMs = Date.now();

        let snapshot: CloudNormalizedSnapshot;
        try {
            const pendingResume = this.consumePendingResumeSnapshot();
            if (pendingResume) {
                snapshot = pendingResume;
            } else {
                snapshot = await this.submitTurnRequest(input, isFirstTurn, signal);
            }
        } catch (error) {
            if (signal?.aborted) {
                if (this.sessionId) {
                    await this.safeCancelRemote(this.sessionId);
                }
                yield {
                    Type: 'session-error',
                    Error: `${this.ProviderDisplayName} turn cancelled during submission`,
                    CloudExecutionState: 'cancelled',
                };
                return;
            }
            yield {
                Type: 'session-error',
                Error: `${this.ProviderDisplayName} request failed: ${describeCloudError(error)}`,
                CloudExecutionState: 'failed',
            };
            return;
        }

        this.applySnapshotMetadata(snapshot);
        for (const stepEvent of this.collectUnseenStepEvents(snapshot)) {
            yield stepEvent;
        }

        const settings = this.runtimeSettings;
        while (snapshot.State === 'running') {
            if (signal?.aborted) {
                await this.safeCancelRemote(snapshot.SessionId);
                this.lastExecutionState = 'cancelled';
                yield {
                    Type: 'session-error',
                    Error: `${this.ProviderDisplayName} turn cancelled by caller`,
                    CloudExecutionState: 'cancelled',
                };
                return;
            }

            const elapsedMs = Date.now() - turnStartMs;
            if (elapsedMs >= settings.TurnWaitBudgetMs) {
                if (settings.WaitMode === 'adaptive-wake') {
                    this.isDetachedForWake = true;
                    this.lastExecutionState = 'running';
                    CloudDetachedSessionRegistry.Instance.MarkDetached(
                        snapshot.SessionId,
                        this.emittedEventKeys,
                    );
                    if (snapshot.Usage) {
                        yield this.buildUsageEvent(snapshot.Usage);
                    }
                    const checkpointEnvelope = JSON.stringify({
                        taskComplete: true,
                        message:
                            `${this.ProviderDisplayName} session '${snapshot.SessionId}' is still running ` +
                            `after ${elapsedMs}ms; detached cleanly for async wake continuation.`,
                        reasoning:
                            'Turn wait budget elapsed under adaptive-wake mode while remote cloud execution remains active.',
                        asyncWakePending: true,
                        externalSessionId: snapshot.SessionId,
                        cloudExecutionState: 'running',
                    });
                    yield {
                        Type: 'turn-complete',
                        RawText: checkpointEnvelope,
                        CloudExecutionState: 'running',
                        AsyncWakePending: true,
                        SessionId: snapshot.SessionId,
                    };
                    return;
                }

                // bounded-poll mode: cancel remote session and surface timeout error
                await this.safeCancelRemote(snapshot.SessionId);
                this.lastExecutionState = 'cancelled';
                if (snapshot.Usage) {
                    yield this.buildUsageEvent(snapshot.Usage);
                }
                yield {
                    Type: 'session-error',
                    Error:
                        `${this.ProviderDisplayName} session '${snapshot.SessionId}' exceeded ` +
                        `turnWaitBudgetMs (${settings.TurnWaitBudgetMs}ms) in bounded-poll mode`,
                    CloudExecutionState: 'running',
                };
                return;
            }

            const remainingMs = Math.max(1, settings.TurnWaitBudgetMs - elapsedMs);
            const waitMs = Math.min(settings.PollIntervalMs, remainingMs);
            await this.waitWithAbort(waitMs, signal);

            if (signal?.aborted) {
                await this.safeCancelRemote(snapshot.SessionId);
                this.lastExecutionState = 'cancelled';
                yield {
                    Type: 'session-error',
                    Error: `${this.ProviderDisplayName} turn cancelled by caller`,
                    CloudExecutionState: 'cancelled',
                };
                return;
            }

            try {
                snapshot = await this.pollRemoteSession(snapshot.SessionId, signal);
            } catch (error) {
                if (signal?.aborted) {
                    await this.safeCancelRemote(snapshot.SessionId);
                    this.lastExecutionState = 'cancelled';
                    yield {
                        Type: 'session-error',
                        Error: `${this.ProviderDisplayName} turn cancelled during poll`,
                        CloudExecutionState: 'cancelled',
                    };
                    return;
                }
                yield {
                    Type: 'session-error',
                    Error: `${this.ProviderDisplayName} poll failed: ${describeCloudError(error)}`,
                    CloudExecutionState: 'failed',
                };
                return;
            }

            this.applySnapshotMetadata(snapshot);
            for (const stepEvent of this.collectUnseenStepEvents(snapshot)) {
                yield stepEvent;
            }
        }

        // Terminal state reached — clear any prior adaptive-wake detach marker
        CloudDetachedSessionRegistry.Instance.ClearDetached(snapshot.SessionId);

        if (snapshot.Usage) {
            yield this.buildUsageEvent(snapshot.Usage);
        }

        if (snapshot.State === 'completed') {
            const finalRawText = this.formatCompletedTurnText(snapshot);
            yield {
                Type: 'turn-complete',
                RawText: finalRawText,
                CloudExecutionState: 'completed',
                AsyncWakePending: false,
                SessionId: snapshot.SessionId,
                PullRequestUrl: snapshot.PullRequestUrl,
                ArtifactUrls: snapshot.ArtifactUrls,
            };
            return;
        }

        yield {
            Type: 'session-error',
            Error:
                snapshot.ErrorMessage ??
                `${this.ProviderDisplayName} session '${snapshot.SessionId}' ended in state '${snapshot.State}'`,
            CloudExecutionState: snapshot.State,
        };
    }

    /** @inheritdoc */
    public async RespondToPermission(
        _requestId: string,
        _approved: boolean,
        _note?: string,
    ): Promise<void> {
        // Cloud sessions apply static posture / MCP tool scoping; mid-turn interactive hooks are a no-op.
    }

    /** @inheritdoc */
    public async EndSession(): Promise<void> {
        if (this.sessionEnded) {
            return;
        }
        this.sessionEnded = true;

        if (this.isDetachedForWake) {
            LogStatus(
                `${this.ProviderDisplayName} detaching session '${this.sessionId ?? 'unknown'}' without remote cancellation (adaptive-wake handoff pending).`,
            );
            this.config = null;
            return;
        }

        if (this.sessionId && this.lastExecutionState === 'running') {
            await this.safeCancelRemote(this.sessionId);
            this.lastExecutionState = 'cancelled';
        }

        this.config = null;
    }

    // ============================================================================
    // Protected Helpers for Concrete Cloud Adapters
    // ============================================================================

    /** Builds standard JSON request headers combining auth headers, JSON content-type, and extraHeaders. */
    protected buildRequestHeaders(includeJsonContentType = true): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            ...this.authHeaders,
            ...(this.runtimeSettings?.ExtraHeaders ?? {}),
        };
        if (includeJsonContentType) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    /** Performs an HTTP call and throws a descriptive error on non-2xx status (unless `allow404` is true). */
    protected async sendCheckedRequest(
        request: CloudHttpRequest,
        options?: { allow404?: boolean },
    ): Promise<CloudHttpResponse> {
        const response = await this.httpTransport.Send(request);
        if (options?.allow404 && response.Status === 404) {
            return response;
        }
        if (!response.Ok) {
            const apiError = extractHttpErrorDetail(response);
            throw new Error(
                `HTTP ${response.Status}${response.StatusText ? ` ${response.StatusText}` : ''}: ${apiError}`,
            );
        }
        return response;
    }

    /** Builds a normalized permission policy object for vendor request payloads. */
    protected buildPermissionPolicyPayload(): CloudJsonObject | undefined {
        if (!this.permissionPolicy) {
            return undefined;
        }
        const payload: CloudJsonObject = {
            posture: this.permissionPolicy.Posture,
        };
        if (this.permissionPolicy.AllowedTools && this.permissionPolicy.AllowedTools.length > 0) {
            payload.allowed_tools = [...this.permissionPolicy.AllowedTools];
        }
        if (this.permissionPolicy.DisallowedTools && this.permissionPolicy.DisallowedTools.length > 0) {
            payload.disallowed_tools = [...this.permissionPolicy.DisallowedTools];
        }
        return payload;
    }

    /** Builds a normalized cloud workspace/repository descriptor when repo or environment fields are present. */
    protected buildWorkspaceContextPayload(): CloudJsonObject | undefined {
        const s = this.runtimeSettings;
        if (!s) {
            return undefined;
        }
        const context: CloudJsonObject = {};
        if (s.EnvironmentId) {
            context.environment_id = s.EnvironmentId;
        }
        if (s.RepositoryUrl) {
            context.repository_url = s.RepositoryUrl;
        }
        if (s.GitRef) {
            context.git_ref = s.GitRef;
        }
        if (s.GitBranch) {
            context.git_branch = s.GitBranch;
        }
        if (s.ProjectId) {
            context.project_id = s.ProjectId;
        }
        if (s.Region) {
            context.region = s.Region;
        }
        context.network_access = s.NetworkAccess;

        const hasMeaningfulField = Boolean(
            s.EnvironmentId || s.RepositoryUrl || s.GitRef || s.GitBranch || s.ProjectId || s.Region,
        );
        return hasMeaningfulField || s.NetworkAccess !== 'restricted' ? context : undefined;
    }

    // ============================================================================
    // Private Internal Lifecycle Helpers
    // ============================================================================

    private consumePendingResumeSnapshot(): CloudNormalizedSnapshot | null {
        const snap = this.resumedSnapshot;
        const wasDetached = this.resumedWasDetached;
        this.resumedSnapshot = null;
        this.resumedWasDetached = false;

        if (!snap) {
            return null;
        }
        // Always attach without re-posting when the remote session is actively running, OR when
        // harvesting a previously detached adaptive-wake turn that finished before wake arrived.
        if (snap.State === 'running' || wasDetached) {
            return snap;
        }
        return null;
    }

    private applySnapshotMetadata(snapshot: CloudNormalizedSnapshot): void {
        this.sessionId = snapshot.SessionId;
        this.lastExecutionState = snapshot.State;
        if (snapshot.Model) {
            this.reportedModel = snapshot.Model;
        }
    }

    private collectUnseenStepEvents(snapshot: CloudNormalizedSnapshot): HarnessTurnEvent[] {
        const fresh: HarnessTurnEvent[] = [];
        for (const item of snapshot.StepEvents) {
            if (this.emittedEventKeys.has(item.Key)) {
                continue;
            }
            this.emittedEventKeys.add(item.Key);
            fresh.push(item.Event);
        }
        return fresh;
    }

    private buildUsageEvent(usage: CloudNormalizedUsage): HarnessTurnEvent {
        return {
            Type: 'usage',
            InputTokens: usage.PromptTokens,
            OutputTokens: usage.CompletionTokens,
            PromptTokens: usage.PromptTokens,
            CompletionTokens: usage.CompletionTokens,
            ThinkingTokens: usage.ThinkingTokens,
            CostUsd: usage.CostUsd,
        };
    }

    private formatCompletedTurnText(snapshot: CloudNormalizedSnapshot): string {
        const baseText = snapshot.OutputText ?? '';
        if (!snapshot.PullRequestUrl && (!snapshot.ArtifactUrls || snapshot.ArtifactUrls.length === 0)) {
            return baseText;
        }
        // If baseText is already a JSON object (Loop envelope), keep it valid JSON while preserving RawText
        const parsedEnvelope = ParseCloudJsonObject(baseText);
        if (parsedEnvelope) {
            return baseText;
        }
        const suffixParts: string[] = [];
        if (snapshot.PullRequestUrl) {
            suffixParts.push(`PR: ${snapshot.PullRequestUrl}`);
        }
        if (snapshot.ArtifactUrls && snapshot.ArtifactUrls.length > 0) {
            suffixParts.push(`Artifacts: ${snapshot.ArtifactUrls.join(', ')}`);
        }
        return [baseText, suffixParts.join(' | ')].filter((s) => s.length > 0).join('\n');
    }

    private buildRuntimeSettings(init: HarnessSessionConfig): ResolvedCloudRuntimeSettings {
        const cloud: CloudSandboxOptions | undefined = init.CloudOptions;
        const meta: CloudSandboxMetadata | undefined = init.SandboxMetadata;

        const envEndpoint =
            nonEmpty(init.Environment[this.EndpointEnvVarName]) ??
            nonEmpty(process.env[this.EndpointEnvVarName]);

        const rawBaseUrl =
            nonEmpty(cloud?.endpointUrl) ??
            nonEmpty(meta?.EndpointUrl) ??
            envEndpoint ??
            this.DefaultEndpointUrl;

        const baseUrl = stripTrailingSlashes(rawBaseUrl);

        const waitMode: CloudWaitMode =
            cloud?.waitMode ?? meta?.WaitMode ?? DEFAULT_CLOUD_WAIT_MODE;

        const turnWaitBudgetMs =
            positiveInt(cloud?.turnWaitBudgetMs) ??
            positiveInt(meta?.TurnWaitBudgetMs) ??
            DEFAULT_CLOUD_TURN_WAIT_BUDGET_MS;

        const pollIntervalMs =
            positiveInt(cloud?.pollIntervalMs) ??
            positiveInt(meta?.PollIntervalMs) ??
            DEFAULT_CLOUD_POLL_INTERVAL_MS;

        const networkAccess: CloudNetworkAccess =
            cloud?.networkAccess ?? meta?.NetworkAccess ?? 'restricted';

        const mcpServerUrl =
            nonEmpty(init.McpServerUrl) ??
            nonEmpty(cloud?.mcpExternalServerUrl) ??
            nonEmpty(meta?.McpExternalServerUrl);

        const extraHeaders: Record<string, string> = {
            ...(meta?.ExtraHeaders ?? {}),
            ...(cloud?.extraHeaders ?? {}),
        };

        return {
            BaseUrl: baseUrl,
            Region: nonEmpty(cloud?.region) ?? nonEmpty(meta?.Region),
            ProjectId: nonEmpty(cloud?.projectId) ?? nonEmpty(meta?.ProjectId),
            EnvironmentId: nonEmpty(cloud?.environmentId) ?? nonEmpty(meta?.EnvironmentId),
            RepositoryUrl: nonEmpty(cloud?.repositoryUrl) ?? nonEmpty(meta?.RepositoryUrl),
            GitRef: nonEmpty(cloud?.gitRef) ?? nonEmpty(meta?.GitRef),
            GitBranch: nonEmpty(cloud?.gitBranch) ?? nonEmpty(meta?.GitBranch),
            NetworkAccess: networkAccess,
            WaitMode: waitMode,
            TurnWaitBudgetMs: turnWaitBudgetMs,
            PollIntervalMs: pollIntervalMs,
            McpServerUrl: mcpServerUrl,
            McpCredential: nonEmpty(init.McpCredential),
            ExtraHeaders: extraHeaders,
        };
    }

    private async safeCancelRemote(sessionId: string): Promise<void> {
        try {
            await this.cancelRemoteSession(sessionId);
        } catch (error) {
            LogError(
                `${this.ProviderDisplayName} failed to cancel remote session '${sessionId}': ${describeCloudError(error)}`,
            );
        }
    }

    private async waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
        if (this.sleepImpl) {
            await this.sleepImpl(ms, signal);
            return;
        }
        if (signal?.aborted) {
            return;
        }
        await new Promise<void>((resolve) => {
            const onAbort = (): void => {
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            if (signal) {
                signal.addEventListener('abort', onAbort, { once: true });
            }
        });
    }
}

function extractHttpErrorDetail(response: CloudHttpResponse): string {
    const json = response.Json;
    if (json) {
        const nestedErr = ReadCloudObject(json, 'error');
        const msg =
            ReadCloudString(nestedErr, 'message') ??
            ReadCloudString(json, 'message') ??
            ReadCloudString(json, 'detail');
        if (msg) {
            return msg;
        }
    }
    const trimmed = response.BodyText.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 1000) : 'empty error body';
}

function describeCloudError(error: Error | string | number | boolean | object | null | undefined): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function nonEmpty(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function positiveInt(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : undefined;
}

function stripTrailingSlashes(url: string): string {
    let end = url.length;
    while (end > 0 && url.charCodeAt(end - 1) === 47) {
        end--;
    }
    return end === url.length ? url : url.slice(0, end);
}
