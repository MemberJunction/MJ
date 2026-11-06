# Catching JiTTests — spike results

Design: [`../catching-jittests-design.md`](../catching-jittests-design.md) §15, phase 0.
Each section answers one question with the command run, the raw numbers, and the decision.

| # | Question | Answer | Design change needed? |
|---|---|---|---|
| 1 | Time and disk of the designed build path (job 1 base with remote cache, job 2 head with no token) | pending | |
| 2 | Agent SDK: restrict tools, enforce write path, add `run_test`, cap turns and tokens, report usage | pending | |
| 3 | Sandbox holds on `ubuntu-latest` (key, /proc, network, cache token) | pending | |
| 4 | Provider classes work with no database (Anthropic, OpenAI with logprobs, Gemini) | Partly. All three classes import and construct from a bare key with no database and no warnings. Gemini `gemini-3.5-flash-lite` answered `"Yes"`. Anthropic reached the API but got 401 `invalid x-api-key` (the same key gets 401 from a direct `curl`, so the key is bad, not MJ); model id `claude-haiku-5-5` not yet confirmed. OpenAI not run (no `OPENAI_API_KEY`), so `top_logprobs` is still open. Imports resolve only from a scratch package, not from the repo root (§4) | Open: re-run Anthropic with a valid key and OpenAI with a key before phase-0 exit |
| 5 | `INTEGRATION_LIVE_MODEL_KEYS` includes an OpenAI key | pending — the secret is not readable from a branch; to be asked by the user at the phase-0 exit (date 2026-11-06). The local developer `.env` had no OpenAI key either (§5) | If no OpenAI key: design Q2 becomes a request for a new `OPENAI_API_KEY` secret |
| 6 | vitest JSON reporter gives assertion, expected, actual, stack | Partly. vitest 4.0.18 `--reporter=json` gives one string per failure (`failureMessages[0]` = `error.stack`): assertion line and stack yes; no `expected`/`actual` fields and no diff; a timeout reads `Error: STACK_TRACE_ERROR`, not `Test timed out`. The error object in a custom reporter has all of them as fields. See §6 | Yes (proposed): Task 1.10 reads a small custom reporter, not `--reporter=json` (§6) |
| 7 | File-swap path gives the same verdicts as two worktrees | Same results on 3 one-package PRs where all tests passed (1207/627/1275 tests, 0 differences each); no failing test compared (§7) | No |
| 8 | Host `pnpm fetch` (lockfile only) + sandbox `pnpm install --offline` + `pnpm rebuild` builds on the real lockfile; copy-import time and disk; install-container fallback if fetch fails; turbo `--cache=local:rw,remote:r` works | pending | |

## 4. Provider classes with no database

Script: [`q4-providers.mjs`](q4-providers.mjs). It builds `AnthropicLLM`, `OpenAILLM` and `GeminiLLM`
from a bare API key (from the environment) and makes one `ChatCompletion` call each
(`temperature: 0`, `maxOutputTokens: 5`, prompt `Reply with the single word Yes.`). No database, no
`mj.config.cjs`, no MJ metadata load. A provider whose key variable is unset is skipped.

**Build.**

```bash
pnpm install --frozen-lockfile        # Done in 24.1s
npx turbo run build --filter=@memberjunction/ai-anthropic --filter=@memberjunction/ai-openai --filter=@memberjunction/ai-gemini
# Tasks: 8 successful, 8 total; Cached: 0 cached; Time: 8.497s
# (global, ai, sql-dialect, core, unit-testing, ai-anthropic, ai-gemini, ai-openai)
```

**Import resolution.** Running from the repo root fails: the root `package.json` does not depend on the
providers, so `node plans/catching-jittests-spike/q4-providers.mjs` gives
`ERR_MODULE_NOT_FOUND: Cannot find package '@memberjunction/ai-anthropic'`. The `NODE_PATH=...` form
fails the same way (ESM `import` ignores `NODE_PATH`, and those folders hold only the providers'
dependencies, not the providers). What worked: a scratch package outside the repo
(`package.json` with `"type": "module"`, and `node_modules/@memberjunction/ai-{anthropic,openai,gemini}`
as symlinks to `packages/AI/Providers/{Anthropic,OpenAI,Gemini}`), with the script copied into it and
run there. Node follows the symlinks to the real package folders, so each provider's own
dependencies resolve from its `node_modules`.

```bash
node q4-providers.mjs      # in the scratch package, keys exported in the same shell
```

**Output** (complete; nothing else was printed to stdout or stderr):

```
anthropic | model: claude-haiku-5-5 | success: false | text: undefined | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 0, completionTokens: 0 } | ms: 214
anthropic | statusText: error | errorMessage: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},...}
openai | skipped: no OPENAI_API_KEY
gemini | model: gemini-3.5-flash-lite | success: true | text: "Yes" | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 8, completionTokens: 1 } | ms: 662
```

**Per provider.**

| Provider | Constructed with no DB | One call worked | Model string | Notes |
|---|---|---|---|---|
| Anthropic | Yes | No: HTTP 401 `invalid x-api-key` (214 ms) | `claude-haiku-5-5` sent; not confirmed (auth failed first) | The same key gets HTTP 401 from a direct `curl https://api.anthropic.com/v1/models`. The key has the expected `sk-ant-` prefix and no spaces or quotes. So the key is bad; the MJ class sent the request correctly. |
| OpenAI | Not run | Not run | `gpt-5.1-mini` (not sent) | No `OPENAI_API_KEY` was available. Whether OpenAI returns `logprobs.content[0].top_logprobs` through `OpenAILLM` is **still open**. The code path exists: `OpenAILLM` sends `logprobs`/`top_logprobs` when `includeLogProbs`/`topLogProbs` are set and copies `choice.logprobs` into the result (`packages/AI/Providers/OpenAI/src/models/openAI.ts:209-210, 354`). |
| Gemini | Yes | Yes: `"Yes"`, usage 8 prompt / 1 completion tokens, 662 ms | `gemini-3.5-flash-lite` | — |

**Import-time warnings.** None. No `@RegisterClass` or `@memberjunction/global` message was printed when
the three packages were imported.

**Decision.** For the class shape: no design change. The provider classes need only an API key: no
database, no metadata, no config. Still open before phase-0 exit: (1) re-run Anthropic with a valid key
to confirm `claude-haiku-5-5`; (2) run OpenAI with a key to confirm `top_logprobs`. The real package
must declare the provider packages as dependencies (the repo root cannot resolve them).

## 5. OpenAI key in `INTEGRATION_LIVE_MODEL_KEYS`

**Answer: pending.** The secret is not readable from a branch; to be asked by the user at the phase-0
exit (date 2026-11-06). Question to ask a repo admin: does `INTEGRATION_LIVE_MODEL_KEYS` carry an
`AI_VENDOR_API_KEY__OpenAILLM=` line (the dotenv format `integration.yml` documents)?

The local developer `.env` had no OpenAI key either.

If no OpenAI key exists, the design's open question Q2 becomes a request for a new `OPENAI_API_KEY`
secret; the TP Prob judge (Task 1.19) stays as designed.

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
