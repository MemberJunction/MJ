---
"@memberjunction/ng-dashboards": patch
---

Chief of Staff core no longer depends on BizApps (Phase 1 of #6193). The cockpit, its agent context and the Chief of Staff prompt use core entities only (`MJ: AI Agent User Policies`, `MJ: User Routines`, `MJ: User Routine Runs`, `MJ: AI Agent Requests`); priorities, objectives, milestones, assignments and to-dos move to an extension in the BizApps Tasks app.

Cockpit: the Priorities & OKRs tab, the Overview priority and To-dos panels, the task quick-edit drawer and the People and task-scope loading are removed, along with the `health` query param and the FilterPrioritiesByHealth and InspectPriorityObjective agent tools. The header and KPI cards show approvals and wakes.

New extension point: an Open App registers an Angular component extending `BaseChiefOfStaffPanel` with `RegisterClassEx` metadata (`placement` `tab` or `overview`, `panelKey`, `label`, optional `icon`, `sortKey`, `liveEntities`). The cockpit collects registrations with `CollectChiefOfStaffPanels`, mounts each panel, passes it a context whose `RefreshToken` drives reloads, merges the panel's reported fields into the agent context (core fields win) and reloads when a panel's `liveEntities` change. `ValidateChiefOfStaffTabParam` takes the valid tab set; `IsCockpitEntityChange` takes extra entity names.

Removed public exports from `chief-of-staff-agent-context`: the task scope and filter helpers (`ResolvePersonTaskScope`, `BuildScopeRootTasksFilter`, `BuildOwnedRootTasksFilter`, `BuildPersonScopedTaskFilter`, `LoadTaskAssignees`, `BuildTaskRecordKey`), the priority card and metric types and helpers, the to-do helpers (`IsTodoTask`, `BuildTodoItems`), the health filter helpers and the `BIZAPPS_*` entity names. `CalculateChiefOfStaffMetrics` now takes routines and requests only.

Prompt (metadata): reminders are one-shot wakes, priorities are kept in the policy's `InstructionsOverride`, and business data comes from an installed skill; the People bridge, the Tasks/OKR and to-do sections and the BizApps view names are gone. The agent's description and an action parameter example drop their BizApps references.
