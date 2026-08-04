# `<mj-empty-state>` — State Screenshots

Visual record of every migrated empty-state, captured live via the Playwright
`__forceState` harness (see [../empty-state-migration.md](../empty-state-migration.md)).
Each state has a light and a `-dark` shot. Folders mirror the migration sections.

## lists/
| State | File |
|-------|------|
| Browse — onboarding (no lists) | `browse-onboarding.png` |
| Browse — no-results (searched/filtered) + Clear | `browse-no-results.png` |
| Categories — onboarding | `categories-onboarding.png` |
| Operations — "Add Lists or Views to Compare" | `operations-prompt.png` |

## ai/
| State | File |
|-------|------|
| Models — no-results + Clear filters | `models-no-results.png` |
| Models — empty + Create First Model | `models-empty.png` |
| Prompts — no-results + Clear filters | `prompts-no-results.png` |
| Prompts — empty + Create New Prompt | `prompts-empty.png` |
| Agent Requests — empty (none yet) | `agent-requests-empty.png` |
| Agent Requests — filtered + Clear Filters | `agent-requests-filtered.png` |
| Agents — no agents found + Create | `agents-empty.png` |
| Error Analysis — success ("No Errors Found") | `error-analysis-success.png` |
| Usage Patterns — no data | `usage-patterns-empty.png` |
| System Configuration — empty | `system-config-empty.png` |

## component-studio/
| State | File |
|-------|------|
| Dashboard — "Ready to Build" onboarding (projected actions + quick-start row) | `dashboard-ready.png` |

_Other ComponentStudio empties (preview no-selection / run-state, browser empty/no-results,
editor panels, dialog empties) reuse already-recorded patterns; the dashboard onboarding is
captured as it's the one with projected multi-action + re-scoped CSS._

## testing/
| State | File |
|-------|------|
| Review — **success** "All caught up!" | `review-success.png` |
| Explorer — no-results | `explorer-no-results.png` |
| Analytics — chart-card placeholders (compact; incl. success "No failing tests") | `analytics.png` |

_Also migrated (reuse patterns): testing-review "No reviewed items", dashboard-tab
3 list empties (incl. success "No alerts"), runs table-empty, oracle no-results,
and 9 analytics empty-mini chart placeholders. The "Loading versions…" spinner
stays as a loading indicator (not an empty state)._

> **The 8 singleton-dashboard sections below have a `-dark.png` companion for
> every file listed** (58 screenshots total). Centering/flex-parent fixes made
> during capture: MCP `.data-grid > mj-empty-state { grid-column: 1/-1 }` and KH
> config `.config-section--centered { max-width: none }` — both caught because the
> empties were screenshotted, not assumed.

## scheduling/
| State | File |
|-------|------|
| Jobs — empty + Create Job | `jobs-empty.png` |
| Jobs — no-results + Reset filters | `jobs-no-results.png` |
| Dashboard — 3 panel empties (live exec · **success** "No active alerts" · upcoming) | `overview-panels.png` |
| Activity — no-results + Reset filters | `activity-no-results.png` |

