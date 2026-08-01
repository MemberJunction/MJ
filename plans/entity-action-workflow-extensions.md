# Entity Action Workflow Extensions

> **Status:** Draft v0.1 (2026-08-01) — schema authored, engine work specified, not yet built.
> **Migration:** [`migrations/v5/V202608011200__v5.52.x__EntityAction_Workflow_Extensions.sql`](../migrations/v5/V202608011200__v5.52.x__EntityAction_Workflow_Extensions.sql)
> **Driven by:** the BizApps Sales / Contracts workflow requirement — "when a Deal reaches Closed
> Won, run a workflow, configurable per Deal Type and per Company." Generalized here because it is
> a framework need, not a sales need.

---

## 1. The question this answers

Every business app eventually wants: *when this record reaches this state, run something —
configurable by an administrator, without a developer.* Today that gets solved four different ways
in four different apps.

MemberJunction already has the right substrate: **`EntityAction`**, designed as the generalized hook
for running any Action off an entity's create / update / delete / validate. It is wired into the
real save path and it works. Four small gaps stop it from being the answer for workflow, and this
plan closes them.

**The conclusion up front: no new subsystem, in core or in any OpenApp.** Additive columns, one
extended value list, and bounded engine changes — plus one behaviour change to execution logging
that has to ship with them (§5), because the feature is unsafe to turn on without it.

---

## 2. What `EntityAction` already does

Verified against the code, because most of this is not obvious from the schema alone.

### 2.1 It is genuinely wired into the save path

`DatabaseProviderBase.HandleEntityActions` is overridden by `GenericDatabaseProvider` and called at
four points:

| Invocation type | Call site | Semantics |
|---|---|---|
| `Validate` | `OnValidateBeforeSave` | **Blocking gate.** Non-`Success` results are joined into a message that fails validation, and the save does not happen. |
| `BeforeCreate` / `BeforeUpdate` | `OnBeforeSaveExecute` | `await`ed — but the result is discarded, so these cannot veto. |
| `AfterCreate` / `AfterUpdate` | `OnAfterSaveExecute` | Fire-and-forget (`// NO AWAIT INTENTIONALLY`). |
| `BeforeDelete` / `AfterDelete` | delete path | Same before/after split. |

Plus `Read`, `List`, `View` and `SingleRecord` for on-demand and set-based invocation.
`EntitySaveOptions.SkipEntityActions` is the escape hatch and is correctly propagated through
parent/child saves.

**The `Validate` gate is the important one.** It is a real precondition — "this cannot be approved
until X" is already expressible, and most people do not know it.

### 2.2 The pieces

| Entity | Role |
|---|---|
| `EntityAction` | `EntityID` + `ActionID` + `Status`. The binding. |
| `EntityActionInvocation` | Many-to-many with `EntityActionInvocationType` — one binding can fire on several events. |
| `EntityActionFilter` | Ordered (`Sequence`) links to reusable top-level `ActionFilter` rows (`UserDescription` + `Code`). |
| `EntityActionParam` | `ActionParamID` + `ValueType` (`Static` \| `Entity Object` \| `Entity Field` \| `Script`) + `Value`. |

`ActionFilter` being a **top-level reusable entity** rather than per-binding is the design detail
that makes §4.2 cheap.

### 2.3 It can already run an agent

`Execute Agent` (`packages/Actions/CoreActions/src/custom/ai/execute-agent.action.ts`) is a normal
Action, so anything that can fire an Action can run an agent — flow or loop.

| Direction | Params |
|---|---|
| **In** | `AgentID` **or** `AgentName` (one required) · `ConversationMessages` (`ChatMessage[]`) · `Data` (`Record<string, unknown>` — the agent payload) · `ConversationDetailID` · `LastRunID` · `MaxExecutionTimeMs` |
| **Out** | `AgentRunID` · `Payload` · `AgentResult` |
| **Guards** | Agent must be top-level (`ParentID` null) **and** `ExposeAsAction = true` |

**The full mapping chain, end to end:**

```
EntityActionParam (ValueType/Value)
   → EntityActionInvocationBase.MapParams(action.Params, entityAction.Params, entityObject)
   → ActionParam[]
   → ActionEngineServer.RunAction({ Action, Params, Filters, ContextUser })
   → ExecuteAgentAction.getParamValue(...)
   → AgentRunner.RunAgent({ agent, data, conversationMessages, ... })
```

