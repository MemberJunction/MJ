# Catching JiTTests — spike results

Design: [`../catching-jittests-design.md`](../catching-jittests-design.md) §15, phase 0.
Each section answers one question with the command run, the raw numbers, and the decision.

| # | Question | Answer | Design change needed? |
|---|---|---|---|
| 1 | Time and disk of the designed build path (job 1 base with remote cache, job 2 head with no token) | On 5 PRs, job 1 took 40–49 s install + 3–10 s build (all `HIT/REMOTE`) and the job 2 sandbox step took 52–246 s, with 14.0–14.2 GB of disk used and 71 GB free; in 3 PRs the head build missed 54–117 tasks for a cause not yet found (§1). | Time and disk: no. Open: find why the head build misses tasks the PR does not reach, as it affects the D31 cache hand-off (§5.4) |
| 2 | Agent SDK: restrict tools, enforce write path, add `run_test`, cap turns and tokens, report usage | Yes, all six, on SDK 0.3.318: `tools` restricts built-ins, `canUseTool` guards writes only when `Write`/`Edit` are not in `allowedTools`, and output tokens are exact only in the final `result`; the environment-key path works (§2). | Yes (small), §8.3: `tools` + `permissionMode: 'default'`, `Write`/`Edit` out of `allowedTools`, budget on input + cache tokens, catch the max-turns throw, zod 4, check `apiKeySource`; no fallback |
| 3 | Sandbox holds on `ubuntu-latest` (key, /proc, network, cache token) | Inside the container, yes (probes 1–9 on `ubuntu-24.04` and on Docker Desktop for Mac); on the host, no: probe 10b shows that `pnpm fetch` follows a symlink out of `patches/` and applies the diff on the host (§3). | **Yes (DESIGN CHANGE)**, §5.4 / §12 host step (D28): the host fetch must not read or apply PR-supplied patches; options in §8 |
| 4 | Provider classes work with no database (Anthropic, OpenAI with logprobs, Gemini) | Yes: all three classes call from a bare key with no database; only `gpt-4o-mini` and `gpt-4.1-mini` return 5 `top_logprobs` (`gpt-5.1-mini` does not exist), and `OpenAILLM` throws where `AnthropicLLM` returns `success: false` (§4). | Yes (small), §9.2 / D15: TP Prob model `gpt-4o-mini` or `gpt-4.1-mini`; callers handle a throw and `success: false`; the package declares the provider packages (§5.1) |
| 5 | `INTEGRATION_LIVE_MODEL_KEYS` includes an OpenAI key | pending — the secret is not readable from a branch; the user asks a repo admin (§5). | If no key: a new `OPENAI_API_KEY` secret (Q2 in §18) |
| 6 | vitest JSON reporter gives assertion, expected, actual, stack | Partly: `--reporter=json` gives the assertion line and stack in one string, with no `expected`/`actual`, and a timeout reads `Error: STACK_TRACE_ERROR`; a custom reporter gets all of them as fields (§6). | Yes, §7 (Task 1.10): read a small custom vitest reporter, not `--reporter=json` |
| 7 | File-swap path gives the same verdicts as two worktrees | Same results on 3 one-package PRs where all tests passed (1207/627/1275 tests, 0 differences each); no failing test compared (§7). | no |
| 8 | Host `pnpm fetch` (lockfile only) + sandbox `pnpm install --offline` + `pnpm rebuild` builds on the real lockfile; copy-import time and disk; install-container fallback if fetch fails; turbo `--cache=local:rw,remote:r` works | Partly: the lockfile-only fetch fails (`ERR_PNPM_PATCH_NOT_FOUND`); with `patches/` copied, the offline install (copy import 32–57 s), `pnpm rebuild` and build work, the install-container fallback works, and `remote:r` gives remote hits (§8). | Yes, §5.4 / §7 host fetch: option (b) works (§8 "Option (b) test"): fetch with a lockfile copy stripped of `patchedDependencies` and `(patch_hash=…)`; the sandbox applies patches offline |

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

