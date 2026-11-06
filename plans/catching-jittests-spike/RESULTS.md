# Catching JiTTests — spike results

Design: [`../catching-jittests-design.md`](../catching-jittests-design.md) §15, phase 0.
Each section answers one question with the command run, the raw numbers, and the decision.

| # | Question | Answer | Design change needed? |
|---|---|---|---|
| 1 | Time and disk of the designed build path (job 1 base with remote cache, job 2 head with no token) | pending | |
| 2 | Agent SDK: restrict tools, enforce write path, add `run_test`, cap turns and tokens, report usage | Yes, all six, on `@anthropic-ai/claude-agent-sdk` 0.3.318 (needs zod 4). Two corrections to the planned options: restrict built-ins with `tools`, not `allowedTools`; keep `Write`/`Edit` out of `allowedTools`, or `canUseTool` is skipped and the write guard does nothing. Per-message `output_tokens` undercount; budget on input + cache tokens. See §2 | No fallback. Yes (small): Task code uses `tools` + `permissionMode: 'default'`, keeps `Write`/`Edit` out of `allowedTools`, and catches the throw after max-turns and abort (§2) |
| 3 | Sandbox holds on `ubuntu-latest` (key, /proc, network, cache token) | pending | |
| 4 | Provider classes work with no database (Anthropic, OpenAI with logprobs, Gemini) | pending | |
| 5 | `INTEGRATION_LIVE_MODEL_KEYS` includes an OpenAI key | pending | |
| 6 | vitest JSON reporter gives assertion, expected, actual, stack | Partly. vitest 4.0.18 `--reporter=json` gives one string per failure (`failureMessages[0]` = `error.stack`): assertion line and stack yes; no `expected`/`actual` fields and no diff; a timeout reads `Error: STACK_TRACE_ERROR`, not `Test timed out`. The error object in a custom reporter has all of them as fields. See §6 | Yes (proposed): Task 1.10 reads a small custom reporter, not `--reporter=json` (§6) |
| 7 | File-swap path gives the same verdicts as two worktrees | Same results on 3 one-package PRs where all tests passed (1207/627/1275 tests, 0 differences each); no failing test compared (§7) | No |
| 8 | Host `pnpm fetch` (lockfile only) + sandbox `pnpm install --offline` + `pnpm rebuild` builds on the real lockfile; copy-import time and disk; install-container fallback if fetch fails; turbo `--cache=local:rw,remote:r` works | pending | |

## 2. Agent SDK limits

**Setup.** `@anthropic-ai/claude-agent-sdk@0.3.318` in `/tmp/jit-q2` (outside the repo). It has a peer dependency `zod@^4.0.0`, so `zod@3.25.76` fails with `ERESOLVE`; the runs used `zod@4.6.7`. Model `claude-haiku-5-5`. Probe: [`q2-agent-sdk.mjs`](q2-agent-sdk.mjs), run against a base checkout. `run_test` is a stub that returns fixed JSON. Env vars `MAX_TURNS`, `TOKEN_BUDGET` and `WRITE_IN_ALLOWED` select each run.

**Option names.** The typings (`sdk.d.ts`) use the same names as the plan: `allowedTools`, `disallowedTools`, `canUseTool`, `maxTurns`, `settingSources`, `mcpServers`, `abortController`, `createSdkMcpServer`, `tool`, `total_cost_usd`. Two meanings differ from what the plan assumed:

- `allowedTools` does **not** restrict tools. It auto-approves them ("To restrict which tools are available, use the `tools` option instead"). The restricting option is `tools: string[]`.
- A bare name in `allowedTools` is approved before `canUseTool` runs. The SDK prints a warning at start: `[CLAUDE_SDK_CAN_USE_TOOL_SHADOWED] Warning: canUseTool will not be invoked for: Read, Grep, Glob, Write, Edit, mcp__jit__run_test. Bare allowedTools entries auto-approve the whole tool before the callback is consulted.`

Also present and not used here: `maxBudgetUsd` (result subtype `error_max_budget_usd`) and `permissionMode` (when omitted, the mode can be `auto`, where a classifier decides; the probe sets `'default'` so `canUseTool` decides).

**Runs.** Four runs, all `node q2-agent-sdk.mjs <checkout>`. `total_cost_usd` per run: $0.0026, $0.0018, $0.0015, none (aborted).