So a `Deals` → `Execute Agent` binding with one `EntityActionParam` mapping the deal onto `Data`
is a complete, working configuration today — **except for one trap**, which is §4.3.

---

## 3. What was missing, and why each gap matters

| # | Gap | Consequence today |
|---|---|---|
| 1 | **No scope binding to a configuration record** | "Tie this workflow to *this* Deal Type" has to be written inside `ActionFilter.Code`. It works, but the Deal Type form cannot show "here are your workflows" without parsing filter code, so the configuration is invisible where an administrator looks for it. |
| 2 | **No declarative transition semantics** | `AfterUpdate` fires on *every* update. "Moved **to** Closed Won" needs old-vs-new, so every author hand-writes it and someone eventually writes "status **is** won" — which re-fires on every later save and creates duplicate onboarding tasks. |
| 3 | **No ordering between bindings** | `EntityActionFilter` has `Sequence`; `EntityAction` does not. Two actions on one event run in undefined order. |
| 4 | **`After*` is fire-and-forget with no durable record** | Errors are logged and swallowed. For a workflow that creates a contract and orders, silent failure is unacceptable — and the sibling path already solved this (see §4.4). |
| 5 | **The execution log has no entity-action provenance** | `ActionExecutionLog` cannot say which binding fired, on which record, from which event. A failed workflow is undiagnosable (§5.1). |
| 6 | **Param logging writes every value, unconditionally** | And entity-action params are whole records — so turning this feature on writes full rows into a general-purpose log, twice per invocation. This is the one that makes the feature *unsafe*, not merely incomplete (§5.2). |

---

## 4. The changes

### 4.1 `EntityAction.ScopeEntityID` + `ScopeRecordID` *(migration — done)*

Two nullable columns, paired by `CK_EntityAction_Scope`. `NULL` = applies to all records, exactly as
today.

One mechanism covers *this Deal Type*, *this Contract Type*, *this Pipeline*, *this Company* — and
whatever the next app needs — with **zero per-app columns, ever**. That is the whole point: the
alternative is `DealType.OnCloseWonAgentID`, `ContractType.OnExecutedAgentID`, and one new column
per type × event forever.

**How the framework interprets the pair:** it does not. The framework stores it and filters on it;
*how* a scope record relates to a subject record is resolved by the app that owns the scope entity,
via a resolver seam (§4.5). Sales knows that a Deal relates to a Deal Type through
`Deal.DealTypeID`; core must not.

### 4.2 Declarative transition filters *(no schema change)*

`ActionFilter` is already reusable and top-level. Seed two, via metadata:

| Filter | `UserDescription` | Behaviour |
|---|---|---|
| `Field Changed` | "The named field changed in this save" | true when the field is dirty |
| `Field Changed To Value` | "The named field changed **to** the given value" | true when dirty **and** the new value matches |

Both need old-vs-new, which `BaseEntity` already tracks per field. The engine work is to give filter
code a **documented, stable contract** for reaching it — today `EntityActionContext.EntityObject` is
in scope for `Script` params, and the filter evaluation path needs the same guarantee plus explicit
`OldValues` / `NewValues`.

This is the cheapest of the four fixes and it removes the highest-consequence bug class.

### 4.3 `EntityActionParam.ValueType` gains `'Entity Object Data'` *(migration — done)*

`'Entity Object'` passes the live `BaseEntity`. That is correct for actions that call entity methods
and **wrong for anything that serializes the value** — most importantly `Execute Agent`'s `Data`
payload, which is `Record<string, unknown>` and gets JSON-serialized into the agent run.

BaseEntity fields are **getters, not enumerable own properties**, so the agent receives `{}` —
silently, with no error at any layer. This is the same trap the framework already documents for the
spread operator, and the same fix: `GetAll()`.

A `Script` param returning `EntityActionContext.EntityObject.GetAll()` works today. But every author
reaches for `Entity Object` first, gets an empty payload, and has nothing to debug against — so the
safe option needs to exist **by name**. The engine change is one `case` in `MapParams`.

> The existing `ValueType` description in the database says *"Static, Entity Object, or Script"* —
> already stale, since `Entity Field` shipped. The migration corrects it.

### 4.4 Route `After*` through `QueueManager` *(engine)*

`OnAfterSaveExecute` currently drops the promise:

```ts
this.HandleEntityActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
```

