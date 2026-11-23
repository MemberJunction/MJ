# Option C Specification — Dual-Lens Playbook & Guided Diagnostic Co-Pilot

> **Interactive Prototype:** [`mockups/option-c-dual-lens-playbook.html`](mockups/option-c-dual-lens-playbook.html)  
> **Forensic Baseline:** [`study-and-brief.md`](study-and-brief.md)  
> **Design Inspiration:** Relay.app · Zapier Central · Notion Automations · Observable  
> **Target Packages:** `WorkflowsDashboardsModule` (`@memberjunction/ng-dashboards`), `@memberjunction/ng-task-graph-editor`, `@memberjunction/ng-flow-editor`, `@memberjunction/ng-conversations`

---

## 1. Design Thesis, Personas & Tradeoff Analysis

### Core Thesis
> **Readable as a Playbook, Inspectable as a Pathway, Guided by AI.**

MemberJunction already ships a Temporal-grade durable execution engine (`@memberjunction/task-graph`) with parallel wave dispatch, AI Decision confidence gates, Saga compensation, security taint tracking, and live debugging. Yet business users (`WORKFLOWS_FOR_BUSINESS_USERS.md` persona) bounce off raw JSON editors and developer-centric node graphs, while staff engineers lose visibility when workflows flatten into opaque lists.

**Option C solves both sides simultaneously** via three foundational pillars:
1. **Synchronized Dual-Lens Authoring (`Structured Playbook Outline ⇄ Stage/Wave Pathway Diagram`):** A workflow is edited as a warm, numbered, collapsible SOP document with inline `@Step.Output` variable pills, indented Loop containers, and side-by-side Exclusive Branch columns — while staying 1:1 synchronized in lockstep with a clean Left-to-Right Stage/Wave Pathway Diagram.
2. **Human-in-the-Loop First-Class Citizenship:** Person approvals surface directly in the Workflows Catalog (`Needs Your Decision` inbox) and inside Workflow Runs (`Approval Desk`) with interactive checklists and one-click `Approve & Continue` — showing clearly how human review clears external-source security taint (`IsOutputTainted`).
3. **Wave-Aligned Diagnostic Co-Pilot & Before ⇄ After Diffs:** Instead of forcing operators to decode raw GraphQL frames (`GateDecision`, `ClaimChanged`, `TAINTED_EGRESS_BLOCKED`, `SagaExecutionState`), the generic `<mj-task-graph-debugger>` aligns steps into explicit **Wave Swimlanes** (`Wave 1 → Wave 2 → Wave 3 → Wave 4`), explains pauses in plain English at the top of the canvas, pairs every diagnosis with safe 1-click guided remedies, and visualizes step data as a **Before ⇄ After Payload Diff**.

### Best Fit & Explicit Tradeoff
| Dimension | Option C Position |
|---|---|
| **Best For** | Mixed citizen-builder + engineering organizations where VP Operations, RevOps, Legal, and Domain Experts co-author, review, and approve workflows alongside developers who debug parallel waves, AI Decisions, and Saga rollbacks. |
| **Primary Advantage** | Eliminates raw-JSON intimidation, makes parallel `Step Wave (F11)` immediately obvious via Wave columns, and unifies non-technical approvals with deep operational triage. |
| **Key Tradeoff** | Auto-structured Playbook + Stage/Wave layouts take precedence over freeform 2D pixel-coordinate dragging. Teams wanting pure Figma/n8n-style freeform 2D canvas placement as their primary mental model may prefer an unconstrained canvas-first option (while Option C keeps Dagre LR/TB auto-layout clean and predictable). |

---

## 2. Non-Negotiable House Rules & Forensic Bug Remediations

### 2.1 D18 Vocabulary Enforcement Table
Every visible end-user string across all 5 surfaces strictly obeys D18:

| Internal Code / Metadata Term (Hidden) | End-User Copy in Option C (Mandatory) |
|---|---|
| Flow Agent (`MJ: AI Agents` Type=`Flow`) | **Workflow** |
| Task / Node (`AIAgentStep`, `TaskGraphSpec.tasks[]`) | **Step** |
| Dependency / Edge (`AIAgentStepPath`, `dependsOn`) | **Path** |
| `HumanTask` / `StepType: 'Human'` | **Person step** |
| `Scheduled Job` / `Entity Action` | **Trigger** |
| Root `MJ: Tasks` row (`ParentID IS NULL`) | **Run** |
| `Step('one')` / `Step('wave')` / `Step(taskID)` | **Step Next (`F10`)** · **Step Wave (`F11`)** · **Run This Step** |
| `IsOutputTainted` / `TAINTED_EGRESS_BLOCKED` | **External data safety flag** / **Protected by external data safety gate** |