| Run | Config | Result |
|---|---|---|
| 1 | `WRITE_IN_ALLOWED=1` (the plan's options: `Write`/`Edit` in `allowedTools`), `maxTurns: 12` | **Write guard failed**: `canUseToolCalls: []`, `files.outsideFileWritten: true` |
| 2 | `Write`/`Edit` only in `tools`, `maxTurns: 12` | All of (a)–(c), (e) shown |
| 3 | as run 2, `MAX_TURNS=2` | `subtype: "error_max_turns"` (d) |
| 4 | as run 2, `TOKEN_BUDGET=3000` | aborted after the first API message (f) |

**(a) Tools limited — yes.** With `tools: ['Read','Grep','Glob','Write','Edit']` and `disallowedTools: ['Bash', …]`, the init message lists only these tools (run 2):

```
{"init": {"model": "claude-haiku-5-5", "permissionMode": "default", "tools": ["Edit", "Glob", "Grep", "Read", "Write", "mcp__jit__run_test"]}}
```

Bash is not in the list, so the model never emitted a `Bash` tool call in any run (no `Bash` entry in any trace).

**(b) Write path enforced — yes, only with `Write`/`Edit` out of `allowedTools`.** Run 1 (plan's options): `canUseTool` was never called and the outside write went through:

```
"toolResult": {"is_error": false, "text": "File created successfully at: …/packages/MJGlobal/src/probe.ts …"}
"canUseToolCalls": [], "denied": [], "files": {"testFileWritten": true, "outsideFileWritten": true}
```

Run 2 (`Write`/`Edit` only in `tools`): `canUseTool` saw both writes, allowed the one under `__tests__/jit/` and denied the other:

```
"toolResult": {"is_error": false, "text": "File created successfully at: …/packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts …"}
"toolResult": {"is_error": true, "text": "Writes are allowed only under packages/<X>/src/__tests__/jit/"}
"permission_denials": [{"tool_name": "Write", "tool_input": {"file_path": "…/packages/MJGlobal/src/probe.ts", …}}]
"canUseToolCalls": ["Write", "Write"], "files": {"testFileWritten": true, "outsideFileWritten": false}
```

**(c) `run_test` called and its JSON returned — yes** (run 2):

```
"toolUses": ["mcp__jit__run_test {\"file\":\"packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts\"}"]
"toolResult": {"is_error": false, "text": "{\"file\":\"packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts\",\"ran\":true,\"passed\":0,\"failed\":0,\"note\":\"stub\"}"}
```

**(d) `maxTurns` honored — yes** (run 3, `maxTurns: 2`). The session stopped after two API messages (write, then `run_test`). The `result` message arrives, and then the iterator **throws**:

```
"result": {"subtype": "error_max_turns", "is_error": true, "num_turns": 3, "total_cost_usd": 0.00150495, …}
"thrown": "Error: Claude Code returned an error result: Reached maximum number of turns (2)"
```

`num_turns` (3) counts differently from `maxTurns` (2); it is not the number of API messages.

**(e) Usage reported — yes, with one limit.** Each assistant message carries `usage`; the final `result` carries `usage` and `total_cost_usd` (run 2):

```
assistant J8aD2sx6: {"input_tokens": 2, "output_tokens": 3, "cache_read_input_tokens": 4574, "cache_creation_input_tokens": 4221}
result: {"usage": {"input_tokens": 4, "cache_creation_input_tokens": 5069, "cache_read_input_tokens": 8300, "output_tokens": 1061}, "total_cost_usd": 0.0017681}
counted (deduped by message id): {"inputTokens": 13373, "outputTokens": 5}
```

- One API message arrives as several SDK messages (one per content block) with the same `id` and `usage`. Count each `id` once. The plan's code counted each block (run 1: 7 counted turns for 3 distinct API messages).
- `input_tokens` is only the uncached part (2). Input must be `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Summed this way, the running total (13373) equals the final `result.usage` (4 + 5069 + 8300).
- Per-message `output_tokens` are the values at stream start (5 counted vs 1061 final). A mid-run budget can count input exactly but not output. Output is the smaller share here; the final figures in `result` are exact.

**(f) Abort on token budget stops the session — yes** (run 4, `TOKEN_BUDGET: 3000`). The first API message (4571 input tokens) crossed the budget and the host called `abort()`. The pending `Write` was refused and nothing was written; the iterator then threw. There is **no `result` message** after an abort, so no `total_cost_usd` from the SDK:

```
{"abort": {"inputTokens": 4571, "outputTokens": 8}}
"toolResult": {"is_error": true, "text": "Tool permission request failed: AbortError: Stream closed"}
"result": {"thrown": "Error: Claude Code process aborted by user"}
"counted": {"inputTokens": 12885, "outputTokens": 11, "turns": 2, "aborted": true}, "files": {"testFileWritten": false}
```

One more API message (`hZMhUZG7`) streamed after `abort()` before the process stopped. The overrun is at most about one model call.

**Decision.** The Agent SDK meets the design; no fallback to a hand-written loop on `@anthropic-ai/sdk` is needed. The JiT agent code must:

1. Restrict built-ins with `tools`, deny the rest with `disallowedTools`, and set `permissionMode: 'default'`.
2. Keep `Write` and `Edit` out of `allowedTools` so `canUseTool` sees every write (or add a `PreToolUse` hook, which the SDK warning names as the way to gate every call).
3. Count usage once per message `id`, with cache tokens as input. Keep the host's own count, because an aborted run has no `result`. `maxBudgetUsd` is a built-in alternative (not tested here).
4. Catch the throw that follows `error_max_turns` and abort, and read the `result` message (when there is one) before the throw.

## 6. vitest JSON reporter

**Setup.** vitest 4.0.18. A throwaway test `packages/MJGlobal/src/__tests__/jit/q6.jit.test.ts` with three failing cases: a `toEqual` mismatch, a thrown `TypeError`, and a 50 ms timeout (deleted after the run).

```bash
pnpm --filter @memberjunction/global exec vitest run src/__tests__/jit/q6.jit.test.ts --reporter=json --outputFile=/tmp/q6.json --sequence.seed=1 ; echo "exit=$?"
# JSON report written to /tmp/q6.json
# exit=1
node plans/catching-jittests-spike/q6-vitest-json.mjs /tmp/q6.json
```

Output of `q6-vitest-json.mjs`, edited for length: paths are shortened to `<wt>` = worktree root and `<runner>` = `node_modules/.pnpm/@vitest+runner@4.0.18/node_modules/@vitest/runner/dist`; for the first two tests the script printed 6 lines per message, and frames after the second `at` line are cut (`...`). The timeout message is shown in full (6 lines):

```
top-level keys: [ 'numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites',
  'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'snapshot',
  'startTime', 'success', 'testResults' ]
file: <wt>/packages/MJGlobal/src/__tests__/jit/q6.jit.test.ts status: failed
   failed | q6 probe fails on a value mismatch | 4.837708000000006 ms
     msg: AssertionError: expected { a: 1, b: [ 1, 2 ] } to deeply equal { a: 2, b: [ 1 ] }
              at <wt>/packages/MJGlobal/src/__tests__/jit/q6.jit.test.ts:5:33
              at file://<wt>/<runner>/index.js:145:11
              ...
   failed | q6 probe fails by throwing | 0.2835419999999971 ms
     msg: TypeError: o.f is not a function
              at <wt>/packages/MJGlobal/src/__tests__/jit/q6.jit.test.ts:9:7
              at file://<wt>/<runner>/index.js:145:11
              ...
   failed | q6 probe times out | 51.83 ms
     msg: Error: STACK_TRACE_ERROR
              at task (file://<wt>/<runner>/index.js:796:27)
              at Object.<anonymous> (file://<wt>/<runner>/index.js:823:16)
              at Object.<anonymous> (file://<wt>/<runner>/index.js:615:28)
              at chain (file://<wt>/<runner>/chunk-tasks.js:9:14)
              at <wt>/packages/MJGlobal/src/__tests__/jit/q6.jit.test.ts:11:3
```

Full JSON shape (from `/tmp/q6.json`):

- File entry keys: `assertionResults`, `startTime`, `endTime`, `status`, `message` (`""`), `name`.
- Each `assertionResults[]` entry has only `ancestorTitles`, `fullName`, `status`, `title`, `duration`, `failureMessages`, `meta` (`{}`). There is no `expected`, `actual` or `diff` field. The reporter also writes `location: t.location` (`vitest/dist/chunks/index.M8mOzt4Y.js:3412`), but it is filled only when `includeTaskLocation` is on (`<runner>/index.js:801`), so it was absent here; when filled, it points to where the test is defined, not where it failed.
- `failureMessages` has one string per error. vitest builds it as `t.result?.errors?.map((e) => e.stack || e.message)` (`vitest/dist/chunks/index.M8mOzt4Y.js:3411`), so the string is the full `error.stack`: first line `Name: message`, then `at` frames (10 for the first two cases).

**Findings.**

1. **Assertion:** yes, on the first line of `failureMessages[0]` (`AssertionError: expected {…} to deeply equal {…}`).
2. **Expected / actual:** not as fields, and not as `- Expected` / `+ Received` diff lines. The JSON string has no diff. The only trace is inside the one-line assertion text, in chai's `inspect` form (chai can truncate large values there; not tested here).
3. **Stack:** yes, inside the message string. The first frame that points at the test file is `<file>:5:33` / `<file>:9:7` for the first two cases. Lines after it are vitest runner frames.
4. **Timeout:** the JSON string is `Error: STACK_TRACE_ERROR` plus the stack of the test's *definition* (`q6.jit.test.ts:11:3`, the `it(` call). The text `Test timed out in 50ms` does not appear. Cause: vitest creates `new Error("STACK_TRACE_ERROR")` when it registers the test (`<runner>/index.js:796`). On timeout, `makeTimeoutError` (`<runner>/index.js:1326`) creates a new `Error` with the timeout message, then sets `error.stack = stackTraceError.stack.replace(error.message, stackTraceError.message)`. The registration stack does not contain the timeout message, so the replace changes nothing and the stack keeps `Error: STACK_TRACE_ERROR`. The JSON reporter prefers `.stack`. A parser cannot tell a timeout from a real `Error("STACK_TRACE_ERROR")` except by that literal text.

**Cross-check: the data exists on the error object.** The default reporter prints the diff and `Error: Test timed out in 50ms.` for the same run. A throwaway custom reporter (`onTestCaseResult(tc)` → `tc.result().errors`, run with `--reporter=<path>.mjs`, not committed) printed:

```
=== q6 probe > fails on a value mismatch
error keys: [ 'message', 'actual', 'expected', 'showDiff', 'operator', 'diff', 'name', 'ok', 'stack', 'stacks' ]
 "name": "AssertionError",
 "message": "expected { a: 1, b: [ 1, 2 ] } to deeply equal { a: 2, b: [ 1 ] }",
 "expected": "Object {\n  \"a\": 2,\n  \"b\": Array [\n    1,\n  ],\n}",
 "actual": "Object {\n  \"a\": 1,\n  \"b\": Array [\n    1,\n    2,\n  ],\n}",
 "diff": "\u001b[32m- Expected\u001b[39m\n\u001b[31m+ Received\u001b[39m\n\n ... (ANSI-coloured)",
 "stacks0": { "method": "", "file": "<wt>/packages/MJGlobal/src/__tests__/jit/q6.jit.test.ts", "line": 5, "column": 33 }
=== q6 probe > fails by throwing
error keys: [ 'stack', 'message', 'constructor', 'name', 'toString', 'stacks' ]
 "name": "TypeError", "message": "o.f is not a function",
 "stacks0": { "method": "", "file": "<wt>/.../q6.jit.test.ts", "line": 9, "column": 7 }
=== q6 probe > times out
error keys: [ 'stack', 'message', 'constructor', 'name', 'toString', 'stacks' ]
 "name": "Error",
 "message": "Test timed out in 50ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with \"testTimeout\".",
 "stackFirstLine": "Error: STACK_TRACE_ERROR",
 "stacks0": { "method": "", "file": "<wt>/.../q6.jit.test.ts", "line": 11, "column": 3 }
```

So structured fields exist (`name`, `message`, `expected`, `actual`, `diff`, and `stacks[0]` = parsed first frame `{file, line, column}`), but only to a reporter running inside vitest, not in `--reporter=json` output.

**Proposed decision (pending phase-0 exit).** The plan's rule was: parse `failureMessages[0]` with regular expressions, and use a structured field if one exists. Structured fields exist, but only on the error object, so:

- Task 1.10 would ship a small custom vitest reporter (file passed with `--reporter=<path>`) that writes, per test, `fullName`, `status`, `duration` and, per error, `name`, `message`, `expected`, `actual`, `stacks[0]`. `diff` is dropped or ANSI-stripped. `VitestJsonReport` parses that file.
- Fallback when the custom reporter cannot be used: parse `failureMessages[0]`. Assertion = first line; first stack frame = first `at` line whose path is not under `node_modules`; `expected`/`actual` = null (do not parse chai's truncated text); a first line of exactly `Error: STACK_TRACE_ERROR` means a timeout. Note: hook timeouts give the same first line, because hooks also use `new Error("STACK_TRACE_ERROR")` (`<runner>/index.js:416, 441, 462, 489`, and `:511, :538` for `onTestFailed`/`onTestFinished`), so the fallback cannot tell a test timeout from a hook timeout.
- Design change: `catching-jittests-design.md` and Task 1.10 would name the custom reporter instead of `--reporter=json`. Pending: the controller must confirm before the design doc and Task 1.10 change.

## 7. File-swap path vs two worktrees

Script: [`q7-fileswap.sh`](q7-fileswap.sh). For merge commit `M`, base is `M^1`, head is `M`.
Run (a) is the package's existing vitest suite in a fully built head worktree. Run (b) is the same
suite in a built base worktree after head's changed `<pkg>/src` files are copied in, with no rebuild.
The script compares the status of each test by file and full name.

```bash
bash plans/catching-jittests-spike/q7-fileswap.sh "$M^1" "$M" "$PKGDIR"
```

| PR | Merge SHA | Package | Files copied (src) | `tests:` | `differences:` | Wall time |
|---|---|---|---|---|---|---|
| #6368 | `a163aeafec` | `packages/SQLConverter` | 9 (6 source, 3 test) | 1207 | 0 | 712 s |
| #6112 | `38e098f6f2` | `packages/OpenApp/Engine` | 4 (2 source, 2 test) | 627 | 0 | 181 s |
| #6371 | `27b9ac776b` | `packages/MJCoreEntitiesServer` | 2 (1 source, 1 test) | 1275 | 0 | 267 s |

Raw output (last line of each run):

```
[11:55:05] tests: 1207 differences: 0     # SQLConverter
[11:58:04] tests: 627 differences: 0      # OpenApp/Engine
[12:02:31] tests: 1275 differences: 0     # MJCoreEntitiesServer
```

Report totals were the same in (a) and (b) for each PR: SQLConverter 1204 pass, 3 skipped, 0 fail;
OpenApp/Engine 627 pass; MJCoreEntitiesServer 1275 pass. Each install took about 25 s (`pnpm install
--frozen-lockfile`, lockfile resolution skipped). Wall time covers two installs, two builds, and two
vitest runs.

Notes:
- Only passing results were compared. In all three PRs every test passed (or was skipped) in both runs,
  so no failing test was compared. The PRs' new and changed test files exist in run (b) only because the
  swap copied them, and they passed there. This does not prove that the copied source was loaded: it was
  not checked whether those tests fail on base.
- Every one of these PRs also adds a `.changeset/*.md` file. Almost no merge in the last 200 touches
  only `packages/<X>/src`, so the PR filter ignored `.changeset/` files. The script diffs only
  `<pkg>/src`, so changesets have no effect on the result.
- The tests in these packages import the package's own source by relative path (checked by grep).
  `grep -rn "@memberjunction/<name>'" <pkg>/src` for each package's own name and
  `grep -rlE "from '@memberjunction/[^']+/dist" <pkg>/src` both found 0 matches. The grep ran on the
  current branch checkout, not on each merge commit. A package whose tests import itself by name
  (resolved to base `dist/`) would not see the copied files.
- The script runs only the changed package's own tests. Packages that depend on the changed package may
  load it from `dist/`, but their tests are not run, so they do not affect this result. Testing such a
  dependent package needs a rebuild of the changed package; the file-swap path does not cover that.

Shapes the file-swap path (as scripted) does not cover. None of the three PRs had these shapes:
- A PR that deletes or renames a `src` file: `cp` from head fails and `pipefail` stops the script.
- A changed `package.json`, vitest config, or any other file outside `<pkg>/src`: never copied.
- Tests that import the package by its own name, or tests in another package that load the changed
  package from `dist/` (see notes above).

**Decision:** the file-swap path gave the same results as two worktrees on 3 one-package, `src`-only
PRs where all tests passed; no failing test compared. No design change. Keep the limits above.