The **Entity AI Action** path in the same file already solved this — `EnqueueAfterSaveAIAction`
hands off to `QueueManager.AddTask`. Non-AI Entity Actions never got the same treatment.

Routing After\* through the queue gives a durable task, retry, and a run record, and makes the two
sibling paths consistent. This is a consistency fix, not a new subsystem.

**Before/Validate stay synchronous and in-transaction** — that is what makes `Validate` a real gate.
The rule that follows: **synchronous bindings should be Actions, never agents.** A loop agent's
duration is unbounded, and holding a database transaction open for it is not acceptable. Worth
enforcing with a warning at minimum.

### 4.5 Scope resolution seam *(engine)*

`EntityActionEngineBase` filters candidate bindings. Scoped bindings need one more question
answered: *does this subject record fall under this scope record?*

A `@RegisterClass`-resolved `EntityActionScopeResolver`, keyed by scope entity name, most-specific
wins, with a default that walks the subject's foreign keys looking for one that points at the scope
entity. Sales registers nothing for `Deal Types` because the default FK walk finds `Deal.DealTypeID`;
an app needing something indirect (scope by Company where the subject reaches Company through a
Pipeline) registers a resolver.

Same shape as `BasePriceResolver` in BizApps Orders and `GLAccountResolver` in Accounting — decline
by returning null, most-specific wins.

---

## 5. Execution logging — provenance, and payloads that are safe to write

Two problems with one cause, and the second is why this section is not optional.

### 5.1 Provenance *(migration — done)*

`ActionExecutionLog` records `ActionID` / `StartedAt` / `EndedAt` / `Params` / `ResultCode` /
`UserID` / `Message`. It cannot answer *which binding fired this, on which record, from which event* —
so the moment Entity Actions become the workflow substrate, a failed workflow is undiagnosable.

Four nullable columns: `EntityActionID`, `EntityActionInvocationTypeID`, `TargetEntityID`,
`TargetRecordID`.

**Extended rather than a side table** because the child is optional, small and 1:1 — nullable columns
beat a join in that shape, and "did this action run" stays one query. Accounting already uses the
same pattern with `JournalEntry.LinkedEntityID` / `LinkedRecordID`.

`TargetEntityID` is denormalized rather than derived through `EntityActionID` deliberately: it
survives the binding being deleted or retargeted, and it lets the log be queried by record with no
join. It is also kept **generic** — every invoker has a subject, not only Entity Actions.

**Not** generic: the invoker. A `InvokedByEntityID`/`InvokedByRecordID` pair would also cover Record
Processes, agent flow steps and scheduled actions — but those already have their own detail logs
(`RecordProcessRunDetail`, `AIAgentRunStep`), so it would duplicate them while giving up foreign-key
integrity. Concrete FK for the case we know matters; generalize only if a second invoker turns up
that genuinely lacks its own log.

### 5.2 🚨 Param logging is currently unsafe for this feature

`ActionEngine.StartActionLog` writes `JSON.stringify(params.Params)` on **every** run, and
`EndActionLog` writes the merged input+output set again. Unconditionally — there is no opt-out on
`Action`. (The writes are queued and fire-and-forget, so performance is not the issue.)

That is harmless while Entity Actions are unused. It stops being harmless the instant they are the
workflow substrate, because **entity-action params are whole records**: `ValueType='Entity Object'`
and `'Entity Object Data'` put the entire row into `ActionExecutionLog.Params`, twice per invocation.
An `AfterUpdate` binding on a busy entity therefore writes the full record to a general-purpose log
on every save.

- **Space** — the `NVARCHAR(MAX)` payload is the size problem, not the row. A row per invocation is
  cheap; a record serialized twice is not.
- **Security** — message bodies, Person fields, contract terms landing in a log with broad read
  access. `RetentionPeriod` deletes it eventually, which is not the same as never writing it.

### 5.3 The posture: fail-closed

The safe behaviour is the default; logging a value is opt-in. Same posture the family takes
elsewhere for sensitive defaults.

