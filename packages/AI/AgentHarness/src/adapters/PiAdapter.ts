import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessPermissionPolicy, HarnessTurnEvent } from '../types.js';

/**
 * Pi's built-in tools, from `pi --help` on a real install (0.83.0).
 *
 * `--tools` / `--exclude-tools` take Pi's own tool names, which are lowercase and differ from
 * Claude Code's (`bash` not `Bash`, `find` not `Glob`). MJ's policy is written once in agent
 * metadata, so the adapter — not the operator — is responsible for speaking each harness's
 * vocabulary. Names not in this map pass through unchanged, so extension and custom tools still
 * work; only the built-ins need translating.
 */
const PI_TOOL_ALIASES: Readonly<Record<string, string>> = {
    Bash: 'bash',
    Read: 'read',
    Edit: 'edit',
    Write: 'write',
    Grep: 'grep',
    Glob: 'find',
};

/** Mutating built-ins — what `strict` must leave out when no explicit allowlist is supplied. */
const PI_READ_ONLY_TOOLS: readonly string[] = ['read', 'grep', 'find'];

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
    private permissionArgs: string[] = [];

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
            // ApplyPermissionPolicy translates posture + allow/deny into --tools/--exclude-tools.
            PermissionPolicy: true,
            // Pi can gate tools at LAUNCH but exposes no mid-turn interception MJ can pause on, so
            // there is still nowhere to route an approval request. Static policy, no HITL.
            PermissionHooks: false,
            McpClient: false,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    /**
     * Maps MJ's posture onto Pi's `--tools` / `--exclude-tools`.
     *
     * Pi gates at the TOOL level, and unlike Claude Code's prefix-matched Bash patterns these are
     * exact tool-name matches — so what this configures is what is enforced, with no way for a
     * cleverly-flagged command to slip past. `strict` is therefore genuinely enforceable here,
     * whereas on Claude Code it degrades to "prompts that have nowhere to go".
     *
     * ## Command-scoped patterns cannot be expressed, and are NOT quietly widened
     *
     * A policy authored for Claude Code may contain `Bash(git:*)`. Pi has no sub-command vocabulary,
     * so the only faithful translations are "all of `bash`" or "none of it" — and those are not
     * equivalent to what was written. The rule is fail-closed in both directions:
     *
     * - a command-scoped **allow** is DROPPED — granting the whole tool would hand over strictly more
     *   authority than the policy asked for;
     * - a command-scoped **deny** is WIDENED to the whole tool — denying more than asked is the safe
     *   direction, and a policy that bothered to deny `git push` should not get all of `bash`.
     *
     * Silently widening an allow is the failure this whole capability exists to prevent.
     */
    public override ApplyPermissionPolicy(policy: HarnessPermissionPolicy): void {
        const args: string[] = [];

        const allowed = this.translateTools(policy.AllowedTools, 'allow');
        const denied = this.translateTools(policy.DisallowedTools, 'deny');

        // An explicit allowlist always wins over the posture default: the operator said exactly what
        // they wanted. Without one, the posture picks a sensible built-in set.
        const allowlist = allowed.length > 0 ? allowed : this.defaultToolsForPosture(policy.Posture);
        if (allowlist) {
            args.push('--tools', allowlist.join(','));
        }
        // Applied last and independently of --tools so deny wins on any overlap.
        if (denied.length > 0) {
            args.push('--exclude-tools', denied.join(','));
        }

        this.permissionArgs = args;
    }

    /**
     * Built-in tools each posture grants when no explicit allowlist is given.
     *
     * `dangerous` returns undefined — no `--tools` flag at all, leaving Pi's own defaults in place.
     */
    private defaultToolsForPosture(posture: HarnessPermissionPolicy['Posture']): string[] | undefined {
        switch (posture) {
            case 'dangerous':
                return undefined;
            case 'auto':
                // File mutation proceeds; shell does not. The analogue of Claude Code's acceptEdits,
                // which likewise accepts edits while still gating command execution.
                return [...PI_READ_ONLY_TOOLS, 'edit', 'write'];
            case 'strict':
            default:
                return [...PI_READ_ONLY_TOOLS];
        }
    }

    /** Applies {@link PI_TOOL_ALIASES} and the command-scoped-pattern rules described above. */
    private translateTools(tools: string[] | undefined, direction: 'allow' | 'deny'): string[] {
        if (!tools?.length) {
            return [];
        }
        const out: string[] = [];
        for (const tool of tools) {
            const parenIndex = tool.indexOf('(');
            if (parenIndex === -1) {
                out.push(PI_TOOL_ALIASES[tool] ?? tool);
                continue;
            }
            if (direction === 'deny') {
                // Widen to the whole tool — the safe direction.
                const base = tool.slice(0, parenIndex);
                out.push(PI_TOOL_ALIASES[base] ?? base);
            }
            // direction === 'allow': dropped deliberately. See the method doc.
        }
        return [...new Set(out)];
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
        // Per-invocation, like every other flag here: Pi's process dies at turn end, so a policy
        // applied only at session start would silently lapse from turn two onward.
        args.push(...this.permissionArgs);
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
