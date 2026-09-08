---
"@memberjunction/ai-agent-harness": patch
"@memberjunction/core-entities": patch
---

Harness permissions: make policy enforcement a declared capability, and stop trusting prefix-matched command patterns

MJ's harness permission policy was already abstract — declared in agent metadata, overridable at runtime, translated per-harness through `BaseHarnessAdapter.ApplyPermissionPolicy`. But only `ClaudeCodeCliAdapter` overrode that seam. The other four adapters inherited the inert base default, so a configured `strict` posture was **silently ignored**, and the runtime's warning checked `PermissionHooks` — a different question — so it never fired.

**New `IHarnessCapabilitySettings.PermissionPolicy`** declares that an adapter actually translates the policy into flags the harness honours. Deliberately separate from `PermissionHooks`, which is about *interactive* mid-turn approval: Claude Code enforces a static policy while having no hook to pause on, and conflating the two is precisely what hid this. `HarnessAgentBase` now logs an error when a policy is configured against an adapter reporting `false`, so an operator is never left believing something is gated. It warns rather than refusing — an unenforced policy on a properly-provisioned sandbox is still contained by the sandbox, and failing the run would take every unverified adapter offline.

**Pi now enforces**, using flags verified against a real install (`--tools` / `--exclude-tools`): `strict` → `read,grep,find`; `auto` → additionally `edit,write` but no shell (the `acceptEdits` analogue); `dangerous` → no flag at all. Because Pi gates on **exact tool names**, `strict` is genuinely enforceable there, unlike on Claude Code where it degrades to prompts that have nowhere to go headlessly. MJ's tool vocabulary is translated to Pi's (`Glob`→`find`, `Bash`→`bash`) by the adapter, so a policy is authored once regardless of harness.

Pi cannot express command-scoped patterns like `Bash(git:*)`, and those **fail closed in both directions**: a command-scoped *allow* is dropped, because granting the whole tool would hand over strictly more authority than the policy asked for; a command-scoped *deny* is widened to the whole tool, because denying more than asked is the safe direction.

Codex, Gemini CLI, OpenCode and the generic stdio adapter declare `PermissionPolicy: false`. Their CLIs' permission flags could not be verified against a real install, and guessing them produces exactly the failure this capability exists to surface — a policy that looks applied and is not.

**Claude Code's Bash patterns are PREFIX-LITERAL, and that is now documented as a rule rather than a caveat.** Proven live: a `Bash(git:*)` allow paired with a `Bash(git commit:*)` deny let `git -C <path> commit` execute, because any flag before the subcommand defeats the prefix. The run failed only because nothing happened to be staged. So: deny whole tool names — an exact match, no prefix involved — or allow fully-specified commands; never carve dangerous subcommands out of a broad allow. Tool-pattern lists are hygiene, not a security boundary. Real containment comes from the sandbox provider, and the `local` provider offers none.

The shipped `Demo Harness Agent` follows its own advice: `Read`/`Grep`/`Glob` allowed, `Bash`/`Write`/`Edit`/`NotebookEdit` denied outright.
