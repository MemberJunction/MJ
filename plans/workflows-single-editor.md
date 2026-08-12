# Retiring the Workflows app; making the Flow agent form first-class

**Status:** implemented on `feat/workflows-single-editor` (shared omnibus branch — Track C.1 lands here too).
**Supersedes** this document's first revision, which proposed *fixing* the Workflows app by
embedding the Flow agent editor in it. That was the wrong altitude: the app itself was the
duplication.

---

## 1. The decision

**The Workflows app is retired.** Not repaired — removed.

The argument that settled it: the app owned nothing. A workflow's WHAT is a Flow agent, its WHEN is
a Scheduled Job or an Entity Action binding, and there is no `Workflow` table (see the header of
`packages/TaskGraph/src/WorkflowSpecSync.ts`). So the app was a *view* — a second list of rows the AI
app already lists, fronted by a create/edit canvas that duplicated the Flow agent editor and, having
no Save path anywhere on the surface, could never turn a draft into anything at all. Meanwhile
"open a saved workflow" routed to `OpenEntityRecord('MJ: AI Agents', …)`, so the two halves of its
own loop used different editors and never met.

What replaces it is not a smaller version of the same thing. It is:

1. **The AI Agents form leads with the flow**, instead of burying it.
2. **Every agent record answers "what runs this when I'm not looking?"** — the question the Workflows
   app was implicitly about, which nothing in MJ could previously answer from the agent's side.
3. **The Agent Manager can author loops**, so the conversational path is no longer strictly weaker
   than the form.

The `Workflow.Draft` / `Workflow.Save` / `Workflow.Validate` Remote Operations are **kept**. They are
the agent- and MCP-facing contract for reconciling a graph and its triggers atomically, and they
matter more now that creation is conversational, not less. Only the Angular app is gone.

---

## 2. What shipped

### 2.1 The AI Agents form is tabbed

`packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/`

The flow editor used to live in a dynamically-loaded custom form section that only instantiated when
its accordion panel was expanded — so for a Flow agent, the single most important view of the record
was lazily constructed behind a click, eleventh in a list of collapsed panels.

Now: `<mj-tab-nav>` with up to three panes.

