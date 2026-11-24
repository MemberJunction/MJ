---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-flow-editor": patch
---

Replace a direct UUID comparison in `CreateWorkflowComponent` (`UUIDsEqual`) and replace the nested `UUIDsEqual` scan in `AgentStepListComponent.OrderedSteps` with indexed `IndexByUUID`, `GroupByUUID`, and `UUIDSet` lookups so `UUIDCompliance` passes on `next`. `FlowEditorComponent.ZoomToFit` now does nothing once the editor is destroyed, so an auto-fit timer that fires after teardown no longer throws `NG0911: View has already been destroyed`.
