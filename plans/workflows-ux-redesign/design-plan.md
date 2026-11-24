# Locked Spatial-First Hybrid Redesign — Engineering & DRY Architecture Plan

> **Master Prototype:** [`mockups/locked-hybrid-master.html`](mockups/locked-hybrid-master.html)
> **Forensic Baseline:** [`study-and-brief.md`](study-and-brief.md)
> **Worktree:** `/Users/amith/Dropbox/develop/M5/MJ-worktrees/workflows-ux`
> **Composition:** Option B Spatial Spine (~65%) + Option C Dual-Lens Playbook & Co-Pilot Transplants (~20%) + Option A Ops Table, Waterfall & Payload Diff (~15%)

---

## 1. DRY Architecture Principle — Upgrade Shared Primitives Once, Every Consumer Inherits

MemberJunction mounts the same visual flow and task-graph components across **5 distinct hosts**:
1. **Workflows Explorer App** (`packages/Angular/Explorer/dashboards/src/Workflows/**`)
2. **Flow Agent Entity Form** (`packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/FlowAgentType/flow-agent-form-section.component.html` → `<mj-flow-agent-editor>`)
3. **AI Test Harness** (`packages/Angular/Generic/ai-test-harness/src/lib/ai-test-harness.component.html` → `<mj-task-graph-debugger>`)
4. **AI Agent Run Step Detail** (`packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run-step-detail.component.html` → `<mj-task-graph-run-view>` & `<mj-task-graph-editor [ReadOnly]="true">`)
5. **Conversations Chat Right Rail & Plan Card** (`packages/Angular/Generic/conversations/src/lib/components/**` → `<mj-task-graph-run-view>` & `<mj-task-graph-editor>`)

Every `@Input()` and `@Output()` on existing shared components stays **100% backward-compatible**. All new features are additive and automatically benefit every host.

---

## 2. Component-by-Component DRY Injection Map

### Phase 2 — `@memberjunction/ng-flow-editor` (`packages/Angular/Generic/flow-editor`)

| File | Exact Changes |
|---|---|
| `src/lib/interfaces/flow-types.ts` | Extend `FlowNode` / `FlowNodePort` / `FlowConnection` with optional additive metadata (`Breakpoint?: 'single' \| 'remembered' \| null`, `ProgressPercent?: number`, `ProgressMessage?: string`, `XRayItems?: Array<{ Key: string; Value: string; Changed?: boolean }>`, `Confidence?: { Score: number; Threshold?: number }`, `TaintState?: 'tainted' \| 'verified' \| null`, `SagaCompensationLabel?: string`, `BlastRadius?: boolean`, `CanStepSingle?: boolean`, `Untaken?: boolean`, `ForcedVerdict?: 'true' \| 'false' \| null`) while keeping 100% existing properties untouched. |
| `src/lib/services/flow-layout.service.ts` | Replace CommonJS `require('@dagrejs/dagre')` with static top-level ESM `import dagre from '@dagrejs/dagre'`. |
| `src/lib/components/flow-node.component.{ts,html,css}` | Fix `isLoopNode` to recognize `'ForEach' \| 'While' \| 'ForEachTask' \| 'WhileTask'`. Fix `.mj-flow-node-body--skipped .mj-flow-node-label` strikethrough selector. Support multi-output ports (`outputPorts` array) while keeping `outputPort` getter back-compat. Modernize anatomy: squircle icon badge, optional left-gutter breakpoint dot (solid red single-run vs hollow ring remembered), live `NodeProgress` bar & status line, X-Ray expandable telemetry slot (I/O preview, Decision confidence bar, Taint/Verified shield, Saga undo badge, inline `▶ Run Step` button), `+` quick-add port button (`QuickAddClicked`, `BreakpointClicked`, `RunStepClicked` outputs). Purge all dead tokens (`--mj-status-error-subtle`, `--mj-brand-primary-subtle`) & hardcoded hex. |
| `src/lib/components/flow-toolbar.component.ts` | Replace all hardcoded `#ffffff`/`#e2e8f0`/`#f1f5f9` hex with semantic `--mj-*` tokens. Add `LayoutDirection` (`'horizontal' \| 'vertical'`) input + `LayoutDirectionToggled` (`LR ⇄ TB`) button. |
| `src/lib/components/flow-status-bar.component.ts` | Replace hardcoded `#f8fafc`/`#e2e8f0` hex with semantic `--mj-*` tokens. Enforce D18 vocabulary (`steps` / `paths` instead of `nodes` / `connections`). |
| `src/lib/components/flow-editor.component.{ts,html,css}` | Purge hardcoded light hex in legend, markers, and CSS. Render dynamic Legend from active `NodeTypes` + runtime/debug states. Synchronize port sides dynamically (`left`/`right` when `AutoLayoutDirection === 'horizontal'`, `top`/`bottom` when `'vertical'`). Add Space+drag panning alongside toolbar toggle. Forward `NodeBreakpointClicked`, `NodeQuickAddClicked`, `NodeRunStepClicked`, `LayoutDirectionChanged` outputs. |
| `src/lib/agent-editor/flow-agent-editor.component.{ts,html,css}` | Upgrade view switcher from `Diagram \| List` to **`Canvas \| Split Playbook \| Playbook`** (`AgentEditorViewMode = 'diagram' \| 'split' \| 'list'`, preserving `'diagram'` and `'list'` values for 100% test/host back-compat). Replace `ngOnChanges` with setter on `AgentID`. Add `AutoLayoutDirection` toggle (`LR ⇄ TB`) persisted in `UserInfoEngine`. Support quick-add from `+` port affordance. |
| `src/lib/agent-editor/agent-step-list.component.ts` | Upgrade from bare light-mode table into Relay-style **Synchronized Numbered Playbook Outline** (with loop grouping, branch path pills, step squircle icons, warning badges, semantic `--mj-*` tokens for Light & Dark, and 1-click synchronized selection with the canvas). |
| `src/lib/agent-editor/agent-properties-panel.component.{ts,html,css}` | Add searchable filter inputs above Action, Prompt, and Sub-Agent pickers; clickable upstream `{{ step.output }}` variable pill inserter for Input/Output Mapping (preserving Raw JSON editor); structured Loop configuration fields (`collectionPath`, `condition`, `itemVariable`, `maxIterations`, `executionMode`, `maxConcurrency`) synced cleanly with `Step.Configuration` JSON; and Saga Rollback / Compensation Action configuration stored cleanly in `Step.Configuration`. Purge any dead/hardcoded light styles. |

