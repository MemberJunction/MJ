# Option B — Spatial Infinite Studio & Direct-on-Canvas X-Ray Debugger
## Comprehensive Architectural & UX Specification

> **Prototype:** [`mockups/option-b-spatial-xray-studio.html`](mockups/option-b-spatial-xray-studio.html)  
> **Reference Audit:** [`study-and-brief.md`](study-and-brief.md)  
> **Design Archetype:** n8n 2.0 + Figma + Stripe Workbench + Apple/Raycast Spatial UI, natively themed with authentic MemberJunction `--mj-*` Light & Dark design tokens and Explorer `<mj-page-layout>` chrome.

---

## 1. Design Thesis, Audience Fit & Tradeoffs

### Core Thesis: **The Canvas IS the Product**
MemberJunction already possesses a Temporal-grade durable execution engine (`@memberjunction/task-graph`), 14 real-time GraphQL frame types, AI Decision routing with confidence gating, Saga rollback compensation, security taint tracking, and bidirectional trigger reconciliation (`WorkflowSpecSync`).

Option B eliminates the triple-splitter cramping, buried raw-JSON sidebars, and context-ejecting entity forms diagnosed in `study-and-brief.md` by bringing **spatial storytelling and direct-on-canvas control** to the foreground across all five surfaces:

1. **Spatial Topology at Every Scale:** Even in the Workflows Catalog (Surface 1), users recognize workflows by their actual visual shape (linear chain, enclosed parallel loop, AI decision fork, Person approval gate, rollback saga arc) via live miniature SVG blueprints.
2. **Direct Manipulation Over Form Drilling:** Triggers live as first-class cards at the left edge of the canvas; `+` handles live directly on step ports and path midpoints; loops render as **physical sub-canvas enclosure frames** containing their child steps; and runtime debugging happens directly on the pathway cards via **X-Ray Mode** and **Direct-on-Path Gate Controls**.
3. **Frosted Translucent HUDs Maximize Viewport:** Instead of static 3-column splitters stealing 64% of a 1440px viewport, secondary controls (Run Switcher, Contextual Inspector, Spatial Zoom/Layout HUD, Time-Machine VCR Dock) float over the infinite canvas and collapse to slim glassmorphic pills—keeping **90%+ of screen real estate** focused on the live workflow.

### Best For & Key Tradeoffs
- **Best For:** Visual thinkers, product builders, operations leads, and mixed technical/business teams who want complex workflows (parallel loops, AI confidence gates, human approvals, saga rollbacks) to be immediately legible from 10 feet away and effortless to manipulate directly.
- **Primary Tradeoff:** Prioritizes spatial comprehension and on-canvas direct manipulation over dense multi-row spreadsheet comparison.
- **Built-In Mitigations:**
  - Surface 1 includes an `<mj-view-toggle>` between **Blueprint Cards** and **Compact List** table.
  - Surface 3's floating **Contextual Popover Inspector** can be pinned into a classic docked right sheet (`Pin Sheet` toggle, persisted via `UserInfoEngine`).
  - Surface 4 provides a full **Timeline Triage** list before entering the **Full-Bleed Spatial Flight Deck**, plus a slide-over floating **Run Switcher Drawer**.
  - Surface 5 (`<mj-task-graph-debugger>`) adapts automatically to **360px Embedded Density** inside Conversations and AI Test Harness using vertical compact pathway cards.

---

## 2. Non-Negotiable House Rules & Bug-Fix Matrix

Option B directly resolves every defect cataloged in `study-and-brief.md` §2–§4:

