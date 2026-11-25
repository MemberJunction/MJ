import { RegisterClass } from '@memberjunction/global';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import {
    BaseCloudHarnessAdapter,
    CloudJsonObject,
    CloudJsonValue,
    CloudNormalizedSnapshot,
    CloudNormalizedStepEvent,
    CloudNormalizedUsage,
    ICloudHttpTransport,
    IsCloudJsonObject,
    ReadCloudArray,
    ReadCloudBoolean,
    ReadCloudNumber,
    ReadCloudObject,
    ReadCloudString,
} from './BaseCloudHarnessAdapter.js';
import { ResolveProviderCredentialSecret } from '../HarnessCredentialResolver.js';
import { CloudExecutionState, HarnessSessionConfig } from '../types.js';

export const DEFAULT_CLAUDE_CLOUD_API_URL = 'https://api.anthropic.com/v1/sessions';
export const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_ANTHROPIC_CLOUD_BETA = 'managed-agents-2025-05-01,mcp-client-2025-04-04';
export const DEFAULT_CLAUDE_CLOUD_MODEL = 'claude-sonnet-5';

/**
 * Cloud harness adapter for Anthropic Claude Cloud Sessions / Managed Remote Environments.
 *
 * Supports `x-api-key` (`ANTHROPIC_API_KEY`), `anthropic-version: '2023-06-01'`, `anthropic-beta`
 * headers, environment/repository/gitRef mounts, remote MCP server registration, usage/cost
 * accounting, and `adaptive-wake` async session continuation across `AgentWake` cycles.
 */
@RegisterClass(BaseHarnessAdapter, 'ClaudeCodeCloudAdapter')
export class ClaudeCodeCloudAdapter extends BaseCloudHarnessAdapter {
    private betaHeaderOverride: string | undefined;

    public constructor(httpTransport?: ICloudHttpTransport) {
        super(httpTransport);
    }

    protected get DefaultEndpointUrl(): string {
        return DEFAULT_CLAUDE_CLOUD_API_URL;
    }

    protected get EndpointEnvVarName(): string {
        return 'CLAUDE_CLOUD_API_URL';
    }

    protected get ProviderDisplayName(): string {
        return 'Claude Code Cloud';
    }

    /** Overrides the `anthropic-beta` header sent on Claude Cloud session requests. */
    public SetBetaHeader(betaValue: string): void {
        this.betaHeaderOverride = betaValue.trim() || undefined;
    }

