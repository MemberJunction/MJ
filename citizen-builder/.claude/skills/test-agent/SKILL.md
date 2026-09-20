---
name: test-agent
description: Executes tests for MemberJunction agents, queries database run traces, and diagnoses issues.
---

# Skill: `test-agent` (Testing & Run Trace Diagnostics)

Use this skill whenever the user wants to test an agent, reports an error, or asks why an agent produced unexpected output.

## Method A: Headless Execution (Automated Verification)
You can invoke the agent directly via the CLI to test basic functionality and input handling:

```bash
docker compose exec mj mj ai agents run -a "<Agent Name>" -p "<Test Prompt or Input>"
```

Options:
- Add `--format=json` to get structured machine-readable output.
- Add `-v` for verbose output.

## Method B: User Interactive Testing (Explorer UI)
Instruct the user to open their browser at `http://localhost:4200` to test interactively.

---

## Diagnosing Failures: Database Run Trace Inspection

When an execution fails, stalls, or behaves unexpectedly, **do not ask the user for console logs**. Run:

```bash
./scripts/query-run-history.sh
```

### How to Analyze the Output:
1. **Agent Run Summary (`[__mj].[vwAIAgentRuns]`)**:
   - Check `Status` (`Completed`, `Failed`, `Cancelled`).
   - Check `ErrorMessage` for top-level exceptions or timeouts.
   - Check `TotalTokens` and `DurationSec` to identify looping or token bloat.

2. **Step Traces (`[__mj].[vwAIAgentRunSteps]`)**:
   - Find which step failed or returned an unexpected response.
   - Check `PromptSnippet`: Did the step receive the expected dynamic inputs?
   - Check `ResponseSnippet`: Did the LLM follow formatting instructions?
   - Check `ActionOrSubAgent`: If an action was called, did it execute cleanly?

3. **Action Execution Errors (`[__mj].[vwActionExecutionLogs]`)**:
   - Identifies any database permission errors, missing parameters, or runtime code failures.

---

## Iterating and Refining
1. If the LLM misunderstood instructions, edit `metadata/prompts/templates/<slug>.template.md` to clarify formatting, edge cases, or instructions.
2. If parameter mapping failed, update `ActionInputMapping` / `ActionOutputMapping` in `metadata/agents/.<slug>-agent.json`.
3. Push changes:
   ```bash
   ./scripts/sync-metadata.sh
   ```
4. Re-run or ask the user to re-test.