| House Rule / Audit Defect | Option B Resolution |
|---|---|
| **D18 Vocabulary Law** | 100% of end-user copy uses **Workflow**, **Step**, **Path**, **Trigger**, **Run**, **Person step**. Zero occurrences of *Flow Agent*, *DAG*, *Graph*, *Node*, or *Edge* in user-facing labels, status bars, or tooltips. |
| **Dead-Token Collapse** | Eradicates all hallucinated `--mj-color-primary`, `--mj-bg-hover`, `--mj-font-size-*`, `--mj-text-tertiary`, `--mj-space-sm` variables and hardcoded `#ffffff`/`#f8fafc` hex in `flow-toolbar` / `flow-status-bar`. Exclusively uses verbatim `--mj-*` tokens from `_tokens.scss` in both Light (`:root`) and Dark (`[data-theme="dark"]`) themes. |
| **No Ejection to AI Agents Form** | Clicking a workflow opens `WorkflowStudioComponent` **inside `WorkflowsDashboardsModule`**. An optional secondary link (`Advanced Record`) exists for admins only. |
| **Single Substrate (`WorkflowSpecSync`)** | Zero new database tables. Workflows map to Flow `MJ: AI Agents` + `AIAgentStep` / `AIAgentStepPath`; Triggers reconcile to `MJ: Scheduled Jobs` & `MJ: Entity Actions`; Runs read live `MJ: Tasks` (`BypassCache: true`) + `MJ: Task Dependencies`. |
| **"Nothing Saved Until Approved"** | Surface 2 previews AI-drafted and past-run-promoted workflows live on the spatial stage. `Workflow.Save` (`status: 'Draft'`, `triggers: []`) fires **only** on clicking **Approve & Enter Studio**. |
| **Past-Run `SourceRunID` Bug** | Surface 2 queries real child task counts (`StepCount`), populates `WaitingNote` for unsettled runs, projects the settled run's actual tasks & dependencies onto the preview stage, and passes the projected `TaskGraphSpec` to `Workflow.Save`. |
| **Broken Loop Rendering (`ForEachTask`/`WhileTask`)** | Upgrades `FlowNodeComponent.isLoopNode` and introduces `FlowEnclosureComponent` in `@memberjunction/ng-flow-editor` to recognize both `'ForEach'|'While'` and `'ForEachTask'|'WhileTask'`, rendering true enclosed loop frames. |
| **LR Port Geometry Mismatch** | `FlowLayoutService` (upgraded to static ESM `@dagrejs/dagre` import) coordinates port orientation dynamically: `left`/`right` in `LR` mode, `top`/`bottom` in `TB` mode. |
| **Multi-Port Decision Splits** | Extends `FlowNodeComponent` to render N named output ports (e.g., `Auto-Approve ≥80%`, `Manual Review 50–79%`, `Reject <50%`) instead of `.find(p => p.Direction === 'output')`. |
| **Skipped ≠ Failed & Never Delete Untaken Paths** | Fixes `task-graph-canvas-adapter.ts:449` to preserve untaken edges as muted ghosted dashed paths with neutral `✕ Skipped` pills, and fixes `.mj-flow-node-label` strikethrough targeting. |
| **Unmistakable Operator Overrides** | `OverrideEdge` paths render with amber dotted strokes (`stroke-dasharray="3 4"`) + `✋ Forced Yes` / `✋ Forced No` pills, even when downstream skipping cascades. |
| **`.wfr-graph-pane` Flex Clipping & `'Running'` Filter Bug** | Replaces block layout with proper flex column + floating bottom Time-Machine dock; maps the "In Progress" filter accurately to `MJ: Tasks.Status = 'In Progress'` and adds explicit `Held / Waiting on Person` filter grouping. |

---

## 3. Surface-by-Surface UX & Interaction Architecture

### Surface 1 — Workflows Catalog (Visual Blueprint Gallery)
- **Chrome:** Authentic `<mj-page-layout>` → `<mj-page-header>` (`[meta]`, `[actions]`, `[toolbar]`) → `<mj-page-body>`.
  - `[meta]`: Dynamic `X of Y workflows` badge (never bare `.length`) + clickable live operational pill (`● 2 running · 1 waiting on Person` → routes directly to Runs filtered to active/attention).
  - `[actions]`: `Refresh` (secondary) + `+ Create Workflow` (rightmost primary `mjButton`).
  - `[toolbar]`: `<mj-page-search>` + `<mj-filter-popover>` (`Status`, `Trigger Type`, `Spatial Capabilities: Person Approval / Loops / Rollback Saga`) + `<mj-view-toggle>` (`Blueprints` | `Compact List`).