## home/
| State | File |
|-------|------|
| Pin onboarding — dashed card + projected [Add your first pin] + [Don't show again] + close-X | `pin-onboarding.png` |
| Apps — No Applications Available + Configure Applications | `apps-empty.png` |

_The pin onboarding keeps its dashed-card wrapper + close-X overlay; the
icon/title/message/buttons are `<mj-empty-state>` with both CTAs projected into
the `[actions]` slot._

## permissions/
| State | File |
|-------|------|
| User Access — no-selection prompt | `user-access-no-selection.png` |
| User Access — no permissions for user | `user-access-no-permissions.png` |
| Resource Access — no lookup yet | `resource-access-no-lookup.png` |
| Resource Access — no grantees (no-results, echoes query) | `resource-access-no-grantees.png` |
| Audit Log — no query yet | `audit-log-no-query.png` |
| Audit Log — no-results + Reset filters | `audit-log-no-results.png` |

## knowledge-hub/
| State | File |
|-------|------|
| Config — No Embedding Models Found (centered via `--centered` modifier) | `config-no-embedding-models.png` |
| Config — No Searchable Entities Found | `config-no-fts-entities.png` |
| Config — Scheduling empty | `scheduling-empty.png` |
| Analytics/Tags — No tag data + No co-occurrence data | `analytics-tags-empty.png` |
| Analytics/Sources — No content sources configured | `analytics-sources-empty.png` |

_Also migrated (reuse patterns, not separately shot): search-detail no-selection +
compact related-items, analytics cost-tab empty._

## data-explorer/
| State | File |
|-------|------|
| Entity list — no-results (echoes filter text) | `no-results.png` |
| No Entities Available | `no-entities.png` |

## query-browser/
| State | File |
|-------|------|
| Viewer — no-selection + New Query (fills panel) | `no-selection.png` |
| Sidebar — no queries available (compact) | `sidebar-empty.png` |
| Sidebar — search no-results | `search-no-results.png` |

## mcp/
| State | File |
|-------|------|
| Servers — empty + Add Your First Server | `servers-empty.png` |
| Connections — empty + Add Your First Connection | `connections-empty.png` |
| Tools — No tools discovered yet | `tools-empty.png` |
| Logs — No recent execution logs | `logs-empty.png` |

_**Fix:** grid empties (servers/connections) needed `grid-column: 1/-1` to span
the grid instead of sitting in one 350px column._

## system-diagnostics/
| State | File |
|-------|------|
| Engine Registry — No engines registered yet | `engines-empty.png` |
| Redundant Loading — **success** "No redundant entity loading detected" | `redundant-success.png` |
| Local Cache — No cached data | `cache-empty.png` |

_Also migrated (reuse patterns): optimization-insights success, performance
telemetry/filter/events compact empties (nested perf sub-tabs)._

## autotagging/ (AI app — Classify pipeline + Tags resource, `at-*` prefixed)
Every file has a `-dark` companion (36 files / 18 states). 23 instances migrated
across 7 files (history/inbox/pipeline/sources/tags/taxonomy tabs + tags-resource).

**Classify pipeline tabs** (forced-mount via `_activeTab`):
| State | File |
|-------|------|
| Inbox — "No pending suggestions" (success list) + "Select a suggestion…" (at-fill pane) | `inbox-empty.png` |
| Pipeline feed — empty | `pipeline-feed-empty.png` |
| Pipeline feed — no-results (search) | `pipeline-feed-no-results.png` |
| History — "No per-source detail…" + "No content items found." | `history-no-detail.png` |
| Tags (classify) — drilldown "No content items found for this tag." | `classify-tags-drilldown-empty.png` |
| Taxonomy — tree "No tags found" + "Select a tag…" (at-fill) | `taxonomy-tree-empty.png` |
| Taxonomy — **success** "No duplicate tags detected" | `taxonomy-duplicates-success.png` |
| Taxonomy — **success** "No orphaned tags" | `taxonomy-orphans-success.png` |
| Taxonomy — "No taxonomy data to visualize" | `taxonomy-treemap-empty.png` |
| Taxonomy — no-results "No audit events…" | `taxonomy-audit-no-results.png` |

**Tags resource** (KH "Tags" page — the live taxonomy UI):
| State | File |
|-------|------|
| Tree — "No tags found" + "Select a tag…" (at-fill) + Tag Cloud "No tags yet" | `tags-taxonomy-no-selection.png` |
| Duplicates — **success** | `tags-duplicates-success.png` |
| Orphans — **success** | `tags-orphans-success.png` |
| Treemap — "No taxonomy data to visualize" | `tags-treemap-empty.png` |
| Audit — no-results | `tags-audit-no-results.png` |
| Suggestions — **success** "No pending suggestions." | `tags-suggestions-success.png` |
| Health/Runs — "No runs yet." | `tags-runs-empty.png` |
| Tag library — drilldown "No content items found for this tag." + Tag Cloud "No tags yet" | `tags-drilldown-empty.png` |

_Includes success variants, no-results, the `at-fill` no-selection detail/reading panes,
and the Tag-Cloud "No tags yet" (fa-tag) + drilldown (fa-inbox) — all icons explicit.
Dead `.at-empty-state` CSS removed from both `ViewEncapsulation.None` parents; replaced
with `.at-fill` (flex:1) so no-selection empties grow to fill their panes._

**Build-verified, not screenshotted:** `sources-tab` detail empty / no-results
(2 states). Markup compiles and matches the canonical compact pattern, but live
state-injection trips a **pre-existing** `formatNumber(undefined)` in the
source-detail header (`classify.format.ts` — unrelated to this migration; real
hydrated data renders fine). Identical compact icon+text empties to ~25 captured._

## dev-tools/
| State | File |
|-------|------|
| Event Monitor — listening (captured 0) | `event-monitor-listening.png` |
| Event Monitor — **paused** (warning variant, dynamic count) | `event-monitor-paused.png` |
| Event Monitor — no filter match (no-results, dynamic count) | `event-monitor-no-match.png` |

_One `<mj-empty-state>` whose Variant/Icon/Title/Message are driven by getters
(`EmptyVariant`/`EmptyIcon`/`EmptyTitle`/`EmptyMessage`) — collapsed a 3-branch
`@if`/`@else` into one component. Dead `.em-empty*` CSS removed._

## core-entity-forms/ (representative — 85 instances migrated across 24 forms)
| State | File |
|-------|------|
| AI Agent Run — Timeline "No execution steps found" | `agent-run-timeline-empty.png` |
| AI Agent Run — Analytics "No prompt executions found…" (+ secondary message) | `agent-run-analytics-empty.png` |

_Representative captures (light+dark). The rest of the 24 forms render the same
canonical component; their empties sit behind tab + accordion + record-state
gating (params/fields/permissions panels are `@if (record.IsSaved)` and not in the
DOM until the right tab+panel is opened), so they're build-verified (package
compiles all 85, 15 tests pass)._