| Tab | Shown for | Contents |
|---|---|---|
| **Flow** (or the agent type's own name) | any agent type declaring a `UIFormSectionKey` | the type's designer, at full height |
| **Details** | always | today's accordion set, verbatim — nothing removed |
| **Invocations** | any saved agent | §2.2 |

Three decisions worth keeping:

- **Generalised past Flow.** The designer tab appears for *any* agent type with a
  `UIFormSectionKey`, labelled with the type's name. Flow is the only one today; the next one gets
  the treatment for free.
- **Panes are hidden with CSS, never `@if`-ed away.** The designer holds *unsaved* canvas edits;
  destroying it on a tab switch would discard them silently, and would also throw away the canvas's
  zoom and node positions on every trip to Details.
- **The default tab is the first one that exists**, not a hardcoded `'details'`. `ActiveFormTab`
  starts `null` meaning "nobody has chosen yet", so a Flow agent opens on its diagram while a Loop
  agent opens on Details — and a persisted choice still wins. A stored tab that no longer exists
  falls through rather than leaving every pane hidden.

### 2.2 Invocations — the inverse index

`packages/Angular/Generic/agents/src/lib/components/agent-invocations.*` (+ `.model.ts`, 32 tests)

MJ has never lacked ways to invoke an agent automatically. What it lacked was the *inverse* index:
every substrate knows which agent it calls, none can be asked from the other end. Standing on an
agent, there was no way to learn what fires it short of checking five admin surfaces by hand — so in
practice nobody checked, and an agent quietly running on a schedule set up months ago is exactly what
an owner needs to see first.

Six sources, batched into three round trips:

| Group | Source | Filter |
|---|---|---|
| Schedules | `MJ: Scheduled Jobs` | `Configuration LIKE '%<agentID>%'` |
| Routines | `MJ: User Routines` | `TargetType='Agent' AND TargetID=…` |
| Data changes | `MJ: Entity Action Params` → `MJ: Entity Actions` → `MJ: Entity Action Invocations` | `ActionParam='AgentID' AND Value=…` |
| Bulk operations | `MJ: Record Processes` | `WorkType='Agent' AND AgentID=…` |
| Called by other agents | `MJ: AI Agent Steps` + `MJ: AI Agent Relationships` + the agent's own `ParentID` | `SubAgentID=…` |
| Available as an action | the agent's `ExposeAsAction` flag | — |

Design notes:

- **Read-only by construction.** Editing a schedule belongs in Scheduling; a second editor here would
  be a second set of rules about what a valid trigger is. Rows emit `RecordOpenRequested`; the form
  translates that into navigation.
- **Three states, not a boolean.** `Live` / `Paused` / `Off`, because "switched off" and "paused" have
  different fixes. `Draft` and `Pending` map to `Off` — telling someone auditing an agent that a
  Draft *might* run is the wrong kind of wrong on this surface.
- **The cron humanizer refuses to guess.** It covers the shapes people write and prints the raw
  expression for anything else. A humanizer that guesses produces a confident sentence describing a
  schedule the job does not have.
- **A disabled job's stale `NextRunAt` is excluded** from the "next scheduled run" summary — it would
  promise a run that will never happen.
- **`Configuration LIKE` is the one place a value reaches SQL as a literal**, because that column is
  free-form JSON with nothing to equal. Every id used that way passes a UUID check first.

### 2.3 The Agent Manager can author loops

`AIAgentStep.StepType` has accepted `ForEach` and `While` for releases; the Architect's spec taught
three types. Loops were **executable but unauthorable** — anything built conversationally could not
repeat itself, which is precisely the capability that makes the flow vocabulary richer than the task
graph's. Four changes closed it:

- `AgentStep.StepType` now derives from `MJAIAgentStepEntity['StepType']` instead of restating it,
  plus new `LoopBodyType` and `Configuration` fields.
- `AgentSpecSync` writes both on save and reads both back — without the read side, loading a flow
  containing a loop and saving it would silently turn the loop into a step iterating over nothing.
- `flow-step-validation.ts` (new, pure, 20 tests) validates loop shape and is called by the Architect.
- The Architect prompt template gained a **Loop Steps** section with worked `ForEach` and `While`
  examples. ⚠️ **Template changes need `mj sync push` to take effect** — not run here.

The rule the validator exists for: a loop missing `collectionPath` (or `condition`, or `itemVariable`)
saves perfectly cleanly and then iterates zero times, which at runtime reads as the agent declining to
work rather than as a malformed step.

### 2.4 A wrong status union, fixed in five places

`AIAgent.Status` is `'Active' | 'Disabled' | 'Pending'`. `AgentSpec.Status` said
`'Active' | 'Inactive' | 'Pending'`; the Architect *validated* `'Inactive'` as legal;
`AgentSpecSync` passed it to the entity through an `as any`; the MCP `List_Agents` filter offered it
as an option that could never match a row; and the Architect **prompt template instructed the model
to emit it**. So an agent created conversationally with a non-Active status wrote a value the CHECK
constraint rejects. The type now derives from the entity, which is what stops it drifting again.

`WorkflowAgentWriter` mapped a Draft/Paused workflow to `'Inactive'` for the same reason; it now maps
to `'Disabled'`.

### 2.5 Removal

Deleted: `dashboards/src/Workflows/**`, `workflows-dashboards.module.ts`,
`metadata/applications/.workflows-application.json`, the `ng-task-graph-editor` dependency and the
`./workflows-dashboards.module` export subpath from the dashboards package, and the corresponding
lines in two CodeGen manifests (`mj-class-registrations.ts`, `lazy-feature-config.ts` — hand-synced
only because they are generated *from* the source tree, so the next `mj codegen` reproduces exactly
this).

`migrations/v6/V202608082330__v6.1.x__Retire_Workflows_Application.sql` removes the Application row
and its per-user copies from existing databases. Idempotent; a no-op on a clean install. **Not run
here** — see §4.

`<mj-task-graph-editor>` survives untouched. It keeps its two read-only consumers (the agent-run step
detail and the conversation plan card), which is the role its own file header claims. Only its
editing use is gone, and that was its weakest one.

---

## 3. Deliberately not done

**The conversation plan card is still unhosted.** `<mj-workflow-plan-card>` ships `Save` and
`Save and open in editor` and nothing renders it. Wiring it means threading a save intent up five
levels of component outputs (message-item → message-list → chat-area → workspace → overlay) to reach
something that can navigate, plus an Explorer handler calling `Workflow.Save`. Doing half of that
would recreate exactly the built-but-unwired state the card is already in, so it is left whole and
untouched. It remains the right vehicle for the conversational handoff.

**Triggers are still not authored from the agent form.** Per your steer, Invocations *shows*
everywhere an agent is invoked rather than editing any of it; Scheduling, User Routines and Entity
Actions remain the places you change those. Worth revisiting once the read surface has been used.

---

## 4. What has to happen before this is fully live

1. **`mj sync push`** — the Architect template change (loop authoring) has no effect until pushed.
2. **`mj migrate`** — until the retirement migration runs, an existing database still has the
   Workflows Application row, whose nav item now points at a `DriverClass` that no longer registers.
3. **A full build + live pass** — held at your request while you were testing; unit tests are green
   (§5) but `pnpm run build` and the Explorer walkthrough are outstanding.

---

## 5. Verification so far

| Package | Result |
|---|---|
| `@memberjunction/ng-agents` | 84 tests pass (10 files) — 32 new |
| `@memberjunction/ai-agent-manager` | 44 tests pass (2 files) — 20 new |
| `@memberjunction/ai-core-plus` | `tsc --noEmit` clean |
| `@memberjunction/ng-agents` | `ngc` build clean (before the hold) |
| `core-entity-forms` | `ngc` build clean (before the hold) |

`ai-agent-manager`'s typecheck currently reports stale-`dist` errors against `ai-core-plus` and needs
CorePlus rebuilt to complete — pending the build hold.