### 2.2 Complete Audit Defect Remediation Map (from `study-and-brief.md`)

| Audit Defect | Root Cause in Current Codebase | Exact Fix in Option C |
|---|---|---|
| **1. Dead-Token Collapse** | Hallucinated `--mj-color-primary`, `--mj-font-size-*`, `--mj-bg-hover`, `--mj-text-tertiary`, `--mj-font-mono`, `--mj-space-sm/md`, `--mj-status-error-subtle` + hardcoded `#ffffff` in `flow-toolbar` & `flow-status-bar`. | Replace every stylesheet with verbatim tokens from `packages/Angular/Generic/shared/src/lib/_tokens.scss` (`--mj-brand-primary`, `--mj-text-xs..2xl`, `--mj-bg-surface-hover`, `--mj-text-muted`, `--mj-font-family-mono`, `--mj-space-1..8`, `--mj-status-*-bg/text/border`). Purge all hardcoded light hex in `ng-flow-editor` toolbar, status bar, and legend. |
| **2. Ejection Out of Workflows App** | `WorkflowsDashboardComponent.OnOpenWorkflow()` calls `OpenEntityRecord('MJ: AI Agents', ...)`. | Open workflows directly inside the new in-app **`WorkflowStudioResourceComponent`** (`DriverClass: 'WorkflowStudioResource'`). Keep an optional `"View underlying record"` overflow menu item for admins only. |
| **3. Split-Brain Incomplete Editors** | `mj-flow-agent-editor` lacks `Human` steps & Trigger editing; `mj-task-graph-editor` only authors 3 step kinds & has an 86-line stub properties panel. | Unify authoring under a single 7-kind step schema (`Action`, `Agent`, `Prompt`, `Decision`, `Human/Person`, `ForEach`, `While` + read-only `External`) shared between Playbook Outline and Stage Diagram, with visual variable pills and searchable pickers. |
| **4. Broken Loop Cards & Type Fallback** | `flow-node.component.ts:95` checks `'ForEach' \| 'While'`, missing `'ForEachTask' \| 'WhileTask'`; `TaskGraphEditorComponent` only passes 3 `NodeTypes`. | Normalize `isLoopNode` to match both Flow (`ForEach`, `While`) and TaskGraph (`ForEachTask`, `WhileTask`); pass complete `ALL_TASK_GRAPH_NODE_TYPES` registry to `<mj-flow-editor>`. |
| **5. LR Port Orientation Mismatch** | `SpecToNodes` hardcodes `top`/`bottom` ports while `TaskGraphRunView` lays out `Direction: 'LR'`. | Derive port sides dynamically from active layout direction (`left`/`right` in LR and Wave-Lane modes; `top`/`bottom` in TB mode). |
| **6. Deleted Skipped Edges & Missing Strike-Through** | `task-graph-canvas-adapter.ts:449` skips emitting edges to/from `Skipped` tasks; CSS targets `.mj-flow-node-title` instead of `.mj-flow-node-label`. | Emit untaken edges with `Status: 'untaken'` rendered as muted dashed connectors + `✕` chip (controlled by `"Ghost untaken paths"` toggle, never red). Fix CSS selector to `.mj-flow-node-body--skipped .mj-flow-node-label`. |
| **7. Broken "Nothing Saved Until You Approve"** | `WorkflowsDashboardComponent.OnCreated` immediately calls `Workflow.Save` and ignores `SourceRunID`. | Keep `Workflow.Draft` output and `PastRun` projection strictly in component memory inside the split-pane preview (`Playbook` / `Pathway` + clickable Mad-Lib pills) until the user explicitly clicks **Approve & Open Studio**. Project `SourceRunID` child tasks & dependencies into a real `TaskGraphSpec` before saving. |
| **8. `.wfr-graph-pane` Flex Clipping Bug** | Non-flex container gives `<mj-task-graph-debugger Height="100%">`, pushing replay scrubber & status bars below viewport. | Make `.wfr-graph-pane` and `.dbg-canvas-col` strict `display: flex; flex-direction: column; min-height: 0; overflow: hidden;` with `flex: 1 1 auto; min-height: 0;` on the canvas scroll region and `flex-shrink: 0;` on Co-Pilot banner, VCR bar, and Replay Scrubber. |
| **9. Broken `'Running'` Filter & Stale Agent Selection** | `STATUS_FILTERS` filters `'Running'` while `MJ: Tasks.Status` is `'In Progress'`; `SelectWorkflowRun` skips `loadSteps()`/`loadDebugState()`. | Derive filter types from `MJTaskEntity['Status']` (`'In Progress'`, `'Complete'`, `'Failed'`, `'Cancelled'`) plus derived operational facets (`'Waiting on Person'`, `'Held'`). Route `SelectWorkflowRun` tool through `OnSelectRun(match.ID)` so steps and debug frames always load. |
| **10. CommonJS `require('@dagrejs/dagre')`** | `flow-layout.service.ts:27` uses dynamic `require`. | Replace with static top-level ESM `import dagre from '@dagrejs/dagre'`. |

