---
"@memberjunction/cli-core": patch
"@memberjunction/cli": patch
"@memberjunction/ai-cli": patch
---

Make the `mj` CLI agent-first, following the model the ElevenLabs CLI adopted.

**Prompting now follows the terminal.** A command prompts when stdin and stdout are both
TTYs — so nothing changes for a human — and does not when either is piped, when a CI
environment variable is set, or when `TERM=dumb`. In those cases a command that needs a
value it wasn't given fails immediately naming the flag that supplies it, instead of
blocking on stdin forever. Previously `mj sync init` had four prompts and no escape flags
at all, and `mj install --legacy` had two dozen; both hung an agent indefinitely. Override
the detection with the global `--interactive` / `--no-interactive`, or pin it for a session
with `MJ_CLI_INTERACTIVE`.

**Output follows the pipe.** With no explicit `--format`, a non-TTY stdout resolves to
`json` and all decorative chrome (banner, spinners, color) is suppressed — no flag
required. `MJ_CLI_FORMAT` pins the format for a shell session.

**One `--format` spelling CLI-wide.** `mj test *` (`console|json|markdown`) and `mj ai *`
(`compact|json|table`) now also accept the canonical `--format text|json|md`. Every
existing value keeps working, and an explicit legacy value still wins over inference.

**`mj usage` covers the whole CLI.** The tier-1 domain map went from 3 domains to 23, and
every domain now has a `mj <domain> usage` page. Entries for commands that aren't
`BaseCLIPlugin` plugins are derived from oclif's own manifest at runtime, so they cannot
drift; only the per-domain runtime budget is hand-maintained.

**Richer result envelope.** `MJCLIResult` now carries a `version` field (stamped on every
serialized result) and `MJCLIResultError` gains machine-readable `code` and actionable
`suggestion` fields. JSON output is compact when piped and pretty on a terminal.

Behavioral change: a command that used to prompt when spawned or piped now fails with an
actionable error instead of hanging. Interactive use at a terminal is unchanged.
`mj sync init` gains `--setup-entity`, `--entity`, `--dir`, and `--overwrite` to make it
fully scriptable.