**Head cache misses.** The head build seeds its local cache (`TURBO_CACHE_DIR`) with a copy of the base's local turbo cache and runs with no token. A `MISS` means turbo found no artifact with the task's hash in that seeded cache, so it built the task. In 3 PRs it missed far more tasks than the PR can change. Turbo task counts (from the run summaries): #6362 105, #6122 154, #6280 80. A walk of the `package.json` files at each merge commit finds 105, 153 and 81 packages in the same filters (the walk is a rough count, not turbo's graph; the one-package differences were not traced). By that walk, the packages that depend (directly or not) on a changed package are: #6362 2 (85 tasks missed), #6122 4 (117 missed), #6280 7 (54 missed). #6357 and #6368 missed exactly the changed package. The names of the missed tasks are not known: the turbo run summaries stayed on the runner and were not kept. Candidates:
- The PR changed `pnpm-lock.yaml`. **Ruled out**: `git diff --stat M^1 M -- pnpm-lock.yaml` is empty for all 5 merges.
- Inside the sandbox the head worktree's `.git` file points to a host path that is not mounted, so turbo hashes the files without git, and some hashes differ from the base's git-based hashes. Not checked.
- The seeding: remote hits on the base are not all written to the base's local cache, so the copy that seeds the head lacks them. Not checked.

The fallback (a separate head worktree, the same seed, on the same machine) gave the same counts. That shows the result repeats. It does not rule out the seeding candidate, because both head builds used the same seed. The next step is to keep both turbo run summaries and compare the task hashes and the seed folder's contents.

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

### Environment-key run (2026-11-06)

The key was replaced, and the committed script ran once more in a clean environment that held only the key. `env -i` removes every inherited variable (`CLAUDECODE`, `CLAUDE_CODE_*` and the rest), and `HOME` points to a new, empty folder, so the SDK child cannot find this session's login or config. Same install (`/tmp/jit-q2`, SDK 0.3.318, zod 4); the script was copied from the branch first. `<ANTHROPIC_API_KEY>` is a placeholder:

```bash
mkdir /tmp/jit-q2-home      # empty
cd /tmp/jit-q2 && env -i PATH="<node bin>:/usr/bin:/bin" HOME=/tmp/jit-q2-home TMPDIR=/tmp \
  ANTHROPIC_API_KEY=<ANTHROPIC_API_KEY> MAX_TURNS=2 node q2-agent-sdk.mjs <checkout>
```

One run; no variation was needed. Output (trimmed: repeated per-block messages, `server_tool_use`, `iterations` and the shadowed-callback warning, which is the same as run 2, removed):

```
"init": {"model": "claude-haiku-5-5", "apiKeySource": "ANTHROPIC_API_KEY", "permissionMode": "default",
         "tools": ["Edit","Glob","Grep","Read","Write","mcp__jit__run_test"]}
"toolUses": ["Write {\"file_path\":\".../packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts\", ...}"]
"toolResult": {"is_error": false, "text": "File created successfully at: .../__tests__/jit/probe.jit.test.ts ..."}
"toolUses": ["Write {\"file_path\":\".../packages/MJGlobal/src/probe.ts\", ...}"]
"toolResult": {"is_error": true, "text": "Writes are allowed only under packages/<X>/src/__tests__/jit/"}
"toolUses": ["mcp__jit__run_test {\"file\":\"packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts\"}"]
"result": {"subtype": "error_max_turns", "is_error": true, "num_turns": 3,
  "usage": {"input_tokens": 4, "cache_creation_input_tokens": 4580, "cache_read_input_tokens": 4087,
            "output_tokens": 544, "output_tokens_details": {"thinking_tokens": 123}, "service_tier": "standard"},
  "total_cost_usd": 0.0011131700000000001,
  "thrown": "Error: Claude Code returned an error result: Reached maximum number of turns (2)"}
"counted": {"inputTokens": 8671, "outputTokens": 18, "turns": 2, "aborted": false}
"canUseToolCalls": ["Write", "Write"], "files": {"testFileWritten": true, "outsideFileWritten": false}
```

The session authenticated with the key, used the tools, and stopped at the turn cap (`MAX_TURNS=2`), as run 3 did. The write guard also held again (one write inside `__tests__/jit/`, one denied outside). The file the agent wrote was deleted before commit.

**The environment-key path is confirmed:** with no Claude Code login in reach, the SDK uses `ANTHROPIC_API_KEY` and the session runs. Item 8 still applies: a runner that starts inside a Claude Code session can pick up that login instead, so CI should still check `apiKeySource`.

## 3. Sandbox attack (inside and host side)

