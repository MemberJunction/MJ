---
"@memberjunction/feature-pipelines": patch
"@memberjunction/ng-record-process-studio": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/record-set-processor": patch
---

Add pipeline type picker, capability-aware output filtering and validation, Decision-specific constraint editors, and type badges for Feature Pipelines. What each pipeline type can produce is now one rule set, shared by the server and the builder. A Decision pipeline reads enum values and descriptions from its own entity's fields only; before, it read them from any entity with a field of the same name.
