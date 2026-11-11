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

export const DEFAULT_ANTIGRAVITY_CLOUD_API_URL =
    'https://generativelanguage.googleapis.com/v1beta/interactions';

export const DEFAULT_ANTIGRAVITY_CLOUD_MODEL = 'gemini-3.1-pro-preview';

/**
 * Cloud harness adapter for Google Antigravity Cloud / Gemini Agent Interactions API.
 *
 * Supports `x-goog-api-key` (`GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTIGRAVITY_API_KEY`) and Bearer
 * OAuth authentication, `background: true` async interaction leasing, `agent` / `model` selection,
 * repository/branch context, remote MCP tool declarations, thinking/token telemetry, and
 * `adaptive-wake` async continuation across `AgentWake` cycles.
 */
@RegisterClass(BaseHarnessAdapter, 'AntigravityCloudAdapter')
export class AntigravityCloudAdapter extends BaseCloudHarnessAdapter {
    private configuredAgent: string | undefined;

    public constructor(httpTransport?: ICloudHttpTransport) {
        super(httpTransport);
    }

    protected get DefaultEndpointUrl(): string {
        return DEFAULT_ANTIGRAVITY_CLOUD_API_URL;
    }

    protected get EndpointEnvVarName(): string {
        return 'ANTIGRAVITY_CLOUD_API_URL';
    }

    protected get ProviderDisplayName(): string {
        return 'Google Antigravity Cloud';
    }

    /** Configures an explicit Gemini/Antigravity `agent` identifier instead of a raw model ID. */
    public SetAgent(agentIdentifier: string): void {
        this.configuredAgent = agentIdentifier.trim() || undefined;
    }

    protected resolveAuthHeaders(config: HarnessSessionConfig): Record<string, string> {
        const extra = this.runtimeSettings?.ExtraHeaders ?? {};
        const hasExplicitHeader = Boolean(
            findHeaderCaseInsensitive(extra, 'x-goog-api-key') ||
                findHeaderCaseInsensitive(extra, 'authorization'),
        );
        if (hasExplicitHeader) {
            return {};
        }

        const resolved = ResolveProviderCredentialSecret(
            'antigravity',
            config.Environment,
            process.env,
        );
        if (!resolved) {
            throw new Error(
                'Google Antigravity Cloud requires GEMINI_API_KEY, GOOGLE_API_KEY, ANTIGRAVITY_API_KEY, or ANTIGRAVITY_BEARER_TOKEN.',
            );
        }

        if (resolved.IsBearer) {
            return { Authorization: `Bearer ${resolved.Secret}` };
        }
        return { 'x-goog-api-key': resolved.Secret };
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
        return this.parseInteractionSnapshot(response.Json, sessionId);
    }

    protected async submitTurnRequest(
        input: string,
        _isFirstTurn: boolean,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot> {
        const settings = this.runtimeSettings!;
        const body: CloudJsonObject = {
            background: true,
            input: input,
        };

        const agentOverride =
            this.configuredAgent ??
            this.config?.Environment['ANTIGRAVITY_CLOUD_AGENT']?.trim();
        const modelOrAgent = this.config?.Model?.trim() || DEFAULT_ANTIGRAVITY_CLOUD_MODEL;

        if (agentOverride) {
            body.agent = agentOverride;
            if (this.config?.Model?.trim()) {
                body.model = this.config.Model.trim();
            }
        } else if (modelOrAgent.startsWith('agents/')) {
            body.agent = modelOrAgent;
        } else {
            body.model = modelOrAgent;
        }

        if (this.sessionId) {
            body.previous_interaction_id = this.sessionId;
        }

        if (this.systemPrompt && this.systemPrompt.trim().length > 0) {
            body.system_instruction = this.systemPrompt;
        }

        const workspaceContext = this.buildWorkspaceContextPayload();
        if (workspaceContext) {
            body.workspace = workspaceContext;
        }

        if (settings.McpServerUrl) {
            const mcpEntry: CloudJsonObject = {
                type: 'mcp',
                name: 'mj_mcp',
                server_label: 'mj_mcp',
                url: settings.McpServerUrl,
                server_url: settings.McpServerUrl,
            };
            if (settings.McpCredential) {
                mcpEntry.headers = {
                    Authorization: `Bearer ${settings.McpCredential}`,
                };
            }
            body.tools = [mcpEntry];
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
            throw new Error('Google Antigravity Cloud returned a non-JSON response payload.');
        }

        return this.parseInteractionSnapshot(response.Json, this.sessionId ?? 'agy-interaction');
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
            throw new Error('Google Antigravity Cloud poll returned an empty/non-JSON body.');
        }
        return this.parseInteractionSnapshot(response.Json, sessionId);
    }