**Setup.** [`q3-sandbox-attack.sh`](q3-sandbox-attack.sh) with the image from [`Dockerfile.sandbox`](Dockerfile.sandbox) (used as is). Every container: `--network none --pids-limit 256 --user <runner uid:gid> --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp`, the work folder mounted read-only. The script exports a fake `ANTHROPIC_API_KEY=sk-ant-SPIKE-<time>` and `ACTIONS_RUNTIME_TOKEN` in its own environment; the container must not see either. Probes 1–9 attack from inside the container; each has a `LEAK` check (probe 7 only prints what is visible). Probe 10 and probe 10b test the host step.

**What probe 10 proves.** Probe 10 makes a head folder with `.pnpmfile.cjs` and `packageManager: pnpm@10.30.0`, then runs the designed host step: `pnpm fetch` in a **separate** folder that holds only the head's lockfile. The pnpmfile did not run, so pnpm does not read a sibling folder. The `host pnpm still 10.33.0` line runs `pnpm --version` from the script's working folder (the repo root), not in a head folder, so it only shows that the fetch did not change the installed pnpm. The control (a host install inside the head folder) shows that the pnpmfile can run when pnpm works in that folder. Probe 10 does not attack the lockfile content: its lockfile names only `is-odd@3.0.1`.

**What probe 10b tests.** The host surface is the head's lockfile, plus the patch files it names when `patches/` is copied (§8). Probe 10b makes a head whose lockfile names (i) a git-hosted dependency (`git+file://` to a local bare repo) whose `prepare`, `preinstall`, `install` and `postinstall` scripts write marker files; (ii) a `patchedDependencies` entry for `is-odd@3.0.1` whose file under `patches/` is a symlink to a diff outside `patches/` (the diff adds a file with a unique string); (iii) a `pnpmfileChecksum` line (pnpm wrote one, as the head has a `.pnpmfile.cjs`). The head allowlists its own git dependency (`onlyBuiltDependencies` in its `pnpm-workspace.yaml`); the set-up makes the lockfile with `pnpm install --lockfile-only` in the head folder, as probe 10 does, then deletes the markers. Then the designed host step: copy the lockfile and `patches/` (`cp -R`, which keeps the symlink) into an empty folder and run `pnpm fetch --store-dir <empty store>`. Part A uses that lockfile. Part B removes the git dependency and makes a new lockfile, so the fetch cannot stop on the git dependency before it reaches the patch; B runs once with the diff readable and once with it unreadable (`chmod 000`).

**Runner output, verbatim.** Run 42291477076, job 128145717169, script at commit `96b0f70c2b` (`ubuntu-24.04`, host pnpm 10.33.0). The job ended with exit 1 (`SANDBOX LEAKED`):

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
lib
lib64
media
mnt
opt
proc
root
run
sbin
srv
sys
tmp
usr
var
work
node
774f276124d8
== 8 write to ro mount
touch: cannot touch '/work/x': Read-only file system
ro holds
== 9 sudo / root
uid=1001 gid=1001 groups=1001
uid=1001
sh: 1: sudo: not found
no sudo
== 10 host side: pnpmfile + packageManager in head
pnpmfile did not run on host
host pnpm still 10.33.0
control: host install ran .pnpmfile.cjs (expected, this is why the host never installs head)
sandbox pnpmfile marker: ran
sandbox pnpm: 10.33.0 (must be 10.33.0, not 10.30.0)
== 10b host side: lockfile content + patches/ (git dependency with prepare, symlinked patch, pnpmfileChecksum)
lockfile has: 2 git-dep lines, 1 patchedDependencies, 1 pnpmfileChecksum (host pnpm 10.33.0)
-- A: git dependency + symlinked patch: fetch folder patches/: lrwxrwxrwx is-odd@3.0.1.patch -> /tmp/tmp.QlWtLYBNnZ/outside/target.patch
   fetch exit: 1
   fetch: Importing packages to virtual store
   fetch: Already up to date
   fetch:  ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED  Failed to prepare git-hosted package fetched from "file:///tmp/tmp.QlWtLYBNnZ/gitdep.git": The git-hosted package "evil-git-dep@1.0.0" needs to execute build scripts but is not in the "onlyBuiltDependencies" allowlist.
   fetch: 
   fetch: Add the package to "onlyBuiltDependencies" in your project's pnpm-workspace.yaml to allow it to run scripts. For example:
   fetch: onlyBuiltDependencies:
   fetch:   - "evil-git-dep"
no head code ran (no markers)
symlinked patch content not found in fetch folder or store
lockfile B has: 0 git-dep lines, 1 patchedDependencies, 1 pnpmfileChecksum
-- B: symlinked patch only, readable target: fetch folder patches/: lrwxrwxrwx is-odd@3.0.1.patch -> /tmp/tmp.QlWtLYBNnZ/outside/target.patch
   fetch exit: 0
   fetch: Importing packages to virtual store
   fetch: Already up to date