---

### Phase 3 — `@memberjunction/ng-task-graph-editor` (`packages/Angular/Generic/task-graph-editor`)

| File | Exact Changes |
|---|---|
| `src/lib/task-graph-canvas-adapter.ts` | Export full `TASK_GRAPH_RENDER_TYPES` (all 8 step kinds) and use in `TaskGraphEditorComponent` so zero step types fall back to gray raw enum strings. Preserve untaken/skipped edges as muted ghosted dashed paths (`✕ Skipped`, controlled by `showUntakenPaths !== false`) while keeping operator-forced paths unmistakably amber dotted (`✋ Forced Yes` / `✋ Forced No`). Adapt port sides to layout direction (`horizontal` → `left`/`right`, `vertical` → `top`/`bottom`). Extend `TaskGraphDebugOverlay` with `liveActivity`, `rememberedTaskIDs`, `xrayEnabled`, `blastRadiusTaskIDs`, `taintedTaskIDs`, `verifiedTaskIDs`, `sagaMap`, `decisionConfidence`, `stepSummaries`, `showUntakenPaths`, and `layoutDirection`. Populate `FlowNode` telemetry fields in `SpecToNodes`. |
| `src/lib/task-graph-editor.component.{ts,html,css}` | Pass all render types to `NodeTypes` (palette still filters `Draggable !== false` to authorable kinds). Purge dead `--mj-space-*` tokens. Support `XRayEnabled`, `NodeBreakpointClicked`, `NodeRunStepClicked`, `LayoutDirectionChanged` passthrough. |
| `src/lib/task-graph-debug-toolbar.component.{ts,html,css}` | Rename `"Over"` / `"Into"` to DAG-native **`Step Next`** (`F10`) and **`Step Wave`** (`F11`), alongside **`Continue`** (`F5`), **`Pause`**, **`Stop`** (`Shift+F5`). Add optional Engine Pulse pill, Breakpoint count badge, **X-Ray (`X`)** toggle, and **Blast Radius** toggle. Purge dead `--mj-font-size-*` tokens. |
| `src/lib/task-graph-variables.component.{ts,html,css}` | Add **Tree | Before ⇄ After Diff** view switcher, variable search filter input, and 1-click **Copy JSON** button. Replace `ngOnChanges` with setter-only reactivity. Purge dead `--mj-font-size-*` / `--mj-font-mono` tokens. |
| `src/lib/task-graph-run-view.component.{ts,html,css}` | Thread `LiveActivity` (`NodeProgress`), `XRayEnabled`, `BlastRadiusTaskIDs`, `ShowUntakenPaths`, `RememberedStepIDs`, `Density` (`'auto' \| 'console' \| 'embedded'`) into canvas overlay & template. Add **Plain-English Diagnostic Co-Pilot Banner** for held gates, lost heartbeats, taint blocks, and breakpoints with 1-click remedy events. Add **Docked Interactive Replay Scrubber** (when `ReplayBounds` / settled run timestamps exist: Play/Pause, speed, timestamp readout, wave ticks). Add `RunStepRequested` output (`Step(taskID)`). Adaptive compact vertical card mode when container/Density is `'embedded'` (≤420px). Purge dead tokens. |
| `src/lib/task-graph-debugger.component.{ts,html,css}` | Expose `Step(target: 'one' \| 'wave' \| string)` so targeted `Step(taskID)` works from canvas & Co-Pilot! Add `Density` (`'auto' \| 'console' \| 'embedded'`), `XRayEnabled`, `BlastRadiusTaskIDs`, `EnginePulse`, `DiagnosticStall`, `AllowRememberBreakpoints`, and `ExpandRequested` output. Wire X-Ray, Blast Radius, and Co-Pilot remedies directly into `<mj-task-graph-debug-toolbar>` and `<mj-task-graph-run-view>`. Ensure pure flex-column layout (`display: flex; flex-direction: column; min-height: 0; overflow: hidden`). |