    protected async cancelRemoteSession(sessionId: string): Promise<void> {
        const url = `${this.runtimeSettings!.BaseUrl}/${encodeURIComponent(sessionId)}:cancel`;
        await this.sendCheckedRequest({
            Url: url,
            Method: 'POST',
            Headers: this.buildRequestHeaders(true),
            Body: JSON.stringify({}),
        });
    }

    private parseInteractionSnapshot(
        json: CloudJsonObject,
        fallbackSessionId: string,
    ): CloudNormalizedSnapshot {
        const rawId =
            ReadCloudString(json, 'id') ??
            ReadCloudString(json, 'name') ??
            ReadCloudString(json, 'interaction_id') ??
            fallbackSessionId;
        const normalizedId = rawId.startsWith('interactions/')
            ? rawId.slice('interactions/'.length)
            : rawId;

        const rawStatus =
            ReadCloudString(json, 'status') ??
            ReadCloudString(json, 'state') ??
            'completed';
        const state = mapAntigravityState(rawStatus);

        const model =
            ReadCloudString(json, 'model') ??
            ReadCloudString(json, 'agent');

        const stepEvents: CloudNormalizedStepEvent[] = [];
        const textChunks: string[] = [];

        const outputs =
            ReadCloudArray(json, 'outputs') ??
            ReadCloudArray(json, 'events') ??
            ReadCloudArray(json, 'turns');

        if (outputs) {
            outputs.forEach((item, index) => {
                this.collectInteractionOutputItem(item, index, stepEvents, textChunks);
            });
        }

        // Also inspect Gemini `candidates` array when structured in GenerateContent-compatible form
        const candidates = ReadCloudArray(json, 'candidates');
        if (candidates) {
            candidates.forEach((cand, candIdx) => {
                if (!IsCloudJsonObject(cand)) {
                    return;
                }
                const contentObj = ReadCloudObject(cand, 'content');
                const parts = ReadCloudArray(contentObj, 'parts');
                if (!parts) {
                    return;
                }
                parts.forEach((part, partIdx) => {
                    this.collectInteractionOutputItem(
                        part,
                        10_000 + candIdx * 100 + partIdx,
                        stepEvents,
                        textChunks,
                    );
                });
            });
        }

        const directText =
            ReadCloudString(json, 'output_text') ??
            ReadCloudString(json, 'result') ??
            ReadCloudString(json, 'response');
        if (directText && textChunks.length === 0) {
            textChunks.push(directText);
            stepEvents.push({
                Key: `direct-text:${directText.length}`,
                Event: { Type: 'assistant-text', Text: directText },
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
        const artifactUrls = extractStringUrls(ReadCloudArray(json, 'artifacts'));

        return {
            SessionId: normalizedId,
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

    private collectInteractionOutputItem(
        item: CloudJsonValue,
        index: number,
        stepEvents: CloudNormalizedStepEvent[],
        textChunks: string[],
    ): void {
        if (!IsCloudJsonObject(item)) {
            return;
        }

        const itemId = ReadCloudString(item, 'id') ?? `idx-${index}`;
        const itemType = ReadCloudString(item, 'type');
        const isThoughtFlag = ReadCloudBoolean(item, 'thought') === true;

        if (itemType === 'thought' || itemType === 'thinking' || isThoughtFlag) {
            const summary =
                ReadCloudString(item, 'summary') ??
                ReadCloudString(item, 'text') ??
                ReadCloudString(item, 'thought');
            if (summary) {
                stepEvents.push({
                    Key: `thought:${itemId}`,
                    Event: { Type: 'thinking-delta', Text: summary },
                });
            }
            return;
        }

        const fnCall = ReadCloudObject(item, 'functionCall') ?? ReadCloudObject(item, 'function_call');
        if (
            itemType === 'function_call' ||
            itemType === 'tool_call' ||
            itemType === 'mcp_call' ||
            fnCall !== undefined
        ) {
            const source = fnCall ?? item;
            const callId =
                ReadCloudString(source, 'id') ??
                ReadCloudString(item, 'call_id') ??
                itemId;
            const name =
                ReadCloudString(source, 'name') ??
                ReadCloudString(source, 'tool_name') ??
                'tool_call';
            const argsObj = ReadCloudObject(source, 'args') ?? ReadCloudObject(source, 'arguments');
            const argsStr =
                ReadCloudString(source, 'arguments') ??
                (argsObj ? JSON.stringify(argsObj) : undefined);
            stepEvents.push({
                Key: `tool-start:${callId}`,
                Event: {
                    Type: 'tool-use-start',
                    ToolCallId: callId,
                    ToolName: name,
                    ArgumentsJson: argsStr,
                },
            });
            return;
        }

        const fnResp =
            ReadCloudObject(item, 'functionResponse') ?? ReadCloudObject(item, 'function_response');
        if (
            itemType === 'function_result' ||
            itemType === 'tool_result' ||
            itemType === 'mcp_result' ||
            fnResp !== undefined
        ) {
            const source = fnResp ?? item;
            const callId =
                ReadCloudString(source, 'call_id') ??
                ReadCloudString(source, 'id') ??
                itemId;
            const name = ReadCloudString(source, 'name');
            const outputVal =
                ReadCloudString(source, 'output') ??
                ReadCloudString(source, 'result') ??
                (ReadCloudObject(source, 'response')
                    ? JSON.stringify(ReadCloudObject(source, 'response'))
                    : '');
            stepEvents.push({
                Key: `tool-result:${callId}`,
                Event: {
                    Type: 'tool-result',
                    ToolCallId: callId,
                    ToolName: name,
                    Output: outputVal ?? '',
                    IsError: ReadCloudBoolean(source, 'is_error') === true,
                },
            });
            return;
        }

        const text = ReadCloudString(item, 'text') ?? ReadCloudString(item, 'content');
        if (text) {
            textChunks.push(text);
            stepEvents.push({
                Key: `text:${itemId}`,
                Event: { Type: 'assistant-text', Text: text },
            });
        }
    }

    private extractUsage(json: CloudJsonObject): CloudNormalizedUsage | undefined {
        const usageObj =
            ReadCloudObject(json, 'usage') ??
            ReadCloudObject(json, 'usage_metadata') ??
            ReadCloudObject(json, 'usageMetadata');
        if (!usageObj) {
            return undefined;
        }

        const promptTokens =
            ReadCloudNumber(usageObj, 'prompt_token_count') ??
            ReadCloudNumber(usageObj, 'promptTokenCount') ??
            ReadCloudNumber(usageObj, 'input_tokens') ??
            0;
        const completionTokens =
            ReadCloudNumber(usageObj, 'candidates_token_count') ??
            ReadCloudNumber(usageObj, 'candidatesTokenCount') ??
            ReadCloudNumber(usageObj, 'output_tokens') ??
            0;
        const thinkingTokens =
            ReadCloudNumber(usageObj, 'thoughts_token_count') ??
            ReadCloudNumber(usageObj, 'thoughtsTokenCount') ??
            ReadCloudNumber(usageObj, 'thinking_tokens');
        const costUsd =
            ReadCloudNumber(usageObj, 'cost_usd') ??
            ReadCloudNumber(json, 'cost_usd') ??
            ReadCloudNumber(json, 'total_cost_usd');

        return {
            PromptTokens: promptTokens,
            CompletionTokens: completionTokens,
            ThinkingTokens: thinkingTokens,
            CostUsd: costUsd,
        };
    }
}

function mapAntigravityState(status: string): CloudExecutionState {
    switch (status.trim().toLowerCase()) {
        case 'in_progress':
        case 'running':
        case 'queued':
        case 'pending':
        case 'processing':
            return 'running';
        case 'completed':
        case 'succeeded':
        case 'done':
            return 'completed';
        case 'cancelled':
        case 'canceled':
            return 'cancelled';
        case 'failed':
        case 'error':
        default:
            return 'failed';
    }
}

function extractStringUrls(items: CloudJsonValue[] | undefined): string[] | undefined {
    if (!items || items.length === 0) {
        return undefined;
    }
    const urls: string[] = [];
    for (const item of items) {
        if (typeof item === 'string' && item.trim().length > 0) {
            urls.push(item.trim());
        } else if (IsCloudJsonObject(item)) {
            const url = ReadCloudString(item, 'url') ?? ReadCloudString(item, 'uri');
            if (url) {
                urls.push(url);
            }
        }
    }
    return urls.length > 0 ? urls : undefined;
}

function findHeaderCaseInsensitive(
    headers: Record<string, string>,
    targetLower: string,
): string | undefined {
    for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === targetLower && val.trim().length > 0) {
            return val;
        }
    }
    return undefined;
}
