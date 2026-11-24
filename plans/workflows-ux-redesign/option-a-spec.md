# Option A — Precision Operational Workbench & Split-Deck IDE

## Architectural & UX Specification for MemberJunction Workflows & Task Graph Debugger

> **Interactive Prototype:** [`mockups/option-a-precision-workbench.html`](mockups/option-a-precision-workbench.html)  
> **Forensic Baseline:** [`study-and-brief.md`](study-and-brief.md)  
> **Design Inspiration:** Linear · Temporal Cloud · Chrome & VS Code DevTools · Retool Workflows  
> **Target Audience:** Power builders, AI/automation engineers, and operations teams managing 15–100+ active workflows who demand instant scannability, inline telemetry, synchronized topology/waterfall correlation, and surgical live debugging.

---

## 1. Design Philosophy & Tradeoffs

### 1.1 Design Thesis
Workflows in MemberJunction are **mission-critical durable operational infrastructure**—backing scheduled sweeps, entity-driven sagas, multi-iteration LLM loops, security-taint gates, and human-in-the-loop approvals. Treating them like flat CRUD forms hides the operational state that engineers and ops leads need to act with confidence.

**Option A** delivers a **high-density, keyboard-first operational control plane and split-deck IDE**:
- **Zero Context Ejection:** Users never get kicked out of the `Workflows` app onto an `MJ: AI Agents` entity form. Catalog, Creation, Studio authoring, Trigger reconciliation, Runs triage, and Live Debugging live inside one cohesive operational shell.
- **Simultaneous Visibility (Split-Deck Ergonomics):**
  - *Create:* Natural-language / past-run composer on the left ⇄ live compiled step preview on the right (zero database writes until approved).
  - *Studio:* Collapsible 7-kind step palette + Left-to-Right adaptive-port canvas + tabbed 4-pane inspector (`Setup`, `Data Mapping`, `Branching`, `Retry & Saga`).
  - *Runs:* Collapsible `284px` run rail + Dual-Sync **Workflow Canvas (top)** ⇄ **Execution Waterfall / Gantt (bottom)**.
  - *Debugger:* Flex-column VCR transport + interactive runtime canvas + docked Time-Travel Replay Scrubber + 4-tab Chrome/VS Code DevTools dock (`Variables & Input → Output Diff`, `Path Verdicts & Overrides`, `Interventions`, `Frame Stream`).
- **Authentic Dark & Light Parity:** 100% bound to verified `--mj-*` tokens from `packages/Angular/Generic/shared/src/lib/_tokens.scss`, eradicating every dead token and hardcoded light hex color documented in `study-and-brief.md` §2.

### 1.2 Explicit Tradeoff & Progressive Disclosure Strategy
- **Tradeoff:** Higher information density and multi-pane power could feel intimidating to casual business users on day one if every control competed for visual attention simultaneously.
- **Mitigation via Disciplined Progressive Disclosure:**
  1. **Clean Visual Hierarchy:** Hairline `1px` borders, tabular monospace metrics, and calm muted secondary text keep primary signals (Status, Trigger, Active Step, Blocked/Held state) unmistakable.
  2. **Collapsible Chrome:** The Studio Step Palette collapses to `44px`, the Runs Rail collapses to `42px`, and the Debugger DevTools dock collapses to a `34px` bar—persisted per user via `UserInfoEngine`.
  3. **Zero Raw JSON by Default:** Data Mapping uses visual `{{ step.output }}` pill tokens; Loops use structured condition/iteration/concurrency fields; Triggers use human-readable schedule & record-change rules. Raw JSON remains one click away in a secondary modal/tab for power users.

---

## 2. Token Remediation & House-Rule Compliance

### 2.1 Dead-Token Elimination Contract
Option A strictly bans every hallucinated CSS variable identified in the forensic audit and enforces exact `_tokens.scss` mappings:

| Legacy Broken Token | Option A Replacement (`_tokens.scss`) |
|---|---|
| `--mj-color-primary` | `--mj-brand-primary` |
| `--mj-color-primary-subtle` / `--mj-brand-primary-subtle` | `color-mix(in srgb, var(--mj-brand-primary) 12%, transparent)` or `--mj-brand-accent-subtle` |
| `--mj-color-success` | `--mj-status-success` |
| `--mj-bg-hover` | `--mj-bg-surface-hover` |
| `--mj-text-tertiary` | `--mj-text-muted` |
| `--mj-font-size-xs/sm/md/lg/xl` | `--mj-text-xs`, `--mj-text-sm`, `--mj-text-base`, `--mj-text-lg`, `--mj-text-xl` |
| `--mj-font-weight-semibold/normal` | `--mj-font-semibold`, `--mj-font-normal` |
| `--mj-line-height-relaxed` | `--mj-leading-relaxed` |
| `--mj-font-mono` | `--mj-font-family-mono` |
| `--mj-space-2xs/xs/sm/md` | `--mj-space-1`, `--mj-space-2`, `--mj-space-3`, `--mj-space-4` |
| `--mj-status-error-subtle` | `--mj-status-error-bg` |
| Hardcoded `#ffffff` / `#f8fafc` / `#f0fdf4` | `--mj-bg-surface`, `--mj-bg-surface-elevated`, `--mj-status-success-bg` |

Additional CSS invariants enforced across all components:
- `--mj-focus-ring` is used **exclusively** in `box-shadow`; `--mj-focus-ring-color` is used **exclusively** in `outline` / `border-color`.
- `color-scheme: light` on `:root` and `color-scheme: dark` on `[data-theme="dark"]` ensures native controls (scrollbars, range inputs, selects) adapt cleanly.