---

## 3. Surface-by-Surface UX Specification (Areas 1–5)

### Surface 1 — Workflows Catalog (`WorkflowsDashboardComponent`)
- **Explorer Chrome (`<mj-page-layout>`):**
  - `[meta]`: Dynamic X-of-Y count (`<mj-stat-badge [Count]="Filtered.length" [Total]="All.length" Label="workflows">`), conditional amber callout (`N waiting on your approval` — scrolls to/expands inbox), conditional live blue pill (`N running now`).
  - `[actions]`: `Refresh` (secondary) + `+ Create Workflow` (primary `mjButton`).
  - `[toolbar]`: `<mj-page-search>` + `<mj-filter-popover>` (`Status`, `Trigger Type`, `Capabilities: Has Person Step / Auto-Rollback Saga`) + `<mj-view-toggle>` (`Cards` | `Table`).
- **Collapsible "Needs Your Decision" Inbox Strip:**
  - Queries open `MJ: Tasks` where `Type = 'Human'` and `Status = 'In Progress'` assigned to current user (or team), plus root runs with an active `held` gate or `heartbeat-lost` stall.
  - Offers 1-click **`Review & Approve`** (deep-links into Surface 4 Approval Desk) and **`Open Guided Co-Pilot`** (deep-links into Surface 5 Debugger).
- **Playbook Cards & Compact Table:**
  - Displays `MJAIAgentEntity.IconClass` squircle, real reconciled Trigger pills (from `MJ: Scheduled Jobs` + `MJ: Entity Actions` + `ExposeAsAction`), an auto-generated **Plain-English Route Summary** (*"Every Monday 8am → Scan undocumented fields → Propose descriptions in parallel → Ask Owner to approve"*), a color-coded step-kind chain strip, 7-day reliability sparkline (`99% · 64 runs`), and 3 direct actions: **`Run with Inputs`** (modal form driven by workflow input schema — zero raw JSON), **`Open Playbook`** (in-app Studio), and **`Recent Runs`**.

### Surface 2 — Create Workflow (`CreateWorkflowComponent`)
- **Three-Door Front Door:**
  1. **`Co-Draft with AI`** (`Workflow.Draft`): Business Goal Starter chips + conversational refinement thread showing AI's transparent `reasoning` + 1-click refinement chips (`+ Run every Monday 8am`, `+ Add Person Approval`, `+ Add Saga Rollback`).
  2. **`Turn a Past Run into a Workflow`**: Lists terminal root `MJ: Tasks` with real computed step counts (`SELECT ParentID, COUNT(*) ...`) and execution durations. Only `Status === 'Complete'` rows are selectable; failed/cancelled rows explain why they cannot be promoted directly. Selecting a run projects its **real executed steps & durations** into the right-hand preview!
  3. **`Start from Scratch`**: Structured name, goal, icon, default `On demand` trigger, and Failure Policy selector (`Stop safely` vs `Auto-Rollback Saga`).