| # | Rule | Where |
|---|---|---|
| 1 | **Hard rule, no configuration.** Params whose `ValueType` is `'Entity Object'` or `'Entity Object Data'` are **never** written to the log. They are whole records by definition. The log records the param name, its type, and a redaction marker. | Engine |
| 2 | `ActionParam.LogValue` — the *definition* declares whether a param's value is loggable at all. Default `1`. Set `0` on `Execute Agent`'s `Data` and anything carrying credentials or personal data. | Migration ✓ |
| 3 | `EntityActionParam.LogValue` — per-binding override, `NULL` inherits. Lets one binding redact a param that is ordinarily fine to log. Cannot re-enable what rule 1 suppresses. | Migration ✓ |
| 4 | `EntityAction.LoggingMode` — `All` (default) / `FailuresOnly` / `None`. Volume control for high-frequency bindings, where successful runs are noise. | Migration ✓ |

**Rule 1 is what actually closes the hole.** Rules 2–4 handle the grey area — a `Static` param
holding an API key, an `Entity Field` holding a national ID — and volume.

### 5.4 The redaction record shape

When a value is suppressed the log still records that the param existed, so a run is reconstructable
without the payload:

```jsonc
{ "Name": "Data", "Type": "Input", "ValueType": "Entity Object Data",
  "Logged": false, "Reason": "WholeRecordValueType", "ByteLength": 4182 }
```

`ByteLength` without the bytes is deliberate: it makes "the payload was enormous" diagnosable without
making it readable.

---

## 6. What to do after CodeGen

The migration is inert on its own. **This is the order, and it matters** — steps 4 and 5 are what
make the feature safe to use, so bindings that pass whole records must not be authored before they
land.

| # | Step | Notes |
|---|---|---|
| **1** | Apply the migration | `mj migrate` |
| **2** | `mj sync push --include=entities`, **then** `mj codegen` | Push before CodeGen or stale JSONType definitions silently truncate generated interfaces — see [`migrations/CLAUDE.md`](../migrations/CLAUDE.md). Commit the generated output. |
| **3** | Verify the value list regenerated | `EntityActionParam.ValueType`'s `EntityFieldValue` rows and its generated TypeScript union both come from the CHECK constraint. `'Entity Object Data'` must appear in both. **Never hand-insert `EntityFieldValue`.** |
| **4** | **`MapParams`: the `'Entity Object Data'` case** | `entity.GetAll()`. Smallest change, highest value per line. |
| **5** | **`StartActionLog` / `EndActionLog`: the redaction rules (§5.3)** | Rule 1 first — it needs no configuration and closes the hole on its own. **Until this lands, do not author bindings that pass whole records.** |
| **6** | `EntityActionEngineBase`: `Sequence` ordering + scope filtering via the resolver seam (§4.5) | |
| **7** | Stamp the new `ActionExecutionLog` columns on the entity-action invocation path | §5.1 |
| **8** | Filter contract: documented `OldValues`/`NewValues`; seed the two `ActionFilter` rows in `metadata/action-filters/` | §4.2. Metadata, not SQL inserts. |
| **9** | `OnAfterSaveExecute` → `QueueManager` | §4.4 |
| **10** | Indexes, once query patterns are real | Deliberately **not** in the migration — the repo's rule is that indexes are not hand-authored unless requested, and CodeGen owns FK indexes. Two composites are likely wanted: `EntityAction (ScopeEntityID, ScopeRecordID)` for the configuration UI's reverse lookup, and `ActionExecutionLog (TargetEntityID, TargetRecordID, StartedAt DESC)` for "what ran against this record". Measure first. |
| **11** | Explorer UI: scoped bindings on the scope record's form | What makes §4.1 visible |
| **12** | A guide covering the whole hook story, agent dispatch, the sync/async rule and the logging posture | The capability is under-documented, which is why apps keep reinventing it |

Steps 4, 5 and 8 are independent and parallelizable. 6 gates 11. **5 gates production use.**

---

## 7. What this deliberately is not

- **Not a replacement for `MJ: Record Processes`.** That owns WORK × SCOPE × TRIGGER for *bulk and
  scheduled* work over views, lists and filters. EntityAction owns *per-record lifecycle* hooks.
  Different jobs; both dispatch into the same Action/Agent layer.
- **Not a BPM engine.** Multi-step orchestration is what **Flow Agents** are for — a deterministic
  DAG with `Action` / `Prompt` / `Sub-Agent` / `ForEach` / `While` steps, per-step `OnErrorBehavior`,
  `RetryCount`, `TimeoutSeconds`, and a visual editor. EntityAction is the *trigger*; the flow agent
  is the *workflow*. The recommended shape is a flow agent with a `Sub-Agent` step calling a loop
  agent where judgement is genuinely required.
