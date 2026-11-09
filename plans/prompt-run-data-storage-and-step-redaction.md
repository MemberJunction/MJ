# Prompt-run data storage and agent-step redaction (MJ#5526)

**Status:** Design approved 2026-10-13. Phase 1 implemented and reviewed 2026-10-13, uncommitted on `CB-agent-run-payload-dedupe`; implementation plan: `plans/prompt-run-data-storage-phase1-implementation.md`. Open: Q1 (backfill, §3.6 item 9); live IT56 run (needs valid Anthropic/OpenAI keys); phase 2 on its own branch.
**Ask:** [MemberJunction/MJ#5526](https://github.com/MemberJunction/MJ/issues/5526). Replaces `plans/prompt-run-messages-data-capture.md`.
**Scope:**
- **Phase 1, storage (branch `CB-agent-run-payload-dedupe`):** `packages/Templates/engine`, `packages/AI/Prompts`, `packages/AI/CorePlus`, the Explorer prompt-run form, the integration-test payload checks, and one column added to this branch's migration.
- **Phase 2, redaction (its own branch):** `packages/AI/Agents` (Actions steps).

**Related:** `plans/agent-run-duplicate-payload-writes.md` (same branch as phase 1), MJ#5509 (field-level compression), MJ#3947 (prompt subtraction), BlueCypress/Skip-Brain#607 (Skip-side trim of Query Writer data).

---

## 1. Problem

`AIPromptRunner` stores this in `AIPromptRun.Messages` on every prompt run (`AIPromptRunner.ts:3975`; the same shape at `:874` for the consolidated parent of a parallel run):

```ts
JSON.stringify({ data: params.data, templateData: params.templateData, messages })
```

`messages` is what the model received: the rendered system prompt plus the conversation messages. `data` and `templateData` are the template inputs, and most of them are never rendered.

**Storage.**
- **The payload is stored twice.** `loop-agent-type.ts:1040` and `flow-agent-type.ts:505` set `prompt.data._CURRENT_PAYLOAD = payload`. Callers also spread the same keys into `data`, so each run stores two copies. This happens even when the template does not render the payload. The step payload columns already hold it.
- **Shared context the template does not read.** In Skip, a 150 KB component catalog sits in `data` for five agents, and only one template renders it. It used 199 MB across 1,341 runs.
- **Scale.** On one local Skip database, Query Writer `Messages` totals 9.6 GB over 5,529 runs, and `$.messages` is about 15% of that.

**Client data at rest.**
- Sample rows and SQL test results reach the log in three places:
  - `$.data`;
  - the rendered prompt in `$.messages`;
  - `AIAgentRunStep.OutputData`.
- `data` also carries permission rows from `EntityInfo` objects.

**Gap found while planning.** Agent Actions steps store raw action parameters:
- `InputData.actionParams` (`base-agent.ts:14813`);
- `OutputData.actionResult.parameters` (`:14844`).

This bypasses `ActionParam.LogValue`. The action log honors that flag through `RedactParams` (`Actions/Base/src/ParamRedaction.ts`). So a parameter declared "do not log" is hidden in `ActionExecutionLog`, but it is still stored on the agent step.

## 2. What this plan fixes

| Issue item | Fixed by | Result |
|---|---|---|
| `data` the template never reads | Phase 1 | Default stores no values; opt-in modes store referenced keys or everything |
| `_CURRENT_PAYLOAD` stored twice | Phase 1 | Never stored in any mode |
| Client rows and permission rows in `$.data` | Phase 1 | Default stores shape only (keys and sizes) |
| Action parameters marked `LogValue = 0` on agent steps | Phase 2 | Redacted with the same rules as the action log |
| Client rows rendered into `$.messages` | — | **Not fixed** (§5) |
| Other action output in step `OutputData` | — | **Not fixed** unless the parameter is marked `LogValue = 0` (§5) |

## 3. Phase 1: storage (this branch)

### 3.1 The capture setting

- **Column:** `AIPrompt.TemplateDataCapture nvarchar(20) NULL`, with a CHECK for `'None'`, `'Referenced'` or `'Full'`. NULL means "use the server default". Description: `Which template inputs (data, templateData) prompt runs store in Messages: None (shape only), Referenced (only keys the template uses) or Full. NULL uses the server default.`
- **Call override:** `AIPromptParams.TemplateDataCapture?: 'None' | 'Referenced' | 'Full'` (`packages/AI/CorePlus/src/prompt.types.ts`). PascalCase, per the naming rule for new public members.
- **Server default:** `aiPromptRuns.templateDataCapture` in `mj.config.cjs`. When it is absent, the code uses `'None'`; no shipped config file changes (they are host artifacts).
  - Add the optional section to the MJServer config schema (`MJServer/src/config.ts`) as a `z.enum`. Like the schema's other enums, a typo there stops MJServer at startup.
  - `AIPromptRunner` reads the setting once per process with a cosmiconfig search from the working directory, as `APIKeyEngine` does (`LoadMJConfigSync` needs an explicit file path). So the setting also works in other hosts, such as the CLI and Skip.
  - In those hosts, an invalid value logs a warning and uses `'None'`.
- **Precedence:** the call override, then the prompt column, then the server default.
  - **Which prompt's column (ruling, 2026-10-13):** the most specific prompt wins. The runner reads the child prompts first, depth first, and uses the first value that is not NULL. Then it reads the main prompt. For a Loop or Harness agent, the main prompt is the shared agent-type system prompt and the agent's own prompt is a child prompt. So a value on the agent's prompt applies to that agent only, and a value on the agent-type prompt applies to every agent of that type that has no value of its own.

### 3.2 What `Messages` stores

Every mode stores `messages` exactly as today, plus a `dataCapture` marker. `_CURRENT_PAYLOAD` is removed from `data` and `templateData` before the mode applies.

| Mode | Added to `Messages` |
|---|---|
| `None` (default) | `dataShape`: for `data` and `templateData`, the key count, the total value bytes, and each top-level key with the UTF-8 byte length of its JSON value. Top-level keys only, at most 25 keys per object (the largest, with `keysElided: true` when there are more), so it is shape, never values (the same rule as `RedactedParam` in the action log). |
| `Referenced` | `data` and `templateData` with only the keys the run's templates use (§3.3). |
| `Full` | `data` and `templateData` as today. |

- If `Referenced` cannot finish its analysis, the run stores `Full`. The marker then says so: `dataCapture: 'Full'`, `dataCaptureNote: '<reason>'`.
- The consolidated parallel run (`:874`) keeps its `parallelExecution` block.
- Parallel child runs (`ParallelExecutionCoordinator.ts:1065`) already store only what was sent. They do not change.
- One private helper in `AIPromptRunner` builds the stored object for both write sites.

Example (`None`):

```json
{
  "dataCapture": "None",
  "dataShape": {
    "data": { "keyCount": 2, "totalBytes": 419840, "keys": { "compositionContext": 266240, "componentCatalog": 153600 } }
  },
  "messages": [ { "role": "system", "content": "…" } ]
}
```

### 3.3 Which keys `Referenced` keeps

- **New method on the template engine** (`packages/Templates/engine/src/TemplateEngine.ts`): `GetReferencedVariables(templateText)`. It returns `{ Names: ReadonlySet<string>; Complete: boolean; Reason?: string }`.
  - It parses the text with the Nunjucks parser and the engine's registered extensions, so MJ's custom tags parse (they are added at `:116`).
  - It collects every `Symbol` node name. This includes loop variables, `set` variables and filter names. That is harmless, because the runner keeps only names that are also data keys.
  - It follows `{% include %}`, `{% import %}`, `{% from %}`, `{% extends %}` and `{% template %}` when the name is a string literal, recursively, with a cycle guard. It finds the template by name (`FindTemplate`) and reads all of its contents. MJ's Nunjucks loader looks templates up by ID, so it cannot resolve these names.
  - A name that is an expression, a template that cannot be found, or text that does not parse sets `Complete = false` with a reason.
  - It caches results per template text, cleared with the template cache.
- **The runner** combines the names from the main template and from every child prompt template rendered in the same run (child render at `AIPromptRunner.ts:1124–1132`). Then it keeps the matching keys of `data` and `templateData`.
- **Why parse, not track reads at render time:** Nunjucks copies the whole context before it renders (`nunjucks/src/environment.js:332`, `this.ctx = lib.extend({}, ctx)`), so every key would look read.
- **A probe confirmed it works:** Nunjucks 3.2.4 exports `parser` and `nodes`. A walk over a sample template returned `rows`, `_CURRENT_PAYLOAD` and `user` (plus `r`, `x` and `dump`, which do not match any data key).

### 3.4 Readers

- **CorePlus** `MJAIPromptRunEntityExtended.ParseMessagesData` (`:50`) also returns `dataCapture`, `dataShape` and `dataCaptureNote`. Old rows have none of these and parse as before.
- **Explorer prompt-run form** (`ai-prompt-run-form.component.ts:491`, `.html:325–331`): when no `data` was stored, the Input Data area shows a note, for example "Template data was not stored for this run (capture: None)", followed by the shape: the keys and their sizes.
- **Integration checks:** `childPromptText` (`agent-payload-guards.checks.ts:91`) searches raw `Messages` text.
  - PG1's positive control (`:180`) would fail.
  - PG1 (`:181`) and PG5 (`:328`) would pass even when there is a leak.
  - The other uses (`:176`, `:194`, `:293`, `:318`, `:528`) need the same review.
  - Change these checks to read what the child received from the child agent's run rows: its run payload and its first step's resolved start (`ResolvePayloadAtStart`).
  - AL3 (`agent-loop-live.checks.ts:159`) looks for `42` in `Messages`. Action results are in `messages`, so it should still pass; confirm it in the integration run.
- **Not affected:**
  - **Re-Run:** the test harness uses only `GetChatMessages` and sends `templateData: undefined` (`ai-test-harness.component.ts:2308`).
  - **The realtime co-agent:** it stores a plain message array.
  - **Rubrics:** it grades the whole `Messages` string, which is now smaller.
  - **Other repos:** Skip-Brain and SaaS have no readers.
- **External API clients** that parse `data` out of `Messages` see it disappear. Say this in the changeset.

### 3.5 Schema and CodeGen

- Add the `AIPrompt` DDL (column, CHECK, description) to this branch's migration. That file is renamed at rebase anyway (`plans/agent-run-duplicate-payload-writes.md`).
- Apply the same DDL by hand on the private database (Flyway rejects an edited, already-applied migration), run CodeGen there, append its `AIPrompt` output to the migration's generated section, and keep the regenerated entity, GraphQL and form files.
- The fresh-database check of the whole file runs at the rebase step, together with the rename.
- No metadata changes.

### 3.6 Work items

1. **Migration + CodeGen** (§3.5). Run the EntityField sequence gate and `check:codegen-tail`.
2. **CorePlus:**
   - add `AIPromptParams.templateDataCapture`;
   - add the `ParseMessagesData` fields (§3.4);
   - tests.
3. **Templates engine:**
   - add `GetReferencedVariables`;
   - tests: symbols, custom tags parse, literal include/embed followed, cycle guard, dynamic include gives `Complete = false`, cache hit.
4. **AI/Prompts:**
   - resolve the mode (§3.1);
   - add the helper and use it at `:874` and `:3975`;
   - drop `_CURRENT_PAYLOAD`;
   - combine the child-template names;
   - tests: each mode, the fallback to `Full`, the parallel consolidated run, the precedence order, an invalid config value.
5. **Config:** the optional MJServer schema section. The `'None'` default lives in code.
6. **Explorer:** the prompt-run form note and shape, with a DOM test.
7. **Integration checks** (§3.4).
8. **Changeset:** add every changed package, `minor`, with the API note.
9. **Backfill (optional, Q1):** strip `data` and `templateData` from rows from the last 90 days in batches, then compact the LOBs.

```sql
UPDATE TOP (500) __mj.AIPromptRun
SET Messages = JSON_MODIFY(JSON_MODIFY(Messages, '$.data', NULL), '$.templateData', NULL)
WHERE __mj_CreatedAt >= DATEADD(day, -90, SYSUTCDATETIME())
  AND ISJSON(Messages) = 1
  AND (JSON_QUERY(Messages, '$.data') IS NOT NULL OR JSON_QUERY(Messages, '$.templateData') IS NOT NULL);
```

### 3.7 Measure and verify

Before the change, measure the share of `Messages` that is `data` and `templateData`, per prompt, over one week, off-hours:

```sql
SELECT p.Name AS prompt,
       COUNT(*) AS runs,
       CAST(SUM(CAST(DATALENGTH(r.Messages) AS bigint)) / 1048576.0 AS decimal(18,1)) AS messages_mb,
       CAST(SUM(CAST(ISNULL(DATALENGTH(JSON_QUERY(r.Messages, '$.data')), 0) AS bigint)) / 1048576.0 AS decimal(18,1)) AS data_mb,
       CAST(SUM(CAST(ISNULL(DATALENGTH(JSON_QUERY(r.Messages, '$.templateData')), 0) AS bigint)) / 1048576.0 AS decimal(18,1)) AS template_data_mb
FROM __mj.AIPromptRun r
JOIN __mj.AIPrompt p ON p.ID = r.PromptID
WHERE r.__mj_CreatedAt >= DATEADD(day, -7, SYSUTCDATETIME())
  AND ISJSON(r.Messages) = 1
GROUP BY ROLLUP (p.Name)
ORDER BY GROUPING(p.Name) DESC, messages_mb DESC;
```

Verification:
- Unit tests in every changed package.
- The deterministic integration tier, including PG1, PG5 and AL3.
- In Explorer, open a new prompt run in each mode. Confirm that the note and the shape show, and that Re-Run works.
- In production after deploy, `Messages` bytes per run drop by about the `data_mb + template_data_mb` share. Check Skip Query Writer specifically.

## 4. Phase 2: honor `ActionParam.LogValue` on agent steps (own branch)

- **The fix:** in `executeActionsStep`, persist action parameters through the action-log redaction from `@memberjunction/actions-base`, with the action's parameter definitions. `AI/Agents` already depends on that package.
  - `InputData.actionParams` (`base-agent.ts:14813`): map the model's `{ name, value }` list to `ActionParam`, then call `RedactParamsToRecord`.
  - `OutputData.actionResult.parameters` (`:14844`): call `RedactParams(actionResult.Params, definitions)`.
- **The model is not affected.** In-memory values stay raw: the model, the payload and the next prompt see what they see today. Only the stored step rows change.
- **Sweep:** find any other place an agent persists `aa.params` or `actionResult.Params`, and route it the same way.
- **Tests:**
  - a `LogValue = 0` parameter is redacted in `InputData` and in `OutputData`;
  - a `LogValue = 1` parameter is stored;
  - the redaction record carries shape only;
  - the next prompt still gets the raw value.
- **Changeset:** `@memberjunction/ai-agents`, `patch` (no migration on that branch).

## 5. Not in this plan

- **Not included:** controls that would hide client data inside rendered prompts:
  - data-key and payload-path "do not log" flags;
  - `{% sensitive %}` span marking in templates;
  - a per-agent "do not store message bodies" switch.
- **What remains after both phases:**
  - rows that a template renders into `$.messages` are still stored;
  - action output in step `OutputData` is still stored unless its parameter is marked `LogValue = 0`.
- **Recommendation:** keep MJ#5526 open for that part after both phases ship, or move it to a new issue.

## 6. Decisions (made 2026-10-13)

- **D1.** Plan both parts. Phase 1 ships on `CB-agent-run-payload-dedupe`; phase 2 gets its own branch.
- **D2.** Capture modes are `None`, `Referenced` and `Full`, and the default is `None`.
- **D3.** The setting is an `AIPrompt` column, overridden per call, with a server default in `mj.config`.
- **D4.** `Referenced` is computed by parsing the template text, falling back to `Full` when the analysis is incomplete.
- **D5.** `None` stores a shape record (keys and byte sizes).
- **D6.** `_CURRENT_PAYLOAD` is never stored, in any mode.
- **D7.** The redaction phase covers only `ActionParam.LogValue` on agent steps.

## 7. Open questions

- **Q1.** Backfill old rows (§3.6 item 9), or let them age out?