- **Live Editable Split Preview (Zero Premature DB Writes):**
  - Persistent header assurance pill: `Draft preview only — nothing saved until you click Approve & Open Studio`.
  - Toggle between **`Playbook`** (numbered SOP blocks with clickable **Mad-Lib parameter pills** like `up to [3 times]` and `Ask [Elena Vance (VP Ops)]`) and **`Pathway`** (horizontal preview diagram).
  - Clicking **`Approve & Open Studio`** executes `Workflow.Save` with `status: 'Draft'`, `triggers: []` (House Rule ④: Saving is Capture, Not Scheduling), and transitions seamlessly into Surface 3 Studio.

### Surface 3 — Unified In-App Workflow Studio (`WorkflowStudioResourceComponent`)
- **Studio Header:** `← Workflows` · Squircle Icon · Inline-editable Name · Status badge · Validation pill (`CheckFlowRun` + `ValidateTaskGraphSpec`) · **Lens Switcher (`Split Dual-Lens` | `Playbook Only` | `Diagram Only` | `Triggers & Entry Points (N)`)** · `Test Run` · `Debug` · `Save`.
- **Left Lens — Structured Playbook Document (`<mj-task-graph-playbook-outline>`):**
  - **Block 0 (Triggers):** Inline trigger summary pills (`On demand`, Schedule, Record Change) + link to the 6-source inverse index.
  - **Parallel Stage Groups:** Visually grouped side-by-side cards (`Stage 1 · Run in Parallel (Wave 1)`).
  - **Collapsible Step Cards (All 7 Kinds):** Clicking expands zero-JSON structured controls:
    - Searchable combobox pickers for Actions, Prompts, Agents, and Users/Roles (replacing bare `<select>`).
    - **Visual Data Mapping with `@Step.Output` Variable Pills** — zero raw JSON!
    - **Indented Loop Containers (`ForEach` / `While`)** with sequential/parallel toggle, concurrency slider, safety iteration cap, and nested child steps.
    - **AI Decision Question Builder** (`Likelihood`, `Choice`, `Score`, `minConfidence` threshold).
    - **Side-by-Side Exclusive Branch Columns** (`Path #1 · If Approved` vs `Path #2 · Else: Escalate to Person`) with priority badges.
    - **Plain-English Failure / Saga Rollback Policy** card pairing forward actions with `CompensatesTaskID` undo actions (`Publish Post ↩ CMS: Unpublish Draft`).
  - **`+ Insert Step` buttons** on every connector opening the 7-step-kind picker modal; additions sync instantaneously to both lenses.
- **Right Lens — Synchronized Stage/Wave Pathway Diagram (`<mj-flow-editor>`):**
  - Left-to-right Stage columns with direction-adaptive `left`/`right` ports, bidirectional click-to-select & scroll-into-view lockstep with the Playbook, taint/undo/priority badges, and a dark/light-native bottom floating HUD (`Zoom`, `Fit`, `Synced`).
- **Triggers & Entry Points Tab:**
  - Top panel: Live authoring of `WorkflowSpec.triggers` (Schedules with timezone & next fire preview; Entity Events with `AfterSave`/`BeforeSave` and field-change filters) reconciled via `WorkflowSpecSync` on Save.
  - Bottom panel: Hosts the existing `<mj-agent-invocations>` 6-source inverse index (Scheduled Jobs, User Routines, Record Events, Record Processes, Parent Workflows, Exposed as Action) directly inside the Workflows app!

### Surface 4 — Workflow Runs (`WorkflowRunsResourceComponent`)
- **Collapsible Master-Detail Architecture:**
  - Left Run Rail (`330px`, collapsible via toolbar button so the Execution Story / Debugger expands to 100% width).
  - Status Filter Tabs use exact `MJTaskEntity['Status']` values plus operational buckets: `All`, `In Progress`, `Waiting on Person`, `Held`, `Failed`, `Complete`.
- **Executive Run Header:** Workflow icon, Run ID, Trigger provenance, duration, and 4 operational actions: **`Re-run`**, **`Save as New Workflow`** (routes to Surface 2 Past-Run Promoter pre-selected!), **`Open Playbook`**, and **`Inspect in Debugger`**.
- **Inline Person Step Approval Desk:**
  - Whenever the selected run has an active `Human` step assigned to the user, an amber-framed Approval Card renders directly at the top of the Execution Story with interactive item checkboxes, confidence pills, external-data taint verification note, reviewer comment field, and **`Approve & Continue` / `Request Changes`**.
