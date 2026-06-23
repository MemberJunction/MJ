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
