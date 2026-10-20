# Agent runs: stop writing duplicate payload copies

**Status:** PLANNED 2026-10-11. D1–D4 decided 2026-10-12. Not started.
**Ask:** Follow-up to the production storage incident on 2026-10-09.
**Scope:** `packages/AI/Agents` (BaseAgent), `packages/AI/CorePlus`, five readers of `AIAgentRun.Result`, the Explorer agent-run viewer, and the integration-test step reader. One migration (Part B).
**Related plans:** `plans/prompt-run-data-storage-and-step-redaction.md`, `plans/ai-log-retention-90-day.md`, `plans/field-level-compression.md`, Skip-Brain `plans/query-writer-composition-context-bloat.md`.

---

## 1. Problem (production, 2026-10-09/10)

| column pair | totals | max | what writes them |
|---|---|---|---|
| `AIAgentRun.Result` / `FinalPayload` | 5,238.9 MB / 5,259.2 MB | 17,211,482 bytes, identical | `base-agent.ts:17431–17442` serializes the final payload once and assigns the **same string** to both |
| `AIAgentRunStep.PayloadAtStart` / `PayloadAtEnd` | 12.1 GB / 12.9 GB | 22,716,274 bytes, identical | `createStepEntity` (`base-agent.ts:11815`) stores the payload the step starts from, which is usually the payload an earlier step ended with; both serializers do a full `JSON.stringify` (`:7024`, `:7036`) |

That's ~5.2 GB of exact duplication, plus up to ~12 GB of near-duplication, in the existing data. The same ratio applies to every new run.

## 2. Part A — `Result` duplicates `FinalPayload`

**Writers.** Only one: `base-agent.ts:17434`.

**Readers.** `FinalPayload` is the canonical field, with 34 non-test references in `packages/`. `Result` has five internal readers:

- **`packages/MJServer/src/resolvers/ConversationRunEventsResolver.ts:213`** (GraphQL `TailConversationEvents`) returns `run.Result ?? detail.Message` as its `FinalPayload` field and loads only `Result` (`RUN_FIELDS`, `:18`; `TailRunRow`, `:10`). If `Result` stops without this switch, the field silently returns the chat message text instead of the payload JSON. In MJ, `graphQLConversationClient.ts:53` selects the field but nothing uses its value; external callers might.
- **`packages/GraphQLDataProvider/src/graphQLAIClient.ts:962`** (`reconcileAgentRun`, which recovers a run after the agent stream stalls) builds `payload` from `run.Result`. Without the switch, a recovered run returns success with no payload.
- `packages/Angular/Explorer/core-entity-forms/.../ai-agent-run/ai-agent-run.component.ts:727–745` and `.html:396` show a "Result" panel. It duplicates the "Final Payload" panel at `.html:459`. Remove it, or show it only when `FinalPayload` is null (old rows).
- `packages/Angular/Generic/conversations/src/lib/services/agent-state.service.ts:237` (the progress stage) and `:257` (a placeholder confidence lookup). At `:237`, a non-null `Result` means "finished", because `Result` is set only at the end of the run.
- `packages/MessagingAdapters/src/base/BaseMessagingAdapter.ts:1229–1247` falls back to `agentRun.Result` "as a simple string, skipped if JSON". Since `Result` is always the JSON payload, this fallback effectively never fires.

Skip-Brain, SaaS, Skip-Client-Open-App and more-cheese have no readers of an agent run's `Result`. The Rubrics engine grades agent runs from `FinalPayload` (`Rubrics/Engine/src/content.ts:87`).

**Change.**

1. Switch the readers to `FinalPayload ?? Result` in the same release that stops the write, so existing rows keep working. `FinalPayload` holds the same JSON string (`base-agent.ts:17442`).
   - For the resolver, add `FinalPayload` to `RUN_FIELDS` and `TailRunRow`.
   - **Exception:** at `agent-state.service.ts:237`, check the run status only. `FinalPayload` is filled during the run (through the `FinalPayloadObject` setter at `:12777`, `:13331`, `:14291`), so it can't mean "finished".
