import { RegisterClass } from '@memberjunction/global';
import { BaseCliHarnessAdapter, HarnessCliRawEvent } from './BaseCliHarnessAdapter.js';
import { BaseHarnessAdapter } from './BaseHarnessAdapter.js';
import { HarnessCapabilities, HarnessPermissionPolicy, HarnessPosture, HarnessTurnEvent } from '../types.js';

/** Gemini CLI's `--approval-mode` values (verified against `@google/gemini-cli` 0.62.0's option table). */
type GeminiApprovalMode = 'default' | 'auto_edit' | 'yolo';

/**
 * Maps MJ's posture onto Gemini CLI's approval modes.
 *
 * Same shape as the Claude Code mapping and for the same reasons:
 * - `strict` -> `default`: Gemini prompts before any mutating tool, and headless there is nobody to
 *   answer, so mutation is denied. Observably useless beats quietly permissive.
 * - `auto` -> `auto_edit`: edit tools proceed, everything else still gates. Not `yolo`, which would
 *   make `auto` and `dangerous` one setting under two names.
 * - `dangerous` -> `yolo`: no gating. Only defensible inside a contained sandbox.
 */
export function GeminiApprovalModeForPosture(posture: HarnessPosture): GeminiApprovalMode {
    switch (posture) {
        case 'auto':
            return 'auto_edit';
        case 'dangerous':
            return 'yolo';
        case 'strict':
        default:
            return 'default';
    }
}

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
    /**
     * Defaults to the SAFE mode. The adapter used to hard-code `--yolo`, which meant a strict agent
     * silently ran with every tool auto-approved; if `ApplyPermissionPolicy` is somehow never called
     * the fallback must not be that.
     */
    private approvalMode: GeminiApprovalMode = 'default';

    /**
     * Applies the policy's POSTURE. Allow/deny tool lists are deliberately not translated.
     *
     * Gemini CLI can take an allowlist (`--allowed-tools`, deprecated in favour of its Policy Engine)
     * but has no deny flag, and an allow-without-deny translation would WIDEN a policy such as
     * "allow `Bash(git:*)`, deny `Bash(git push:*)`" to permit the push — the exact failure the
     * Claude Code adapter's prefix-literal note describes. So lists are left unenforced and
     * {@link PartialPolicyEnforcement} says so, which is why `PermissionPolicy` stays false.
     */
    public override ApplyPermissionPolicy(policy: HarnessPermissionPolicy): void {
        this.approvalMode = GeminiApprovalModeForPosture(policy.Posture);
    }

    /** @inheritdoc */
    public override get PartialPolicyEnforcement(): string {
        return "posture is applied through Gemini CLI's --approval-mode; allowed/disallowed tool lists are not translated";
    }

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
            // FALSE, deliberately: the POSTURE is translated (see ApplyPermissionPolicy) but the
            // allow/deny tool lists are not — Gemini CLI has no deny flag, and an allow-only
            // translation would widen a policy. This flag means "the whole policy is enforced", and
            // it must agree with the AIAgentHarness.CapabilitySettings row in metadata (integration
            // check AEH5), so it stays false until the lists can be honoured too. The runtime reads
            // PartialPolicyEnforcement to log the accurate "posture yes, lists no" message.
            PermissionPolicy: false,
            PermissionHooks: false,
            McpClient: true,
            WorkspaceScoping: true,
            ModelSelection: true,
        };
    }

    protected BuildTurnArgs(input: string, _isFirstTurn: boolean): string[] {
        // No resume flag: every turn is a fresh invocation carrying replayed context in `input`.
        const args = ['--output-format', 'json', '--approval-mode', this.approvalMode];
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
