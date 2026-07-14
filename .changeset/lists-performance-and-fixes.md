---
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-list-management": minor
"@memberjunction/lists": minor
"@memberjunction/core-actions": minor
"@memberjunction/record-set-processor-base": minor
---

Lists performance overhaul + bug fixes. Read path: the custom List form paginates its Items section (100/page) and resolves member display names in one batched `IN` query per page instead of one query per item (a 1,000-member list drops from ~1,000 requests to 3); the Lists Browse/My Lists dashboards and the Add-to-List panel compute per-list counts via batched count_only queries instead of downloading every List Detail row; single-list-detail export filters membership server-side via a vwListDetails subquery instead of a client-built giant IN clause. Write path: client-side removals batch through TransactionGroups; server-side ListOperations bulk insert/remove and the "Add Records to List" action run with bounded concurrency (10 in-flight) while preserving per-record error isolation. ListSource switches to keyset (AfterKey) pagination with legacy Offset-cursor resume support. DB migration adds a composite ListDetail (ListID, RecordID) index covering the duplicate-check predicate and drops the redundant single-column ListID index. Bug fixes: Add Records dialog spinner never cleared without a user click (missing change-detection after async loads, fixed in both the List form and single-list-detail); the List form's open-record button did nothing; silently-skipped duplicate adds now surface in a result toast (new optional `summary` on `ListManagementResult`).
