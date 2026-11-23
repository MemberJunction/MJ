# MemberJunction Workflows App & Generic Task Graph Visualizer/Debugger — Forensic Codebase & UX Study

> **Prepared by:** `ux-auditor` · **Scope:** Read-only forensic audit of `Workflows` Explorer app, `@memberjunction/ng-task-graph-editor`, `@memberjunction/ng-flow-editor`, `@memberjunction/task-graph`, prior architectural plans/guides/mockups, and `@memberjunction/ng-shared` design tokens.
> **Purpose:** Single-source-of-truth design & engineering brief for the next-stage UX mockup architects and implementation engineers redesigning all 5 surfaces of MemberJunction's Workflows & Task Graph experience.

---

## Executive Diagnosis (The TL;DR)

MemberJunction has built an **extraordinarily capable, Temporal-grade durable DAG execution & live-debugging backend** (`@memberjunction/task-graph` + 10 Remote Operations + 14 real-time GraphQL frame types + saga compensation + AI Decision nodes + taint tracking + trigger reconciliation).

Yet the user-facing Workflows experience currently looks and feels **empty, flat, disjointed, and prototype-grade** for **five concrete, compounding architectural and visual reasons**:

1. **The Dead-Token Styling Collapse:** Across `workflows-dashboard.component.css`, `create-workflow.component.css`, `workflow-runs-resource.component.css`, and `task-graph-editor` CSS, dozens of CSS rules reference **non-existent `--mj-*` variables** (`--mj-color-primary`, `--mj-color-primary-subtle`, `--mj-color-success`, `--mj-bg-hover`, `--mj-text-tertiary`, `--mj-font-size-*`, `--mj-font-weight-*`, `--mj-line-height-relaxed`, `--mj-font-mono`, `--mj-space-sm/md/xs`, `--mj-status-error-subtle`, `--mj-brand-primary-subtle`). Meanwhile `flow-toolbar.component.ts` and `flow-status-bar.component.ts` hardcode blinding light-mode `#ffffff` / `#f8fafc` hex values. The result: unstyled flat lists, invisible hover/selection/focus rings, oversized 16px labels, and broken dark mode.
2. **The Split-Brain Editor & Ejection Anti-Pattern:** Clicking any workflow in the Workflows app (`WorkflowsDashboardComponent.OnOpenWorkflow`) **kicks the user completely out of the Workflows app** into the generic `MJ: AI Agents` entity form (`OpenEntityRecord('MJ: AI Agents', ...)`), breaking the D18 vocabulary contract ("Workflow", never "Flow Agent"). Worse, two separate incomplete editors exist:
   - `mj-flow-agent-editor` (inside AI Agents form) has Decision steps, Loops, Data Mapping, Error Handling, Diagram/List toggle, and real compiler checks — **but is missing `Human` (Person) steps completely** (even though the shipped `Schema Documentation Sweep` demo uses `StepType: 'Human'`) and has no Trigger editor or Run/Debug button in-app.
   - `mj-task-graph-editor` (L1 generic widget) only authors 3 step types (`Agent`, `Action`, `Human`), cannot author `Prompt`, `Decision`, `ForEach`, `While`, or `External`, and has an 86-line stub properties panel with zero data mapping, loop config, or error policy controls.
3. **Canvas Rendering & Geometry Bugs:** In `flow-node.component.ts`, `isLoopNode` checks `'ForEach' | 'While'` while `task-graph-canvas-adapter.ts` emits `'ForEachTask' | 'WhileTask'` — **so loop cards never render in `TaskGraphRunView` or `TaskGraphEditor`**. `TaskGraphEditorComponent` passes only the 3 authorable `NodeTypes` to `mj-flow-editor`, causing `PromptTask`/`ForEachTask`/`WhileTask`/`ExternalTask` to fall back to gray `#6B7280` with raw internal type strings. `TaskGraphRunViewComponent` lays out nodes Left-to-Right (`LR`), while `SpecToNodes` hardcodes Top/Bottom ports — creating ugly S-curve wires. `SpecToConnections` completely deletes edges to/from `Skipped` nodes, leaving skipped nodes floating orphaned with no visible reason why they were skipped. And `.mj-flow-node-body--skipped .mj-flow-node-title` targets a non-existent class (the HTML uses `.mj-flow-node-label`).
4. **Layout & UX Friction in the Runs Debugger:** `.wfr-graph-pane` is a non-flex block container holding `<mj-task-graph-debugger Height="100%">` above `.wfr-replay`, `.wfr-bp-bar`, and `.wfr-engine` — pushing those strips off the bottom of the 100% box. The status filter offers `'Running'` while `MJ: Tasks` rows actually use `'In Progress'`. `Step('one')` and `Step('wave')` are confusingly labeled "Over" and "Into" (wrong mental model for a DAG). `NodeProgress` messages/percentages are tracked in `LiveActivity` (`task-graph-run-view.component.ts:278`) but **never rendered on canvas nodes**. And the What-If blast radius (`ComputeTasksToBlock`) prints `"3 steps can no longer run"` as plain text instead of highlighting the threatened downstream subgraph on the canvas.
5. **Massive Hidden Backend Superpowers:** Triggers (`WorkflowSpecSync` schedules & entity events + `<mj-agent-invocations>` 6-source inverse index), Saga Compensations (`CompensatesTaskID`, `SagaExecutionState`, human escalation), AI Decision confidence/answers, Security Taint badges, Per-Task `Step(taskID)`, Remembered Breakpoints, and Past-Run promotion previews are already built on the backend — waiting for a world-class UX to unlock them.

---

## 1. Complete Surface & Capability Map (All 5 Areas)

### Application Metadata & Navigation Structure
- **App Definition:** `metadata/applications/.workflows-application.json` (ID `E29BDE35-88CA-4AC0-8810-1DE5F4DFF2FB`, Color `#2d6a9f`, Icon `fa-solid fa-diagram-project`, `DefaultForNewUser: true`, `DefaultSequence: 1004`).
- **Current Nav Items (only 2):**
  1. **Workflows** (`DriverClass: "WorkflowsResource"`, `isDefault: true`) → thin shim mounting `<mj-workflows-dashboard>`
  2. **Runs** (`DriverClass: "WorkflowRunsResource"`) → `<mj-workflow-runs>`
- **NgModule & Lazy Loading:** `packages/Angular/Explorer/dashboards/src/workflows-dashboards.module.ts` (`WorkflowsDashboardsModule`), lazy-loaded via `packages/Angular/Explorer/explorer-core/src/generated/lazy-feature-config.ts` (`L135, L327-329`).
- **Demo Workflows Shipped:** `metadata/agents/.workflow-demo-agents.json`:
  - **Schema Documentation Sweep** (`E359CA7B-...`, `fa-solid fa-book-open-reader`): Action (`Get Records`) → `ForEach` (`Prompt`) → `Human` approval pause.
  - **Content Pipeline** (`C36FA358-...`, `fa-solid fa-pen-nib`): Action (`Web Search` broad) → Action (`Web Search` focused) → `Prompt` (Draft) → `While` (`Prompt`, `maxIterations: 3`, `payload.brandOK !== true`) → Exclusive conditional fork (`Close out: approved` vs `Close out: gave up`).

---

### Area 1: Workflows Catalog / Home (`WorkflowsDashboardComponent`)
- **Files:**
  - `packages/Angular/Explorer/dashboards/src/Workflows/workflows-dashboard.component.{ts,html,css}`
  - `packages/Angular/Explorer/dashboards/src/Workflows/components/workflows-resource.component.ts`
  - `packages/Angular/Explorer/dashboards/src/Workflows/workflows.types.ts`
- **Data Source:** `RunView` on `MJ: AI Agents` filtered by `TypeID IN (SELECT ID FROM __mj.vwAIAgentTypes WHERE Name='Flow')`, ordered by `__mj_UpdatedAt DESC`.
- **Current Capabilities:**
  - Lists saved Flow agents in a bare single-column `<div class="wf-list">` of `<button class="wf-row">`.
  - Shows Name, truncated 1-line Description, hardcoded `'On demand'` trigger label, and plain text `Status`.
  - Header actions: Refresh + `Create Workflow` button (toggles inline `IsCreating` state).
  - Clicking a row calls `navigationService.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(item.ID))`.
  - Registers 2 Agent Client Tools: `OpenCreateWorkflow`, `OpenWorkflow(name)`.