no head code ran (no markers)
LEAK host: symlinked patch target applied on the host: /tmp/tmp.QhV3lFNWRv/node_modules/.pnpm/is-odd@3.0.1_patch_hash=a53dc68ca77c6b02d2e14d450401b53db89cfb9b9a119c2f99808295b3ad133b/node_modules/is-odd/spike-marker.js
/tmp/tmp.qKIxqN1K0i/v10/files/57/0ab3b425019951cd4020918cc76ff61c89323cd6ecc068cf9ac269c26d7e1aab1f7882239c608e5758b336c58b8ce9dae53773f17b17361ae1dfb397532898
-- B: symlinked patch only, unreadable target (an error naming the target means fetch reads it): fetch folder patches/: lrwxrwxrwx is-odd@3.0.1.patch -> /tmp/tmp.QlWtLYBNnZ/outside/target.patch
   fetch exit: 1
   fetch: Importing packages to virtual store
   fetch: Already up to date
   fetch:  ERR_PNPM_INVALID_PATCH  Applying patch "/tmp/tmp.LfUhW51G8M/patches/is-odd@3.0.1.patch" failed: EACCES: permission denied, open '/tmp/tmp.LfUhW51G8M/patches/is-odd@3.0.1.patch'
no head code ran (no markers)
symlinked patch content not found in fetch folder or store
SANDBOX LEAKED
runner uid: 1001; sudo: yes; docker: Docker version 28.0.4, build b8034c0
ACTIONS_RUNTIME_TOKEN set on host: no
```

The first runner paste (runs 42286827095 job 128129693502 and 42287623326 job 128132434919, identical) came from the script at commit `7c9bf82b2c`. That version had probes 1–10 only, no `LEAK` check on probes 5, 8 and 9, and probe 7 showed only the first 5 lines. Its probe 1–10 results were the same as above. A local run of that version on Docker Desktop for Mac (Docker 29.7.2) also printed `SANDBOX HELD`: probes 1–9 held there too.

**Local output (probe 10b).** Docker Desktop for Mac, the same script (`96b0f70c2b`), pnpm 10.33.0 first on `PATH` (the Mac's global pnpm is 11.24.0 outside the repo, so an earlier local run of probe 10 had used 11.24.0 for its fetch). Same result as the runner:

```
== 10b host side: lockfile content + patches/ (git dependency with prepare, symlinked patch, pnpmfileChecksum)
lockfile has: 2 git-dep lines, 1 patchedDependencies, 1 pnpmfileChecksum (host pnpm 10.33.0)
-- A: git dependency + symlinked patch: fetch folder patches/: lrwxr-xr-x@ is-odd@3.0.1.patch -> /var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.5jWvatj1uM/outside/target.patch
   fetch exit: 1
   fetch: Importing packages to virtual store
   fetch: Already up to date
   fetch:  ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED  Failed to prepare git-hosted package fetched from "file:///var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.5jWvatj1uM/gitdep.git": The git-hosted package "evil-git-dep@1.0.0" needs to execute build scripts but is not in the "onlyBuiltDependencies" allowlist.
   fetch: 
   fetch: Add the package to "onlyBuiltDependencies" in your project's pnpm-workspace.yaml to allow it to run scripts. For example:
   fetch: onlyBuiltDependencies:
   fetch:   - "evil-git-dep"
no head code ran (no markers)
symlinked patch content not found in fetch folder or store
lockfile B has: 0 git-dep lines, 1 patchedDependencies, 1 pnpmfileChecksum
-- B: symlinked patch only, readable target: fetch folder patches/: lrwxr-xr-x@ is-odd@3.0.1.patch -> /var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.5jWvatj1uM/outside/target.patch
   fetch exit: 0
   fetch: Importing packages to virtual store
   fetch: Already up to date
