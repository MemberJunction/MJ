---
"@memberjunction/ng-dashboards": patch
---

Chief of Staff cockpit: the Priorities & OKRs tab failed with `Invalid column name 'PersonID'` as soon as the signed-in user had a linked `MJ_BizApps_Common: People` record. `ResolvePersonTaskScope` now matches `MJ_BizApps_Tasks: Task Assignments` on the polymorphic assignee pair (`AssigneeEntityID` = the People entity, `AssigneeRecordID` = the person) and takes the People entity ID as a parameter; the cockpit resolves it through its provider and reports no linked person when the BizApps Common app is not installed.
