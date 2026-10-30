---
"@memberjunction/server": patch
---

`IntegrationApplyAllBatch` matches `IntegrationApplyAll`: first-apply full-sync determination, and unselected entity maps are disabled on the no-restart path. Schema evolution detects a re-keyed object, where a connector release changes its primary key's members or their order, and clears that object's record maps and rows so the next sync rebuilds it. The check reads the connection's field rows, and an object whose field rows were not read is never treated as re-keyed.
