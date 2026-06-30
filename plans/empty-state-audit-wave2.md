# Empty-State Migration — Wave 2 Backlog (what wave-1 missed)

**Why this exists:** wave-1 scoping grep matched only `empty-state|empty-icon|no-results|no-data|no-selection`,
so empties with bespoke class names (`panel-empty`, `metric-empty`, `drill-down-empty`, `tree-empty`,
`mj-grid-empty`, `empty-section`, `column-empty`, `breakdown-empty`, `vs-empty-message`, `rb-state-empty`, …)
were invisible. Found when Matt browsed to a real page and saw an un-migrated empty. Broad re-scan → these
candidate files.

## Working method (REQUIRED — do not deviate)
Tackle **one section at a time**, each section as its own reviewable unit:
1. **Classify** every broad-marker hit in the section's files: `MIGRATE` (placeholder: icon + title/message
   ±CTA, occupies area) vs `SKIP` (BEM `--empty`/state modifier · inline cell/field marker like `cell-empty —`
   or `(empty)` · `-empty-fill`/`-empty-hint` helper · dropdown/typeahead popup row · table `empty-row` colspan
   cell · AG-Grid `overlayNoRowsTemplate` · code comment/JSDoc).
2. **Migrate** the genuine ones to `<mj-empty-state>` per `plans/empty-state-migration.md` (variant by intent,
   FA normalize, getters for dynamic text, flex-fill helper kept, dead CSS removed, module/standalone wiring).
3. **Build** the affected package(s).
4. **Screenshot** each migrated state (light+dark) via the reachable surface / forced-state.
5. **Present** screenshots + diff and **WAIT for explicit "commit"** — one commit per section, per approval.
   Never treat "proceed/yes/do X" as commit authorization.

Broad verification marker (run per section to confirm done): any `class="…empty…"` (excl. `mj-empty-state`,
`-empty-fill`, `-empty-hint`) plus `no-data|no-results|no-records|no-selection`.

## ⚠️ Cross-cutting backlog: RESET-CTA CORRECTNESS AUDIT (separate from migration)

**Why this exists:** Migrating an empty to `<mj-empty-state>` does NOT verify that its action
actually works. The Lists browse fix (`d13af5e786`) exposed a bug *class*: a no-results empty's
"Reset filters" / "Clear search" / "Clear filters" CTA whose handler resets only SOME of the
dimensions its filter narrows on, so the CTA appears to do nothing. `lists-browse.clearFilters()`
reset search/owner/entity but not favorites/tags. **We have never audited the other migrated pages
for this.** This spans ALL sections already migrated (hundreds of components), not just wave-2.

**The audit (read-only first, then fix-with-approval per page):** for every `<mj-empty-state>` with
a reset-family CTA, confirm the `(Action)` handler clears EVERY dimension the matching filter method
narrows on. Mismatch = bug.

Scope grep (reset-family CTAs across all Angular pkgs):
`grep -rlnE "mj-empty-state" packages/Angular --include='*.html' --include='*.ts' | xargs grep -lEi 'ActionText="(Reset|Clear|Show all)'`

Known candidates from the first scope pass (verify each handler vs. its filter):
- [x] `Lists/lists-browse-resource` `clearFilters()` — FIXED `d13af5e786` (was missing favorites+tags)
- [x] `Lists/lists-my-lists-resource` `clearSearch()` — CLEAN (filter narrows on search only)
- [ ] `Permissions/audit-log-resource` `OnResetFilters()`
- [ ] `core-entity-forms/Tests/test-suite-run-form` `setRunStatusFilter(null)`
- [ ] `core-entity-forms/Actions/action-execution-log-form` `clearFilters()`
- [ ] `core-entity-forms/AIAgents/add-action-dialog` `clearSearch()`
- [ ] `dashboard-viewer/dashboard-browser` `ClearSearch()`
- [ ] `action-gallery` `clearSearch()`
- [ ] `record-changes/ng-record-changes` `ClearFilters()`

NOTE: the scope grep only catches CTAs literally named Reset/Clear/Show all. Empties whose recovery
action has a bespoke label (e.g. "View all", "See everything") may also be reset-CTAs — widen the
marker when working a section. Also audit any reset/clear button OUTSIDE the empty state on the same
page that shares the handler.

