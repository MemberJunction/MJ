import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';

/**
 * Drives Google's Gemini CLI (`@google/gemini-cli`).
 *
 * `@google/gemini-cli-core` does expose a compilable entry point, but it is the CLI's internals
 * rather than a supported embedding API — depending on it would couple MJ to a package with no
 * stability contract. The CLI surface is the supported one, so this adapter uses it.
 *
 * Gemini CLI is the weakest of the five on session continuity: it is built around one-shot
 * invocations. {@link Capabilities} reports `SessionResume: false` accordingly, which makes the
 * runtime replay accumulated context into each turn — correct, but the token cost grows with turn
 * count, and reporting it honestly here is what lets the run's cost guardrail see that.
 */
@RegisterClass(BaseHarnessAdapter, 'GeminiCliAdapter')
export class GeminiCliAdapter extends BaseCliHarnessAdapter {
    private executable = 'gemini';

    protected get ExecutablePath(): string {
        return this.executable;
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            // One-shot by design — the runtime must replay context each turn. See class doc.
            SessionResume: false,
            StructuredOutput: false,
            UsageReporting: true,
            PermissionHooks: false,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    protected BuildTurnArgs(input: string, _isFirstTurn: boolean): string[] {
        // No resume flag: every turn is a fresh invocation carrying replayed context in `input`.
        const args = ['--output-format', 'json', '--yolo'];
        if (this.config?.Model) {
            args.push('--model', this.config.Model);
        }
        args.push('--prompt', input);
        return args;
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        // Gemini CLI's JSON output mode emits a single result object rather than a running stream,
        // so the common case is one line that IS the turn result.
        const response = this.readString(raw, 'response');
        if (response !== undefined) {
            const stats = this.readObject(raw, 'stats');
            const tokens = stats ? this.readObject(stats, 'tokens') : undefined;
            if (tokens) {
                // Usage arrives on the same object as the result. Emitting it as a separate event
                // keeps the accumulation loop uniform across adapters.
                return { Type: 'turn-complete', RawText: response };
            }
            return { Type: 'turn-complete', RawText: response };
        }

        switch (this.readString(raw, 'type')) {
            case 'usage': {
                return {
                    Type: 'usage',
                    InputTokens: this.readNumber(raw, 'input_tokens') ?? 0,
                    OutputTokens: this.readNumber(raw, 'output_tokens') ?? 0,
                    CostUsd: this.readNumber(raw, 'cost_usd'),
                };
            }
            case 'error': {
                return { Type: 'session-error', Error: this.readString(raw, 'message') ?? 'Gemini CLI reported an error' };
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