- **Not a human-task system.** Two mechanisms already exist and they are not interchangeable:
  **`MJ: AI Agent Requests`** pauses an agent run for one decision and resumes it in place
  (`OriginatingAgentRunID` → `ResumingAgentRunID`); **`bizapps-tasks`** owns durable, assignable,
  due-dated work. A flow agent should create Tasks and *finish* rather than hold a run open for
  three weeks.
- **Not a new workflow table anywhere.** An earlier iteration of this design proposed a
  `WorkflowEventType` / `WorkflowBinding` / `WorkflowRun` trio in `bizapps-common`. Reading the
  EntityAction implementation killed it: it would have been a parallel universe next to a working
  core feature.

---

## 8. Worked example — the requirement that produced this

*"When a Deal reaches Closed Won, run a workflow. Configurable per Deal Type, which may be global or
company-specific."*

Entirely metadata, once the changes above land:

```jsonc
// metadata/entity-actions/.sales-close-won.json  (in bizapps-sales)
[{
  "fields": {
    "EntityID":      "@lookup:MJ: Entities.Name=MJ_BizApps_Sales: Deals",
    "ActionID":      "@lookup:MJ: Actions.Name=Execute Agent",
    "ScopeEntityID": "@lookup:MJ: Entities.Name=MJ_BizApps_Sales: Deal Types",
    "ScopeRecordID": "<the New Business deal-type UUID>",   // omit both for all deal types
    "Sequence": 10,
    "Status": "Active"
  },
  "relatedEntities": {
    "MJ: Entity Action Invocations": [
      { "fields": { "EntityActionID": "@parent:ID",
                    "InvocationTypeID": "@lookup:MJ: Entity Action Invocation Types.Name=AfterUpdate",
                    "Status": "Active" } }
    ],
    "MJ: Entity Action Filters": [
      { "fields": { "EntityActionID": "@parent:ID",
                    "ActionFilterID": "@lookup:MJ: Action Filters.UserDescription=The named field changed to the given value",
                    "Sequence": 10, "Status": "Active" } }
    ],
    "MJ: Entity Action Params": [
      { "fields": { "EntityActionID": "@parent:ID",
                    "ActionParamID": "@lookup:MJ: Action Params.Name=AgentName",
                    "ValueType": "Static", "Value": "Deal Closed Won Workflow" } },
      { "fields": { "EntityActionID": "@parent:ID",
                    "ActionParamID": "@lookup:MJ: Action Params.Name=Data",
                    "ValueType": "Entity Object Data" } }     // ← NOT 'Entity Object' (§4.3)
    ]
  }
}]
```

No schema in the app. No code in the app. A flow agent does the orchestration, and an administrator
can retarget it, scope it, reorder it or disable it from the Deal Type record.

---

## 9. Open questions

1. **Should `Before*` be able to veto?** They are awaited and their results discarded, so `Validate`
   is the only gate. Honouring `Before*` failures would be more expressive but changes existing
   behaviour for anyone relying on it — needs a deprecation story, or a per-binding
   `BlocksOnFailure` flag. *Recommendation: leave as-is; document `Validate` as the gate.*
2. **Should `Sync` + agent be refused or warned?** A loop agent inside a transaction is a real
   hazard. *Recommendation: warn on save of the binding, refuse at invocation.*
3. **Default scope resolution.** Is walking the subject's foreign keys to find one pointing at the
   scope entity acceptable as the default, or should a resolver always be explicit? *Recommendation:
   FK walk as default* — it covers the common case with zero configuration, and ambiguity (two FKs
   to the same entity) is a refusal, not a guess.
4. **Does `Sequence` need to be unique per (EntityID, InvocationType)?** *Recommendation: no* —
   ties break by creation order; forced uniqueness makes inserting a step painful.
5. **Should `ActionParam.LogValue` default to `0` rather than `1`?** `1` preserves today's behaviour
   for every existing action, and rule 1 (§5.3) closes the actual hole regardless. *Recommendation:
   keep `1`* — but set `0` explicitly on `Execute Agent`'s `Data` param in the same pass, since that
   is the one everything routes through.
6. **Should suppressed values be hashed rather than omitted?** A stable hash would let you prove two
   runs received the same payload without storing it. *Recommendation: not in v1* — it is a real
   capability but it is also a fingerprint of the record, and that deserves its own decision rather
   than riding along.
