import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';

/**
 * Drives OpenAI's Codex CLI (`@openai/codex`).
 *
 * Codex ships as a CLI only — the npm package exposes a `bin` and no library entry point — so this
 * goes through {@link BaseCliHarnessAdapter} rather than an SDK.
 *
 * ## About the argv defaults
 *
 * `codex exec --json` is the documented headless form, but coding-agent CLIs move fast and flag
 * names drift between minor versions. Everything version-sensitive is confined to
 * {@link BuildTurnArgs} and the event names in {@link MapEvent}, so adapting to a new Codex release
 * is a change in one small place rather than a redesign — and `AIAgentHarness.ExecutablePath` lets a
 * deployment pin a specific binary without touching code at all.
 */
@RegisterClass(BaseHarnessAdapter, 'CodexAdapter')
export class CodexAdapter extends BaseCliHarnessAdapter {
    protected get ExecutablePath(): string {
        return this.executable;
    }

    private executable = 'codex';

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            // Codex resumes by threading its session id back on the next invocation.
            SessionResume: true,
            // No constrained-output mode: the turn-end JSON envelope is coaxed by prompt and
            // recovered by BaseAgent's malformed-response retry when the model drifts into prose.
            StructuredOutput: false,
            UsageReporting: true,
            PermissionHooks: false,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    protected BuildTurnArgs(input: string, isFirstTurn: boolean): string[] {
        const args = ['exec', '--json'];
        if (!isFirstTurn && this.sessionId) {
            args.push('--resume', this.sessionId);
        }
        if (this.config?.Model) {
            args.push('--model', this.config.Model);
        }
        args.push(input);
        return args;
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        // Capture the session id wherever it first appears so the next turn can resume, and so the
        // run can persist it to AIAgentRun.ExternalSessionID for vendor-side log correlation.
        const session = this.readString(raw, 'session_id') ?? this.readString(raw, 'sessionId');
        if (session) {
            this.sessionId = session;
        }

        switch (this.readString(raw, 'type')) {
            case 'assistant_message':
            case 'agent_message': {
                const text = this.readString(raw, 'message') ?? this.readString(raw, 'text');
                return text ? { Type: 'assistant-text', Text: text } : null;
            }
            case 'tool_call':
            case 'exec_command': {
                const description = this.readString(raw, 'command') ?? this.readString(raw, 'name') ?? 'sandbox activity';
                return { Type: 'sandbox-activity', Description: description };
            }
            case 'token_count':
            case 'usage': {
                const usage = this.readObject(raw, 'usage') ?? raw;
                return {
                    Type: 'usage',
                    InputTokens: this.readNumber(usage, 'input_tokens') ?? 0,
                    OutputTokens: this.readNumber(usage, 'output_tokens') ?? 0,
                    CostUsd: this.readNumber(usage, 'cost_usd'),
                };
            }
            case 'task_complete':
            case 'turn_complete': {
                const text =
                    this.readString(raw, 'last_agent_message') ??
                    this.readString(raw, 'message') ??
                    this.readString(raw, 'text') ??
                    '';
                return { Type: 'turn-complete', RawText: text };
            }
            case 'error': {
                return { Type: 'session-error', Error: this.readString(raw, 'message') ?? 'Codex reported an error' };
            }
            default:
                return null;
        }
    }

    /** Points the adapter at a specific binary, from `AIAgentHarness.ExecutablePath`. */
    public SetExecutable(path: string): void {
        this.executable = path;
    }
}