no head code ran (no markers)
LEAK host: symlinked patch target applied on the host: /var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.4SnljcWMQI/node_modules/.pnpm/is-odd@3.0.1_patch_hash=2cc4cc9002a8a231f5caf98297e67a90cba720ae6efdef5c08e01e9e53133da5/node_modules/is-odd/spike-marker.js
/var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.vPfV1lYILd/v10/files/26/408b3c560642a0e6720ec6115454aee7fc6b1cb16bc34aa2197521043a2cce4c6afd60fd5b5310f79a099a792f80975e49c13b1f5f6b7d06360003e8feb9bb
-- B: symlinked patch only, unreadable target (an error naming the target means fetch reads it): fetch folder patches/: lrwxr-xr-x@ is-odd@3.0.1.patch -> /var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.5jWvatj1uM/outside/target.patch
   fetch exit: 1
   fetch: Importing packages to virtual store
   fetch: Already up to date
   fetch:  ERR_PNPM_INVALID_PATCH  Applying patch "/private/var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.WIkqZyRAp8/patches/is-odd@3.0.1.patch" failed: EACCES: permission denied, open '/private/var/folders/2_/fc7_0ghs52n4w25hh3b8hw180000gp/T/tmp.WIkqZyRAp8/patches/is-odd@3.0.1.patch'
no head code ran (no markers)
symlinked patch content not found in fetch folder or store
SANDBOX LEAKED
```

Notes:
- **Probe 10b, git dependency: held.** `pnpm fetch` refused to prepare the git dependency (`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, exit 1): the fetch folder has no `pnpm-workspace.yaml`, so the head's allowlist does not apply. No marker appeared. A PR that adds a git dependency with build scripts makes the host fetch fail.
- **Probe 10b, patch: LEAK (DESIGN CHANGE).** `pnpm fetch` applies patches on the host. It followed the symlink in `patches/` and applied the outside diff: its unique string is in the fetch folder's `node_modules/.pnpm/is-odd@3.0.1_patch_hash=…/node_modules/is-odd/spike-marker.js` and in the store. With the target unreadable, the fetch failed with `EACCES` when it opened the patch through the symlink. So the patch files are read **and** applied on the host. Not tested: whether a diff can write outside the patched package's folder.
- **Probe 10b, pnpmfile and `pnpmfileChecksum`: held.** The fetch folder has no `.pnpmfile.cjs`; the fetch did not run the head's pnpmfile and did not fail on the checksum line.
- Probe 6: a `run:` step on the runner has no `ACTIONS_RUNTIME_TOKEN` (`set on host: no`), so the probe used the script's fake value. It shows that the host environment does not reach the container, not that a real runtime token is safe.
- Probe 9: inside the sandbox the user is uid 1001 and the image has no `sudo`. The runner user outside the sandbox has passwordless sudo (`sudo: yes`). The tool must never give the sandbox anything the host user can reach (docker socket, host paths).
- Seen in an early local run (before a script fix listed in the task report): `pnpm --version` run in the sandbox's `/work`, which held the head's `.pnpmfile.cjs`, printed that pnpmfile's error and no version. So pnpm loads `.pnpmfile.cjs` even for `--version`, and the host must not run any pnpm command, not even `--version`, inside a head folder.
- The fake key does not appear in any job log of the three runs.
- The probe 10b "read" check was corrected after the recorded runs, in commit `spike(jit-catch): phase 0 summary table and 0.5 record corrections`. The recorded runs (script `96b0f70c2b`) grepped the fetch output for `outside/target.patch`, but pnpm names the link path under `patches/`, so that check could never match. The check now counts `EACCES` on the `patches/` path as `LEAK` (fetch read through the symlink), and the label of the unreadable-target case says so. With the new check, the unreadable-target case in the outputs above would also print a `LEAK` line. No verdict changes: probe 10b already reported `LEAK` from the readable-target case, and the `EACCES` line above already shows the read.

**Decision:** the sandbox held (probes 1–10). The host step does not: with `patches/` copied, `pnpm fetch` reads and applies PR-supplied diffs on the host and follows symlinks out of `patches/`. This is a design change; the options are in §8.

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

### Anthropic rerun (2026-11-06, new key)

The Anthropic key was replaced. Setup as above, on a new worktree: `pnpm install --frozen-lockfile`
(Done in 22s), the same three-filter turbo build (8 successful, 8 cached), and a new scratch package
with the same three symlinks to this worktree's provider folders. The committed `q4-providers.mjs` was
copied in unchanged (`cmp` clean) and run once with all three keys exported in the same shell, default
models. Output (complete; `usage` on one line, `bytes` arrays removed):

