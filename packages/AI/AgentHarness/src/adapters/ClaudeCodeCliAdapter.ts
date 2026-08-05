import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';
import { HarnessProcess } from '../sandbox/SandboxExecutor.js';

/**
 * Drives Claude Code through its headless CLI. This is the ONLY Claude Code adapter.
 *
 * ## Why not the Claude Agent SDK
 *
 * An SDK-based adapter was built and then deliberately removed. The SDK offers a programmatic
 * permission callback (`canUseTool`) and in-process MCP tools, both genuinely useful — but it runs
 * IN-PROCESS in Node, and no sandbox executor can place an in-process library inside a container.
 *
 * That trade does not survive scrutiny: it buys better permission *hooks* at the cost of any
 * process *isolation*, for a feature whose entire purpose is executing an autonomous agent's shell
 * commands. Worse, an SDK-backed agent configured with `provider: 'docker'` would run outside its
 * sandbox while the config claimed otherwise — the same false-containment failure this design
 * refuses elsewhere. And the asymmetry is decisive: the CLI's missing permission hook is fixable
 * (an MCP permission-prompt tool), while the SDK's missing containment is not.
 *
 * Two incidental findings that removed the remaining arguments for it: the SDK's typing advantage
 * largely evaporated in practice (its message union is too broad to narrow against, so the adapter
 * read fields structurally anyway — exactly what the CLI adapter does), and the SDK is not
 * dependency-free — it ships a ~259 MB platform-specific `claude` binary. It wraps the same program
 * this adapter invokes.
 *
 * So there is one Claude path, and it works in all three deployments: local spawn, local container,
 * cloud container.
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
            // Claude Code CAN intercept permissions, but only through an MCP permission-prompt tool
            // that MJ has not stood up yet. Reported false until that exists: claiming interception
            // the adapter does not implement would let mutating operations through unreviewed while
            // the strict posture believed it was gating them. This is the one capability the removed
            // SDK adapter had and this one does not, and it is a prerequisite for `strict`.
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