- **Narrative Execution Story:** Clean step-by-step execution chronicle showing live `NodeProgress` bars on active steps, loop iteration summaries (`12/12 succeeded`), AI Decision verdicts, and Saga compensation links (`↩ Automatically undone by Release Billing Rate`).

### Surface 5 — Generic `<mj-task-graph-debugger>` (`@memberjunction/ng-task-graph-editor`)
- **Adaptive Density (`[DisplayMode]="'console' | 'embedded' | 'compact'"`):**
  - **`console`** (Workflows → Runs, AI Test Harness full-screen): Full Co-Pilot Banner + DAG-Native VCR Bar + Horizontal Wave-Lane Canvas + Docked Time-Travel Scrubber + Right Inspector Drawer (`Before ⇄ After`, `Verdicts & Fix`, `Live Events`).
  - **`embedded`** (360px Conversations Right Rail / Test Harness compact panel): Stacks Wave Lanes vertically with zero horizontal overflow, condenses VCR button labels cleanly, preserves the plain-English Co-Pilot Banner & 1-click remedies, and emits `(ExpandRequested)` so the host can open full-screen without importing Angular Router!
- **Guided Diagnostic Co-Pilot Banner (`<mj-task-graph-copilot-banner>`):**
  - Pure L1 translator mapping live frames & task states into plain-English explanations + 1-click actions:
    - `GateDecision: held` → explains missing/unresolvable property + `[Answer Yes]`, `[Answer No]`, `[Edit Step Input & Retry]`, `[Force Complete Step]`, `[Highlight N Blocked Steps]`.
    - `ClaimChanged: heartbeat-lost` → explains expired worker lease & preserved checkpoint progress + `[Reclaim & Resume Step]`.
    - `TAINTED_EGRESS_BLOCKED` → explains untrusted upstream source + `[Approve & Clear Safety Flag]` / `[Insert Person Review Step]`.
    - `SagaExecutionState: Compensating / RolledBack` → explains triggering failure & reverse-order undo steps.
