# Empty-State Wave-2 — Authoritative MIGRATE List

Produced 2026-06-24 by a 5-agent classification pass over the **209** widened-marker
bespoke candidates (114 files). Each candidate was read in context and classified
MIGRATE (genuine icon+title/message placeholder) vs SKIP (wrapper around an
already-migrated `<mj-empty-state>`, table cell marker, helper/BEM-modifier class,
dropdown "no options" row, code comment, dead prototype, or excluded-by-design slot).

## Headline
- **~95 genuine MIGRATE instances across ~58 files** (the rest of the 209 were correctly SKIP).
- So the honest adoption picture: raw widened marker = 66% (410 / 619), but counting
  **only genuine placeholders** as remaining work, adoption ≈ **81%** (410 / (410+95)).
  ~114 of the 209 "bespoke" hits are NOT placeholders and need no migration.

## ✅ DONE — wave-2 session 2026-06-24 (~41 empties, 18 files, all committed on `empty-state-component`)
- `FormBuilder/form-builder-resource.html` (6) — `6c309ee2fb`, centering fix `b8f1a56b4b`
- `KnowledgeHub/analytics-resource.html` (8) — `6c309ee2fb`
- `Integration/pipelines` + `visual-editor` (8) — `671ab6c7bc`
- `Integration/activity` (3) + `connections` (1) — `b4a051c1bc`  (skipped `schedule-empty` = inline config row)
- `DevTools/` graphql-console (3) + class-registry (1) + lazy-module-status (1) + settings-explorer (1) — `0637d2ecfd`
- `AI/components/autotagging/` all 8 files (9) — `1304abf6d7`
- Metrics-honesty fix + rule 6c doc: `58fb5d7d30`, `81eec26b3a`
NOTE during migration, 3 batch-aa "MIGRATE" flags were re-classified to SKIP on closer read: FormBuilder L637 (loading spinner), L628/L630 (dropdown picker rows). Re-adjudicate each candidate in context — the agent pass over-flagged a few.

## ⏳ REMAINING — pick up here (everything below NOT yet done)
Dashboards tail: Home (2), DataExplorer/navigation-panel (2), DatabaseDesigner/entity-review-panel (1),
ComponentStudio (requirements-editor / form-builder-canvas / form-builder-tab, 3), APIKeys (api-applications + api-usage, 2),
Actions/execution-monitoring (1), VersionHistory/diff-resource (1), KnowledgeHub/config (3) + visualize/record-drilldown (1) + tag-cloud (1),
AI/analytics/realtime/realtime-transcripts (3), AI/vectors/vector-management-resource (1), explorer-core/single-dashboard (1).
PLUS the entire **Generic packages** section below (archive-manager, base-forms, conversations/pinned-messages, entity-action-ux,
flow-editor agent-properties/agent-step-list, livekit-room, record-changes, record-process-studio, record-tags,
resource-permissions, scheduling, search, trees, versions, whiteboard).