    protected resolveAuthHeaders(config: HarnessSessionConfig): Record<string, string> {
        const extra = this.runtimeSettings?.ExtraHeaders ?? {};
        const headers: Record<string, string> = {};

        if (!hasHeaderCaseInsensitive(extra, 'anthropic-version')) {
            headers['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
        }

        if (!hasHeaderCaseInsensitive(extra, 'anthropic-beta')) {
            const envBeta = config.Environment['ANTHROPIC_BETA']?.trim();
            headers['anthropic-beta'] =
                this.betaHeaderOverride ?? envBeta ?? DEFAULT_ANTHROPIC_CLOUD_BETA;
        }

        const hasExplicitAuth =
            hasHeaderCaseInsensitive(extra, 'x-api-key') ||
            hasHeaderCaseInsensitive(extra, 'authorization');
        if (hasExplicitAuth) {
            return headers;
        }

        const resolved = ResolveProviderCredentialSecret(
            'anthropic',
            config.Environment,
            process.env,
        );
        if (!resolved) {
            throw new Error(
                'Claude Code Cloud requires ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN).',
            );
        }

        if (resolved.IsBearer) {
            headers['Authorization'] = `Bearer ${resolved.Secret}`;
        } else {
            headers['x-api-key'] = resolved.Secret;
        }
        return headers;
    }

    protected override async onStartNewSession(signal?: AbortSignal): Promise<void> {
        const created = await this.createRemoteSession(signal);
        this.sessionId = created.SessionId;
        this.lastExecutionState = created.State;
        if (created.Model) {
            this.reportedModel = created.Model;
        }
    }

    protected async inspectRemoteSession(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot | null> {
        const url = `${this.runtimeSettings!.BaseUrl}/${encodeURIComponent(sessionId)}`;
        const response = await this.sendCheckedRequest(
            {
                Url: url,
                Method: 'GET',
                Headers: this.buildRequestHeaders(false),
                Signal: signal,
            },
            { allow404: true },
        );
        if (response.Status === 404 || !response.Json) {
            return null;
        }
        return this.parseSessionSnapshot(response.Json, sessionId);
    }

    protected async submitTurnRequest(
        input: string,
        _isFirstTurn: boolean,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot> {
        if (!this.sessionId) {
            const created = await this.createRemoteSession(signal);
            this.sessionId = created.SessionId;
        }

        const settings = this.runtimeSettings!;
        const turnUrl = `${settings.BaseUrl}/${encodeURIComponent(this.sessionId)}/turns`;
        const body: CloudJsonObject = {
            input: input,
            model: this.config?.Model?.trim() || DEFAULT_CLAUDE_CLOUD_MODEL,
        };

        if (this.systemPrompt && this.systemPrompt.trim().length > 0) {
            body.system = this.systemPrompt;
        }

        const mcpServers = this.buildAnthropicMcpServers();
        if (mcpServers) {
            body.mcp_servers = mcpServers;
        }

        const policyPayload = this.buildPermissionPolicyPayload();
        if (policyPayload) {
            body.permission_policy = policyPayload;
        }

        const response = await this.sendCheckedRequest({
            Url: turnUrl,
            Method: 'POST',
            Headers: this.buildRequestHeaders(true),
            Body: JSON.stringify(body),
            Signal: signal,
        });

        if (!response.Json) {
            throw new Error('Claude Code Cloud turn submission returned a non-JSON response body.');
        }

        return this.parseSessionSnapshot(response.Json, this.sessionId);
    }

    protected async pollRemoteSession(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot> {
        const url = `${this.runtimeSettings!.BaseUrl}/${encodeURIComponent(sessionId)}`;
        const response = await this.sendCheckedRequest({
            Url: url,
            Method: 'GET',
            Headers: this.buildRequestHeaders(false),
            Signal: signal,
        });
        if (!response.Json) {
            throw new Error('Claude Code Cloud poll returned a non-JSON response body.');
        }
        return this.parseSessionSnapshot(response.Json, sessionId);
    }

    protected async cancelRemoteSession(sessionId: string): Promise<void> {
        const url = `${this.runtimeSettings!.BaseUrl}/${encodeURIComponent(sessionId)}/cancel`;
        await this.sendCheckedRequest({
            Url: url,
            Method: 'POST',
            Headers: this.buildRequestHeaders(true),
            Body: JSON.stringify({}),
        });
    }

    private async createRemoteSession(signal?: AbortSignal): Promise<CloudNormalizedSnapshot> {
        const settings = this.runtimeSettings!;
        const body: CloudJsonObject = {
            model: this.config?.Model?.trim() || DEFAULT_CLAUDE_CLOUD_MODEL,
            network_access: settings.NetworkAccess,
        };

        if (settings.EnvironmentId) {
            body.environment_id = settings.EnvironmentId;
        }

        if (settings.RepositoryUrl || settings.GitRef || settings.GitBranch) {
            const repoMount: CloudJsonObject = {};
            if (settings.RepositoryUrl) {
                repoMount.url = settings.RepositoryUrl;
            }
            if (settings.GitRef) {
                repoMount.git_ref = settings.GitRef;
            }
            if (settings.GitBranch) {
                repoMount.git_branch = settings.GitBranch;
            }
            body.repository = repoMount;
        }

        if (this.systemPrompt && this.systemPrompt.trim().length > 0) {
            body.system = this.systemPrompt;
        }

        const mcpServers = this.buildAnthropicMcpServers();
        if (mcpServers) {
            body.mcp_servers = mcpServers;
        }

        const policyPayload = this.buildPermissionPolicyPayload();
        if (policyPayload) {
            body.permission_policy = policyPayload;
        }

        const response = await this.sendCheckedRequest({
            Url: settings.BaseUrl,
            Method: 'POST',
            Headers: this.buildRequestHeaders(true),
            Body: JSON.stringify(body),
            Signal: signal,
        });

        if (!response.Json) {
            throw new Error('Claude Code Cloud session creation returned a non-JSON response body.');
        }

        return this.parseSessionSnapshot(response.Json, 'claude-session');
    }

    private buildAnthropicMcpServers(): CloudJsonValue[] | undefined {
        const s = this.runtimeSettings;
        if (!s?.McpServerUrl) {
            return undefined;
        }
        const server: CloudJsonObject = {
            type: 'url',
            name: 'mj_mcp',
            url: s.McpServerUrl,
        };
        if (s.McpCredential) {
            server.authorization_token = s.McpCredential;
        }
        return [server];
    }

    private parseSessionSnapshot(
        json: CloudJsonObject,
        fallbackSessionId: string,
    ): CloudNormalizedSnapshot {
        const sessionId =
            ReadCloudString(json, 'session_id') ??
            ReadCloudString(json, 'id') ??
            fallbackSessionId;

        const rawStatus =
            ReadCloudString(json, 'status') ??
            ReadCloudString(json, 'state') ??
            'completed';
        const state = mapClaudeSessionState(rawStatus);

        const model = ReadCloudString(json, 'model');
        const stepEvents: CloudNormalizedStepEvent[] = [];
        const textChunks: string[] = [];

        const contentBlocks =
            ReadCloudArray(json, 'content') ??
            ReadCloudArray(json, 'events') ??
            ReadCloudArray(json, 'messages');

        if (contentBlocks) {
            contentBlocks.forEach((item, index) => {
                this.collectClaudeBlock(item, index, stepEvents, textChunks);
            });
        }

        const directResult =
            ReadCloudString(json, 'result') ??
            ReadCloudString(json, 'output_text');
        if (directResult && textChunks.length === 0) {
            textChunks.push(directResult);
            stepEvents.push({
                Key: `result-text:${directResult.length}`,
                Event: { Type: 'assistant-text', Text: directResult },
            });
        }

        const usage = this.extractUsage(json);
        const errorObj = ReadCloudObject(json, 'error');
        const errorMessage =
            ReadCloudString(errorObj, 'message') ??
            (typeof json.error === 'string' ? json.error : undefined);

        const pullRequestUrl =
            ReadCloudString(json, 'pull_request_url') ??
            ReadCloudString(ReadCloudObject(json, 'metadata'), 'pull_request_url');
        const artifactUrls = extractArtifactUrls(ReadCloudArray(json, 'artifacts'));

        return {
            SessionId: sessionId,
            State: state,
            Model: model,
            OutputText: textChunks.join(''),
            ErrorMessage: errorMessage,
            StepEvents: stepEvents,
            Usage: usage,
            PullRequestUrl: pullRequestUrl,
            ArtifactUrls: artifactUrls,
        };
    }

    private collectClaudeBlock(
        item: CloudJsonValue,
        index: number,
        stepEvents: CloudNormalizedStepEvent[],
        textChunks: string[],
    ): void {
        if (!IsCloudJsonObject(item)) {
            return;
        }

        const itemId = ReadCloudString(item, 'id') ?? `blk-${index}`;
        const blockType = ReadCloudString(item, 'type');

        // Unwrap nested assistant message `{ role: 'assistant', content: [...] }` if present
        if (blockType === 'assistant' || ReadCloudString(item, 'role') === 'assistant') {
            const nestedContent = ReadCloudArray(item, 'content');
            if (nestedContent) {
                nestedContent.forEach((nested, subIdx) => {
                    this.collectClaudeBlock(nested, index * 100 + subIdx, stepEvents, textChunks);
                });
                return;
            }
        }

        if (blockType === 'thinking') {
            const thinking =
                ReadCloudString(item, 'thinking') ?? ReadCloudString(item, 'text');
            if (thinking) {
                stepEvents.push({
                    Key: `thinking:${itemId}`,
                    Event: { Type: 'thinking-delta', Text: thinking },
                });
            }
            return;
        }

        if (blockType === 'tool_use' || blockType === 'mcp_tool_use' || blockType === 'server_tool_use') {
            const name = ReadCloudString(item, 'name') ?? 'tool_use';
            const inputObj = ReadCloudObject(item, 'input');
            stepEvents.push({
                Key: `tool-use:${itemId}`,
                Event: {
                    Type: 'tool-use-start',
                    ToolCallId: itemId,
                    ToolName: name,
                    ArgumentsJson: inputObj ? JSON.stringify(inputObj) : undefined,
                },
            });
            return;
        }

        if (blockType === 'tool_result' || blockType === 'mcp_tool_result') {
            const toolUseId = ReadCloudString(item, 'tool_use_id') ?? itemId;
            const output =
                ReadCloudString(item, 'content') ??
                ReadCloudString(item, 'output') ??
                '';
            stepEvents.push({
                Key: `tool-result:${toolUseId}`,
                Event: {
                    Type: 'tool-result',
                    ToolCallId: toolUseId,
                    ToolName: ReadCloudString(item, 'name'),
                    Output: output,
                    IsError: ReadCloudBoolean(item, 'is_error') === true,
                },
            });
            return;
        }

        if (blockType === 'text' || blockType === 'text_delta' || blockType === undefined) {
            const text = ReadCloudString(item, 'text');
            if (text) {
                textChunks.push(text);
                stepEvents.push({
                    Key: `text:${itemId}`,
                    Event: { Type: 'assistant-text', Text: text },
                });
            }
        }
    }

    private extractUsage(json: CloudJsonObject): CloudNormalizedUsage | undefined {
        const usageObj = ReadCloudObject(json, 'usage');
        if (!usageObj) {
            return undefined;
        }

        const inputTokens = ReadCloudNumber(usageObj, 'input_tokens') ?? 0;
        const outputTokens = ReadCloudNumber(usageObj, 'output_tokens') ?? 0;
        const thinkingTokens = ReadCloudNumber(usageObj, 'thinking_tokens');
        const costUsd =
            ReadCloudNumber(json, 'total_cost_usd') ??
            ReadCloudNumber(json, 'cost_usd') ??
            ReadCloudNumber(usageObj, 'cost_usd');

        return {
            PromptTokens: inputTokens,
            CompletionTokens: outputTokens,
            ThinkingTokens: thinkingTokens,
            CostUsd: costUsd,
        };
    }
}

function mapClaudeSessionState(status: string): CloudExecutionState {
    switch (status.trim().toLowerCase()) {
        case 'running':
        case 'in_progress':
        case 'queued':
        case 'starting':
        case 'requires_action':
            return 'running';
        case 'completed':
        case 'idle':
        case 'succeeded':
        case 'end_turn':
            return 'completed';
        case 'cancelled':
        case 'canceled':
            return 'cancelled';
        case 'failed':
        case 'error':
        case 'errored':
        default:
            return 'failed';
    }
}

function extractArtifactUrls(items: CloudJsonValue[] | undefined): string[] | undefined {
    if (!items || items.length === 0) {
        return undefined;
    }
    const urls: string[] = [];
    for (const item of items) {
        if (typeof item === 'string' && item.trim().length > 0) {
            urls.push(item.trim());
        } else if (IsCloudJsonObject(item)) {
            const url = ReadCloudString(item, 'url') ?? ReadCloudString(item, 'download_url');
            if (url) {
                urls.push(url);
            }
        }
    }
    return urls.length > 0 ? urls : undefined;
}

function hasHeaderCaseInsensitive(headers: Record<string, string>, targetLower: string): boolean {
    return Object.keys(headers).some((k) => k.toLowerCase() === targetLower);
}
