/**
 * Pins how MJ's harness-neutral permission policy is translated into each harness's own vocabulary.
 *
 * The reason this file exists is a live failure, not a hypothetical. Claude Code's Bash patterns are
 * PREFIX-LITERAL: a `Bash(git:*)` allow paired with a `Bash(git commit:*)` deny let
 * `git -C <path> commit` execute, because the flag before the subcommand defeats the prefix. Nothing
 * caught it — the policy looked applied. So the rules that keep a translation honest are asserted
 * here rather than left to review:
 *
 *   1. deny is emitted AFTER allow, so an overlapping policy fails closed;
 *   2. a policy an adapter cannot express is never widened in the permissive direction;
 *   3. an adapter that translates nothing declares `PermissionPolicy: false` so the runtime can say
 *      out loud that the policy is inert.
 */
import { describe, it, expect } from 'vitest';
import { ClaudeCodeCliAdapter } from '../adapters/ClaudeCodeCliAdapter.js';
import { PiAdapter } from '../adapters/PiAdapter.js';
import { CodexAdapter } from '../adapters/CodexAdapter.js';
import { GeminiCliAdapter } from '../adapters/GeminiCliAdapter.js';
import { OpenCodeAdapter } from '../adapters/OpenCodeAdapter.js';
import { HarnessPermissionPolicy } from '../types.js';

/** Reaches the protected arg builder, which is where a policy becomes observable. */
function turnArgs(adapter: ClaudeCodeCliAdapter | PiAdapter, isFirstTurn = true): string[] {
    const internal = adapter as unknown as { BuildTurnArgs(input: string, first: boolean): string[] };
    return internal.BuildTurnArgs('hello', isFirstTurn);
}

const policy = (p: Partial<HarnessPermissionPolicy>): HarnessPermissionPolicy => ({ Posture: 'strict', ...p });

describe('ClaudeCodeCliAdapter.ApplyPermissionPolicy', () => {
    it('emits no posture flag for strict — Claude Code prompts, and headlessly that denies', () => {
        const a = new ClaudeCodeCliAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'strict' }));
        const args = turnArgs(a);
        expect(args).not.toContain('--permission-mode');
        expect(args).not.toContain('--dangerously-skip-permissions');
    });

    it('maps auto to acceptEdits, NOT bypassPermissions', () => {
        // Using bypass here would make `auto` and `dangerous` the same setting under two names.
        const a = new ClaudeCodeCliAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'auto' }));
        const args = turnArgs(a);
        expect(args).toContain('--permission-mode');
        expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
        expect(args).not.toContain('--dangerously-skip-permissions');
    });

    it('maps dangerous to --dangerously-skip-permissions', () => {
        const a = new ClaudeCodeCliAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'dangerous' }));
        expect(turnArgs(a)).toContain('--dangerously-skip-permissions');
    });

    it('emits deny AFTER allow so an overlapping policy fails closed', () => {
        const a = new ClaudeCodeCliAdapter();
        a.ApplyPermissionPolicy(policy({ AllowedTools: ['Read'], DisallowedTools: ['Write'] }));
        const args = turnArgs(a);
        expect(args.indexOf('--disallowedTools')).toBeGreaterThan(args.indexOf('--allowedTools'));
    });

    it('re-applies the policy on EVERY turn, not just the first', () => {
        // The CLI process dies at turn end, so a policy applied once would silently lapse.
        const a = new ClaudeCodeCliAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'auto' }));
        expect(turnArgs(a, false)).toContain('--permission-mode');
    });

    it('declares PermissionPolicy true — it genuinely translates one', () => {
        expect(new ClaudeCodeCliAdapter().Capabilities.PermissionPolicy).toBe(true);
    });
});

describe('PiAdapter.ApplyPermissionPolicy', () => {
    it('defaults strict to the read-only built-ins', () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'strict' }));
        const args = turnArgs(a);
        const tools = args[args.indexOf('--tools') + 1].split(',');
        expect(tools.sort()).toEqual(['find', 'grep', 'read']);
        expect(tools).not.toContain('bash');
    });

    it('grants file mutation but not shell under auto', () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'auto' }));
        const tools = turnArgs(a)[turnArgs(a).indexOf('--tools') + 1].split(',');
        expect(tools).toContain('edit');
        expect(tools).toContain('write');
        expect(tools).not.toContain('bash');
    });

    it('leaves Pi to its own defaults under dangerous', () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'dangerous' }));
        expect(turnArgs(a)).not.toContain('--tools');
    });

    it("translates MJ's tool names into Pi's vocabulary", () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ AllowedTools: ['Read', 'Glob', 'Grep'] }));
        const tools = turnArgs(a)[turnArgs(a).indexOf('--tools') + 1].split(',');
        // Glob is `find` in Pi. An untranslated name would silently gate nothing.
        expect(tools.sort()).toEqual(['find', 'grep', 'read']);
    });

    it('DROPS a command-scoped allow rather than granting the whole tool', () => {
        // `Bash(git:*)` cannot be expressed by a tool-level gate. Granting all of `bash` would hand
        // over strictly more authority than the policy asked for — the exact escalation that let
        // `git -C … commit` through on Claude Code.
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ AllowedTools: ['Read', 'Bash(git:*)'] }));
        const tools = turnArgs(a)[turnArgs(a).indexOf('--tools') + 1].split(',');
        expect(tools).toContain('read');
        expect(tools).not.toContain('bash');
    });

    it('WIDENS a command-scoped deny to the whole tool — the safe direction', () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'dangerous', DisallowedTools: ['Bash(git push:*)'] }));
        const args = turnArgs(a);
        expect(args[args.indexOf('--exclude-tools') + 1].split(',')).toContain('bash');
    });

    it('lets an explicit allowlist override the posture default', () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ Posture: 'strict', AllowedTools: ['Read'] }));
        expect(turnArgs(a)[turnArgs(a).indexOf('--tools') + 1]).toBe('read');
    });

    it('passes unknown tool names through so extension tools still work', () => {
        const a = new PiAdapter();
        a.ApplyPermissionPolicy(policy({ AllowedTools: ['my_custom_tool'] }));
        expect(turnArgs(a)[turnArgs(a).indexOf('--tools') + 1]).toBe('my_custom_tool');
    });

    it('declares PermissionPolicy true', () => {
        expect(new PiAdapter().Capabilities.PermissionPolicy).toBe(true);
    });
});

describe('adapters that do not translate a policy declare it', () => {
    // These report false because their CLIs' permission flags were never verified against a real
    // install. The flag is what lets HarnessAgentBase log that a configured policy is inert, rather
    // than the operator assuming `strict` gated something.
    it.each([
        ['CodexAdapter', () => new CodexAdapter().Capabilities],
        ['GeminiCliAdapter', () => new GeminiCliAdapter().Capabilities],
        ['OpenCodeAdapter', () => new OpenCodeAdapter().Capabilities],
    ])('%s reports PermissionPolicy false', (_name, get) => {
        expect(get().PermissionPolicy).toBe(false);
    });

    it('PermissionPolicy and PermissionHooks are distinct questions', () => {
        // Claude Code enforces a static policy while having no interactive hook. Conflating the two
        // is what let four adapters ignore a policy while the runtime warned about the wrong thing.
        const caps = new ClaudeCodeCliAdapter().Capabilities;
        expect(caps.PermissionPolicy).toBe(true);
        expect(caps.PermissionHooks).toBe(false);
    });
});
