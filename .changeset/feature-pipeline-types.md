---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/feature-pipelines": minor
"@memberjunction/record-set-processor": minor
---

Add `MJ: Feature Pipeline Types`, the catalog of Knowledge Hub Feature Pipeline types. Each type names the driver class that turns a record's context into its output values, so a new type is a row plus a registered class. Seeds the `LLM` type, which is what every existing pipeline is.