2. Stop assigning `Result` at `base-agent.ts:17434`.
3. Mark `AIAgentRun.Result` as deprecated in its `EntityField` description. Keep the column for at least one release, since GraphQL and REST clients outside this repo may still read it (D1).
4. **Backfill (optional).** In batches, null `Result` where it equals `FinalPayload`, then compact the LOBs (see `plans/ai-log-retention-90-day.md` §4 step 5). Use direct SQL, which also avoids record-change rows:

```sql
-- collect IDs once, then process in batches of ~500
SELECT ID INTO #dup FROM __mj.AIAgentRun
WHERE Result IS NOT NULL AND FinalPayload IS NOT NULL
  AND HASHBYTES('SHA2_256', Result) = HASHBYTES('SHA2_256', FinalPayload);

-- loop:
UPDATE TOP (500) r SET Result = NULL
FROM __mj.AIAgentRun r JOIN #dup d ON d.ID = r.ID
WHERE r.Result IS NOT NULL;
```

## 3. Part B — `PayloadAtStart` repeats an earlier step's `PayloadAtEnd`

**Writers.** In BaseAgent, one place: `createStepEntity` (`:11815`), which every step type goes through.

- Two sub-agent paths serialize the same payload a second time after the step is created (`:13087`, `:14093`). Both are redundant. Between the two serializes the code only reads `previousDecision.newPayload`: `computeChildSubAgentPayload` builds a new object from it. The Prompt path already skips the second serialize (`:12457`).
- Three writers don't go through `createStepEntity`: `TaskGraphDispatcher` (through CorePlus `agent-run-steps.ts`), `AgentManager/core/src/agents/builder-agent.ts:105,148`, and `AI/Reranker/src/RerankerService.ts:749`. The Reranker stores rerank candidates in this column, not the agent payload. All three keep writing full values. This is safe, but they get no savings.

**Readers of stored rows.**

- **Explorer.** `ai-agent-run-data.service.ts` loads every step of a run with all fields, in `loadStepsAndSubRuns` (`:155`) and `LoadSubAgentData` (`:256`). From those rows:
  - `ai-agent-run-step-detail.component.ts:226–252`, plus `.html:188`, uses `PayloadAtStart` as `[oldValue]` in the before/after diff.
  - `ai-agent-run.component.ts:1064–1113` uses `PayloadAtStart !== PayloadAtEnd` to decide whether a step changed the payload.
- **Integration tests.** `ReadSteps` in `_it-live-agent-harness.ts:209` loads `PayloadAtStart`. `agent-payload-guards.checks.ts:469` (PG8) parses it to prove that a failed sub-agent didn't merge. A row whose start wasn't stored would read as NULL and fail PG8.
- **Not a reader:** `run-tree-timeline-projection.ts:211–219` maps workflow-task input/output into the same names. It reads task data, not stored step rows, so it doesn't change.

**Measure first.** There are two kinds of copy:

- **(a)** The start equals the end of an earlier step in the same run. B1 removes these.
- **(b)** The start equals the same row's end. Some steps write this by design: Action steps are created with both set to `currentPayload` (`:14766`), and builder-agent copies start into end (`:109`, `:150`). This kind is a follow-up (D4).

This reads the payloads for one week only:

```sql
SELECT ID, AgentRunID, StepNumber,
       CAST(HASHBYTES('SHA2_256', PayloadAtStart) AS binary(32)) AS h_start,
       CAST(HASHBYTES('SHA2_256', PayloadAtEnd)   AS binary(32)) AS h_end,
       CAST(DATALENGTH(PayloadAtStart) AS bigint)                AS start_bytes
INTO #h
FROM __mj.AIAgentRunStep
WHERE __mj_CreatedAt >= DATEADD(day, -7, SYSUTCDATETIME());

CREATE INDEX ix_h ON #h (AgentRunID, h_end);

WITH m AS (
    SELECT h.start_bytes,
           CASE WHEN EXISTS (SELECT 1 FROM #h p
                             WHERE p.AgentRunID = h.AgentRunID
                               AND p.StepNumber < h.StepNumber
                               AND p.h_end = h.h_start) THEN 1 ELSE 0 END AS earlier_end,
           CASE WHEN h.h_start = h.h_end THEN 1 ELSE 0 END AS own_end
    FROM #h h
    WHERE h.h_start IS NOT NULL
)
SELECT COUNT(*)                                                     AS steps_with_start,
       SUM(earlier_end)                                             AS same_as_earlier_end,
       CAST(SUM(earlier_end * start_bytes) / 1048576.0 AS decimal(18,1)) AS earlier_end_mb,
       SUM(own_end)                                                 AS same_as_own_end,
       CAST(SUM(own_end * start_bytes) / 1048576.0 AS decimal(18,1))     AS own_end_mb,
       CAST(SUM(start_bytes) / 1048576.0 AS decimal(18,1))               AS total_start_mb
FROM m;
```

`earlier_end_mb` overcounts B1's savings slightly, because the query matches against every earlier step and B1 compares against only one.

**Result (production, 7 days to 2026-10-12):**

| steps with a start | same as an earlier end | MB | same as own end | MB | total start MB |
|---|---|---|---|---|---|
| 3,883 | 3,006 (77%) | 1,600.1 (82%) | 2,644 (68%) | 1,448.0 (74%) | 1,955.0 |

- **B1 removes about 82% of `PayloadAtStart` bytes.** That's about 1.6 GB a week at the current rate. If older rows have the same ratio, the backfill frees about 10 GB of the existing 12.1 GB.
- **68% of steps don't change the payload.** For most of these steps, B1 already removes the start, and the remaining copy is in `PayloadAtEnd` (see D4).

**Design options.**

