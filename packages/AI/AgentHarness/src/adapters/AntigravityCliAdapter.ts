import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { NormalizeAntigravityEnvironment } from '../HarnessCredentialResolver.js';
import { HarnessCapabilities, HarnessPermissionPolicy, HarnessTurnEvent } from '../types.js';
import { HarnessProcess } from '../sandbox/SandboxExecutor.js';

export type AntigravityReasoningEffort = 'low' | 'medium' | 'high';

/**
 * Drives Google Antigravity through its headless CLI (`agy -p <prompt> --output-format stream-json`).
 *
 * Verified against the installed `agy` CLI surface:
 * - `-p` / `--print` runs a single prompt non-interactively
 * - `--output-format stream-json` emits structured NDJSON events
 * - `--conversation <id>` resumes a previous conversation by ID
 * - `--add-dir <dir>` scopes the workspace directory alongside `WorkingDirectory`
 * - `--model <id>`, `--agent <name>`, `--effort <low|medium|high>` select runtime behavior
 * - `--mode <accept-edits|plan>`, `--sandbox`, `--dangerously-skip-permissions` enforce MJ posture
 */
@RegisterClass(BaseHarnessAdapter, 'AntigravityCliAdapter')
export class AntigravityCliAdapter extends BaseCliHarnessAdapter {
    private executable = 'agy';
    private systemPrompt: string | undefined;
    private didResume = false;
    private permissionArgs: string[] = [];
    private agentName: string | undefined;
    private effort: AntigravityReasoningEffort | undefined;
    private reportedModel: string | undefined;
    private pendingTerminal: HarnessTurnEvent | null = null;

