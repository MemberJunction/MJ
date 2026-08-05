import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';
import { HarnessProcess } from '../sandbox/SandboxExecutor.js';

/**
 * Drives Claude Code through its headless CLI.
 *
 * ## Why this exists alongside the SDK adapter
 *
 * `@memberjunction/ai-agent-harness-claude` drives Claude Code through the Agent SDK, which is the
 * better-typed surface and the natural choice for local development. But the SDK runs IN-PROCESS in
 * Node, and no sandbox executor can place an in-process library inside a container. That leaves the
 * SDK adapter local-only — and, worse, it would run outside the sandbox while an agent's config
 * claimed `provider: 'docker'`, which is precisely the false-containment failure this design keeps
 * trying to avoid.
 *
 * The CLI has no such limitation: it is a process, so the executor can place it anywhere. This
 * adapter is therefore the one that works in all three deployments — local spawn, local container,
 * and cloud container — and the SDK adapter is the richer local option rather than the only one.
 *
 * ## Why it lives in core rather than the Claude package
 *
 * It has no vendor dependency. The separate `-claude` package exists solely because the Agent SDK is
 * a real npm dependency that would otherwise weigh down every consumer of the core package. A CLI
 * adapter is just argv and JSON, exactly like Codex, OpenCode, Gemini CLI and Pi — so it belongs
 * with them.
 *
 * ## Event vocabulary
 *
 * `--output-format stream-json` emits the same message shapes the SDK surfaces as objects, so the
 * mapping below mirrors the SDK adapter's. The duplication is deliberate: sharing it would make the
 * core package depend on the Claude package or vice versa, to save perhaps thirty lines.
 */
@RegisterClass(BaseHarnessAdapter, 'ClaudeCodeCliAdapter')
export class ClaudeCodeCliAdapter extends BaseCliHarnessAdapter {
    private executable = 'claude';

    protected get ExecutablePath(): string {
        return this.executable;
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            SessionResume: true,
            // Killing the process ends the turn immediately — the executor owns the process handle.
            MidTurnCancellation: true,
            StructuredOutput: true,
            UsageReporting: true,
            // The SDK's canUseTool callback is the real permission hook; the CLI's equivalent needs
            // an MCP permission-prompt tool, which the strict posture will wire up separately.
            // Reported false until that exists, so the runtime does not assume interception it has
            // not got.
            PermissionHooks: false,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    protected BuildTurnArgs(input: string, isFirstTurn: boolean): string[] {
        const args = ['-p', input, '--output-format', 'stream-json', '--verbose'];
        if (!isFirstTurn && this.sessionId) {
            args.push('--resume', this.sessionId);
        }
        if (this.config?.Model) {
            args.push('--model', this.config.Model);
        }
        return args;
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        const session = this.readString(raw, 'session_id');
        if (session) {
            this.sessionId = session;
        }

        switch (this.readString(raw, 'type')) {
            case 'assistant': {
                const text = this.extractAssistantText(raw);
                return text ? { Type: 'assistant-text', Text: text } : null;
            }
            case 'result': {
                const usage = this.readObject(raw, 'usage');
                if (usage) {
                    // Usage arrives on the same message as the result. It is emitted as its own
                    // event so the accumulation loop stays uniform across every adapter, and so a
                    // turn that errors still reports what it spent getting there.
                    return this.buildResultEvents(raw, usage);
                }
                return this.buildTerminalEvent(raw);
            }
            default:
                return null;
        }
    }

    /**
     * Handles a `result` line, which carries BOTH the turn's usage and its outcome.
     *
     * MapEvent is one-in-one-out, so usage is returned now and the outcome is parked in
     * {@link pendingTerminal} for {@link readEvents} to flush immediately after. Emitting usage
     * first matters: a turn that failed still spent tokens getting there, and the run's cost
     * accounting should see them either way.
     */
    private buildResultEvents(raw: HarnessCliRawEvent, usage: HarnessCliRawEvent): HarnessTurnEvent {
        this.pendingTerminal = this.buildTerminalEvent(raw);
        return {
            Type: 'usage',
            InputTokens: this.readNumber(usage, 'input_tokens') ?? 0,
            OutputTokens: this.readNumber(usage, 'output_tokens') ?? 0,
            CostUsd: this.readNumber(raw, 'total_cost_usd'),
        };
    }

    /** Turns a `result` message into either a completed turn or a failed one. */
    private buildTerminalEvent(raw: HarnessCliRawEvent): HarnessTurnEvent {
        const text = this.readString(raw, 'result') ?? '';
        const isError = raw['is_error'] === true;
        return isError
            ? { Type: 'session-error', Error: text || 'Claude Code reported an error' }
            : { Type: 'turn-complete', RawText: text };
    }

    /** Concatenates the text blocks of an assistant message. */
    private extractAssistantText(raw: HarnessCliRawEvent): string {
        const message = this.readObject(raw, 'message');
        const content = message?.['content'];
        if (!Array.isArray(content)) {
            return '';
        }
        return content
            .map((block) => {
                if (block === null || typeof block !== 'object') {
                    return '';
                }
                const asRecord = block as HarnessCliRawEvent;
                return asRecord['type'] === 'text' ? (this.readString(asRecord, 'text') ?? '') : '';
            })
            .join('');
    }

    /** Terminal event held back while its usage event is emitted first. */
    private pendingTerminal: HarnessTurnEvent | null = null;

    /**
     * Flushes the terminal event held back by {@link buildResultEvents}.
     *
     * Overridden so a single `result` line can yield both usage and outcome while MapEvent keeps
     * its simple one-in-one-out shape.
     */
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

    /** Points the adapter at a specific binary, from `AIAgentHarness.ExecutablePath`. */
    public SetExecutable(path: string): void {
        this.executable = path;
    }
}