---

### Area 2: Create Workflow Front Door & AI Co-Drafting (`CreateWorkflowComponent`)
- **Files:**
  - `packages/Angular/Explorer/dashboards/src/Workflows/components/create-workflow.component.{ts,html,css}`
  - Backend: `packages/TaskGraph/src/operations/WorkflowDraftOperation.ts` (`Workflow.Draft`), `packages/TaskGraph/src/operations/WorkflowOperations.ts` (`Workflow.Save`, `Workflow.Validate`)
- **Current Capabilities:**
  - Three radio-tile start doors (`WORKFLOW_START_OPTIONS`):
    1. **Blank canvas** (`blank`) — asks only for Name.
    2. **Describe it** (`describe`, default) — textarea prompt + Name → executes `WorkflowDraftOperation` (`Workflow.Draft` using `'Workflow Drafting'` AI prompt with up to 40 top-level Active agents; validates via `ValidateTaskGraphSpec`).
    3. **From a past run** (`past-run`) — lazy-loads up to 25 terminal root `MJ: Tasks` rows (`ParentID IS NULL AND Status IN ('Complete','Failed','Cancelled')`), allows selecting only `Status === 'Complete'` (`IsSettled`) rows.
  - On submit (`OnCreated` in `WorkflowsDashboardComponent:141-193`), **immediately persists** via `WorkflowSaveOperation` (`status: 'Draft'`, `triggers: []`) and immediately navigates away to `OpenEntityRecord('MJ: AI Agents', agentID)`.

---

### Area 3: In-App Workflow Studio / Design-Time Canvas & Inspector
Currently split across **two separate packages and two separate components**, neither hosted inside the Workflows app:

| Capability | `mj-flow-agent-editor` (`ng-flow-editor`) | `mj-task-graph-editor` (`ng-task-graph-editor`) |
|---|---|---|
| **Where hosted today** | `MJ: AI Agents` form → `Flow` tab (`flow-agent-form-section.component.html`) | Read-only inside `mj-task-graph-run-view` and `ai-agent-run-step-detail`; zero active authoring hosts |
| **Underlying Model** | `MJAIAgentStepEntity` + `MJAIAgentStepPathEntity` | `TaskGraphSpec` (v2 discriminated `kind` + `configuration`) |
| **Authorable Step Types** | `Action`, `Prompt`, `Decision`, `Sub-Agent`, `ForEach`, `While` (**Missing `Human`!**) | `Agent`, `Action`, `Human` (**Missing `Prompt`, `Decision`, `ForEach`, `While`, `External`!**) |
| **Display-Only Step Types** | None (unregistered types render gray) | `Prompt`, `ForEach`, `While`, `External` (buggy: `NodeTypes` not passed through!) |
| **Properties Inspector** | `mj-agent-properties-panel` (795-line HTML: General, Action/Prompt/Sub-Agent pickers, Loop Body + JSON config, full Decision Questions editor w/ Likelihood/Choice/Score, Data Mapping JSON, Error Handling/Retries/Timeout, Path Condition JS editor + Route-on-Answer helper + Priority) | `mj-task-graph-properties` (86-line HTML: Name, Description, Agent/Action/Person toggle, bare `<select>`, plain text incoming edge condition inputs) |
| **Validation** | `CheckFlowRun()` (`CompileFlowToTaskGraph` + `ValidateTaskGraphSpec` — highlights per-node & per-path problems!) | `ValidateTaskGraphSpec()` banner at top only (not projected onto individual nodes/edges) |
| **View Modes** | Diagram + List toggle (`mj-agent-step-list`) + Fullscreen modal overlay | Diagram only |
| **Persistence** | `ShowSaveControls` (self-contained TransactionGroup save OR `QueueSaveInto(tg)`) | Emits `SpecChanged` only |
| **Triggers / Invocations** | Separate `Invocations` tab on `ai-agent-form` (`<mj-agent-invocations>`, read-only 6-source inverse index) | None |
| **Underlying Canvas** | `@foblex/flow` wrapped by `<mj-flow-editor>` (`FlowEditorComponent`, `FlowNodeComponent`, `FlowPaletteComponent`, `FlowToolbarComponent`, `FlowStatusBarComponent`, `FlowLayoutService` w/ Dagre, `FlowStateService` 50-step Undo/Redo) | Same `<mj-flow-editor>` |

---

### Area 4: Workflow Runs & Operational Triage Hub (`WorkflowRunsResourceComponent`)
- **Files:**
  - `packages/Angular/Explorer/dashboards/src/Workflows/components/workflow-runs-resource.component.{ts,html,css}`
  - `workflow-run-debug-state.ts`, `workflow-run-layout.ts`, `workflow-run-sorting.ts`
- **Data Source:** `RunView` on `MJ: Tasks` (`ParentID IS NULL`, `OrderBy: '__mj_CreatedAt DESC'`, `MaxRows: 200`). On run select, loads child `MJ: Tasks` (`ParentID='...'`, `BypassCache: true`), `MJ: Task Dependencies`, and parent `InputPayload` (`$.debug` + `$.invocation`).
- **Current Capabilities:**
  - Resizable outer `<as-split>` (`[40, 60]`, persisted in `UserInfoEngine` via `mj.workflowRuns.*`).
  - Sortable 5-column table: `Workflow`, `Started`, `Ended`, `Duration`, `Status` (unset timestamps sort last in both directions).
  - Toolbar search (`<mj-page-search>`) + inline status filter buttons (`All`, `Running`, `Complete`, `Failed`, `Cancelled`).
  - Detail panel tabs: **Workflow** (inner `<as-split>` `[60, 40]` with `<mj-task-graph-debugger>` + step/edge inspector) and **JSON** (read-only `<mj-code-editor>` showing recursively parsed Run + Steps JSON).
  - Live frame listener (`OnFrame`) for:
    - **Stall Banner** (`worker-lost`, `held` with `Answer true / Answer false / Leave held` buttons, `step-refused`).
    - **Replay Scrubber** (`<input type="range" min="0" max="100">` for settled runs).
    - **Breakpoint Bar** (paused-at chip + removable armed breakpoint chips).
    - **Engine Tick Strip** (last 10 `PassCompleted` heartbeats: `#pass · ready N · held N · took N`).
  - Step Inspector:
    - Failure reason card, breakpoint toggle dot, live `NodeProgress` card, `ClaimChanged` worker card, `GateDecision` verdict cards, `ComputeTasksToBlock` what-if blast-radius count.
    - Interventions: `Skip step`, `Edit input` / `Edit input & retry`, `Retry`, `Force complete` (with typed step-name confirmation + JSON output editor).
    - Edge Inspector: Condition code block + `Answer true / Answer false / Clear override`.
    - `<mj-task-graph-variables>` (Input / Output / Invocation tree).
  - Read-only Agent Client Tools: `FilterWorkflowRunsByStatus`, `SearchWorkflowRuns`, `SelectWorkflowRun`, `RefreshWorkflowRuns`.

---

### Area 5: Generic Task Graph Visualizer & Live Debugger (`@memberjunction/ng-task-graph-editor`)
- **Layering Contract (`guides/UI_LAYERING_GUIDE.md`):**
  - **L1 (paint-only, zero Remote Operations, zero Router/NavigationService):** `TaskGraphEditorComponent`, `TaskGraphRunViewComponent`, `TaskGraphDebugToolbarComponent`, `TaskGraphVariablesComponent`, `TaskGraphPropertiesPanelComponent`.
  - **L2 (drop-in session wrapper):** `TaskGraphDebuggerComponent` (`<mj-task-graph-debugger>`) — takes `[ParentTaskID]`, owns `GraphQLDataProvider.TaskGraphFrames` subscription, reads `$.debug` from parent row, exposes all 10 `TaskGraph.*` verbs via `ProviderToUse.RouteOperation`.