## Status legend: [ ] pending · [~] migrated, needs screenshots/review · [x] done+committed

## Sections (largest first)

### [ ] dashboards/AI-analytics (12 files, 36 marker-hits)
- [ ] (10) Explorer/dashboards/src/AI/components/analytics/realtime/realtime-management.component.html
- [ ] (5) Explorer/dashboards/src/AI/components/analytics/prompt-runs/prompt-run-analysis.component.ts
- [ ] (4) Explorer/dashboards/src/AI/components/analytics/realtime/realtime-overview.component.ts
- [ ] (3) Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.html
- [ ] (3) Explorer/dashboards/src/AI/components/analytics/cost-budget/cost-budget.component.ts
- [ ] (2) Explorer/dashboards/src/AI/components/prompts/model-prompt-priority-matrix.component.html
- [ ] (2) Explorer/dashboards/src/AI/components/analytics/executive-summary/executive-summary.component.ts
- [ ] (2) Explorer/dashboards/src/AI/components/analytics/agent-runs/agent-run-analysis.component.ts
- [ ] (2) Explorer/dashboards/src/AI/components/agents/agent-editor.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/vectors/vector-management-resource.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/analytics/realtime/realtime-sessions.component.ts
- [ ] (1) Explorer/dashboards/src/AI/components/analytics/model-performance/model-performance.component.ts

### [ ] dashboards/Integration (7 files, 26 marker-hits)
- [ ] (7) Explorer/dashboards/src/Integration/components/mapping-workspace/mapping-workspace.component.html
- [ ] (5) Explorer/dashboards/src/Integration/components/pipelines/pipelines.component.html
- [ ] (4) Explorer/dashboards/src/Integration/components/visual-editor/visual-editor.component.html
- [ ] (4) Explorer/dashboards/src/Integration/components/connections/connections.component.html
- [ ] (3) Explorer/dashboards/src/Integration/components/activity/activity.component.html
- [ ] (2) Explorer/dashboards/src/Integration/components/overview/overview.component.html
- [ ] (1) Explorer/dashboards/src/Integration/components/widgets/run-history-panel.component.ts

### [ ] dashboards/FormBuilder (1 files, 21 marker-hits)
- [ ] (21) Explorer/dashboards/src/FormBuilder/form-builder-resource.component.html

### [ ] dashboards/KnowledgeHub (5 files, 17 marker-hits)
- [ ] (8) Explorer/dashboards/src/KnowledgeHub/components/analytics/analytics-resource.component.html
- [ ] (6) Explorer/dashboards/src/KnowledgeHub/components/config/knowledge-config-resource.component.html
- [ ] (1) Explorer/dashboards/src/KnowledgeHub/components/visualize/tag-cloud/tag-cloud.component.html
- [ ] (1) Explorer/dashboards/src/KnowledgeHub/components/visualize/record-drilldown/record-drilldown.component.html
- [ ] (1) Explorer/dashboards/src/KnowledgeHub/components/results-detail/search-result-detail.component.html

### [ ] Generic/entity-viewer (9 files, 14 marker-hits)
- [ ] (3) Generic/entity-viewer/src/lib/view-selector/view-selector.component.html
- [ ] (3) Generic/entity-viewer/src/lib/entity-record-detail-panel/entity-record-detail-panel.component.html
- [ ] (2) Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.html
- [ ] (1) Generic/entity-viewer/src/lib/view-types/renderers/timeline-view-renderer.component.ts
- [ ] (1) Generic/entity-viewer/src/lib/view-types/renderers/map-view-renderer.component.ts
- [ ] (1) Generic/entity-viewer/src/lib/recycle-bin/recycle-bin.component.html
- [ ] (1) Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts
- [ ] (1) Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.html
- [ ] (1) Generic/entity-viewer/src/lib/entity-cards/entity-cards.component.html

