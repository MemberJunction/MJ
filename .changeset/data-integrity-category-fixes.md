---
"@memberjunction/aiengine": minor
"@memberjunction/tag-engine": minor
"@memberjunction/ai-recommendations-rex": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-simple-record-list": minor
"@memberjunction/ng-resource-permissions": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-engine": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/global": minor
"@memberjunction/queue": minor
"@memberjunction/server": minor
"@memberjunction/storage": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/esignature": minor
---

Data integrity fixes: failed reads are reported instead of read as "no rows"; transaction groups refuse missing rows, settled groups and unchecked variable writes; client saves send dirty companions and only the fields a create set; reads after a write see the write; queue tasks can be `Pending` and user settings are unique per key (migration); system-user lookups skip inactive users; list record ids use the compact key; integration sync skips missing source properties. Behaviour changes: `UserCache.GetSystemUser()` returns `undefined` for an inactive system user, `BaseEntity.LatestResult` is typed `BaseEntityResult | null`, and the shared metadata graph is frozen in development unless `MJ_FREEZE_METADATA=false`.
