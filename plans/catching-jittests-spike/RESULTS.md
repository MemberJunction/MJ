# Catching JiTTests — spike results

Design: [`../catching-jittests-design.md`](../catching-jittests-design.md) §15, phase 0.
Each section answers one question with the command run, the raw numbers, and the decision.

| # | Question | Answer | Design change needed? |
|---|---|---|---|
| 1 | Time and disk of the designed build path (job 1 base with remote cache, job 2 head with no token) | pending | |
| 2 | Agent SDK: restrict tools, enforce write path, add `run_test`, cap turns and tokens, report usage | pending | |
| 3 | Sandbox holds on `ubuntu-latest` (key, /proc, network, cache token) | pending | |
| 4 | Provider classes work with no database (Anthropic, OpenAI with logprobs, Gemini) | pending | |
| 5 | `INTEGRATION_LIVE_MODEL_KEYS` includes an OpenAI key | pending | |
| 6 | vitest JSON reporter gives assertion, expected, actual, stack | Partly. vitest 4.0.18 `--reporter=json` gives one string per failure (`failureMessages[0]` = `error.stack`): assertion line and stack yes; no `expected`/`actual` fields and no diff; a timeout reads `Error: STACK_TRACE_ERROR`, not `Test timed out`. The error object in a custom reporter has all of them as fields. See §6 | Yes (proposed): Task 1.10 reads a small custom reporter, not `--reporter=json` (§6) |
| 7 | File-swap path gives the same verdicts as two worktrees | pending | |
| 8 | Host `pnpm fetch` (lockfile only) + sandbox `pnpm install --offline` + `pnpm rebuild` builds on the real lockfile; copy-import time and disk; install-container fallback if fetch fails; turbo `--cache=local:rw,remote:r` works | pending | |

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