## CONVENTIONS (read before starting)
- `plans/empty-state-migration.md` — full rulebook incl. **rule 6c** (proactively center kept-bespoke-class hosts) + the flex/grid-parent gotcha.
- Memory `project_empty_state_migration` — REQUIRED working method (classify→migrate→build→screenshot→present→WAIT for explicit "commit"), the centering gotcha, and the **standardization target** (per-class width/grid fixes are a BRIDGE; eventually standardize the parent host slot → delete all bespoke `*-empty` classes in one sweep — so DON'T invest in per-file CSS hygiene/dead-rule trimming).
- Memory `project_ui_adoption_marker_widening` — markers under-count; widen before trusting %.

Format: `- [ ] path  (N instances)`

## Explorer/dashboards

### AI / autotagging (Classify cockpit)
- [ ] AI/components/autotagging/autotagging-pipeline-resource.component.html (1)
- [ ] AI/components/autotagging/components/classify-item-drilldown.component.html (1)
- [ ] AI/components/autotagging/components/classify-item-grid.component.html (1)
- [ ] AI/components/autotagging/components/classify-overview-analytics.component.html (1)
- [ ] AI/components/autotagging/components/classify-seed-taxonomy.component.html (2)
- [ ] AI/components/autotagging/dialogs/dry-run-preview.dialog.component.html (1)
- [ ] AI/components/autotagging/tabs/health-tab.component.html (1)
- [ ] AI/components/autotagging/tabs/sources-tab.component.html (1)

### AI / other
- [ ] AI/components/analytics/realtime/realtime-transcripts.component.ts (3)
- [ ] AI/components/vectors/vector-management-resource.component.html (1)

### APIKeys
- [ ] APIKeys/api-applications-panel.component.html (1)
- [ ] APIKeys/api-usage-panel.component.html (1)

### Actions
- [ ] Actions/components/execution-monitoring.component.html (1)

### ComponentStudio
- [ ] ComponentStudio/components/editors/requirements-editor.component.ts (1)
- [ ] ComponentStudio/components/form-builder/form-builder-canvas.component.html (1)
- [ ] ComponentStudio/components/form-builder/form-builder-tab.component.html (1)

### DataExplorer
- [ ] DataExplorer/components/navigation-panel/navigation-panel.component.html (2)

### DatabaseDesigner
- [ ] DatabaseDesigner/components/shared/entity-review-panel.component.html (1)

### DevTools
- [ ] DevTools/class-registry.component.html (1)
- [ ] DevTools/graphql-console.component.html (3)
- [ ] DevTools/lazy-module-status.component.html (1)
- [ ] DevTools/settings-explorer.component.html (1)

### FormBuilder
- [ ] FormBuilder/form-builder-resource.component.html (9)  ← biggest single file

### Home
- [ ] Home/home-dashboard.component.html (2)

### Integration
- [ ] Integration/components/activity/activity.component.html (3)
- [ ] Integration/components/connections/connections.component.html (2)
- [ ] Integration/components/pipelines/pipelines.component.html (4)
- [ ] Integration/components/visual-editor/visual-editor.component.html (4)
- [ ] Integration/components/widgets/run-history-panel.component.ts (1)

### KnowledgeHub
- [ ] KnowledgeHub/components/analytics/analytics-resource.component.html (8)  ← second biggest
- [ ] KnowledgeHub/components/config/knowledge-config-resource.component.html (3)
- [ ] KnowledgeHub/components/visualize/record-drilldown/record-drilldown.component.html (1)
- [ ] KnowledgeHub/components/visualize/tag-cloud/tag-cloud.component.html (1)

### VersionHistory
- [ ] VersionHistory/components/diff-resource.component.html (1)

## Explorer/explorer-core
- [ ] explorer-core/src/lib/single-dashboard/single-dashboard.component.html (1)

## Generic packages
- [ ] archive-manager/src/lib/archive-config/archive-config-admin.component.html (2)
- [ ] archive-manager/src/lib/archive-restore/archive-restore-dialog.component.html (1)
- [ ] archive-manager/src/lib/archive-run-viewer/archive-run-viewer.component.html (1)
- [ ] base-forms/src/lib/container/record-form-container.component.html (1)
- [ ] conversations/src/lib/components/conversation/pinned-messages-panel.component.html (1)
- [ ] entity-action-ux/src/lib/field-rules-builder/field-rules-builder.component.ts (1)
- [ ] entity-action-ux/src/lib/record-process-runner/record-process-runner-ux.component.ts (1)
- [ ] flow-editor/src/lib/agent-editor/agent-properties-panel.component.html (1)
- [ ] flow-editor/src/lib/agent-editor/agent-step-list.component.ts (2)
- [ ] livekit-room/src/lib/livekit-room.component.html (2)
- [ ] livekit-room/src/lib/components/livekit-chat-panel.component.ts (1)
- [ ] record-changes/src/lib/ng-record-changes.component.html (1)
- [ ] record-changes/src/lib/restore-preview-panel/restore-preview-panel.component.html (1)
- [ ] record-process-studio/src/lib/record-process-studio/record-process-studio.component.ts (1)
- [ ] record-tags/src/lib/record-tags.component.html (1)
- [ ] resource-permissions/src/lib/user-sharing-center.component.html (2)
- [ ] scheduling/src/lib/panels/scheduled-job-summary/scheduled-job-summary.component.html (1)
- [ ] search/src/lib/search-filter.component.html (1)
- [ ] search/src/lib/search-suggest.component.html (2)
- [ ] trees/src/lib/tree/tree.component.html (1)
- [ ] versions/src/lib/label-create/label-create.component.html (2)
- [ ] versions/src/lib/record-micro-view/record-micro-view.component.html (1)
- [ ] whiteboard/src/lib/whiteboard-snapshot.ts (1)

## Excluded (agents flagged MIGRATE, but DO NOT migrate)
- `DataExplorer/components/filter-builder/FILTER_BUILDER_MOCKUP.html` — static mockup, not a live component
- `DashboardBrowser/dashboard-share-dialog.component.html` — orphaned (component switched to inline template in `9cab2794cc`; file is dead)

## SKIP categories the pass filtered out (~114 hits, no action needed)
Already-migrated wrappers (the line had a bespoke class but `<mj-empty-state>` is already inside) ·
table-cell "—"/"(empty)" markers · `*-empty-hint`/`*-empty-fill`/label child classes ·
`mj-dropdown-no-data` & picker "no options" rows · `--empty`/`is-empty` BEM state modifiers ·
code comments & doc examples · `.ts` HTML-string builders (whiteboard-export) ·
dead `initial-prototype-now-old/*` · excluded-by-design chat slots
(`mj-chat-empty-state-default`, `conversation-empty-state`).
