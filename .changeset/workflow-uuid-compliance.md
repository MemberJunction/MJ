---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-flow-editor": patch
---

Replace a direct UUID comparison in `CreateWorkflowComponent` (`UUIDsEqual`) and replace the nested `UUIDsEqual` scan in `AgentStepListComponent.OrderedSteps` with indexed `IndexByUUID`, `GroupByUUID`, and `UUIDSet` lookups so `UUIDCompliance` passes on `next`.
