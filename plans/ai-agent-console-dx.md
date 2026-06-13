# AI-Agent-Friendly Console DX — `mj` CLI Output Improvements

**Branch:** `plan/ai-agent-console-dx`  
**Status:** Plan (pre-build) — for review / discussion  
**Author:** Pranav (with Claude), 2026-06-13  
**Related work:** `chore(codegen): quiet startup chatter + add live/total timing` (e776c117d0), `fix mj sync push always exiting with code 0` (046633616c)

---

## 1. Problem

`mj codegen` and `mj sync push/pull` are run constantly — by humans and by AI coding agents (Claude Code, OpenCode, etc.) alike. Amith's recent DX pass made these commands dramatically better for humans: clean spinners, live timers, quiet startup noise, a visible final summary. That work is great and this builds on it.

But AI agents hit a different set of friction points:

1. **No machine-readable output.** The summary is human-readable text with chalk colors and spinner control sequences. When an agent captures `mj sync push` output via a shell call, it gets something like:

   ```
   [2K[1G[36m⠴[39m Loading configuration (0.3s)[2K[1G✔ Configuration and metadata loaded
   ...
   ┌─ Push Summary ─────────────────────────┐
   │  ✔ Created:   3                        │
   │  ✔ Updated:   8                        │
   │  ─ Unchanged: 42                       │
   │  ✗ Errors:    1                        │
   └────────────────────────────────────────┘
   ```

   To check whether the push succeeded and which entities failed, the agent has to parse human-oriented box-drawing and color codes. This is fragile and error-prone.

2. **Errors are interleaved mid-run, not collected.** When a record fails to sync, the error message appears inline between spinner lines. An agent has to scan the whole output rather than read a clean error list at the end.

3. **The figlet banner burns context.** The ANSI-art banner at the start of `mj sync` takes several hundred characters of captured output before any useful content. On `mj codegen` this is already suppressible via `--quiet`; on `mj sync` it isn't.

4. **`--ci` is halfway there but not enough.** `--ci` suppresses interactive prompts and sets a non-zero exit code on failure — the right building block, but it still produces the same human-readable text output.

The exit-code fix (always-0 bug) is now merged. That was the most critical gap. This plan covers the remaining agent-legibility work.

---

## 2. What Already Exists (Leverage Points)

| Existing asset | Where | Notes |
|---|---|---|
| `formatValidationResultAsJson()` | `FormattingService.ts:8` | Full JSON serialization for validation results already written |
| `--dry-run` flag | `sync/push.ts` | Exists — safe to combine with `--format=json` |
| `--ci` flag | `sync/push.ts` | No-prompts mode — good companion to `--format=json` |
| `--quiet` flag | `mj codegen` | Suppresses figlet banner on codegen already |
| `result` object | `sync/push.ts:212` | `{ created, updated, unchanged, deleted, skipped, deferred, errors, warnings }` already computed |
| `FormattingService` | `MetadataSync/src/services/` | Formatting is already separated from command logic |
| Non-TTY detection | `ora-classic` | Spinner auto-disables when stdout is not a TTY — chalk also auto-strips colors in non-TTY via `chalk.level` |

The implementation surface is small — the data is already collected, the JSON path is partially written, and the TTY detection is already in place. This is mostly wiring.

---

## 3. Confirmed Decisions

| # | Decision |
|---|---|
| D1 | **`--format=json` is the primary lever.** A single flag changes the output contract: no spinners, no colors, no box-drawing — just a JSON object on stdout when done. Errors go to stderr OR are included in the JSON `errors` array (both, actually — see D3). |
| D2 | **JSON to stdout, decorative output to stderr in `--format=json` mode.** This follows Unix convention: piping `mj sync push --format=json \| jq .errors` works cleanly. Spinner/progress messages move to stderr so they don't corrupt the JSON stream. |
| D3 | **JSON includes error details, not just a count.** The current summary gives `errors: 1`. The JSON output gives the full list of what failed and why — no need for `--verbose` to diagnose failures. |
| D4 | **`--ci` automatically implies `--format=json` behavior for output.** CI pipelines are the canonical non-human consumer. `--ci` keeps its no-prompts semantics and gains the JSON output contract. Backwards-compatible: existing `--ci` users get cleaner parseable output. |
| D5 | **`--no-banner` on `mj sync` commands** (same as `--quiet` on `mj codegen`). The figlet banner has no place in piped or CI output. |
| D6 | **Do not change non-`--format=json` output.** The human console experience Amith just improved stays intact. This adds a parallel machine-readable path — it doesn't modify the existing one. |
| D7 | **`--format` is the extensibility point, not a boolean `--json`.** `--format=json` today; `--format=jsonl` (one JSON object per record, streaming) is possible later. `--format=text` is the default (current behavior). |

