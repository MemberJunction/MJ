---
name: test-agent
description: Executes tests for MemberJunction agents, queries database run traces, and diagnoses issues.
---

# Skill: `test-agent` (testing and run diagnostics)

Use this skill whenever the user wants to test an agent, reports an error, or asks why an agent
produced unexpected output.

## 1. Headless runs, while developing
```bash
docker compose exec -T mj mj ai agents run -a "<Agent Name>" -p "<test input>" --format json
```
It runs the agent to completion, Flow agents included, and prints the result and its run ID. It stops
a run after 5 minutes: for a longer agent add `--timeout <milliseconds>` (`--timeout 900000` is 15
minutes). Before running, predict the answer from the data yourself (a direct query), so you can tell
a correct result from a plausible one.

## 2. The user's path, before you call it done
The CLI is not how the user will run the agent. The Explorer web app streams the model's response,
runs as the signed-in user, and hands a Flow agent's steps to a background task runner (the CLI runs
them itself), so a CLI pass proves none of those work. Before you say an agent works:
1. Run it from Explorer chat (`http://localhost:<EXPLORER_PORT>`) as the owner, using the user's own
   wording for the request, and confirm the result appears where the user will look.
2. If other people will run it, run it as a user with only the basic `UI` role too, and record the
   permissions they need.
3. If it runs on a schedule, confirm the result reaches its delivery target.

If you cannot open the web app yourself, ask the user to try it and tell them exactly what to type
and what they should see. Don't drive their own browser without asking.

## 3. Diagnosing a failure
Don't ask the user for logs. Read the trace:
```bash
./scripts/query-run-history.sh "<Agent Name>"           # recent runs
./scripts/query-run-history.sh <RunID> --errors         # what failed, and where
./scripts/query-run-history.sh <RunID> --step 1 --detail full
docker compose exec -T mj pm2 logs mjapi --nostream --lines 100   # the API's own log
```
Check:
1. **Actions**: which ran, and that nothing ran the user did not approve (writes, sends, deletes).
2. **Steps**: each step's input is what the previous step produced. An empty or escaped payload
   usually means a template printed `_CURRENT_PAYLOAD` with `| json` instead of `| jsonparse | json`.
3. **Cost**: tokens and duration are reasonable, with no runaway loop.

Errors that point at the environment rather than the agent: "No suitable model found" (no usable AI
key: see `mj doctor --scope ai`), `anthropic-workspace-id` (an Anthropic key not scoped to a
workspace: set `ANTHROPIC_WORKSPACE_ID` in `.env`), "is not in the engine's metadata" (the API needs a restart: `./scripts/restart-api.sh`).

## 4. Iterate
1. Fix the template, mapping or step.
2. `./scripts/sync-metadata.sh` (pushes and restarts the API).
3. Re-run, and tell the user what you changed and why.