### 2.2 Strict D18 Vocabulary & Semantic Rules
1. **User-Facing Copy (Zero Leaks):** All templates, tooltips, status bars, and empty states use **Workflow**, **Step**, **Path**, **Trigger**, **Run**, and **Person step**. Never render *Flow Agent*, *DAG*, *Graph*, *Node*, or *Edge* in end-user copy (including replacing `FlowStatusBarComponent`'s `"nodes / connections"` with `"steps / paths"`).
2. **Single Substrate (`WorkflowSpecSync`):** Zero new database tables. Workflows persist as Flow `MJ: AI Agents` + `AIAgentStep` + `AIAgentStepPath`; triggers reconcile to `MJ: Scheduled Jobs` and `MJ: Entity Actions`; runs query `MJ: Tasks` (`ParentID IS NULL`) + child `MJ: Tasks` + `MJ: Task Dependencies` with `BypassCache: true`.
3. **Skipped ≠ Failed:** Untaken exclusive-fork paths and skipped steps render neutral muted (`opacity: 0.52`, dashed stroke, strikethrough on `.mj-flow-node-label`), never red or amber, and untaken paths remain visible (ghosted) with their evaluated condition chip so operators see *why* a branch was skipped.
4. **Operator Overrides Unmistakable:** Forced path overrides (`OverrideEdge`) always render dotted amber stroke + `✋ Forced Yes` / `✋ Forced No` pill—even when cascading skips occur downstream.

---

## 3. Surface-by-Surface UX Architecture (All 5 Areas)

### 3.1 Surface 1 — Workflows Catalog (`WorkflowsDashboardComponent`)
- **Explorer Chrome (`<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>`):**
  - `[meta]`: Dynamic X-of-Y count (`6 of 6`, never bare `.length`) + conditional amber pill (`2 waiting on person`, clicking navigates to Runs pre-filtered to `Waiting on Person`) + conditional live blue pill (`1 running`).
  - `[actions]`: `Refresh` secondary button left, `+ Create Workflow` primary `mjButton` rightmost.
  - `[toolbar]`: `<mj-page-search>` + `<mj-filter-popover>` (`Status`, `Trigger Kind`, `Has Person Step`) + Sort dropdown + `<mj-view-toggle>` (`Table` default for Linear operational density | `Cards` grid).
- **Operational Row & Card Anatomy:**
  - Squircle icon using `MJAIAgentEntity.IconClass` (with fallback `fa-diagram-project`) + workflow name + conditional waiting badge + 1-line description.
  - **Step-Chain Micro-Topology:** Inline color-coded step-kind summary (`Action ×2 → Prompt → While 3× → Decision → Person`) derived from step metadata so operators grasp graph complexity at a glance.
  - **Real Trigger Pills:** Hydrated from reconciled Scheduled Jobs & Entity Actions (`Weekdays 8:00 AM ET`, `On Order → Approved`, `On demand`), plus a clickable **`+N entry points`** popover backed by the 6-source inverse index.
  - **10-Run Health Spark-Barcode:** 10 recent run outcome bars (green complete, amber waiting/held, red failed, muted empty) + success rate + 7-day volume + tabular `p50` duration.
  - **Row Actions:** `▶ Run`, `🐞 Debug`, and `Edit` (row click or `Edit` opens **Surface 3 In-App Workflow Studio**, never ejecting to `AI Agents` form; an "Open Advanced Agent Record" option sits quietly inside Studio's overflow menu for administrators).

### 3.2 Surface 2 — Create Workflow Front Door (`CreateWorkflowComponent`)
- **Fixes Broken "Unsaved" Promise & Past-Run Bug:**
  - Explicit header badge: **`Draft preview — nothing saved to database until you approve`**.
  - Clicking `Compile Draft Steps` invokes `Workflow.Draft` (`WorkflowDraftOperation`) and renders the returned `TaskGraphSpec` + AI `reasoning` in the right-hand split preview **without calling `Workflow.Save`**.
  - Selecting a settled `Complete` run in **`From a past run`** loads actual child `MJ: Tasks` & `MJ: Task Dependencies`, displays real `StepCount`, duration, and `WaitingNote` for non-settled rows, projects the real `TaskGraphSpec` into the right preview, and passes that projected spec into `Workflow.Save` upon approval (fixing the bug where `SourceRunID` was silently dropped).
- **Split-Screen Layout:**
  - **Left Pane:** 3-door selector (`Describe it`, `From a past run`, `Blank canvas`), Name field, clickable **Starter Recipe Chips**, Prompt Composer (`⌘↵`), and an **Iterative Follow-Up Refinement** input that sends follow-up instructions + current draft `TaskGraphSpec` back to `Workflow.Draft` to refine steps in place before saving.
  - **Right Pane:** Live interactive Left-to-Right step preview, Compiler Validation badge (`✓ Valid · N steps`), Compiler Reasoning Summary, Inferred Inputs/Outputs pill strip, and `Approve & Open in Studio` primary CTA (persists as `Draft · On demand`, `triggers: []`, then opens Surface 3).

### 3.3 Surface 3 — Unified In-App Workflow Studio (`WorkflowStudioComponent`)
Replaces the split-brain authoring experience by hosting a unified, full-7-step-kind Studio directly inside the `Workflows` app:
- **Studio Header Bar:** `← Workflows` · Squircle icon · Inline editable Name · Clickable `Active`/`Draft` pill · Segmented Mode Switcher (`Canvas` | `Step Table` | `Triggers (N)` | `Runs (N)`) · Live compiler pill (`✓ Valid · 7 steps` powered by `CompileFlowToTaskGraph` + `ValidateTaskGraphSpec`) · `Save (⌘S)` · `Run / Debug`.
- **Left Collapsible Step Palette (`206px` / `44px`):** `⌘K` filter + all 7 authorable step kinds (`Action`, `Agent`, `Prompt`, `Decision`, `Person`, `ForEach`, `While`) plus `External`.
- **Center Upgraded Flow Canvas (`@memberjunction/ng-flow-editor`):**
  - Left-to-Right default layout with **direction-adaptive ports** (`left`/`right` in LR, `top`/`bottom` in TB), fixing the vertical S-curve geometry bug.
  - Output port hover `+` quick-add buttons, Space+drag / canvas-drag panning, and theme-native floating bottom-left HUD (`Zoom`, `Fit`, `LR/TB`, `Minimap`, `Legend`).
  - **First-Class Rich Step Cards:**
    - Structured **`While` / `ForEach` Loop Containers** rendering nested body step previews and iteration bounds (fixing `isLoopNode` for `'ForEachTask' | 'WhileTask'`).
    - Multi-output **`AI Decision`** cards with separate per-branch right-side ports (`#1 Approved ≥85%`, `#2 Needs Revision`, `#3 Gave Up`).
    - **`Person` Step** cards with assignee badge and `Clears Taint` security shield.
    - **`Action` Step** cards with `Untrusted Input` taint badge or `↩ Saga: <Action>` rollback badge.
- **Right Docked 4-Tab Inspector (`364px`):**
  1. **`Setup`:** Searchable Comboboxes (`mj-combobox`) for Actions, Prompts, Sub-Agents, and Person roles (replacing bare `<select>`), structured Loop config controls, AI Decision Question Builder (`Likelihood` / `Choice` / `Score` + `minConfidence`), and Person taint-clearing indicator.
  2. **`Data Mapping`:** Visual key-value parameter rows populated with clickable upstream `{{ step.output }}` pill tokens and schema-aware autocomplete—no raw JSON required.
  3. **`Branching`:** Outgoing paths ranked by priority (`#1`, `#2`, `Else`), Route-on-Answer helper, and dual-dialect condition chip editor.
  4. **`Retry & Saga`:** Max retries, backoff, timeout, failure policy (`Retry then Fail`, `Auto-Rollback Saga`, `Continue`, `Hold`), searchable **Saga Rollback Action** picker (`CompensatesTaskID`), and rollback-failure escalation (`EscalateToHumanTask`).
- **`Triggers (N)` Sub-View:** Native authoring for `WorkflowSpec.triggers` (Scheduled Cron + Timezone + next-3-runs preview; Record Change Entity + `AfterSave`/`BeforeSave` + condition filter, reconciled via `WorkflowSpecSync` on Save) paired side-by-side with the read-only **6-Source Entry Points Inverse Index** (`<mj-agent-invocations>`).

### 3.4 Surface 4 — Workflow Runs & Operational Triage Hub (`WorkflowRunsResourceComponent`)
- **Status Filter Bug Fix:** Toolbar status segments map **`Running`** explicitly to `MJ: Tasks.Status === 'In Progress'` (and add `Waiting on Person`, `Failed`, `Complete`, `Cancelled`), derived strictly from `MJTaskEntity['Status']`.
- **Collapsible Run Rail (`284px` → `42px`):** Frees 75%–100% of the viewport for execution triage instead of cramping 3 columns on 1280px–1440px screens. Each rail item displays Workflow icon/name, Run ID, Status pill, duration, trigger source, and step progress.
- **Dual-Sync Split Deck:**
  - **Run Detail Strip:** Trigger source, token/cost telemetry, contextual **`Approve Person Step`** quick CTA when status is `Waiting on Person`, `JSON` modal, `Open in Studio`, and `Open Live Debugger`.
  - **Top Pane — Workflow Canvas:** Interactive LR step topology with live status rings, progress bars, ghosted untaken paths, and Saga rollback links.
  - **Bottom Pane — Synchronized Execution Waterfall / Gantt:** Time ruler (`0s–50s`), parallel wave bars, step duration, and worker/outcome column. Clicking any Waterfall bar highlights & scrolls to that step on the Canvas above, and clicking any Canvas step highlights its Waterfall span.

### 3.5 Surface 5 — Generic `<mj-task-graph-debugger>` (Full Console + 360px Embed Mode)
- **Strict Pure Flex-Column Layout:** Fixes `.wfr-graph-pane` 100%-height clipping permanently—VCR bar, optional Stall banner, Canvas (`flex: 1; min-height: 240px`), Replay Scrubber, and DevTools Dock stack cleanly with zero overflow loss.
- **Adaptive Density Modes (`@Input() Density: 'console' | 'embedded' | 'compact'`):**
  - **`console` (Full Debugger):** Full VCR bar (`Continue F5`, `Step Next F10`, `Step Wave F11`, `Pause`, `Stop Shift+F5`), Armed Breakpoints chip bar distinguishing **Solid Red Single-Run** vs **Bookmarked Remembered** breakpoints (`TaskGraph.Breakpoints/<workflowAgentID>`), **Engine Pulse** popover (`Pass #N`, worker concurrency bar, Ready/Held/Settled counters, heartbeat recency, recent `PassCompleted` ticks), and **`Preview Failure Impact`** (What-If Blast Radius toggle highlighting blocked downstream steps via `ComputeTasksToBlock`).
  - **`embedded` (360px Chat / AI Test Harness Card):** Condenses VCR controls to icon buttons, switches canvas to a compact vertical wave stack with live `NodeProgress` bars, breakpoint dots, and inline `Force Yes / Force No` override buttons, and provides an `Expand` button that emits `@Output() ExpandRequested` (zero Router/NavigationService imports in L2!).
- **Canvas Superpowers Unlocked:**
  - **Hover-to-Toggle Gutter Breakpoint Dots** on every step left margin (click cycles Off → Single-run → Remembered → Off).
  - **Live `NodeProgress` Bars** rendered directly inside running step cards from `TaskGraphRunViewComponent.LiveActivity`.
  - **Inline `▶ Run this step` Button** on eligible Pending steps calling `TaskGraph.Step` with `target: taskID`.
  - **Ghosted Dashed Untaken Paths** (`✕ brandOK == true → false`) + **Amber Dotted Forced Override Paths** (`✋ Forced Yes`).
  - **Security Taint (`Untrusted Input`) & `Person Verified` Shields** + **Saga Compensation Reverse Arrow** (`↩ Compensates: Unpublish Draft`).
- **Time-Travel Replay Scrubber:** Play/Pause animation (`1×` / `2×`), live timestamp readout, clickable Wave tick marks (`W1`–`W6`), and live scrubbing of canvas step states & verdicts.
- **4-Tab DevTools Dock:**
  1. `Variables & Input → Output Diff` (side-by-side Input vs Output highlighting `+` added and `~` changed fields + Copy JSON)
  2. `Path Verdicts & Overrides` (expression, evaluated score, tri-state verdict, live `Force Yes / Force No / Clear Override` buttons)
  3. `Interventions & Force Complete` (`Run This Step Only`, `Edit Input & Retry`, `Skip Step`, `Force Complete` with exact step-name confirmation guard, Worker Lease TTL & Taint card)
  4. `Frame Stream` (live WebSocket feed of all 14 `TaskGraphFrames` event types).

---

## 4. Mapping to MemberJunction Packages & Component Hierarchy

### 4.1 Package & Layering Matrix (`guides/UI_LAYERING_GUIDE.md`)

```text
packages/Angular/Generic/flow-editor  (@memberjunction/ng-flow-editor)          [LAYER 1 — Paint-Only Canvas]
├── FlowEditorComponent               — Adaptive LR/TB ports, Space+drag pan, dark/light HUD, dynamic Legend
├── FlowNodeComponent                 — Modern squircle cards, multi-output ports, fixed isLoopNode ('ForEachTask'|'WhileTask'),
│                                       breakpoint gutter slot, live NodeProgress bar, inline Run-Step action, fixed .mj-flow-node-label strike
├── FlowPaletteComponent              — Collapsible 7-kind + External searchable palette
├── FlowToolbarComponent              — Theme-authentic tokens (zero hardcoded #ffffff/#f8fafc)
├── FlowStatusBarComponent            — D18 copy ("steps · paths"), theme-authentic tokens
└── FlowLayoutService                 — Static ESM import of @dagrejs/dagre (replaces CommonJS require)

packages/Angular/Generic/task-graph-editor  (@memberjunction/ng-task-graph-editor)  [LAYER 1 & LAYER 2 — Zero Router/NavigationService]
├── [L1] TaskGraphEditorComponent     — Pass full 8-type NodeTypes registry (Action, Agent, Prompt, Decision, Human, ForEach, While, External)
├── [L1] TaskGraphRunViewComponent    — Pass LiveActivity (NodeProgress) into SpecToNodes; keep ghosted untaken edges; BlastRadiusIds input
├── [L1] TaskGraphDebugToolbarComponent — DAG-native labels (Continue F5, Step Next F10, Step Wave F11, Pause, Stop) + Engine Pulse + Breakpoint chips
├── [L1] TaskGraphReplayScrubberComponent (NEW) — Play/Pause, 1x/2x, Wave ticks, ReplayAt scrubber
├── [L1] TaskGraphWaterfallComponent (NEW)      — Gantt waterfall synced bidirectionally via @Input()/@Output() SelectedStepID
├── [L1] TaskGraphDevToolsDockComponent (NEW)   — 4-tab dock (Input→Output Diff, Path Verdicts, Interventions, Frame Stream)
└── [L2] TaskGraphDebuggerComponent   — Owns GraphQLDataProvider.TaskGraphFrames + 10 TaskGraph.* RouteOperations;
                                        supports @Input() Density: 'console' | 'embedded' | 'compact' & @Output() ExpandRequested

packages/Angular/Explorer/dashboards  (WorkflowsDashboardsModule)               [LAYER 3 — Explorer App Host]
├── WorkflowsResourceComponent        — App route host switching Catalog ⇄ Create ⇄ In-App Studio (never ejects to AI Agents!)
├── WorkflowsDashboardComponent       — Surface 1 Catalog (Table/Cards, spark-barcode, real Trigger pills, 6-source popover)
├── CreateWorkflowComponent           — Surface 2 Split-Screen Live Compiler (Describe + Refine / Past-Run real projection / Blank)
├── WorkflowStudioComponent (NEW)     — Surface 3 Unified In-App Studio:
│   ├── StudioCanvasView              — Hosts upgraded <mj-flow-editor> + 4-tab WorkflowStepInspectorComponent
│   ├── WorkflowStepInspectorComponent (NEW) — Setup (mj-combobox, Loop form, Decision builder), Data Mapping ({{ var }} pills), Branching, Retry & Saga
│   ├── WorkflowStepTableComponent (NEW)     — High-density tabular step editor
│   └── WorkflowTriggersTabComponent (NEW)   — Cron + Entity Event authoring (WorkflowSpecSync) + <mj-agent-invocations> 6-source index
└── WorkflowRunsResourceComponent     — Surface 4 Runs Triage Hub (collapsible rail + Dual-Sync Canvas/Waterfall + full <mj-task-graph-debugger>)
```

### 4.2 Embedding Consistency Across MJ Hosts
1. **Workflows → Runs (`WorkflowRunsResourceComponent`):** Mounts `<mj-task-graph-debugger [Density]="'console'" [AllowRememberBreakpoints]="true">` inside a pure flex container (`flex: 1; min-height: 0`).
2. **AI Test Harness (`@memberjunction/ng-ai-test-harness`):** Mounts `<mj-task-graph-debugger [Density]="'console'" [RememberedStepIDs]="...">` with identical VCR, Replay Scrubber, and DevTools dock.
3. **Conversations Chat Right Rail (`@memberjunction/ng-conversations`):** Mounts `<mj-task-graph-debugger [Density]="'embedded'">` (360px card) alongside `<mj-workflow-plan-card>` whose `SaveAsWorkflowRequested` opens `CreateWorkflowComponent` pre-seeded with the drafted `TaskGraphSpec`.
4. **AI Agent Run Step Detail (`core-entity-forms`):** Mounts `<mj-task-graph-run-view [Density]="'compact'">` with fixed loop rendering, LR ports, and ghosted untaken paths.

---

## 5. State Management, `UserInfoEngine` Keys & TypeScript Contracts

### 5.1 `UserInfoEngine` Preference Keys (Zero `localStorage`)
All per-user workbench layout preferences persist via `UserInfoEngine.Instance.SetSettingDebounced(...)` to `MJ: User Settings`:

| Setting Key | Type / Values | Default | Scope |
|---|---|---|---|
| `mj.workflows.catalog.viewMode` | `'table' \| 'cards'` | `'table'` | Surface 1 Catalog |
| `mj.workflows.catalog.sortBy` | `'updated' \| 'runs' \| 'p50' \| 'name'` | `'updated'` | Surface 1 Catalog |
| `mj.workflows.studio.paletteCollapsed` | `boolean` | `false` | Surface 3 Studio |
| `mj.workflows.studio.layoutDirection` | `'LR' \| 'TB'` | `'LR'` | Surface 3 Studio |
| `mj.workflows.studio.inspectorWidthPx` | `number` (`300–480`) | `364` | Surface 3 Studio |
| `mj.workflowRuns.railCollapsed` | `boolean` | `false` | Surface 4 Runs |
| `mj.workflowRuns.waterfallSplitRatio` | `[number, number]` | `[54, 46]` | Surface 4 Runs |
| `mj.taskGraphDebugger.devToolsCollapsed` | `boolean` | `false` | Surface 5 Debugger |
| `mj.taskGraphDebugger.devToolsHeightPx` | `number` (`160–420`) | `232` | Surface 5 Debugger |
| `mj.taskGraphDebugger.showUntakenPaths` | `boolean` | `true` | Surface 5 Debugger |
| `TaskGraph.Breakpoints/<workflowAgentID>` | `string[]` (Step IDs) | `[]` | Remembered Breakpoints (existing convention) |

### 5.2 Type Safety & Entity Rules
- **Derive Status Unions:** Type all run/step status filters via `type WorkflowRunFilterStatus = 'All' | 'Waiting on Person' | MJTaskEntity['Status']` (never hand-copy `'Running'` or literal string unions).
- **UUID Equality:** Use `UUIDsEqual(a, b)` from `@memberjunction/global` for all `TaskID`, `StepID`, `AgentID`, and `ParentID` comparisons.
- **Direct SQL Freshness:** Pass `BypassCache: true` on all `RunView` queries against `MJ: Tasks` and `MJ: Task Dependencies` because the durable dispatcher updates rows via direct SQL.
- **No `any` / No `.Get()`/`.Set()`:** Use strongly-typed `MJAIAgentEntity`, `MJAIAgentStepEntity`, `MJAIAgentStepPathEntity`, `MJTaskEntity`, and `MJTaskDependencyEntity` properties exclusively.

---

## 6. Agent Client Tools & Context Publishing

To make Option A seamlessly co-piloted by MemberJunction's Explorer AI Assistant:

### 6.1 Published Context (`publishAgentContext`)
- **Catalog / Studio Context:** `{ activeSurface, selectedWorkflowId, selectedWorkflowName, activeStudioTab, selectedStepId, validationErrorCount, waitingOnPersonCount, runningCount }` (fixing `runningCount` to count `Status === 'In Progress'`).
- **Runs / Debugger Context:** `{ selectedRunId, selectedRunStatus, pausedAtStepId, heldPathCount, armedBreakpointStepIds, activeDevToolsTab, blastRadiusStepId }`.

### 6.2 Client Tools Registered
| Tool Name | Surface | Behavior & Bug Fixes |
|---|---|---|
| `OpenCreateWorkflow` | Catalog | Opens Surface 2 Create Split-Screen optionally pre-filled with a prompt or starter recipe |
| `OpenWorkflow(name)` | Catalog | Opens Surface 3 **In-App Studio** (replaces legacy `OpenEntityRecord('MJ: AI Agents')`) |
| `SelectStudioStep(stepName)` | Studio | Focuses step on canvas and opens its Inspector tab |
| `FilterWorkflowRunsByStatus(status)` | Runs | Maps `'Running'` → `'In Progress'` cleanly and refreshes visible rail |
| `SelectWorkflowRun(runIdOrName)` | Runs | **Fixes stale-panel bug:** sets `SelectedRunID` AND awaits `loadSteps()` + `loadDebugState()` |
| `DebugInspectStep(stepName, tab)` | Debugger | Focuses step on canvas and switches DevTools dock to `diff` / `verdicts` / `intervene` / `frames` |
| `PreviewFailureBlastRadius(stepName)` | Debugger | Computes `ComputeTasksToBlock(stepId)` and toggles visual canvas blast-radius overlay |

---

## 7. Keyboard Shortcuts Matrix

| Shortcut | Surface | Action |
|---|---|---|
| `⌘K` | Global / Studio | Focus Workflow/Run jumper or Step Palette search |
| `⌘S` | Studio | Save workflow + reconcile triggers via `Workflow.Save` |
| `⌘↵` | Create | Compile natural-language prompt into live draft preview (`Workflow.Draft`) |
| `F5` | Debugger | `Continue` — resume execution until next breakpoint or settle |
| `Shift+F5` | Debugger | `Stop` — cancel active run |
| `F10` | Debugger | `Step Next` — execute one eligible step (`Step('one')`) |
| `F11` | Debugger | `Step Wave` — execute full parallel frontier (`Step('wave')`) |
| `Space + Drag` | Canvas | Pan canvas smoothly without switching toolbar modes |
| `[` / `]` | Studio / Runs | Collapse/expand left Step Palette or Run Rail |

---

## 8. Phased Implementation Plan

1. **Phase 1 — Token & Canvas Foundation (`@memberjunction/ng-flow-editor` + `@memberjunction/ng-task-graph-editor`):**
   - Replace all dead `--mj-*` tokens and hardcoded light hex colors in toolbar, status bar, nodes, and Workflows CSS.
   - Fix `isLoopNode` (`'ForEachTask' | 'WhileTask'`), pass full 8-kind `NodeTypes`, fix `.mj-flow-node-label` skipped strikethrough, adapt ports to LR/TB, replace CommonJS Dagre `require` with static ESM import, render `NodeProgress` on running cards, and keep ghosted untaken paths.
2. **Phase 2 — Catalog & Create Split-Screen Compiler (`WorkflowsDashboardsModule`):**
   - Upgrade `WorkflowsDashboardComponent` with Linear Table + Cards `<mj-view-toggle>`, real Trigger pills + 6-source popover, step-chain micro-topology, and 10-run spark-barcode.
   - Upgrade `CreateWorkflowComponent` into the Split-Screen Live Compiler with starter chips, iterative refinement, real `PastRun` projection preview, and zero DB writes until approval.
3. **Phase 3 — Unified In-App Workflow Studio:**
   - Build `WorkflowStudioComponent` (`Canvas | Step Table | Triggers | Runs`), 4-tab `WorkflowStepInspectorComponent` (searchable comboboxes, `{{ var }}` pill Data Mapping, structured Loop/Decision builders, Saga Rollback picker), and `WorkflowTriggersTabComponent` (`WorkflowSpecSync` + `<mj-agent-invocations>`).
   - Route Catalog row clicks into In-App Studio instead of ejecting to `MJ: AI Agents`.
4. **Phase 4 — Dual-Sync Runs Triage Hub & Generic Debugger:**
   - Fix `.wfr-graph-pane` flex clipping, `'In Progress'` filter mapping, and `SelectWorkflowRun` tool reload.
   - Ship collapsible Run Rail + Dual-Sync `TaskGraphWaterfallComponent`, DAG-native VCR bar (`Step(taskID)`, Engine Pulse, Remembered Breakpoints, visual Blast Radius), `TaskGraphReplayScrubberComponent`, `TaskGraphDevToolsDockComponent`, and `Density="embedded"` 360px mode for Conversations & AI Test Harness.