## conversations/ (representative — 13 instances across 11 components)
| State | File |
|-------|------|
| Chat — "No messages yet. Start a conversation!" | `message-list-empty.png` |
| Collections — "No collections yet" + Create Collection | `collections-empty.png` |
| Collections — no-results "No items found" | `collections-no-results.png` |

_Representative captures (light+dark). Modal/panel empties (share/members/artifact
modals, search-panel, mention dropdown, user-picker) render the same component;
build-verified (616 tests pass). The 2 bespoke greeting/suggested-prompt slot
components were intentionally excluded._

## generic-packages/ (final 24-package batch — reachable surfaces)
| State | File |
|-------|------|
| File Browser — "No storage accounts", "No folders", "This folder is empty" (file-storage) | `file-browser.png` |
| Dashboards — "Welcome to Dashboards" onboarding + projected feature row + CTA (dashboard-viewer) | `dashboard-browser.png` |
| Query viewer — "No results" (query-viewer) | `query-data-grid-empty.png` |

_Live captures (light+dark) of the route-reachable surfaces. The remaining ~20
Generic-package empties (entity-viewer, artifact/data viewers, dashboard parts,
record-changes/tags, ERD/clustering/timeline overlays, share/list dialogs, agent
create-panel, etc.) mount only inside specific nested workflows with no isolated
harness, so they are **build-verified** — the full turbo build compiles all 92
instances (a template error fails the build) and 104 test tasks pass. Verified via
genuine route probing, not assumption._

## version-history/
| State | File |
|-------|------|
| Labels — empty + Create Your First Label | `labels-empty.png` |
| Labels — no-results + Reset filters | `labels-no-results.png` |
| Diff Viewer — select labels to compare | `diff-select-labels.png` |
| Diff Viewer — **success** (no differences found) | `diff-success.png` |
| Dependency Graph — no-selection (fills detail pane) | `graph-no-selection.png` |
| Dependency Graph — relationship empties (Referenced By / Depends On, compact) | `graph-relationships-empty.png` |

_restore-resource (no-results/Reset + empty) reuses the captured patterns. The
graph's entity-list + both relationship empties are migrated (compact); only the
tiny inline diff-fields-empty span is left as-is._

## integration/
| State | File |
|-------|------|
| Connections — onboarding + Add Your First Integration | `connections-onboarding.png` |
| Overview — no integrations configured | `overview.png` |
| Activity — no-results (no runs for filters) | `activity-no-results.png` |
| Schedules — no integrations found | `schedules-empty.png` |

_pipelines "No Integration Pipelines" (same icon+title+message pattern) covered
in code; not screenshotted (nested sub-view)._

## actions/
| State | File |
|-------|------|
| Explorer — empty + Create Action | `explorer-empty.png` |
| Explorer — no-results + Reset filters | `explorer-no-results.png` |
| Overview — compact panel empties (category stats / recent actions / executions) | `overview.png` |
| Monitor — no executions found (no-results) | `monitor-no-results.png` |

_actions-list-view and categories-list-view no-results reuse the captured
no-results pattern._

## communication/
| State | File |
|-------|------|
| Monitor — 3 compact panel empties (recent activity / providers / channels) | `monitor.png` |
| Logs — no-results (in table, colspan) | `logs-no-results.png` |
| Templates — no-results | `templates-no-results.png` |
| Runs — no communication runs found | `runs-empty.png` |

## credentials/
| State | File |
|-------|------|
| Types — no-results + Reset filters | `types-no-results.png` |
| Types — empty + Create Type | `types-empty.png` |
| Types — no-selection (detail pane, filled via height:100%) | `types-no-selection.png` |
| Audit Log — no-results + Reset filters | `audit-no-results.png` |
| Overview — compact panel empties (no credentials / no types) | `overview.png` |

_Categories (mirrors Types: empty/Create + search no-results/Clear + no-selection)
and the Credentials list (mirrors Types) reuse the captured patterns._

## explorer-settings/
| State | File |
|-------|------|
| Users — empty (no reset button) | `users-empty.png` |
| Users — no-results + Reset filters | `users-no-results.png` |
| Roles — no-results + Reset filters | `roles-no-results.png` |
| Permissions — no-results + Reset filters | `permissions-no-results.png` |
| Apps — no-results + Reset filters | `apps-no-results.png` |
| SQL Logging — access denied (error variant) | `sql-logging-access-denied.png` |
| SQL Logging — disabled (warning variant + info-box slot) | `sql-logging-disabled-warning.png` |
| SQL Logging — no active sessions (empty + CTA) | `sql-logging-no-sessions.png` |

_Not yet captured (Settings-gear nav, reuse already-shown patterns): Profile icon-picker
no-results, Notification preferences empty, Application-settings / user-app-config compact
in-panel empties._

## apikeys/
| State | File |
|-------|------|
| Overview — compact panel empties (no keys / no recent activity) | `overview.png` |
| Keys list — empty + Generate Your First Key | `key-list-empty.png` |

_Scopes / Applications / Usage panel empties not captured (this env has data; same
icon+title+message pattern as those shown)._