---

## 4. Proposed JSON Schema

### `mj sync push --format=json`

```typescript
interface SyncPushResult {
  success: boolean;
  command: 'sync:push' | 'sync:pull';
  durationSeconds: number;
  stats: {
    created: number;
    updated: number;
    unchanged: number;
    deleted: number;
    skipped: number;
    deferred: number;
    errors: number;
    warnings: number;
  };
  errorDetails: Array<{
    entity: string;
    file: string;
    message: string;
  }>;
  warningDetails: string[];
  sqlLogPath?: string; // relative path if SQL log was written
}
```

**Example output:**
```json
{
  "success": false,
  "command": "sync:push",
  "durationSeconds": 14.2,
  "stats": {
    "created": 3, "updated": 8, "unchanged": 42,
    "deleted": 0, "skipped": 2, "deferred": 0,
    "errors": 1, "warnings": 0
  },
  "errorDetails": [
    {
      "entity": "MJ: AI Agent Prompts",
      "file": "ai-agent-prompts/.ai-agent-prompts.json",
      "message": "FK constraint failed: referenced AgentID does not exist"
    }
  ],
  "warningDetails": [],
  "sqlLogPath": ".mj-sync/push-2026-06-13T14-22-05.sql"
}
```

### `mj codegen --format=json`

```typescript
interface CodeGenResult {
  success: boolean;
  command: 'codegen';
  durationSeconds: number;
  entityCount: number;
  skippedDb: boolean;
  skippedFiles: boolean;
  errors: Array<{ phase: string; message: string }>;
  outputFiles: string[]; // generated file paths (relative)
}
```

---

## 5. Scope and Phases

This is a small, contained DX improvement. One phase is sufficient.

### Phase 1 — `--format=json` + `--no-banner` on `mj sync` + `--ci` implies JSON

**Files touched:**

| File | Change |
|---|---|
| `packages/MetadataSync/src/services/FormattingService.ts` | Add `formatSyncSummaryAsJson(operation, stats)` method |
| `packages/MJCLI/src/commands/sync/push.ts` | Add `--format` flag; in json mode: redirect spinner to stderr, call `formatSyncSummaryAsJson`, write to stdout; add `--no-banner` |
| `packages/MJCLI/src/commands/sync/pull.ts` | Same `--format` and `--no-banner` additions |
| `packages/MJCLI/src/commands/codegen/index.ts` | Add `--format` flag; on completion, emit JSON summary; `--quiet` already suppresses banner |
| `packages/CodeGenLib/src/runCodeGen.ts` | Return structured result object from `runMemberJunctionCodeGeneration()` so the CLI command can serialize it |
| Tests | Add `FormattingService.formatSyncSummaryAsJson()` unit tests |

**What is NOT in scope:**
- `mj sync pull` detailed per-record output (same pattern as push, straightforward)
- `--format=jsonl` streaming mode (future)
- Any changes to human-readable output (D6 — don't touch it)
- `mj migrate`, `mj doctor`, or other commands (separate PRs if warranted)

**Estimated diff:** ~150–200 lines across 5–6 files. No new packages, no schema changes.

---

## 6. Usage Examples for AI Agents

After this change, an AI agent running MJ commands can:

```bash
# Check if sync succeeded and how many errors
result=$(mj sync push --ci --format=json --dir=ai-agents)
errors=$(echo "$result" | jq '.stats.errors')
if [ "$errors" -gt 0 ]; then
  echo "$result" | jq '.errorDetails[]'
fi

# Run codegen and extract entity count
mj codegen --format=json | jq '.entityCount'

# CI pipeline — push and fail fast, structured log for downstream
mj sync push --ci --format=json 2>/dev/null | tee sync-result.json
jq -e '.success' sync-result.json  # non-zero exit if success=false
```

---

## 7. Open Questions

1. **Should `--ci` output plain text (current) or JSON (D4)?** Making `--ci` imply `--format=json` is a behavior change for existing CI pipelines that parse the text output. Might be safer to leave `--ci` alone and require explicit `--format=json`. The team's CI pipelines should inform this decision.

2. **Error details shape in `push.ts`.** Currently `result.errors` is a count and `result.warnings` is a string array. Are per-record error objects already available from `PushService`, or does the error detail need to be captured during the `onError` callback? Worth confirming before implementation.

3. **`mj codegen` structured result.** `runMemberJunctionCodeGeneration()` currently returns `void`. Making it return a result object is the right fix, but requires verifying it doesn't break any callers (likely just the CLI command).