---

### Phase 4 — Workflows Explorer App (`packages/Angular/Explorer/dashboards/src/Workflows/`)

| File | Exact Changes |
|---|---|
| `workflows.types.ts` | Add `WorkflowBlueprintStep`, `WorkflowBlueprintEdge`, `WorkflowRunSparkBar`, `WorkflowCatalogItem` (with `IconClass`, `StepCount`, `HasHumanStep`, `HasLoop`, `TriggerKind`, `TriggerSummary`, `RecentBars`, `HealthPercent`, `P50Duration`, `BlueprintSteps`, `BlueprintEdges`), `WorkflowStarterRecipe`, and derived `MJTaskEntity['Status']` / `MJAIAgentEntity['Status']` types. |
| `workflows-dashboard.component.{ts,html,css}` + `workflow-blueprint.util.ts` | Standard `<mj-page-layout>` / `<mj-page-header>` (`[meta]` X-of-Y count + conditional `waiting on person` & `running` callouts; `[actions]` Refresh + `+ Create Workflow`; `[toolbar]` `<mj-page-search>` + `<mj-filter-popover>` + `<mj-view-toggle>` Blueprints / Table) / `<mj-page-body>`. Conditional **"Needs Your Decision"** banner for open `Human` tasks. Blueprint Cards with auto-generated miniature SVG topology previews + reconciled Triggers (from `MJ: Scheduled Jobs` + `MJ: Entity Actions`) + Ops Table with 10-run spark-barcodes & `p50` duration. **In-App Workflow Studio** view inside `WorkflowsDashboardComponent` (persisted & deep-linked via BOTH `GetQueryParams()` AND `OnQueryParamsChanged()`!) mounting `<mj-flow-agent-editor>` + **`Triggers & Entry Points`** tab mounting `<mj-agent-invocations>` + secondary `"Advanced Record"` button. Purge all dead tokens. |
| `components/create-workflow.component.{ts,html,css}` | 3-door **Split Compiler** on left (`Describe with AI`, `Promote a Past Run` loading REAL child step counts & durations, `Blank`) + 4 Starter Recipe chips + iterative AI refinement input. Live Spatial Preview on right mounting `<mj-task-graph-editor [Spec]="PreviewSpec" [ReadOnly]="true">` + AI `reasoning` card + *"Preview only — nothing saved until Approve & Enter Studio"*. Fix `SourceRunID` bug by loading child `MJ: Tasks` + `MJ: Task Dependencies` via `ProjectTaskRowsToSpec`, previewing live, and passing the exact `TaskGraphSpec` to `WorkflowSaveOperation` ONLY on **Approve & Enter Studio**, then opening directly in In-App Studio! Purge all dead tokens. |
| `components/workflow-runs-resource.component.{ts,html,css}` | Fix `.wfr-graph-pane` flex-column layout (zero clipping). Fix `'Running'` filter bug to match `'In Progress'` using derived `MJTaskEntity['Status']` plus `'Waiting on Person'` and `'Held'`. Fix `SelectWorkflowRun` agent client tool to invoke `OnSelectRun(...)`. Add collapsible `280px` left Run Rail (persisted via `UserInfoEngine`), **Inline Person Approval Card** for active `Human` steps, `<mj-task-graph-debugger [AllowRememberBreakpoints]="true">` Flight Deck, and collapsible bottom **Synchronized Execution Waterfall / Gantt** correlated click-for-click with step selection. Purge all dead tokens. |
| `workflows-dashboards.module.ts` & `dashboards/package.json` | Declare `@memberjunction/ng-flow-editor` in `dashboards/package.json` and import `FlowEditorModule` + `AgentsModule` (for `<mj-agent-invocations>`) + `MJFilterPopoverComponent` / `MJFilterPanelComponent` / `MJViewToggleComponent` in `WorkflowsDashboardsModule`. |

---

## 3. Verification & Quality Gates (Phase 5)
1. Build all 6 affected/downstream packages via `pnpm --filter ... build`.
2. Pass `npm run check:standards` (0 violations across `ng-flow-editor`, `ng-task-graph-editor`, `ng-dashboards`).
3. Run Vitest unit tests (`npm run test`) in `flow-editor`, `task-graph-editor`, and `dashboards` (update any changed labels/selectors + add comprehensive tests for every new hybrid feature; **0 failures**).
4. Live Playwright headless verification against `MJAPI :4001` & `MJExplorer :4201` (`MJ_Workflows_UX`) across Light & Dark modes covering Catalog, Create Front Door, In-App Studio, Flow Agent Form, and Workflows Runs (**0 non-cosmetic console errors**).
