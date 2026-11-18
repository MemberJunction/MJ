---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-agents": minor
"@memberjunction/core-actions": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add Work Bus & Software Factory MJ Core layers: generalized always-on agent policies, inter-agent requests, and coalesced workstream wake scheduling (`TriggerWakeForWorkstream` + `Trigger Agent Wake`), action-level RLS/FLS enforcement, declarative `SubtypeSelector` extensions (`AutoEnsureOnSave`, `OnSubtypeChange: 'Refuse' | 'Replace'`, `Driver`, `UIDriver`, `FoldIntoForm`, `EntitySubtypeDriverBase`, `<mj-folded-subtype-section>`), `MJ: Conversation Types`, `MJ: Comments` (IS-A `Conversation`), `MJ: Comment Types`, and `MJ: Field Suggestions` (IS-A `Comment`) with server-side accept/reject/supersede drivers, `PostSave` hooks, RLS/FLS anchored-view filtering, and generated-form Notes & Suggestions UI.