### [ ] dashboards/AI-autotagging (9 files, 12 marker-hits)
- [ ] (2) Explorer/dashboards/src/AI/components/autotagging/tabs/taxonomy-tab.component.html
- [ ] (2) Explorer/dashboards/src/AI/components/autotagging/tabs/sources-tab.component.html
- [ ] (2) Explorer/dashboards/src/AI/components/autotagging/components/classify-seed-taxonomy.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/autotagging/tabs/health-tab.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/autotagging/dialogs/dry-run-preview.dialog.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/autotagging/components/classify-overview-analytics.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/autotagging/components/classify-item-grid.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/autotagging/components/classify-item-drilldown.component.html
- [ ] (1) Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.html

### [ ] dashboards/Lists (5 files, 10 marker-hits)
- [ ] (3) Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts
- [ ] (2) Explorer/dashboards/src/Lists/components/lists-my-lists-resource.component.ts
- [ ] (2) Explorer/dashboards/src/Lists/components/lists-categories-resource.component.ts
- [ ] (2) Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts
- [ ] (1) Explorer/dashboards/src/Lists/components/venn-diagram/venn-diagram.component.ts

### [ ] Explorer/core-entity-forms (7 files, 9 marker-hits)
- [ ] (3) Explorer/core-entity-forms/src/lib/panels/ai-agents/agent-realtime.panel.html
- [ ] (1) Explorer/core-entity-forms/src/lib/custom/shared/entity-selector-dialog.component.ts
- [ ] (1) Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-run-form.component.html
- [ ] (1) Explorer/core-entity-forms/src/lib/custom/Tests/test-run-form.component.html
- [ ] (1) Explorer/core-entity-forms/src/lib/custom/Templates/template-param-dialog.component.html
- [ ] (1) Explorer/core-entity-forms/src/lib/custom/Lists/list-form.component.html
- [ ] (1) Explorer/core-entity-forms/src/lib/custom/AIAgents/FlowAgentType/flow-agent-form-section.component.html

### [ ] Generic/conversations (6 files, 8 marker-hits)
- [ ] (3) Generic/conversations/src/lib/components/collection/artifact-collection-picker-modal.component.ts
- [ ] (1) Generic/conversations/src/lib/components/realtime/realtime-session-thread.component.html
- [ ] (1) Generic/conversations/src/lib/components/realtime/realtime-agent-picker.component.ts
- [ ] (1) Generic/conversations/src/lib/components/realtime/realtime-activity-rail.component.html
- [ ] (1) Generic/conversations/src/lib/components/conversation/pinned-messages-panel.component.html
- [ ] (1) Generic/conversations/src/lib/components/conversation/conversation-agent-picker.component.ts

### [ ] dashboards/DevTools (4 files, 7 marker-hits)
- [ ] (3) Explorer/dashboards/src/DevTools/graphql-console.component.html
- [ ] (2) Explorer/dashboards/src/DevTools/class-registry.component.html
- [ ] (1) Explorer/dashboards/src/DevTools/settings-explorer.component.html
- [ ] (1) Explorer/dashboards/src/DevTools/lazy-module-status.component.html

### [ ] Generic/list-management (6 files, 7 marker-hits)
- [ ] (2) Generic/list-management/src/lib/components/audience-source-picker/audience-source-picker.component.html
- [ ] (1) Generic/list-management/src/lib/components/shared-with-me/shared-with-me.component.html
- [ ] (1) Generic/list-management/src/lib/components/list-management-dialog/list-management-dialog.component.html
- [ ] (1) Generic/list-management/src/lib/components/list-invitations/list-invitations.component.html
- [ ] (1) Generic/list-management/src/lib/components/list-audit-log/list-audit-log.component.html
- [ ] (1) Generic/list-management/src/lib/components/audience-source-summary/audience-source-summary.component.html

### [ ] Explorer/explorer-core (5 files, 7 marker-hits)
- [ ] (2) Explorer/explorer-core/src/lib/single-search-result/single-search-result.component.html
- [ ] (2) Explorer/explorer-core/src/lib/resource-wrappers/search-results-resource.component.ts
- [ ] (1) Explorer/explorer-core/src/lib/single-dashboard/single-dashboard.component.html
- [ ] (1) Explorer/explorer-core/src/lib/resource-wrappers/livekit-room-resource.component.ts
- [ ] (1) Explorer/explorer-core/src/lib/conversation-feedback/conversation-feedback.html

