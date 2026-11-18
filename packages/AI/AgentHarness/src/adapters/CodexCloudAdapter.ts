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

export const DEFAULT_CODEX_CLOUD_API_URL = 'https://api.openai.com/v1/responses';
export const DEFAULT_CODEX_CLOUD_MODEL = 'o3';

/**
 * Cloud harness adapter for OpenAI Codex Cloud / Background Responses API.
 *
 * Supports `Authorization: Bearer <OPENAI_API_KEY>`, `background: true` async execution,
 * `previous_response_id` session chaining & resume, repository/environment context, remote MCP tool
 * declarations, reasoning token telemetry, and `adaptive-wake` async continuation.
 */
@RegisterClass(BaseHarnessAdapter, 'CodexCloudAdapter')
export class CodexCloudAdapter extends BaseCloudHarnessAdapter {
    private defaultModel = DEFAULT_CODEX_CLOUD_MODEL;

    public constructor(httpTransport?: ICloudHttpTransport) {
        super(httpTransport);
    }

    protected get DefaultEndpointUrl(): string {
        return DEFAULT_CODEX_CLOUD_API_URL;
    }

    protected get EndpointEnvVarName(): string {
        return 'CODEX_CLOUD_API_URL';
    }

    protected get ProviderDisplayName(): string {
        return 'OpenAI Codex Cloud';
    }

    /** Overrides the fallback model used when `HarnessSessionConfig.Model` is unset. */
    public SetDefaultModel(model: string): void {
        if (model.trim().length > 0) {
            this.defaultModel = model.trim();
        }
    }

    protected resolveAuthHeaders(config: HarnessSessionConfig): Record<string, string> {
        const extra = this.runtimeSettings?.ExtraHeaders ?? {};
        const hasAuthHeader = Object.keys(extra).some(
            (key) => key.toLowerCase() === 'authorization' && extra[key].trim().length > 0,
        );
        if (hasAuthHeader) {
            return {};
        }

        const resolved = ResolveProviderCredentialSecret(
            'openai',
            config.Environment,
            process.env,
        );
        if (!resolved) {
            throw new Error('OpenAI Codex Cloud requires OPENAI_API_KEY (or CODEX_API_KEY).');
        }

        return {
            Authorization: `Bearer ${resolved.Secret}`,
        };
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
        return this.parseResponseSnapshot(response.Json, sessionId);
    }

    protected async submitTurnRequest(
        input: string,
        _isFirstTurn: boolean,
        signal?: AbortSignal,
    ): Promise<CloudNormalizedSnapshot> {
        const settings = this.runtimeSettings!;
        const body: CloudJsonObject = {
            model: this.config?.Model?.trim() || this.defaultModel,
            background: true,
            store: true,
            input: input,
        };

        if (this.systemPrompt && this.systemPrompt.trim().length > 0) {
            body.instructions = this.systemPrompt;
        }

        if (this.sessionId) {
            body.previous_response_id = this.sessionId;
        }

        const workspaceContext = this.buildWorkspaceContextPayload();
        if (workspaceContext) {
            body.environment = workspaceContext;
        }

        if (settings.McpServerUrl) {
            const mcpTool: CloudJsonObject = {
                type: 'mcp',
                server_label: 'mj_mcp',
                server_url: settings.McpServerUrl,
                require_approval: 'never',
            };
            if (settings.McpCredential) {
                mcpTool.headers = {
                    Authorization: `Bearer ${settings.McpCredential}`,
                };
            }
            body.tools = [mcpTool];
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
            throw new Error('OpenAI Codex Cloud returned a non-JSON response payload.');
        }

        return this.parseResponseSnapshot(response.Json, this.sessionId ?? 'codex-response');
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
            throw new Error('OpenAI Codex Cloud poll returned an empty/non-JSON body.');
        }
        return this.parseResponseSnapshot(response.Json, sessionId);
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

