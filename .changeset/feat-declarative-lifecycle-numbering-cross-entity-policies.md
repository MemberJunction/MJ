---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add declarative entity lifecycle policies (`EntityLifecyclePolicyEngine` + `ServerOperationScopeManager` with state machines, per-state field-freeze rules, post-create immutability, and `'Standard' | 'AppendOnly' | 'ServerOperationOnly'` write authority), concurrency-safe scoped document auto-numbering (`DocumentNumberingEngine` + `DocumentSequenceCounter` table), batch/transaction-memoized cross-entity policies (`CrossEntityPolicyEngine` + `PreDelete` data hooks), and typed cross-app capabilities (`AppCapabilityRegistry` / `@RegisterAppCapability`).
