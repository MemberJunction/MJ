# Test Plan: Tool Pipelines

Covers the `pipeline` primitive end-to-end: the executor, the three providers, agent-loop
wiring, persistence, and the LLM-facing prompt. Automated coverage is listed first; the manual
matrix is what to exercise in Explorer/API before merge.

## 1. Automated tests (already in repo)

Run: `cd packages/AI/Agents && npx vitest run src/pipeline/__tests__/`

| File | What it locks |
|---|---|
| `transforms.test.ts` | Each transform (Tail/Head/Grep/JSONPath/Slice): line + byte modes, JSON modes, empty/malformed input, missing params, case-insensitive registry. |
| `jsonpath-eval.test.ts` | The eval-free JSONPath subset: member/index/wildcard/recursive-descent; rejects filter/script expressions and unsupported selectors. |
| `pipeline-executor.test.ts` | Threading output→input; only-final-returned; bytes-saved accounting; rejects transform-as-step-1, unknown tool, empty, >5 steps; fail-fast without echoing piped input; registry collisions. |
| `providers.test.ts` | `serializeActionResult` (single/multi/none output params → string), `serializeArtifactData`; ActionInvocable + ArtifactToolInvocable success/failure/throw paths. |
| `pipeline-docs.test.ts` | Docs generator: empty when no sources, lists transforms + sources, worked example. |

Full package regression: `cd packages/AI/Agents && npx vitest run` (881 tests must stay green).

**Status:** 62 pipeline tests + 881 total Agents tests passing as of this branch.

## 2. Environment setup (manual testing)

DB used during development: fresh SQL Server container `mj-sql-pipelines` (localhost:1433),
database `MJ_Pipelines`, `sa` / `Pipelines!2026Sql`. Start API + Explorer with:

```bash
DB_HOST=localhost DB_PORT=1433 DB_DATABASE=MJ_Pipelines \
DB_USERNAME=sa DB_PASSWORD='Pipelines!2026Sql' \
CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD='Pipelines!2026Sql' \
DB_TRUST_SERVER_CERTIFICATE=true MJ_CORE_SCHEMA=__mj GRAPHQL_PORT=4001 \
npm run start:api    # MJAPI on :4001

npm run start:explorer   # MJExplorer on :4200/:4201
```

Prereqs:
- `mj sync push --dir=metadata --include="prompts"` so the loop-agent template change (the
  `_PIPELINE_TOOLS` block + `pipeline?` response field) is live in the DB. **Without this push the
  LLM is never told about the `pipeline` tool** and step 3 scenarios won't fire.
- An agent with at least one Action that returns a large payload (e.g. **Run View**) so there's a
  source whose output is worth slicing.

## 3. Functional scenarios (agent-driven)

Use an agent run where the model is likely to reach for a pipeline (large source payload, wants a
slice). Verify behaviour + persistence for each.

| # | Scenario | Expected |
|---|---|---|
| F1 | **Action source → transform.** Prompt the agent to fetch many rows then keep only matching ones, e.g. `Run View` → `JSONPath $.Results[*].Status` → `Grep Pattern=Rejected`. | Agent emits one `pipeline` step. Only the final (filtered) output appears in the next-turn conversation message (`Pipeline result …`). The full RunView dump never appears in any LLM message. |
| F2 | **Single-step pipeline.** Agent wraps one source in a pipeline. | Allowed (no error); final = source output. |
| F3 | **Tail/Head on a large text source.** Source → `Tail Lines=50`. | Only last 50 lines returned. |
| F4 | **Artifact-tool source.** Run with an input artifact; pipeline first step `get_full` (with `artifactId`) → `Grep`. | Artifact content read server-side, grep applied, only matches returned. |
| F5 | **Context savings.** Compare a pipeline run vs. the agent doing source-then-slice as two normal tool calls. | Pipeline run's `ContextBytesSaved` > 0; intermediate output absent from transcript. |

## 4. Error / guardrail scenarios

| # | Scenario | Expected agent-facing result |
|---|---|---|
| E1 | Transform as first step (`Grep` first). | `The first pipeline step must be a source …` — agent can self-correct next turn. |
| E2 | Unknown tool name. | `Unknown pipeline tool "X". Available tools: …` |
| E3 | >5 steps. | `A pipeline may have at most 5 steps …` |
| E4 | Empty `steps`. | `A pipeline needs at least 1 step.` |
| E5 | Step fails mid-pipeline (e.g. `JSONPath` on non-JSON). | `Pipeline failed at step N (JSONPath). Piped input size: … bytes. Error: …` — **must NOT contain the piped input itself**. Remaining steps don't run. |
| E6 | Source action fails (bad params / permissions). | `Pipeline failed at step 1 (<action>). …` with the action's message. |

## 5. Persistence / observability (`MJ: Pipeline Runs` + `MJ: Pipeline Run Steps`)

After F1–F5, inspect the entities (Explorer grid or SQL):

- [ ] One `MJ: Pipeline Runs` row per pipeline, with correct `StepCount`, `Success`,
      `ContextBytesSaved`, `TotalBytesStreamed`, `TotalDurationMS`; `AgentRunID` links to the run.
- [ ] N `MJ: Pipeline Run Steps` rows with correct `StepIndex`, `ToolName`, `ProviderKind`
      (`Action`/`ArtifactTool`/`Transform`), `InputSize`, `OutputSize`, `Success`.
- [ ] Action steps carry `ActionExecutionLogID` (joins to the real action log); transform/artifact
      steps carry a `Preview` instead.
- [ ] On a failed pipeline (E5/E6): run row `Success=0`, `FailedStepIndex` set, `ErrorMessage` set,
      and only the steps that ran are present.
- [ ] The run also shows as a `Tool` step (`Pipeline: N step(s)`) in the agent run tree.

SQL spot-check:
```sql
SELECT TOP 20 * FROM __mj.PipelineRun ORDER BY __mj_CreatedAt DESC;
SELECT * FROM __mj.PipelineRunStep WHERE PipelineRunID = '<id>' ORDER BY StepIndex;
```

## 6. Prompt / discovery

- [ ] With `includePipelineDocs` on and ≥1 source available, the agent system prompt contains the
      `## Tool Pipelines` block (transforms + source list + example) and the `pipeline?` field.
- [ ] With no sources (transforms only), the block is absent (pipelines impossible).
- [ ] Setting `includePipelineDocs=false` on an agent type suppresses both the docs and the
      response field (auto-alignment).

## 7. Regression

- [ ] Existing agents with no pipeline usage behave identically (the `pipeline` field is optional).
- [ ] Artifact tool calls and action steps still work unchanged.
- [ ] `npm run build` clean; full Agents vitest green.

## 8. Known gaps / follow-ups

- No automated end-to-end agent-run test (would need a live MJAPI + seeded agent). F1–F5 cover this
  manually for now.
- A tool whose name collides with a transform (e.g. an Action literally named `Grep`) is skipped for
  pipeline use and logged — verify the log line if such a collision exists in a target environment.