- **Every Current Embedding Site Across MJ:**
  1. **Workflows → Runs Console** (`packages/Angular/Explorer/dashboards/src/Workflows/components/workflow-runs-resource.component.html:185`): `<mj-task-graph-debugger [ShowVariables]="false">` (variables duplicated in L3 inspector instead).
  2. **AI Test Harness** (`packages/Angular/Generic/ai-test-harness/src/lib/ai-test-harness.component.html:152`): `<mj-task-graph-debugger>` (chrome on during Debug mode, supports `RememberedStepIDs`).
  3. **AI Agent Run Step Detail** (`packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-step-detail.component.html:118-135`): `<mj-task-graph-run-view>` (for durable runs) and `<mj-task-graph-editor [ReadOnly]="true">` (for spec preview).
  4. **Conversations Chat Area Right Panel** (`packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.html:647`): `<mj-task-graph-run-view>`.
  5. **Conversation Plan Card (built, currently unhosted):** `packages/Angular/Generic/conversations/src/lib/components/message/workflow-plan-card.component.ts` (`<mj-workflow-plan-card>` with `SaveAsWorkflowRequested`).

---

## 2. Brutally Honest UX & Visual Diagnosis (With Exact `file:line` Citations)

### Cross-Cutting Critical Defect: The Dead-Token Epidemic
Multiple stylesheets in the Workflows app and Task Graph packages were authored with **hallucinated token names that do not exist in `packages/Angular/Generic/shared/src/lib/_tokens.scss`**. CSS silently drops invalid `var()` references, collapsing visual hierarchy across the entire app:

| File & Line(s) | Broken Token Used | Visual Impact Today | Real `_tokens.scss` Token |
|---|---|---|---|
| `workflows-dashboard.component.css:33` | `--mj-bg-hover` | Zero hover feedback on workflow rows | `--mj-bg-surface-hover` |
| `workflows-dashboard.component.css:37`, `create-workflow.component.css:45,50,56,114,142,197,219` | `--mj-color-primary` | Selected start-door tile has NO blue border/icon; focus outlines invisible | `--mj-brand-primary` |
| `create-workflow.component.css:51,147,199` | `--mj-color-primary-subtle` | Selected tile glow, selected past-run tint, and AI drafting banner fill are **transparent** | `color-mix(in srgb, var(--mj-brand-primary) 10%, transparent)` or `--mj-brand-accent-subtle` |
| `workflows-dashboard.component.css:76` | `--mj-color-success` | Active workflow status is NOT green | `--mj-status-success` |
| `workflows-dashboard.component.css:56,64`, `create-workflow.component.css:79,98,164,178`, `task-graph-run-view.component.css:28` | `--mj-text-tertiary` | Subtitles/metadata inherit primary text color instead of muted hierarchy | `--mj-text-muted` |
| `workflows-dashboard.component.css:55,63,69`, `create-workflow.component.css:55,63,70,78,90,133,165,169,177,205,212,220`, `workflow-runs-resource.component.css:110,117,217,237,267,318,343,363,381,397,421,448,453,456,471,492,551,554`, `task-graph-run-view.component.css:20,64,131,146,188,216,238,246`, `task-graph-debug-toolbar.component.css:18`, `task-graph-variables.component.css:18` | `--mj-font-size-xs/sm/md/lg/xl` | Typography scale completely collapses to inherited 16px everywhere! | `--mj-text-xs`, `--mj-text-sm`, `--mj-text-base`, `--mj-text-lg`, `--mj-text-xl` |
| `workflows-dashboard.component.css:48,70`, `create-workflow.component.css:64,91,97,158,170` | `--mj-font-weight-semibold/normal` | Row titles & labels aren't bold | `--mj-font-semibold`, `--mj-font-normal` |
| `create-workflow.component.css:72,179,214` | `--mj-line-height-relaxed` | Cramped body line-height | `--mj-leading-relaxed` |
| `workflow-runs-resource.component.css:396,420,452,550`, `task-graph-variables.component.css:17`, `task-graph-run-view.component.css:258` | `--mj-font-mono` | Falls back to generic `ui-monospace` instead of JetBrains Mono | `--mj-font-family-mono` |
| `task-graph-editor.component.css:22,26`, `task-graph-properties-panel.component.css:5,6,13,16,21,27,28,33` | `--mj-space-2xs/xs/sm/md` | Non-existent named spacing tokens (survives only via fallback) | `--mj-space-0-5`, `--mj-space-1`, `--mj-space-2`, `--mj-space-4` |
| `flow-node.component.css:157,483`, `flow-editor.component.css:447` | `--mj-status-error-subtle`, `--mj-brand-primary-subtle` | Error node bg and hovered port bg drop to transparent | `--mj-status-error-bg`, `color-mix(in srgb, var(--mj-brand-primary) 12%, transparent)` |
| `flow-toolbar.component.ts:97-153`, `flow-status-bar.component.ts:37-40`, `flow-editor.component.html:69,94,111,124,185-235` | Hardcoded `#ffffff`, `#f8fafc`, `#e2e8f0`, `#f0fdf4`, `#fef2f2`, `#94a3b8` | Blinding white floating toolbar, white status bar, light pastel legend boxes in Dark Mode | Semantic `--mj-bg-surface-elevated`, `--mj-border-default`, `--mj-text-secondary`, `--mj-status-*` |

---