```
anthropic | model: claude-haiku-5-5 | success: true | text: "Yes" | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 19, completionTokens: 5 } | ms: 807
openai | model: gpt-4.1-mini | success: true | text: "Yes" | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 14, completionTokens: 1 } | ms: 788
openai | first token top_logprobs: [{"token":"Yes","logprob":0},{"token":"Sure","logprob":-20.375},
  {"token":" Yes","logprob":-23.625},{"token":"YES","logprob":-24.125},{"token":"Certainly","logprob":-24.375}]
gemini | model: gemini-3.5-flash-lite | success: true | text: "Yes." | usage: ModelUsage {
  cacheReadTokens: 0, cacheWriteTokens: 0, promptTokens: 8, completionTokens: 2 } | ms: 672
```

- Anthropic: `success: true`, text `"Yes"`, 19 prompt / 5 completion tokens, 807 ms. The model id
  `claude-haiku-5-5` is confirmed; no fallback model was needed. The 5 completion tokens for a
  one-word answer equal the `maxOutputTokens: 5` cap; the probe does not print the stop reason, so
  this run does not show whether the cap was reached.
- OpenAI and Gemini gave the same results as before (5 `top_logprobs` for `gpt-4.1-mini`).
- Import-time warnings: none. Nothing else was printed to stdout or stderr.

All three provider classes now make a call from a bare key with no database. The open item above is
closed.

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