- **Visual Blueprint Cards:**
  - Top 146px **Miniature Spatial Blueprint Stage** on a subtle token-driven dot grid rendering an auto-generated simplified SVG topology from the workflow's `AIAgentStep` / `AIAgentStepPath` records (visually distinguishing triggers, enclosed dashed loop containers, diamond AI Decisions, amber Person gates, and dashed rollback arcs).
  - Hover action bar fades up cleanly from the bottom-right of the stage: **`▶ Run`**, **`☢ X-Ray`**, **`Open Studio`**.
  - Card body: `MJAIAgentEntity.IconClass` squircle, title, 2-line description, real Status pill, **reconciled Trigger pill** (real cron schedule or Entity Event from `WorkflowSpecSync` + `<mj-agent-invocations>`, falling back to `On demand` only when genuinely unscheduled), and circular SVG **Health Ring** (`96% · 4.1s avg` computed from recent root `MJ: Tasks`).

### Surface 2 — Create Workflow (Spatial Prompt-to-Canvas Stage)
- **Full-Bleed Dotted Stage:** Eliminates the cramped left-aligned HTML form in favor of a live spatial preview canvas.
- **Floating Glassmorphic Composer Dock:**
  - Starts centered over the empty dotted stage with 3 mode pills: **`Describe with AI`**, **`Promote a Past Run`**, and **`Blank Stage`**.
  - **Describe with AI:** Natural-language prompt box + 4 tactile **Starter Recipe Cards** (*Invoice Gate & Saga*, *Schema Docs Sweep*, *Content Polish Loop*, *Lead AI Triage*). Submitting runs `Workflow.Draft` (`WorkflowDraftOperation`) without saving to DB.
  - **Promote a Past Run:** Displays terminal & active root `MJ: Tasks` with **actual child step counts**, duration, status badge, and explicit disabled `WaitingNote` on in-progress runs. Selecting a settled run projects its real tasks & dependencies onto the spatial canvas.
  - **Blank Stage:** Places a single `On Demand Trigger` root card on the stage ready to enter Studio.
- **Iterative Spatial Preview & Honest Approval Gate:**
  - Once drafted, the Composer Dock docks cleanly to the bottom edge as a **Conversational AI Refinement Bar** with 1-click refinement chips (*"Add a Person approval before publishing"*, *"Add automatic rollback on payment error"*, *"Wrap enrichment in a Parallel ForEach loop"*).
  - An **AI Reasoning Glass Pill** floats at top-center explaining `Workflow.Draft`'s structural choices.
  - Clicking any drafted step opens a lightweight **Quick-Tweak Popover** (rename or remove step directly on canvas).
  - A persistent amber notice confirms *"Preview only — nothing saved until you click Approve & Enter Studio"*. Clicking **Approve & Enter Studio** calls `Workflow.Save` (`status: 'Draft'`, `triggers: []`) and opens Surface 3 in-app.

### Surface 3 — In-App Workflow Studio (Zero-Clutter Infinite Canvas)
- **Sleek 52px Studio Header:** `← Workflows` · Editable Workflow switcher/title · Active/Draft pill · Trigger summary pill · Mode switcher (`Canvas` | `Triggers (N)` | `Runs (N)`) · Live `CheckFlowRun()` validation badge (`✓ Valid · 0 issues`) · `Save` (`⌘S`) · `Test & X-Ray`.
- **Direct-on-Canvas Spatial Primitives:**
  - **Trigger Root Cards (Far Left):** Visual entry cards (`⚡ Trigger: On Record Save (Orders)`) showing active filter + `+2 entry points` badge, plus a dashed `+ Add Trigger or Schedule` card right underneath. Clicking opens the translucent **6-Source Trigger & Invocation Drawer** uniting `WorkflowSpecSync` authoring (Schedules + Entity Events) with `<mj-agent-invocations>` read-only visibility (User Routines, Record Processes, Parent Workflows, Exposed as Action).
  - **True Spatial Loop Enclosures:** `ForEach` and `While` render as dashed translucent sub-canvas container frames (`--enclosure-bg` / `--mj-brand-tertiary`) with floating header pills (`ForEach line item · Parallel ×4`) and footer expression readouts (`Collection: {{ trigger.order.items }}`) physically enclosing their inner child steps and internal paths.
  - **Multi-Port AI Decision Cards:** Dedicated violet-accented decision cards with confidence threshold badge (`≥ 80%`) and individual right-edge output ports per choice (`Auto-Approve`, `Manual Review`, `Reject Order`), eliminating single-port crossing spaghetti.
  - **Inline `+` Quick-Add Affordances:** Every step's output port AND every path midpoint renders a tactile `+` handle that opens a floating **Quick-Insert Step Popover** covering all 7 step kinds (`Action`, `Agent`, `Prompt`, `AI Decision`, `Person Approval`, `ForEach Loop`, `While Loop`) right at cursor position.
  - **Direct Pan & Adaptive Orientation:** Native click-drag panning on empty canvas (no toolbar pan-mode toggle needed!) + bottom-left **Spatial HUD** (`- / 100% / +`, `Fit`, **`LR ⇄ TB`** layout reflow with matching port swap, floating **Minimap**, dynamic Dark/Light-native **Legend**).