- **Wave-Aligned Swimlane Canvas (`<mj-task-graph-wave-view>`):**
  - Groups steps into topological Wave columns (`Wave 1` → `Wave 2` → `Wave 3` → `Wave 4`), visually clarifying why **`Step Wave (F11)`** advances an entire column at once.
  - **Node-Gutter Breakpoints:** Clicking a step card's left gutter cycles `Off` → `Single-Run Breakpoint` (solid red dot) → `Remembered Breakpoint` (hollow red ring persisted via `TaskGraph.Breakpoints/<workflowAgentID>`).
  - **Live `NodeProgress` Bars:** Renders `ProgressPercent` and `ProgressMessage` directly inside running step cards.
  - **Untaken & Forced Path Visual Semantics:**
    - Naturally taken: green `✓`.
    - Untaken/skipped: neutral muted dashed + `✕` (toggled via `Ghost untaken paths`, never red, never orphaned).
    - Operator override (`OverrideEdge`): unmistakably distinct **amber dotted border + `✋ Forced Yes / Forced No`** (House Rule #5).
    - What-If Blast Radius (`ComputeTasksToBlock`): toggling **`Highlight N Blocked Steps`** outlines all threatened downstream steps in pulsing dashed error-red.
- **Before ⇄ After Payload Diff Inspector (`<mj-task-graph-payload-diff>`):**
  - Replaces raw JSON walls with a 2-column visual diff of **Before (Received)** vs **After (Produced)** highlighting added keys (green), changed values (amber), and missing keys referenced by a failing/held path rule (red).
- **Docked Wave-by-Wave Time-Travel Replay Scrubber (`<mj-task-graph-replay-scrubber>`):**
  - Flex-docked at the bottom of the canvas column (zero clipping) with Play/Pause playback, Wave Gantt segments, timestamp readout, and instant scrubbing across `ReplayAt`.

---

## 4. Package & Component Hierarchy Architecture

Strictly enforces `guides/UI_LAYERING_GUIDE.md` (**L1** paint-only → **L2** session-owning drop-in → **L3** Explorer app screens). Generic packages NEVER import `@angular/router` or `NavigationService`.

```
packages/Angular/Generic/flow-editor/ (@memberjunction/ng-flow-editor — L1)
├── FlowEditorComponent                 // Theme-native toolbar/status/legend, Space+drag pan, LR/TB ports
├── FlowNodeComponent                   // Fix isLoopNode (ForEachTask/WhileTask), squircle icons, gutter BP slot, live progress bar
├── FlowLayoutService                   // Static ESM @dagrejs/dagre + Wave/Stage rank assignment
└── FlowStepPickerDialogComponent       // Shared 7-step-kind quick-insert popover

packages/Angular/Generic/task-graph-editor/ (@memberjunction/ng-task-graph-editor — L1 & L2)
├── L1 Paint-Only Components (zero Remote Operations, zero Router):
│   ├── TaskGraphPlaybookOutlineComponent    (<mj-task-graph-playbook-outline>) // Structured Playbook lens + inline variable pills
│   ├── TaskGraphWaveViewComponent           (<mj-task-graph-wave-view>)        // Wave-aligned swimlane visualizer + blast-radius overlay
│   ├── TaskGraphCopilotBannerComponent      (<mj-task-graph-copilot-banner>)   // Plain-English diagnostic translator + remedy outputs
│   ├── TaskGraphPayloadDiffComponent        (<mj-task-graph-payload-diff>)     // Before <-> After visual payload diff + copy JSON
│   ├── TaskGraphReplayScrubberComponent     (<mj-task-graph-replay-scrubber>)  // Play/Pause + Wave Gantt scrubber emitting ReplayAt
│   ├── TaskGraphDebugToolbarComponent       (<mj-task-graph-debug-toolbar>)    // DAG-native VCR bar + Engine Pulse + BP popover
│   ├── TaskGraphEditorComponent             (<mj-task-graph-editor>)           // Upgraded with ALL 7 step kinds + Dual-Lens sync
│   └── TaskGraphStepInspectorComponent      (<mj-task-graph-step-inspector>)   // Searchable pickers, AI Decision builder, Saga undo
└── L2 Drop-In Session Wrapper (owns RouteOperation + TaskGraphFrames subscription):
    └── TaskGraphDebuggerComponent           (<mj-task-graph-debugger>)
        Inputs:  [ParentTaskID], [DisplayMode]: 'console' | 'embedded' | 'compact', [AllowRememberBreakpoints]: boolean
        Outputs: (ExpandRequested), (OpenWorkflowRequested), (StepSelected), (ApprovalSubmitted)

packages/Angular/Explorer/dashboards/src/Workflows/ (WorkflowsDashboardsModule — L3)
├── WorkflowsDashboardComponent              // Area 1: Catalog + Collapsible Needs Your Decision Inbox + Run-with-Inputs Modal
├── CreateWorkflowComponent                  // Area 2: 3-Door Co-Author + Past-Run Promoter + Live Mad-Lib Preview
├── WorkflowStudioResourceComponent          // Area 3: In-App Dual-Lens Studio + Triggers & <mj-agent-invocations> Tab
├── WorkflowRunsResourceComponent            // Area 4: Collapsible Run Rail + Execution Story + Inline Person Approval Desk
├── components/
│   ├── workflow-approval-desk.component.ts  // Reusable Person-Step approval checklist + taint clearance confirmation
│   └── workflow-run-inputs-modal.component.ts
└── services/
    └── workflows-navigation.service.ts      // Bridges L2 outputs -> Explorer NavigationService deep links

packages/Angular/Generic/conversations/ (@memberjunction/ng-conversations)
└── WorkflowPlanCardComponent                // Hosts <mj-task-graph-debugger DisplayMode="embedded"> + "Open in Studio" output
```

---

## 5. Hidden Backend Superpowers Wiring Matrix

Every single one of the 15 existing backend capabilities documented in §3 of `study-and-brief.md` is first-class in Option C:

| # | Backend Superpower | Option C Surface & Component Wiring |
|---|---|---|
| 1 | `Step(taskID)` targeted stepping | `Run This Step` VCR button & step-card hover action in `TaskGraphDebuggerComponent` → `RouteOperation('TaskGraph.Step', { parentTaskId, target: stepId })`. |
| 2 | Saga Compensation (`CompensatesTaskID`, `SagaExecutionState`) | Studio Playbook bottom policy card + Undo action picker on Action steps; Runs & Debugger amber `↩ Undone by` reverse badges and Saga status banner. |
| 3 | Live `NodeProgress` streaming | Passed from `TaskGraphRunViewComponent.LiveActivity` into `TaskGraphWaveViewComponent` to render live determinate/indeterminate progress bars & status lines directly inside running step cards. |
| 4 | AI Decision (`Likelihood`, `Choice`, `Score`, `minConfidence`) | Inline **AI Decision Question Builder** inside Studio Playbook + live confidence score readout (`score: 0.91`) and below-threshold Co-Pilot diagnostics in Debugger. |
| 5 | Security Taint (`IsOutputTainted`, `TAINTED_EGRESS_BLOCKED`) | `External` shield badge on untrusted steps, `Verifies` green shield on Person steps, and dedicated Co-Pilot `Taint Gate` diagnosis with 1-click approval guidance. |
| 6 | Trigger Reconciliation (`WorkflowSpecSync`) | Studio Block 0 trigger pills + dedicated `Triggers & Entry Points` tab authoring Schedules & Entity Events synced via `Workflow.Save`; real trigger pills in Catalog. |
| 7 | 6-Source Inverse Index (`<mj-agent-invocations>`) | Mounted directly inside Studio's `Triggers & Entry Points` tab and summarized as count badges in Catalog & Studio header. |
| 8 | What-If Blast Radius (`ComputeTasksToBlock`) | Co-Pilot **`Highlight N Blocked Steps`** toggle highlights exact downstream threatened steps in pulsing dashed error-red on the Wave Canvas. |
| 9 | `ForEach` & `While` Loop Semantics | Fixed `isLoopNode` + indented tinted Playbook Loop container with structured concurrency/cap fields + run-time `12/12 succeeded` badges. |
| 10 | Tri-State Gates & Exclusive Priority (`1/N`, `OverrideEdge`) | Priority pills (`#1 Approved`, `Else`), live `✓`/`✕`/`⏸` chips, and unmistakable dotted amber `✋ Forced Yes / Forced No` override badges. |
| 11 | Worker Claims, Heartbeats & Dispatcher Pulse | Compact **`Engine Pulse · 2/5`** popover in VCR bar + plain-English `Lost Heartbeat` Co-Pilot banner with 1-click Reclaim. |
| 12 | Remembered Breakpoints (`TaskGraph.Breakpoints/<id>`) | Enabled in both Studio and Runs (`AllowRememberBreakpoints = true`) via click-cycle on left node gutter (solid red = single-run, hollow ring = remembered). |
| 13 | Time-Travel Replay (`ReplayAt`) | Flex-docked `TaskGraphReplayScrubberComponent` with Play/Pause animation, Wave Gantt track, and live Wave-state rewinding. |
| 14 | Dual-Dialect Condition Context & Variable Pills | Visual `@Step.Output` pills mapping cleanly to `payload.*`, `decisions.*`, `data.*`, and `context.*` with live `ValidateTaskGraphSpec` checks. |
| 15 | Conversational `<mj-workflow-plan-card>` | Embeds `<mj-task-graph-debugger [DisplayMode]="'embedded'">` (360px) in Chat with 1-click `Open in Workflows Studio`. |

---

## 6. Persistence (`UserInfoEngine`) & Typing Contracts

- **Zero `localStorage` / `sessionStorage`:** All per-user preferences persist through `UserInfoEngine.Instance.GetSetting()` / `SetSettingDebounced()` (`MJ: User Settings`):
  - `mj.workflows.catalog.viewMode` → `'cards' | 'table'`
  - `mj.workflows.catalog.inboxCollapsed` → `'true' | 'false'`
  - `mj.workflows.studio.lens` → `'split' | 'playbook' | 'diagram'`
  - `mj.workflows.studio.splitRatio` → JSON `[number, number]` (default `[47, 53]`)
  - `mj.workflows.runs.railCollapsed` → `'true' | 'false'`
  - `mj.workflows.debugger.showUntakenPaths` → `'true' | 'false'`
  - `mj.workflows.debugger.inspectorTab` → `'diff' | 'verdicts' | 'frames'`
  - `TaskGraph.Breakpoints/<workflowAgentID>` → Remembered breakpoint step IDs (existing backend convention)
- **Strict Type Safety:**
  - Zero `any`, zero `.Get()`/`.Set()` on generated entities.
  - Derive status unions directly from `MJTaskEntity['Status']` and `MJAIAgentEntity['Status']`.
  - Use `UUIDsEqual()` from `@memberjunction/global` for all entity/task ID comparisons.
  - Always pass `BypassCache: true` when loading live `MJ: Tasks` and `MJ: Task Dependencies` (dispatcher updates via direct SQL).

---

## 7. Explorer Agent Context & Client Tools

Each L3 Workflows surface publishes rich context via `publishAgentContext()` and registers safe, typed client tools:

| Surface | Published Agent Context | Registered Client Tools |
|---|---|---|
| **Catalog** | `{ totalWorkflows, filteredCount, pendingApprovalsCount, activeRunsCount, viewMode, activeFilters }` | `OpenCreateWorkflow(door?)`, `OpenWorkflowInStudio(name)`, `FilterWorkflows(query, status?, trigger?)`, `OpenPendingApprovals()` |
| **Create** | `{ activeDoor, isUnsavedDraft: true, draftStepCount, selectedStarterOrRunId }` | `DraftWorkflowFromGoal(prompt)`, `RefineWorkflowDraft(instruction)`, `PreviewPastRun(runId)` *(never auto-saves without explicit user confirmation)* |
| **Studio** | `{ workflowId, workflowName, activeLens, selectedStepId, validationIssueCount, triggerCount }` | `SwitchStudioLens(lens)`, `SelectWorkflowStep(stepName)`, `ValidateWorkflow()`, `OpenTriggersTab()` |
| **Runs & Debugger** | `{ selectedRunId, runStatus, activeDiagnosticType, heldStepNames, waitingOnPersonCount, armedBreakpointsCount }` | `FilterWorkflowRuns(status, search?)`, `SelectWorkflowRun(runId)` *(invokes full `OnSelectRun()` loader)*, `ExplainCurrentPause()`, `HighlightBlockedSteps(enabled)`, `ScrubReplayToWave(waveNumber)` |

---

## 8. Phased Delivery & Verification Plan

1. **Phase 1 — Design Token & Core Bug Hygiene (`ng-flow-editor`, `ng-task-graph-editor`, `Workflows`):**
   - Replace all dead `--mj-*` tokens and hardcoded light hex; fix `isLoopNode`, `ALL_TASK_GRAPH_NODE_TYPES`, LR/TB dynamic ports, ghosted untaken edges, `.mj-flow-node-label` strike-through, `.wfr-graph-pane` flex layout, `'In Progress'` filter mapping, `SelectWorkflowRun` reload, and ESM `@dagrejs/dagre` import.
2. **Phase 2 — Generic Dual-Lens & Wave Debugger Primitives (`ng-task-graph-editor`):**
   - Ship L1 `TaskGraphPlaybookOutlineComponent`, `TaskGraphWaveViewComponent`, `TaskGraphCopilotBannerComponent`, `TaskGraphPayloadDiffComponent`, `TaskGraphReplayScrubberComponent`, and L2 `DisplayMode` (`console` / `embedded` / `compact`) on `<mj-task-graph-debugger>`.
3. **Phase 3 — Unified In-App Workflows App (`WorkflowsDashboardsModule`):**
   - Ship Catalog Playbook Cards + Collapsible Approval Inbox, Create Co-Author with true unsaved preview + fixed `PastRun` projection, In-App Dual-Lens Studio + Triggers/<mj-agent-invocations> tab, and Runs Execution Story + Inline Approval Desk.
4. **Phase 4 — Verification & Testing Gates:**
   - Unit tests (`npm run test`) in `ng-flow-editor`, `ng-task-graph-editor`, and `dashboards` covering token-free dark mode, loop rendering for `ForEachTask`/`WhileTask`, past-run `TaskGraphSpec` projection, `'In Progress'` run filtering, `DisplayMode="embedded"` layout, and Co-Pilot diagnosis mapping.
   - Playwright E2E walkthrough across Light & Dark themes for all 5 surfaces plus 360px embedded Chat widget, asserting zero console errors and zero horizontal overflow.
