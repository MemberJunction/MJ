---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/ng-graph-view": minor
---

Close the #3874 adversarial review. SkipRelatedCollections persists embeds while collections stay with the caller. The graph-node recursion guard is private on BaseEntity (IsGraphNodeSave is gone from EntitySaveOptions). Result serialize adopts saved peers; a rolled-back graph reverts in-memory saved/dirty so retry works. Two same-entity embeds no longer false-cycle. Ensure, Load, NewRecord FK, CodeName emission, core-schema imports, IT85/EE5, graph-view UUID links, focal-node dblclick, and default excludeSchemas no longer dropping core form tabs.
