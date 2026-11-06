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
| 6 | vitest JSON reporter gives assertion, expected, actual, stack | pending | |
| 7 | File-swap path gives the same verdicts as two worktrees | pending | |
| 8 | Host `pnpm fetch` (lockfile only) + sandbox `pnpm install --offline` + `pnpm rebuild` builds on the real lockfile; copy-import time and disk; install-container fallback if fetch fails; turbo `--cache=local:rw,remote:r` works | pending | |