**Lockfile-only fetch: fails** on all 5 PRs, after downloading the store. Run 42287623326, job 128132434882 (PR #6122), verbatim:

```
 ERR_PNPM_PATCH_NOT_FOUND  Patch file not found: /home/runner/work/_temp/jit-q1/fetch/patches/type-graphql@2.0.0-beta.3.patch
```

The lockfile has `patchedDependencies: type-graphql@2.0.0-beta.3: { path: patches/type-graphql@2.0.0-beta.3.patch }`, and `pnpm fetch` needs that file. With `patches/` copied into the fetch folder, the fetch works on all 5 (9–16 s on the warm store; store 3251 MB). The host fetch ran no dependency build scripts: with no `pnpm-workspace.yaml` there is no `onlyBuiltDependencies` allowlist, so pnpm listed every one under `Ignored build scripts`. The same job, from the retry with `patches/`, verbatim:

```
╭ Warning ─────────────────────────────────────────────────────────────────────╮
│                                                                              │
│   Ignored build scripts: @apollo/protobufjs@1.2.7, @google/genai@2.16.0,     │
│   @parcel/watcher@2.5.6, @zoom/rtms@1.1.0, browser-tabs-lock@1.3.0,          │
│   core-js-pure@3.48.0, core-js@3.48.0, esbuild@0.25.12, esbuild@0.26.0,      │
│   esbuild@0.27.3, esbuild@0.28.1, esbuild@0.28.2, isolated-vm@6.0.2,         │
│   lmdb@3.5.1, lz4@0.6.5, msgpackr-extract@3.0.3, onnxruntime-node@1.30.0,    │
│   oracledb@6.10.0, protobufjs@7.5.4, puppeteer@25.16.0, rete@2.0.6,          │
│   tesseract.js@6.0.1, usearch@2.26.2.                                        │
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
│   to run scripts.                                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

| Item | Result |
|---|---|
| `pnpm fetch` from the lockfile alone | No: `ERR_PNPM_PATCH_NOT_FOUND`. Yes with the lockfile + `patches/` |
| Offline install printed `INSTALLED` | Yes, all 5 |
| Copy-import time (offline install, `package-import-method=copy`) | 46, 57, 36, 40, 32 s (#6368, #6362, #6122, #6357, #6280) |
| `pnpm rebuild` offline | Yes, exit 0, 4–8 s |
| Install-container fallback | Run once per PR, as the lockfile-only fetch failed. Works: install 65–111 s with network, store 3250 MB, then rebuild 6–8 s + build with `--network none`, same cache statuses as the designed path |
| `--cache=local:rw,remote:r` remote hits | Yes on the base (host, token): every task `HIT/REMOTE` (4, 105, 154, 3, 80). The head (sandbox, no token) got only `HIT/LOCAL` from the seeded cache, as designed |
| Disk | Head worktree after install + build 5231–5363 MB; store 3251 MB |

**What the host now reads.** With the `patches/` retry, the host step reads the head's lockfile **and** the patch files the lockfile names. Both come from the PR. Probe 10 did not cover a patched dependency. Probe 10b (§3) did, on the runner (run 42291477076, job 128145717169) and locally on pnpm 10.33.0: `pnpm fetch` **applies** the patches on the host. It writes the patched package into the fetch folder's `node_modules/.pnpm/<pkg>_patch_hash=…/` and into the store. It also follows a symlink in `patches/` to a file outside it. So a patch is a write surface on the host (a diff that pnpm applies), not only a hashed input. Probe 10b did not test whether a diff can write outside the patched package's folder (for example with `../` paths).

**Decision:** open design item (DESIGN CHANGE, see §3 probe 10b). The lockfile-only fetch does not work on the real lockfile, and the `patches/` retry makes the host apply PR-supplied diffs. Options for the design:

- **(a) Host fetch with a filtered copy of `patches/`.** Copy only the patch files the lockfile names, each one a regular file whose `realpath` is inside `patches/` (reject symlinks). Trade-off: the host still applies PR-supplied diffs. Whether a diff with `../` paths can write outside the package folder is not tested.
- **(b) Strip `patchedDependencies` from the lockfile copy the host fetches with.** The host then downloads only the unpatched packages and never reads a patch file. The sandbox runs `pnpm install --offline --frozen-lockfile` with the real lockfile and `patches/`, which applies the patches inside the sandbox from the store copy. Not tested. Open question: does the `--frozen-lockfile` offline install succeed when the store holds only the unpatched originals? To test it: one local run of the Q8 script shape (host fetch, then sandbox offline install) with the stripped lockfile for the fetch.
- **(c) Install-container fallback.** It works here and costs 30–80 s more per run. Trade-off: the PR's `.pnpmfile.cjs` runs in the install container with network egress, and so would dependency scripts if the install ran without `--ignore-scripts` (the scripted fallback sets it and runs `pnpm rebuild` with `--network none`). So PR code can send data out. There are no secrets to send, but a channel exists.

The choice is not made here.

The temporary workflow `.github/workflows/jit-catch-spike.yml` was removed at the end of phase 0 (commit 8f6c5f1673). Its `pull_request` trigger would otherwise run it on any PR that touches `plans/catching-jittests-spike/**`.

### Option (b) test (2026-11-06)

**Setup.** Script `q8b-strip-patches.sh`, run once on a local Mac (Docker Desktop, linux/arm64 containers). Both halves ran in Linux containers from `jit-sandbox:spike` (pnpm 10.33.0, `package-import-method=copy`), with a new, empty store. Script exit 0, total 416 s.

**Stripping.** A `python3` script deletes the top-level `patchedDependencies:` block and every `(patch_hash=<hash>)` segment. The fetch folder holds only the stripped `pnpm-lock.yaml`. `diff | wc -l` = 18. pnpm accepted the first variant (block and segments both removed), so the script did not try the other two (block only, segments only). The changed lines, verbatim (cut at 140 characters):

```
36,40d35
< patchedDependencies:
<   type-graphql@2.0.0-beta.3:
<     hash: 4d3544a1e64ad80b22832bb91021718c73db40ae6c6ac140b86d22cacaab8c67
<     path: patches/type-graphql@2.0.0-beta.3.patch
<
14082c14077
<         version: 2.0.0-beta.3(patch_hash=4d3544a1e64ad80b22832bb91021718c73db40ae6c6ac140b86d22cacaab8c67)(class-validator@0.14.3)(graphql
>         version: 2.0.0-beta.3(class-validator@0.14.3)(graphql-scalars@1.25.0(graphql@16.12.0))(graphql@16.12.0)
16596c16591
<         version: 2.0.0-beta.3(patch_hash=4d3544a1e64ad80b22832bb91021718c73db40ae6c6ac140b86d22cacaab8c67)(class-validator@0.14.3)(graphql
>         version: 2.0.0-beta.3(class-validator@0.14.3)(graphql-scalars@1.25.0(graphql@16.12.0))(graphql@16.12.0)
51329c51324
<   type-graphql@2.0.0-beta.3(patch_hash=4d3544a1e64ad80b22832bb91021718c73db40ae6c6ac140b86d22cacaab8c67)(class-validator@0.14.3)(graphql-s
>   type-graphql@2.0.0-beta.3(class-validator@0.14.3)(graphql-scalars@1.25.0(graphql@16.12.0))(graphql@16.12.0):
patch_hash left: 0
```

**Host half (fetch, network, non-root).** `docker run --rm --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp -v "$WORK/fetch:/fetch" -v "$WORK/store:/pnpm-store" jit-sandbox:spike sh -c 'cd /fetch && pnpm fetch'`

```
Progress: resolved 3191, reused 0, downloaded 3170, added 3191, done
fetch exit=0 time=153s
store size: 3187 MB
patch_hash dirs in fetch node_modules: 0
type-graphql@2.0.0-beta.3_class-validator@0.14.3_graphql-scalars@1.25.0_graphql@16.12.0__graphql@16.12.0
store files holding '_mjBuildIndexes' after host fetch: 0
```

The host fetched only the unpatched `type-graphql`, and no patched file reached the store. The fetch printed the same `Ignored build scripts` list as in phase 0, so it ran no dependency scripts.

**Sandbox half (offline install).** A temporary `git worktree add --detach "$WORK/head" HEAD` (real lockfile + `patches/`), then `docker run --rm --network none --pids-limit 1024 --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp -v "$WORK/head:/work" -v "$WORK/store:/pnpm-store" jit-sandbox:spike sh -c 'cd /work && pnpm install --offline --frozen-lockfile --ignore-scripts && echo INSTALLED && pnpm rebuild && echo REBUILT'`

```
Packages: +3191
Done in 1m 44.3s using pnpm v10.33.0
INSTALLED
REBUILT
install+rebuild exit=0 time=111s
```

During `pnpm rebuild`, the optional native build of `msgpackr-extract` failed (`gyp ERR! find Python`: the image has no Python, and this run was arm64). The failure is not fatal, and `pnpm rebuild` exited 0. It is not related to the patch. The phase 0 runs were on x64 runners.

**Was the patch applied in the sandbox? Yes.** `_mjBuildIndexes` is a line the patch adds.

```
$ ls $WORK/head/node_modules/.pnpm | grep type-graphql
type-graphql@2.0.0-beta.3_patch_hash=4d3544a1e64ad80b22832bb91021718c73db40ae6c6ac140b8_61eac4cec08843f3d44792990504a1b5
$ grep -rnF _mjBuildIndexes .../node_modules/type-graphql/build
build/esm/metadata/metadata-storage.js:93:        this._mjBuildIndexes(); // [MJ scale patch] index target/name keyed arrays once (O(1) lookups below)
build/esm/metadata/metadata-storage.js:144:    _mjBuildIndexes() {
build/cjs/metadata/metadata-storage.js:96:        this._mjBuildIndexes(); // [MJ scale patch] index target/name keyed arrays once (O(1) lookups below)
build/cjs/metadata/metadata-storage.js:147:    _mjBuildIndexes() {
store files holding '_mjBuildIndexes' after sandbox install: 2
```

The store held no patched file after the host fetch (0 hits). After the sandbox install it held 2 (`store/v10/files/d9/…`, `store/v10/files/c3/…`, the patched esm and cjs `metadata-storage.js`). So pnpm applied the patch inside the sandbox and wrote the patched files back into the mounted store. The store has one index entry for the package: `v10/index/e4/…-type-graphql@2.0.0-beta.3.json`.

**Build smoke.** The same sandbox shape, with `-e TURBO_TELEMETRY_DISABLED=1 -e TURBO_CACHE_DIR=/work/.turbo/cache`, ran `timeout 1200 npx turbo run build --filter=@memberjunction/core... --cache=local:rw`. Result: `Tasks: 3 successful, 3 total`, `Cached: 0 cached`, exit 0, 8 s.

**Timing.** Host half (cold fetch, empty store, local network): 153 s. Sandbox half (offline install + rebuild): 111 s, of which the install was 104 s. Phase 0 on the runner measured 9–16 s for a warm-store fetch and 32–57 s for the copy import. The local sandbox time is higher because Docker Desktop bind mounts on macOS are slow, so it is not comparable to the runner.

**Decision:** option (b) works. pnpm accepts a lockfile copy with both the `patchedDependencies:` block and the `(patch_hash=…)` segments removed. The host then fetches only the unpatched originals and reads no patch file. The sandbox's `pnpm install --offline --frozen-lockfile` with the real lockfile and `patches/` succeeds from that store and applies the patch (the evidence is above). We did not test the other two forms (block only, segments only). Removing both is the form to specify. Limits: (1) The sandbox writes the patched files into the store, so a store shared across runs collects PR-patched content. Mount it per run, or test a read-only mount (not tested). (2) A PR that changes a patch file or adds a new patched dependency is still covered: the stripped lockfile names only the base package, which the store gets, and the sandbox applies the new diff offline. Only the "changed patch" case comes from reasoning; it was not run. (3) A patch can only change files of a package the lockfile already has. A patched dependency that is new in the PR needs that package in the head lockfile, which is fetched as usual.
