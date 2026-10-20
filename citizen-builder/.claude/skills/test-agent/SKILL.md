---
name: test-agent
description: Executes tests for MemberJunction agents, queries database run traces, and diagnoses issues.
---

# Skill: `test-agent` (Testing & Run Trace Diagnostics)

Use this skill whenever the user wants to test an agent, reports an error, or asks why an agent produced unexpected output.

## Method A: Headless Execution (Automated Verification)
You can invoke the agent directly via the CLI to test basic functionality and input handling:

```bash
docker compose exec -T mj mj ai agents run -a "<Agent Name>" -p "<Test Prompt or Input>" --format json
```

Options:
- `--format json`: Machine-readable structured JSON result.
- `-v` / `--verbose`: Detailed diagnostic logging.

## Method B: User Interactive Testing (Explorer UI)
Instruct the user to open their browser at `http://localhost:4202` to test interactively.

---

## Diagnosing Failures: Execution Trace Auditing

When an execution fails, stalls, or behaves unexpectedly, **do not ask the user for console logs**. Audit the run trace via CLI:

```bash
# List recent runs for the agent
./scripts/query-run-history.sh "<Agent Name>"

# Audit a specific run with full JSON trace
./scripts/query-run-history.sh <RunID> --format json

# Or inspect individual step details or errors
./scripts/query-run-history.sh <RunID> --step 1 --detail full
./scripts/query-run-history.sh <RunID> --errors
```

### Trace Verification Assertions:
1. **Action Verification**:
   - Confirm `actionsUsed` matches expected actions for the flow/loop.
   - Confirm `actionsNotUsed` contains any restricted or sensitive actions.
2. **Step Inspection**:
   - Check input and output snippets for prompt drift or malformed arguments.
   - Check error messages on individual failed steps.
3. **Resource Consumption**:
   - Check token consumption and duration to prevent runaway loops.

---

## Iterating and Refining
1. If the LLM misunderstood instructions, edit `metadata/prompts/templates/<slug>.template.md` to clarify formatting, edge cases, or instructions.
2. If parameter mapping failed, update `ActionInputMapping` / `ActionOutputMapping` in `metadata/agents/.<slug>-agent.json`.
3. Push changes:
   ```bash
   ./scripts/sync-metadata.sh
   ```
4. Re-run or ask the user to re-test.
