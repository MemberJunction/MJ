---
"@memberjunction/feature-pipelines": patch
"@memberjunction/ng-record-process-studio": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/record-set-processor": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Add pipeline type picker, capability-aware output filtering and validation, Decision-specific constraint editors, and type badges for Feature Pipelines. What each pipeline type can produce is now one rule set, shared by the server, the builder and the save check. A Decision pipeline reads enum values and descriptions from its own entity's fields only; before, it read them from any entity with a field of the same name. An enum reads field metadata only when it sets FromFieldMetadata or lists no values, and only a type that needs listed values (Decision) requires them.

A Record Process now refuses at save an Infer pipeline its type cannot run, on both tiers and every save path, through the shared MJRecordProcessEntityExtended; the Record Process form also refuses while the builder reports errors. The builder loads and edits CaptureReasoning, and keeps Watermark.
