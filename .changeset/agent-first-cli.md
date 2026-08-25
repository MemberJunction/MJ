---
"@memberjunction/cli-core": patch
"@memberjunction/cli": patch
"@memberjunction/ai-cli": patch
---

Make the `mj` CLI agent-first, following the model the ElevenLabs CLI adopted.

**Prompting is now opt-in.** `mj` no longer prompts by default; pass the global
`--human-friendly` flag (on a terminal) to get the interactive experience back. Every
prompt site now fails fast naming the flag that supplies the value instead of blocking on
stdin, so an agent or CI job can no longer hang on a question it cannot answer. Previously
`mj sync init` had four prompts and no escape flags at all, and `mj install --legacy` had
two dozen.

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

BREAKING (behavioral): commands that used to prompt now require either the relevant flag or
`--human-friendly`. `mj sync init` gains `--setup-entity`, `--entity`, `--dir`, and
`--overwrite` to make it fully scriptable.
