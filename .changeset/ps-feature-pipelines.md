---
"@memberjunction/actions": minor
"@memberjunction/ai": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-anthropic": minor
"@memberjunction/ai-bedrock": minor
"@memberjunction/ai-betty": minor
"@memberjunction/ai-betty-bot": minor
"@memberjunction/ai-cerebras": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-vector-sync": minor
"@memberjunction/ai-vertex": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/feature-pipelines": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/ng-actions": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-code-editor": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-entity-action-ux": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-record-process-studio": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/record-set-processor": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/templates": minor
"@memberjunction/templates-base-types": minor
"@memberjunction/testing-engine": minor
"@memberjunction/testing-integration": minor
"@memberjunction/unit-testing": minor
---

Feature Pipelines: keyed, versioned Feature Values and honest runs (migration `V202610161457__v6.2.x__Feature_Value_Key_And_Versions.sql`).

- Feature Values upsert on a key (record, feature, pipeline version, prompt version, primary model, parameters, input); a value a person entered (`Source='Human'`) is never overwritten unless the run sets `overwriteHumanValues`. Child write-back can `reconcile` rows on a key.
- `MJ: Feature Pipeline Versions` registers each pipeline pin; a gated pipeline runs only under a version whose golden-set result meets its threshold. The new Feature Pipeline Version Steward scheduled job evaluates and backfills changed versions; golden sets carry a label-quality record, `Required` and `ExpectAbstain` cases.
- Outputs are checked against `lookup` constraints (per item with `ItemRef`); an output below its `MinConfidence` is withheld (`OnLowConfidence: 'null'`); `Context.RecordAsUserMessage` sends the record as a JSON user turn.
- Dry runs write nothing, preview only what the real write would change, cap at 25 records and report `WouldRefuse`; a Feature Pipeline run with a failed record ends `Failed` with a `FeaturePipelineRunResult` summary; the breaker counts attempted records.
- Vendor parameter fidelity: `ChatParams.strictParameters` / `ParameterFidelityError`, `DescribeSentParameters` on the drivers that change a value, Gemini `maxOutputTokens`; a strict refusal stops the prompt.
- AI prompt templates render without HTML escaping; templates reload after an edit without a restart.
- Fixes: cascade-delete deadlock (error 213); a transaction group rolls back on an item that did no work; `mj sync push` in-transaction metadata refresh; CodeGen fields of dropped columns; a failed prompt run records its own error; an Action scheduled job whose class is not loaded is paused, not failed every run; `RunAction` `ResultData` is an array of the output params; Testing Overview time ranges, suite health and suite filter; record tabs compare IDs case-insensitively; a code editor becomes editable again when `readonly` is cleared; the field-rules builder shows a saved rule's fields.
- API move: `WriteBackResult`, `TagWriteBackPreview` and `FieldRulesResultPayload` now live in `@memberjunction/record-set-processor-base` (no longer exported by `@memberjunction/record-set-processor`).