- **B1 (recommended): store NULL plus a pointer to the source step.** Add `PayloadAtStartSourceStepID uniqueidentifier NULL`, with a foreign key to `AIAgentRunStep.ID`. When the serialized start equals an earlier step's `PayloadAtEnd`, store `PayloadAtStart = NULL` and that step's ID. Readers get the value by ID. A NULL `PayloadAtStart` with no pointer still means "no payload". The comparison runs after serialization, so subclass serializer overrides (e.g. Skip's `BaseSkipAgent`) are respected: if the start and end serializers produce different strings, nothing is removed.
  - **Which step to compare against.** In `createStepEntity`, before the new step is added to `_agentRun.Steps` (`:11863`), take the latest step in `_agentRun.Steps` that is no longer `Running` **and has a non-null `PayloadAtEnd`**. Compare only that step, with `===` on its in-memory `PayloadAtEnd`, and point at it only if its INSERT has landed (`IsSaved`). The new step's INSERT is ordered only after its parent, as before.
    - Finished steps with no end (tool, compaction and finish-check steps) are skipped, because they never get an end later and would otherwise hide the step that produced the payload.
    - Unsaved sources are not used. Otherwise a source whose INSERT fails would make every later pointing step fail on the foreign key.
    - Steps that are still running are skipped, because their end can still change:
    - Parallel sub-agent siblings write their own result as `PayloadAtEnd` when they finish (`:13921`).
    - A ForEach step writes its end after all its child steps (`:16836`).
  - **Rule: a step's `PayloadAtEnd` must not change after a later step points at it.** Two places rewrite an end after the step finishes: `:14968` (the last action step, after the payload change request) and `:12832` (prompt failure). Both run before the next step is created, so they are safe today. Write the rule in the helper's comment, and add a unit test that enforces it.
  - **No chains.** Only `PayloadAtStart` is ever removed, and the source is always in the same run, so one lookup always gives the value.
- **B1 with a bit flag (`PayloadAtStartIsPreviousEnd`): rejected.** The reader must guess which step is "previous", and the obvious guess (the previous `StepNumber`) is wrong for parallel sub-agents and ForEach. Example: steps 6–8 run in parallel from step 5's end, P. Step 7's start matches P, but its previous `StepNumber` is step 6, whose end is sub-agent 6's own result. The viewer would show that result as step 7's start.
- **B2: sentinel string in the column.** No schema change, but it leaks into API consumers, exports and the archive. Rejected.
- **B3: drop `PayloadAtStart` and always derive it.** Rejected: the first step, parallel branches and sub-agent boundaries don't always start from the previous step's end.
- **B4: a separate payload table keyed by hash.** This removes every copy, including Part A and copies across runs. Rejected for this follow-up, because it changes the step entity API, GraphQL and the archive.

**Costs and side effects of B1.**

- 16 bytes per row. CodeGen adds an index on the foreign key and a join in `vwAIAgentRunSteps` for the related name field.
- **Deletes:** this has the same delete-order rule as the existing `ParentID` self-reference (`FK_AIAgentRunStep_ParentID`). Delete the referencing steps first, or delete all of a run's steps in one statement.
  - Deleting a whole run works through the API and through direct SQL.
  - Deleting **one** source step through the API (`spDeleteAIAgentRunStep`) sets the pointer on its referencing steps to NULL, so those steps lose their start payload.
  - A direct SQL delete of a single source step is refused by the foreign key.
  - Deleting a whole run through the API runs the generated step delete procedure step by step. To clear each pointer, it reads every column of each pointing step, including the payload columns, and writes them back. For bulk cleanup, use one set-based DELETE per run instead.
- **Deploy:** the migration adds a validated foreign key and an index on `AIAgentRunStep`, a very large table in production. Both lock the table while they scan. Deploy off-peak.
- **Archiving** (`plans/ai-log-retention-90-day.md`) strips both payload columns by `__mj_CreatedAt`. A source step and the step that points at it are in the same run, so they're stripped in the same pass or one pass apart. In the second case, the viewer shows the start as stripped one day early.
- **External API consumers** that read `PayloadAtStart` directly get NULL for rows whose start wasn't stored. They must follow the pointer. Say this in the field description and the changeset.

**B1 work items.**

1. **Migration** (`migrations/v6/`): add `PayloadAtStartSourceStepID uniqueidentifier NULL`, with a foreign key to `AIAgentRunStep(ID)` and an extended-property description. Run CodeGen and append its output.
2. **CorePlus** (`agent-run-steps.ts`): add `ResolvePayloadAtStart(step, stepsById)`. It returns `PayloadAtStart` if set, otherwise the source step's `PayloadAtEnd`, otherwise NULL. The Explorer viewer and the integration suite both already depend on `@memberjunction/ai-core-plus`. Add unit tests.
3. **BaseAgent:**
   - Add a private helper that picks the source step and compares (see above). Call it only from `createStepEntity`.
   - Delete the redundant second serialize at `:13087` and `:14093`.
   - Nothing in `packages/AI/Agents` reads `PayloadAtStart` back from memory, so storing NULL on the step entity is safe. Update the existing tests that reference `PayloadAtStart` (10 files in `src/__tests__`).
   - Add unit tests for these cases:
     - unchanged payload: pointer set, NULL stored
     - changed payload
     - first step
     - parallel sub-agents: siblings point at the step before the group, never at each other
     - ForEach children: never point at the running loop step
     - a subclass whose start and end serializers differ: nothing removed
4. **Explorer:** in `ai-agent-run-data.service.ts`, resolve `PayloadAtStart` on the loaded rows right after both step loads. The step detail and run components then keep reading `PayloadAtStart` with no change.
5. **Integration suite:** add `PayloadAtStartSourceStepID` to the `ReadSteps` fields and resolve there. Then PG8 and the other checks see the full start.
6. **Backfill (optional).** Build `#h` as in the measurement query, without the date filter. Then point each matching step at the latest earlier step with the same end, NULL its start in batches with direct SQL, and compact the LOBs (see `plans/ai-log-retention-90-day.md` §4 step 5). Any matching step is a correct source, because the pointer only claims that the content is equal.

```sql
SELECT h.ID, src.ID AS SourceID
INTO #b
FROM #h h
CROSS APPLY (SELECT TOP 1 p.ID FROM #h p
             WHERE p.AgentRunID = h.AgentRunID
               AND p.StepNumber < h.StepNumber
               AND p.h_end = h.h_start
             ORDER BY p.StepNumber DESC) src
WHERE h.h_start IS NOT NULL;

-- loop:
UPDATE TOP (500) s SET PayloadAtStart = NULL, PayloadAtStartSourceStepID = b.SourceID
FROM __mj.AIAgentRunStep s JOIN #b b ON b.ID = s.ID
WHERE s.PayloadAtStart IS NOT NULL;
```

## 4. Related, not in scope: `AIPromptRun.Messages` stores template data that was never sent

`AIPromptRunner.ts:3975` stores `JSON.stringify({ data: params.data, templateData: params.templateData, messages })` on every prompt run. For the Skip Query Writer, ~96% of the stored `Messages` was never part of the prompt: about 10 MB stored per run in October against ~50k prompt tokens actually sent. That's likely the largest remaining MJ-side lever after compression.

Option: store only `messages` (what was sent) by default, and make `data`/`templateData` capture opt-in per prompt or agent for debugging. Planned separately in `plans/prompt-run-data-storage-and-step-redaction.md` (D3).

## 5. Verification

- **Unit tests** in `packages/AI/Agents` (both parts) and `packages/AI/CorePlus` (the resolver). Check that existing agent tests still pass.
- **Integration tier** (`pnpm run test:integration`) after the migration and CodeGen, including PG8.
- **Explorer:** open three runs: a plain sequential run, a run with parallel sub-agents, and a ForEach run. For each one, confirm that the before/after diff and the "changed" indicator match the pre-change behavior.
- **Production, after deploy:**
  - New `AIAgentRun` rows have `Result IS NULL`.
  - New steps with `PayloadAtStartSourceStepID` set appear at about the `same_as_earlier_end` share from the §3 measurement.
  - The ratio `SUM(DATALENGTH(PayloadAtStart)) / SUM(DATALENGTH(PayloadAtEnd))` for new steps drops by about `earlier_end_mb / total_start_mb`.

## 6. Open decisions

- **D1.** Decided 2026-10-12: stop writing `Result` now, in the same release as the reader switch. Keep the column, marked deprecated.
  - **Impact of stopping now:**
    - MJ: none, if all five readers switch in the same release (§2).
    - Other repos on this machine: none.
    - Unknown external GraphQL/REST clients that read `AIAgentRun.Result` get NULL for new runs. Old rows keep their value unless backfilled.
    - Browser tabs that still run an old Explorer build during the deploy lose the stall-recovery payload and the "completing" stage until the page is refreshed.
  - **Cost of keeping the write for one more release:** another release's worth of duplicate final payloads (5.2 GB so far in total).
- **D2.** Decided 2026-10-12: do B1. The §3 measurement shows that 82% of start bytes are copies.
- **D3.** Decided 2026-10-12: separate plan, `plans/prompt-run-data-storage-and-step-redaction.md`.
- **D4.** Decided 2026-10-12: a follow-up plan after B1 ships and its savings are confirmed in production. Question: should steps that don't change the payload (68% of steps, ~1.4 GB a week) also stop storing `PayloadAtEnd`?
  - **What it saves.** B1 already removes the start of most of these steps, so the remaining copy is the end. To remove it, store `PayloadAtEnd = NULL` and add a second pointer, `PayloadAtEndSourceStepID`, to the step that holds the stored copy. If the step has no earlier source (e.g. the first step), point its start at its own row instead.
  - **Rule that keeps one lookup.** A pointer always targets a row whose `PayloadAtEnd` is stored. When the B1 writer finds that its source step's end is itself a pointer, it uses that pointer's target.
  - **Why it's harder than B1.**
    - BaseAgent writes `PayloadAtEnd` in ~13 places, and it rewrites the end after the step finishes (`:14968`).
    - BaseAgent reads `PayloadAtEnd` back from memory on three error paths (`:12828`, `:13353`, `:14313`), and B1's own comparison reads it too. So the end must stay complete in memory and become NULL only in the database row. That needs its own design.
