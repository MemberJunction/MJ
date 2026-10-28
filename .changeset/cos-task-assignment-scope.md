---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ai-agents": minor
---

Chief of Staff cockpit: the Priorities & OKRs tab failed with `Invalid column name 'PersonID'` as soon as the signed-in user had a linked `MJ_BizApps_Common: People` record. `ResolvePersonTaskScope` now matches `MJ_BizApps_Tasks: Task Assignments` on the polymorphic assignee pair (`AssigneeEntityID` = the People entity, `AssigneeRecordID` = the person) and takes the People entity ID as a parameter; the cockpit resolves it through its provider and reports no linked person when the BizApps Common app is not installed.

The cockpit also falls back to an exact, case-insensitive match on the user's email when no People record is linked to their user, so an administrator-entered person works without a manual link.

The task scope now covers the whole tree of every root objective the person owns: milestones added under their objective by an administrator, a teammate or the agent load with it, whoever created them. Children of a task the person is only assigned to are not pulled in.

Chief of Staff prompt (metadata): the agent resolves the user's People record (`LinkedUserID`, then email) before reading or writing tasks, sets `CreatedByPersonID` on every task or issue it creates so the cockpit can show them, and, when no person exists, says so and offers to create one, deferring to an administrator on `PERMISSION_DENIED`. The built-in agents guide documents the People record as a setup step.
