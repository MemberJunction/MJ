---
"@memberjunction/cli": patch
"@memberjunction/ai-cli": patch
---

Fix five gaps in the agent-first CLI work, found in review.

**`-f` works again on `mj test *`.** Widening `--format` to the canonical vocabulary had
swapped in a flag with no short form, so `mj test run -f json` — and the same on `list`,
`history`, `compare`, `validate`, `suite`, and `regression compare` — started failing with
"Nonexistent flag". Widening the accepted *values* must not narrow the accepted
*spellings*; `-f` is restored on all seven. The `mj ai` family deliberately keeps no `-f`:
`--format` is new there, and `mj ai audit agent-run` already spends `-f` on `--file`.

**`mj ai agents run --chat` no longer hangs when spawned.** It went straight into an stdin
REPL without passing through the interactivity guard. It now refuses up front — before
loading the AI services — and points at `--prompt`, which does work headlessly.

**`mj install` fails before it writes anything.** The guard lived in the prompt handler, so
a non-interactive install got as far as scaffolding files and only then hit the version
picker it could not answer. A preflight check now refuses at the start, leaving the target
directory untouched. Relatedly, the CLI no longer registers its interactive prompt bridge
under `--yes`: it was racing the engine's own auto-resolver safety net and could turn a
working headless install into an exit(1).

**Machine output stays machine-readable.** `mj ai actions run --dry-run` printed coloured
prose regardless of `--format`, and an empty `mj ai agents list` / `actions list` returned
the sentence "No agents found." even under `--format=json`, which no JSON parser accepts.
The dry run now renders through the resolved formatter, and an empty list is `[]` in json
mode while keeping the readable sentence for humans.

**`mj sync file-reset` validates before it connects.** It opened a database connection and
loaded the sync engine before checking whether `--sections` or `--all` was supplied, so a
run missing them paid for a full connection just to be told which flag to pass. All input
resolution now happens first.
