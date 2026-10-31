---
"@memberjunction/ai-agent-harness": patch
"@memberjunction/ai-agent-manager-actions": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/ai-form-builder": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/api-keys": patch
"@memberjunction/cli": patch
"@memberjunction/clustering-engine": patch
"@memberjunction/communication-engine": patch
"@memberjunction/component-registry-server": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/content-pipeline": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/core": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/encryption": patch
"@memberjunction/entity-documents": patch
"@memberjunction/esignature": patch
"@memberjunction/feature-pipelines": patch
"@memberjunction/feature-pipelines-engine": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/geo-core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/integration-engine": patch
"@memberjunction/materialization": patch
"@memberjunction/messaging-adapters": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-clustering": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-credentials": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-versions": patch
"@memberjunction/ng-workspace-initializer": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/predictive-studio": patch
"@memberjunction/realtime-widget": patch
"@memberjunction/record-cloning": patch
"@memberjunction/record-comparison": patch
"@memberjunction/record-set-processor": patch
"@memberjunction/record-set-processor-base": patch
"@memberjunction/rubrics": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/search-engine": patch
"@memberjunction/server": patch
"@memberjunction/tag-engine": patch
"@memberjunction/tag-engine-base": patch
"@memberjunction/task-graph": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/templates": patch
"@memberjunction/testing-cli": patch
"@memberjunction/version-history": patch
"@memberjunction/work-queue-engine": patch
---

RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

**Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

`MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.