    protected get ExecutablePath(): string {
        return this.executable;
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
            SupportsCloudExecution: false,
            SupportsAsyncWakeHandoff: false,
        };
    }

    /** @inheritdoc */
    public override get DidResumeSession(): boolean {
        return this.didResume;
    }

    /** @inheritdoc */
    public override get ReportedModel(): string | undefined {
        return this.reportedModel;
    }

    /** @inheritdoc */
    public override SetSystemPrompt(systemPrompt: string): void {
        this.systemPrompt = systemPrompt;
    }

    /** Configures an explicit `--agent <name>` flag for the `agy` CLI session. */
    public SetAgent(agentName: string): void {
        this.agentName = agentName.trim() || undefined;
    }

    /** Configures reasoning effort (`--effort low|medium|high`) for the `agy` CLI session. */
    public SetEffort(effort: AntigravityReasoningEffort): void {
        this.effort = effort;
    }

    /** Points the adapter at a specific binary, from `AIAgentHarness.ExecutablePath`. */
    public SetExecutable(path: string): void {
        this.executable = path;
    }

    /**
     * Translates MJ's posture into verified `agy` CLI execution flags:
     * - `strict`: `--mode plan --sandbox` (non-mutating plan mode + OS terminal restrictions)
     * - `auto`: `--mode accept-edits --sandbox` (workspace edits allowed + OS terminal sandbox)
     * - `dangerous`: `--dangerously-skip-permissions` (for isolated container sandboxes)
     */
    public override ApplyPermissionPolicy(policy: HarnessPermissionPolicy): void {
        const args: string[] = [];
        switch (policy.Posture) {
            case 'dangerous':
                args.push('--dangerously-skip-permissions');
                break;
            case 'auto':
                args.push('--mode', 'accept-edits', '--sandbox');
                break;
            case 'strict':
            default:
                args.push('--mode', 'plan', '--sandbox');
                break;
        }
        this.permissionArgs = args;
    }

    /**
     * Injects normalized `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `ANTIGRAVITY_API_KEY` environment
     * conventions before delegating to the sandbox executor.
     */
    protected override startTurnProcess(input: string, isFirstTurn: boolean): HarnessProcess {
        const config = this.config!;
        const normalizedEnv: Record<string, string> = { ...config.Environment };
        NormalizeAntigravityEnvironment(normalizedEnv);

        return config.Executor.Run({
            Command: this.ExecutablePath,
            Args: this.BuildTurnArgs(input, isFirstTurn),
            Environment: normalizedEnv,
            WorkingDirectory: config.WorkspacePath,
            CancellationToken: config.CancellationToken,
        });
    }

    protected BuildTurnArgs(input: string, isFirstTurn: boolean): string[] {
        if (isFirstTurn && this.config?.ResumeSessionId) {
            this.sessionId = this.config.ResumeSessionId;
            this.didResume = true;
        }

        const effectivePrompt =
            isFirstTurn && this.systemPrompt && !input.includes(this.systemPrompt)
                ? `<system_instructions>\n${this.systemPrompt}\n</system_instructions>\n\n${input}`
                : input;

        const args: string[] = ['-p', effectivePrompt, '--output-format', 'stream-json'];

        if (this.config?.WorkspacePath && !this.config.WorkspacePath.startsWith('cloud://')) {
            args.push('--add-dir', this.config.WorkspacePath);
        }

        if (this.sessionId && (!isFirstTurn || this.didResume)) {
            args.push('--conversation', this.sessionId);
        }

        if (this.config?.Model) {
            args.push('--model', this.config.Model);
        }

        const configuredAgent =
            this.agentName ?? this.config?.Environment['ANTIGRAVITY_CLI_AGENT']?.trim();
        if (configuredAgent) {
            args.push('--agent', configuredAgent);
        }

        if (this.effort) {
            args.push('--effort', this.effort);
        }

        args.push(...this.permissionArgs);
        return args;
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        const conversationId =
            this.readString(raw, 'conversation_id') ??
            this.readString(raw, 'conversationId') ??
            this.readString(raw, 'session_id') ??
            this.readString(raw, 'sessionId');
        if (conversationId) {
            this.sessionId = conversationId;
        }

        const topLevelModel =
            this.readString(raw, 'model') ??
            this.readString(this.readObject(raw, 'init') ?? {}, 'model');
        if (topLevelModel) {
            this.reportedModel = topLevelModel;
        }

        const eventType = this.readString(raw, 'type') ?? this.readString(raw, 'event');

        switch (eventType) {
            case 'init': {
                return null;
            }
            case 'step_update': {
                const stepUpdate = this.readObject(raw, 'step_update');
                if (!stepUpdate) {
                    return null;
                }
                const stepConvId = this.readString(stepUpdate, 'conversation_id');
                if (stepConvId) {
                    this.sessionId = stepConvId;
                }
                const stepType = this.readString(stepUpdate, 'step_type');
                const state = this.readString(stepUpdate, 'state');
                const stepIndex = this.readNumber(stepUpdate, 'step_index') ?? 0;
                const textDelta = this.readString(stepUpdate, 'text_delta');
                if (stepType === 'agent_response' && textDelta) {
                    return { Type: 'assistant-text', Text: textDelta };
                }
                if (stepType === 'tool') {
                    const toolInfo = this.readObject(stepUpdate, 'tool_info');
                    const toolName =
                        this.readString(stepUpdate, 'tool_name') ??
                        (toolInfo ? this.readString(toolInfo, 'name') : undefined) ??
                        'tool';
                    const toolCallId = `step-${stepIndex}-${toolName}`;
                    if (state === 'ACTIVE') {
                        const paramsObj = toolInfo ? this.readObject(toolInfo, 'parameters') : undefined;
                        return {
                            Type: 'tool-use-start',
                            ToolCallId: toolCallId,
                            ToolName: toolName,
                            ArgumentsJson: paramsObj ? JSON.stringify(paramsObj) : undefined,
                        };
                    }
                    if (state === 'DONE' || state === 'ERROR') {
                        const output = toolInfo ? this.readString(toolInfo, 'output') ?? '' : '';
                        return {
                            Type: 'tool-result',
                            ToolCallId: toolCallId,
                            ToolName: toolName,
                            Output: output,
                            IsError: state === 'ERROR',
                        };
                    }
                }
                return null;
            }
            case 'assistant':
            case 'text':
            case 'text_delta':
            case 'message': {
                const messageObj = this.readObject(raw, 'message');
                const messageModel = messageObj ? this.readString(messageObj, 'model') : undefined;
                if (messageModel) {
                    this.reportedModel = messageModel;
                }
                const text =
                    this.readString(raw, 'text') ??
                    this.readString(raw, 'delta') ??
                    this.readString(raw, 'content') ??
                    this.extractMessageBlocksText(messageObj);
                return text ? { Type: 'assistant-text', Text: text } : null;
            }
            case 'thinking':
            case 'thought':
            case 'thinking_delta': {
                const thought =
                    this.readString(raw, 'text') ??
                    this.readString(raw, 'thought') ??
                    this.readString(raw, 'delta');
                return thought ? { Type: 'thinking-delta', Text: thought } : null;
            }
            case 'tool_call':
            case 'tool_use':
            case 'tool_use_start': {
                const toolName =
                    this.readString(raw, 'name') ??
                    this.readString(raw, 'tool_name') ??
                    this.readString(raw, 'tool') ??
                    'tool_call';
                const toolCallId =
                    this.readString(raw, 'id') ??
                    this.readString(raw, 'tool_call_id') ??
                    `call-${toolName}`;
                const argsObj = this.readObject(raw, 'args') ?? this.readObject(raw, 'input');
                const argsStr =
                    this.readString(raw, 'arguments') ??
                    (argsObj ? JSON.stringify(argsObj) : undefined);
                return {
                    Type: 'tool-use-start',
                    ToolCallId: toolCallId,
                    ToolName: toolName,
                    ArgumentsJson: argsStr,
                };
            }
            case 'tool_result': {
                const toolCallId =
                    this.readString(raw, 'tool_call_id') ??
                    this.readString(raw, 'id') ??
                    'tool_result';
                const toolName = this.readString(raw, 'name') ?? this.readString(raw, 'tool_name');
                const output =
                    this.readString(raw, 'output') ??
                    this.readString(raw, 'content') ??
                    this.readString(raw, 'result') ??
                    '';
                return {
                    Type: 'tool-result',
                    ToolCallId: toolCallId,
                    ToolName: toolName,
                    Output: output,
                    IsError: raw['is_error'] === true,
                };
            }
            case 'usage': {
                const usageObj =
                    this.readObject(raw, 'usage_metadata') ??
                    this.readObject(raw, 'usage') ??
                    raw;
                return this.mapUsageObject(usageObj, raw);
            }
            case 'result':
            case 'turn_complete':
            case 'complete':
            case 'done': {
                const resultObj = this.readObject(raw, 'result');
                const resultConvId = resultObj ? this.readString(resultObj, 'conversation_id') : undefined;
                if (resultConvId) {
                    this.sessionId = resultConvId;
                }
                const usageObj =
                    this.readObject(raw, 'usage_metadata') ??
                    this.readObject(raw, 'usage') ??
                    (resultObj ? this.readObject(resultObj, 'usage_metadata') ?? this.readObject(resultObj, 'usage') : undefined);
                const terminal = this.buildTerminalFromResult(raw, resultObj);
                if (usageObj) {
                    this.pendingTerminal = terminal;
                    return this.mapUsageObject(usageObj, resultObj ?? raw);
                }
                return terminal;
            }
            case 'error': {
                return {
                    Type: 'session-error',
                    Error:
                        this.readString(raw, 'message') ??
                        this.readString(raw, 'error') ??
                        'Antigravity CLI reported an error',
                };
            }
            default: {
                // Support single-object JSON output (`{ "response": "...", "usage_metadata": {...} }`)
                const responseText = this.readString(raw, 'response');
                if (responseText !== undefined) {
                    const usageObj =
                        this.readObject(raw, 'usage_metadata') ?? this.readObject(raw, 'usage');
                    const terminal: HarnessTurnEvent = {
                        Type: 'turn-complete',
                        RawText: responseText,
                    };
                    if (usageObj) {
                        this.pendingTerminal = terminal;
                        return this.mapUsageObject(usageObj, raw);
                    }
                    return terminal;
                }
                return null;
            }
        }
    }

    protected override async *readEvents(proc: HarnessProcess): AsyncIterable<HarnessTurnEvent> {
        for await (const event of super.readEvents(proc)) {
            yield event;
            if (this.pendingTerminal) {
                const terminal = this.pendingTerminal;
                this.pendingTerminal = null;
                yield terminal;
            }
        }
    }

    private mapUsageObject(usageObj: HarnessCliRawEvent, envelope: HarnessCliRawEvent): HarnessTurnEvent {
        const promptTokens =
            this.readNumber(usageObj, 'prompt_token_count') ??
            this.readNumber(usageObj, 'input_tokens') ??
            0;
        const completionTokens =
            this.readNumber(usageObj, 'candidates_token_count') ??
            this.readNumber(usageObj, 'output_tokens') ??
            0;
        const thinkingTokens =
            this.readNumber(usageObj, 'thoughts_token_count') ??
            this.readNumber(usageObj, 'thinking_tokens');
        const costUsd =
            this.readNumber(usageObj, 'cost_usd') ??
            this.readNumber(envelope, 'total_cost_usd') ??
            this.readNumber(envelope, 'cost_usd');

        return {
            Type: 'usage',
            InputTokens: promptTokens,
            OutputTokens: completionTokens,
            PromptTokens: promptTokens,
            CompletionTokens: completionTokens,
            ThinkingTokens: thinkingTokens,
            CostUsd: costUsd,
        };
    }

    private buildTerminalFromResult(
        raw: HarnessCliRawEvent,
        resultObj?: HarnessCliRawEvent,
    ): HarnessTurnEvent {
        const text =
            (resultObj
                ? this.readString(resultObj, 'response') ?? this.readString(resultObj, 'text')
                : undefined) ??
            this.readString(raw, 'result') ??
            this.readString(raw, 'response') ??
            this.readString(raw, 'text') ??
            '';
        const status = resultObj ? this.readString(resultObj, 'status') : undefined;
        const trimmedText = text.trim();
        const looksLikeJsonDecision = trimmedText.startsWith('{') && trimmedText.endsWith('}');
        if (
            !looksLikeJsonDecision &&
            (raw['is_error'] === true || (status && status.toUpperCase() === 'ERROR'))
        ) {
            return {
                Type: 'session-error',
                Error: text || 'Antigravity CLI reported a failed turn',
            };
        }
        return {
            Type: 'turn-complete',
            RawText: text,
        };
    }

    private extractMessageBlocksText(messageObj: HarnessCliRawEvent | undefined): string {
        if (!messageObj) {
            return '';
        }
        const content = messageObj['content'];
        if (typeof content === 'string') {
            return content;
        }
        if (!Array.isArray(content)) {
            return '';
        }
        const parts: string[] = [];
        for (const block of content) {
            if (block !== null && typeof block === 'object' && !Array.isArray(block)) {
                const record = block as HarnessCliRawEvent;
                const blockType = this.readString(record, 'type');
                if (blockType === 'text' || blockType === undefined) {
                    const blockText = this.readString(record, 'text');
                    if (blockText) {
                        parts.push(blockText);
                    }
                }
            }
        }
        return parts.join('');
    }
}
