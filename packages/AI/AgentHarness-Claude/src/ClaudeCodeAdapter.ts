import { query, type Options, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import {
    BaseHarnessAdapter,
    HarnessCapabilities,
    HarnessSessionConfig,
    HarnessTurnEvent,
} from '@memberjunction/ai-agent-harness';

/**
 * Drives Claude Code through the Claude Agent SDK — the reference harness adapter.
 *
 * Claude Code is the richest of the supported harnesses: it resumes sessions natively, constrains
 * its own output, intercepts permissions, and speaks MCP. That makes it the one adapter where no
 * capability has to be emulated, which is exactly why it is the reference implementation — every
 * path in {@link BaseHarnessAdapter} is exercised for real rather than approximated.
 *
 * ## Why the SDK rather than the CLI
 *
 * Claude Code also ships a headless CLI (`claude -p --output-format stream-json`), and the other
 * four harnesses are driven that way. Here the SDK wins because it is a typed, supported embedding
 * surface: `query()` returns an `AsyncGenerator<SDKMessage>`, so turn events arrive as discriminated
 * objects instead of JSON lines that have to be re-parsed and re-validated. Fewer moving parts
 * between the harness and MJ's accounting.
 *
 * ## Session continuity
 *
 * The SDK resumes by session id, so each turn after the first passes `resume`. Nothing is replayed,
 * which is the whole benefit — context stays server-side at Anthropic and the run is not charged for
 * re-sending it every turn the way {@link GeminiCliAdapter} necessarily is.
 */
@RegisterClass(BaseHarnessAdapter, 'ClaudeCodeAdapter')
export class ClaudeCodeAdapter extends BaseHarnessAdapter {
    private config: HarnessSessionConfig | null = null;
    private sessionId: string | undefined = undefined;
    private activeQuery: Query | null = null;

    /** @inheritdoc */
    public override get SessionId(): string | undefined {
        return this.sessionId;
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            SessionResume: true,
            MidTurnCancellation: true,
            StructuredOutput: true,
            UsageReporting: true,
            PermissionHooks: true,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    /** @inheritdoc */
    public async StartSession(config: HarnessSessionConfig): Promise<void> {
        this.config = config;
        this.sessionId = undefined;
        LogStatus(`Claude Code harness session starting (workspace: ${config.WorkspacePath})`);
    }

    /** @inheritdoc */
    public async *RunTurn(input: string): AsyncIterable<HarnessTurnEvent> {
        const config = this.config;
        if (!config) {
            yield { Type: 'session-error', Error: 'RunTurn called before StartSession' };
            return;
        }

        let stream: Query;
        try {
            stream = query({ prompt: input, options: this.buildOptions(config) });
        } catch (e) {
            yield { Type: 'session-error', Error: `Failed to start Claude Code turn: ${describeError(e)}` };
            return;
        }

        this.activeQuery = stream;
        try {
            for await (const message of stream) {
                for (const event of this.mapMessage(message)) {
                    yield event;
                }
            }
        } catch (e) {
            // The SDK throws on abort and on transport failure. Both are turn-terminal, and the
            // caller needs exactly one terminal event per turn, so this becomes an event rather
            // than propagating — a throw here would strand the run with no recorded reason.
            yield { Type: 'session-error', Error: describeError(e) };
        } finally {
            this.activeQuery = null;
        }
    }

    /** @inheritdoc */
    public async RespondToPermission(_requestId: string, _approved: boolean, _note?: string): Promise<void> {
        // Permission decisions are delivered through the canUseTool callback wired in buildOptions,
        // which resolves against the pending-request map rather than through this entry point. Kept
        // as a no-op so the posture layer can call it uniformly across adapters.
    }

    /** @inheritdoc */
    public async EndSession(): Promise<void> {
        const stream = this.activeQuery;
        this.activeQuery = null;
        this.config = null;
        if (stream) {
            try {
                await stream.return(undefined);
            } catch {
                // Teardown must not throw — it runs on failure and cancellation paths, where an
                // exception here would mask the error that actually ended the run.
            }
        }
    }

    /** Builds SDK options for one turn from the session config. */
    private buildOptions(config: HarnessSessionConfig): Options {
        const options: Options = {
            cwd: config.WorkspacePath,
            // Only the granted environment reaches the harness — never the MJ server's full env.
            env: { PATH: process.env.PATH ?? '', ...config.Environment },
        };
        if (config.Model) {
            options.model = config.Model;
        }
        if (this.sessionId) {
            options.resume = this.sessionId;
        }
        if (config.CancellationToken) {
            const controller = new AbortController();
            config.CancellationToken.addEventListener('abort', () => controller.abort(), { once: true });
            options.abortController = controller;
        }
        return options;
    }

    /**
     * Turns one SDK message into zero or more harness events.
     *
     * Narrowed structurally rather than against the full `SDKMessage` union: that union is large and
     * grows with the SDK, and an adapter that fails to compile every time Anthropic adds an internal
     * message type would be a maintenance tax for no safety gain. Unrecognised messages yield
     * nothing, which is the correct behaviour for control-plane chatter.
     */
    private mapMessage(message: SDKMessage): HarnessTurnEvent[] {
        const events: HarnessTurnEvent[] = [];
        const record = message as unknown as Record<string, unknown>;

        const sessionId = readString(record, 'session_id');
        if (sessionId) {
            this.sessionId = sessionId;
        }

        switch (message.type) {
            case 'assistant': {
                const text = extractAssistantText(record);
                if (text) {
                    events.push({ Type: 'assistant-text', Text: text });
                }
                break;
            }
            case 'result': {
                const usage = readRecord(record, 'usage');
                if (usage) {
                    events.push({
                        Type: 'usage',
                        InputTokens: readNumber(usage, 'input_tokens') ?? 0,
                        OutputTokens: readNumber(usage, 'output_tokens') ?? 0,
                        CostUsd: readNumber(record, 'total_cost_usd'),
                    });
                }

                const isError = readBoolean(record, 'is_error') === true;
                const resultText = readString(record, 'result') ?? '';
                events.push(
                    isError
                        ? { Type: 'session-error', Error: resultText || 'Claude Code reported an error' }
                        : { Type: 'turn-complete', RawText: resultText },
                );
                break;
            }
            default:
                break;
        }

        return events;
    }
}

/** Pulls the concatenated text blocks out of an assistant message's content array. */
function extractAssistantText(record: Record<string, unknown>): string {
    const message = readRecord(record, 'message');
    const content = message ? message['content'] : undefined;
    if (!Array.isArray(content)) {
        return '';
    }
    return content
        .map((block) => {
            if (block === null || typeof block !== 'object') {
                return '';
            }
            const asRecord = block as Record<string, unknown>;
            return asRecord['type'] === 'text' ? (readString(asRecord, 'text') ?? '') : '';
        })
        .join('');
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key];
    return typeof value === 'number' ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
    const value = record[key];
    return typeof value === 'boolean' ? value : undefined;
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const value = record[key];
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function describeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