### Area 1 Diagnosis: Workflows Catalog (`WorkflowsDashboardComponent`)
Why it looks empty, flat, and amateur today:
1. **Stretched plain `<button class="wf-row">` strip (`workflows-dashboard.component.html:50-65`):** No visual card/table hierarchy, no workflow icon (even though `MJAIAgentEntity.IconClass` is populated on demos like `fa-book-open-reader` and `fa-pen-nib`!), no status pill (just plain text), no updated timestamp displayed (`UpdatedAt` is fetched on line 104 and **never rendered in HTML!**).
2. **Zero Wayfinding or Filtering:** No `<mj-page-search>`, no `<mj-filter-popover>` (status/trigger/category), no sort control, no grid/list `<mj-view-toggle>`. Violates `plans/explorer-chrome-conventions.md` §2 (`<mj-stat-badge [Label]="Workflows.length + ' saved'">` on line 9 is literally Anti-pattern #1: bare `.length` count with no filter!).
3. **Hardcoded Lie on Triggers (`workflows-dashboard.component.ts:103`):** `TriggerSummary: 'On demand'` is hardcoded for every workflow even if a Scheduled Job or Entity Action triggers it.
4. **Zero Operational Telemetry or Graph Shape Preview:** A user scanning their catalog cannot see:
   - How many steps a workflow has, or whether it contains Human approvals, Loops, or AI Decisions.
   - A mini topological preview / step-type strip.
   - Last run status, last run time, 7-day success/failure sparkline, or currently running count.
   - Quick actions (`Run now`, `Debug`, `Edit`, `View runs`, `Toggle Active/Disabled`).
5. **Ejection Out of the App (`workflows-dashboard.component.ts:202-204`):** Clicking any workflow calls `OpenEntityRecord('MJ: AI Agents', ...)` — jarring context switch that drops the user onto an "AI Agent" form, directly violating the D18 vocabulary rule.

---

### Area 2 Diagnosis: Create Workflow Front Door (`CreateWorkflowComponent`)
1. **Broken Promise — "Nothing is saved until you approve it" (`workflows.types.ts:50`, `create-workflow.component.html:39,98` vs `workflows-dashboard.component.ts:154-185`):** The UI explicitly promises *"Nothing is saved until you approve it. You will review every step before anything runs."* — **and then immediately calls `WorkflowSaveOperation` on clicking Create**, persists a database row before the user has ever seen the drafted steps, and kicks them to the AI Agents form!
2. **Zero Draft Preview or Iterative AI Co-Drafting:** When `Workflow.Draft` returns a `TaskGraphSpec` (`create-workflow.component.ts:150`), the user never sees a live visual preview of the drafted graph, cannot tweak the prompt ("add a human approval before sending email"), and cannot inspect the AI's `reasoning` field before committing.
3. **Hardcoded `StepCount: 0` & Flat Past-Run Picker (`create-workflow.component.ts:237`, `create-workflow.component.html:62-80`):** `PromotableRun.StepCount` is hardcoded to `0` and never even rendered. `WaitingNote` is declared in `workflows.types.ts:84` and never populated or rendered. There is no preview of a past run's steps when clicking it, and **even worse**: selecting a past run passes `SourceRunID` in `WorkflowDraftRequest`, **which `WorkflowsDashboardComponent.OnCreated` (`L141-193`) COMPLETELY IGNORES**, saving an empty `tasks: []` graph! (Major functional bug!)
4. **No Starter Templates / Recipe Gallery:** Business users staring at a blank textarea don't know what MJ can automate. Providing 1-click clickable prompt starters (e.g., *Scheduled Digest*, *Record Approval Gate*, *AI Triage & Route*, *Batch Enrichment Loop*) transforms cold-start friction into instant delight.
5. **Visual Flatness:** Uncentered left-aligned `max-width: 980px` form with unstyled native `<input>` / `<textarea>`, broken primary color tokens (so the selected radio tile looks identical to unselected ones!), and no visual separation between the door picker and the active door's workspace.

---

### Area 3 Diagnosis: Design-Time Canvas, Nodes & Inspector (`mj-flow-editor` + `mj-task-graph-editor` + `mj-flow-agent-editor`)
Why the canvas feels dated/clunky compared to **n8n 2.0, Retool Workflows, Relay.app, Figma, and Linear**:

1. **Split-Brain Editors:** Neither `mj-flow-agent-editor` nor `mj-task-graph-editor` covers the full 7-kind step vocabulary (`Action`, `Agent`, `Prompt`, `Decision`, `Person/Human`, `ForEach`, `While`, `External`). Users shouldn't have to leave the Workflows app to edit a workflow, nor should `Human` steps be un-authorable in the Flow editor!
2. **Broken Loop & Display-Only Rendering Bugs:**
   - `flow-node.component.ts:95`: `isLoopNode` checks `'ForEach' | 'While'`, missing `'ForEachTask' | 'WhileTask'` emitted by `task-graph-canvas-adapter.ts:50`. Result: Loop container cards never render in `TaskGraphEditor` or `TaskGraphRunView`!
   - `task-graph-editor.component.ts:257`: passes `TASK_GRAPH_NODE_TYPES` (only 3 types) to `mj-flow-editor`, so `GetTypeConfig` returns `null` for `PromptTask`, `ForEachTask`, `WhileTask`, `ExternalTask` — rendering them gray with raw internal enum text!
   - `flow-node.component.css:589`: `.mj-flow-node-body--skipped .mj-flow-node-title` never matches `.mj-flow-node-label` (`flow-node.component.html:39`), so skipped nodes lose their strike-through!
3. **Port/Layout Orientation Mismatch:**
   - `task-graph-canvas-adapter.ts:95-98` and `agent-flow-transformer.service.ts:23-24` hardcode `top` (input) and `bottom` (output) ports.
   - `task-graph-run-view.component.ts:700` calls `LayoutGraphNodes(..., { Direction: 'LR' })` (horizontal)! Connecting bottom-of-A to top-of-B in a Left-to-Right layout produces awkward vertical S-loops across nodes. Ports MUST adapt to layout direction (`left`/`right` for LR, `top`/`bottom` for TB).
4. **Single-Port Limitation (`flow-node.component.ts:69-89`):**
   - Only renders `.find(p => Direction === 'input')` and `.find(p => Direction === 'output')`. Multi-output branching (e.g., AI Decision option ports, True/False branch ports, Error/Compensation ports) cannot be visually separated on the node body.
5. **Dated Node Anatomy (`flow-node.component.html/.css`):**
   - Thin 3px top strip + generic rectangle (`200-280px`), no icon badge squircle, no quick-add `+` affordance on output ports (standard in n8n 2.0 / Relay.app / Retool), no inline hover toolbar (duplicate, breakpoint, delete, run-to-here), no duration/cost/iteration micro-telemetry pill on the node footer, and `LiveActivity` (`NodeProgress`) is never displayed on running nodes.
6. **Clunky Canvas Ergonomics (`flow-editor.component.ts`):**
   - Panning requires clicking a toolbar mode toggle (`panMode`, `L140`) instead of direct drag-on-canvas or Space+drag, and scroll-wheel behavior isn't tuned like Figma/n8n.
   - `FlowToolbarComponent` (`L92-154`) and `FlowStatusBarComponent` (`L32-43`) are hardcoded light-mode hex; StatusBar uses banned developer words (`nodes`, `connections` instead of `steps`, `paths`).
   - `FlowEditorComponent` legend (`flow-editor.component.html:179-239`) is 100% hardcoded to legacy Flow Agent colors/labels with light-only inline hex styles (`#f0fdf4`, `#fef2f2`) — never adapts to `NodeTypes`, never shows runtime/debug states, and breaks dark mode.
   - `FlowLayoutService` (`flow-layout.service.ts:27`) uses CommonJS `require('@dagrejs/dagre')` instead of static ESM import.
7. **Raw-JSON Authoring Friction in Properties Panel:**
   - `agent-properties-panel.component.html:208,480,492`: Loop configuration and Action Input/Output mappings force business users to hand-write raw JSON inside `<mj-code-editor>` instead of structured fields + upstream variable pill pickers (`{{ payload.fields }}`) and Action parameter schemas!
   - `agent-properties-panel.component.html:152,171,190` and `task-graph-properties-panel.component.html:38,52`: Plain unsearchable HTML `<select>` dropdowns for potentially hundreds of Actions, Prompts, and Agents!
   - `agent-properties-panel.component.html:647`: Stale hint claims Path `Description` is *"Displayed as a label on the connection line"*, contradicting `agent-flow-transformer.service.ts:432`.
   - Zero Trigger authoring UI in either editor (`WorkflowSpec.triggers` is completely invisible during authoring).

---

### Area 4 Diagnosis: Workflow Runs & Triage Hub (`WorkflowRunsResourceComponent`)
1. **CSS Flex/Overflow Clipping Bug (`workflow-runs-resource.component.html:184-252` & `.css:278-281`):**
   - `.wfr-graph-pane` has `height: 100%` and NO `display: flex; flex-direction: column`. Its first child `<mj-task-graph-debugger Height="100%">` consumes 100% of `.wfr-graph-pane`, pushing `.wfr-replay`, `.wfr-bp-bar`, and `.wfr-engine` **below the visible viewport** or causing double-scroll clipping!
2. **Broken `'Running'` Filter Pill (`workflow-runs-resource.component.ts:45-47, 212, 983`):**
   - `STATUS_FILTERS` uses `'Running'`, and `VisibleRuns` checks `r.Status !== this.StatusFilter` — **exact string equality**. Yet `MJ: Tasks` uses `'In Progress'` (as the component itself admits on `L190` and `L389`!). Clicking "Running" misses active `'In Progress'` runs, and `RunningCount` in `publishAgentContext` (`L983`) undercounts them. Also missing `'Pending'` / `'Paused'` / `'Awaiting Human'` filter states!
3. **Inline Filter Buttons Violate Concise Chrome (`workflow-runs-resource.component.html:26-37`):**
   - Uses bespoke inline `.wfr-status-filters` buttons in `[toolbar]` instead of `<mj-filter-popover>` / `<mj-filter-panel>` (per `plans/explorer-chrome-conventions.md` §3), or if status tabs are kept, lacks counts and trigger/workflow filters.
4. **Triple-Split Cramping & Redundant Step Lists:**
   - Outer split (`[40, 60]`) + Inner split (`[60, 40]`) = **3 columns fighting over 1440px** (40% list, 36% canvas, 24% step inspector!). On a 1280px laptop, the canvas gets ~460px wide while a giant run list sits to its left.
   - Meanwhile, `<mj-task-graph-debugger>` has `[ShowVariables]="false"` (`L193`) so Runs disables the debugger's left Variables rail and re-mounts `<mj-task-graph-variables>` inside the right-hand `.wfr-steps-pane` — splitting the experience between Runs and Test Harness!
5. **Unpolished Inspector & Orphaned Controls (`workflow-runs-resource.component.html:261-447`):**
   - `.wfr-step-list` renders a horizontal wrap-pile of pill buttons capped at `max-height: 8rem` above the step inspector — awkward when a workflow has 10+ steps, and redundant with the visual graph right beside it.
   - Line 318: The breakpoint button `.wfr-bp` is a bare, unlabeled 22×22 circle floating on its own line between the step header and the cards!
   - `.wfr-step-json` has zero horizontal padding, so `.wfr-insp-card`, `.wfr-editor-card`, and `.wfr-insp-actions` slam flush against the splitter border.
   - `SelectWorkflowRun` agent tool (`L1041`) sets `this.SelectedRunID = match.ID` directly without calling `loadSteps()` or `loadDebugState()`, leaving the right panel empty/stale when invoked by an AI agent!
6. **Under-Powered Replay Scrubber (`workflow-runs-resource.component.html:203-216`):**
   - Just a bare `<input type="range" min="0" max="100">` with a clock icon and a `Now` button — no Play/Pause playback animation, no current scrubbed timestamp readout, no step-transition tick marks on the track, no Gantt/waterfall correlation!
7. **Missing Operational Actions:** No `Re-run workflow`, no `Debug from start`, no `Open workflow definition`, no bulk/summary KPI strip (active runs, waiting on human, failed in last 24h, avg duration).

---

### Area 5 Diagnosis: Generic Drop-In Task Graph Visualizer & Debugger (`ng-task-graph-editor`)
1. **Confusing Debugger Terminology (`task-graph-debug-toolbar.component.html:17-30`):**
   - `Step('one')` is labeled **"Over"** (with an upside-down `fa-share` icon) and `Step('wave')` is labeled **"Into"** (with `fa-turn-down`). In a workflow DAG, "Step Over" / "Step Into" misleads users into expecting sub-agent call-stack stepping! Clearer, unmistakable DAG semantics: **Continue (`F5`)**, **Step Next (`F10`)**, **Step Wave (`F11`)**, **Run Selected Step** (using backend's `Step(taskID)`!), **Pause**, **Stop (`Shift+F5`)**.
2. **Skipped Edges Erased From History (`task-graph-canvas-adapter.ts:449`):**
   - `if (eitherSkipped && !override) continue;` deletes edges connected to skipped nodes! In run/debug mode, users desperately want to see *which condition evaluated false* and caused that branch to skip. Instead of deleting the edge, render untaken edges **muted/ghosted dashed with an `✕` / muted condition chip** (with an optional toggle "Dim untaken branches" / "Hide untaken").
3. **Zero Node-Level Breakpoint Gutter & Zero Live Progress on Canvas:**
   - Clicking a breakpoint requires right-clicking the node or hunting for a tiny dot in the summary bar (`run-view-bp`). World-class debuggers let you hover a node's left margin (or click a subtle gutter dot) to toggle breakpoints directly on the node, with a glowing red ring when armed and a prominent yellow/brand execution pointer when paused there.
   - `TaskGraphRunViewComponent.LiveActivity` (`L278`) captures `NodeProgress` frames (`Message`, `Percent`), **yet never passes them into `SpecToNodes`**, so running nodes show a generic `"Running"` banner instead of live progress bars and `"Searching web (2/5)..."` status!
4. **Data Pane (`TaskGraphVariablesComponent`) Is Bare-Bones:**
   - No search/filter across variables, no copy-JSON button per key/scope, no raw JSON vs Tree toggle, no diff/highlight of what changed from Input → Output, no inline edit shortcut when paused on a Pending step.
5. **Embed Ergonomics Across Hosts:**
   - `TaskGraphRunViewComponent` (`L100`) hardcodes `[ShowMinimap]="false"` and `[ShowStatusBar]="false"` and defaults `ToolbarVisibility="minimized"` (a tiny wrench icon) — fine for compact chat cards, but in full-page Runs/Harness debugging, users benefit from adaptive density (`Compact` vs `Full` mode) with a crisp bottom-left floating HUD (Zoom %, Fit, Layout direction LR/TB, Minimap toggle, Untaken-branches toggle, Legend popover).

---

### Benchmark Comparison: MJ Today vs World-Class Standards

| Dimension | World-Class Reference | MemberJunction Today | Target UX Standard |
|---|---|---|---|
| **Catalog & Home** | **Linear / Retool Workflows** — clean density, search + facet filters, workflow health/sparklines, 1-click Run/Edit, zero context ejection | Flat unstyled button list, hardcoded `'On demand'`, kicks user to `AI Agents` form | In-app Workflow cards/table with real Trigger pills, step-shape mini-strip, last-run telemetry, 1-click Run / Debug / Edit in Studio |
| **Creation & AI Co-Drafting** | **Relay.app / Zapier AI / n8n AI** — describe in natural language → live interactive graph preview → refine conversationally → approve & save | Saves immediately behind user's back, zero preview, `past-run` ignores `SourceRunID` | Live split-pane preview before saving, starter recipe chips, real past-run graph projection preview, true "nothing saved until you approve" |
| **Design-Time Canvas** | **n8n 2.0 / Figma / Retool** — LR flow with matching L/R ports, `+` port quick-add, Space+drag pan, crisp squircle icons, multi-port decision branches, inline node actions, searchable pickers, structured loop/mapping forms | Top/bottom ports on LR layout, manual pan toggle, 2 split editors (neither complete), raw JSON mapping editors, hardcoded light toolbar | Single unified Studio (`Design` · `Triggers` · `Runs` · `Settings`), adaptive LR/TB ports, all 7 step kinds, multi-port Decision/Loop nodes, `+` quick-add, structured data-mapping pill picker |
| **Runs Triage & Debugger** | **Temporal UI / Stripe Workbench / VS Code** — collapsible run list, full-bleed canvas, VCR transport with DAG-native labels, live progress bars on nodes, ghosted untaken edges, interactive timeline scrubber w/ step spans, visual what-if blast-radius overlay | Triple-split cramped panes, clipped replay/tick strips, broken `Running` filter, deleted skipped edges, confusing Over/Into labels | Master-detail with collapsible run drawer, full-bleed debugger canvas, step-span replay scrubber, visual blast-radius highlight, live node progress, unified drawer inspector (Inputs/Outputs, Verdicts, Worker Lease, Interventions) |
| **Drop-In Embeddability** | **Stripe Event Graph / Temporal Mini-DAG** — adapts seamlessly from 280px chat card to full-screen debugger | Fixed chrome that clips in small panes and under-uses large panes | Density-aware `<mj-task-graph-debugger>` (`embedded` / `console` / `compact`) with shared theme-authentic tokens in Light & Dark modes |

---

## 3. Hidden Backend Superpowers Waiting for Great UX

Every capability below is **already implemented and tested in `@memberjunction/task-graph` / `@memberjunction/ai-core-plus` / `@memberjunction/ng-agents`** — waiting for great UX to bring it to life:

| # | Backend Superpower | Exact Backend Location | Current UI Exposure | High-Impact UX Opportunity |
|---|---|---|---|---|
| 1 | **Per-Step Targeted Stepping (`Step(taskID)`)** | `TaskGraphDebugOperations.ts:43-44, 207-210` (`target: 'one' \| 'wave' \| <taskID>`) | **Hidden** (UI only calls `'one'` and `'wave'`) | Add **"Run this step"** play button on every eligible Pending node's hover bar & context menu when paused! |
| 2 | **Saga Compensation & Human Escalation** | `saga-compensation.ts:31-258` (`SagaExecutionState`, `CompensatesTaskID`, reverse-topo undo, `EscalateToHumanTask` / `HaltSaga` / `ContinueCompensation`) | **0% exposed** | Design-time: "Undo / Rollback Action" section on Action steps + Workflow Failure Policy toggle (`Stop` vs `Auto-Rollback Saga`). Run-time: visualize compensation nodes linked with amber reverse-arrows back to the forward step they undid + Saga status banner (`Compensating…` / `Rolled back` / `Escalated to Human`). |
| 3 | **Live `NodeProgress` Streaming** | `types.ts:292, 373-376` (`ProgressMessage`, `ProgressPercent`), already received in `task-graph-run-view.component.ts:278, 735-740` | Captured in `LiveActivity` map, **never rendered on canvas nodes!** | Render slim determinate/indeterminate progress bar + 1-line live status text directly inside running canvas nodes. |
| 4 | **AI Decision Nodes (`Likelihood`, `Choice`, `Score`, `minConfidence`)** | `decision-node.ts:29-160`, `types.ts:175-219`, `agent-properties-panel.component.html:219-468, 694-769` | Exists ONLY in `mj-flow-agent-editor`; **invisible** in `mj-task-graph-editor` and raw JSON in Runs | First-class diamond/split-header Decision node with visual question chips, multi-branch output ports, run-time confidence meters (e.g. `billing · 94%`), and clear "Held: confidence 0.62 < 0.80 threshold" diagnostics. |
| 5 | **Security Envelope & Taint Tracking** | `types.ts:66-96, 158, 437-455`, `decision-node.ts:64-74` (`IsOutputTainted`, `TAINTED_EGRESS_BLOCKED`, Human step clears taint) | **0% exposed** | Subtle shield/taint badge on steps ingesting external/untrusted data + green "Reviewed & Verified" check when a Human step clears taint; crystal-clear explanation if an action is blocked by taint gate. |
| 6 | **Real Trigger Reconciliation (Schedules + Entity Events)** | `WorkflowSpecSync.ts:158-200` (cron, timezone, `AfterSave`/`BeforeSave`/field-change filter, single-record scope) + `Workflow.Save` / `Workflow.Validate` | **0% exposed** (Catalog hardcodes `'On demand'`) | Real trigger pills in Catalog (`Mon 8:00 AM ET`, `On Invoice → Approved`, `On demand`), plus a visual **Triggers** panel/node at the entry of the Workflow Studio (reusing `<mj-agent-invocations>` inverse index for read + `Workflow.Save` for authoring!). |
| 7 | **6-Source Inverse Invocation Index** | `packages/Angular/Generic/agents/src/lib/components/agent-invocations.*` (Schedules, User Routines, Entity Actions, Record Processes, Sub-Agent parents, ExposeAsAction) | Buried in tab #3 of `AI Agents` form | Surface directly inside the Workflows app's **Triggers & Entry Points** tab and summarize on Catalog cards! |
| 8 | **What-If Failure Blast Radius (`ComputeTasksToBlock`)** | `workflow-runs-resource.component.ts:717-731` | 1 line of plain text (`"3 steps can no longer run"`) | Interactive **"Preview failure impact"** toggle in the inspector that highlights the exact set of downstream nodes on the canvas in dashed warning-red! |
| 9 | **`ForEach` & `While` Rich Loop Semantics** | `TaskLoopExecutor.ts:31-160` (`executionMode: 'sequential' \| 'parallel'`, `maxConcurrency`, `delayBetweenIterationsMs`, `continueOnError`, `Output: { iterations, succeeded, failed, results }`) | Raw JSON editor in Flow Agent Editor; **broken loop card** in Task Graph Run View | Fix `isLoopNode` for `ForEachTask`/`WhileTask`; structured Loop config form (collection pill, parallel/sequential toggle, concurrency slider, max iterations); run-time iteration summary badge (`5/5 ok` or `4 ok · 1 err`) + expandable iteration results table in inspector! |
| 10 | **Conditional Gate Tri-State (`keep` / `drop` / `hold`) & Exclusive Priority Ranking (`1/N`)** | `condition-gate.ts:29-160`, `agent-flow-transformer.service.ts:396-468`, `types.ts:253, 333-342` | `GateDecision` cards in inspector; held stall banner | Render edge priority pills (`#1`, `#2`, `Else`), live verdict icons (`✓` green, `✕` muted, `⏸` amber held) directly on canvas edges, and click-to-answer popover directly on held edges! |
| 11 | **Worker Claims, Heartbeats & Dispatcher Load** | `types.ts:261, 268, 345-370` (`ClaimedBy`, `ClaimExpiresAt`, `InstanceInFlightCount`, `EligibleCount`, `HeldCount`) | Clipped monospace tick strip | Compact live **Engine Pulse** popover in debugger header showing dispatcher health, concurrency utilization (`3 / 5 slots`), lease countdown on active steps, and prominent lost-heartbeat recovery badge. |
| 12 | **Remembered Breakpoints Across Runs** | `remembered-breakpoints.ts` (`TaskGraph.Breakpoints/<workflowAgentID>`, `Configuration.stepId`) | Hidden inside context menu ONLY in AI Test Harness (`AllowRememberBreakpoints` is `false` in Runs!) | Enable remembered breakpoints directly in Workflows Studio & Runs (distinct hollow/bookmarked red breakpoint indicator vs single-run solid dot) and pass `breakpointStepIDs` when launching Debug from Workflows! |
| 13 | **Time-Travel Replay (`ReplayAt`)** | `task-graph-run-view.component.ts:189-196, 660-681` | Bare `<input type="range">` | Full **Execution Timeline / Replay Scrubber** with Play/Pause (1×/2×/4×), timestamp readout, mini Gantt step bars showing parallel waves, and click-any-moment scrubbing! |
| 14 | **Dual-Dialect Condition Context & Prompt Early-Finish** | `condition-gate.ts:131-160` (`payload`, `output`, `decisions`, `data`, `context`, `stepResult`), `types.ts:156` (`ChatMessage`) | Raw JS text box | Condition expression helper with autocomplete chips for upstream outputs, `decisions.<key>.<q>`, `data.*`, `context.*`, and inline validation via `CheckFlowRun`/`ValidateTaskGraphSpec`. |
| 15 | **Conversational `<mj-workflow-plan-card>`** | `packages/Angular/Generic/conversations/src/lib/components/message/workflow-plan-card.component.ts` | Built, unhosted | Wire into Chat to offer 1-click **"Open in Workflows Studio"** so conversational plans flow seamlessly into the redesigned Workflows app. |

---

## 4. Exact `--mj-*` Design Token Snapshot & MJ House Rules Cheat-Sheet

### 4.1 Authentic Light & Dark Theme Tokens (Verbatim from `packages/Angular/Generic/shared/src/lib/_tokens.scss`)

Mockup architects and UI engineers MUST embed these **exact** token names and values (never invent `--mj-color-primary` or `--mj-font-size-*`!):

```css
/* =====================================================================
   AUTHENTIC MEMBERJUNCTION TOKENS — LIGHT THEME (:root)
   Source: packages/Angular/Generic/shared/src/lib/_tokens.scss
   ===================================================================== */
:root {
  color-scheme: light;

  /* Brand & Accent Primitives */
  --mj-color-brand-50: #e6f3f9;
  --mj-color-brand-100: #b3dbed;
  --mj-color-brand-200: #80c3e1;
  --mj-color-brand-300: #4dabd5;
  --mj-color-brand-350: #3395c8;
  --mj-color-brand-400: #2699cc;
  --mj-color-brand-500: #0076b6;   /* MJ Primary Blue */
  --mj-color-brand-600: #006aa3;
  --mj-color-brand-700: #005a8a;
  --mj-color-brand-900: #092340;   /* MJ Navy */

  --mj-color-accent-50: #f0faff;
  --mj-color-accent-300: #aae7fd;
  --mj-color-accent-400: #5cc0ed;
  --mj-color-accent-500: #38a9d9;

  --mj-color-tertiary-50: #ecfeff;
  --mj-color-tertiary-500: #06b6d4;
  --mj-color-tertiary-600: #0891b2;

  --mj-color-violet-50: #f5f3ff;
  --mj-color-violet-300: #c4b5fd;
  --mj-color-violet-400: #a78bfa;
  --mj-color-violet-500: #8b5cf6;
  --mj-color-violet-700: #6d28d9;

  --mj-color-indigo-50: #eef2ff;
  --mj-color-indigo-400: #818cf8;
  --mj-color-indigo-500: #6366f1;

  --mj-color-neutral-0: #ffffff;
  --mj-color-neutral-50: #f8fafc;
  --mj-color-neutral-100: #f1f5f9;
  --mj-color-neutral-200: #e2e8f0;
  --mj-color-neutral-300: #cbd5e1;
  --mj-color-neutral-400: #94a3b8;
  --mj-color-neutral-500: #64748b;
  --mj-color-neutral-600: #475569;
  --mj-color-neutral-700: #334155;
  --mj-color-neutral-800: #1e293b;
  --mj-color-neutral-900: #0f172a;
  --mj-color-neutral-950: #020617;

  /* Semantic Surfaces */
  --mj-bg-page: #f8fafc;
  --mj-bg-surface: #ffffff;
  --mj-bg-surface-elevated: #ffffff;
  --mj-bg-surface-card: #f8fafc;
  --mj-bg-surface-sunken: #f1f5f9;
  --mj-bg-surface-hover: #f1f5f9;
  --mj-bg-surface-active: #e2e8f0;
  --mj-bg-overlay: rgba(15, 23, 42, 0.5);

  /* Semantic Text */
  --mj-text-primary: #1e293b;
  --mj-text-secondary: #475569;
  --mj-text-muted: #64748b;
  --mj-text-disabled: #94a3b8;
  --mj-text-inverse: #ffffff;
  --mj-text-link: #0076b6;
  --mj-text-link-hover: #006aa3;
  --mj-text-violet: #6d28d9;

  /* Semantic Borders */
  --mj-border-default: #e2e8f0;
  --mj-border-subtle: #f1f5f9;
  --mj-border-strong: #cbd5e1;
  --mj-border-focus: #0076b6;
  --mj-border-error: #ef4444;

  /* Semantic Brand / Accent / Tertiary */
  --mj-brand-primary: #0076b6;
  --mj-brand-primary-hover: #006aa3;
  --mj-brand-primary-active: #005a8a;
  --mj-brand-primary-light: #3395c8;
  --mj-brand-secondary: #092340;
  --mj-brand-on-primary: #ffffff;
  --mj-brand-accent: #5cc0ed;
  --mj-brand-accent-hover: #38a9d9;
  --mj-brand-accent-subtle: #f0faff;
  --mj-brand-tertiary: #06b6d4;
  --mj-brand-tertiary-subtle: #ecfeff;

  /* Agent / Categorical Accents (great for step-type accents!) */
  --mj-agent-accent-brand: #0076b6;
  --mj-agent-accent-accent: #38a9d9;
  --mj-agent-accent-indigo: #6366f1;
  --mj-agent-accent-violet: #8b5cf6;
  --mj-agent-accent-tertiary: #06b6d4;
  --mj-agent-accent-info: #3b82f6;

  /* Semantic Status */
  --mj-status-success: #22c55e;
  --mj-status-success-bg: #f0fdf4;
  --mj-status-success-text: #15803d;
  --mj-status-success-border: #22c55e;

  --mj-status-warning: #f59e0b;
  --mj-status-warning-bg: #fffbeb;
  --mj-status-warning-text: #b45309;
  --mj-status-warning-border: #f59e0b;
  --mj-status-on-warning: #0f172a;

  --mj-status-error: #ef4444;
  --mj-status-error-bg: #fef2f2;
  --mj-status-error-text: #b91c1c;
  --mj-status-error-border: #ef4444;

  --mj-status-info: #3b82f6;
  --mj-status-info-bg: #eff6ff;
  --mj-status-info-text: #1d4ed8;
  --mj-status-info-border: #3b82f6;

  /* Typography */
  --mj-font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --mj-font-family-mono: 'JetBrains Mono', 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  --mj-text-xs: 0.75rem;      /* 12px */
  --mj-text-sm: 0.875rem;     /* 14px */
  --mj-text-base: 1rem;       /* 16px */
  --mj-text-lg: 1.125rem;     /* 18px */
  --mj-text-xl: 1.25rem;      /* 20px */
  --mj-text-2xl: 1.5rem;      /* 24px */
  --mj-font-normal: 400;
  --mj-font-medium: 500;
  --mj-font-semibold: 600;
  --mj-font-bold: 700;
  --mj-leading-tight: 1.25;
  --mj-leading-snug: 1.375;
  --mj-leading-normal: 1.5;
  --mj-leading-relaxed: 1.625;

  /* Spacing (4px base) */
  --mj-space-1: 0.25rem;      /* 4px */
  --mj-space-1-5: 0.375rem;   /* 6px */
  --mj-space-2: 0.5rem;       /* 8px */
  --mj-space-2-5: 0.625rem;   /* 10px */
  --mj-space-3: 0.75rem;      /* 12px */
  --mj-space-4: 1rem;         /* 16px */
  --mj-space-5: 1.25rem;      /* 20px */
  --mj-space-6: 1.5rem;       /* 24px */
  --mj-space-8: 2rem;         /* 32px */

  /* Radii, Shadows, Focus Ring, Transitions */
  --mj-radius-sm: 4px;
  --mj-radius-md: 8px;
  --mj-radius-lg: 12px;
  --mj-radius-xl: 16px;
  --mj-radius-full: 9999px;
  --mj-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --mj-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --mj-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --mj-ring-width: 2px;
  --mj-ring-offset: 2px;
  --mj-focus-ring-color: var(--mj-brand-primary);
  --mj-focus-ring: 0 0 0 2px var(--mj-bg-surface), 0 0 0 4px var(--mj-brand-primary);
  --mj-transition-fast: 150ms ease;
  --mj-transition-base: 200ms ease;
}

/* =====================================================================
   AUTHENTIC MEMBERJUNCTION TOKENS — DARK THEME ([data-theme="dark"])
   ===================================================================== */
[data-theme="dark"] {
  color-scheme: dark;

  --mj-bg-page: #0f172a;
  --mj-bg-surface: #1e293b;
  --mj-bg-surface-card: #253347; /* color-mix(in srgb-linear, #1e293b 68%, #334155) */
  --mj-bg-surface-elevated: #334155;
  --mj-bg-surface-sunken: #020617;
  --mj-bg-surface-hover: #475569;
  --mj-bg-surface-active: #64748b;
  --mj-bg-overlay: rgba(0, 0, 0, 0.7);

  --mj-text-primary: #f1f5f9;
  --mj-text-secondary: #cbd5e1;
  --mj-text-muted: #94a3b8;
  --mj-text-disabled: #475569;
  --mj-text-inverse: #0f172a;
  --mj-text-link: #4dabd5;
  --mj-text-link-hover: #80c3e1;
  --mj-text-violet: #c4b5fd;

  --mj-border-default: #334155;
  --mj-border-subtle: #1e293b;
  --mj-border-strong: #475569;
  --mj-border-focus: #2699cc;
  --mj-border-error: #f87171;

  --mj-brand-primary: #2699cc;
  --mj-brand-primary-hover: #4dabd5;
  --mj-brand-primary-active: #80c3e1;
  --mj-brand-accent: #aae7fd;
  --mj-brand-accent-subtle: rgba(92, 192, 237, 0.15);
  --mj-brand-tertiary: #22d3ee;
  --mj-brand-tertiary-subtle: rgba(6, 182, 212, 0.15);

  --mj-agent-accent-brand: #2699cc;
  --mj-agent-accent-accent: #aae7fd;
  --mj-agent-accent-indigo: #818cf8;
  --mj-agent-accent-violet: #a78bfa;
  --mj-agent-accent-tertiary: #22d3ee;
  --mj-agent-accent-info: #60a5fa;

  --mj-status-success-bg: rgba(34, 197, 94, 0.15);
  --mj-status-success-text: #86efac;
  --mj-status-success-border: #16a34a;

  --mj-status-warning-bg: rgba(245, 158, 11, 0.15);
  --mj-status-warning-text: #fcd34d;
  --mj-status-warning-border: #d97706;
  --mj-status-on-warning: #0f172a;

  --mj-status-error-bg: rgba(239, 68, 68, 0.15);
  --mj-status-error-text: #fca5a5;
  --mj-status-error-border: #dc2626;

  --mj-status-info-bg: rgba(59, 130, 246, 0.15);
  --mj-status-info-text: #93c5fd;
  --mj-status-info-border: #2563eb;

  --mj-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --mj-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
  --mj-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
}
```

### 4.2 Non-Negotiable MJ Architectural & UX House Rules

1. **Vocabulary Law (D18):** Every user-facing string says **Workflow**, **Step**, **Path**, **Trigger**, **Run**, **Person step**. NEVER expose *Flow Agent*, *DAG*, *Graph*, *Node*, or *Edge* in end-user copy (they belong only in developer code/metadata).
2. **Single Substrate Law (`WorkflowSpecSync`):** No new `Workflow` / `WorkflowRun` tables. A workflow's **WHAT** is a Flow `MJ: AI Agent` (+ `AIAgentStep` / `AIAgentStepPath`); its **WHEN** is reconciled `MJ: Scheduled Jobs` and `MJ: Entity Actions`; its **RUN** is a root `MJ: Tasks` row (`ParentID IS NULL`) + child `MJ: Tasks` + `MJ: Task Dependencies`.
3. **Saving Is Capture, Not Scheduling (④):** Creating a workflow saves as `Draft` / `On demand` (`triggers: []`) unless the user explicitly configures a trigger. And "Nothing is saved until you approve it" MUST be honored — preview drafted/promoted graphs BEFORE calling `Workflow.Save`.
4. **Skipped ≠ Failed:** A skipped branch is a normal outcome in an exclusive fork — always render neutral/muted, never red or warning amber. Keep skipped edges visually present (dimmed/ghosted) so the user can see *why* the branch wasn't taken.
5. **Operator Overrides Must Be Visually Unmistakable:** An operator-forced edge (`OverrideEdge`) must NEVER look like a naturally evaluated edge — keep dotted stroke + warning color + hand icon (`forced yes` / `forced no`) even when skipping cascades.
6. **Explorer Chrome Standards (`plans/explorer-chrome-conventions.md`):**
   - Wrap Explorer app pages in `<mj-page-layout>` → `<mj-page-header>` (`[meta]`, `[actions]`, `[toolbar]`) → `<mj-page-body>`.
   - `[meta]`: read-only signal badges only (max 3; use X-of-Y `[Count]`/`[Total]` or conditional alert/running callouts — never bare `.length`).
   - `[actions]`: secondary actions left, single primary CTA rightmost (`mjButton`).
   - `[toolbar]`: concise `search (<mj-page-search>) · Filter (<mj-filter-popover> + <mj-filter-panel>) · view (<mj-view-toggle>)`. No second page-level control bar inside `<mj-page-body>`.
7. **Widget Layering (`guides/UI_LAYERING_GUIDE.md`):**
   - Generic packages (`@memberjunction/ng-flow-editor`, `@memberjunction/ng-task-graph-editor`) NEVER import `@angular/router` or `NavigationService`; navigation intent emits via `@Output()`.
   - L1 widgets (`mj-task-graph-editor`, `mj-task-graph-run-view`) are paint-only; L2 (`mj-task-graph-debugger`) owns the `RouteOperation` + `TaskGraphFrames` session.
8. **Persistence & Code Hygiene:**
   - Persist all UI preferences (split sizes, panel open states, view modes, remembered breakpoints) via `UserInfoEngine.Instance` (`MJ: User Settings`), NEVER `localStorage`.
   - Use `UUIDsEqual()` from `@memberjunction/global` for all UUID comparisons.
   - Use `--mj-focus-ring` ONLY in `box-shadow` and `--mj-focus-ring-color` ONLY in `outline`/`border-color`.
   - Modern Angular `@if` / `@for` / `@switch`, zero `any`, zero `.Get()`/`.Set()` on typed entities, derive field unions from entity types (`MJTaskEntity['Status']`), and `BypassCache: true` when reading live `MJ: Tasks` / `MJ: Task Dependencies` (dispatcher writes via direct SQL).

---

## 5. Strategic Recommendations for the Redesign Mockups

To turn this audit into an extraordinary, cohesive product across all 5 surfaces:

1. **Area 1 — Workflows Home (In-App Command Center):**
   - Replace the bare list with a rich **Catalog** (Card Grid + Compact Table `<mj-view-toggle>`, `<mj-page-search>`, `<mj-filter-popover>` for Status/Trigger/Has-Approvals).
   - Each workflow displays its `IconClass` squircle, Status pill (`Active`/`Draft`/`Disabled`), **real Trigger pills** (from Scheduled Jobs & Entity Actions), a **mini visual step-chain strip** (e.g. `Action → ForEach → Person`), and **live Run Health** (last run status/time, 7-day mini bar, active run indicator).
   - Clicking a workflow opens it **inside the Workflows app** in the new **Workflow Studio** (Area 3) — with a secondary "Advanced Agent Record" link for admins, never ejecting business users!
   - Per-card quick actions: **Run**, **Debug**, **Edit**.
2. **Area 2 — Create Workflow Studio Front Door:**
   - Elevated 3-door selector (`Describe with AI` / `From a Past Run` / `Blank Canvas`) + curated **Starter Recipe Chips** for instant inspiration.
   - **Live Split-Pane Draft Preview:** Clicking "Draft steps" runs `Workflow.Draft` (or projects the selected past run's real tasks & edges!) and renders an **interactive preview graph** right on the screen alongside AI reasoning and a "Refine with AI…" follow-up box — **zero DB writes until the user clicks "Approve & Open in Studio"**!
   - Fix `PastRun` promotion to load actual step counts, preview the run graph, and pass the projected `TaskGraphSpec` into `Workflow.Save`.
3. **Area 3 — Unified In-App Workflow Studio:**
   - Full-height in-app workspace with top Studio bar (`← Workflows` · Editable Name · Status pill · Segmented mode `Canvas | List | Triggers | Runs` · Validation pill · `Save` · `Run / Debug` split button).
   - **Upgraded Generic Canvas (`mj-flow-editor`):**
     - Left-to-Right default layout with **direction-adaptive ports** (`left`/`right` in LR, `top`/`bottom` in TB), smooth rounded-step / bezier routing, `+` quick-add port buttons, Space+drag / canvas-drag panning, and **multi-port support** for Decision branches & Loop exits.
     - Redesigned **modern node cards** (all 7 step types: Action, Agent, Prompt, Decision, Person, ForEach, While + External) with crisp squircle icons, fix `isLoopNode` for `ForEachTask`/`WhileTask`, nested visual Loop containers, Decision question chips, and inline hover quick actions.
     - Dark-and-light-native floating bottom HUD (Zoom, Fit, LR/TB layout switch, Minimap, dynamic Legend popover).
   - **Modern Inspector Drawer:** Searchable combobox pickers for Actions/Prompts/Agents, structured Loop config fields (no raw JSON), visual Data Mapping key/value rows with `{{ upstream }}` variable chips, Decision Question + Route-on-Answer builder, Error Handling + **Saga Compensation** rollback action picker, and a dedicated **Triggers** tab backed by `WorkflowSpecSync` + `<mj-agent-invocations>`.
4. **Area 4 — Operational Runs Triage Hub:**
   - Clean 2-pane focus layout: when a run is selected, the Run List collapses into a sleek compact rail/drawer (`280px` or collapsible completely to full-screen Debugger!) so the **Task Graph Debugger gets 75%+ of the viewport**.
   - Fix status filter to map `Running` → `'In Progress'`, add `Waiting on Person` / `Paused` / `All` / `Complete` / `Failed`, and surface an unobtrusive top operational strip only when attention is needed (`N running`, `M waiting on human`, `K failed`).
   - Quick actions in run header: **Re-run**, **Open Workflow in Studio**, **Agent Run**, **Raw JSON**.
5. **Area 5 — World-Class Embeddable `<mj-task-graph-debugger>`:**
   - **DAG-Native VCR Floating Bar:** `Continue (F5)` · `Step Next (F10)` · `Step Wave (F11)` · `Pause` · `Stop (Shift+F5)` + **Engine Pulse** indicator (dispatcher pass heartbeat & concurrency) + **Armed Breakpoints** dropdown pill.
   - **Expressive Runtime Canvas:**
     - **Node-gutter breakpoint dot** (hover to toggle single-run or remembered breakpoint!).
     - **Live `NodeProgress` bars** and duration pills directly on canvas nodes.
     - **Ghosted untaken edges** (never orphaned skipped nodes!) with clear `✓` / `✕` / `⏸ Held` edge chips and inline click-to-override popover.
     - **Visual What-If Blast Radius** toggle highlighting blocked downstream nodes on canvas.
     - **Saga Compensation** visual links & **Security Taint** shield badges.
   - **Time-Travel Execution Timeline / Scrubber** docked cleanly via proper flex layout (fixing the `.wfr-graph-pane` 100% clipping bug!) with Play/Pause, step-span Gantt ticks, and instant scrubbing.
   - **Unified Inspector Drawer** (works identically in Runs, Test Harness, and standalone embeds): tabbed `Overview & Actions` (interventions, `Run this step`, verdicts, worker lease, what-if), `Data / Variables` (searchable tree + Copy JSON + Input/Output diff), and `Event Stream` (filtered live frame log).