### [ ] Generic/base-forms (2 files, 6 marker-hits)
- [ ] (5) Generic/base-forms/src/lib/container/record-form-container.component.html
- [ ] (1) Generic/base-forms/src/lib/field/form-field.component.html

### [ ] Generic/query-viewer (3 files, 6 marker-hits)
- [ ] (3) Generic/query-viewer/src/lib/query-info-panel/query-info-panel.component.html
- [ ] (2) Generic/query-viewer/src/lib/query-row-detail/query-row-detail.component.html
- [ ] (1) Generic/query-viewer/src/lib/query-data-grid/query-data-grid.component.html

### [ ] Generic/flow-editor (4 files, 6 marker-hits)
- [ ] (2) Generic/flow-editor/src/lib/components/flow-node.component.html
- [ ] (2) Generic/flow-editor/src/lib/agent-editor/agent-step-list.component.ts
- [ ] (1) Generic/flow-editor/src/lib/components/flow-editor.component.html
- [ ] (1) Generic/flow-editor/src/lib/agent-editor/agent-properties-panel.component.html

### [ ] dashboards/ComponentStudio (5 files, 6 marker-hits)
- [ ] (2) Explorer/dashboards/src/ComponentStudio/components/form-builder/form-builder-canvas.component.html
- [ ] (1) Explorer/dashboards/src/ComponentStudio/components/form-builder/form-builder-tab.component.html
- [ ] (1) Explorer/dashboards/src/ComponentStudio/components/editors/requirements-editor.component.ts
- [ ] (1) Explorer/dashboards/src/ComponentStudio/components/ai-assistant/ai-assistant-panel.component.html
- [ ] (1) Explorer/dashboards/src/ComponentStudio/component-studio-dashboard.component.html

### [ ] Generic/dashboard-viewer (2 files, 5 marker-hits)
- [ ] (4) Generic/dashboard-viewer/src/lib/dashboard-browser/dashboard-browser.component.html
- [ ] (1) Generic/dashboard-viewer/src/lib/dashboard-viewer/dashboard-viewer.component.html

### [ ] dashboards/DataExplorer (2 files, 5 marker-hits)
- [ ] (3) Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.html
- [ ] (2) Explorer/dashboards/src/DataExplorer/components/navigation-panel/navigation-panel.component.html

### [ ] Generic/archive-manager (3 files, 5 marker-hits)
- [ ] (2) Generic/archive-manager/src/lib/archive-run-viewer/archive-run-viewer.component.html
- [ ] (2) Generic/archive-manager/src/lib/archive-config/archive-config-admin.component.html
- [ ] (1) Generic/archive-manager/src/lib/archive-restore/archive-restore-dialog.component.html

### [ ] dashboards/Home (2 files, 4 marker-hits)
- [ ] (3) Explorer/dashboards/src/Home/home-dashboard.component.html
- [ ] (1) Explorer/dashboards/src/Home/action-pin-config-dialog.component.html

### [ ] dashboards/DatabaseDesigner (2 files, 4 marker-hits)
- [ ] (3) Explorer/dashboards/src/DatabaseDesigner/components/shared/entity-review-panel.component.html
- [ ] (1) Explorer/dashboards/src/DatabaseDesigner/components/shared/entity-fields-grid.component.html

### [ ] Generic/search (3 files, 4 marker-hits)
- [ ] (2) Generic/search/src/lib/search-suggest.component.html
- [ ] (1) Generic/search/src/lib/search-scope-child-grid.component.html
- [ ] (1) Generic/search/src/lib/search-filter.component.html

### [ ] Generic/whiteboard (2 files, 3 marker-hits)
- [ ] (2) Generic/whiteboard/src/lib/whiteboard-export.ts
- [ ] (1) Generic/whiteboard/src/lib/whiteboard-snapshot.component.ts

### [ ] Generic/versions (2 files, 3 marker-hits)
- [ ] (2) Generic/versions/src/lib/label-create/label-create.component.html
- [ ] (1) Generic/versions/src/lib/record-micro-view/record-micro-view.component.html

### [ ] Generic/livekit-room (2 files, 3 marker-hits)
- [ ] (2) Generic/livekit-room/src/lib/livekit-room.component.html
- [ ] (1) Generic/livekit-room/src/lib/components/livekit-chat-panel.component.ts

