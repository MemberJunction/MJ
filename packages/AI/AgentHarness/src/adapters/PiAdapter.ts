import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessTurnEvent } from '../types.js';

/**
 * Drives Pi (`@earendil-works/pi-coding-agent`).
 *
 * ## Verified against a real install, not inferred
 *
 * An earlier version of this adapter subclassed the generic stdio-JSON escape hatch, because the
 * obvious npm names for Pi are placeholder reservations and there was no published contract to code
 * against. With Pi actually installed (0.83.0), its CLI turns out to be well specified, so this is
 * now a first-class adapter:
 *
 *   · `-p` / `--print`     non-interactive: process the prompt and exit
 *   · `--mode json`        newline-delimited JSON events
 *   · `--session-id <id>`  exact session, created if missing — so turns resume rather than replay
 *   · `--provider <name>`  default `google`
 *   · `--model <pattern>`  model pattern or `provider/id`
 *
 * The session-id form is what earns `SessionResume: true`: MJ supplies the id up front rather than
 * discovering it, so continuity does not depend on parsing it back out before turn two.
 *
 * ## Authentication
 *
 * Pi resolves credentials from environment variables (or its own `/login`). It therefore works with
 * the standard credential path — grant a credential whose `EnvVariableName` matches what the chosen
 * provider expects — and equally with the "true local" mode, where a developer who has already run
 * `pi /login` needs no credential row at all, because the local executor passes `HOME` through.
 */
@RegisterClass(BaseHarnessAdapter, 'PiAdapter')
export class PiAdapter extends BaseCliHarnessAdapter {
    private executable = 'pi';
    private provider: string | undefined;

    protected get ExecutablePath(): string {
        return this.executable;
    }

    /** @inheritdoc */
    public get Capabilities(): HarnessCapabilities {
        return {
            // MJ supplies --session-id, so continuity does not depend on parsing an id back out.
            SessionResume: true,
            MidTurnCancellation: true,
            // --mode json structures the TRANSPORT, not the model's content; the turn-end envelope
            // is still coaxed by prompt and recovered by BaseAgent's malformed-response retry.
            StructuredOutput: false,
            UsageReporting: true,
            // Pi has its own permission model, but MJ has no hook into it yet — same gap as every
            // other adapter, and reported honestly so `strict` is not assumed to be enforceable.
            PermissionHooks: false,
            McpClient: false,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    protected BuildTurnArgs(input: string, _isFirstTurn: boolean): string[] {
        // The session id is generated once per session and passed on EVERY turn: --session-id
        // creates the session if missing, so the first turn establishes it and later turns attach
        // to it. No branch on first-vs-subsequent is needed, which removes a state bug by design.
        if (!this.sessionId) {
            this.sessionId = `mj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
        }

        const args = ['-p', '--mode', 'json', '--session-id', this.sessionId];
        if (this.provider) {
            args.push('--provider', this.provider);
        }
        if (this.config?.Model) {
            args.push('--model', this.config.Model);
        }
        args.push(input);
        return args;
    }

    protected MapEvent(raw: HarnessCliRawEvent): HarnessTurnEvent | null {
        const type = this.readString(raw, 'type');

        switch (type) {
            case 'session': {
                // Pi announces its session up front; prefer its id over the one MJ proposed so
                // AIAgentRun.ExternalSessionID correlates with Pi's own session files.
                const id = this.readString(raw, 'id');
                if (id) {
                    this.sessionId = id;
                }
                return null;
            }
            case 'assistant':
            case 'text':
            case 'message': {
                const text = this.readString(raw, 'text') ?? this.readString(raw, 'content');
                return text ? { Type: 'assistant-text', Text: text } : null;
            }
            case 'tool':
            case 'tool_use': {
                return { Type: 'sandbox-activity', Description: this.readString(raw, 'name') ?? 'tool call' };
            }
            case 'usage': {
                const usage = this.readObject(raw, 'usage') ?? raw;
                return {
                    Type: 'usage',
                    InputTokens: this.readNumber(usage, 'input_tokens') ?? this.readNumber(usage, 'input') ?? 0,
                    OutputTokens: this.readNumber(usage, 'output_tokens') ?? this.readNumber(usage, 'output') ?? 0,
                    CostUsd: this.readNumber(usage, 'cost_usd') ?? this.readNumber(raw, 'cost'),
                };
            }
            case 'result':
            case 'done':
            case 'complete': {
                const text = this.readString(raw, 'result') ?? this.readString(raw, 'text') ?? '';
                return { Type: 'turn-complete', RawText: text };
            }
            case 'error': {
                return { Type: 'session-error', Error: this.readString(raw, 'message') ?? 'Pi reported an error' };
            }
            default:
                return null;
        }
    }

    /** Points the adapter at a specific binary, from `AIAgentHarness.ExecutablePath`. */
    public SetExecutable(path: string): void {
        this.executable = path;
    }

    /** Selects Pi's provider (default `google`), typically from the harness row's configuration. */
    public SetProvider(provider: string): void {
        this.provider = provider;
    }
}