    private parseResponseSnapshot(
        json: CloudJsonObject,
        fallbackSessionId: string,
    ): CloudNormalizedSnapshot {
        const responseId =
            ReadCloudString(json, 'id') ??
            ReadCloudString(json, 'session_id') ??
            fallbackSessionId;

        const rawStatus = ReadCloudString(json, 'status') ?? 'completed';
        const state = mapOpenAiResponseState(rawStatus);
        const model = ReadCloudString(json, 'model');

        const stepEvents: CloudNormalizedStepEvent[] = [];
        const textChunks: string[] = [];

        const outputArray = ReadCloudArray(json, 'output');
        if (outputArray) {
            outputArray.forEach((item, index) => {
                this.collectResponseOutputItem(item, index, stepEvents, textChunks);
            });
        }

        const topLevelText = ReadCloudString(json, 'output_text');
        if (topLevelText && textChunks.length === 0) {
            textChunks.push(topLevelText);
            stepEvents.push({
                Key: `output-text:${topLevelText.length}`,
                Event: { Type: 'assistant-text', Text: topLevelText },
            });
        }

        const usage = this.extractUsage(json);
        const errorObj = ReadCloudObject(json, 'error') ?? ReadCloudObject(json, 'incomplete_details');
        const errorMessage =
            ReadCloudString(errorObj, 'message') ??
            ReadCloudString(errorObj, 'reason') ??
            (typeof json.error === 'string' ? json.error : undefined);

        const metadataObj = ReadCloudObject(json, 'metadata');
        const pullRequestUrl =
            ReadCloudString(json, 'pull_request_url') ??
            ReadCloudString(metadataObj, 'pull_request_url');
        const artifactUrls = extractCodexArtifacts(ReadCloudArray(json, 'artifacts'));

        return {
            SessionId: responseId,
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

    private collectResponseOutputItem(
        item: CloudJsonValue,
        index: number,
        stepEvents: CloudNormalizedStepEvent[],
        textChunks: string[],
    ): void {
        if (!IsCloudJsonObject(item)) {
            return;
        }

        const itemId = ReadCloudString(item, 'id') ?? `out-${index}`;
        const itemType = ReadCloudString(item, 'type');

        if (itemType === 'reasoning') {
            const summaryArr = ReadCloudArray(item, 'summary');
            if (summaryArr) {
                summaryArr.forEach((entry, sIdx) => {
                    if (IsCloudJsonObject(entry)) {
                        const txt = ReadCloudString(entry, 'text');
                        if (txt) {
                            stepEvents.push({
                                Key: `reasoning:${itemId}:${sIdx}`,
                                Event: { Type: 'thinking-delta', Text: txt },
                            });
                        }
                    } else if (typeof entry === 'string' && entry.length > 0) {
                        stepEvents.push({
                            Key: `reasoning:${itemId}:${sIdx}`,
                            Event: { Type: 'thinking-delta', Text: entry },
                        });
                    }
                });
            } else {
                const directSummary = ReadCloudString(item, 'text');
                if (directSummary) {
                    stepEvents.push({
                        Key: `reasoning:${itemId}`,
                        Event: { Type: 'thinking-delta', Text: directSummary },
                    });
                }
            }
            return;
        }

        if (
            itemType === 'function_call' ||
            itemType === 'mcp_call' ||
            itemType === 'custom_tool_call' ||
            itemType === 'shell_call'
        ) {
            const callId = ReadCloudString(item, 'call_id') ?? itemId;
            const toolName =
                ReadCloudString(item, 'name') ??
                ReadCloudString(item, 'command') ??
                itemType;
            const argsJson =
                ReadCloudString(item, 'arguments') ??
                (ReadCloudObject(item, 'action')
                    ? JSON.stringify(ReadCloudObject(item, 'action'))
                    : undefined);
            stepEvents.push({
                Key: `call:${callId}`,
                Event: {
                    Type: 'tool-use-start',
                    ToolCallId: callId,
                    ToolName: toolName,
                    ArgumentsJson: argsJson,
                },
            });
            // `mcp_call` on OpenAI Responses may carry inline `output` once completed
            const inlineMcpOutput = ReadCloudString(item, 'output');
            if (inlineMcpOutput !== undefined) {
                stepEvents.push({
                    Key: `call-out:${callId}`,
                    Event: {
                        Type: 'tool-result',
                        ToolCallId: callId,
                        ToolName: toolName,
                        Output: inlineMcpOutput,
                        IsError: Boolean(ReadCloudString(item, 'error')),
                    },
                });
            }
            return;
        }

        if (
            itemType === 'function_call_output' ||
            itemType === 'mcp_call_output' ||
            itemType === 'shell_call_output'
        ) {
            const callId = ReadCloudString(item, 'call_id') ?? itemId;
            const output = ReadCloudString(item, 'output') ?? '';
            stepEvents.push({
                Key: `out:${callId}`,
                Event: {
                    Type: 'tool-result',
                    ToolCallId: callId,
                    ToolName: ReadCloudString(item, 'name'),
                    Output: output,
                    IsError: ReadCloudBoolean(item, 'is_error') === true,
                },
            });
            return;
        }

        if (itemType === 'message') {
            const contentArr = ReadCloudArray(item, 'content');
            if (contentArr) {
                contentArr.forEach((part, pIdx) => {
                    if (!IsCloudJsonObject(part)) {
                        return;
                    }
                    const partType = ReadCloudString(part, 'type');
                    if (partType === 'output_text' || partType === 'text' || partType === undefined) {
                        const txt = ReadCloudString(part, 'text');
                        if (txt) {
                            textChunks.push(txt);
                            stepEvents.push({
                                Key: `msg:${itemId}:${pIdx}`,
                                Event: { Type: 'assistant-text', Text: txt },
                            });
                        }
                    }
                });
            }
            return;
        }

        const fallbackText = ReadCloudString(item, 'text');
        if (fallbackText) {
            textChunks.push(fallbackText);
            stepEvents.push({
                Key: `txt:${itemId}`,
                Event: { Type: 'assistant-text', Text: fallbackText },
            });
        }
    }

    private extractUsage(json: CloudJsonObject): CloudNormalizedUsage | undefined {
        const usageObj = ReadCloudObject(json, 'usage');
        if (!usageObj) {
            return undefined;
        }

        const inputTokens = ReadCloudNumber(usageObj, 'input_tokens') ?? 0;
        const outputTokens = ReadCloudNumber(usageObj, 'output_tokens') ?? 0;
        const detailsObj = ReadCloudObject(usageObj, 'output_tokens_details');
        const reasoningTokens =
            ReadCloudNumber(detailsObj, 'reasoning_tokens') ??
            ReadCloudNumber(usageObj, 'reasoning_tokens');
        const costUsd =
            ReadCloudNumber(usageObj, 'cost_usd') ??
            ReadCloudNumber(json, 'cost_usd') ??
            ReadCloudNumber(json, 'total_cost_usd');

        return {
            PromptTokens: inputTokens,
            CompletionTokens: outputTokens,
            ThinkingTokens: reasoningTokens,
            CostUsd: costUsd,
        };
    }
}

function mapOpenAiResponseState(status: string): CloudExecutionState {
    switch (status.trim().toLowerCase()) {
        case 'queued':
        case 'in_progress':
        case 'running':
            return 'running';
        case 'completed':
            return 'completed';
        case 'cancelled':
        case 'canceled':
            return 'cancelled';
        case 'failed':
        case 'incomplete':
        default:
            return 'failed';
    }
}

function extractCodexArtifacts(items: CloudJsonValue[] | undefined): string[] | undefined {
    if (!items || items.length === 0) {
        return undefined;
    }
    const urls: string[] = [];
    for (const item of items) {
        if (typeof item === 'string' && item.trim().length > 0) {
            urls.push(item.trim());
        } else if (IsCloudJsonObject(item)) {
            const url = ReadCloudString(item, 'url');
            if (url) {
                urls.push(url);
            }
        }
    }
    return urls.length > 0 ? urls : undefined;
}
