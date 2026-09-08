import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';

/**
 * Drives ANY command that speaks a documented newline-delimited JSON event contract.
 *
 * This is the escape hatch that keeps "adding a harness must not require core changes" true in the
 * strong sense: a harness MJ has never heard of works with zero MJ code, provided its CLI emits
 * lines matching the vocabulary below.
 *
 * ## The contract
 *
 * Each stdout line is a JSON object with a `type` field:
 *
 * | `type`       | Other fields                          | Meaning                                  |
 * |--------------|---------------------------------------|------------------------------------------|
 * | `text`       | `text`                                | Narration; streamed, never persisted     |
 * | `activity`   | `description`                         | In-sandbox activity, for live view only  |
 * | `permission` | `id`, `description`, `command?`       | Requests approval; becomes a HITL row    |
 * | `usage`      | `input_tokens`, `output_tokens`, `cost_usd?` | Turn usage; drives cost guardrails |
 * | `complete`   | `text`                                | Turn ended; `text` carries the envelope  |
 * | `error`      | `message`                             | Turn failed                              |
 *
 * Unrecognised lines are ignored, so a harness may interleave its own diagnostics freely.
 *
 * Capabilities default to the conservative end — an unknown harness is assumed NOT to resume
 * sessions or honour permission hooks, so the runtime emulates continuity rather than silently
 * losing context. Override via `AIAgentHarness.CapabilitySettings` when the harness does better.
 */
@RegisterClass(BaseHarnessAdapter, 'StdioJsonAdapter')
export class StdioJsonAdapter extends BaseCliHarnessAdapter {
    protected executable = 'harness';
    protected extraArgs: string[] = [];
    protected declaredCapabilities: HarnessCapabilities | null = null;

    protected get ExecutablePath(): string {
        return this.executable;
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return (
            this.declaredCapabilities ?? {
                SessionResume: false,
                StructuredOutput: false,
                UsageReporting: true,
                // FALSE by definition: this is the generic escape hatch for a harness with no
                // first-class adapter, so there is no known flag vocabulary to translate a policy
                // into. A subclass that knows its CLI should override ApplyPermissionPolicy and
                // report true.
                PermissionPolicy: false,
                PermissionHooks: false,
                McpClient: false,
                WorkspaceScoping: true,
                ModelSelection: false,
            }
        );
    }

    protected BuildTurnArgs(input: string, _isFirstTurn: boolean): string[] {
        return [...this.extraArgs, input];
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        switch (this.readString(raw, 'type')) {
            case 'text':
                return { Type: 'assistant-text', Text: this.readString(raw, 'text') ?? '' };
            case 'activity':
                return { Type: 'sandbox-activity', Description: this.readString(raw, 'description') ?? 'activity' };
            case 'permission':
                return {
                    Type: 'permission-request',
                    RequestId: this.readString(raw, 'id') ?? '',
                    Description: this.readString(raw, 'description') ?? 'permission requested',
                    Command: this.readString(raw, 'command'),
                };
            case 'usage':
                return {
                    Type: 'usage',
                    InputTokens: this.readNumber(raw, 'input_tokens') ?? 0,
                    OutputTokens: this.readNumber(raw, 'output_tokens') ?? 0,
                    CostUsd: this.readNumber(raw, 'cost_usd'),
                };
            case 'complete':
                return { Type: 'turn-complete', RawText: this.readString(raw, 'text') ?? '' };
            case 'error':
                return { Type: 'session-error', Error: this.readString(raw, 'message') ?? 'harness reported an error' };
            default:
                return null;
        }
    }

    /** Configures the command, extra argv and declared capabilities from `AIAgentHarness` metadata. */
    public Configure(executable: string, extraArgs: string[], capabilities: HarnessCapabilities | null): void {
        this.executable = executable;
        this.extraArgs = extraArgs;
        this.declaredCapabilities = capabilities;
    }

    /** Points the adapter at a specific binary, from `AIAgentHarness.ExecutablePath`. */
    public SetExecutable(path: string): void {
        this.executable = path;
    }
}
