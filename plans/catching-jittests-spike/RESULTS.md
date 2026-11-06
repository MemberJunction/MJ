# Catching JiTTests — spike results

Design: [`../catching-jittests-design.md`](../catching-jittests-design.md) §15, phase 0.
Each section answers one question with the command run, the raw numbers, and the decision.

| # | Question | Answer | Design change needed? |
|---|---|---|---|
| 1 | Time and disk of the designed build path (job 1 base with remote cache, job 2 head with no token) | On 5 PRs: base install 40–49 s (cold store) + base build 3–10 s, all tasks `HIT/REMOTE`. Head: fetch 9–16 s after a failed lockfile-only try of 32–42 s (§8), sandbox offline install + rebuild + build 52–246 s. Designed path uses 14.0–14.2 GB of disk; 71 GB stays free. Head builds of 80–154 tasks missed 54–117 tasks although the PR reaches only 2–7 of them (cause not found). See §1 | No for time and disk. Open: find why the sandbox build misses tasks the PR does not reach (§1) |
| 2 | Agent SDK: restrict tools, enforce write path, add `run_test`, cap turns and tokens, report usage | Yes, all six, on `@anthropic-ai/claude-agent-sdk` 0.3.318. Restrict built-ins with `tools` (`allowedTools` only auto-approves); keep `Write`/`Edit` out of `allowedTools`, or `canUseTool` is skipped and the write guard does nothing. Per-message `output_tokens` were far below the final count; budget on input + cache tokens. The runs used no API key (`apiKeySource: "none"`, the parent session's login), so the helper's `ANTHROPIC_API_KEY` was not tested. See §2 | No fallback. Yes (small): use `tools` + `permissionMode: 'default'`, keep `Write`/`Edit` out of `allowedTools`, catch the throw after max-turns and abort; the package needs zod 4 (SDK peer `zod@^4`; 24 `packages/` manifests pin `^3.25`); CI must confirm `apiKeySource: "ANTHROPIC_API_KEY"` (§2) |
| 3 | Sandbox holds on `ubuntu-latest` (key, /proc, network, cache token) | Yes. All 10 probes held on `ubuntu-24.04` (2 runs, same output) and on Docker Desktop for Mac: no key in env or /proc, no network, no DNS, no docker socket, no runner vars, read-only mount held, uid 1001 with no sudo inside. Probe 10: host `pnpm fetch` did not run the head's `.pnpmfile.cjs` and the host pnpm stayed 10.33.0; the control (host install) did run it; in the sandbox the pnpmfile ran without the key and pnpm stayed 10.33.0. The runner user itself has passwordless sudo (host only). See §3 | No |
| 4 | Provider classes work with no database (Anthropic, OpenAI with logprobs, Gemini) | Partly. All three classes import and construct from a bare key with no database and no warnings. Gemini `gemini-3.5-flash-lite` answered `"Yes"`. Anthropic reached the API but got 401 `invalid x-api-key` on two runs (the same key gets 401 from a direct `curl`, so the key is bad, not MJ); model id `claude-haiku-5-5` not yet confirmed. OpenAI: `gpt-5.1-mini` does not exist (404, and `OpenAILLM` throws instead of returning `success: false`); `gpt-4o-mini` and `gpt-4.1-mini` return 5 `top_logprobs` on the first token; `gpt-5.4-nano` returns only 1 although 5 were asked. Imports resolve only from a scratch package, not from the repo root (§4) | Yes (proposed): the TP Prob judge model must be one that returns 5 `top_logprobs` (`gpt-4o-mini` or `gpt-4.1-mini`), not `gpt-5.1-mini`. Callers must handle both a thrown error (`OpenAILLM`) and `success: false` (`AnthropicLLM`). The real package must declare the provider packages as dependencies. Open: re-run Anthropic with a valid key |
| 5 | `INTEGRATION_LIVE_MODEL_KEYS` includes an OpenAI key | pending — the secret is not readable from a branch; to be asked by the user at the phase-0 exit (date 2026-11-06). The local developer `.env` had no OpenAI key either (§5) | If no OpenAI key: design Q2 becomes a request for a new `OPENAI_API_KEY` secret |
| 6 | vitest JSON reporter gives assertion, expected, actual, stack | Partly. vitest 4.0.18 `--reporter=json` gives one string per failure (`failureMessages[0]` = `error.stack`): assertion line and stack yes; no `expected`/`actual` fields and no diff; a timeout reads `Error: STACK_TRACE_ERROR`, not `Test timed out`. The error object in a custom reporter has all of them as fields. See §6 | Yes (proposed): Task 1.10 reads a small custom reporter, not `--reporter=json` (§6) |
| 7 | File-swap path gives the same verdicts as two worktrees | Same results on 3 one-package PRs where all tests passed (1207/627/1275 tests, 0 differences each); no failing test compared (§7) | No |
| 8 | Host `pnpm fetch` (lockfile only) + sandbox `pnpm install --offline` + `pnpm rebuild` builds on the real lockfile; copy-import time and disk; install-container fallback if fetch fails; turbo `--cache=local:rw,remote:r` works | Partly. Lockfile-only fetch fails on all 5 PRs: `ERR_PNPM_PATCH_NOT_FOUND` for `patches/type-graphql@2.0.0-beta.3.patch` (the lockfile's `patchedDependencies`). With `patches/` copied too, fetch works (store 3251 MB), the offline install prints `INSTALLED` (copy import 32–57 s), `pnpm rebuild` works offline (4–8 s) and the build exits 0. The install-container fallback also works (install 65–111 s). `remote:r` gave remote hits on every base task. See §8 | Yes (small): the host fetch folder gets the lockfile plus the patch files the lockfile names, each path checked to be inside `patches/`. Fallback not needed |

## 1. Build path time and disk

**Setup.** Workflow `.github/workflows/jit-catch-spike.yml`, job `q1-q8-build`, on `ubuntu-latest` (`ubuntu-24.04`, image 20261101.360.1), script [`q1-q8-build-timing.sh`](q1-q8-build-timing.sh). Run 42287623326 (head `c338efd913`), one matrix job per PR. `workflow_dispatch` was refused (`HTTP 404: workflow jit-catch-spike.yml not found on the default branch`), so the workflow ran from draft PR #6435 (closed after the runs) with a `pull_request` trigger and a matrix of the 5 PRs. `base` = the merge commit's first parent, `head` = the merge commit. One `--filter=<pkg>...` per PR; in the 2-package PRs the named package depends on the other one.

The repo has the turbo remote cache (`TURBO_TEAM: blue-cypress`; the secrets are org-level, so `gh secret list` on the repo does not show them). The pnpm store cache was empty (restore only, nothing saves it), so every base install was a cold download. Free disk at job start: 86013 MB.

| PR | Packages (filter → tasks) | Base install s | Base build s, cache statuses | Head fetch s, store MB | Head sandbox install + rebuild + build s, cache statuses | Peak disk MB | Free disk MB |
|---|---|---|---|---|---|---|---|
| #6368 | 1: sql-converter (4) | 49 | 5, `HIT/REMOTE` 4 | 40 failed + 14 with `patches/`, 3251 | 57 (46 + 6 + 3), `HIT/LOCAL` 3, `MISS` 1 | 13956 (22436 with fallback) | 71258 (62774) |
| #6362 | 2: react-linter, react-test-harness (105) | 49 | 9, `HIT/REMOTE` 105 | 42 failed + 16, 3251 | 213 (57 + 6 + 150), `HIT/LOCAL` 20, `MISS` 85 | 14156 (22742) | 71060 (62470) |
| #6122 | 2: core-entities-server, metadata-sync (154) | 44 | 10, `HIT/REMOTE` 154 | 35 failed + 10, 3251 | 224 (36 + 5 + 179), `HIT/LOCAL` 37, `MISS` 117 | 14205 (22816) | 71000 (62385) |
| #6357 | MJCore: core (3) | 40 | 3, `HIT/REMOTE` 3 | 33 failed + 13, 3251 | 52 (40 + 4 + 4), `HIT/LOCAL` 2, `MISS` 1 | 13968 (22456) | 71247 (62755) |
| #6280 | Angular: ng-markdown, ng-conversations (80) | 47 | 6, `HIT/REMOTE` 80 | 32 failed + 9, 3251 | 246 (32 + 8 + 204), `HIT/LOCAL` 26, `MISS` 54 | 14183 (22784) | 71022 (62417) |

"Head fetch": the lockfile-only fetch fails after the download (§8); the second number is the retry with `patches/`, on a store already filled by the first try. Peak disk is `du` of the work folder after the designed path (base worktree, head worktree, store); the number in brackets is after the fallback worktree too. Run 1 (42286827095, before the fallback was scripted) gave the same base figures: install 42–56 s, build 3–10 s, the same hit counts.

Excerpt, PR #6122 (job 128132434882):

```
== job 1: base 22050a32d89a30513ec0972617ac90dcf2c754be
base install: 44s, disk after install: 4890MB
base build (remote:r): 10s, disk: 5025MB
base cache statuses: {"HIT/REMOTE":154}
== job 2: head 314640c9d6b4a378fc2ded49d5e544f17d8f1ee7
head fetch (host, lockfile only): FAILED after 35s, store: 3251MB
head fetch (host, lockfile + patches/, store warm from the failed try): lockfile+patches 10s, store: 3251MB
INSTALLED in 36s
REBUILT in 5s
BUILT in 179s
head install+rebuild+build (sandbox, offline, no token, fetch=lockfile+patches): exit 0, 224s, disk head: 5363MB
head cache statuses: {"MISS":117,"HIT/LOCAL":37}
disk after designed path: 14205MB; free: 71000MB
== fallback (fetch from the lockfile alone failed): install container with network, then build with --network none
INSTALLED
fallback install (container, network): exit 0, 73s, store: 3250MB
REBUILT in 7s
BUILT in 194s
fallback rebuild+build (sandbox, --network none): exit 0, 202s, disk head-fb: 5363MB
fallback cache statuses: {"MISS":117,"HIT/LOCAL":37}
total disk: 22816MB; free: 62385MB
```

**Head cache misses.** The head build seeds its local cache with the base's turbo cache. In 3 PRs it missed far more tasks than the PR can change. Counted from the `package.json` files at the merge commit, the tasks in the filter that depend (directly or not) on a changed package are: #6362 2 of 105 (85 missed), #6122 4 of 153 (117 missed), #6280 7 of 81 (54 missed). #6357 and #6368 missed exactly the changed package. The fallback (a separate head worktree) gave the same counts, so the result repeats. Not investigated. One candidate: inside the sandbox the head worktree's `.git` file points to a host path that is not mounted, so turbo hashes without git; another: the remote hits are not all written to the local cache that seeds the head. The next step is to save both turbo run summaries and compare task hashes.

**Decision:** the time and disk fit a hosted runner: about 1 minute for job 1 and 1–5 minutes for job 2, 14 GB of disk with 71 GB free. Open item: the head misses above. They cost 150–204 s of build in 3 of 5 PRs.

## 2. Agent SDK limits

**Setup.** `@anthropic-ai/claude-agent-sdk@0.3.318` in `/tmp/jit-q2` (outside the repo). It has a peer dependency `zod@^4.0.0`, so `zod@3.25.76` fails with `ERESOLVE`; the runs used `zod@4.6.7`. Model `claude-haiku-5-5`. Probe: [`q2-agent-sdk.mjs`](q2-agent-sdk.mjs), run against a base checkout. `run_test` is a stub that returns fixed JSON. Env vars select each run: `MAX_TURNS` (default 12), `TOKEN_BUDGET` (default 150000), `WRITE_IN_ALLOWED=1`, `NO_DISALLOWED=1`.

Options in every run: `cwd`, `model`, `maxTurns`, `settingSources: []`, `tools: ['Read','Grep','Glob','Write','Edit']`, `permissionMode: 'default'`, `mcpServers: { jit }`, `abortController`, `canUseTool` (allows all, except `Write`/`Edit` outside `packages/MJGlobal/src/__tests__/jit/`). Per run:

- `allowedTools`: `['Read','Grep','Glob','mcp__jit__run_test']`; with `WRITE_IN_ALLOWED=1`, `['Read','Grep','Glob','Write','Edit','mcp__jit__run_test']` (the plan's list).
- `disallowedTools`: `['Bash','WebFetch','WebSearch','Task','Agent','NotebookEdit']`; with `NO_DISALLOWED=1`, not set.

**Credential.** The init message reported `"apiKeySource": "none"` (runs A and B). The typings define `none` as "no API key in use - e.g. claude.ai OAuth login, a bearer token, or a third-party cloud provider". So the session did **not** use the `ANTHROPIC_API_KEY` the helper exported, although it was set and non-empty. The probe ran inside a Claude Code session, and the SDK child process inherits `process.env` (which includes `CLAUDECODE` and `CLAUDE_CODE_*` session variables); it most likely authenticated through that session's login. These runs therefore do not show that the env key works. Costs below are the SDK's estimates, not charges to that key.

**Option names.** The typings (`sdk.d.ts`) use the same names as the plan: `allowedTools`, `disallowedTools`, `canUseTool`, `maxTurns`, `settingSources`, `mcpServers`, `abortController`, `createSdkMcpServer`, `tool`, `total_cost_usd`. Two meanings differ from what the plan assumed:

- `allowedTools` does **not** restrict tools. The typings say it lists tools "auto-allowed without prompting for permission", and "To restrict which tools are available, use the `tools` option instead." Run A shows the auto-approve side: `canUseTool` was not called for the listed tools.
- A bare name in `allowedTools` is approved before `canUseTool` runs. The SDK prints this line at start (run A, verbatim):

  ```
  (node:49915) [CLAUDE_SDK_CAN_USE_TOOL_SHADOWED] Warning: canUseTool will not be invoked for: Read, Grep, Glob, Write, Edit, mcp__jit__run_test. Bare allowedTools entries auto-approve the whole tool before the callback is consulted. To gate every tool call, use a PreToolUse hook; or remove the bare names from allowedTools so they fall through to canUseTool. Allow rules from settings files can also shadow the callback but are not visible here.
  ```

Also present and not used here: `maxBudgetUsd` (result subtype `error_max_budget_usd`). When `permissionMode` is omitted the mode can be `auto`, where a classifier decides; the probe sets `'default'` so `canUseTool` decides.

**Runs.** All `node q2-agent-sdk.mjs <checkout>` with the committed script. Runs 2–4 ran before two output-only additions (the `apiKeySource` field in the init trace and the `NO_DISALLOWED` switch, off by default); their options were the same. An earlier run 1 of the plan's layout used a previous script version; its figures are replaced by run A.

| Run | Env | `total_cost_usd` | Shows |
|---|---|---|---|
| A | `WRITE_IN_ALLOWED=1` | 0.00191 | **Write guard failed**: `canUseToolCalls: []`, `outsideFileWritten: true` |
| 2 | (none) | 0.00177 | (a)–(c), (e) |
| 3 | `MAX_TURNS=2` | 0.00150 | (d) `error_max_turns` |
| 4 | `TOKEN_BUDGET=3000` | none (aborted) | (f) |
| B | `NO_DISALLOWED=1 MAX_TURNS=1` | 0.00056 | (a) with `tools` only |

**(a) Tools limited — yes, by the start-up tool list.** Run 2 (`tools` and `disallowedTools`) and run B (`tools` only, no `disallowedTools`) give the same init message:

```
run 2: {"init": {"model": "claude-haiku-5-5", "permissionMode": "default", "tools": ["Edit", "Glob", "Grep", "Read", "Write", "mcp__jit__run_test"]}}
run B: {"init": {"model": "claude-haiku-5-5", "apiKeySource": "none", "permissionMode": "default", "tools": ["Edit", "Glob", "Grep", "Read", "Write", "mcp__jit__run_test"]}}
```

So `tools` alone removes Bash and every other built-in. Limits of this evidence: the proof is the start-up tool list, not a refused call — the model never emitted a `Bash` call in any run, because Bash was not offered.

**(b) Write path enforced — yes, only with `Write`/`Edit` out of `allowedTools`.** Run A (plan's `allowedTools`): `canUseTool` was never called and the outside write went through:

```
"toolUses": ["Write {\"file_path\":\"…/packages/MJGlobal/src/probe.ts\",\"content\":\"export const probe = 'p…"]
"toolResult": {"is_error": false, "text": "File created successfully at: …/packages/MJGlobal/src/probe.ts …"}
"permission_denials": [], "canUseToolCalls": [], "denied": [], "files": {"testFileWritten": true, "outsideFileWritten": true}
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

**(d) `maxTurns` honored — yes** (run 3, `maxTurns: 2`). The session stopped after two API messages, one per turn:

```
msg_011CgnFt8WkWKn4sqKH2sBTW ["Write {\"file_path\":\"…/packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts\",…"]
msg_011CgnFtQJ3LTtygEiGfj51K ["mcp__jit__run_test {\"file\":\"packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts\"}"]
"result": {"subtype": "error_max_turns", "is_error": true, "num_turns": 3, "total_cost_usd": 0.00150495, …}
"thrown": "Error: Claude Code returned an error result: Reached maximum number of turns (2)"
```

The `result` message arrives, and then the iterator **throws**. Run B (`maxTurns: 1`) gives the same pattern: one API message, `"subtype": "error_max_turns", "num_turns": 2`, then `Reached maximum number of turns (1)`. `num_turns` counts one more than `maxTurns`; it is not the number of API messages.

**(e) Usage reported — yes, with one limit.** Each assistant message carries `usage`; the final `result` carries `usage` and `total_cost_usd` (run 2):

```
assistant J8aD2sx6: {"input_tokens": 2, "output_tokens": 3, "cache_read_input_tokens": 4574, "cache_creation_input_tokens": 4221}
result: {"usage": {"input_tokens": 4, "cache_creation_input_tokens": 5069, "cache_read_input_tokens": 8300, "output_tokens": 1061}, "total_cost_usd": 0.0017681}
counted (deduped by message id): {"inputTokens": 13373, "outputTokens": 5}
```

- One API message arrives as several SDK messages (one per content block) with the same `id` and `usage`. Count each `id` once. In run A, 2 distinct ids came as 6 SDK messages (4 + 2); the script counted `"turns": 2`, while the plan's code would count 6.
- `input_tokens` is only the uncached part (2). Input must be `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Summed this way, the running total (13373) equals the final `result.usage` (4 + 5069 + 8300). Run A: 13520 counted, 4 + 5214 + 8302 = 13520 final.
- Observed: per-message `output_tokens` were far below the final figure (run 2: 5 counted vs 1061; run A: 5 vs 1284). A mid-run budget can count input exactly but, on this evidence, not output. The final figures in `result` are exact.

**(f) Abort on token budget stops the session — yes** (run 4, `TOKEN_BUDGET: 3000`). The first API message (4571 input tokens) crossed the budget and the host called `abort()`. The pending `Write` was refused and nothing was written; the iterator then threw. There is **no `result` message** after an abort, so no `total_cost_usd` from the SDK:

```
{"abort": {"inputTokens": 4571, "outputTokens": 8}}
"toolResult": {"is_error": true, "text": "Tool permission request failed: AbortError: Stream closed"}
"result": {"thrown": "Error: Claude Code process aborted by user"}
"counted": {"inputTokens": 12885, "outputTokens": 11, "turns": 2, "aborted": true}, "files": {"testFileWritten": false}
```

In this one run, one more API message (`hZMhUZG7`) streamed after `abort()` before the process stopped.

**Decision.** The Agent SDK meets the design; no fallback to a hand-written loop on `@anthropic-ai/sdk` is needed. The JiT agent code must:

1. Restrict built-ins with `tools`, set `permissionMode: 'default'`, and keep `disallowedTools` as a second layer.
2. Keep `Write` and `Edit` out of `allowedTools` so `canUseTool` sees every write. The SDK warning names the other way: "To gate every tool call, use a PreToolUse hook".
3. Treat `Read`, `Grep` and `Glob` the same way if reads must be limited. In `allowedTools` they are auto-approved with no path check, so the agent can read any file the host process can read.
4. In the production write guard, resolve the nearest existing parent of the target with `realpath`, and resolve the allowed root with `realpath` too. The probe's guard falls back to the unresolved path when the file does not exist yet and does not resolve the root, so a symlinked folder can bypass it.
5. Count usage once per message `id`, with cache tokens as input. Keep the host's own count, because an aborted run has no `result`. `maxBudgetUsd` is a built-in alternative (not tested here).
6. Catch the throw that follows `error_max_turns` and abort, and read the `result` message (when there is one) before the throw.
7. Use zod 4. SDK 0.3.318 has peer `zod@^4.0.0`; 24 `package.json` files under `packages/` pin `zod` `^3.25`, so the new package cannot share that pin.
8. Check the credential the runner uses. When the runner starts inside a Claude Code session, the SDK child can use that session's login instead of `ANTHROPIC_API_KEY` (`apiKeySource: "none"` here). In CI, confirm `apiKeySource: "ANTHROPIC_API_KEY"` in the init message.

## 3. Sandbox attack (inside and host side)

**Setup.** [`q3-sandbox-attack.sh`](q3-sandbox-attack.sh) with the image from [`Dockerfile.sandbox`](Dockerfile.sandbox) (used as is). Every container: `--network none --pids-limit 256 --user <runner uid:gid> --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp`, the work folder mounted read-only. The script exports a fake `ANTHROPIC_API_KEY=sk-ant-SPIKE-<time>` and `ACTIONS_RUNTIME_TOKEN` in its own environment; the container must not see either. Probe 10 makes a head with `.pnpmfile.cjs` (it writes a marker file next to itself, with the key as content if it can read it) and `packageManager: pnpm@10.30.0`.

Runs: job `q3-sandbox` in runs 42286827095 (job 128129693502) and 42287623326 (job 128132434919), output identical; and locally on Docker Desktop for Mac (uid 502), same result except the uid. Runner output, verbatim (run 42287623326):

```
== 1 environment
== 2 /proc of every visible pid
visible pids: 3
== 3 network
blocked: EAI_AGAIN
== 4 DNS
no dns
== 5 docker socket
ls: cannot access '/var/run/docker.sock': No such file or directory
no socket
== 6 cache token
no runner vars
== 7 host filesystem
bin
boot
dev
etc
home
== 8 write to ro mount
touch: cannot touch '/work/x': Read-only file system
ro holds
== 9 sudo / root
uid=1001 gid=1001 groups=1001
sh: 1: sudo: not found
no sudo
== 10 host side: pnpmfile + packageManager in head
pnpmfile did not run on host
host pnpm still 10.33.0
control: host install ran .pnpmfile.cjs (expected, this is why the host never installs head)
sandbox pnpmfile marker: ran
sandbox pnpm: 10.33.0 (must be 10.33.0, not 10.30.0)
SANDBOX HELD
runner uid: 1001; sudo: yes; docker: Docker version 28.0.4, build b8034c0
ACTIONS_RUNTIME_TOKEN set on host: no
```

Notes:
- Probe 6: a `run:` step on the runner has no `ACTIONS_RUNTIME_TOKEN` (`set on host: no`), so the probe used the script's fake value. It shows that the host environment does not reach the container, not that a real runtime token is safe.
- Probe 9: inside the sandbox the user is uid 1001 and the image has no `sudo`. The runner user outside the sandbox has passwordless sudo (`sudo: yes`). The tool must never give the sandbox anything the host user can reach (docker socket, host paths).
- Probe 10, host: `pnpm fetch` in a folder with only the lockfile did not run the head's `.pnpmfile.cjs`, and `pnpm --version` stayed 10.33.0 although head names 10.30.0. The control, a host `pnpm install --frozen-lockfile --ignore-scripts` in the head folder, ran the pnpmfile, so the test can tell the two cases apart.
- Probe 10, sandbox: the offline install ran the pnpmfile (marker `ran`), but it had no key to write, and pnpm stayed 10.33.0 (`manage-package-manager-versions=false`, no network).
- Seen in an early local run (before the script fix listed in the task report): `pnpm --version` run in the sandbox's `/work`, which held the head's `.pnpmfile.cjs`, printed that pnpmfile's error and no version. So pnpm loads `.pnpmfile.cjs` even for `--version`, and the host must not run any pnpm command, not even `--version`, inside a head folder.
- The fake key does not appear in any job log of either run.

**Decision:** the sandbox held on both. No design change.

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

**Resume run (OpenAI key added).** The probe now catches a thrown error and prints it, so one failing
provider does not stop the others. `Q4_OPENAI_MODEL=<id>` overrides the OpenAI model; the other keys
were unset for the single-model runs. Output (trimmed: `usage` on one line, request ids removed):

```
anthropic | model: claude-haiku-5-5 | success: false | text: undefined | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 0, completionTokens: 0 } | ms: 209
anthropic | statusText: error | errorMessage: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},...}
openai | model: gpt-5.1-mini | threw: 404 404 The model `gpt-5.1-mini` does not exist or you do not have access to it. | ms: 179
gemini | model: gemini-3.5-flash-lite | success: true | text: "Yes." | usage: ModelUsage { ... }

# Q4_OPENAI_MODEL=gpt-5.4-nano
openai | model: gpt-5.4-nano | success: true | text: "Yes" | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 13, completionTokens: 4 } | ms: 1211
openai | first token top_logprobs: [{"token":"Yes","logprob":-0.00002288818359375}]

# Q4_OPENAI_MODEL=gpt-4.1-nano
openai | model: gpt-4.1-nano | threw: 404 404 The model `gpt-4.1-nano` has been deprecated, learn more here: https://platform.openai.com/docs/deprecations | ms: 453

# Q4_OPENAI_MODEL=gpt-4o-mini
openai | model: gpt-4o-mini | success: true | text: "Yes." | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 14, completionTokens: 2 } | ms: 883
openai | first token top_logprobs: [{"token":"Yes","logprob":0},{"token":" Yes","logprob":-16.625},
  {"token":"Sure","logprob":-20.75},{"token":"YES","logprob":-20.75},{"token":" yes","logprob":-21.875}]

# Q4_OPENAI_MODEL=gpt-4.1-mini
openai | model: gpt-4.1-mini | success: true | text: "Yes" | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 14, completionTokens: 1 } | ms: 661
openai | first token top_logprobs: [{"token":"Yes","logprob":0},{"token":"Sure","logprob":-20.375},
  {"token":" Yes","logprob":-23.625},{"token":"YES","logprob":-24.125},{"token":"Certainly","logprob":-24.375}]
```

(`bytes` arrays removed from the `top_logprobs` entries.)

The script's default OpenAI model changed to `gpt-4.1-mini` after these runs.
`Q4_OPENAI_MODEL=gpt-5.1-mini` reproduces the recorded 404.

Direct calls (key read from the environment; `<OPENAI_API_KEY>` is a placeholder):

```bash
curl -s https://api.openai.com/v1/models -H "Authorization: Bearer <OPENAI_API_KEY>" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(sorted(m['id'] for m in d.get('data',[]) if m['id'].startswith(('gpt-','o'))))"
curl -s https://api.openai.com/v1/chat/completions -H "Authorization: Bearer <OPENAI_API_KEY>" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.4-nano","messages":[{"role":"user","content":"Reply with the single word Yes."}],"temperature":0,"max_completion_tokens":5,"logprobs":true,"top_logprobs":5}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);c=d['choices'][0]['logprobs']['content'];print('tokens',len(c),'top_logprobs per token',[len(t['top_logprobs']) for t in c])"
```

Output. Model list, chat-capable `gpt-` and `o` ids only (audio, image, realtime, transcribe, tts,
moderation and dated ids removed):

```
gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro, gpt-5-search-api,
gpt-5.1, gpt-5.2, gpt-5.2-pro, gpt-5.3-codex, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano, gpt-5.4-pro, gpt-5.5,
gpt-5.5-pro, gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-6-astra, gpt-6-luna, gpt-6-sol, gpt-6.1-sol,
gpt-6.1-terra, o3, o3-pro
```

```
tokens 1 top_logprobs per token [1]
```

The list has no `gpt-5.1-mini` and no `gpt-4.1-nano`. The direct `gpt-5.4-nano` call also returned 1
`top_logprobs` entry for its 1 token, so the limit is on the OpenAI side, not in `OpenAILLM`.

**Per provider.**

| Provider | Constructed with no DB | One call worked | Model string | Notes |
|---|---|---|---|---|
| Anthropic | Yes | No: HTTP 401 `invalid x-api-key` (214 ms; retry 209 ms, same 401) | `claude-haiku-5-5` sent; not confirmed (auth failed first) | The same key gets HTTP 401 from a direct `curl https://api.anthropic.com/v1/models`. The key has the expected `sk-ant-` prefix and no spaces or quotes. So the key is bad; the MJ class sent the request correctly. |
| OpenAI | Yes | Yes with `gpt-4o-mini` (`"Yes."`, 14/2 tokens, 883 ms), `gpt-4.1-mini` (`"Yes"`, 14/1 tokens, 661 ms) and `gpt-5.4-nano` (`"Yes"`, 13/4 tokens, 1211 ms). `gpt-5.1-mini`: 404 `model_not_found`; `gpt-4.1-nano`: 404 deprecated | `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-5.4-nano` | `logprobs.content[0].top_logprobs` came back: **yes**, through `OpenAILLM` (it sends `logprobs`/`top_logprobs` and copies `choice.logprobs` into the result, `packages/AI/Providers/OpenAI/src/models/openAI.ts:209-210, 354`). 5 entries for `gpt-4o-mini` and `gpt-4.1-mini`; only 1 for `gpt-5.4-nano`. On a 404, `OpenAILLM.ChatCompletion` **throws** the OpenAI SDK `NotFoundError`; `AnthropicLLM` returns `success: false` instead. Code basis: `BaseLLM.ChatCompletion` rethrows any driver error that is not a cancellation (`packages/AI/Core/src/generic/baseLLM.ts:136-142`); `AnthropicLLM` catches inside its driver and returns `success: false` (`packages/AI/Providers/Anthropic/src/models/anthropic.ts:1001-1012`). |
| Gemini | Yes | Yes: `"Yes"`, usage 8 prompt / 1 completion tokens, 662 ms | `gemini-3.5-flash-lite` | — |

**Import-time warnings.** None. No `@RegisterClass` or `@memberjunction/global` message was printed when
the three packages were imported.

**Decision.** For the class shape: no design change. The provider classes need only an API key: no
database, no metadata, no config. The repo root cannot resolve the providers, so
`packages/TestingFramework/jit-catching` must declare `@memberjunction/ai-anthropic`,
`@memberjunction/ai-openai` and `@memberjunction/ai-gemini` at exactly `6.2.0`, plus `@memberjunction/ai`
if it uses the `ChatParams`/`ChatResult` types; pnpm then resolves them. The scratch-package symlinks
above were a probe-only workaround: hand symlinks are not an allowed setup in this repo.

Proposed changes (pending phase-0 exit):
- The TP Prob judge (Task 1.19) uses `gpt-4o-mini` or `gpt-4.1-mini`, not `gpt-5.1-mini` (does not exist)
  and not `gpt-5.4-nano` (returns 1 `top_logprobs` entry, not 5).
- Callers wrap `ChatCompletion` in `try`/`catch`: `OpenAILLM` throws on an API error, while
  `AnthropicLLM` returns `success: false` (code basis in the table above). Code must handle both.

Still open: re-run Anthropic with a valid key to confirm `claude-haiku-5-5`.

## 5. OpenAI key in `INTEGRATION_LIVE_MODEL_KEYS`

**Answer: pending.** The secret is not readable from a branch; to be asked by the user at the phase-0
exit (date 2026-11-06). Question to ask a repo admin: does `INTEGRATION_LIVE_MODEL_KEYS` carry an
`AI_VENDOR_API_KEY__OpenAILLM=` line (the dotenv format `integration.yml` documents)?

The local developer `.env` had no OpenAI key either.

If no OpenAI key exists, the design's open question Q2 becomes a request for a new `OPENAI_API_KEY`
secret; the TP Prob judge (Task 1.19) stays as designed apart from the model change proposed in §4.

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

## 8. Host fetch + sandbox offline install

**Setup.** Same runs and script as §1. Job 2 of the script, per PR: (1) host `pnpm fetch --store-dir <store>` in a folder that holds only the head's `pnpm-lock.yaml`; (2) if that fails, the same fetch with the head's `patches/` folder copied in too; (3) sandbox offline `pnpm install --offline --frozen-lockfile --ignore-scripts`, then `pnpm rebuild`, then `turbo run build --cache=local:rw,remote:r` with no token; (4) because (1) failed, the brief's fallback once: a new head worktree, `pnpm install --frozen-lockfile --ignore-scripts` in a container with network (still non-root, `--cap-drop ALL`, no environment), then `pnpm rebuild` + build with `--network none`.

**Lockfile-only fetch: fails** on all 5 PRs, after downloading the store:

```

```

The lockfile has `patchedDependencies: type-graphql@2.0.0-beta.3: { path: patches/type-graphql@2.0.0-beta.3.patch }`, and `pnpm fetch` needs that file. With `patches/` copied into the fetch folder, the fetch works on all 5 (9–16 s on the warm store; store 3251 MB). The host fetch ran no dependency build scripts: with no `pnpm-workspace.yaml` there is no `onlyBuiltDependencies` allowlist, so pnpm listed every one under `Ignored build scripts`.

| Item | Result |
|---|---|
| `pnpm fetch` from the lockfile alone | No: `ERR_PNPM_PATCH_NOT_FOUND`. Yes with the lockfile + `patches/` |
| Offline install printed `INSTALLED` | Yes, all 5 |
| Copy-import time (offline install, `package-import-method=copy`) | 46, 57, 36, 40, 32 s (#6368, #6362, #6122, #6357, #6280) |
| `pnpm rebuild` offline | Yes, exit 0, 4–8 s |
| Install-container fallback | Run once per PR, as the lockfile-only fetch failed. Works: install 65–111 s with network, store 3250 MB, then rebuild 6–8 s + build with `--network none`, same cache statuses as the designed path |
| `--cache=local:rw,remote:r` remote hits | Yes on the base (host, token): every task `HIT/REMOTE` (4, 105, 154, 3, 80). The head (sandbox, no token) got only `HIT/LOCAL` from the seeded cache, as designed |
| Disk | Head worktree after install + build 5231–5363 MB; store 3251 MB |

**Decision:** design change (small). The host fetch folder needs the lockfile **and** each patch file the lockfile names under `patchedDependencies`. A patch is a diff that pnpm applies; it is not run. The lockfile comes from the PR, so copy only the paths it names, and reject any path that is not inside `patches/` after it is resolved (a PR could name `../../x` and make the host read a file outside the worktree). The fallback works but costs 30–80 s more per run, so it is not needed.
