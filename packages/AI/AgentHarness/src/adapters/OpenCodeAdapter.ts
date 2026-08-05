import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';

/**
 * Drives OpenCode (`opencode`) in its non-interactive run mode.
 *
 * OpenCode publishes `@opencode-ai/sdk`, but that package exposes no `main` or `types` entry, so
 * there is nothing stable to compile against — the CLI is the dependable contract. If the SDK later
 * ships a real typed entry point, this adapter is the only thing that needs to change.
 *
 * Flag names live entirely in {@link BuildTurnArgs}; see {@link CodexAdapter} for why that
 * confinement matters with fast-moving agent CLIs.
 */
@RegisterClass(BaseHarnessAdapter, 'OpenCodeAdapter')
export class OpenCodeAdapter extends BaseCliHarnessAdapter {
    private executable = 'opencode';

    protected get ExecutablePath(): string {
        return this.executable;
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            SessionResume: true,
            StructuredOutput: false,
            UsageReporting: true,
            PermissionHooks: false,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    protected BuildTurnArgs(input: string, isFirstTurn: boolean): string[] {
        const args = ['run', '--print-logs', '--format', 'json'];
        if (!isFirstTurn && this.sessionId) {
            args.push('--session', this.sessionId);
        }
        if (this.config?.Model) {
            args.push('--model', this.config.Model);
        }
        args.push(input);
        return args;
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        const session = this.readString(raw, 'sessionID') ?? this.readString(raw, 'session_id');
        if (session) {
            this.sessionId = session;
        }

        const type = this.readString(raw, 'type') ?? this.readString(raw, 'event');
        switch (type) {
            case 'message':
            case 'text': {
                const text = this.readString(raw, 'text') ?? this.readString(raw, 'content');
                return text ? { Type: 'assistant-text', Text: text } : null;
            }
            case 'tool':
            case 'tool.execute': {
                return { Type: 'sandbox-activity', Description: this.readString(raw, 'tool') ?? 'tool call' };
            }
            case 'usage': {
                const usage = this.readObject(raw, 'tokens') ?? raw;
                return {
                    Type: 'usage',
                    InputTokens: this.readNumber(usage, 'input') ?? 0,
                    OutputTokens: this.readNumber(usage, 'output') ?? 0,
                    CostUsd: this.readNumber(raw, 'cost'),
                };
            }
            case 'session.idle':
            case 'finish':
            case 'done': {
                return { Type: 'turn-complete', RawText: this.readString(raw, 'text') ?? this.readString(raw, 'result') ?? '' };
            }
            case 'error': {
                return { Type: 'session-error', Error: this.readString(raw, 'message') ?? 'OpenCode reported an error' };
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
