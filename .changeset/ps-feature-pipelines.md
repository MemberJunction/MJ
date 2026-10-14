---
"@memberjunction/actions": minor
"@memberjunction/ai": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-anthropic": minor
"@memberjunction/ai-azure": minor
"@memberjunction/ai-bedrock": minor
"@memberjunction/ai-betty": minor
"@memberjunction/ai-betty-bot": minor
"@memberjunction/ai-cerebras": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-inception": minor
"@memberjunction/ai-lmstudio": minor
"@memberjunction/ai-ollama": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/ai-vector-sync": minor
"@memberjunction/ai-vertex": minor
"@memberjunction/aiengine": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/db-auto-doc": minor
"@memberjunction/entity-documents": minor
"@memberjunction/feature-pipelines": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-record-process-studio": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/record-set-processor": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/scheduling-base-types": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/sql-dialect": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/tag-engine": minor
"@memberjunction/templates": minor
"@memberjunction/templates-base-types": minor
"@memberjunction/testing-cli": minor
"@memberjunction/testing-engine": minor
"@memberjunction/testing-integration": minor
"@memberjunction/unit-testing": minor
---

Feature Pipelines: validated, idempotent, versioned values and honest runs; vendor parameter fidelity. Feature Values upsert on a key (record, feature, pipeline version, prompt version, primary
model, parameters, input) and record human-entered values (`Source='Human'`) that write-back never overwrites unless
asked; the Dedup Cache refreshes expired entries in place and normalises keys; prompt-template edits apply without
a restart; outputs are checked against their constraints (lookup rows, per-item) and rejects are counted; dry runs
write nothing (and report the real write's failures); the breaker counts attempted records (processed minus watermark
skips) and a Feature Pipeline run with failures ends Failed; versions are registered in `MJ: Feature Pipeline
Versions` and a gated pipeline runs only under a version whose golden-set result meets its threshold, on a golden set
whose model-made labels pass an automated label-quality check; the new "Feature Pipeline Version Steward" scheduled
job evaluates and backfills changed versions without a person; an Action scheduled job paused for a missing class
resumes by itself once the class is loaded; embedding templates render raw and existing vectors are re-vectorized;
failed prompt calls record their own error and no longer leave prompt runs Running, and parallel prompt execution
completes; Gemini, Vertex and Bedrock send temperature 0 as 0, strict calls refuse a changed parameter and a refusal
stops the prompt without failover; Bedrock accepts inference-profile model IDs; OpenAI and Azure drop parameters
reasoning models reject. Migration `V202610140050__v6.2.x__Feature_Value_Key_And_Versions.sql`.