- **Contextual Floating Popover Inspector:**
  - Anchored floating panel on the right (pinnable into a full-height sheet) with 3 crisp tabs:
    1. **Configure:** Step title, **searchable Action/Prompt/Agent combobox** (replacing raw `<select>`), AI Decision confidence threshold slider, Loop concurrency controls, and clickable upstream output chips.
    2. **Data Mapping:** Structured key/value rows populated by clicking visual **`{{ trigger.order.id }}`** upstream pills—eliminating raw JSON editing for 95% of authoring tasks (with optional "View Raw JSON" disclosure for power users).
    3. **Error & Rollback (Saga):** Toggle to attach a **Saga Compensation** undo action (`CompensatesTaskID`), searchable rollback action picker, and rollback failure policy (`Escalate to Person` / `Halt Saga` / `Continue`).

### Surface 4 — Workflow Runs (Spatial Flight Deck + Slide-Over Run Switcher)
- **Timeline Triage Entry:**
  - `<mj-page-header>` with accurate status pills (`All`, `In Progress`, `Held / Needs Person`, `Complete`, `Failed`, `Cancelled`) fixing the `'Running'` mismatch bug.
  - **Needs Attention Strip** (conditionally rendered only when actionable runs exist): high-signal amber cards for runs paused at a **Person step** or **Held path** with 1-click **`Decide on Canvas →`** / **`Review & Approve →`** CTAs.
  - **Visual Run Timeline Cards:** Workflow squircle, trigger source, color-coded **Step-Segment Progress Bar** (`complete` / `running` / `held` / `skipped` / `failed`), duration, and `Flight Deck →`.
- **Full-Bleed Spatial Flight Deck:**
  - Clicking any run transitions smoothly into a full-bleed canvas hosting `<mj-task-graph-debugger>` across 90%+ of the viewport.
  - **Collapsible Floating Top-Left Run Switcher Drawer:** Starts collapsed to a compact frosted pill (`● Run Switcher · 6 runs ▾`) and expands smoothly on click to switch runs without leaving the Flight Deck.