### [ ] Generic/artifacts (2 files, 3 marker-hits)
- [ ] (2) Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.html
- [ ] (1) Generic/artifacts/src/lib/components/artifact-viewer-panel.component.html

### [ ] Explorer/explorer-settings (2 files, 3 marker-hits)
- [ ] (2) Explorer/explorer-settings/src/lib/entity-permissions/permission-dialog/permission-dialog.component.html
- [ ] (1) Explorer/explorer-settings/src/lib/application-management/application-dialog/application-dialog.component.html

### [ ] dashboards/APIKeys (2 files, 3 marker-hits)
- [ ] (2) Explorer/dashboards/src/APIKeys/api-applications-panel.component.html
- [ ] (1) Explorer/dashboards/src/APIKeys/api-usage-panel.component.html

### [ ] Generic/trees (1 files, 2 marker-hits)
- [ ] (2) Generic/trees/src/lib/tree/tree.component.html

### [ ] Generic/resource-permissions (1 files, 2 marker-hits)
- [ ] (2) Generic/resource-permissions/src/lib/user-sharing-center.component.html

### [ ] Generic/deep-diff (1 files, 2 marker-hits)
- [ ] (2) Generic/deep-diff/src/lib/deep-diff.component.html

### [ ] Generic/record-changes (2 files, 2 marker-hits)
- [ ] (1) Generic/record-changes/src/lib/restore-preview-panel/restore-preview-panel.component.html
- [ ] (1) Generic/record-changes/src/lib/ng-record-changes.component.html

### [ ] dashboards/VersionHistory (2 files, 2 marker-hits)
- [ ] (1) Explorer/dashboards/src/VersionHistory/components/graph-resource.component.html
- [ ] (1) Explorer/dashboards/src/VersionHistory/components/diff-resource.component.html

### [ ] dashboards/Communication (2 files, 2 marker-hits)
- [ ] (1) Explorer/dashboards/src/Communication/communication-templates-resource.component.ts
- [ ] (1) Explorer/dashboards/src/Communication/communication-logs-resource.component.ts

### [ ] Generic/timeline (1 files, 1 marker-hits)
- [ ] (1) Generic/timeline/src/lib/component/timeline.component.ts

### [ ] Generic/scheduling (1 files, 1 marker-hits)
- [ ] (1) Generic/scheduling/src/lib/panels/scheduled-job-summary/scheduled-job-summary.component.html

### [ ] Generic/record-tags (1 files, 1 marker-hits)
- [ ] (1) Generic/record-tags/src/lib/record-tags.component.html

### [ ] Generic/kanban (1 files, 1 marker-hits)
- [ ] (1) Generic/kanban/src/lib/components/kanban-board.component.ts

### [ ] Generic/filter-builder (1 files, 1 marker-hits)
- [ ] (1) Generic/filter-builder/src/lib/filter-rule/filter-rule.component.html

### [ ] Generic/file-storage (1 files, 1 marker-hits)
- [ ] (1) Generic/file-storage/src/lib/file-browser/file-grid.component.html

### [ ] Generic/entity-relationship-diagram (1 files, 1 marker-hits)
- [ ] (1) Generic/entity-relationship-diagram/src/lib/components/erd-diagram.component.html

### [ ] Generic/clustering (1 files, 1 marker-hits)
- [ ] (1) Generic/clustering/src/lib/cluster-scatter.component.html

### [ ] Explorer/list-detail-grid (1 files, 1 marker-hits)
- [ ] (1) Explorer/list-detail-grid/src/lib/ng-list-detail-grid.component.html

### [ ] dashboards/Testing (1 files, 1 marker-hits)
- [ ] (1) Explorer/dashboards/src/Testing/components/testing-analytics.component.ts

### [ ] dashboards/QueryBrowser (1 files, 1 marker-hits)
- [ ] (1) Explorer/dashboards/src/QueryBrowser/query-browser-resource.component.html

### [ ] dashboards/Actions (1 files, 1 marker-hits)
- [ ] (1) Explorer/dashboards/src/Actions/components/execution-monitoring.component.html