### Surface 5 — Generic `<mj-task-graph-debugger>` (X-Ray Canvas & Time-Machine)
- **Interactive X-Ray Mode (`⚡ X-Ray Mode: ON/OFF`, hotkey `X`):**
  - **OFF:** Clean, scannable runtime topology with status rings, duration pills, live `NodeProgress` bars on running steps, security taint shields, and breakpoint gutters.
  - **ON:** Every step card smoothly expands inline directly on the canvas to display:
    - Live **Input → Output key/value diffs** (changed keys highlighted in `--mj-brand-tertiary`).
    - **AI Decision Confidence Meters** with threshold marker lines (`Manual Review: 62%` vs `80%` vertical tick).
    - **Security Taint / Person Verified Shields** (`⚠ Untrusted Input Taint` propagating from external webhooks/searches → cleared by `🛡 Person Verified · Clears Taint` on Person steps).
    - **Live `NodeProgress` Streaming Bar** (wired directly from `LiveActivity` map in `TaskGraphRunViewComponent`!).
    - **Direct Inline Intervention Pills:** `[▶ Run This Step]` (unlocks backend's hidden `Step(taskID)`!), `[✎ Edit & Retry]`, `[✓ Force Complete]` (with confirmation modal).
- **Direct-on-Path Gate Controls & Failure Superpowers:**
  - **Held Path Inline Resolution:** Pulsing amber pill directly on the held path (`⏸ Held (62%) [Answer Yes] [Answer No]`). Answering immediately transitions the wire to an unmistakable **Operator-Forced Path** (amber dotted stroke + `✋ Forced Yes` badge + `Reset` button).
  - **Ghosted Untaken Paths:** Skipped branches remain visible as muted dashed lines with neutral `✕ Skipped (9%)` pills.
  - **Visual Blast-Radius Toggle (`☢ Blast Radius`):** Projects `ComputeTasksToBlock` directly onto the canvas, illuminating threatened downstream steps and paths in pulsing crimson dashed outlines.
  - **Reverse Saga Rollback Arcs (`↺ Saga Rollback Arcs`):** Renders curved amber dashed arcs from forward steps back to the steps they compensate (`CompensatesTaskID`), showing exact undo order.
  - **Node-Gutter Breakpoints:** Clicking the left gutter dot cycles `None` → `● Single-Run Breakpoint` → `◎ Remembered Breakpoint` (`TaskGraph.Breakpoints/<workflowAgentID>`), enabling remembered breakpoints in both Workflows Runs and Test Harness.
- **Floating Apple-Style Time-Machine Dock (Bottom Center):**
  - **DAG-Native VCR Controls:** `▶ Continue (F5)` · `⏭ Step Next (F10)` · `⇶ Step Wave (F11)` · `⏸ Pause` · `⏹ Stop (⇧F5)` (eliminates confusing "Over"/"Into").
  - **Interactive Time-Travel Scrubber:** Play/Pause replay button, live timestamp (`00:02.9 / 4.1s`), and range scrubber annotated with color-coded step-completion dots—scrubbing updates every step card, progress bar, and X-Ray preview in real time via `ReplayAt`.
  - **Engine Pulse Pill** (`#418 · 3/5`) + **Armed Breakpoints Pill** (`2 armed`) with popover details.
- **Adaptive Embedded 360px Mode (`Density="auto" | "full" | "embedded"`):**
  - Automatically switches from infinite horizontal canvas to a crisp vertical compact pathway card stack with compact VCR controls and inline Held-path buttons when hosted inside a 360px Conversation right-rail or AI Test Harness pane—with an expand button (`@Output() ExpandRequested`) so hosts can navigate cleanly without violating L1/L2 Router isolation.

---

## 4. Mapping to MemberJunction Packages & Component Hierarchy

Strict compliance with [`guides/UI_LAYERING_GUIDE.md`](../../../guides/UI_LAYERING_GUIDE.md): generic packages (`@memberjunction/ng-flow-editor`, `@memberjunction/ng-task-graph-editor`) NEVER import `@angular/router` or `NavigationService`.

```text
packages/Angular/Generic/flow-editor (@memberjunction/ng-flow-editor)  [L0 Canvas Primitives]
├── FlowEditorComponent                  ← Upgraded: direct drag-pan, LR⇄TB port sync, dark/light tokens
├── FlowNodeComponent                    ← Upgraded: squircle anatomy, multi-port output array,
│                                          bp gutter slot, progress bar slot, X-Ray content projection
├── FlowEnclosureComponent (NEW)         ← True spatial Loop container frame (ForEach/While/ForEachTask/WhileTask)
├── FlowEdgeOverlayComponent (NEW)       ← Midpoint + quick-add handle & direct-on-path interactive pill slot
├── FlowQuickInsertPopoverComponent (NEW)← Floating 7-kind step insertion menu anchored to ports/paths
├── FlowSpatialHudComponent (NEW)        ← Replaces light-only FlowToolbar/StatusBar (Zoom, Fit, LR⇄TB, Minimap, Legend)
└── FlowLayoutService                    ← Upgraded: static ESM import of @dagrejs/dagre + enclosure bounding boxes

packages/Angular/Generic/task-graph-editor (@memberjunction/ng-task-graph-editor)  [L1 Paint + L2 Session]
├── [L1] TaskGraphCanvasAdapter          ← Fixed: pass all 8 step kinds, preserve ghosted skipped paths,
│                                          emit LiveActivity NodeProgress, Taint, Decision confidence, Saga arcs
├── [L1] TaskGraphRunViewComponent       ← Upgraded: X-Ray Mode toggle, Blast Radius overlay, Saga arcs,
│                                          direct-on-path Held/Forced pills, adaptive 'full' vs 'embedded' (360px) density
├── [L1] TaskGraphTimeMachineComponent   ← Replaces TaskGraphDebugToolbar: DAG-native VCR + Time-Travel Scrubber
│                                          + Engine Pulse + Armed Breakpoints pills
├── [L1] TaskGraphEditorComponent        ← Upgraded: all 7 authorable step kinds + visual data-mapping inspector
└── [L2] TaskGraphDebuggerComponent      ← Drop-in wrapper ([ParentTaskID], [Density], [AllowRememberBreakpoints]=true);
                                           owns GraphQL TaskGraphFrames + all 10 TaskGraph.* RouteOperations
                                           including Step(taskID); emits @Output() ExpandRequested / OpenStudioRequested

packages/Angular/Explorer/dashboards (WorkflowsDashboardsModule)  [L3 Explorer App]
├── WorkflowsResourceComponent           ← App shell nav shim ('Workflows')
├── WorkflowsDashboardComponent          ← Surface 1: Blueprint Gallery + Compact List + mini SVG topology renderer
│                                          (reads WorkflowSpecSync triggers & MJ: Tasks health telemetry)
├── CreateWorkflowComponent              ← Surface 2: Full-stage Spatial Composer + live TaskGraphRunView preview
│                                          + fixed Past-Run SourceRunID projection + AI refinement bar
├── WorkflowStudioComponent (NEW)        ← Surface 3: In-App Studio wrapping upgraded flow-editor + Trigger Root cards
│                                          + Floating/Pinnable Contextual Inspector + <mj-agent-invocations> overlay
└── WorkflowRunsResourceComponent        ← Surface 4: Needs Attention Strip + Visual Run Timeline + Full-Bleed Flight Deck
                                           with floating collapsible Run Switcher Drawer wrapping <mj-task-graph-debugger>
```

### Cross-Package Reuses
- **`@memberjunction/ng-agents`**: Embed `<mj-agent-invocations>` directly inside `WorkflowStudioComponent`'s Triggers & Entry Points overlay for the 6-source inverse index.
- **`@memberjunction/ng-conversations`**: Wire `<mj-workflow-plan-card>`'s `SaveAsWorkflowRequested` output to navigate to Workflows → Create Workflow (Surface 2) pre-seeded with the conversational draft.
- **`@memberjunction/ng-ai-test-harness`**: Inherits X-Ray Mode, Time-Machine Dock, `Step(taskID)`, and Remembered Breakpoints automatically via `<mj-task-graph-debugger [Density]="'auto'">`.

---

## 5. Persistent Preferences via `UserInfoEngine` (Zero `localStorage`)

All spatial and UI preferences persist per-user in `MJ: User Settings` via `UserInfoEngine.Instance.GetSetting()` / `SetSettingDebounced()`:

| Setting Key | Type / Values | Default | Surface |
|---|---|---|---|
| `mj.workflows.catalog.viewMode` | `'blueprints' \| 'compact'` | `'blueprints'` | Surface 1 |
| `mj.workflows.catalog.filters` | JSON `{ status, trigger, cap }` | `{ all, all, all }` | Surface 1 |
| `mj.workflows.studio.layoutDirection` | `'LR' \| 'TB'` | `'LR'` | Surface 3 |
| `mj.workflows.studio.inspectorPinned` | `'true' \| 'false'` | `'false'` | Surface 3 |
| `mj.workflows.studio.minimapVisible` | `'true' \| 'false'` | `'false'` | Surface 3 |
| `mj.workflows.runs.switcherCollapsed` | `'true' \| 'false'` | `'true'` | Surface 4 |
| `mj.workflows.runs.statusFilter` | `'all' \| 'In Progress' \| 'Held' \| 'Complete' \| 'Failed' \| 'Cancelled'` | `'all'` | Surface 4 |
| `mj.taskGraph.debugger.xrayEnabled` | `'true' \| 'false'` | `'true'` | Surface 5 |
| `mj.taskGraph.debugger.showSagaArcs` | `'true' \| 'false'` | `'true'` | Surface 5 |
| `mj.taskGraph.debugger.dimUntakenPaths` | `'true' \| 'false'` | `'true'` | Surface 5 |
| `TaskGraph.Breakpoints/<workflowAgentID>` | JSON `string[]` (existing key) | `[]` | Surfaces 3 & 5 |

---

## 6. Skip / AI Agent Context & Client Tools

Each Explorer surface publishes structured context (strictly deriving unions from generated entity types like `MJTaskEntity['Status']`) and registers safe Client Tools:

- **Surface 1 (`WorkflowsDashboardComponent`):**
  - Context: `{ totalWorkflows, filteredCount, viewMode, activeRunCount, attentionCount, workflows: [{ id, name, status, triggerSummary, healthPct }] }`
  - Tools: `OpenCreateWorkflow(mode?, initialPrompt?)`, `OpenWorkflowInStudio(nameOrId)`, `FilterWorkflows(status?, triggerType?, capability?)`.
- **Surface 2 (`CreateWorkflowComponent`):**
  - Context: `{ mode, draftName, hasPreview, isSaved: false, stepCount, aiReasoning }`
  - Tools: `DraftWorkflowFromPrompt(prompt)`, `RefineDraftedWorkflow(instruction)` (mutates preview only; never auto-saves without explicit user confirmation).
- **Surface 3 (`WorkflowStudioComponent`):**
  - Context: `{ workflowId, name, status, layoutDirection, selectedStepId, validationIssues, triggerCount }`
  - Tools: `FocusStepOnCanvas(stepName)`, `ToggleStudioLayout(direction)`, `OpenTriggersPanel()`.
- **Surface 4 & 5 (`WorkflowRunsResourceComponent`):**
  - Context: `{ totalRuns, inProgressCount, heldCount, selectedRunId, xrayEnabled, blastRadiusEnabled, scrubPercent }`
  - Tools: `FilterWorkflowRunsByStatus(status)` (fixed to match `'In Progress'` & `'Held'`), `SearchWorkflowRuns(query)`, **`SelectWorkflowRun(runId)`** (fixed to invoke `loadSteps()` + `loadDebugState()` + transition into Flight Deck!), `ToggleXRayMode(enabled)`, `HighlightBlastRadius(stepName)`, `RefreshWorkflowRuns()`.

---

## 7. Phased Implementation Roadmap

1. **Phase 1 — Token Hygiene & Canvas Bug Fixes (Low Risk, Immediate Visual Lift):**
   - Replace all dead `--mj-*` tokens across `Workflows`, `ng-task-graph-editor`, and `ng-flow-editor`; theme `FlowSpatialHudComponent` natively for Light & Dark.
   - Fix `isLoopNode` for `ForEachTask`/`WhileTask`, pass all 8 `NodeTypes` through `TaskGraphEditorComponent`, fix `.mj-flow-node-label` skipped strikethrough, preserve ghosted skipped paths in `SpecToConnections`, convert `FlowLayoutService` to static ESM Dagre import with `LR ⇄ TB` dynamic port sides.
   - Fix `.wfr-graph-pane` flex clipping, `'Running'` → `'In Progress'` filter bug, `SelectWorkflowRun` agent tool reload bug, and `CreateWorkflow` `SourceRunID` passthrough.
2. **Phase 2 — Catalog Blueprint Gallery & Honest Spatial Creation (Surfaces 1 & 2):**
   - Ship `BlueprintMiniTopologyComponent` (SVG generator), real trigger & health telemetry queries, `<mj-page-header>` chrome upgrade, and the live Spatial Preview Stage for AI Drafting & Past-Run Promotion.
3. **Phase 3 — Unified In-App Workflow Studio (Surface 3):**
   - Build `WorkflowStudioComponent` inside `WorkflowsDashboardsModule` with Trigger Root cards (`WorkflowSpecSync` + `<mj-agent-invocations>`), `FlowEnclosureComponent` for `ForEach`/`While`, multi-port AI Decision cards, `+` Quick-Insert Popover, and Floating/Pinnable Visual Data-Mapping & Saga Compensation Inspector.
4. **Phase 4 — X-Ray Mode, Time-Machine Dock & Embedded 360px Density (Surfaces 4 & 5):**
   - Upgrade `<mj-task-graph-debugger>` with X-Ray inline expansion (`NodeProgress`, Decision confidence meters, Taint shields, inline `Step(taskID)` / `Edit & Retry` / `Force Complete`), direct-on-path Held/Forced controls, Blast-Radius crimson overlay, Saga rollback arcs, Remembered Breakpoints on gutters, Floating Time-Machine Scrubber, and responsive 360px Embedded Density across Conversations and AI Test Harness.
